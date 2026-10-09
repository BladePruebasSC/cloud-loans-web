// ============================================================================
// Reportes de MORA
// ============================================================================
// El atraso y el monto vencido de cada préstamo salen del mismo cálculo que la tarjeta y el
// inicio (`computeInstallmentDues` + `overdueFromDues`), no de `loans.current_late_fee` ni de
// `next_payment_date`, que son columnas cacheadas que pueden ir por detrás.
//
// PAR (Portfolio At Risk): porcentaje del saldo de la cartera que está en préstamos con más de N
// días de atraso. Se calcula con los días reales de cada préstamo; no hace falta ningún dato que
// el sistema no guarde.

import { isActiveLoan } from '../../portfolioMetrics';
import {
  clientNameOf, dateOnly, indexClients, round2, type CoreDataset,
} from '../reportDataset';
import { inPeriod } from '../reportPeriods';
import { applyCommonFilters, groupRows } from '../reportFilters';
import type { ReportDefinition, ReportRow } from '../reportTypes';

export const PAR_THRESHOLDS = [1, 7, 30, 60, 90];

export interface ArrearsLoan {
  loanId: string;
  clientId: string;
  cliente: string;
  dni: string;
  telefono: string;
  ciudad: string;
  sector: string;
  balance: number;
  vencido: number;
  mora: number;
  diasAtraso: number;
  cuotasVencidas: number;
  ultimoPago: string;
  proximoPago: string;
  etapa: string;
}

/** Los préstamos activos con atraso, con todo lo que necesita cualquier reporte de mora. */
export const arrearsLoans = (core: CoreDataset): ArrearsLoan[] => {
  const clients = indexClients(core);
  const ultimoPago = new Map<string, string>();
  for (const p of core.payments) {
    const d = dateOnly(p.payment_date);
    if (!d) continue;
    const prev = ultimoPago.get(p.loan_id);
    if (!prev || d > prev) ultimoPago.set(p.loan_id, d);
  }

  const out: ArrearsLoan[] = [];
  for (const loan of core.loans) {
    if (!isActiveLoan(loan.status)) continue;
    const o = core.overdueByLoan.get(loan.id);
    const dias = o?.daysOverdue || 0;
    const vencido = round2(o?.overdueAmount || 0);
    if (dias <= 0 || vencido <= 0.005) continue;

    const client = clients.get(loan.client_id) as any;
    const cuotas = (core.installments || []).filter(i =>
      i.loan_id === loan.id && !i.is_paid && dateOnly(i.due_date) < core.todayIso).length;

    out.push({
      loanId: loan.id,
      clientId: loan.client_id,
      cliente: clientNameOf(loan, core),
      dni: client?.dni || loan.client?.dni || '',
      telefono: client?.phone || loan.client?.phone || '',
      ciudad: client?.city || '',
      sector: client?.neighborhood || '',
      balance: round2(core.balanceByLoan.get(loan.id) ?? loan.remaining_balance),
      vencido,
      mora: round2(core.lateFeeByLoan.get(loan.id) || 0),
      diasAtraso: dias,
      cuotasVencidas: cuotas,
      ultimoPago: ultimoPago.get(loan.id) || '',
      proximoPago: dateOnly(o?.nextDueDate || loan.next_payment_date),
      etapa: String(loan.collection_stage || '').replace(/_/g, ' '),
    });
  }
  return out;
};

/** Saldo total de la cartera activa: el denominador del PAR. */
export const activePortfolioBalance = (core: CoreDataset): number => round2(
  core.loans
    .filter(l => isActiveLoan(l.status))
    .reduce((s, l) => s + (core.balanceByLoan.get(l.id) ?? l.remaining_balance ?? 0), 0),
);

export interface ParPoint {
  dias: number;
  prestamos: number;
  balance: number;
  porcentaje: number;
}

/** PAR 1 / 7 / 30 / 60 / 90 sobre la cartera activa. */
export const computePar = (core: CoreDataset): ParPoint[] => {
  const total = activePortfolioBalance(core);
  const morosos = arrearsLoans(core);
  return PAR_THRESHOLDS.map(dias => {
    const enRiesgo = morosos.filter(m => m.diasAtraso >= dias);
    const balance = round2(enRiesgo.reduce((s, m) => s + m.balance, 0));
    return {
      dias,
      prestamos: enRiesgo.length,
      balance,
      porcentaje: total > 0 ? Math.round((balance / total) * 1000) / 10 : 0,
    };
  });
};

const ARREARS_COLUMNS = [
  { key: 'cliente', label: 'Cliente', align: 'left' as const },
  { key: 'dni', label: 'Cédula', align: 'left' as const, hiddenByDefault: true },
  { key: 'telefono', label: 'Teléfono', align: 'left' as const },
  { key: 'ciudad', label: 'Ciudad', align: 'left' as const, hiddenByDefault: true },
  { key: 'sector', label: 'Sector', align: 'left' as const, hiddenByDefault: true },
  { key: 'balance', label: 'Balance', format: 'money' as const, total: true },
  { key: 'vencido', label: 'Vencido', format: 'money' as const, total: true },
  { key: 'mora', label: 'Mora', format: 'money' as const, total: true },
  { key: 'cuotasVencidas', label: 'Cuotas vencidas', format: 'number' as const, total: true },
  { key: 'diasAtraso', label: 'Días', format: 'number' as const },
  { key: 'tramo', label: 'Tramo', format: 'badge' as const },
  { key: 'ultimoPago', label: 'Último pago', format: 'date' as const },
  { key: 'etapa', label: 'Gestión', align: 'left' as const, hiddenByDefault: true },
];

const tramoDe = (dias: number): string =>
  dias <= 0 ? 'Al día' : dias <= 30 ? '1 a 30' : dias <= 60 ? '31 a 60' : dias <= 90 ? '61 a 90' : 'Más de 90';

export const arrearsReports: ReportDefinition<CoreDataset>[] = [
  {
    id: 'arrears-portfolio',
    asOfToday: true,
    name: 'Cartera vencida',
    category: 'mora',
    description: 'Todos los préstamos con atraso: cuánto deben, cuánto está vencido y desde cuándo.',
    permission: 'reports.loans',
    dataset: 'core',
    columns: ARREARS_COLUMNS,
    filters: ['search', 'clientId', 'city', 'neighborhood', 'minAmount', 'maxAmount'],
    defaultSort: { key: 'diasAtraso', dir: 'desc' },
    keywords: ['mora', 'vencida', 'atraso', 'par', 'riesgo'],
    build: ctx => {
      const { data: core, filters } = ctx;
      const morosos = arrearsLoans(core)
        .filter(m => !filters.clientId || m.clientId === filters.clientId)
        .filter(m => !filters.city || m.ciudad === filters.city)
        .filter(m => !filters.neighborhood || m.sector === filters.neighborhood);
      const rows = applyCommonFilters(
        morosos.map(m => ({ ...m, _id: m.loanId, _loanId: m.loanId, _clientId: m.clientId, tramo: tramoDe(m.diasAtraso) })),
        filters, 'vencido',
      );
      const par = computePar(core);
      return {
        rows,
        notes: [
          'La cartera vencida es a HOY: el período no la recorta.',
          `PAR sobre una cartera activa de RD$${activePortfolioBalance(core).toLocaleString('es-DO', { minimumFractionDigits: 2 })}.`,
        ],
        kpis: [
          { key: 'prestamos', label: 'Préstamos vencidos', value: rows.length, format: 'number' },
          {
            key: 'vencido', label: 'Monto vencido', format: 'money',
            value: round2(rows.reduce((s, r) => s + (Number(r.vencido) || 0), 0)),
          },
          {
            key: 'balance', label: 'Balance en riesgo', format: 'money',
            value: round2(rows.reduce((s, r) => s + (Number(r.balance) || 0), 0)),
          },
          ...par.map(p => ({
            key: `par${p.dias}`, label: `PAR ${p.dias}`, value: p.porcentaje, format: 'percent' as const,
            hint: `${p.prestamos} préstamo(s) · RD$${p.balance.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`,
          })),
        ],
      };
    },
  },

  {
    id: 'arrears-aging',
    asOfToday: true,
    name: 'Antigüedad de la mora (PAR)',
    category: 'mora',
    description: 'Cuánto saldo hay en cada tramo de atraso y qué porcentaje de la cartera representa.',
    permission: 'reports.loans',
    dataset: 'core',
    columns: [
      { key: 'tramo', label: 'Tramo de atraso', align: 'left' },
      { key: 'prestamos', label: 'Préstamos', format: 'number', total: true },
      { key: 'clientes', label: 'Clientes', format: 'number', total: true },
      { key: 'balance', label: 'Balance', format: 'money', total: true },
      { key: 'vencido', label: 'Vencido', format: 'money', total: true },
      { key: 'mora', label: 'Mora', format: 'money', total: true },
      { key: 'participacion', label: '% de la cartera', format: 'percent' },
    ],
    filters: ['city'],
    defaultSort: { key: 'tramo', dir: 'asc' },
    keywords: ['par', 'antigüedad', 'aging', 'tramos', 'riesgo'],
    build: ctx => {
      const { data: core, filters } = ctx;
      const total = activePortfolioBalance(core);
      const morosos = arrearsLoans(core).filter(m => !filters.city || m.ciudad === filters.city);
      const orden = ['1 a 30', '31 a 60', '61 a 90', 'Más de 90'];
      const grupos = groupRows(morosos, m => tramoDe(m.diasAtraso));
      const rows: ReportRow[] = orden
        .filter(t => grupos.has(t))
        .map(tramo => {
          const lista = grupos.get(tramo)!;
          const balance = round2(lista.reduce((s, m) => s + m.balance, 0));
          return {
            _id: tramo,
            tramo,
            prestamos: lista.length,
            clientes: new Set(lista.map(m => m.clientId)).size,
            balance,
            vencido: round2(lista.reduce((s, m) => s + m.vencido, 0)),
            mora: round2(lista.reduce((s, m) => s + m.mora, 0)),
            participacion: total > 0 ? Math.round((balance / total) * 1000) / 10 : 0,
          };
        });
      const par = computePar(core);
      return {
        rows,
        kpis: par.map(p => ({
          key: `par${p.dias}`, label: `PAR ${p.dias}`, value: p.porcentaje, format: 'percent' as const,
          hint: `${p.prestamos} préstamo(s)`,
        })),
        charts: [{
          kind: 'bar', title: 'Saldo por tramo de atraso', xKey: 'tramo',
          series: [{ key: 'balance', label: 'Balance' }, { key: 'vencido', label: 'Vencido' }], money: true,
        }],
      };
    },
  },

  {
    id: 'arrears-clients',
    asOfToday: true,
    name: 'Clientes morosos',
    category: 'mora',
    description: 'Clientes con deuda vencida, de la más grande a la más pequeña.',
    permission: 'reports.loans',
    dataset: 'core',
    columns: [
      { key: 'cliente', label: 'Cliente', align: 'left' },
      { key: 'dni', label: 'Cédula', align: 'left' },
      { key: 'telefono', label: 'Teléfono', align: 'left' },
      { key: 'ciudad', label: 'Ciudad', align: 'left', hiddenByDefault: true },
      { key: 'prestamos', label: 'Préstamos', format: 'number', total: true },
      { key: 'balance', label: 'Balance', format: 'money', total: true },
      { key: 'vencido', label: 'Vencido', format: 'money', total: true },
      { key: 'mora', label: 'Mora', format: 'money', total: true },
      { key: 'diasAtraso', label: 'Peor atraso', format: 'number' },
      { key: 'ultimoPago', label: 'Último pago', format: 'date' },
    ],
    filters: ['search', 'city', 'neighborhood', 'minAmount', 'maxAmount'],
    defaultSort: { key: 'vencido', dir: 'desc' },
    keywords: ['morosos', 'deudores', 'clientes con atraso'],
    build: ctx => {
      const { data: core, filters } = ctx;
      const morosos = arrearsLoans(core)
        .filter(m => !filters.city || m.ciudad === filters.city)
        .filter(m => !filters.neighborhood || m.sector === filters.neighborhood);
      const grupos = groupRows(morosos, m => m.clientId);
      const rows: ReportRow[] = [...grupos.entries()].map(([clientId, lista]) => ({
        _id: clientId,
        _clientId: clientId,
        cliente: lista[0].cliente,
        dni: lista[0].dni,
        telefono: lista[0].telefono,
        ciudad: lista[0].ciudad,
        prestamos: lista.length,
        balance: round2(lista.reduce((s, m) => s + m.balance, 0)),
        vencido: round2(lista.reduce((s, m) => s + m.vencido, 0)),
        mora: round2(lista.reduce((s, m) => s + m.mora, 0)),
        diasAtraso: Math.max(...lista.map(m => m.diasAtraso)),
        ultimoPago: lista.map(m => m.ultimoPago).filter(Boolean).sort().slice(-1)[0] || '',
      }));
      return { rows: applyCommonFilters(rows, filters, 'vencido') };
    },
  },

  {
    id: 'arrears-by-city',
    asOfToday: true,
    name: 'Mora por ciudad y sector',
    category: 'mora',
    description: 'Dónde se concentra el atraso, con el porcentaje vencido de cada zona.',
    permission: 'reports.loans',
    dataset: 'core',
    columns: [
      { key: 'zona', label: 'Ciudad / sector', align: 'left' },
      { key: 'clientes', label: 'Clientes', format: 'number', total: true },
      { key: 'prestamos', label: 'Préstamos', format: 'number', total: true },
      { key: 'balance', label: 'Balance', format: 'money', total: true },
      { key: 'vencido', label: 'Vencido', format: 'money', total: true },
      { key: 'diasPromedio', label: 'Atraso promedio', format: 'number' },
    ],
    filters: ['search'],
    defaultSort: { key: 'vencido', dir: 'desc' },
    keywords: ['zona', 'ciudad', 'sector', 'mora geográfica'],
    build: ctx => {
      const { data: core, filters } = ctx;
      const morosos = arrearsLoans(core);
      const grupos = groupRows(morosos, m => {
        const ciudad = (m.ciudad || '').trim() || 'Sin ciudad';
        return m.sector ? `${ciudad} · ${m.sector}` : ciudad;
      });
      const rows: ReportRow[] = [...grupos.entries()].map(([zona, lista]) => ({
        _id: zona,
        zona,
        clientes: new Set(lista.map(m => m.clientId)).size,
        prestamos: lista.length,
        balance: round2(lista.reduce((s, m) => s + m.balance, 0)),
        vencido: round2(lista.reduce((s, m) => s + m.vencido, 0)),
        diasPromedio: Math.round(lista.reduce((s, m) => s + m.diasAtraso, 0) / Math.max(1, lista.length)),
      }));
      return {
        rows: applyCommonFilters(rows, filters, 'vencido'),
        notes: ['Agrupado por la ciudad y el sector del cliente: el sistema no tiene zonas ni rutas asignadas.'],
      };
    },
  },

  {
    id: 'arrears-recovery',
    name: 'Recuperación de mora',
    category: 'mora',
    description: 'Mora cobrada en el período frente a la mora que sigue pendiente hoy.',
    permission: 'reports.financial',
    dataset: 'core',
    columns: [
      { key: 'fecha', label: 'Día', format: 'date' },
      { key: 'cobros', label: 'Cobros con mora', format: 'number', total: true },
      { key: 'mora', label: 'Mora cobrada', format: 'money', total: true },
    ],
    filters: ['userId'],
    defaultSort: { key: 'fecha', dir: 'asc' },
    keywords: ['mora cobrada', 'recuperación', 'penalidades'],
    build: ctx => {
      const { data: core, filters } = ctx;
      const conMora = core.payments
        .filter(p => inPeriod(dateOnly(p.payment_date), filters) && (Number(p.late_fee) || 0) > 0.005)
        .filter(p => !filters.userId || p.created_by === filters.userId);
      const grupos = groupRows(conMora, p => dateOnly(p.payment_date));
      const rows: ReportRow[] = [...grupos.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([fecha, lista]) => ({
          _id: fecha,
          fecha,
          cobros: lista.length,
          mora: round2(lista.reduce((s, p) => s + (Number(p.late_fee) || 0), 0)),
        }));
      const pendiente = round2(arrearsLoans(core).reduce((s, m) => s + m.mora, 0));
      const cobrada = round2(rows.reduce((s, r) => s + (Number(r.mora) || 0), 0));
      return {
        rows,
        kpis: [
          { key: 'cobrada', label: 'Mora cobrada', value: cobrada, format: 'money' },
          { key: 'pendiente', label: 'Mora pendiente hoy', value: pendiente, format: 'money', linkTo: 'arrears-portfolio' },
          {
            key: 'tasa', label: 'Recuperación', format: 'percent',
            value: cobrada + pendiente > 0 ? Math.round((cobrada / (cobrada + pendiente)) * 1000) / 10 : 0,
            hint: 'Cobrada sobre cobrada + pendiente',
          },
        ],
        charts: [{
          kind: 'bar', title: 'Mora cobrada por día', xKey: 'fecha',
          series: [{ key: 'mora', label: 'Mora cobrada' }], money: true,
        }],
      };
    },
  },
];
