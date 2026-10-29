<?php
declare(strict_types=1);

require __DIR__ . '/includes/bootstrap.php';

$autoload = APP_ROOT . '/vendor/autoload.php';
if (!is_file($autoload)) {
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Execute composer install na pasta do sistema.';
    exit;
}
require $autoload;

use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Border;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Shared\Date as ExcelDate;
use PhpOffice\PhpSpreadsheet\Worksheet\PageSetup;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

$filtros = filtros_da_requisicao();
try {
    $registros = listar_conferencias($filtros);
} catch (Throwable $e) {
    error_log($e->getMessage());
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Não foi possível ler as conferências gravadas.';
    exit;
}

$porSetor = [];
foreach (setores() as $codigo => $_nome) {
    $porSetor[$codigo] = [];
}
foreach ($registros as $registro) {
    if (isset($porSetor[$registro['setor']])) {
        $porSetor[$registro['setor']][] = $registro;
    }
}

$spreadsheet = new Spreadsheet();
$spreadsheet->getProperties()
    ->setCreator('Conferência visual')
    ->setTitle('Relatório consolidado de conferência visual');

$abas = [
    '4_ANDAR' => '0F5C6B',
    '5_ANDAR' => '1D6A7A',
    '6_ANDAR' => '2F6F4E',
    '7_ANDAR' => '8A5A12',
    '8_ANDAR' => '5C4D7A',
    'EMERG_CLINICA' => '7A3E3E',
    'EMERG_PEDIATRICA' => '3E5A7A',
];
$colunas = layout_colunas();
$primeira = true;
$indice = 0;

foreach (setores() as $codigo => $nomeSetor) {
    $sheet = $primeira ? $spreadsheet->getActiveSheet() : $spreadsheet->createSheet();
    $primeira = false;
    $sheet->setTitle($codigo);
    if (isset($abas[$codigo])) {
        $sheet->getTabColor()->setRGB($abas[$codigo]);
    }
    escrever_cabecalho($sheet, $colunas);
    $linha = 3;
    foreach ($porSetor[$codigo] as $registro) {
        foreach ($colunas as $coluna) {
            $chaveBanco = coluna_banco($coluna['chave']);
            $valor = $registro[$chaveBanco] ?? null;
            if ($valor === null || $valor === '') {
                continue;
            }
            $coordenada = Coordinate::stringFromColumnIndex($coluna['coluna']) . $linha;
            if ($coluna['tipo'] === 'numero') {
                $sheet->setCellValueExplicit($coordenada, (int) $valor, DataType::TYPE_NUMERIC);
            } elseif ($coluna['tipo'] === 'data') {
                $sheet->setCellValue($coordenada, ExcelDate::PHPToExcel(new DateTimeImmutable((string) $valor)));
                $sheet->getStyle($coordenada)->getNumberFormat()->setFormatCode('DD/MM/YYYY');
            } else {
                $sheet->setCellValueExplicit($coordenada, (string) $valor, DataType::TYPE_STRING);
            }
        }
        if ($linha % 2 === 0) {
            $faixa = 'A' . $linha . ':' . Coordinate::stringFromColumnIndex(count($colunas)) . $linha;
            $sheet->getStyle($faixa)->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setRGB('F4F8F8');
        }
        $linha++;
    }
    $sheet->freezePane('A3');
    $sheet->getPageSetup()->setOrientation(PageSetup::ORIENTATION_LANDSCAPE);
    $sheet->getPageSetup()->setPaperSize(PageSetup::PAPERSIZE_A4);
    $sheet->getPageSetup()->setFitToPage(true);
    $sheet->getPageSetup()->setFitToWidth(1);
    $sheet->getPageSetup()->setFitToHeight(0);
    $sheet->getPageSetup()->setRowsToRepeatAtTopByStartAndEnd(1, 2);
    $sheet->getHeaderFooter()->setOddFooter('&L' . $nomeSetor . '&RPágina &P de &N');
    $sheet->getPageMargins()->setTop(0.5)->setBottom(0.5)->setLeft(0.4)->setRight(0.4);
    $indice++;
}

$spreadsheet->setActiveSheetIndex(0);
$nomeArquivo = 'conferencia_visual_' . date('Ymd') . '.xlsx';
header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
header('Content-Disposition: attachment; filename="' . $nomeArquivo . '"');
header('Cache-Control: no-store');
$writer = new Xlsx($spreadsheet);
$writer->save('php://output');

function layout_colunas(): array
{
    $gruposPorCampo = [];
    foreach (grupos() as $grupo) {
        foreach ($grupo['campos'] as $chave) {
            $gruposPorCampo[$chave] = $grupo;
        }
    }

    $definicoes = [];
    foreach (campos() as $campo) {
        $definicoes[$campo['chave']] = $campo;
    }

    $colunas = [];
    $coluna = 1;
    $indice = 0;
    $lista = campos();
    while ($indice < count($lista)) {
        $chave = $lista[$indice]['chave'];
        $grupo = $gruposPorCampo[$chave] ?? null;
        if ($grupo === null) {
            $colunas[] = [
                'chave' => $chave,
                'coluna' => $coluna,
                'grupo' => null,
                'rotulo' => $lista[$indice]['rotulo'],
                'tipo' => $lista[$indice]['tipo'],
            ];
            $coluna++;
            $indice++;
            continue;
        }

        $esperados = array_column(array_slice($lista, $indice, count($grupo['campos'])), 'chave');
        if ($esperados !== $grupo['campos']) {
            throw new RuntimeException('Ordem dos campos não confere com ' . $grupo['id']);
        }
        $inicio = $coluna;
        foreach ($grupo['campos'] as $chaveGrupo) {
            $colunas[] = [
                'chave' => $chaveGrupo,
                'coluna' => $coluna,
                'grupo' => $grupo,
                'inicio_grupo' => $inicio,
                'rotulo' => $definicoes[$chaveGrupo]['rotulo'],
                'tipo' => $definicoes[$chaveGrupo]['tipo'],
            ];
            $coluna++;
        }
        $indice += count($grupo['campos']);
    }
    return $colunas;
}

function escrever_cabecalho($sheet, array $colunas): void
{
    $ultima = Coordinate::stringFromColumnIndex(count($colunas));
    foreach ($colunas as $coluna) {
        $letra = Coordinate::stringFromColumnIndex($coluna['coluna']);
        $cor = $coluna['grupo']['cor'] ?? '0E4D5C';
        if ($coluna['grupo'] === null) {
            $sheet->mergeCells($letra . '1:' . $letra . '2');
            $sheet->setCellValue($letra . '1', $coluna['rotulo']);
            pintar($sheet, $letra . '1:' . $letra . '2', $cor);
        } else {
            $sheet->setCellValue($letra . '2', $coluna['rotulo']);
            pintar($sheet, $letra . '2', $cor);
            if ($coluna['chave'] === $coluna['grupo']['campos'][0]) {
                $fim = $coluna['coluna'] + count($coluna['grupo']['campos']) - 1;
                $intervalo = $letra . '1:' . Coordinate::stringFromColumnIndex($fim) . '1';
                if ($fim > $coluna['coluna']) {
                    $sheet->mergeCells($intervalo);
                }
                $sheet->setCellValue($letra . '1', $coluna['grupo']['titulo']);
                pintar($sheet, $intervalo, $cor);
            }
        }
        $largura = match ($coluna['chave']) {
            'leito' => 24,
            'assinatura' => 26,
            'data' => 14,
            default => 16,
        };
        $sheet->getColumnDimension($letra)->setWidth($largura);
    }
    $sheet->getRowDimension(1)->setRowHeight(32);
    $sheet->getRowDimension(2)->setRowHeight(36);
    $sheet->getStyle('A1:' . $ultima . '2')->getAlignment()
        ->setHorizontal(Alignment::HORIZONTAL_CENTER)
        ->setVertical(Alignment::VERTICAL_CENTER)
        ->setWrapText(true);
    $sheet->getStyle('A1:' . $ultima . '2')->getBorders()->getAllBorders()
        ->setBorderStyle(Border::BORDER_THIN)
        ->getColor()->setRGB('E4EEF0');
}

function pintar($sheet, string $intervalo, string $cor): void
{
    $estilo = $sheet->getStyle($intervalo);
    $estilo->getFill()->setFillType(Fill::FILL_SOLID)->getStartColor()->setRGB($cor);
    $estilo->getFont()->setBold(true)->getColor()->setRGB('FFFFFF');
}
