// Interes que devenga UNA cuota, segun la frecuencia de pago.
//
// FALLO REPORTADO (2026-09-04): el formulario de pago mostraba "Interes Fijo por Cuota:
// RD$83.00" en un prestamo DIARIO cuya cuota real cobra RD$2.77 de interes. Y "Capital por
// Cuota" salia por diferencia (836.11 - 83.00 = 753.11) en vez de los 833.34 reales.
//
// CAUSA: se calculaba `amount * interest_rate / 100`, que es el interes de un MES COMPLETO.
// `loans.interest_rate` es MENSUAL por convencion del sistema: una cuota diaria devenga 1/30
// de esa tasa, una quincenal la mitad, una semanal un cuarto. Sin el factor de frecuencia, un
// prestamo diario mostraba TREINTA VECES el interes real.
//
// El patron estaba repetido en seis sitios del formulario, y uno de ellos —el que decide
// cuantas cuotas se dan por pagadas— ya se habia corregido en la auditoria de 2026-08-28. Los
// otros cinco no.
import { describe, it, expect } from 'vitest';

import { getPeriodRate, getFrequencyRateFactor } from '@/utils/frequencyUtils';

const ok = (name: string, cond: unknown, detail = '') =>
  expect(cond, detail ? `${name} — ${detail}` : name).toBe(true);

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Replica de `interestPerInstallment` de PaymentForm. */
const interesPorCuota = (amount: number, monthlyRate: number, frequency?: string) =>
  amount * getPeriodRate(monthlyRate, frequency);

/** La formula vieja: la tasa mensual entera, sin ajustar a la frecuencia. */
const formulaVieja = (amount: number, monthlyRate: number) => (amount * monthlyRate) / 100;

describe('interes por cuota segun la frecuencia', () => {

  it('El caso reportado: prestamo DIARIO de 10,000 al 0.83% mensual', () => {
    const real = interesPorCuota(10000, 0.83, 'daily');
    ok('la cuota devenga 2.77', r2(real) === 2.77, String(r2(real)));

    const vieja = formulaVieja(10000, 0.83);
    ok('la formula vieja daba 83.00', r2(vieja) === 83, String(r2(vieja)));
    ok('treinta veces mas', r2(vieja / real) === 30, String(r2(vieja / real)));

    // Y el capital por cuota sale por diferencia sobre la cuota de 836.11.
    ok('capital real 833.34', r2(836.11 - real) === 833.34, String(r2(836.11 - real)));
    ok('la vieja daba 753.11', r2(836.11 - vieja) === 753.11, String(r2(836.11 - vieja)));
  });

  it('Cada frecuencia aplica su propio factor', () => {
    // 10,000 al 3% mensual: la cuota mensual devenga 300.
    ok('mensual: 300', r2(interesPorCuota(10000, 3, 'monthly')) === 300);
    ok('quincenal: la mitad', r2(interesPorCuota(10000, 3, 'biweekly')) === 150);
    ok('semanal: un cuarto', r2(interesPorCuota(10000, 3, 'weekly')) === 75);
    ok('diario: 1/30', r2(interesPorCuota(10000, 3, 'daily')) === 10);
    ok('trimestral: el triple', r2(interesPorCuota(10000, 3, 'quarterly')) === 900);
    ok('anual: doce veces', r2(interesPorCuota(10000, 3, 'yearly')) === 3600);

    // La formula vieja devolvia 300 en TODAS: correcto solo en mensual.
    ok('la vieja solo acertaba en mensual',
      r2(formulaVieja(10000, 3)) === r2(interesPorCuota(10000, 3, 'monthly')));
    for (const f of ['daily', 'weekly', 'biweekly', 'quarterly', 'yearly']) {
      ok(`en ${f} se equivocaba`, r2(formulaVieja(10000, 3)) !== r2(interesPorCuota(10000, 3, f)));
    }
  });

  it('Doce cuotas diarias suman el interes total del prestamo', () => {
    // Coherencia con la tabla de cuotas: 12 x 2.7667 = 33.20, y la tabla muestra 12 x 2.77.
    const porCuota = interesPorCuota(10000, 0.83, 'daily');
    ok('12 cuotas suman ~33.20', r2(porCuota * 12) === 33.2, String(r2(porCuota * 12)));
    ok('redondeando por fila da 33.24', r2(r2(porCuota) * 12) === 33.24, String(r2(r2(porCuota) * 12)));
    // Esos 4 centimos de diferencia son el redondeo por cuota, no un error de tasa.
  });

  it('Sin frecuencia se asume mensual, que es el valor por defecto del sistema', () => {
    ok('undefined', r2(interesPorCuota(10000, 3)) === 300);
    ok('vacio', r2(interesPorCuota(10000, 3, '')) === 300);
    ok('desconocida', r2(interesPorCuota(10000, 3, 'lunar')) === 300);
    ok('el factor por defecto es 1', getFrequencyRateFactor(undefined) === 1);
  });

  it('Datos vacios dan cero, no NaN', () => {
    ok('sin monto', interesPorCuota(0, 3, 'daily') === 0);
    ok('sin tasa', interesPorCuota(10000, 0, 'daily') === 0);
    ok('todo cero', interesPorCuota(0, 0, 'daily') === 0);
    ok('no es NaN', Number.isFinite(interesPorCuota(0, 0, 'daily')));
  });
});
