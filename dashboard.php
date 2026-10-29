<?php
declare(strict_types=1);

require __DIR__ . '/includes/bootstrap.php';

$pagina = 'painel';
$pageTitle = 'Painel';
$scripts = [
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js',
    'https://cdn.jsdelivr.net/npm/chart.js@4.4.6/dist/chart.umd.min.js',
];
$filtros = filtros_da_requisicao();
$erroBanco = '';
$linhas = [];
try {
    $linhas = listar_conferencias($filtros);
} catch (Throwable $e) {
    error_log($e->getMessage());
    $erroBanco = 'Não foi possível ler as conferências gravadas.';
}

$chavesSoma = [
    'com_pulseira', 'com_placa', 'pulseira_alergia_rosa', 'mav_com_identificacao', 'total_mav_observados',
    'casos_flebite', 'pacientes_com_avp', 'pulseira_risco_queda_roxa', 'pulseira_risco_lesao_marrom',
];
$totais = array_fill_keys($chavesSoma, 0);
foreach ($linhas as $linha) {
    foreach ($chavesSoma as $chave) {
        if (isset($linha[$chave]) && $linha[$chave] !== null && $linha[$chave] !== '') {
            $totais[$chave] += (int) $linha[$chave];
        }
    }
}

$indicadores = [
    ['rotulo' => 'Placa / pulseira', 'valor' => percentual($totais['com_placa'], $totais['com_pulseira'])],
    ['rotulo' => 'MAV identificado', 'valor' => percentual($totais['mav_com_identificacao'], $totais['total_mav_observados'])],
    ['rotulo' => 'Flebite sobre AVP', 'valor' => percentual($totais['casos_flebite'], $totais['pacientes_com_avp'])],
];

$porSetor = [];
foreach ($linhas as $linha) {
    $codigo = $linha['setor'];
    if (!isset($porSetor[$codigo])) {
        $porSetor[$codigo] = ['com_pulseira' => 0, 'com_placa' => 0];
    }
    $porSetor[$codigo]['com_pulseira'] += (int) ($linha['com_pulseira'] ?? 0);
    $porSetor[$codigo]['com_placa'] += (int) ($linha['com_placa'] ?? 0);
}

$graficoSetores = [];
foreach (setores() as $codigo => $nome) {
    if (!isset($porSetor[$codigo])) {
        continue;
    }
    $graficoSetores[] = [
        'rotulo' => $nome,
        'valor' => percentual($porSetor[$codigo]['com_placa'], $porSetor[$codigo]['com_pulseira']) ?? 0,
    ];
}

$exportUrl = 'export.php?' . http_build_query(array_filter($filtros));
$grafico = [
    'indicadores' => $indicadores,
    'setores' => $graficoSetores,
];

require __DIR__ . '/includes/header.php';
?>
<section class="page-intro page-intro-row">
    <div>
        <h1>Painel das metas</h1>
        <p>Consolidado das conferências já revisadas e gravadas.</p>
    </div>
    <a class="btn btn-primary" href="<?= htmlspecialchars($exportUrl, ENT_QUOTES, 'UTF-8') ?>">Exportar Excel</a>
</section>

<?php if ($erroBanco !== ''): ?>
<div class="alert alert-danger"><?= htmlspecialchars($erroBanco, ENT_QUOTES, 'UTF-8') ?></div>
<?php endif; ?>

<form class="card painel filtros" method="get" action="dashboard.php">
    <div class="row g-3 align-items-end">
        <div class="col-md-4">
            <label class="form-label" for="setor">Setor</label>
            <select class="form-select" id="setor" name="setor">
                <option value="">Todos</option>
                <?php foreach (setores() as $codigo => $nome): ?>
                <option value="<?= htmlspecialchars($codigo, ENT_QUOTES, 'UTF-8') ?>" <?= $filtros['setor'] === $codigo ? 'selected' : '' ?>><?= htmlspecialchars($nome, ENT_QUOTES, 'UTF-8') ?></option>
                <?php endforeach; ?>
            </select>
        </div>
        <div class="col-md-3">
            <label class="form-label" for="de">De</label>
            <input class="form-control" id="de" name="de" type="date" value="<?= htmlspecialchars($filtros['de'], ENT_QUOTES, 'UTF-8') ?>">
        </div>
        <div class="col-md-3">
            <label class="form-label" for="ate">Até</label>
            <input class="form-control" id="ate" name="ate" type="date" value="<?= htmlspecialchars($filtros['ate'], ENT_QUOTES, 'UTF-8') ?>">
        </div>
        <div class="col-md-2">
            <button class="btn btn-outline-primary w-100" type="submit">Filtrar</button>
        </div>
    </div>
</form>

<div class="row g-3 metricas">
    <div class="col-6 col-lg-3"><article class="metrica"><span>Registros</span><strong><?= count($linhas) ?></strong></article></div>
    <div class="col-6 col-lg-3"><article class="metrica"><span>Com pulseira</span><strong><?= (int) $totais['com_pulseira'] ?></strong></article></div>
    <div class="col-6 col-lg-3"><article class="metrica"><span>Queda / lesão</span><strong><?= (int) $totais['pulseira_risco_queda_roxa'] ?> / <?= (int) $totais['pulseira_risco_lesao_marrom'] ?></strong></article></div>
    <div class="col-6 col-lg-3"><article class="metrica"><span>Placa / pulseira</span><strong><?= texto_percentual($indicadores[0]['valor']) ?></strong></article></div>
</div>

<div class="row g-4">
    <div class="col-lg-7">
        <section class="card painel">
            <h2>Indicadores do período</h2>
            <div class="chart-box"><canvas id="grafico-metas" aria-label="Indicadores das metas"></canvas></div>
        </section>
    </div>
    <div class="col-lg-5">
        <section class="card painel">
            <h2>Placa por setor</h2>
            <?php if ($graficoSetores): ?>
            <div class="chart-box"><canvas id="grafico-setores" aria-label="Pulseira de identificação por setor"></canvas></div>
            <?php else: ?>
            <p class="vazio">Nenhuma conferência no filtro selecionado.</p>
            <?php endif; ?>
        </section>
    </div>
</div>

<section class="card painel">
    <h2>Lançamentos</h2>
    <?php if (!$linhas): ?>
    <p class="vazio">Ainda não há dados gravados para este filtro.</p>
    <?php else: ?>
    <div class="table-responsive review-scroll">
        <table class="table tabela-painel">
            <thead>
                <tr>
                    <th>Data</th>
                    <th>Setor</th>
                    <th>Enfermaria</th>
                    <th>Pulseira</th>
                    <th>Placa</th>
                    <th>Alergia</th>
                    <th>MAV</th>
                    <th>Flebite</th>
                    <th>AVP</th>
                    <th>Queda</th>
                    <th>Lesão</th>
                    <th>Documento</th>
                </tr>
            </thead>
            <tbody>
            <?php foreach ($linhas as $linha): ?>
                <tr>
                    <td><?= htmlspecialchars(formatar_data((string) $linha['data_referencia']), ENT_QUOTES, 'UTF-8') ?></td>
                    <td><?= htmlspecialchars(setores()[$linha['setor']] ?? $linha['setor'], ENT_QUOTES, 'UTF-8') ?></td>
                    <td><?= htmlspecialchars((string) $linha['leito'], ENT_QUOTES, 'UTF-8') ?></td>
                    <td><?= numero_tabela($linha['com_pulseira'] ?? null) ?></td>
                    <td><?= numero_tabela($linha['com_placa'] ?? null) ?></td>
                    <td><?= numero_tabela($linha['pulseira_alergia_rosa'] ?? null) ?></td>
                    <td><?= numero_tabela($linha['mav_com_identificacao'] ?? null) ?></td>
                    <td><?= numero_tabela($linha['casos_flebite'] ?? null) ?></td>
                    <td><?= numero_tabela($linha['pacientes_com_avp'] ?? null) ?></td>
                    <td><?= numero_tabela($linha['pulseira_risco_queda_roxa'] ?? null) ?></td>
                    <td><?= numero_tabela($linha['pulseira_risco_lesao_marrom'] ?? null) ?></td>
                    <td><a href="relatorio.php?setor=<?= rawurlencode((string) $linha['setor']) ?>&amp;data=<?= rawurlencode((string) $linha['data_referencia']) ?>">Abrir</a></td>
                </tr>
            <?php endforeach; ?>
            </tbody>
        </table>
    </div>
    <?php endif; ?>
</section>

<script>
window.GRAFICO = <?= json_encode($grafico, JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
</script>
<script>
(function () {
    if (typeof Chart === 'undefined' || !window.GRAFICO) {
        return;
    }
    const cor = '#0f5c6b';
    const indicadores = document.getElementById('grafico-metas');
    if (indicadores) {
        new Chart(indicadores, {
            type: 'bar',
            data: {
                labels: window.GRAFICO.indicadores.map(function (item) { return item.rotulo; }),
                datasets: [{
                    label: 'Percentual',
                    data: window.GRAFICO.indicadores.map(function (item) { return item.valor === null ? 0 : item.valor; }),
                    backgroundColor: '#1d7a86',
                    borderRadius: 6
                }]
            },
            options: opcoesGrafico()
        });
    }
    const setores = document.getElementById('grafico-setores');
    if (setores) {
        new Chart(setores, {
            type: 'bar',
            data: {
                labels: window.GRAFICO.setores.map(function (item) { return item.rotulo; }),
                datasets: [{
                    label: 'Placa / pulseira',
                    data: window.GRAFICO.setores.map(function (item) { return item.valor; }),
                    backgroundColor: cor,
                    borderRadius: 6
                }]
            },
            options: opcoesGrafico()
        });
    }

    function opcoesGrafico() {
        return {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, max: 100, ticks: { callback: function (valor) { return valor + '%'; } } },
                x: { ticks: { maxRotation: 40, minRotation: 0 } }
            }
        };
    }
})();
</script>
<?php
require __DIR__ . '/includes/footer.php';

function percentual(int $numerador, int $denominador): ?float
{
    if ($denominador <= 0) {
        return null;
    }
    return round($numerador * 100 / $denominador, 1);
}

function texto_percentual(?float $valor): string
{
    if ($valor === null) {
        return '—';
    }
    return number_format($valor, 1, ',', '.') . '%';
}

function formatar_data(string $iso): string
{
    $data = DateTime::createFromFormat('Y-m-d', $iso);
    return $data ? $data->format('d/m/Y') : $iso;
}

function numero_tabela($valor): string
{
    if ($valor === null || $valor === '') {
        return '—';
    }
    return htmlspecialchars((string) $valor, ENT_QUOTES, 'UTF-8');
}
