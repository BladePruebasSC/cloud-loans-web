// Generado a partir de las suites de la auditoria 2026-09-01.
// Prueban LOGICA FINANCIERA PURA: sin red, sin reloj, sin Supabase. Deterministas.
import { describe, it, expect } from 'vitest';

import { computeInstallmentDues, allocateAmountToInstallments, autoExtendSelection } from '@/utils/installmentDues';

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
  
    // Nada marcado a mano: escribir 12,000 arrastra desde la mas antigua.
    const auto = autoExtendSelection(rows, [], [], 12000);
    ok('arrastra 2 cuotas', auto.length === 2, String(auto.length));
    ok('empieza por la mas antigua', auto[0] === 'i1' && auto[1] === 'i2', auto.join());
  
    const a = allocateAmountToInstallments(rows.filter(r => auto.includes(r.id)), 12000);
    ok('cuota 1 se salda con 10,000', a.allocations[0].applied === 10000 && a.allocations[0].settles === true);
    ok('cuota 2 recibe 2,000 parciales', a.allocations[1].applied === 2000 && a.allocations[1].settles === false);
    ok('no sobra nada', a.leftover === 0);
  
    // Monto exacto de una cuota: no arrastra la siguiente.
    ok('10,000 exactos no arrastran la 2a', autoExtendSelection(rows, [], [], 10000).length === 1);
    ok('9,000 solo toma la primera', autoExtendSelection(rows, [], [], 9000).join() === 'i1');
    ok('monto 0 no arrastra nada', autoExtendSelection(rows, [], [], 0).length === 0);
  
    // Cubrir mas de lo que existe: toma todas y no inventa.
    ok('50,000 toma las 3 y para', autoExtendSelection(rows, [], [], 50000).join() === 'i1,i2,i3');
  }
  
  });

  it("El arrastre va HACIA ADELANTE de lo marcado a mano", () => {
  {
    const rows = computeInstallmentDues([
      cuota(1, '2026-09-01', 8000, 2000),
      cuota(2, '2026-10-01', 8000, 2000),
      cuota(3, '2026-11-01', 8000, 2000),
      cuota(4, '2026-12-01', 8000, 2000),
    ], []);
  
    // Marca la #2 y escribe 15,000: los 5,000 sobrantes van a la #3, no a la #1.
    const auto = autoExtendSelection(rows, ['i2'], [], 15000);
    ok('sigue por la #3, no vuelve a la #1', auto.join() === 'i3', auto.join());
  
    // Marca #1 y #3, escribe 25,000 (pendiente marcado 20,000): los 5,000 van a la #4.
    ok('continua tras la ultima marcada', autoExtendSelection(rows, ['i1', 'i3'], [], 25000).join() === 'i4');
  
    // El monto no supera lo marcado: no arrastra nada.
    ok('monto menor a lo marcado no arrastra', autoExtendSelection(rows, ['i1', 'i2'], [], 12000).length === 0);
    ok('monto igual a lo marcado no arrastra', autoExtendSelection(rows, ['i1', 'i2'], [], 20000).length === 0);
  }
  
  });

  it("Desmarcar gana sobre el arrastre", () => {
  {
    const rows = computeInstallmentDues([
      cuota(1, '2026-09-01', 8000, 2000),
      cuota(2, '2026-10-01', 8000, 2000),
      cuota(3, '2026-11-01', 8000, 2000),
    ], []);
    // Si el empleado desmarca la #2, el arrastre la salta y sigue con la #3.
    ok('salta la desmarcada', autoExtendSelection(rows, [], ['i2'], 12000).join() === 'i1,i3', autoExtendSelection(rows, [], ['i2'], 12000).join());
    ok('sin exclusion tomaria i1,i2', autoExtendSelection(rows, [], [], 12000).join() === 'i1,i2');
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
    const auto = autoExtendSelection(rows, [], [], 11000);
    ok('arrastra cargo + 2 cuotas', auto.length === 3, auto.join());
    const a = allocateAmountToInstallments(rows.filter(r => auto.includes(r.id)), 11000);
    ok('el cargo se salda primero (mas antiguo)', a.allocations[0].applied === 600 && a.allocations[0].settles === true);
    ok('la cuota 1 se salda', a.allocations[1].applied === 10000 && a.allocations[1].settles === true);
    ok('la cuota 2 recibe 400', a.allocations[2].applied === 400 && a.allocations[2].settles === false);
    ok('todo repartido', a.leftover === 0 && a.applied === 11000);
  }
  
  });

  it("Estabilidad: el arrastre es idempotente", () => {
  {
    const rows = computeInstallmentDues([
      cuota(1, '2026-09-01', 8000, 2000),
      cuota(2, '2026-10-01', 8000, 2000),
    ], []);
    // Reaplicar el resultado como si ya estuviera marcado no debe anadir mas (evita el bucle
    // del efecto de React).
    const first = autoExtendSelection(rows, [], [], 12000);
    const second = autoExtendSelection(rows, first, [], 12000);
    ok('no crece al reaplicar', second.length === 0, second.join());
  }
  
  
  });
});
