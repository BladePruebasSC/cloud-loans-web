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
import { formatInTimeZone } from 'date-fns-tz';
import { addHours } from 'date-fns';

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
  payment_time_local?: string;
  payment_timezone?: string;
  loan_id: string;
}

interface Loan {
  id: string;
  amount: number;
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
  const [history, setHistory] = useState<LoanHistoryEntry[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loan, setLoan] = useState<Loan | null>(null);
  const [loading, setLoading] = useState(true);

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
    }
  }, [isOpen, loanId]);

  // Escuchar eventos de actualización del préstamo para recargar el historial
  useEffect(() => {
    const handleLoanHistoryRefresh = (event: CustomEvent) => {
      if (event.detail && event.detail.loanId === loanId && isOpen) {
        console.log('🔄 Recargando historial después de actualización del préstamo...');
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
      console.log('🔍 Fetching loan history for loan:', loanId);
      // Intentar obtener historial si la tabla existe
      const { data, error } = await supabase
        .from('loan_history')
        .select('*')
        .eq('loan_id', loanId)
        .order('created_at', { ascending: false });

      if (error) {
        // Si la tabla no existe (42P01) o no hay permisos, simplemente no mostrar historial
        if (error.code === '42P01' || error.code === 'PGRST116') {
          console.log('⚠️ Loan history table not available:', error);
          setHistory([]);
        } else {
          console.error('❌ Error fetching loan history:', error);
          setHistory([]);
        }
      } else {
        console.log('✅ Loan history fetched:', data?.length || 0, 'entries');
        console.log('📋 History entries:', data);
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
      add_charge: 'Agregar Cargo',
      remove_late_fee: 'Eliminar Mora'
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
                      history.filter(h => h.change_type === 'add_charge' || h.change_type === 'remove_late_fee').length;
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
                    type: 'payment' | 'add_charge' | 'remove_late_fee';
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

                  // Agregar cargos y eliminaciones de mora del historial
                  console.log('🔍 Processing history entries:', history.length);
                  history.forEach(entry => {
                    console.log('🔍 Processing entry:', entry.change_type, entry.id);
                    if (entry.change_type === 'add_charge' || entry.change_type === 'remove_late_fee') {
                      console.log('✅ Adding movement:', entry.change_type);
                      movements.push({
                        id: entry.id,
                        type: entry.change_type as 'add_charge' | 'remove_late_fee',
                        date: new Date(entry.created_at),
                        data: entry
                      });
                    }
                  });
                  
                  console.log('📊 Total movements:', movements.length);

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
                          return (
                            <div 
                              key={movement.id} 
                              className="border rounded-lg p-4 hover:bg-gray-50 transition-colors bg-blue-50/30"
                            >
                              <div className="flex items-center gap-3 mb-2">
                                <TrendingUp className="h-4 w-4 text-blue-600" />
                                <span className="font-semibold">Cargo Agregado: ${entry.amount?.toLocaleString()}</span>
                                <Badge variant="outline" className="bg-blue-100 text-blue-800">Cargo</Badge>
                              </div>
                              
                              <div className="text-sm text-gray-600 mb-2">
                                <span className="font-medium">Fecha:</span>{' '}
                                {formatInTimeZone(
                                  addHours(new Date(entry.created_at), 2),
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

                              <div className="text-sm text-gray-600 mb-2">
                                <span className="font-medium">Balance Anterior:</span> ${entry.old_values.balance?.toLocaleString()}
                              </div>

                              <div className="text-sm text-gray-600 mb-2">
                                <span className="font-medium">Nuevo Balance:</span> ${entry.new_values.balance?.toLocaleString()}
                              </div>

                              {entry.reason && (
                                <div className="text-sm text-gray-600 mb-2">
                                  <span className="font-medium">Razón:</span> {translateReason(entry.reason)}
                                </div>
                              )}

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
                                  addHours(new Date(entry.created_at), 2),
                                  'America/Santo_Domingo',
                                  'dd MMM yyyy, hh:mm a'
                                )}
                              </div>

                              {entry.old_values.current_late_fee !== undefined && (
                                <div className="text-sm text-gray-600 mb-2">
                                  <span className="font-medium">Mora Anterior:</span> RD${entry.old_values.current_late_fee.toLocaleString()}
                                </div>
                              )}

                              {entry.new_values.current_late_fee !== undefined && (
                                <div className="text-sm text-gray-600 mb-2">
                                  <span className="font-medium">Mora Nueva:</span> RD${entry.new_values.current_late_fee.toLocaleString()}
                                </div>
                              )}

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

            {/* Historial de Cambios (excluyendo add_charge y remove_late_fee que ya están en movimientos) */}
            {history.filter(h => h.change_type !== 'add_charge' && h.change_type !== 'remove_late_fee').length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Edit className="h-5 w-5" />
                    Historial de Modificaciones ({history.filter(h => h.change_type !== 'add_charge' && h.change_type !== 'remove_late_fee').length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {history.filter(h => h.change_type !== 'add_charge' && h.change_type !== 'remove_late_fee').map((entry) => (
                      <div key={entry.id} className="border rounded-lg p-4">
                        <div className="flex items-center gap-3 mb-2">
                          {getChangeTypeIcon(entry.change_type)}
                          <span className="font-semibold">{getChangeTypeLabel(entry.change_type)}</span>
                          <span className="text-sm text-gray-500">
                            {formatInTimeZone(
                              addHours(new Date(entry.created_at), 2),
                              'America/Santo_Domingo',
                              'dd MMM yyyy, hh:mm a'
                            )}
                          </span>
                        </div>
                        
                        <div className="text-sm text-gray-600 mb-2">
                          <span className="font-medium">Razón:</span> {translateReason(entry.reason)}
                        </div>

                        {entry.amount && (
                          <div className="text-sm text-gray-600 mb-2">
                            <span className="font-medium">
                              {entry.change_type === 'add_charge' ? 'Monto del Cargo:' :
                               entry.change_type === 'remove_late_fee' ? 'Mora Eliminada:' :
                               'Monto:'} 
                            </span> ${entry.amount.toLocaleString()}
                          </div>
                        )}

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
                        {entry.change_type === 'remove_late_fee' && entry.old_values.current_late_fee !== undefined && (
                          <div className="text-sm text-gray-600 mb-2">
                            <span className="font-medium">Mora Anterior:</span> RD${entry.old_values.current_late_fee.toLocaleString()}
                          </div>
                        )}

                        {entry.change_type === 'remove_late_fee' && entry.new_values.current_late_fee !== undefined && (
                          <div className="text-sm text-gray-600 mb-2">
                            <span className="font-medium">Mora Nueva:</span> RD${entry.new_values.current_late_fee.toLocaleString()}
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
                              {entry.old_values.current_late_fee !== undefined && entry.change_type !== 'remove_late_fee' && (
                                <li>Mora: RD${entry.old_values.current_late_fee.toLocaleString()}</li>
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
                              {entry.new_values.current_late_fee !== undefined && entry.change_type !== 'remove_late_fee' && (
                                <li>Mora: RD${entry.new_values.current_late_fee.toLocaleString()}</li>
                              )}
                            </ul>
                          </div>
                        </div>

                        {/* Mostrar notas si existen */}
                        {(entry as any).notes && (
                          <div className="text-sm text-gray-600 mt-2 pt-2 border-t">
                            <span className="font-medium">Notas:</span> {(entry as any).notes}
                          </div>
                        )}
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