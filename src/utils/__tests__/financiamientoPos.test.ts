// ============================================================================
// FINANCIAR UNA VENTA: LA TASA SE ESCRIBE ANUAL
// ============================================================================
// CAMBIO SOLICITADO (2026-11-17): "a la hora de hacer una venta y seleccionar una parte en
// financiamiento, la tasa la está dividiendo según la frecuencia, cuando debe ser siempre
// dividida anual. Si la tasa está dividida anual y la frecuencia es mensual es un %, si pasa a
// ser quincenal la tasa % debe cambiar. Fíjate en cómo está cuando vas a crear un préstamo y
// cómo trabaja la tasa ahí y aplícalo".
//
// LO QUE HACÍA: el número escrito se cobraba TAL CUAL en cada cuota —20 % por quincena si la
// frecuencia era quincenal— y además se guardaba en `loans.interest_rate`, que todo el sistema
// lee como MENSUAL. El préstamo que nacía de la venta cobraba una tasa distinta de la que se le
// había enseñado al cliente, y sus cuotas vencían de mes en mes aunque fuera quincenal.
import { describe, it, expect } from 'vitest';

import { computePosFinancing } from '../posFinancing';
import { fromAnnualRate, getPeriodRate } from '../frequencyUtils';

const MONTO = 12000;
const ANUAL = 24;          // 24% anual = 2% mensual

describe('la tasa del financiamiento es anual', () => {

  it('Se guarda mensual, como en el formulario de préstamo', () => {
    const plan = computePosFinancing({
      amount: MONTO, annualRate: ANUAL, periods: 6, frequency: 'monthly', amortizationType: 'simple',
    });
    expect(plan.monthlyRate).toBe(fromAnnualRate(ANUAL));   // 2
    expect(plan.monthlyRate).toBe(2);
  });

  it('La misma tasa anual cobra distinto según la frecuencia', () => {
    const mensual = computePosFinancing({ amount: MONTO, annualRate: ANUAL, periods: 6, frequency: 'monthly' });
    const quincenal = computePosFinancing({ amount: MONTO, annualRate: ANUAL, periods: 6, frequency: 'biweekly' });
    const semanal = computePosFinancing({ amount: MONTO, annualRate: ANUAL, periods: 6, frequency: 'weekly' });
    const diario = computePosFinancing({ amount: MONTO, annualRate: ANUAL, periods: 6, frequency: 'daily' });

    // La mensual es la de referencia; la quincenal, la mitad; la semanal, un cuarto; la diaria, 1/30.
    expect(mensual.periodRate).toBeCloseTo(0.02, 10);
    expect(quincenal.periodRate).toBeCloseTo(0.01, 10);
    expect(semanal.periodRate).toBeCloseTo(0.005, 10);
    expect(diario.periodRate).toBeCloseTo(0.02 / 30, 10);

    // Y la tasa GUARDADA no cambia: siempre es la mensual.
    for (const plan of [mensual, quincenal, semanal, diario]) {
      expect(plan.monthlyRate).toBe(2);
    }
  });

  it('El interés de cada cuota sale de la tasa del período', () => {
    const quincenal = computePosFinancing({
      amount: MONTO, annualRate: ANUAL, periods: 6, frequency: 'biweekly', amortizationType: 'simple',
    });
    // 12,000 × 1% = 120 por quincena (antes: 12,000 × 24% = 2,880 por quincena).
    expect(quincenal.installments[0].interest).toBe(120);
    expect(quincenal.installments[0].principal).toBe(2000);
    expect(quincenal.payment).toBe(2120);
    expect(quincenal.totalAmount).toBe(12720);
  });

  it('Lo que hacía antes: cobrar el número escrito en cada cuota', () => {
    const comoAntes = Math.round((MONTO * ANUAL / 100) * 100) / 100;   // 2,880 por quincena
    const ahora = computePosFinancing({
      amount: MONTO, annualRate: ANUAL, periods: 6, frequency: 'biweekly',
    }).installments[0].interest;
    expect(comoAntes).toBe(2880);
    expect(ahora).toBe(120);
  });

  it('La cuenta coincide con la del formulario de préstamo', () => {
    const plan = computePosFinancing({
      amount: MONTO, annualRate: ANUAL, periods: 10, frequency: 'weekly', amortizationType: 'simple',
    });
    // Como lo haría el préstamo: capital/plazo + capital × getPeriodRate(mensual, frecuencia).
    const interesEsperado = Math.round(MONTO * getPeriodRate(fromAnnualRate(ANUAL), 'weekly') * 100) / 100;
    expect(plan.installments[0].interest).toBe(interesEsperado);
    expect(plan.installments[0].principal).toBe(1200);
  });
});

describe('el cuadro de cuotas respeta la amortización elegida', () => {

  it('Simple: capital e interés fijos', () => {
    const plan = computePosFinancing({
      amount: 12000, annualRate: 24, periods: 6, frequency: 'monthly', amortizationType: 'simple',
    });
    expect(plan.installments).toHaveLength(6);
    for (const c of plan.installments) {
      expect(c.principal).toBe(2000);
      expect(c.interest).toBe(240);
    }
    expect(plan.totalAmount).toBe(13440);
  });

  it('Francesa: cuota fija, capital creciente', () => {
    const plan = computePosFinancing({
      amount: 12000, annualRate: 24, periods: 6, frequency: 'monthly', amortizationType: 'french',
    });
    const cuotas = plan.installments;
    expect(cuotas).toHaveLength(6);
    // Todas las cuotas valen (casi) lo mismo y el capital va subiendo.
    for (const c of cuotas.slice(0, -1)) expect(Math.abs(c.total - plan.payment)).toBeLessThan(0.02);
    expect(cuotas[5].principal).toBeGreaterThan(cuotas[0].principal);
    expect(cuotas[5].interest).toBeLessThan(cuotas[0].interest);
    // El capital suma el monto financiado.
    expect(Math.round(cuotas.reduce((s, c) => s + c.principal, 0) * 100) / 100).toBe(12000);
  });

  it('Alemana: capital fijo, cuota decreciente', () => {
    const plan = computePosFinancing({
      amount: 12000, annualRate: 24, periods: 6, frequency: 'monthly', amortizationType: 'german',
    });
    const cuotas = plan.installments;
    for (const c of cuotas) expect(c.principal).toBe(2000);
    expect(cuotas[0].interest).toBe(240);     // sobre 12,000
    expect(cuotas[5].interest).toBe(40);      // sobre 2,000
    expect(cuotas[5].total).toBeLessThan(cuotas[0].total);
  });

  it('Americana: solo interés y el capital al final', () => {
    const plan = computePosFinancing({
      amount: 12000, annualRate: 24, periods: 6, frequency: 'monthly', amortizationType: 'american',
    });
    const cuotas = plan.installments;
    for (const c of cuotas.slice(0, -1)) {
      expect(c.principal).toBe(0);
      expect(c.interest).toBe(240);
    }
    expect(cuotas[5].principal).toBe(12000);
    expect(plan.totalAmount).toBe(13440);
  });

  it('El capital de las cuotas siempre suma el monto financiado', () => {
    for (const tipo of ['simple', 'french', 'german', 'american']) {
      for (const freq of ['monthly', 'biweekly', 'weekly', 'daily']) {
        const plan = computePosFinancing({
          amount: 9999.99, annualRate: 18, periods: 7, frequency: freq, amortizationType: tipo,
        });
        const capital = Math.round(plan.installments.reduce((s, c) => s + c.principal, 0) * 100) / 100;
        expect(capital, `${tipo}/${freq}`).toBe(9999.99);
      }
    }
  });

  it('Sin monto, sin plazo o sin tasa no inventa cuotas', () => {
    expect(computePosFinancing({ amount: 0, annualRate: 24, periods: 6, frequency: 'monthly' }).installments).toHaveLength(0);
    expect(computePosFinancing({ amount: 1000, annualRate: 24, periods: 0, frequency: 'monthly' }).installments).toHaveLength(0);

    const sinTasa = computePosFinancing({ amount: 1200, annualRate: 0, periods: 6, frequency: 'monthly' });
    expect(sinTasa.totalAmount).toBe(1200);
    expect(sinTasa.payment).toBe(200);
    expect(sinTasa.totalInterest).toBe(0);
  });
});
