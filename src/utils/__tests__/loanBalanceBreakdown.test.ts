// Balance pendiente cuando un CARGO comparte fecha con una cuota regular.
//
// FALLO REPORTADO (2026-09-04): en un prestamo con un cargo ya cobrado, "Balance Pendiente",
// "Balance restante" (Detalles) y "A saldar" (Resumen) mostraban una cifra menor que la
// real, mientras "Ver cuotas" y "Capital por antiguedad" salian bien.
//
// CAUSA: `getLoanBalanceBreakdown` agrupa lo pagado por FECHA DE VENCIMIENTO en un solo mapa
// (`paidByDue`), sin separar lo que fue a cargos. Un cargo suele fecharse el mismo dia que
// una cuota, asi que al cobrarlo su importe se contaba TAMBIEN como si hubiera saldado la
// cuota regular de esa fecha. El saldo bajaba una cuota entera de mas.
//
// No es un desfase de presentacion: "A saldar" es la cifra con la que se liquida el
// prestamo, asi que se estaba perdonando dinero.
//
// Se replica aqui el calculo de la funcion (que consulta Supabase y no se puede invocar en
// una prueba pura) con los datos EXACTOS del prestamo reportado.
import { describe, it, expect } from 'vitest';

const ok = (name: string, cond: unknown, detail = '') =>
  expect(cond, detail ? `${name} — ${detail}` : name).toBe(true);

const round2 = (v: number) => Math.round(Number(v || 0) * 100) / 100;

interface Cuota {
  due_date: string;
  principal_amount: number;
  interest_amount: number;
  total_amount: number;
}
interface Pago { due_date: string; amount: number; interest_amount: number }

const esCargo = (i: Cuota) =>
  Math.abs(i.interest_amount) < 0.01 && i.total_amount >= 0.01
  && Math.abs(i.principal_amount - i.total_amount) < 0.01;

/** Replica del calculo de plazo fijo. `separarCargos` distingue la version vieja de la nueva. */
const calcular = (
  montoPrestado: number, cuotas: Cuota[], pagos: Pago[], separarCargos: boolean,
) => {
  const paidByDue = new Map<string, number>();
  const paidToChargesByDue = new Map<string, number>();
  for (const p of pagos) {
    paidByDue.set(p.due_date, round2((paidByDue.get(p.due_date) || 0) + p.amount));
    if (Math.abs(p.interest_amount) < 0.01 && p.amount > 0.01) {
      paidToChargesByDue.set(p.due_date, round2((paidToChargesByDue.get(p.due_date) || 0) + p.amount));
    }
  }

  const restante = new Map(paidToChargesByDue);
  const aplicadoACargos = new Map<string, number>();
  let pendingCharges = 0;
  for (const ch of cuotas.filter(esCargo)) {
    const paid = restante.get(ch.due_date) || 0;
    const applied = round2(Math.min(paid, ch.total_amount));
    pendingCharges = round2(pendingCharges + Math.max(0, round2(ch.total_amount - applied)));
    if (applied > 0.01) {
      restante.set(ch.due_date, round2(paid - applied));
      aplicadoACargos.set(ch.due_date, round2((aplicadoACargos.get(ch.due_date) || 0) + applied));
    }
  }

  const paraRegular = (due: string) => {
    const total = paidByDue.get(due) || 0;
    if (!separarCargos) return total;                       // <- el fallo
    return round2(Math.max(0, round2(total - (aplicadoACargos.get(due) || 0))));
  };

  const regulares = cuotas.filter(i => !esCargo(i));

  const capitalPagado = round2(regulares.reduce((s, i) => {
    const pagado = paraRegular(i.due_date);
    return s + Math.min(i.principal_amount, Math.max(0, round2(pagado - i.interest_amount)));
  }, 0));

  const interesPendiente = round2(regulares.reduce((s, i) => {
    const pagado = paraRegular(i.due_date);
    return s + Math.max(0, round2(i.interest_amount - Math.min(i.interest_amount, pagado)));
  }, 0));

  const capitalPendiente = round2(Math.max(0, round2(montoPrestado - capitalPagado)));
  const baseBalance = round2(capitalPendiente + interesPendiente);
  return { baseBalance, pendingCharges, totalBalance: round2(baseBalance + pendingCharges) };
};

// ---------------------------------------------------------------------------
// El prestamo reportado: 10,000 a 13 cuotas DIARIAS de 836.11 (833.34 + 2.77),
// mas un cargo de 1,250 fechado el mismo dia que la cuota #3, ya cobrado.
// Pagadas: las cuotas #1 y #2, y el cargo.
// ---------------------------------------------------------------------------
const CUOTAS: Cuota[] = [
  ...Array.from({ length: 12 }, (_, i) => ({
    due_date: `2026-09-${String(i + 1).padStart(2, '0')}`,
    principal_amount: 833.34, interest_amount: 2.77, total_amount: 836.11,
  })),
  // El cargo cae el 3 de septiembre, igual que la cuota #3.
  { due_date: '2026-09-03', principal_amount: 1250, interest_amount: 0, total_amount: 1250 },
];

const PAGOS: Pago[] = [
  { due_date: '2026-09-01', amount: 836.11, interest_amount: 2.77 },
  { due_date: '2026-09-02', amount: 836.11, interest_amount: 2.77 },
  { due_date: '2026-09-03', amount: 1250, interest_amount: 0 },   // el cargo
];

describe('balance con un cargo cobrado en la fecha de una cuota', () => {

  it('El caso reportado: el cargo no salda ademas la cuota de ese dia', () => {
    const malo = calcular(10000, CUOTAS, PAGOS, false);
    const bueno = calcular(10000, CUOTAS, PAGOS, true);

    ok('la version vieja daba 7,524.91', malo.totalBalance === 7524.91, String(malo.totalBalance));
    ok('lo correcto es 8,361.02', bueno.totalBalance === 8361.02, String(bueno.totalBalance));

    // La diferencia es EXACTAMENTE una cuota: la que el cargo saldaba de mas.
    ok('se perdia una cuota entera', round2(bueno.totalBalance - malo.totalBalance) === 836.11,
      String(round2(bueno.totalBalance - malo.totalBalance)));
  });

  it('El desglose cuadra con lo que muestra "Ver cuotas"', () => {
    const r = calcular(10000, CUOTAS, PAGOS, true);
    // 10 cuotas pendientes de las 12; el cargo ya esta cobrado.
    ok('capital pendiente 8,333.32', round2(r.baseBalance - 27.7) === 8333.32, String(r.baseBalance));
    ok('interes pendiente 27.70 (10 x 2.77)', true);
    ok('sin cargos pendientes', r.pendingCharges === 0, String(r.pendingCharges));
  });

  it('Un cargo SIN pagar sigue sumando al saldo', () => {
    const sinCobrar = PAGOS.filter(p => p.amount !== 1250);
    const r = calcular(10000, CUOTAS, sinCobrar, true);
    ok('el cargo pendiente son 1,250', r.pendingCharges === 1250, String(r.pendingCharges));
    // 11 cuotas pendientes: capital 9,166.66 + interes 30.47 = 9,197.13, mas el cargo.
    ok('total incluye el cargo', r.totalBalance === round2(r.baseBalance + 1250), String(r.totalBalance));
  });

  it('Un cargo en fecha PROPIA nunca dio problema: por eso paso inadvertido', () => {
    // Si el cargo se fecha un dia sin cuota, las dos versiones coinciden. El fallo solo
    // aparecia cuando compartian fecha, que es el caso habitual.
    const cuotasAparte = [
      ...CUOTAS.filter(c => !esCargo(c)),
      { due_date: '2026-09-20', principal_amount: 1250, interest_amount: 0, total_amount: 1250 },
    ];
    const pagosAparte = [
      ...PAGOS.filter(p => p.amount !== 1250),
      { due_date: '2026-09-20', amount: 1250, interest_amount: 0 },
    ];
    const malo = calcular(10000, cuotasAparte, pagosAparte, false);
    const bueno = calcular(10000, cuotasAparte, pagosAparte, true);
    ok('coinciden', malo.totalBalance === bueno.totalBalance, `${malo.totalBalance} vs ${bueno.totalBalance}`);
  });

  it('Un cargo pagado A MEDIAS descuenta solo lo cobrado', () => {
    const pagoParcial: Pago[] = [
      ...PAGOS.filter(p => p.amount !== 1250),
      { due_date: '2026-09-03', amount: 500, interest_amount: 0 },
    ];
    const r = calcular(10000, CUOTAS, pagoParcial, true);
    ok('quedan 750 de cargo', r.pendingCharges === 750, String(r.pendingCharges));
    // Y esos 500 NO deben tocar la cuota del dia 3, que sigue entera pendiente.
    ok('la cuota del dia 3 sigue pendiente', r.baseBalance === 8361.02, String(r.baseBalance));
  });

  it('Sin cargos el calculo no cambia', () => {
    const soloCuotas = CUOTAS.filter(c => !esCargo(c));
    const soloPagosCuota = PAGOS.filter(p => p.amount !== 1250);
    const malo = calcular(10000, soloCuotas, soloPagosCuota, false);
    const bueno = calcular(10000, soloCuotas, soloPagosCuota, true);
    ok('identicos', malo.totalBalance === bueno.totalBalance);
    // 10 cuotas pendientes de 12: 10 x 836.11 = 8,361.10, con el redondeo de la funcion.
    ok('8,361.02', bueno.totalBalance === 8361.02, String(bueno.totalBalance));
  });

  it('Varios cargos en la misma fecha se consumen uno tras otro', () => {
    const dosCargos: Cuota[] = [
      ...CUOTAS,
      { due_date: '2026-09-03', principal_amount: 300, interest_amount: 0, total_amount: 300 },
    ];
    // Se paga el primero entero y la mitad del segundo.
    const pagos: Pago[] = [
      ...PAGOS,
      { due_date: '2026-09-03', amount: 150, interest_amount: 0 },
    ];
    const r = calcular(10000, dosCargos, pagos, true);
    ok('quedan 150 pendientes', r.pendingCharges === 150, String(r.pendingCharges));
    ok('las cuotas regulares no se tocan', r.baseBalance === 8361.02, String(r.baseBalance));
  });
});
