// ============================================================================
// Reportes FINANCIEROS
// ============================================================================
// CÓMO SE MIDE LA GANANCIA (punto 9 del pedido: "no mostrar ganancia como intereses − gastos si
// la estructura real permite calcularla mejor").
//
// En un negocio de préstamos hay que separar DOS cosas que no son lo mismo:
//
//   · CAJA: lo que entra y sale. Entra el capital que devuelve el cliente, el interés, la mora,
//     los cargos, los abonos y las ventas; sale el dinero que se desembolsa en préstamos nuevos
//     y los gastos. Esto contesta "¿cuánto dinero se movió?".
//
//   · RESULTADO: lo que de verdad se gana. El capital que vuelve NO es ganancia (es dinero que
//     ya era de la empresa) y el desembolso de un préstamo NO es un gasto (es la misma plata
//     cambiada de sitio). El ingreso real es el interés, la mora, los cargos, las penalidades y
//     lo que deje el punto de venta; el gasto real son los gastos registrados.
//
// Las dos cosas se enseñan, separadas y explicadas, en vez de una sola cifra engañosa.

import { getSaleAmount } from '../../portfolioMetrics';
import { PENALTY_SOURCE_LABEL } from '../../loanPenalties';
import { clientNameOf, dateOnly, indexLoans, round2, type ReportData } from '../reportDataset';
import { inPeriod, previousPeriod } from '../reportPeriods';
import { applyCommonFilters, groupRows } from '../reportFilters';
import type { ReportDefinition, ReportRow } from '../reportTypes';
import { breakdownOf } from './paymentReports';

interface FinancialTotals {
  capitalCobrado: number;
  interes: number;
  mora: number;
  cargos: number;
  descuentos: number;
  abonos: number;
  penalidades: number;
  ventas: number;
  gastos: number;
  desembolsos: number;
  /** Entradas de caja */
  entradas: number;
  /** Salidas de caja */
  salidas: number;
  /** Entradas − salidas */
  flujoNeto: number;
  /** Ingreso real del negocio (sin el capital que vuelve) */
  ingresoOperativo: number;
  /** Ingreso operativo − gastos */
  resultado: number;
}

/** Las cifras del período, con las mismas reglas de desglose que el resto del sistema. */
export const financialTotals = (
  data: ReportData,
  period: { startDate: string; endDate: string },
): FinancialTotals => {
  const loans = indexLoans(data);
  let capitalCobrado = 0; let interes = 0; let mora = 0; let cargos = 0; let descuentos = 0;

  for (const p of data.payments) {
    if (!inPeriod(dateOnly(p.payment_date), period)) continue;
    const b = breakdownOf(p as any, loans.get(p.loan_id));
    capitalCobrado += b.capital;
    interes += b.interes;
    cargos += b.cargo;
    mora += b.mora;
    descuentos += b.descuento;
  }

  const abonos = data.capitalPayments
    .filter(c => inPeriod(dateOnly(c.created_at), period))
    .reduce((s, c) => s + (Number(c.amount) || 0), 0);

  const penalidades = (data.penalties || [])
    .filter(p => inPeriod(dateOnly((p as any).created_at), period))
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);

  const ventas = (data.sales || [])
    .filter(s => inPeriod(dateOnly((s as any).sale_date || (s as any).created_at), period))
    .reduce((s, v) => s + getSaleAmount(v), 0);

  const gastos = (data.expenses?.rows || [])
    .filter(e => inPeriod(dateOnly(e.expense_date), period))
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);

  const desembolsos = data.loans
    .filter(l => inPeriod(dateOnly(l.start_date || l.created_at), period))
    .reduce((s, l) => s + (Number(l.amount) || 0), 0);

  // El descuento no entró en la caja: se perdonó. Por eso se resta de las entradas.
  //
  // Las PENALIDADES sí entraron (2026-11-02): el abono a capital trae el capital y la penalidad
  // es lo que el cliente paga de más por abonar. Estaban en el ingreso operativo pero no en las
  // entradas de caja, así que el flujo neto se quedaba corto por ese importe.
  const entradas = round2(
    capitalCobrado + interes + cargos + mora + abonos + penalidades + ventas - descuentos,
  );
  const salidas = round2(gastos + desembolsos);
  const ingresoOperativo = round2(interes + cargos + mora + penalidades + ventas - descuentos);

  return {
    capitalCobrado: round2(capitalCobrado),
    interes: round2(interes),
    mora: round2(mora),
    cargos: round2(cargos),
    descuentos: round2(descuentos),
    abonos: round2(abonos),
    penalidades: round2(penalidades),
    ventas: round2(ventas),
    gastos: round2(gastos),
    desembolsos: round2(desembolsos),
    entradas,
    salidas,
    flujoNeto: round2(entradas - salidas),
    ingresoOperativo,
    resultado: round2(ingresoOperativo - gastos),
  };
};

export const financialReports: ReportDefinition<ReportData>[] = [
  {
    id: 'fin-summary',
    name: 'Resumen financiero',
    category: 'financiero',
    description: 'Entradas, salidas, ingreso real y resultado del período, con el período anterior al lado.',
    permission: 'reports.financial',
    dataset: ['expenses'],
    columns: [
      { key: 'concepto', label: 'Concepto', align: 'left' },
      { key: 'monto', label: 'Período', format: 'money', total: false },
      { key: 'anterior', label: 'Período anterior', format: 'money' },
      { key: 'variacion', label: 'Variación', format: 'money' },
      { key: 'nota', label: 'Qué es', align: 'left', width: 60 },
    ],
    filters: [],
    keywords: ['ganancia', 'resultado', 'ingresos', 'egresos', 'utilidad', 'estado financiero'],
    build: ctx => {
      const { data, filters } = ctx;
      const actual = financialTotals(data, filters);
      const anterior = financialTotals(data, previousPeriod(filters));
      const fila = (concepto: string, key: keyof FinancialTotals, nota: string): ReportRow => ({
        _id: key,
        concepto,
        monto: actual[key],
        anterior: anterior[key],
        variacion: round2(actual[key] - anterior[key]),
        nota,
      });

      const rows: ReportRow[] = [
        fila('Capital cobrado', 'capitalCobrado', 'Dinero prestado que volvió. Entra en caja, pero no es ganancia.'),
        fila('Abonos a capital', 'abonos', 'Adelantos al capital. Tampoco son ganancia.'),
        fila('Interés cobrado', 'interes', 'INGRESO: lo que cobra el negocio por prestar.'),
        fila('Mora cobrada', 'mora', 'INGRESO: penalidad por atraso ya cobrada.'),
        fila('Cargos cobrados', 'cargos', 'INGRESO: cargos y comisiones cobrados con las cuotas.'),
        fila('Penalidades cobradas', 'penalidades', 'INGRESO: lo que paga el cliente por abonar a capital. Entra en caja como el interés.'),
        fila('Ventas (punto de venta)', 'ventas', 'INGRESO bruto del punto de venta, con ITBIS incluido.'),
        fila('Descuentos otorgados', 'descuentos', 'Dinero perdonado en los cobros: nunca entró en la caja.'),
        fila('Gastos', 'gastos', 'EGRESO: gastos registrados en el período.'),
        fila('Préstamos desembolsados', 'desembolsos', 'Salida de caja, no es un gasto: es capital colocado.'),
        fila('= Entradas de caja', 'entradas', 'Todo lo que entró, descontando lo perdonado.'),
        fila('= Salidas de caja', 'salidas', 'Gastos + capital desembolsado.'),
        fila('= Flujo neto de caja', 'flujoNeto', 'Entradas − salidas: cuánto dinero quedó.'),
        fila('= Ingreso operativo', 'ingresoOperativo', 'Interés + mora + cargos + penalidades + ventas.'),
        fila('= RESULTADO', 'resultado', 'Ingreso operativo − gastos. Esta es la ganancia del período.'),
      ];

      const notes = [
        'El capital que devuelve un cliente NO es ganancia y el desembolso de un préstamo NO es un '
        + 'gasto: por eso el resultado no es "todo lo que entró menos todo lo que salió".',
      ];
      if (!data.expenses) notes.push('Los gastos todavía se están cargando.');
      else if (!data.expenses.rows.length) notes.push('No hay gastos registrados en el período.');
      if (actual.ventas > 0) {
        notes.push('Las ventas entran por su importe bruto: el sistema no guarda el costo de la '
          + 'mercancía en cada venta, así que el margen del punto de venta no se puede calcular aquí.');
      }

      return {
        rows,
        notes,
        kpis: [
          { key: 'ingresoOperativo', label: 'Ingreso operativo', value: actual.ingresoOperativo, format: 'money', previous: anterior.ingresoOperativo },
          { key: 'gastos', label: 'Gastos', value: actual.gastos, format: 'money', previous: anterior.gastos, linkTo: 'expenses-detail' },
          { key: 'resultado', label: 'Resultado', value: actual.resultado, format: 'money', previous: anterior.resultado },
          { key: 'entradas', label: 'Entradas de caja', value: actual.entradas, format: 'money', previous: anterior.entradas },
          { key: 'flujoNeto', label: 'Flujo neto', value: actual.flujoNeto, format: 'money', previous: anterior.flujoNeto },
        ],
      };
    },
  },

  {
    id: 'fin-cashflow',
    name: 'Flujo de efectivo mensual',
    category: 'financiero',
    description: 'Mes a mes: lo que entró, lo que salió y lo que quedó.',
    permission: 'reports.financial',
    dataset: ['expenses'],
    columns: [
      { key: 'mes', label: 'Mes', align: 'left' },
      { key: 'cobros', label: 'Cobros', format: 'money', total: true },
      { key: 'abonos', label: 'Abonos', format: 'money', total: true },
      // La penalidad del abono a capital es dinero que entra: va en su columna y dentro de
      // "Entradas", para que la fila cuadre (2026-11-02).
      { key: 'penalidades', label: 'Penalidades', format: 'money', total: true },
      { key: 'ventas', label: 'Ventas', format: 'money', total: true },
      { key: 'entradas', label: 'Entradas', format: 'money', total: true },
      { key: 'gastos', label: 'Gastos', format: 'money', total: true },
      { key: 'desembolsos', label: 'Desembolsos', format: 'money', total: true },
      { key: 'flujo', label: 'Flujo neto', format: 'money', total: true },
    ],
    filters: [],
    defaultSort: { key: 'mes', dir: 'asc' },
    keywords: ['flujo', 'efectivo', 'caja', 'cashflow', 'mensual'],
    build: ctx => {
      const { data, filters } = ctx;
      const meses = new Set<string>();
      const add = (iso: string) => { const m = dateOnly(iso).slice(0, 7); if (m && inPeriod(dateOnly(iso), filters)) meses.add(m); };
      data.payments.forEach(p => add(String(p.payment_date || '')));
      data.capitalPayments.forEach(c => add(String(c.created_at || '')));
      (data.sales || []).forEach(s => add(String((s as any).sale_date || (s as any).created_at || '')));
      (data.expenses?.rows || []).forEach(e => add(String(e.expense_date || '')));
      data.loans.forEach(l => add(String(l.start_date || l.created_at || '')));

      const rows: ReportRow[] = [...meses].sort().map(mes => {
        const periodoMes = { startDate: `${mes}-01`, endDate: `${mes}-31` };
        const t = financialTotals(data, {
          startDate: periodoMes.startDate < filters.startDate ? filters.startDate : periodoMes.startDate,
          endDate: periodoMes.endDate > filters.endDate ? filters.endDate : periodoMes.endDate,
        });
        return {
          _id: mes,
          mes,
          cobros: round2(t.capitalCobrado + t.interes + t.cargos + t.mora - t.descuentos),
          abonos: t.abonos,
          penalidades: t.penalidades,
          ventas: t.ventas,
          entradas: t.entradas,
          gastos: t.gastos,
          desembolsos: t.desembolsos,
          flujo: t.flujoNeto,
        };
      });

      return {
        rows,
        charts: [{
          kind: 'bar', title: 'Entradas y salidas por mes', xKey: 'mes',
          series: [
            { key: 'entradas', label: 'Entradas' },
            { key: 'gastos', label: 'Gastos' },
            { key: 'desembolsos', label: 'Desembolsos' },
          ],
          money: true,
        }],
      };
    },
  },

  {
    id: 'fin-interest',
    name: 'Interés generado y cobrado',
    category: 'financiero',
    description: 'Cuánto interés se ha cobrado y cuánto queda por cobrar en la cartera viva.',
    permission: 'reports.financial',
    dataset: 'core',
    columns: [
      { key: 'mes', label: 'Mes', align: 'left' },
      { key: 'cobrado', label: 'Interés cobrado', format: 'money', total: true },
      { key: 'cargos', label: 'Cargos', format: 'money', total: true },
      { key: 'mora', label: 'Mora', format: 'money', total: true },
      { key: 'total', label: 'Total del mes', format: 'money', total: true },
    ],
    filters: [],
    defaultSort: { key: 'mes', dir: 'asc' },
    keywords: ['interés', 'rendimiento', 'ingresos financieros'],
    build: ctx => {
      const { data, filters } = ctx;
      const loans = indexLoans(data);
      const pagos = data.payments.filter(p => inPeriod(dateOnly(p.payment_date), filters));
      const grupos = groupRows(pagos, p => dateOnly(p.payment_date).slice(0, 7));
      const rows: ReportRow[] = [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([mes, lista]) => {
        const b = lista.map(p => breakdownOf(p as any, loans.get(p.loan_id)));
        const cobrado = round2(b.reduce((s, x) => s + x.interes, 0));
        const cargos = round2(b.reduce((s, x) => s + x.cargo, 0));
        const mora = round2(b.reduce((s, x) => s + x.mora, 0));
        return { _id: mes, mes, cobrado, cargos, mora, total: round2(cobrado + cargos + mora) };
      });

      // Interés pendiente de la cartera viva: balance − capital pendiente, préstamo a préstamo.
      let interesPendiente = 0;
      for (const loan of data.loans) {
        const balance = data.balanceByLoan.get(loan.id);
        if (balance === undefined) continue;
        const pagadoCapital = data.payments
          .filter(p => p.loan_id === loan.id)
          .reduce((s, p) => s + (Number(p.principal_amount) || 0), 0);
        const abonado = data.capitalPayments
          .filter(c => c.loan_id === loan.id)
          .reduce((s, c) => s + (Number(c.amount) || 0), 0);
        const capitalPendiente = Math.max(0, (Number(loan.amount) || 0) - pagadoCapital - abonado);
        interesPendiente += Math.max(0, balance - capitalPendiente);
      }

      return {
        rows,
        kpis: [
          {
            key: 'cobrado', label: 'Interés cobrado', format: 'money',
            value: round2(rows.reduce((s, r) => s + (Number(r.cobrado) || 0), 0)),
          },
          { key: 'pendiente', label: 'Interés por cobrar (cartera viva)', value: round2(interesPendiente), format: 'money' },
        ],
        charts: [{
          kind: 'line', title: 'Interés cobrado por mes', xKey: 'mes',
          series: [{ key: 'cobrado', label: 'Interés' }, { key: 'mora', label: 'Mora' }], money: true,
        }],
        notes: [
          'El interés por cobrar es el del saldo vivo de hoy. En los préstamos indefinidos el '
          + 'interés no tiene final: se cuenta solo el período que está corriendo.',
        ],
      };
    },
  },

  // CAMBIO SOLICITADO (2026-11-02): "la penalidad es dinero que entra a la empresa, represéntalo
  // como ingreso; que siga siendo penalidad pero se represente como un ingreso en los reportes".
  // Ya suma en el resumen financiero, en el flujo y en los ingresos del inicio; esto es el
  // detalle: de dónde salió cada peso de ese ingreso.
  {
    id: 'fin-penalties',
    name: 'Penalidades cobradas',
    category: 'financiero',
    description: 'Ingreso por penalidades: las que paga el cliente al abonar a capital, una por una.',
    permission: 'reports.financial',
    dataset: 'core',
    columns: [
      { key: 'fecha', label: 'Fecha', format: 'date' },
      { key: 'cliente', label: 'Cliente', align: 'left' },
      { key: 'base', label: 'Capital base', format: 'money' },
      { key: 'porcentaje', label: '%', format: 'percent' },
      { key: 'monto', label: 'Penalidad cobrada', format: 'money', total: true },
      { key: 'origen', label: 'Origen', align: 'left' },
    ],
    filters: ['search', 'clientId', 'minAmount', 'maxAmount'],
    defaultSort: { key: 'fecha', dir: 'desc' },
    keywords: ['penalidad', 'penalidades', 'ingreso por penalidades', 'abono a capital'],
    build: ctx => {
      const { data, filters } = ctx;
      const loans = indexLoans(data);
      const rows: ReportRow[] = (data.penalties || [])
        .filter(p => inPeriod(dateOnly((p as any).created_at), filters))
        .filter(p => !filters.clientId || loans.get(p.loan_id)?.client_id === filters.clientId)
        .map(p => {
          const loan = loans.get(p.loan_id);
          return {
            _id: p.id,
            _loanId: p.loan_id,
            _clientId: loan?.client_id,
            fecha: dateOnly((p as any).created_at),
            cliente: loan ? clientNameOf(loan, data) : 'Préstamo eliminado',
            base: p.base_amount === null || p.base_amount === undefined ? 0 : round2(p.base_amount),
            porcentaje: p.percentage === null || p.percentage === undefined ? 0 : Number(p.percentage),
            monto: round2(Number(p.amount) || 0),
            origen: PENALTY_SOURCE_LABEL[p.source] || 'Otra actualización',
          } as ReportRow;
        });

      const filtradas = applyCommonFilters(rows, filters, 'monto');
      const total = round2(filtradas.reduce((s, r) => s + (Number(r.monto) || 0), 0));
      const ingreso = financialTotals(data, filters).ingresoOperativo;

      return {
        rows: filtradas,
        kpis: [
          { key: 'monto', label: 'Penalidades cobradas', value: total, format: 'money' },
          { key: 'cantidad', label: 'Penalidades', value: filtradas.length, format: 'number' },
          {
            key: 'peso', label: '% del ingreso operativo', format: 'percent',
            value: ingreso > 0 ? round2((total / ingreso) * 100) : 0,
          },
        ],
        charts: filtradas.length > 1
          ? [{
              kind: 'bar' as const, title: 'Penalidades cobradas', xKey: 'fecha',
              series: [{ key: 'monto', label: 'Penalidad' }], money: true,
            }]
          : undefined,
        notes: [
          'La penalidad es INGRESO: la paga el cliente por abonar a capital, igual que el interés. '
          + 'El abono en sí no lo es, porque es capital que vuelve.',
        ],
      };
    },
  },
];
