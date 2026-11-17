// ============================================================================
// FINANCIAR UNA VENTA DEL PUNTO DE VENTA
// ============================================================================
// CAMBIO SOLICITADO (2026-11-17): "a la hora de estar haciendo una venta y seleccionar una parte
// en financiamiento, la tasa la está dividiendo según la frecuencia, cuando debe ser siempre
// dividida anual: sin importar la frecuencia, la tasa debe dividirse anual. Si la tasa está
// dividida anual y la frecuencia es mensual es un %, si pasa a ser quincenal la tasa % debe
// cambiar. Fíjate en cómo está cuando vas a crear un préstamo y cómo trabaja la tasa ahí y
// aplícalo a cuando se está realizando un financiamiento".
//
// CÓMO FUNCIONA EN EL FORMULARIO DE PRÉSTAMO (y ahora también aquí):
//   · el usuario ESCRIBE la tasa ANUAL, que es la única comparable entre frecuencias;
//   · `loans.interest_rate` GUARDA la mensual (anual ÷ 12);
//   · el interés de cada período es `capital × tasa mensual × factor de la frecuencia`
//     (quincenal = ½, semanal = ¼, diario = 1/30), que es `getPeriodRate`.
//
// Lo que hacía el punto de venta: tomaba el número escrito y lo cobraba TAL CUAL en cada cuota
// —20 % por quincena si la frecuencia era quincenal— y lo guardaba además como tasa mensual, así
// que el préstamo que nacía de esa venta cobraba una tasa distinta de la que se le enseñó al
// cliente.
//
// El PLAZO va en períodos de la frecuencia, igual que `loans.term_months` (12 quincenas, no 12
// meses), y las cuotas se fechan con la frecuencia, no de mes en mes.

import { fromAnnualRate, getPeriodRate, normalizeFrequency } from './frequencyUtils';

const round2 = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;

export type PosAmortizationType = 'simple' | 'french' | 'german' | 'american';

export interface PosFinancingInput {
  /** Monto a financiar. */
  amount: number;
  /** Tasa ANUAL en %, tal como se escribe en la pantalla. */
  annualRate: number;
  /** Plazo en PERÍODOS de la frecuencia (12 quincenas, 6 meses…). */
  periods: number;
  frequency: string | null | undefined;
  amortizationType?: string | null;
}

export interface PosFinancingInstallment {
  number: number;
  principal: number;
  interest: number;
  total: number;
}

export interface PosFinancingPlan {
  /** La que se guarda en `loans.interest_rate` (mensual, como todo el sistema). */
  monthlyRate: number;
  /** Tasa del período en tanto por uno (lo que de verdad se cobra cada cuota). */
  periodRate: number;
  /** Cuota del período (la primera, en las que decrecen). */
  payment: number;
  /** Capital + interés de todo el plazo. */
  totalAmount: number;
  /** Interés de todo el plazo. */
  totalInterest: number;
  installments: PosFinancingInstallment[];
}

const normalizeType = (value?: string | null): PosAmortizationType => {
  const t = String(value || 'simple').toLowerCase();
  return (t === 'french' || t === 'german' || t === 'american') ? t : 'simple';
};

/**
 * El cuadro de un financiamiento: cuota, total y cada una de sus cuotas.
 *
 * Las cuatro amortizaciones se calculan como en el formulario de préstamo, para que el préstamo
 * que se crea desde la venta tenga el mismo cuadro que uno creado a mano con esos datos. Antes
 * solo se distinguía "francesa" de "todo lo demás": una venta financiada a la alemana o a la
 * americana guardaba el tipo pero generaba cuotas de amortización simple.
 */
export const computePosFinancing = (input: PosFinancingInput): PosFinancingPlan => {
  const amount = round2(Number(input.amount) || 0);
  const periods = Math.max(0, Math.floor(Number(input.periods) || 0));
  const frequency = normalizeFrequency(input.frequency);
  const type = normalizeType(input.amortizationType);

  // Anual → mensual (lo que se guarda) → tasa del período (lo que se cobra).
  const monthlyRate = fromAnnualRate(Number(input.annualRate) || 0);
  const periodRate = getPeriodRate(monthlyRate, frequency);

  const vacio: PosFinancingPlan = {
    monthlyRate, periodRate, payment: 0, totalAmount: amount, totalInterest: 0, installments: [],
  };
  if (amount <= 0.005 || periods <= 0) return vacio;

  const installments: PosFinancingInstallment[] = [];

  if (type === 'french' && periodRate > 0) {
    // Cuota fija: capital creciente, interés decreciente.
    const factor = Math.pow(1 + periodRate, periods);
    const cuota = round2((amount * periodRate * factor) / (factor - 1));
    let saldo = amount;
    for (let i = 1; i <= periods; i++) {
      const interes = round2(saldo * periodRate);
      const capital = round2(Math.min(saldo, cuota - interes));
      saldo = round2(saldo - capital);
      installments.push({ number: i, principal: capital, interest: interes, total: round2(capital + interes) });
    }
  } else if (type === 'german') {
    // Capital fijo, interés sobre el saldo: la cuota baja cada período.
    const capital = round2(amount / periods);
    let saldo = amount;
    for (let i = 1; i <= periods; i++) {
      const interes = round2(saldo * periodRate);
      const capitalCuota = i === periods ? round2(saldo) : capital;
      saldo = round2(saldo - capitalCuota);
      installments.push({ number: i, principal: capitalCuota, interest: interes, total: round2(capitalCuota + interes) });
    }
  } else if (type === 'american') {
    // Solo interés; el capital, entero en la última.
    const interes = round2(amount * periodRate);
    for (let i = 1; i <= periods; i++) {
      const capital = i === periods ? amount : 0;
      installments.push({ number: i, principal: capital, interest: interes, total: round2(capital + interes) });
    }
  } else {
    // Simple: capital e interés fijos, el interés sobre el monto financiado.
    const interes = round2(amount * periodRate);
    const capital = round2(amount / periods);
    for (let i = 1; i <= periods; i++) {
      // La última cuota se lleva el redondeo para que el capital sume exactamente el monto.
      const capitalCuota = i === periods
        ? round2(amount - capital * (periods - 1))
        : capital;
      installments.push({ number: i, principal: capitalCuota, interest: interes, total: round2(capitalCuota + interes) });
    }
  }

  const totalInterest = round2(installments.reduce((s, c) => s + c.interest, 0));
  const totalPrincipal = round2(installments.reduce((s, c) => s + c.principal, 0));

  return {
    monthlyRate,
    periodRate,
    payment: installments.length > 0 ? installments[0].total : 0,
    totalAmount: round2(totalPrincipal + totalInterest),
    totalInterest,
    installments,
  };
};
