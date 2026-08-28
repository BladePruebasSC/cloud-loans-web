// ============================================================================
// MOTOR DE CALIFICACIÓN DE CLIENTES (CRM)
// ============================================================================
//
// Función PURA: recibe los datos crudos de un cliente (préstamos, pagos, seguimientos,
// ventas, empeños) y devuelve un score de 0 a 1000 puntos, la categoría comercial
// (Frío / Tibio / Caliente), el nivel de riesgo y una radiografía de su comportamiento
// de pago. No consulta la base de datos: eso lo hace `useClientCRM`.
//
// ESCALA: 0–1000. Se eligió porque `clients.credit_score` ya existía en la BD y la
// pantalla de Clientes ya lo coloreaba con umbrales de 600/700 — el CRM llena ese
// campo, así que ambas pantallas hablan la misma escala.
//
// COMPONENTES DEL SCORE (suman 1000):
//   1. Puntualidad      0–400  ¿Paga en fecha? Se mide sobre cada cuota pagada.
//   2. Estado actual    0–250  ¿Está atrasado HOY? Cuántos días.
//   3. Historial        0–200  Préstamos completados, antigüedad, cantidad.
//   4. Volumen          0–150  Cuánto negocio ha generado (préstamos + ventas + empeños).
//
// CATEGORÍAS COMERCIALES:
//   Caliente  ≥ 700   Cliente ejemplar: renovar, ofrecer más, retener.
//   Tibio     450–699 Cumple con altibajos: seguimiento preventivo.
//   Frío      < 450   Riesgo o desinterés: cobranza activa o dejar enfriar.
//   Nuevo             Sin historial suficiente para calificar.
//
// El usuario del sistema puede anular la categoría a mano desde el CRM
// (`manual_category`); esa anulación se respeta en pantalla pero el score se sigue
// calculando para que se vea la diferencia.

import { parseIsoDateLocal, formatDateLocalIso } from './frequencyUtils';

// ---------------------------------------------------------------------------
// Tipos de entrada (subconjunto de las tablas reales)
// ---------------------------------------------------------------------------

export interface ScoringLoan {
  id: string;
  client_id: string;
  amount: number;
  total_amount?: number | null;
  remaining_balance: number;
  monthly_payment: number;
  status: string | null;
  start_date: string;
  next_payment_date: string;
  end_date?: string | null;
  term_months?: number | null;
  payment_frequency?: string | null;
  amortization_type?: string | null;
  grace_period_days?: number | null;
  current_late_fee?: number | null;
  total_late_fee_paid?: number | null;
  created_at?: string | null;
}

export interface ScoringPayment {
  id: string;
  loan_id: string;
  amount: number;
  due_date: string;
  payment_date: string;
  interest_amount?: number | null;
  principal_amount?: number | null;
  late_fee?: number | null;
  status?: string | null;
}

export interface ScoringTracking {
  id: string;
  loan_id: string;
  contact_type: string;
  contact_date: string;
  next_contact_date?: string | null;
  client_response?: string | null;
}

export interface ScoringSale {
  id: string;
  client_id?: string | null;
  total_amount?: number | null;
  total_price?: number | null;
  sale_date?: string | null;
  status?: string | null;
}

export interface ScoringPawn {
  id: string;
  client_id?: string | null;
  loan_amount: number;
  status: string;
  start_date: string;
  deleted_at?: string | null;
}

export interface ClientScoringInput {
  clientId: string;
  loans: ScoringLoan[];
  payments: ScoringPayment[];
  tracking: ScoringTracking[];
  sales: ScoringSale[];
  pawns: ScoringPawn[];
  /** Fecha "hoy" en formato YYYY-MM-DD (Santo Domingo). Inyectable para pruebas. */
  todayIso: string;
}

// ---------------------------------------------------------------------------
// Tipos de salida
// ---------------------------------------------------------------------------

export type ClientCategory = 'caliente' | 'tibio' | 'frio' | 'nuevo';
export type RiskLevel = 'bajo' | 'medio' | 'alto';
export type PaymentBehavior =
  | 'puntual'
  | 'ocasionalmente_tarde'
  | 'frecuentemente_tarde'
  | 'moroso'
  | 'sin_historial';

export interface ScoreComponents {
  punctuality: number; // 0–400
  currentStatus: number; // 0–250
  history: number; // 0–200
  volume: number; // 0–150
}

export interface PaymentBehaviorMetrics {
  /** Cuotas (eventos de pago agrupados por fecha de vencimiento) analizadas */
  installmentsAnalyzed: number;
  onTimeCount: number;
  inGraceCount: number;
  lateCount: number;
  /** Proporción 0–1 de cuotas pagadas a tiempo (gracia cuenta medio punto) */
  onTimeRate: number;
  /** Promedio de días de atraso SOLO sobre las cuotas que se pagaron tarde */
  avgDelayDaysWhenLate: number;
  /** Peor atraso registrado en una cuota pagada */
  maxDelayDays: number;
  /** Promedio de días de atraso sobre TODAS las cuotas (negativo = paga adelantado) */
  avgDelayDaysOverall: number;
}

export interface ClientAttentionFlag {
  code:
    | 'overdue_no_recent_contact'
    | 'next_contact_due'
    | 'renewal_opportunity'
    | 'inactive_reactivation'
    | 'high_late_fee'
    | 'new_client_first_payment';
  label: string;
  severity: 'info' | 'warning' | 'danger';
  loanId?: string;
}

export interface ClientScore {
  clientId: string;
  score: number;
  category: ClientCategory;
  risk: RiskLevel;
  behavior: PaymentBehavior;
  components: ScoreComponents;
  metrics: PaymentBehaviorMetrics & {
    totalLoans: number;
    activeLoans: number;
    completedLoans: number;
    overdueLoans: number;
    /** Máximo de días de atraso HOY entre los préstamos activos (ya descontada la gracia) */
    currentMaxDaysOverdue: number;
    currentLateFee: number;
    totalLateFeePaid: number;
    totalBorrowed: number;
    totalPaid: number;
    totalInterestPaid: number;
    activeBalance: number;
    totalSales: number;
    salesCount: number;
    totalPawned: number;
    pawnsCount: number;
    /** Valor total del negocio generado (préstamos + ventas + empeños) */
    lifetimeValue: number;
    firstLoanDate: string | null;
    lastPaymentDate: string | null;
    daysSinceLastPayment: number | null;
    monthsAsClient: number;
    trackingCount: number;
    lastContactDate: string | null;
    nextContactDate: string | null;
  };
  flags: ClientAttentionFlag[];
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const round2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/** Diferencia en días calendario: b − a (positivo si b es después). */
const daysBetween = (aIso: string, bIso: string): number | null => {
  const a = parseIsoDateLocal(aIso);
  const b = parseIsoDateLocal(bIso);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
};

const isActiveStatus = (s: string | null | undefined) =>
  s === 'active' || s === 'overdue';
const isCompletedStatus = (s: string | null | undefined) =>
  s === 'paid' || s === 'settled' || s === 'completed';

// ---------------------------------------------------------------------------
// 1) Puntualidad: análisis cuota por cuota
// ---------------------------------------------------------------------------

/**
 * Agrupa los pagos por (préstamo, fecha de vencimiento) y calcula el atraso de cada
 * "evento de cuota". Con pagos parciales, el atraso se pondera por monto: si el cliente
 * pagó la mitad a tiempo y la otra mitad 10 días tarde, el atraso de esa cuota es 5 días.
 */
export const analyzePaymentBehavior = (
  loans: ScoringLoan[],
  payments: ScoringPayment[]
): PaymentBehaviorMetrics => {
  const graceByLoan = new Map<string, number>();
  for (const l of loans) graceByLoan.set(l.id, Number(l.grace_period_days || 0));

  type Group = { weightedDelay: number; amount: number; loanId: string };
  const groups = new Map<string, Group>();

  for (const p of payments) {
    if (p.status === 'failed' || p.status === 'cancelled') continue;
    const due = String(p.due_date || '').split('T')[0];
    const paid = String(p.payment_date || '').split('T')[0];
    if (!due || !paid) continue;
    const delay = daysBetween(due, paid);
    if (delay === null) continue;
    const amt = Math.max(0, Number(p.amount) || 0);
    if (amt <= 0) continue;

    const key = `${p.loan_id}|${due}`;
    const g = groups.get(key) || { weightedDelay: 0, amount: 0, loanId: p.loan_id };
    g.weightedDelay += delay * amt;
    g.amount += amt;
    groups.set(key, g);
  }

  let onTime = 0;
  let inGrace = 0;
  let late = 0;
  let sumDelayLate = 0;
  let sumDelayAll = 0;
  let maxDelay = 0;

  for (const g of groups.values()) {
    const delay = g.amount > 0 ? g.weightedDelay / g.amount : 0;
    const grace = graceByLoan.get(g.loanId) || 0;
    sumDelayAll += delay;
    if (delay <= 0) {
      onTime++;
    } else if (delay <= grace) {
      inGrace++;
    } else {
      late++;
      sumDelayLate += delay;
      maxDelay = Math.max(maxDelay, delay);
    }
  }

  const total = groups.size;
  const onTimeRate = total > 0 ? (onTime + inGrace * 0.5) / total : 0;

  return {
    installmentsAnalyzed: total,
    onTimeCount: onTime,
    inGraceCount: inGrace,
    lateCount: late,
    onTimeRate: round2(onTimeRate),
    avgDelayDaysWhenLate: late > 0 ? round2(sumDelayLate / late) : 0,
    maxDelayDays: Math.round(maxDelay),
    avgDelayDaysOverall: total > 0 ? round2(sumDelayAll / total) : 0,
  };
};

const scorePunctuality = (m: PaymentBehaviorMetrics, hasActiveLoan: boolean): number => {
  if (m.installmentsAnalyzed === 0) {
    // Sin cuotas pagadas todavía: si tiene préstamo activo y aún no ha vencido nada,
    // se le da el beneficio de la duda (mitad de los puntos). Sin préstamos: 0.
    return hasActiveLoan ? 200 : 0;
  }
  const base = 400 * m.onTimeRate;
  // Penalizar la MAGNITUD del atraso, no solo la frecuencia: pagar 2 días tarde no es
  // lo mismo que pagar 45 días tarde, aunque ambos cuenten como "tarde".
  const magnitudePenalty = Math.min(80, m.avgDelayDaysWhenLate * 1.5);
  // Pocas cuotas analizadas = menos confianza: se comprime hacia el punto medio.
  const confidence = Math.min(1, m.installmentsAnalyzed / 6);
  const raw = clamp(base - magnitudePenalty, 0, 400);
  return Math.round(200 + (raw - 200) * confidence);
};

// ---------------------------------------------------------------------------
// 2) Estado actual: ¿está atrasado hoy?
// ---------------------------------------------------------------------------

const computeCurrentOverdue = (loans: ScoringLoan[], todayIso: string) => {
  let maxDays = 0;
  let overdueLoans = 0;
  for (const l of loans) {
    if (!isActiveStatus(l.status)) continue;
    const next = String(l.next_payment_date || '').split('T')[0];
    if (!next) continue;
    const raw = daysBetween(next, todayIso);
    if (raw === null) continue;
    const days = Math.max(0, raw - Number(l.grace_period_days || 0));
    if (days > 0) {
      overdueLoans++;
      maxDays = Math.max(maxDays, days);
    }
  }
  return { maxDays, overdueLoans };
};

const scoreCurrentStatus = (maxDaysOverdue: number, hasActiveLoan: boolean, hasAnyLoan: boolean): number => {
  // Sin deuda activa: neutro-positivo SOLO si ya tuvo préstamos (los terminó). Un cliente que
  // nunca ha tomado un préstamo no ha demostrado nada y no debe recibir puntos por ello.
  if (!hasActiveLoan) return hasAnyLoan ? 200 : 0;
  if (maxDaysOverdue <= 0) return 250;
  if (maxDaysOverdue <= 7) return 200;
  if (maxDaysOverdue <= 15) return 150;
  if (maxDaysOverdue <= 30) return 90;
  if (maxDaysOverdue <= 60) return 40;
  return 0;
};

// ---------------------------------------------------------------------------
// 3) Historial
// ---------------------------------------------------------------------------

const scoreHistory = (completedLoans: number, totalLoans: number, monthsAsClient: number): number => {
  const completedPts = Math.min(100, completedLoans * 35);
  const tenurePts = Math.min(60, monthsAsClient * 2.5);
  const countPts = Math.min(40, totalLoans * 10);
  return Math.round(completedPts + tenurePts + countPts);
};

// ---------------------------------------------------------------------------
// 4) Volumen (escala logarítmica: RD$10k ≈ 90 pts, RD$100k ≈ 115, RD$1M = 150)
// ---------------------------------------------------------------------------

const scoreVolume = (lifetimeValue: number): number => {
  if (lifetimeValue <= 0) return 0;
  return Math.round(150 * Math.min(1, Math.log10(1 + lifetimeValue) / 6));
};

// ---------------------------------------------------------------------------
// Clasificación
// ---------------------------------------------------------------------------

export const categoryFromScore = (score: number, isNew: boolean): ClientCategory => {
  if (isNew) return 'nuevo';
  if (score >= 700) return 'caliente';
  if (score >= 450) return 'tibio';
  return 'frio';
};

const behaviorFrom = (m: PaymentBehaviorMetrics, currentMaxDaysOverdue: number): PaymentBehavior => {
  if (m.installmentsAnalyzed === 0) return 'sin_historial';
  if (currentMaxDaysOverdue > 60) return 'moroso';
  if (m.onTimeRate >= 0.9) return 'puntual';
  if (m.onTimeRate >= 0.7) return 'ocasionalmente_tarde';
  if (m.onTimeRate >= 0.4) return 'frecuentemente_tarde';
  return 'moroso';
};

const riskFrom = (behavior: PaymentBehavior, currentMaxDaysOverdue: number): RiskLevel => {
  if (currentMaxDaysOverdue > 30 || behavior === 'moroso') return 'alto';
  if (currentMaxDaysOverdue > 0 || behavior === 'frecuentemente_tarde') return 'medio';
  return 'bajo';
};

// ---------------------------------------------------------------------------
// Cálculo principal
// ---------------------------------------------------------------------------

export const scoreClient = (input: ClientScoringInput): ClientScore => {
  const { clientId, todayIso } = input;
  const loans = input.loans.filter(l => l.client_id === clientId);
  const loanIds = new Set(loans.map(l => l.id));
  const payments = input.payments.filter(p => loanIds.has(p.loan_id));
  const tracking = input.tracking.filter(t => loanIds.has(t.loan_id));
  const sales = input.sales.filter(
    s => s.client_id === clientId && s.status !== 'cancelled'
  );
  const pawns = input.pawns.filter(p => p.client_id === clientId && !p.deleted_at);

  // --- Métricas base ---
  const activeLoansList = loans.filter(l => isActiveStatus(l.status));
  const completedLoans = loans.filter(l => isCompletedStatus(l.status)).length;
  const hasActiveLoan = activeLoansList.length > 0;

  const totalBorrowed = round2(loans.reduce((s, l) => s + (Number(l.amount) || 0), 0));
  const activeBalance = round2(activeLoansList.reduce((s, l) => s + (Number(l.remaining_balance) || 0), 0));
  const totalPaid = round2(payments.reduce((s, p) => s + (Number(p.amount) || 0), 0));
  const totalInterestPaid = round2(payments.reduce((s, p) => s + (Number(p.interest_amount) || 0), 0));
  const currentLateFee = round2(activeLoansList.reduce((s, l) => s + (Number(l.current_late_fee) || 0), 0));
  const totalLateFeePaid = round2(loans.reduce((s, l) => s + (Number(l.total_late_fee_paid) || 0), 0));

  const totalSales = round2(sales.reduce((s, x) => s + (Number(x.total_amount ?? x.total_price) || 0), 0));
  const totalPawned = round2(pawns.reduce((s, x) => s + (Number(x.loan_amount) || 0), 0));
  const lifetimeValue = round2(totalBorrowed + totalSales + totalPawned);

  const loanDates = loans
    .map(l => String(l.start_date || l.created_at || '').split('T')[0])
    .filter(Boolean)
    .sort();
  const firstLoanDate = loanDates[0] || null;
  const monthsAsClient = firstLoanDate
    ? Math.max(0, Math.floor((daysBetween(firstLoanDate, todayIso) || 0) / 30))
    : 0;

  const paymentDates = payments
    .map(p => String(p.payment_date || '').split('T')[0])
    .filter(Boolean)
    .sort();
  const lastPaymentDate = paymentDates.length ? paymentDates[paymentDates.length - 1] : null;
  const daysSinceLastPayment = lastPaymentDate ? daysBetween(lastPaymentDate, todayIso) : null;

  const trackingSorted = [...tracking].sort((a, b) =>
    String(b.contact_date).localeCompare(String(a.contact_date))
  );
  const lastContactDate = trackingSorted[0]?.contact_date
    ? String(trackingSorted[0].contact_date).split('T')[0]
    : null;
  const pendingNext = tracking
    .map(t => (t.next_contact_date ? String(t.next_contact_date).split('T')[0] : null))
    .filter((d): d is string => !!d)
    .sort();
  // El próximo contacto relevante es el más reciente que se haya agendado
  const nextContactDate = pendingNext.length ? pendingNext[pendingNext.length - 1] : null;

  // --- Componentes ---
  const behaviorMetrics = analyzePaymentBehavior(loans, payments);
  const { maxDays: currentMaxDaysOverdue, overdueLoans } = computeCurrentOverdue(loans, todayIso);

  const components: ScoreComponents = {
    punctuality: scorePunctuality(behaviorMetrics, hasActiveLoan),
    currentStatus: scoreCurrentStatus(currentMaxDaysOverdue, hasActiveLoan, loans.length > 0),
    history: scoreHistory(completedLoans, loans.length, monthsAsClient),
    volume: scoreVolume(lifetimeValue),
  };

  const score = clamp(
    Math.round(components.punctuality + components.currentStatus + components.history + components.volume),
    0,
    1000
  );

  const isNew = loans.length === 0 && sales.length === 0 && pawns.length === 0;
  const behavior = behaviorFrom(behaviorMetrics, currentMaxDaysOverdue);
  const risk = riskFrom(behavior, currentMaxDaysOverdue);
  const category = categoryFromScore(score, isNew);

  // --- Banderas de atención (accionables para cobranza/ventas) ---
  const flags: ClientAttentionFlag[] = [];

  if (currentMaxDaysOverdue > 0) {
    const daysSinceContact = lastContactDate ? daysBetween(lastContactDate, todayIso) : null;
    if (daysSinceContact === null || daysSinceContact > 7) {
      flags.push({
        code: 'overdue_no_recent_contact',
        label: `Atrasado ${currentMaxDaysOverdue} día${currentMaxDaysOverdue === 1 ? '' : 's'} sin contacto reciente`,
        severity: currentMaxDaysOverdue > 30 ? 'danger' : 'warning',
        loanId: activeLoansList.find(l => {
          const d = daysBetween(String(l.next_payment_date).split('T')[0], todayIso);
          return d !== null && d - Number(l.grace_period_days || 0) > 0;
        })?.id,
      });
    }
  }

  if (nextContactDate && nextContactDate <= todayIso) {
    flags.push({
      code: 'next_contact_due',
      label: nextContactDate === todayIso ? 'Contacto programado para hoy' : `Contacto programado vencido (${nextContactDate})`,
      severity: nextContactDate === todayIso ? 'info' : 'warning',
    });
  }

  if (currentLateFee > 0 && currentLateFee >= activeLoansList.reduce((s, l) => s + (Number(l.monthly_payment) || 0), 0)) {
    flags.push({
      code: 'high_late_fee',
      label: 'La mora acumulada supera una cuota completa',
      severity: 'danger',
    });
  }

  // Oportunidad de renovación: buen cliente cuyo préstamo está por terminar
  if ((category === 'caliente' || category === 'tibio') && currentMaxDaysOverdue === 0) {
    for (const l of activeLoansList) {
      const isIndefinite = String(l.amortization_type || '').toLowerCase() === 'indefinite';
      if (isIndefinite) continue;
      const total = Number(l.total_amount) || Number(l.amount) || 0;
      const remaining = Number(l.remaining_balance) || 0;
      const paidRatio = total > 0 ? 1 - remaining / total : 0;
      if (paidRatio >= 0.8) {
        flags.push({
          code: 'renewal_opportunity',
          label: `Préstamo al ${Math.round(paidRatio * 100)}% pagado: oportunidad de renovación`,
          severity: 'info',
          loanId: l.id,
        });
        break;
      }
    }
  }

  if (!hasActiveLoan && loans.length > 0 && category !== 'frio') {
    const lastActivity = lastPaymentDate || loanDates[loanDates.length - 1];
    const idle = lastActivity ? daysBetween(lastActivity, todayIso) : null;
    if (idle !== null && idle >= 90) {
      flags.push({
        code: 'inactive_reactivation',
        label: `Sin actividad hace ${idle} días: candidato a reactivación`,
        severity: 'info',
      });
    }
  }

  if (hasActiveLoan && behaviorMetrics.installmentsAnalyzed === 0) {
    flags.push({
      code: 'new_client_first_payment',
      label: 'Aún no registra su primer pago',
      severity: 'info',
    });
  }

  return {
    clientId,
    score,
    category,
    risk,
    behavior,
    components,
    metrics: {
      ...behaviorMetrics,
      totalLoans: loans.length,
      activeLoans: activeLoansList.length,
      completedLoans,
      overdueLoans,
      currentMaxDaysOverdue,
      currentLateFee,
      totalLateFeePaid,
      totalBorrowed,
      totalPaid,
      totalInterestPaid,
      activeBalance,
      totalSales,
      salesCount: sales.length,
      totalPawned,
      pawnsCount: pawns.length,
      lifetimeValue,
      firstLoanDate,
      lastPaymentDate,
      daysSinceLastPayment,
      monthsAsClient,
      trackingCount: tracking.length,
      lastContactDate,
      nextContactDate,
    },
    flags,
  };
};

// ---------------------------------------------------------------------------
// Etiquetas para la interfaz (única fuente para que todas las pantallas coincidan)
// ---------------------------------------------------------------------------

export const CATEGORY_META: Record<ClientCategory, { label: string; emoji: string; className: string; description: string }> = {
  caliente: {
    label: 'Caliente',
    emoji: '🔥',
    className: 'bg-red-100 text-red-800 border-red-200',
    description: 'Cliente ejemplar: paga a tiempo y genera negocio. Renovar, ofrecer más, retener.',
  },
  tibio: {
    label: 'Tibio',
    emoji: '🌤️',
    className: 'bg-amber-100 text-amber-800 border-amber-200',
    description: 'Cumple con altibajos. Seguimiento preventivo antes de que se enfríe.',
  },
  frio: {
    label: 'Frío',
    emoji: '🧊',
    className: 'bg-sky-100 text-sky-800 border-sky-200',
    description: 'Riesgo alto o cliente inactivo. Requiere cobranza activa o decisión de no renovar.',
  },
  nuevo: {
    label: 'Nuevo',
    emoji: '✨',
    className: 'bg-gray-100 text-gray-700 border-gray-200',
    description: 'Sin historial suficiente. Se califica tras sus primeros pagos.',
  },
};

export const BEHAVIOR_META: Record<PaymentBehavior, { label: string; className: string }> = {
  puntual: { label: 'Puntual', className: 'bg-green-100 text-green-800' },
  ocasionalmente_tarde: { label: 'Ocasionalmente tarde', className: 'bg-lime-100 text-lime-800' },
  frecuentemente_tarde: { label: 'Frecuentemente tarde', className: 'bg-orange-100 text-orange-800' },
  moroso: { label: 'Moroso', className: 'bg-red-100 text-red-800' },
  sin_historial: { label: 'Sin historial', className: 'bg-gray-100 text-gray-600' },
};

export const RISK_META: Record<RiskLevel, { label: string; className: string }> = {
  bajo: { label: 'Riesgo bajo', className: 'text-green-700' },
  medio: { label: 'Riesgo medio', className: 'text-amber-700' },
  alto: { label: 'Riesgo alto', className: 'text-red-700' },
};

export const SCORE_MAX = 1000;
export const COMPONENT_MAX: Record<keyof ScoreComponents, number> = {
  punctuality: 400,
  currentStatus: 250,
  history: 200,
  volume: 150,
};
export const COMPONENT_LABEL: Record<keyof ScoreComponents, string> = {
  punctuality: 'Puntualidad',
  currentStatus: 'Estado actual',
  history: 'Historial',
  volume: 'Volumen de negocio',
};

export const todayIsoForScoring = (d: Date = new Date()) => formatDateLocalIso(d);
