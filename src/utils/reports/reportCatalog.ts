// ============================================================================
// El CATÁLOGO de reportes
// ============================================================================
// Un reporte = una entrada aquí. La pantalla (buscador, filtros, tabla, gráficos, exportación,
// impresión) es la misma para todos, así que añadir un reporte no obliga a tocar la interfaz.
//
// PERMISOS: cada reporte declara el permiso que ya existe en el sistema (`reports.view`,
// `reports.loans`, `reports.financial`, `reports.inventory`, `expenses.view`, `legal.view`…).
// Quien no lo tenga ni siquiera ve el reporte en el catálogo.

import type { ReportData } from './reportDataset';
import type { ReportDatasetId, ReportDefinition } from './reportTypes';
import { loanReports } from './builders/loanReports';
import { paymentReports } from './builders/paymentReports';
import { arrearsReports } from './builders/arrearsReports';
import { clientReports } from './builders/clientReports';
import { financialReports } from './builders/financialReports';
import {
  bankReports, expenseReports, inventoryReports, legalReports, reconciliationReport, salesReports,
} from './builders/operationReports';

export const REPORTS: ReportDefinition<ReportData>[] = [
  ...loanReports,
  ...paymentReports,
  ...arrearsReports,
  ...clientReports,
  ...financialReports,
  ...expenseReports,
  ...salesReports,
  ...inventoryReports,
  ...bankReports,
  reconciliationReport,
  ...legalReports,
];

export const reportById = (id: string): ReportDefinition<ReportData> | undefined =>
  REPORTS.find(r => r.id === id);

/** Los conjuntos de datos que hace falta cargar para un reporte (el núcleo va aparte). */
export const datasetsFor = (report: ReportDefinition<ReportData> | undefined): ReportDatasetId[] => {
  if (!report) return [];
  const list = Array.isArray(report.dataset) ? report.dataset : [report.dataset];
  return list.filter(d => d !== 'core');
};

/** Los reportes que el usuario puede ver, según sus permisos. */
export const visibleReports = (
  can: (permission: string) => boolean,
): ReportDefinition<ReportData>[] => REPORTS.filter(r => !r.permission || can(r.permission));

const norm = (v: string) =>
  String(v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * Busca reportes por nombre, descripción o palabras clave. Puntúa para que lo más parecido salga
 * primero: un reporte que empieza por lo escrito va antes que uno que solo lo menciona.
 */
export const searchReports = (
  reports: ReportDefinition<ReportData>[],
  query: string,
): ReportDefinition<ReportData>[] => {
  const q = norm(query).trim();
  if (!q) return reports;
  const terms = q.split(/\s+/);

  const scored = reports.map(report => {
    const name = norm(report.name);
    const haystack = [name, norm(report.description), ...(report.keywords || []).map(norm)].join(' ');
    let score = 0;
    for (const term of terms) {
      if (!haystack.includes(term)) return { report, score: -1 };
      if (name.startsWith(term)) score += 3;
      else if (name.includes(term)) score += 2;
      else score += 1;
    }
    return { report, score };
  });

  return scored
    .filter(s => s.score >= 0)
    .sort((a, b) => b.score - a.score || a.report.name.localeCompare(b.report.name, 'es'))
    .map(s => s.report);
};

/** Agrupa los reportes por categoría, respetando el orden del catálogo de categorías. */
export const groupByCategory = (
  reports: ReportDefinition<ReportData>[],
): Map<string, ReportDefinition<ReportData>[]> => {
  const out = new Map<string, ReportDefinition<ReportData>[]>();
  for (const report of reports) {
    const list = out.get(report.category);
    if (list) list.push(report); else out.set(report.category, [report]);
  }
  return out;
};
