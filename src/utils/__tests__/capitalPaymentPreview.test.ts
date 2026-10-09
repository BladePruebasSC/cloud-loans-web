// Abono a capital: cuotas vencidas reales y vista previa del balance.
//
// FALLO REPORTADO (2026-10-09): "no tiene cuotas pendientes, pero en abono a capital dice que
// tengo 2 cuotas vencidas; y cuando pongo un monto a abonar, el nuevo balance se vuelve loco".
//
// EL PRÉSTAMO DE LAS CAPTURAS: ROSALYNN, DIARIO, 10,000 al 20% mensual, 30 cuotas de 400
// (333.33 de capital + 66.67 de interés), 18 cobradas, balance 4,800.10, 0 días vencidos.
import { describe, it, expect } from 'vitest';
import {
  computeCapitalPaymentPreview, countOverdueDues, periodInterestFor,
} from '../capitalPaymentPreview';

const PRESTAMO = {
  amortizationType: 'simple',
  interestRate: 20,        // MENSUAL
  frequency: 'daily',
  monthlyPayment: 400,
  pendingCapitalBefore: 4000,   // 10,000 − 18 × 333.33
  pendingInstallmentsCount: 12, // #19 a #30
  unpaidChargesAmount: 0,
};

describe('El interés de una cuota respeta la frecuencia', () => {
  it('La cuota diaria de este préstamo devenga 66.67, no 2,000', () => {
    expect(periodInterestFor(10000, 20, 'daily')).toBe(66.67);
    // La fórmula vieja, `capital × tasa / 100`, daba la tasa de un mes entero:
    expect(10000 * 20 / 100).toBe(2000);
  });

  it('Cada frecuencia usa su factor', () => {
    expect(periodInterestFor(10000, 3, 'monthly')).toBe(300);
    expect(periodInterestFor(10000, 3, 'biweekly')).toBe(150);
    expect(periodInterestFor(10000, 3, 'weekly')).toBe(75);
    expect(periodInterestFor(10000, 3, 'daily')).toBe(10);
  });
});

describe('Vista previa del abono a capital (plazo fijo)', () => {
  it('EL CASO REPORTADO: abonar 1,000 BAJA el balance, no lo dispara', () => {
    const r = computeCapitalPaymentPreview({ ...PRESTAMO, capitalPaymentAmount: 1000 });

    expect(r.capitalAfter).toBe(3000);
    expect(r.interestPerInstallment).toBe(20);     // 3,000 × 20% / 30 días. Antes: 600
    expect(r.newInstallmentCount).toBe(8);         // 3,000 / (400 − 20) = 7.9 → 8
    expect(r.removedInstallments).toBe(4);
    expect(r.interestPending).toBe(160);           // 8 × 20
    expect(r.newBalance).toBe(3160);               // antes daba más de 10,000
    expect(r.newBalance).toBeLessThan(4800);       // y el balance SIEMPRE baja
  });

  it('Manteniendo el número de cuotas, baja el monto de cada una', () => {
    const r = computeCapitalPaymentPreview({ ...PRESTAMO, capitalPaymentAmount: 1000, keepInstallments: true });

    expect(r.newInstallmentCount).toBe(12);
    expect(r.interestPerInstallment).toBe(20);
    expect(r.newInstallmentAmount).toBe(270);      // 3,000/12 = 250 de capital + 20 de interés
    expect(r.newBalance).toBe(3240);               // 3,000 + 12 × 20
    expect(r.newInstallmentAmount).toBeLessThan(PRESTAMO.monthlyPayment);
  });

  it('Abonar TODO el capital deja el balance en los cargos pendientes', () => {
    const r = computeCapitalPaymentPreview({ ...PRESTAMO, capitalPaymentAmount: 4000, unpaidChargesAmount: 500 });
    expect(r.capitalAfter).toBe(0);
    expect(r.newInstallmentCount).toBe(0);
    expect(r.removedInstallments).toBe(12);
    expect(r.newBalance).toBe(500);
  });

  it('Los cargos pendientes se siguen debiendo', () => {
    const r = computeCapitalPaymentPreview({ ...PRESTAMO, capitalPaymentAmount: 1000, unpaidChargesAmount: 1500 });
    expect(r.newBalance).toBe(4660); // 3,000 + 160 + 1,500
  });

  it('Un abono mayor que el capital pendiente se rechaza', () => {
    const r = computeCapitalPaymentPreview({ ...PRESTAMO, capitalPaymentAmount: 9000 });
    expect(r.exceedsCapital).toBe(true);
  });

  it('El balance nunca sube: con cualquier abono queda por debajo del actual', () => {
    const balanceHoy = 4800;
    for (const abono of [100, 500, 1000, 2000, 3999]) {
      const r = computeCapitalPaymentPreview({ ...PRESTAMO, capitalPaymentAmount: abono });
      expect(r.newBalance, `abono ${abono}`).toBeLessThan(balanceHoy);
      const sinAbono = computeCapitalPaymentPreview({ ...PRESTAMO, capitalPaymentAmount: 0.01 });
      expect(r.newBalance, `abono ${abono}`).toBeLessThanOrEqual(sinAbono.newBalance);
    }
  });
});

describe('Vista previa en un indefinido', () => {
  it('La cuota de interés baja con el capital', () => {
    // 35,000 al 1.5% quincenal con cuota de 525: ratio = 525/35,000
    const r = computeCapitalPaymentPreview({
      amortizationType: 'indefinite', interestRate: 1.5, frequency: 'biweekly', monthlyPayment: 525,
      pendingCapitalBefore: 35000, capitalPaymentAmount: 5000, pendingInstallmentsCount: 0,
      indefiniteRatio: 525 / 35000,
    });
    expect(r.capitalAfter).toBe(30000);
    expect(r.interestPerInstallment).toBe(450);
    expect(r.newBalance).toBe(30450); // capital + el período que está corriendo
  });
});

describe('Cuotas vencidas de verdad', () => {
  // Hoy 9 oct. Cuotas #15 a #18 (5 a 8 oct) COBRADAS hoy, #19 en adelante pendientes.
  const DUES = [
    { dueDate: '2026-10-05', pending: 0, isCharge: false },
    { dueDate: '2026-10-06', pending: 0, isCharge: false },
    { dueDate: '2026-10-07', pending: 0, isCharge: false },
    { dueDate: '2026-10-08', pending: 0, isCharge: false },
    { dueDate: '2026-10-09', pending: 400, isCharge: false },
    { dueDate: '2026-10-10', pending: 400, isCharge: false },
  ];

  it('EL CASO REPORTADO: no hay ninguna vencida, igual que dice la tarjeta', () => {
    expect(countOverdueDues(DUES, '2026-10-09', 2)).toBe(0);
  });

  it('Si esas cuotas NO se hubieran cobrado, sí habría vencidas', () => {
    const sinCobrar = DUES.map(d => ({ ...d, pending: 400 }));
    // Con 2 días de gracia: 5, 6 y 7 de oct (4, 3 y 2 días) → solo las de más de 2 días.
    expect(countOverdueDues(sinCobrar, '2026-10-09', 2)).toBe(2);
    expect(countOverdueDues(sinCobrar, '2026-10-09', 0)).toBe(4);
  });

  it('Una cuota que vence hoy no está vencida', () => {
    expect(countOverdueDues([{ dueDate: '2026-10-09', pending: 400 }], '2026-10-09', 0)).toBe(0);
  });

  it('Sin cuotas o sin fecha no revienta', () => {
    expect(countOverdueDues([], '2026-10-09', 2)).toBe(0);
    expect(countOverdueDues(null, '2026-10-09', 2)).toBe(0);
    expect(countOverdueDues([{ dueDate: '', pending: 100 }], '2026-10-09', 0)).toBe(0);
  });
});
