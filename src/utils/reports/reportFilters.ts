// ============================================================================
// FILTROS de los reportes
// ============================================================================
// Los filtros se aplican SIEMPRE con las mismas reglas, sea cual sea el reporte: así una fila no
// puede colarse en un reporte y quedarse fuera de otro con los mismos criterios. Y la pantalla
// puede decir en texto qué filtros están puestos —en la cabecera, en el estado vacío y en el PDF.

import type { ReportFilters, ReportRow } from './reportTypes';
import { describePeriod, type Period } from './reportPeriods';

/** Filtros recién abiertos: el mes en curso, sin nada más puesto. */
export const emptyFilters = (period: Period, preset = 'month'): ReportFilters => ({
  startDate: period.startDate,
  endDate: period.endDate,
  preset,
  compare: false,
});

/** Los filtros que el usuario puso además del período. */
export const activeFilterKeys = (filters: ReportFilters): string[] => {
  const keys: string[] = [];
  const add = (k: string, v: unknown) => {
    if (v === undefined || v === null || v === '' || v === 'all') return;
    keys.push(k);
  };
  add('search', filters.search);
  add('status', filters.status);
  add('clientId', filters.clientId);
  add('userId', filters.userId);
  add('city', filters.city);
  add('neighborhood', filters.neighborhood);
  add('paymentMethod', filters.paymentMethod);
  add('loanType', filters.loanType);
  add('frequency', filters.frequency);
  add('category', filters.category);
  if (typeof filters.minAmount === 'number') keys.push('minAmount');
  if (typeof filters.maxAmount === 'number') keys.push('maxAmount');
  return keys;
};

export const hasActiveFilters = (filters: ReportFilters): boolean => activeFilterKeys(filters).length > 0;

const LABELS: Record<string, string> = {
  search: 'Búsqueda', status: 'Estado', clientId: 'Cliente', userId: 'Usuario', city: 'Ciudad',
  neighborhood: 'Sector', paymentMethod: 'Método de pago', loanType: 'Tipo de préstamo',
  frequency: 'Frecuencia', category: 'Categoría', minAmount: 'Monto desde', maxAmount: 'Monto hasta',
};

/**
 * Los filtros en texto, para el encabezado del PDF y la impresión.
 * `names` traduce ids a nombres (cliente, usuario) para que no salga un UUID.
 */
export const describeFilters = (
  filters: ReportFilters,
  names: Record<string, string> = {},
): string[] => {
  const out = [`Período: ${describePeriod({ startDate: filters.startDate, endDate: filters.endDate })}`];
  for (const key of activeFilterKeys(filters)) {
    const raw = (filters as unknown as Record<string, unknown>)[key];
    const value = typeof raw === 'number'
      ? raw.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : names[String(raw)] || String(raw);
    out.push(`${LABELS[key] || key}: ${value}`);
  }
  if (filters.compare) out.push('Comparado con el período anterior');
  return out;
};

// ---------------------------------------------------------------------------
// Aplicación de filtros sobre las filas ya construidas
// ---------------------------------------------------------------------------

const norm = (v: unknown): string =>
  String(v ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, ''); // sin tildes: "móvil" encuentra "movil"

/** ¿La fila contiene el texto buscado en alguna de sus columnas visibles? */
export const rowMatchesSearch = (row: ReportRow, search: string): boolean => {
  const q = norm(search).trim();
  if (!q) return true;
  const terms = q.split(/\s+/);
  const haystack = Object.entries(row)
    .filter(([key]) => !key.startsWith('_'))
    .map(([, value]) => norm(value))
    .join(' ');
  return terms.every(t => haystack.includes(t));
};

/**
 * Filtra por texto y por rango de monto sobre las filas ya construidas.
 *
 * El resto de filtros (cliente, usuario, estado, ciudad…) los aplica cada reporte sobre sus
 * datos de origen, porque solo él sabe en qué campo vive cada cosa.
 */
export const applyCommonFilters = (
  rows: ReportRow[],
  filters: ReportFilters,
  /** Columna que se mide contra el rango de monto */
  amountKey?: string,
): ReportRow[] => {
  let out = rows || [];
  if (filters.search) out = out.filter(r => rowMatchesSearch(r, filters.search!));
  if (amountKey && (typeof filters.minAmount === 'number' || typeof filters.maxAmount === 'number')) {
    out = out.filter(r => {
      const value = Number(r[amountKey]) || 0;
      if (typeof filters.minAmount === 'number' && value < filters.minAmount) return false;
      if (typeof filters.maxAmount === 'number' && value > filters.maxAmount) return false;
      return true;
    });
  }
  return out;
};

/** Suma por columna de las filas que se están enseñando. */
export const sumColumns = (rows: ReportRow[], keys: string[]): Record<string, number> => {
  const totals: Record<string, number> = {};
  for (const key of keys) {
    totals[key] = Math.round(
      (rows || []).reduce((sum, row) => sum + (Number(row[key]) || 0), 0) * 100,
    ) / 100;
  }
  return totals;
};

/** Agrupa filas por el valor de una columna (para los reportes "por cliente", "por zona"…). */
export const groupRows = <T>(rows: T[], keyOf: (row: T) => string): Map<string, T[]> => {
  const out = new Map<string, T[]>();
  for (const row of rows || []) {
    const key = keyOf(row);
    const list = out.get(key);
    if (list) list.push(row); else out.set(key, [row]);
  }
  return out;
};

/** Ordena filas por una columna, con números, fechas y texto en español. */
export const sortRows = (rows: ReportRow[], key: string, dir: 'asc' | 'desc'): ReportRow[] => {
  const factor = dir === 'asc' ? 1 : -1;
  return [...(rows || [])].sort((a, b) => {
    const av = a[key]; const bv = b[key];
    const an = typeof av === 'number' ? av : Number(av);
    const bn = typeof bv === 'number' ? bv : Number(bv);
    const sonNumeros = Number.isFinite(an) && Number.isFinite(bn)
      && !(typeof av === 'string' && av.trim() === '') && !(typeof bv === 'string' && bv.trim() === '');
    if (sonNumeros) return (an - bn) * factor;
    return String(av ?? '').localeCompare(String(bv ?? ''), 'es', { numeric: true }) * factor;
  });
};
