# Manual da conferência visual

Há dois jeitos de usar.

O link público, no mesmo modelo do TerroirMind e do treinador de maratona, abre em qualquer celular ou computador, sem instalar nada:

https://herbert-emidio.github.io/conferencia-visual/

A foto é lida no próprio aparelho e não é enviada ao GitHub. Gravar guarda a conferência naquele navegador. Outro celular começa vazio. O painel baixa um CSV se for preciso levar os números.

A instalação no Apache (`index.php`) usa o banco SQLite do servidor e o leitor Python. Serve quando várias pessoas precisam enxergar os mesmos lançamentos.

A folha de referência é `INDICADORES DE RISCO 2026 - ESPELHO.ods`. Os setores, leitos e campos usados pelo programa estão em `services/modelo.json`.

## Fluxo de quem preenche

1. A pessoa faz a conferência visual no papel e escreve os números à mão. Exemplo: 5º andar, enfermarias 501 a 511.
2. No sistema, abre **Nova leitura**.
3. Toca em **Tirar foto do papel**. No celular abre a câmera traseira do aparelho. No computador com webcam, a câmera abre na própria tela.
4. Confirma a foto. Ela sobe sozinha. PDF, planilha ou uma foto já salva continuam no quadro **Ou envie um arquivo**.
5. O sistema identifica o setor. No 5º andar, os leitos 501 a 511 levam a **5º Andar**.
6. Os números lidos entram no documento padrão. Enfermarias oficiais que a foto não captou aparecem em branco para completar.
7. Campos amarelos foram lidos com confiança abaixo de 75%. É preciso conferir e marcar a confirmação antes de gravar.
8. **Gravar documento** guarda a conferência. **Imprimir** abre a impressão do navegador, sem cara de planilha.
9. **Documento**, no menu, reabre a folha pela data e pelo setor, para corrigir o que faltou. Também dá para abrir em branco e preencher sem foto.
10. **Painel** mostra os totais do período. O Excel desse painel é exportação secundária.

## O que cada setor coleta

Todos usam o mesmo visual. O que muda é a lista de enfermarias e quais metas aparecem.

- 4º ao 8º andar: prontuários transferidos e meta de cirurgia.
- Emergência clínica, trauma e UTQ: prontuários transferidos, sem meta de cirurgia.
- Emergência pediátrica, SR, USAN 1, USAN 2, UTI pediátrica e UTI geral: checklist de transporte seguro, pacientes admitidos e meta de cirurgia.
- SR e USAN não têm leito impresso fixo. A pessoa escreve a enfermaria no documento.

Metas do papel:

- Meta 1: com pulseira, com placa, pulseira de alergia rosa.
- Meta 2: prontuários transferidos, ou checklist e admitidos, conforme o setor.
- Meta 3: MAV com identificação e total de MAV.
- Meta 4: termo cirúrgico, termo anestésico, pré-operatório mediato, pré-operatório imediato, pacientes cirurgiados.
- Meta 5: flebite e pacientes com AVP.
- Meta 6: queda (roxa, antiga laranja) e lesão (marrom, antiga azul).
- Data e assinatura valem para a folha inteira.

Um leito só é gravado se tiver algum número. A chave é setor + data + enfermaria: enviar de novo o mesmo leito na mesma data atualiza o lançamento.

Nomes que existem em mais de um setor, como VERM ou COR 1, não escolhem o setor sozinhos. O número 401 a 814 identifica o andar. Nomes únicos, como PUNÇÃO ou UND AVC, identificam a emergência.

Planilhas administrativas, carro de parada, consolidado e gráficos do espelho não entram neste fluxo de foto.

## Instalação em outro computador

Requisitos: PHP 8.2 ou superior com as extensões `gd`, `sqlite3`, `fileinfo` e `mbstring`; Composer; Python 3.11 ou superior; Apache (XAMPP serve). A extensão `gd` precisa estar ativa no `php.ini`.

Na pasta do projeto:

```bash
composer install
python -m venv .venv
```

No Windows:

```bash
.venv\Scripts\python.exe -m pip install -r requirements.txt
```

No Linux ou macOS:

```bash
.venv/bin/python -m pip install -r requirements.txt
```

Coloque a pasta sob o document root do Apache e abra `index.php`. No XAMPP deste projeto o endereço local é `http://localhost/sitema_doc_dani/`. O `config.php` procura o Python em `.venv`.

No celular, abra esse endereço pelo navegador (Chrome ou Safari), na mesma rede do servidor. O botão da câmera chama a câmera do aparelho e funciona também em HTTP. A câmera dentro da página do computador exige localhost ou HTTPS.

O banco SQLite é criado sozinho em `storage/database.sqlite` na primeira gravação. Essa pasta, as fotos enviadas e o ambiente Python não vão para o GitHub: cada instalação tem os seus dados.

Há uma planilha de exemplo em `samples/conferencia_4_andar.csv`. O leito 402 traz um `?` de propósito, para aparecer em amarelo.

## Arquivos

- `index.php` — envio, câmera e revisão.
- `upload.php` — recebe o arquivo e chama o Python.
- `services/ocr_engine.py` — lê planilha, PDF e imagem.
- `assets/js/documento.js` — monta o documento padrão.
- `process.php` — valida e grava.
- `relatorio.php` — abre, edita e imprime uma conferência já gravada.
- `dashboard.php` — totais. As razões usam placa/pulseira, MAV identificado/total e flebite/AVP.
- `export.php` — Excel secundário, uma aba por setor.
- `script.txt` — pedido inicial. O modelo vigente é o espelho de 2026 e o `modelo.json`, não as colunas antigas de leitos ativos e internados.
