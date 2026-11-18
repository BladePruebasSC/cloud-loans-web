// ============================================================================
// LA FACTURA DEL PUNTO DE VENTA SE DESCARGA EN PDF
// ============================================================================
// FALLO REPORTADO (2026-11-18): "cuando haces una venta en el POS y le das a descargar PDF se
// descarga un archivo HTML y no PDF".
//
// Aquí se prueba la MAQUETACIÓN, que es lo que puede salir mal sin que nadie lo note: que la
// factura lleve todo lo que tiene que llevar, que el descuento se diga, y que en papel térmico
// la página mida lo que mide la factura —el rollo no tiene páginas: si la hoja se queda corta,
// la mitad de los productos no se imprime—.
import { describe, it, expect } from 'vitest';
import {
  buildInvoicePdf, invoiceFileName, invoiceLayout, rowsHeight, type InvoicePdfData,
} from '../posInvoicePdf';

// La venta de la captura: una HONDA NAVY AZUL 2026 con 10% de descuento.
const VENTA: InvoicePdfData = {
  companyName: 'Inversiones SH',
  companyPhone: '8095543052',
  docType: 'FACTURA',
  number: 'NCF: 01-0000000001',
  dateLabel: '18/11/2026 12:04',
  customerName: 'Rosalynn Fidelia Ceballos Martinez',
  seller: 'omar@empresa.do',
  condition: 'Contado',
  paymentLabel: 'Efectivo',
  lines: [{
    name: 'HONDA NAVY AZUL 2026',
    quantity: 1,
    unitPrice: 111510,
    discountPercent: 10,
    total: 111510,
  }],
  listBase: 105000,
  discount: 10500,
  discountPercent: 10,
  base: 94500,
  tax: 17010,
  total: 111510,
};

/** Todo el texto de la factura, para buscar dentro sin importar en qué fila cayó. */
const textoDe = (data: InvoicePdfData, format: 'A4' | 'POS80' | 'POS58') =>
  invoiceLayout(data, format).rows.map(r => {
    if (r.kind === 'center' || r.kind === 'left') return r.text;
    if (r.kind === 'pair') return `${r.left} ${r.right}`;
    if (r.kind === 'cols') return r.cells.map(c => c.text).join(' ');
    return '';
  }).join('\n');

describe('la factura en PDF', () => {
  it('EL CASO REPORTADO: el archivo es .pdf, no .html', () => {
    expect(invoiceFileName(VENTA, '2026-11-18')).toBe('factura-NCF-01-0000000001-2026-11-18.pdf');
    expect(invoiceFileName({ ...VENTA, number: undefined }, '2026-11-18')).toBe('factura-2026-11-18.pdf');
  });

  it('Lleva la empresa, el cliente, el producto y el total', () => {
    const texto = textoDe(VENTA, 'POS80');
    expect(texto).toContain('Inversiones SH');
    expect(texto).toContain('FACTURA');
    expect(texto).toContain('Rosalynn');
    expect(texto).toContain('HONDA NAVY');
    expect(texto).toContain('111,510.00');
  });

  it('Dice el descuento, y de qué precio se partió', () => {
    const texto = textoDe(VENTA, 'POS80');
    expect(texto).toContain('Precio de lista');
    expect(texto).toContain('105,000.00');
    expect(texto).toContain('Descuento (10.00%)');
    expect(texto).toContain('- 10,500.00');
    expect(texto).toContain('Subtotal 94,500.00');
    expect(texto).toContain('ITBIS 17,010.00');
  });

  it('Sin descuento no enseña esas dos filas', () => {
    const entera: InvoicePdfData = {
      ...VENTA,
      lines: [{ ...VENTA.lines[0], unitPrice: 123900, discountPercent: 0, total: 123900 }],
      listBase: 105000, discount: 0, discountPercent: 0, base: 105000, tax: 18900, total: 123900,
    };
    const texto = textoDe(entera, 'POS80');
    expect(texto).not.toContain('Precio de lista');
    expect(texto).not.toContain('Descuento');
    expect(texto).toContain('123,900.00');
  });

  it('En papel térmico la página mide lo que mide la factura', () => {
    const l = invoiceLayout(VENTA, 'POS80');
    expect(l.pageWidth).toBe(80);
    // Con margen arriba y abajo, nunca por debajo del contenido.
    expect(l.pageHeight).toBeGreaterThanOrEqual(rowsHeight(l.rows) + l.margin * 2 - 1);
    expect(l.thermal).toBe(true);
  });

  it('Con diez productos la hoja térmica crece: no se corta la mitad', () => {
    const muchos = {
      ...VENTA,
      lines: Array.from({ length: 10 }, (_, i) => ({ ...VENTA.lines[0], name: `Producto ${i + 1}` })),
    };
    const corta = invoiceLayout(VENTA, 'POS80');
    const larga = invoiceLayout(muchos, 'POS80');
    expect(larga.pageHeight).toBeGreaterThan(corta.pageHeight);
    expect(textoDe(muchos, 'POS80')).toContain('Producto 10');
  });

  it('La A4 sí es una hoja A4', () => {
    const l = invoiceLayout(VENTA, 'A4');
    expect(l.pageWidth).toBe(210);
    expect(l.pageHeight).toBe(297);
    expect(l.thermal).toBe(false);
  });

  it('En 58 mm el nombre largo se recorta y el descuento se dice en el nombre', () => {
    const texto = textoDe(VENTA, 'POS58');
    expect(texto).toContain('(-10%)');
    // Ningún renglón de 58 mm pasa de lo que cabe.
    for (const r of invoiceLayout(VENTA, 'POS58').rows) {
      if (r.kind === 'left' || r.kind === 'center') expect(r.text.length).toBeLessThanOrEqual(32);
    }
  });

  it('El cambio solo sale cuando se pagó en efectivo', () => {
    expect(textoDe(VENTA, 'POS80')).not.toContain('Cambio');
    const conCambio = { ...VENTA, received: 120000, change: 8490 };
    const texto = textoDe(conCambio, 'POS80');
    expect(texto).toContain('Recibido 120,000.00');
    expect(texto).toContain('Cambio 8,490.00');
  });

  it('Y el archivo que sale es un PDF de verdad, con el texto dentro', async () => {
    const doc = await buildInvoicePdf(VENTA, 'POS80');
    const pdf = doc.output('arraybuffer');
    const bytes = new Uint8Array(pdf);
    // La firma de todo PDF.
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-');
    expect(bytes.byteLength).toBeGreaterThan(500);

    // El tamaño de la página es el de la maquetación (jsPDF trabaja en puntos: 1 mm = 2.8346 pt).
    const l = invoiceLayout(VENTA, 'POS80');
    expect(doc.internal.pageSize.getWidth()).toBeCloseTo(l.pageWidth, 1);
    expect(doc.internal.pageSize.getHeight()).toBeCloseTo(l.pageHeight, 1);
  });

  it('La A4 con muchos productos se reparte en páginas', async () => {
    const muchos = {
      ...VENTA,
      lines: Array.from({ length: 80 }, (_, i) => ({ ...VENTA.lines[0], name: `Producto ${i + 1}` })),
    };
    const doc = await buildInvoicePdf(muchos, 'A4');
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
  });

  it('Una factura sin líneas no rompe nada', () => {
    const vacia: InvoicePdfData = {
      companyName: 'Inversiones SH', dateLabel: '18/11/2026',
      lines: [], base: 0, tax: 0, total: 0,
    };
    const l = invoiceLayout(vacia, 'POS58');
    expect(l.rows.length).toBeGreaterThan(0);
    expect(l.pageHeight).toBeGreaterThan(0);
  });
});
