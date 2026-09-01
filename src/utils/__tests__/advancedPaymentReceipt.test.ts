// Generado a partir de las suites de la auditoria 2026-09-01.
// Prueban LOGICA FINANCIERA PURA: sin red, sin reloj, sin Supabase. Deterministas.
import { describe, it, expect } from 'vitest';

import { buildAdvancedPaymentReceipt } from '@/utils/advancedPaymentReceipt';

/** Adapta el estilo `ok(nombre, condicion, detalle)` de las suites originales. */
const ok = (name: string, cond: unknown, detail = '') =>
  expect(cond, detail ? `${name} — ${detail}` : name).toBe(true);

describe("advancedPaymentReceipt", () => {


const alloc = (n, o = {}) => ({
  installmentNumber: n, isCharge: false, dueDate: '2026-09-15',
  total: 2000, previouslyPaid: 0, applied: 2000, principal: 1250, interest: 750,
  settles: true, pendingAfter: 0, ...o,
});

const base = {
  receiptNumber: 'A1B2C3D4',
  company: { company_name: 'Prestamos del Cibao', address: 'Calle Duarte 45', phone: '809-555-1212', tax_id: '131234567' },
  client: { full_name: 'Juan Pérez', dni: '00112345678', phone: '+18095551234' },
  loan: { amount: 10000, interest_rate: 15 },
  paymentDate: '2026-09-02',
  paymentMethodLabel: 'Efectivo',
  reference: 'REF-99',
  notes: null,
  allocations: [alloc(1), alloc(2, { applied: 500, principal: 312.5, interest: 187.5, settles: false, pendingAfter: 1500 })],
  totalApplied: 2500,
  totalPrincipal: 1562.5,
  totalInterest: 937.5,
  balanceAfter: 13500,
  stillPending: 1500,
};

  it("Contenido basico", () => {
  {
    const html = buildAdvancedPaymentReceipt(base, 'LETTER');
    ok('es HTML', html.startsWith('<!DOCTYPE html>'));
    ok('nombre de la empresa', html.includes('Prestamos del Cibao'));
    ok('RNC', html.includes('131234567'));
    ok('telefono de la empresa', html.includes('809-555-1212'));
    ok('nombre del cliente', html.includes('Juan Pérez'));
    ok('documento del cliente', html.includes('00112345678'));
    ok('numero de recibo', html.includes('A1B2C3D4'));
    ok('forma de pago', html.includes('Efectivo'));
    ok('referencia', html.includes('REF-99'));
    ok('no muestra notas vacias', !html.includes('<div class="section-title">Notas</div>'));
  }
  
  });

  it("EL PUNTO: detalle cuota por cuota", () => {
  {
    const html = buildAdvancedPaymentReceipt(base, 'LETTER');
    ok('aparece la cuota 1', html.includes('Cuota #1'));
    ok('aparece la cuota 2', html.includes('Cuota #2'));
    ok('importe abonado a la 1', html.includes('RD$2,000.00'));
    ok('importe abonado a la 2', html.includes('RD$500.00'));
    ok('la saldada dice Saldada', html.includes('Saldada'));
    ok('la parcial muestra lo que queda', html.includes('RD$1,500.00'));
    ok('capital de la parcial', html.includes('RD$312.50'));
    ok('interes de la parcial', html.includes('RD$187.50'));
    ok('total recibido', html.includes('TOTAL RECIBIDO: RD$2,500.00'));
    ok('total capital', html.includes('RD$1,562.50'));
    ok('total interes', html.includes('RD$937.50'));
    ok('balance tras el pago', html.includes('RD$13,500.00'));
    ok('resumen de saldadas', html.includes('1 cuota saldada') && html.includes('1 con abono parcial'));
  
    // Una linea por cuota en el cuerpo de la tabla
    const bodyRows = (html.match(/<tr>\s*<td>Cuota #/g) || []).length;
    ok('una fila por cuota', bodyRows === 2, String(bodyRows));
  }
  
  });

  it("Cargos", () => {
  {
    const html = buildAdvancedPaymentReceipt({
      ...base,
      allocations: [alloc(9, { isCharge: true, total: 1213, applied: 600, principal: 600, interest: 0, settles: false, pendingAfter: 613 })],
      totalApplied: 600, totalPrincipal: 600, totalInterest: 0, stillPending: 613,
    }, 'LETTER');
    ok('dice Cargo, no Cuota', html.includes('Cargo #9') && !html.includes('Cuota #9'));
    ok('cargo: interes 0', html.includes('RD$0.00'));
  }
  
  });

  it("Formato ticket vs carta", () => {
  {
    const pos = buildAdvancedPaymentReceipt(base, 'POS58');
    const letter = buildAdvancedPaymentReceipt(base, 'LETTER');
  
    ok('POS58 fija el ancho del papel', pos.includes('58mm auto'));
    ok('POS80 fija su ancho', buildAdvancedPaymentReceipt(base, 'POS80').includes('80mm auto'));
    ok('POS usa monospace', pos.includes('Courier New'));
    ok('carta usa Arial', letter.includes('Arial'));
  
    // El ticket es estrecho: 4 columnas. La carta detalla capital e interes: 8 columnas.
    const posHeaders = (pos.match(/<th[ >]/g) || []).length;
    const letterHeaders = (letter.match(/<th[ >]/g) || []).length;
    ok('ticket con 4 columnas', posHeaders === 4, String(posHeaders));
    ok('carta con 8 columnas', letterHeaders === 8, String(letterHeaders));
    ok('ticket sin firmas', !pos.includes('Recibí conforme'));
    ok('carta con firmas', letter.includes('Recibí conforme'));
    ok('ambos llevan el total', pos.includes('TOTAL RECIBIDO') && letter.includes('TOTAL RECIBIDO'));
  }
  
  });

  it("Fechas sin desplazamiento de zona", () => {
  {
    // Formatear con `new Date('2026-09-15')` en una zona al oeste devolveria el 14.
    const html = buildAdvancedPaymentReceipt(base, 'LETTER');
    ok('15/09/2026 exacto', html.includes('15/09/2026'));
    ok('fecha del pago 02/09/2026', html.includes('02/09/2026'));
  
    const conHora = buildAdvancedPaymentReceipt({
      ...base, allocations: [alloc(1, { dueDate: '2026-01-31T00:00:00+00:00' })],
    }, 'LETTER');
    ok('recorta la hora', conHora.includes('31/01/2026'));
  }
  
  });

  it("Escapado de HTML", () => {
  {
    const html = buildAdvancedPaymentReceipt({
      ...base,
      client: { full_name: '<script>alert(1)</script>', dni: 'A&B', phone: null },
      company: { company_name: 'Casa "El Buen" & Cia', address: null, phone: null, tax_id: null },
      notes: "Pago del cliente <b>importante</b> con 'comillas'",
    }, 'LETTER');
  
    ok('no inyecta script', !html.includes('<script>alert(1)</script>'));
    ok('escapa los signos', html.includes('&lt;script&gt;'));
    ok('escapa el ampersand', html.includes('A&amp;B'));
    ok('escapa comillas dobles', html.includes('&quot;El Buen&quot;'));
    ok('escapa comillas simples', html.includes('&#39;comillas&#39;'));
    ok('las notas si aparecen', html.includes('<div class="section-title">Notas</div>'));
  }
  
  });

  it("Casos borde", () => {
  {
    const sinEmpresa = buildAdvancedPaymentReceipt({ ...base, company: null }, 'LETTER');
    ok('sin datos de empresa no revienta', sinEmpresa.includes('TOTAL RECIBIDO'));
    ok('sin empresa no imprime cabecera vacia', !sinEmpresa.includes('LA EMPRESA'));
  
    const sinBalance = buildAdvancedPaymentReceipt({ ...base, balanceAfter: null }, 'LETTER');
    ok('sin balance omite la linea', !sinBalance.includes('Balance del préstamo'));
  
    const todoSaldado = buildAdvancedPaymentReceipt({
      ...base, allocations: [alloc(1)], totalApplied: 2000, stillPending: 0,
    }, 'LETTER');
    ok('sin pendiente muestra guion', todoSaldado.includes('>—<'));
    ok('sin parciales no menciona abono parcial', !todoSaldado.includes('con abono parcial'));
  
    const sinCliente = buildAdvancedPaymentReceipt({
      ...base, client: { full_name: null, dni: null, phone: null },
    }, 'LETTER');
    ok('cliente vacio muestra N/D', sinCliente.includes('N/D'));
  
    const muchas = buildAdvancedPaymentReceipt({
      ...base, allocations: Array.from({ length: 24 }, (_, i) => alloc(i + 1)),
    }, 'POS58');
    ok('24 cuotas caben en el ticket', (muchas.match(/<tr>\s*<td>Cuota #/g) || []).length === 24);
  }
  
  
  });
});
