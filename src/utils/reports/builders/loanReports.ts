// ============================================================================
// Reportes de PRÉSTAMOS
// ============================================================================
// Todas las cifras salen del dataset central: el balance es el de la ficha, el atraso se calcula
// desde las cuotas y la mora desde el mismo motor que la tarjeta. Aquí no se recalcula nada.

import type { LoanLike } from '../../portfolioMetrics';
import { isActiveLoan } from '../../portfolioMetrics';
import {
  AMORTIZATION_LABEL, FREQUENCY_LABEL, LOAN_STATUS_LABEL, clientNameOf, dateOnly, indexClients,
  labelFor, round2, type CoreDataset,
} from '../reportDataset';
import { inPeriod } from '../reportPeriods';
import { applyCommonFilters, groupRows } from '../reportFilters';
import type { ReportBuildContext, ReportDefinition, ReportResult, ReportRow } from '../reportTypes';

const money = (v: unknown) => round2(v);

/** La fila estándar de un préstamo: la misma en todos los reportes que lo listan. */
export const loanRow = (loan: LoanLike, core: CoreDataset): ReportRow => {
  const clients = indexClients(core);
  const client = clients.get(loan.client_id);
  const overdue = core.overdueByLoan.get(loan.id);
  const balance = core.balanceByLoan.get(loan.id);
  const lateFee = core.lateFeeByLoan.get(loan.id) || 0;
  const pagado = core.payments
    .filter(p => p.loan_id === loan.id)
    .reduce((s, p) => s + (Number(p.amount) || 0) + (Number(p.late_fee) || 0), 0);
  const abonos = core.capitalPayments
    .filter(c => c.loan_id === loan.id)
    .reduce((s, c) => s + (Number(c.amount) || 0), 0);

  return {
    _id: loan.id,
    _loanId: loan.id,
    _clientId: loan.client_id,
    cliente: clientNameOf(loan, core),
    dni: client?.dni || loan.client?.dni || '',
    telefono: client?.phone || loan.client?.phone || '',
    ciudad: (client as any)?.city || '',
    sector: (client as any)?.neighborhood || '',
    fecha: dateOnly(loan.start_date || loan.created_at),
    capital: money(loan.amount),
    cuota: money(loan.monthly_payment),
    frecuencia: labelFor(FREQUENCY_LABEL, loan.payment_frequency),
    tipo: labelFor(AMORTIZATION_LABEL, loan.amortization_type, 'Simple'),
    tasa: Number(loan.interest_rate) || 0,
    plazo: Number((loan as any).term_months) || 0,
    pagado: money(pagado + abonos),
    abonos: money(abonos),
    balance: money(balance ?? loan.remaining_balance),
    mora: money(lateFee),
    aSaldar: money((balance ?? loan.remaining_balance) + lateFee),
    vencido: money(overdue?.overdueAmount || 0),
    diasAtraso: overdue?.daysOverdue || 0,
    proximoPago: dateOnly(overdue?.nextDueDate || loan.next_payment_date),
    estado: labelFor(LOAN_STATUS_LABEL, loan.status),
  };
};

const LOAN_COLUMNS = [
  { key: 'cliente', label: 'Cliente', align: 'left' as const },
  { key: 'dni', label: 'Cédula', align: 'left' as const, hiddenByDefault: true },
  { key: 'telefono', label: 'Teléfono', align: 'left' as const, hiddenByDefault: true },
  { key: 'ciudad', label: 'Ciudad', align: 'left' as const, hiddenByDefault: true },
  { key: 'sector', label: 'Sector', align: 'left' as const, hiddenByDefault: true },
  { key: 'fecha', label: 'Desembolso', format: 'date' as const },
  { key: 'capital', label: 'Capital', format: 'money' as const, total: true },
  { key: 'cuota', label: 'Cuota', format: 'money' as const },
  { key: 'frecuencia', label: 'Frecuencia', align: 'left' as const },
  { key: 'tipo', label: 'Tipo', align: 'left' as const, hiddenByDefault: true },
  { key: 'tasa', label: 'Tasa %', format: 'percent' as const, hiddenByDefault: true },
  { key: 'pagado', label: 'Cobrado', format: 'money' as const, total: true },
  { key: 'balance', label: 'Balance', format: 'money' as const, total: true },
  { key: 'mora', label: 'Mora', format: 'money' as const, total: true },
  { key: 'vencido', label: 'Vencido', format: 'money' as const, total: true },
  { key: 'diasAtraso', label: 'Días', format: 'number' as const },
  { key: 'proximoPago', label: 'Próximo pago', format: 'date' as const },
  { key: 'estado', label: 'Estado', format: 'badge' as const },
];

/** Filtros por campos del préstamo y su cliente que comparten varios reportes. */
const matchesLoanFilters = (loan: LoanLike, core: CoreDataset, f: ReportBuildContext<CoreDataset>['filters']): boolean => {
  if (f.clientId && loan.client_id !== f.clientId) return false;
  if (f.loanType && String(loan.amortization_type || 'simple').toLowerCase() !== f.loanType) return false;
  if (f.frequency && String(loan.payment_frequency || 'monthly').toLowerCase() !== f.frequency) return false;
  if (f.status && String(loan.status || '').toLowerCase() !== f.status) return false;
  if (f.city || f.neighborhood) {
    const client = core.clients.find(c => c.id === loan.client_id) as any;
    if (f.city && String(client?.city || '') !== f.city) return false;
    if (f.neighborhood && String(client?.neighborhood || '') !== f.neighborhood) return false;
  }
  return true;
};

const buildLoanList = (
  ctx: ReportBuildContext<CoreDataset>,
  pick: (loan: LoanLike) => boolean,
  extras?: Partial<ReportResult>,
): ReportResult => {
  const { data: core, filters } = ctx;
  const loans = core.loans.filter(l => pick(l) && matchesLoanFilters(l, core, filters));
  const rows = applyCommonFilters(loans.map(l => loanRow(l, core)), filters, 'capital');
  return { rows, ...extras };
};

// ---------------------------------------------------------------------------
// Definiciones
// ---------------------------------------------------------------------------

export const loanReports: ReportDefinition<CoreDataset>[] = [
  {
    id: 'loans-placed',
    name: 'Préstamos desembolsados',
    category: 'prestamos',
    description: '¿Cuánto prestamos en el período? Préstamos aprobados con fecha dentro del período.',
    permission: 'reports.loans',
    dataset: 'core',
    columns: LOAN_COLUMNS,
    filters: ['search', 'clientId', 'loanType', 'frequency', 'city', 'neighborhood', 'minAmount', 'maxAmount'],
    defaultSort: { key: 'fecha', dir: 'desc' },
    keywords: ['colocación', 'nuevos', 'otorgados', 'desembolso'],
    build: ctx => {
      const { filters } = ctx;
      const res = buildLoanList(ctx, loan =>
        inPeriod(dateOnly(loan.start_date || loan.created_at), filters));
      const capital = res.rows.reduce((s, r) => s + (Number(r.capital) || 0), 0);
      return {
        ...res,
        kpis: [
          { key: 'cantidad', label: 'Préstamos', value: res.rows.length, format: 'number' },
          { key: 'capital', label: 'Capital colocado', value: round2(capital), format: 'money' },
          {
            key: 'promedio', label: 'Monto promedio', format: 'money',
            value: res.rows.length ? round2(capital / res.rows.length) : 0,
          },
        ],
      };
    },
  },

  {
    id: 'loans-active',
    name: 'Cartera activa',
    category: 'prestamos',
    description: 'Los préstamos vivos hoy, con su balance, atraso y próximo pago.',
    permission: 'reports.loans',
    dataset: 'core',
    columns: LOAN_COLUMNS,
    filters: ['search', 'clientId', 'loanType', 'frequency', 'city', 'neighborhood', 'minAmount', 'maxAmount'],
    defaultSort: { key: 'balance', dir: 'desc' },
    keywords: ['cartera', 'vigentes', 'activos', 'saldo'],
    build: ctx => {
      const res = buildLoanList(ctx, loan => isActiveLoan(loan.status));
      const balance = res.rows.reduce((s, r) => s + (Number(r.balance) || 0), 0);
      const mora = res.rows.reduce((s, r) => s + (Number(r.mora) || 0), 0);
      const vencido = res.rows.reduce((s, r) => s + (Number(r.vencido) || 0), 0);
      return {
        ...res,
        notes: ['La cartera es a HOY: el período no la recorta (un préstamo vivo lo está hoy, no "en septiembre").'],
        kpis: [
          { key: 'cantidad', label: 'Préstamos activos', value: res.rows.length, format: 'number' },
          { key: 'balance', label: 'Saldo por cobrar', value: round2(balance), format: 'money' },
          { key: 'vencido', label: 'Vencido', value: round2(vencido), format: 'money', linkTo: 'arrears-portfolio' },
          { key: 'mora', label: 'Mora acumulada', value: round2(mora), format: 'money' },
        ],
      };
    },
  },

  {
    id: 'loans-paid',
    name: 'Préstamos saldados',
    category: 'prestamos',
    description: 'Préstamos que quedaron en cero. Se cuentan por la fecha de su último cobro.',
    permission: 'reports.loans',
    dataset: 'core',
    columns: LOAN_COLUMNS,
    filters: ['search', 'clientId', 'loanType', 'city', 'minAmount', 'maxAmount'],
    defaultSort: { key: 'fecha', dir: 'desc' },
    keywords: ['pagados', 'terminados', 'cerrados', 'saldados'],
    build: ctx => {
      const { data: core, filters } = ctx;
      const ultimoPagoPorPrestamo = new Map<string, string>();
      for (const p of core.payments) {
        const d = dateOnly(p.payment_date);
        if (!d) continue;
        const prev = ultimoPagoPorPrestamo.get(p.loan_id);
        if (!prev || d > prev) ultimoPagoPorPrestamo.set(p.loan_id, d);
      }
      const res = buildLoanList(ctx, loan => {
        if (String(loan.status || '').toLowerCase() !== 'paid') return false;
        const ultimo = ultimoPagoPorPrestamo.get(loan.id);
        // Sin pagos registrados se usa la fecha de inicio para situarlo en el tiempo.
        return inPeriod(ultimo || dateOnly(loan.start_date), filters);
      });
      const rows: ReportRow[] = res.rows.map(r => ({
        ...r,
        saldadoEl: ultimoPagoPorPrestamo.get(String(r._loanId)) || '',
      }));
      return {
        rows,
        kpis: [
          { key: 'cantidad', label: 'Préstamos saldados', value: rows.length, format: 'number' },
          {
            key: 'capital', label: 'Capital recuperado', format: 'money',
            value: round2(rows.reduce((s, r) => s + (Number(r.capital) || 0), 0)),
          },
          {
            key: 'cobrado', label: 'Total cobrado', format: 'money',
            value: round2(rows.reduce((s, r) => s + (Number(r.pagado) || 0), 0)),
          },
        ],
      };
    },
  },

  {
    id: 'loans-overdue',
    name: 'Préstamos vencidos',
    category: 'prestamos',
    description: 'Préstamos con al menos una cuota vencida, ordenados por días de atraso.',
    permission: 'reports.loans',
    dataset: 'core',
    columns: LOAN_COLUMNS,
    filters: ['search', 'clientId', 'city', 'neighborhood', 'minAmount', 'maxAmount'],
    defaultSort: { key: 'diasAtraso', dir: 'desc' },
    keywords: ['atrasados', 'vencidos', 'mora'],
    build: ctx => {
      const res = buildLoanList(ctx, loan => {
        const o = ctx.data.overdueByLoan.get(loan.id);
        return isActiveLoan(loan.status) && (o?.daysOverdue || 0) > 0 && (o?.overdueAmount || 0) > 0.005;
      });
      return {
        ...res,
        notes: ['El atraso se calcula desde las cuotas, igual que en la tarjeta del préstamo.'],
        kpis: [
          { key: 'cantidad', label: 'Préstamos vencidos', value: res.rows.length, format: 'number' },
          {
            key: 'vencido', label: 'Monto vencido', format: 'money',
            value: round2(res.rows.reduce((s, r) => s + (Number(r.vencido) || 0), 0)),
          },
          {
            key: 'balance', label: 'Balance en riesgo', format: 'money',
            value: round2(res.rows.reduce((s, r) => s + (Number(r.balance) || 0), 0)),
          },
        ],
      };
    },
  },

  {
    id: 'loans-by-client',
    name: 'Préstamos por cliente',
    category: 'prestamos',
    description: 'Cuántos préstamos tiene cada cliente, cuánto se le prestó y cuánto debe.',
    permission: 'reports.loans',
    dataset: 'core',
    columns: [
      { key: 'cliente', label: 'Cliente', align: 'left' },
      { key: 'dni', label: 'Cédula', align: 'left' },
      { key: 'ciudad', label: 'Ciudad', align: 'left' },
      { key: 'prestamos', label: 'Préstamos', format: 'number', total: true },
      { key: 'activos', label: 'Activos', format: 'number', total: true },
      { key: 'capital', label: 'Prestado', format: 'money', total: true },
      { key: 'pagado', label: 'Cobrado', format: 'money', total: true },
      { key: 'balance', label: 'Balance', format: 'money', total: true },
      { key: 'vencido', label: 'Vencido', format: 'money', total: true },
      { key: 'diasAtraso', label: 'Peor atraso', format: 'number' },
    ],
    filters: ['search', 'city', 'neighborhood', 'minAmount', 'maxAmount'],
    defaultSort: { key: 'balance', dir: 'desc' },
    keywords: ['cliente', 'deudores', 'resumen por cliente'],
    build: ctx => {
      const { data: core, filters } = ctx;
      const loans = core.loans.filter(l => matchesLoanFilters(l, core, filters));
      const porCliente = groupRows(loans, l => l.client_id);
      const clients = indexClients(core);
      const rows: ReportRow[] = [];
      for (const [clientId, lista] of porCliente) {
        const client = clients.get(clientId) as any;
        const filas = lista.map(l => loanRow(l, core));
        rows.push({
          _id: clientId,
          _clientId: clientId,
          cliente: client?.full_name || filas[0]?.cliente || 'Cliente',
          dni: client?.dni || '',
          ciudad: client?.city || '',
          prestamos: lista.length,
          activos: lista.filter(l => isActiveLoan(l.status)).length,
          capital: round2(filas.reduce((s, r) => s + (Number(r.capital) || 0), 0)),
          pagado: round2(filas.reduce((s, r) => s + (Number(r.pagado) || 0), 0)),
          balance: round2(filas.reduce((s, r) => s + (Number(r.balance) || 0), 0)),
          vencido: round2(filas.reduce((s, r) => s + (Number(r.vencido) || 0), 0)),
          diasAtraso: Math.max(0, ...filas.map(r => Number(r.diasAtraso) || 0)),
        });
      }
      return { rows: applyCommonFilters(rows, filters, 'balance') };
    },
  },

  {
    id: 'loans-by-type',
    name: 'Préstamos por tipo y frecuencia',
    category: 'prestamos',
    description: 'Cómo se reparte la cartera entre tipos de amortización y frecuencias de cobro.',
    permission: 'reports.loans',
    dataset: 'core',
    columns: [
      { key: 'grupo', label: 'Tipo / frecuencia', align: 'left' },
      { key: 'prestamos', label: 'Préstamos', format: 'number', total: true },
      { key: 'capital', label: 'Capital', format: 'money', total: true },
      { key: 'balance', label: 'Balance', format: 'money', total: true },
      { key: 'vencido', label: 'Vencido', format: 'money', total: true },
      { key: 'participacion', label: '% de la cartera', format: 'percent' },
    ],
    filters: ['search', 'city'],
    defaultSort: { key: 'balance', dir: 'desc' },
    keywords: ['tipo', 'amortización', 'frecuencia', 'producto'],
    build: ctx => {
      const { data: core, filters } = ctx;
      const loans = core.loans.filter(l => isActiveLoan(l.status) && matchesLoanFilters(l, core, filters));
      const filas = loans.map(l => ({ loan: l, row: loanRow(l, core) }));
      const total = round2(filas.reduce((s, f) => s + (Number(f.row.balance) || 0), 0));
      const grupos = groupRows(filas, f =>
        `${labelFor(AMORTIZATION_LABEL, f.loan.amortization_type, 'Simple')} · ${labelFor(FREQUENCY_LABEL, f.loan.payment_frequency)}`);
      const rows: ReportRow[] = [];
      for (const [grupo, lista] of grupos) {
        const balance = round2(lista.reduce((s, f) => s + (Number(f.row.balance) || 0), 0));
        rows.push({
          _id: grupo,
          grupo,
          prestamos: lista.length,
          capital: round2(lista.reduce((s, f) => s + (Number(f.row.capital) || 0), 0)),
          balance,
          vencido: round2(lista.reduce((s, f) => s + (Number(f.row.vencido) || 0), 0)),
          participacion: total > 0 ? Math.round((balance / total) * 1000) / 10 : 0,
        });
      }
      return {
        rows: applyCommonFilters(rows, filters),
        charts: [{
          kind: 'pie', title: 'Balance por tipo y frecuencia', xKey: 'grupo',
          series: [{ key: 'balance', label: 'Balance' }], money: true,
        }],
      };
    },
  },

  {
    id: 'loans-by-city',
    name: 'Préstamos por ciudad y sector',
    category: 'prestamos',
    description: 'Dónde está colocada la cartera. Sale de la ciudad y el sector del cliente.',
    permission: 'reports.loans',
    dataset: 'core',
    columns: [
      { key: 'zona', label: 'Ciudad / sector', align: 'left' },
      { key: 'clientes', label: 'Clientes', format: 'number', total: true },
      { key: 'prestamos', label: 'Préstamos', format: 'number', total: true },
      { key: 'capital', label: 'Capital', format: 'money', total: true },
      { key: 'balance', label: 'Balance', format: 'money', total: true },
      { key: 'vencido', label: 'Vencido', format: 'money', total: true },
      { key: 'morosidad', label: '% vencido', format: 'percent' },
    ],
    filters: ['search'],
    defaultSort: { key: 'balance', dir: 'desc' },
    keywords: ['zona', 'ruta', 'ciudad', 'sector', 'barrio', 'geográfico'],
    build: ctx => {
      const { data: core, filters } = ctx;
      const clients = indexClients(core);
      const loans = core.loans.filter(l => isActiveLoan(l.status));
      const grupos = groupRows(loans, l => {
        const c = clients.get(l.client_id) as any;
        const ciudad = String(c?.city || '').trim() || 'Sin ciudad';
        const sector = String(c?.neighborhood || '').trim();
        return sector ? `${ciudad} · ${sector}` : ciudad;
      });
      const rows: ReportRow[] = [];
      for (const [zona, lista] of grupos) {
        const filas = lista.map(l => loanRow(l, core));
        const balance = round2(filas.reduce((s, r) => s + (Number(r.balance) || 0), 0));
        const vencido = round2(filas.reduce((s, r) => s + (Number(r.vencido) || 0), 0));
        rows.push({
          _id: zona,
          zona,
          clientes: new Set(lista.map(l => l.client_id)).size,
          prestamos: lista.length,
          capital: round2(filas.reduce((s, r) => s + (Number(r.capital) || 0), 0)),
          balance,
          vencido,
          morosidad: balance > 0 ? Math.round((vencido / balance) * 1000) / 10 : 0,
        });
      }
      return {
        rows: applyCommonFilters(rows, filters, 'balance'),
        notes: [
          'El sistema no tiene zonas ni rutas asignadas: esta agrupación usa la ciudad y el sector '
          + 'que tiene registrado cada cliente. Los clientes sin ciudad salen como "Sin ciudad".',
        ],
        charts: [{
          kind: 'bar', title: 'Balance por zona', xKey: 'zona',
          series: [{ key: 'balance', label: 'Balance' }, { key: 'vencido', label: 'Vencido' }], money: true,
        }],
      };
    },
  },

  {
    id: 'loans-evolution',
    name: 'Evolución de colocaciones',
    category: 'prestamos',
    description: 'Cuánto se prestó mes a mes, con la cantidad de préstamos.',
    permission: 'reports.loans',
    dataset: 'core',
    columns: [
      { key: 'mes', label: 'Mes', align: 'left' },
      { key: 'prestamos', label: 'Préstamos', format: 'number', total: true },
      { key: 'capital', label: 'Capital colocado', format: 'money', total: true },
      { key: 'promedio', label: 'Monto promedio', format: 'money' },
    ],
    filters: ['loanType', 'city'],
    defaultSort: { key: 'mes', dir: 'asc' },
    keywords: ['evolución', 'tendencia', 'histórico', 'mensual'],
    build: ctx => {
      const { data: core, filters } = ctx;
      const loans = core.loans.filter(l =>
        matchesLoanFilters(l, core, filters)
        && inPeriod(dateOnly(l.start_date || l.created_at), filters));
      const grupos = groupRows(loans, l => dateOnly(l.start_date || l.created_at).slice(0, 7));
      const rows: ReportRow[] = [...grupos.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([mes, lista]) => {
          const capital = round2(lista.reduce((s, l) => s + (Number(l.amount) || 0), 0));
          return {
            _id: mes,
            mes,
            prestamos: lista.length,
            capital,
            promedio: lista.length ? round2(capital / lista.length) : 0,
          };
        });
      return {
        rows,
        charts: [{
          kind: 'bar', title: 'Capital colocado por mes', xKey: 'mes',
          series: [{ key: 'capital', label: 'Capital' }], money: true,
        }],
      };
    },
  },

  {
    id: 'loans-changes',
    name: 'Cambios en préstamos',
    category: 'prestamos',
    description: 'Extensiones de plazo, cargos, abonos a capital, ediciones y eliminaciones del período.',
    permission: 'reports.loans',
    dataset: 'core',
    columns: [
      { key: 'fecha', label: 'Fecha', format: 'date' },
      { key: 'cliente', label: 'Cliente', align: 'left' },
      { key: 'cambio', label: 'Tipo de cambio', align: 'left' },
      { key: 'descripcion', label: 'Detalle', align: 'left', width: 70 },
    ],
    filters: ['search', 'clientId'],
    defaultSort: { key: 'fecha', dir: 'desc' },
    keywords: ['historial', 'reestructurado', 'refinanciado', 'extensión', 'auditoría'],
    build: ctx => {
      const { data: core, filters } = ctx;
      const loansById = new Map(core.loans.concat(core.deletedLoans).map(l => [l.id, l]));
      const rows = core.loanHistory
        .filter(h => inPeriod(dateOnly(h.created_at), filters))
        .map(h => {
          const loan = loansById.get(h.loan_id);
          return {
            _id: h.id,
            _loanId: h.loan_id,
            fecha: dateOnly(h.created_at),
            cliente: loan ? clientNameOf(loan, core) : 'Préstamo eliminado',
            cambio: String(h.change_type || 'cambio').replace(/_/g, ' '),
            descripcion: String(h.description || (h as any).notes || ''),
          } as ReportRow;
        });
      return {
        rows: applyCommonFilters(rows, filters),
        notes: [
          'El sistema no guarda un estado "refinanciado" ni "reestructurado": lo que sí consta es '
          + 'cada cambio hecho sobre el préstamo, que es lo que lista este reporte.',
        ],
      };
    },
  },
];
