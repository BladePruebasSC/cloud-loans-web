// ============================================================================
// COBRAR CON TARJETA EN EL PUNTO DE VENTA
// ============================================================================
// FALLO REPORTADO (2026-11-25): "cuando seleccionas tarjeta como método de pago en punto de
// venta da error porque pide el titular de la tarjeta, haz que no la pida... porque además no
// hay dónde colocar el titular en el formulario".
//
// No se podía cobrar con tarjeta: el formulario de cada pago solo tiene "Tipo" y "Últimos 4", y
// la validación exigía además el titular. La única casilla de titular del módulo está en el
// bloque del método único de antes de los pagos partidos, que ya no se dibuja nunca. La base de
// datos nunca pidió nada de eso: `payment_details` es un JSONB libre.
//
// Y lo que sí se escribía tampoco se guardaba: en `payment_details` iban solo el método, su
// nombre y el monto, así que el tipo de tarjeta y los últimos 4 se perdían al cobrar.
import { describe, it, expect } from 'vitest';
import { cardPaymentIssue, paymentDetailsForSale, splitDetailsToStore } from '../posPaymentSplits';

const TARJETA = { id: 'card', name: 'Tarjeta', type: 'card' };
const EFECTIVO = { id: 'cash', name: 'Efectivo', type: 'cash' };

describe('El titular de la tarjeta ya no se pide', () => {
  it('EL CASO REPORTADO: con el tipo y los últimos 4 se puede cobrar, sin titular', () => {
    expect(cardPaymentIssue({ cardType: 'visa', cardLast4: '4242' })).toBeNull();
  });

  it('Tampoco molesta un titular vacío, en blanco o nulo', () => {
    expect(cardPaymentIssue({ cardType: 'visa', cardLast4: '4242', cardHolderName: '' })).toBeNull();
    expect(cardPaymentIssue({ cardType: 'visa', cardLast4: '4242', cardHolderName: '   ' })).toBeNull();
    expect(cardPaymentIssue({ cardType: 'visa', cardLast4: '4242', cardHolderName: null })).toBeNull();
  });

  it('Y si alguien lo escribe, se acepta igual', () => {
    expect(cardPaymentIssue({
      cardType: 'mastercard', cardLast4: '1234', cardHolderName: 'Omar Santana',
    })).toBeNull();
  });

  it('Ningún aviso vuelve a hablar del titular', () => {
    const casos = [
      undefined, null, {}, { cardType: 'visa' }, { cardLast4: '4242' },
      { cardType: 'visa', cardLast4: '42' }, { cardType: '', cardLast4: '' },
    ];
    for (const caso of casos) {
      const aviso = cardPaymentIssue(caso as any);
      expect(String(aviso ?? '').toLowerCase()).not.toContain('titular');
    }
  });
});

describe('Lo que SÍ se le pide a un pago con tarjeta', () => {
  it('El tipo de tarjeta', () => {
    expect(cardPaymentIssue({ cardLast4: '4242' })).toContain('tipo de tarjeta');
    expect(cardPaymentIssue({ cardType: '   ', cardLast4: '4242' })).toContain('tipo de tarjeta');
    expect(cardPaymentIssue(undefined)).toContain('tipo de tarjeta');
    expect(cardPaymentIssue(null)).toContain('tipo de tarjeta');
  });

  it('Los últimos 4 dígitos, y que sean cuatro dígitos', () => {
    expect(cardPaymentIssue({ cardType: 'visa' })).toContain('últimos 4');
    expect(cardPaymentIssue({ cardType: 'visa', cardLast4: '' })).toContain('últimos 4');
    expect(cardPaymentIssue({ cardType: 'visa', cardLast4: '424' })).toContain('últimos 4');
    expect(cardPaymentIssue({ cardType: 'visa', cardLast4: '42a2' })).toContain('últimos 4');
    expect(cardPaymentIssue({ cardType: 'visa', cardLast4: '0000' })).toBeNull();
  });
});

describe('Los datos del cobro se guardan con la venta', () => {
  it('De la tarjeta: el tipo y los últimos 4, que antes se tiraban', () => {
    const guardado = paymentDetailsForSale([
      { method: TARJETA, amount: 123900, details: { cardType: 'visa', cardLast4: '4242' } },
    ]);
    expect(guardado).toEqual([{
      method: 'card', label: 'Tarjeta', amount: 123900,
      details: { cardType: 'visa', cardLast4: '4242' },
    }]);
  });

  it('De una transferencia y de un cheque, lo que los identifica', () => {
    const guardado = paymentDetailsForSale([
      { method: { id: 'transfer', name: 'Transferencia', type: 'transfer' }, amount: 50000,
        details: { bankName: 'Popular', accountNumber: '7001', referenceNumber: 'TR-99' } },
      { method: { id: 'check', name: 'Cheque', type: 'check' }, amount: 25000,
        details: { checkNumber: '0145', checkBank: 'BHD', checkDate: '2026-11-30' } },
    ]);
    expect(guardado?.[0].details).toEqual({
      bankName: 'Popular', accountNumber: '7001', referenceNumber: 'TR-99',
    });
    expect(guardado?.[1].details).toEqual({
      checkNumber: '0145', checkBank: 'BHD', checkDate: '2026-11-30',
    });
  });

  it('Las casillas vacías no se guardan, y sin nada no se pone "details"', () => {
    expect(splitDetailsToStore({ cardType: 'visa', cardLast4: '', cardHolderName: '  ' }))
      .toEqual({ cardType: 'visa' });
    expect(splitDetailsToStore({})).toBeUndefined();
    expect(splitDetailsToStore(undefined)).toBeUndefined();
    const enEfectivo = paymentDetailsForSale([{ method: EFECTIVO, amount: 1000, details: {} }]);
    expect(enEfectivo).toEqual([{ method: 'cash', label: 'Efectivo', amount: 1000 }]);
    expect(enEfectivo?.[0]).not.toHaveProperty('details');
  });

  it('Lo del financiamiento no entra aquí: vive en el préstamo', () => {
    const guardado = paymentDetailsForSale([
      { method: { id: 'financing', name: 'Financiamiento', type: 'financing' }, amount: 80000,
        details: { financingMonths: 12, financingRate: 5 } as any },
    ]);
    expect(guardado?.[0].details).toBeUndefined();
  });

  it('Un pago en 0 es un renglón que el cajero no usó: no se guarda', () => {
    const guardado = paymentDetailsForSale([
      { method: TARJETA, amount: 0, details: { cardType: 'visa', cardLast4: '4242' } },
      { method: EFECTIVO, amount: 2000 },
    ]);
    expect(guardado).toEqual([{ method: 'cash', label: 'Efectivo', amount: 2000 }]);
  });

  it('Sin cobros, la columna se queda en NULL', () => {
    expect(paymentDetailsForSale([])).toBeNull();
    expect(paymentDetailsForSale(null)).toBeNull();
    expect(paymentDetailsForSale([{ method: EFECTIVO, amount: 0 }])).toBeNull();
  });

  it('Dos formas de pago dejan las dos filas, cada una con lo suyo', () => {
    const guardado = paymentDetailsForSale([
      { method: EFECTIVO, amount: 20000 },
      { method: TARJETA, amount: 103900, details: { cardType: 'amex', cardLast4: '9087' } },
    ]);
    expect(guardado).toHaveLength(2);
    expect(guardado?.[0]).toEqual({ method: 'cash', label: 'Efectivo', amount: 20000 });
    expect(guardado?.[1].details).toEqual({ cardType: 'amex', cardLast4: '9087' });
  });

  it('El monto se guarda redondeado a dos decimales', () => {
    const guardado = paymentDetailsForSale([{ method: EFECTIVO, amount: 1000.005 }]);
    expect(guardado?.[0].amount).toBe(1000.01);
  });

  it('Un método sin tipo cae en efectivo, que es lo que espera el CHECK de la tabla', () => {
    expect(paymentDetailsForSale([{ method: null, amount: 500 }])?.[0].method).toBe('cash');
    expect(paymentDetailsForSale([{ method: { id: 'card', name: 'Tarjeta' }, amount: 500 }])?.[0].method)
      .toBe('card');
  });
});
