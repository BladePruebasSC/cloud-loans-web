// ============================================================================
// PAGO CON TARJETA EN EL PUNTO DE VENTA: qué se exige y qué se guarda
// ============================================================================
// FALLO REPORTADO (2026-11-25): "cuando seleccionas tarjeta como método de pago en punto de
// venta da error porque pide el titular de la tarjeta, haz que no la pida... porque además no
// hay dónde colocar el titular en el formulario".
//
// Y era así: NO SE PODÍA COBRAR CON TARJETA. El formulario de cada pago solo tiene dos casillas
// —"Tipo" y "Últimos 4"— y la validación del cobro exigía además el nombre del titular. La única
// casilla de titular que existe en el módulo está en un bloque que ya no se dibuja nunca: el de
// `saleData.paymentMethod`, el método único de antes de los pagos partidos, que se quedó "para
// compatibilidad" y solo se pone en `null`. Así que la venta se quedaba trancada en un dato que
// no había forma de escribir.
//
// La base de datos NUNCA lo pidió: `sales.payment_method` solo tiene un CHECK con los nombres de
// los métodos y `sales.payment_details` es un JSONB libre (migración `20261118000000`). No había
// nada que arreglar ahí.
//
// Y DE PASO: lo que sí se escribía tampoco se guardaba. En `payment_details` se grababa solo
// `{method, label, amount}` de cada pago, así que el tipo de tarjeta y los últimos 4 dígitos
// —que la validación sí exige— se tiraban al guardar la venta, igual que el banco y la
// referencia de una transferencia o el número de un cheque. Se exigía un dato para no guardarlo.

export interface CardPaymentDetails {
  cardType?: string | null;
  cardLast4?: string | null;
  /** OPCIONAL: no hay casilla donde escribirlo. Si viene, se guarda; nunca se exige. */
  cardHolderName?: string | null;
}

const texto = (v: unknown): string => String(v ?? '').trim();

/**
 * Qué le falta a un pago con tarjeta para poder cobrarse. `null` = está completo.
 *
 * Se piden las dos cosas que el formulario de verdad tiene: el tipo de tarjeta y los últimos 4
 * dígitos. El titular NO: ver el comentario de arriba.
 */
export const cardPaymentIssue = (details?: CardPaymentDetails | null): string | null => {
  if (!texto(details?.cardType)) {
    return 'Debe especificar el tipo de tarjeta para el pago con tarjeta';
  }
  if (!/^\d{4}$/.test(texto(details?.cardLast4))) {
    return 'Debe especificar los últimos 4 dígitos de la tarjeta';
  }
  return null;
};

/** Las casillas de un pago que se guardan con la venta. Todo opcional: se llena lo que haya. */
export interface SplitDetailsLike {
  cardType?: unknown;
  cardLast4?: unknown;
  cardHolderName?: unknown;
  bankName?: unknown;
  accountNumber?: unknown;
  referenceNumber?: unknown;
  checkNumber?: unknown;
  checkBank?: unknown;
  checkDate?: unknown;
}

export interface PaymentSplitLike {
  method?: { id?: string | null; name?: string | null; type?: string | null } | null;
  amount?: number | null;
  details?: SplitDetailsLike | null;
}

export interface StoredPaymentSplit {
  method: string;
  label: string;
  amount: number;
  /** Lo que identifica el cobro: tarjeta, banco, referencia, cheque. Solo si se llenó. */
  details?: Record<string, string>;
}

const round2 = (v: unknown) => Math.round((Number(v) || 0) * 100) / 100;

/**
 * Los datos de un pago que vale la pena guardar con la venta, para poder cuadrar la caja después:
 * de la tarjeta, el tipo y los últimos 4 (y el titular si alguien lo escribió); de una
 * transferencia, el banco, la cuenta y la referencia; de un cheque, su número, banco y fecha.
 *
 * Lo del financiamiento no entra: el plazo, la tasa y la frecuencia viven en el préstamo que se
 * crea, que es su sitio.
 */
const CAMPOS_A_GUARDAR: (keyof SplitDetailsLike)[] = [
  'cardType', 'cardLast4', 'cardHolderName',
  'bankName', 'accountNumber', 'referenceNumber',
  'checkNumber', 'checkBank', 'checkDate',
];

export const splitDetailsToStore = (
  details?: SplitDetailsLike | null,
): Record<string, string> | undefined => {
  const guardar: Record<string, string> = {};
  for (const campo of CAMPOS_A_GUARDAR) {
    const valor = texto(details?.[campo]);
    if (valor) guardar[campo] = valor;
  }
  return Object.keys(guardar).length > 0 ? guardar : undefined;
};

/**
 * El reparto del cobro tal como se guarda en `sales.payment_details`.
 *
 * Solo los pagos con monto: una fila de 0 es un renglón que el cajero agregó y no usó.
 * Devuelve `null` cuando no hay ninguno, que es lo que la columna espera para "no hay reparto".
 */
export const paymentDetailsForSale = (
  splits: PaymentSplitLike[] | null | undefined,
): StoredPaymentSplit[] | null => {
  const cobros = (splits || []).filter(s => (Number(s?.amount) || 0) > 0.005);
  if (cobros.length === 0) return null;

  return cobros.map(s => {
    const fila: StoredPaymentSplit = {
      method: texto(s.method?.type) || texto(s.method?.id) || 'cash',
      label: texto(s.method?.name),
      amount: round2(s.amount),
    };
    const details = splitDetailsToStore(s.details);
    if (details) fila.details = details;
    return fila;
  });
};
