(function () {
    const COLUNAS = [
        'leitos_ativos', 'internados', 'com_pulseira', 'com_placa', 'pulseira_alergia_rosa',
        'fichas_transicao_cuidados', 'prontuarios_transferidos', 'mav_com_identificacao', 'total_mav_observados',
        'termo_consentimento_cirurgico', 'termo_consentimento_anestesico', 'pre_operatorio_mediato',
        'pre_operatorio_imediato', 'pacientes_cirurgiados', 'casos_flebite', 'pacientes_com_avp',
        'pulseira_risco_queda_roxa', 'pulseira_risco_lesao_marrom'
    ];
    const ALTURA = 48;
    let sessao = null;
    let caracteres = null;

    function mediana(valores) {
        const lista = valores.slice().sort(function (a, b) { return a - b; });
        const meio = Math.floor(lista.length / 2);
        if (!lista.length) return 0;
        return lista.length % 2 ? lista[meio] : (lista[meio - 1] + lista[meio]) / 2;
    }

    function carregarImagem(arquivo) {
        return new Promise(function (resolve, reject) {
            const url = URL.createObjectURL(arquivo);
            const imagem = new Image();
            imagem.onload = function () {
                URL.revokeObjectURL(url);
                resolve(imagem);
            };
            imagem.onerror = function () {
                URL.revokeObjectURL(url);
                reject(new Error('foto'));
            };
            imagem.src = url;
        });
    }

    function prepararTela(imagem) {
        const escala = Math.min(1, 1200 / imagem.naturalWidth);
        const tela = document.createElement('canvas');
        tela.width = Math.max(1, Math.round(imagem.naturalWidth * escala));
        tela.height = Math.max(1, Math.round(imagem.naturalHeight * escala));
        tela.getContext('2d').drawImage(imagem, 0, 0, tela.width, tela.height);
        return tela;
    }

    function pixels(tela) {
        const quadro = tela.getContext('2d').getImageData(0, 0, tela.width, tela.height);
        const cor = quadro.data;
        const realce = new Uint8Array(tela.width * tela.height);
        const vermelho = new Uint8Array(tela.width * tela.height);
        for (let i = 0, p = 0; p < realce.length; i += 4, p++) {
            const r = cor[i];
            const g = cor[i + 1];
            const b = cor[i + 2];
            const tinta = Math.max(255 - Math.min(r, g, b), Math.max(0, r - Math.max(g, b)));
            realce[p] = 255 - Math.min(255, tinta);
            vermelho[p] = r > g + 18 && r > b + 18 && r > 70 ? 1 : 0;
        }
        return { realce: realce, vermelho: vermelho, width: tela.width, height: tela.height };
    }

    function telaDoRealce(mapa) {
        const tela = document.createElement('canvas');
        tela.width = mapa.width;
        tela.height = mapa.height;
        const quadro = tela.getContext('2d').createImageData(tela.width, tela.height);
        for (let i = 0, p = 0; i < mapa.realce.length; i++, p += 4) {
            quadro.data[p] = quadro.data[p + 1] = quadro.data[p + 2] = mapa.realce[i];
            quadro.data[p + 3] = 255;
        }
        tela.getContext('2d').putImageData(quadro, 0, 0);
        return tela;
    }

    function picos(forca, limite, distancia) {
        const lista = [];
        for (let i = 0; i < forca.length; i++) {
            if (forca[i] < limite) continue;
            if (!lista.length || i - lista[lista.length - 1] > distancia) lista.push(i);
            else if (forca[i] >= forca[lista[lista.length - 1]]) lista[lista.length - 1] = i;
        }
        return lista;
    }

    function bordasVerticais(mapa, y0, y1) {
        const forca = new Int32Array(mapa.width);
        for (let y = y0; y < y1; y++) {
            const linha = y * mapa.width;
            for (let x = 0; x < mapa.width; x++) {
                if (mapa.realce[linha + x] < 90) forca[x]++;
            }
        }
        return picos(forca, Math.max(8, Math.floor((y1 - y0) * 0.28)), 8);
    }

    function bordasHorizontais(mapa, x0, x1) {
        const forca = new Int32Array(mapa.height);
        const largura = Math.max(1, x1 - x0);
        for (let y = 0; y < mapa.height; y++) {
            const linha = y * mapa.width;
            let total = 0;
            for (let x = x0; x < x1; x++) {
                if (mapa.realce[linha + x] < 90) total++;
            }
            forca[y] = total;
        }
        return picos(forca, Math.max(8, Math.floor(largura * 0.22)), 6);
    }

    function faixasColunas(bordas, largura) {
        const gaps = [];
        for (let i = 1; i < bordas.length; i++) {
            const distancia = bordas[i] - bordas[i - 1];
            if (distancia >= 28 && distancia <= 70) gaps.push(distancia);
        }
        if (gaps.length < 4) return [];
        const passo = mediana(gaps);
        let melhor = [];
        let atual = [];
        function guardar() {
            if (atual.length > melhor.length) melhor = atual;
            atual = [];
        }
        for (let i = 1; i < bordas.length; i++) {
            const distancia = bordas[i] - bordas[i - 1];
            if (distancia >= passo * 0.72 && distancia <= passo * 1.55) {
                atual.push([bordas[i - 1], bordas[i]]);
            } else if (distancia >= passo * 1.7 && distancia <= passo * 2.4) {
                const meio = bordas[i - 1] + Math.floor(distancia / 2);
                atual.push([bordas[i - 1], meio], [meio, bordas[i]]);
            } else {
                guardar();
            }
        }
        guardar();
        return melhor.slice(0, COLUNAS.length);
    }

    function faixasLinhas(bordas) {
        const gaps = [];
        for (let i = 1; i < bordas.length; i++) {
            const distancia = bordas[i] - bordas[i - 1];
            if (distancia >= 18 && distancia <= 55) gaps.push(distancia);
        }
        if (gaps.length < 4) return [];
        const passo = mediana(gaps);
        const pares = [];
        for (let i = 1; i < bordas.length; i++) {
            const distancia = bordas[i] - bordas[i - 1];
            if (distancia >= passo * 0.72 && distancia <= passo * 1.55) {
                pares.push([bordas[i - 1], bordas[i]]);
            } else if (distancia >= passo * 1.7 && distancia <= passo * 2.4) {
                const meio = bordas[i - 1] + Math.floor(distancia / 2);
                pares.push([bordas[i - 1], meio], [meio, bordas[i]]);
            }
        }
        return pares;
    }

    function copiar(origem, w, x0, y0, x1, y1) {
        const largura = Math.max(0, x1 - x0);
        const altura = Math.max(0, y1 - y0);
        const dados = new Uint8Array(largura * altura);
        for (let y = 0; y < altura; y++) {
            const linha = (y0 + y) * w + x0;
            dados.set(origem.subarray(linha, linha + largura), y * largura);
        }
        return { data: dados, width: largura, height: altura };
    }

    function temEscrita(recorte, vermelho) {
        if (vermelho) {
            let tintaVermelha = 0;
            for (let i = 0; i < vermelho.data.length; i++) tintaVermelha += vermelho.data[i];
            if (tintaVermelha >= 18) return true;
        }
        if (!recorte.width || !recorte.height) return false;
        const tinta = [];
        let total = 0;
        for (let i = 0; i < recorte.data.length; i++) {
            const marcado = recorte.data[i] < 115 ? 1 : 0;
            tinta.push(marcado);
            total += marcado;
        }
        let maiorLinha = 0;
        let linhasFortes = 0;
        for (let y = 0; y < recorte.height; y++) {
            let soma = 0;
            for (let x = 0; x < recorte.width; x++) soma += tinta[y * recorte.width + x];
            if (soma > maiorLinha) maiorLinha = soma;
            if (soma > 2) linhasFortes++;
        }
        if (maiorLinha > recorte.width * 0.7 && linhasFortes <= 2) return false;
        let maiorColuna = 0;
        let colunasFortes = 0;
        for (let x = 0; x < recorte.width; x++) {
            let soma = 0;
            for (let y = 0; y < recorte.height; y++) soma += tinta[y * recorte.width + x];
            if (soma > maiorColuna) maiorColuna = soma;
            if (soma > 2) colunasFortes++;
        }
        if (maiorColuna > recorte.height * 0.7 && colunasFortes <= 2) return false;
        return total >= 40;
    }

    function pareceCirculo(recorte) {
        const altura = recorte.height;
        const largura = recorte.width;
        if (altura < 10 || largura < 10) return false;
        const tinta = [];
        let total = 0;
        for (let i = 0; i < recorte.data.length; i++) {
            const marcado = recorte.data[i] < 140 ? 1 : 0;
            tinta.push(marcado);
            total += marcado;
        }
        if (total < 35) return false;
        let maiorLinha = 0;
        let linhasFortes = 0;
        for (let y = 0; y < altura; y++) {
            let soma = 0;
            for (let x = 0; x < largura; x++) soma += tinta[y * largura + x];
            if (soma > maiorLinha) maiorLinha = soma;
            if (soma > 2) linhasFortes++;
        }
        if (maiorLinha > largura * 0.75 && linhasFortes < 4) return false;
        const y0 = Math.floor(altura / 4);
        const y1 = Math.floor(altura * 3 / 4);
        const x0 = Math.floor(largura / 4);
        const x1 = Math.floor(largura * 3 / 4);
        let claros = 0;
        let area = 0;
        let anel = 0;
        for (let y = 0; y < altura; y++) {
            for (let x = 0; x < largura; x++) {
                const miolo = y >= y0 && y < y1 && x >= x0 && x < x1;
                if (miolo) {
                    area++;
                    if (recorte.data[y * largura + x] > 160) claros++;
                } else if (tinta[y * largura + x]) {
                    anel++;
                }
            }
        }
        return area > 0 && claros / area > 0.62 && anel > 20;
    }

    function recortar(tela, x0, y0, x1, y1) {
        const largura = Math.max(1, x1 - x0);
        const altura = Math.max(1, y1 - y0);
        const destino = document.createElement('canvas');
        destino.width = largura * 3 + 16;
        destino.height = altura * 3 + 16;
        const contexto = destino.getContext('2d');
        contexto.fillStyle = '#fff';
        contexto.fillRect(0, 0, destino.width, destino.height);
        contexto.drawImage(tela, x0, y0, largura, altura, 8, 8, largura * 3, altura * 3);
        return destino;
    }

    function girar(tela) {
        const destino = document.createElement('canvas');
        destino.width = tela.height;
        destino.height = tela.width;
        const contexto = destino.getContext('2d');
        contexto.translate(destino.width, 0);
        contexto.rotate(Math.PI / 2);
        contexto.drawImage(tela, 0, 0);
        return destino;
    }

    function normalizar(tela) {
        const proporcao = tela.width / tela.height;
        const largura = Math.max(Math.floor(ALTURA * (320 / ALTURA)), Math.floor(ALTURA * proporcao));
        let destinoLargura = Math.ceil(ALTURA * proporcao);
        if (destinoLargura > largura) destinoLargura = largura;
        const tmp = document.createElement('canvas');
        tmp.width = destinoLargura;
        tmp.height = ALTURA;
        tmp.getContext('2d').drawImage(tela, 0, 0, destinoLargura, ALTURA);
        const px = tmp.getContext('2d').getImageData(0, 0, destinoLargura, ALTURA).data;
        const dados = new Float32Array(3 * ALTURA * largura);
        for (let y = 0; y < ALTURA; y++) {
            for (let x = 0; x < destinoLargura; x++) {
                const i = (y * destinoLargura + x) * 4;
                const base = y * largura + x;
                dados[base] = (px[i + 2] / 255 - 0.5) / 0.5;
                dados[ALTURA * largura + base] = (px[i + 1] / 255 - 0.5) / 0.5;
                dados[2 * ALTURA * largura + base] = (px[i] / 255 - 0.5) / 0.5;
            }
        }
        return { data: dados, width: largura };
    }

    function motor(aoProgresso) {
        if (sessao) return Promise.resolve(sessao);
        if (!window.ort) return Promise.reject(new Error('leitor'));
        ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/';
        ort.env.wasm.numThreads = 1;
        aoProgresso('Baixando o leitor da escrita manual. A primeira vez pode demorar.');
        return Promise.all([
            fetch('assets/model/rec.onnx').then(function (resposta) {
                if (!resposta.ok) throw new Error('modelo');
                return resposta.arrayBuffer();
            }),
            fetch('assets/model/caracteres.json').then(function (resposta) {
                if (!resposta.ok) throw new Error('modelo');
                return resposta.json();
            })
        ]).then(function (partes) {
            caracteres = ['blank'].concat(partes[1], [' ']);
            return ort.InferenceSession.create(partes[0], { executionProviders: ['wasm'] });
        }).then(function (criada) {
            sessao = criada;
            return sessao;
        });
    }

    function decodificar(valores, tempos, classes) {
        let texto = '';
        let soma = 0;
        let quantidade = 0;
        let anterior = -1;
        for (let t = 0; t < tempos; t++) {
            let melhor = 0;
            let nota = valores[t * classes];
            for (let c = 1; c < classes; c++) {
                const valor = valores[t * classes + c];
                if (valor > nota) {
                    nota = valor;
                    melhor = c;
                }
            }
            if (melhor !== 0 && melhor !== anterior) {
                texto += caracteres[melhor] === 'blank' ? '' : caracteres[melhor];
                soma += nota;
                quantidade++;
            }
            anterior = melhor;
        }
        return { texto: texto.trim(), nota: quantidade ? soma / quantidade : 0 };
    }

    function reconhecer(telas, avisar) {
        return motor(avisar).then(function (modelo) {
            const grupos = new Map();
            telas.forEach(function (tela, indice) {
                const pronto = normalizar(tela);
                const chave = String(pronto.width);
                if (!grupos.has(chave)) grupos.set(chave, []);
                grupos.get(chave).push({ indice: indice, data: pronto.data, width: pronto.width });
            });
            const saidas = new Array(telas.length);
            const tarefas = [];
            grupos.forEach(function (itens) {
                tarefas.push(itens);
            });
            let cadeia = Promise.resolve();
            tarefas.forEach(function (itens) {
                cadeia = cadeia.then(function () {
                    const largura = itens[0].width;
                    const bloco = 4;
                    let fila = Promise.resolve();
                    for (let inicio = 0; inicio < itens.length; inicio += bloco) {
                        const pedaco = itens.slice(inicio, inicio + bloco);
                        fila = fila.then(function () {
                            const dados = new Float32Array(pedaco.length * 3 * ALTURA * largura);
                            pedaco.forEach(function (item, posicao) {
                                dados.set(item.data, posicao * 3 * ALTURA * largura);
                            });
                            const tensor = new ort.Tensor('float32', dados, [pedaco.length, 3, ALTURA, largura]);
                            return modelo.run({ x: tensor }).then(function (saida) {
                                const dims = saida.fetch_name_0.dims;
                                const bruto = saida.fetch_name_0.data;
                                const tempos = dims[1];
                                const classes = dims[2];
                                pedaco.forEach(function (item, posicao) {
                                    const comeco = posicao * tempos * classes;
                                    saidas[item.indice] = decodificar(bruto.subarray(comeco, comeco + tempos * classes), tempos, classes);
                                });
                            });
                        });
                    }
                    return fila;
                });
            });
            return cadeia.then(function () { return saidas; });
        });
    }

    function glifo(leitura, recorte) {
        const troca = { O: '0', o: '0', Q: '0', D: '0', C: '0', c: '0', '〇': '0', '○': '0' };
        const limpo = leitura.texto || '';
        if (troca[limpo]) return [troca[limpo], Math.min(leitura.nota, 0.7)];
        if (/^\d+$/.test(limpo) && leitura.nota >= 0.32 && Number(limpo) <= 99) {
            return [String(Number(limpo)), Math.min(leitura.nota, 0.7)];
        }
        if (limpo.length === 1 && /[A-Za-z]/.test(limpo) && pareceCirculo(recorte)) return ['0', 0.45];
        if (!limpo && pareceCirculo(recorte)) return ['0', 0.45];
        return ['', 1];
    }

    function parseData(texto) {
        const bruto = String(texto || '');
        const match = bruto.match(/(\d{1,2})\s*[\/\-.]\s*(\d{1,2})\s*[\/\-.]\s*(\d{2,4})/);
        if (!match) return '';
        let ano = Number(match[3]);
        if (ano < 100) ano += 2000;
        const mes = Number(match[2]);
        const dia = Number(match[1]);
        if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return '';
        return ano + '-' + String(mes).padStart(2, '0') + '-' + String(dia).padStart(2, '0');
    }

    function setorDoLeito(leito) {
        const match = String(leito || '').match(/^[4-8]\d{2}$/);
        return match ? match[0].charAt(0) + '_ANDAR' : '';
    }

    function ler(arquivo, aoProgresso) {
        const avisar = aoProgresso || function () {};
        avisar('Preparando a foto.');
        return carregarImagem(arquivo).then(function (imagem) {
            const tela = prepararTela(imagem);
            const mapa = pixels(tela);
            const verticais = bordasVerticais(mapa, Math.floor(mapa.height * 0.12), Math.floor(mapa.height * 0.92));
            const colunas = faixasColunas(verticais, mapa.width);
            if (colunas.length < 8) return { linhas: [], setor: '' };
            const horizontais = bordasHorizontais(mapa, colunas[0][0], colunas[colunas.length - 1][1]);
            const linhasGrade = faixasLinhas(horizontais);
            if (linhasGrade.length < 4) return { linhas: [], setor: '' };
            const passo = colunas[0][1] - colunas[0][0];
            const leitoDireita = colunas[0][0];
            const leitoEsquerda = Math.max(0, leitoDireita - Math.round(passo * 2.6));
            const cinza = telaDoRealce(mapa);
            const trabalhos = [];
            const pedidos = [];
            linhasGrade.forEach(function (faixa, indiceLinha) {
                const y0 = faixa[0] + 2;
                const y1 = faixa[1] - 1;
                if (y1 - y0 < 8) return;
                const miolo = copiar(mapa.vermelho, mapa.width, colunas[0][0], y0, colunas[colunas.length - 1][1], y1);
                let tintaVermelha = 0;
                for (let i = 0; i < miolo.data.length; i++) tintaVermelha += miolo.data[i];
                if (tintaVermelha < 40) return;
                pedidos.push({ tipo: 'leito', linha: indiceLinha });
                trabalhos.push(recortar(cinza, leitoEsquerda, y0, leitoDireita, y1));
                colunas.forEach(function (coluna, indiceColuna) {
                    if (indiceColuna >= COLUNAS.length) return;
                    const x0 = coluna[0] + 3;
                    const x1 = coluna[1] - 3;
                    const recorteRealce = copiar(mapa.realce, mapa.width, x0, y0, x1, y1);
                    const recorteVermelho = copiar(mapa.vermelho, mapa.width, x0, y0, x1, y1);
                    if (!temEscrita(recorteRealce, recorteVermelho)) return;
                    pedidos.push({ tipo: 'numero', linha: indiceLinha, coluna: indiceColuna, recorte: recorteRealce });
                    trabalhos.push(recortar(cinza, x0, y0, x1, y1));
                });
            });
            const limitesData = verticais.filter(function (x) { return x < leitoEsquerda - 8; });
            let dataX0 = 4;
            let dataX1 = Math.max(30, Math.min(leitoEsquerda - 4, Math.round(passo * 2)));
            if (limitesData.length >= 2) {
                dataX0 = limitesData[0] + 2;
                dataX1 = limitesData[1] - 2;
            }
            const dataTela = girar(recortar(cinza, dataX0, linhasGrade[0][0], dataX1, linhasGrade[linhasGrade.length - 1][1]));
            avisar('Lendo os números manuscritos.');
            return reconhecer(trabalhos.concat([dataTela]), avisar).then(function (leituras) {
                const porLinha = {};
                leituras.slice(0, trabalhos.length).forEach(function (leitura, indice) {
                    const pedido = pedidos[indice];
                    if (!porLinha[pedido.linha]) porLinha[pedido.linha] = { leito: '', campos: {} };
                    if (pedido.tipo === 'leito') {
                        const digitos = String(leitura.texto || '').replace(/\D/g, '');
                        if (/^[4-8]\d{2}$/.test(digitos)) porLinha[pedido.linha].leito = digitos;
                        return;
                    }
                    const valor = glifo(leitura, pedido.recorte);
                    if (valor[0] !== '') porLinha[pedido.linha].campos[COLUNAS[pedido.coluna]] = valor;
                });
                const data = parseData(leituras[leituras.length - 1] ? leituras[leituras.length - 1].texto : '');
                const votos = {};
                const linhas = [];
                Object.keys(porLinha).forEach(function (chave) {
                    const item = porLinha[chave];
                    if (!item.leito) return;
                    const setor = setorDoLeito(item.leito);
                    if (setor) votos[setor] = (votos[setor] || 0) + 1;
                    const linha = {
                        leito: { valor: item.leito, confianca: 0.98 },
                        data: { valor: data, confianca: data ? 0.7 : 1 }
                    };
                    COLUNAS.forEach(function (coluna) {
                        const lido = item.campos[coluna];
                        linha[coluna] = lido ? { valor: lido[0], confianca: lido[1] } : { valor: '', confianca: 1 };
                    });
                    if (Object.keys(item.campos).length) linhas.push(linha);
                });
                const setores = Object.keys(votos).sort(function (a, b) { return votos[b] - votos[a]; });
                return { linhas: linhas, setor: setores[0] || '' };
            });
        });
    }

    window.Grade = { ler: ler };
})();
