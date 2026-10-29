# Conferência visual

O sistema abre no navegador, no celular ou no computador, sem instalar nada:

**https://herbert-emidio.github.io/conferencia-visual/**

A foto da folha é lida no próprio aparelho e não vai para o GitHub. O que for gravado fica naquele navegador. O CSV do painel serve para levar os números a outro lugar.

O manual completo está em [`.cursor/MANUAL.md`](.cursor/MANUAL.md).

## Uso

1. Abra o link e toque em **Tirar foto do papel**.
2. Confira o documento padrão. O que a foto não leu fica em branco. O amarelo pede confirmação.
3. Grave neste aparelho e imprima.
4. **Documento** reabre a conferência. **Painel** mostra os totais e baixa o CSV.

## Instalação no servidor do hospital

A pasta também roda no Apache com PHP e Python, gravando num banco SQLite compartilhado. É preciso PHP 8.2+ com `gd`, `sqlite3`, `fileinfo` e `mbstring`, Composer e Python 3.11+.

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

No XAMPP, abra `http://localhost/sitema_doc_dani/` (o `index.php`). O banco e as fotos ficam em `storage/` e não entram neste repositório.

