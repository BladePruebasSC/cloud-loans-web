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
      const { error } = await supabase
        .from('payments')
        .delete()
        .eq('id', payment.id);

      if (error) throw error;

      toast.success('Pago eliminado exitosamente');
      setShowDeleteModal(false);
      onPaymentUpdated?.();
    } catch (error) {
      console.error('Error deleting payment:', error);
      toast.error('Error al eliminar el pago');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePayment = async () => {
    try {
      setLoading(true);
      const { error } = await supabase
        .from('payments')
        .update({
          amount: editForm.amount,
          principal_amount: editForm.principal_amount,
          interest_amount: editForm.interest_amount,
          late_fee: editForm.late_fee,
          payment_date: editForm.payment_date,
          due_date: editForm.due_date,
          payment_method: editForm.payment_method,
          reference_number: editForm.reference_number || null,
          notes: editForm.notes || null
        })
        .eq('id', payment.id);

      if (error) throw error;

      toast.success('Pago actualizado exitosamente');
      setShowEditModal(false);
      onPaymentUpdated?.();
    } catch (error) {
      console.error('Error updating payment:', error);
      toast.error('Error al actualizar el pago');
    } finally {
      setLoading(false);
    }
  };

  const printReceipt = () => {
    if (!loan) return;
    
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      const receiptHTML = `
        <html>
          <head>
            <title>Recibo de Pago - ${loan.client.full_name}</title>
            <style>
              body { 
                font-family: Arial, sans-serif; 
                margin: 20px; 
                line-height: 1.6;
                color: #333;
              }
              .header { 
                text-align: center; 
                margin-bottom: 30px; 
                border-bottom: 2px solid #333;
                padding-bottom: 20px;
              }
              .receipt-container {
                max-width: 600px;
                margin: 0 auto;
                border: 1px solid #ddd;
                padding: 30px;
                border-radius: 8px;
              }
              .receipt-title {
                font-size: 24px;
                font-weight: bold;
                margin-bottom: 10px;
              }
              .receipt-number {
                font-size: 14px;
                color: #666;
              }
              .section {
                margin-bottom: 25px;
              }
              .section-title {
                font-weight: bold;
                font-size: 16px;
                margin-bottom: 10px;
                border-bottom: 1px solid #eee;
                padding-bottom: 5px;
              }
              .info-row {
                display: flex;
                justify-content: space-between;
                margin-bottom: 8px;
              }
              .info-label {
                font-weight: 500;
                color: #555;
              }
              .info-value {
                font-weight: bold;
              }
              .amount-section {
                background-color: #f8f9fa;
                padding: 15px;
                border-radius: 5px;
                margin: 20px 0;
              }
              .total-amount {
                font-size: 20px;
                font-weight: bold;
                color: #28a745;
                text-align: center;
                margin-top: 10px;
              }
              .footer {
                margin-top: 30px;
                text-align: center;
                font-size: 12px;
                color: #666;
                border-top: 1px solid #eee;
                padding-top: 20px;
              }
              @media print {
                body { margin: 0; }
                .receipt-container { border: none; }
              }
            </style>
          </head>
          <body>
            <div class="receipt-container">
              <div class="header">
                <div class="receipt-title">RECIBO DE PAGO</div>
                <div class="receipt-number">Recibo #${payment.id.slice(0, 8).toUpperCase()}</div>
                <div style="margin-top: 10px; font-size: 14px;">
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
                  <span class="info-label">Nombre:</span>
                  <span class="info-value">${loan.client.full_name}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Cédula:</span>
                  <span class="info-value">${loan.client.dni}</span>
                </div>
                ${loan.client.phone ? `
                <div class="info-row">
                  <span class="info-label">Teléfono:</span>
                  <span class="info-value">${loan.client.phone}</span>
                </div>
                ` : ''}
                ${loan.client.address ? `
                <div class="info-row">
                  <span class="info-label">Dirección:</span>
                  <span class="info-value">${loan.client.address}</span>
                </div>
                ` : ''}
              </div>

              <div class="section">
                <div class="section-title">DETALLES DEL PRÉSTAMO</div>
                <div class="info-row">
                  <span class="info-label">Préstamo ID:</span>
                  <span class="info-value">${loan.id.slice(0, 8).toUpperCase()}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Monto Original:</span>
                  <span class="info-value">RD$${loan.amount.toLocaleString()}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Tasa de Interés:</span>
                  <span class="info-value">${loan.interest_rate}%</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Plazo:</span>
                  <span class="info-value">${loan.term_months} meses</span>
                </div>
              </div>

              <div class="section">
                <div class="section-title">DETALLES DEL PAGO</div>
                <div class="info-row">
                  <span class="info-label">Fecha de Pago:</span>
                  <span class="info-value">${new Date(payment.payment_date).toLocaleDateString()}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Fecha de Vencimiento:</span>
                  <span class="info-value">${new Date(payment.due_date).toLocaleDateString()}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Método de Pago:</span>
                  <span class="info-value">${getPaymentMethodLabel(payment.payment_method)}</span>
                </div>
                ${payment.reference_number ? `
                <div class="info-row">
                  <span class="info-label">Número de Referencia:</span>
                  <span class="info-value">${payment.reference_number}</span>
                </div>
                ` : ''}
              </div>

              <div class="amount-section">
                <div class="section-title">DESGLOSE DEL PAGO</div>
                <div class="info-row">
                  <span class="info-label">Pago a Principal:</span>
                  <span class="info-value">RD$${payment.principal_amount.toLocaleString()}</span>
                </div>
                <div class="info-row">
                  <span class="info-label">Pago a Intereses:</span>
                  <span class="info-value">RD$${payment.interest_amount.toLocaleString()}</span>
                </div>
                ${payment.late_fee > 0 ? `
                <div class="info-row">
                  <span class="info-label">Cargo por Mora:</span>
                  <span class="info-value" style="color: #dc3545;">RD$${payment.late_fee.toLocaleString()}</span>
                </div>
                ` : ''}
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
      printWindow.document.write(receiptHTML);
      printWindow.document.close();
      printWindow.print();
    }
  };

  const downloadReceipt = () => {
    if (!loan) return;
    
    const receiptHTML = `
      <html>
        <head>
          <title>Recibo de Pago - ${loan.client.full_name}</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              margin: 20px; 
              line-height: 1.6;
              color: #333;
            }
            .header { 
              text-align: center; 
              margin-bottom: 30px; 
              border-bottom: 2px solid #333;
              padding-bottom: 20px;
            }
            .receipt-container {
              max-width: 600px;
              margin: 0 auto;
              border: 1px solid #ddd;
              padding: 30px;
              border-radius: 8px;
            }
            .receipt-title {
              font-size: 24px;
              font-weight: bold;
              margin-bottom: 10px;
            }
            .receipt-number {
              font-size: 14px;
              color: #666;
            }
            .section {
              margin-bottom: 25px;
            }
            .section-title {
              font-weight: bold;
              font-size: 16px;
              margin-bottom: 10px;
              border-bottom: 1px solid #eee;
              padding-bottom: 5px;
            }
            .info-row {
              display: flex;
              justify-content: space-between;
              margin-bottom: 8px;
            }
            .info-label {
              font-weight: 500;
              color: #555;
            }
            .info-value {
              font-weight: bold;
            }
            .amount-section {
              background-color: #f8f9fa;
              padding: 15px;
              border-radius: 5px;
              margin: 20px 0;
            }
            .total-amount {
              font-size: 20px;
              font-weight: bold;
              color: #28a745;
              text-align: center;
              margin-top: 10px;
            }
            .footer {
              margin-top: 30px;
              text-align: center;
              font-size: 12px;
              color: #666;
              border-top: 1px solid #eee;
              padding-top: 20px;
            }
          </style>
        </head>
        <body>
          <div class="receipt-container">
            <div class="header">
              <div class="receipt-title">RECIBO DE PAGO</div>
              <div class="receipt-number">Recibo #${payment.id.slice(0, 8).toUpperCase()}</div>
              <div style="margin-top: 10px; font-size: 14px;">
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
                <span class="info-label">Nombre:</span>
                <span class="info-value">${loan.client.full_name}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Cédula:</span>
                <span class="info-value">${loan.client.dni}</span>
              </div>
              ${loan.client.phone ? `
              <div class="info-row">
                <span class="info-label">Teléfono:</span>
                <span class="info-value">${loan.client.phone}</span>
              </div>
              ` : ''}
              ${loan.client.address ? `
              <div class="info-row">
                <span class="info-label">Dirección:</span>
                <span class="info-value">${loan.client.address}</span>
              </div>
              ` : ''}
            </div>

            <div class="section">
              <div class="section-title">DETALLES DEL PRÉSTAMO</div>
              <div class="info-row">
                <span class="info-label">Préstamo ID:</span>
                <span class="info-value">${loan.id.slice(0, 8).toUpperCase()}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Monto Original:</span>
                <span class="info-value">RD$${loan.amount.toLocaleString()}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Tasa de Interés:</span>
                <span class="info-value">${loan.interest_rate}%</span>
              </div>
              <div class="info-row">
                <span class="info-label">Plazo:</span>
                <span class="info-value">${loan.term_months} meses</span>
              </div>
            </div>

            <div class="section">
              <div class="section-title">DETALLES DEL PAGO</div>
              <div class="info-row">
                <span class="info-label">Fecha de Pago:</span>
                <span class="info-value">${new Date(payment.payment_date).toLocaleDateString()}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Fecha de Vencimiento:</span>
                <span class="info-value">${new Date(payment.due_date).toLocaleDateString()}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Método de Pago:</span>
                <span class="info-value">${getPaymentMethodLabel(payment.payment_method)}</span>
              </div>
              ${payment.reference_number ? `
              <div class="info-row">
                <span class="info-label">Número de Referencia:</span>
                <span class="info-value">${payment.reference_number}</span>
              </div>
              ` : ''}
            </div>

            <div class="amount-section">
              <div class="section-title">DESGLOSE DEL PAGO</div>
              <div class="info-row">
                <span class="info-label">Pago a Principal:</span>
                <span class="info-value">RD$${payment.principal_amount.toLocaleString()}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Pago a Intereses:</span>
                <span class="info-value">RD$${payment.interest_amount.toLocaleString()}</span>
              </div>
              ${payment.late_fee > 0 ? `
              <div class="info-row">
                <span class="info-label">Cargo por Mora:</span>
                <span class="info-value" style="color: #dc3545;">RD$${payment.late_fee.toLocaleString()}</span>
              </div>
              ` : ''}
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

    const blob = new Blob([receiptHTML], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recibo_${loan.client.full_name.replace(/\s+/g, '_')}_${new Date(payment.payment_date).toISOString().split('T')[0]}.html`;
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
          <DropdownMenuItem onClick={printReceipt}>
            <Printer className="mr-2 h-4 w-4" />
            Imprimir
          </DropdownMenuItem>
          <DropdownMenuItem onClick={downloadReceipt}>
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
                <Button size="sm" variant="outline" onClick={printReceipt}>
                  <Printer className="h-4 w-4 mr-2" />
                  Imprimir
                </Button>
                <Button size="sm" variant="outline" onClick={downloadReceipt}>
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
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div>
                   <label className="text-sm font-medium text-gray-700">Monto Total</label>
                   <input
                     type="number"
                     value={editForm.amount}
                     onChange={(e) => setEditForm({...editForm, amount: parseFloat(e.target.value) || 0})}
                     className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                   />
                 </div>
                 <div>
                   <label className="text-sm font-medium text-gray-700">Pago a Principal</label>
                   <input
                     type="number"
                     value={editForm.principal_amount}
                     onChange={(e) => setEditForm({...editForm, principal_amount: parseFloat(e.target.value) || 0})}
                     className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                   />
                 </div>
                 <div>
                   <label className="text-sm font-medium text-gray-700">Pago a Intereses</label>
                   <input
                     type="number"
                     value={editForm.interest_amount}
                     onChange={(e) => setEditForm({...editForm, interest_amount: parseFloat(e.target.value) || 0})}
                     className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                   />
                 </div>
                 <div>
                   <label className="text-sm font-medium text-gray-700">Cargo por Mora</label>
                   <input
                     type="number"
                     value={editForm.late_fee}
                     onChange={(e) => setEditForm({...editForm, late_fee: parseFloat(e.target.value) || 0})}
                     className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
    </>
  );
};
