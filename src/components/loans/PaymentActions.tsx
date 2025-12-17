import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  MoreHorizontal, 
  Eye, 
  Edit, 
  Trash2, 
  Printer, 
  Download,
  User,
  DollarSign,
  Receipt,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

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
  loan_id: string;
}

interface Loan {
  id: string;
  amount: number;
  interest_rate: number;
  term_months: number;
  client: {
    full_name: string;
    dni: string;
    phone?: string;
    address?: string;
  };
}

interface CompanySettings {
  company_name: string;
  business_type?: string;
  tax_id?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  logo_url?: string;
  website?: string;
}

interface PaymentActionsProps {
  payment: Payment;
  onPaymentUpdated?: () => void;
  loanStatus?: string; // Estado del préstamo para validar si se puede eliminar
}

export const PaymentActions: React.FC<PaymentActionsProps> = ({ 
  payment, 
  onPaymentUpdated,
  loanStatus
}) => {
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showPrintFormatModal, setShowPrintFormatModal] = useState(false);
  const [loan, setLoan] = useState<Loan | null>(null);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [isLatestPayment, setIsLatestPayment] = useState(false);
  const [forceDelete, setForceDelete] = useState(false);
  
  // Verificar si este pago es el último del préstamo
  useEffect(() => {
    const checkIfLatestPayment = async () => {
      try {
        console.log('🔍 Verificando último pago para:', payment.id);
        
        const { data: allPayments, error } = await supabase
          .from('payments')
          .select('id, created_at')
          .eq('loan_id', payment.loan_id)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false }); // Ordenar también por ID para consistencia

        if (error) {
          console.error('🔍 Error verificando último pago:', error);
          setIsLatestPayment(false);
          return;
        }

        if (allPayments && allPayments.length > 0) {
          const latestPaymentId = allPayments[0].id;
          const isLatest = latestPaymentId === payment.id;
          
          console.log('🔍 Resultado:', {
            currentPaymentId: payment.id,
            latestPaymentId: latestPaymentId,
            totalPayments: allPayments.length,
            isLatest: isLatest
          });
          
          setIsLatestPayment(isLatest);
        } else {
          console.log('🔍 No hay pagos encontrados');
          setIsLatestPayment(false);
        }
      } catch (error) {
        console.error('🔍 Error en verificación:', error);
        setIsLatestPayment(false);
      }
    };

    checkIfLatestPayment();
    
    // Verificar nuevamente cada 5 segundos para detectar cambios
    const interval = setInterval(checkIfLatestPayment, 5000);
    
    return () => clearInterval(interval);
  }, [payment.id, payment.loan_id]);



  const fetchLoanDetails = async () => {
    try {
      const { data, error } = await supabase
        .from('loans')
        .select(`
          id,
          amount,
          interest_rate,
          term_months,
          client:client_id (
            full_name,
            dni,
            phone,
            address
          )
        `)
        .eq('id', payment.loan_id)
        .single();

      if (error) throw error;
      
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
      toast.error('Error al cargar detalles del préstamo');
    }
  };

  const fetchCompanySettings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('company_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching company settings:', error);
        return;
      }

      if (data) {
        setCompanySettings(data);
      }
    } catch (error) {
      console.error('Error in fetchCompanySettings:', error);
    }
  };

  const handleViewReceipt = async () => {
    if (!loan) {
      setLoading(true);
      await fetchLoanDetails();
      setLoading(false);
    }
    if (!companySettings) {
      await fetchCompanySettings();
    }
    setShowReceiptModal(true);
  };


  const handleDelete = async () => {
    try {
      setLoading(true);
      
      console.log('🗑️ ELIMINACIÓN DEL ÚLTIMO PAGO - Iniciando...');
      console.log('🗑️ Pago ID:', payment.id);
      console.log('🗑️ Monto:', payment.amount);
      console.log('🗑️ Préstamo ID:', payment.loan_id);
      
      // PASO 1: Obtener balance actual del préstamo
      console.log('🗑️ OBTENIENDO BALANCE DEL PRÉSTAMO...');
      const { data: loanData, error: loanError } = await supabase
        .from('loans')
        .select('remaining_balance')
        .eq('id', payment.loan_id)
        .single();

      if (loanError) {
        console.error('🗑️ ERROR obteniendo préstamo:', loanError);
        throw loanError;
      }

      const newBalance = loanData.remaining_balance + payment.amount;
      console.log('🗑️ Balance actual:', loanData.remaining_balance);
      console.log('🗑️ Nuevo balance:', newBalance);

      // PASO 2: Eliminar el pago
      console.log('🗑️ ELIMINANDO PAGO...');
      const { error: deleteError } = await supabase
        .from('payments')
        .delete()
        .eq('id', payment.id);

      if (deleteError) {
        console.error('🗑️ ERROR eliminando pago:', deleteError);
        console.error('🗑️ Detalles del error:', {
          code: deleteError.code,
          message: deleteError.message,
          details: deleteError.details,
          hint: deleteError.hint
        });
        throw deleteError;
      }

      console.log('🗑️ ✅ Pago eliminado exitosamente');

      // PASO 3: Actualizar balance del préstamo y restaurar mora si aplica
      console.log('🗑️ ACTUALIZANDO BALANCE...');
      
      // Si el pago eliminado incluía mora, restaurarla al préstamo
      let updateData: any = { remaining_balance: newBalance };
      if (payment.late_fee && payment.late_fee > 0) {
        console.log('🗑️ RESTAURANDO MORA:', payment.late_fee);
        // Obtener la mora actual del préstamo
        const { data: currentLoan, error: currentLoanError } = await supabase
          .from('loans')
          .select('current_late_fee')
          .eq('id', payment.loan_id)
          .single();
        
        if (!currentLoanError && currentLoan) {
          const newCurrentLateFee = (currentLoan.current_late_fee || 0) + payment.late_fee;
          updateData.current_late_fee = newCurrentLateFee;
          console.log('🗑️ Nueva mora actual:', newCurrentLateFee);
        }
      }
      
      const { error: updateError } = await supabase
        .from('loans')
        .update(updateData)
        .eq('id', payment.loan_id);

      if (updateError) {
        console.error('🗑️ ERROR actualizando préstamo:', updateError);
        throw updateError;
      }

      console.log('🗑️ ✅ Balance actualizado exitosamente');

      // PASO 4: Notificar éxito y refrescar
      toast.success('Pago eliminado exitosamente');
      setShowDeleteModal(false);
      
      // Refrescar inmediatamente
      if (onPaymentUpdated) {
        console.log('🗑️ Refrescando lista...');
        onPaymentUpdated();
      }
      
    } catch (error) {
      console.error('🗑️ ERROR GENERAL:', error);
      toast.error(`Error al eliminar el pago: ${error.message || 'Error desconocido'}`);
    } finally {
      setLoading(false);
      console.log('🗑️ Proceso finalizado');
    }
  };


  // Función para generar el HTML del recibo según el formato
  const generateReceiptHTML = (format: string) => {
    if (!loan) return '';
    
    // Asegurar que tenemos los datos de la empresa
    if (!companySettings) {
      fetchCompanySettings();
    }

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
          <title>${getFormatTitle(format)} - ${loan.client.full_name}</title>
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
                    ${companySettings.company_name}
                  </div>
                  ${companySettings.business_type ? `<div style="font-size: ${format.includes('POS') ? '10px' : '12px'}; margin-bottom: 3px;">${companySettings.business_type}</div>` : ''}
                  ${companySettings.address ? `<div style="font-size: ${format.includes('POS') ? '9px' : '11px'}; margin-bottom: 2px;">${companySettings.address}</div>` : ''}
                  ${companySettings.city && companySettings.state ? `<div style="font-size: ${format.includes('POS') ? '9px' : '11px'}; margin-bottom: 2px;">${companySettings.city}, ${companySettings.state}</div>` : ''}
                  ${companySettings.tax_id ? `<div style="font-size: ${format.includes('POS') ? '9px' : '11px'}; margin-bottom: 5px;">RNC: ${companySettings.tax_id}</div>` : ''}
                </div>
                <hr style="border: none; border-top: 1px solid #000; margin: 10px 0;">
              ` : ''}
              <div class="receipt-title">${getFormatTitle(format)}</div>
              <div class="receipt-number">Recibo #${payment.id.slice(0, 8).toUpperCase()}</div>
              <div style="margin-top: 10px; font-size: ${format.includes('POS') ? '10px' : '14px'};">
                ${new Date(payment.created_at).toLocaleDateString('es-ES', {
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
                <span>Nombre: ${loan.client.full_name}</span>
              </div>
              <div class="info-row">
                <span>Cédula: ${loan.client.dni}</span>
              </div>
              ${loan.client.phone ? `<div class="info-row"><span>Teléfono: ${loan.client.phone}</span></div>` : ''}
              ${loan.client.address ? `<div class="info-row"><span>Dirección: ${loan.client.address}</span></div>` : ''}
            </div>

            <div class="section">
              <div class="section-title">DETALLES DEL PRÉSTAMO</div>
              <div class="info-row">
                <span>Préstamo ID: ${loan.id.slice(0, 8).toUpperCase()}</span>
              </div>
              <div class="info-row">
                <span>Monto Original: RD$${loan.amount.toLocaleString()}</span>
              </div>
              <div class="info-row">
                <span>Tasa de Interés: ${loan.interest_rate}%</span>
              </div>
              <div class="info-row">
                <span>Plazo: ${loan.term_months} meses</span>
              </div>
            </div>

            <div class="section">
              <div class="section-title">DETALLES DEL PAGO</div>
              <div class="info-row">
                <span>Fecha de Pago: ${payment.payment_date}</span>
              </div>
              <div class="info-row">
                <span>Fecha de Vencimiento: ${payment.due_date}</span>
              </div>
              <div class="info-row">
                <span>Método de Pago: ${getPaymentMethodLabel(payment.payment_method)}</span>
              </div>
              ${payment.reference_number ? `<div class="info-row"><span>Referencia: ${payment.reference_number}</span></div>` : ''}
            </div>

            <div class="amount-section">
              <div class="section-title">DESGLOSE DEL PAGO</div>
              <div class="info-row">
                <span>Pago a Principal: RD$${payment.principal_amount.toLocaleString()}</span>
              </div>
              <div class="info-row">
                <span>Pago a Intereses: RD$${payment.interest_amount.toLocaleString()}</span>
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
              <p>Para cualquier consulta, contacte a nuestro departamento de atención al cliente.</p>
              <p style="margin-top: 20px;">
                <strong>Firma del Cliente:</strong> _________________________
              </p>
              <p style="margin-top: 10px;">
                <strong>Firma del Representante:</strong> _________________________
              </p>
            </div>
          </div>
        </body>
      </html>
    `;
  };

  const printReceipt = (format: string = 'LETTER') => {
    if (!loan) return;
    
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      const receiptHTML = generateReceiptHTML(format);
      printWindow.document.write(receiptHTML);
      printWindow.document.close();
      printWindow.print();
    }
  };

  const downloadReceipt = (format: string = 'LETTER') => {
    if (!loan) return;
    
    const receiptHTML = generateReceiptHTML(format);

    const blob = new Blob([receiptHTML], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recibo_${loan.client.full_name.replace(/\s+/g, '_')}_${new Date(payment.payment_date).toISOString().split('T')[0]}_${format}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">Abrir menú</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleViewReceipt}>
            <Eye className="mr-2 h-4 w-4" />
            Ver Recibo
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowPrintFormatModal(true)}>
            <Printer className="mr-2 h-4 w-4" />
            Imprimir
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowPrintFormatModal(true)}>
            <Download className="mr-2 h-4 w-4" />
            Descargar
          </DropdownMenuItem>
          {isLatestPayment && loanStatus !== 'paid' && (
            <DropdownMenuItem 
              onClick={() => {
                setForceDelete(false);
                setShowDeleteModal(true);
              }}
              className="text-red-600"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Eliminar Pago
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Modal del Recibo */}
      <Dialog open={showReceiptModal} onOpenChange={setShowReceiptModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="h-5 w-5" />
                Recibo de Pago - {loan?.client.full_name}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setShowPrintFormatModal(true)}>
                  <Printer className="h-4 w-4 mr-2" />
                  Imprimir
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowPrintFormatModal(true)}>
                  <Download className="h-4 w-4 mr-2" />
                  Descargar
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowReceiptModal(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </DialogTitle>
          </DialogHeader>

          {loan && (
            <div className="space-y-6">
              {/* Información del Cliente */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Información del Cliente
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <span className="font-medium text-gray-600">Nombre:</span>
                      <div className="font-semibold">{loan.client.full_name}</div>
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">Cédula:</span>
                      <div className="font-semibold">{loan.client.dni}</div>
                    </div>
                    {loan.client.phone && (
                      <div>
                        <span className="font-medium text-gray-600">Teléfono:</span>
                        <div className="font-semibold">{loan.client.phone}</div>
                      </div>
                    )}
                    {loan.client.address && (
                      <div>
                        <span className="font-medium text-gray-600">Dirección:</span>
                        <div className="font-semibold">{loan.client.address}</div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Detalles del Préstamo */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />
                    Detalles del Préstamo
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <span className="font-medium text-gray-600">Préstamo ID:</span>
                      <div className="font-semibold">{loan.id.slice(0, 8).toUpperCase()}</div>
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">Monto Original:</span>
                      <div className="font-semibold">RD${loan.amount.toLocaleString()}</div>
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">Tasa de Interés:</span>
                      <div className="font-semibold">{loan.interest_rate}%</div>
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">Plazo:</span>
                      <div className="font-semibold">{loan.term_months} meses</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Detalles del Pago */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Receipt className="h-5 w-5" />
                    Detalles del Pago
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <span className="font-medium text-gray-600">Fecha de Pago:</span>
                      <div className="font-semibold">{new Date(payment.payment_date).toLocaleDateString()}</div>
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">Fecha de Vencimiento:</span>
                      <div className="font-semibold">{new Date(payment.due_date).toLocaleDateString()}</div>
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">Método de Pago:</span>
                      <div className="font-semibold">{getPaymentMethodLabel(payment.payment_method)}</div>
                    </div>
                    {payment.reference_number && (
                      <div>
                        <span className="font-medium text-gray-600">Número de Referencia:</span>
                        <div className="font-semibold">{payment.reference_number}</div>
                      </div>
                    )}
                  </div>

                  {/* Desglose del Pago */}
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="font-semibold mb-3">Desglose del Pago</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Pago a Principal:</span>
                        <span className="font-semibold">RD${payment.principal_amount.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Pago a Intereses:</span>
                        <span className="font-semibold">RD${payment.interest_amount.toLocaleString()}</span>
                      </div>
                      {payment.late_fee > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Cargo por Mora:</span>
                          <span className="font-semibold text-red-600">RD${payment.late_fee.toLocaleString()}</span>
                        </div>
                      )}
                      <hr className="my-2" />
                      <div className="flex justify-between text-lg font-bold text-green-600">
                        <span>TOTAL:</span>
                        <span>RD${payment.amount.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  {payment.notes && (
                    <div className="mt-4">
                      <span className="font-medium text-gray-600">Notas:</span>
                      <div className="mt-2 p-3 bg-blue-50 rounded-lg">
                        {payment.notes}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowReceiptModal(false)}>
                  Cerrar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

             {/* Modal de Eliminación */}
       <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
         <DialogContent>
           <DialogHeader>
             <DialogTitle>Confirmar Eliminación</DialogTitle>
           </DialogHeader>
           <div className="space-y-4">
             <p>¿Estás seguro de que quieres eliminar este pago?</p>
             <p className="text-sm text-blue-600 font-semibold">
               ✅ Este es el último pago del préstamo
             </p>
             <p className="text-sm text-gray-600">
               Esta acción no se puede deshacer y se actualizará el balance del préstamo.
             </p>
             <div className="flex justify-end gap-2">
               <Button 
                 variant="outline" 
                 onClick={() => setShowDeleteModal(false)}
                 disabled={loading}
               >
                 Cancelar
               </Button>
               <Button 
                 variant="destructive" 
                 onClick={handleDelete}
                 disabled={loading}
               >
                 {loading ? 'Eliminando...' : 'Eliminar'}
               </Button>
             </div>
           </div>
         </DialogContent>
       </Dialog>


       {/* Modal de Selección de Formato de Impresión */}
       <Dialog open={showPrintFormatModal} onOpenChange={setShowPrintFormatModal}>
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
                   printReceipt('POS58');
                   setShowPrintFormatModal(false);
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
                   printReceipt('POS80');
                   setShowPrintFormatModal(false);
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
                   printReceipt('LETTER');
                   setShowPrintFormatModal(false);
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
                   printReceipt('A4');
                   setShowPrintFormatModal(false);
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
                     downloadReceipt('POS58');
                     setShowPrintFormatModal(false);
                   }}
                 >
                   <Download className="h-3 w-3 mr-1" />
                   POS58
                 </Button>
                 <Button 
                   size="sm" 
                   variant="secondary"
                   onClick={() => {
                     downloadReceipt('LETTER');
                     setShowPrintFormatModal(false);
                   }}
                 >
                   <Download className="h-3 w-3 mr-1" />
                   Carta
                 </Button>
               </div>
             </div>
           </div>

           <div className="flex justify-end gap-2 pt-4">
             <Button variant="outline" onClick={() => setShowPrintFormatModal(false)}>
               Cancelar
             </Button>
           </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
