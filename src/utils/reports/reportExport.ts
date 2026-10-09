// ============================================================================
// EXPORTAR e IMPRIMIR un reporte
// ============================================================================
// Las cuatro salidas (CSV, Excel, PDF e impresión) parten de LO MISMO que se está viendo: las
// columnas elegidas, el orden aplicado, las filas ya filtradas y sus totales. Y todas llevan el
// mismo encabezado: empresa, reporte, período, filtros usados, quién lo generó y cuándo.

import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { exportToCSV, exportToExcel } from '../exportUtils';
import { alignOf, formatCell, formatMoney, rowsForExport } from './reportFormat';
import type { ReportColumn, ReportRow } from './reportTypes';

export interface ReportOutputMeta {
  companyName: string;
  reportName: string;
  description?: string;
  /** "Del 1 al 31 de octubre de 2026" */
  periodLabel: string;
  /** Los filtros puestos, ya en texto */
  filterLines: string[];
  generatedBy: string;
  /** Fecha y hora de generación, ya en texto */
  generatedAt: string;
  notes?: string[];
  kpis?: Array<{ label: string; value: string }>;
}

/** Nombre de archivo sin acentos ni espacios. */
const fileBase = (meta: ReportOutputMeta): string =>
  `${meta.reportName}`
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();

/** La fila de totales, si hay columnas que se suman. */
export const totalsRow = (
  columns: ReportColumn[],
  totals: Record<string, number> | undefined,
): Record<string, string> | null => {
  const sumables = columns.filter(c => c.total);
  if (sumables.length === 0 || !totals) return null;
  const out: Record<string, string> = {};
  let primera = true;
  for (const col of columns) {
    if (primera) { out[col.key] = 'TOTAL'; primera = false; continue; }
    out[col.key] = col.total ? formatCell(totals[col.key] ?? 0, col.format) : '';
  }
  return out;
};

// ---------------------------------------------------------------------------
// CSV y Excel
// ---------------------------------------------------------------------------

export const exportReportCsv = (meta: ReportOutputMeta, columns: ReportColumn[], rows: ReportRow[]): void => {
  const data = rowsForExport(rows, columns);
  if (data.length === 0) throw new Error('No hay filas que exportar con los filtros puestos.');
  exportToCSV(data, fileBase(meta));
};

/**
 * Excel con DOS hojas: los datos (para seguir trabajando con ellos) y una portada con el
 * encabezado, los filtros y los totales, que es lo que hace falta para archivar el reporte.
 */
export const exportReportExcel = (
  meta: ReportOutputMeta,
  columns: ReportColumn[],
  rows: ReportRow[],
  totals?: Record<string, number>,
): void => {
  const data = rowsForExport(rows, columns);
  if (data.length === 0) throw new Error('No hay filas que exportar con los filtros puestos.');

  const wb = XLSX.utils.book_new();

  const portada: string[][] = [
    [meta.companyName],
    [meta.reportName],
    ...(meta.description ? [[meta.description]] : []),
    [],
    ...meta.filterLines.map(l => [l]),
    [`Generado por: ${meta.generatedBy}`],
    [`Generado el: ${meta.generatedAt}`],
    [`Filas: ${rows.length}`],
  ];
  if (meta.kpis?.length) {
    portada.push([], ['Resumen']);
    for (const k of meta.kpis) portada.push([k.label, k.value]);
  }
  const sumables = columns.filter(c => c.total);
  if (sumables.length && totals) {
    portada.push([], ['Totales']);
    for (const col of sumables) portada.push([col.label, formatCell(totals[col.key] ?? 0, col.format)]);
  }
  if (meta.notes?.length) {
    portada.push([], ['Notas']);
    for (const n of meta.notes) portada.push([n]);
  }

  const wsPortada = XLSX.utils.aoa_to_sheet(portada);
  wsPortada['!cols'] = [{ wch: 48 }, { wch: 28 }];
  XLSX.utils.book_append_sheet(wb, wsPortada, 'Reporte');

  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = columns.map(c => ({ wch: Math.min(40, Math.max(12, c.label.length + 6)) }));
  XLSX.utils.book_append_sheet(wb, ws, 'Datos');

  XLSX.writeFile(wb, `${fileBase(meta)}_${new Date().toISOString().split('T')[0]}.xlsx`);
};

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

export const exportReportPdf = (
  meta: ReportOutputMeta,
  columns: ReportColumn[],
  rows: ReportRow[],
  totals?: Record<string, number>,
): void => {
  const apaisado = columns.length > 6;
  const doc = new jsPDF({ orientation: apaisado ? 'landscape' : 'portrait', unit: 'pt', format: 'letter' });
  const ancho = doc.internal.pageSize.getWidth();
  let y = 44;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(meta.companyName || 'Reporte', 40, y);
  y += 20;

  doc.setFontSize(12);
  doc.text(meta.reportName, 40, y);
  y += 16;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(90);
  if (meta.description) {
    const lineas = doc.splitTextToSize(meta.description, ancho - 80);
    doc.text(lineas, 40, y);
    y += lineas.length * 11;
  }
  for (const linea of meta.filterLines) {
    doc.text(linea, 40, y);
    y += 11;
  }
  doc.text(`Generado por ${meta.generatedBy} · ${meta.generatedAt} · ${rows.length} fila(s)`, 40, y);
  y += 14;

  if (meta.kpis?.length) {
    doc.setTextColor(30);
    doc.setFont('helvetica', 'bold');
    const resumen = meta.kpis.map(k => `${k.label}: ${k.value}`).join('   |   ');
    const lineas = doc.splitTextToSize(resumen, ancho - 80);
    doc.text(lineas, 40, y);
    y += lineas.length * 12 + 4;
    doc.setFont('helvetica', 'normal');
  }

  doc.setDrawColor(210);
  doc.line(40, y, ancho - 40, y);
  y += 10;

  const head = [columns.map(c => c.label)];
  const body = rows.map(row => columns.map(col => formatCell(row[col.key], col.format)));
  const pie = totalsRow(columns, totals);
  if (pie) body.push(columns.map(col => pie[col.key] ?? ''));

  autoTable(doc, {
    head,
    body,
    startY: y,
    margin: { left: 40, right: 40 },
    styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak' },
    headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [247, 249, 252] },
    columnStyles: columns.reduce((acc, col, i) => {
      acc[i] = { halign: alignOf(col) };
      if (col.width) acc[i].cellWidth = col.width;
      return acc;
    }, {} as Record<number, { halign: 'left' | 'right' | 'center'; cellWidth?: number }>),
    didParseCell: data => {
      if (pie && data.section === 'body' && data.row.index === body.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [233, 239, 250];
      }
    },
    didDrawPage: () => {
      const pagina = doc.getNumberOfPages();
      doc.setFontSize(8);
      doc.setTextColor(130);
      doc.text(
        `${meta.companyName} · ${meta.reportName} · página ${pagina}`,
        40, doc.internal.pageSize.getHeight() - 20,
      );
    },
  });

  if (meta.notes?.length) {
    const finalY = (doc as any).lastAutoTable?.finalY || y;
    let ny = finalY + 18;
    doc.setFontSize(8);
    doc.setTextColor(90);
    for (const nota of meta.notes) {
      const lineas = doc.splitTextToSize(`· ${nota}`, ancho - 80);
      if (ny + lineas.length * 10 > doc.internal.pageSize.getHeight() - 40) {
        doc.addPage();
        ny = 50;
      }
      doc.text(lineas, 40, ny);
      ny += lineas.length * 10 + 4;
    }
  }

  doc.save(`${fileBase(meta)}_${new Date().toISOString().split('T')[0]}.pdf`);
};

// ---------------------------------------------------------------------------
// Impresión
// ---------------------------------------------------------------------------

const escape = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Abre una ventana con el reporte LIMPIO y lanza la impresión.
 *
 * No se imprime la pantalla: se arma un documento aparte con el encabezado de la empresa, el
 * período, los filtros, la tabla y los totales. Sin menú, sin botones y sin filtros de pantalla.
 */
export const printReport = (
  meta: ReportOutputMeta,
  columns: ReportColumn[],
  rows: ReportRow[],
  totals?: Record<string, number>,
): void => {
  const pie = totalsRow(columns, totals);
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${escape(meta.reportName)}</title>
<style>
  @page { size: ${columns.length > 6 ? 'letter landscape' : 'letter portrait'}; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #111827; margin: 0; }
  header { border-bottom: 2px solid #2563eb; padding-bottom: 10px; margin-bottom: 14px; }
  h1 { font-size: 17px; margin: 0 0 2px; }
  h2 { font-size: 13px; margin: 0 0 6px; font-weight: 600; color: #1f2937; }
  .desc { font-size: 10px; color: #4b5563; margin-bottom: 6px; }
  .meta { font-size: 9.5px; color: #4b5563; line-height: 1.5; }
  .kpis { display: flex; flex-wrap: wrap; gap: 10px; margin: 12px 0; }
  .kpi { border: 1px solid #e5e7eb; border-radius: 6px; padding: 6px 10px; min-width: 120px; }
  .kpi .l { font-size: 8.5px; color: #6b7280; text-transform: uppercase; letter-spacing: .03em; }
  .kpi .v { font-size: 13px; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; font-size: 9px; }
  thead th { background: #2563eb; color: #fff; text-align: left; padding: 5px 6px; font-weight: 600; }
  tbody td { padding: 4px 6px; border-bottom: 1px solid #e5e7eb; }
  tbody tr:nth-child(even) td { background: #f8fafc; }
  tfoot td { padding: 6px; font-weight: 700; background: #e9effa; border-top: 2px solid #2563eb; }
  .r { text-align: right; } .c { text-align: center; }
  .notes { margin-top: 14px; font-size: 8.5px; color: #4b5563; }
  .notes li { margin-bottom: 3px; }
  footer { margin-top: 16px; font-size: 8px; color: #9ca3af; text-align: center; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
<header>
  <h1>${escape(meta.companyName)}</h1>
  <h2>${escape(meta.reportName)}</h2>
  ${meta.description ? `<div class="desc">${escape(meta.description)}</div>` : ''}
  <div class="meta">
    ${meta.filterLines.map(l => escape(l)).join('<br>')}<br>
    Generado por ${escape(meta.generatedBy)} · ${escape(meta.generatedAt)} · ${rows.length} fila(s)
  </div>
</header>

${meta.kpis?.length ? `<div class="kpis">${meta.kpis.map(k => `
  <div class="kpi"><div class="l">${escape(k.label)}</div><div class="v">${escape(k.value)}</div></div>
`).join('')}</div>` : ''}

<table>
  <thead><tr>${columns.map(c => `<th class="${alignOf(c) === 'right' ? 'r' : alignOf(c) === 'center' ? 'c' : ''}">${escape(c.label)}</th>`).join('')}</tr></thead>
  <tbody>
    ${rows.map(row => `<tr>${columns.map(c => `<td class="${alignOf(c) === 'right' ? 'r' : alignOf(c) === 'center' ? 'c' : ''}">${escape(formatCell(row[c.key], c.format))}</td>`).join('')}</tr>`).join('')}
  </tbody>
  ${pie ? `<tfoot><tr>${columns.map(c => `<td class="${alignOf(c) === 'right' ? 'r' : ''}">${escape(pie[c.key] ?? '')}</td>`).join('')}</tr></tfoot>` : ''}
</table>

${meta.notes?.length ? `<div class="notes"><ul>${meta.notes.map(n => `<li>${escape(n)}</li>`).join('')}</ul></div>` : ''}

<footer>${escape(meta.companyName)} · ${escape(meta.reportName)} · ${escape(meta.generatedAt)}</footer>

<script>window.onload = function () { window.focus(); window.print(); };</script>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=1100,height=800');
  if (!win) {
    throw new Error('El navegador bloqueó la ventana de impresión. Permite las ventanas emergentes para este sitio.');
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
};

/** El texto de un KPI para el encabezado del PDF, el Excel y la impresión. */
export const kpiText = (label: string, value: number, format?: string): { label: string; value: string } => ({
  label,
  value: format === 'money' ? formatMoney(value)
    : format === 'percent' ? `${value}%`
      : (Number(value) || 0).toLocaleString('es-DO', { maximumFractionDigits: 2 }),
});
