// ============================================================================
// UN CARGO NO REBAJA EL CAPITAL DEL ABONO A CAPITAL
// ============================================================================
// FALLO REPORTADO (2026-11-24): "cuando le agregas un cargo a un préstamo y vas abono a capital
// el monto del cargo se ve reducido".
//
// El formulario calculaba el capital pendiente como `lo prestado − capital cobrado − abonos
// anteriores − CARGOS PENDIENTES`. `loans.amount` es el principal del préstamo y un cargo nunca
// estuvo dentro de él, así que ese último descuento rebajaba un capital que nadie había pagado:
// un cargo de 5,000 bajaba 5,000 el "Capital Pendiente Actual", el máximo que se dejaba abonar
// —con un cargo pendiente no se podía saldar el capital—, la base de la penalidad y el
// `capital_before` que queda GUARDADO en `capital_payments`. Y al guardar el abono las cuotas
// pendientes se reescriben con ese capital, así que el préstamo perdía de su capital justo el
// monto del cargo: el cargo no se cobraba, se descontaba.
//
// Aquí se recorre la misma cadena que el formulario: las cuotas y los pagos → el reparto de
// `computeInstallmentDues` → el capital que se puede abonar → la vista previa del abono.
import { describe, it, expect } from 'vitest';
import { computeInstallmentDues, type DueRow, type RawInstallment, type RawPayment } from '../installmentDues';
import { computeCapitalPaymentPreview, pendingCapitalForPayment } from '../capitalPaymentPreview';
import { resolveIndefiniteCapital } from '../indefiniteInterest';

const round2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;

// ---------------------------------------------------------------------------
// El préstamo de la prueba: 10,000 al 10% mensual, 5 cuotas de 3,000
// (2,000 de capital + 1,000 de interés). La primera cuota está cobrada.
// ---------------------------------------------------------------------------
const VENCIMIENTOS = ['2026-07-05', '2026-08-05', '2026-09-05', '2026-10-05', '2026-11-05'];

const cuotas = (): RawInstallment[] => VENCIMIENTOS.map((due, i) => ({
  id: `c${i + 1}`,
  installment_number: i + 1,
  due_date: due,
  principal_amount: 2000,
  interest_amount: 1000,
  total_amount: 3000,
  paid_amount: i === 0 ? 3000 : 0,
  is_paid: i === 0,
}));

/** El cargo que se le agrega al préstamo: 5,000, sin interés, con su propio vencimiento. */
const CARGO: RawInstallment = {
  id: 'cargo-1',
  installment_number: 6,
  due_date: '2026-11-24',
  principal_amount: 5000,
  interest_amount: 0,
  total_amount: 5000,
  paid_amount: 0,
  is_paid: false,
};

/** El pago de la primera cuota. */
const PAGOS: RawPayment[] = [
  { amount: 3000, principal_amount: 2000, interest_amount: 1000, due_date: '2026-07-05' },
];

/** Lo mismo que hace el formulario: de lo cobrado a cada cuota, primero el interés. */
const capitalCobrado = (rows: DueRow[]): number => round2(rows
  .filter(r => !r.isCharge)
  .reduce((s, r) => s + Math.min(r.principal, Math.max(0, r.paid - r.interest)), 0));

const cargosPendientes = (rows: DueRow[]): number => round2(rows
  .filter(r => r.isCharge)
  .reduce((s, r) => s + r.pending, 0));

/** El capital que el formulario deja abonar, con las cuotas y los pagos que se le pasen. */
const capitalParaAbonar = (
  installments: RawInstallment[], pagos: RawPayment[] = PAGOS, abonosAnteriores = 0,
) => {
  const rows = computeInstallmentDues(installments, pagos);
  return {
    rows,
    capital: pendingCapitalForPayment({
      loanAmount: 10000,
      principalPaidFromInstallments: capitalCobrado(rows),
      previousCapitalPayments: abonosAnteriores,
    }),
    cargos: cargosPendientes(rows),
  };
};

describe('El cargo no toca el capital que se puede abonar', () => {
  it('EL CASO REPORTADO: agregar un cargo de 5,000 no baja el capital', () => {
    const sinCargo = capitalParaAbonar(cuotas());
    const conCargo = capitalParaAbonar([...cuotas(), CARGO]);

    // 10,000 prestados − 2,000 de capital cobrado en la primera cuota.
    expect(sinCargo.capital).toBe(8000);
    expect(conCargo.capital).toBe(8000);   // antes: 3,000
    expect(conCargo.capital).toBe(sinCargo.capital);

    // Y el cargo sigue ahí, pendiente completo: no se tocó.
    expect(conCargo.cargos).toBe(5000);
    expect(sinCargo.cargos).toBe(0);
  });

  it('Con un cargo pendiente se puede saldar TODO el capital', () => {
    // Antes el máximo a abonar era 3,000: el cargo dejaba 5,000 de capital imposibles de pagar.
    const { capital, cargos } = capitalParaAbonar([...cuotas(), CARGO]);
    const previa = computeCapitalPaymentPreview({
      interestRate: 10, frequency: 'monthly', monthlyPayment: 3000,
      pendingCapitalBefore: capital,
      capitalPaymentAmount: capital,
      pendingInstallmentsCount: 4,
      unpaidChargesAmount: cargos,
    });

    expect(previa.exceedsCapital).toBe(false);
    expect(previa.capitalAfter).toBe(0);
    // Saldado el capital, lo que queda debiéndose es el cargo, enterito.
    expect(previa.newBalance).toBe(5000);
  });

  it('El cargo entra en el balance UNA vez, no se desaparece ni se duplica', () => {
    const { capital, cargos } = capitalParaAbonar([...cuotas(), CARGO]);
    const previa = computeCapitalPaymentPreview({
      interestRate: 10, frequency: 'monthly', monthlyPayment: 3000,
      pendingCapitalBefore: capital,
      capitalPaymentAmount: 3000,
      pendingInstallmentsCount: 4,
      unpaidChargesAmount: cargos,
      keepInstallments: true,
    });

    expect(previa.capitalAfter).toBe(5000);              // 8,000 − 3,000
    expect(previa.interestPerInstallment).toBe(500);     // 5,000 al 10% mensual
    expect(previa.interestPending).toBe(2000);           // 4 cuotas
    expect(previa.newBalance).toBe(12000);               // 5,000 + 2,000 + 5,000 de cargo
    // Quitando el cargo queda exactamente el préstamo: ni se perdió ni se contó dos veces.
    expect(round2(previa.newBalance - cargos)).toBe(7000);
  });

  it('La penalidad se calcula sobre el capital de verdad', () => {
    // La penalidad del abono es un % del capital ANTES del abono. Con el fallo, un cargo de
    // 5,000 la rebajaba: 5% de 3,000 = 150 en vez de 5% de 8,000 = 400.
    const { capital } = capitalParaAbonar([...cuotas(), CARGO]);
    expect(round2((capital * 5) / 100)).toBe(400);
  });

  it('Un cargo a medio pagar tampoco lo mueve', () => {
    const pagos: RawPayment[] = [
      ...PAGOS,
      // Abono al cargo: sin interés y con el vencimiento del cargo.
      { amount: 2000, principal_amount: 2000, interest_amount: 0, due_date: '2026-11-24' },
    ];
    const { capital, cargos } = capitalParaAbonar([...cuotas(), CARGO], pagos);

    expect(capital).toBe(8000);   // el capital es el mismo
    expect(cargos).toBe(3000);    // y del cargo quedan 3,000
  });

  it('Dos cargos seguidos siguen sin moverlo', () => {
    const otro: RawInstallment = { ...CARGO, id: 'cargo-2', installment_number: 7, total_amount: 1200, principal_amount: 1200 };
    const { capital, cargos } = capitalParaAbonar([...cuotas(), CARGO, otro]);

    expect(capital).toBe(8000);
    expect(cargos).toBe(6200);
  });
});

describe('Lo que SÍ rebaja el capital', () => {
  it('El capital cobrado en las cuotas', () => {
    const conDosPagadas = cuotas().map((c, i) => (i === 1
      ? { ...c, paid_amount: 3000, is_paid: true }
      : c));
    const pagos: RawPayment[] = [
      ...PAGOS,
      { amount: 3000, principal_amount: 2000, interest_amount: 1000, due_date: '2026-08-05' },
    ];
    const { capital } = capitalParaAbonar([...conDosPagadas, CARGO], pagos);
    expect(capital).toBe(6000);   // 10,000 − 2,000 − 2,000
  });

  it('Los abonos a capital anteriores', () => {
    const { capital } = capitalParaAbonar([...cuotas(), CARGO], PAGOS, 1000);
    expect(capital).toBe(7000);   // 10,000 − 2,000 − 1,000
  });

  it('Nunca baja de cero', () => {
    expect(pendingCapitalForPayment({
      loanAmount: 10000, principalPaidFromInstallments: 8000, previousCapitalPayments: 5000,
    })).toBe(0);
  });
});

describe('Los préstamos indefinidos ya estaban bien', () => {
  it('Su capital sale de los abonos, y un cargo no entra en la cuenta', () => {
    // Un indefinido no suma capital por cuotas: su capital es lo prestado menos los abonos.
    const { currentCapital } = resolveIndefiniteCapital(10000, [
      { amount: 2000, capital_before: 10000, capital_after: 8000, created_at: '2026-10-01T10:00:00Z' },
    ] as any);
    expect(currentCapital).toBe(8000);
  });
});
