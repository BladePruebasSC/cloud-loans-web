import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  History, 
  DollarSign, 
  Calendar, 
  User,
  Receipt,
  Edit,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle,
  AlertCircle,
  Printer,
  Download,
  X,
  CreditCard
} from 'lucide-react';
import { PaymentActions } from './PaymentActions';
import { formatInTimeZone } from 'date-fns-tz';
import { useAuth } from '@/hooks/useAuth';
import jsPDF from 'jspdf';

interface LoanHistoryEntry {
  id: string;
  loan_id: string;
  change_type: string;
  old_values: any;
  new_values: any;
  old_value?: any;
  new_value?: any;
  reason?: string;
  description?: string;
  amount?: number;
  created_by: string;
  created_at: string;
}

interface Payment {
  id: string;
  amount: number;
  principal_amount: number;
  interest_amount: number;
  late_fee: number;
  payment_date: string;
  due_date: string;
  payment_method: string;
  reference_number?: string;
  notes?: string;
  status: string;
  created_at: string;
  payment_time_local?: string;
  payment_timezone?: string;
  loan_id: string;
}

interface Loan {
  id: string;
  amount: number;
  total_amount?: number;
  interest_rate: number;
  term_months: number;
  status?: string;
  client: {
    full_name: string;
    dni: string;
    phone?: string;
    address?: string;
  };
}

interface LoanHistoryViewProps {
  loanId: string;
  isOpen: boolean;
  onClose: () => void;
  onRefresh?: () => void;
}





export const LoanHistoryView: React.FC<LoanHistoryViewProps> = ({ 
  loanId, 
  isOpen, 
  onClose,
  onRefresh
}) => {
  const { companyId } = useAuth();
  const [history, setHistory] = useState<LoanHistoryEntry[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loan, setLoan] = useState<Loan | null>(null);
  const [loading, setLoading] = useState(true);
  const [companySettings, setCompanySettings] = useState<any>(null);

  const round2 = (n: number) => Math.round((Number(n || 0) * 100)) / 100;

  // ✅ Para "Agregar Cargo": recalcular balances mostrados usando el total base real
  // (evita desfaces como 245,996 vs 246,000 por cuota redondeada).
  const computedChargeBalancesById = useMemo(() => {
    const map = new Map<string, { prev: number; next: number }>();
    if (!loan) return map;

    // IMPORTANTE:
    // Para préstamos a plazo, el "total" real normalmente vive en `loans.total_amount`.
    // La fórmula simple `amount * rate * term_months` NO aplica y produce balances absurdos.
    const fallbackTotal = round2(
      (Number(loan.amount || 0) || 0) +
        ((Number(loan.amount || 0) || 0) * (Number(loan.interest_rate || 0) / 100) * (Number(loan.term_months || 0) || 0))
    );
    const baseLoanTotal = round2(
      Number(loan.total_amount ?? fallbackTotal) || 0
    );

    const chargeEntries = (history || [])
      .filter((e) => {
        const t = String(e.change_type || '').toLowerCase();
        return t === 'add_charge' || (t === 'balance_adjustment' && String(e.description || '').toLowerCase().includes('agregar cargo'));
      })
      .slice()
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    let cumulativeCharges = 0;
    for (const entry of chargeEntries) {
      const description = String(entry.description || '');
      const amountMatch = description.match(/Monto:\s*RD?\$?([\d,]+\.?\d*)/i);
      const amount =
        (amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : null) ??
        (Number((entry as any).amount || 0) || 0);

      const prev = round2(baseLoanTotal + cumulativeCharges);
      const next = round2(baseLoanTotal + cumulativeCharges + (Number(amount) || 0));
      map.set(entry.id, { prev, next });

      cumulativeCharges = round2(cumulativeCharges + (Number(amount) || 0));
    }

    return map;
  }, [history, loan]);

  // Función para formatear fecha y hora de pagos
  const formatPaymentDateTime = (payment: Payment) => {
    // Priorizar payment_time_local si existe, sino usar created_at
    const dateString = payment.payment_time_local || payment.created_at;
    if (!dateString) return '-';
    
    try {
      const date = new Date(dateString);
      const formatted = formatInTimeZone(
        date,
        'America/Santo_Domingo',
        'dd MMM yyyy, hh:mm a'
      );
      
      return formatted;
    } catch (error) {
      console.error('Error in formatPaymentDateTime:', error);
      return '-';
    }
  };

  useEffect(() => {
    if (isOpen && loanId) {
      fetchLoanHistory();
      fetchPayments();
      fetchLoanDetails();
      fetchCompanySettings();
    }
  }, [isOpen, loanId, companyId]);

  const fetchCompanySettings = async () => {
    if (!companyId) return;
    try {
      const { data, error } = await supabase
        .from('company_settings')
        .select('*')
        .eq('user_id', companyId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching company settings:', error);
      } else if (data) {
        setCompanySettings(data);
      }
    } catch (error) {
      console.error('Error fetching company settings:', error);
    }
  };

  // Escuchar eventos de actualización del préstamo para recargar el historial
  useEffect(() => {
    const handleLoanHistoryRefresh = (event: CustomEvent) => {
      if (event.detail && event.detail.loanId === loanId && isOpen) {
        fetchLoanHistory();
        fetchPayments();
        fetchLoanDetails();
      }
    };

    window.addEventListener('loanHistoryRefresh', handleLoanHistoryRefresh as EventListener);
    
    return () => {
      window.removeEventListener('loanHistoryRefresh', handleLoanHistoryRefresh as EventListener);
    };
  }, [loanId, isOpen]);

  const fetchLoanDetails = async () => {
    try {
      const { data, error } = await supabase
        .from('loans')
        .select(`
          id,
          amount,
          total_amount,
          interest_rate,
          term_months,
          status,
          client:client_id (
            full_name,
            dni,
            phone,
            address
          )
        `)
        .eq('id', loanId)
        .single();

      if (error) throw error;
      // Transformar los datos para que coincidan con la interfaz Loan
      const transformedData = {
        ...data,
        client: {
          full_name: (data.client as any)?.full_name || '',
          dni: (data.client as any)?.dni || '',
          phone: (data.client as any)?.phone || '',
          address: (data.client as any)?.address || ''
        }
      };
      setLoan(transformedData);
    } catch (error) {
      console.error('Error fetching loan details:', error);
    }
  };

  const fetchLoanHistory = async () => {
    try {
      // Intentar obtener historial si la tabla existe
      const { data, error } = await supabase
        .from('loan_history')
        .select('*')
        .eq('loan_id', loanId)
        .order('created_at', { ascending: false });

      if (error) {
        // Si la tabla no existe (42P01) o no hay permisos, simplemente no mostrar historial
        if (error.code === '42P01' || error.code === 'PGRST116') {
          setHistory([]);
        } else {
          console.error('❌ Error fetching loan history:', error);
          setHistory([]);
        }
      } else {
        setHistory(data || []);
      }
    } catch (error) {
      console.error('❌ Exception fetching loan history:', error);
      setHistory([]);
    }
  };

  const fetchPayments = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('loan_id', loanId)
        .order('payment_date', { ascending: false });

      if (error) throw error;
      
      // Ordenar por fecha de pago (descendente) y luego por created_at (descendente) como orden secundario
      const sortedPayments = (data || []).sort((a, b) => {
        const dateA = new Date(a.payment_date).getTime();
        const dateB = new Date(b.payment_date).getTime();
        
        // Si las fechas son iguales, ordenar por created_at (más reciente primero)
        if (dateA === dateB) {
          const createdA = new Date(a.created_at).getTime();
          const createdB = new Date(b.created_at).getTime();
          return createdB - createdA; // Descendente
        }
        
        return dateB - dateA; // Descendente (más reciente primero)
      });
      
      setPayments(sortedPayments);
    } catch (error) {
      console.error('Error fetching payments:', error);
      toast.error('Error al cargar historial de pagos');
    } finally {
      setLoading(false);
    }
  };

  // Función para recargar todo después de eliminar un pago
  const refreshAfterPaymentDeletion = async () => {
    try {
      // Recargar pagos y detalles del préstamo
      await Promise.all([
        fetchPayments(),
        fetchLoanDetails(),
        fetchLoanHistory()
      ]);
      
      // Recargar la página principal para actualizar el balance en la vista principal
      setTimeout(() => {
        window.location.reload();
      }, 1000); // Esperar 1 segundo para que se complete la actualización
      
    } catch (error) {
      console.error('Error refreshing after payment deletion:', error);
    }
  };



  const getChangeTypeIcon = (type: string) => {
    switch (type) {
      case 'payment': return <Receipt className="h-4 w-4 text-green-600" />;
      case 'partial_payment': return <DollarSign className="h-4 w-4 text-blue-600" />;
      case 'interest_adjustment': return <TrendingUp className="h-4 w-4 text-orange-600" />;
      case 'term_extension': return <Calendar className="h-4 w-4 text-purple-600" />;
      case 'balance_adjustment': return <Edit className="h-4 w-4 text-gray-600" />;
      case 'add_charge': return <TrendingUp className="h-4 w-4 text-blue-600" />;
      case 'remove_late_fee': return <TrendingDown className="h-4 w-4 text-red-600" />;
      default: return <History className="h-4 w-4 text-gray-600" />;
    }
  };

  const getChangeTypeLabel = (type: string) => {
    const labels = {
      payment: 'Pago Completo',
      partial_payment: 'Abono Parcial',
      interest_adjustment: 'Ajuste de Tasa',
      term_extension: 'Extensión de Plazo',
      balance_adjustment: 'Ajuste de Balance',
      rate_change: 'Cambio de Tasa',
      status_change: 'Cambio de Estado',
      add_charge: 'Agregar Cargo',
      remove_late_fee: 'Eliminar Mora',
      capital_payment: 'Abono a Capital'
    };
    return labels[type as keyof typeof labels] || type;
  };

  // Función para extraer información de la descripción
  const extractDescriptionInfo = (description: string) => {
    if (!description) return { reason: null, amount: null, months: null, days: null, quincenas: null };
    
    // Extraer razón - buscar después del primer ":" hasta el siguiente "." o final
    let reason: string | null = null;
    const colonIndex = description.indexOf(':');
    if (colonIndex !== -1) {
      const afterColon = description.substring(colonIndex + 1);
      // Buscar el siguiente punto que no sea parte de un número
      const dotMatch = afterColon.match(/^([^.]+?)(?:\.\s|$)/);
      if (dotMatch) {
        reason = dotMatch[1].trim();
      } else {
        reason = afterColon.trim();
      }
    }
    
    // Extraer monto (para cargos, abonos, etc.)
    const amountMatch = description.match(/RD\$([\d,]+\.?\d*)/);
    const amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : null;
    
    // Extraer meses/días/quincenas para extensiones de plazo
    // Buscar patrones como "3 meses", "3 meses agregados", "2 días", "4 quincenas", etc.
    const monthsMatch = description.match(/(\d+)\s*mes(es)?(?:\s+agregados?)?/i);
    const daysMatch = description.match(/(\d+)\s*d[íi]a(s)?(?:\s+agregados?)?/i);
    const quincenasMatch = description.match(/(\d+)\s*quincena(s)?(?:\s+agregadas?)?/i);
    const weeksMatch = description.match(/(\d+)\s*semana(s)?(?:\s+agregadas?)?/i);
    
    return {
      reason,
      amount,
      months: monthsMatch ? parseInt(monthsMatch[1]) : null,
      days: daysMatch ? parseInt(daysMatch[1]) : (weeksMatch ? parseInt(weeksMatch[1]) * 7 : null),
      quincenas: quincenasMatch ? parseInt(quincenasMatch[1]) : null
    };
  };
  
  const getChangeTypeLabelWithUpdateType = (entry: LoanHistoryEntry) => {
    // Si la descripción contiene información específica, extraerla para una etiqueta más descriptiva
    const description = entry.description || '';
    
    // Detectar tipos específicos basados en la descripción
    if (description.includes('Abono a capital')) {
      return 'Abono a Capital';
    }
    if (description.includes('Agregar Cargo') || description.includes('Cargo')) {
      return 'Agregar Cargo';
    }
    if (description.includes('Eliminar Mora') || description.includes('Mora')) {
      return 'Eliminar Mora';
    }
    if (description.includes('Acuerdo de Pago')) {
      return 'Acuerdo de Pago';
    }
    if (description.includes('Extensión de Plazo') || entry.change_type === 'term_extension') {
      return 'Extensión de Plazo';
    }
    
    // Usar la función básica como fallback
    return getChangeTypeLabel(entry.change_type);
  };

  const getPaymentMethodLabel = (method: string) => {
    const methods = {
      cash: 'Efectivo',
      bank_transfer: 'Transferencia',
      check: 'Cheque',
      card: 'Tarjeta',
      online: 'En línea'
    };
    return methods[method as keyof typeof methods] || method;
  };

  // Función para traducir el método de pago en las notas
  const translatePaymentNotes = (notes: string) => {
    if (!notes) return notes;
    
    // Si las notas contienen "Cobro rápido - [método]", traducir el método
    const quickCollectionPattern = /Cobro rápido\s*-\s*(\w+)/i;
    const match = notes.match(quickCollectionPattern);
    
    if (match) {
      const method = match[1].toLowerCase();
      const methodTranslations: { [key: string]: string } = {
        'cash': 'Efectivo',
        'bank_transfer': 'Transferencia Bancaria',
        'check': 'Cheque',
        'card': 'Tarjeta',
        'online': 'Pago en línea'
      };
      
      const translatedMethod = methodTranslations[method] || method;
      return notes.replace(quickCollectionPattern, `Cobro rápido - ${translatedMethod}`);
    }
    
    return notes;
  };

  // Función para generar el HTML del recibo de abono a capital
  const generateCapitalPaymentReceiptHTML = (
    entry: LoanHistoryEntry,
    capitalAmount: number,
    penaltyAmount: number,
    oldValues: any,
    newValues: any,
    format: string = 'LETTER'
  ): string => {
    if (!loan || !companySettings) return '';
    
    const client = loan.client;
    const paymentDate = formatInTimeZone(
      new Date(entry.created_at),
      'America/Santo_Domingo',
      'dd MMM yyyy'
    );
    
    const totalAmount = capitalAmount + penaltyAmount;

    const getFormatStyles = (format: string) => {
      switch (format) {
        case 'POS58':
          return `
            * { box-sizing: border-box; }
            body { 
              font-family: 'Courier New', monospace; 
              margin: 0 !important; 
              padding: 0 !important;
              font-size: 12px;
              line-height: 1.2;
              color: #000;
            }
            .receipt-container { width: 100%; padding: 5px; }
            .header { text-align: center; margin-bottom: 10px; }
            .receipt-title { font-size: 14px; font-weight: bold; margin-bottom: 5px; }
            .section { margin-bottom: 10px; }
            .section-title { font-weight: bold; font-size: 11px; margin-bottom: 5px; }
            .info-row { margin-bottom: 3px; font-size: 10px; }
            .amount-section { margin: 10px 0; }
            .total-amount { font-size: 14px; font-weight: bold; text-align: center; }
          `;
        case 'POS80':
          return `
            * { box-sizing: border-box; }
            body { 
              font-family: 'Courier New', monospace; 
              margin: 0 !important; 
              padding: 0 !important;
              font-size: 14px;
              line-height: 1.3;
            }
            .receipt-container { width: 100%; padding: 8px; }
            .header { text-align: center; margin-bottom: 15px; }
            .receipt-title { font-size: 16px; font-weight: bold; }
            .section { margin-bottom: 15px; }
            .section-title { font-weight: bold; font-size: 13px; }
            .info-row { margin-bottom: 4px; font-size: 12px; }
            .amount-section { margin: 15px 0; }
            .total-amount { font-size: 16px; font-weight: bold; text-align: center; }
          `;
        default:
          return `
            body { font-family: Arial, sans-serif; margin: 20px; }
            .receipt-container { max-width: 8.5in; margin: 0 auto; padding: 30px; border: 1px solid #ddd; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
            .receipt-title { font-size: 24px; font-weight: bold; }
            .section { margin-bottom: 25px; }
            .section-title { font-weight: bold; font-size: 16px; margin-bottom: 10px; border-bottom: 1px solid #eee; }
            .info-row { display: flex; justify-content: space-between; margin-bottom: 8px; }
            .amount-section { background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .total-amount { font-size: 20px; font-weight: bold; color: #28a745; text-align: center; }
          `;
      }
    };

    return `
      <html>
        <head>
          <title>Recibo de Abono a Capital - ${client?.full_name || ''}</title>
          <style>${getFormatStyles(format)}</style>
        </head>
        <body>
          <div class="receipt-container">
            <div class="header">
              <div style="font-size: ${format.includes('POS') ? '14px' : '18px'}; font-weight: bold;">
                ${companySettings.company_name || 'LA EMPRESA'}
              </div>
              ${companySettings.address ? `<div>${companySettings.address}</div>` : ''}
              ${companySettings.tax_id ? `<div>RNC: ${companySettings.tax_id}</div>` : ''}
              <div class="receipt-title">RECIBO DE ABONO A CAPITAL</div>
              <div>Fecha: ${paymentDate}</div>
            </div>

            <div class="section">
              <div class="section-title">INFORMACIÓN DEL CLIENTE</div>
              <div class="info-row">
                <span>Nombre: ${client?.full_name || 'N/A'}</span>
              </div>
              ${client?.dni ? `<div class="info-row"><span>Cédula: ${client.dni}</span></div>` : ''}
              ${client?.phone ? `<div class="info-row"><span>Teléfono: ${client.phone}</span></div>` : ''}
            </div>

            <div class="section">
              <div class="section-title">DETALLES DEL PRÉSTAMO</div>
              <div class="info-row">
                <span>Monto Original: RD$${loan.amount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              <div class="info-row">
                <span>Tasa de Interés: ${loan.interest_rate}%</span>
              </div>
            </div>

            <div class="section">
              <div class="section-title">DETALLES DEL ABONO A CAPITAL</div>
              <div class="info-row">
                <span>Fecha: ${paymentDate}</span>
              </div>
              ${oldValues.capital_before !== undefined ? `
                <div class="info-row">
                  <span>Capital pendiente antes: RD$${oldValues.capital_before.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              ` : ''}
              <div class="info-row">
                <span>Monto del abono: RD$${capitalAmount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              ${penaltyAmount > 0 ? `
                <div class="info-row">
                  <span>Penalidad aplicada: RD$${penaltyAmount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              ` : ''}
              ${newValues.capital_after !== undefined ? `
                <div class="info-row">
                  <span>Capital pendiente después: RD$${newValues.capital_after.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              ` : ''}
              ${newValues.balance !== undefined ? `
                <div class="info-row">
                  <span>Balance restante: RD$${newValues.balance.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              ` : ''}
            </div>

            <div class="amount-section">
              <div class="total-amount">
                TOTAL ABONADO: RD$${totalAmount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>

            <div style="margin-top: 30px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #eee; padding-top: 20px;">
              <p>Este documento es un comprobante oficial de abono a capital.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  };

  // Función para generar PDF del recibo de abono a capital
  const generateCapitalPaymentReceiptPDF = (
    entry: LoanHistoryEntry,
    capitalAmount: number,
    penaltyAmount: number,
    oldValues: any,
    newValues: any
  ) => {
    if (!loan || !companySettings) return null;
    
    const doc = new jsPDF();
    const client = loan.client;
    const paymentDate = formatInTimeZone(
      new Date(entry.created_at),
      'America/Santo_Domingo',
      'dd MMM yyyy'
    );
    const totalAmount = capitalAmount + penaltyAmount;
    
    // Configuración
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 20;
    const lineHeight = 7;
    let yPos = margin;
    
    // Título
    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.text('RECIBO DE ABONO A CAPITAL', pageWidth / 2, yPos, { align: 'center' });
    yPos += lineHeight * 2;
    
    // Información de la empresa
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text(companySettings.company_name || 'LA EMPRESA', margin, yPos);
    yPos += lineHeight;
    
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    if (companySettings.tax_id) {
      doc.text(`RNC: ${companySettings.tax_id}`, margin, yPos);
      yPos += lineHeight;
    }
    if (companySettings.address) {
      doc.text(companySettings.address, margin, yPos);
      yPos += lineHeight * 1.5;
    }
    
    // Línea separadora
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += lineHeight * 1.5;
    
    // Información del cliente
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('INFORMACIÓN DEL CLIENTE', margin, yPos);
    yPos += lineHeight;
    
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text(`Cliente: ${client?.full_name || 'Cliente'}`, margin, yPos);
    yPos += lineHeight;
    if (client?.dni) {
      doc.text(`Cédula: ${client.dni}`, margin, yPos);
      yPos += lineHeight;
    }
    yPos += lineHeight * 0.5;
    
    // Información del préstamo
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('INFORMACIÓN DEL PRÉSTAMO', margin, yPos);
    yPos += lineHeight;
    
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text(`Monto Original: RD$${loan.amount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, margin, yPos);
    yPos += lineHeight;
    doc.text(`Tasa de Interés: ${loan.interest_rate}%`, margin, yPos);
    yPos += lineHeight * 1.5;
    
    // Detalles del abono
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('DETALLES DEL ABONO A CAPITAL', margin, yPos);
    yPos += lineHeight;
    
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text(`Fecha: ${paymentDate}`, margin, yPos);
    yPos += lineHeight;
    
    if (oldValues.capital_before !== undefined) {
      doc.text(`Capital pendiente antes: RD$${oldValues.capital_before.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, margin, yPos);
      yPos += lineHeight;
    }
    
    doc.text(`Monto del abono: RD$${capitalAmount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, margin, yPos);
    yPos += lineHeight;
    
    if (penaltyAmount > 0) {
      doc.text(`Penalidad aplicada: RD$${penaltyAmount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, margin, yPos);
      yPos += lineHeight;
    }
    
    if (newValues.capital_after !== undefined) {
      doc.text(`Capital pendiente después: RD$${newValues.capital_after.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, margin, yPos);
      yPos += lineHeight;
    }
    
    if (newValues.balance !== undefined) {
      doc.text(`Balance restante: RD$${newValues.balance.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, margin, yPos);
      yPos += lineHeight;
    }
    
    yPos += lineHeight;
    
    // Total
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text(`TOTAL ABONADO: RD$${totalAmount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, pageWidth / 2, yPos, { align: 'center' });
    yPos += lineHeight * 2;
    
    // Nota final
    doc.setFontSize(9);
    doc.setFont(undefined, 'italic');
    doc.text('Este documento es un comprobante oficial de abono a capital.', pageWidth / 2, yPos, { align: 'center' });
    
    return doc;
  };
  
  const printCapitalPaymentReceipt = (entry: LoanHistoryEntry, capitalAmount: number, penaltyAmount: number, oldValues: any, newValues: any) => {
    const doc = generateCapitalPaymentReceiptPDF(entry, capitalAmount, penaltyAmount, oldValues, newValues);
    if (doc) {
      doc.autoPrint();
      window.open(doc.output('bloburl'), '_blank');
    }
  };

  const downloadCapitalPaymentReceipt = (entry: LoanHistoryEntry, capitalAmount: number, penaltyAmount: number, oldValues: any, newValues: any) => {
    if (!loan) return;
    const doc = generateCapitalPaymentReceiptPDF(entry, capitalAmount, penaltyAmount, oldValues, newValues);
    if (doc) {
      const client = loan.client;
      const fileName = `recibo_abono_capital_${client?.full_name?.replace(/\s+/g, '_') || 'cliente'}_${formatInTimeZone(new Date(entry.created_at), 'America/Santo_Domingo', 'yyyy-MM-dd')}.pdf`;
      doc.save(fileName);
    }
  };

  const translateReason = (reason: string) => {
    const translations: Record<string, string> = {
      // Razones para cargos (add_charge)
      'late_payment_fee': 'Multa por Pago Tardío',
      'administrative_fee': 'Tarifa Administrativa',
      'penalty_fee': 'Cargo por Penalización',
      'insurance_fee': 'Seguro del Préstamo',
      'processing_fee': 'Tarifa de Procesamiento',
      'legal_fee': 'Gastos Legales',
      'collection_fee': 'Gastos de Cobranza',
      'other_charge': 'Otro Cargo',
      // Razones para extensión de plazo (term_extension)
      'financial_difficulty': 'Dificultades Financieras',
      'job_loss': 'Pérdida de Empleo',
      'medical_emergency': 'Emergencia Médica',
      'family_emergency': 'Emergencia Familiar',
      'income_reduction': 'Reducción de Ingresos',
      'payment_plan': 'Plan de Pagos Especial',
      'rate_negotiation': 'Renegociación de Condiciones',
      'goodwill_extension': 'Extensión de Buena Voluntad',
      // Razones para ajuste de balance (balance_adjustment)
      'error_correction': 'Corrección de Error',
      'administrative_adjustment': 'Ajuste Administrativo',
      'rate_adjustment': 'Ajuste de Tasa de Interés',
      'principal_reduction': 'Reducción de Capital',
      'interest_adjustment': 'Ajuste de Intereses',
      'forgiveness': 'Perdón de Deuda Parcial',
      'goodwill_adjustment': 'Ajuste de Buena Voluntad',
      'legal_settlement': 'Acuerdo Legal',
      // Razones para eliminación de préstamo (delete_loan)
      'duplicate_entry': 'Entrada Duplicada',
      'data_entry_error': 'Error de Captura de Datos',
      'wrong_client': 'Cliente Incorrecto',
      'test_entry': 'Entrada de Prueba',
      'cancelled_loan': 'Préstamo Cancelado',
      'paid_outside_system': 'Pagado Fuera del Sistema',
      'fraud': 'Fraude Detectado',
      // Razones para eliminar mora (remove_late_fee)
      'payment_agreement': 'Acuerdo de Pago',
      'administrative_decision': 'Decisión Administrativa',
      'client_complaint': 'Reclamo del Cliente',
      'system_error': 'Error del Sistema',
      // Razones para saldar préstamo (settle_loan)
      'full_payment': 'Pago Completo del Préstamo',
      'early_settlement': 'Liquidación Anticipada',
      'client_request': 'Solicitud del Cliente',
      'refinancing': 'Refinanciamiento',
      // Razón genérica
      'other': 'Otra Razón'
    };
    return translations[reason] || reason;
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Historial del Préstamo
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Movimientos (Pagos, Cargos, Eliminaciones de Mora) */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="h-5 w-5" />
                  Movimientos ({(() => {
                    const movements = payments.length + 
                      history.filter(h => {
                        const isCapitalPayment = h.change_type === 'capital_payment' || 
                          (h.change_type === 'balance_adjustment' && h.description && h.description.includes('Abono a capital'));
                        return h.change_type === 'add_charge' || h.change_type === 'remove_late_fee' || isCapitalPayment;
                      }).length;
                    return movements;
                  })()})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-8">Cargando movimientos...</div>
                ) : (() => {
                  // Combinar pagos y movimientos de historial
                  const movements: Array<{
                    id: string;
                    type: 'payment' | 'add_charge' | 'remove_late_fee' | 'capital_payment';
                    date: Date;
                    data: any;
                  }> = [];

                  // Agregar pagos
                  payments.forEach(payment => {
                    const dateStr = payment.payment_time_local || payment.created_at;
                    movements.push({
                      id: payment.id,
                      type: 'payment',
                      date: new Date(dateStr),
                      data: payment
                    });
                  });

                  // Agregar cargos, eliminaciones de mora y abonos a capital del historial
                  history.forEach(entry => {
                    // Detectar abonos a capital: puede ser 'capital_payment' o 'balance_adjustment' con descripción "Abono a capital"
                    const isCapitalPayment = entry.change_type === 'capital_payment' || 
                      (entry.change_type === 'balance_adjustment' && entry.description && entry.description.includes('Abono a capital'));
                    
                    if (entry.change_type === 'add_charge' || entry.change_type === 'remove_late_fee' || isCapitalPayment) {
                      movements.push({
                        id: entry.id,
                        type: isCapitalPayment ? 'capital_payment' : entry.change_type as 'add_charge' | 'remove_late_fee',
                        date: new Date(entry.created_at),
                        data: entry
                      });
                    }
                  });

                  // Ordenar por fecha (más reciente primero)
                  movements.sort((a, b) => b.date.getTime() - a.date.getTime());

                  if (movements.length === 0) {
                    return (
                      <div className="text-center py-8 text-gray-500">
                        <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No hay movimientos registrados</p>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-4">
                      {movements.map((movement) => {
                        if (movement.type === 'payment') {
                          const payment = movement.data as Payment;
                          return (
                            <div 
                              key={movement.id} 
                              className="border rounded-lg p-4 hover:bg-gray-50 transition-colors"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-3 mb-2">
                                    <Receipt className={`h-4 w-4 ${payment.status === 'completed' ? 'text-green-600' : 'text-yellow-600'}`} />
                                    <span className="font-semibold">Pago de ${payment.amount.toLocaleString()}</span>
                                    <Badge variant={payment.status === 'completed' ? 'default' : 'secondary'}>
                                      {payment.status === 'completed' ? 'Completado' : 'Pendiente'}
                                    </Badge>
                                    {payment.late_fee > 0 && (
                                      <Badge variant="destructive">Con Mora</Badge>
                                    )}
                                  </div>
                                  
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600">
                                    <div>
                                      <span className="font-medium">Fecha:</span> {formatPaymentDateTime(payment)}
                                    </div>
                                    <div>
                                      <span className="font-medium">Principal:</span> ${payment.principal_amount.toLocaleString()}
                                    </div>
                                    <div>
                                      <span className="font-medium">Interés:</span> ${payment.interest_amount.toLocaleString()}
                                    </div>
                                    <div>
                                      <span className="font-medium">Método:</span> {getPaymentMethodLabel(payment.payment_method)}
                                    </div>
                                  </div>

                                  {payment.late_fee > 0 && (
                                    <div className="text-sm text-red-600 mt-2">
                                      <span className="font-medium">Mora:</span> ${payment.late_fee.toLocaleString()}
                                    </div>
                                  )}

                                  {payment.reference_number && (
                                    <div className="text-sm text-gray-600 mt-2">
                                      <span className="font-medium">Referencia:</span> {payment.reference_number}
                                    </div>
                                  )}

                                  {payment.notes && (
                                    <div className="text-sm text-gray-600 mt-2">
                                      <span className="font-medium">Notas:</span> {translatePaymentNotes(payment.notes)}
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 ml-4">
                                  <PaymentActions 
                                    payment={payment} 
                                    onPaymentUpdated={refreshAfterPaymentDeletion}
                                    loanStatus={loan?.status}
                                  />
                                </div>
                              </div>
                            </div>
                          );
                        } else if (movement.type === 'add_charge') {
                          const entry = movement.data as LoanHistoryEntry;
                          
                          // Parsear old_value y new_value como JSON strings si es necesario
                          let oldValues: any = {};
                          let newValues: any = {};
                          
                          try {
                            if (entry.old_values) {
                              oldValues = typeof entry.old_values === 'string' 
                                ? JSON.parse(entry.old_values) 
                                : (entry.old_values || {});
                            }
                            if (entry.new_values) {
                              newValues = typeof entry.new_values === 'string' 
                                ? JSON.parse(entry.new_values) 
                                : (entry.new_values || {});
                            }
                            if ((entry as any).old_value) {
                              oldValues = typeof (entry as any).old_value === 'string' 
                                ? JSON.parse((entry as any).old_value) 
                                : ((entry as any).old_value || {});
                            }
                            if ((entry as any).new_value) {
                              newValues = typeof (entry as any).new_value === 'string' 
                                ? JSON.parse((entry as any).new_value) 
                                : ((entry as any).new_value || {});
                            }
                          } catch (e) {
                            console.error('Error parseando valores del historial:', e);
                          }
                          
                          // Extraer información de la descripción
                          const description = entry.description || '';
                          const amountMatch = description.match(/Monto:\s*RD?\$?([\d,]+\.?\d*)/i);
                          const amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : (entry.amount || 0);
                          
                          // Extraer razón de la descripción (después de "Agregar Cargo: ")
                          let reason = entry.reason || '';
                          if (!reason && description) {
                            const reasonMatch = description.match(/Agregar Cargo:\s*([^\.]+?)(?:\.\s*Monto|$)/i);
                            if (reasonMatch) {
                              reason = reasonMatch[1].trim();
                            }
                          }
                          
                          return (
                            <div 
                              key={movement.id} 
                              className="border rounded-lg p-4 hover:bg-gray-50 transition-colors bg-blue-50/30"
                            >
                              <div className="flex items-center gap-3 mb-2">
                                <TrendingUp className="h-4 w-4 text-blue-600" />
                                <span className="font-semibold">Cargo Agregado: RD${amount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                <Badge variant="outline" className="bg-blue-100 text-blue-800">Cargo</Badge>
                              </div>
                              
                              <div className="text-sm text-gray-600 mb-2">
                                <span className="font-medium">Fecha:</span>{' '}
                                {formatInTimeZone(
                                  new Date(entry.created_at),
                                  'America/Santo_Domingo',
                                  'dd MMM yyyy, hh:mm a'
                                )}
                              </div>

                              {(entry as any).charge_date && (
                                <div className="text-sm text-gray-600 mb-2">
                                  <span className="font-medium">Fecha del Cargo:</span>{' '}
                                  {new Date((entry as any).charge_date).toLocaleDateString('es-DO', {
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric'
                                  })}
                                </div>
                              )}

                              {reason && (
                              <div className="text-sm text-gray-600 mb-2">
                                  <span className="font-medium">Razón:</span> {translateReason(reason)}
                              </div>
                              )}

                              {(() => {
                                const computed = computedChargeBalancesById.get(entry.id);
                                const prev =
                                  computed?.prev ??
                                  (oldValues && oldValues.balance !== undefined ? Number(oldValues.balance) : null);
                                const next =
                                  computed?.next ??
                                  (newValues && newValues.balance !== undefined ? Number(newValues.balance) : null);
                                if (prev === null && next === null) return null;
                                return (
                                  <>
                                    {prev !== null && (
                                      <div className="text-sm text-gray-600 mb-2">
                                        <span className="font-medium">Balance Anterior:</span>{' '}
                                        RD${Number(prev).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </div>
                                    )}
                                    {next !== null && (
                                      <div className="text-sm text-gray-600 mb-2">
                                        <span className="font-medium">Nuevo Balance:</span>{' '}
                                        RD${Number(next).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </div>
                                    )}
                                  </>
                                );
                              })()}

                              {(entry as any).reference_number && (
                                <div className="text-sm text-gray-600 mb-2">
                                  <span className="font-medium">Referencia:</span> {(entry as any).reference_number}
                                </div>
                              )}

                              {(entry as any).notes && (
                                <div className="text-sm text-gray-600 mt-2 pt-2 border-t">
                                  <span className="font-medium">Notas:</span> {(entry as any).notes}
                                </div>
                              )}
                            </div>
                          );
                        } else if (movement.type === 'capital_payment') {
                          const entry = movement.data as LoanHistoryEntry;
                          
                          // Parsear old_value y new_value como JSON strings
                          let oldValues: any = {};
                          let newValues: any = {};
                          try {
                            if (entry.old_value) {
                              oldValues = typeof entry.old_value === 'string' ? JSON.parse(entry.old_value) : entry.old_value;
                            }
                            if (entry.new_value) {
                              newValues = typeof entry.new_value === 'string' ? JSON.parse(entry.new_value) : entry.new_value;
                            }
                          } catch (e) {
                            console.error('Error parseando valores del historial:', e);
                          }
                          
                          // Extraer información del abono de la descripción
                          const description = entry.description || '';
                          const capitalMatch = description.match(/Abono a capital: RD\$([\d,]+\.?\d*)/);
                          const capitalAmount = capitalMatch ? parseFloat(capitalMatch[1].replace(/,/g, '')) : (oldValues.capital_before && newValues.capital_after ? oldValues.capital_before - newValues.capital_after : 0);
                          
                          // Extraer información de penalidad de la descripción
                          const penaltyMatch = description.match(/Penalidad \(([\d.]+)%\): RD\$([\d,]+\.?\d*)/);
                          const penaltyPercentage = penaltyMatch ? penaltyMatch[1] : null;
                          const penaltyAmount = penaltyMatch ? parseFloat(penaltyMatch[2].replace(/,/g, '')) : 0;
                          const totalAmount = capitalAmount + penaltyAmount;
                          
                          return (
                            <div 
                              key={movement.id} 
                              className="border rounded-lg p-4 hover:bg-gray-50 transition-colors bg-green-50/30"
                            >
                              <div className="flex items-center gap-3 mb-2">
                                <CreditCard className="h-4 w-4 text-green-600" />
                                <span className="font-semibold">Abono a Capital: RD${capitalAmount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                {penaltyAmount > 0 && (
                                  <span className="text-sm text-orange-600">+ Penalidad: RD${penaltyAmount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                )}
                                <Badge variant="outline" className="bg-green-100 text-green-800">Abono a Capital</Badge>
                              </div>
                              
                              <div className="text-sm text-gray-600 mb-2">
                                <span className="font-medium">Fecha:</span>{' '}
                                {formatInTimeZone(
                                  new Date(entry.created_at),
                                  'America/Santo_Domingo',
                                  'dd MMM yyyy, hh:mm a'
                                )}
                              </div>

                              {totalAmount > 0 && (
                                <div className="text-sm text-gray-600 mb-2">
                                  <span className="font-medium">Total Pagado:</span> RD${totalAmount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                              )}

                              {oldValues.capital_before !== undefined && (
                                <div className="text-sm text-gray-600 mb-2">
                                  <span className="font-medium">Capital Antes:</span> RD${oldValues.capital_before.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                              )}

                              {newValues.capital_after !== undefined && (
                                <div className="text-sm text-gray-600 mb-2">
                                  <span className="font-medium">Capital Después:</span> RD${newValues.capital_after.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                              )}

                              {description && (
                                <div className="text-sm text-gray-600 mt-2 pt-2 border-t">
                                  <span className="font-medium">Detalles:</span> {description}
                                </div>
                              )}

                              <div className="flex items-center gap-2 mt-3 pt-3 border-t">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => printCapitalPaymentReceipt(entry, capitalAmount, penaltyAmount, oldValues, newValues)}
                                  className="flex items-center gap-2"
                                >
                                  <Printer className="h-4 w-4" />
                                  Imprimir Recibo
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => downloadCapitalPaymentReceipt(entry, capitalAmount, penaltyAmount, oldValues, newValues)}
                                  className="flex items-center gap-2"
                                >
                                  <Download className="h-4 w-4" />
                                  Descargar Recibo
                                </Button>
                              </div>
                            </div>
                          );
                        } else if (movement.type === 'remove_late_fee') {
                          const entry = movement.data as LoanHistoryEntry;
                          return (
                            <div 
                              key={movement.id} 
                              className="border rounded-lg p-4 hover:bg-gray-50 transition-colors bg-red-50/30"
                            >
                              <div className="flex items-center gap-3 mb-2">
                                <TrendingDown className="h-4 w-4 text-red-600" />
                                <span className="font-semibold">Mora Eliminada: RD${entry.amount?.toLocaleString()}</span>
                                <Badge variant="outline" className="bg-red-100 text-red-800">Eliminación de Mora</Badge>
                              </div>
                              
                              <div className="text-sm text-gray-600 mb-2">
                                <span className="font-medium">Fecha:</span>{' '}
                                {formatInTimeZone(
                                  new Date(entry.created_at),
                                  'America/Santo_Domingo',
                                  'dd MMM yyyy, hh:mm a'
                                )}
                              </div>

                              {(() => {
                                let oldValuesForLateFee: any = {};
                                let newValuesForLateFee: any = {};
                                
                                try {
                                  if (entry.old_values) {
                                    oldValuesForLateFee = typeof entry.old_values === 'string' 
                                      ? JSON.parse(entry.old_values) 
                                      : (entry.old_values || {});
                                  }
                                  if (entry.new_values) {
                                    newValuesForLateFee = typeof entry.new_values === 'string' 
                                      ? JSON.parse(entry.new_values) 
                                      : (entry.new_values || {});
                                  }
                                  if ((entry as any).old_value) {
                                    oldValuesForLateFee = typeof (entry as any).old_value === 'string' 
                                      ? JSON.parse((entry as any).old_value) 
                                      : ((entry as any).old_value || {});
                                  }
                                  if ((entry as any).new_value) {
                                    newValuesForLateFee = typeof (entry as any).new_value === 'string' 
                                      ? JSON.parse((entry as any).new_value) 
                                      : ((entry as any).new_value || {});
                                  }
                                } catch (e) {
                                  console.error('Error parseando valores para mora:', e);
                                }
                                
                                return (
                                  <>
                                    {oldValuesForLateFee && oldValuesForLateFee.current_late_fee !== undefined && (
                                <div className="text-sm text-gray-600 mb-2">
                                        <span className="font-medium">Mora Anterior:</span> RD${oldValuesForLateFee.current_late_fee.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                              )}

                                    {newValuesForLateFee && newValuesForLateFee.current_late_fee !== undefined && (
                                <div className="text-sm text-gray-600 mb-2">
                                        <span className="font-medium">Mora Nueva:</span> RD${newValuesForLateFee.current_late_fee.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                              )}
                                  </>
                                );
                              })()}

                              {entry.reason && (
                                <div className="text-sm text-gray-600 mb-2">
                                  <span className="font-medium">Razón:</span> {translateReason(entry.reason)}
                                </div>
                              )}

                              {(entry as any).notes && (
                                <div className="text-sm text-gray-600 mt-2 pt-2 border-t">
                                  <span className="font-medium">Notas:</span> {(entry as any).notes}
                                </div>
                              )}
                            </div>
                          );
                        }
                        return null;
                      })}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>

            {/* Historial de Cambios (excluyendo add_charge, remove_late_fee y capital_payment que ya están en movimientos) */}
            {history.filter(h => {
              const isCapitalPayment = h.change_type === 'capital_payment' || 
                (h.change_type === 'balance_adjustment' && h.description && h.description.includes('Abono a capital'));
              return h.change_type !== 'add_charge' && h.change_type !== 'remove_late_fee' && !isCapitalPayment;
            }).length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Edit className="h-5 w-5" />
                    Historial de Modificaciones ({history.filter(h => {
                      const isCapitalPayment = h.change_type === 'capital_payment' || 
                        (h.change_type === 'balance_adjustment' && h.description && h.description.includes('Abono a capital'));
                      return h.change_type !== 'add_charge' && h.change_type !== 'remove_late_fee' && !isCapitalPayment;
                    }).length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {history.filter(h => {
                      const isCapitalPayment = h.change_type === 'capital_payment' || 
                        (h.change_type === 'balance_adjustment' && h.description && h.description.includes('Abono a capital'));
                      return h.change_type !== 'add_charge' && h.change_type !== 'remove_late_fee' && !isCapitalPayment;
                    }).map((entry) => {
                      // Parsear old_value y new_value como JSON strings si es necesario
                      let oldValues: any = null;
                      let newValues: any = null;
                      
                      try {
                        // Si old_values/new_values son strings (JSON), parsearlos
                        // Si ya son objetos, usarlos directamente
                        // IMPORTANTE: Manejar null explícitamente
                        if (entry.old_values !== null && entry.old_values !== undefined) {
                          oldValues = typeof entry.old_values === 'string' 
                            ? JSON.parse(entry.old_values) 
                            : (entry.old_values || null);
                        }
                        if (entry.new_values !== null && entry.new_values !== undefined) {
                          newValues = typeof entry.new_values === 'string' 
                            ? JSON.parse(entry.new_values) 
                            : (entry.new_values || null);
                        }
                        // También verificar si vienen como old_value/new_value (singular) desde la DB
                        if ((entry as any).old_value !== null && (entry as any).old_value !== undefined) {
                          oldValues = typeof (entry as any).old_value === 'string' 
                            ? JSON.parse((entry as any).old_value) 
                            : ((entry as any).old_value || null);
                        }
                        if ((entry as any).new_value !== null && (entry as any).new_value !== undefined) {
                          newValues = typeof (entry as any).new_value === 'string' 
                            ? JSON.parse((entry as any).new_value) 
                            : ((entry as any).new_value || null);
                        }
                      } catch (e) {
                        console.error('Error parseando valores del historial:', e);
                        oldValues = null;
                        newValues = null;
                      }

                      // ✅ Si es "Agregar Cargo" (aunque venga como balance_adjustment),
                      // corregir los balances mostrados usando el cálculo acumulado (evita mostrar 244,000 otra vez).
                      const isAddChargeLike = (() => {
                        const t = String(entry.change_type || '').toLowerCase();
                        if (t === 'add_charge') return true;
                        const desc = String(entry.description || '').toLowerCase();
                        return t === 'balance_adjustment' && desc.includes('agregar cargo');
                      })();
                      if (isAddChargeLike) {
                        const computed = computedChargeBalancesById.get(entry.id);
                        if (computed) {
                          oldValues = { ...(oldValues || {}), balance: computed.prev };
                          newValues = { ...(newValues || {}), balance: computed.next };
                        }
                      }
                      
                      return (
                      <div key={entry.id} className="border rounded-lg p-4">
                        <div className="flex items-center gap-3 mb-2">
                          {getChangeTypeIcon(entry.change_type)}
                          <span className="font-semibold">{getChangeTypeLabelWithUpdateType(entry)}</span>
                          <span className="text-sm text-gray-500">
                            {formatInTimeZone(
                              new Date(entry.created_at),
                              'America/Santo_Domingo',
                              'dd MMM yyyy, hh:mm a'
                            )}
                          </span>
                        </div>
                        
                        {(() => {
                          // Extraer información de la descripción
                          const descInfo = extractDescriptionInfo(entry.description || '');
                          const displayReason = entry.reason || descInfo.reason;
                          const displayAmount = entry.amount || descInfo.amount;
                          
                          return (
                            <>
                              {displayReason && (
                                <div className="text-sm text-gray-600 mb-2">
                                  <span className="font-medium">Razón:</span> {translateReason(displayReason)}
                                </div>
                              )}

                              {/* Mostrar monto del cargo si existe */}
                              {entry.change_type === 'balance_adjustment' && entry.description?.includes('Agregar Cargo') && displayAmount && (
                                <div className="text-sm text-gray-600 mb-2">
                                  <span className="font-medium">Monto del Cargo:</span> RD${displayAmount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </div>
                              )}

                              {/* Mostrar meses/días/quincenas para extensión de plazo */}
                              {entry.change_type === 'term_extension' && (
                                <>
                                  {(() => {
                                    
                                    // Primero intentar obtener de la descripción (formato nuevo: "Extensión de Plazo: ... X meses agregados")
                                    if (descInfo.months && descInfo.months > 0) {
                                      return (
                                        <div className="text-sm text-gray-600 mb-2">
                                          <span className="font-medium">Meses Agregados:</span> {descInfo.months}
                                        </div>
                                      );
                                    }
                                    if (descInfo.quincenas && descInfo.quincenas > 0) {
                                      return (
                                        <div className="text-sm text-gray-600 mb-2">
                                          <span className="font-medium">Quincenas Agregadas:</span> {descInfo.quincenas}
                                        </div>
                                      );
                                    }
                                    if (descInfo.days && descInfo.days > 0) {
                                      return (
                                        <div className="text-sm text-gray-600 mb-2">
                                          <span className="font-medium">Días Agregados:</span> {descInfo.days}
                                        </div>
                                      );
                                    }
                                    
                                    // Segundo: calcular desde term_months en oldValues/newValues (para nuevas extensiones)
                                    if (oldValues && newValues && 
                                        oldValues.term_months !== undefined && newValues.term_months !== undefined &&
                                        typeof oldValues.term_months === 'number' && typeof newValues.term_months === 'number') {
                                      const monthsAdded = newValues.term_months - oldValues.term_months;
                                      if (monthsAdded > 0) {
                                        return (
                                          <div className="text-sm text-gray-600 mb-2">
                                            <span className="font-medium">Meses Agregados:</span> {monthsAdded}
                                          </div>
                                        );
                                      }
                                    }
                                    
                                    // Tercero: intentar extraer de descripción en formato antiguo "term_extension: ..." 
                                    // buscando números seguidos de palabras relacionadas con tiempo
                                    const timePattern = /(\d+)\s*(mes|día|semana|quincena)/i;
                                    const timeMatch = entry.description?.match(timePattern);
                                    if (timeMatch) {
                                      const amount = parseInt(timeMatch[1]);
                                      const unit = timeMatch[2].toLowerCase();
                                      if (unit.includes('mes')) {
                                        return (
                                          <div className="text-sm text-gray-600 mb-2">
                                            <span className="font-medium">Meses Agregados:</span> {amount}
                                          </div>
                                        );
                                      } else if (unit.includes('quincena')) {
                                        return (
                                          <div className="text-sm text-gray-600 mb-2">
                                            <span className="font-medium">Quincenas Agregadas:</span> {amount}
                                          </div>
                                        );
                                      } else if (unit.includes('día')) {
                                        return (
                                          <div className="text-sm text-gray-600 mb-2">
                                            <span className="font-medium">Días Agregados:</span> {amount}
                                          </div>
                                        );
                                      } else if (unit.includes('semana')) {
                                        return (
                                          <div className="text-sm text-gray-600 mb-2">
                                            <span className="font-medium">Semanas Agregadas:</span> {amount}
                                          </div>
                                        );
                                      }
                                    }
                                    
                                    // Si aún no se encontró, no mostrar nada (entrada antigua sin información disponible)
                                    return null;
                                  })()}
                                </>
                              )}

                              {entry.amount && !(entry.change_type === 'balance_adjustment' && entry.description?.includes('Agregar Cargo')) && (
                                <div className="text-sm text-gray-600 mb-2">
                                  <span className="font-medium">
                                    {entry.change_type === 'add_charge' ? 'Monto del Cargo:' :
                                     entry.change_type === 'remove_late_fee' ? 'Mora Eliminada:' :
                                     'Monto:'} 
                                  </span> ${entry.amount.toLocaleString()}
                                </div>
                              )}
                            </>
                          );
                        })()}

                        {/* Información específica para agregar cargo */}
                        {entry.change_type === 'add_charge' && (entry as any).charge_date && (
                          <div className="text-sm text-gray-600 mb-2">
                            <span className="font-medium">Fecha del Cargo:</span>{' '}
                            {new Date((entry as any).charge_date).toLocaleDateString('es-DO', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric'
                            })}
                          </div>
                        )}

                        {entry.change_type === 'add_charge' && (entry as any).reference_number && (
                          <div className="text-sm text-gray-600 mb-2">
                            <span className="font-medium">Referencia:</span> {(entry as any).reference_number}
                          </div>
                        )}

                        {/* Información específica para pagos (settle_loan) */}
                        {entry.change_type === 'payment' && (entry as any).charge_date && (
                          <div className="text-sm text-gray-600 mb-2">
                            <span className="font-medium">Fecha del Pago:</span>{' '}
                            {new Date((entry as any).charge_date).toLocaleDateString('es-DO', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric'
                            })}
                          </div>
                        )}

                        {entry.change_type === 'payment' && (entry as any).payment_method && (
                          <div className="text-sm text-gray-600 mb-2">
                            <span className="font-medium">Método de Pago:</span> {getPaymentMethodLabel((entry as any).payment_method)}
                          </div>
                        )}

                        {entry.change_type === 'payment' && (entry as any).reference_number && (
                          <div className="text-sm text-gray-600 mb-2">
                            <span className="font-medium">Referencia:</span> {(entry as any).reference_number}
                          </div>
                        )}

                        {/* Información específica para eliminar mora */}
                        {entry.change_type === 'remove_late_fee' && oldValues && oldValues.current_late_fee !== undefined && (
                          <div className="text-sm text-gray-600 mb-2">
                            <span className="font-medium">Mora Anterior:</span> RD${oldValues.current_late_fee.toLocaleString()}
                          </div>
                        )}

                        {entry.change_type === 'remove_late_fee' && newValues && newValues.current_late_fee !== undefined && (
                          <div className="text-sm text-gray-600 mb-2">
                            <span className="font-medium">Mora Nueva:</span> RD${newValues.current_late_fee.toLocaleString()}
                          </div>
                        )}

                        {(oldValues && typeof oldValues === 'object' && Object.keys(oldValues).length > 0) || (newValues && typeof newValues === 'object' && Object.keys(newValues).length > 0) ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="font-medium">Valores Anteriores:</span>
                            <ul className="list-disc list-inside ml-4 text-gray-600">
                                {oldValues && typeof oldValues === 'object' && oldValues.balance !== null && oldValues.balance !== undefined && (
                                  <li>Balance: ${oldValues.balance.toLocaleString()}</li>
                              )}
                                {oldValues && oldValues.payment && (
                                  <li>Cuota: ${oldValues.payment.toLocaleString()}</li>
                              )}
                                {oldValues && oldValues.rate && (
                                  <li>Tasa: {oldValues.rate}%</li>
                              )}
                                {oldValues && oldValues.current_late_fee !== undefined && entry.change_type !== 'remove_late_fee' && (
                                  <li>Mora: RD${oldValues.current_late_fee.toLocaleString()}</li>
                                )}
                                {(!oldValues || (typeof oldValues === 'object' && Object.keys(oldValues).length === 0)) && (
                                  <li className="text-gray-400">Sin valores anteriores</li>
                              )}
                            </ul>
                          </div>
                          <div>
                            <span className="font-medium">Valores Nuevos:</span>
                            <ul className="list-disc list-inside ml-4 text-gray-600">
                                {newValues && typeof newValues === 'object' && newValues.balance !== null && newValues.balance !== undefined && (
                                  <li>Balance: ${newValues.balance.toLocaleString()}</li>
                              )}
                                {newValues && newValues.payment && (
                                  <li>Cuota: ${newValues.payment.toLocaleString()}</li>
                              )}
                                {newValues && newValues.rate && (
                                  <li>Tasa: {newValues.rate}%</li>
                              )}
                                {newValues && newValues.current_late_fee !== undefined && entry.change_type !== 'remove_late_fee' && (
                                  <li>Mora: RD${newValues.current_late_fee.toLocaleString()}</li>
                                )}
                                {(!newValues || (typeof newValues === 'object' && Object.keys(newValues).length === 0)) && (
                                  <li className="text-gray-400">Sin valores nuevos</li>
                              )}
                            </ul>
                          </div>
                        </div>
                        ) : null}

                        {/* Mostrar notas si existen */}
                        {(entry as any).notes && (
                          <div className="text-sm text-gray-600 mt-2 pt-2 border-t">
                            <span className="font-medium">Notas:</span> {(entry as any).notes}
                          </div>
                        )}
                      </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="flex justify-end">
              <Button onClick={onClose}>Cerrar</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      
    </>
  );
};