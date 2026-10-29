<?php
declare(strict_types=1);

require __DIR__ . '/includes/bootstrap.php';

$pagina = 'relatorio';
$pageTitle = 'Documento padrão';
$scripts = [
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js',
    'assets/js/documento.js',
    'assets/js/relatorio.js',
];

$setor = (string) ($_GET['setor'] ?? '');
if (!isset(setores()[$setor])) {
    $setor = '';
}
$data = data_iso((string) ($_GET['data'] ?? ''));
if ($data === '') {
    $data = date('Y-m-d');
}

$linhas = [];
$erroBanco = '';
if ($setor !== '') {
    try {
        $linhas = listar_conferencias(['setor' => $setor, 'de' => $data, 'ate' => $data]);
    } catch (Throwable $e) {
        error_log($e->getMessage());
        $erroBanco = 'Não foi possível abrir o documento gravado.';
    }
}

$documento = [];
foreach ($linhas as $linha) {
    $baixas = json_decode((string) ($linha['campos_baixa_confianca'] ?? '[]'), true);
    $baixas = is_array($baixas) ? $baixas : [];
    $item = [];
    foreach (campos() as $campo) {
        $chave = $campo['chave'];
        if ($chave === 'data') {
            $valor = (string) $linha['data_referencia'];
        } elseif ($chave === 'leito') {
            $valor = (string) $linha['leito'];
        } else {
            $bruto = $linha[coluna_banco($chave)] ?? '';
            $valor = $bruto === null ? '' : (string) $bruto;
        }
        $item[$chave] = [
            'valor' => $valor,
            'confianca' => ($valor !== '' && in_array($chave, $baixas, true)) ? 0.4 : 1,
        ];
    }
    $documento[] = $item;
}

$app = [
    'setores' => setores(),
    'campos' => campos(),
    'grupos' => grupos(),
    'leitos' => leitos(),
    'modulos' => modulos(),
    'perfis' => perfis(),
    'limiar' => CONFIDENCE_THRESHOLD,
    'setor' => $setor,
    'data' => $data,
    'linhas' => $documento,
];

require __DIR__ . '/includes/header.php';
?>
<section class="page-intro no-print">
    <h1>Documento padrão</h1>
    <p>Mesma folha para todos os setores. As enfermarias oficiais já aparecem; complete o que a foto não leu e imprima.</p>
</section>

<?php if ($erroBanco !== ''): ?>
<div class="alert alert-danger no-print"><?= htmlspecialchars($erroBanco, ENT_QUOTES, 'UTF-8') ?></div>
<?php endif; ?>

<form class="card painel filtros no-print" method="get" action="relatorio.php">
    <div class="row g-3 align-items-end">
        <div class="col-md-6">
            <label class="form-label" for="setor">Setor</label>
            <select class="form-select" id="setor" name="setor" required>
                <option value="">Selecione</option>
                <?php foreach (setores() as $codigo => $nome): ?>
                <option value="<?= htmlspecialchars($codigo, ENT_QUOTES, 'UTF-8') ?>" <?= $setor === $codigo ? 'selected' : '' ?>><?= htmlspecialchars($nome, ENT_QUOTES, 'UTF-8') ?></option>
                <?php endforeach; ?>
            </select>
        </div>
        <div class="col-md-3">
            <label class="form-label" for="data">Data</label>
            <input class="form-control" id="data" name="data" type="date" value="<?= htmlspecialchars($data, ENT_QUOTES, 'UTF-8') ?>" required>
        </div>
        <div class="col-md-3">
            <button class="btn btn-outline-primary w-100" type="submit">Abrir</button>
        </div>
    </div>
</form>

<?php if ($setor !== ''): ?>
<div id="status" class="alert no-print" hidden></div>
<div id="tabela-wrap"></div>
<div class="confirmacao no-print" id="confirmacao" hidden>
    <label>
        <input id="confirmar" type="checkbox">
        Confirmo que revisei os campos destacados em amarelo.
    </label>
</div>
<div class="review-actions no-print">
    <button class="btn btn-outline-secondary" id="btn-linha" type="button">Incluir enfermaria</button>
    <button class="btn btn-primary" id="btn-gravar" type="button">Gravar alterações</button>
    <button class="btn btn-outline-primary" id="btn-imprimir" type="button">Imprimir</button>
</div>
<div id="resultado" class="no-print" hidden></div>
<?php endif; ?>

<script>
window.APP = <?= json_encode($app, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
</script>
<?php require __DIR__ . '/includes/footer.php'; ?>
