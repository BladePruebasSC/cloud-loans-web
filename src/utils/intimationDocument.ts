// Generación de la carta de intimación: valores de placeholders y PDF.
// Reutiliza el motor de PDF existente (jsPDF + addCompanyLogo/renderHtmlToPdf de LoanForm).
import { formatCurrency } from '@/lib/utils';
import { formatDateStringForSantoDomingo, getCurrentDateStringForSantoDomingo } from '@/utils/dateUtils';
import { addPeriodsToIsoDate } from '@/utils/frequencyUtils';
import { DEFAULT_INTIMATION_TEMPLATE, renderTemplate } from '@/utils/legalWorkflow';

export interface IntimationContext {
  company: { name?: string | null; phone?: string | null; address?: string | null; logo_url?: string | null };
  representativeName: string;
  client: { full_name: string; dni: string; phone?: string | null; address?: string | null; city?: string | null };
  loan: { id: string; amount: number; remaining_balance: number; current_late_fee: number | null };
  caseNumber: string;
  daysOverdue: number;
  overdueInstallments: Array<{ installment_number: number; due_date: string; total_amount: number }>;
  deadlineDays: number;
  claimedAmount: number;
  /** Fecha base para el plazo (hoy si aún no se ha notificado) */
  baseDateIso?: string;
}

export const buildIntimationValues = (ctx: IntimationContext): Record<string, string> => {
  const today = getCurrentDateStringForSantoDomingo();
  const base = ctx.baseDateIso || today;
  const deadline = addPeriodsToIsoDate(base, ctx.deadlineDays, 'daily');
  const detalle = ctx.overdueInstallments.length
    ? ctx.overdueInstallments.map(i => `  - Cuota ${i.installment_number}: vencida el ${formatDateStringForSantoDomingo(i.due_date)} — ${formatCurrency(Number(i.total_amount || 0))}`).join('\n')
    : '  (sin cuotas vencidas registradas)';
  return {
    '{empresa_nombre}': ctx.company.name || 'LA EMPRESA',
    '{empresa_telefono}': ctx.company.phone || '',
    '{empresa_direccion}': ctx.company.address || '',
    '{representante_nombre}': ctx.representativeName || '',
    '{fecha_actual}': formatDateStringForSantoDomingo(today),
    '{cliente_nombre}': ctx.client.full_name,
    '{cliente_dni}': ctx.client.dni,
    '{cliente_direccion}': [ctx.client.address, ctx.client.city].filter(Boolean).join(', '),
    '{cliente_telefono}': ctx.client.phone || '',
    '{numero_prestamo}': ctx.loan.id.slice(0, 8).toUpperCase(),
    '{numero_expediente}': ctx.caseNumber,
    '{monto_original}': formatCurrency(Number(ctx.loan.amount || 0)),
    '{saldo_pendiente}': formatCurrency(Number(ctx.loan.remaining_balance || 0)),
    '{mora_pendiente}': formatCurrency(Number(ctx.loan.current_late_fee || 0)),
    '{cuotas_vencidas}': String(ctx.overdueInstallments.length),
    '{detalle_cuotas}': detalle,
    '{dias_atraso}': String(ctx.daysOverdue),
    '{total_reclamado}': formatCurrency(Number(ctx.claimedAmount || 0)),
    '{fecha_limite_intimacion}': formatDateStringForSantoDomingo(deadline),
    '{dias_plazo}': String(ctx.deadlineDays),
  };
};

export const renderIntimation = (template: string | null | undefined, ctx: IntimationContext): string =>
  renderTemplate(template && template.trim() ? template : DEFAULT_INTIMATION_TEMPLATE, buildIntimationValues(ctx));

/** Genera el PDF de la carta (texto plano o HTML) con el logo de la empresa. */
export const generateIntimationPdf = async (content: string, logoUrl?: string | null, headerLine?: string): Promise<Blob> => {
  const { default: jsPDF } = await import('jspdf');
  const { addCompanyLogo, renderHtmlToPdf } = await import('@/components/loans/LoanForm');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  let y = margin;
  if (logoUrl) {
    try { y = margin + (await addCompanyLogo(doc, logoUrl, margin, pageWidth)); } catch { /* sin logo */ }
  }
  if (headerLine) {
    doc.setFontSize(9); doc.setFont('helvetica', 'normal'); doc.setTextColor(120);
    doc.text(headerLine, margin, y); y += 6; doc.setTextColor(0);
  }
  if (content.includes('<') && content.includes('>')) {
    await renderHtmlToPdf(doc, content, y, margin, pageWidth, pageHeight, null);
  } else {
    doc.setFontSize(11); doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(content, pageWidth - margin * 2) as string[];
    for (const line of lines) {
      if (y > pageHeight - margin) { doc.addPage(); y = margin; }
      doc.text(line, margin, y);
      y += 5.2;
    }
  }
  return doc.output('blob');
};
