// ============================================================================
// Cobros cuando un CARGO cae el mismo día que una cuota
// ============================================================================
// FALLO REPORTADO (2026-10-01): "revisa ese préstamo que marca que solo se ha pagado 1 cuota,
// pero se han pagado como 6". Préstamo indefinido quincenal: cargo de RD$1,500 con vencimiento
// 15-sep —la MISMA fecha que la primera cuota— y cinco pagos (1,500 del cargo y cuatro de 525).
// "Ver cuotas" decía: 1 pagada, 2 pendientes, y la cuota del 15-sep ni aparecía.
//
// DOS CAUSAS, las dos por tratar la FECHA como si fuera del cargo:
//   1. al generar los períodos se SALTABA el que caía en la fecha de un cargo, así que la cuota
//      del 15-sep desaparecía de la tabla y la numeración se corría (la del 29-sep salía "#1");
//   2. todo lo cobrado ese día se daba por pagado al cargo. Como el cargo solo valía 1,500, los
//      RD$1,575 de más se perdían: ni saldaban cuotas ni bajaban el balance.
//
// AQUÍ se separa bien: de cada fecha, los CARGOS cobran primero —hasta lo que valen— y el resto
// es dinero de cuotas, que se reparte en cascada entre los períodos pendientes, del más antiguo
// al más nuevo.

const round2 = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;
const dateOnly = (v: unknown) => String(v ?? '').split('T')[0];

export interface PaymentRowLike {
  due_date?: string | null;
  amount?: number | null;
  principal_amount?: number | null;
  interest_amount?: number | null;
  payment_date?: string | null;
  superseded_at?: string | null;
  status?: string | null;
}

/**
 * ¿El pago es de un CARGO? Lleva capital y no lleva interés.
 *
 * Un pago SIN desglose (capital 0 e interés 0, como los guarda el pago normal en un período
 * generado) NO es de cargo: es de cuota. Antes bastaba con "no tiene interés" y esos pagos se
 * daban por cobrados al cargo.
 */
export const isChargePayment = (p: PaymentRowLike): boolean => {
  const principal = Number(p?.principal_amount) || 0;
  const interest = Number(p?.interest_amount) || 0;
  return principal > 0.005 && Math.abs(interest) < 0.01;
};

/** Monto de un pago: lo cobrado, o la suma del desglose si viniera vacío. */
export const paymentGross = (p: PaymentRowLike): number => {
  const amount = Number(p?.amount) || 0;
  if (amount > 0.005) return round2(amount);
  return round2((Number(p?.principal_amount) || 0) + (Number(p?.interest_amount) || 0));
};

export interface RegularPaidEntry {
  /** Fecha de vencimiento con la que se registró el pago */
  dueDate: string;
  amount: number;
  /** Día en que se cobró (para enseñar "Fecha de pago") */
  paidDate: string | null;
}

export interface SplitResult {
  /** Lo cobrado a los CARGOS de cada fecha (nunca más de lo que valen) */
  chargePaidByDue: Map<string, number>;
  /** El resto: dinero de cuotas regulares, con su fecha */
  regular: RegularPaidEntry[];
}

/**
 * Reparte lo cobrado entre los CARGOS de cada fecha y las cuotas regulares.
 *
 * `chargeTotalByDue` es cuánto suman los cargos de cada fecha. Lo que se cobre de más en una
 * fecha con cargos es dinero de cuotas, no se pierde.
 */
export const splitChargeAndRegularPayments = (
  payments: PaymentRowLike[],
  chargeTotalByDue: Map<string, number>,
): SplitResult => {
  const chargePaidByDue = new Map<string, number>();
  const regular: RegularPaidEntry[] = [];

  const vivos = (payments || []).filter(p => {
    if (p?.superseded_at) return false;                       // anulado por una extensión de plazo
    return String(p?.status || '').toLowerCase() !== 'failed'; // un pago fallido no cobró nada
  });

  // Primero los pagos que SÍ son de cargo, en orden de cobro: llenan los cargos de su fecha.
  const porFecha = new Map<string, PaymentRowLike[]>();
  for (const p of vivos) {
    const due = dateOnly(p?.due_date);
    if (!due) continue;
    const list = porFecha.get(due);
    if (list) list.push(p); else porFecha.set(due, [p]);
  }

  for (const [due, lista] of porFecha) {
    const chargeTotal = round2(chargeTotalByDue.get(due) || 0);
    let chargeRoom = chargeTotal;
    const ordenados = [...lista].sort((a, b) => {
      // Los pagos de cargo primero, y dentro de cada grupo por fecha de cobro.
      const ca = isChargePayment(a) ? 0 : 1;
      const cb = isChargePayment(b) ? 0 : 1;
      if (ca !== cb) return ca - cb;
      return String(a?.payment_date || '').localeCompare(String(b?.payment_date || ''));
    });

    for (const p of ordenados) {
      const gross = paymentGross(p);
      if (gross <= 0.005) continue;
      let resto = gross;

      if (chargeRoom > 0.005 && isChargePayment(p)) {
        const aplicado = round2(Math.min(chargeRoom, resto));
        chargePaidByDue.set(due, round2((chargePaidByDue.get(due) || 0) + aplicado));
        chargeRoom = round2(chargeRoom - aplicado);
        resto = round2(resto - aplicado);
      }

      if (resto > 0.005) {
        regular.push({ dueDate: due, amount: resto, paidDate: dateOnly(p?.payment_date) || null });
      }
    }
  }

  return { chargePaidByDue, regular };
};

export interface PeriodLike {
  dueDate: string;
  /** Lo que vale ese período */
  expected: number;
}

export interface PeriodPaid {
  paid: number;
  lastPaidDate: string | null;
}

/**
 * Reparte el dinero de cuotas entre los períodos, EN CASCADA: cada período cobra primero lo que
 * se registró con su fecha y, lo que sobre, pasa al siguiente pendiente.
 *
 * Así un cliente que paga de más (o que paga con la fecha de otro período) va saldando cuotas en
 * orden, que es como se cobra una deuda.
 */
export const allocatePaymentsToPeriods = (
  periods: PeriodLike[],
  entries: RegularPaidEntry[],
): { paidByPeriod: Map<string, PeriodPaid>; leftover: number } => {
  const paidByPeriod = new Map<string, PeriodPaid>();
  const ordenados = [...(periods || [])].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const cola = [...(entries || [])]
    .filter(e => (Number(e?.amount) || 0) > 0.005)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate)
      || String(a.paidDate || '').localeCompare(String(b.paidDate || '')));

  let i = 0;
  let restoEntrada = cola.length > 0 ? round2(cola[0].amount) : 0;

  for (const period of ordenados) {
    let falta = round2(Math.max(0, Number(period.expected) || 0));
    let paid = 0;
    let lastPaidDate: string | null = null;

    while (falta > 0.005 && i < cola.length) {
      const toma = round2(Math.min(falta, restoEntrada));
      if (toma > 0.005) {
        paid = round2(paid + toma);
        falta = round2(falta - toma);
        restoEntrada = round2(restoEntrada - toma);
        lastPaidDate = cola[i].paidDate || lastPaidDate;
      }
      if (restoEntrada <= 0.005) {
        i++;
        restoEntrada = i < cola.length ? round2(cola[i].amount) : 0;
      }
    }

    paidByPeriod.set(period.dueDate, { paid, lastPaidDate });
  }

  let leftover = restoEntrada > 0.005 ? restoEntrada : 0;
  for (let j = i + 1; j < cola.length; j++) leftover = round2(leftover + cola[j].amount);
  return { paidByPeriod, leftover: round2(leftover) };
};
