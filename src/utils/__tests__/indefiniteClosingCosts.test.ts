// Gastos de cierre en prestamos de PLAZO INDEFINIDO.
//
// FALLO REPORTADO (2026-09-04): prestamo indefinido de 100,000 al 36% anual (3% mensual) con
// 5,000 de gastos de cierre MARCADOS como financiados. La tabla mostraba "A pagar 8,150"
// cuando la cuota de un indefinido es solo interes: 3,150.
//
// CAUSA: la rama de indefinidos de `calculateAmortization` sumaba `closing_costs` EN CRUDO a
// la cuota, sin mirar si estaban financiados. Todas las demas ramas usan
// `closingCostsAsCharge`, que ya vale 0 cuando se financian. Resultado: los 5,000 se cobraban
// DOS VECES —dentro del capital (por eso el interes sube de 3,000 a 3,150) y otra vez enteros
// encima de la cuota.
//
// Lo delataba comparar las dos casillas: financiado daba 8,150 y sin financiar 8,000. Marcar
// "financiar" nunca puede salir mas caro en la PRIMERA cuota; su coste esta en el interes,
// repartido en el tiempo.
import { describe, it, expect } from 'vitest';

import { getPeriodRate } from '@/utils/frequencyUtils';

const ok = (name: string, cond: unknown, detail = '') =>
  expect(cond, detail ? `${name} — ${detail}` : name).toBe(true);

const r2 = (v: number) => Math.round(v * 100) / 100;

interface Entradas {
  solicitado: number;
  tasaMensual: number;
  frecuencia: string;
  gastosCierre: number;
  financiados: boolean;
}

/** Replica de la rama de indefinidos tras la correccion. */
const cuotaIndefinida = ({ solicitado, tasaMensual, frecuencia, gastosCierre, financiados }: Entradas) => {
  const capital = financiados ? r2(solicitado + gastosCierre) : solicitado;
  const cargo = financiados ? 0 : gastosCierre;   // <- `closingCostsAsCharge`
  const interes = r2(capital * getPeriodRate(tasaMensual, frecuencia));
  return { capital, interes, aPagar: r2(interes + cargo), cargo };
};

/** La version vieja: sumaba `closing_costs` en crudo, financiados o no. */
const cuotaVieja = ({ solicitado, tasaMensual, frecuencia, gastosCierre, financiados }: Entradas) => {
  const capital = financiados ? r2(solicitado + gastosCierre) : solicitado;
  const interes = r2(capital * getPeriodRate(tasaMensual, frecuencia));
  return { capital, interes, aPagar: r2(interes + gastosCierre) };
};

const BASE = { solicitado: 100000, tasaMensual: 3, frecuencia: 'monthly', gastosCierre: 5000 };

describe('gastos de cierre en prestamos indefinidos', () => {

  it('El caso reportado: financiados, la cuota es SOLO interes', () => {
    const r = cuotaIndefinida({ ...BASE, financiados: true });

    ok('el capital sube a 105,000', r.capital === 105000, String(r.capital));
    ok('el interes sube a 3,150', r.interes === 3150, String(r.interes));
    ok('a pagar son 3,150, no 8,150', r.aPagar === 3150, String(r.aPagar));
    ok('no queda cargo aparte', r.cargo === 0);

    const vieja = cuotaVieja({ ...BASE, financiados: true });
    ok('la version vieja daba 8,150', vieja.aPagar === 8150, String(vieja.aPagar));
    ok('cobraba los 5,000 dos veces', r2(vieja.aPagar - r.aPagar) === 5000);
  });

  it('Sin financiar, el cargo si se suma a la cuota', () => {
    const r = cuotaIndefinida({ ...BASE, financiados: false });
    ok('el capital NO cambia', r.capital === 100000, String(r.capital));
    ok('el interes es 3,000', r.interes === 3000, String(r.interes));
    ok('a pagar 8,000 (interes + cargo)', r.aPagar === 8000, String(r.aPagar));
    ok('el cargo va aparte', r.cargo === 5000);
  });

  it('Financiar NUNCA encarece la primera cuota', () => {
    // Es la comprobacion que delataba el fallo: financiado salia MAS caro (8,150 contra
    // 8,000), que es justo lo contrario de lo que significa financiar.
    const conFinanciar = cuotaIndefinida({ ...BASE, financiados: true });
    const sinFinanciar = cuotaIndefinida({ ...BASE, financiados: false });

    ok('financiado cuesta menos hoy', conFinanciar.aPagar < sinFinanciar.aPagar,
      `${conFinanciar.aPagar} vs ${sinFinanciar.aPagar}`);
    // Lo que se paga de mas al financiar es el interes sobre esos 5,000, cada periodo.
    ok('el sobrecoste es el interes de los gastos',
      r2(conFinanciar.interes - sinFinanciar.interes) === 150,
      String(r2(conFinanciar.interes - sinFinanciar.interes)));
  });

  it('Sin gastos de cierre, las dos casillas dan lo mismo', () => {
    const sinGastos = { ...BASE, gastosCierre: 0 };
    ok('financiado', cuotaIndefinida({ ...sinGastos, financiados: true }).aPagar === 3000);
    ok('sin financiar', cuotaIndefinida({ ...sinGastos, financiados: false }).aPagar === 3000);
  });

  it('El factor de frecuencia se sigue aplicando al capital financiado', () => {
    // 105,000 al 3% mensual: quincenal la mitad, diario 1/30.
    ok('quincenal', cuotaIndefinida({ ...BASE, frecuencia: 'biweekly', financiados: true }).interes === 1575);
    ok('semanal', cuotaIndefinida({ ...BASE, frecuencia: 'weekly', financiados: true }).interes === 787.5);
    ok('diario', cuotaIndefinida({ ...BASE, frecuencia: 'daily', financiados: true }).interes === 105);
    // Y en todas, la cuota sigue siendo solo interes.
    for (const f of ['biweekly', 'weekly', 'daily']) {
      const r = cuotaIndefinida({ ...BASE, frecuencia: f, financiados: true });
      ok(`${f}: a pagar = interes`, r.aPagar === r.interes, `${r.aPagar} vs ${r.interes}`);
    }
  });
});
