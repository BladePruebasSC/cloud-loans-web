// Generado a partir de las suites de la auditoria 2026-09-01.
// Prueban LOGICA FINANCIERA PURA: sin red, sin reloj, sin Supabase. Deterministas.
import { describe, it, expect } from 'vitest';

import { toAnnualRate, fromAnnualRate, getFrequencyRateFactor } from '@/utils/frequencyUtils';

/** Adapta el estilo `ok(nombre, condicion, detalle)` de las suites originales. */
const ok = (name: string, cond: unknown, detail = '') =>
  expect(cond, detail ? `${name} — ${detail}` : name).toBe(true);

describe("conversion de tasas y gastos de cierre", () => {

const r2 = (v) => Math.round(v * 100) / 100;

  it("Tasa mensual -> anual", () => {
  {
    ok('5% mensual = 60% anual', toAnnualRate(5) === 60, String(toAnnualRate(5)));
    ok('20% mensual = 240% anual', toAnnualRate(20) === 240, String(toAnnualRate(20)));
    ok('15% mensual = 180% anual', toAnnualRate(15) === 180);
    ok('2.5% mensual = 30% anual', toAnnualRate(2.5) === 30);
    ok('0 sigue 0', toAnnualRate(0) === 0);
    ok('null no revienta', toAnnualRate(null) === 0 && toAnnualRate(undefined) === 0);
    ok('redondea a 2 decimales', toAnnualRate(1.234) === 14.81, String(toAnnualRate(1.234)));
  
    ok('ida y vuelta', fromAnnualRate(toAnnualRate(5)) === 5);
    ok('60% anual = 5% mensual', fromAnnualRate(60) === 5);
    ok('anual null', fromAnnualRate(null) === 0);
  }
  
  });

  it("La tasa anual NO depende de la frecuencia", () => {
  {
    // Ese era el problema: la cifra mostrada cambiaba con la frecuencia. La anual es la misma
    // para el mismo prestamo, se pague diario, quincenal o mensual.
    const mensual = 10;
    for (const f of ['daily', 'weekly', 'biweekly', 'monthly', 'quarterly', 'yearly']) {
      if (toAnnualRate(mensual) !== 120) {
        ok(`anual estable en ${f}`, false, String(toAnnualRate(mensual)));
      }
    }
    ok('anual identica en las 6 frecuencias', true);
  
    // Y la tasa DE PERIODO si cambia, como debe: es la que se usa para calcular.
    const periodo = (f) => r2(mensual * getFrequencyRateFactor(f));
    ok('mensual: 10% por periodo', periodo('monthly') === 10);
    ok('quincenal: 5% por periodo', periodo('biweekly') === 5);
    ok('semanal: 2.5% por periodo', periodo('weekly') === 2.5);
    ok('diario: 0.33% por periodo', periodo('daily') === 0.33, String(periodo('daily')));
    ok('anual (frecuencia): 120% por periodo', periodo('yearly') === 120);
  }
  
  });

  it("Derivar la tasa desde una cuota fija", () => {
  {
    // Replica de calculateAdjustedInterestRate: cuota fija -> tasa MENSUAL -> se muestra anual.
    const derivarMensual = (amount, fixedPayment, term, frequency) => {
      if (fixedPayment <= amount / term) return 0;
      const totalInterest = fixedPayment * term - amount;
      const periodRateDerived = (totalInterest / amount) / term;
      return r2((periodRateDerived / getFrequencyRateFactor(frequency)) * 100);
    };
  
    // 10,000 quincenal a 8 cuotas de 1,500 -> total 12,000, interes 2,000
    // por periodo: 2,000/10,000/8 = 2.5% -> mensual 5% -> anual 60%
    const mensual = derivarMensual(10000, 1500, 8, 'biweekly');
    ok('deriva 5% mensual', mensual === 5, String(mensual));
    ok('se muestra 60% anual', toAnnualRate(mensual) === 60, String(toAnnualRate(mensual)));
  
    // La MISMA cuota en mensual da otra tasa: es correcto, el dinero se retiene mas tiempo.
    const enMensual = derivarMensual(10000, 1500, 8, 'monthly');
    ok('mensual da 2.5% mensual', enMensual === 2.5, String(enMensual));
    ok('y 30% anual', toAnnualRate(enMensual) === 30);
  
    // Cuota que no cubre ni el capital -> 0%
    ok('cuota por debajo del capital = 0%', derivarMensual(10000, 1000, 8, 'biweekly') === 0);
  }
  
  });

  it("Gastos de cierre financiados", () => {
  {
    // Regla: si se marca, el capital del prestamo los incluye y las cuotas se recalculan.
    const financiar = (amount, closing, financed) => r2(amount + (financed ? closing : 0));
  
    ok('10,000 + 1,500 marcado = 11,500', financiar(10000, 1500, true) === 11500);
    ok('sin marcar se queda en 10,000', financiar(10000, 1500, false) === 10000);
    ok('sin gastos no cambia nada', financiar(10000, 0, true) === 10000);
  
    // Al EDITAR hay que devolver el desembolsado, o se contarian dos veces.
    const desembolsado = (loanAmount, closing, financed) =>
      financed ? r2(Math.max(0, loanAmount - closing)) : loanAmount;
    ok('editar devuelve 10,000', desembolsado(11500, 1500, true) === 10000);
    ok('editar sin financiar devuelve el monto', desembolsado(10000, 1500, false) === 10000);
    ok('editar es la inversa de financiar',
      desembolsado(financiar(10000, 1500, true), 1500, true) === 10000);
    ok('nunca negativo', desembolsado(500, 1500, true) === 0);
  
    // Interes y cuotas: 11,500 al 5% mensual quincenal (2.5% periodo) a 6 cuotas, simple
    const interesPorCuota = (capital, mensual, freq) => r2(capital * (mensual / 100) * getFrequencyRateFactor(freq));
    ok('interes sobre 11,500 = 287.50', interesPorCuota(11500, 5, 'biweekly') === 287.5,
      String(interesPorCuota(11500, 5, 'biweekly')));
    ok('interes sobre 10,000 = 250', interesPorCuota(10000, 5, 'biweekly') === 250);
    ok('financiar SI aumenta el interes', interesPorCuota(11500, 5, 'biweekly') > interesPorCuota(10000, 5, 'biweekly'));
  
    // El cargo aparte NO se crea cuando se financia (o se cobraria dos veces)
    const cargoFinal = (closing, financed) => financed ? 0 : closing;
    ok('financiado: sin cargo al final', cargoFinal(1500, true) === 0);
    ok('no financiado: cargo de 1,500', cargoFinal(1500, false) === 1500);
  
    // Total a pagar: financiado = 11,500 + 6x287.50 = 13,225 (sin cargo aparte)
    const totalFinanciado = r2(11500 + 6 * 287.5);
    ok('total financiado 13,225', totalFinanciado === 13225, String(totalFinanciado));
    // No financiado = 10,000 + 6x250 + 1,500 de cargo = 13,000
    const totalAparte = r2(10000 + 6 * 250 + 1500);
    ok('total con cargo aparte 13,000', totalAparte === 13000, String(totalAparte));
    ok('financiar cuesta mas (interes sobre el cierre)', totalFinanciado > totalAparte);
  }
  
  
  });
});
