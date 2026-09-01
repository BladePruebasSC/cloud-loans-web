// ============================================================================
// RECIBO DEL PAGO AVANZADO
// ============================================================================
// El recibo del flujo normal muestra un solo importe con su reparto capital/interés, porque
// ese flujo cobra una sola cuota. El pago avanzado reparte un monto entre VARIAS cuotas, y un
// recibo que solo diga "RD$12,000" no le sirve a nadie: ni el cliente sabe qué le quedó
// saldado, ni el cobrador puede explicarlo.
//
// Este recibo añade la pieza que faltaba: una TABLA con una línea por cuota — cuál es, cuándo
// vencía, cuánto se le aplicó, si quedó saldada y cuánto le queda pendiente.
//
// Tres formatos, los mismos que ya usa el sistema: POS58 y POS80 (impresora térmica de
// tickets) y LETTER (papel carta).

const money = (v: number): string =>
  `RD$${(Number(v) || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Escapa el texto que viene del usuario: el recibo se inyecta como HTML. */
const esc = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export type ReceiptFormat = 'POS58' | 'POS80' | 'LETTER';

export interface ReceiptAllocation {
  installmentNumber: number;
  isCharge: boolean;
  dueDate: string;
  /** Importe total de la cuota */
  total: number;
  /** Lo que ya estaba pagado antes de este recibo */
  previouslyPaid: number;
  /** Lo que se aplica con este pago */
  applied: number;
  principal: number;
  interest: number;
  settles: boolean;
  /** Lo que queda pendiente en esa cuota tras este pago */
  pendingAfter: number;
}

export interface ReceiptCompany {
  company_name?: string | null;
  address?: string | null;
  phone?: string | null;
  tax_id?: string | null;
}

export interface AdvancedReceiptData {
  receiptNumber: string;
  company: ReceiptCompany | null;
  client: { full_name?: string | null; dni?: string | null; phone?: string | null };
  loan: { amount?: number | null; interest_rate?: number | null };
  paymentDate: string;
  paymentMethodLabel: string;
  reference?: string | null;
  notes?: string | null;
  allocations: ReceiptAllocation[];
  totalApplied: number;
  totalPrincipal: number;
  totalInterest: number;
  /** Saldo del préstamo tras el pago. `null` si no se pudo leer. */
  balanceAfter: number | null;
  /** Lo que sigue pendiente de las cuotas cobradas en este recibo */
  stillPending: number;
}

const FORMAT_TITLE: Record<ReceiptFormat, string> = {
  POS58: 'RECIBO DE PAGO',
  POS80: 'RECIBO DE PAGO',
  LETTER: 'RECIBO DE PAGO',
};

const styles = (format: ReceiptFormat): string => {
  const compact = format !== 'LETTER';
  const base = compact ? 10 : 12;

  return `
    * { box-sizing: border-box; }
    body {
      font-family: ${compact ? "'Courier New', monospace" : "Arial, Helvetica, sans-serif"};
      margin: 0; padding: 0; color: #000;
      font-size: ${base}px; line-height: 1.35;
    }
    .receipt-container {
      ${compact ? 'width: 100%; padding: 6px;' : 'max-width: 720px; margin: 0 auto; padding: 28px;'}
    }
    .header { text-align: center; margin-bottom: 12px; }
    .company-name { font-size: ${compact ? 13 : 20}px; font-weight: bold; margin-bottom: 3px; }
    .company-line { font-size: ${compact ? 9 : 11}px; }
    .receipt-title { font-size: ${compact ? 12 : 16}px; font-weight: bold; margin-top: 8px; }
    .receipt-number { font-size: ${compact ? 9 : 11}px; }
    .section { margin-bottom: 10px; }
    .section-title {
      font-weight: bold; font-size: ${compact ? 10 : 12}px;
      border-bottom: 1px solid #000; padding-bottom: 2px; margin-bottom: 4px;
      text-transform: uppercase;
    }
    .info-row { display: flex; justify-content: space-between; gap: 8px; font-size: ${base}px; }
    .info-row span:last-child { text-align: right; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; font-size: ${compact ? 9 : 11}px; }
    th, td { padding: ${compact ? '2px 1px' : '5px 6px'}; text-align: left; }
    thead th { border-bottom: 1px solid #000; font-weight: bold; }
    tbody tr { border-bottom: 1px dotted #999; }
    .num { text-align: right; white-space: nowrap; }
    .settled { font-weight: bold; }
    .partial { font-style: italic; }
    tfoot td { border-top: 1px solid #000; font-weight: bold; padding-top: 4px; }
    .total-amount {
      font-size: ${compact ? 14 : 18}px; font-weight: bold; text-align: center;
      margin-top: 10px; padding: 6px 0; border-top: 2px solid #000; border-bottom: 2px solid #000;
    }
    .footer { margin-top: 14px; text-align: center; font-size: ${compact ? 8 : 10}px; }
    .sign { margin-top: ${compact ? 18 : 46}px; display: flex; justify-content: space-around; gap: 20px; }
    .sign div { border-top: 1px solid #000; padding-top: 4px; text-align: center; flex: 1; font-size: ${compact ? 8 : 10}px; }
    @media print {
      body { margin: 0; padding: 0; }
      .receipt-container { border: none; }
      @page { margin: ${compact ? '0' : '12mm'}; size: ${format === 'POS58' ? '58mm auto' : format === 'POS80' ? '80mm auto' : 'auto'}; }
    }
  `;
};

/** Fecha 'YYYY-MM-DD' → 'DD/MM/YYYY'. No usa `Date` para no desplazar el día por zona horaria. */
const shortDate = (iso: string): string => {
  const [y, m, d] = String(iso || '').split('T')[0].split('-');
  return y && m && d ? `${d}/${m}/${y}` : String(iso || '');
};

export const buildAdvancedPaymentReceipt = (
  data: AdvancedReceiptData,
  format: ReceiptFormat = 'LETTER',
): string => {
  const compact = format !== 'LETTER';
  const c = data.company;

  const rows = data.allocations.map(a => `
    <tr>
      <td>${a.isCharge ? 'Cargo' : 'Cuota'} #${a.installmentNumber}</td>
      <td>${esc(shortDate(a.dueDate))}</td>
      <td class="num">${money(a.applied)}</td>
      <td class="num ${a.settles ? 'settled' : 'partial'}">${a.settles ? 'Saldada' : money(a.pendingAfter)}</td>
    </tr>
  `).join('');

  // En papel carta cabe el desglose capital/interés por línea; en ticket térmico no.
  const detailedRows = data.allocations.map(a => `
    <tr>
      <td>${a.isCharge ? 'Cargo' : 'Cuota'} #${a.installmentNumber}</td>
      <td>${esc(shortDate(a.dueDate))}</td>
      <td class="num">${money(a.total)}</td>
      <td class="num">${a.previouslyPaid > 0.005 ? money(a.previouslyPaid) : '—'}</td>
      <td class="num">${money(a.principal)}</td>
      <td class="num">${money(a.interest)}</td>
      <td class="num">${money(a.applied)}</td>
      <td class="num ${a.settles ? 'settled' : 'partial'}">${a.settles ? 'Saldada' : money(a.pendingAfter)}</td>
    </tr>
  `).join('');

  const settledCount = data.allocations.filter(a => a.settles).length;
  const partialCount = data.allocations.length - settledCount;

  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <title>${FORMAT_TITLE[format]} - ${esc(data.client.full_name)}</title>
    <style>${styles(format)}</style>
  </head>
  <body>
    <div class="receipt-container">
      <div class="header">
        ${c ? `
          <div class="company-name">${esc(c.company_name || 'LA EMPRESA')}</div>
          ${c.address ? `<div class="company-line">${esc(c.address)}</div>` : ''}
          ${c.phone ? `<div class="company-line">Tel.: ${esc(c.phone)}</div>` : ''}
          ${c.tax_id ? `<div class="company-line">RNC: ${esc(c.tax_id)}</div>` : ''}
          <hr style="border: none; border-top: 1px solid #000; margin: 8px 0;">
        ` : ''}
        <div class="receipt-title">${FORMAT_TITLE[format]}</div>
        <div class="receipt-number">Recibo #${esc(data.receiptNumber)}</div>
        <div class="receipt-number">${esc(shortDate(data.paymentDate))}</div>
      </div>

      <div class="section">
        <div class="section-title">Cliente</div>
        <div class="info-row"><span>Nombre</span><span>${esc(data.client.full_name || 'N/D')}</span></div>
        <div class="info-row"><span>Documento</span><span>${esc(data.client.dni || 'N/D')}</span></div>
        ${data.client.phone ? `<div class="info-row"><span>Teléfono</span><span>${esc(data.client.phone)}</span></div>` : ''}
      </div>

      <div class="section">
        <div class="section-title">Pago</div>
        <div class="info-row"><span>Forma de pago</span><span>${esc(data.paymentMethodLabel)}</span></div>
        ${data.reference ? `<div class="info-row"><span>Referencia</span><span>${esc(data.reference)}</span></div>` : ''}
        <div class="info-row"><span>Cuotas cubiertas</span><span>${data.allocations.length}</span></div>
      </div>

      <div class="section">
        <div class="section-title">Detalle por cuota</div>
        <table>
          <thead>
            ${compact ? `
              <tr>
                <th>Concepto</th><th>Vence</th><th class="num">Abonado</th><th class="num">Queda</th>
              </tr>
            ` : `
              <tr>
                <th>Concepto</th><th>Vence</th><th class="num">Cuota</th><th class="num">Pagado antes</th>
                <th class="num">Capital</th><th class="num">Interés</th><th class="num">Abonado</th><th class="num">Queda</th>
              </tr>
            `}
          </thead>
          <tbody>
            ${compact ? rows : detailedRows}
          </tbody>
          <tfoot>
            ${compact ? `
              <tr>
                <td colspan="2">TOTAL</td>
                <td class="num">${money(data.totalApplied)}</td>
                <td class="num">${data.stillPending > 0.005 ? money(data.stillPending) : '—'}</td>
              </tr>
            ` : `
              <tr>
                <td colspan="4">TOTAL</td>
                <td class="num">${money(data.totalPrincipal)}</td>
                <td class="num">${money(data.totalInterest)}</td>
                <td class="num">${money(data.totalApplied)}</td>
                <td class="num">${data.stillPending > 0.005 ? money(data.stillPending) : '—'}</td>
              </tr>
            `}
          </tfoot>
        </table>
        <div style="margin-top:6px; font-size:${compact ? 9 : 11}px;">
          ${settledCount} ${settledCount === 1 ? 'cuota saldada' : 'cuotas saldadas'}${partialCount > 0
            ? ` · ${partialCount} con abono parcial` : ''}
        </div>
      </div>

      <div class="total-amount">TOTAL RECIBIDO: ${money(data.totalApplied)}</div>

      <div class="section" style="margin-top:10px;">
        <div class="info-row"><span>Aplicado a capital</span><span>${money(data.totalPrincipal)}</span></div>
        <div class="info-row"><span>Aplicado a interés</span><span>${money(data.totalInterest)}</span></div>
        ${data.balanceAfter !== null
          ? `<div class="info-row"><span>Balance del préstamo</span><span>${money(data.balanceAfter)}</span></div>`
          : ''}
      </div>

      ${data.notes ? `
        <div class="section">
          <div class="section-title">Notas</div>
          <div style="font-size:${compact ? 9 : 11}px;">${esc(data.notes)}</div>
        </div>
      ` : ''}

      ${!compact ? `
        <div class="sign">
          <div>Recibí conforme (cliente)</div>
          <div>Entregado por</div>
        </div>
      ` : ''}

      <div class="footer">
        <p>Comprobante de pago. La mora, si la hubiera, se cobra por separado.</p>
      </div>
    </div>
  </body>
</html>`;
};

/** Abre el recibo en una ventana nueva y lanza la impresión. */
export const printAdvancedPaymentReceipt = (
  data: AdvancedReceiptData,
  format: ReceiptFormat = 'LETTER',
): boolean => {
  const win = window.open('', '_blank');
  if (!win) return false; // bloqueador de ventanas emergentes

  win.document.write(buildAdvancedPaymentReceipt(data, format));
  win.document.close();
  // `onload` no siempre dispara con `document.write`: se da un margen al renderizado.
  setTimeout(() => {
    win.focus();
    win.print();
  }, 300);
  return true;
};
