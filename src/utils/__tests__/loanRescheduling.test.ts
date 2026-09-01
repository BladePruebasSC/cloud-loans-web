// Generado a partir de las suites de la auditoria 2026-09-01.
// Prueban LOGICA FINANCIERA PURA: sin red, sin reloj, sin Supabase. Deterministas.
import { describe, it, expect } from 'vitest';

import { computeExtendedSchedule, isChargeInstallment } from '@/utils/loanRescheduling';

/** Adapta el estilo `ok(nombre, condicion, detalle)` de las suites originales. */
const ok = (name: string, cond: unknown, detail = '') =>
  expect(cond, detail ? `${name} — ${detail}` : name).toBe(true);

describe("loanRescheduling", () => {

const r2 = (v) => Math.round(v * 100) / 100;
const sum = (a, f) => r2(a.reduce((s, x) => s + f(x), 0));

/** Genera cuotas 'simple' como lo hace el sistema al crear el préstamo. */
const mkSimple = ({ amount, rate, factor, n, firstDue, stepDays, paidCount = 0 }) => {
  const interest = r2(amount * (rate / 100) * factor);
  const principal = r2(amount / n);
  const out = [];
  let bal = amount;
  for (let i = 1; i <= n; i++) {
    const p = i === n ? r2(bal) : principal;
    bal = r2(bal - p);
    const d = new Date(firstDue);
    d.setDate(d.getDate() + stepDays * (i - 1));
    out.push({
      id: `i${i}`, installment_number: i,
      due_date: d.toISOString().split('T')[0],
      principal_amount: p, interest_amount: interest, total_amount: r2(p + interest),
      is_paid: i <= paidCount,
    });
  }
  return out;
};

  it("EL CASO REPORTADO: RD$10,000 al 15% QUINCENAL, 6 cuotas, +2", () => {
  {
    const installments = mkSimple({ amount: 10000, rate: 15, factor: 0.5, n: 6, firstDue: new Date(2026, 7, 15), stepDays: 14 });
    ok('cuota original 2,416.67', installments[0].total_amount === 2416.67, String(installments[0].total_amount));
  
    const s = computeExtendedSchedule({
      amount: 10000, interestRate: 15, frequency: 'biweekly', amortizationType: 'simple',
      installments, additionalCount: 2,
    });
  
    ok('8 cuotas pendientes', s.pendingCountAfter === 8, String(s.pendingCountAfter));
    ok('capital pendiente 10,000', s.outstandingCapital === 10000, String(s.outstandingCapital));
    ok('tasa de periodo 7.5%', s.periodRate === 0.075, String(s.periodRate));
    // ANTES: cuota 2,750 (interés calculado como si fuera mensual). AHORA: 2,000.
    ok('cuota = 2,000 (antes daba 2,750)', s.representativePayment === 2000, String(s.representativePayment));
    ok('todas las cuotas iguales', s.rows.every(x => x.total === 2000), s.rows.map(x => x.total).join('/'));
    ok('capital por cuota 1,250', s.rows.every(x => x.principal === 1250), s.rows.map(x => x.principal).join('/'));
    ok('interes por cuota 750', s.rows.every(x => x.interest === 750));
    // ANTES: 6 x 1,666.67 + 2 x 2,000 = 14,000 de capital en un prestamo de 10,000.
    ok('el capital suma EXACTAMENTE 10,000', sum(s.rows, x => x.principal) === 10000, String(sum(s.rows, x => x.principal)));
    ok('total del prestamo = 16,000', s.newTotalAmount === 16000, String(s.newTotalAmount));
    ok('interes total = 6,000 (antes 12,000)', s.totalPendingInterest === 6000, String(s.totalPendingInterest));
    ok('plazo = 8 periodos', s.newTermPeriods === 8, String(s.newTermPeriods));
    ok('6 cuotas a ACTUALIZAR', s.updatedRows.length === 6, String(s.updatedRows.length));
    ok('2 cuotas a INSERTAR', s.newRows.length === 2, String(s.newRows.length));
    ok('las existentes conservan su id', s.updatedRows.every((x, i) => x.id === `i${i + 1}`));
    ok('las nuevas no traen id', s.newRows.every(x => !x.id));
    // Fechas: ultima existente 15-ago + 5*14 = 24-oct; nuevas 7-nov y 21-nov
    ok('ultima existente 2026-10-24', s.updatedRows[5].dueDate === '2026-10-24', s.updatedRows[5].dueDate);
    ok('nueva #7 = 2026-11-07', s.newRows[0].dueDate === '2026-11-07', s.newRows[0].dueDate);
    ok('nueva #8 = 2026-11-21', s.newRows[1].dueDate === '2026-11-21', s.newRows[1].dueDate);
    ok('fecha fin = 2026-11-21', s.newEndDate === '2026-11-21', s.newEndDate);
    ok('numeracion 1..8', s.rows.map(x => x.installmentNumber).join() === '1,2,3,4,5,6,7,8');
    ok('describe el reparto', /8 cuotas pendientes \(6 existentes \+ 2 nuevas\)/.test(s.description), s.description);
  }
  
  });

  it("Idempotencia: extender 0 cuotas no cambia nada", () => {
  {
    const installments = mkSimple({ amount: 10000, rate: 15, factor: 0.5, n: 6, firstDue: new Date(2026, 7, 15), stepDays: 14 });
    const s = computeExtendedSchedule({ amount: 10000, interestRate: 15, frequency: 'biweekly', amortizationType: 'simple', installments, additionalCount: 0 });
    ok('mismas 6 cuotas', s.pendingCountAfter === 6);
    ok('mismo importe 2,416.67', s.representativePayment === 2416.67, String(s.representativePayment));
    ok('mismo total 14,500', s.newTotalAmount === 14500, String(s.newTotalAmount));
    ok('ninguna cuota nueva', s.newRows.length === 0);
  }
  
  });

  it("Con cuotas YA PAGADAS (no se tocan)", () => {
  {
    // 2 de 6 pagadas. Antes el calculo usaba term_months(6)+2=8 como divisor y la vista
    // previa mostraba pendientes(4)+2=6: dos numeros distintos para lo mismo.
    const installments = mkSimple({ amount: 10000, rate: 15, factor: 0.5, n: 6, firstDue: new Date(2026, 7, 15), stepDays: 14, paidCount: 2 });
    const s = computeExtendedSchedule({ amount: 10000, interestRate: 15, frequency: 'biweekly', amortizationType: 'simple', installments, additionalCount: 2 });
  
    ok('2 pagadas', s.paidCount === 2);
    ok('4 pendientes antes', s.pendingCountBefore === 4);
    ok('6 pendientes despues', s.pendingCountAfter === 6);
    ok('capital pendiente = 10,000 - 3,333.34', s.outstandingCapital === 6666.66, String(s.outstandingCapital));
    ok('capital repartido suma el pendiente', sum(s.rows, x => x.principal) === 6666.66, String(sum(s.rows, x => x.principal)));
    ok('plazo = 2 pagadas + 6 pendientes = 8', s.newTermPeriods === 8, String(s.newTermPeriods));
    ok('la 1a pendiente conserva el numero 3', s.rows[0].installmentNumber === 3, String(s.rows[0].installmentNumber));
    ok('total = pagado + pendiente', s.newTotalAmount === r2(2 * 2416.67 + s.totalPendingAmount), String(s.newTotalAmount));
    ok('las pagadas no aparecen en rows', s.rows.length === 6);
  }
  
  });

  it("Los CARGOS se excluyen del reparto", () => {
  {
    const installments = mkSimple({ amount: 10000, rate: 15, factor: 0.5, n: 6, firstDue: new Date(2026, 7, 15), stepDays: 14 });
    installments.push({ id: 'c1', installment_number: 7, due_date: '2026-08-31', principal_amount: 1213, interest_amount: 0, total_amount: 1213, is_paid: false });
    ok('detecta el cargo', isChargeInstallment(installments[6]) === true);
    ok('no confunde una cuota con cargo', isChargeInstallment(installments[0]) === false);
  
    const s = computeExtendedSchedule({ amount: 10000, interestRate: 15, frequency: 'biweekly', amortizationType: 'simple', installments, additionalCount: 2 });
    ok('el cargo no cuenta como cuota', s.pendingCountAfter === 8, String(s.pendingCountAfter));
    ok('el cargo no entra en el total del prestamo', s.newTotalAmount === 16000, String(s.newTotalAmount));
    ok('el cargo no altera el capital', sum(s.rows, x => x.principal) === 10000);
    // El cargo ocupa el numero 7. Las cuotas nuevas NO pueden reusarlo.
    ok('las cuotas nuevas no chocan con el numero del cargo',
      s.newRows.map(x => x.installmentNumber).join() === '8,9', s.newRows.map(x => x.installmentNumber).join());
    ok('las existentes conservan su numero', s.updatedRows.map(x => x.installmentNumber).join() === '1,2,3,4,5,6');
    const numeros = s.rows.map(x => x.installmentNumber).concat([7]);
    ok('ningun numero duplicado en todo el prestamo', new Set(numeros).size === numeros.length);
  }
  
  });

  it("Otras frecuencias", () => {
  {
    const mensual = computeExtendedSchedule({
      amount: 12000, interestRate: 5, frequency: 'monthly', amortizationType: 'simple',
      installments: mkSimple({ amount: 12000, rate: 5, factor: 1, n: 6, firstDue: new Date(2026, 0, 31), stepDays: 30 }),
      additionalCount: 6,
    });
    ok('mensual: 12 cuotas', mensual.pendingCountAfter === 12);
    ok('mensual: interes 600 por cuota', mensual.rows[0].interest === 600, String(mensual.rows[0].interest));
    ok('mensual: capital 1,000', mensual.rows[0].principal === 1000, String(mensual.rows[0].principal));
  
    const diario = computeExtendedSchedule({
      amount: 3000, interestRate: 30, frequency: 'daily', amortizationType: 'simple',
      installments: mkSimple({ amount: 3000, rate: 30, factor: 1 / 30, n: 30, firstDue: new Date(2026, 5, 1), stepDays: 1 }),
      additionalCount: 10,
    });
    ok('diario: 40 cuotas', diario.pendingCountAfter === 40);
    ok('diario: interes 30 por dia (1% de 3000)', diario.rows[0].interest === 30, String(diario.rows[0].interest));
    ok('diario: capital 75', diario.rows[0].principal === 75, String(diario.rows[0].principal));
    ok('diario: capital suma 3,000', sum(diario.rows, x => x.principal) === 3000);
  }
  
  });

  it("Cierre de mes: mensual desde el 31 de enero", () => {
  {
    const s = computeExtendedSchedule({
      amount: 6000, interestRate: 5, frequency: 'monthly', amortizationType: 'simple',
      installments: [
        { id: 'a', installment_number: 1, due_date: '2026-01-31', principal_amount: 3000, interest_amount: 300, total_amount: 3300, is_paid: false },
        { id: 'b', installment_number: 2, due_date: '2026-02-28', principal_amount: 3000, interest_amount: 300, total_amount: 3300, is_paid: false },
      ],
      additionalCount: 2,
    });
    // Ancla 28-feb: +1 mes = 28-mar, +2 = 28-abr (sin desbordar a marzo)
    ok('nueva #3 = 2026-03-28', s.newRows[0].dueDate === '2026-03-28', s.newRows[0].dueDate);
    ok('nueva #4 = 2026-04-28', s.newRows[1].dueDate === '2026-04-28', s.newRows[1].dueDate);
  }
  
  });

  it("Amortizacion francesa", () => {
  {
    const installments = [1, 2, 3].map(i => ({
      id: `f${i}`, installment_number: i, due_date: `2026-0${i + 1}-15`,
      principal_amount: 3000, interest_amount: 100, total_amount: 3100, is_paid: false,
    }));
    const s = computeExtendedSchedule({ amount: 9000, interestRate: 2, frequency: 'monthly', amortizationType: 'french', installments, additionalCount: 3 });
    ok('francesa: 6 cuotas', s.pendingCountAfter === 6);
    ok('francesa: cuota constante', s.rows.slice(0, 5).every(x => x.total === s.rows[0].total), s.rows.map(x => x.total).join('/'));
    ok('francesa: capital suma 9,000', sum(s.rows, x => x.principal) === 9000, String(sum(s.rows, x => x.principal)));
    ok('francesa: capital creciente', s.rows[0].principal < s.rows[5].principal);
    ok('francesa: interes decreciente', s.rows[0].interest > s.rows[5].interest);
    ok('francesa: uniforme', s.uniformPayment === true);
  }
  
  });

  it("Amortizacion alemana", () => {
  {
    const installments = [1, 2].map(i => ({
      id: `g${i}`, installment_number: i, due_date: `2026-0${i + 1}-10`,
      principal_amount: 4000, interest_amount: 160, total_amount: 4160, is_paid: false,
    }));
    const s = computeExtendedSchedule({ amount: 8000, interestRate: 2, frequency: 'monthly', amortizationType: 'german', installments, additionalCount: 2 });
    ok('alemana: 4 cuotas', s.pendingCountAfter === 4);
    ok('alemana: capital fijo 2,000', s.rows.every(x => x.principal === 2000), s.rows.map(x => x.principal).join('/'));
    ok('alemana: cuota decreciente', s.rows[0].total > s.rows[3].total);
    ok('alemana: 1a interes 160 (2% de 8000)', s.rows[0].interest === 160, String(s.rows[0].interest));
    ok('alemana: capital suma 8,000', sum(s.rows, x => x.principal) === 8000);
    ok('alemana: NO uniforme', s.uniformPayment === false);
    ok('alemana: describe cuota decreciente', /decreciente/.test(s.description), s.description);
  }
  
  });

  it("Linea de credito (solo interes)", () => {
  {
    const installments = [1, 2].map(i => ({
      id: `a${i}`, installment_number: i, due_date: `2026-0${i + 1}-05`,
      principal_amount: i === 2 ? 5000 : 0, interest_amount: 250, total_amount: i === 2 ? 5250 : 250, is_paid: false,
    }));
    const s = computeExtendedSchedule({ amount: 5000, interestRate: 5, frequency: 'monthly', amortizationType: 'american', installments, additionalCount: 2 });
    ok('americana: 4 cuotas', s.pendingCountAfter === 4);
    ok('americana: solo interes salvo la ultima', s.rows.slice(0, 3).every(x => x.principal === 0 && x.total === 250));
    ok('americana: capital al final', s.rows[3].principal === 5000 && s.rows[3].total === 5250);
  }
  
  });

  it("Redondeo: capital que no divide exacto", () => {
  {
    const installments = mkSimple({ amount: 10000, rate: 10, factor: 1, n: 3, firstDue: new Date(2026, 2, 10), stepDays: 30 });
    const s = computeExtendedSchedule({ amount: 10000, interestRate: 10, frequency: 'monthly', amortizationType: 'simple', installments, additionalCount: 4 });
    ok('7 cuotas', s.pendingCountAfter === 7);
    ok('capital suma exactamente 10,000 pese al redondeo', sum(s.rows, x => x.principal) === 10000, String(sum(s.rows, x => x.principal)));
    ok('la ultima cuota absorbe el ajuste', s.rows[6].principal !== s.rows[0].principal || s.rows[0].principal === r2(10000 / 7));
  }
  
  });

  it("Casos borde", () => {
  {
    const todasPagadas = mkSimple({ amount: 5000, rate: 5, factor: 1, n: 2, firstDue: new Date(2026, 3, 1), stepDays: 30, paidCount: 2 });
    const s = computeExtendedSchedule({ amount: 5000, interestRate: 5, frequency: 'monthly', amortizationType: 'simple', installments: todasPagadas, additionalCount: 2 });
    ok('todo pagado: capital pendiente 0', s.outstandingCapital === 0, String(s.outstandingCapital));
    ok('todo pagado: 2 cuotas nuevas de puro interes', s.rows.length === 2 && s.rows.every(x => x.principal === 0 && x.interest === 250), JSON.stringify(s.rows.map(x => x.total)));
    ok('numeracion continua tras las pagadas', s.rows[0].installmentNumber === 3, String(s.rows[0].installmentNumber));
  
    const vacio = computeExtendedSchedule({ amount: 1000, interestRate: 5, frequency: 'monthly', amortizationType: 'simple', installments: [], additionalCount: 0, fallbackDueDate: '2026-09-01' });
    ok('sin cuotas no revienta', vacio.pendingCountAfter === 0 && vacio.representativePayment === 0);
    ok('sin cuotas describe el vacio', /No quedan cuotas/.test(vacio.description));
  
    const tasaCero = computeExtendedSchedule({
      amount: 4000, interestRate: 0, frequency: 'monthly', amortizationType: 'french',
      installments: [{ id: 'z', installment_number: 1, due_date: '2026-05-01', principal_amount: 4000, interest_amount: 0, total_amount: 4000, is_paid: false }],
      additionalCount: 3,
    });
    ok('tasa 0 no divide por cero', tasaCero.pendingCountAfter === 4 && sum(tasaCero.rows, x => x.principal) === 4000, String(sum(tasaCero.rows, x => x.principal)));
  
    const abono = computeExtendedSchedule({
      amount: 10000, interestRate: 15, frequency: 'biweekly', amortizationType: 'simple',
      installments: mkSimple({ amount: 10000, rate: 15, factor: 0.5, n: 6, firstDue: new Date(2026, 7, 15), stepDays: 14 }),
      additionalCount: 2, capitalPayments: 2500,
    });
    ok('un abono a capital reduce el reparto', abono.outstandingCapital === 7500 && sum(abono.rows, x => x.principal) === 7500, String(abono.outstandingCapital));
  }
  
  });

  it("EL CASO REPORTADO: extension con una cuota ABONADA A MEDIAS", () => {
  {
    // 10,000 al 15% quincenal en 6 cuotas de 2,416.67 (capital 1,666.67 + interes 750).
    // El cliente abona 1,000 a la cuota #1 y luego se extiende el plazo 2 cuotas.
    const installments = mkSimple({ amount: 10000, rate: 15, factor: 0.5, n: 6, firstDue: new Date(2026, 7, 15), stepDays: 14 });
    const pagoParcial = [{
      amount: 1000, principal_amount: 689.66, interest_amount: 310.34,
      due_date: installments[0].due_date,
    }];
  
    const s = computeExtendedSchedule({
      amount: 10000, interestRate: 15, frequency: 'biweekly', amortizationType: 'simple',
      installments, payments: pagoParcial, additionalCount: 2,
    });
  
    // ANTES: la funcion no recibia los pagos y la cuota #1 se trataba como intacta.
    ok('la cuota #1 conserva su abono', s.rows[0].alreadyPaid === 1000, String(s.rows[0].alreadyPaid));
    ok('a la cuota #1 solo le quedan 1,000', s.rows[0].pendingAfter === 1000, String(s.rows[0].pendingAfter));
    ok('las demas no traen abono', s.rows.slice(1).every(r => r.alreadyPaid === 0));
    ok('las demas deben la cuota entera', s.rows[1].pendingAfter === 2000, String(s.rows[1].pendingAfter));
  
    // El CAPITAL no se descuenta por un abono parcial: el pago sigue acreditado en su cuota,
    // asi que restarlo ademas lo contaria dos veces.
    ok('capital a repartir sigue siendo 10,000', s.outstandingCapital === 10000, String(s.outstandingCapital));
    ok('cuota uniforme de 2,000', s.rows.every(r => r.total === 2000), s.rows.map(r => r.total).join('/'));
    ok('el capital sigue sumando 10,000', sum(s.rows, r => r.principal) === 10000);
  
    // La cuenta cierra: contrato 16,000 = 1,000 ya pagados + 15,000 por cobrar
    ok('total del contrato 16,000', s.totalPendingAmount === 16000, String(s.totalPendingAmount));
    ok('ya abonado 1,000', s.totalAlreadyPaid === 1000, String(s.totalAlreadyPaid));
    ok('queda por cobrar 15,000', s.totalToCollect === 15000, String(s.totalToCollect));
    ok('abonado + por cobrar = contrato', r2(s.totalAlreadyPaid + s.totalToCollect) === s.totalPendingAmount);
    ok('ninguna cuota fijada por el abono', s.cappedCount === 0);
  }
  
  });

  it("Varias cuotas abonadas a medias", () => {
  {
    const installments = mkSimple({ amount: 12000, rate: 5, factor: 1, n: 6, firstDue: new Date(2026, 0, 31), stepDays: 30 });
    // Cuota de 2,600 (capital 2,000 + interes 600). Se abona a la 1 y a la 3.
    const payments = [
      { amount: 600, principal_amount: 461.54, interest_amount: 138.46, due_date: installments[0].due_date },
      { amount: 1500, principal_amount: 1153.85, interest_amount: 346.15, due_date: installments[2].due_date },
    ];
    const s = computeExtendedSchedule({
      amount: 12000, interestRate: 5, frequency: 'monthly', amortizationType: 'simple',
      installments, payments, additionalCount: 6,
    });
  
    ok('12 cuotas', s.pendingCountAfter === 12);
    ok('abono en la 1', s.rows[0].alreadyPaid === 600, String(s.rows[0].alreadyPaid));
    ok('abono en la 3', s.rows[2].alreadyPaid === 1500, String(s.rows[2].alreadyPaid));
    ok('la 2 sin abono', s.rows[1].alreadyPaid === 0);
    ok('total abonado 2,100', s.totalAlreadyPaid === 2100, String(s.totalAlreadyPaid));
    ok('capital intacto', sum(s.rows, r => r.principal) === 12000);
    ok('la cuenta cierra', r2(s.totalAlreadyPaid + s.totalToCollect) === s.totalPendingAmount);
  }
  
  });

  it("Suelo: el abono no puede quedar por encima de la cuota", () => {
  {
    // Abono grande (2,000) y extension grande (+6): la cuota bajaria a 1,583.33, por debajo
    // de lo ya pagado. Sin suelo, al cliente se le borrarian 416.67.
    const installments = mkSimple({ amount: 10000, rate: 15, factor: 0.5, n: 6, firstDue: new Date(2026, 7, 15), stepDays: 14 });
    const payments = [{ amount: 2000, principal_amount: 1379.31, interest_amount: 620.69, due_date: installments[0].due_date }];
  
    const s = computeExtendedSchedule({
      amount: 10000, interestRate: 15, frequency: 'biweekly', amortizationType: 'simple',
      installments, payments, additionalCount: 6,
    });
  
    ok('12 cuotas', s.pendingCountAfter === 12);
    ok('la cuota #1 se fija en lo abonado', s.rows[0].total === 2000, String(s.rows[0].total));
    ok('queda saldada, no negativa', s.rows[0].pendingAfter === 0, String(s.rows[0].pendingAfter));
    ok('marcada como fijada', s.rows[0].cappedByPayment === true);
    ok('solo esa fijada', s.cappedCount === 1, String(s.cappedCount));
    ok('ninguna cuota vale menos de lo abonado', s.rows.every(r => r.total + 0.005 >= r.alreadyPaid));
    ok('ningun pendiente negativo', s.rows.every(r => r.pendingAfter >= 0));
  
    // El capital sigue cuadrando: lo que absorbe la fijada sale del reparto de las demas.
    ok('el capital sigue sumando 10,000', sum(s.rows, r => r.principal) === 10000, String(sum(s.rows, r => r.principal)));
    ok('deja de ser uniforme', s.uniformPayment === false);
    ok('la cuenta cierra', r2(s.totalAlreadyPaid + s.totalToCollect) === s.totalPendingAmount);
  }
  
  });

  it("Abono DIRECTO a capital: ese si se descuenta", () => {
  {
    // Un abono a capital no esta acreditado contra ninguna fecha de vencimiento, asi que si no
    // se restara el cliente volveria a deber un capital que ya pago.
    const installments = mkSimple({ amount: 10000, rate: 15, factor: 0.5, n: 6, firstDue: new Date(2026, 7, 15), stepDays: 14 });
    const s = computeExtendedSchedule({
      amount: 10000, interestRate: 15, frequency: 'biweekly', amortizationType: 'simple',
      installments, additionalCount: 2, capitalPayments: 2500,
    });
    ok('capital a repartir 7,500', s.outstandingCapital === 7500, String(s.outstandingCapital));
    ok('capital repartido 7,500', sum(s.rows, r => r.principal) === 7500);
    ok('sin abonos por cuota', s.totalAlreadyPaid === 0);
  
    // Y los dos a la vez se comportan de forma distinta, como debe ser.
    const mixto = computeExtendedSchedule({
      amount: 10000, interestRate: 15, frequency: 'biweekly', amortizationType: 'simple',
      installments, payments: [{ amount: 1000, principal_amount: 689.66, interest_amount: 310.34, due_date: installments[0].due_date }],
      additionalCount: 2, capitalPayments: 2500,
    });
    ok('el abono a capital resta, el parcial no', mixto.outstandingCapital === 7500, String(mixto.outstandingCapital));
    ok('el parcial sigue acreditado', mixto.rows[0].alreadyPaid === 1000);
  }
  
  });

  it("Los pagos de cuotas YA saldadas no se cuelan", () => {
  {
    const installments = mkSimple({ amount: 10000, rate: 15, factor: 0.5, n: 6, firstDue: new Date(2026, 7, 15), stepDays: 14, paidCount: 2 });
    const payments = [
      { amount: 2416.67, principal_amount: 1666.67, interest_amount: 750, due_date: installments[0].due_date },
      { amount: 2416.67, principal_amount: 1666.67, interest_amount: 750, due_date: installments[1].due_date },
      { amount: 500, principal_amount: 344.83, interest_amount: 155.17, due_date: installments[2].due_date },
    ];
    const s = computeExtendedSchedule({
      amount: 10000, interestRate: 15, frequency: 'biweekly', amortizationType: 'simple',
      installments, payments, additionalCount: 2,
    });
  
    ok('6 cuotas pendientes', s.pendingCountAfter === 6);
    ok('solo cuenta el abono de la 3a', s.totalAlreadyPaid === 500, String(s.totalAlreadyPaid));
    ok('la primera pendiente es la #3', s.rows[0].installmentNumber === 3);
    ok('y lleva su abono', s.rows[0].alreadyPaid === 500, String(s.rows[0].alreadyPaid));
    // Las pagadas ya descontaron su capital
    ok('capital pendiente 6,666.66', s.outstandingCapital === 6666.66, String(s.outstandingCapital));
    ok('la cuenta cierra', r2(s.totalAlreadyPaid + s.totalToCollect) === s.totalPendingAmount);
  }
  
  });

  it("Sin pagos se comporta exactamente igual que antes", () => {
  {
    const installments = mkSimple({ amount: 10000, rate: 15, factor: 0.5, n: 6, firstDue: new Date(2026, 7, 15), stepDays: 14 });
    const sinPagos = computeExtendedSchedule({
      amount: 10000, interestRate: 15, frequency: 'biweekly', amortizationType: 'simple',
      installments, additionalCount: 2,
    });
    const listaVacia = computeExtendedSchedule({
      amount: 10000, interestRate: 15, frequency: 'biweekly', amortizationType: 'simple',
      installments, payments: [], additionalCount: 2,
    });
    ok('mismos importes', sinPagos.rows.map(r => r.total).join() === listaVacia.rows.map(r => r.total).join());
    ok('todo sin abonar', sinPagos.totalAlreadyPaid === 0 && listaVacia.totalAlreadyPaid === 0);
    ok('por cobrar = contrato', sinPagos.totalToCollect === sinPagos.totalPendingAmount);
    ok('ninguna fijada', sinPagos.cappedCount === 0);
  }
  
  });

  it("Abonos con francesa y alemana", () => {
  {
    const mkRows = (n, cap, int) => Array.from({ length: n }, (_, i) => ({
      id: `x${i + 1}`, installment_number: i + 1, due_date: `2026-0${i + 1}-15`,
      principal_amount: cap, interest_amount: int, total_amount: cap + int, is_paid: false,
    }));
  
    const fr = computeExtendedSchedule({
      amount: 9000, interestRate: 2, frequency: 'monthly', amortizationType: 'french',
      installments: mkRows(3, 3000, 100),
      payments: [{ amount: 800, principal_amount: 700, interest_amount: 100, due_date: '2026-01-15' }],
      additionalCount: 3,
    });
    ok('francesa: capital suma 9,000', sum(fr.rows, r => r.principal) === 9000, String(sum(fr.rows, r => r.principal)));
    ok('francesa: abono reflejado', fr.rows[0].alreadyPaid === 800);
    ok('francesa: la cuenta cierra', r2(fr.totalAlreadyPaid + fr.totalToCollect) === fr.totalPendingAmount);
  
    const ge = computeExtendedSchedule({
      amount: 8000, interestRate: 2, frequency: 'monthly', amortizationType: 'german',
      installments: mkRows(2, 4000, 160),
      payments: [{ amount: 1000, principal_amount: 900, interest_amount: 100, due_date: '2026-01-15' }],
      additionalCount: 2,
    });
    ok('alemana: capital suma 8,000', sum(ge.rows, r => r.principal) === 8000, String(sum(ge.rows, r => r.principal)));
    ok('alemana: abono reflejado', ge.rows[0].alreadyPaid === 1000);
    ok('alemana: la cuenta cierra', r2(ge.totalAlreadyPaid + ge.totalToCollect) === ge.totalPendingAmount);
  }
  
  });

  it("BALANCE RESULTANTE: RD$5,000 al 20% quincenal", () => {
  {
    // Caso reportado. Interes por cuota = 5,000 x 20% x 0.5 = 500.
    const mk = (n) => mkSimple({ amount: 5000, rate: 20, factor: 0.5, n, firstDue: new Date(2026, 8, 15), stepDays: 14 });
  
    // 4 cuotas -> +2 = 6. Contrato: 5,000 + 6x500 = 8,000
    const a = computeExtendedSchedule({
      amount: 5000, interestRate: 20, frequency: 'biweekly', amortizationType: 'simple',
      installments: mk(4), additionalCount: 2,
    });
    ok('4+2: cuota 1,333.33', a.representativePayment === 1333.33, String(a.representativePayment));
    ok('4+2: total 8,000', a.newTotalAmount === 8000, String(a.newTotalAmount));
    ok('4+2: balance 8,000', a.newRemainingBalance === 8000, String(a.newRemainingBalance));
  
    // 6 cuotas -> +2 = 8. Contrato: 5,000 + 8x500 = 9,000
    const b = computeExtendedSchedule({
      amount: 5000, interestRate: 20, frequency: 'biweekly', amortizationType: 'simple',
      installments: mk(6), additionalCount: 2,
    });
    ok('6+2: cuota 1,125', b.representativePayment === 1125, String(b.representativePayment));
    ok('6+2: total 9,000', b.newTotalAmount === 9000, String(b.newTotalAmount));
    // El 9,000 de la vista previa era CORRECTO; lo que quedaba mal era el balance guardado.
    ok('6+2: balance 9,000', b.newRemainingBalance === 9000, String(b.newRemainingBalance));
    ok('balance = total cuando no hay pagos ni cargos', b.newRemainingBalance === b.newTotalAmount);
  }
  
  });

  it("El balance descuenta los pagos y suma los cargos", () => {
  {
    const installments = mkSimple({ amount: 5000, rate: 20, factor: 0.5, n: 6, firstDue: new Date(2026, 8, 15), stepDays: 14 });
  
    // Con un abono de 600
    const conPago = computeExtendedSchedule({
      amount: 5000, interestRate: 20, frequency: 'biweekly', amortizationType: 'simple',
      installments,
      payments: [{ amount: 600, principal_amount: 375, interest_amount: 225, due_date: installments[0].due_date }],
      additionalCount: 2,
    });
    ok('total sigue siendo el del contrato', conPago.newTotalAmount === 9000, String(conPago.newTotalAmount));
    ok('balance 9,000 - 600 = 8,400', conPago.newRemainingBalance === 8400, String(conPago.newRemainingBalance));
  
    // Con un cargo pendiente de 1,213
    const conCargo = [...installments, {
      id: 'c1', installment_number: 7, due_date: '2026-09-30',
      principal_amount: 1213, interest_amount: 0, total_amount: 1213, is_paid: false,
    }];
    const s = computeExtendedSchedule({
      amount: 5000, interestRate: 20, frequency: 'biweekly', amortizationType: 'simple',
      installments: conCargo, additionalCount: 2,
    });
    ok('el cargo no entra en el total del contrato', s.newTotalAmount === 9000, String(s.newTotalAmount));
    ok('pero si en el balance: 9,000 + 1,213', s.newRemainingBalance === 10213, String(s.newRemainingBalance));
  
    // Pagos que solo traen capital/interes, sin `amount`
    const sinAmount = computeExtendedSchedule({
      amount: 5000, interestRate: 20, frequency: 'biweekly', amortizationType: 'simple',
      installments,
      payments: [{ amount: 0, principal_amount: 375, interest_amount: 225, due_date: installments[0].due_date }],
      additionalCount: 2,
    });
    ok('reconstruye el pago sin amount', sinAmount.newRemainingBalance === 8400, String(sinAmount.newRemainingBalance));
  }
  
  });

  it("El balance nunca es negativo", () => {
  {
    const installments = mkSimple({ amount: 5000, rate: 20, factor: 0.5, n: 6, firstDue: new Date(2026, 8, 15), stepDays: 14 });
    const s = computeExtendedSchedule({
      amount: 5000, interestRate: 20, frequency: 'biweekly', amortizationType: 'simple',
      installments,
      payments: [{ amount: 99999, principal_amount: 60000, interest_amount: 39999, due_date: installments[0].due_date }],
      additionalCount: 2,
    });
    ok('se corta en 0', s.newRemainingBalance === 0, String(s.newRemainingBalance));
  }
  
  });

  it("REGLA DE LA EMPRESA: la extension descarta los abonos previos", () => {
  {
    // 5,000 al 20% quincenal, 6 cuotas de 1,333.33. Abono de 600 a la cuota #1.
    const installments = mkSimple({ amount: 5000, rate: 20, factor: 0.5, n: 6, firstDue: new Date(2026, 8, 15), stepDays: 14 });
    const payments = [{ amount: 600, principal_amount: 375, interest_amount: 225, due_date: installments[0].due_date }];
    const base = {
      amount: 5000, interestRate: 20, frequency: 'biweekly', amortizationType: 'simple',
      installments, payments, additionalCount: 2,
    };
  
    const s = computeExtendedSchedule({ ...base, ignorePriorPartialPayments: true });
  
    ok('8 cuotas de 1,125', s.rows.every(r => r.total === 1125), s.rows.map(r => r.total).join('/'));
    // Lo pedido: la cuota debe su importe INTEGRO, el abono no se descuenta.
    ok('la cuota #1 debe su importe integro', s.rows[0].pendingAfter === 1125, String(s.rows[0].pendingAfter));
    ok('el balance NO resta el abono', s.newRemainingBalance === 9000, String(s.newRemainingBalance));
    ok('balance = total del contrato', s.newRemainingBalance === s.newTotalAmount);
    ok('por cobrar = contrato entero', s.totalToCollect === 9000, String(s.totalToCollect));
  
    // El abono se sigue informando para poder AVISARLO en pantalla.
    ok('el abono se informa igualmente', s.rows[0].alreadyPaid === 600, String(s.rows[0].alreadyPaid));
    ok('total informado 600', s.totalAlreadyPaid === 600, String(s.totalAlreadyPaid));
  
    // Consecuencia aceptada: el cliente vuelve a deber lo que ya pago.
    ok('el cliente paga 600 de mas', r2(600 + s.totalToCollect) === 9600, String(r2(600 + s.totalToCollect)));
  
    // Sin la regla, el mismo caso descuenta el abono.
    const conCredito = computeExtendedSchedule(base);
    ok('sin la regla el balance resta el abono', conCredito.newRemainingBalance === 8400, String(conCredito.newRemainingBalance));
    ok('sin la regla la cuota #1 debe 525', conCredito.rows[0].pendingAfter === 525, String(conCredito.rows[0].pendingAfter));
    ok('el capital repartido es el mismo en ambos', conCredito.outstandingCapital === s.outstandingCapital);
  }
  
  });

  it("Con la regla activa no hay suelo por abono", () => {
  {
    // Abono grande (2,000) y extension grande: sin la regla la cuota se fijaria en 2,000;
    // con la regla el abono no cuenta, asi que no hay nada que fijar.
    const installments = mkSimple({ amount: 10000, rate: 15, factor: 0.5, n: 6, firstDue: new Date(2026, 7, 15), stepDays: 14 });
    const payments = [{ amount: 2000, principal_amount: 1379.31, interest_amount: 620.69, due_date: installments[0].due_date }];
  
    const s = computeExtendedSchedule({
      amount: 10000, interestRate: 15, frequency: 'biweekly', amortizationType: 'simple',
      installments, payments, additionalCount: 6, ignorePriorPartialPayments: true,
    });
    ok('ninguna cuota fijada', s.cappedCount === 0, String(s.cappedCount));
    ok('todas iguales', s.uniformPayment === true);
    ok('la #1 no se libra por el abono', s.rows[0].pendingAfter === s.rows[0].total);
    ok('capital sigue sumando 10,000', sum(s.rows, r => r.principal) === 10000);
  }
  
  });

  it("Los abonos a CAPITAL siguen restando", () => {
  {
    // La regla es solo para abonos a cuotas: un abono directo a capital reduce el principal
    // por definicion y se sigue descontando.
    const installments = mkSimple({ amount: 10000, rate: 15, factor: 0.5, n: 6, firstDue: new Date(2026, 7, 15), stepDays: 14 });
    const s = computeExtendedSchedule({
      amount: 10000, interestRate: 15, frequency: 'biweekly', amortizationType: 'simple',
      installments, additionalCount: 2, capitalPayments: 2500, ignorePriorPartialPayments: true,
    });
    ok('capital a repartir 7,500', s.outstandingCapital === 7500, String(s.outstandingCapital));
    ok('capital repartido 7,500', sum(s.rows, r => r.principal) === 7500);
  }
  
  });

  it("Sin abonos la regla no cambia nada", () => {
  {
    const installments = mkSimple({ amount: 5000, rate: 20, factor: 0.5, n: 6, firstDue: new Date(2026, 8, 15), stepDays: 14 });
    const con = computeExtendedSchedule({
      amount: 5000, interestRate: 20, frequency: 'biweekly', amortizationType: 'simple',
      installments, additionalCount: 2, ignorePriorPartialPayments: true,
    });
    const sin = computeExtendedSchedule({
      amount: 5000, interestRate: 20, frequency: 'biweekly', amortizationType: 'simple',
      installments, additionalCount: 2,
    });
    ok('mismo balance', con.newRemainingBalance === sin.newRemainingBalance && con.newRemainingBalance === 9000);
    ok('mismos importes', con.rows.map(r => r.total).join() === sin.rows.map(r => r.total).join());
    ok('nada que avisar', con.totalAlreadyPaid === 0);
  }
  
  });

  it("Que pagos hay que ELIMINAR al extender", () => {
  {
    // 6 cuotas; abonos en la #1 y la #3; la #2 sin abono.
    const installments = mkSimple({ amount: 5000, rate: 20, factor: 0.5, n: 6, firstDue: new Date(2026, 8, 15), stepDays: 14 });
    const payments = [
      { amount: 500, principal_amount: 312.5, interest_amount: 187.5, due_date: installments[0].due_date },
      { amount: 300, principal_amount: 187.5, interest_amount: 112.5, due_date: installments[2].due_date },
    ];
    const s = computeExtendedSchedule({
      amount: 5000, interestRate: 20, frequency: 'biweekly', amortizationType: 'simple',
      installments, payments, additionalCount: 2, ignorePriorPartialPayments: true,
    });
  
    ok('dos fechas a eliminar', s.discardedPaymentDueDates.length === 2, s.discardedPaymentDueDates.join());
    ok('la de la cuota 1', s.discardedPaymentDueDates.includes(installments[0].due_date));
    ok('la de la cuota 3', s.discardedPaymentDueDates.includes(installments[2].due_date));
    ok('NO la de la cuota 2 (sin abono)', !s.discardedPaymentDueDates.includes(installments[1].due_date));
    ok('ninguna fecha de cuota nueva', s.discardedPaymentDueDates.every(d => installments.some(i => i.due_date === d)));
  
    // Sin la regla no se elimina nada.
    const sinRegla = computeExtendedSchedule({
      amount: 5000, interestRate: 20, frequency: 'biweekly', amortizationType: 'simple',
      installments, payments, additionalCount: 2,
    });
    ok('sin la regla no se elimina nada', sinRegla.discardedPaymentDueDates.length === 0);
  }
  
  });

  it("Los pagos de cuotas YA saldadas no se borran ni se dejan de restar", () => {
  {
    // Dos cuotas pagadas por completo + un abono en la tercera.
    const installments = mkSimple({ amount: 5000, rate: 20, factor: 0.5, n: 6, firstDue: new Date(2026, 8, 15), stepDays: 14, paidCount: 2 });
    const cuotaVieja = installments[0].total_amount; // 1,333.33
    const payments = [
      { amount: cuotaVieja, principal_amount: 833.33, interest_amount: 500, due_date: installments[0].due_date },
      { amount: cuotaVieja, principal_amount: 833.33, interest_amount: 500, due_date: installments[1].due_date },
      { amount: 400, principal_amount: 250, interest_amount: 150, due_date: installments[2].due_date },
    ];
    const s = computeExtendedSchedule({
      amount: 5000, interestRate: 20, frequency: 'biweekly', amortizationType: 'simple',
      installments, payments, additionalCount: 2, ignorePriorPartialPayments: true,
    });
  
    ok('solo se borra el abono de la 3a', s.discardedPaymentDueDates.length === 1
      && s.discardedPaymentDueDates[0] === installments[2].due_date, s.discardedPaymentDueDates.join());
  
    // El balance sigue restando lo de las cuotas saldadas (su importe ya esta en el total),
    // pero NO el abono que se elimina.
    const pagadoCuotasSaldadas = r2(cuotaVieja * 2);
    ok('el balance resta solo las saldadas',
      s.newRemainingBalance === r2(s.newTotalAmount - pagadoCuotasSaldadas),
      `${s.newRemainingBalance} vs ${r2(s.newTotalAmount - pagadoCuotasSaldadas)}`);
    ok('el abono eliminado NO se resta',
      s.newRemainingBalance !== r2(s.newTotalAmount - pagadoCuotasSaldadas - 400));
  }
  
  });

  it("Tras eliminar el pago, la extension no lo ve", () => {
  {
    // Estado de la BD DESPUES de aplicar la extension: el abono ya no existe.
    const installments = mkSimple({ amount: 5000, rate: 20, factor: 0.5, n: 6, firstDue: new Date(2026, 8, 15), stepDays: 14 });
    const s = computeExtendedSchedule({
      amount: 5000, interestRate: 20, frequency: 'biweekly', amortizationType: 'simple',
      installments, payments: [], additionalCount: 2, ignorePriorPartialPayments: true,
    });
    ok('ninguna cuota con abono', s.totalAlreadyPaid === 0, String(s.totalAlreadyPaid));
    ok('nada mas que eliminar', s.discardedPaymentDueDates.length === 0);
    ok('el balance es el contrato entero', s.newRemainingBalance === 9000, String(s.newRemainingBalance));
    ok('todas las cuotas deben su importe integro', s.rows.every(r => r.pendingAfter === r.total));
  }
  
  });

  it("Red de seguridad: un pago con superseded_at tampoco cuenta", () => {
  {
    // Quedo de la version anterior del mecanismo. No debe acreditarse ni restar del balance.
    const installments = mkSimple({ amount: 5000, rate: 20, factor: 0.5, n: 6, firstDue: new Date(2026, 8, 15), stepDays: 14 });
    const s = computeExtendedSchedule({
      amount: 5000, interestRate: 20, frequency: 'biweekly', amortizationType: 'simple',
      installments,
      payments: [{
        amount: 500, principal_amount: 312.5, interest_amount: 187.5,
        due_date: installments[0].due_date, superseded_at: '2026-09-01T10:00:00Z',
      }],
      additionalCount: 2, ignorePriorPartialPayments: true,
    });
    ok('no se acredita a la cuota', s.totalAlreadyPaid === 0, String(s.totalAlreadyPaid));
    ok('no se resta del balance', s.newRemainingBalance === 9000, String(s.newRemainingBalance));
    ok('no se intenta eliminar de nuevo', s.discardedPaymentDueDates.length === 0);
  }
  
  
  });
});
