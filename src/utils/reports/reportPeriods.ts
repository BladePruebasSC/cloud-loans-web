// ============================================================================
// PERÍODOS de los reportes, en hora de Santo Domingo
// ============================================================================
// El módulo de reportes anterior armaba los rangos con `new Date().toISOString()`, que es hora
// UTC: en República Dominicana (UTC-4) eso significa que a partir de las 8:00 p.m. el "hoy" del
// reporte ya era el día siguiente, y un cobro de esta tarde se contaba en el día equivocado.
// Aquí todo sale de `getCurrentDateInSantoDomingo`, que es el reloj que usa el resto del sistema.
//
// Un período es un par de fechas INCLUSIVAS en formato YYYY-MM-DD. Se comparan como texto, que
// con ese formato es lo mismo que compararlas como fechas y no depende de zonas horarias.

import { getCurrentDateInSantoDomingo } from '../dateUtils';

export interface Period {
  startDate: string;
  endDate: string;
}

export type PeriodPresetId =
  | 'today' | 'yesterday' | 'week' | 'month' | 'lastMonth' | 'quarter' | 'year' | 'all' | 'custom';

export interface PeriodPreset {
  id: PeriodPresetId;
  label: string;
  /** null = lo escribe el usuario */
  resolve: ((todayIso: string) => Period) | null;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Fecha local (año, mes 1-12, día) → YYYY-MM-DD. */
export const isoFrom = (year: number, month: number, day: number): string =>
  `${year}-${pad(month)}-${pad(day)}`;

/** Hoy en Santo Domingo. */
export const todayInSantoDomingo = (): string => {
  const d = getCurrentDateInSantoDomingo();
  return isoFrom(d.getFullYear(), d.getMonth() + 1, d.getDate());
};

const parse = (iso: string): { y: number; m: number; d: number } => {
  const [y, m, d] = String(iso || '').split('T')[0].split('-').map(Number);
  return { y: y || 1970, m: m || 1, d: d || 1 };
};

/** Suma (o resta) días a una fecha ISO sin pasar por zonas horarias. */
export const addDays = (iso: string, days: number): string => {
  const { y, m, d } = parse(iso);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + days);
  return isoFrom(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
};

/** Días entre dos fechas ISO (b − a). */
export const daysBetween = (a: string, b: string): number => {
  const pa = parse(a); const pb = parse(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86400000);
};

/** Último día del mes de una fecha. */
export const endOfMonth = (iso: string): string => {
  const { y, m } = parse(iso);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return isoFrom(y, m, last);
};

/** Lunes de la semana de `iso` (la semana laboral dominicana empieza el lunes). */
export const startOfWeek = (iso: string): string => {
  const { y, m, d } = parse(iso);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = date.getUTCDay(); // 0 = domingo
  const back = dow === 0 ? 6 : dow - 1;
  return addDays(iso, -back);
};

/** La fecha más antigua que tiene sentido pedir: sirve de "desde siempre". */
export const BEGINNING_OF_TIME = '2000-01-01';

export const PERIOD_PRESETS: PeriodPreset[] = [
  { id: 'today', label: 'Hoy', resolve: today => ({ startDate: today, endDate: today }) },
  {
    id: 'yesterday', label: 'Ayer',
    resolve: today => ({ startDate: addDays(today, -1), endDate: addDays(today, -1) }),
  },
  { id: 'week', label: 'Esta semana', resolve: today => ({ startDate: startOfWeek(today), endDate: today }) },
  {
    id: 'month', label: 'Este mes',
    resolve: today => ({ startDate: isoFrom(parse(today).y, parse(today).m, 1), endDate: today }),
  },
  {
    id: 'lastMonth', label: 'Mes pasado',
    resolve: today => {
      const { y, m } = parse(today);
      const py = m === 1 ? y - 1 : y;
      const pm = m === 1 ? 12 : m - 1;
      const start = isoFrom(py, pm, 1);
      return { startDate: start, endDate: endOfMonth(start) };
    },
  },
  {
    id: 'quarter', label: 'Trimestre',
    resolve: today => {
      const { y, m } = parse(today);
      const firstMonth = m - ((m - 1) % 3);
      return { startDate: isoFrom(y, firstMonth, 1), endDate: today };
    },
  },
  { id: 'year', label: 'Este año', resolve: today => ({ startDate: isoFrom(parse(today).y, 1, 1), endDate: today }) },
  { id: 'all', label: 'Todo', resolve: today => ({ startDate: BEGINNING_OF_TIME, endDate: today }) },
  { id: 'custom', label: 'Personalizado', resolve: null },
];

export const resolvePreset = (id: PeriodPresetId, todayIso: string = todayInSantoDomingo()): Period | null => {
  const preset = PERIOD_PRESETS.find(p => p.id === id);
  return preset?.resolve ? preset.resolve(todayIso) : null;
};

/**
 * El período ANTERIOR equivalente, para comparar.
 *
 * Un mes natural completo se compara con el mes natural anterior (septiembre vs. agosto, aunque
 * uno tenga 30 días y el otro 31). Cualquier otro rango se compara con el mismo número de días
 * justo antes: así "los últimos 7 días" se miden contra los 7 anteriores.
 */
export const previousPeriod = (period: Period): Period => {
  const { startDate, endDate } = period;
  const s = parse(startDate);
  const esMesCompleto = s.d === 1 && endDate === endOfMonth(startDate);

  if (esMesCompleto) {
    const py = s.m === 1 ? s.y - 1 : s.y;
    const pm = s.m === 1 ? 12 : s.m - 1;
    const start = isoFrom(py, pm, 1);
    return { startDate: start, endDate: endOfMonth(start) };
  }

  const dias = Math.max(0, daysBetween(startDate, endDate));
  const prevEnd = addDays(startDate, -1);
  return { startDate: addDays(prevEnd, -dias), endDate: prevEnd };
};

export interface PeriodProblem {
  /** Impide consultar */
  blocking: boolean;
  message: string;
}

/** Revisa el período antes de consultar: fechas válidas, orden y futuro. */
export const validatePeriod = (period: Period, todayIso: string = todayInSantoDomingo()): PeriodProblem | null => {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(period.startDate || '') || !re.test(period.endDate || '')) {
    return { blocking: true, message: 'Las fechas deben tener el formato día/mes/año.' };
  }
  if (period.startDate > period.endDate) {
    return { blocking: true, message: 'La fecha inicial no puede ser posterior a la final.' };
  }
  if (period.startDate > todayIso) {
    return { blocking: false, message: 'El período empieza en el futuro: todavía no hay movimientos que mostrar.' };
  }
  if (period.endDate > todayIso) {
    return { blocking: false, message: 'El período llega al futuro; solo se cuenta lo registrado hasta hoy.' };
  }
  return null;
};

/** ¿La fecha cae dentro del período? (ambos extremos incluidos) */
export const inPeriod = (dateIso: string | null | undefined, period: Period): boolean => {
  const d = String(dateIso || '').split('T')[0];
  if (!d) return false;
  return d >= period.startDate && d <= period.endDate;
};

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** "5 de octubre de 2026" */
export const formatLongDate = (iso: string): string => {
  const { y, m, d } = parse(iso);
  return `${d} de ${MESES[Math.min(11, Math.max(0, m - 1))]} de ${y}`;
};

/** "Del 1 al 31 de octubre de 2026" — para el encabezado del reporte impreso. */
export const describePeriod = (period: Period): string => {
  if (period.startDate === period.endDate) return formatLongDate(period.startDate);
  if (period.startDate === BEGINNING_OF_TIME) return `Hasta el ${formatLongDate(period.endDate)}`;
  const a = parse(period.startDate); const b = parse(period.endDate);
  if (a.y === b.y && a.m === b.m) {
    return `Del ${a.d} al ${b.d} de ${MESES[a.m - 1]} de ${a.y}`;
  }
  if (a.y === b.y) {
    return `Del ${a.d} de ${MESES[a.m - 1]} al ${b.d} de ${MESES[b.m - 1]} de ${a.y}`;
  }
  return `Del ${formatLongDate(period.startDate)} al ${formatLongDate(period.endDate)}`;
};

export interface Variation {
  current: number;
  previous: number;
  /** Diferencia absoluta */
  delta: number;
  /** Variación porcentual; null cuando el período anterior fue 0 (no hay porcentaje posible) */
  percent: number | null;
  direction: 'up' | 'down' | 'flat';
}

/** Comparación entre dos valores, con el signo y el porcentaje listos para enseñar. */
export const compareValues = (current: number, previous: number): Variation => {
  const cur = Number(current) || 0;
  const prev = Number(previous) || 0;
  const delta = Math.round((cur - prev) * 100) / 100;
  const percent = Math.abs(prev) > 0.005 ? Math.round((delta / Math.abs(prev)) * 1000) / 10 : null;
  return {
    current: cur, previous: prev, delta, percent,
    direction: Math.abs(delta) < 0.005 ? 'flat' : delta > 0 ? 'up' : 'down',
  };
};

/** "+12.4%" / "−8%" / "sin cambio" / "nuevo" (cuando antes era 0). */
export const describeVariation = (v: Variation): string => {
  if (v.direction === 'flat') return 'sin cambio';
  if (v.percent === null) return v.direction === 'up' ? 'nuevo' : 'sin actividad';
  const signo = v.percent > 0 ? '+' : '−';
  return `${signo}${Math.abs(v.percent).toLocaleString('es-DO', { maximumFractionDigits: 1 })}%`;
};
