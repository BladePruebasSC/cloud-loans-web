import React, { useState, useEffect } from 'react';
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
  X
} from 'lucide-react';
import { PaymentActions } from './PaymentActions';

interface LoanHistoryEntry {
  id: string;
  loan_id: string;
  change_type: string;
  old_values: any;
  new_values: any;
  reason: string;
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

interface LoanHistoryViewProps {
  loanId: string;
  isOpen: boolean;
  onClose: () => void;
}





export const LoanHistoryView: React.FC<LoanHistoryViewProps> = ({ 
  loanId, 
  isOpen, 
  onClose 
}) => {
  const [history, setHistory] = useState<LoanHistoryEntry[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loan, setLoan] = useState<Loan | null>(null);
  const [loading, setLoading] = useState(true);


  useEffect(() => {
    if (isOpen && loanId) {
      fetchLoanHistory();
      fetchPayments();
      fetchLoanDetails();
    }
  }, [isOpen, loanId]);

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
          console.log('Loan history table not available');
          setHistory([]);
        } else {
          console.error('Error fetching loan history:', error);
          setHistory([]);
        }
      } else {
        setHistory(data || []);
      }
    } catch (error) {
      console.log('Loan history table not available');
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
      setPayments(data || []);
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
      rate_change: 'Cambio de Tasa'
    };
    return labels[type as keyof typeof labels] || type;
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
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Historial del Préstamo
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Historial de Pagos */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Receipt className="h-5 w-5" />
                  Historial de Pagos ({payments.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-8">Cargando historial...</div>
                ) : payments.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Receipt className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No hay pagos registrados</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                                         {payments.map((payment) => (
                       <div 
                         key={payment.id} 
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
                                <span className="font-medium">Fecha:</span> {payment.payment_date}
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
                                 <span className="font-medium">Notas:</span> {payment.notes}
                               </div>
                             )}
                           </div>
                           <div className="flex items-center gap-2 ml-4">
                             <PaymentActions 
                               payment={payment} 
                               onPaymentUpdated={refreshAfterPaymentDeletion}
                             />
                           </div>
                         </div>
                       </div>
                     ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Historial de Cambios */}
            {history.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Edit className="h-5 w-5" />
                    Historial de Modificaciones ({history.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {history.map((entry) => (
                      <div key={entry.id} className="border rounded-lg p-4">
                        <div className="flex items-center gap-3 mb-2">
                          {getChangeTypeIcon(entry.change_type)}
                          <span className="font-semibold">{getChangeTypeLabel(entry.change_type)}</span>
                          <span className="text-sm text-gray-500">
                            {new Date(entry.created_at).toLocaleString('es-DO', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                              timeZone: 'America/Santo_Domingo'
                            })}
                          </span>
                        </div>
                        
                        <div className="text-sm text-gray-600 mb-2">
                          <span className="font-medium">Razón:</span> {entry.reason}
                        </div>

                        {entry.amount && (
                          <div className="text-sm text-gray-600 mb-2">
                            <span className="font-medium">Monto:</span> ${entry.amount.toLocaleString()}
                          </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="font-medium">Valores Anteriores:</span>
                            <ul className="list-disc list-inside ml-4 text-gray-600">
                              {entry.old_values.balance && (
                                <li>Balance: ${entry.old_values.balance.toLocaleString()}</li>
                              )}
                              {entry.old_values.payment && (
                                <li>Cuota: ${entry.old_values.payment.toLocaleString()}</li>
                              )}
                              {entry.old_values.rate && (
                                <li>Tasa: {entry.old_values.rate}%</li>
                              )}
                            </ul>
                          </div>
                          <div>
                            <span className="font-medium">Valores Nuevos:</span>
                            <ul className="list-disc list-inside ml-4 text-gray-600">
                              {entry.new_values.balance && (
                                <li>Balance: ${entry.new_values.balance.toLocaleString()}</li>
                              )}
                              {entry.new_values.payment && (
                                <li>Cuota: ${entry.new_values.payment.toLocaleString()}</li>
                              )}
                              {entry.new_values.rate && (
                                <li>Tasa: {entry.new_values.rate}%</li>
                              )}
                            </ul>
                          </div>
                        </div>
                      </div>
                    ))}
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