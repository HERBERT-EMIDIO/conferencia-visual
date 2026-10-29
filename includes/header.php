<?php
declare(strict_types=1);
$pageTitle = $pageTitle ?? 'Conferência visual';
$pagina = $pagina ?? '';
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
    <title><?= htmlspecialchars($pageTitle, ENT_QUOTES, 'UTF-8') ?> · Conferência visual</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="assets/css/style.css" rel="stylesheet">
</head>
<body>
<header class="app-header">
    <div class="container header-inner">
        <a class="brand" href="index.php">
            <span class="brand-mark" aria-hidden="true"></span>
            <span>
                <strong>Conferência visual</strong>
                <small>Metas de segurança do paciente</small>
            </span>
        </a>
        <nav class="header-nav" aria-label="Principal">
            <a href="index.php" class="<?= $pagina === 'upload' ? 'is-active' : '' ?>">Nova leitura</a>
            <a href="relatorio.php" class="<?= $pagina === 'relatorio' ? 'is-active' : '' ?>">Documento</a>
            <a href="dashboard.php" class="<?= $pagina === 'painel' ? 'is-active' : '' ?>">Painel</a>
        </nav>
    </div>
</header>
<main class="container py-4">
