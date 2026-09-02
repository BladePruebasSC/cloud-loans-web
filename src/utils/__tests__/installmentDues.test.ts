// Generado a partir de las suites de la auditoria 2026-09-01.
// Prueban LOGICA FINANCIERA PURA: sin red, sin reloj, sin Supabase. Deterministas.
import { describe, it, expect } from 'vitest';

import {
  computeInstallmentDues, allocateAmountToInstallments, countToCoverAmount, pendingForCount,
} from '@/utils/installmentDues';

/** Adapta el estilo `ok(nombre, condicion, detalle)` de las suites originales. */
const ok = (name: string, cond: unknown, detail = '') =>
  expect(cond, detail ? `${name} — ${detail}` : name).toBe(true);

describe("installmentDues", () => {

const r2 = (v) => Math.round(v * 100) / 100;

const cuota = (n, due, cap, int, extra = {}) => ({
  id: `i${n}`, installment_number: n, due_date: due,
  principal_amount: cap, interest_amount: int, total_amount: r2(cap + int),
  is_paid: false, paid_amount: 0, ...extra,
});
const cargo = (n, due, monto, extra = {}) => ({
  id: `c${n}`, installment_number: n, due_date: due,
  principal_amount: monto, interest_amount: 0, total_amount: monto,
  is_paid: false, paid_amount: 0, ...extra,
});

  it("Pendiente por cuota", () => {
  {
    const ins = [cuota(1, '2026-08-15', 1250, 750), cuota(2, '2026-08-29', 1250, 750), cuota(3, '2026-09-12', 1250, 750)];
    const pagos = [
      { amount: 2000, principal_amount: 1250, interest_amount: 750, due_date: '2026-08-15' }, // salda la 1
      { amount: 500, principal_amount: 312.5, interest_amount: 187.5, due_date: '2026-08-29' }, // parcial en la 2
    ];
    const d = computeInstallmentDues(ins, pagos);
    ok('cuota 1 saldada', d[0].pending === 0 && d[0].isPaid === true, String(d[0].pending));
    ok('cuota 2 parcial: pendiente 1,500', d[1].pending === 1500, String(d[1].pending));
    ok('cuota 2 pagado 500', d[1].paid === 500, String(d[1].paid));
    ok('cuota 2 no marcada como pagada', d[1].isPaid === false);
    ok('cuota 3 intacta', d[2].pending === 2000 && d[2].paid === 0);
    ok('ordenadas por fecha', d.map(x => x.installmentNumber).join() === '1,2,3');
  }
  
  });

  it("is_paid manda sobre todo", () => {
  {
    const d = computeInstallmentDues([cuota(1, '2026-08-15', 1250, 750, { is_paid: true })], []);
    ok('sin pagos registrados pero is_paid=true', d[0].pending === 0 && d[0].paid === 2000);
  }
  
  });

  it("paid_amount solo se lee en CARGOS", () => {
  {
    const d = computeInstallmentDues([cargo(9, '2026-08-31', 1213, { paid_amount: 500 })], []);
    ok('en un cargo respeta paid_amount', d[0].paid === 500 && d[0].pending === 713, `${d[0].paid}/${d[0].pending}`);
  
    // En una cuota regular `paid_amount` no lo mantiene nadie: se ignora y manda `payments`.
    const reg = computeInstallmentDues([cuota(1, '2026-08-15', 1250, 750, { paid_amount: 500 })], []);
    ok('en una cuota regular se ignora paid_amount obsoleto', reg[0].paid === 0 && reg[0].pending === 2000, `${reg[0].paid}/${reg[0].pending}`);
  
    const reg2 = computeInstallmentDues(
      [cuota(1, '2026-08-15', 1250, 750, { paid_amount: 500 })],
      [{ amount: 800, principal_amount: 500, interest_amount: 300, due_date: '2026-08-15' }],
    );
    ok('la cuota regular se deriva de los pagos', reg2[0].paid === 800 && reg2[0].pending === 1200, `${reg2[0].paid}/${reg2[0].pending}`);
  }
  
  });

  it("Cargos y cuotas de la MISMA fecha no se mezclan", () => {
  {
    const ins = [cuota(1, '2026-08-15', 1250, 750), cargo(9, '2026-08-15', 1000)];
    const pagos = [
      { amount: 1000, principal_amount: 1000, interest_amount: 0, due_date: '2026-08-15' },   // pago de CARGO
      { amount: 2000, principal_amount: 1250, interest_amount: 750, due_date: '2026-08-15' }, // pago de CUOTA
    ];
    const d = computeInstallmentDues(ins, pagos);
    const c1 = d.find(x => x.installmentNumber === 1);
    const c9 = d.find(x => x.installmentNumber === 9);
    ok('la cuota queda saldada', c1.pending === 0, String(c1.pending));
    ok('el cargo queda saldado', c9.pending === 0, String(c9.pending));
    ok('el cargo se marca como cargo', c9.isCharge === true && c1.isCharge === false);
    // Sin la separacion por tipo, los 3,000 habrian cascadeado y dado un resultado distinto.
  }
  
  });

  it("Cascada entre varios cargos de la misma fecha", () => {
  {
    const ins = [cargo(9, '2026-08-31', 1000), cargo(10, '2026-08-31', 800)];
    const pagos = [{ amount: 1400, principal_amount: 1400, interest_amount: 0, due_date: '2026-08-31' }];
    const d = computeInstallmentDues(ins, pagos);
    ok('el primero se satura', d[0].pending === 0 && d[0].paid === 1000);
    ok('el segundo recibe el resto', d[1].paid === 400 && d[1].pending === 400, `${d[1].paid}/${d[1].pending}`);
  }
  
  });

  it("Reparto de un pago entre varias cuotas", () => {
  {
    const ins = [cuota(1, '2026-08-15', 1250, 750), cuota(2, '2026-08-29', 1250, 750), cuota(3, '2026-09-12', 1250, 750)];
    const rows = computeInstallmentDues(ins, []);
  
    // Caso del usuario: el cliente trae 5,000 para varias cuotas
    const a = allocateAmountToInstallments(rows, 5000);
    ok('cubre 3 cuotas', a.allocations.length === 3, String(a.allocations.length));
    ok('reparte 5,000', a.applied === 5000, String(a.applied));
    ok('cuota 1 completa', a.allocations[0].applied === 2000 && a.allocations[0].settles === true);
    ok('cuota 2 completa', a.allocations[1].applied === 2000 && a.allocations[1].settles === true);
    ok('cuota 3 parcial de 1,000', a.allocations[2].applied === 1000 && a.allocations[2].settles === false);
    ok('sin sobrante', a.leftover === 0);
    ok('falta 1,000 para saldar todo', a.shortfall === 1000, String(a.shortfall));
    // Capital/interes proporcionales: 1,000 sobre una cuota 1250/750
    ok('capital proporcional 625', a.allocations[2].principal === 625, String(a.allocations[2].principal));
    ok('interes proporcional 375', a.allocations[2].interest === 375, String(a.allocations[2].interest));
    ok('capital + interes = aplicado', a.allocations.every(x => r2(x.principal + x.interest) === x.applied));
  }
  
  });

  it("Monto mayor que lo pendiente", () => {
  {
    const rows = computeInstallmentDues([cuota(1, '2026-08-15', 1250, 750)], []);
    const a = allocateAmountToInstallments(rows, 3000);
    ok('solo aplica lo pendiente', a.applied === 2000, String(a.applied));
    ok('sobran 1,000', a.leftover === 1000, String(a.leftover));
    ok('nada pendiente', a.shortfall === 0);
  }
  
  });

  it("Cuotas ya saldadas no reciben nada", () => {
  {
    const rows = computeInstallmentDues([cuota(1, '2026-08-15', 1250, 750, { is_paid: true }), cuota(2, '2026-08-29', 1250, 750)], []);
    const a = allocateAmountToInstallments(rows, 2000);
    ok('salta la saldada', a.allocations.length === 1 && a.allocations[0].row.installmentNumber === 2);
  }
  
  });

  it("Cargo: todo a capital, nada a interes", () => {
  {
    const rows = computeInstallmentDues([cargo(9, '2026-08-31', 1213)], []);
    const a = allocateAmountToInstallments(rows, 600);
    ok('cargo parcial', a.allocations[0].applied === 600 && a.allocations[0].settles === false);
    ok('cargo: 100% capital', a.allocations[0].principal === 600 && a.allocations[0].interest === 0);
  }
  
  });

  it("Orden cronologico, no por numero de cuota", () => {
  {
    // Un cargo con numero alto pero fecha anterior debe cobrarse primero.
    const rows = computeInstallmentDues([cuota(1, '2026-09-15', 1250, 750), cargo(9, '2026-08-31', 500)], []);
    const a = allocateAmountToInstallments(rows, 700);
    ok('primero el mas antiguo', a.allocations[0].row.installmentNumber === 9, String(a.allocations[0].row.installmentNumber));
    ok('el resto a la cuota siguiente', a.allocations[1].applied === 200, String(a.allocations[1].applied));
  }
  
  });

  it("Casos borde", () => {
  {
    ok('sin cuotas', allocateAmountToInstallments([], 1000).applied === 0);
    const rows = computeInstallmentDues([cuota(1, '2026-08-15', 1250, 750)], []);
    ok('monto 0', allocateAmountToInstallments(rows, 0).allocations.length === 0);
    ok('monto negativo', allocateAmountToInstallments(rows, -5).applied === 0);
    ok('pago sin due_date se ignora', computeInstallmentDues([cuota(1, '2026-08-15', 1250, 750)], [{ amount: 2000, due_date: null }])[0].pending === 2000);
    ok('due_date con hora se normaliza', computeInstallmentDues([cuota(1, '2026-08-15', 1250, 750)], [{ amount: 2000, principal_amount: 1250, interest_amount: 750, due_date: '2026-08-15T00:00:00+00:00' }])[0].pending === 0);
    // Redondeo: 1/3 de una cuota
    const a = allocateAmountToInstallments(computeInstallmentDues([cuota(1, '2026-08-15', 1000, 500)], []), 333.33);
    ok('redondeo no pierde centavos', r2(a.allocations[0].principal + a.allocations[0].interest) === 333.33, `${a.allocations[0].principal}+${a.allocations[0].interest}`);
  }
  
  });

  it("ARRASTRE AUTOMATICO: el monto selecciona las cuotas", () => {
  {
    // El caso pedido: cuota de 10,000, el cliente trae 12,000.
    const rows = computeInstallmentDues([
      cuota(1, '2026-09-01', 8000, 2000),  // 10,000
      cuota(2, '2026-10-01', 8000, 2000),  // 10,000
      cuota(3, '2026-11-01', 8000, 2000),  // 10,000
    ], []);

    // Escribir 12,000 toma las dos mas antiguas.
    ok('12,000 toma 2 cuotas', countToCoverAmount(rows, 12000) === 2, String(countToCoverAmount(rows, 12000)));

    const a = allocateAmountToInstallments(rows.slice(0, 2), 12000);
    ok('cuota 1 se salda con 10,000', a.allocations[0].applied === 10000 && a.allocations[0].settles === true);
    ok('cuota 2 recibe 2,000 parciales', a.allocations[1].applied === 2000 && a.allocations[1].settles === false);
    ok('no sobra nada', a.leftover === 0);

    // Monto exacto de una cuota: no arrastra la siguiente.
    ok('10,000 exactos no arrastran la 2a', countToCoverAmount(rows, 10000) === 1);
    ok('9,000 solo toma la primera', countToCoverAmount(rows, 9000) === 1);
    ok('monto 0 no arrastra nada', countToCoverAmount(rows, 0) === 0);
    ok('monto negativo tampoco', countToCoverAmount(rows, -500) === 0);

    // Cubrir mas de lo que existe: toma todas y no inventa.
    ok('50,000 toma las 3 y para', countToCoverAmount(rows, 50000) === 3);
  }

  });

  it("LA SELECCION ES CONSECUTIVA: no se pueden saltar cuotas", () => {
  {
    // Regla de negocio: una deuda se salda por antiguedad. No se puede pagar la 1, la 4 y la
    // 8 dejando huecos — las cuotas viejas son las que generan mora, y un hueco deja al
    // prestamo en un estado que ni el estado de cuenta ni los informes saben describir.
    //
    // Antes se elegia con casillas sueltas y el hueco ERA EXPRESABLE. Ahora la seleccion es
    // un contador —cuantas de las mas antiguas entran— y no existe forma de representarlo.
    const rows = computeInstallmentDues([
      cuota(1, '2026-09-01', 8000, 2000),
      cuota(2, '2026-10-01', 8000, 2000),
      cuota(3, '2026-11-01', 8000, 2000),
      cuota(4, '2026-12-01', 8000, 2000),
    ], []);

    // Sea cual sea el monto, lo elegido es SIEMPRE un prefijo: las N primeras, sin huecos.
    for (const monto of [1, 5000, 10000, 10001, 25000, 40000, 99999]) {
      const n = countToCoverAmount(rows, monto);
      const elegidas = rows.slice(0, n).map(r => r.installmentNumber);
      const esperado = rows.slice(0, n).map((_, i) => i + 1);
      ok(`con ${monto} las cuotas son consecutivas desde la 1`,
        elegidas.join() === esperado.join(), elegidas.join());
    }

    // "Pagar hasta la N" incluye todas las anteriores: es lo que hace el clic en una fila.
    const hastaLa3 = rows.slice(0, 3).map(r => r.installmentNumber);
    ok('pulsar la 3 incluye la 1 y la 2', hastaLa3.join() === '1,2,3', hastaLa3.join());

    // Y el reparto respeta ese orden: la mas antigua se satura primero.
    const a = allocateAmountToInstallments(rows.slice(0, 3), 25000);
    ok('salda la 1', a.allocations[0].settles === true);
    ok('salda la 2', a.allocations[1].settles === true);
    ok('la 3 queda parcial con 5,000', a.allocations[2].applied === 5000 && a.allocations[2].settles === false);
  }

  });

  it("Lo pendiente de un tramo se suma sin contar de mas", () => {
  {
    const rows = computeInstallmentDues([
      cuota(1, '2026-09-01', 8000, 2000),
      cuota(2, '2026-10-01', 8000, 2000),
      cuota(3, '2026-11-01', 8000, 2000),
    ], []);

    ok('ninguna', pendingForCount(rows, 0) === 0);
    ok('una', pendingForCount(rows, 1) === 10000);
    ok('dos', pendingForCount(rows, 2) === 20000);
    ok('todas', pendingForCount(rows, 3) === 30000);
    // Pedir mas de las que hay no revienta ni inventa deuda.
    ok('mas de las que hay', pendingForCount(rows, 99) === 30000);
    ok('negativo', pendingForCount(rows, -3) === 0);

    // Ida y vuelta: el monto que cubre N cuotas selecciona exactamente N.
    for (let n = 1; n <= 3; n++) {
      ok(`cubrir ${n} cuotas selecciona ${n}`,
        countToCoverAmount(rows, pendingForCount(rows, n)) === n,
        String(countToCoverAmount(rows, pendingForCount(rows, n))));
    }
  }

  });

  it("Arrastre con cargos y pagos parciales previos", () => {
  {
    const rows = computeInstallmentDues(
      [cargo(9, '2026-08-20', 1000), cuota(1, '2026-09-01', 8000, 2000), cuota(2, '2026-10-01', 8000, 2000)],
      [{ amount: 400, principal_amount: 400, interest_amount: 0, due_date: '2026-08-20' }],
    );
    ok('el cargo queda con 600 pendientes', rows[0].pending === 600, String(rows[0].pending));
    // 600 (cargo) + 10,000 (cuota 1) = 10,600; con 11,000 sobran 400 para la cuota 2.
    ok('arrastra cargo + 2 cuotas', countToCoverAmount(rows, 11000) === 3, String(countToCoverAmount(rows, 11000)));

    const a = allocateAmountToInstallments(rows.slice(0, 3), 11000);
    ok('el cargo se salda primero (mas antiguo)', a.allocations[0].applied === 600 && a.allocations[0].settles === true);
    ok('la cuota 1 se salda', a.allocations[1].applied === 10000 && a.allocations[1].settles === true);
    ok('la cuota 2 recibe 400', a.allocations[2].applied === 400 && a.allocations[2].settles === false);
    ok('todo repartido', a.leftover === 0 && a.applied === 11000);

    // El cargo tampoco se puede saltar: va por fecha como cualquier otra fila.
    ok('pagar solo la cuota 1 obliga a pasar por el cargo',
      rows.slice(0, countToCoverAmount(rows, 10600)).map(r => r.isCharge).join() === 'true,false');
  }

  });

  it("Estabilidad: recalcular con el mismo monto da el mismo tramo", () => {
  {
    const rows = computeInstallmentDues([
      cuota(1, '2026-09-01', 8000, 2000),
      cuota(2, '2026-10-01', 8000, 2000),
    ], []);
    // El efecto de React recalcula en cada render: si el resultado variara, entraria en bucle.
    const first = countToCoverAmount(rows, 12000);
    const second = countToCoverAmount(rows, 12000);
    ok('estable', first === second && first === 2, `${first} vs ${second}`);

    // Y sobre una lista vacia no hay nada que seleccionar.
    ok('sin cuotas no selecciona', countToCoverAmount([], 12000) === 0);
    ok('sin cuotas no hay pendiente', pendingForCount([], 3) === 0);
  }

  });
});
