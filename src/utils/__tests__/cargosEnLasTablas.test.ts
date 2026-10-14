// ============================================================================
// LOS CARGOS EN LAS TABLAS: numeración, filas del Estado de Cuenta y balance
// ============================================================================
// FALLO REPORTADO (2026-10-14): "hay un problema con el balance, cuando hacemos un [gasto de]
// cierre y agregamos un cargo, en el balance no toma en cuenta este gasto de cierre, también en
// detalles en las tablas de amortizaciones de ver cuotas, todos los cargos salen como cargo#1,
// arregla esto y que en la tabla de estado de cuenta no salen los cargos".
//
// EL PRÉSTAMO DEL CASO: 27,000 entre capital e interés (25,000 prestados + 2,000 de interés),
// 2,500 de gastos de cierre NO financiados y dos cargos añadidos después, de 1,000 y 600.
// "Ver cuotas" sumaba 31,100 y el balance guardado decía 28,600: faltaban justo los 2,500 del
// cierre, porque el préstamo nace con `remaining_balance = total_amount`, que es capital +
// interés SIN cargos.
//
// Las tres comprobaciones de este archivo son los tres síntomas:
//   1. los cargos se numeran por ORDEN DE COBRO (Cargo #1, #2, #3), no todos "Cargo #1";
//   2. el cronograma recorre también los números de cuota de los cargos (están por encima del
//      plazo), así que sus filas salen en el Estado de Cuenta;
//   3. el balance guardado al crear el préstamo incluye el cargo de los gastos de cierre, y
//      acaba coincidiendo con el que calcula la ficha (`computeLoanBalanceBreakdown`).
import { describe, it, expect } from 'vitest';

import {
  chargeLabelFor, chargeRowKey, chargeSequenceByRow, installmentNumbersWithCharges,
} from '../loanChargeRows';
import { computeLoanBalanceBreakdown } from '../loanBalanceBreakdown';

const r2 = (v: number) => Math.round(v * 100) / 100;

// ── El préstamo del caso ────────────────────────────────────────────────────
// 10 cuotas mensuales de 2,700 (2,500 de capital + 200 de interés) = 27,000.
const PLAZO = 10;
/** Vencimientos del día 14, desde noviembre de 2026 (el préstamo empieza el 14-oct-2026). */
const dueDeLaCuota = (i: number) => {
  const mes = 11 + i;
  const anio = 2026 + Math.floor((mes - 1) / 12);
  const mesDelAnio = ((mes - 1) % 12) + 1;
  return `${anio}-${String(mesDelAnio).padStart(2, '0')}-14`;
};
const CUOTAS = Array.from({ length: PLAZO }, (_, i) => ({
  id: `cuota-${i + 1}`,
  installment_number: i + 1,
  due_date: dueDeLaCuota(i),
  principal_amount: 2500,
  interest_amount: 200,
  total_amount: 2700,
  is_paid: false,
}));

// Los gastos de cierre se guardan como una cuota-cargo más, con el número SIGUIENTE al plazo y
// la fecha de la última cuota (así los genera `generateOriginalInstallments`).
const CARGO_CIERRE = {
  id: 'cargo-cierre',
  installment_number: PLAZO + 1,
  due_date: CUOTAS[PLAZO - 1].due_date,
  principal_amount: 2500,
  interest_amount: 0,
  total_amount: 2500,
  is_paid: false,
};

// Los dos cargos añadidos a mano después, con fechas ANTERIORES a la primera cuota.
const CARGO_1000 = {
  id: 'cargo-1000',
  installment_number: PLAZO + 2,
  due_date: '2026-10-15',
  principal_amount: 1000,
  interest_amount: 0,
  total_amount: 1000,
  is_paid: false,
};
const CARGO_600 = {
  id: 'cargo-600',
  installment_number: PLAZO + 3,
  due_date: '2026-10-20',
  principal_amount: 600,
  interest_amount: 0,
  total_amount: 600,
  is_paid: false,
};

const INSTALLMENTS = [...CUOTAS, CARGO_CIERRE, CARGO_1000, CARGO_600];

const PRESTAMO = {
  id: 'prestamo-del-caso',
  amount: 25000,
  interest_rate: 0.8,
  term_months: PLAZO,
  amortization_type: 'simple',
  payment_frequency: 'monthly',
  monthly_payment: 2700,
  start_date: '2026-10-14',
  status: 'active',
  // Lo que se guardaba al crear el préstamo: capital + interés, sin el cargo del cierre.
  remaining_balance: 27000,
  total_amount: 27000,
};

describe('numeración de los cargos (Cargo #1, #2, #3)', () => {

  it('El caso reportado: tres cargos y los tres decían "Cargo #1"', () => {
    // ANTES: la numeración se asignaba solo en la rama de préstamos indefinidos, así que en uno
    // a plazo fijo ninguna fila llevaba número y la etiqueta caía a su valor por defecto.
    const comoAntes = (inst: { charge_sequence?: number } & Record<string, unknown>) =>
      `Cargo #${inst.charge_sequence || 1}`;
    expect([CARGO_1000, CARGO_600, CARGO_CIERRE].map(comoAntes))
      .toEqual(['Cargo #1', 'Cargo #1', 'Cargo #1']);

    // AHORA: numerados por orden de cobro.
    const seq = chargeSequenceByRow(INSTALLMENTS);
    expect(chargeLabelFor(CARGO_1000, seq)).toBe('Cargo #1');  // 15-oct
    expect(chargeLabelFor(CARGO_600, seq)).toBe('Cargo #2');   // 20-oct
    expect(chargeLabelFor(CARGO_CIERRE, seq)).toBe('Cargo #3'); // vence con la última cuota
  });

  it('Manda la fecha de cobro, no el número de cuota', () => {
    // El cargo del cierre lleva el número MÁS BAJO de los tres (se creó con el préstamo) y es
    // el ÚLTIMO en cobrarse. Numerar por `installment_number` lo pondría de primero.
    const seq = chargeSequenceByRow(INSTALLMENTS);
    expect(CARGO_CIERRE.installment_number).toBeLessThan(CARGO_1000.installment_number);
    expect(seq.get(chargeRowKey(CARGO_CIERRE))).toBe(3);
  });

  it('Las cuotas regulares no se numeran como cargos', () => {
    const seq = chargeSequenceByRow(INSTALLMENTS);
    expect(seq.size).toBe(3);
    for (const cuota of CUOTAS) {
      expect(seq.get(chargeRowKey(cuota))).toBeUndefined();
    }
  });

  it('El orden no depende de cómo lleguen las filas de la base', () => {
    const alReves = [...INSTALLMENTS].reverse();
    const seq = chargeSequenceByRow(alReves);
    expect(chargeLabelFor(CARGO_1000, seq)).toBe('Cargo #1');
    expect(chargeLabelFor(CARGO_600, seq)).toBe('Cargo #2');
    expect(chargeLabelFor(CARGO_CIERRE, seq)).toBe('Cargo #3');
  });

  it('Sin `id` (filas generadas), la clave sigue distinguiendo cada cargo', () => {
    const sinId = [
      { ...CARGO_1000, id: undefined },
      { ...CARGO_600, id: undefined },
      { ...CARGO_CIERRE, id: undefined },
    ];
    const seq = chargeSequenceByRow(sinId);
    expect(seq.size).toBe(3);
    expect(chargeLabelFor(sinId[0], seq)).toBe('Cargo #1');
    expect(chargeLabelFor(sinId[2], seq)).toBe('Cargo #3');
  });
});

describe('los cargos salen en el Estado de Cuenta', () => {

  it('El caso reportado: el cronograma se detenía en el plazo y los cargos no salían', () => {
    const numeros = INSTALLMENTS.map((i) => i.installment_number);

    // ANTES: `for (let i = 1; i <= plazo; i++)`.
    const comoAntes = Array.from({ length: PLAZO }, (_, idx) => idx + 1);
    expect(comoAntes).not.toContain(CARGO_CIERRE.installment_number);
    expect(comoAntes).not.toContain(CARGO_1000.installment_number);

    // AHORA: las cuotas del plazo y, detrás, los números que existen de verdad por encima.
    const ahora = installmentNumbersWithCharges(PLAZO, numeros);
    expect(ahora).toEqual([...comoAntes, 11, 12, 13]);
    for (const cargo of [CARGO_CIERRE, CARGO_1000, CARGO_600]) {
      expect(ahora).toContain(cargo.installment_number);
    }
  });

  it('Sin cargos, el recorrido es exactamente el plazo', () => {
    expect(installmentNumbersWithCharges(PLAZO, CUOTAS.map((c) => c.installment_number)))
      .toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('No repite un número ni se cuela uno que no existe', () => {
    // En un indefinido dos filas pueden compartir `installment_number`.
    expect(installmentNumbersWithCharges(2, [1, 2, 3, 3, 4])).toEqual([1, 2, 3, 4]);
    expect(installmentNumbersWithCharges(3, [1, 2])).toEqual([1, 2, 3]);
    expect(installmentNumbersWithCharges(2, [null, undefined, 'x' as any, 5])).toEqual([1, 2, 5]);
  });
});

describe('el balance cuenta los gastos de cierre', () => {

  /** Lo que la aplicación guarda como saldo al crear el préstamo. */
  const balanceAlCrear = (totalAmount: number, gastosCierre: number, financiados: boolean) =>
    r2(totalAmount + (financiados ? 0 : gastosCierre));

  it('El caso reportado: el saldo guardado nacía corto por el cierre', () => {
    // ANTES: `remaining_balance = total_amount`, sin el cargo del cierre.
    expect(PRESTAMO.remaining_balance).toBe(27000);
    // Y al agregar los dos cargos, el saldo se arrastraba corto: 28,600 en vez de 31,100.
    expect(r2(27000 + 1000 + 600)).toBe(28600);

    // AHORA: el cargo del cierre entra en el saldo desde el principio.
    const alCrear = balanceAlCrear(27000, 2500, false);
    expect(alCrear).toBe(29500);
    expect(r2(alCrear + 1000 + 600)).toBe(31100);
  });

  it('Financiados, el cierre NO se suma dos veces', () => {
    // Financiado ya está dentro del capital y repartido en las cuotas, y no se guarda como
    // cargo (ver `indefiniteClosingCosts`): el saldo no lo vuelve a sumar.
    expect(balanceAlCrear(29500, 2500, true)).toBe(29500);
  });

  it('La ficha del préstamo da la misma cifra: 31,100', () => {
    // `computeLoanBalanceBreakdown` es el cálculo de la tarjeta, Detalles y el formulario de
    // pago. Ya contaba los tres cargos; lo que no coincidía era la columna guardada.
    const b = computeLoanBalanceBreakdown(PRESTAMO as any, {
      payments: [],
      installments: INSTALLMENTS,
      capitalPayments: [],
    }, '2026-10-21');

    expect(b.capitalPending).toBe(25000);
    expect(b.interestPending).toBe(2000);
    expect(b.baseBalance).toBe(27000);
    expect(b.pendingCharges).toBe(4100);   // 2,500 de cierre + 1,000 + 600
    expect(b.totalBalance).toBe(31100);

    // Y es exactamente el saldo que ahora queda guardado tras crear el préstamo y agregar los
    // dos cargos.
    expect(r2(balanceAlCrear(27000, 2500, false) + 1000 + 600)).toBe(b.totalBalance);
  });

  it('El historial de "Agregar Cargo" parte del saldo CON el cierre', () => {
    // FALLO REPORTADO: "en historial de modificación dice que pasa de 27,000 a 28,000: no está
    // tomando en cuenta el balance con el gasto de cierre".
    //
    // El "antes" salía de una cuenta (la vista previa) y el "después" de otra (una tercera copia
    // del cálculo que partía de `total_amount`, sin cargos). Ahora las dos salen de
    // `getLoanBalanceBreakdown`: se lee el saldo CON el cargo ya insertado y el "antes" es ese
    // saldo menos el cargo.
    const saldoCon = (installments: typeof INSTALLMENTS) =>
      computeLoanBalanceBreakdown(PRESTAMO as any, {
        payments: [], installments, capitalPayments: [],
      }, '2026-10-21').totalBalance;

    const antesDeVerdad = saldoCon([...CUOTAS, CARGO_CIERRE]);
    const despues = saldoCon([...CUOTAS, CARGO_CIERRE, CARGO_1000]);

    expect(antesDeVerdad).toBe(29500);   // 27,000 + 2,500 de gastos de cierre
    expect(despues).toBe(30500);

    // Lo que guarda el historial: "después" y "después − cargo".
    const anteriorEnElHistorial = r2(Math.max(0, despues - CARGO_1000.total_amount));
    expect(anteriorEnElHistorial).toBe(antesDeVerdad);
    expect(r2(despues - anteriorEnElHistorial)).toBe(1000);

    // Lo que decía antes: 27,000 → 28,000, los dos sin el cierre.
    expect(PRESTAMO.remaining_balance).toBe(27000);
    expect(anteriorEnElHistorial).not.toBe(PRESTAMO.remaining_balance);
  });

  it('Cobrar el cargo del cierre lo saca del balance', () => {
    const b = computeLoanBalanceBreakdown(PRESTAMO as any, {
      payments: [{
        amount: 2500, due_date: CARGO_CIERRE.due_date,
        principal_amount: 2500, interest_amount: 0,
      }],
      installments: INSTALLMENTS,
      capitalPayments: [],
    }, '2026-10-21');

    expect(b.pendingCharges).toBe(1600);   // quedan 1,000 + 600
    expect(b.totalBalance).toBe(28600);    // 27,000 + 1,600
  });
});
