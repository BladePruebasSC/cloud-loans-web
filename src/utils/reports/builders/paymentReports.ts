// ============================================================================
// Reportes de PAGOS y COBRANZAS
// ============================================================================
// El desglose de cada cobro sigue las mismas reglas que el resto del sistema:
//   · un pago a un CARGO lleva capital y no lleva interés (`isChargePayment`);
//   · en un INDEFINIDO la cuota es interés puro, así que un pago sin desglose es interés
//     (ver `loanPaidTotals.ts`, del fallo del 2026-10-01);
//   · el EFECTIVO recibido es lo acreditado + la mora − el descuento (`paymentDiscount.ts`).

import type { LoanLike, PaymentLike } from '../../portfolioMetrics';
import { isChargePayment, paymentGross } from '../../chargeAwarePayments';
import { paymentCashReceived } from '../../paymentDiscount';
import {
  PAYMENT_METHOD_LABEL, clientNameOf, dateOnly, indexLoans, labelFor, round2, userNameOf,
  type CoreDataset,
} from '../reportDataset';
import { inPeriod } from '../reportPeriods';
import { applyCommonFilters, groupRows } from '../reportFilters';
import type { ReportBuildContext, ReportDefinition, ReportResult, ReportRow } from '../reportTypes';

export interface PaymentBreakdown {
  bruto: number;
  capital: number;
  interes: number;
  cargo: number;
  mora: number;
  descuento: number;
  efectivo: number;
  /** El pago se guardó sin desglose y hubo que deducirlo */
  sinDesglose: boolean;
}

/** Cómo se reparte un cobro entre capital, interés, cargo y mora. */
export const breakdownOf = (p: PaymentLike & { discount_amount?: number | null }, loan?: LoanLike): PaymentBreakdown => {
  const bruto = paymentGross(p as any);
  const mora = round2((p as any).late_fee);
  const descuento = round2((p as any).discount_amount);
  const efectivo = paymentCashReceived(p as any);
  const principal = round2(p.principal_amount);
  const interes = round2(p.interest_amount);
  const esIndefinido = String(loan?.amortization_type || '').toLowerCase() === 'indefinite';

  if (isChargePayment(p as any)) {
    return { bruto, capital: 0, interes: 0, cargo: bruto, mora, descuento, efectivo, sinDesglose: false };
  }
  if (principal > 0.005 || interes > 0.005) {
    return { bruto, capital: principal, interes, cargo: 0, mora, descuento, efectivo, sinDesglose: false };
  }
  // Sin desglose guardado.
  return esIndefinido
    ? { bruto, capital: 0, interes: bruto, cargo: 0, mora, descuento, efectivo, sinDesglose: true }
    : { bruto, capital: bruto, interes: 0, cargo: 0, mora, descuento, efectivo, sinDesglose: true };
};

const PAYMENT_COLUMNS = [
  { key: 'fecha', label: 'Fecha', format: 'date' as const },
  { key: 'cliente', label: 'Cliente', align: 'left' as const },
  { key: 'dni', label: 'Cédula', align: 'left' as const, hiddenByDefault: true },
  { key: 'capital', label: 'Capital', format: 'money' as const, total: true },
  { key: 'interes', label: 'Interés', format: 'money' as const, total: true },
  { key: 'cargo', label: 'Cargos', format: 'money' as const, total: true },
  { key: 'mora', label: 'Mora', format: 'money' as const, total: true },
  { key: 'descuento', label: 'Descuento', format: 'money' as const, total: true },
  { key: 'efectivo', label: 'Recibido', format: 'money' as const, total: true },
  { key: 'metodo', label: 'Método', align: 'left' as const },
  { key: 'usuario', label: 'Registró', align: 'left' as const },
  { key: 'referencia', label: 'Referencia', align: 'left' as const, hiddenByDefault: true },
];

/** Los pagos del período, ya filtrados, con su préstamo y su desglose. */
const paymentsInPeriod = (ctx: ReportBuildContext<CoreDataset>) => {
  const { data: core, filters } = ctx;
  const loans = indexLoans(core);
  return core.payments
    .filter(p => inPeriod(dateOnly(p.payment_date), filters))
    .filter(p => !filters.userId || p.created_by === filters.userId)
    .filter(p => !filters.clientId || loans.get(p.loan_id)?.client_id === filters.clientId)
    .filter(p => !filters.paymentMethod
      || String((p as any).payment_method || 'cash').toLowerCase() === filters.paymentMethod)
    .map(p => ({ payment: p, loan: loans.get(p.loan_id), breakdown: breakdownOf(p as any, loans.get(p.loan_id)) }));
};

const paymentRow = (
  item: { payment: PaymentLike; loan?: LoanLike; breakdown: PaymentBreakdown },
  core: CoreDataset,
): ReportRow => ({
  _id: item.payment.id,
  _loanId: item.payment.loan_id,
  _clientId: item.loan?.client_id,
  fecha: dateOnly(item.payment.payment_date),
  cliente: item.loan ? clientNameOf(item.loan, core) : 'Préstamo eliminado',
  dni: item.loan?.client?.dni || '',
  capital: item.breakdown.capital,
  interes: item.breakdown.interes,
  cargo: item.breakdown.cargo,
  mora: item.breakdown.mora,
  descuento: item.breakdown.descuento,
  efectivo: item.breakdown.efectivo,
  metodo: labelFor(PAYMENT_METHOD_LABEL, (item.payment as any).payment_method || 'cash'),
  usuario: userNameOf(core, item.payment.created_by),
  referencia: String((item.payment as any).reference_number || ''),
});

const totalsOf = (rows: ReportRow[], keys: string[]): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const k of keys) out[k] = round2(rows.reduce((s, r) => s + (Number(r[k]) || 0), 0));
  return out;
};

export const paymentReports: ReportDefinition<CoreDataset>[] = [
  {
    id: 'payments-received',
    name: 'Pagos recibidos',
    category: 'pagos',
    description: 'Cada cobro del período con su desglose: capital, interés, cargos, mora y descuento.',
    permission: 'reports.view',
    dataset: 'core',
    columns: PAYMENT_COLUMNS,
    filters: ['search', 'clientId', 'userId', 'paymentMethod', 'minAmount', 'maxAmount'],
    defaultSort: { key: 'fecha', dir: 'desc' },
    keywords: ['cobros', 'recaudación', 'ingresos de préstamos', 'recibos'],
    build: ctx => {
      const items = paymentsInPeriod(ctx);
      const rows = applyCommonFilters(items.map(i => paymentRow(i, ctx.data)), ctx.filters, 'efectivo');
      const t = totalsOf(rows, ['capital', 'interes', 'cargo', 'mora', 'descuento', 'efectivo']);
      const sinDesglose = items.filter(i => i.breakdown.sinDesglose).length;
      const notes: string[] = [];
      if (sinDesglose > 0) {
        notes.push(
          `${sinDesglose} pago(s) se guardaron sin desglose (capital 0 e interés 0). En los préstamos `
          + 'indefinidos se cuentan como interés, que es de lo que vive la cuota; en los de plazo fijo, '
          + 'como capital. La migración 20261001000000 deja ese desglose escrito en la base.',
        );
      }
      return {
        rows,
        totals: t,
        notes,
        kpis: [
          { key: 'cantidad', label: 'Cobros', value: rows.length, format: 'number' },
          { key: 'efectivo', label: 'Total recibido', value: t.efectivo, format: 'money' },
          { key: 'capital', label: 'Capital cobrado', value: t.capital, format: 'money' },
          { key: 'interes', label: 'Interés cobrado', value: t.interes, format: 'money' },
          { key: 'mora', label: 'Mora cobrada', value: t.mora, format: 'money' },
        ],
      };
    },
  },

  {
    id: 'payments-by-day',
    name: 'Recaudación por día',
    category: 'pagos',
    description: 'Cuánto entró cada día del período y de qué: capital, interés, cargos y mora.',
    permission: 'reports.view',
    dataset: 'core',
    columns: [
      { key: 'fecha', label: 'Día', format: 'date' },
      { key: 'cobros', label: 'Cobros', format: 'number', total: true },
      { key: 'capital', label: 'Capital', format: 'money', total: true },
      { key: 'interes', label: 'Interés', format: 'money', total: true },
      { key: 'cargo', label: 'Cargos', format: 'money', total: true },
      { key: 'mora', label: 'Mora', format: 'money', total: true },
      { key: 'efectivo', label: 'Recibido', format: 'money', total: true },
    ],
    filters: ['userId', 'paymentMethod'],
    defaultSort: { key: 'fecha', dir: 'asc' },
    keywords: ['diaria', 'por día', 'caja diaria', 'recaudación'],
    build: ctx => {
      const items = paymentsInPeriod(ctx);
      const grupos = groupRows(items, i => dateOnly(i.payment.payment_date));
      const rows: ReportRow[] = [...grupos.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([fecha, lista]) => ({
          _id: fecha,
          fecha,
          cobros: lista.length,
          capital: round2(lista.reduce((s, i) => s + i.breakdown.capital, 0)),
          interes: round2(lista.reduce((s, i) => s + i.breakdown.interes, 0)),
          cargo: round2(lista.reduce((s, i) => s + i.breakdown.cargo, 0)),
          mora: round2(lista.reduce((s, i) => s + i.breakdown.mora, 0)),
          efectivo: round2(lista.reduce((s, i) => s + i.breakdown.efectivo, 0)),
        }));
      return {
        rows,
        charts: [{
          kind: 'bar', title: 'Recaudación diaria', xKey: 'fecha',
          series: [
            { key: 'capital', label: 'Capital' },
            { key: 'interes', label: 'Interés' },
            { key: 'mora', label: 'Mora' },
          ],
          money: true,
        }],
      };
    },
  },

  {
    id: 'payments-by-month',
    name: 'Recaudación mensual',
    category: 'pagos',
    description: 'Lo cobrado mes a mes dentro del período elegido.',
    permission: 'reports.view',
    dataset: 'core',
    columns: [
      { key: 'mes', label: 'Mes', align: 'left' },
      { key: 'cobros', label: 'Cobros', format: 'number', total: true },
      { key: 'capital', label: 'Capital', format: 'money', total: true },
      { key: 'interes', label: 'Interés', format: 'money', total: true },
      { key: 'mora', label: 'Mora', format: 'money', total: true },
      { key: 'efectivo', label: 'Recibido', format: 'money', total: true },
    ],
    filters: ['userId'],
    defaultSort: { key: 'mes', dir: 'asc' },
    keywords: ['mensual', 'por mes', 'tendencia'],
    build: ctx => {
      const items = paymentsInPeriod(ctx);
      const grupos = groupRows(items, i => dateOnly(i.payment.payment_date).slice(0, 7));
      const rows: ReportRow[] = [...grupos.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([mes, lista]) => ({
          _id: mes,
          mes,
          cobros: lista.length,
          capital: round2(lista.reduce((s, i) => s + i.breakdown.capital, 0)),
          interes: round2(lista.reduce((s, i) => s + i.breakdown.interes, 0)),
          mora: round2(lista.reduce((s, i) => s + i.breakdown.mora, 0)),
          efectivo: round2(lista.reduce((s, i) => s + i.breakdown.efectivo, 0)),
        }));
      return {
        rows,
        charts: [{
          kind: 'line', title: 'Evolución de la recaudación', xKey: 'mes',
          series: [{ key: 'efectivo', label: 'Recibido' }, { key: 'interes', label: 'Interés' }],
          money: true,
        }],
      };
    },
  },

  {
    id: 'payments-by-client',
    name: 'Pagos por cliente',
    category: 'pagos',
    description: 'Cuánto pagó cada cliente en el período y cuándo fue su último cobro.',
    permission: 'reports.view',
    dataset: 'core',
    columns: [
      { key: 'cliente', label: 'Cliente', align: 'left' },
      { key: 'dni', label: 'Cédula', align: 'left' },
      { key: 'cobros', label: 'Cobros', format: 'number', total: true },
      { key: 'capital', label: 'Capital', format: 'money', total: true },
      { key: 'interes', label: 'Interés', format: 'money', total: true },
      { key: 'mora', label: 'Mora', format: 'money', total: true },
      { key: 'efectivo', label: 'Total pagado', format: 'money', total: true },
      { key: 'ultimoPago', label: 'Último pago', format: 'date' },
    ],
    filters: ['search', 'userId', 'minAmount', 'maxAmount'],
    defaultSort: { key: 'efectivo', dir: 'desc' },
    keywords: ['cliente', 'quién pagó', 'mejores clientes'],
    build: ctx => {
      const items = paymentsInPeriod(ctx);
      const grupos = groupRows(items, i => i.loan?.client_id || 'sin-cliente');
      const rows: ReportRow[] = [...grupos.entries()].map(([clientId, lista]) => ({
        _id: clientId,
        _clientId: clientId === 'sin-cliente' ? undefined : clientId,
        cliente: lista[0].loan ? clientNameOf(lista[0].loan, ctx.data) : 'Préstamo eliminado',
        dni: lista[0].loan?.client?.dni || '',
        cobros: lista.length,
        capital: round2(lista.reduce((s, i) => s + i.breakdown.capital, 0)),
        interes: round2(lista.reduce((s, i) => s + i.breakdown.interes, 0)),
        mora: round2(lista.reduce((s, i) => s + i.breakdown.mora, 0)),
        efectivo: round2(lista.reduce((s, i) => s + i.breakdown.efectivo, 0)),
        ultimoPago: lista.map(i => dateOnly(i.payment.payment_date)).sort().slice(-1)[0] || '',
      }));
      return { rows: applyCommonFilters(rows, ctx.filters, 'efectivo') };
    },
  },

  {
    id: 'payments-by-user',
    name: 'Cobranza por usuario',
    category: 'cobranzas',
    description: 'Cuánto cobró cada usuario del sistema, con su desglose y sus gestiones.',
    permission: 'reports.view',
    dataset: 'core',
    columns: [
      { key: 'usuario', label: 'Usuario', align: 'left' },
      { key: 'cobros', label: 'Cobros', format: 'number', total: true },
      { key: 'clientes', label: 'Clientes', format: 'number', total: true },
      { key: 'capital', label: 'Capital', format: 'money', total: true },
      { key: 'interes', label: 'Interés', format: 'money', total: true },
      { key: 'mora', label: 'Mora', format: 'money', total: true },
      { key: 'efectivo', label: 'Total cobrado', format: 'money', total: true },
      { key: 'gestiones', label: 'Gestiones', format: 'number', total: true },
    ],
    filters: ['search'],
    defaultSort: { key: 'efectivo', dir: 'desc' },
    keywords: ['cobrador', 'empleado', 'productividad', 'quién cobró'],
    build: ctx => {
      const { data: core, filters } = ctx;
      const items = paymentsInPeriod(ctx);
      const gestionesPorUsuario = new Map<string, number>();
      for (const t of core.tracking) {
        if (!inPeriod(dateOnly(t.contact_date), filters)) continue;
        const key = String((t as any).created_by || '');
        gestionesPorUsuario.set(key, (gestionesPorUsuario.get(key) || 0) + 1);
      }
      const grupos = groupRows(items, i => String(i.payment.created_by || ''));
      const rows: ReportRow[] = [...grupos.entries()].map(([userId, lista]) => ({
        _id: userId || 'sin-usuario',
        usuario: userNameOf(core, userId),
        cobros: lista.length,
        clientes: new Set(lista.map(i => i.loan?.client_id).filter(Boolean)).size,
        capital: round2(lista.reduce((s, i) => s + i.breakdown.capital, 0)),
        interes: round2(lista.reduce((s, i) => s + i.breakdown.interes, 0)),
        mora: round2(lista.reduce((s, i) => s + i.breakdown.mora, 0)),
        efectivo: round2(lista.reduce((s, i) => s + i.breakdown.efectivo, 0)),
        gestiones: gestionesPorUsuario.get(userId) || 0,
      }));
      return {
        rows: applyCommonFilters(rows, filters, 'efectivo'),
        notes: [
          'El sistema no asigna un cobrador a cada préstamo (`loan_officer_id` identifica a la '
          + 'empresa, no a la persona). Esta es la cobranza por el usuario que REGISTRÓ cada pago, '
          + 'que es el dato real que se guarda.',
        ],
        charts: [{
          kind: 'bar', title: 'Cobrado por usuario', xKey: 'usuario',
          series: [{ key: 'efectivo', label: 'Cobrado' }], money: true,
        }],
      };
    },
  },

  {
    id: 'payments-by-method',
    name: 'Pagos por método',
    category: 'pagos',
    description: 'Cómo paga la gente: efectivo, transferencia, tarjeta, cheque.',
    permission: 'reports.view',
    dataset: 'core',
    columns: [
      { key: 'metodo', label: 'Método', align: 'left' },
      { key: 'cobros', label: 'Cobros', format: 'number', total: true },
      { key: 'efectivo', label: 'Monto', format: 'money', total: true },
      { key: 'participacion', label: '% del total', format: 'percent' },
    ],
    filters: ['userId'],
    defaultSort: { key: 'efectivo', dir: 'desc' },
    keywords: ['método de pago', 'efectivo', 'transferencia'],
    build: ctx => {
      const items = paymentsInPeriod(ctx);
      const total = round2(items.reduce((s, i) => s + i.breakdown.efectivo, 0));
      const grupos = groupRows(items, i =>
        labelFor(PAYMENT_METHOD_LABEL, (i.payment as any).payment_method || 'cash'));
      const rows: ReportRow[] = [...grupos.entries()].map(([metodo, lista]) => {
        const monto = round2(lista.reduce((s, i) => s + i.breakdown.efectivo, 0));
        return {
          _id: metodo,
          metodo,
          cobros: lista.length,
          efectivo: monto,
          participacion: total > 0 ? Math.round((monto / total) * 1000) / 10 : 0,
        };
      });
      return {
        rows,
        charts: [{
          kind: 'pie', title: 'Reparto por método de pago', xKey: 'metodo',
          series: [{ key: 'efectivo', label: 'Monto' }], money: true,
        }],
      };
    },
  },

  {
    id: 'capital-payments',
    name: 'Abonos a capital',
    category: 'pagos',
    description: 'Abonos directos al capital, con el capital antes y después y su penalidad.',
    permission: 'reports.view',
    dataset: 'core',
    columns: [
      { key: 'fecha', label: 'Fecha', format: 'date' },
      { key: 'cliente', label: 'Cliente', align: 'left' },
      { key: 'monto', label: 'Abono', format: 'money', total: true },
      { key: 'capitalAntes', label: 'Capital antes', format: 'money' },
      { key: 'capitalDespues', label: 'Capital después', format: 'money' },
      { key: 'penalidad', label: 'Penalidad', format: 'money', total: true },
    ],
    filters: ['search', 'clientId', 'minAmount', 'maxAmount'],
    defaultSort: { key: 'fecha', dir: 'desc' },
    keywords: ['abono', 'capital', 'prepago', 'adelanto'],
    build: ctx => {
      const { data: core, filters } = ctx;
      const loans = indexLoans(core);
      const penalidadPorAbono = new Map<string, number>();
      for (const p of core.penalties) {
        const id = String((p as any).capital_payment_id || '');
        if (id) penalidadPorAbono.set(id, round2((penalidadPorAbono.get(id) || 0) + Number(p.amount || 0)));
      }
      const rows = core.capitalPayments
        .filter(cp => inPeriod(dateOnly(cp.created_at), filters))
        .filter(cp => !filters.clientId || loans.get(cp.loan_id)?.client_id === filters.clientId)
        .map(cp => {
          const loan = loans.get(cp.loan_id);
          return {
            _id: cp.id,
            _loanId: cp.loan_id,
            _clientId: loan?.client_id,
            fecha: dateOnly(cp.created_at),
            cliente: loan ? clientNameOf(loan, core) : 'Préstamo eliminado',
            monto: round2(cp.amount),
            capitalAntes: round2((cp as any).capital_before),
            capitalDespues: round2((cp as any).capital_after),
            penalidad: penalidadPorAbono.get(cp.id) || 0,
          } as ReportRow;
        });
      const filtradas = applyCommonFilters(rows, filters, 'monto');
      return {
        rows: filtradas,
        kpis: [
          { key: 'cantidad', label: 'Abonos', value: filtradas.length, format: 'number' },
          {
            key: 'monto', label: 'Capital abonado', format: 'money',
            value: round2(filtradas.reduce((s, r) => s + (Number(r.monto) || 0), 0)),
          },
          {
            key: 'penalidad', label: 'Penalidad cobrada', format: 'money',
            value: round2(filtradas.reduce((s, r) => s + (Number(r.penalidad) || 0), 0)),
          },
        ],
      };
    },
  },

  {
    id: 'collection-tracking',
    name: 'Gestiones de cobro',
    category: 'cobranzas',
    description: 'Llamadas, visitas y mensajes registrados, con la respuesta del cliente.',
    permission: 'reports.view',
    dataset: 'core',
    columns: [
      { key: 'fecha', label: 'Fecha', format: 'date' },
      { key: 'hora', label: 'Hora', align: 'left' },
      { key: 'cliente', label: 'Cliente', align: 'left' },
      { key: 'tipo', label: 'Tipo de contacto', align: 'left' },
      { key: 'respuesta', label: 'Respuesta', align: 'left', width: 50 },
      { key: 'proximo', label: 'Próximo contacto', format: 'date' },
      { key: 'usuario', label: 'Registró', align: 'left' },
    ],
    filters: ['search', 'clientId', 'userId'],
    defaultSort: { key: 'fecha', dir: 'desc' },
    keywords: ['seguimiento', 'gestión', 'contacto', 'llamada', 'visita'],
    build: ctx => {
      const { data: core, filters } = ctx;
      const loans = indexLoans(core);
      const rows = core.tracking
        .filter(t => inPeriod(dateOnly(t.contact_date), filters))
        .filter(t => !filters.userId || String((t as any).created_by || '') === filters.userId)
        .filter(t => !filters.clientId || loans.get(t.loan_id)?.client_id === filters.clientId)
        .map(t => {
          const loan = loans.get(t.loan_id);
          return {
            _id: t.id,
            _loanId: t.loan_id,
            _clientId: loan?.client_id,
            fecha: dateOnly(t.contact_date),
            hora: String(t.contact_time || '').slice(0, 5),
            cliente: loan ? clientNameOf(loan, core) : 'Préstamo eliminado',
            tipo: String(t.contact_type || '').replace(/_/g, ' '),
            respuesta: String(t.client_response || (t as any).result || ''),
            proximo: dateOnly(t.next_contact_date),
            usuario: userNameOf(core, (t as any).created_by),
          } as ReportRow;
        });
      return { rows: applyCommonFilters(rows, filters) };
    },
  },
];
