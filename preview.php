<?php
declare(strict_types=1);

require __DIR__ . '/includes/bootstrap.php';

$nome = basename((string) ($_GET['arquivo'] ?? ''));
if (!preg_match('/^[a-f0-9]{32}\.(jpg|jpeg|png|pdf)$/', $nome)) {
    http_response_code(404);
    exit;
}

$pasta = realpath(UPLOAD_DIR);
$caminho = realpath(UPLOAD_DIR . DIRECTORY_SEPARATOR . $nome);
$pastaNorm = $pasta === false ? '' : strtolower($pasta);
$caminhoNorm = $caminho === false ? '' : strtolower($caminho);
$prefixo = $pastaNorm . strtolower(DIRECTORY_SEPARATOR);
if ($pastaNorm === '' || $caminhoNorm === '' || !str_starts_with($caminhoNorm, $prefixo) || !is_file($caminho)) {
    http_response_code(404);
    exit;
}

$tipos = [
    'jpg' => 'image/jpeg',
    'jpeg' => 'image/jpeg',
    'png' => 'image/png',
    'pdf' => 'application/pdf',
];
$extensao = strtolower(pathinfo($caminho, PATHINFO_EXTENSION));
header('Content-Type: ' . ($tipos[$extensao] ?? 'application/octet-stream'));
header('X-Content-Type-Options: nosniff');
header('Content-Disposition: inline; filename="' . $nome . '"');
header('Content-Length: ' . (string) filesize($caminho));
readfile($caminho);
