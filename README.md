# Conferência visual

Lê a folha de indicadores de risco preenchida à mão, reconhece o setor e monta um documento padrão, editável e imprimível, no mesmo formato para todos os setores.

O manual completo, com o fluxo e as metas de cada setor, está em [`.cursor/MANUAL.md`](.cursor/MANUAL.md).

## Uso

1. Abra **Nova leitura**.
2. Toque em **Tirar foto do papel** e fotografe a folha. No celular abre a câmera do aparelho.
3. Confira o documento. O que a foto não leu fica em branco. O amarelo pede confirmação.
4. Grave e imprima. **Documento** reabre a conferência pela data e pelo setor. **Painel** mostra os totais.

PDF, planilha e uma foto já salva entram em **Ou envie um arquivo**. A planilha de exemplo está em `samples/conferencia_4_andar.csv`.

## Instalação

É preciso PHP 8.2+ com `gd`, `sqlite3`, `fileinfo` e `mbstring`, Composer, Python 3.11+ e Apache.

```bash
composer install
python -m venv .venv
```

Windows:

```bash
.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Linux ou macOS:

```bash
.venv/bin/python -m pip install -r requirements.txt
```

Publique a pasta no Apache e abra `index.php`. No XAMPP, um exemplo de endereço é `http://localhost/sitema_doc_dani/`. O banco SQLite e as fotos ficam em `storage/` e não acompanham este repositório.
