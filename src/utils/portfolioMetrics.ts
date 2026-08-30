// ============================================================================
// MÉTRICAS DE CARTERA — funciones puras (sin acceso a datos)
// ============================================================================
// Fuente única de los números que muestran INICIO y DASHBOARD. Al ser puras se
// pueden probar sin base de datos y garantizan que ambas pantallas digan lo mismo.
//
// Corrige dos métricas que el panel anterior calculaba mal:
//
//  · "Salud de la cartera" era `min(100, total_cobrado / total_prestado)`. Eso mezcla
//    capital con intereses y se topa en 100, así que mostraba **100 % de salud con el
//    100 % de los préstamos en mora**. Ahora la salud es el porcentaje del SALDO ACTIVO
//    que está al día, y se acompaña del PAR-30 (Portfolio at Risk), el indicador estándar
//    del sector: saldo con más de 30 días de atraso sobre el saldo total.
//
//  · "Tasa de cobro" comparaba todo lo cobrado (capital + interés) contra el capital
//    colocado, por lo que podía superar el 100 %. Ahora la recuperación de capital y el
//    interés cobrado se reportan por separado, cada uno contra su propia base.

import { daysBetweenIso, parseIsoDateLocal } from './frequencyUtils';

// ---------------------------------------------------------------------------
// Tipos de entrada (subconjunto de las tablas reales)
// ---------------------------------------------------------------------------

export interface LoanLike {
  id: string;
  client_id: string;
  amount: number;
  remaining_balance: number;
  total_amount?: number | null;
  monthly_payment: number;
  status: string | null;
  start_date: string;
  next_payment_date: string | null;
  grace_period_days?: number | null;
  current_late_fee?: number | null;
  interest_rate?: number | null;
  amortization_type?: string | null;
  payment_frequency?: string | null;
  collection_stage?: string | null;
  created_at?: string | null;
  client?: { full_name?: string | null; dni?: string | null; phone?: string | null } | null;
}

export interface PaymentLike {
  id: string;
  loan_id: string;
  amount: number | null;
  principal_amount: number | null;
  interest_amount: number | null;
  late_fee?: number | null;
  payment_date: string | null;
  created_by?: string | null;
}

export interface SaleLike {
  total_amount?: number | null;
  total_price?: number | null;
  total?: number | null;
  amount?: number | null;
  quantity?: number | null;
  unit_price?: number | null;
  status?: string | null;
  sale_date?: string | null;
  created_at?: string | null;
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const round2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;
const dateOnly = (v: unknown) => String(v ?? '').split('T')[0];
const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);

/** Importe de una venta POS, tolerando los dos esquemas históricos de `sales`. */
export const getSaleAmount = (sale: SaleLike): number => {
  if (typeof sale.total_amount === 'number') return sale.total_amount;
  if (typeof sale.total_price === 'number') return sale.total_price;
  if (typeof sale.total === 'number') return sale.total;
  if (typeof sale.amount === 'number') return sale.amount;
  if (typeof sale.quantity === 'number' && typeof sale.unit_price === 'number') {
    return sale.quantity * sale.unit_price;
  }
  return 0;
};

export const isActiveLoan = (status: string | null | undefined) =>
  status === 'active' || status === 'overdue';

/** Días de atraso de un préstamo HOY, descontado su período de gracia. */
export const loanDaysOverdue = (loan: LoanLike, todayIso: string): number => {
  if (!isActiveLoan(loan.status)) return 0;
  const due = dateOnly(loan.next_payment_date);
  if (!due) return 0;
  const raw = daysBetweenIso(due, todayIso);
  if (raw === null) return 0;
  return Math.max(0, raw - Number(loan.grace_period_days || 0));
};

// ---------------------------------------------------------------------------
// Antigüedad de cartera (PAR)
// ---------------------------------------------------------------------------

export type AgingBucket = 'current' | '1-30' | '31-60' | '61-90' | '90+';

export const AGING_BUCKETS: AgingBucket[] = ['current', '1-30', '31-60', '61-90', '90+'];

export const AGING_LABEL: Record<AgingBucket, string> = {
  current: 'Al día',
  '1-30': '1–30 días',
  '31-60': '31–60 días',
  '61-90': '61–90 días',
  '90+': 'Más de 90 días',
};

export const AGING_COLOR: Record<AgingBucket, string> = {
  current: '#16a34a',
  '1-30': '#eab308',
  '31-60': '#f97316',
  '61-90': '#ef4444',
  '90+': '#991b1b',
};

export const bucketForDays = (days: number): AgingBucket =>
  days <= 0 ? 'current' : days <= 30 ? '1-30' : days <= 60 ? '31-60' : days <= 90 ? '61-90' : '90+';

// ---------------------------------------------------------------------------
// Fotografía de la cartera
// ---------------------------------------------------------------------------

export interface PortfolioSnapshot {
  totalLoans: number;
  activeLoans: number;
  paidLoans: number;
  pendingLoans: number;
  /** Capital desembolsado histórico (todos los préstamos no eliminados) */
  totalLent: number;
  /** Saldo pendiente de los préstamos activos */
  activeBalance: number;
  /** Saldo activo que está al día */
  currentBalance: number;
  overdueLoans: number;
  overdueBalance: number;
  lateFeeTotal: number;
  /** Ticket promedio de los préstamos activos */
  avgTicket: number;
  buckets: Record<AgingBucket, { count: number; balance: number }>;
  /** % del saldo activo que está al día (0 mora). Reemplaza la "salud" anterior. */
  healthPct: number;
  /** Portfolio at Risk: % del saldo con más de N días de atraso */
  par30: number;
  par60: number;
  par90: number;
  /** Peor atraso de la cartera, en días */
  maxDaysOverdue: number;
}

export const computePortfolioSnapshot = (loans: LoanLike[], todayIso: string): PortfolioSnapshot => {
  const buckets = AGING_BUCKETS.reduce((acc, b) => {
    acc[b] = { count: 0, balance: 0 };
    return acc;
  }, {} as Record<AgingBucket, { count: number; balance: number }>);

  let totalLent = 0;
  let activeBalance = 0;
  let overdueLoans = 0;
  let overdueBalance = 0;
  let lateFeeTotal = 0;
  let activeLoans = 0;
  let paidLoans = 0;
  let pendingLoans = 0;
  let maxDaysOverdue = 0;
  let riskOver30 = 0;
  let riskOver60 = 0;
  let riskOver90 = 0;

  for (const loan of loans) {
    totalLent += Number(loan.amount) || 0;
    if (loan.status === 'paid') paidLoans++;
    if (loan.status === 'pending') pendingLoans++;
    if (!isActiveLoan(loan.status)) continue;

    activeLoans++;
    const balance = Number(loan.remaining_balance) || 0;
    activeBalance += balance;
    lateFeeTotal += Number(loan.current_late_fee) || 0;

    const days = loanDaysOverdue(loan, todayIso);
    maxDaysOverdue = Math.max(maxDaysOverdue, days);
    const bucket = bucketForDays(days);
    buckets[bucket].count++;
    buckets[bucket].balance = round2(buckets[bucket].balance + balance);

    if (days > 0) {
      overdueLoans++;
      overdueBalance += balance;
    }
    if (days > 30) riskOver30 += balance;
    if (days > 60) riskOver60 += balance;
    if (days > 90) riskOver90 += balance;
  }

  return {
    totalLoans: loans.length,
    activeLoans,
    paidLoans,
    pendingLoans,
    totalLent: round2(totalLent),
    activeBalance: round2(activeBalance),
    currentBalance: round2(buckets.current.balance),
    overdueLoans,
    overdueBalance: round2(overdueBalance),
    lateFeeTotal: round2(lateFeeTotal),
    avgTicket: activeLoans > 0 ? round2(activeBalance / activeLoans) : 0,
    buckets,
    healthPct: round2(pct(buckets.current.balance, activeBalance)),
    par30: round2(pct(riskOver30, activeBalance)),
    par60: round2(pct(riskOver60, activeBalance)),
    par90: round2(pct(riskOver90, activeBalance)),
    maxDaysOverdue,
  };
};

// ---------------------------------------------------------------------------
// Cobros e ingresos
// ---------------------------------------------------------------------------

export interface CashflowTotals {
  capital: number;
  interest: number;
  lateFee: number;
  /** capital + interés + mora efectivamente recibidos */
  collected: number;
  pos: number;
  /** Ingreso real del negocio: interés + mora + POS (el capital es recuperación, no ingreso) */
  income: number;
  count: number;
}

const emptyTotals = (): CashflowTotals => ({
  capital: 0, interest: 0, lateFee: 0, collected: 0, pos: 0, income: 0, count: 0,
});

const addPayment = (t: CashflowTotals, p: PaymentLike) => {
  const capital = Number(p.principal_amount) || 0;
  const interest = Number(p.interest_amount) || 0;
  const lateFee = Number(p.late_fee) || 0;
  const amount = Number(p.amount) || 0;
  t.capital += capital;
  t.interest += interest;
  t.lateFee += lateFee;
  // `amount` es el total recibido; si viniera vacío se reconstruye por componentes
  t.collected += amount > 0 ? amount : capital + interest + lateFee;
  t.count++;
};

const seal = (t: CashflowTotals): CashflowTotals => ({
  capital: round2(t.capital),
  interest: round2(t.interest),
  lateFee: round2(t.lateFee),
  collected: round2(t.collected),
  pos: round2(t.pos),
  income: round2(t.interest + t.lateFee + t.pos),
  count: t.count,
});

export interface CashflowSummary {
  today: CashflowTotals;
  yesterday: CashflowTotals;
  week: CashflowTotals;
  month: CashflowTotals;
  previousMonth: CashflowTotals;
  allTime: CashflowTotals;
  /** Variación % de los ingresos del mes frente al mes anterior (null si no hay base) */
  incomeMoMPct: number | null;
}

/** Lunes de la semana de `todayIso` (ISO). */
export const startOfWeekIso = (todayIso: string): string => {
  const d = parseIsoDateLocal(todayIso);
  if (!d) return todayIso;
  const dow = (d.getDay() + 6) % 7; // 0 = lunes
  d.setDate(d.getDate() - dow);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const addDaysIso = (iso: string, days: number): string => {
  const d = parseIsoDateLocal(iso);
  if (!d) return iso;
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/** 'YYYY-MM' de una fecha ISO. */
export const monthKey = (iso: string) => dateOnly(iso).slice(0, 7);

const previousMonthKey = (key: string) => {
  const [y, m] = key.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
};

export const computeCashflow = (
  payments: PaymentLike[],
  sales: SaleLike[],
  todayIso: string
): CashflowSummary => {
  const today = emptyTotals();
  const yesterday = emptyTotals();
  const week = emptyTotals();
  const month = emptyTotals();
  const previousMonth = emptyTotals();
  const allTime = emptyTotals();

  const yIso = addDaysIso(todayIso, -1);
  const weekStart = startOfWeekIso(todayIso);
  const mKey = monthKey(todayIso);
  const prevKey = previousMonthKey(mKey);

  for (const p of payments) {
    const d = dateOnly(p.payment_date);
    if (!d) continue;
    addPayment(allTime, p);
    if (d === todayIso) addPayment(today, p);
    if (d === yIso) addPayment(yesterday, p);
    if (d >= weekStart && d <= todayIso) addPayment(week, p);
    const k = monthKey(d);
    if (k === mKey) addPayment(month, p);
    else if (k === prevKey) addPayment(previousMonth, p);
  }

  for (const s of sales) {
    if (s.status && s.status !== 'completed') continue;
    const d = dateOnly(s.sale_date || s.created_at);
    const amt = getSaleAmount(s);
    if (!d || amt <= 0) continue;
    allTime.pos += amt;
    if (d === todayIso) today.pos += amt;
    if (d === yIso) yesterday.pos += amt;
    if (d >= weekStart && d <= todayIso) week.pos += amt;
    const k = monthKey(d);
    if (k === mKey) month.pos += amt;
    else if (k === prevKey) previousMonth.pos += amt;
  }

  const sealedMonth = seal(month);
  const sealedPrev = seal(previousMonth);

  return {
    today: seal(today),
    yesterday: seal(yesterday),
    week: seal(week),
    month: sealedMonth,
    previousMonth: sealedPrev,
    allTime: seal(allTime),
    incomeMoMPct: sealedPrev.income > 0
      ? round2(((sealedMonth.income - sealedPrev.income) / sealedPrev.income) * 100)
      : null,
  };
};

// ---------------------------------------------------------------------------
// Recuperación de capital / rentabilidad
// ---------------------------------------------------------------------------

export interface RecoveryMetrics {
  capitalLent: number;
  capitalRecovered: number;
  /** % de capital recuperado sobre el colocado (no puede pasar de 100 por definición) */
  recoveryPct: number;
  interestEarned: number;
  lateFeeEarned: number;
  posIncome: number;
  totalIncome: number;
  /** Ingreso por interés sobre el capital colocado */
  yieldPct: number;
}

export const computeRecovery = (
  loans: LoanLike[],
  cashflow: CashflowSummary
): RecoveryMetrics => {
  const capitalLent = round2(loans.reduce((s, l) => s + (Number(l.amount) || 0), 0));
  const capitalRecovered = cashflow.allTime.capital;
  return {
    capitalLent,
    capitalRecovered,
    recoveryPct: round2(Math.min(100, pct(capitalRecovered, capitalLent))),
    interestEarned: cashflow.allTime.interest,
    lateFeeEarned: cashflow.allTime.lateFee,
    posIncome: cashflow.allTime.pos,
    totalIncome: cashflow.allTime.income,
    yieldPct: round2(pct(cashflow.allTime.interest, capitalLent)),
  };
};

// ---------------------------------------------------------------------------
// Serie mensual (para las gráficas del dashboard)
// ---------------------------------------------------------------------------

export interface MonthlyPoint {
  key: string;      // 'YYYY-MM'
  label: string;    // 'ago 26'
  capital: number;
  interes: number;
  mora: number;
  pos: number;
  cobrado: number;  // capital + interés + mora
  ingreso: number;  // interés + mora + POS
  colocado: number; // capital desembolsado ese mes
  prestamos: number;
}

const MONTH_ABBR = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export const monthLabel = (key: string): string => {
  const [y, m] = key.split('-').map(Number);
  if (!y || !m) return key;
  return `${MONTH_ABBR[m - 1]} ${String(y).slice(2)}`;
};

/** Últimos `months` meses terminando en el mes de `todayIso`. */
export const buildMonthlySeries = (
  payments: PaymentLike[],
  sales: SaleLike[],
  loans: LoanLike[],
  todayIso: string,
  months = 6
): MonthlyPoint[] => {
  const keys: string[] = [];
  let k = monthKey(todayIso);
  for (let i = 0; i < months; i++) {
    keys.unshift(k);
    k = previousMonthKey(k);
  }
  const index = new Map<string, MonthlyPoint>(
    keys.map(key => [key, {
      key, label: monthLabel(key),
      capital: 0, interes: 0, mora: 0, pos: 0, cobrado: 0, ingreso: 0, colocado: 0, prestamos: 0,
    }])
  );

  for (const p of payments) {
    const point = index.get(monthKey(dateOnly(p.payment_date)));
    if (!point) continue;
    const capital = Number(p.principal_amount) || 0;
    const interes = Number(p.interest_amount) || 0;
    const mora = Number(p.late_fee) || 0;
    const amount = Number(p.amount) || 0;
    point.capital += capital;
    point.interes += interes;
    point.mora += mora;
    point.cobrado += amount > 0 ? amount : capital + interes + mora;
  }
  for (const s of sales) {
    if (s.status && s.status !== 'completed') continue;
    const point = index.get(monthKey(dateOnly(s.sale_date || s.created_at)));
    if (!point) continue;
    point.pos += getSaleAmount(s);
  }
  for (const l of loans) {
    const point = index.get(monthKey(dateOnly(l.start_date || l.created_at)));
    if (!point) continue;
    point.colocado += Number(l.amount) || 0;
    point.prestamos++;
  }

  return keys.map(key => {
    const p = index.get(key)!;
    return {
      ...p,
      capital: round2(p.capital),
      interes: round2(p.interes),
      mora: round2(p.mora),
      pos: round2(p.pos),
      cobrado: round2(p.cobrado),
      ingreso: round2(p.interes + p.mora + p.pos),
      colocado: round2(p.colocado),
    };
  });
};

// ---------------------------------------------------------------------------
// Agenda operativa (INICIO)
// ---------------------------------------------------------------------------

export interface AgendaLoan {
  loan: LoanLike;
  daysOverdue: number;
  dueDate: string;
  amount: number;
}

export interface TodayAgenda {
  dueToday: AgendaLoan[];
  overdue: AgendaLoan[];
  dueThisWeek: AgendaLoan[];
  upcoming: AgendaLoan[];
  expectedToday: number;
  expectedWeek: number;
  overdueAmount: number;
}

export const computeTodayAgenda = (loans: LoanLike[], todayIso: string): TodayAgenda => {
  const dueToday: AgendaLoan[] = [];
  const overdue: AgendaLoan[] = [];
  const dueThisWeek: AgendaLoan[] = [];
  const upcoming: AgendaLoan[] = [];
  const weekEnd = addDaysIso(todayIso, 7);

  for (const loan of loans) {
    if (!isActiveLoan(loan.status)) continue;
    const due = dateOnly(loan.next_payment_date);
    if (!due) continue;
    const days = loanDaysOverdue(loan, todayIso);
    const entry: AgendaLoan = {
      loan,
      daysOverdue: days,
      dueDate: due,
      amount: Number(loan.monthly_payment) || 0,
    };
    if (due === todayIso) dueToday.push(entry);
    else if (due < todayIso) overdue.push(entry);
    else if (due <= weekEnd) dueThisWeek.push(entry);
    else upcoming.push(entry);
  }

  overdue.sort((a, b) => b.daysOverdue - a.daysOverdue || b.amount - a.amount);
  dueToday.sort((a, b) => b.amount - a.amount);
  dueThisWeek.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  upcoming.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return {
    dueToday, overdue, dueThisWeek, upcoming,
    expectedToday: round2(dueToday.reduce((s, e) => s + e.amount, 0)),
    expectedWeek: round2([...dueToday, ...dueThisWeek].reduce((s, e) => s + e.amount, 0)),
    overdueAmount: round2(overdue.reduce((s, e) => s + (Number(e.loan.remaining_balance) || 0), 0)),
  };
};

/** Préstamos ordenados por riesgo (días de atraso × saldo). */
export const topRiskLoans = (loans: LoanLike[], todayIso: string, limit = 8): AgendaLoan[] =>
  loans
    .filter(l => isActiveLoan(l.status) && loanDaysOverdue(l, todayIso) > 0)
    .map(l => ({
      loan: l,
      daysOverdue: loanDaysOverdue(l, todayIso),
      dueDate: dateOnly(l.next_payment_date),
      amount: Number(l.remaining_balance) || 0,
    }))
    .sort((a, b) => b.daysOverdue * b.amount - a.daysOverdue * a.amount)
    .slice(0, limit);
