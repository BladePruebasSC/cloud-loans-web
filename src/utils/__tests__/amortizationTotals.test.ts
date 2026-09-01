// Generado a partir de las suites de la auditoria 2026-09-01.
// Prueban LOGICA FINANCIERA PURA: sin red, sin reloj, sin Supabase. Deterministas.
import { describe, it, expect } from 'vitest';

import { sumAmortizationTotals } from '@/utils/amortizationTotals';

/** Adapta el estilo `ok(nombre, condicion, detalle)` de las suites originales. */
const ok = (name: string, cond: unknown, detail = '') =>
  expect(cond, detail ? `${name} — ${detail}` : name).toBe(true);

describe("amortizationTotals", () => {

const r2 = (v) => Math.round(v * 100) / 100;

/**
 * Construye el cronograma 'simple' como lo hace LoanForm.
 *
 * Los gastos de cierre NO financiados se suman a la ULTIMA cuota, y van INTEGROS a capital:
 * se guardan como cuota-cargo con `principal_amount = total_amount` e `interest_amount = 0`.
 * Financiados, ya estan dentro del capital y no se suman aparte.
 */
const buildSimple = ({ amount, rate, periods, monthsEquivalent, closing = 0, financed = false }) => {
  const capital = financed ? r2(amount + closing) : amount;
  const totalInterest = capital * (rate / 100) * monthsEquivalent;
  const interestPer = totalInterest / periods;
  const principalPer = capital / periods;
  const paymentPer = interestPer + principalPer;
  const closingAsCharge = financed ? 0 : closing;

  return Array.from({ length: periods }, (_, i) => {
    const isLast = i === periods - 1;
    return {
      interest: interestPer,
      principal: isLast ? principalPer + closingAsCharge : principalPer,
      totalPayment: isLast ? paymentPer + closingAsCharge : paymentPer,
    };
  });
};

  it("IMAGEN 1: 10,000 al 20% mensual, 6 cuotas, sin gastos de cierre", () => {
  {
    const rows = buildSimple({ amount: 10000, rate: 20, periods: 6, monthsEquivalent: 6 });
    const t = sumAmortizationTotals(rows);
  
    ok('cada cuota: interes 2,000', r2(rows[0].interest) === 2000, String(r2(rows[0].interest)));
    ok('cada cuota: capital 1,666.67', r2(rows[0].principal) === 1666.67, String(r2(rows[0].principal)));
    ok('cada cuota: a pagar 3,666.67', r2(rows[0].totalPayment) === 3666.67);
  
    ok('TOTAL interes 12,000', t.interest === 12000, String(t.interest));
    ok('TOTAL capital 10,000', t.principal === 10000, String(t.principal));
    ok('TOTAL a pagar 22,000', t.payment === 22000, String(t.payment));
    ok('interes + capital = a pagar', r2(t.interest + t.principal) === t.payment);
  }
  
  });

  it("IMAGEN 2: mismo prestamo + 2,000 de cierre SIN financiar", () => {
  {
    const rows = buildSimple({ amount: 10000, rate: 20, periods: 6, monthsEquivalent: 6, closing: 2000 });
    const t = sumAmortizationTotals(rows);
  
    ok('la ultima cuota lleva el cierre: 5,666.67', r2(rows[5].totalPayment) === 5666.67, String(r2(rows[5].totalPayment)));
    ok('las demas siguen en 3,666.67', r2(rows[0].totalPayment) === 3666.67);

    // El cargo es 100% capital: tambien aparece en la columna CAPITAL de la ultima cuota.
    ok('capital de la ultima: 1,666.67 + 2,000', r2(rows[5].principal) === 3666.67, String(r2(rows[5].principal)));
    ok('las demas siguen en 1,666.67', r2(rows[0].principal) === 1666.67);
    ok('el interes de la ultima NO cambia', r2(rows[5].interest) === 2000, String(r2(rows[5].interest)));

    ok('TOTAL interes 12,000 (el cierre no es interes)', t.interest === 12000, String(t.interest));
    // ANTES mostraba 10,000: el cargo salia en "a pagar" pero no en capital, y la fila de
    // TOTALES no cuadraba consigo misma (12,000 + 10,000 != 24,000).
    ok('TOTAL capital 12,000 (el cierre es capital)', t.principal === 12000, String(t.principal));
    ok('TOTAL a pagar 24,000', t.payment === 24000, String(t.payment));
    ok('AHORA interes + capital = a pagar', r2(t.interest + t.principal) === t.payment,
      `${r2(t.interest + t.principal)} vs ${t.payment}`);
    ok('el total suma la columna en crudo', t.payment === r2(rows.reduce((s, x) => s + x.totalPayment, 0)));
  }
  
  });

  it("IMAGEN 3: 2,000 de cierre FINANCIADOS", () => {
  {
    const rows = buildSimple({ amount: 10000, rate: 20, periods: 6, monthsEquivalent: 6, closing: 2000, financed: true });
    const t = sumAmortizationTotals(rows);
  
    // El capital pasa a 12,000 y el interes corre sobre ese total.
    ok('cada cuota: interes 2,400', r2(rows[0].interest) === 2400, String(r2(rows[0].interest)));
    ok('cada cuota: capital 2,000', r2(rows[0].principal) === 2000, String(r2(rows[0].principal)));
    ok('cada cuota: a pagar 4,400', r2(rows[0].totalPayment) === 4400);
    ok('la ultima NO lleva cargo aparte', r2(rows[5].totalPayment) === 4400, String(r2(rows[5].totalPayment)));
  
    ok('TOTAL interes 14,400', t.interest === 14400, String(t.interest));
    // ANTES: mostraba 10,000, el monto escrito, aunque la columna sumara 12,000.
    ok('TOTAL capital 12,000', t.principal === 12000, String(t.principal));
    ok('TOTAL a pagar 26,400', t.payment === 26400, String(t.payment));
    ok('interes + capital = a pagar', r2(t.interest + t.principal) === t.payment);
  }
  
  });

  it("Los tres casos comparados", () => {
  {
    const sin = sumAmortizationTotals(buildSimple({ amount: 10000, rate: 20, periods: 6, monthsEquivalent: 6 }));
    const aparte = sumAmortizationTotals(buildSimple({ amount: 10000, rate: 20, periods: 6, monthsEquivalent: 6, closing: 2000 }));
    const fin = sumAmortizationTotals(buildSimple({ amount: 10000, rate: 20, periods: 6, monthsEquivalent: 6, closing: 2000, financed: true }));
  
    ok('con cierre aparte se paga 2,000 mas', r2(aparte.payment - sin.payment) === 2000);
    // El cierre aparte SI es capital (el cargo lleva principal = total), pero NO genera interes.
    ok('el cierre aparte suma al capital', r2(aparte.principal - sin.principal) === 2000,
      String(r2(aparte.principal - sin.principal)));
    ok('el cierre aparte NO genera interes', aparte.interest === sin.interest);
    ok('financiado y aparte dan el mismo capital', fin.principal === aparte.principal,
      `${fin.principal} vs ${aparte.principal}`);
    ok('financiado sube el interes', fin.interest > aparte.interest);
    ok('financiado cuesta mas que aparte', fin.payment > aparte.payment,
      `${fin.payment} vs ${aparte.payment}`);
    // La diferencia son los 2,400 de interes sobre los 2,000 financiados
    ok('la diferencia es el interes del cierre', r2(fin.payment - aparte.payment) === 2400,
      String(r2(fin.payment - aparte.payment)));
  }
  
  });

  it("Casos borde", () => {
  {
    const vacio = sumAmortizationTotals([]);
    ok('tabla vacia da ceros', vacio.interest === 0 && vacio.principal === 0 && vacio.payment === 0);
    ok('null no revienta', sumAmortizationTotals(null).payment === 0);
    ok('filas incompletas', sumAmortizationTotals([{}, { interest: 5 }]).interest === 5);
    ok('valores nulos', sumAmortizationTotals([{ interest: null, principal: undefined, totalPayment: 10 }]).payment === 10);
  
    // Se acumula en crudo y se redondea al final: 10,000/6 x 6 debe dar 10,000, no 10,000.02.
    const sextos = Array.from({ length: 6 }, () => ({ interest: 0, principal: 10000 / 6, totalPayment: 10000 / 6 }));
    const t = sumAmortizationTotals(sextos);
    ok('el capital vuelve a ser exactamente 10,000', t.principal === 10000, String(t.principal));
    ok('y no 10,000.02 (redondeo por fila)', t.principal !== 10000.02);
  
    // Un tercio repetido tampoco arrastra decimales
    const tercios = Array.from({ length: 3 }, () => ({ interest: 100 / 3, principal: 0, totalPayment: 100 / 3 }));
    ok('100/3 x 3 = 100', sumAmortizationTotals(tercios).interest === 100,
      String(sumAmortizationTotals(tercios).interest));
  }
  
  
  });
});
