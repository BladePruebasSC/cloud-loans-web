// ============================================================================
// El RESUMEN de Reportes y Análisis
// ============================================================================
// Los indicadores de la portada. Cada uno sale del mismo sitio que el reporte al que lleva, así
// que pulsar un número y ver su detalle no puede dar dos cifras distintas.
//
// Hay dos clases de indicador y la pantalla lo dice:
//   · DEL PERÍODO: lo que pasó entre las dos fechas (prestado, cobrado, gastos…).
//   · A HOY: la foto de este momento (cartera, mora, clientes activos), que no depende del
//     período elegido. Mezclarlas sin avisar es lo que hace que un reporte "no cuadre".

import { isActiveLoan } from '../portfolioMetrics';
import { arrearsLoans, computePar } from './builders/arrearsReports';
import { financialTotals } from './builders/financialReports';
import { dateOnly, round2, type ReportData } from './reportDataset';
import { inPeriod, previousPeriod, type Period } from './reportPeriods';
import type { ColumnFormat } from './reportTypes';

export interface DashboardKpi {
  key: string;
  label: string;
  value: number;
  format: ColumnFormat;
  /** Reporte que se abre al pulsarlo */
  linkTo?: string;
  hint?: string;
  /** Valor del mismo indicador en el período anterior (solo en los del período) */
  previous?: number;
  /** El indicador es una foto de HOY y no depende del período */
  asOfToday?: boolean;
}

export interface DashboardSection {
  title: string;
  subtitle: string;
  kpis: DashboardKpi[];
}

export const buildDashboard = (data: ReportData, period: Period): DashboardSection[] => {
  const anterior = previousPeriod(period);
  const act = financialTotals(data, period);
  const ant = financialTotals(data, anterior);

  const prestadoPeriodo = (p: Period) => round2(data.loans
    .filter(l => inPeriod(dateOnly(l.start_date || l.created_at), p))
    .reduce((s, l) => s + (Number(l.amount) || 0), 0));
  const prestamosPeriodo = (p: Period) => data.loans
    .filter(l => inPeriod(dateOnly(l.start_date || l.created_at), p)).length;
  const clientesNuevos = (p: Period) => data.clients
    .filter(c => inPeriod(dateOnly(c.created_at), p)).length;

  const activos = data.loans.filter(l => isActiveLoan(l.status));
  const saldo = round2(activos.reduce(
    (s, l) => s + (data.balanceByLoan.get(l.id) ?? l.remaining_balance ?? 0), 0));
  const morosos = arrearsLoans(data);
  const vencido = round2(morosos.reduce((s, m) => s + m.vencido, 0));
  const moraPendiente = round2(morosos.reduce((s, m) => s + m.mora, 0));
  const par = computePar(data);
  const par30 = par.find(p => p.dias === 30)?.porcentaje || 0;
  const clientesConActivo = new Set(activos.map(l => l.client_id)).size;

  return [
    {
      title: 'Del período',
      subtitle: 'Lo que pasó entre las fechas elegidas, con el período anterior al lado',
      kpis: [
        {
          key: 'prestado', label: 'Capital prestado', value: prestadoPeriodo(period), format: 'money',
          previous: prestadoPeriodo(anterior), linkTo: 'loans-placed',
          hint: `${prestamosPeriodo(period)} préstamo(s) desembolsado(s)`,
        },
        {
          key: 'cobrado', label: 'Total cobrado', value: act.entradas, format: 'money',
          previous: ant.entradas, linkTo: 'payments-received',
          hint: 'Cobros, abonos y ventas, menos descuentos',
        },
        {
          key: 'capital', label: 'Capital recuperado', value: round2(act.capitalCobrado + act.abonos),
          format: 'money', previous: round2(ant.capitalCobrado + ant.abonos), linkTo: 'payments-received',
        },
        {
          key: 'interes', label: 'Interés cobrado', value: act.interes, format: 'money',
          previous: ant.interes, linkTo: 'fin-interest',
        },
        {
          key: 'mora', label: 'Mora cobrada', value: act.mora, format: 'money',
          previous: ant.mora, linkTo: 'arrears-recovery',
        },
        {
          key: 'ventas', label: 'Ventas', value: act.ventas, format: 'money',
          previous: ant.ventas, linkTo: 'sales-detail',
        },
        {
          key: 'gastos', label: 'Gastos', value: act.gastos, format: 'money',
          previous: ant.gastos, linkTo: 'expenses-detail',
        },
        {
          key: 'resultado', label: 'Resultado', value: act.resultado, format: 'money',
          previous: ant.resultado, linkTo: 'fin-summary',
          hint: 'Ingreso operativo menos gastos',
        },
        {
          key: 'clientesNuevos', label: 'Clientes nuevos', value: clientesNuevos(period), format: 'number',
          previous: clientesNuevos(anterior), linkTo: 'clients-registered',
        },
      ],
    },
    {
      title: 'A hoy',
      subtitle: 'La foto de este momento: no depende del período elegido',
      kpis: [
        {
          key: 'cartera', label: 'Saldo por cobrar', value: saldo, format: 'money',
          linkTo: 'loans-active', asOfToday: true, hint: `${activos.length} préstamo(s) activo(s)`,
        },
        {
          key: 'activos', label: 'Préstamos activos', value: activos.length, format: 'number',
          linkTo: 'loans-active', asOfToday: true,
        },
        {
          key: 'vencidos', label: 'Préstamos vencidos', value: morosos.length, format: 'number',
          linkTo: 'loans-overdue', asOfToday: true,
        },
        {
          key: 'vencido', label: 'Monto vencido', value: vencido, format: 'money',
          linkTo: 'arrears-portfolio', asOfToday: true,
        },
        {
          key: 'moraPendiente', label: 'Mora pendiente', value: moraPendiente, format: 'money',
          linkTo: 'arrears-portfolio', asOfToday: true,
        },
        {
          key: 'par30', label: 'PAR 30', value: par30, format: 'percent',
          linkTo: 'arrears-aging', asOfToday: true, hint: 'Saldo con más de 30 días de atraso',
        },
        {
          key: 'clientesActivos', label: 'Clientes con préstamo', value: clientesConActivo, format: 'number',
          linkTo: 'clients-portfolio', asOfToday: true,
        },
        {
          key: 'morosos', label: 'Clientes morosos', value: new Set(morosos.map(m => m.clientId)).size,
          format: 'number', linkTo: 'arrears-clients', asOfToday: true,
        },
        {
          key: 'porAprobar', label: 'Préstamos por aprobar', value: data.awaitingApprovalCount,
          format: 'number', asOfToday: true, hint: 'No entran en ninguna cifra hasta aprobarse',
        },
      ],
    },
  ];
};

/** Series para los gráficos de la portada, con los datos del período. */
export const dashboardSeries = (data: ReportData, period: Period) => {
  const meses = new Set<string>();
  for (const p of data.payments) {
    const d = dateOnly(p.payment_date);
    if (inPeriod(d, period)) meses.add(d.slice(0, 7));
  }
  for (const l of data.loans) {
    const d = dateOnly(l.start_date || l.created_at);
    if (inPeriod(d, period)) meses.add(d.slice(0, 7));
  }
  const ordenados = [...meses].sort();
  // Con un período corto (un día, una semana) una serie mensual no dice nada: se usa el día.
  const porDia = ordenados.length <= 1;

  const claves = new Set<string>();
  const añadir = (iso: string) => {
    const d = dateOnly(iso);
    if (!inPeriod(d, period)) return;
    claves.add(porDia ? d : d.slice(0, 7));
  };
  data.payments.forEach(p => añadir(String(p.payment_date || '')));
  data.loans.forEach(l => añadir(String(l.start_date || l.created_at || '')));

  return [...claves].sort().map(clave => {
    const rango = porDia
      ? { startDate: clave, endDate: clave }
      : { startDate: `${clave}-01`, endDate: `${clave}-31` };
    const t = financialTotals(data, {
      startDate: rango.startDate < period.startDate ? period.startDate : rango.startDate,
      endDate: rango.endDate > period.endDate ? period.endDate : rango.endDate,
    });
    return {
      periodo: clave,
      cobrado: round2(t.capitalCobrado + t.interes + t.cargos + t.mora - t.descuentos),
      prestado: t.desembolsos,
      gastos: t.gastos,
      interes: t.interes,
    };
  });
};
