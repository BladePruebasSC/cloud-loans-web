// ============================================================================
// Cómo se ve cada valor
// ============================================================================
// La tabla de la pantalla, el CSV, el Excel, el PDF y la impresión formatean con ESTA función.
// Si cada uno lo hiciera a su manera, el papel no diría lo mismo que la pantalla.

import type { ColumnFormat, ReportColumn, ReportRow } from './reportTypes';

const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export const formatMoney = (value: unknown, withSymbol = true): string => {
  const n = Number(value) || 0;
  const texto = n.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return withSymbol ? `RD$${texto}` : texto;
};

export const formatNumber = (value: unknown): string =>
  (Number(value) || 0).toLocaleString('es-DO', { maximumFractionDigits: 2 });

export const formatPercent = (value: unknown): string =>
  `${(Number(value) || 0).toLocaleString('es-DO', { maximumFractionDigits: 1 })}%`;

/** "9 oct 2026" — corto y sin ambigüedad de día/mes. */
export const formatDate = (value: unknown): string => {
  const iso = String(value ?? '').split('T')[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || '—';
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MESES_CORTOS[Math.min(11, Math.max(0, m - 1))]} ${y}`;
};

/** El valor de una celda, tal como debe leerse. */
export const formatCell = (value: unknown, format: ColumnFormat = 'text'): string => {
  if (value === null || value === undefined || value === '') return format === 'money' ? formatMoney(0) : '—';
  switch (format) {
    case 'money': return formatMoney(value);
    case 'number': return formatNumber(value);
    case 'percent': return formatPercent(value);
    case 'date': return formatDate(value);
    default: return String(value);
  }
};

/** El valor para EXPORTAR: números como números (para que Excel los sume) y fechas en ISO. */
export const exportValue = (value: unknown, format: ColumnFormat = 'text'): string | number => {
  if (value === null || value === undefined || value === '') return '';
  if (format === 'money' || format === 'number' || format === 'percent') return Number(value) || 0;
  if (format === 'date') return String(value).split('T')[0];
  return String(value);
};

/** Las columnas que se están enseñando, en orden. */
export const visibleColumns = (columns: ReportColumn[], hidden: Set<string>): ReportColumn[] =>
  columns.filter(c => !hidden.has(c.key));

/** Las filas convertidas a objetos planos con los encabezados como claves (CSV/Excel). */
export const rowsForExport = (
  rows: ReportRow[],
  columns: ReportColumn[],
): Array<Record<string, string | number>> =>
  rows.map(row => {
    const out: Record<string, string | number> = {};
    for (const col of columns) out[col.label] = exportValue(row[col.key], col.format);
    return out;
  });

/** La alineación efectiva de una columna. */
export const alignOf = (column: ReportColumn): 'left' | 'right' | 'center' => {
  if (column.align) return column.align;
  return column.format === 'money' || column.format === 'number' || column.format === 'percent'
    ? 'right'
    : 'left';
};
