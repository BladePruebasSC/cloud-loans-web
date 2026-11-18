// ============================================================================
// LA FACTURA DEL PUNTO DE VENTA, EN PDF DE VERDAD
// ============================================================================
// FALLO REPORTADO (2026-11-18): "cuando haces una venta en el POS y le das a descargar PDF se
// descarga un archivo HTML y no PDF".
//
// El botón decía "Descargar PDF" pero guardaba el HTML de la factura con extensión `.html`: se
// abría en el navegador, no servía para adjuntar ni para archivar.
//
// Aquí la factura se arma como PDF con jsPDF —texto de verdad, que se puede buscar y copiar, no
// una foto de la pantalla— en los tres formatos del punto de venta: A4, 80 mm y 58 mm.
//
// CÓMO: la MAQUETACIÓN (`invoiceLayout`) es una función pura que devuelve las filas y la altura
// de la página; el dibujo (`renderInvoicePdf`) solo las pinta. Así se puede probar que una
// factura de 58 mm con diez productos sale completa sin abrir un navegador, y que el papel
// térmico sale con la altura justa: el rollo no tiene páginas, se corta donde termina.

const round2 = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;

export type InvoiceFormat = 'A4' | 'POS80' | 'POS58';

export interface InvoicePdfLine {
  name: string;
  quantity: number;
  /** Precio por unidad REALMENTE cobrado, con ITBIS. */
  unitPrice: number;
  discountPercent?: number;
  /** Importe de la línea, con ITBIS. */
  total: number;
}

export interface InvoicePdfData {
  companyName: string;
  companyAddress?: string;
  companyPhone?: string;
  companyEmail?: string;
  docType?: string;
  /** NCF o número de la venta. */
  number?: string;
  dateLabel: string;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  customerRnc?: string;
  seller?: string;
  condition?: string;
  paymentLabel?: string;
  lines: InvoicePdfLine[];
  /** Precio de lista sin ITBIS (solo se enseña si hubo descuento). */
  listBase?: number;
  discount?: number;
  discountPercent?: number;
  base: number;
  tax: number;
  total: number;
  received?: number;
  change?: number;
  notes?: string;
}

export type InvoiceRow =
  | { kind: 'center'; text: string; size: number; bold?: boolean }
  | { kind: 'pair'; left: string; right: string; size: number; bold?: boolean }
  | { kind: 'left'; text: string; size: number; bold?: boolean }
  | { kind: 'cols'; cells: Array<{ text: string; x: number; align: 'left' | 'right' }>; size: number; bold?: boolean }
  | { kind: 'rule'; dashed?: boolean }
  | { kind: 'gap'; height: number };

export interface InvoiceLayout {
  /** Ancho de la página, en mm. */
  pageWidth: number;
  /** Alto de la página, en mm. En papel térmico es el alto JUSTO del contenido. */
  pageHeight: number;
  margin: number;
  font: 'courier' | 'helvetica';
  thermal: boolean;
  rows: InvoiceRow[];
}

interface FormatSpec {
  pageWidth: number;
  margin: number;
  font: 'courier' | 'helvetica';
  thermal: boolean;
  /** Tamaños de letra: normal, pequeño y título. */
  size: number;
  small: number;
  title: number;
  /** Caracteres que caben en el nombre de un producto. */
  maxName: number;
  /** Alto de la hoja cuando es fija (A4). 0 = se mide por el contenido. */
  fixedHeight: number;
}

const FORMATS: Record<InvoiceFormat, FormatSpec> = {
  A4: { pageWidth: 210, margin: 15, font: 'helvetica', thermal: false, size: 10, small: 8, title: 16, maxName: 42, fixedHeight: 297 },
  POS80: { pageWidth: 80, margin: 3, font: 'courier', thermal: true, size: 8, small: 7, title: 11, maxName: 30, fixedHeight: 0 },
  POS58: { pageWidth: 58, margin: 2, font: 'courier', thermal: true, size: 7, small: 6, title: 9, maxName: 22, fixedHeight: 0 },
};

/** Alto de una fila de texto, en mm, a partir del tamaño de letra. */
const rowHeight = (row: InvoiceRow): number => {
  if (row.kind === 'gap') return row.height;
  if (row.kind === 'rule') return 1.6;
  // 1 pt = 0.3528 mm; se deja un 45% de aire entre renglones.
  return row.size * 0.3528 * 1.45;
};

/** El alto total que ocupan unas filas, en mm. */
export const rowsHeight = (rows: InvoiceRow[]): number =>
  Math.round(rows.reduce((h, r) => h + rowHeight(r), 0) * 100) / 100;

const money = (n: number): string =>
  (Number(n) || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const cut = (text: string, max: number): string =>
  text.length > max ? `${text.slice(0, Math.max(1, max - 1))}…` : text;

/**
 * Las filas de la factura y el tamaño de la página.
 *
 * En térmico cada producto ocupa DOS renglones —el nombre y, debajo, "2 x 1,180.00 = 2,360.00"—
 * porque en 58 mm no caben cuatro columnas sin que los números se pisen. En A4 sí hay sitio para
 * la tabla entera.
 */
export const invoiceLayout = (data: InvoicePdfData, format: InvoiceFormat): InvoiceLayout => {
  const f = FORMATS[format] || FORMATS.A4;
  const content = f.pageWidth - f.margin * 2;
  const right = f.margin + content;
  const rows: InvoiceRow[] = [];

  // --- Encabezado ---
  rows.push({ kind: 'center', text: data.companyName || 'Factura', size: f.title, bold: true });
  if (data.companyAddress) rows.push({ kind: 'center', text: data.companyAddress, size: f.small });
  if (data.companyPhone) rows.push({ kind: 'center', text: `Tel: ${data.companyPhone}`, size: f.small });
  if (data.companyEmail) rows.push({ kind: 'center', text: data.companyEmail, size: f.small });
  rows.push({ kind: 'gap', height: 1.5 });
  rows.push({ kind: 'center', text: data.docType || 'FACTURA', size: f.size + 2, bold: true });
  if (data.number) rows.push({ kind: 'center', text: data.number, size: f.small });
  rows.push({ kind: 'rule' });

  // --- Datos de la venta ---
  const dato = (left: string, value?: string | null) => {
    if (value === undefined || value === null || value === '') return;
    rows.push({ kind: 'pair', left, right: cut(String(value), f.maxName + 6), size: f.small });
  };
  dato('Fecha', data.dateLabel);
  dato('Cliente', data.customerName || 'Cliente General');
  dato('RNC/Cédula', data.customerRnc);
  dato('Teléfono', data.customerPhone);
  if (!f.thermal) dato('Dirección', data.customerAddress);
  dato('Vendedor', data.seller);
  dato('Condición', data.condition);
  dato('Método de pago', data.paymentLabel);
  rows.push({ kind: 'rule' });

  // --- Productos ---
  if (f.thermal) {
    rows.push({ kind: 'left', text: 'PRODUCTOS', size: f.small, bold: true });
    for (const l of data.lines) {
      const pct = Number(l.discountPercent) || 0;
      const nombre = pct > 0.005 ? `${cut(l.name, f.maxName - 6)} (-${pct.toFixed(0)}%)` : cut(l.name, f.maxName);
      rows.push({ kind: 'left', text: nombre, size: f.small });
      rows.push({
        kind: 'pair',
        left: `  ${l.quantity} x ${money(l.unitPrice)}`,
        right: money(l.total),
        size: f.small,
      });
    }
  } else {
    // Columnas: descripción | cant. | precio | desc. | importe
    const xCant = f.margin + content * 0.52;
    const xPrecio = f.margin + content * 0.68;
    const xDesc = f.margin + content * 0.82;
    const cabecera: InvoiceRow = {
      kind: 'cols', size: f.small, bold: true,
      cells: [
        { text: 'Descripción', x: f.margin, align: 'left' },
        { text: 'Cant.', x: xCant, align: 'right' },
        { text: 'Precio', x: xPrecio, align: 'right' },
        { text: 'Desc.', x: xDesc, align: 'right' },
        { text: 'Importe', x: right, align: 'right' },
      ],
    };
    rows.push(cabecera);
    rows.push({ kind: 'rule' });
    for (const l of data.lines) {
      const pct = Number(l.discountPercent) || 0;
      rows.push({
        kind: 'cols', size: f.size,
        cells: [
          { text: cut(l.name, f.maxName), x: f.margin, align: 'left' },
          { text: String(l.quantity), x: xCant, align: 'right' },
          { text: money(l.unitPrice), x: xPrecio, align: 'right' },
          { text: pct > 0.005 ? `${pct.toFixed(0)}%` : '—', x: xDesc, align: 'right' },
          { text: money(l.total), x: right, align: 'right' },
        ],
      });
    }
  }
  rows.push({ kind: 'rule' });

  // --- Resumen. Con descuento se dice de qué precio se partió (2026-11-18). ---
  const descuento = round2(data.discount || 0);
  if (descuento > 0.005) {
    rows.push({ kind: 'pair', left: 'Precio de lista', right: money(data.listBase || 0), size: f.size });
    rows.push({
      kind: 'pair',
      left: `Descuento (${(Number(data.discountPercent) || 0).toFixed(2)}%)`,
      right: `- ${money(descuento)}`,
      size: f.size,
    });
  }
  rows.push({ kind: 'pair', left: 'Subtotal', right: money(data.base), size: f.size });
  rows.push({ kind: 'pair', left: 'ITBIS', right: money(data.tax), size: f.size });
  rows.push({ kind: 'rule' });
  rows.push({ kind: 'pair', left: 'TOTAL', right: money(data.total), size: f.size + 2, bold: true });

  if ((Number(data.received) || 0) > 0.005) {
    rows.push({ kind: 'pair', left: 'Recibido', right: money(data.received || 0), size: f.small });
    rows.push({ kind: 'pair', left: 'Cambio', right: money(data.change || 0), size: f.small });
  }

  if (data.notes) {
    rows.push({ kind: 'rule' });
    rows.push({ kind: 'left', text: 'Notas', size: f.small, bold: true });
    rows.push({ kind: 'left', text: cut(data.notes, f.maxName + 10), size: f.small });
  }

  rows.push({ kind: 'gap', height: 2 });
  rows.push({ kind: 'center', text: 'Gracias por su preferencia', size: f.small });

  // En papel térmico la página mide lo que mida la factura: el rollo se corta donde termina.
  const alto = f.fixedHeight > 0
    ? f.fixedHeight
    : Math.max(60, Math.ceil(rowsHeight(rows) + f.margin * 2));

  return {
    pageWidth: f.pageWidth,
    pageHeight: alto,
    margin: f.margin,
    font: f.font,
    thermal: f.thermal,
    rows,
  };
};

/** Nombre del archivo: `factura-<numero>-<fecha>.pdf`. */
export const invoiceFileName = (data: InvoicePdfData, todayIso: string): string => {
  const numero = String(data.number || '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '');
  return `factura${numero ? `-${numero}` : ''}-${todayIso}.pdf`;
};

/**
 * Dibuja la factura. jsPDF se carga solo cuando hace falta (pesa, y la mayoría de las ventas no
 * se descargan).
 */
export const buildInvoicePdf = async (data: InvoicePdfData, format: InvoiceFormat) => {
  const layout = invoiceLayout(data, format);
  const { default: jsPDF } = await import('jspdf');

  const doc = new jsPDF({
    unit: 'mm',
    orientation: 'portrait',
    format: [layout.pageWidth, layout.pageHeight],
  });

  const content = layout.pageWidth - layout.margin * 2;
  const centro = layout.pageWidth / 2;
  const derecha = layout.margin + content;
  let y = layout.margin;

  for (const row of layout.rows) {
    const alto = rowHeight(row);
    // Una hoja fija (A4) se pasa de página cuando se llena; el rollo térmico nunca.
    if (!layout.thermal && y + alto > layout.pageHeight - layout.margin) {
      doc.addPage([layout.pageWidth, layout.pageHeight], 'portrait');
      y = layout.margin;
    }
    y += alto;

    if (row.kind === 'gap') continue;

    if (row.kind === 'rule') {
      doc.setDrawColor(120);
      doc.setLineWidth(0.2);
      doc.line(layout.margin, y - alto / 2, derecha, y - alto / 2);
      continue;
    }

    doc.setFont(layout.font, row.bold ? 'bold' : 'normal');
    doc.setFontSize(row.size);
    const base = y - row.size * 0.3528 * 0.35;

    if (row.kind === 'center') {
      doc.text(row.text, centro, base, { align: 'center' });
    } else if (row.kind === 'left') {
      doc.text(row.text, layout.margin, base);
    } else if (row.kind === 'pair') {
      doc.text(row.left, layout.margin, base);
      doc.text(row.right, derecha, base, { align: 'right' });
    } else {
      for (const cell of row.cells) {
        doc.text(cell.text, cell.x, base, { align: cell.align });
      }
    }
  }

  return doc;
};

/** Arma la factura y la descarga. */
export const downloadInvoicePdf = async (
  data: InvoicePdfData,
  format: InvoiceFormat,
  fileName?: string,
): Promise<void> => {
  const doc = await buildInvoicePdf(data, format);
  doc.save(fileName || invoiceFileName(data, new Date().toISOString().split('T')[0]));
};
