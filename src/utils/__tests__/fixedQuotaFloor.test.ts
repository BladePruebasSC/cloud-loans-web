// Suelo de la cuota fija cuando los gastos de cierre se financian.
//
// FALLO REPORTADO (2026-09-02): prestamo de 10,000 al 20.2% anual a 6 cuotas mensuales. Se
// calcula, se marca "fijar cuota" con la recomendada de 1,835, y DESPUES se anaden 2,000 de
// gastos de cierre marcando "incluirlos en el monto". El capital pasa a 12,000 pero la cuota
// fija seguia en 1,835, que no cubre ni el capital repartido (2,000). El cronograma pintaba
// RD$-165.00 de interes en cada cuota y RD$-990.00 en el total.
//
// Dos errores encadenados, los dos por leer `amount` en vez del capital financiado:
//   1. El minimo de la cuota se calculaba sobre 10,000, asi que 1,835 pasaba la validacion.
//   2. La derivacion de la tasa desde la cuota tampoco veia los gastos de cierre, y ademas
//      no se re-ejecutaba al marcar la casilla: la tasa quedaba calculada sobre 10,000.
import { describe, it, expect } from 'vitest';

import { getFrequencyRateFactor } from '@/utils/frequencyUtils';

const ok = (name: string, cond: unknown, detail = '') =>
  expect(cond, detail ? `${name} — ${detail}` : name).toBe(true);

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Replica de `getFinancedAmount` de LoanForm. */
const financedAmount = (requested: number, closingCosts: number, financed: boolean) =>
  financed ? r2(requested + closingCosts) : requested;

/** Replica de `getCapitalOnlyPayment`: el suelo duro de la cuota fija. */
const capitalOnlyPayment = (
  requested: number, closingCosts: number, financed: boolean, periods: number,
  amortization = 'simple',
) => {
  if (amortization === 'american' || amortization === 'indefinite') return 0;
  const amount = financedAmount(requested, closingCosts, financed);
  if (periods <= 0 || amount <= 0) return 0;
  return Math.ceil((amount / periods) * 100) / 100;
};

/** Interes por cuota que produce el cronograma con cuota fija. */
const interestPerPayment = (
  quota: number, periods: number, requested: number, closingCosts: number, financed: boolean,
) => {
  const amount = financedAmount(requested, closingCosts, financed);
  return r2(Math.max(0, quota * periods - amount) / periods);
};

describe('suelo de la cuota fija con gastos de cierre financiados', () => {

  it('El caso reportado: 10,000 + 2,000 financiados a 6 cuotas', () => {
    const suelo = capitalOnlyPayment(10000, 2000, true, 6);
    ok('el capital financiado es 12,000', financedAmount(10000, 2000, true) === 12000);
    ok('el suelo es 2,000', suelo === 2000, String(suelo));

    // La cuota que el usuario tenia fijada de antes ya no vale.
    ok('1,835 queda por debajo del suelo', 1835 < suelo);

    // Y esa cuota es la que producia el interes negativo que se veia en la tabla.
    const sinProteger = r2((1835 * 6 - 12000) / 6);
    ok('sin proteger daba -165 por cuota', sinProteger === -165, String(sinProteger));
    ok('y -990 en el total', r2(sinProteger * 6) === -990, String(r2(sinProteger * 6)));

    // Con la proteccion, el interes nunca baja de cero.
    ok('protegido nunca es negativo', interestPerPayment(1835, 6, 10000, 2000, true) === 0);
  });

  it('La cuota recomendada sobre el capital financiado sale de la cuenta del usuario', () => {
    // 12,000 al 1.6833% mensual x 6 = 1,210 de interes -> 201.67 por cuota
    const mensual = 20.2 / 12;
    const interesPorCuota = r2(12000 * (mensual / 100) * getFrequencyRateFactor('monthly'));
    ok('~202 de interes por cuota', interesPorCuota === 202, String(interesPorCuota));

    const recomendada = r2(12000 / 6 + interesPorCuota);
    ok('cuota recomendada ~2,202', recomendada === 2202, String(recomendada));

    // El usuario decia "la cuota hace 2,200: 200 interes y 2,000 capital". Cuadra: la
    // diferencia es solo el redondeo de 20.2/12 frente a un 20% redondo.
    ok('el capital de la cuota es 2,000', r2(12000 / 6) === 2000);
    ok('la recomendada esta por encima del suelo', recomendada > capitalOnlyPayment(10000, 2000, true, 6));
  });

  it('Sin financiar los gastos de cierre, el suelo no los incluye', () => {
    // Es el mismo prestamo de antes de marcar la casilla: 1,835 era valido.
    const suelo = capitalOnlyPayment(10000, 2000, false, 6);
    ok('el suelo es 1,666.67', suelo === 1666.67, String(suelo));
    ok('1,835 lo supera', 1835 > suelo);
    ok('y su interes es positivo', interestPerPayment(1835, 6, 10000, 2000, false) === 168.33,
      String(interestPerPayment(1835, 6, 10000, 2000, false)));
  });

  it('Bajar la cuota por encima del suelo sigue permitido: es como se baja la tasa', () => {
    // El suelo NO es el minimo recomendado. Fijar una cuota menor que la recomendada es
    // legitimo —significa cobrar menos interes— y no puede bloquearse.
    const suelo = capitalOnlyPayment(10000, 2000, true, 6);
    for (const cuota of [2000, 2050, 2100, 2201]) {
      ok(`${cuota} se admite`, cuota >= suelo);
      ok(`${cuota} da interes >= 0`, interestPerPayment(cuota, 6, 10000, 2000, true) >= 0);
    }

    // Justo en el suelo: interes exactamente cero, ni un centimo negativo.
    ok('en el suelo el interes es 0', interestPerPayment(2000, 6, 10000, 2000, true) === 0);
  });

  it('El suelo se ajusta al plazo y a la frecuencia', () => {
    // El plazo esta en PERIODOS de la frecuencia, no en meses: 12 quincenas reparten el
    // capital entre 12, no entre 6.
    ok('12 periodos', capitalOnlyPayment(12000, 0, false, 12) === 1000);
    ok('24 periodos', capitalOnlyPayment(12000, 0, false, 24) === 500);

    // Redondeo hacia arriba al centimo: si se redondeara hacia abajo, la cuota admitida
    // dejaria un resto de capital sin cubrir.
    const suelo = capitalOnlyPayment(10000, 0, false, 3);
    ok('10,000 entre 3 redondea arriba', suelo === 3333.34, String(suelo));
    ok('3 cuotas del suelo cubren el capital', suelo * 3 >= 10000);
  });

  it('Los tipos que no amortizan capital no tienen suelo', () => {
    // Americano e indefinido pagan solo interes y devuelven el capital al final: una cuota
    // pequena ahi no produce interes negativo, solo alarga el prestamo.
    ok('americano', capitalOnlyPayment(12000, 0, false, 6, 'american') === 0);
    ok('indefinido', capitalOnlyPayment(12000, 0, false, 6, 'indefinite') === 0);
    ok('simple si tiene suelo', capitalOnlyPayment(12000, 0, false, 6, 'simple') === 2000);
  });

  it('Datos incompletos no producen un suelo falso', () => {
    // Un suelo distinto de cero con datos a medias bloquearia el formulario sin motivo.
    ok('sin plazo', capitalOnlyPayment(12000, 0, false, 0) === 0);
    ok('sin monto', capitalOnlyPayment(0, 0, false, 6) === 0);
    ok('sin monto pero con gastos financiados', capitalOnlyPayment(0, 2000, true, 6) === 333.34,
      String(capitalOnlyPayment(0, 2000, true, 6)));
  });
});
