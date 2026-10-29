<?php
declare(strict_types=1);

require __DIR__ . '/includes/bootstrap.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    json_response(['ok' => false, 'erro' => 'Envio inválido.'], 405);
}

$bruto = file_get_contents('php://input');
$payload = json_decode($bruto === false ? '' : $bruto, true);
if (!is_array($payload) || !isset($payload['linhas']) || !is_array($payload['linhas'])) {
    json_response(['ok' => false, 'erro' => 'Os dados da conferência não foram recebidos.'], 422);
}

$arquivo = (string) ($payload['arquivo'] ?? '');
if (!preg_match('/^[a-f0-9]{32}\.(jpg|jpeg|png|pdf|csv|xlsx|xls)$/', $arquivo)) {
    $arquivo = '';
}
$confirmar = !empty($payload['confirmar_baixa_confianca']);

$erros = [];
$avisos = [];
$preparadas = [];
$limiar = CONFIDENCE_THRESHOLD;

foreach (array_values($payload['linhas']) as $indice => $linha) {
    if (!is_array($linha)) {
        $erros[] = 'Linha ' . ($indice + 1) . ' está inválida.';
        continue;
    }

    $rotulo = 'Linha ' . ($indice + 1);
    $setor = trim((string) ($linha['setor'] ?? ''));
    if (!isset(setores()[$setor])) {
        $erros[] = $rotulo . ': selecione o setor.';
        continue;
    }

    $data = normalizar_data((string) ($linha['data'] ?? ''));
    $leito = trim((string) ($linha['leito'] ?? ''));
    $leito = function_exists('mb_substr') ? mb_substr($leito, 0, 40) : substr($leito, 0, 40);
    if ($data === null) {
        $erros[] = $rotulo . ': informe a data no formato dd/mm/aaaa.';
    }
    if ($leito === '') {
        $erros[] = $rotulo . ': informe o leito ou a enfermaria.';
    }
    if ($data === null || $leito === '') {
        continue;
    }
    $rotulo = 'Leito ' . $leito;

    $confiancas = is_array($linha['confiancas'] ?? null) ? $linha['confiancas'] : [];
    $baixas = [];
    $soma = 0.0;
    $quantidade = 0;
    $valores = [
        'setor' => $setor,
        'data_referencia' => $data,
        'leito' => $leito,
    ];

    foreach (campos() as $campo) {
        $chave = $campo['chave'];
        $confianca = $confiancas[$chave] ?? 1;
        $confianca = is_numeric($confianca) ? (float) $confianca : 1.0;
        $soma += $confianca;
        $quantidade++;
        if ($confianca < $limiar) {
            $baixas[] = $chave;
        }
        if ($chave === 'data' || $chave === 'leito') {
            continue;
        }
        $texto = trim((string) ($linha[$chave] ?? ''));
        if ($campo['tipo'] === 'numero') {
            [$numero, $erroNumero] = inteiro_ou_nulo($texto);
            if ($erroNumero !== null) {
                $erros[] = $rotulo . ', ' . $campo['rotulo'] . ': ' . $erroNumero . '.';
            }
            $valores[coluna_banco($chave)] = $numero;
        } else {
            $valores[coluna_banco($chave)] = function_exists('mb_substr') ? mb_substr($texto, 0, 120) : substr($texto, 0, 120);
        }
    }

    if ($baixas && !$confirmar) {
        $erros[] = $rotulo . ': confirme a revisão dos campos em amarelo antes de gravar.';
    }

    foreach (regras_consistencia() as [$numerador, $denominador, $mensagem]) {
        $valorNum = $valores[coluna_banco($numerador)] ?? null;
        $valorDen = $valores[coluna_banco($denominador)] ?? null;
        if ($valorNum !== null && $valorDen !== null && $valorNum > $valorDen) {
            $avisos[] = $rotulo . ': ' . $mensagem . '.';
        }
    }

    $valores['arquivo_origem'] = $arquivo;
    $valores['confianca_media'] = $quantidade > 0 ? round($soma / $quantidade, 3) : null;
    $valores['campos_baixa_confianca'] = json_encode($baixas, JSON_UNESCAPED_UNICODE);
    $agora = date('Y-m-d H:i:s');
    $valores['created_at'] = $agora;
    $valores['updated_at'] = $agora;
    $preparadas[] = $valores;
}

if ($erros) {
    json_response(['ok' => false, 'erro' => 'Corrija os campos antes de gravar.', 'erros' => $erros, 'avisos' => $avisos], 422);
}
if (!$preparadas) {
    json_response(['ok' => false, 'erro' => 'Nenhuma linha para gravar.'], 422);
}

$colunas = array_keys($preparadas[0]);
$atualizaveis = array_values(array_filter(
    $colunas,
    static fn (string $coluna): bool => !in_array($coluna, ['setor', 'data_referencia', 'leito', 'created_at'], true)
));
$sql = 'INSERT INTO conferencias (' . implode(', ', $colunas) . ') VALUES ('
    . implode(', ', array_map(static fn (string $coluna): string => ':' . $coluna, $colunas))
    . ') ON CONFLICT(setor, data_referencia, leito) DO UPDATE SET '
    . implode(', ', array_map(static fn (string $coluna): string => $coluna . ' = excluded.' . $coluna, $atualizaveis));

try {
    $pdo = db();
    $pdo->beginTransaction();
    $stmt = $pdo->prepare($sql);
    foreach ($preparadas as $valores) {
        foreach ($valores as $coluna => $valor) {
            if ($valor === null) {
                $stmt->bindValue(':' . $coluna, null, PDO::PARAM_NULL);
            } elseif (is_int($valor)) {
                $stmt->bindValue(':' . $coluna, $valor, PDO::PARAM_INT);
            } else {
                $stmt->bindValue(':' . $coluna, (string) $valor, PDO::PARAM_STR);
            }
        }
        $stmt->execute();
    }
    $pdo->commit();
} catch (Throwable $e) {
    if (isset($pdo) && $pdo->inTransaction()) {
        $pdo->rollBack();
    }
    error_log($e->getMessage());
    json_response(['ok' => false, 'erro' => 'Não foi possível gravar a conferência.'], 500);
}

$datas = array_column($preparadas, 'data_referencia');
sort($datas);
json_response([
    'ok' => true,
    'gravados' => count($preparadas),
    'avisos' => $avisos,
    'documento_url' => 'relatorio.php?setor=' . rawurlencode($preparadas[0]['setor']) . '&data=' . rawurlencode($preparadas[0]['data_referencia']),
    'dashboard_url' => 'dashboard.php?de=' . rawurlencode($datas[0]) . '&ate=' . rawurlencode($datas[count($datas) - 1]),
    'export_url' => 'export.php?de=' . rawurlencode($datas[0]) . '&ate=' . rawurlencode($datas[count($datas) - 1]),
]);

function normalizar_data(string $valor): ?string
{
    $valor = trim($valor);
    foreach (['!Y-m-d', '!d/m/Y', '!d-m-Y'] as $formato) {
        $data = DateTime::createFromFormat($formato, $valor);
        $erros = DateTime::getLastErrors();
        $falhou = is_array($erros) && (($erros['warning_count'] ?? 0) > 0 || ($erros['error_count'] ?? 0) > 0);
        if ($data && !$falhou) {
            return $data->format('Y-m-d');
        }
    }
    return null;
}

function inteiro_ou_nulo(string $valor): array
{
    if ($valor === '') {
        return [null, null];
    }
    if (!preg_match('/^-?\d+$/', $valor)) {
        return [null, 'informe um número inteiro'];
    }
    $numero = (int) $valor;
    if ($numero < 0) {
        return [null, 'não pode ser negativo'];
    }
    return [$numero, null];
}

function regras_consistencia(): array
{
    return [
        ['mav_com_identificacao', 'total_mav_observados', 'MAV com identificação maior que o total de MAV observados'],
        ['casos_flebite', 'pacientes_com_avp', 'casos de flebite maiores que os pacientes com AVP'],
    ];
}
