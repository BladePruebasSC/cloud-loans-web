// ============================================================================
// Mora que se MUESTRA y se suma al balance
// ============================================================================
// FALLO REPORTADO (2026-09-18): "fíjate que ahí no hay mora, dice 0.00, pero en Balance
// Pendiente da un monto y en Balance Total Pendiente (balance + mora) da otro diferente. ¿Cómo
// pueden ser diferentes si no hay mora?". Tarjeta: Balance Pendiente RD$35,291.66, Mora Actual
// RD$0.00, Balance Total Pendiente RD$35,704.15.
//
// CAUSA: la tarjeta sumaba `moraCalculada || loans.current_late_fee`. Cuando la mora calculada
// es CERO, `||` la trata como "sin dato" y cae a `current_late_fee`, una columna CACHEADA que
// solo escriben algunos flujos y que se había quedado en RD$412.49. "Mora Actual" (LateFeeInfo)
// enseñaba el cálculo —0— y el total sumaba la columna vieja. Lo mismo pasaba mientras la mora
// estaba recalculándose tras un abono o una actualización de cuotas, y en Detalles con la mora
// DESHABILITADA (se mostraba la columna vieja como "Mora pendiente").
//
// REGLA: la columna cacheada no se usa nunca para mostrar ni para sumar.
//   · mora deshabilitada o préstamo saldado → 0;
//   · calculada (aunque sea 0)             → la calculada;
//   · aún sin calcular                     → null: la pantalla dice "Cargando…".

const round2 = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;

export interface DisplayedLateFeeInput {
  lateFeeEnabled: boolean | null | undefined;
  status?: string | null;
  /** Mora calculada con el motor (`getLateFeeBreakdownFromInstallments`); undefined/null = aún no. */
  computed: number | null | undefined;
}

export const resolveDisplayedLateFee = ({ lateFeeEnabled, status, computed }: DisplayedLateFeeInput): number | null => {
  if (!lateFeeEnabled) return 0;
  if (status === 'paid') return 0;
  if (computed === null || computed === undefined || !Number.isFinite(Number(computed))) return null;
  return round2(Math.max(0, Number(computed)));
};

/**
 * Balance total de la tarjeta = balance pendiente + mora. Si cualquiera de los dos no se ha
 * calculado todavía, null: mejor "Cargando…" que una suma con un dato viejo.
 */
export const totalWithLateFee = (pending: number | null | undefined, lateFee: number | null | undefined): number | null => {
  if (pending === null || pending === undefined || lateFee === null || lateFee === undefined) return null;
  return round2(Number(pending) + Number(lateFee));
};

/**
 * ¿Hay que corregir la columna cacheada `loans.current_late_fee`? La leen la ruta de cobro, las
 * notificaciones, los reportes, el CRM y el módulo legal; si se queda vieja, esas pantallas
 * enseñan una mora que no existe (o esconden una que sí).
 */
export const lateFeeColumnNeedsSync = (
  cached: number | null | undefined,
  displayed: number | null,
): boolean => displayed !== null && Math.abs(round2(Number(cached) || 0) - displayed) > 0.01;
