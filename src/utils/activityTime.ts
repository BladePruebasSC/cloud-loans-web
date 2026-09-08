// Sellos de tiempo de la ACTIVIDAD RECIENTE del inicio.
//
// FALLO REPORTADO (2026-09-08): un préstamo creado justo DESPUÉS de su cliente aparecía como
// "hace 9 h" mientras el cliente decía "hace 5 h".
//
// CAUSA: la lista mezcla dos formatos. Unas filas traen el instante completo
// ('2026-09-08T20:00:00+00:00': `clients.created_at`, `loans.created_at`, `loan_history`) y
// otras solo la FECHA ('2026-09-08': `payments.payment_date`, y `loans.start_date` cuando el
// préstamo no tiene `created_at`). Se ordenaba con `localeCompare`, y como la fecha suelta es
// PREFIJO de la forma larga, siempre resultaba "menor": todo lo que no traía hora se hundía por
// debajo de lo del mismo día. Y al pintarlo se le inventaba el mediodía, así que una fecha
// suelta afirmaba una hora que nadie había guardado.
//
// Aquí se resuelven las dos mitades: comparar por instante, y no afirmar una hora que no consta.

const MONTH_ABBR = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** ¿El valor es solo una fecha ('YYYY-MM-DD'), sin hora? */
export const isDateOnly = (at: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(String(at || '').trim());

/**
 * Instante en milisegundos, para ORDENAR.
 *
 * Una fecha sin hora se sitúa al mediodía: es lo único razonable cuando no se guardó la hora, y
 * al menos no la manda al principio ni al final del día por accidente. Un valor ilegible
 * devuelve 0 para que caiga al final en vez de romper el orden.
 */
export const activityInstant = (at: string): number => {
  const raw = String(at || '').trim();
  if (!raw) return 0;
  const d = new Date(isDateOnly(raw) ? `${raw}T12:00:00` : raw);
  const ms = d.getTime();
  return Number.isNaN(ms) ? 0 : ms;
};

/** Fecha corta ('8 sep'), para cuando no consta la hora. */
const shortDate = (at: string): string => {
  const [y, m, d] = String(at).split('-').map(Number);
  if (!y || !m || !d) return '';
  return `${d} ${MONTH_ABBR[m - 1] || ''}`.trim();
};

/**
 * Antigüedad en palabras: "ahora", "hace 12 min", "hace 3 h", "ayer", "hace 5 días", "8 sep".
 *
 * Si el dato es solo una fecha, NO se dice "hace N h": se enseña la fecha. Inventar la hora es
 * justo lo que hacía que un préstamo pareciera creado nueve horas antes que su cliente.
 *
 * @param now Instante de referencia; parametrizado para poder probarlo.
 */
export const formatRelativeTime = (at: string, now: number = Date.now()): string => {
  const raw = String(at || '').trim();
  if (!raw) return '';

  const ms = activityInstant(raw);
  if (!ms) return '';

  // Sin hora guardada: la fecha, y nada más.
  if (isDateOnly(raw)) {
    const days = Math.floor((now - ms) / 86400000);
    if (days <= 0) return 'hoy';
    if (days === 1) return 'ayer';
    if (days < 30) return `hace ${days} días`;
    return shortDate(raw);
  }

  const mins = Math.round((now - ms) / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const days = Math.round(hrs / 24);
  if (days === 1) return 'ayer';
  if (days < 30) return `hace ${days} días`;
  return new Date(ms).toLocaleDateString('es-DO', { day: 'numeric', month: 'short' });
};
