// Atraso real de un prestamo: cuanto se debe HOY y desde cuando.
//
// FALLO REPORTADO (2026-09-03): el inicio mostraba un monto atrasado y unos dias de atraso
// que no cuadraban, "como si no actualizara".
//
// Eran DOS defectos distintos:
//
//   1. El MONTO estaba mal por definicion, no por estar viejo: `overdueAmount` sumaba el
//      `remaining_balance` COMPLETO de cada prestamo atrasado. Un prestamo con una cuota de
//      800 vencida y otras quince por vencer aportaba su deuda entera. La cifra salia
//      inflada en un orden de magnitud.
//
//   2. Los DIAS salian de `loans.next_payment_date`, una columna que mantienen triggers. Si
//      alguno no habia corrido, el inicio mostraba el dato viejo sin que nada lo delatara.
//
// La correccion deriva las dos cosas de las CUOTAS, que son el dato de origen y no dependen
// de que ningun trigger haya corrido.
import { describe, it, expect } from 'vitest';

import {
  overdueFromDues, computeTodayAgenda, computePortfolioSnapshot, type OverdueFacts,
} from '@/utils/portfolioMetrics';

const ok = (name: string, cond: unknown, detail = '') =>
  expect(cond, detail ? `${name} — ${detail}` : name).toBe(true);

const HOY = '2026-09-03';

const due = (dueDate: string, pending: number) => ({ dueDate, pending });

describe('atraso real desde las cuotas', () => {

  it('Lo atrasado es lo VENCIDO, no el prestamo entero', () => {
    // Una cuota vencida de 800 y quince por vencer de 800.
    const dues = [
      due('2026-08-20', 800),                    // vencida
      ...Array.from({ length: 15 }, (_, i) => due(`2026-1${i % 2}-0${(i % 9) + 1}`, 800)),
    ];
    const facts = overdueFromDues(dues, HOY);

    ok('atrasado = solo la vencida', facts.overdueAmount === 800, String(facts.overdueAmount));
    ok('pendiente = todo', facts.pendingAmount === 12800, String(facts.pendingAmount));
    // La diferencia entre las dos cifras es justo lo que se mostraba de mas.
    ok('el prestamo entero es 16 veces lo atrasado',
      facts.pendingAmount / facts.overdueAmount === 16);
  });

  it('Los dias salen de la cuota vencida MAS ANTIGUA', () => {
    // Cinco cuotas sin pagar: el atraso es el de la primera, no el de la ultima.
    const dues = [
      due('2026-05-03', 800), due('2026-06-03', 800), due('2026-07-03', 800),
      due('2026-08-03', 800), due('2026-09-01', 800),
    ];
    const facts = overdueFromDues(dues, HOY);

    ok('desde el 3 de mayo', facts.oldestOverdueDate === '2026-05-03', String(facts.oldestOverdueDate));
    ok('123 dias', facts.daysOverdue === 123, String(facts.daysOverdue));
    ok('atrasado son las cinco', facts.overdueAmount === 4000, String(facts.overdueAmount));

    // Si se tomara la mas reciente saldrian 2 dias: el cliente pareceria casi al dia.
    ok('no toma la mas reciente', facts.daysOverdue !== 2);
  });

  it('Una cuota abonada a medias cuenta solo por lo que falta', () => {
    // 800 de cuota con 500 ya abonados: lo atrasado son 300, no 800 ni 0.
    const facts = overdueFromDues([due('2026-08-20', 300)], HOY);
    ok('300', facts.overdueAmount === 300, String(facts.overdueAmount));
    ok('sigue contando como atrasada', facts.daysOverdue > 0);
  });

  it('Las cuotas saldadas no cuentan ni por monto ni por dias', () => {
    // `computeInstallmentDues` deja `pending` en 0; aqui se ignoran.
    const dues = [
      due('2026-05-03', 0), due('2026-06-03', 0),   // pagadas
      due('2026-08-20', 800),                        // la unica realmente atrasada
    ];
    const facts = overdueFromDues(dues, HOY);
    ok('solo la pendiente', facts.overdueAmount === 800, String(facts.overdueAmount));
    ok('y desde su fecha', facts.oldestOverdueDate === '2026-08-20', String(facts.oldestOverdueDate));
    ok('14 dias', facts.daysOverdue === 14, String(facts.daysOverdue));
  });

  it('Al dia: sin atraso aunque queden cuotas por vencer', () => {
    const facts = overdueFromDues([due('2026-10-03', 800), due('2026-11-03', 800)], HOY);
    ok('cero dias', facts.daysOverdue === 0);
    ok('cero atrasado', facts.overdueAmount === 0);
    ok('pero si hay pendiente', facts.pendingAmount === 1600);
    ok('sin fecha de atraso', facts.oldestOverdueDate === null);
  });

  it('La cuota que vence HOY todavia no esta atrasada', () => {
    const facts = overdueFromDues([due(HOY, 800)], HOY);
    ok('no cuenta como atraso', facts.overdueAmount === 0 && facts.daysOverdue === 0);
    ok('pero esta pendiente', facts.pendingAmount === 800);
  });

  it('LA GRACIA NO BORRA LOS DIAS DE ATRASO, solo la mora', () => {
    // Fallo reportado: un prestamo vencido el dia 2, mirado el dia 3 y con 2 dias de gracia,
    // mostraba "0 dias vencidos". Falso: lleva un dia vencido, lo que pasa es que ese dia no
    // genera recargo. Son dos cosas distintas y estaban mezcladas en un solo numero.
    const dues = [due('2026-08-20', 800)];  // 14 dias vencida

    ok('sin gracia: 14 dias', overdueFromDues(dues, HOY, 0).daysOverdue === 14);
    ok('con 3 de gracia SIGUEN siendo 14', overdueFromDues(dues, HOY, 3).daysOverdue === 14);
    ok('con 30 de gracia tambien', overdueFromDues(dues, HOY, 30).daysOverdue === 14);

    // Lo que si depende de la gracia es cuantos dias generan mora.
    ok('sin gracia cobran los 14', overdueFromDues(dues, HOY, 0).lateFeeDays === 14);
    ok('con 3 de gracia cobran 11', overdueFromDues(dues, HOY, 3).lateFeeDays === 11);
    ok('con 30 de gracia no cobra ninguno', overdueFromDues(dues, HOY, 30).lateFeeDays === 0);

    // El caso exacto de la captura: vencio ayer, 2 dias de gracia.
    const ayer = overdueFromDues([due('2026-09-02', 839)], HOY, 2);
    ok('1 dia de atraso, no 0', ayer.daysOverdue === 1, String(ayer.daysOverdue));
    ok('pero 0 dias de mora', ayer.lateFeeDays === 0, String(ayer.lateFeeDays));

    // El monto tampoco depende de la gracia: perdona el recargo, no la deuda.
    ok('el monto no depende de la gracia', overdueFromDues(dues, HOY, 30).overdueAmount === 800);
  });

  it('Entradas vacias o con basura no inventan atraso', () => {
    ok('sin cuotas', overdueFromDues([], HOY).daysOverdue === 0);
    ok('fecha invalida', overdueFromDues([{ dueDate: 'no-es-fecha', pending: 800 }], HOY).overdueAmount === 0);
    ok('pendiente negativo', overdueFromDues([due('2026-01-01', -50)], HOY).overdueAmount === 0);
    // Centimos residuales por redondeo no convierten un prestamo saldado en moroso.
    ok('resto de un centimo', overdueFromDues([due('2026-01-01', 0.004)], HOY).daysOverdue === 0);
  });

  it('La agenda usa el atraso real cuando lo recibe', () => {
    // Un prestamo cuyo `remaining_balance` es 20,000 pero solo tiene 800 vencidos.
    const loans = [{
      id: 'L1', client_id: 'C1', status: 'active',
      remaining_balance: 20000, monthly_payment: 800,
      next_payment_date: '2026-08-20', grace_period_days: 0,
    }] as never[];

    const facts = new Map<string, OverdueFacts>([
      ['L1', {
        daysOverdue: 14, lateFeeDays: 14, overdueAmount: 800,
        pendingAmount: 20000, oldestOverdueDate: '2026-08-20',
      }],
    ]);

    const conCuotas = computeTodayAgenda(loans, HOY, facts);
    ok('atrasado = 800', conCuotas.overdueAmount === 800, String(conCuotas.overdueAmount));
    ok('el prestamo aparece atrasado', conCuotas.overdue.length === 1);
    ok('con sus 14 dias', conCuotas.overdue[0].daysOverdue === 14);

    // Sin las cuotas cae al comportamiento anterior: el saldo COMPLETO.
    const sinCuotas = computeTodayAgenda(loans, HOY);
    ok('antes reportaba 20,000', sinCuotas.overdueAmount === 20000, String(sinCuotas.overdueAmount));
    ok('25 veces mas de lo real', sinCuotas.overdueAmount / conCuotas.overdueAmount === 25);
  });

  it('Un prestamo en gracia SI aparece atrasado, con sus dias reales', () => {
    // El cobrador tiene que verlo: la cuota esta vencida. Lo que la gracia decide es si se le
    // cobra recargo, no si se le persigue.
    const loans = [{
      id: 'L1', client_id: 'C1', status: 'active',
      remaining_balance: 20000, monthly_payment: 839,
      next_payment_date: '2026-09-02', grace_period_days: 2,
    }] as never[];

    const facts = new Map<string, OverdueFacts>([
      ['L1', {
        daysOverdue: 1, lateFeeDays: 0, overdueAmount: 839,
        pendingAmount: 13066.84, oldestOverdueDate: '2026-09-02',
      }],
    ]);
    const agenda = computeTodayAgenda(loans, HOY, facts);

    ok('esta en atrasados', agenda.overdue.length === 1, String(agenda.overdue.length));
    ok('con 1 dia, no 0', agenda.overdue[0].daysOverdue === 1, String(agenda.overdue[0].daysOverdue));
    ok('y 839 atrasados', agenda.overdueAmount === 839, String(agenda.overdueAmount));
  });

  it('Un prestamo INDEFINIDO sin datos por cuotas no desaparece de la cartera', () => {
    // FALLO REPORTADO (2026-09-04): los prestamos indefinidos dejaron de aparecer en el
    // inicio y en la cartera.
    //
    // CAUSA: el atraso y el saldo se derivan de `installments`, pero un indefinido tiene UNA
    // SOLA fila ahi —los periodos siguientes se generan sobre la marcha, porque un prestamo
    // sin vencimiento no tiene un numero de cuotas que escribir—. Al pagarse esa fila se
    // quedaba sin cuotas pendientes: saldo 0, sin atraso, fuera de la agenda.
    //
    // La correccion es NO calcular datos por cuotas para ellos. Aqui se comprueba que el
    // respaldo (`remaining_balance` / `next_payment_date`) los mantiene visibles.
    const loans = [
      { id: 'FIJO', status: 'active', amount: 10000, remaining_balance: 12000, current_late_fee: 0, next_payment_date: '2026-08-20', grace_period_days: 0, amortization_type: 'simple' },
      { id: 'INDEF', status: 'active', amount: 100000, remaining_balance: 105000, current_late_fee: 0, next_payment_date: '2026-08-25', grace_period_days: 0, amortization_type: 'indefinite' },
    ] as never[];

    // Solo el de plazo fijo tiene datos por cuotas: el indefinido se omite a proposito.
    const facts = new Map<string, OverdueFacts>([
      ['FIJO', { daysOverdue: 14, lateFeeDays: 14, overdueAmount: 800, pendingAmount: 11000, oldestOverdueDate: '2026-08-20' }],
    ]);

    const cartera = computePortfolioSnapshot(loans, HOY, facts);
    ok('cuenta los dos prestamos activos', cartera.activeLoans === 2, String(cartera.activeLoans));
    // 11,000 (por cuotas) + 105,000 (respaldo del indefinido)
    ok('el indefinido aporta su saldo', cartera.activeBalance === 116000, String(cartera.activeBalance));

    const agenda = computeTodayAgenda(loans, HOY, facts);
    ok('los dos figuran atrasados', agenda.overdue.length === 2, String(agenda.overdue.length));
    const indef = agenda.overdue.find(e => e.loan.id === 'INDEF');
    ok('el indefinido esta en la agenda', !!indef);
    ok('con sus dias desde next_payment_date', indef?.daysOverdue === 9, String(indef?.daysOverdue));
  });

  it('El saldo de cartera cuadra con lo que suman las cuotas', () => {
    // Fallo reportado: "Saldo por cobrar" no coincidia con lo que muestra "Ver cuotas".
    // Salian de fuentes distintas: uno de `remaining_balance` y el otro de las cuotas.
    const loans = [
      { id: 'L1', status: 'active', amount: 10000, remaining_balance: 20000, current_late_fee: 0, next_payment_date: '2026-10-01', grace_period_days: 0 },
      { id: 'L2', status: 'active', amount: 5000, remaining_balance: 7000, current_late_fee: 0, next_payment_date: '2026-10-01', grace_period_days: 0 },
    ] as never[];

    // Lo que de verdad suman sus cuotas pendientes es menos: el saldo de la columna iba viejo.
    const facts = new Map<string, OverdueFacts>([
      ['L1', { daysOverdue: 0, lateFeeDays: 0, overdueAmount: 0, pendingAmount: 12000, oldestOverdueDate: null }],
      ['L2', { daysOverdue: 0, lateFeeDays: 0, overdueAmount: 0, pendingAmount: 6000, oldestOverdueDate: null }],
    ]);

    const conCuotas = computePortfolioSnapshot(loans, HOY, facts);
    ok('saldo = suma de cuotas', conCuotas.activeBalance === 18000, String(conCuotas.activeBalance));

    const sinCuotas = computePortfolioSnapshot(loans, HOY);
    ok('antes daba 27,000', sinCuotas.activeBalance === 27000, String(sinCuotas.activeBalance));

    // Y el ticket promedio sale del mismo saldo, asi que tambien se corrige.
    ok('ticket promedio coherente', conCuotas.avgTicket === 9000, String(conCuotas.avgTicket));
  });
});
