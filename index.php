<?php
declare(strict_types=1);

require __DIR__ . '/includes/bootstrap.php';

$pagina = 'upload';
$pageTitle = 'Nova leitura';
$scripts = [
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js',
    'assets/js/documento.js',
    'assets/js/app.js',
];
$app = [
    'setores' => setores(),
    'campos' => campos(),
    'grupos' => grupos(),
    'leitos' => leitos(),
    'modulos' => modulos(),
    'perfis' => perfis(),
    'limiar' => CONFIDENCE_THRESHOLD,
];
require __DIR__ . '/includes/header.php';
?>
<section class="page-intro">
    <h1>Nova leitura</h1>
    <p>Fotografe a folha preenchida à mão. O sistema reconhece o andar e passa os números para o documento padrão, no mesmo formato de todos os setores. O que a foto não captar fica em branco para completar. Também é possível <a href="relatorio.php">abrir o documento em branco</a> e preencher direto na tela.</p>
</section>

<form id="form-upload" class="card painel" action="upload.php" method="post" enctype="multipart/form-data">
    <div class="row g-4">
        <div class="col-lg-8">
            <button class="btn-camera" id="btn-camera" type="button">
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path fill="currentColor" d="M9 4.5 7.8 6H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-2.8L15 4.5H9Zm3 11.2a3.2 3.2 0 1 1 0-6.4 3.2 3.2 0 0 1 0 6.4Z"/>
                </svg>
                Tirar foto do papel
            </button>
            <input id="camera-nativa" class="camera-nativa" type="file" accept="image/*" capture="environment" tabindex="-1" aria-hidden="true">
            <label class="dropzone" id="dropzone">
                <input id="arquivo" name="arquivo" type="file" accept=".jpg,.jpeg,.png,.pdf,.xlsx,.xls,.csv,image/*">
                <span class="dropzone-title">Ou envie um arquivo</span>
                <span class="dropzone-hint">PDF, planilha ou uma foto já salva. JPG, PNG, PDF, XLSX e CSV, até 15 MB.</span>
                <span class="dropzone-file" id="arquivo-nome">Nenhum arquivo selecionado</span>
            </label>
        </div>
        <div class="col-lg-4">
            <label class="form-label" for="setor">Setor / andar</label>
            <select class="form-select" id="setor" name="setor">
                <option value="">Detectar automaticamente</option>
                <?php foreach (setores() as $codigo => $nome): ?>
                <option value="<?= htmlspecialchars($codigo, ENT_QUOTES, 'UTF-8') ?>"><?= htmlspecialchars($nome, ENT_QUOTES, 'UTF-8') ?></option>
                <?php endforeach; ?>
            </select>
            <p class="field-help">O número da enfermaria identifica o 4º ao 8º andar. Nomes próprios, como PUNÇÃO ou UND AVC, identificam a emergência quando não se repetem em outro setor.</p>
            <button class="btn btn-primary w-100" id="btn-ler" type="submit">Ler arquivo</button>
            <a class="exemplo" href="samples/conferencia_4_andar.csv">Baixar planilha de exemplo</a>
        </div>
    </div>
</form>

<div id="visor" class="visor" hidden>
    <video id="visor-video" playsinline autoplay muted></video>
    <p id="visor-aviso" class="visor-aviso" hidden></p>
    <div class="visor-acoes">
        <button class="btn btn-outline-light" id="visor-fechar" type="button">Cancelar</button>
        <button class="visor-disparo" id="visor-disparo" type="button" aria-label="Tirar foto"></button>
        <button class="btn btn-outline-light" id="visor-trocar" type="button">Virar</button>
    </div>
</div>

<div id="status" class="alert" hidden></div>

<section id="review" class="review" hidden>
    <div class="review-head">
        <div>
            <h2>Documento padrão</h2>
            <p id="review-meta"></p>
        </div>
        <p class="legenda"><span class="amostra"></span> Confiança abaixo de 75%</p>
    </div>
    <div class="row g-4">
        <div class="col-xl-4">
            <div class="preview-painel" id="preview-col"></div>
        </div>
        <div class="col-xl-8">
            <div class="review-tools">
                <div>
                    <label class="form-label" for="setor-revisao">Setor confirmado</label>
                    <select class="form-select" id="setor-revisao"></select>
                </div>
                <button class="btn btn-outline-secondary" id="btn-linha" type="button">Incluir enfermaria</button>
            </div>
            <div id="tabela-wrap"></div>
            <div class="confirmacao" id="confirmacao" hidden>
                <label>
                    <input id="confirmar" type="checkbox">
                    Confirmo que revisei os campos destacados em amarelo.
                </label>
            </div>
            <div class="review-actions">
                <button class="btn btn-primary" id="btn-gravar" type="button">Gravar documento</button>
                <button class="btn btn-outline-primary" id="btn-exportar" type="button">Imprimir</button>
            </div>
            <div id="resultado" hidden></div>
        </div>
    </div>
</section>

<script>
window.APP = <?= json_encode($app, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
</script>
<?php require __DIR__ . '/includes/footer.php'; ?>
