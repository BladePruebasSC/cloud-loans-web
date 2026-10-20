// ============================================================================
// FIJAR LA CUOTA EN UN PRÉSTAMO DE PLAZO INDEFINIDO
// ============================================================================
// FALLO REPORTADO (2026-10-20): "en los préstamos indefinidos no me permite fijar la cuota, se
// queda con el monto calculado por la tasa".
//
// El caso: 45,000 al 36% anual, mensual, con FIJAR CUOTA marcado y 1,400 escrito. La tabla
// seguía enseñando 1,350 —45,000 × 3%— y la tasa se quedaba en el 36% de antes.
//
// POR QUÉ: la tasa se derivaba de la cuota con el cálculo de los préstamos A PLAZO
// (`cuota × períodos − capital`), que antes de nada exige que la cuota cubra `capital / plazo`.
// Un indefinido no reparte capital —su plazo vale 1—, así que 1,400 contra 45,000 nunca pasaba
// ese filtro: la función salía sin tocar la tasa y el cronograma seguía con la vieja.
//
// En un indefinido la cuota es SOLO interés, así que la vuelta es directa:
// `tasaDelPeríodo = cuota / capital`.
import { describe, it, expect } from 'vitest';

import {
  getFrequencyRateFactor, getPeriodRate, monthlyRateFromIndefiniteQuota, toAnnualRate,
} from '@/utils/frequencyUtils';

/** Réplica del cálculo A PLAZO, el que se usaba antes también en los indefinidos. */
const comoAntes = (capital: number, cuota: number, periodos: number, frecuencia: string) => {
  // El filtro que lo bloqueaba todo en un indefinido (plazo = 1).
  if (cuota < capital / periodos) return null;
  const interesTotal = cuota * periodos - capital;
  const tasaPeriodo = (interesTotal / capital) / periodos;
  return (tasaPeriodo / getFrequencyRateFactor(frecuencia)) * 100;
};

describe('cuota fija en préstamos de plazo indefinido', () => {

  it('El caso reportado: 45,000 con cuota de 1,400 al mes', () => {
    const tasaMensual = monthlyRateFromIndefiniteQuota(45000, 1400, 'monthly');

    expect(tasaMensual).toBeCloseTo(3.111111, 6);
    expect(toAnnualRate(tasaMensual)).toBe(37.33);

    // Y con esa tasa, la cuota del período vuelve a ser la que se fijó.
    expect(Math.round(45000 * getPeriodRate(tasaMensual, 'monthly') * 100) / 100).toBe(1400);
  });

  it('Antes no se podía: el cálculo a plazo rechazaba la cuota', () => {
    // Con plazo 1 —lo que vale un indefinido— la cuota tendría que cubrir los 45,000 enteros.
    expect(comoAntes(45000, 1400, 1, 'monthly')).toBeNull();
    // Y la tasa se quedaba en la de antes, que daba 1,350 en vez de 1,400.
    expect(Math.round(45000 * getPeriodRate(3, 'monthly') * 100) / 100).toBe(1350);
  });

  it('La frecuencia se respeta: la tasa guardada es MENSUAL', () => {
    // Diario: 100 al día sobre 45,000 es una tasa diaria de 0.2222%, que en mensual es 30 veces.
    const diaria = monthlyRateFromIndefiniteQuota(45000, 100, 'daily');
    expect(diaria).toBeCloseTo(6.666667, 6);
    expect(Math.round(45000 * getPeriodRate(diaria, 'daily') * 100) / 100).toBe(100);

    // Quincenal: la cuota es media mensualidad de interés.
    const quincenal = monthlyRateFromIndefiniteQuota(45000, 700, 'biweekly');
    expect(quincenal).toBeCloseTo(3.111111, 6);
    expect(Math.round(45000 * getPeriodRate(quincenal, 'biweekly') * 100) / 100).toBe(700);

    // Semanal.
    const semanal = monthlyRateFromIndefiniteQuota(45000, 350, 'weekly');
    expect(semanal).toBeCloseTo(3.111111, 6);
    expect(Math.round(45000 * getPeriodRate(semanal, 'weekly') * 100) / 100).toBe(350);
  });

  it('Ida y vuelta: la cuota que se fija es la cuota que sale', () => {
    const casos: Array<[number, number, string]> = [
      [10000, 500, 'monthly'],
      [25000, 1234.56, 'monthly'],
      [100000, 1000, 'weekly'],
      [7500, 50, 'daily'],
      [60000, 2500, 'biweekly'],
    ];
    for (const [capital, cuota, frecuencia] of casos) {
      const tasa = monthlyRateFromIndefiniteQuota(capital, cuota, frecuencia);
      const devuelta = Math.round(capital * getPeriodRate(tasa, frecuencia) * 100) / 100;
      expect(devuelta, `${capital} / ${cuota} / ${frecuencia}`).toBe(cuota);
    }
  });

  it('Sin monto o sin cuota no se inventa una tasa', () => {
    expect(monthlyRateFromIndefiniteQuota(0, 1400, 'monthly')).toBe(0);
    expect(monthlyRateFromIndefiniteQuota(45000, 0, 'monthly')).toBe(0);
    expect(monthlyRateFromIndefiniteQuota(-45000, 1400, 'monthly')).toBe(0);
    expect(monthlyRateFromIndefiniteQuota(45000, -1400, 'monthly')).toBe(0);
    expect(monthlyRateFromIndefiniteQuota(NaN as any, 1400, 'monthly')).toBe(0);
  });

  it('Una cuota mayor que el capital no rompe nada (tasa alta, pero válida)', () => {
    const tasa = monthlyRateFromIndefiniteQuota(1000, 1500, 'monthly');
    expect(tasa).toBe(150);
    expect(Math.round(1000 * getPeriodRate(tasa, 'monthly') * 100) / 100).toBe(1500);
  });
});
