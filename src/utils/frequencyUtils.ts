// ============================================================================
// FUENTE ÚNICA DE VERDAD PARA FRECUENCIAS DE PAGO Y ARITMÉTICA DE FECHAS
// ============================================================================
//
// AUDITORÍA (2026-08-28): antes de este archivo, la misma pregunta ("¿cuánto dura
// una quincena?", "¿cuál es la tasa de un período semanal?", "¿qué fecha vence la
// cuota N?") se respondía de forma DISTINTA en al menos 8 lugares del proyecto:
//
//   - LoanForm.getNextBusinessDay()          → quincenal = 15 días
//   - LoanForm.generateOriginalInstallments() → quincenal = 14 días
//   - AmortizationTable.getFrequencyInfo()   → mensual  = 30 días fijos
//   - loanBalanceBreakdown.addPeriod()       → mensual con rollover (31-ene → 03-mar)
//   - installmentLateFeeCalculator           → mensual con clamp (31-ene → 28-feb)
//   - PaymentForm (avance de next_payment_date) → mensual sin clamp
//   - AccountStatement.calculateAmortizationSchedule() → tasa mensual sin ajustar
//   - Funciones SQL                          → siempre meses, ignorando la frecuencia
//
// El resultado eran cronogramas que se desfasaban entre la vista previa, las cuotas
// guardadas en la BD, el cálculo de mora y el estado de cuenta. Todo el código de
// cronogramas debe usar los helpers de este archivo.
//
// CONVENIOS DEL NEGOCIO (los que ya usaba la mayoría del código, ahora unificados):
//   - `interest_rate` guardado en `loans` es SIEMPRE una tasa MENSUAL.
//   - La tasa de un período se obtiene LINEALMENTE: mensual × factor de frecuencia
//     (quincenal = 1/2, semanal = 1/4, diario = 1/30). No se compone.
//   - El plazo (`term_months`) está expresado en PERÍODOS de la frecuencia elegida,
//     no en meses (un préstamo diario con plazo 30 dura 30 días).
//   - La primera cuota vence UN PERÍODO DESPUÉS de la fecha de inicio.
//   - En frecuencias basadas en meses se preserva el día del mes y se recorta al
//     último día del mes cuando no existe (31-ene + 1 mes = 28-feb, no 03-mar).

export type PaymentFrequency =
  | 'daily'
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'quarterly'
  | 'yearly';

const FREQUENCIES: Record<PaymentFrequency, {
  /** Días naturales que dura un período (para frecuencias basadas en días). */
  days: number | null;
  /** Meses que dura un período (para frecuencias basadas en meses). */
  months: number | null;
  /** Períodos que caben en un mes: convierte la tasa mensual a tasa de período. */
  rateFactor: number;
  /** Días usados para prorratear mora de tipo "mensual". */
  lateFeePeriodDays: number;
  label: string;
  labelPlural: string;
}> = {
  daily: { days: 1, months: null, rateFactor: 1 / 30, lateFeePeriodDays: 1, label: 'día', labelPlural: 'días' },
  weekly: { days: 7, months: null, rateFactor: 1 / 4, lateFeePeriodDays: 7, label: 'semana', labelPlural: 'semanas' },
  biweekly: { days: 14, months: null, rateFactor: 1 / 2, lateFeePeriodDays: 14, label: 'quincena', labelPlural: 'quincenas' },
  monthly: { days: null, months: 1, rateFactor: 1, lateFeePeriodDays: 30, label: 'mes', labelPlural: 'meses' },
  quarterly: { days: null, months: 3, rateFactor: 3, lateFeePeriodDays: 90, label: 'trimestre', labelPlural: 'trimestres' },
  yearly: { days: null, months: 12, rateFactor: 12, lateFeePeriodDays: 365, label: 'año', labelPlural: 'años' },
};

/** Normaliza cualquier valor de frecuencia a una de las soportadas ('monthly' por defecto). */
export const normalizeFrequency = (frequency?: string | null): PaymentFrequency => {
  const f = String(frequency || '').toLowerCase().trim();
  return (f in FREQUENCIES ? f : 'monthly') as PaymentFrequency;
};

/**
 * Factor para convertir la tasa MENSUAL guardada en `loans.interest_rate` a la tasa
 * del período de pago. Quincenal = 0.5, semanal = 0.25, diario = 1/30, mensual = 1.
 */
export const getFrequencyRateFactor = (frequency?: string | null): number =>
  FREQUENCIES[normalizeFrequency(frequency)].rateFactor;

/**
 * Tasa de período (en tanto por uno) a partir de la tasa mensual en porcentaje.
 * Ej.: 5% mensual, frecuencia quincenal → 0.025
 */
export const getPeriodRate = (monthlyRatePercent: number, frequency?: string | null): number =>
  (Number(monthlyRatePercent || 0) / 100) * getFrequencyRateFactor(frequency);

/**
 * Días que se usan para prorratear la mora cuando `late_fee_calculation_type` es
 * 'monthly' (es decir, "una tarifa por cada período de atraso").
 */
export const getLateFeePeriodDays = (frequency?: string | null): number =>
  FREQUENCIES[normalizeFrequency(frequency)].lateFeePeriodDays;

/** Etiqueta legible del período ("meses", "quincenas", ...). */
/**
 * Tasa MENSUAL (en %) → tasa ANUAL (en %).
 *
 * Se multiplica por 12, sin componer, que es la convención lineal con la que el sistema
 * convierte entre períodos (ver `getFrequencyRateFactor`). Componer aquí y no allí daría dos
 * cifras distintas para el mismo préstamo.
 *
 * La tasa que se escribe y se guarda sigue siendo mensual; esto es solo para MOSTRARLA, que es
 * como se compara entre préstamos de distinta frecuencia.
 */
export const toAnnualRate = (monthlyRate?: number | null): number =>
  Math.round((Number(monthlyRate) || 0) * 12 * 100) / 100;

/** Tasa ANUAL (en %) → tasa mensual (en %), la inversa de `toAnnualRate`. */
export const fromAnnualRate = (annualRate?: number | null): number =>
  Math.round(((Number(annualRate) || 0) / 12) * 100) / 100;

export const getFrequencyLabel = (frequency?: string | null, plural = true): string => {
  const info = FREQUENCIES[normalizeFrequency(frequency)];
  return plural ? info.labelPlural : info.label;
};

/** Devuelve el último día del mes indicado (mes 0-indexado, admite desbordes). */
const lastDayOfMonth = (year: number, monthIndex: number): number =>
  new Date(year, monthIndex + 1, 0).getDate();

/**
 * Suma `periods` períodos de la frecuencia dada a una fecha LOCAL.
 *
 * Para frecuencias basadas en meses se preserva el día del mes y se recorta al último
 * día disponible cuando no existe (31-ene + 1 mes = 28-feb). Nunca desborda al mes
 * siguiente, que era el comportamiento de `setMonth()` a secas y la causa de las
 * fechas "28-feb clamp" y de cuotas que aparecían en el mes equivocado.
 */
export const addPeriodsToDate = (base: Date, periods: number, frequency?: string | null): Date => {
  const info = FREQUENCIES[normalizeFrequency(frequency)];
  const result = new Date(base.getFullYear(), base.getMonth(), base.getDate());

  if (info.days !== null) {
    result.setDate(result.getDate() + info.days * periods);
    return result;
  }

  const day = base.getDate();
  const targetMonthIndex = base.getMonth() + (info.months as number) * periods;
  const targetYear = base.getFullYear() + Math.floor(targetMonthIndex / 12);
  const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;
  result.setFullYear(targetYear, normalizedMonth, Math.min(day, lastDayOfMonth(targetYear, normalizedMonth)));
  return result;
};

/** Parsea 'YYYY-MM-DD' (o 'YYYY-MM-DDTHH:mm:ss') como fecha LOCAL, sin desfase UTC. */
export const parseIsoDateLocal = (value?: string | null): Date | null => {
  if (!value) return null;
  const [y, m, d] = String(value).split('T')[0].split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
};

/**
 * Formatea una fecha LOCAL como 'YYYY-MM-DD'.
 *
 * Se usa en vez de `toISOString().split('T')[0]`, que convierte a UTC y por tanto
 * devuelve el día ANTERIOR para cualquier equipo con zona horaria positiva (y el día
 * siguiente al formatear la hora de la tarde en Santo Domingo).
 */
export const formatDateLocalIso = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/**
 * Días de calendario entre dos fechas ISO (b − a). `null` si alguna es inválida.
 * Vive aquí (y no en un módulo concreto) porque la usan cálculos de mora, CRM,
 * cobranza legal y las métricas de cartera.
 */
export const daysBetweenIso = (aIso: string | null | undefined, bIso: string | null | undefined): number | null => {
  const a = parseIsoDateLocal(aIso || '');
  const b = parseIsoDateLocal(bIso || '');
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
};

/** Igual que `addPeriodsToDate` pero trabajando con cadenas 'YYYY-MM-DD'. */
export const addPeriodsToIsoDate = (
  isoDate: string,
  periods: number,
  frequency?: string | null
): string => {
  const base = parseIsoDateLocal(isoDate);
  if (!base) return isoDate;
  return formatDateLocalIso(addPeriodsToDate(base, periods, frequency));
};

/**
 * Fecha de vencimiento de la PRIMERA cuota: exactamente un período después del inicio.
 * Toda la aplicación (cuotas guardadas, mora, balance, estado de cuenta) asume esto.
 */
export const getFirstDueDateIso = (startDateIso: string, frequency?: string | null): string =>
  addPeriodsToIsoDate(String(startDateIso).split('T')[0], 1, frequency);

/**
 * Cuenta cuántos períodos han VENCIDO (fecha de vencimiento <= `asOfIso`), contando
 * período por período en vez de aproximar con "días / 30".
 *
 * La aproximación por días o por diferencia de meses contaba como vencido un período
 * cuyo día del mes todavía no había llegado (ej.: cuota que vence el 25 y hoy es el 10
 * del mes siguiente), inflando el interés pendiente y la mora.
 */
export const countElapsedPeriods = (
  firstDueDateIso: string,
  asOfIso: string,
  frequency?: string | null,
  maxPeriods = 100000
): number => {
  const first = parseIsoDateLocal(firstDueDateIso);
  if (!first) return 0;
  let count = 0;
  for (let n = 0; n < maxPeriods; n++) {
    if (formatDateLocalIso(addPeriodsToDate(first, n, frequency)) > asOfIso) break;
    count = n + 1;
  }
  return count;
};
