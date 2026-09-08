// Pago avanzado en préstamos INDEFINIDOS.
//
// FALLO REPORTADO (2026-09-08): "los préstamos indefinidos que tienen varias cuotas pendientes,
// en pago avanzado solo sale la primera, no las demás; igual pasa aun cuando está pagada".
//
// CAUSA: un indefinido guarda UNA SOLA fila en `installments` (`installment_number = 1`); los
// demás períodos se generan al vuelo, porque un préstamo sin vencimiento no tiene un número de
// cuotas que escribir. `computeInstallmentDues` solo miraba las filas de la base, así que el
// panel enseñaba una cuota —o ninguna, si esa estaba pagada— en préstamos que llevaban meses
// devengando interés.
import { describe, it, expect } from 'vitest';
import {
  computeInstallmentDues, countToCoverAmount, pendingForCount,
  type RawInstallment, type RawPayment,
} from '../installmentDues';

// Préstamo de RD$25,000 al 5% mensual, MENSUAL: interés de RD$1,250 por período.
// Empezó el 8 de mayo, así que la primera cuota venció el 8 de junio.
const CUOTA_GUARDADA: RawInstallment = {
  id: 'fila-1',
  installment_number: 1,
  due_date: '2026-06-08',
  total_amount: 1250,
  principal_amount: 0,
  interest_amount: 1250,
  paid_amount: 0,
  is_paid: false,
};

const AGENDA = { startDate: '2026-05-08', frequency: 'monthly', todayIso: '2026-09-08' };

describe('computeInstallmentDues con préstamos indefinidos', () => {
  it('EL CASO REPORTADO: salen TODOS los períodos, no solo el guardado', () => {
    const sinAgenda = computeInstallmentDues([CUOTA_GUARDADA], []);
    expect(sinAgenda).toHaveLength(1); // el fallo, tal cual

    const conAgenda = computeInstallmentDues([CUOTA_GUARDADA], [], AGENDA);
    // Jun, jul, ago y sep vencidos + oct, el período en curso que aún no vence.
    expect(conAgenda.map(r => r.dueDate)).toEqual([
      '2026-06-08', '2026-07-08', '2026-08-08', '2026-09-08', '2026-10-08',
    ]);
    expect(conAgenda.every(r => r.pending === 1250)).toBe(true);
  });

  it('EL OTRO CASO REPORTADO: con la cuota guardada PAGADA siguen saliendo las demás', () => {
    const pagada: RawInstallment = { ...CUOTA_GUARDADA, is_paid: true, paid_amount: 1250 };
    const filas = computeInstallmentDues([pagada], [{ amount: 1250, interest_amount: 1250, due_date: '2026-06-08' }], AGENDA);

    const pendientes = filas.filter(r => r.pending > 0.005);
    // Antes: cero filas pendientes → "no hay cuotas ni cargos pendientes" en un préstamo que
    // debe cuatro períodos de interés.
    expect(pendientes.map(r => r.dueDate)).toEqual([
      '2026-07-08', '2026-08-08', '2026-09-08', '2026-10-08',
    ]);
    expect(pendingForCount(pendientes, pendientes.length)).toBe(5000);
  });

  it('Solo la fila guardada se marca en `installments`; los períodos generados no', () => {
    const filas = computeInstallmentDues([CUOTA_GUARDADA], [], AGENDA);
    expect(filas[0].isVirtual).toBeFalsy();
    expect(filas[0].id).toBe('fila-1');
    expect(filas.slice(1).every(r => r.isVirtual === true)).toBe(true);
  });

  it('Un período generado es interés puro: el reparto no le asigna capital', () => {
    const filas = computeInstallmentDues([CUOTA_GUARDADA], [], AGENDA);
    const generada = filas[1];
    expect(generada.principal).toBe(0);
    expect(generada.interest).toBe(1250);
    expect(generada.total).toBe(1250);
  });

  it('Los pagos por fecha marcan su período, tenga fila o no', () => {
    const pagos: RawPayment[] = [
      { amount: 1250, interest_amount: 1250, due_date: '2026-06-08' }, // fila guardada
      { amount: 1250, interest_amount: 1250, due_date: '2026-08-08' }, // período generado
    ];
    const filas = computeInstallmentDues([CUOTA_GUARDADA], pagos, AGENDA);
    const porFecha = new Map(filas.map(r => [r.dueDate, r]));

    expect(porFecha.get('2026-06-08')!.pending).toBe(0);
    expect(porFecha.get('2026-07-08')!.pending).toBe(1250);
    expect(porFecha.get('2026-08-08')!.pending).toBe(0);
  });

  it('Un pago mayor que su período arrastra al siguiente en vez de perderse', () => {
    // 3,000 sobre un período de 1,250: saldan ese y el siguiente, y los 500 restantes son un
    // abono parcial al tercero (le quedan 750). Antes el sobrante se descartaba y los períodos
    // ya cobrados volvían a salir pendientes.
    const filas = computeInstallmentDues(
      [CUOTA_GUARDADA],
      [{ amount: 3000, interest_amount: 3000, due_date: '2026-06-08' }],
      AGENDA
    );
    const porFecha = new Map(filas.map(r => [r.dueDate, r]));
    expect(porFecha.get('2026-06-08')!.pending).toBe(0);
    expect(porFecha.get('2026-07-08')!.pending).toBe(0);
    expect(porFecha.get('2026-08-08')!.pending).toBe(750);
  });

  it('Un pago con fecha fuera de la rejilla tampoco se pierde', () => {
    // Un cobro adelantado o con la fecha ajustada no debe dejar un período cobrado como
    // pendiente: se aplica al más viejo que quede.
    const filas = computeInstallmentDues(
      [CUOTA_GUARDADA],
      [{ amount: 1250, interest_amount: 1250, due_date: '2026-06-20' }],
      AGENDA
    );
    expect(filas[0].pending).toBe(0);
    expect(filas[1].pending).toBe(1250);
  });

  it('Los CARGOS conservan su fecha y no se confunden con los períodos de interés', () => {
    const cargo: RawInstallment = {
      id: 'cargo-1', installment_number: 9, due_date: '2026-07-08',
      total_amount: 3000, principal_amount: 3000, interest_amount: 0, paid_amount: 0, is_paid: false,
    };
    const filas = computeInstallmentDues([CUOTA_GUARDADA, cargo], [], AGENDA);

    // El cargo y la cuota de interés del mismo día son DOS obligaciones distintas.
    const delDia = filas.filter(r => r.dueDate === '2026-07-08');
    expect(delDia).toHaveLength(2);
    expect(delDia.filter(r => r.isCharge)).toHaveLength(1);
    expect(delDia.filter(r => !r.isCharge)).toHaveLength(1);
  });

  it('El monto arrastra períodos generados igual que cuotas reales', () => {
    const filas = computeInstallmentDues([CUOTA_GUARDADA], [], AGENDA).filter(r => r.pending > 0.005);
    // El cliente trae 3,000: cubre dos períodos enteros y parte del tercero.
    expect(countToCoverAmount(filas, 3000)).toBe(3);
    expect(pendingForCount(filas, 2)).toBe(2500);
  });

  it('Sin agenda de indefinido no cambia nada para un préstamo de plazo fijo', () => {
    const cuotas: RawInstallment[] = [
      { id: 'a', installment_number: 1, due_date: '2026-06-08', total_amount: 1000, principal_amount: 800, interest_amount: 200, is_paid: false },
      { id: 'b', installment_number: 2, due_date: '2026-07-08', total_amount: 1000, principal_amount: 850, interest_amount: 150, is_paid: false },
    ];
    const filas = computeInstallmentDues(cuotas, [{ amount: 1000, interest_amount: 200, due_date: '2026-06-08' }]);
    expect(filas).toHaveLength(2);
    expect(filas[0].pending).toBe(0);
    expect(filas[1].pending).toBe(1000);
    // Un sobrante en un plazo fijo NO se arrastra: cada cuota tiene su fila y su fecha.
    const conSobrante = computeInstallmentDues(cuotas, [{ amount: 1500, interest_amount: 200, due_date: '2026-06-08' }]);
    expect(conSobrante[1].pending).toBe(1000);
  });
});
