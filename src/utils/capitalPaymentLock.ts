// ============================================================================
// QUÉ PAGOS BLOQUEA UN ABONO A CAPITAL
// ============================================================================
// LA REGLA (2026-10-19): "después de realizar el abono a capital no debe permitir eliminar pagos
// previos a este, pero lo demás debe trabajar como siempre".
//
// Un abono a capital se calcula sobre el capital que quedaba TRAS los pagos que había en ese
// momento: borrar uno de esos pagos dejaría el abono apoyado en un historial que ya no existe.
// Los pagos REGISTRADOS DESPUÉS del abono no entraron en esa cuenta, así que se eliminan como
// cualquier otro.
//
// FALLO REPORTADO (2026-10-19): "cuando haces un abono a capital ahora no te deja eliminar
// pagos, ni después del abono ni antes".
//
// POR QUÉ PASABA: se le preguntaba a la base por abonos con `created_at > instante del pago`, y
// ese "instante del pago" salía de la primera de tres columnas que trajera la fila:
//   · `created_at`          — lo pone la BASE, en UTC;
//   · `payment_time_local`  — lo escribe el NAVEGADOR (`new Date('2026-10-19T14:30:00')`, que se
//                             interpreta en la zona horaria del EQUIPO);
//   · `payment_date`        — una fecha suelta, sin hora, a la que se le ponía el final del día.
// Tres relojes distintos para la misma comparación. En un equipo que no esté en la hora de Santo
// Domingo, `payment_time_local` cae hasta cuatro horas por detrás del instante real, así que un
// abono ANTERIOR parecía posterior y el pago recién hecho no había forma de borrarlo.
//
// CÓMO SE COMPARA AHORA: primero por DÍA en Santo Domingo, que es lo único que las tres columnas
// cuentan igual. Solo dentro del MISMO día se miran las horas, y únicamente cuando las dos salen
// del MISMO reloj (`created_at` en el pago y en el abono). Si no se puede demostrar que el pago
// es anterior al abono, NO se bloquea: un bloqueo de más deja al usuario sin salida, y el
// histórico sigue protegido por la otra regla, la de "solo se puede eliminar el último pago".

export interface PaymentForCapitalLock {
  /** Instante que pone la base al insertar. Es el que manda. */
  created_at?: string | null;
  /** Instante que escribe el navegador. Respaldo. */
  payment_time_local?: string | null;
  /** Día del cobro, sin hora. Último respaldo. */
  payment_date?: string | null;
}

export interface CapitalPaymentForLock {
  created_at?: string | null;
}

export interface CapitalPaymentLock {
  /** El pago es anterior a un abono a capital: no se puede eliminar. */
  locked: boolean;
  /** Día del abono que lo bloquea (YYYY-MM-DD), para poder decirlo en pantalla. */
  capitalPaymentDay: string | null;
}

const SANTO_DOMINGO = 'America/Santo_Domingo';

// 'en-CA' da el día en formato YYYY-MM-DD, que es el que usa toda la aplicación.
const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: SANTO_DOMINGO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Día (YYYY-MM-DD) en Santo Domingo de un sello de tiempo o de una fecha suelta. */
export const santoDomingoDay = (value?: string | null): string | null => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  // Una fecha suelta YA es un día: convertirla de zona horaria la correría 24 horas.
  const soloFecha = /^(\d{4}-\d{2}-\d{2})$/.exec(raw);
  if (soloFecha) return soloFecha[1];

  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) {
    const recorte = raw.split('T')[0];
    return /^\d{4}-\d{2}-\d{2}$/.test(recorte) ? recorte : null;
  }
  return dayFormatter.format(new Date(ms));
};

/** El sello de tiempo del pago que mejor representa CUÁNDO se registró. */
export const paymentInstantValue = (p: PaymentForCapitalLock | null | undefined): string | null =>
  p?.created_at || p?.payment_time_local || p?.payment_date || null;

const msOf = (value?: string | null): number | null => {
  const ms = Date.parse(String(value ?? ''));
  return Number.isFinite(ms) ? ms : null;
};

/**
 * ¿Este pago quedó "debajo" de un abono a capital? Solo entonces no se puede eliminar.
 *
 * No consulta la base: recibe los abonos del préstamo ya leídos.
 */
export function capitalPaymentLockFor(
  payment: PaymentForCapitalLock | null | undefined,
  capitalPayments: CapitalPaymentForLock[] | null | undefined,
): CapitalPaymentLock {
  const paymentDay = santoDomingoDay(paymentInstantValue(payment));
  if (!paymentDay) return { locked: false, capitalPaymentDay: null };

  for (const abono of capitalPayments || []) {
    const abonoDay = santoDomingoDay(abono?.created_at);
    if (!abonoDay) continue;                 // Un abono sin fecha no bloquea nada.
    if (paymentDay > abonoDay) continue;     // El pago es de un día POSTERIOR: no le afecta.
    if (paymentDay < abonoDay) {
      return { locked: true, capitalPaymentDay: abonoDay };
    }

    // Mismo día: la hora solo vale si las dos salen del mismo reloj (el de la base).
    const pagoMs = msOf(payment?.created_at);
    const abonoMs = msOf(abono?.created_at);
    if (pagoMs !== null && abonoMs !== null && pagoMs < abonoMs) {
      return { locked: true, capitalPaymentDay: abonoDay };
    }
  }

  return { locked: false, capitalPaymentDay: null };
}
