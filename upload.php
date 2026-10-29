<?php
declare(strict_types=1);

require __DIR__ . '/includes/bootstrap.php';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    json_response(['ok' => false, 'erro' => 'Use o formulário de envio.'], 405);
}

if (!isset($_FILES['arquivo']) || !is_array($_FILES['arquivo'])) {
    json_response(['ok' => false, 'erro' => 'Nenhum arquivo foi enviado.'], 422);
}

$arquivo = $_FILES['arquivo'];
if (($arquivo['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    json_response(['ok' => false, 'erro' => 'Não foi possível receber o arquivo. Verifique o tamanho e tente de novo.'], 422);
}

$tamanho = (int) ($arquivo['size'] ?? 0);
if ($tamanho <= 0 || $tamanho > MAX_UPLOAD_BYTES) {
    json_response(['ok' => false, 'erro' => 'O arquivo precisa ter até 15 MB.'], 422);
}

$nomeOriginal = basename(str_replace('\\', '/', (string) ($arquivo['name'] ?? 'arquivo')));
$extensao = strtolower(pathinfo($nomeOriginal, PATHINFO_EXTENSION));
$extensao = preg_replace('/[^a-z0-9]/', '', $extensao) ?? '';
$mimes = [
    'jpg' => ['image/jpeg', 'image/jpg', 'image/pjpeg', 'application/octet-stream'],
    'jpeg' => ['image/jpeg', 'image/jpg', 'image/pjpeg', 'application/octet-stream'],
    'png' => ['image/png', 'application/octet-stream'],
    'pdf' => ['application/pdf'],
    'csv' => ['text/plain', 'text/csv', 'application/csv', 'text/x-csv', 'application/vnd.ms-excel', 'text/comma-separated-values', 'application/octet-stream'],
    'xlsx' => ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/zip', 'application/octet-stream'],
    'xls' => ['application/vnd.ms-excel', 'application/octet-stream'],
];

$finfo = new finfo(FILEINFO_MIME_TYPE);
$mime = (string) $finfo->file((string) $arquivo['tmp_name']);
$peloConteudo = extensao_pela_imagem((string) $arquivo['tmp_name']);
if (!isset($mimes[$extensao]) && $peloConteudo !== null) {
    $extensao = $peloConteudo;
    $nomeOriginal = 'conferencia.' . $extensao;
}
if (!isset($mimes[$extensao])) {
    json_response(['ok' => false, 'erro' => 'Formato não suportado. Envie JPG, PNG, PDF, XLSX, XLS ou CSV.'], 422);
}
if ($peloConteudo !== null && in_array($extensao, ['jpg', 'jpeg', 'png'], true)) {
    $extensao = $peloConteudo === 'png' ? 'png' : 'jpg';
}
if (in_array($extensao, ['jpg', 'jpeg', 'png'], true) && $peloConteudo === null) {
    json_response(['ok' => false, 'erro' => 'A foto não pôde ser lida. Tire outra com a câmera.'], 422);
}
if (!in_array($mime, $mimes[$extensao], true) && $peloConteudo === null) {
    json_response(['ok' => false, 'erro' => 'O conteúdo do arquivo não corresponde à extensão.'], 422);
}

$setor = trim((string) ($_POST['setor'] ?? ''));
if ($setor !== '' && !isset(setores()[$setor])) {
    json_response(['ok' => false, 'erro' => 'Setor inválido.'], 422);
}

if (!is_dir(UPLOAD_DIR) && !mkdir(UPLOAD_DIR, 0775, true) && !is_dir(UPLOAD_DIR)) {
    json_response(['ok' => false, 'erro' => 'Não foi possível preparar a pasta de upload.'], 500);
}

$nomeSalvo = bin2hex(random_bytes(16)) . '.' . $extensao;
$destino = UPLOAD_DIR . DIRECTORY_SEPARATOR . $nomeSalvo;
if (!move_uploaded_file((string) $arquivo['tmp_name'], $destino)) {
    json_response(['ok' => false, 'erro' => 'Não foi possível guardar o arquivo.'], 500);
}

try {
    $resultado = executar_ocr($destino, $setor);
} catch (Throwable $e) {
    error_log($e->getMessage());
    json_response(['ok' => false, 'erro' => $e->getMessage()], 500);
}

$resultado['arquivo'] = $nomeSalvo;
$resultado['nome_original'] = $nomeOriginal;
$resultado['preview_tipo'] = in_array($extensao, ['jpg', 'jpeg', 'png'], true) ? 'imagem' : ($extensao === 'pdf' ? 'pdf' : 'planilha');
$resultado['preview_url'] = $resultado['preview_tipo'] === 'planilha'
    ? ''
    : 'preview.php?arquivo=' . rawurlencode($nomeSalvo);

json_response($resultado, !empty($resultado['ok']) ? 200 : 422);

function executar_ocr(string $arquivo, string $setor): array
{
    if (!is_file(PYTHON_BIN)) {
        throw new RuntimeException('Python não encontrado para ler o arquivo.');
    }

    putenv('PYTHONIOENCODING=utf-8');
    putenv('PYTHONUTF8=1');

    $comando = [PYTHON_BIN, OCR_SCRIPT, '--arquivo', $arquivo];
    if ($setor !== '') {
        $comando[] = '--setor';
        $comando[] = $setor;
    }

    $processo = proc_open(
        $comando,
        [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
        $pipes,
        APP_ROOT
    );
    if (!is_resource($processo)) {
        throw new RuntimeException('Não foi possível iniciar a leitura.');
    }

    fclose($pipes[0]);
    stream_set_blocking($pipes[1], false);
    stream_set_blocking($pipes[2], false);

    $saida = '';
    $erro = '';
    $inicio = time();
    while (true) {
        $status = proc_get_status($processo);
        $saida .= (string) stream_get_contents($pipes[1]);
        $erro .= (string) stream_get_contents($pipes[2]);
        if (!$status['running']) {
            break;
        }
        if ((time() - $inicio) > 180) {
            proc_terminate($processo);
            fclose($pipes[1]);
            fclose($pipes[2]);
            proc_close($processo);
            throw new RuntimeException('A leitura excedeu o tempo limite de 3 minutos.');
        }
        usleep(100000);
    }

    $saida .= (string) stream_get_contents($pipes[1]);
    $erro .= (string) stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    proc_close($processo);

    $json = json_decode(trim($saida), true);
    if (!is_array($json)) {
        $inicioJson = strpos($saida, '{');
        $fimJson = strrpos($saida, '}');
        if ($inicioJson !== false && $fimJson !== false && $fimJson >= $inicioJson) {
            $json = json_decode(substr($saida, $inicioJson, $fimJson - $inicioJson + 1), true);
        }
    }
    if (!is_array($json)) {
        $detalhe = trim($erro) !== '' ? trim($erro) : trim($saida);
        $detalhe = function_exists('mb_substr') ? mb_substr($detalhe, 0, 500) : substr($detalhe, 0, 500);
        throw new RuntimeException($detalhe !== '' ? $detalhe : 'A leitura não retornou dados.');
    }

    return $json;
}

function extensao_pela_imagem(string $arquivo): ?string
{
    $handle = fopen($arquivo, 'rb');
    if ($handle === false) {
        return null;
    }
    $bytes = fread($handle, 12);
    fclose($handle);
    if (!is_string($bytes)) {
        return null;
    }
    if (str_starts_with($bytes, "\xFF\xD8\xFF")) {
        return 'jpg';
    }
    if (str_starts_with($bytes, "\x89PNG\r\n\x1a\n")) {
        return 'png';
    }
    return null;
}
