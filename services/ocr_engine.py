#!/usr/bin/env python3
"""Lê foto, PDF ou planilha de conferência visual e devolve JSON normalizado."""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
import tempfile
import unicodedata
import warnings

os.environ.setdefault("TQDM_DISABLE", "1")
warnings.filterwarnings("ignore")
from datetime import datetime
from io import StringIO
from pathlib import Path

MODELO_PATH = Path(__file__).resolve().parent / "modelo.json"


def configurar_saida() -> None:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")


def carregar_modelo() -> dict:
    with MODELO_PATH.open(encoding="utf-8") as arquivo:
        return json.load(arquivo)


def fold(texto) -> str:
    if texto is None:
        return ""
    valor = str(texto)
    valor = unicodedata.normalize("NFKD", valor)
    valor = "".join(c for c in valor if not unicodedata.combining(c))
    valor = valor.lower()
    valor = re.sub(r"[^a-z0-9]+", " ", valor)
    return re.sub(r"\s+", " ", valor).strip()


def construir_lookup(modelo: dict) -> list[tuple[str, str]]:
    itens = []
    for campo in modelo["campos"]:
        nomes = [campo["chave"].replace("_", " "), campo["rotulo"], *campo.get("sinonimos", [])]
        for nome in nomes:
            alias = fold(nome)
            if alias:
                itens.append((alias, campo["chave"]))
    itens.sort(key=lambda item: len(item[0]), reverse=True)
    return itens


def corresponder_cabecalho(cabecalho: str, lookup: list[tuple[str, str]]) -> str | None:
    texto = fold(cabecalho)
    if not texto:
        return None

    exatos = [(alias, chave) for alias, chave in lookup if alias == texto]
    if exatos:
        melhor = max(len(alias) for alias, _ in exatos)
        chaves = {chave for alias, chave in exatos if len(alias) == melhor}
        return next(iter(chaves)) if len(chaves) == 1 else None

    contidos = []
    for alias, chave in lookup:
        if len(alias) < 4:
            continue
        if f" {alias} " in f" {texto} ":
            contidos.append((len(alias), chave))
    if not contidos:
        return None
    melhor = max(tamanho for tamanho, _ in contidos)
    chaves = {chave for tamanho, chave in contidos if tamanho == melhor}
    return next(iter(chaves)) if len(chaves) == 1 else None


def celula(valor: str, confianca: float) -> dict:
    return {"valor": valor, "confianca": round(float(confianca), 3)}


def parse_data(texto: str) -> str | None:
    bruto = texto.strip()
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}.*", bruto):
        bruto = bruto[:10]
    for formato in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%d.%m.%Y", "%d/%m/%y"):
        try:
            return datetime.strptime(bruto, formato).strftime("%Y-%m-%d")
        except ValueError:
            continue
    match = re.search(r"\b(\d{1,2})/(\d{1,2})/(\d{4})\b", texto)
    if match:
        dia, mes, ano = (int(parte) for parte in match.groups())
        try:
            return datetime(ano, mes, dia).strftime("%Y-%m-%d")
        except ValueError:
            return None
    return None


def parse_numero(texto: str) -> str | None:
    valor = texto.strip().replace(" ", "")
    if re.fullmatch(r"-?\d{1,3}(\.\d{3})+(,\d+)?", valor):
        valor = valor.replace(".", "").replace(",", ".")
    elif re.fullmatch(r"-?\d+,\d+", valor):
        valor = valor.replace(",", ".")
    if re.fullmatch(r"-?\d+", valor):
        return str(int(valor))
    if re.fullmatch(r"-?\d+\.\d+", valor):
        numero = float(valor)
        if numero.is_integer():
            return str(int(numero))
        return str(numero)
    return None


def normalizar_valor(bruto: str, tipo: str, confianca: float) -> tuple[str, float]:
    texto = re.sub(r"\s+", " ", (bruto or "").strip())
    if texto == "" or texto.lower() in {"nan", "none", "nat"}:
        return "", confianca
    if tipo == "data":
        data = parse_data(texto)
        if data:
            return data, confianca
        return texto, min(confianca, 0.4)
    if tipo == "numero":
        if texto in {"?", "-", "—", "*"}:
            return texto, min(confianca, 0.4)
        numero = parse_numero(texto)
        if numero is None:
            return texto, min(confianca, 0.4)
        return numero, confianca
    return texto, confianca


def texto_celula(valor) -> str:
    if valor is None:
        return ""
    try:
        import pandas as pd
        if pd.isna(valor):
            return ""
    except (TypeError, ImportError):
        pass
    if isinstance(valor, float) and math.isnan(valor):
        return ""
    if hasattr(valor, "strftime"):
        return valor.strftime("%d/%m/%Y")
    if isinstance(valor, float) and valor.is_integer():
        return str(int(valor))
    if isinstance(valor, int) and not isinstance(valor, bool):
        return str(valor)
    return str(valor).replace("\n", " ").strip()


def dataframe_para_matriz(df) -> list[list[str]]:
    matriz = []
    for _, linha in df.iterrows():
        matriz.append([texto_celula(valor) for valor in linha.tolist()])
    return matriz


def ler_csv_matriz(path: Path) -> list[list[str]]:
    import pandas as pd

    bruto = path.read_bytes()
    texto = None
    for encoding in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            texto = bruto.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    if texto is None:
        texto = bruto.decode("latin-1", errors="replace")
    amostra = texto[:4000]
    separador = ";" if amostra.count(";") >= amostra.count(",") else ","
    df = pd.read_csv(
        StringIO(texto),
        sep=separador,
        header=None,
        dtype=str,
        keep_default_na=False,
        engine="python",
    )
    return dataframe_para_matriz(df)


def ler_excel_matrizes(path: Path) -> list[tuple[str, list[list[str]]]]:
    import pandas as pd

    ext = path.suffix.lower()
    engine = "openpyxl" if ext == ".xlsx" else "xlrd"
    try:
        livro = pd.ExcelFile(path, engine=engine)
    except Exception as exc:
        if ext == ".xls":
            raise RuntimeError("Não foi possível ler o arquivo .xls. Salve como .xlsx ou .csv.") from exc
        raise
    folhas = []
    for nome in livro.sheet_names:
        df = pd.read_excel(livro, sheet_name=nome, header=None)
        folhas.append((str(nome), dataframe_para_matriz(df)))
    return folhas


def obter(matriz: list[list[str]], linha: int, coluna: int) -> str:
    if linha < 0 or linha >= len(matriz):
        return ""
    if coluna < 0 or coluna >= len(matriz[linha]):
        return ""
    return matriz[linha][coluna] or ""


def largura(matriz: list[list[str]]) -> int:
    return max((len(linha) for linha in matriz), default=0)


def combinar_cabecalho(matriz: list[list[str]], indice: int, lookup) -> list[str]:
    cabecalhos = []
    for coluna in range(largura(matriz)):
        atual = obter(matriz, indice, coluna)
        anterior = obter(matriz, indice - 1, coluna) if indice else ""
        if corresponder_cabecalho(atual, lookup):
            cabecalhos.append(atual)
        elif corresponder_cabecalho(anterior, lookup):
            cabecalhos.append(anterior)
        else:
            cabecalhos.append(atual or anterior)
    return cabecalhos


def mapear_colunas(cabecalhos: list[str], lookup) -> dict[int, str]:
    usados = set()
    mapa = {}
    for indice, cabecalho in enumerate(cabecalhos):
        chave = corresponder_cabecalho(cabecalho, lookup)
        if chave and chave not in usados:
            mapa[indice] = chave
            usados.add(chave)
    return mapa


def linha_vazia(modelo: dict, confianca: float) -> dict:
    return {campo["chave"]: celula("", confianca) for campo in modelo["campos"]}


def linha_util(campos_linha: dict, modelo: dict) -> bool:
    leito = campos_linha["leito"]["valor"].strip()
    if fold(leito) in {"leito", "enfermaria", "enfermarias", "enfermarias leito", "data"}:
        return False
    tem_numero = False
    for campo in modelo["campos"]:
        if campo["tipo"] == "numero" and campos_linha[campo["chave"]]["valor"] != "":
            tem_numero = True
            break
    if tem_numero:
        return True
    return leito != "" and len(leito) <= 30


def parse_matriz(matriz: list[list[str]], modelo: dict, conf_base: float) -> tuple[list[dict], list[str]]:
    if not matriz:
        return [], []

    lookup = construir_lookup(modelo)
    melhor_indice = 0
    melhor_score = -1
    melhor_mapa = {}
    limite = min(len(matriz), 15)
    for indice in range(limite):
        cabecalhos = combinar_cabecalho(matriz, indice, lookup)
        mapa = mapear_colunas(cabecalhos, lookup)
        if len(mapa) > melhor_score:
            melhor_score = len(mapa)
            melhor_indice = indice
            melhor_mapa = mapa

    avisos = []
    if melhor_score >= 3:
        mapa = melhor_mapa
        inicio = melhor_indice + 1
        conf = conf_base
        presentes = set(mapa.values())
        faltantes = [campo["chave"] for campo in modelo["campos"] if campo["chave"] not in presentes]
        if faltantes:
            avisos.append("COLUNAS:" + ",".join(faltantes))
    else:
        mapa = {indice: modelo["campos"][indice]["chave"] for indice in range(min(len(modelo["campos"]), largura(matriz)))}
        inicio = 0
        conf = 0.6
        avisos.append("Cabeçalho não reconhecido; as colunas foram lidas na ordem oficial do relatório.")

    tipos = {campo["chave"]: campo["tipo"] for campo in modelo["campos"]}
    registros = []
    for linha in matriz[inicio:]:
        if not any(celula_texto.strip() for celula_texto in linha):
            continue
        campos_linha = linha_vazia(modelo, conf if melhor_score >= 3 else 0.6)
        for indice, chave in mapa.items():
            if indice >= len(linha):
                continue
            valor, confianca = normalizar_valor(linha[indice], tipos[chave], conf)
            campos_linha[chave] = celula(valor, confianca)
        if linha_util(campos_linha, modelo):
            registros.append(campos_linha)
        if len(registros) >= 500:
            avisos.append("A leitura foi limitada às primeiras 500 linhas.")
            break
    return registros, avisos


def setor_por_leito(leito: str, modelo: dict | None = None) -> str | None:
    texto = str(leito).strip()
    match = re.search(r"\b([4-8]\d{2})\b", texto)
    if not match and re.fullmatch(r"[4-8]\d{2}", texto):
        match = re.match(r"([4-8]\d{2})", texto)
    if match:
        andar = int(match.group(1)) // 100
        if 4 <= andar <= 8:
            return f"{andar}_ANDAR"
    if not modelo:
        return None
    alvo = fold(texto)
    if not alvo:
        return None
    achados = []
    for codigo, lista in modelo.get("leitos", {}).items():
        for item in lista:
            if fold(item) == alvo:
                achados.append(codigo)
    unicos = set(achados)
    if len(unicos) == 1:
        return achados[0]
    return None


def setor_por_texto(texto: str) -> str | None:
    texto = fold(texto)
    if "trauma" in texto:
        return "EMERG_TRAUMA"
    if "utq" in texto:
        return "UTQ"
    if "usan 1" in texto or "usan1" in texto:
        return "USAN_1"
    if "usan 2" in texto or "usan2" in texto:
        return "USAN_2"
    if "uti" in texto and "ped" in texto:
        return "UTI_PED_2_ANDAR"
    if "uti" in texto and "geral" in texto:
        return "UTI_GERAL"
    if texto == "sr" or "sala de recuper" in texto:
        return "SR"
    if "pediatr" in texto or "puncao" in texto:
        return "EMERG_PEDIATRICA"
    if "emerg" in texto and "clinic" in texto:
        return "EMERG_CLINICA"
    match = re.search(r"\b([4-8])\b", texto)
    if match and "andar" in texto:
        return f"{match.group(1)}_ANDAR"
    return None


def setor_por_aba(nome: str, setores: dict) -> str | None:
    texto = fold(nome).strip("_ ")
    for codigo, rotulo in setores.items():
        variantes = {fold(codigo), fold(codigo.replace("_", " ")), fold(rotulo)}
        if texto in variantes:
            return codigo
    return setor_por_texto(nome)


def maioria_leitos(registros: list[dict], modelo: dict | None = None) -> str | None:
    votos: dict[str, int] = {}
    for registro in registros:
        setor = setor_por_leito(registro["campos"]["leito"]["valor"], modelo)
        if setor:
            votos[setor] = votos.get(setor, 0) + 1
    if not votos:
        return None
    return max(votos, key=votos.get)


def finalizar(registros: list[dict], fonte: str, setor_usuario: str, texto: str, avisos: list[str], modelo: dict) -> dict:
    validos = set(modelo["setores"])
    if setor_usuario and setor_usuario not in validos:
        return {"ok": False, "erro": "Setor selecionado não faz parte do modelo."}

    if not registros:
        return {
            "ok": False,
            "erro": "Nenhuma linha de leito foi encontrada no arquivo.",
            "avisos": avisos,
            "fonte": fonte,
        }

    enriquecidos = []
    for registro in registros:
        if setor_usuario:
            setor = setor_usuario
            origem = "usuario"
        elif registro.get("setor_aba") in validos:
            setor = registro["setor_aba"]
            origem = "aba"
        else:
            setor = setor_por_leito(registro["campos"]["leito"]["valor"], modelo)
            origem = "leito" if setor else ""
            if not setor:
                setor = setor_por_texto(texto)
                origem = "texto" if setor else ""
        enriquecidos.append({**registro, "setor": setor or "", "setor_origem": origem})

    setores_linhas = {item["setor"] for item in enriquecidos if item["setor"]}
    if setor_usuario:
        setor_detectado = setor_usuario
        origem_geral = "usuario"
        maioria = maioria_leitos(enriquecidos, modelo)
        if maioria and maioria != setor_usuario:
            avisos.append(
                f"Os leitos indicam {modelo['setores'][maioria]}, mas o envio foi marcado como {modelo['setores'][setor_usuario]}."
            )
    elif len(setores_linhas) == 1:
        setor_detectado = next(iter(setores_linhas))
        origem_geral = enriquecidos[0]["setor_origem"]
    elif not setores_linhas:
        setor_detectado = ""
        origem_geral = ""
        avisos.append("Não foi possível identificar o setor. Selecione o andar antes de gravar.")
    else:
        setor_detectado = ""
        origem_geral = "misto"
        avisos.append("O arquivo contém mais de um setor. Confira o setor de cada linha antes de gravar.")

    confiancas = []
    linhas = []
    for registro in enriquecidos:
        linha = {chave: valor for chave, valor in registro["campos"].items()}
        for campo in linha.values():
            if campo["valor"] != "":
                confiancas.append(campo["confianca"])
        linha["setor"] = celula(registro["setor"], 0.95 if registro["setor"] else 0.0)
        linhas.append(linha)

    return {
        "ok": True,
        "setor_detectado": setor_detectado,
        "setor_origem": origem_geral,
        "fonte": fonte,
        "confianca_geral": round(sum(confiancas) / len(confiancas), 3) if confiancas else 0.0,
        "avisos": avisos_do_setor(avisos, setor_detectado, modelo),
        "linhas": linhas,
    }


def avisos_do_setor(avisos: list[str], setor: str, modelo: dict) -> list[str]:
    perfil = modelo.get("perfis", {}).get(setor or "")
    modulo = set(modelo.get("modulos", {}).get(perfil, []))
    if modulo:
        modulo.update({"data", "leito", "assinatura"})
    rotulos = {campo["chave"]: campo["rotulo"] for campo in modelo["campos"]}
    saida = []
    for aviso in avisos:
        if not aviso.startswith("COLUNAS:"):
            saida.append(aviso)
            continue
        chaves = [parte for parte in aviso.split(":", 1)[1].split(",") if parte]
        if modulo:
            chaves = [chave for chave in chaves if chave in modulo]
        if chaves:
            saida.append("Colunas não mapeadas: " + ", ".join(rotulos.get(chave, chave) for chave in chaves) + ".")
    return saida


def ler_planilha(path: Path, modelo: dict, setor_usuario: str) -> dict:
    ext = path.suffix.lower()
    if ext == ".csv":
        folhas = [("CSV", ler_csv_matriz(path))]
    else:
        folhas = ler_excel_matrizes(path)

    registros = []
    avisos = []
    pedacos = []
    for nome, matriz in folhas:
        recs, avisos_folha = parse_matriz(matriz, modelo, 0.98)
        setor_aba = None if setor_usuario else setor_por_aba(nome, modelo["setores"])
        for campos_linha in recs:
            registros.append({"campos": campos_linha, "setor_aba": setor_aba})
        for aviso in avisos_folha:
            avisos.append(f"{nome}: {aviso}" if ext != ".csv" else aviso)
        pedacos.append(nome)
        for linha in matriz[:30]:
            pedacos.append(" ".join(linha))
    return finalizar(registros, "planilha", setor_usuario, " ".join(pedacos), avisos, modelo)


def campos_por_posicao(partes: list[str], modelo: dict, confianca: float) -> dict | None:
    campos = modelo["campos"]
    saida = linha_vazia(modelo, confianca)
    if len(partes) >= len(campos):
        for campo, bruto in zip(campos, partes):
            valor, conf = normalizar_valor(bruto, campo["tipo"], confianca)
            saida[campo["chave"]] = celula(valor, conf)
        return saida if linha_util(saida, modelo) else None

    indice_leito = None
    for indice, parte in enumerate(partes):
        if setor_por_leito(parte, modelo) or re.fullmatch(r"[4-8]\d{2}", parte):
            indice_leito = indice
            break
    if indice_leito is None:
        return None
    if indice_leito > 0:
        valor, conf = normalizar_valor(partes[indice_leito - 1], "data", confianca)
        saida["data"] = celula(valor, conf)
    valor, conf = normalizar_valor(partes[indice_leito], "texto", confianca)
    saida["leito"] = celula(valor, conf)
    restantes = partes[indice_leito + 1 :]
    if restantes and parse_numero(restantes[-1]) is None:
        valor, conf = normalizar_valor(restantes.pop(), "texto", confianca)
        saida["assinatura"] = celula(valor, conf)
    chaves_numero = [campo["chave"] for campo in campos if campo["tipo"] == "numero"]
    for chave, bruto in zip(chaves_numero, restantes):
        valor, conf = normalizar_valor(bruto, "numero", confianca)
        saida[chave] = celula(valor, conf)
    return saida if linha_util(saida, modelo) else None


def parse_texto_livre(texto: str, modelo: dict) -> tuple[list[dict], list[str]]:
    registros = []
    for bruta in texto.splitlines():
        partes = [parte.strip() for parte in re.split(r"\t+|\s{2,}", bruta.strip()) if parte.strip()]
        if len(partes) < 4:
            continue
        campos_linha = campos_por_posicao(partes, modelo, 0.6)
        if campos_linha:
            registros.append({"campos": campos_linha, "setor_aba": None})
    avisos = []
    if registros:
        avisos.append("A tabela do PDF foi lida pelo texto, sem grade. Confira os campos em amarelo.")
    return registros, avisos


def ler_pdf(path: Path, modelo: dict, setor_usuario: str) -> dict:
    try:
        import pdfplumber
    except ImportError as exc:
        raise RuntimeError("Leitura de PDF indisponível. Instale pdfplumber.") from exc

    textos = []
    tabelas = []
    with pdfplumber.open(path) as pdf:
        for pagina in pdf.pages:
            textos.append(pagina.extract_text() or "")
            for tabela in pagina.extract_tables() or []:
                if tabela:
                    tabelas.append(tabela)
    texto = "\n".join(textos)
    registros = []
    avisos = []
    for tabela in tabelas:
        matriz = [["" if celula_pdf is None else str(celula_pdf).replace("\n", " ").strip() for celula_pdf in linha] for linha in tabela]
        recs, avisos_tabela = parse_matriz(matriz, modelo, 0.9)
        for campos_linha in recs:
            registros.append({"campos": campos_linha, "setor_aba": None})
        avisos.extend(avisos_tabela)
    if registros:
        return finalizar(registros, "pdf", setor_usuario, texto, avisos, modelo)

    recs_texto, avisos_texto = parse_texto_livre(texto, modelo)
    if recs_texto:
        return finalizar(recs_texto, "pdf", setor_usuario, texto, avisos + avisos_texto, modelo)

    if len(fold(texto)) > 80:
        avisos.append("O PDF tem texto, mas a tabela não pôde ser separada. A leitura seguiu por OCR.")
    return ler_pdf_ocr(path, modelo, setor_usuario, avisos, texto)


def carregar_rapidocr():
    global _MOTOR_OCR
    if _MOTOR_OCR is not None:
        return _MOTOR_OCR
    try:
        from rapidocr import RapidOCR
        _MOTOR_OCR = RapidOCR()
        return _MOTOR_OCR
    except ImportError as exc:
        raise RuntimeError(
            "OCR de imagem indisponível. Instale o pacote rapidocr no ambiente .venv."
        ) from exc


_MOTOR_OCR = None


def iterar_ocr(bruto):
    if bruto is None:
        return
    if isinstance(bruto, tuple):
        bruto = bruto[0]
    if bruto is None:
        return
    if hasattr(bruto, "txts"):
        caixas = [] if bruto.boxes is None else bruto.boxes
        textos = [] if bruto.txts is None else bruto.txts
        notas = [] if bruto.scores is None else bruto.scores
        for caixa, texto, nota in zip(caixas, textos, notas):
            yield caixa, str(texto), float(nota)
        return
    for item in bruto:
        if item and len(item) >= 3:
            yield item[0], str(item[1]), float(item[2])


def itens_ocr(path: Path) -> list[dict]:
    engine = carregar_rapidocr()
    itens = []
    for caixa, texto, nota in iterar_ocr(engine(str(path))):
        pontos = list(caixa)
        xs = [float(ponto[0]) for ponto in pontos]
        ys = [float(ponto[1]) for ponto in pontos]
        itens.append({
            "text": texto.strip(),
            "score": nota,
            "x": sum(xs) / len(xs),
            "x0": min(xs),
            "x1": max(xs),
            "y": sum(ys) / len(ys),
            "h": max(ys) - min(ys),
        })
    return [item for item in itens if item["text"]]


def agrupar_linhas(itens: list[dict]) -> list[list[dict]]:
    if not itens:
        return []
    alturas = sorted(item["h"] for item in itens if item["h"] > 0)
    mediana = alturas[len(alturas) // 2] if alturas else 20
    tolerancia = max(12, mediana * 0.65)
    linhas = []
    for item in sorted(itens, key=lambda atual: atual["y"]):
        if linhas and abs(item["y"] - linhas[-1]["y"]) <= tolerancia:
            linhas[-1]["items"].append(item)
            grupo = linhas[-1]["items"]
            linhas[-1]["y"] = sum(atual["y"] for atual in grupo) / len(grupo)
        else:
            linhas.append({"y": item["y"], "items": [item]})
    for linha in linhas:
        linha["items"].sort(key=lambda atual: atual["x"])
    return [linha["items"] for linha in linhas]


def limites_ancoras(ancoras: list[dict]) -> None:
    ancoras.sort(key=lambda ancora: ancora["x"])
    for indice, ancora in enumerate(ancoras):
        esquerda = ancora["x"] - ancoras[indice - 1]["x"] if indice else 10**6
        direita = ancoras[indice + 1]["x"] - ancora["x"] if indice + 1 < len(ancoras) else 10**6
        ancora["limite"] = max(30, min(esquerda, direita) / 2)


def explodir_palavras(itens: list[dict]) -> list[dict]:
    saida = []
    for item in itens:
        palavras = [palavra for palavra in re.split(r"\s+", item["text"]) if fold(palavra)]
        if len(palavras) <= 1:
            if fold(item["text"]):
                saida.append(item)
            continue
        largura = max(item.get("x1", item["x"]) - item.get("x0", item["x"]), 1)
        passo = largura / len(palavras)
        origem = item.get("x0", item["x"])
        for indice, palavra in enumerate(palavras):
            novo = dict(item)
            novo["text"] = palavra
            novo["x0"] = origem + passo * indice
            novo["x1"] = origem + passo * (indice + 1)
            novo["x"] = (novo["x0"] + novo["x1"]) / 2
            saida.append(novo)
    return saida


def registros_da_imagem(itens: list[dict], modelo: dict) -> tuple[list[dict], list[str], str]:
    itens = explodir_palavras(itens)
    texto = " ".join(item["text"] for item in itens)
    linhas = agrupar_linhas(itens)
    lookup = construir_lookup(modelo)
    avisos = []
    indice_cabecalho = None
    ancoras = []
    for indice, linha in enumerate(linhas):
        encontradas = []
        usadas = set()
        for item in linha:
            chave = corresponder_cabecalho(item["text"], lookup)
            if chave and chave not in usadas:
                encontradas.append({"chave": chave, "x": item["x"], "score": item["score"]})
                usadas.add(chave)
        if len(encontradas) >= 3 and (indice_cabecalho is None or len(encontradas) > len(ancoras)):
            indice_cabecalho = indice
            ancoras = encontradas

    tipos = {campo["chave"]: campo["tipo"] for campo in modelo["campos"]}
    registros = []
    if ancoras and indice_cabecalho is not None:
        limites_ancoras(ancoras)
        y_cabecalho = sum(item["y"] for item in linhas[indice_cabecalho]) / len(linhas[indice_cabecalho])
        for indice, linha in enumerate(linhas):
            if indice == indice_cabecalho:
                continue
            y_linha = sum(item["y"] for item in linha) / len(linha)
            if y_linha < y_cabecalho:
                continue
            grupos = {ancora["chave"]: [] for ancora in ancoras}
            for item in linha:
                ancora = min(ancoras, key=lambda atual: abs(atual["x"] - item["x"]))
                if abs(ancora["x"] - item["x"]) <= ancora["limite"]:
                    grupos[ancora["chave"]].append(item)
            campos_linha = linha_vazia(modelo, 0.0)
            for chave, tokens in grupos.items():
                if not tokens:
                    continue
                tokens.sort(key=lambda atual: atual["x"])
                bruto = " ".join(token["text"] for token in tokens)
                nota = min(token["score"] for token in tokens)
                valor, confianca = normalizar_valor(bruto, tipos[chave], nota)
                campos_linha[chave] = celula(valor, confianca)
            if linha_util(campos_linha, modelo):
                registros.append({"campos": campos_linha, "setor_aba": None})
        def leito_confiavel(valor: str) -> bool:
            texto = valor.strip()
            if setor_por_leito(texto, modelo):
                return True
            return bool(texto) and not re.fullmatch(r"\d+", texto) and len(texto) <= 20

        if registros and any(leito_confiavel(registro["campos"]["leito"]["valor"]) for registro in registros):
            return registros, avisos, texto
        registros = []

    avisos.append("A grade da foto não foi reconhecida. Os valores foram lidos da esquerda para a direita e precisam de conferência.")
    for linha in linhas:
        if not linha:
            continue
        partes = [item["text"] for item in linha]
        nota = min(item["score"] for item in linha)
        campos_linha = campos_por_posicao(partes, modelo, min(0.6, nota))
        if campos_linha:
            registros.append({"campos": campos_linha, "setor_aba": None})
    return registros, avisos, texto


def ler_imagem(path: Path, modelo: dict, setor_usuario: str, avisos: list[str] | None = None) -> dict:
    itens = itens_ocr(path)
    if not itens:
        return {
            "ok": False,
            "erro": "Nenhum texto foi encontrado na imagem.",
            "avisos": avisos or [],
            "fonte": "imagem",
        }
    registros, avisos_ocr, texto = registros_da_imagem(itens, modelo)
    return finalizar(registros, "imagem", setor_usuario, texto, (avisos or []) + avisos_ocr, modelo)


def ler_pdf_ocr(path: Path, modelo: dict, setor_usuario: str, avisos: list[str], texto_previo: str) -> dict:
    try:
        import pymupdf
    except ImportError as exc:
        raise RuntimeError("OCR de PDF digitalizado indisponível. Instale pymupdf.") from exc

    documentos = pymupdf.open(path)
    registros = []
    avisos_ocr = list(avisos)
    textos = [texto_previo]
    temporarios = []
    try:
        for pagina in documentos:
            pixmap = pagina.get_pixmap(matrix=pymupdf.Matrix(2, 2))
            temporario = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
            temporario.close()
            temporarios.append(temporario.name)
            pixmap.save(temporario.name)
            itens = itens_ocr(Path(temporario.name))
            recs, avisos_pagina, texto = registros_da_imagem(itens, modelo)
            registros.extend(recs)
            avisos_ocr.extend(avisos_pagina)
            textos.append(texto)
    finally:
        documentos.close()
        for nome in temporarios:
            Path(nome).unlink(missing_ok=True)
    return finalizar(registros, "pdf", setor_usuario, " ".join(textos), avisos_ocr, modelo)


def processar(path: Path, setor_usuario: str) -> dict:
    if not path.is_file():
        return {"ok": False, "erro": "Arquivo não encontrado."}
    modelo = carregar_modelo()
    ext = path.suffix.lower()
    if ext in {".csv", ".xlsx", ".xls"}:
        return ler_planilha(path, modelo, setor_usuario)
    if ext == ".pdf":
        return ler_pdf(path, modelo, setor_usuario)
    if ext in {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff", ".bmp"}:
        return ler_imagem(path, modelo, setor_usuario)
    return {"ok": False, "erro": "Formato não suportado. Envie JPG, PNG, PDF, XLSX ou CSV."}


def main() -> int:
    configurar_saida()
    parser = argparse.ArgumentParser(description="Lê um relatório de conferência visual.")
    parser.add_argument("--arquivo", required=True)
    parser.add_argument("--setor", default="")
    args = parser.parse_args()
    try:
        payload = processar(Path(args.arquivo), args.setor.strip())
    except Exception as exc:
        payload = {"ok": False, "erro": str(exc)}
        print(json.dumps(payload, ensure_ascii=False))
        return 1
    print(json.dumps(payload, ensure_ascii=False))
    return 0 if payload.get("ok") else 1


if __name__ == "__main__":
    sys.exit(main())
