// Mora que se muestra y se suma al balance de la tarjeta.
//
// FALLO REPORTADO (2026-09-18): "fíjate que ahí no hay mora, dice 0.00, pero en Balance
// Pendiente da un monto y en Balance Total Pendiente (balance + mora) da otro diferente".
// Tarjeta: Balance Pendiente RD$35,291.66 · Mora Actual RD$0.00 · Balance Total RD$35,704.15.
import { describe, it, expect } from 'vitest';
import { lateFeeColumnNeedsSync, resolveDisplayedLateFee, totalWithLateFee } from '../displayedLateFee';
import { buildRouteStops } from '../collectionRoute';

// El préstamo del reporte: la columna cacheada se quedó en 412.49 (35,704.15 − 35,291.66).
const BALANCE_PENDIENTE = 35291.66;
const COLUMNA_VIEJA = 412.49;

describe('mora de la tarjeta', () => {
  it('Así fallaba: con mora calculada 0, `||` caía a la columna vieja', () => {
    const moraCalculada = 0;
    const antes = Math.round((BALANCE_PENDIENTE + (moraCalculada || COLUMNA_VIEJA)) * 100) / 100;
    expect(antes).toBe(35704.15); // la cifra de la captura
  });

  it('EL CASO REPORTADO: sin mora, Balance Total = Balance Pendiente', () => {
    const mora = resolveDisplayedLateFee({ lateFeeEnabled: true, status: 'active', computed: 0 });
    expect(mora).toBe(0);
    expect(totalWithLateFee(BALANCE_PENDIENTE, mora)).toBe(35291.66);
  });

  it('Con mora, se suma exactamente la de "Mora Actual"', () => {
    const mora = resolveDisplayedLateFee({ lateFeeEnabled: true, status: 'overdue', computed: 150.25 });
    expect(mora).toBe(150.25);
    expect(totalWithLateFee(BALANCE_PENDIENTE, mora)).toBe(35441.91);
  });

  it('Mientras la mora no se ha calculado: "Cargando…", nunca la columna vieja', () => {
    const mora = resolveDisplayedLateFee({ lateFeeEnabled: true, status: 'active', computed: undefined });
    expect(mora).toBeNull();
    expect(totalWithLateFee(BALANCE_PENDIENTE, mora)).toBeNull();
    expect(totalWithLateFee(null, 0)).toBeNull();
  });

  it('Mora deshabilitada o préstamo saldado: 0, aunque la columna diga otra cosa', () => {
    expect(resolveDisplayedLateFee({ lateFeeEnabled: false, status: 'active', computed: 999 })).toBe(0);
    expect(resolveDisplayedLateFee({ lateFeeEnabled: true, status: 'paid', computed: 999 })).toBe(0);
  });

  it('La columna cacheada se corrige cuando no coincide con la calculada', () => {
    expect(lateFeeColumnNeedsSync(COLUMNA_VIEJA, 0)).toBe(true);
    expect(lateFeeColumnNeedsSync(0, 0)).toBe(false);
    expect(lateFeeColumnNeedsSync(null, 0)).toBe(false);
    expect(lateFeeColumnNeedsSync(100, 100.004)).toBe(false);
    // Sin cálculo no se toca: no hay con qué corregirla
    expect(lateFeeColumnNeedsSync(COLUMNA_VIEJA, null)).toBe(false);
  });
});

describe('ruta de cobro: la mora que ve el cobrador', () => {
  const HOY = '2026-09-18';
  const input = {
    clients: [{ id: 'c1', full_name: 'Cliente', phone: '809', address: 'Calle 1', sector: 'Los Mina',
      municipality: 'SDE', province: 'Santo Domingo', latitude: null, longitude: null, collection_route: 'R1' }],
    loans: [{ id: 'L1', client_id: 'c1', status: 'overdue', current_late_fee: COLUMNA_VIEJA }],
    installments: [{ loan_id: 'L1', id: 'i1', installment_number: 1, due_date: '2026-09-10',
      principal_amount: 800, interest_amount: 200, total_amount: 1000, is_paid: false, paid_amount: 0 }],
    payments: [],
    dateIso: HOY,
  } as any;

  it('Manda la mora CALCULADA (ya pagada o condonada = 0), no la columna vieja', () => {
    const [parada] = buildRouteStops({ ...input, lateFeeByLoan: new Map([['L1', 0]]) });
    expect(parada.loans[0].lateFee).toBe(0);
    expect(parada.lateFee).toBe(0);
  });

  it('Si no se pudo calcular la de un préstamo, se usa la columna (mejor que esconder una mora real)', () => {
    const [parada] = buildRouteStops(input);
    expect(parada.loans[0].lateFee).toBe(COLUMNA_VIEJA);
  });
});
