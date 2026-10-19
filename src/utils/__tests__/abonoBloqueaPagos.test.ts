// ============================================================================
// QUÉ PAGOS PUEDE BORRAR UNO DESPUÉS DE UN ABONO A CAPITAL
// ============================================================================
// LA REGLA (2026-10-19): "después de realizar el abono a capital no debe permitir eliminar pagos
// previos a este, pero lo demás debe trabajar como siempre".
//
// FALLO REPORTADO el mismo día: "cuando haces un abono a capital ahora no te deja eliminar pagos,
// ni después del abono ni antes". Se comparaba el `created_at` del abono —que pone la BASE, en
// UTC— contra el primer sello de tiempo que trajera el pago, que podía ser `payment_time_local`,
// escrito por el NAVEGADOR en la hora del equipo. En un equipo que no esté en la hora de Santo
// Domingo ese sello cae hasta cuatro horas por detrás, así que un abono anterior parecía
// posterior y el pago recién hecho quedaba bloqueado para siempre.
import { describe, it, expect } from 'vitest';

import { capitalPaymentLockFor, santoDomingoDay } from '../capitalPaymentLock';

const ABONO = { created_at: '2026-10-19T18:00:00.000Z' }; // 19 oct, 2:00 PM en Santo Domingo

describe('santoDomingoDay', () => {

  it('Un instante UTC se lleva al día que era en Santo Domingo', () => {
    // 2:00 AM UTC del día 20 son las 10:00 PM del día 19 en Santo Domingo (UTC-4).
    expect(santoDomingoDay('2026-10-20T02:00:00.000Z')).toBe('2026-10-19');
    expect(santoDomingoDay('2026-10-19T18:00:00.000Z')).toBe('2026-10-19');
  });

  it('Una fecha suelta YA es un día: no se le cambia la zona horaria', () => {
    // Pasarla por la zona horaria la correría 24 horas (el fallo clásico del '2026-10-19' que
    // sale como 18 de octubre).
    expect(santoDomingoDay('2026-10-19')).toBe('2026-10-19');
  });

  it('Sin valor, o con basura, no inventa una fecha', () => {
    expect(santoDomingoDay(null)).toBeNull();
    expect(santoDomingoDay('')).toBeNull();
    expect(santoDomingoDay('   ')).toBeNull();
    expect(santoDomingoDay('mañana')).toBeNull();
  });
});

describe('un abono a capital solo bloquea los pagos ANTERIORES', () => {

  it('El caso reportado: un pago hecho DESPUÉS del abono se puede borrar', () => {
    const pago = { created_at: '2026-10-19T19:30:00.000Z' }; // 3:30 PM, hora y media después
    expect(capitalPaymentLockFor(pago, [ABONO]).locked).toBe(false);
  });

  it('El caso reportado, con el equipo fuera de la hora de Santo Domingo', () => {
    // El pago se hizo a las 3:30 PM, DESPUÉS del abono de las 2:00 PM, pero el navegador guardó
    // `payment_time_local` como si esa hora fuera UTC: 19:30 real pasa a verse como 15:30.
    // Comparando instantes a pelo, el abono (18:00Z) salía "después" y bloqueaba el pago.
    const pago = { payment_time_local: '2026-10-19T15:30:00.000Z', payment_date: '2026-10-19' };
    expect(capitalPaymentLockFor(pago, [ABONO]).locked).toBe(false);
  });

  it('Un pago de un día anterior no se puede borrar', () => {
    const pago = { created_at: '2026-10-18T14:00:00.000Z', payment_date: '2026-10-18' };
    const bloqueo = capitalPaymentLockFor(pago, [ABONO]);
    expect(bloqueo.locked).toBe(true);
    expect(bloqueo.capitalPaymentDay).toBe('2026-10-19');   // se dice de qué abono se trata
  });

  it('El mismo día, antes del abono: tampoco', () => {
    const pago = { created_at: '2026-10-19T13:00:00.000Z' }; // 9:00 AM, antes de las 2:00 PM
    expect(capitalPaymentLockFor(pago, [ABONO]).locked).toBe(true);
  });

  it('Un pago de un día posterior se borra como cualquier otro', () => {
    const pago = { created_at: '2026-10-20T12:00:00.000Z', payment_date: '2026-10-20' };
    expect(capitalPaymentLockFor(pago, [ABONO]).locked).toBe(false);
  });

  it('Con varios abonos, basta que uno sea posterior al pago', () => {
    const abonos = [
      { created_at: '2026-10-10T18:00:00.000Z' },
      ABONO,
      { created_at: '2026-10-25T18:00:00.000Z' },
    ];
    // Un pago del 12: el del 10 ya no le afecta, pero los del 19 y el 25 sí.
    expect(capitalPaymentLockFor({ created_at: '2026-10-12T18:00:00.000Z' }, abonos).locked).toBe(true);
    // Un pago del 26: ningún abono es posterior.
    expect(capitalPaymentLockFor({ created_at: '2026-10-26T18:00:00.000Z' }, abonos).locked).toBe(false);
  });

  it('Sin abonos a capital no se bloquea nada', () => {
    expect(capitalPaymentLockFor({ created_at: '2026-10-19T13:00:00.000Z' }, []).locked).toBe(false);
    expect(capitalPaymentLockFor({ created_at: '2026-10-19T13:00:00.000Z' }, null).locked).toBe(false);
  });

  it('Lo que no se puede demostrar, no se bloquea', () => {
    // Un abono sin fecha no puede ordenar nada.
    expect(capitalPaymentLockFor({ created_at: '2026-10-19T13:00:00.000Z' }, [{ created_at: null }]).locked)
      .toBe(false);
    // Un pago sin ningún sello de tiempo tampoco.
    expect(capitalPaymentLockFor({}, [ABONO]).locked).toBe(false);
    // Mismo día y solo una fecha suelta: no hay hora que comparar, así que se permite borrarlo
    // (el histórico sigue protegido por la regla de "solo el último pago").
    expect(capitalPaymentLockFor({ payment_date: '2026-10-19' }, [ABONO]).locked).toBe(false);
  });

  it('Manda el instante en que se REGISTRÓ el pago, no la fecha que lleve escrita', () => {
    // Un pago registrado hoy, después del abono, pero fechado la semana pasada: no entró en la
    // cuenta del abono, así que se puede borrar.
    const pago = {
      created_at: '2026-10-19T19:30:00.000Z',
      payment_date: '2026-10-12',
    };
    expect(capitalPaymentLockFor(pago, [ABONO]).locked).toBe(false);
  });
});
