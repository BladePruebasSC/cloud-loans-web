import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { 
  Calendar, 
  DollarSign, 
  CheckCircle, 
  Clock, 
  AlertTriangle,
  Eye,
  X,
  RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrencyNumber } from '@/lib/utils';

interface Installment {
  id: string;
  loan_id: string;
  installment_number: number;
  due_date: string;
  amount: number;
  principal_amount: number;
  interest_amount: number;
  late_fee_paid: number;
  is_paid: boolean;
  paid_date?: string;
  created_at: string;
  updated_at: string;
}

interface InstallmentsTableProps {
  loanId: string;
  isOpen: boolean;
  onClose: () => void;
}

export const InstallmentsTable: React.FC<InstallmentsTableProps> = ({ 
  loanId, 
  isOpen, 
  onClose 
}) => {
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [loading, setLoading] = useState(false);
  const [loanInfo, setLoanInfo] = useState<any>(null);

  useEffect(() => {
    if (isOpen && loanId) {
      fetchInstallments();
      fetchLoanInfo();
    }
  }, [isOpen, loanId]);

  // Función para refrescar los datos
  const refreshData = () => {
    fetchInstallments();
    fetchLoanInfo();
  };

  const fetchInstallments = async () => {
    setLoading(true);
    try {
      // Primero obtener la información del préstamo
      const { data: loanData, error: loanError } = await supabase
        .from('loans')
        .select('monthly_payment, amount, interest_rate')
        .eq('id', loanId)
        .single();

      if (loanError) throw loanError;

      // Luego obtener las cuotas
      const { data, error } = await supabase
        .from('installments')
        .select('*')
        .eq('loan_id', loanId)
        .order('installment_number', { ascending: true });

      if (error) throw error;

      // Corregir los datos de las cuotas
      const correctedInstallments = (data || []).map(installment => {
        // Si el amount es 0 o undefined, calcularlo
        let correctedAmount = installment.amount;
        let correctedPrincipal = installment.principal_amount;
        let correctedInterest = installment.interest_amount;

        if (!correctedAmount || correctedAmount === 0) {
          // Usar el monto de la cuota mensual del préstamo
          correctedAmount = loanData.monthly_payment;
        }

        if (!correctedInterest || correctedInterest === 0) {
          // Calcular el interés fijo por cuota (basado en el monto original)
          correctedInterest = (loanData.amount * loanData.interest_rate) / 100;
        }

        if (!correctedPrincipal || correctedPrincipal === 0) {
          // Calcular el capital: cuota mensual - interés fijo
          correctedPrincipal = correctedAmount - correctedInterest;
        }

        // Validar que los cálculos sean coherentes
        if (correctedAmount !== correctedPrincipal + correctedInterest) {
          console.warn('⚠️ Inconsistencia en cuota:', {
            installment: installment.installment_number,
            amount: correctedAmount,
            principal: correctedPrincipal,
            interest: correctedInterest,
            sum: correctedPrincipal + correctedInterest
          });
        }

        return {
          ...installment,
          amount: Math.round(correctedAmount * 100) / 100,
          principal_amount: Math.round(correctedPrincipal * 100) / 100,
          interest_amount: Math.round(correctedInterest * 100) / 100
        };
      });

      console.log('🔍 InstallmentsTable - Cuotas corregidas:', {
        original: data,
        corrected: correctedInstallments,
        loanData
      });

      // Si hay cuotas con datos incorrectos en la base de datos original, actualizarlas
      const needsUpdate = (data || []).some(inst => 
        !inst.amount || inst.amount === 0 || 
        !inst.principal_amount || inst.principal_amount === 0 || 
        !inst.interest_amount || inst.interest_amount === 0
      );

      if (needsUpdate) {
        console.log('🔧 Actualizando cuotas con datos incorrectos en la base de datos...');
        
        for (let i = 0; i < (data || []).length; i++) {
          const originalInstallment = data[i];
          const correctedInstallment = correctedInstallments[i];
          
          if ((!originalInstallment.amount || originalInstallment.amount === 0) && 
              correctedInstallment.amount > 0) {
            try {
              await supabase
                .from('installments')
                .update({
                  amount: correctedInstallment.amount,
                  principal_amount: correctedInstallment.principal_amount,
                  interest_amount: correctedInstallment.interest_amount
                })
                .eq('id', originalInstallment.id);
              
              console.log(`✅ Cuota ${correctedInstallment.installment_number} actualizada en BD`);
            } catch (updateError) {
              console.error(`❌ Error actualizando cuota ${correctedInstallment.installment_number}:`, updateError);
            }
          }
        }
      }

      setInstallments(correctedInstallments);
    } catch (error) {
      console.error('Error fetching installments:', error);
      toast.error('Error al cargar las cuotas');
    } finally {
      setLoading(false);
    }
  };

  const fetchLoanInfo = async () => {
    try {
      const { data, error } = await supabase
        .from('loans')
        .select(`
          id,
          amount,
          remaining_balance,
          monthly_payment,
          interest_rate,
          term_months,
          status,
          start_date,
          first_payment_date,
          payment_frequency,
          clients:client_id (
            full_name,
            dni
          )
        `)
        .eq('id', loanId)
        .single();

      if (error) throw error;
      setLoanInfo(data);
    } catch (error) {
      console.error('Error fetching loan info:', error);
    }
  };

  const getStatusBadge = (installment: Installment) => {
    if (installment.is_paid) {
      return (
        <Badge variant="secondary" className="bg-green-100 text-green-800">
          <CheckCircle className="h-3 w-3 mr-1" />
          Pagada
        </Badge>
      );
    }

    if (!installment.due_date) {
      return (
        <Badge variant="outline">
          <Clock className="h-3 w-3 mr-1" />
          Pendiente
        </Badge>
      );
    }

    try {
      const dueDate = new Date(installment.due_date);
      const today = new Date();
      const isOverdue = dueDate < today;

      if (isOverdue) {
        return (
          <Badge variant="destructive">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Vencida
          </Badge>
        );
      }
    } catch (error) {
      // Si hay error con la fecha, mostrar como pendiente
    }

    return (
      <Badge variant="outline">
        <Clock className="h-3 w-3 mr-1" />
        Pendiente
      </Badge>
    );
  };

  const getDaysOverdue = (dueDate: string) => {
    if (!dueDate) return 0;
    try {
      const due = new Date(dueDate);
      const today = new Date();
      const diffTime = today.getTime() - due.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      return Math.max(0, diffDays);
    } catch (error) {
      return 0;
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    try {
      return new Date(dateString).toLocaleDateString('es-DO', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch (error) {
      return '-';
    }
  };

  const totalAmount = installments.reduce((sum, inst) => sum + (inst.amount || 0), 0);
  const totalPaid = installments.filter(inst => inst.is_paid).reduce((sum, inst) => sum + (inst.amount || 0), 0);
  const totalPending = totalAmount - totalPaid;
  const paidCount = installments.filter(inst => inst.is_paid).length;
  const pendingCount = installments.length - paidCount;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Tabla de Cuotas
              {loanInfo && (
                <span className="text-sm font-normal text-gray-600">
                  - {loanInfo.clients?.full_name}
                </span>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={refreshData}
              disabled={loading}
              className="flex items-center gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </Button>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
              <p className="text-gray-600">Cargando cuotas...</p>
            </div>
          </div>
        ) : installments.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <p className="text-gray-600">No se encontraron cuotas para este préstamo</p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Resumen del préstamo */}
            {loanInfo && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Información del Préstamo</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Cliente:</span>
                      <div className="font-semibold">{loanInfo.clients?.full_name}</div>
                    </div>
                    <div>
                      <span className="text-gray-600">Monto Original:</span>
                      <div className="font-semibold">RD${formatCurrencyNumber(loanInfo.amount || 0)}</div>
                    </div>
                    <div>
                      <span className="text-gray-600">Balance Restante:</span>
                      <div className="font-semibold">RD${formatCurrencyNumber(loanInfo.remaining_balance || 0)}</div>
                    </div>
                    <div>
                      <span className="text-gray-600">Cuota Mensual:</span>
                      <div className="font-semibold">RD${formatCurrencyNumber(loanInfo.monthly_payment || 0)}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Estadísticas de cuotas */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Resumen de Cuotas</CardTitle>
                {installments.some(inst => !inst.amount || !inst.due_date) && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-2">
                    <div className="flex items-center gap-2 text-yellow-800">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="text-sm">
                        ⚠️ Algunas cuotas tienen datos incompletos. Esto puede deberse a extensiones de plazo recientes.
                      </span>
                    </div>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-3 bg-blue-50 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">{installments.length}</div>
                    <div className="text-sm text-gray-600">Total Cuotas</div>
                  </div>
                  <div className="text-center p-3 bg-green-50 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">{paidCount}</div>
                    <div className="text-sm text-gray-600">Pagadas</div>
                  </div>
                  <div className="text-center p-3 bg-orange-50 rounded-lg">
                    <div className="text-2xl font-bold text-orange-600">{pendingCount}</div>
                    <div className="text-sm text-gray-600">Pendientes</div>
                  </div>
                  <div className="text-center p-3 bg-red-50 rounded-lg">
                    <div className="text-2xl font-bold text-red-600">
                      {installments.filter(inst => !inst.is_paid && getDaysOverdue(inst.due_date) > 0).length}
                    </div>
                    <div className="text-sm text-gray-600">Vencidas</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Tabla de cuotas */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Detalle de Cuotas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  {/* Vista móvil */}
                  <div className="block md:hidden space-y-3">
                    {installments.map((installment) => (
                      <div key={installment.id} className="border rounded-lg p-4 bg-white">
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-lg">#{installment.installment_number}</span>
                            {getStatusBadge(installment)}
                          </div>
                          <div className="text-right">
                            <div className="font-bold text-green-600">
                              RD${formatCurrencyNumber(installment.amount || 0)}
                            </div>
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                          <div>
                            <span className="font-medium">Vence:</span>
                            <div>{formatDate(installment.due_date)}</div>
                          </div>
                          <div>
                            <span className="font-medium">Capital:</span>
                            <div>RD${formatCurrencyNumber(installment.principal_amount || 0)}</div>
                          </div>
                          <div>
                            <span className="font-medium">Interés:</span>
                            <div>RD${formatCurrencyNumber(installment.interest_amount || 0)}</div>
                          </div>
                          <div>
                            <span className="font-medium">Mora Pagada:</span>
                            <div>RD${formatCurrencyNumber(installment.late_fee_paid || 0)}</div>
                          </div>
                        </div>

                        {installment.is_paid && installment.paid_date && (
                          <div className="mt-2 pt-2 border-t text-sm text-green-600">
                            <span className="font-medium">Pagada el:</span> {formatDate(installment.paid_date)}
                          </div>
                        )}

                        {!installment.is_paid && getDaysOverdue(installment.due_date) > 0 && (
                          <div className="mt-2 pt-2 border-t text-sm text-red-600">
                            <span className="font-medium">Días de atraso:</span> {getDaysOverdue(installment.due_date)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Vista desktop */}
                  <div className="hidden md:block">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b bg-gray-50">
                          <th className="text-left p-3 font-semibold"># Cuota</th>
                          <th className="text-left p-3 font-semibold">Fecha Vencimiento</th>
                          <th className="text-left p-3 font-semibold">Monto</th>
                          <th className="text-left p-3 font-semibold">Capital</th>
                          <th className="text-left p-3 font-semibold">Interés</th>
                          <th className="text-left p-3 font-semibold">Mora Pagada</th>
                          <th className="text-left p-3 font-semibold">Estado</th>
                          <th className="text-left p-3 font-semibold">Fecha Pago</th>
                          <th className="text-left p-3 font-semibold">Días Atraso</th>
                        </tr>
                      </thead>
                      <tbody>
                        {installments.map((installment) => (
                          <tr key={installment.id} className="border-b hover:bg-gray-50">
                            <td className="p-3 font-semibold">#{installment.installment_number}</td>
                            <td className="p-3">{formatDate(installment.due_date)}</td>
                            <td className="p-3 font-semibold text-green-600">
                              RD${formatCurrencyNumber(installment.amount || 0)}
                            </td>
                            <td className="p-3">RD${formatCurrencyNumber(installment.principal_amount || 0)}</td>
                            <td className="p-3">RD${formatCurrencyNumber(installment.interest_amount || 0)}</td>
                            <td className="p-3">RD${formatCurrencyNumber(installment.late_fee_paid || 0)}</td>
                            <td className="p-3">{getStatusBadge(installment)}</td>
                            <td className="p-3">
                              {installment.paid_date ? formatDate(installment.paid_date) : '-'}
                            </td>
                            <td className="p-3">
                              {!installment.is_paid && getDaysOverdue(installment.due_date) > 0 ? (
                                <span className="text-red-600 font-semibold">
                                  {getDaysOverdue(installment.due_date)} días
                                </span>
                              ) : (
                                '-'
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Totales */}
            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                  <div>
                    <div className="text-lg font-bold text-blue-600">
                      RD${formatCurrencyNumber(totalAmount)}
                    </div>
                    <div className="text-sm text-gray-600">Total a Pagar</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-green-600">
                      RD${formatCurrencyNumber(totalPaid)}
                    </div>
                    <div className="text-sm text-gray-600">Total Pagado</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-orange-600">
                      RD${formatCurrencyNumber(totalPending)}
                    </div>
                    <div className="text-sm text-gray-600">Total Pendiente</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-gray-600">
                      {totalAmount > 0 ? Math.round((totalPaid / totalAmount) * 100) : 0}%
                    </div>
                    <div className="text-sm text-gray-600">% Pagado</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button variant="outline" onClick={onClose}>
                <X className="h-4 w-4 mr-2" />
                Cerrar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
