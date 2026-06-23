
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLoanPaymentStatusSimple } from '@/hooks/useLoanPaymentStatusSimple';
import { useLateFee } from '@/hooks/useLateFee';
import { calculateLateFee as calculateLateFeeUtil, getDetailedLateFeeBreakdown, getOriginalLateFeeBreakdown, getFixedLateFeeBreakdown, applyLateFeePayment, calculateFixedLateFeeBreakdown } from '@/utils/lateFeeCalculator';
import { getLateFeeBreakdownFromInstallments } from '@/utils/installmentLateFeeCalculator';
import { getCurrentDateInSantoDomingo, getCurrentDateString } from '@/utils/dateUtils';
import { toast } from 'sonner';
import { ArrowLeft, DollarSign, AlertTriangle, Printer, Download } from 'lucide-react';
import { Search, User } from 'lucide-react';
import { formatCurrency, formatCurrencyNumber } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { generateLoanPaymentReceipt, openWhatsApp } from '@/utils/whatsappReceipt';
import { formatDateStringForSantoDomingo } from '@/utils/dateUtils';
import { getLoanBalanceBreakdown } from '@/utils/loanBalanceBreakdown';

const paymentSchema = z.object({
  loan_id: z.string().min(1, 'Debe seleccionar un préstamo'),
  amount: z.number().min(0, 'El monto no puede ser negativo'),
  payment_method: z.string().min(1, 'Debe seleccionar un método de pago'),
  reference_number: z.string().optional(),
  notes: z.string().optional(),
  late_fee_amount: z.number().min(0).optional(),
}).refine((data) => {
  // Validar que al menos uno de los montos (cuota o mora) sea mayor a 0
  return data.amount > 0 || (data.late_fee_amount && data.late_fee_amount > 0);
}, {
  message: "Debe pagar al menos algo de la cuota o de la mora"
}).superRefine((data, ctx) => {
  // Esta validación se aplicará dinámicamente en el componente
  // cuando nextPaymentInfo esté disponible
});

type PaymentFormData = z.infer<typeof paymentSchema>;

interface Loan {
  id: string;
  amount: number;
  remaining_balance: number;
  monthly_payment: number;
  next_payment_date: string;
  first_payment_date?: string; // Fecha de la primera cuota (BASE FIJA que nunca cambia)
  start_date?: string;
  interest_rate: number;
  term_months?: number;
  payment_frequency?: string;
  amortization_type?: string; // Tipo de amortización (indefinite, simple, etc.)
  late_fee_enabled?: boolean;
  late_fee_rate?: number;
  grace_period_days?: number;
  max_late_fee?: number;
  late_fee_calculation_type?: 'daily' | 'monthly' | 'compound';
  current_late_fee?: number;
  paid_installments?: number[];
  client: {
    full_name: string;
    dni: string;
    phone?: string;
  };
}

export const PaymentForm = ({ onBack, preselectedLoan, onPaymentSuccess }: { 
  onBack: () => void; 
  preselectedLoan?: Loan;
  onPaymentSuccess?: () => void;
}) => {
  const navigate = useNavigate();
  
  // Función helper para redondear a 2 decimales de forma precisa
  const roundToTwoDecimals = (value: number): number => {
    // Usar toFixed para evitar problemas de precisión de punto flotante
    return parseFloat(value.toFixed(2));
  };
  
  // Detectar si es dispositivo móvil
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
  
  const [loans, setLoans] = useState<Loan[]>([]);
  const [filteredLoans, setFilteredLoans] = useState<Loan[]>([]);
  const [loanSearch, setLoanSearch] = useState('');
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  // Balance pendiente (igual a Detalles): capital + interés (SIN cargos)
  const [computedBalancePending, setComputedBalancePending] = useState<number | null>(null);
  // Cargos pendientes (para límite máximo si aplica)
  const [computedPendingCharges, setComputedPendingCharges] = useState<number>(0);
  const [showLoanDropdown, setShowLoanDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentDistribution, setPaymentDistribution] = useState<any>(null);
  const [lateFeeAmount, setLateFeeAmount] = useState<number>(0);
  const [lateFeeCalculation, setLateFeeCalculation] = useState<any>(null);
  const [lateFeeBreakdown, setLateFeeBreakdown] = useState<any>(null);
  const [originalLateFeeBreakdown, setOriginalLateFeeBreakdown] = useState<any>(null);
  const [appliedLateFeePayment, setAppliedLateFeePayment] = useState<number>(0);
  const [companySettings, setCompanySettings] = useState<any>(null);
  const [pendingInterestForIndefinite, setPendingInterestForIndefinite] = useState<number>(0);
  const [showWhatsAppDialog, setShowWhatsAppDialog] = useState(false);
  const [showPrintFormatModal, setShowPrintFormatModal] = useState(false);
  const [lastPaymentData, setLastPaymentData] = useState<any>(null);
  const [isClosingPrintModal, setIsClosingPrintModal] = useState(false);
  const { user, companyId } = useAuth();
  const { paymentStatus, refetch: refetchPaymentStatus, isReady: paymentStatusReady } = useLoanPaymentStatusSimple(selectedLoan);
  const { calculateLateFee } = useLateFee();

  // ✅ CORRECCIÓN: Para plazo fijo, recomputar balance pendiente desde el plan real de cuotas (installments)
  // y pagos por due_date (interest primero). No depender de `loan.total_amount` ni de `remaining_balance`.
  useEffect(() => {
    if (!selectedLoan?.id) return;
    let cancelled = false;

    const recompute = async () => {
      try {
        const breakdown = await getLoanBalanceBreakdown(supabase as any, selectedLoan as any);
        if (cancelled) return;
        setComputedBalancePending(breakdown.baseBalance);
        setComputedPendingCharges(breakdown.pendingCharges);
      } catch (e) {
        console.warn('PaymentForm: no se pudo recalcular balance pendiente', e);
        setComputedBalancePending(null);
        setComputedPendingCharges(0);
      }
    };

    recompute();
    return () => {
      cancelled = true;
    };
  }, [selectedLoan?.id, (selectedLoan as any)?.amortization_type]);
  
  // Ref para evitar recrear listeners innecesariamente
  const realtimeChannelRef = useRef<any>(null);
  const isUserEditingAmountRef = useRef<boolean>(false);
  const [isAmountLoading, setIsAmountLoading] = useState(false);

  // Función para generar el HTML del recibo según el formato
  const generateReceiptHTMLWithFormat = (format: string = 'LETTER'): string => {
    if (!lastPaymentData || !selectedLoan) return '';
    
    const payment = lastPaymentData.payment;
    const loan = lastPaymentData.loan;
    const client = loan.client;
    
    const getPaymentMethodLabel = (method: string) => {
      const methods: { [key: string]: string } = {
        cash: 'Efectivo',
        bank_transfer: 'Transferencia',
        check: 'Cheque',
        card: 'Tarjeta',
        online: 'En línea'
      };
      return methods[method] || method;
    };

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
              width: 100% !important;
              min-width: 100% !important;
            }
            .receipt-container {
              width: 100% !important;
              max-width: none !important;
              margin: 0 !important;
              padding: 5px !important;
              min-width: 100% !important;
            }
            .header { text-align: center; margin-bottom: 10px; width: 100%; }
            .receipt-title { font-size: 14px; font-weight: bold; margin-bottom: 5px; }
            .receipt-number { font-size: 10px; }
            .section { margin-bottom: 10px; width: 100%; }
            .section-title { font-weight: bold; font-size: 11px; margin-bottom: 5px; text-decoration: underline; }
            .info-row { margin-bottom: 3px; font-size: 10px; width: 100%; }
            .amount-section { margin: 10px 0; width: 100%; }
            .total-amount { font-size: 14px; font-weight: bold; text-align: center; margin-top: 10px; }
            .footer { margin-top: 15px; text-align: center; font-size: 9px; width: 100%; }
            @media print { 
              * { box-sizing: border-box; }
              body { 
                margin: 0 !important; 
                padding: 0 !important; 
                width: 100% !important;
                min-width: 100% !important;
              }
              .receipt-container { 
                border: none; 
                width: 100% !important; 
                max-width: none !important; 
                margin: 0 !important;
                min-width: 100% !important;
              }
              @page { 
                margin: 0 !important; 
                size: auto !important;
              }
            }
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
              color: #000;
              width: 100% !important;
              min-width: 100% !important;
            }
            .receipt-container {
              width: 100% !important;
              max-width: none !important;
              margin: 0 !important;
              padding: 8px !important;
              min-width: 100% !important;
            }
            .header { text-align: center; margin-bottom: 15px; width: 100%; }
            .receipt-title { font-size: 16px; font-weight: bold; margin-bottom: 8px; }
            .receipt-number { font-size: 12px; }
            .section { margin-bottom: 15px; width: 100%; }
            .section-title { font-weight: bold; font-size: 13px; margin-bottom: 8px; text-decoration: underline; }
            .info-row { margin-bottom: 4px; font-size: 12px; width: 100%; }
            .amount-section { margin: 15px 0; width: 100%; }
            .total-amount { font-size: 16px; font-weight: bold; text-align: center; margin-top: 15px; }
            .footer { margin-top: 20px; text-align: center; font-size: 10px; width: 100%; }
            @media print { 
              * { box-sizing: border-box; }
              body { 
                margin: 0 !important; 
                padding: 0 !important; 
                width: 100% !important;
                min-width: 100% !important;
              }
              .receipt-container { 
                border: none; 
                width: 100% !important; 
                max-width: none !important; 
                margin: 0 !important;
                min-width: 100% !important;
              }
              @page { 
                margin: 0 !important; 
                size: auto !important;
              }
            }
          `;
        
        case 'LETTER':
          return `
            body { 
              font-family: Arial, sans-serif; 
              margin: 20px; 
              line-height: 1.6;
              color: #333;
            }
            .receipt-container {
              max-width: 8.5in;
              margin: 0 auto;
              padding: 30px;
              border: 1px solid #ddd;
              border-radius: 8px;
            }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
            .receipt-title { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
            .receipt-number { font-size: 14px; color: #666; }
            .section { margin-bottom: 25px; }
            .section-title { font-weight: bold; font-size: 16px; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 5px; }
            .info-row { display: flex; justify-content: space-between; margin-bottom: 8px; }
            .amount-section { background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .total-amount { font-size: 20px; font-weight: bold; color: #28a745; text-align: center; margin-top: 10px; }
            .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #eee; padding-top: 20px; }
            @media print { 
              body { margin: 0; }
              .receipt-container { border: none; max-width: 8.5in; }
            }
          `;
        
        case 'A4':
          return `
            body { 
              font-family: Arial, sans-serif; 
              margin: 20px; 
              line-height: 1.6;
              color: #333;
            }
            .receipt-container {
              max-width: 210mm;
              margin: 0 auto;
              padding: 30px;
              border: 1px solid #ddd;
              border-radius: 8px;
            }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
            .receipt-title { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
            .receipt-number { font-size: 14px; color: #666; }
            .section { margin-bottom: 25px; }
            .section-title { font-weight: bold; font-size: 16px; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 5px; }
            .info-row { display: flex; justify-content: space-between; margin-bottom: 8px; }
            .amount-section { background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .total-amount { font-size: 20px; font-weight: bold; color: #28a745; text-align: center; margin-top: 10px; }
            .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #eee; padding-top: 20px; }
            @media print { 
              body { margin: 0; }
              .receipt-container { border: none; max-width: 210mm; }
            }
          `;
        
        default:
          return '';
      }
    };

    const getFormatTitle = (format: string) => {
      switch (format) {
        case 'POS58': return 'RECIBO DE PAGO - POS58';
        case 'POS80': return 'RECIBO DE PAGO - POS80';
        case 'LETTER': return 'RECIBO DE PAGO';
        case 'A4': return 'RECIBO DE PAGO';
        default: return 'RECIBO DE PAGO';
      }
    };

    return `
      <html>
        <head>
          <title>${getFormatTitle(format)} - ${client?.full_name || ''}</title>
          <style>
            ${getFormatStyles(format)}
          </style>
        </head>
        <body>
          <div class="receipt-container">
            <div class="header">
              ${companySettings ? `
                <div style="margin-bottom: 15px; text-align: center;">
                  <div style="font-size: ${format.includes('POS') ? '14px' : '18px'}; font-weight: bold; margin-bottom: 5px;">
                    ${companySettings.company_name || 'LA EMPRESA'}
                  </div>
                  ${companySettings.address ? `<div style="font-size: ${format.includes('POS') ? '9px' : '11px'}; margin-bottom: 2px;">${companySettings.address}</div>` : ''}
                  ${companySettings.tax_id ? `<div style="font-size: ${format.includes('POS') ? '9px' : '11px'}; margin-bottom: 5px;">RNC: ${companySettings.tax_id}</div>` : ''}
                </div>
                <hr style="border: none; border-top: 1px solid #000; margin: 10px 0;">
              ` : ''}
              <div class="receipt-title">${getFormatTitle(format)}</div>
              <div class="receipt-number">Recibo #${payment.id.slice(0, 8).toUpperCase()}</div>
              <div style="margin-top: 10px; font-size: ${format.includes('POS') ? '10px' : '14px'};">
                ${new Date(payment.created_at || payment.payment_date || lastPaymentData.paymentDate).toLocaleDateString('es-ES', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </div>
            </div>

            <div class="section">
              <div class="section-title">INFORMACIÓN DEL CLIENTE</div>
              <div class="info-row">
                <span>Nombre: ${client?.full_name || 'N/A'}</span>
              </div>
              <div class="info-row">
                <span>Cédula: ${client?.dni || 'N/A'}</span>
              </div>
              ${client?.phone ? `<div class="info-row"><span>Teléfono: ${client.phone}</span></div>` : ''}
            </div>

            <div class="section">
              <div class="section-title">DETALLES DEL PRÉSTAMO</div>
              <div class="info-row">
                <span>Monto Original: RD$${loan.amount.toLocaleString()}</span>
              </div>
              <div class="info-row">
                <span>Tasa de Interés: ${loan.interest_rate}%</span>
              </div>
            </div>

            <div class="section">
              <div class="section-title">DETALLES DEL PAGO</div>
              <div class="info-row">
                <span>Fecha de Pago: ${lastPaymentData.paymentDate || payment.payment_date}</span>
              </div>
              <div class="info-row">
                <span>Método de Pago: ${getPaymentMethodLabel(lastPaymentData.paymentMethod || payment.payment_method)}</span>
              </div>
              ${lastPaymentData.referenceNumber || payment.reference_number ? `<div class="info-row"><span>Referencia: ${lastPaymentData.referenceNumber || payment.reference_number}</span></div>` : ''}
            </div>

            <div class="amount-section">
              <div class="section-title">DESGLOSE DEL PAGO</div>
              <div class="info-row">
                <span>Pago a Principal: RD$${(lastPaymentData.principalPayment || payment.principal_amount || 0).toLocaleString()}</span>
              </div>
              <div class="info-row">
                <span>Pago a Intereses: RD$${(lastPaymentData.interestAmount || payment.interest_amount || 0).toLocaleString()}</span>
              </div>
              ${(lastPaymentData.lateFeeAmount || payment.late_fee || 0) > 0 ? `<div class="info-row"><span>Cargo por Mora: RD$${(lastPaymentData.lateFeeAmount || payment.late_fee || 0).toLocaleString()}</span></div>` : ''}
              <div class="total-amount">
                TOTAL: RD$${payment.amount.toLocaleString()}
              </div>
            </div>

            <div class="footer">
              <p>Este documento es un comprobante oficial de pago.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  };

  // Función helper para cerrar el modal de impresión y mostrar el diálogo de WhatsApp
  // Función helper para cerrar el modal de WhatsApp y el formulario
  const handleCloseWhatsAppDialog = (showRedirectToast: boolean = true) => {
    setShowWhatsAppDialog(false);
    // Cerrar el formulario después de cancelar o enviar
    if (isMobile) {
      if (showRedirectToast) {
        toast.success('Redirigiendo a Cobro Rápido...');
      }
      setTimeout(() => {
        navigate('/cobro-rapido');
      }, 1000);
    } else {
      onBack();
    }
  };

  const sendWhatsAppDirectly = async () => {
    if (!lastPaymentData) return;
    
    // Obtener el teléfono del cliente si no está disponible
    let clientPhone = lastPaymentData?.loan?.client?.phone;
    
    if (!clientPhone && lastPaymentData?.loan?.id) {
      try {
        const { data: loanData } = await supabase
          .from('loans')
          .select('client_id')
          .eq('id', lastPaymentData.loan.id)
          .single();
        
        if (loanData?.client_id) {
          const { data: clientData } = await supabase
            .from('clients')
            .select('phone')
            .eq('id', loanData.client_id)
            .maybeSingle();
          
          if (clientData?.phone) {
            clientPhone = clientData.phone;
          }
        }
      } catch (error) {
        console.error('Error obteniendo teléfono del cliente:', error);
      }
    }
    
    if (!clientPhone) {
      toast.error('No se encontró el número de teléfono del cliente.');
      return;
    }

    try {
      const companyName = companySettings?.company_name || 'LA EMPRESA';
      const receiptMessage = generateLoanPaymentReceipt({
        companyName,
        clientName: lastPaymentData.loan.client.full_name,
        clientDni: lastPaymentData.loan.client.dni,
        paymentDate: lastPaymentData.paymentDate,
        paymentAmount: lastPaymentData.payment.amount + (lastPaymentData.lateFeeAmount || 0),
        principalAmount: lastPaymentData.principalPayment,
        interestAmount: lastPaymentData.interestAmount || lastPaymentData.interestPayment || 0,
        lateFeeAmount: lastPaymentData.lateFeeAmount > 0 ? lastPaymentData.lateFeeAmount : undefined,
        paymentMethod: lastPaymentData.paymentMethod,
        loanAmount: lastPaymentData.loan.amount,
        remainingBalance: lastPaymentData.remainingBalance,
        interestRate: lastPaymentData.loan.interest_rate,
        nextPaymentDate: lastPaymentData.nextPaymentDate,
        referenceNumber: lastPaymentData.referenceNumber
      });

      openWhatsApp(clientPhone, receiptMessage);
      toast.success('Abriendo WhatsApp...');
    } catch (error: any) {
      console.error('Error abriendo WhatsApp:', error);
      toast.error(error.message || 'Error al abrir WhatsApp');
    }
  };

  const handleClosePrintModalAndShowWhatsApp = (action?: () => void) => {
    setIsClosingPrintModal(true);
    // Ejecutar la acción primero si existe
    if (action) {
      action();
    }
    // Cerrar el modal
    setShowPrintFormatModal(false);
    
    // Verificar si debe preguntar antes de enviar
    const askBeforeSend = companySettings?.ask_whatsapp_before_send !== false; // Por defecto true
    
    setTimeout(() => {
      if (askBeforeSend) {
        // Mostrar el diálogo de WhatsApp
        setShowWhatsAppDialog(true);
      } else {
        // Enviar directamente a WhatsApp
        sendWhatsAppDirectly();
      }
      setIsClosingPrintModal(false);
    }, 300);
  };

  const printReceipt = (format: string = 'LETTER') => {
    if (!lastPaymentData || !selectedLoan) return;
    
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      const receiptHTML = generateReceiptHTMLWithFormat(format);
      printWindow.document.write(receiptHTML);
      printWindow.document.close();
      printWindow.print();
    }
  };

  const downloadReceipt = (format: string = 'LETTER') => {
    if (!lastPaymentData || !selectedLoan) return;
    
    const receiptHTML = generateReceiptHTMLWithFormat(format);
    const client = lastPaymentData.loan.client;

    const blob = new Blob([receiptHTML], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recibo_${client.full_name.replace(/\s+/g, '_')}_${new Date(lastPaymentData.paymentDate || lastPaymentData.payment.payment_date).toISOString().split('T')[0]}_${format}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Función para generar el HTML del recibo
  const generateReceiptHTML = (loan: any, payment: any, companySettings: any): string => {
    const client = loan.clients || loan.client;
    const getPaymentMethodLabel = (method: string) => {
      const methods: { [key: string]: string } = {
        cash: 'Efectivo',
        bank_transfer: 'Transferencia',
        check: 'Cheque',
        card: 'Tarjeta',
        online: 'En línea'
      };
      return methods[method] || method;
    };

    return `
      <html>
        <head>
          <title>RECIBO DE PAGO - ${client?.full_name || ''}</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              margin: 20px; 
              line-height: 1.6;
              color: #333;
            }
            .receipt-container {
              max-width: 8.5in;
              margin: 0 auto;
              padding: 30px;
              border: 1px solid #ddd;
              border-radius: 8px;
            }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
            .receipt-title { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
            .receipt-number { font-size: 14px; color: #666; }
            .section { margin-bottom: 25px; }
            .section-title { font-weight: bold; font-size: 16px; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 5px; }
            .info-row { display: flex; justify-content: space-between; margin-bottom: 8px; }
            .amount-section { background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .total-amount { font-size: 20px; font-weight: bold; color: #28a745; text-align: center; margin-top: 10px; }
            .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #eee; padding-top: 20px; }
          </style>
        </head>
        <body>
          <div class="receipt-container">
            <div class="header">
              ${companySettings ? `
                <div style="margin-bottom: 15px; text-align: center;">
                  <div style="font-size: 18px; font-weight: bold; margin-bottom: 5px;">
                    ${companySettings.company_name || 'LA EMPRESA'}
                  </div>
                  ${companySettings.address ? `<div style="font-size: 11px; margin-bottom: 2px;">${companySettings.address}</div>` : ''}
                  ${companySettings.tax_id ? `<div style="font-size: 11px; margin-bottom: 5px;">RNC: ${companySettings.tax_id}</div>` : ''}
                </div>
                <hr style="border: none; border-top: 1px solid #000; margin: 10px 0;">
              ` : ''}
              <div class="receipt-title">RECIBO DE PAGO</div>
              <div class="receipt-number">Recibo #${payment.id.slice(0, 8).toUpperCase()}</div>
              <div style="margin-top: 10px; font-size: 14px;">
                ${new Date(payment.created_at || payment.payment_date).toLocaleDateString('es-ES', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </div>
            </div>

            <div class="section">
              <div class="section-title">INFORMACIÓN DEL CLIENTE</div>
              <div class="info-row">
                <span>Nombre: ${client?.full_name || 'N/A'}</span>
              </div>
              <div class="info-row">
                <span>Cédula: ${client?.dni || 'N/A'}</span>
              </div>
              ${client?.phone ? `<div class="info-row"><span>Teléfono: ${client.phone}</span></div>` : ''}
            </div>

            <div class="section">
              <div class="section-title">DETALLES DEL PRÉSTAMO</div>
              <div class="info-row">
                <span>Monto Original: RD$${loan.amount.toLocaleString()}</span>
              </div>
              <div class="info-row">
                <span>Tasa de Interés: ${loan.interest_rate}%</span>
              </div>
            </div>

            <div class="section">
              <div class="section-title">DETALLES DEL PAGO</div>
              <div class="info-row">
                <span>Fecha de Pago: ${payment.payment_date}</span>
              </div>
              <div class="info-row">
                <span>Método de Pago: ${getPaymentMethodLabel(payment.payment_method)}</span>
              </div>
              ${payment.reference_number ? `<div class="info-row"><span>Referencia: ${payment.reference_number}</span></div>` : ''}
            </div>

            <div class="amount-section">
              <div class="section-title">DESGLOSE DEL PAGO</div>
              <div class="info-row">
                <span>Pago a Principal: RD$${(payment.principal_amount || 0).toLocaleString()}</span>
              </div>
              <div class="info-row">
                <span>Pago a Intereses: RD$${(payment.interest_amount || 0).toLocaleString()}</span>
              </div>
              ${payment.late_fee > 0 ? `<div class="info-row"><span>Cargo por Mora: RD$${payment.late_fee.toLocaleString()}</span></div>` : ''}
              <div class="total-amount">
                TOTAL: RD$${payment.amount.toLocaleString()}
              </div>
            </div>

            ${payment.notes ? `
            <div class="section">
              <div class="section-title">NOTAS</div>
              <div style="background-color: #f8f9fa; padding: 10px; border-radius: 5px;">
                ${payment.notes}
              </div>
            </div>
            ` : ''}

            <div class="footer">
              <p>Este documento es un comprobante oficial de pago.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  };

  // Función para obtener pagos de mora previos
  const getPreviousLateFeePayments = async (loanId: string) => {
    try {
      const { data, error } = await supabase
        .from('payments')
        .select('late_fee')
        .eq('loan_id', loanId)
        .not('late_fee', 'is', null);

      if (error) throw error;
      
      const totalPaidLateFee = data?.reduce((sum, payment) => sum + (payment.late_fee || 0), 0) || 0;
      console.log('🔍 PaymentForm: Pagos de mora previos:', totalPaidLateFee);
      return totalPaidLateFee;
    } catch (error) {
      console.error('Error obteniendo pagos de mora previos:', error);
      return 0;
    }
  };

  // Función para detectar cuotas pagadas automáticamente
  const getPaidInstallments = async (loan: Loan) => {
    try {
      console.log('🔍 PaymentForm: Detectando cuotas pagadas para loan:', loan.id);
      
      const { data: payments, error } = await supabase
        .from('payments')
        .select('principal_amount, payment_date')
        .eq('loan_id', loan.id)
        .order('payment_date', { ascending: true });

      if (error) {
        console.error('Error obteniendo pagos:', error);
        return [];
      }

      if (!payments || payments.length === 0) {
        console.log('🔍 PaymentForm: No hay pagos encontrados');
        return [];
      }

      console.log('🔍 PaymentForm: Pagos encontrados:', payments);

      // Calcular el capital por cuota (misma fórmula que LateFeeInfo)
      // Fórmula correcta: interés fijo por cuota = (monto_total * tasa_interés) / 100
      const fixedInterestPerPayment = (loan.amount * loan.interest_rate) / 100;
      const principalPerPayment = loan.monthly_payment - fixedInterestPerPayment;
      
      console.log('🔍 PaymentForm: Cálculos base:', {
        principalPerPayment,
        monthlyPayment: loan.monthly_payment,
        interestRate: loan.interest_rate,
        fixedInterestPerPayment
      });
      
      console.log('🔍 PaymentForm: DEBUG - Verificando cálculo de capital:', {
        amount: loan.amount,
        interestRate: loan.interest_rate,
        fixedInterestPerPayment: (loan.amount * loan.interest_rate) / 100,
        monthlyPayment: loan.monthly_payment,
        principalPerPayment: loan.monthly_payment - ((loan.amount * loan.interest_rate) / 100)
      });

      // Detectar cuotas completas basándose en pagos de capital (misma lógica que LateFeeInfo)
      const paidInstallments: number[] = [];
      let totalPrincipalPaid = 0;
      let installmentNumber = 1;

      for (const payment of payments) {
        const principalPaid = payment.principal_amount || 0;
        totalPrincipalPaid += principalPaid;
        
        console.log(`🔍 PaymentForm: Pago ${payment.payment_date}:`, {
          principalPaid,
          totalPrincipalPaid,
          installmentNumber,
          principalPerPayment
        });

        // Si se ha pagado suficiente capital para una cuota completa
        while (totalPrincipalPaid >= principalPerPayment && installmentNumber <= 4) {
          paidInstallments.push(installmentNumber);
          totalPrincipalPaid -= principalPerPayment;
          installmentNumber++;
          
          console.log(`🔍 PaymentForm: Cuota ${installmentNumber - 1} completada`);
          console.log(`🔍 PaymentForm: DEBUG - Estado después de completar cuota:`, {
            cuotaCompletada: installmentNumber - 1,
            totalPrincipalPaidRestante: totalPrincipalPaid,
            installmentNumberSiguiente: installmentNumber,
            paidInstallments: [...paidInstallments]
          });
        }
      }

      console.log('🔍 PaymentForm: Cuotas pagadas detectadas:', paidInstallments);
      console.log('🔍 PaymentForm: Total capital pagado:', totalPrincipalPaid);
      
      return paidInstallments;
    } catch (error) {
      console.error('Error detectando cuotas pagadas:', error);
      return [];
    }
  };

  // Función para calcular la mora del préstamo usando la función que considera pagos parciales
  const calculateLoanLateFee = async (loan: Loan) => {
    try {
      console.log('🔍 PaymentForm: Calculando mora usando getLateFeeBreakdownFromInstallments...');
      
      // Preparar los datos del préstamo para la función
      const loanData = {
        id: loan.id,
        remaining_balance: loan.remaining_balance,
        next_payment_date: loan.next_payment_date,
        late_fee_rate: loan.late_fee_rate || 0,
        grace_period_days: loan.grace_period_days || 0,
        max_late_fee: loan.max_late_fee || 0,
        late_fee_calculation_type: loan.late_fee_calculation_type || 'daily',
        late_fee_enabled: loan.late_fee_enabled || false,
        amount: loan.amount,
        term: loan.term_months || 4,
        payment_frequency: loan.payment_frequency || 'monthly',
        interest_rate: loan.interest_rate,
        monthly_payment: loan.monthly_payment,
        start_date: loan.start_date,
        amortization_type: loan.amortization_type
      };
      
      console.log('🔍 PaymentForm: Datos del préstamo:', loanData);
      
      // USAR LA FUNCIÓN CORRECTA QUE CONSIDERA PAGOS PARCIALES
      const breakdown = await getLateFeeBreakdownFromInstallments(loan.id, loanData);
      
      console.log('🔍 PaymentForm: Desglose obtenido:', breakdown);
      console.log('🔍 PaymentForm: Total mora (considerando pagos parciales):', breakdown.totalLateFee);
      
      // Configurar el estado con el desglose correcto
      setOriginalLateFeeBreakdown(breakdown);
      setLateFeeAmount(roundToTwoDecimals(breakdown.totalLateFee));
      
      // Encontrar la próxima cuota pendiente de pago para mostrar sus días de atraso
      console.log('🔍 PaymentForm: Desglose completo para encontrar próxima cuota:', breakdown.breakdown);
      
      // Buscar la próxima cuota pendiente aunque NO tenga mora (lateFee puede ser 0).
      // El filtro anterior (!isPaid && lateFee > 0) devolvía undefined en préstamos al día.
      const nextUnpaidInstallment = breakdown.breakdown.find(item => !item.isPaid);
      console.log('🔍 PaymentForm: Próxima cuota pendiente encontrada:', nextUnpaidInstallment);
      
      const daysOverdueForNextUnpaid = nextUnpaidInstallment ? nextUnpaidInstallment.daysOverdue : 0;
      console.log('🔍 PaymentForm: Días de atraso para mostrar:', daysOverdueForNextUnpaid);
      
      setLateFeeCalculation({
        days_overdue: daysOverdueForNextUnpaid,
        late_fee_amount: breakdown.totalLateFee,
        total_late_fee: breakdown.totalLateFee
      });
      setLateFeeBreakdown(breakdown);
      
      console.log('🔍 PaymentForm: Estado actualizado correctamente');
    } catch (error) {
      console.error('Error calculating late fee:', error);
      setLateFeeAmount(0);
      setLateFeeCalculation(null);
      setLateFeeBreakdown(null);
      setOriginalLateFeeBreakdown(null);
      setAppliedLateFeePayment(0);
    }
  };

  // Función para calcular cuánto interés ya se ha pagado en la cuota actual
  const calculatePaidInterestForCurrentPayment = async (loanId: string) => {
    if (!loanId) return 0;
    
    try {
      // Obtener todos los pagos del préstamo ordenados por fecha
      console.log('🔍 Consultando pagos para préstamo ID:', loanId);
      const { data: payments, error } = await supabase
        .from('payments')
        .select('interest_amount, payment_date, amount, principal_amount')
        .eq('loan_id', loanId)
        .order('payment_date', { ascending: true });

      if (error) {
        console.error('❌ Error al obtener pagos:', error);
        return 0;
      }

      if (!payments || payments.length === 0) {
        console.log('🔍 No hay pagos para el préstamo');
        return 0;
      }

      console.log('🔍 TODOS LOS PAGOS ENCONTRADOS:', payments);
      console.log('🔍 Número de pagos:', payments.length);
      
      // Verificar si los pagos tienen interest_amount
      const paymentsWithInterest = payments.filter(p => p.interest_amount > 0);
      console.log('🔍 Pagos con interés > 0:', paymentsWithInterest.length);
      console.log('🔍 Total interés en BD:', payments.reduce((sum, p) => sum + (p.interest_amount || 0), 0));

      // Calcular el interés fijo por cuota
      const { data: loan } = await supabase
        .from('loans')
        .select('amount, interest_rate')
        .eq('id', loanId)
        .single();

      if (!loan) return 0;

      const fixedInterestPerPayment = (loan.amount * loan.interest_rate) / 100;
      console.log('🔍 Interés fijo por cuota:', fixedInterestPerPayment);

      // Calcular cuántas cuotas se han completado y el estado actual de la cuota en progreso
      let totalInterestPaid = 0;
      let totalPrincipalPaid = 0;
      let completedInstallments = 0;
      let currentInstallmentInterestPaid = 0;
      let currentInstallmentPrincipalPaid = 0;

      // Obtener el capital fijo por cuota
      const { data: loanDetails } = await supabase
        .from('loans')
        .select('monthly_payment')
        .eq('id', loanId)
        .single();
      
      const monthlyPayment = loanDetails?.monthly_payment || 0;
      const fixedPrincipalPerPayment = monthlyPayment - fixedInterestPerPayment;
      
      console.log('🔍 Datos del préstamo obtenidos:', {
        monthlyPayment,
        fixedInterestPerPayment,
        fixedPrincipalPerPayment
      });
      
      console.log('🔍 Capital fijo por cuota:', fixedPrincipalPerPayment);
      console.log('🔍 Cuota mensual total:', monthlyPayment);

      // Simular el proceso de pagos para determinar el estado de la cuota actual
      for (let i = 0; i < payments.length; i++) {
        const payment = payments[i];
        const paymentInterest = payment.interest_amount || 0;
        const paymentPrincipal = payment.principal_amount || 0;
        
        console.log(`🔍 Procesando pago ${i + 1}:`, {
          fecha: payment.payment_date,
          monto_total: payment.amount,
          interes_pagado: paymentInterest,
          capital_pagado: paymentPrincipal
        });
        
        totalInterestPaid += paymentInterest;
        totalPrincipalPaid += paymentPrincipal;
        
        console.log(`🔍 ANTES del pago ${i + 1}:`);
        console.log(`🔍 - currentInstallmentInterestPaid: ${currentInstallmentInterestPaid}`);
        console.log(`🔍 - currentInstallmentPrincipalPaid: ${currentInstallmentPrincipalPaid}`);
        console.log(`🔍 - paymentInterest: ${paymentInterest}`);
        console.log(`🔍 - paymentPrincipal: ${paymentPrincipal}`);
        
        // Verificar si este pago completa la cuota actual
        const newInterestPaid = currentInstallmentInterestPaid + paymentInterest;
        const newPrincipalPaid = currentInstallmentPrincipalPaid + paymentPrincipal;
        
        if (newInterestPaid >= fixedInterestPerPayment && newPrincipalPaid >= fixedPrincipalPerPayment) {
          // Esta cuota está completamente pagada
          completedInstallments++;
          currentInstallmentInterestPaid = 0;
          currentInstallmentPrincipalPaid = 0;
          
          console.log('🔍 ✅ Cuota completamente pagada en pago', i + 1, 'Cuotas completadas:', completedInstallments);
        } else {
          // Esta cuota aún no está completa, actualizar contadores
          currentInstallmentInterestPaid = Math.min(newInterestPaid, fixedInterestPerPayment);
          currentInstallmentPrincipalPaid = Math.min(newPrincipalPaid, fixedPrincipalPerPayment);
          
          console.log('🔍 ➕ Cuota aún no completa:');
          console.log(`🔍 - Interés pagado: ${currentInstallmentInterestPaid}/${fixedInterestPerPayment}`);
          console.log(`🔍 - Capital pagado: ${currentInstallmentPrincipalPaid}/${fixedPrincipalPerPayment}`);
        }
        
        console.log(`🔍 DESPUÉS del pago ${i + 1}:`);
        console.log(`🔍 - currentInstallmentInterestPaid: ${currentInstallmentInterestPaid}`);
        console.log(`🔍 - currentInstallmentPrincipalPaid: ${currentInstallmentPrincipalPaid}`);
        console.log(`🔍 - completedInstallments: ${completedInstallments}`);
        console.log('---');
      }

      console.log('🔍 RESUMEN FINAL:');
      console.log('🔍 Cuotas completadas:', completedInstallments);
      console.log('🔍 Interés pagado en cuota actual:', currentInstallmentInterestPaid);
      console.log('🔍 Capital pagado en cuota actual:', currentInstallmentPrincipalPaid);
      console.log('🔍 Total interés pagado:', totalInterestPaid);
      console.log('🔍 Total capital pagado:', totalPrincipalPaid);
      console.log('🔍 Interés fijo por cuota:', fixedInterestPerPayment);
      console.log('🔍 Capital fijo por cuota:', fixedPrincipalPerPayment);
      
      const remainingInterest = Math.max(0, fixedInterestPerPayment - currentInstallmentInterestPaid);
      const remainingPrincipal = Math.max(0, fixedPrincipalPerPayment - currentInstallmentPrincipalPaid);
      
      console.log('🔍 INTERPRETACIÓN:');
      console.log(`🔍 - Estamos en la cuota número: ${completedInstallments + 1}`);
      console.log(`🔍 - Interés pagado en esta cuota: RD$${currentInstallmentInterestPaid}/${fixedInterestPerPayment}`);
      console.log(`🔍 - Capital pagado en esta cuota: RD$${currentInstallmentPrincipalPaid}/${fixedPrincipalPerPayment}`);
      console.log(`🔍 - Interés pendiente en esta cuota: RD$${remainingInterest}`);
      console.log(`🔍 - Capital pendiente en esta cuota: RD$${remainingPrincipal}`);
      
      // Determinar qué se debe pagar primero
      if (remainingInterest > 0) {
        console.log(`🔍 🎯 SIGUIENTE PAGO: Debe ir al interés (RD$${remainingInterest} pendiente)`);
      } else if (remainingPrincipal > 0) {
        console.log(`🔍 🎯 SIGUIENTE PAGO: Debe ir al capital (RD$${remainingPrincipal} pendiente)`);
      } else {
        console.log(`🔍 🎯 SIGUIENTE PAGO: Esta cuota está completa, se pasa a la siguiente`);
      }
      
      return currentInstallmentInterestPaid;
    } catch (error) {
      console.error('Error calculando interés pagado:', error);
      return 0;
    }
  };

  const form = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      payment_method: 'cash',
    },
  });

  // Estado para almacenar información del próximo pago (cuota o cargo)
  const [nextPaymentInfo, setNextPaymentInfo] = React.useState<{
    isCharge: boolean;
    amount: number;
    dueDate: string | null;
  } | null>(null);

  // Helpers para INDEFINIDOS (evitar next_payment_date “clamp” como 28-feb)
  const addPeriodIsoForIndefinite = (iso: string, freq: string) => {
    const [yy, mm, dd] = String(iso || '').split('T')[0].split('-').map(Number);
    if (!yy || !mm || !dd) return iso;
    const base = new Date(yy, mm - 1, dd);
    const dt = new Date(base);
    switch (String(freq || 'monthly').toLowerCase()) {
      case 'daily':
        dt.setDate(dt.getDate() + 1);
        break;
      case 'weekly':
        dt.setDate(dt.getDate() + 7);
        break;
      case 'biweekly':
        dt.setDate(dt.getDate() + 14);
        break;
      case 'monthly':
      default:
        // Overflow intencional (30-ene + 1 mes => 02-mar)
        dt.setFullYear(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
        break;
    }
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  // Función para buscar información del próximo pago - MEMOIZADA para evitar recreaciones
  const fetchNextPaymentInfo = useCallback(async () => {
    if (!selectedLoan) {
      setNextPaymentInfo(null);
      return;
    }

    const loanId = selectedLoan.id; // Capturar para verificar después

    try {
      // PASO 1: Buscar la primera cuota/cargo pendiente o parcial ordenada por fecha (respeta orden cronológico)
      // CORRECCIÓN: Obtener TODAS las cuotas (no solo is_paid = false) para detectar pagos parciales
      const { data: allInstallments, error: unpaidError } = await supabase
        .from('installments')
        .select('due_date, is_paid, total_amount, principal_amount, interest_amount, installment_number, id')
        .eq('loan_id', loanId)
        .order('due_date', { ascending: true });
      
      // Obtener todos los pagos del préstamo (necesario para calcular remainingAmount)
      const { data: allPaymentsForLoan } = await supabase
        .from('payments')
        .select('id, amount, principal_amount, interest_amount, due_date, payment_date')
        .eq('loan_id', loanId)
        .order('payment_date', { ascending: true });
      
      // Verificar que el loan sigue siendo el mismo
      if (selectedLoan?.id !== loanId) return;
      
      const amortizationType = String(selectedLoan.amortization_type || '').toLowerCase();
      const isIndefiniteLoan = amortizationType === 'indefinite';
      const freq = String(selectedLoan.payment_frequency || 'monthly');
      const startIso = String(selectedLoan.start_date || '').split('T')[0] || '';
      const firstDueFromStart = (isIndefiniteLoan && startIso) ? addPeriodIsoForIndefinite(startIso, freq) : null;
      const interestPerPayment =
        (Number(selectedLoan.monthly_payment || 0) > 0.01)
          ? Number(selectedLoan.monthly_payment)
          : (Number(selectedLoan.amount || 0) * (Number(selectedLoan.interest_rate || 0) / 100));
      const tol = 0.05;

      // ✅ INDEFINIDOS: calcular la cuota activa y el faltante SOLO desde pagos (normaliza overpay/dues inválidos).
      // Esto permite que el autorrelleno sea el "faltante" real (ej. RD$20) aunque el pago se haya guardado
      // por error en la cuota anterior ya pagada.
      if (isIndefiniteLoan && firstDueFromStart && interestPerPayment > 0.01) {
        const round2 = (v: number) => Math.round((Number(v || 0) * 100)) / 100;

        // 1) Identificar cargos (para excluirlos y para priorizarlos si están pendientes)
        const chargeInstallments = (allInstallments || []).filter((inst: any) => {
          const due = inst?.due_date ? String(inst.due_date).split('T')[0] : null;
          if (!due) return false;
          const isChargeInst =
            Math.abs(Number(inst?.interest_amount || 0)) < 0.01 &&
            Math.abs((Number(inst?.principal_amount || 0) - Number(inst?.total_amount || 0))) < 0.01;
          return isChargeInst;
        });
        const chargeDueDates = new Set<string>();
        for (const c of chargeInstallments) {
          const d = c?.due_date ? String(c.due_date).split('T')[0] : null;
          if (d) chargeDueDates.add(d);
        }

        // 2) Buscar el primer cargo pendiente (si existe), con su remaining real
        let pendingChargeCandidate: { dueDate: string; amount: number } | null = null;
        for (const inst of chargeInstallments) {
          const instDue = inst?.due_date ? String(inst.due_date).split('T')[0] : null;
          if (!instDue) continue;

          // Reusar la lógica existente de cargos por fecha (soporta varios cargos mismo día)
          const chargesWithSameDate = chargeInstallments
            .filter((c: any) => (c?.due_date ? String(c.due_date).split('T')[0] : null) === instDue)
            .sort((a: any, b: any) => (a.installment_number || 0) - (b.installment_number || 0));

          const paymentsForCharges = (allPaymentsForLoan || []).filter((p: any) => {
            const pDue = p?.due_date ? String(p.due_date).split('T')[0] : null;
            const hasNoInterest = (Number(p?.interest_amount || 0) || 0) < 0.01;
            return pDue === instDue && hasNoInterest;
          });
          const totalPaidForDate = paymentsForCharges.reduce((s: number, p: any) => s + (Number(p.principal_amount || p.amount || 0) || 0), 0);
          const chargeIndex = chargesWithSameDate.findIndex((c: any) => c.id === inst.id);

          const chargeTotal = Number(inst.total_amount || 0) || 0;
          let paidForThisCharge = 0;
          if (chargeIndex >= 0 && chargesWithSameDate.length > 0) {
            let remainingPayments = totalPaidForDate;
            for (let i = 0; i < chargeIndex; i++) {
              const prevCharge = chargesWithSameDate[i];
              remainingPayments -= Math.min(remainingPayments, Number(prevCharge.total_amount || 0) || 0);
            }
            paidForThisCharge = Math.min(remainingPayments, chargeTotal);
          } else {
            paidForThisCharge = Math.min(totalPaidForDate, chargeTotal);
          }

          const rem = round2(Math.max(0, chargeTotal - paidForThisCharge));
          if (rem > 0.01) {
            pendingChargeCandidate = { dueDate: instDue, amount: rem };
            break; // está ordenado por due_date arriba
          }
        }

        // 3) Calcular cuota regular activa desde pagos (normaliza due_dates inválidos + overpay)
        const paidByDueValid = new Map<string, number>();
        let invalidPaidTotal = 0;
        for (const p of (allPaymentsForLoan || []) as any[]) {
          const rawDue = p?.due_date ? String(p.due_date).split('T')[0] : null;
          if (!rawDue) continue;
          if (chargeDueDates.has(rawDue)) continue; // evitar mezclar pagos de cargos con cuotas regulares

          const interestField = Number(p?.interest_amount || 0) || 0;
          const amt = Number(p?.amount || 0) || 0;
          const paidValue =
            interestField > 0.01
              ? interestField
              : (amt > 0.01 && amt <= (interestPerPayment * 1.25) ? amt : 0);
          if (paidValue <= 0.01) continue;

          if (rawDue < firstDueFromStart) {
            invalidPaidTotal = round2(invalidPaidTotal + paidValue);
          } else {
            paidByDueValid.set(rawDue, round2((paidByDueValid.get(rawDue) || 0) + paidValue));
          }
        }

        const fullyPaid: string[] = [];
        let partialDue: string | null = null;
        for (const [due, paid] of paidByDueValid.entries()) {
          if (paid <= 0.01) continue;
          if (paid + tol < interestPerPayment) partialDue = !partialDue || due < partialDue ? due : partialDue;
          else fullyPaid.push(due);
        }
        const maxFull = fullyPaid.sort((a, b) => a.localeCompare(b)).slice(-1)[0] || null;
        const activeDue = partialDue || (maxFull ? addPeriodIsoForIndefinite(maxFull, freq) : firstDueFromStart);

        let paidActive = activeDue ? (paidByDueValid.get(activeDue) || 0) : 0;
        if (activeDue) paidActive = round2(paidActive + invalidPaidTotal);

        // mover excedentes de cuotas anteriores ya saldadas a la cuota activa
        if (activeDue) {
          let rollover = 0;
          for (const [due, paid] of paidByDueValid.entries()) {
            if (due >= activeDue) continue;
            const overflow = round2(Math.max(0, paid - interestPerPayment));
            if (overflow > 0.01) {
              rollover = round2(rollover + overflow);
              paidByDueValid.set(due, round2(Math.min(paid, interestPerPayment)));
            }
          }
          if (rollover > 0.01) {
            paidActive = round2(paidActive + rollover);
          }
        }

        const remainingRegular = round2(Math.max(0, round2(interestPerPayment - paidActive)));
        const regularDue = activeDue || null;
        const regularCandidate =
          regularDue
            ? {
                dueDate: remainingRegular <= 0.01 ? addPeriodIsoForIndefinite(regularDue, freq) : regularDue,
                amount: remainingRegular <= 0.01 ? round2(interestPerPayment) : remainingRegular
              }
            : null;

        // 4) Elegir qué se paga primero: orden cronológico (la fecha más antigua primero)
        const choose = (() => {
          if (pendingChargeCandidate && regularCandidate) {
            return pendingChargeCandidate.dueDate <= regularCandidate.dueDate
              ? { ...pendingChargeCandidate, isCharge: true }
              : { ...regularCandidate, isCharge: false };
          }
          if (pendingChargeCandidate) return { ...pendingChargeCandidate, isCharge: true };
          if (regularCandidate) return { ...regularCandidate, isCharge: false };
          return null;
        })();

        if (choose && choose.amount > 0.01) {
          setNextPaymentInfo({
            isCharge: choose.isCharge,
            amount: choose.amount,
            dueDate: choose.dueDate
          });
        } else {
          setNextPaymentInfo(null);
        }
        return;
      }

      // Buscar la primera cuota/cargo con saldo pendiente (incluyendo parciales)
      let firstUnpaid = null;
      let remainingAmount = 0;
      let isCharge = false;
      
      for (const inst of (allInstallments || [])) {
        const instDueDate = inst.due_date?.split('T')[0];
        const chargeCheck = Math.abs(inst.interest_amount || 0) < 0.01 && 
                           Math.abs((inst.principal_amount || 0) - (inst.total_amount || 0)) < 0.01;

        // ✅ INDEFINIDOS: ignorar cuotas regulares con due_date inválido anterior a la primera fecha real
        if (isIndefiniteLoan && !chargeCheck && instDueDate && firstDueFromStart && instDueDate < firstDueFromStart) {
          continue;
        }
        
        const instTotalAmount =
          (isIndefiniteLoan && !chargeCheck && interestPerPayment > 0.01)
            ? interestPerPayment
            : ((inst.total_amount ?? ((inst.principal_amount || 0) + (inst.interest_amount || 0))) || 0);
        let instRemainingAmount = instTotalAmount;
        
        // Calcular cuánto se ha pagado de esta cuota/cargo
        if (chargeCheck && instDueDate) {
          // Es un cargo: calcular pagos asignados a cargos con esta fecha
          const chargesWithSameDate = (allInstallments || []).filter(c => {
            const cIsCharge = Math.abs(c.interest_amount || 0) < 0.01 && 
                             Math.abs((c.principal_amount || 0) - (c.total_amount || 0)) < 0.01;
            return cIsCharge && c.due_date?.split('T')[0] === instDueDate;
          }).sort((a, b) => (a.installment_number || 0) - (b.installment_number || 0));
          
          const paymentsForCharges = (allPaymentsForLoan || []).filter(p => {
            const paymentDueDate = p.due_date?.split('T')[0];
            const hasNoInterest = (p.interest_amount || 0) < 0.01;
            return paymentDueDate === instDueDate && hasNoInterest;
          });
          
          const totalPaidForDate = paymentsForCharges.reduce((s, p) => s + (p.principal_amount || p.amount || 0), 0);
          const chargeIndex = chargesWithSameDate.findIndex(c => c.id === inst.id);
          
          let totalPaidForCharge = 0;
          if (chargeIndex >= 0 && chargesWithSameDate.length > 0) {
            let remainingPayments = totalPaidForDate;
            for (let i = 0; i < chargeIndex; i++) {
              const prevCharge = chargesWithSameDate[i];
              remainingPayments -= Math.min(remainingPayments, prevCharge.total_amount || 0);
            }
            totalPaidForCharge = Math.min(remainingPayments, inst.total_amount || 0);
          } else {
            totalPaidForCharge = Math.min(totalPaidForDate, inst.total_amount || 0);
          }
          
          instRemainingAmount = Math.max(0, instTotalAmount - totalPaidForCharge);
        } else if (instDueDate) {
          // Es una cuota regular: buscar pagos asignados a esta cuota
          const paymentsForThisInstallment = (allPaymentsForLoan || []).filter(p => {
            const paymentDueDate = p.due_date?.split('T')[0];
            return paymentDueDate === instDueDate;
          });

          // ✅ INDEFINIDOS: los pagos parciales pueden venir con interest_amount=0.
          // Para calcular el faltante, usar el MONTO total pagado por due_date.
          if (isIndefiniteLoan) {
            const totalPaid = paymentsForThisInstallment.reduce((s, p) => s + (Number(p.amount || 0) || 0), 0);
            instRemainingAmount = Math.max(0, instTotalAmount - totalPaid);
          } else {
            const principalPaid = paymentsForThisInstallment.reduce((s, p) => s + (p.principal_amount || 0), 0);
            const interestPaid = paymentsForThisInstallment.reduce((s, p) => s + (p.interest_amount || 0), 0);
            // Si se pagó menos del total, hay saldo pendiente
            const totalPaid = principalPaid + interestPaid;
            instRemainingAmount = Math.max(0, instTotalAmount - totalPaid);
          }
        }
        
        // Si hay saldo pendiente, esta es la primera cuota a pagar
        if (instRemainingAmount > 0.01) {
          firstUnpaid = inst;
          remainingAmount = instRemainingAmount;
          isCharge = chargeCheck;
          break;
        }
      }

      // ✅ INDEFINIDOS: si encontramos una cuota regular pero hay un cargo pendiente, priorizar el cargo
      // (evita que el "próximo pago" sea la cuota de interés y el pago se aplique ahí en vez del cargo)
      if (isIndefiniteLoan && firstUnpaid && !isCharge && (allInstallments || []).length > 0) {
        let firstPendingCharge: typeof firstUnpaid = null;
        let firstPendingChargeRemaining = 0;
        for (const inst of (allInstallments || [])) {
          const instDueDate = inst.due_date?.split('T')[0];
          const cCharge = Math.abs(inst.interest_amount || 0) < 0.01 && Math.abs((inst.principal_amount || 0) - (inst.total_amount || 0)) < 0.01;
          if (!cCharge || !instDueDate) continue;
          const chargesWithSameDate = (allInstallments || []).filter((c: any) => {
            const cIsCharge = Math.abs(c.interest_amount || 0) < 0.01 && Math.abs((c.principal_amount || 0) - (c.total_amount || 0)) < 0.01;
            return cIsCharge && c.due_date?.split('T')[0] === instDueDate;
          }).sort((a: any, b: any) => (a.installment_number || 0) - (b.installment_number || 0));
          const paymentsForCharges = (allPaymentsForLoan || []).filter((p: any) => {
            const pDue = p.due_date?.split('T')[0];
            return pDue === instDueDate && (p.interest_amount || 0) < 0.01;
          });
          const totalPaidForDate = paymentsForCharges.reduce((s: number, p: any) => s + (p.principal_amount || p.amount || 0), 0);
          const chargeIndex = chargesWithSameDate.findIndex((c: any) => c.id === inst.id);
          let totalPaidForCharge = 0;
          if (chargeIndex >= 0 && chargesWithSameDate.length > 0) {
            let rem = totalPaidForDate;
            for (let i = 0; i < chargeIndex; i++) rem -= Math.min(rem, chargesWithSameDate[i].total_amount || 0);
            totalPaidForCharge = Math.min(rem, inst.total_amount || 0);
          } else {
            totalPaidForCharge = Math.min(totalPaidForDate, inst.total_amount || 0);
          }
          const remCharge = Math.max(0, (inst.total_amount || 0) - totalPaidForCharge);
          if (remCharge > 0.01) {
            firstPendingCharge = inst;
            firstPendingChargeRemaining = remCharge;
            break;
          }
        }
        if (firstPendingCharge && firstPendingChargeRemaining > 0.01) {
          firstUnpaid = firstPendingCharge;
          remainingAmount = firstPendingChargeRemaining;
          isCharge = true;
        }
      }

      // ✅ INDEFINIDOS: si no hay cuotas regulares en installments, crear una cuota virtual
      // usando start_date + período y pagos por due_date (SIN usar next_payment_date de BD).
      if (isIndefiniteLoan && !firstUnpaid) {
        const expectedInterest = interestPerPayment;

        // 1) Agrupar pagos por due_date (normalizado)
        const paidByDue = new Map<string, number>();
        for (const p of (allPaymentsForLoan || []) as any[]) {
          let due = p?.due_date ? String(p.due_date).split('T')[0] : null;
          if (!due) continue;
          const amt = Number(p?.amount || 0) || 0;
          if (amt <= 0.01) continue;
          paidByDue.set(due, (paidByDue.get(due) || 0) + amt);
        }

        const fullyPaid: string[] = [];
        let partialDue: string | null = null;
        for (const [due, paid] of paidByDue.entries()) {
          if (paid + tol < expectedInterest) {
            partialDue = !partialDue || due < partialDue ? due : partialDue;
          } else {
            fullyPaid.push(due);
          }
        }
        const maxFull = fullyPaid.sort((a, b) => a.localeCompare(b)).slice(-1)[0] || null;

        const targetDue = partialDue || (maxFull ? addPeriodIsoForIndefinite(maxFull, freq) : firstDueFromStart);
        if (targetDue) {
          // Reasignar pagos inválidos (due < firstDueFromStart) a la cuota activa real
          if (firstDueFromStart) {
            let invalidPaidTotal = 0;
            for (const [k, v] of paidByDue.entries()) {
              if (k < firstDueFromStart) invalidPaidTotal += v;
            }
            if (invalidPaidTotal > 0.01) {
              paidByDue.set(targetDue, (paidByDue.get(targetDue) || 0) + invalidPaidTotal);
            }
          }
          const paidForTarget = paidByDue.get(targetDue) || 0;
          const fallbackRemaining = Math.max(0, expectedInterest - paidForTarget);

          if (fallbackRemaining > 0.01) {
            firstUnpaid = {
              id: `indefinite-virtual-${loanId}-${targetDue}`,
              due_date: targetDue,
              installment_number: 1,
              is_paid: false,
              principal_amount: 0,
              interest_amount: expectedInterest,
              total_amount: expectedInterest
            } as any;
            remainingAmount = fallbackRemaining;
            isCharge = false;
          }
        }
      }
      
      const unpaidInstallments = firstUnpaid ? [firstUnpaid] : [];

      // Verificar que el loan sigue siendo el mismo
      if (selectedLoan?.id !== loanId) return;

      // No reemplazar firstUnpaid por next_payment_date: el primer ítem pendiente por due_date
      // es la fuente de verdad. Si un cargo fue creado después de una cuota (ej. cargo 24 mar tras cuota 20 mar),
      // debe mostrarse para pago; next_payment_date puede estar desactualizado o referir solo a cuotas regulares.

      if (firstUnpaid) {
        // remainingAmount ya está calculado arriba en el loop
        console.log('🔍 PaymentForm: Cuota pendiente/parcial encontrada:', {
          installmentNumber: firstUnpaid.installment_number,
          totalAmount: (firstUnpaid.total_amount ?? ((firstUnpaid.principal_amount || 0) + (firstUnpaid.interest_amount || 0))) || 0,
          remainingAmount,
          dueDate: firstUnpaid.due_date,
          isPaid: firstUnpaid.is_paid,
          isCharge
        });
      }
        
      // Solo actualizar si el loan sigue siendo el mismo y hay un installment pendiente
      if (selectedLoan?.id === loanId && firstUnpaid) {
        setNextPaymentInfo({
          isCharge,
          amount: remainingAmount, // Usar el monto restante, no el total
          dueDate: firstUnpaid.due_date
        });
      } else if (selectedLoan?.id === loanId && !firstUnpaid) {
        setNextPaymentInfo(null);
      }
    } catch (error) {
      console.error('Error buscando información del próximo pago:', error);
      if (selectedLoan?.id === loanId) {
        setNextPaymentInfo(null);
      }
    }
  }, [selectedLoan]);

  // EFECTO: Activar animación de carga cuando se selecciona un préstamo
  React.useEffect(() => {
    if (selectedLoan) {
      setIsAmountLoading(true);
      const timer = setTimeout(() => {
        setIsAmountLoading(false);
      }, 500); // Duración de 0.5 segundos
      return () => clearTimeout(timer);
    }
  }, [selectedLoan?.id]);

  // EFECTO CONSOLIDADO: Detectar próximo pago y configurar listener de Realtime
  // Solo se ejecuta cuando cambia selectedLoan, evitando múltiples renders
  React.useEffect(() => {
    if (!selectedLoan) {
      setNextPaymentInfo(null);
      // Limpiar listener anterior
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
      return;
    }

    // Limpiar listener anterior antes de crear uno nuevo
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }

    // Fetch inicial de información del próximo pago
    fetchNextPaymentInfo();
    
    // Configurar listener de Realtime UNA SOLA VEZ por préstamo
    const channel = supabase
      .channel(`payment-form-installments-${selectedLoan.id}`)
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'installments',
          filter: `loan_id=eq.${selectedLoan.id}`
        }, 
        (payload) => {
          // Actualización optimista inmediata solo si es un cargo nuevo no pagado
          if (payload.new) {
            const newInstallment = payload.new as any;
            const isCharge = newInstallment.interest_amount === 0 && 
                            newInstallment.principal_amount === newInstallment.total_amount;
            
            if (isCharge && !newInstallment.is_paid) {
              setNextPaymentInfo({
                isCharge: true,
                amount: newInstallment.total_amount,
                dueDate: newInstallment.due_date
              });
              console.log('⚡ PaymentForm: Actualización optimista inmediata del cargo:', newInstallment.total_amount);
            }
          }
          // Fetch completo en background (sin bloquear UI)
          fetchNextPaymentInfo();
        }
      )
      .on('postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'payments',
          filter: `loan_id=eq.${selectedLoan.id}`
        },
        (payload) => {
          // Cuando hay cambios en pagos (crear, actualizar, eliminar), actualizar nextPaymentInfo
          console.log('⚡ PaymentForm: Cambio en pagos detectado, actualizando nextPaymentInfo');
          fetchNextPaymentInfo();
        }
      )
      .subscribe();
    
    realtimeChannelRef.current = channel;
    
    return () => {
      if (realtimeChannelRef.current) {
        supabase.removeChannel(realtimeChannelRef.current);
        realtimeChannelRef.current = null;
      }
    };
  }, [selectedLoan?.id, fetchNextPaymentInfo]); // Solo depende del ID del préstamo, no de fetchNextPaymentInfo directamente

  // EFECTO CONSOLIDADO: Actualizar monto SOLO cuando los datos estén listos
  // Usa useMemo para calcular el monto correcto y evita renders innecesarios
  const calculatedAmount = useMemo(() => {
    if (!selectedLoan) return null;

    // Prioridad 0: si nextPaymentInfo ya está listo (incluye parciales), usarlo aunque paymentStatus no esté listo aún
    if (nextPaymentInfo && nextPaymentInfo.amount > 0) {
      return roundToTwoDecimals(nextPaymentInfo.amount);
    }

    // Si aún no está listo paymentStatus, no autollenar (evita parpadeos)
    if (!paymentStatusReady) {
      return null;
    }

    // Prioridad 2: Usar paymentStatus (basado en next_payment_date)
    if (paymentStatus.currentPaymentRemaining > 0) {
      if (paymentStatus.currentPaymentRemaining < selectedLoan.monthly_payment) {
        return roundToTwoDecimals(paymentStatus.currentPaymentRemaining);
      } else {
        return roundToTwoDecimals(selectedLoan.monthly_payment);
      }
    }

    // Fallback: Si no hay paymentStatus, usar monthly_payment
    return selectedLoan.monthly_payment ? roundToTwoDecimals(selectedLoan.monthly_payment) : null;
  }, [selectedLoan, paymentStatusReady, paymentStatus.currentPaymentRemaining, nextPaymentInfo]);

  // Actualizar formulario y estado SOLO cuando calculatedAmount cambie y sea válido
  // PERO solo si el usuario no está editando manualmente el campo
  React.useEffect(() => {
    if (calculatedAmount !== null && calculatedAmount !== paymentAmount && !isUserEditingAmountRef.current) {
      form.setValue('amount', calculatedAmount);
      setPaymentAmount(calculatedAmount);
      console.log('🔍 PaymentForm: Monto actualizado:', calculatedAmount);
    }
  }, [calculatedAmount, form, paymentAmount]);

  // Obtener datos de la empresa
  React.useEffect(() => {
    const fetchCompanySettings = async () => {
      if (!companyId) return;
      
      try {
        const { data, error } = await supabase
          .from('company_settings')
          .select('*')
          .eq('user_id', companyId)
          .maybeSingle();
        
        if (error) {
          console.error('Error obteniendo datos de la empresa:', error);
          return;
        }
        
        if (data) {
          setCompanySettings(data);
        }
      } catch (error) {
        console.error('Error obteniendo datos de la empresa:', error);
      }
    };
    
    fetchCompanySettings();
  }, [companyId]);

  React.useEffect(() => {
    if (!preselectedLoan) {
      fetchActiveLoans();
    }
  }, [preselectedLoan]);

  // Si hay un préstamo predefinido, seleccionarlo automáticamente
  React.useEffect(() => {
    if (preselectedLoan) {
      setSelectedLoan(preselectedLoan);
      form.setValue('loan_id', preselectedLoan.id);
      // Calcular mora para el préstamo predefinido
      calculateLoanLateFee(preselectedLoan);
      // El monto se establecerá automáticamente cuando se actualice el paymentStatus
      setPaymentAmount(0); // Reset payment amount
      setPaymentDistribution(null); // Reset distribution
      // Resetear el flag de edición manual para permitir que se establezca el valor calculado
      isUserEditingAmountRef.current = false;
    }
  }, [preselectedLoan, form]);

  // Cargar distribución cuando se selecciona un préstamo
  React.useEffect(() => {
    if (selectedLoan && paymentAmount > 0) {
      calculatePaymentDistribution(paymentAmount).then(setPaymentDistribution);
    } else {
      setPaymentDistribution(null);
    }
  }, [selectedLoan]);

  // Aplicar abono de mora cuando cambie el monto
  React.useEffect(() => {
    if (selectedLoan && originalLateFeeBreakdown) {
      const lateFeeAmount = form.watch('late_fee_amount') || 0;
      if (lateFeeAmount > 0) {
        const updatedBreakdown = applyLateFeePayment(originalLateFeeBreakdown, lateFeeAmount);
        setLateFeeBreakdown(updatedBreakdown);
        setAppliedLateFeePayment(lateFeeAmount);
      } else {
        // Resetear al desglose original
        setLateFeeBreakdown(originalLateFeeBreakdown);
        setAppliedLateFeePayment(0);
      }
    }
  }, [form.watch('late_fee_amount'), originalLateFeeBreakdown, selectedLoan]);

  // Calcular interés pendiente para préstamos indefinidos
  React.useEffect(() => {
    if (selectedLoan && selectedLoan.amortization_type === 'indefinite') {
      calculatePendingInterestForIndefinite();
    } else {
      setPendingInterestForIndefinite(0);
    }
  }, [selectedLoan]);

  // Función para calcular el interés pendiente total para préstamos indefinidos
  const calculatePendingInterestForIndefinite = async () => {
    if (!selectedLoan || selectedLoan.amortization_type !== 'indefinite') {
      setPendingInterestForIndefinite(0);
      return;
    }

    try {
      if (!selectedLoan.start_date) {
        console.warn('🔍 PaymentForm - calculatePendingInterestForIndefinite: Falta start_date, no se puede calcular');
        setPendingInterestForIndefinite(0);
        return;
      }

      // Calcular interés por cuota para préstamos indefinidos
      const interestPerPayment = (selectedLoan.amount * selectedLoan.interest_rate) / 100;

      // Calcular dinámicamente cuántas cuotas deberían existir desde start_date hasta hoy
      const [startYear, startMonth, startDay] = selectedLoan.start_date.split('-').map(Number);
      const startDate = new Date(startYear, startMonth - 1, startDay);
      const currentDate = getCurrentDateInSantoDomingo();

      // Calcular meses transcurridos desde el inicio
      const monthsElapsed = Math.max(0, 
        (currentDate.getFullYear() - startDate.getFullYear()) * 12 + 
        (currentDate.getMonth() - startDate.getMonth())
      );

      // Total de cuotas que deberían existir desde el inicio hasta hoy
      const totalExpectedInstallments = Math.max(1, monthsElapsed + 1); // +1 para incluir el mes actual

      console.log('🔍 PaymentForm - calculatePendingInterestForIndefinite: Cálculo dinámico', {
        loanId: selectedLoan.id,
        startDate: selectedLoan.start_date,
        currentDate: currentDate.toISOString().split('T')[0],
        monthsElapsed,
        totalExpectedInstallments
      });

      // Calcular cuántas cuotas se han pagado desde los pagos
      let paidCount = 0;
      if (selectedLoan.id) {
        const { data: payments, error: paymentsError } = await supabase
          .from('payments')
          .select('interest_amount')
          .eq('loan_id', selectedLoan.id);

        if (!paymentsError && payments && payments.length > 0) {
          const totalInterestPaid = payments.reduce((sum, p) => sum + (p.interest_amount || 0), 0);
          paidCount = Math.floor(totalInterestPaid / interestPerPayment);

          console.log('🔍 PaymentForm - calculatePendingInterestForIndefinite: Cuotas pagadas desde pagos', {
            totalInterestPaid,
            paidFromPayments: paidCount
          });
        }
      }

      // Cuotas pendientes = total esperadas - pagadas
      const unpaidCount = Math.max(0, totalExpectedInstallments - paidCount);

      // Calcular interés pendiente total
      const totalPendingInterest = unpaidCount * interestPerPayment;

      console.log('🔍 PaymentForm - calculatePendingInterestForIndefinite: Resumen final', {
        loanId: selectedLoan.id,
        totalExpectedInstallments,
        paidCount,
        unpaidCount,
        interestPerPayment,
        totalPendingInterest
      });

      setPendingInterestForIndefinite(totalPendingInterest);
    } catch (error) {
      console.error('❌ Error calculando interés pendiente para préstamo indefinido en PaymentForm:', error);
      setPendingInterestForIndefinite(0);
    }
  };

  const fetchActiveLoans = async () => {
    if (!user || !companyId) return;

    const { data, error } = await supabase
      .from('loans')
      .select(`
        id,
        amount,
        remaining_balance,
        monthly_payment,
        next_payment_date,
        interest_rate,
        late_fee_enabled,
        late_fee_rate,
        grace_period_days,
        max_late_fee,
        late_fee_calculation_type,
        current_late_fee,
        amortization_type,
        start_date,
        clients (
          full_name,
          dni,
          phone
        )
      `)
      .in('status', ['active', 'overdue'])
      .eq('loan_officer_id', companyId)
      .order('next_payment_date');

    if (error) {
      toast.error('Error al cargar préstamos');
      return;
    }

    // Transformar los datos para que coincidan con la interfaz Loan
    const transformedLoans = (data || []).map(loan => ({
      ...loan,
      client: {
        full_name: (loan.clients as any)?.full_name || '',
        dni: (loan.clients as any)?.dni || '',
        phone: (loan.clients as any)?.phone || ''
      }
    }));

    setLoans(transformedLoans);
    setFilteredLoans(transformedLoans);
  };

  const handleLoanSearch = (searchTerm: string) => {
    setLoanSearch(searchTerm);
    if (searchTerm.length === 0) {
      setFilteredLoans(loans);
      setShowLoanDropdown(false);
      return;
    }

    const filtered = loans.filter(loan =>
      loan.client?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      loan.client?.dni?.includes(searchTerm)
    );
    
    setFilteredLoans(filtered);
    setShowLoanDropdown(filtered.length > 0);
  };

  const selectLoan = (loan: Loan) => {
    setSelectedLoan(loan);
    setLoanSearch(`${loan.client?.full_name} - ${loan.client?.dni}`);
    setShowLoanDropdown(false);
    form.setValue('loan_id', loan.id);
    // Limpiar el desglose original para recalcular con el nuevo préstamo
    setOriginalLateFeeBreakdown(null);
    setAppliedLateFeePayment(0);
    // Resetear el flag de edición manual para permitir que se establezca el valor calculado
    isUserEditingAmountRef.current = false;
    // Calcular mora cuando se selecciona un préstamo
    calculateLoanLateFee(loan);
    // El monto se establecerá cuando se actualice el paymentStatus
  };

  const handleLoanSelect = (loanId: string) => {
    const loan = loans.find(l => l.id === loanId);
    setSelectedLoan(loan || null);
    if (loan) {
      form.setValue('loan_id', loan.id);
      // Limpiar el desglose original para recalcular con el nuevo préstamo
      setOriginalLateFeeBreakdown(null);
      setAppliedLateFeePayment(0);
      // Resetear el flag de edición manual para permitir que se establezca el valor calculado
      isUserEditingAmountRef.current = false;
      // Calcular mora cuando se selecciona un préstamo
      calculateLoanLateFee(loan);
      // El monto se establecerá cuando se actualice el paymentStatus
    }
  };

  // Función para calcular la distribución del pago
  const calculatePaymentDistribution = async (amount: number) => {
    if (!selectedLoan || amount <= 0) {
      return { interestPayment: 0, principalPayment: 0, monthlyInterestAmount: 0, remainingInterest: 0 };
    }

    // Si el próximo pago es un cargo, todo va al capital (sin interés)
    if (nextPaymentInfo?.isCharge) {
      return {
        interestPayment: 0,
        principalPayment: amount,
        monthlyInterestAmount: 0,
        remainingInterest: 0,
        alreadyPaidInterest: 0
      };
    }

    // ✅ CORRECCIÓN (PRÉSTAMOS CON CUOTAS): NO usar el monto original para el interés.
    // Después de un abono a capital, el interés por cuota cambia según la tabla de amortización.
    // Aquí usamos la cuota real en `installments` (por due_date) y distribuimos el pago como:
    // 1) Interés pendiente de esa cuota
    // 2) Resto a capital
    const round2 = (n: number) => Math.round((Number(n || 0) * 100)) / 100;

    const dueKey =
      (nextPaymentInfo?.dueDate ? String(nextPaymentInfo.dueDate).split('T')[0] : null) ||
      (selectedLoan?.next_payment_date ? String(selectedLoan.next_payment_date).split('T')[0] : null);

    // Fallback ultra defensivo (no debería pasar)
    if (!dueKey) {
      const fallbackInterest = round2((selectedLoan.amount * selectedLoan.interest_rate) / 100);
      const interestPayment = Math.min(round2(amount), fallbackInterest);
      return {
        interestPayment,
        principalPayment: round2(amount - interestPayment),
        monthlyInterestAmount: fallbackInterest,
        remainingInterest: Math.max(0, round2(fallbackInterest - interestPayment)),
        alreadyPaidInterest: 0
      };
    }

    const [{ data: instRows, error: instErr }, { data: payRows, error: payErr }] = await Promise.all([
      supabase
        .from('installments')
        .select('principal_amount, interest_amount, total_amount, amount, due_date')
        .eq('loan_id', selectedLoan.id)
        .eq('due_date', dueKey),
      supabase
        .from('payments')
        .select('amount, due_date')
        .eq('loan_id', selectedLoan.id)
        .eq('due_date', dueKey)
    ]);

    if (instErr) console.error('Error obteniendo cuota para distribución:', instErr);
    if (payErr) console.error('Error obteniendo pagos para distribución:', payErr);

    // Elegir la cuota regular (no cargo): interest_amount > 0
    const regularInst =
      (instRows || []).find(r => Math.abs(Number(r.interest_amount || 0)) >= 0.01) ||
      (instRows || [])[0];

    const expectedInterest = round2(Number(regularInst?.interest_amount || 0));
    const expectedPrincipal = round2(Number(regularInst?.principal_amount || 0));
    const expectedTotal = round2(
      Number(regularInst?.total_amount ?? (Number(regularInst?.amount || 0) || (expectedInterest + expectedPrincipal)))
    );

    const totalPaidForDue = round2(
      (payRows || []).reduce((s, p) => s + (Number(p.amount || 0) || 0), 0)
    );

    // Interés primero
    const alreadyPaidInterest = Math.min(expectedInterest, totalPaidForDue);
    const alreadyPaidPrincipal = Math.min(expectedPrincipal, Math.max(0, totalPaidForDue - expectedInterest));

    const remainingInterest = Math.max(0, round2(expectedInterest - alreadyPaidInterest));
    const remainingPrincipal = Math.max(0, round2(expectedPrincipal - alreadyPaidPrincipal));
    const remainingTotal = Math.max(0, round2(expectedTotal - totalPaidForDue));

    const safeAmount = Math.min(round2(amount), remainingTotal > 0 ? remainingTotal : round2(amount));

    const interestPayment = Math.min(safeAmount, remainingInterest);
    const principalPayment = Math.min(round2(safeAmount - interestPayment), remainingPrincipal);

    return {
      interestPayment,
      principalPayment,
      monthlyInterestAmount: expectedInterest,
      remainingInterest,
      alreadyPaidInterest
    };
  };

  const onSubmit = async (data: PaymentFormData) => {
    if (!user || !companyId || !selectedLoan) return;

    // Evitar múltiples envíos
    if (loading) {
      console.log('🔍 PaymentForm: Ya hay un pago en proceso, ignorando...');
      return;
    }

    console.log('🔍 PaymentForm: Iniciando proceso de pago...');
    setLoading(true);
    try {
      // Validaciones antes de procesar el pago
      const monthlyPayment = selectedLoan.monthly_payment;
      // Calcular el balance restante correcto (incluyendo intereses pendientes para indefinidos)
      const remainingBalance = selectedLoan.amortization_type === 'indefinite' 
        ? selectedLoan.amount + pendingInterestForIndefinite
        : (computedBalancePending !== null ? computedBalancePending : selectedLoan.remaining_balance);
      const currentPaymentRemaining = paymentStatus.currentPaymentRemaining;
      const interestRate = selectedLoan.interest_rate; // Tasa de interés mensual [[memory:6311805]]
      
      // Validación 1a: Si el próximo pago es un cargo, no permitir pagar más del monto del cargo
      if (nextPaymentInfo?.isCharge) {
        if (nextPaymentInfo.amount <= 0) {
          toast.error('No hay cargo pendiente. Por favor, recarga la página para actualizar la información.');
          setLoading(false);
          return;
        }
        if (data.amount > nextPaymentInfo.amount) {
        toast.error(`El pago no puede exceder el monto del cargo de ${formatCurrency(nextPaymentInfo.amount)}`);
        setLoading(false);
        return;
        }
      }
      
      // Validación 1b: No permitir que la cuota exceda el balance restante
      if (data.amount > remainingBalance) {
        toast.error(`El pago de cuota no puede exceder el balance restante de ${formatCurrency(remainingBalance)}`);
        setLoading(false);
        return;
      }
      
      // Validación 1b: No permitir que la mora exceda la mora actual
      const roundedLateFeeAmount = roundToTwoDecimals(lateFeeAmount);
      const roundedLateFeePayment = roundToTwoDecimals(data.late_fee_amount || 0);
      if (data.late_fee_amount && roundedLateFeePayment > roundedLateFeeAmount) {
        toast.error(`El pago de mora no puede exceder la mora actual de RD$${roundedLateFeeAmount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
        setLoading(false);
        return;
      }
      
      // Validación 2: No permitir pagos negativos, pero permitir 0 si hay pago de mora
      if (data.amount < 0) {
        toast.error('El monto del pago no puede ser negativo');
        setLoading(false);
        return;
      }
      
      // Validación 2b: Debe haber al menos un pago (cuota o mora)
      // NOTA: Los pagos parciales están permitidos - cualquier monto mayor a 0 es válido
      if (data.amount <= 0 && (!data.late_fee_amount || data.late_fee_amount <= 0)) {
        toast.error('Debe pagar al menos algo de la cuota o de la mora');
        setLoading(false);
        return;
      }

      // Validación 3: No permitir pagos que excedan lo que falta de la cuota actual (solo si hay pago de cuota)
      // NOTA: Los pagos parciales de cualquier monto mayor a 0 están permitidos
      // EXCEPCIÓN: Si el próximo pago es un cargo, permitir pagar el monto completo del cargo
      if (data.amount > 0) {
        // Si es un cargo, permitir pagar hasta el monto del cargo
        if (nextPaymentInfo?.isCharge) {
          const maxAllowedForCharge = nextPaymentInfo.amount;
          if (data.amount > maxAllowedForCharge) {
            toast.error(`El pago no puede exceder el monto del cargo de ${formatCurrency(maxAllowedForCharge)}`);
            setLoading(false);
            return;
          }
        } else {
          // Para cuotas regulares, usar la validación original
        const maxAllowedPayment =
          (nextPaymentInfo?.amount && nextPaymentInfo.amount > 0)
            ? nextPaymentInfo.amount
            : (currentPaymentRemaining > 0 ? currentPaymentRemaining : monthlyPayment);
        const roundedMaxAllowed = roundToTwoDecimals(maxAllowedPayment);
        const roundedAmount = roundToTwoDecimals(data.amount);
        if (roundedAmount > roundedMaxAllowed + 0.05) {
          toast.error(`El pago de cuota no puede exceder lo que falta de la cuota actual: ${formatCurrency(roundedMaxAllowed)}`);
            setLoading(false);
          return;
          }
        }
      }

      // Calcular la distribución del pago considerando pagos previos (solo si hay pago de cuota)
      let distribution = { interestPayment: 0, principalPayment: 0, remainingInterest: 0 };
      let isFullPayment = false;
      let paymentStatusValue = 'pending';
      let interestPayment = 0;
      let principalPayment = 0;
      let remainingInterest = 0;
      
      if (data.amount > 0) {
        distribution = await calculatePaymentDistribution(roundToTwoDecimals(data.amount));
        interestPayment = distribution.interestPayment;
        principalPayment = distribution.principalPayment;
        remainingInterest = distribution.remainingInterest;
        
        // Determinar si es un pago completo o parcial
        // Si es un cargo, usar el monto del cargo como referencia
        let maxAllowedPayment: number =
          (nextPaymentInfo?.amount && nextPaymentInfo.amount > 0)
            ? nextPaymentInfo.amount
            : (currentPaymentRemaining > 0 ? currentPaymentRemaining : monthlyPayment);

        const roundedMaxAllowed = roundToTwoDecimals(maxAllowedPayment);
        const roundedAmount = roundToTwoDecimals(data.amount);
        // tolerancia por redondeos (centavos)
        isFullPayment = (roundedAmount + 0.05) >= roundedMaxAllowed;
        paymentStatusValue = isFullPayment ? 'completed' : 'pending';
        
        // Si es pago parcial, mostrar advertencia
        if (!isFullPayment) {
          const remainingAmount = roundToTwoDecimals(Math.max(0, roundedMaxAllowed - roundToTwoDecimals(data.amount)));
          const paymentType = nextPaymentInfo?.isCharge ? 'del cargo' : 'de la cuota mensual';
          toast.warning(`Pago parcial registrado. Queda pendiente ${formatCurrency(remainingAmount)} ${paymentType}.`);
        }

        // Mostrar información sobre la distribución del pago
        const distributionMessage = principalPayment > 0 
          ? `Pago aplicado: ${formatCurrency(interestPayment)} al interés, ${formatCurrency(principalPayment)} al capital`
          : `Pago aplicado: ${formatCurrency(interestPayment)} al interés (pendiente interés: ${formatCurrency(remainingInterest - interestPayment)})`;
        
        toast.info(distributionMessage);
      } else {
        // Solo pago de mora, no hay distribución de cuota
        const lateFeeAmount = roundToTwoDecimals(data.late_fee_amount || 0);
        toast.info(`Pago de mora registrado: RD$${lateFeeAmount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      }

      // CORREGIR: Crear fecha y hora correcta para Santo Domingo
      const now = new Date();
      
      // Crear fecha en zona horaria de Santo Domingo usando Intl.DateTimeFormat
      const santoDomingoFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Santo_Domingo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      });
      
      const parts = santoDomingoFormatter.formatToParts(now);
      const year = parts.find(part => part.type === 'year')?.value;
      const month = parts.find(part => part.type === 'month')?.value;
      const day = parts.find(part => part.type === 'day')?.value;
      const hour = parts.find(part => part.type === 'hour')?.value;
      const minute = parts.find(part => part.type === 'minute')?.value;
      const second = parts.find(part => part.type === 'second')?.value;
      
      // Crear fecha local en Santo Domingo
      const santoDomingoDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
      const paymentDate = `${year}-${month}-${day}`; // YYYY-MM-DD
      
      // Crear timestamp con zona horaria local (sin conversión UTC)
      const paymentTimeLocal = santoDomingoDate.toISOString();
      const paymentTimezone = 'America/Santo_Domingo';
      
      console.log('🔍 PaymentForm: DEBUGGING HORA LOCAL:', {
        nowUTC: now.toISOString(),
        nowLocal: now.toLocaleString('es-DO', { timeZone: 'America/Santo_Domingo' }),
        santoDomingoDate: santoDomingoDate.toISOString(),
        santoDomingoLocal: santoDomingoDate.toLocaleString('es-DO', { timeZone: 'America/Santo_Domingo' }),
        paymentDate,
        paymentTimeLocal,
        paymentTimezone,
        parts: { year, month, day, hour, minute, second }
      });
      
      // ✅ Determinar due_date correcto:
      // - Si nextPaymentInfo existe (cargo o cuota regular), usar SIEMPRE su dueDate.
      // - Evitar usar selectedLoan.next_payment_date en indefinidos (puede venir “clamp” 28-feb).
      let paymentDueDate =
        (nextPaymentInfo?.dueDate ? String(nextPaymentInfo.dueDate).split('T')[0] : null) ||
        null;
      if (!paymentDueDate) {
        const amort = String(selectedLoan.amortization_type || '').toLowerCase();
        if (amort === 'indefinite' && selectedLoan.start_date) {
          const startIso = String(selectedLoan.start_date).split('T')[0];
          const freq = String(selectedLoan.payment_frequency || 'monthly');
          paymentDueDate = addPeriodIsoForIndefinite(startIso, freq);
        } else {
          paymentDueDate = selectedLoan.next_payment_date ? String(selectedLoan.next_payment_date).split('T')[0] : null;
        }
      }
      if (!paymentDueDate) {
        throw new Error('No se pudo determinar la fecha de vencimiento (due_date) del pago.');
      }
      console.log('🔍 PaymentForm: due_date seleccionado para el pago:', paymentDueDate, {
        isCharge: !!nextPaymentInfo?.isCharge,
        fromNextPaymentInfo: !!nextPaymentInfo?.dueDate
      });
      
      const paymentData = {
        loan_id: data.loan_id,
        amount: roundToTwoDecimals(data.amount), // Solo el monto de la cuota, sin incluir la mora (2 decimales)
        principal_amount: roundToTwoDecimals(principalPayment),
        interest_amount: roundToTwoDecimals(interestPayment),
        late_fee: roundToTwoDecimals(data.late_fee_amount || 0), // Mora como concepto separado (2 decimales)
        due_date: paymentDueDate, // Usar el due_date del cargo si es un cargo, de lo contrario el next_payment_date del préstamo
        payment_date: paymentDate, // Usar fecha actual en zona horaria de Santo Domingo
        payment_time_local: paymentTimeLocal, // Timestamp con zona horaria local
        payment_timezone: paymentTimezone, // Zona horaria del pago
        payment_method: data.payment_method,
        reference_number: data.reference_number,
        notes: data.notes,
        status: paymentStatusValue,
        created_by: user?.id || companyId, // Usar el user_id del usuario actual, o companyId como respaldo
        company_id: companyId, // Requerido por la tabla payments
      };
      
      console.log('🔍 PaymentForm: Datos del pago que se enviarán:', paymentData);

      // Sin verificación de duplicados - permitir cualquier pago

      const { data: insertedPayment, error: paymentError } = await supabase
        .from('payments')
        .insert([paymentData])
        .select();

      if (paymentError) {
        console.error('🔍 PaymentForm: Error insertando pago:', paymentError);
        throw paymentError;
      }
      
      console.log('🔍 PaymentForm: Pago insertado exitosamente:', insertedPayment);

      // ✅ SIEMPRE actualizar paid_amount de cargos cuando el pago es tipo cargo (sin interés)
      // Recalcular TODOS los cargos por due_date (no depender de paymentDueDate que puede ser incorrecto)
      if (principalPayment > 0 && (interestPayment || 0) < 0.01) {
        const { data: allCharges } = await supabase
          .from('installments')
          .select('id, installment_number, due_date, total_amount, paid_amount')
          .eq('loan_id', data.loan_id)
          .eq('interest_amount', 0)
          .order('installment_number', { ascending: true });
        const { data: allPayments } = await supabase
          .from('payments')
          .select('principal_amount, amount, interest_amount, due_date')
          .eq('loan_id', data.loan_id);
        const chargePayments = (allPayments || []).filter((p: any) => (Number(p.principal_amount ?? p.amount) || 0) > 0 && (Number(p.interest_amount ?? 0) || 0) < 0.01);
        const dueDates = [...new Set((allCharges || []).map((c: any) => c.due_date ? String(c.due_date).split('T')[0] : '').filter(Boolean))];
        for (const dueNorm of dueDates) {
          const chargesForDate = (allCharges || []).filter((c: any) => (c.due_date ? String(c.due_date).split('T')[0] : '') === dueNorm).sort((a: any, b: any) => (a.installment_number || 0) - (b.installment_number || 0));
          const paymentsForDate = chargePayments.filter((p: any) => (p.due_date ? String(p.due_date).split('T')[0] : '') === dueNorm);
          const totalPaid = paymentsForDate.reduce((s: number, p: any) => s + (Number(p.principal_amount ?? p.amount) || 0), 0);
          let remaining = totalPaid;
          for (const ch of chargesForDate) {
            const totalCh = ch.total_amount || 0;
            const assign = Math.min(Math.max(remaining, 0), totalCh);
            const pendingAfter = totalCh - assign;
            const isFullyPaid = pendingAfter < 1 && assign >= totalCh - 0.01;
            const { error: upErr } = await supabase.from('installments').update({
              paid_amount: Math.round(assign * 100) / 100,
              is_paid: isFullyPaid,
              ...(isFullyPaid ? { paid_date: new Date().toISOString().split('T')[0], late_fee_paid: 0 } : {})
            }).eq('id', ch.id);
            if (upErr) console.error('Error actualizando cargo:', upErr);
            else console.log(`✅ Cargo #${ch.installment_number} actualizado: paid=${assign}, pendiente=${pendingAfter}, is_paid=${isFullyPaid}`);
            remaining -= assign;
          }
        }
      }

      // Si se pagó mora, actualizar el campo late_fee_paid en las cuotas afectadas
      if (data.late_fee_amount && data.late_fee_amount > 0 && lateFeeBreakdown) {
        console.log('🔍 PaymentForm: Distribuyendo pago de mora entre cuotas...');
        let remainingLateFeePayment = data.late_fee_amount;
        
        // Obtener TODAS las cuotas del préstamo (no solo las del desglose actual)
        const { data: allInstallments, error: installmentsError } = await supabase
          .from('installments')
          .select('installment_number, late_fee_paid, is_paid, due_date, principal_amount')
          .eq('loan_id', data.loan_id)
          .order('installment_number', { ascending: true });
        
        if (installmentsError) {
          console.error('Error obteniendo cuotas:', installmentsError);
        } else {
          console.log('🔍 PaymentForm: Todas las cuotas obtenidas:', allInstallments);
          
          // Procesar solo las cuotas que NO están pagadas y tienen mora
          for (const installment of allInstallments || []) {
            if (remainingLateFeePayment <= 0) break;
            if (installment.is_paid) continue; // Saltar cuotas ya pagadas
            
            const currentLateFeePaid = installment.late_fee_paid || 0;
            
            // Calcular la mora total de esta cuota (sin considerar pagos previos)
            const dueDate = new Date(installment.due_date);
            const calculationDate = getCurrentDateInSantoDomingo();
            const daysSinceDue = Math.floor((calculationDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
            const daysOverdue = Math.max(0, daysSinceDue - (selectedLoan.grace_period_days || 0));
            
            // For indefinite loans, regular cuotas have principal_amount=0; use interest_amount instead.
            const isIndefiniteForDist = String(selectedLoan.amortization_type || '').toLowerCase() === 'indefinite';
            const baseForMora = isIndefiniteForDist && (!installment.principal_amount || installment.principal_amount === 0)
              ? (installment.interest_amount || installment.total_amount || installment.amount || 0)
              : installment.principal_amount;

            let totalLateFeeForThisInstallment = 0;
            if (daysOverdue > 0) {
              switch (selectedLoan.late_fee_calculation_type) {
                case 'daily':
                  totalLateFeeForThisInstallment = (baseForMora * selectedLoan.late_fee_rate / 100) * daysOverdue;
                  break;
                case 'monthly':
                  const monthsOverdue = Math.ceil(daysOverdue / 30);
                  totalLateFeeForThisInstallment = (baseForMora * selectedLoan.late_fee_rate / 100) * monthsOverdue;
                  break;
                case 'compound':
                  totalLateFeeForThisInstallment = baseForMora * (Math.pow(1 + selectedLoan.late_fee_rate / 100, daysOverdue) - 1);
                  break;
                default:
                  totalLateFeeForThisInstallment = (baseForMora * selectedLoan.late_fee_rate / 100) * daysOverdue;
              }
              
              if (selectedLoan.max_late_fee && selectedLoan.max_late_fee > 0) {
                totalLateFeeForThisInstallment = Math.min(totalLateFeeForThisInstallment, selectedLoan.max_late_fee);
              }
              
              totalLateFeeForThisInstallment = Math.round(totalLateFeeForThisInstallment * 100) / 100;
            }
            
            // Calcular cuánta mora queda por pagar en esta cuota
            const remainingLateFeeForThisInstallment = Math.max(0, totalLateFeeForThisInstallment - currentLateFeePaid);
            
            console.log(`🔍 PaymentForm: Cuota ${installment.installment_number}:`, {
              totalLateFeeForThisInstallment,
              currentLateFeePaid,
              remainingLateFeeForThisInstallment,
              remainingLateFeePayment,
              daysOverdue
            });
            
            // Solo aplicar pago si queda mora pendiente en esta cuota
            if (remainingLateFeeForThisInstallment > 0) {
              const moraToPay = Math.min(remainingLateFeePayment, remainingLateFeeForThisInstallment);
              const newLateFeePaid = currentLateFeePaid + moraToPay;
              
              console.log(`🔍 PaymentForm: Aplicando pago a cuota ${installment.installment_number}:`, {
                moraToPay,
                currentLateFeePaid,
                newLateFeePaid
              });
              
              // Actualizar el campo late_fee_paid de esta cuota
              const { error: updateError } = await supabase
                .from('installments')
                .update({ late_fee_paid: newLateFeePaid })
                .eq('loan_id', data.loan_id)
                .eq('installment_number', installment.installment_number);
              
              if (updateError) {
                console.error(`Error actualizando late_fee_paid para cuota ${installment.installment_number}:`, updateError);
              } else {
                console.log(`✅ Cuota ${installment.installment_number}: late_fee_paid actualizado de ${currentLateFeePaid} a ${newLateFeePaid}`);
              }
              
              remainingLateFeePayment -= moraToPay;
            }
          }
        }
        
        if (remainingLateFeePayment > 0) {
          console.log(`⚠️ PaymentForm: Quedó mora sin aplicar: ${formatCurrency(remainingLateFeePayment)}`);
        }
        
        console.log('🔍 PaymentForm: Distribución de mora completada');
      }

      // CORRECCIÓN: NO calcular remaining_balance manualmente aquí
      // Los triggers de la BD ya actualizan remaining_balance automáticamente cuando se inserta el pago
      // Incluirlo aquí sobrescribiría el valor correcto calculado por los triggers (que incluye cargos)
      // Solo necesitamos obtener el valor actualizado de la BD después de que los triggers lo calculen
      // Por ahora, usamos el valor actual como placeholder, pero NO lo incluiremos en el update
      // Placeholder: usar el balance actual del préstamo (no el monto original).
      const placeholderBalance = remainingBalance;
      
      // Actualizar la fecha del próximo pago
      // Para cargos, mantener el due_date del cargo hasta que se complete completamente
      let nextPaymentDate = selectedLoan.next_payment_date;
      let updatedPaidInstallments = selectedLoan.paid_installments || [];
      
      // NOTA: El código de abajo marca las cuotas como pagadas, lo cual también dispara triggers
      // Por lo tanto, después de marcar las cuotas, esperaremos nuevamente para que los triggers completen

      // Verificar si se completó un cargo (incluso con pagos parciales)
      let chargeCompleted = false;
      let currentChargeDueDate = null;
      if (nextPaymentInfo?.isCharge && nextPaymentInfo.dueDate) {
        currentChargeDueDate = nextPaymentInfo.dueDate.split('T')[0];
        // Buscar la primera cuota pendiente para verificar si es el cargo que estamos pagando
        const { data: firstUnpaid } = await supabase
          .from('installments')
          .select('due_date, total_amount, installment_number, principal_amount, interest_amount')
          .eq('loan_id', data.loan_id)
          .eq('is_paid', false)
          .order('due_date', { ascending: true })
          .limit(1);
        
        if (firstUnpaid && firstUnpaid.length > 0 && firstUnpaid[0].due_date.split('T')[0] === currentChargeDueDate) {
          // Obtener todos los cargos con la misma fecha ordenados por installment_number
          const { data: chargesWithSameDate } = await supabase
            .from('installments')
            .select('installment_number, total_amount, is_paid, due_date')
            .eq('loan_id', data.loan_id)
            .eq('due_date', firstUnpaid[0].due_date.split('T')[0])
            .eq('interest_amount', 0)
            .order('installment_number', { ascending: true });
          
          // Buscar todos los pagos para cargos de esta fecha (sin interés)
          const { data: allPaymentsForCharge } = await supabase
            .from('payments')
            .select('amount, principal_amount, interest_amount')
            .eq('loan_id', data.loan_id)
            .eq('due_date', firstUnpaid[0].due_date.split('T')[0]);
          
          // Filtrar pagos sin interés (cargos)
          const paymentsForCharges = (allPaymentsForCharge || []).filter(p => 
            Math.abs(p.interest_amount || 0) < 0.01
          );
          
          // Calcular total pagado a cargos de esta fecha
          const totalPaidForDate = paymentsForCharges.reduce((sum, p) => 
            sum + (p.principal_amount || p.amount || 0), 0
          );
          
          // Encontrar la posición de este cargo
          const chargeIndex = chargesWithSameDate?.findIndex(c => 
            c.installment_number === firstUnpaid[0].installment_number
          ) ?? -1;
          
          let totalPaidForCharge = 0;
          if (chargeIndex >= 0 && chargesWithSameDate) {
            // Asignar pagos secuencialmente
            let remainingPayments = totalPaidForDate;
            
            for (let i = 0; i < chargeIndex; i++) {
              const prevCharge = chargesWithSameDate[i];
              const amountForPrevCharge = Math.min(remainingPayments, prevCharge.total_amount);
              remainingPayments -= amountForPrevCharge;
            }
            
            totalPaidForCharge = Math.min(remainingPayments, firstUnpaid[0].total_amount);
          } else {
            totalPaidForCharge = Math.min(totalPaidForDate, firstUnpaid[0].total_amount);
          }
          
          // Agregar el pago actual (que aún no está en la BD)
          const totalPaidAfter = totalPaidForCharge + principalPayment;
          chargeCompleted = totalPaidAfter >= firstUnpaid[0].total_amount * 0.99;
          
          // Si el cargo no se completó, mantener el due_date del cargo como next_payment_date
          if (!chargeCompleted && currentChargeDueDate) {
            nextPaymentDate = currentChargeDueDate;
            console.log('🔍 PaymentForm: Cargo parcialmente pagado, manteniendo due_date del cargo:', nextPaymentDate);
          }
        }
      }

      if (isFullPayment || chargeCompleted) {
        // CORRECCIÓN: Para préstamos indefinidos, calcular la próxima fecha desde start_date
        // basándose en el número de cuotas pagadas, no desde next_payment_date
        if (selectedLoan.amortization_type === 'indefinite') {
          // Obtener todos los pagos EXCEPTO el actual (que aún no está en la BD)
          // para calcular cuántas cuotas se han pagado ANTES de este pago
          const { data: allPayments } = await supabase
            .from('payments')
            .select('interest_amount')
            .eq('loan_id', selectedLoan.id)
            .order('payment_date', { ascending: true });
          
          // Calcular cuántas cuotas se han pagado basándose en el interés pagado
          const interestPerPayment = (selectedLoan.amount * selectedLoan.interest_rate) / 100;
          let paidInstallmentsCount = 0;
          let currentInstallmentInterestPaid = 0;
          
          // Contar cuotas pagadas ANTES del pago actual
          if (allPayments && allPayments.length > 0) {
            for (const payment of allPayments) {
              currentInstallmentInterestPaid += payment.interest_amount || 0;
              if (currentInstallmentInterestPaid >= interestPerPayment) {
                paidInstallmentsCount++;
                currentInstallmentInterestPaid = 0;
              }
            }
          }
          
          // CORRECCIÓN: Incluir el pago actual que se está registrando
          // Este pago también completa una cuota, así que debemos contarlo
          currentInstallmentInterestPaid += interestPayment;
          if (currentInstallmentInterestPaid >= interestPerPayment) {
            paidInstallmentsCount++;
            currentInstallmentInterestPaid = 0;
          }
          
          // La próxima cuota NO PAGADA es la cuota (paidInstallmentsCount + 1)
          // Si se pagó 1 cuota, la próxima no pagada es la cuota 2
          
          // Calcular la próxima fecha desde start_date + (número de cuotas pagadas + 1) períodos
          const startDateStr = selectedLoan.start_date.split('T')[0];
          const [startYear, startMonth, startDay] = startDateStr.split('-').map(Number);
          const startDate = new Date(startYear, startMonth - 1, startDay);
          
          // Calcular la primera fecha de pago (un período después de start_date)
          const firstPaymentDate = new Date(startDate);
          const frequency = selectedLoan.payment_frequency || 'monthly';
          
          switch (frequency) {
            case 'daily':
              firstPaymentDate.setDate(startDate.getDate() + 1);
              break;
            case 'weekly':
              firstPaymentDate.setDate(startDate.getDate() + 7);
              break;
            case 'biweekly':
              firstPaymentDate.setDate(startDate.getDate() + 14);
              break;
            case 'monthly':
            default:
              // Para indefinidos, preservar el día del mes de start_date
              const startDay = startDate.getDate();
              const nextMonth = startDate.getMonth() + 1;
              const nextYear = startDate.getFullYear();
              // Verificar si el día existe en el mes siguiente
              const lastDayOfNextMonth = new Date(nextYear, nextMonth + 1, 0).getDate();
              const dayToUse = Math.min(startDay, lastDayOfNextMonth);
              firstPaymentDate.setFullYear(nextYear, nextMonth, dayToUse);
              break;
          }
          
          // CORRECCIÓN: Calcular la primera cuota NO PAGADA (vencida o no)
          // Si se pagó 1 cuota (noviembre), la próxima cuota no pagada es la cuota 2 (diciembre)
          // La cuota 2 está a 1 período después de la primera cuota (noviembre)
          const nextDate = new Date(firstPaymentDate);
          // La próxima cuota no pagada está a 'paidInstallmentsCount' períodos de la primera cuota
          // Si se pagó 1 cuota, la próxima no pagada es la cuota 2, que está a 1 período de la primera
          const periodsToAdd = paidInstallmentsCount; // La próxima cuota no pagada está a 'paidInstallmentsCount' períodos de la primera
          
          console.log('🔍 PaymentForm: Cálculo de próxima fecha para indefinido:', {
            startDate: startDateStr,
            firstPaymentDate: `${firstPaymentDate.getFullYear()}-${String(firstPaymentDate.getMonth() + 1).padStart(2, '0')}-${String(firstPaymentDate.getDate()).padStart(2, '0')}`,
            paidInstallmentsCount,
            periodsToAdd,
            interestPerPayment,
            currentPaymentInterest: interestPayment
          });
          
          switch (frequency) {
            case 'daily':
              nextDate.setDate(firstPaymentDate.getDate() + periodsToAdd);
              break;
            case 'weekly':
              nextDate.setDate(firstPaymentDate.getDate() + (periodsToAdd * 7));
              break;
            case 'biweekly':
              nextDate.setDate(firstPaymentDate.getDate() + (periodsToAdd * 14));
              break;
            case 'monthly':
            default:
              // Preservar el día del mes de firstPaymentDate
              const paymentDay = firstPaymentDate.getDate();
              const targetMonth = firstPaymentDate.getMonth() + periodsToAdd;
              const targetYear = firstPaymentDate.getFullYear();
              // Verificar si el día existe en el mes objetivo
              const lastDayOfTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
              const dayToUse = Math.min(paymentDay, lastDayOfTargetMonth);
              nextDate.setFullYear(targetYear, targetMonth, dayToUse);
              break;
          }
          
          // Formatear como YYYY-MM-DD
          const finalYear = nextDate.getFullYear();
          const finalMonth = String(nextDate.getMonth() + 1).padStart(2, '0');
          const finalDay = String(nextDate.getDate()).padStart(2, '0');
          nextPaymentDate = `${finalYear}-${finalMonth}-${finalDay}`;
        } else if (chargeCompleted) {
          // Si se completó un cargo, buscar la siguiente cuota/cargo pendiente
          const { data: nextUnpaid } = await supabase
            .from('installments')
            .select('due_date')
            .eq('loan_id', data.loan_id)
            .eq('is_paid', false)
            .order('due_date', { ascending: true })
            .limit(1);
          
          if (nextUnpaid && nextUnpaid.length > 0) {
            nextPaymentDate = nextUnpaid[0].due_date.split('T')[0];
            console.log('🔍 PaymentForm: Cargo completado, próxima fecha actualizada a:', nextPaymentDate);
          }
        } else {
          // Para otros tipos de préstamos, usar la lógica original
        const [year, month, day] = selectedLoan.next_payment_date.split('-').map(Number);
          const nextDate = new Date(year, month - 1, day);

        switch (selectedLoan.payment_frequency) {
          case 'daily':
            nextDate.setDate(nextDate.getDate() + 1);
            break;
          case 'weekly':
            nextDate.setDate(nextDate.getDate() + 7);
            break;
          case 'biweekly':
            nextDate.setDate(nextDate.getDate() + 14);
            break;
          case 'monthly':
              const originalDay = nextDate.getDate();
            nextDate.setFullYear(nextDate.getFullYear(), nextDate.getMonth() + 1, originalDay);
            break;
          case 'quarterly':
            const originalDayQuarterly = nextDate.getDate();
            nextDate.setFullYear(nextDate.getFullYear(), nextDate.getMonth() + 3, originalDayQuarterly);
            break;
          case 'yearly':
            const originalDayYearly = nextDate.getDate();
            nextDate.setFullYear(nextDate.getFullYear() + 1, nextDate.getMonth(), originalDayYearly);
            break;
          default:
            const originalDayDefault = nextDate.getDate();
            nextDate.setFullYear(nextDate.getFullYear(), nextDate.getMonth() + 1, originalDayDefault);
        }

        const finalYear = nextDate.getFullYear();
        const finalMonth = String(nextDate.getMonth() + 1).padStart(2, '0');
        const finalDay = String(nextDate.getDate()).padStart(2, '0');
        nextPaymentDate = `${finalYear}-${finalMonth}-${finalDay}`;
        }

        // CORRECCIÓN: Si el pago es para un cargo, buscar específicamente ese cargo
        // Si no es cargo, buscar la primera cuota NO pagada ordenada por fecha de vencimiento
        let firstUnpaidInstallment = null;
        let firstUnpaidInstallmentNumber = null;

        // Si es un cargo, buscar específicamente ese cargo
        if (nextPaymentInfo?.isCharge && nextPaymentInfo.dueDate) {
          const chargeDueDate = nextPaymentInfo.dueDate.split('T')[0];
          const { data: chargeInstallments, error: chargeError } = await supabase
            .from('installments')
            .select('id, installment_number, due_date, is_paid, paid_amount, principal_amount, interest_amount, total_amount')
            .eq('loan_id', data.loan_id)
            .eq('due_date', chargeDueDate)
            .eq('is_paid', false)
            .eq('interest_amount', 0) // Solo cargos
            .order('installment_number', { ascending: true });
          
          if (!chargeError && chargeInstallments && chargeInstallments.length > 0) {
            const firstWithPending = chargeInstallments.find((c: any) => ((c.total_amount || 0) - (c.paid_amount || 0)) > 0.01);
            if (firstWithPending) {
              firstUnpaidInstallment = firstWithPending;
              firstUnpaidInstallmentNumber = firstUnpaidInstallment.installment_number;
            }
            console.log('🔍 PaymentForm: Cargo encontrado para el pago:', {
              installmentNumber: firstUnpaidInstallmentNumber,
              dueDate: chargeDueDate
            });
          }
        }

        // Si no se encontró un cargo específico, buscar la primera cuota pendiente ordenada por fecha
        if (!firstUnpaidInstallment) {
          const { data: unpaidInstallments, error: unpaidError } = await supabase
            .from('installments')
            .select('id, installment_number, due_date, is_paid, paid_amount, principal_amount, interest_amount, total_amount')
            .eq('loan_id', data.loan_id)
            .eq('is_paid', false)
            .order('due_date', { ascending: true })
            .limit(1);

          if (!unpaidError && unpaidInstallments && unpaidInstallments.length > 0) {
            firstUnpaidInstallment = unpaidInstallments[0];
            firstUnpaidInstallmentNumber = firstUnpaidInstallment.installment_number;
          }
        }

        if (firstUnpaidInstallment) {
          
          // Verificar si el pago cubre esta cuota
          const installmentAmount = firstUnpaidInstallment.total_amount;
          const isCharge = firstUnpaidInstallment.interest_amount === 0 && 
                          firstUnpaidInstallment.principal_amount === firstUnpaidInstallment.total_amount;
          
          // Si es un cargo, el pago debe cubrir el monto completo del cargo (acumulando pagos parciales)
          // Si es una cuota regular, verificar si el pago cubre suficiente capital e interés
          let paymentCoversInstallment = false;
          
          if (isCharge) {
            // CORRECCIÓN: Para cargos, necesitamos asignar pagos específicamente a este cargo por installment_number
            // Considerando que puede haber múltiples cargos con la misma fecha
            const chargeDueDate = firstUnpaidInstallment.due_date.split('T')[0];
            
            // Obtener todos los cargos con la misma fecha ordenados por installment_number
            const { data: chargesWithSameDate } = await supabase
              .from('installments')
              .select('id, installment_number, total_amount, is_paid, due_date')
              .eq('loan_id', data.loan_id)
              .eq('due_date', firstUnpaidInstallment.due_date)
              .eq('interest_amount', 0)
              .order('installment_number', { ascending: true });
            
            // Obtener todos los pagos que podrían corresponder a cargos de esta fecha
            const { data: allPaymentsForLoan } = await supabase
              .from('payments')
              .select('amount, principal_amount, interest_amount, due_date, payment_date')
              .eq('loan_id', data.loan_id)
              .order('payment_date', { ascending: true });
            
            // Filtrar pagos que corresponden a cargos de esta fecha (sin interés)
            const paymentsForCharges = (allPaymentsForLoan || []).filter(p => {
              const paymentDueDate = (p.due_date as string)?.split('T')[0];
              const hasNoInterest = (p.interest_amount || 0) < 0.01;
              return paymentDueDate === chargeDueDate && hasNoInterest;
            });
            
            // Calcular el total pagado a cargos de esta fecha
            // IMPORTANTE: Usar solo los pagos que ya están en la BD (no incluir el pago actual que aún no está insertado)
            const totalPaidForDate = paymentsForCharges.reduce((sum, p) => sum + (p.principal_amount || p.amount || 0), 0);
            
            // Encontrar la posición de este cargo en la lista
            const chargeIndex = chargesWithSameDate?.findIndex(c => c.installment_number === firstUnpaidInstallmentNumber) ?? -1;
            
            let totalPaidForCharge = 0;
            if (chargeIndex >= 0 && chargesWithSameDate) {
              // Asignar pagos secuencialmente a los cargos con la misma fecha
              // Los pagos se asignan a los cargos en orden de installment_number
              let remainingPayments = totalPaidForDate;
              
              for (let i = 0; i < chargeIndex; i++) {
                const prevCharge = chargesWithSameDate[i];
                // Asignar pagos al cargo anterior hasta completarlo
                const amountForPrevCharge = Math.min(remainingPayments, prevCharge.total_amount);
                remainingPayments -= amountForPrevCharge;
              }
              
              // El monto pagado a este cargo específico es lo que queda después de pagar los anteriores
              totalPaidForCharge = Math.min(remainingPayments, installmentAmount);
            } else {
              // Fallback: si no hay otros cargos, todos los pagos van a este cargo
              totalPaidForCharge = Math.min(totalPaidForDate, installmentAmount);
            }
            
            // Calcular el total pagado ANTES del pago actual (solo pagos ya en la BD)
            const totalPaidBefore = totalPaidForCharge;
            
            // Agregar el pago actual (que aún no está en la BD) al cálculo
            // IMPORTANTE: Usar principal_amount del pago actual, no data.amount
            const totalPaidAfter = totalPaidBefore + principalPayment;
            
            // El cargo está cubierto si el total pagado (incluyendo este pago) cubre el monto del cargo
            // IMPORTANTE: Solo marcar como pagado si está completamente cubierto
            // Usar >= sin tolerancia para asegurar que solo se marca como pagado cuando está completamente cubierto
            paymentCoversInstallment = totalPaidAfter >= installmentAmount;
            
            // Siempre actualizar paid_amount en installments para que "Pagar Cargos" muestre el monto correcto
            // Usar enfoque aditivo: paid_amount existente + pago actual (más confiable que recalcular desde pagos)
            const chargeId = chargesWithSameDate?.[chargeIndex]?.id;
            if (chargeId) {
              const existingPaid = firstUnpaidInstallment.paid_amount ?? 0;
              const newPaidAmount = Math.round((existingPaid + principalPayment) * 100) / 100;
              const pendingAfter = (installmentAmount || 0) - newPaidAmount;
              // Solo marcar como completado si falta menos de 1 peso (evita marcar completo con RD$250+ pendientes)
              const isFullyPaid = pendingAfter < 1 && newPaidAmount >= (installmentAmount || 0) - 0.01;

              const { error: chargeUpdateError } = await supabase
                .from('installments')
                .update({
                  paid_amount: newPaidAmount,
                  is_paid: isFullyPaid,
                  ...(isFullyPaid ? { paid_date: new Date().toISOString().split('T')[0], late_fee_paid: 0 } : {})
                })
                .eq('id', chargeId);

              if (chargeUpdateError) {
                console.error('Error actualizando paid_amount del cargo:', chargeUpdateError);
              } else {
                console.log(`✅ Cargo ${firstUnpaidInstallmentNumber} actualizado: paid_amount=${newPaidAmount}, is_paid=${isFullyPaid}`);
              }
            }
            
            console.log('🔍 PaymentForm: Verificando cargo (con acumulación corregida):', {
              installmentNumber: firstUnpaidInstallmentNumber,
              paymentAmount: data.amount,
              installmentAmount,
              totalPaidBefore,
              totalPaidAfter,
              principalPayment,
              paymentCoversInstallment,
              chargeIndex,
              totalPaidForDate
            });
          } else {
            // Para cuotas regulares, verificar si el pago acumulado cubre esta cuota
            // En indefinidos NO usar acumulación global (y evita división por 0 cuando principalPerPayment = 0).
            // La cuota se considera cubierta si este pago completa lo que falta de la cuota actual (isFullPayment).
            // ✅ CORRECCIÓN (FIJOS): cubrir por due_date contra el total de la cuota (no por monto original/tasa).
            // Esto evita que, tras un abono a capital, una cuota "completa" quede como parcial por usar splits viejos.
            const dueKey = firstUnpaidInstallment.due_date?.split('T')[0] || firstUnpaidInstallment.due_date;
            const installmentTotal = (firstUnpaidInstallment.total_amount ?? ((firstUnpaidInstallment.principal_amount || 0) + (firstUnpaidInstallment.interest_amount || 0))) || 0;

            if (!dueKey) {
              paymentCoversInstallment = isFullPayment;
            } else {
              const { data: paymentsForDue } = await supabase
                .from('payments')
                .select('amount, due_date')
                .eq('loan_id', data.loan_id)
                .eq('due_date', dueKey);

              const totalPaidForDue = (paymentsForDue || []).reduce((s, p) => s + (Number(p.amount || 0) || 0), 0);
              paymentCoversInstallment = (totalPaidForDue + 0.05) >= Number(installmentTotal || 0);
            }
          }
          
          if (paymentCoversInstallment) {
          // Agregar esta cuota a las pagadas
            if (!updatedPaidInstallments.includes(firstUnpaidInstallmentNumber)) {
              updatedPaidInstallments.push(firstUnpaidInstallmentNumber);
          updatedPaidInstallments.sort((a, b) => a - b); // Mantener ordenado
            }

            console.log('🔍 PaymentForm: Cuota marcada como pagada (por fecha de vencimiento):', {
              paidInstallment: firstUnpaidInstallmentNumber,
              dueDate: firstUnpaidInstallment.due_date,
              isCharge,
              installmentAmount,
              principalPayment,
              interestPayment,
              updatedPaidInstallments
          });

          // Para cuotas REGULARES (no cargos): marcar como pagada
          // Los cargos ya se actualizaron arriba con paid_amount
          if (!isCharge) {
            const { error: installmentError } = await supabase
              .from('installments')
              .update({
                is_paid: true,
                paid_date: new Date().toISOString().split('T')[0],
                late_fee_paid: 0
              })
              .eq('loan_id', data.loan_id)
              .eq('installment_number', firstUnpaidInstallmentNumber);

            if (installmentError) {
              console.error('Error marcando cuota como pagada en installments:', installmentError);
            } else {
              console.log(`✅ Cuota ${firstUnpaidInstallmentNumber} (REGULAR) marcada como pagada en la tabla installments`);
            }
          }
          } else {
            console.log('⚠️ El pago no cubre completamente la primera cuota pendiente');
            if (isCharge) {
              console.log('⚠️ Cargo parcialmente pagado - paid_amount actualizado para "Pagar Cargos"');
            }
          }
        } else {
          console.log('⚠️ No se encontró ninguna cuota sin pagar para marcar');
        }
      }

      // La mora se recalculará automáticamente usando calculateLateFee
      // No restamos manualmente el abono de mora para evitar acumulación incorrecta

      // CORRECCIÓN: Esperar un momento para que los triggers completen el cálculo
      // Primero esperar después de insertar el pago
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Luego, si se marcó un installment como pagado arriba, esperar nuevamente para que ese trigger también complete
      // (Los triggers de installments también actualizan remaining_balance y next_payment_date)
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Obtener los valores actualizados de la BD (ya calculados por los triggers con cargos incluidos)
      // Reintentar varias veces si es necesario para asegurar que los triggers completaron
      let updatedLoanData: any = null;
      let fetchError: any = null;
      let retries = 3;
      
      while (retries > 0) {
        const result = await supabase
          .from('loans')
          .select('remaining_balance, next_payment_date')
          .eq('id', data.loan_id)
          .single();
        
        fetchError = result.error;
        updatedLoanData = result.data;
        
        // Si no hay error y tenemos datos, salir del loop
        if (!fetchError && updatedLoanData) {
          break;
        }
        
        retries--;
        if (retries > 0) {
          // Esperar un poco más antes de reintentar
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      let finalBalance = placeholderBalance;
      let finalNextPaymentDate = nextPaymentDate;
      
      if (!fetchError && updatedLoanData) {
        // Usar los valores calculados por los triggers (incluyen cargos)
        finalBalance = updatedLoanData.remaining_balance || placeholderBalance;
        // Si los triggers actualizaron next_payment_date, usarlo
        if (updatedLoanData.next_payment_date) {
          finalNextPaymentDate = updatedLoanData.next_payment_date.split('T')[0];
        }
      }

      // Para indefinidos: confiar en el balance que devuelven los triggers (incluye cargos).
      // NO restar manualmente (remainingBalance - pago): remainingBalance en cliente no incluye cargos
      // y provocaba doble resta (ej. pagar 2,000 de cargo bajaba 4,000).
      if (selectedLoan.amortization_type === 'indefinite') {
        // Si es pago parcial de cuota regular, NO avanzar next_payment_date: debe seguir en la misma cuota.
        if (!isFullPayment && !(nextPaymentInfo?.isCharge)) {
          finalNextPaymentDate = paymentDueDate;
        }
      }
      
      console.log('🔍 PaymentForm: Valores obtenidos de BD (calculados por triggers con cargos):', {
        loanId: data.loan_id,
        remaining_balance_from_bd: updatedLoanData?.remaining_balance,
        next_payment_date_from_bd: updatedLoanData?.next_payment_date,
        finalBalance,
        finalNextPaymentDate,
        bdCalculated: !fetchError && updatedLoanData
      });

      // Preparar datos de actualización del préstamo
      // CORRECCIÓN: NO incluir remaining_balance ni next_payment_date porque los triggers ya los actualizaron
      const loanUpdateData: any = {
        // remaining_balance: NO incluir - ya fue actualizado por los triggers de la BD (incluye cargos)
        // next_payment_date: NO incluir si los triggers lo actualizaron - usar el valor del trigger
        status: finalBalance <= 0 ? 'paid' : 'active',
        paid_installments: updatedPaidInstallments,
      };

      // Para indefinidos: forzar remaining_balance (y next_payment_date en pagos parciales) para no “saltar” de cuota.
      if (selectedLoan.amortization_type === 'indefinite') {
        if (!isFullPayment && !(nextPaymentInfo?.isCharge)) {
          loanUpdateData.next_payment_date = paymentDueDate;
        }
      }

      // Solo incluir next_payment_date si los triggers no lo actualizaron
      if (fetchError || !updatedLoanData?.next_payment_date) {
        loanUpdateData.next_payment_date = finalNextPaymentDate;
      }

      // Si se pagó mora, mantener `total_late_fee_paid` determinístico:
      // recalcular desde `payments.late_fee` (evita desincronización al eliminar/editar pagos)
      if (data.late_fee_amount && data.late_fee_amount > 0) {
        const { data: lateFeeRows, error: lateFeeSumError } = await supabase
          .from('payments')
          .select('late_fee')
          .eq('loan_id', data.loan_id)
          .not('late_fee', 'is', null);

        if (lateFeeSumError) {
          console.error('🔍 PaymentForm: Error recalculando total_late_fee_paid:', lateFeeSumError);
        } else {
          const totalLateFeePaid = (lateFeeRows || []).reduce((sum, p: any) => sum + (Number(p.late_fee) || 0), 0);
          loanUpdateData.total_late_fee_paid = totalLateFeePaid;
          console.log('🔍 PaymentForm: total_late_fee_paid recalculado desde payments:', totalLateFeePaid);
        }
      }

      const { data: updatedLoan, error: loanError } = await supabase
        .from('loans')
        .update(loanUpdateData)
        .eq('id', data.loan_id)
        .select();

      if (loanError) {
        console.error('🔍 PaymentForm: Error actualizando préstamo:', loanError);
        throw loanError;
      }
      
      console.log('🔍 PaymentForm: Préstamo actualizado exitosamente:', updatedLoan);

      let successMessage = isFullPayment 
        ? 'Pago completo registrado exitosamente' 
        : 'Pago parcial registrado exitosamente';
      
      if (data.late_fee_amount && data.late_fee_amount > 0) {
        const lateFeeAmount = roundToTwoDecimals(data.late_fee_amount);
        successMessage += ` + Mora de RD$${lateFeeAmount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      }
      
      console.log('🔍 PaymentForm: Resumen del pago registrado:', {
        cuotaPagada: data.amount,
        capitalPagado: principalPayment,
        interesPagado: interestPayment,
        moraPagada: data.late_fee_amount || 0,
        balanceAnterior: remainingBalance,
        balanceNuevo: finalBalance
      });
      
      toast.success(successMessage);

      // ✅ Notificar al módulo/listados que recalculen balances y "Próximo Pago"
      try {
        window.dispatchEvent(
          new CustomEvent('installmentsUpdated', {
            detail: { loanId: data.loan_id, source: 'PaymentForm' }
          })
        );
      } catch {
        // no-op
      }
      
      // Obtener el teléfono del cliente desde la base de datos si no está disponible
      let clientPhone = selectedLoan.client?.phone;
      if (!clientPhone) {
        try {
          // Primero obtener el client_id del préstamo
          const { data: loanData } = await supabase
            .from('loans')
            .select('client_id')
            .eq('id', data.loan_id)
            .single();
          
          if (loanData?.client_id) {
            // Obtener el teléfono del cliente
            const { data: clientData } = await supabase
              .from('clients')
              .select('phone')
              .eq('id', loanData.client_id)
              .maybeSingle();
            
            if (clientData) {
              clientPhone = clientData.phone || clientPhone;
            }
          }
        } catch (error) {
          console.error('Error obteniendo teléfono del cliente:', error);
        }
      }
      
      // Guardar datos del pago para el diálogo de WhatsApp
      setLastPaymentData({
        payment: insertedPayment?.[0],
        loan: {
          ...selectedLoan,
          client: {
            ...selectedLoan.client,
            phone: clientPhone || selectedLoan.client?.phone
          }
        },
        paymentDate: formatDateStringForSantoDomingo(paymentDate),
        principalPayment,
        interestAmount: interestPayment,
        lateFeeAmount: data.late_fee_amount || 0,
        paymentMethod: data.payment_method,
        referenceNumber: data.reference_number,
        remainingBalance: finalBalance,
        nextPaymentDate: formatDateStringForSantoDomingo(finalNextPaymentDate)
      });
      
      // Mostrar primero el modal de impresión
      setShowPrintFormatModal(true);
      
      // Recalcular automáticamente la mora después del pago usando la función correcta
      try {
        console.log('🔍 PaymentForm: Recalculando mora después del pago...');
        
        // Preparar los datos actualizados del préstamo
        const updatedLoanData = {
          id: data.loan_id,
          remaining_balance: finalBalance,
          next_payment_date: finalNextPaymentDate,
          late_fee_rate: selectedLoan.late_fee_rate || 0,
          grace_period_days: selectedLoan.grace_period_days || 0,
          max_late_fee: selectedLoan.max_late_fee || 0,
          late_fee_calculation_type: selectedLoan.late_fee_calculation_type || 'daily',
          late_fee_enabled: selectedLoan.late_fee_enabled || false,
          amount: selectedLoan.amount,
          term: selectedLoan.term_months || 4,
          payment_frequency: selectedLoan.payment_frequency || 'monthly',
          interest_rate: selectedLoan.interest_rate,
          monthly_payment: selectedLoan.monthly_payment,
          start_date: selectedLoan.start_date
        };
        
        // USAR LA FUNCIÓN CORRECTA QUE CONSIDERA PAGOS PARCIALES
        console.log('🔍 PaymentForm: Recalculando con getLateFeeBreakdownFromInstallments...');
        const updatedBreakdown = await getLateFeeBreakdownFromInstallments(data.loan_id, updatedLoanData);
        
        console.log('🔍 PaymentForm: Desglose actualizado después del pago:', updatedBreakdown);
        
        // Actualizar la mora en la base de datos con el resultado correcto
        const { error: lateFeeError } = await supabase
          .from('loans')
          .update({ 
            current_late_fee: updatedBreakdown.totalLateFee,
            last_late_fee_calculation: new Date().toISOString().split('T')[0]
          })
          .eq('id', data.loan_id);
          
        if (lateFeeError) {
          console.error('Error actualizando mora:', lateFeeError);
        } else {
          console.log('🔍 PaymentForm: Mora recalculada exitosamente considerando pagos parciales:', updatedBreakdown.totalLateFee);
        }
      } catch (error) {
        console.error('Error recalculando mora:', error);
      }
      
      // Actualizar el estado del pago
      await refetchPaymentStatus();
      
      // Llamar al callback para actualizar los datos del padre
      if (onPaymentSuccess) {
        onPaymentSuccess();
      }
      
      // No cerrar el formulario todavía, esperar a que el usuario decida sobre WhatsApp
      // El diálogo de WhatsApp se encargará de cerrar cuando corresponda
    } catch (error) {
      console.error('Error registering payment:', error);
      toast.error('Error al registrar el pago');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver
        </Button>
        <h2 className="text-2xl font-bold">Registrar Pago</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Información del Pago</CardTitle>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  {/* Búsqueda de Préstamo */}
                  <div className="space-y-2">
                    <FormLabel>Préstamo:</FormLabel>
                    <div className="relative">
                      <div className="flex items-center">
                        <Search className="h-4 w-4 text-gray-400 absolute left-3 z-10" />
                        <Input
                          placeholder="Buscar préstamo por cliente..."
                          value={loanSearch}
                          onChange={(e) => handleLoanSearch(e.target.value)}
                          className="pl-10"
                          onFocus={() => setShowLoanDropdown(filteredLoans.length > 0)}
                        />
                      </div>
                      
                      {showLoanDropdown && (
                        <div className="absolute top-full left-0 right-0 bg-white border border-gray-300 rounded-md shadow-lg z-20 max-h-60 overflow-y-auto">
                          {filteredLoans.map((loan) => (
                            <div
                              key={loan.id}
                              className="p-3 hover:bg-gray-100 cursor-pointer border-b"
                              onClick={() => selectLoan(loan)}
                            >
                              <div className="font-medium">{loan.client?.full_name}</div>
                              <div className="text-sm text-gray-600">
                                {loan.client?.dni} • Balance: ${formatCurrencyNumber(loan.remaining_balance)}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    {selectedLoan && (
                      <div className="space-y-3 p-3 bg-blue-50 rounded">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-blue-600" />
                          <span className="font-medium">{selectedLoan.client?.full_name}</span>
                          <Badge variant="outline">{selectedLoan.client?.dni}</Badge>
                        </div>
                        {preselectedLoan && (
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <span className="font-medium text-gray-600">Balance Restante:</span>
                              <div className="text-lg font-bold text-green-600">
                                {computedBalancePending === null
                                  ? 'Cargando...'
                                  : `$${formatCurrencyNumber(
                                      Number(computedBalancePending) + (Number(computedPendingCharges || 0) || 0)
                                    )}`}
                              </div>
                            </div>
                            <div>
                              <span className="font-medium text-gray-600">Próximo Pago:</span>
                              <div className="text-sm">
                                {(() => {
                                  const next =
                                    (nextPaymentInfo?.dueDate ? String(nextPaymentInfo.dueDate).split('T')[0] : null);
                                  if (next) return next;
                                  const amort = String(selectedLoan.amortization_type || '').toLowerCase();
                                  if (amort === 'indefinite' && selectedLoan.start_date) {
                                    const startIso = String(selectedLoan.start_date).split('T')[0];
                                    const freq = String(selectedLoan.payment_frequency || 'monthly');
                                    return addPeriodIsoForIndefinite(startIso, freq);
                                  }
                                  return selectedLoan.next_payment_date || 'N/A';
                                })()}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Mostrar distribución del pago en tiempo real */}
        {selectedLoan && paymentAmount > 0 && paymentDistribution && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="text-sm font-medium text-green-800 mb-2">
              📊 Distribución del Pago (${formatCurrency(paymentAmount)})
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-green-700">Interés fijo por cuota:</span>
                <span className="font-semibold">{formatCurrency(paymentDistribution.monthlyInterestAmount)}</span>
              </div>
              {paymentDistribution.alreadyPaidInterest > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-green-700">Interés ya pagado:</span>
                  <span className="font-semibold text-gray-600">{formatCurrency(paymentDistribution.alreadyPaidInterest)}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-green-700">Interés pendiente:</span>
                <span className="font-semibold text-orange-600">{formatCurrency(paymentDistribution.remainingInterest)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-green-700">Se aplica al interés:</span>
                <span className="font-semibold text-orange-600">{formatCurrency(paymentDistribution.interestPayment)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-green-700">Se aplica al capital:</span>
                <span className="font-semibold text-blue-600">{formatCurrency(paymentDistribution.principalPayment)}</span>
              </div>
              {paymentDistribution.interestPayment < paymentDistribution.remainingInterest && (
                <div className="mt-2 p-2 bg-yellow-100 border border-yellow-300 rounded text-xs text-yellow-800">
                  ⚠️ Pago parcial al interés. Queda pendiente: {formatCurrency(paymentDistribution.remainingInterest - paymentDistribution.interestPayment)}
                </div>
              )}
              {paymentDistribution.principalPayment > 0 && (
                <div className="mt-2 p-2 bg-blue-100 border border-blue-300 rounded text-xs text-blue-800">
                  ✅ El balance del préstamo se reducirá en {formatCurrency(paymentDistribution.principalPayment)}
                </div>
              )}
              {paymentDistribution.interestPayment === paymentDistribution.remainingInterest && paymentDistribution.interestPayment > 0 && (
                <div className="mt-2 p-2 bg-green-100 border border-green-300 rounded text-xs text-green-800">
                  ✅ Interés de la cuota completado
                </div>
              )}
            </div>
          </div>
        )}

        {/* Resumen del pago total */}
        {selectedLoan && (paymentAmount > 0 || (form.watch('late_fee_amount') || 0) > 0) && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="text-sm font-medium text-blue-800 mb-2">
              💰 Resumen del Pago Total
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-blue-700">Pago de cuota:</span>
                <span className="font-semibold">{formatCurrency(paymentAmount)}</span>
              </div>
              {form.watch('late_fee_amount') && form.watch('late_fee_amount') > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-blue-700">Pago de mora:</span>
                  <span className="font-semibold text-orange-600">RD${roundToTwoDecimals(form.watch('late_fee_amount') || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              )}
              <div className="border-t pt-2 flex justify-between items-center">
                <span className="text-blue-800 font-medium">Total a pagar:</span>
                <span className="font-bold text-lg text-blue-800">
                  {formatCurrency(paymentAmount + (form.watch('late_fee_amount') || 0))}
                </span>
              </div>
            </div>
          </div>
        )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="amount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Monto del Pago (Cuota)</FormLabel>
                          <FormControl>
                            <NumberInput
                              step="0.01"
                              min="0"
                              placeholder={paymentStatusReady ? "0.00" : "Cargando..."}
                              {...field}
                              // Solo mostrar valor cuando los datos estén listos (evita render con valor incorrecto)
                              value={paymentStatusReady ? (field.value || '') : ''}
                              disabled={!paymentStatusReady || isAmountLoading}
                              className={isAmountLoading ? "animate-pulse bg-gray-100" : ""}
                              onChange={async (e) => {
                                // Marcar que el usuario está editando manualmente
                                isUserEditingAmountRef.current = true;
                                
                                const value = e.target.value;
                                const numValue = value === '' ? 0 : parseFloat(value) || 0;
                                const roundedValue = roundToTwoDecimals(numValue);
                                field.onChange(roundedValue);
                                setPaymentAmount(roundedValue);
                                
                                // Calcular distribución en tiempo real
                                if (selectedLoan && roundedValue > 0) {
                                  const distribution = await calculatePaymentDistribution(roundedValue);
                                  setPaymentDistribution(distribution);
                                } else {
                                  setPaymentDistribution(null);
                                }
                                
                                // Permitir que el useEffect actualice el valor después de un breve delay
                                // Esto permite que el usuario pueda editar sin que se restablezca inmediatamente
                                setTimeout(() => {
                                  isUserEditingAmountRef.current = false;
                                }, 1000);
                              }}
                              onFocus={() => {
                                // Marcar que el usuario está editando cuando hace focus en el campo
                                isUserEditingAmountRef.current = true;
                              }}
                              onBlur={() => {
                                // Permitir actualizaciones automáticas después de que el usuario termine de editar
                                setTimeout(() => {
                                  isUserEditingAmountRef.current = false;
                                }, 500);
                              }}
                            />
                          </FormControl>
                          {paymentStatus.currentPaymentRemaining < selectedLoan?.monthly_payment && paymentStatus.currentPaymentRemaining > 0 && (
                            <div className="text-xs text-blue-600 mt-1">
                              💡 Monto pre-llenado para completar la cuota actual
                            </div>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Campo para pago de mora - siempre mostrar si hay mora habilitada */}
                    {selectedLoan?.late_fee_enabled && (
                      <FormField
                        control={form.control}
                        name="late_fee_amount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="flex items-center gap-2">
                              <AlertTriangle className="h-4 w-4 text-orange-600" />
                              Pago de Mora (Opcional)
                            </FormLabel>
                            <div className="flex gap-2">
                              <FormControl>
                                <NumberInput
                                  step="0.01"
                                  min="0"
                                  max={roundToTwoDecimals(lateFeeAmount)}
                                  placeholder="0.00"
                                  {...field}
                                  value={field.value || ''}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    const numValue = value === '' ? 0 : parseFloat(value) || 0;
                                    const roundedValue = roundToTwoDecimals(numValue);
                                    field.onChange(roundedValue);
                                  }}
                                />
                              </FormControl>
                              {lateFeeAmount > 0 && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => field.onChange(roundToTwoDecimals(lateFeeAmount))}
                                className="whitespace-nowrap"
                              >
                                Pagar Toda
                              </Button>
                              )}
                            </div>
                            {lateFeeAmount > 0 ? (
                            <div className="text-xs text-orange-600 mt-1">
                              💡 Mora pendiente: RD${lateFeeAmount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            ) : (
                              <div className="text-xs text-green-600 mt-1">
                                ✅ No hay mora pendiente
                              </div>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    <FormField
                      control={form.control}
                      name="payment_method"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Método de Pago</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Seleccionar método" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="bg-white">
                              <SelectItem value="cash">Efectivo</SelectItem>
                              <SelectItem value="bank_transfer">Transferencia Bancaria</SelectItem>
                              <SelectItem value="check">Cheque</SelectItem>
                              <SelectItem value="card">Tarjeta</SelectItem>
                              <SelectItem value="online">Pago en línea</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="reference_number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Número de Referencia (Opcional)</FormLabel>
                        <FormControl>
                          <Input placeholder="Número de comprobante, cheque, etc." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notas</FormLabel>
                        <FormControl>
                          <Textarea placeholder="Observaciones adicionales..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex gap-4">
                    <Button type="button" variant="outline" onClick={onBack}>
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={loading || !selectedLoan}>
                      {loading ? 'Registrando...' : 'Registrar Pago'}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>

        {selectedLoan && (
          <div>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Información del Préstamo
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Cliente:</span>
                    <span className="font-semibold">{selectedLoan.client?.full_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Cédula:</span>
                    <span className="font-semibold">{selectedLoan.client?.dni}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Capital Pendiente:</span>
                    <span className="font-bold text-red-600">
                      ${formatCurrencyNumber(
                        computedBalancePending !== null
                          ? (Number(computedBalancePending) + (Number(computedPendingCharges || 0) || 0))
                          : (selectedLoan.amortization_type === 'indefinite'
                              ? selectedLoan.amount + pendingInterestForIndefinite
                              : selectedLoan.remaining_balance)
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Cuota Mensual:</span>
                    <span className="font-semibold">
                      ${formatCurrencyNumber(selectedLoan.monthly_payment)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Próximo Pago:</span>
                    <span className="font-semibold">
                      {(nextPaymentInfo?.dueDate ? String(nextPaymentInfo.dueDate).split('T')[0] : null) || selectedLoan.next_payment_date}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Tasa de Interés:</span>
                    <span className="font-semibold">
                      {selectedLoan.interest_rate}% mensual
                    </span>
                  </div>
                  
                  {/* Información de Mora */}
                  {selectedLoan.late_fee_enabled && (
                    <>
                      <div className="border-t pt-2 mt-2">
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Mora Habilitada:</span>
                          <span className="font-semibold text-orange-600">Sí</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Tasa de Mora:</span>
                          <span className="font-semibold text-orange-600">
                            {selectedLoan.late_fee_rate}% {selectedLoan.late_fee_calculation_type}
                          </span>
                        </div>
                        {selectedLoan.grace_period_days && selectedLoan.grace_period_days > 0 && (
                          <div className="flex justify-between">
                            <span className="text-sm text-gray-600">Días de Gracia:</span>
                            <span className="font-semibold text-green-600">
                              {selectedLoan.grace_period_days} días
                            </span>
                          </div>
                        )}
                        {lateFeeAmount > 0 && (
                          <>
                            <div className="flex justify-between">
                              <span className="text-sm text-gray-600">Mora Pendiente:</span>
                              <span className="font-bold text-red-600">
                                RD${lateFeeAmount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </div>
                            {lateFeeCalculation && (
                              <div className="flex justify-between">
                                <span className="text-sm text-gray-600">Días de Atraso:</span>
                                <span className="font-semibold text-orange-600">
                                  {lateFeeCalculation.days_overdue} días
                                </span>
                              </div>
                            )}
                            
                            {/* Tabla de desglose de mora por cuota */}
                            {lateFeeBreakdown && lateFeeBreakdown.breakdown && lateFeeBreakdown.breakdown.length > 0 && (
                              <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                                <div className="text-sm font-medium text-orange-800 mb-2">
                                  📊 Desglose de Mora por Cuota
                                </div>
                                <div className="space-y-1">
                                  {lateFeeBreakdown.breakdown.map((item: any, index: number) => (
                                    item.isCharge ? (
                                      <div key={index} className="rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs">
                                        <div className="flex justify-between items-center">
                                          <span className="font-semibold text-amber-800">
                                            ⚡ Cargo #{item.installment}
                                            <span className="ml-1 text-amber-600 font-normal">({item.daysOverdue} días vencido)</span>
                                          </span>
                                        </div>
                                        <div className="flex justify-between items-center mt-0.5">
                                          <span className="text-amber-700">Monto del cargo:</span>
                                          <span className="font-semibold text-amber-900">RD${(item.principal || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                        </div>
                                        {item.lateFee > 0 && (
                                          <div className="flex justify-between items-center mt-0.5">
                                            <span className="text-amber-700">Mora del cargo:</span>
                                            <span className="font-semibold text-orange-700">RD${item.lateFee.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <div key={index} className={`flex justify-between items-center text-xs ${item.isPaid ? 'bg-green-100 border border-green-300 rounded px-2 py-1' : ''}`}>
                                        <span className={`text-orange-700 ${item.isPaid ? 'text-green-700' : ''}`}>
                                          Cuota {item.installment} ({item.daysOverdue} días):
                                          {item.isPaid && ' ✅ PAGADA'}
                                        </span>
                                        <span className={`font-semibold ${item.isPaid ? 'text-green-700' : 'text-orange-800'}`}>
                                          RD${item.lateFee.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </span>
                                      </div>
                                    )
                                  ))}
                                  <div className="border-t pt-1 mt-2 flex justify-between items-center font-bold text-orange-900">
                                    <span>Total Mora Pendiente:</span>
                                    <span>RD${lateFeeBreakdown.totalLateFee.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                  </div>
                                </div>
                                 <div className="mt-2 text-xs text-gray-600">
                                   💡 Solo se muestran las cuotas y cargos pendientes de pago
                                 </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </>
                  )}
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Interés Fijo por Cuota:</span>
                  <span className="font-semibold text-orange-600">
                    {formatCurrency((selectedLoan.amount * selectedLoan.interest_rate) / 100)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Capital por Cuota:</span>
                  <span className="font-semibold text-blue-600">
                    {formatCurrency(selectedLoan.monthly_payment - ((selectedLoan.amount * selectedLoan.interest_rate) / 100))}
                  </span>
                </div>
                {paymentDistribution && paymentDistribution.alreadyPaidInterest > 0 && (
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Interés Ya Pagado:</span>
                    <span className="font-semibold text-gray-600">
                      RD${paymentDistribution.alreadyPaidInterest.toLocaleString()}
                    </span>
                  </div>
                )}
                {paymentDistribution && paymentDistribution.remainingInterest > 0 && (
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Interés Pendiente:</span>
                    <span className="font-semibold text-red-600">
                      RD${paymentDistribution.remainingInterest.toLocaleString()}
                    </span>
                  </div>
                )}
                  
                  {/* Estado de la cuota actual */}
                  {paymentStatus.hasPartialPayments && (
                    <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="text-sm text-blue-800">
                        <div className="font-medium mb-2">📊 Estado de la cuota actual:</div>
                        <div className="space-y-1">
                          <div className="flex justify-between">
                            <span>Pagado:</span>
                            <span className="font-semibold text-green-600">
                              ${paymentStatus.currentPaymentPaid.toLocaleString()}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span>Falta por pagar:</span>
                            <span className="font-semibold text-red-600">
                              ${formatCurrencyNumber(paymentStatus.currentPaymentRemaining)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <div className="text-sm text-yellow-800">
                      <div className="font-medium mb-1">💡 Información importante:</div>
                      <ul className="text-xs space-y-1">
                        <li>• Pago completo: ${formatCurrencyNumber(paymentStatus.currentPaymentRemaining > 0 ? paymentStatus.currentPaymentRemaining : selectedLoan.monthly_payment)} o más</li>
                        <li>• Pago parcial: Menos de ${formatCurrencyNumber(paymentStatus.currentPaymentRemaining > 0 ? paymentStatus.currentPaymentRemaining : selectedLoan.monthly_payment)}</li>
                        <li>• Máximo permitido: ${formatCurrencyNumber(
                          computedBalancePending !== null
                            ? (computedBalancePending + (computedPendingCharges || 0))
                            : selectedLoan.remaining_balance
                        )}</li>
                        {selectedLoan.late_fee_enabled && lateFeeAmount > 0 && (
                          <li>• Mora pendiente: ${lateFeeAmount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (opcional pagar)</li>
                        )}
                      </ul>
                    </div>
                  </div>
                  
                  <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="text-sm text-blue-800">
                      <div className="font-medium mb-1">🎯 Lógica de Aplicación de Pagos:</div>
                      <ul className="text-xs space-y-1">
                        <li>• <strong>Cuota mensual:</strong> {formatCurrency(selectedLoan.monthly_payment)} (interés + capital)</li>
                        <li>• <strong>Interés fijo:</strong> {formatCurrency((selectedLoan.amount * selectedLoan.interest_rate) / 100)} por cuota</li>
                        <li>• <strong>Primero:</strong> Se paga el interés fijo de la cuota</li>
                        <li>• <strong>Después:</strong> El resto se aplica al capital</li>
                        <li>• <strong>Balance:</strong> Solo se reduce con pagos al capital</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
      
      {/* Modal de Selección de Formato de Impresión */}
      <Dialog open={showPrintFormatModal} onOpenChange={(open) => {
        if (!open && !isClosingPrintModal) {
          // Cuando se cierra el modal (X o clic fuera) y no se está cerrando desde un botón
          setShowPrintFormatModal(false);
          const askBeforeSend = companySettings?.ask_whatsapp_before_send !== false; // Por defecto true
          setTimeout(() => {
            if (askBeforeSend) {
              setShowWhatsAppDialog(true);
            } else {
              sendWhatsAppDirectly();
            }
          }, 300);
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="h-5 w-5" />
              Seleccionar Formato de Impresión
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Selecciona el formato de impresión según tu impresora:
            </p>
            
            <div className="grid grid-cols-1 gap-3">
              {/* POS58 - Impresoras portátiles Verifone */}
              <Button 
                variant="outline" 
                className="h-auto p-4 flex flex-col items-start"
                onClick={() => {
                  handleClosePrintModalAndShowWhatsApp(() => {
                    printReceipt('POS58');
                  });
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 bg-blue-100 rounded flex items-center justify-center">
                    <span className="text-xs font-bold">58</span>
                  </div>
                  <div className="text-left">
                    <div className="font-medium">POS58</div>
                    <div className="text-xs text-gray-500">Verifone / Impresoras Portátiles</div>
                  </div>
                </div>
                <div className="text-xs text-gray-400">
                  Ancho: 58mm - Ideal para impresoras portátiles
                </div>
              </Button>

              {/* POS80 - Punto de venta */}
              <Button 
                variant="outline" 
                className="h-auto p-4 flex flex-col items-start"
                onClick={() => {
                  handleClosePrintModalAndShowWhatsApp(() => {
                    printReceipt('POS80');
                  });
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 bg-green-100 rounded flex items-center justify-center">
                    <span className="text-xs font-bold">80</span>
                  </div>
                  <div className="text-left">
                    <div className="font-medium">POS80</div>
                    <div className="text-xs text-gray-500">Punto de Venta</div>
                  </div>
                </div>
                <div className="text-xs text-gray-400">
                  Ancho: 80mm - Para impresoras de punto de venta
                </div>
              </Button>

              {/* Carta 8½ x 11 */}
              <Button 
                variant="outline" 
                className="h-auto p-4 flex flex-col items-start"
                onClick={() => {
                  handleClosePrintModalAndShowWhatsApp(() => {
                    printReceipt('LETTER');
                  });
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 bg-purple-100 rounded flex items-center justify-center">
                    <span className="text-xs font-bold">8½</span>
                  </div>
                  <div className="text-left">
                    <div className="font-medium">Carta (8½ x 11)</div>
                    <div className="text-xs text-gray-500">Impresoras de Escritorio</div>
                  </div>
                </div>
                <div className="text-xs text-gray-400">
                  Formato: 8.5 x 11 pulgadas - Estándar americano
                </div>
              </Button>

              {/* A4 */}
              <Button 
                variant="outline" 
                className="h-auto p-4 flex flex-col items-start"
                onClick={() => {
                  handleClosePrintModalAndShowWhatsApp(() => {
                    printReceipt('A4');
                  });
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 bg-orange-100 rounded flex items-center justify-center">
                    <span className="text-xs font-bold">A4</span>
                  </div>
                  <div className="text-left">
                    <div className="font-medium">A4</div>
                    <div className="text-xs text-gray-500">Impresoras de Escritorio</div>
                  </div>
                </div>
                <div className="text-xs text-gray-400">
                  Formato: 210 x 297mm - Estándar internacional
                </div>
              </Button>
            </div>

            <div className="pt-4 border-t">
              <p className="text-xs text-gray-500 mb-3">
                También puedes descargar el recibo en formato HTML:
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button 
                  size="sm" 
                  variant="secondary"
                  onClick={() => {
                    handleClosePrintModalAndShowWhatsApp(() => {
                      downloadReceipt('POS58');
                    });
                  }}
                >
                  <Download className="h-3 w-3 mr-1" />
                  POS58
                </Button>
                <Button 
                  size="sm" 
                  variant="secondary"
                  onClick={() => {
                    handleClosePrintModalAndShowWhatsApp(() => {
                      downloadReceipt('LETTER');
                    });
                  }}
                >
                  <Download className="h-3 w-3 mr-1" />
                  Carta
                </Button>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => {
              handleClosePrintModalAndShowWhatsApp();
            }}>
              Cerrar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Diálogo de confirmación de WhatsApp */}
      <Dialog open={showWhatsAppDialog} onOpenChange={(open) => {
        if (!open) {
          // Cuando se cierra el modal (X o clic fuera), ejecutar la misma lógica que el botón Cancelar
          handleCloseWhatsAppDialog();
        } else {
          setShowWhatsAppDialog(true);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Enviar recibo por WhatsApp?</DialogTitle>
            <DialogDescription>
              ¿Deseas enviar el recibo del pago al cliente por WhatsApp?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => handleCloseWhatsAppDialog()}
            >
              Cancelar
            </Button>
            <Button
              onClick={async () => {
                // Obtener el teléfono del cliente si no está disponible
                let clientPhone = lastPaymentData?.loan?.client?.phone;
                
                if (!clientPhone && lastPaymentData?.loan?.id) {
                  try {
                    console.log('🔍 Obteniendo teléfono del cliente desde BD para loan:', lastPaymentData.loan.id);
                    // Obtener el client_id del préstamo
                    const { data: loanData, error: loanError } = await supabase
                      .from('loans')
                      .select('client_id')
                      .eq('id', lastPaymentData.loan.id)
                      .single();
                    
                    console.log('🔍 Loan data:', loanData, 'Error:', loanError);
                    
                    if (loanData?.client_id) {
                      // Obtener el teléfono del cliente
                      const { data: clientData, error: clientError } = await supabase
                        .from('clients')
                        .select('phone')
                        .eq('id', loanData.client_id)
                        .maybeSingle();
                      
                      console.log('🔍 Client data:', clientData, 'Error:', clientError);
                      
                      if (clientData?.phone) {
                        clientPhone = clientData.phone;
                        // Actualizar lastPaymentData con el teléfono
                        setLastPaymentData({
                          ...lastPaymentData,
                          loan: {
                            ...lastPaymentData.loan,
                            client: {
                              ...lastPaymentData.loan.client,
                              phone: clientPhone
                            }
                          }
                        });
                      }
                    }
                  } catch (error) {
                    console.error('Error obteniendo teléfono del cliente:', error);
                  }
                }
                
                console.log('🔍 Teléfono final del cliente:', clientPhone);
                console.log('🔍 lastPaymentData completo:', lastPaymentData);
                
                if (!clientPhone) {
                  toast.error('No se encontró el número de teléfono del cliente. Por favor, verifica que el cliente tenga un número de teléfono registrado.');
                  setShowWhatsAppDialog(false);
                  if (isMobile) {
                    setTimeout(() => {
                      navigate('/cobro-rapido');
                    }, 1000);
                  } else {
                    onBack();
                  }
                  return;
                }

                try {
                  const companyName = companySettings?.company_name || 'LA EMPRESA';
                  const receiptMessage = generateLoanPaymentReceipt({
                    companyName,
                    clientName: lastPaymentData.loan.client.full_name,
                    clientDni: lastPaymentData.loan.client.dni,
                    paymentDate: lastPaymentData.paymentDate,
                    paymentAmount: lastPaymentData.payment.amount + (lastPaymentData.lateFeeAmount || 0),
                    principalAmount: lastPaymentData.principalPayment,
                    interestAmount: lastPaymentData.interestAmount || lastPaymentData.interestPayment || 0,
                    lateFeeAmount: lastPaymentData.lateFeeAmount > 0 ? lastPaymentData.lateFeeAmount : undefined,
                    paymentMethod: lastPaymentData.paymentMethod,
                    loanAmount: lastPaymentData.loan.amount,
                    remainingBalance: lastPaymentData.remainingBalance,
                    interestRate: lastPaymentData.loan.interest_rate,
                    nextPaymentDate: lastPaymentData.nextPaymentDate,
                    referenceNumber: lastPaymentData.referenceNumber
                  });

                  openWhatsApp(clientPhone, receiptMessage);
                  toast.success('Abriendo WhatsApp...');
                } catch (error: any) {
                  console.error('Error abriendo WhatsApp:', error);
                  toast.error(error.message || 'Error al abrir WhatsApp');
                }

                // Cerrar el formulario después de enviar (sin mostrar toast de redirección)
                handleCloseWhatsAppDialog(false);
              }}
            >
              Enviar por WhatsApp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

