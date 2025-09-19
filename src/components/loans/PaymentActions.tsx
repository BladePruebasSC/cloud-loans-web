import React, { useState } from 'react';
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

interface PaymentActionsProps {
  payment: Payment;
  onPaymentUpdated?: () => void;
}

export const PaymentActions: React.FC<PaymentActionsProps> = ({ 
  payment, 
  onPaymentUpdated 
}) => {
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showPrintFormatModal, setShowPrintFormatModal] = useState(false);
  const [loan, setLoan] = useState<Loan | null>(null);
  const [loading, setLoading] = useState(false);
  const [editForm, setEditForm] = useState({
    amount: payment.amount,
    principal_amount: payment.principal_amount,
    interest_amount: payment.interest_amount,
    late_fee: payment.late_fee,
    payment_date: payment.payment_date,
    due_date: payment.due_date,
    payment_method: payment.payment_method,
    reference_number: payment.reference_number || '',
    notes: payment.notes || ''
  });

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

  const handleViewReceipt = async () => {
    if (!loan) {
      setLoading(true);
      await fetchLoanDetails();
      setLoading(false);
    }
    setShowReceiptModal(true);
  };

  const handleEdit = async () => {
    if (!loan) {
      setLoading(true);
      await fetchLoanDetails();
      setLoading(false);
    }
    setShowEditModal(true);
  };

  const handleDelete = async () => {
    try {
      setLoading(true);
      
      console.log('🗑️ Iniciando eliminación del pago:', payment.id);
      console.log('🗑️ Monto del pago a eliminar:', payment.amount);
      console.log('🗑️ ID del préstamo:', payment.loan_id);
      
      // Primero, obtener el préstamo para recalcular el balance
      console.log('🗑️ Obteniendo datos del préstamo...');
      const { data: loanData, error: loanError } = await supabase
        .from('loans')
        .select('id, remaining_balance')
        .eq('id', payment.loan_id)
        .single();

      if (loanError) {
        console.error('🗑️ Error obteniendo préstamo:', loanError);
        throw loanError;
      }

      console.log('🗑️ Balance actual del préstamo:', loanData.remaining_balance);

      // Eliminar el pago
      console.log('🗑️ Eliminando pago de la base de datos...');
      const { error: deleteError } = await supabase
        .from('payments')
        .delete()
        .eq('id', payment.id);

      if (deleteError) {
        console.error('🗑️ Error eliminando pago:', deleteError);
        throw deleteError;
      }

      console.log('🗑️ Pago eliminado exitosamente');

      // Recalcular el balance del préstamo sumando el monto eliminado
      const newBalance = loanData.remaining_balance + payment.amount;
      console.log('🗑️ Nuevo balance calculado:', newBalance);
      
      // Actualizar el balance del préstamo
      console.log('🗑️ Actualizando balance del préstamo...');
      const { error: updateError } = await supabase
        .from('loans')
        .update({ remaining_balance: newBalance })
        .eq('id', payment.loan_id);

      if (updateError) {
        console.error('🗑️ Error actualizando préstamo:', updateError);
        throw updateError;
      }

      console.log('🗑️ Balance del préstamo actualizado exitosamente');
      console.log('🗑️ Llamando callback onPaymentUpdated...');

      toast.success('Pago eliminado exitosamente');
      setShowDeleteModal(false);
      
      // Pequeño delay para asegurar que la eliminación se complete
      setTimeout(() => {
        // Llamar al callback para refrescar la lista
        if (onPaymentUpdated) {
          console.log('🗑️ CALLBACK: Ejecutando onPaymentUpdated');
          console.log('🗑️ CALLBACK: Tipo de función:', typeof onPaymentUpdated);
          try {
            onPaymentUpdated();
            console.log('🗑️ CALLBACK: Ejecutado exitosamente');
          } catch (callbackError) {
            console.error('🗑️ CALLBACK: Error ejecutando callback:', callbackError);
          }
        } else {
          console.warn('🗑️ CALLBACK: onPaymentUpdated no está definido');
        }
      }, 500);
      
    } catch (error) {
      console.error('🗑️ Error completo en eliminación:', error);
      toast.error(`Error al eliminar el pago: ${error.message || 'Error desconocido'}`);
    } finally {
      setLoading(false);
      console.log('🗑️ Proceso de eliminación finalizado');
    }
  };

  const handleUpdatePayment = async () => {
    try {
      setLoading(true);
      
      // Solo permitir actualizar campos del recibo, NO los montos
      const { error } = await supabase
        .from('payments')
        .update({
          // NO actualizar estos campos (mantener valores originales):
          // amount: editForm.amount,
          // principal_amount: editForm.principal_amount,
          // interest_amount: editForm.interest_amount,
          // late_fee: editForm.late_fee,
          
          // Solo actualizar campos del recibo:
          payment_date: editForm.payment_date,
          due_date: editForm.due_date,
          payment_method: editForm.payment_method,
          reference_number: editForm.reference_number || null,
          notes: editForm.notes || null
        })
        .eq('id', payment.id);

      if (error) throw error;

      toast.success('Información del recibo actualizada exitosamente');
      setShowEditModal(false);
      onPaymentUpdated?.();
    } catch (error) {
      console.error('Error updating payment:', error);
      toast.error('Error al actualizar el recibo');
    } finally {
      setLoading(false);
    }
  };

  // Función para generar el HTML del recibo según el formato
  const generateReceiptHTML = (format: string) => {
    if (!loan) return '';

    const getFormatStyles = (format: string) => {
      switch (format) {
        case 'POS58':
          return `
            body { 
              font-family: 'Courier New', monospace; 
              margin: 0; 
              padding: 5px;
              font-size: 12px;
              line-height: 1.2;
              color: #000;
            }
            .receipt-container {
              max-width: 58mm;
              margin: 0 auto;
              padding: 5px;
            }
            .header { text-align: center; margin-bottom: 10px; }
            .receipt-title { font-size: 14px; font-weight: bold; margin-bottom: 5px; }
            .receipt-number { font-size: 10px; }
            .section { margin-bottom: 10px; }
            .section-title { font-weight: bold; font-size: 11px; margin-bottom: 5px; text-decoration: underline; }
            .info-row { margin-bottom: 3px; font-size: 10px; }
            .amount-section { margin: 10px 0; }
            .total-amount { font-size: 14px; font-weight: bold; text-align: center; margin-top: 10px; }
            .footer { margin-top: 15px; text-align: center; font-size: 9px; }
            @media print { 
              body { margin: 0; padding: 2px; }
              .receipt-container { border: none; max-width: 58mm; }
            }
          `;
        
        case 'POS80':
          return `
            body { 
              font-family: 'Courier New', monospace; 
              margin: 0; 
              padding: 8px;
              font-size: 14px;
              line-height: 1.3;
              color: #000;
            }
            .receipt-container {
              max-width: 80mm;
              margin: 0 auto;
              padding: 8px;
            }
            .header { text-align: center; margin-bottom: 15px; }
            .receipt-title { font-size: 16px; font-weight: bold; margin-bottom: 8px; }
            .receipt-number { font-size: 12px; }
            .section { margin-bottom: 15px; }
            .section-title { font-weight: bold; font-size: 13px; margin-bottom: 8px; text-decoration: underline; }
            .info-row { margin-bottom: 4px; font-size: 12px; }
            .amount-section { margin: 15px 0; }
            .total-amount { font-size: 16px; font-weight: bold; text-align: center; margin-top: 15px; }
            .footer { margin-top: 20px; text-align: center; font-size: 10px; }
            @media print { 
              body { margin: 0; padding: 4px; }
              .receipt-container { border: none; max-width: 80mm; }
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
                <span>Fecha de Pago: ${new Date(payment.payment_date).toLocaleDateString()}</span>
              </div>
              <div class="info-row">
                <span>Fecha de Vencimiento: ${new Date(payment.due_date).toLocaleDateString()}</span>
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
          <DropdownMenuItem onClick={handleEdit}>
            <Edit className="mr-2 h-4 w-4" />
            Editar
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowPrintFormatModal(true)}>
            <Printer className="mr-2 h-4 w-4" />
            Imprimir
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowPrintFormatModal(true)}>
            <Download className="mr-2 h-4 w-4" />
            Descargar
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={() => setShowDeleteModal(true)}
            className="text-red-600"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Eliminar
          </DropdownMenuItem>
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
             <p className="text-sm text-gray-600">
               Esta acción no se puede deshacer.
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

       {/* Modal de Edición */}
       <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
         <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
           <DialogHeader>
             <DialogTitle className="flex items-center gap-2">
               <Edit className="h-5 w-5" />
               Editar Pago
             </DialogTitle>
           </DialogHeader>

           <div className="space-y-6">
             {/* Información del Cliente */}
             {loan && (
               <Card>
                 <CardHeader>
                   <CardTitle className="flex items-center gap-2">
                     <User className="h-5 w-5" />
                     Cliente: {loan.client.full_name}
                   </CardTitle>
                 </CardHeader>
               </Card>
             )}

             {/* Formulario de Edición */}
             <div className="space-y-4">
               <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                 <h3 className="text-sm font-medium text-blue-800 mb-1">📝 Edición de Recibo</h3>
                 <p className="text-xs text-blue-700">
                   Solo puedes editar la información del recibo (fecha, método de pago, cobrador, comentarios). 
                   Los montos no se pueden modificar una vez que el pago ha sido registrado.
                 </p>
               </div>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div>
                   <label className="text-sm font-medium text-gray-700">Monto Total</label>
                   <input
                     type="number"
                     value={editForm.amount}
                     disabled
                     className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-600 cursor-not-allowed"
                   />
                   <p className="text-xs text-gray-500 mt-1">⚠️ No se puede modificar el monto una vez pagado</p>
                 </div>
                 <div>
                   <label className="text-sm font-medium text-gray-700">Pago a Principal</label>
                   <input
                     type="number"
                     value={editForm.principal_amount}
                     disabled
                     className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-600 cursor-not-allowed"
                   />
                 </div>
                 <div>
                   <label className="text-sm font-medium text-gray-700">Pago a Intereses</label>
                   <input
                     type="number"
                     value={editForm.interest_amount}
                     disabled
                     className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-600 cursor-not-allowed"
                   />
                 </div>
                 <div>
                   <label className="text-sm font-medium text-gray-700">Cargo por Mora</label>
                   <input
                     type="number"
                     value={editForm.late_fee}
                     disabled
                     className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-100 text-gray-600 cursor-not-allowed"
                   />
                 </div>
                 <div>
                   <label className="text-sm font-medium text-gray-700">Fecha de Pago</label>
                   <input
                     type="date"
                     value={editForm.payment_date}
                     onChange={(e) => setEditForm({...editForm, payment_date: e.target.value})}
                     className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                   />
                 </div>
                 <div>
                   <label className="text-sm font-medium text-gray-700">Fecha de Vencimiento</label>
                   <input
                     type="date"
                     value={editForm.due_date}
                     onChange={(e) => setEditForm({...editForm, due_date: e.target.value})}
                     className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                   />
                 </div>
                 <div>
                   <label className="text-sm font-medium text-gray-700">Método de Pago</label>
                   <select
                     value={editForm.payment_method}
                     onChange={(e) => setEditForm({...editForm, payment_method: e.target.value})}
                     className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                   >
                     <option value="cash">Efectivo</option>
                     <option value="bank_transfer">Transferencia</option>
                     <option value="check">Cheque</option>
                     <option value="card">Tarjeta</option>
                     <option value="online">En línea</option>
                   </select>
                 </div>
                 <div>
                   <label className="text-sm font-medium text-gray-700">Número de Referencia</label>
                   <input
                     type="text"
                     value={editForm.reference_number}
                     onChange={(e) => setEditForm({...editForm, reference_number: e.target.value})}
                     className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                     placeholder="Opcional"
                   />
                 </div>
               </div>
               
               <div>
                 <label className="text-sm font-medium text-gray-700">Notas</label>
                 <textarea
                   value={editForm.notes}
                   onChange={(e) => setEditForm({...editForm, notes: e.target.value})}
                   className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                   rows={3}
                   placeholder="Notas adicionales..."
                 />
               </div>
             </div>

             <div className="flex justify-end gap-2">
               <Button 
                 variant="outline" 
                 onClick={() => setShowEditModal(false)}
                 disabled={loading}
               >
                 Cancelar
               </Button>
               <Button 
                 onClick={handleUpdatePayment}
                 disabled={loading}
               >
                 {loading ? 'Actualizando...' : 'Actualizar Pago'}
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
