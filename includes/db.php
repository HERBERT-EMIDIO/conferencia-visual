<?php
declare(strict_types=1);

function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $pasta = dirname(DB_PATH);
    if (!is_dir($pasta) && !mkdir($pasta, 0775, true) && !is_dir($pasta)) {
        throw new RuntimeException('Não foi possível criar a pasta do banco.');
    }

    $pdo = new PDO('sqlite:' . DB_PATH);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->exec('PRAGMA foreign_keys = ON');
    $pdo->exec('PRAGMA journal_mode = WAL');
    criar_tabela($pdo);
    return $pdo;
}

function criar_tabela(PDO $pdo): void
{
    $colunas = [
        'id INTEGER PRIMARY KEY AUTOINCREMENT',
        'setor TEXT NOT NULL',
        'data_referencia TEXT NOT NULL',
        'leito TEXT NOT NULL',
    ];

    foreach (campos() as $campo) {
        if (in_array($campo['chave'], ['data', 'leito'], true)) {
            continue;
        }
        $tipo = $campo['tipo'] === 'numero' ? 'INTEGER' : 'TEXT';
        $colunas[] = coluna_banco($campo['chave']) . ' ' . $tipo;
    }

    $colunas[] = 'arquivo_origem TEXT';
    $colunas[] = 'confianca_media REAL';
    $colunas[] = 'campos_baixa_confianca TEXT';
    $colunas[] = 'created_at TEXT NOT NULL';
    $colunas[] = 'updated_at TEXT NOT NULL';

    $pdo->exec(
        'CREATE TABLE IF NOT EXISTS conferencias ('
        . implode(', ', $colunas)
        . ', UNIQUE(setor, data_referencia, leito))'
    );
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_conferencias_data ON conferencias (data_referencia)');
    $pdo->exec('CREATE INDEX IF NOT EXISTS idx_conferencias_setor ON conferencias (setor)');
    garantir_colunas($pdo);
}

function garantir_colunas(PDO $pdo): void
{
    $existentes = [];
    foreach ($pdo->query('PRAGMA table_info(conferencias)') as $coluna) {
        $existentes[$coluna['name']] = true;
    }
    foreach (campos() as $campo) {
        if (in_array($campo['chave'], ['data', 'leito'], true)) {
            continue;
        }
        $nome = coluna_banco($campo['chave']);
        if (isset($existentes[$nome])) {
            continue;
        }
        $tipo = $campo['tipo'] === 'numero' ? 'INTEGER' : 'TEXT';
        $pdo->exec('ALTER TABLE conferencias ADD COLUMN ' . $nome . ' ' . $tipo);
    }
}

function listar_conferencias(array $filtros): array
{
    $sql = 'SELECT * FROM conferencias WHERE 1 = 1';
    $params = [];

    if ($filtros['setor'] !== '') {
        $sql .= ' AND setor = :setor';
        $params['setor'] = $filtros['setor'];
    }
    if ($filtros['de'] !== '') {
        $sql .= ' AND data_referencia >= :de';
        $params['de'] = $filtros['de'];
    }
    if ($filtros['ate'] !== '') {
        $sql .= ' AND data_referencia <= :ate';
        $params['ate'] = $filtros['ate'];
    }

    $sql .= ' ORDER BY data_referencia DESC, setor ASC, leito ASC';
    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    return $stmt->fetchAll();
}
