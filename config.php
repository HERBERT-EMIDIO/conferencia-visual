<?php
declare(strict_types=1);

const APP_ROOT = __DIR__;
const PYTHON_BIN = APP_ROOT . (DIRECTORY_SEPARATOR === '\\'
    ? '\\.venv\\Scripts\\python.exe'
    : '/.venv/bin/python');
const OCR_SCRIPT = APP_ROOT . '/services/ocr_engine.py';
const DB_PATH = APP_ROOT . '/storage/database.sqlite';
const UPLOAD_DIR = APP_ROOT . '/storage/uploads';
const EXPORT_DIR = APP_ROOT . '/storage/exports';
const MODELO_PATH = APP_ROOT . '/services/modelo.json';
const CONFIDENCE_THRESHOLD = 0.75;
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

date_default_timezone_set('America/Sao_Paulo');

function modelo(): array
{
    static $dados = null;
    if ($dados === null) {
        $json = file_get_contents(MODELO_PATH);
        if ($json === false) {
            throw new RuntimeException('Modelo de colunas não encontrado.');
        }
        $dados = json_decode($json, true, 512, JSON_THROW_ON_ERROR);
    }
    return $dados;
}

function setores(): array
{
    return modelo()['setores'];
}

function campos(): array
{
    return modelo()['campos'];
}

function grupos(): array
{
    return modelo()['grupos'];
}

function leitos(): array
{
    return modelo()['leitos'];
}

function modulos(): array
{
    return modelo()['modulos'];
}

function perfis(): array
{
    return modelo()['perfis'];
}

function coluna_banco(string $chave): string
{
    if (!preg_match('/^[a-z_]+$/', $chave)) {
        throw new RuntimeException('Campo inválido no modelo.');
    }
    return $chave === 'data' ? 'data_referencia' : $chave;
}

function json_response(array $payload, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
    exit;
}

function data_iso(string $valor): string
{
    $valor = trim($valor);
    if ($valor === '') {
        return '';
    }
    $data = DateTime::createFromFormat('!Y-m-d', $valor);
    if (!$data || $data->format('Y-m-d') !== $valor) {
        return '';
    }
    return $valor;
}

function filtros_da_requisicao(): array
{
    $setor = (string) ($_GET['setor'] ?? '');
    if (!isset(setores()[$setor])) {
        $setor = '';
    }
    return [
        'setor' => $setor,
        'de' => data_iso((string) ($_GET['de'] ?? '')),
        'ate' => data_iso((string) ($_GET['ate'] ?? '')),
    ];
}
