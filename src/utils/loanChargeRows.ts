// ============================================================================
// LOS CARGOS EN LAS TABLAS DE AMORTIZACIÓN: numeración y filas
// ============================================================================
// FALLO REPORTADO (2026-10-14): "en detalles, en las tablas de amortizaciones de ver cuotas,
// todos los cargos salen como cargo#1, arregla esto y que en la tabla de estado de cuenta no
// salen los cargos".
//
// Un cargo no se guarda aparte: es una fila más de `installments`, sin interés y con todo su
// monto en el capital, cuyo `installment_number` va DESPUÉS de la última cuota (plazo 30 →
// cargos 31, 32, 33). De ahí los dos fallos:
//
//   · "Cargo #1" en todas las filas: la numeración se asignaba dentro de la rama de préstamos
//     INDEFINIDOS, así que en uno a plazo fijo ninguna fila llegaba a tener número y la
//     etiqueta caía a su valor por defecto, el 1.
//   · Ningún cargo en el Estado de Cuenta: su cronograma recorría `1..plazo`, y el número de
//     un cargo está por encima del plazo. La fila no se generaba —y sus pagos quedaban
//     sueltos, listos para que se los comiera una cuota regular del mismo día—.
//
// Las dos piezas viven aquí para que "Ver cuotas", el Estado de Cuenta y lo que se imprime
// numeren y recorran los cargos IGUAL. Son funciones puras: no consultan la base.

import { isChargeInstallment, type InstallmentRowLike } from './loanPaidTotals';

const dateOnly = (v: unknown) => String(v ?? '').split('T')[0];

export interface ChargeRowLike extends InstallmentRowLike {
  id?: string | null;
  installment_number?: number | null;
}

/**
 * Clave estable de una fila. Se usa el `id` de la base; sin él, la fecha y el número de cuota
 * (en un indefinido dos filas pueden compartir `installment_number`, así que el número solo no
 * basta como clave).
 */
export const chargeRowKey = (inst: ChargeRowLike | null | undefined): string => {
  const id = inst?.id;
  if (id !== null && id !== undefined && String(id).length > 0) return String(id);
  return `n${Number(inst?.installment_number) || 0}@${dateOnly(inst?.due_date)}`;
};

/**
 * Numeración de los cargos de un préstamo —Cargo #1, #2, #3…— por ORDEN DE COBRO: primero el
 * que vence antes. No depende del `installment_number` (un cargo añadido hoy con fecha de ayer
 * lleva el número más alto y, sin embargo, se cobra primero).
 */
export const chargeSequenceByRow = (
  installments: ChargeRowLike[] | null | undefined,
  // Cada pantalla trae su propia forma de reconocer un cargo (con tolerancias ligeramente
  // distintas); se respeta la del llamador para no cambiar de paso qué fila es un cargo.
  isCharge: (inst: ChargeRowLike) => boolean = isChargeInstallment,
): Map<string, number> => {
  const charges = (installments || [])
    .filter((inst) => isCharge(inst))
    .sort((a, b) => {
      const da = dateOnly(a?.due_date);
      const db = dateOnly(b?.due_date);
      if (da !== db) return da.localeCompare(db);
      return (Number(a?.installment_number) || 0) - (Number(b?.installment_number) || 0);
    });

  const map = new Map<string, number>();
  charges.forEach((inst, idx) => {
    map.set(chargeRowKey(inst), idx + 1);
  });
  return map;
};

/** Etiqueta de la fila de un cargo: "Cargo #2". */
export const chargeLabelFor = (
  inst: ChargeRowLike | null | undefined,
  sequences: Map<string, number>,
): string => `Cargo #${sequences.get(chargeRowKey(inst)) || 1}`;

/**
 * Los números de cuota que una tabla de amortización debe recorrer: del 1 al plazo, MÁS los que
 * existen de verdad por encima del plazo (los cargos), en orden. Sin esto, el cronograma del
 * Estado de Cuenta se detenía en el plazo y los cargos no salían.
 */
export const installmentNumbersWithCharges = (
  numberOfPayments: number,
  installmentNumbers: Iterable<number | string | null | undefined> | null | undefined,
): number[] => {
  const periods = Math.max(0, Math.floor(Number(numberOfPayments) || 0));
  const base: number[] = [];
  for (let i = 1; i <= periods; i++) base.push(i);

  const extras = Array.from(installmentNumbers || [])
    .map((n) => Number(n))
    .filter((n) => Number.isFinite(n) && n > periods)
    .sort((a, b) => a - b);

  // Un mismo número no se recorre dos veces (en indefinidos puede repetirse entre filas).
  return [...base, ...Array.from(new Set(extras))];
};
