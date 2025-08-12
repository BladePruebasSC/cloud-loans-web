import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { 
  Edit, 
  DollarSign, 
  Calendar, 
  Percent, 
  Calculator,
  AlertCircle,
  CheckCircle,
  Clock,
  CreditCard,
  Receipt,
  TrendingUp,
  TrendingDown
} from 'lucide-react';

const updateSchema = z.object({
  update_type: z.enum(['payment', 'partial_payment', 'interest_adjustment', 'term_extension', 'rate_change', 'balance_adjustment']),
  amount: z.number().min(0.01, 'El monto debe ser mayor a 0').optional(),
  new_interest_rate: z.number().min(0, 'La tasa debe ser mayor o igual a 0').optional(),
  additional_months: z.number().min(0, 'Los meses adicionales deben ser mayor o igual a 0').optional(),
  adjustment_reason: z.string().min(1, 'Debe especificar la razón del ajuste'),
  payment_method: z.string().optional(),
  reference_number: z.string().optional(),
  notes: z.string().optional(),
});

type UpdateFormData = z.infer<typeof updateSchema>;

interface Loan {
  id: string;
  amount: number;
  remaining_balance: number;
  monthly_payment: number;
  interest_rate: number;
  term_months: number;
  next_payment_date: string;
  status: string;
  client: {
    full_name: string;
    dni: string;
  };
}

interface LoanUpdateFormProps {
  loan: Loan;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

export const LoanUpdateForm: React.FC<LoanUpdateFormProps> = ({ 
  loan, 
  isOpen, 
  onClose, 
  onUpdate 
}) => {
  const [loading, setLoading] = useState(false);
  const [calculatedValues, setCalculatedValues] = useState({
    newBalance: loan.remaining_balance,
    newPayment: loan.monthly_payment,
    newEndDate: '',
    interestAmount: 0,
    principalAmount: 0
  });
  const { user, companyId } = useAuth();

  const form = useForm<UpdateFormData>({
    resolver: zodResolver(updateSchema),
    defaultValues: {
      update_type: 'payment',
      payment_method: 'cash',
    },
  });

  const watchedValues = form.watch(['update_type', 'amount', 'new_interest_rate', 'additional_months']);

  useEffect(() => {
    calculateUpdatedValues();
  }, [watchedValues]);

  const calculateUpdatedValues = () => {
    const [updateType, amount, newRate, additionalMonths] = watchedValues;
    
    let newBalance = loan.remaining_balance;
    let newPayment = loan.monthly_payment;
    let newEndDate = '';
    let interestAmount = 0;
    let principalAmount = 0;

    switch (updateType) {
      case 'payment':
        if (amount) {
          // Calcular interés mensual
          interestAmount = (loan.remaining_balance * loan.interest_rate) / (100 * 12);
          principalAmount = Math.max(0, amount - interestAmount);
          newBalance = Math.max(0, loan.remaining_balance - principalAmount);
        }
        break;
        
      case 'partial_payment':
        if (amount) {
          // Para abono parcial, todo va al principal
          principalAmount = amount;
          newBalance = Math.max(0, loan.remaining_balance - amount);
        }
        break;
        
      case 'interest_adjustment':
        if (newRate !== undefined) {
          // Recalcular cuota con nueva tasa
          const monthlyRate = (newRate / 100) / 12;
          const remainingMonths = Math.ceil(loan.remaining_balance / loan.monthly_payment);
          
          if (monthlyRate === 0) {
            newPayment = loan.remaining_balance / remainingMonths;
          } else {
            newPayment = (loan.remaining_balance * monthlyRate * Math.pow(1 + monthlyRate, remainingMonths)) / 
                        (Math.pow(1 + monthlyRate, remainingMonths) - 1);
          }
        }
        break;
        
      case 'term_extension':
        if (additionalMonths) {
          // Recalcular cuota con plazo extendido
          const currentMonths = Math.ceil(loan.remaining_balance / loan.monthly_payment);
          const newTotalMonths = currentMonths + additionalMonths;
          newPayment = loan.remaining_balance / newTotalMonths;
          
          // Calcular nueva fecha de fin
          const currentEndDate = new Date(loan.next_payment_date);
          currentEndDate.setMonth(currentEndDate.getMonth() + newTotalMonths);
          newEndDate = currentEndDate.toISOString().split('T')[0];
        }
        break;
        
      case 'balance_adjustment':
        if (amount) {
          newBalance = amount;
        }
        break;
    }

    setCalculatedValues({
      newBalance: Math.round(newBalance * 100) / 100,
      newPayment: Math.round(newPayment * 100) / 100,
      newEndDate,
      interestAmount: Math.round(interestAmount * 100) / 100,
      principalAmount: Math.round(principalAmount * 100) / 100
    });
  };

  const onSubmit = async (data: UpdateFormData) => {
    if (!user || !companyId) return;

    setLoading(true);
    try {
      const updateType = data.update_type;
      
      // Registrar la transacción en la tabla de pagos si es un pago o abono
      if (['payment', 'partial_payment'].includes(updateType) && data.amount) {
        const paymentData = {
          loan_id: loan.id,
          amount: data.amount,
          principal_amount: calculatedValues.principalAmount,
          interest_amount: calculatedValues.interestAmount,
          late_fee: 0,
          due_date: loan.next_payment_date,
          payment_method: data.payment_method || 'cash',
          reference_number: data.reference_number,
          notes: `${updateType === 'partial_payment' ? 'Abono parcial' : 'Pago'}: ${data.notes || ''}`,
          created_by: companyId,
        };

        const { error: paymentError } = await supabase
          .from('payments')
          .insert([paymentData]);

        if (paymentError) throw paymentError;
      }

      // Actualizar el préstamo según el tipo de actualización
      let loanUpdates: any = {};

      switch (updateType) {
        case 'payment':
        case 'partial_payment':
          loanUpdates = {
            remaining_balance: calculatedValues.newBalance,
            status: calculatedValues.newBalance <= 0 ? 'paid' : loan.status,
          };
          
          // Solo actualizar next_payment_date si es un pago completo
          if (updateType === 'payment' && calculatedValues.newBalance > 0) {
            const nextPaymentDate = new Date(loan.next_payment_date);
            nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
            loanUpdates.next_payment_date = nextPaymentDate.toISOString().split('T')[0];
          }
          break;
          
        case 'interest_adjustment':
          loanUpdates = {
            interest_rate: data.new_interest_rate,
            monthly_payment: calculatedValues.newPayment,
          };
          break;
          
        case 'term_extension':
          loanUpdates = {
            term_months: loan.term_months + (data.additional_months || 0),
            monthly_payment: calculatedValues.newPayment,
            end_date: calculatedValues.newEndDate,
          };
          break;
          
        case 'balance_adjustment':
          loanUpdates = {
            remaining_balance: calculatedValues.newBalance,
          };
          break;
      }

      // Agregar notas de auditoría
      const auditNote = `${new Date().toLocaleDateString()} - ${updateType}: ${data.adjustment_reason}`;
      loanUpdates.notes = loan.notes ? `${loan.notes}\n${auditNote}` : auditNote;

      const { error: loanError } = await supabase
        .from('loans')
        .update(loanUpdates)
        .eq('id', loan.id);

      if (loanError) throw loanError;

      // Registrar en historial de cambios (si existe la tabla)
      try {
        await supabase
          .from('loan_history')
          .insert([{
            loan_id: loan.id,
            change_type: updateType,
            old_values: {
              balance: loan.remaining_balance,
              payment: loan.monthly_payment,
              rate: loan.interest_rate
            },
            new_values: {
              balance: calculatedValues.newBalance,
              payment: calculatedValues.newPayment,
              rate: data.new_interest_rate || loan.interest_rate
            },
            reason: data.adjustment_reason,
            amount: data.amount,
            created_by: companyId,
          }]);
      } catch (historyError) {
        // Si la tabla no existe, continuar sin error
        console.log('Loan history table not available:', historyError);
      }

      const actionMessages = {
        payment: 'Pago registrado exitosamente',
        partial_payment: 'Abono parcial registrado exitosamente',
        interest_adjustment: 'Tasa de interés actualizada exitosamente',
        term_extension: 'Plazo extendido exitosamente',
        rate_change: 'Tasa de interés modificada exitosamente',
        balance_adjustment: 'Balance ajustado exitosamente'
      };

      toast.success(actionMessages[updateType] || 'Préstamo actualizado exitosamente');
      onUpdate();
      onClose();
    } catch (error) {
      console.error('Error updating loan:', error);
      toast.error('Error al actualizar el préstamo');
    } finally {
      setLoading(false);
    }
  };

  const getUpdateTypeIcon = (type: string) => {
    switch (type) {
      case 'payment': return <Receipt className="h-4 w-4" />;
      case 'partial_payment': return <DollarSign className="h-4 w-4" />;
      case 'interest_adjustment': return <Percent className="h-4 w-4" />;
      case 'term_extension': return <Calendar className="h-4 w-4" />;
      case 'rate_change': return <TrendingUp className="h-4 w-4" />;
      case 'balance_adjustment': return <Calculator className="h-4 w-4" />;
      default: return <Edit className="h-4 w-4" />;
    }
  };

  const getUpdateTypeLabel = (type: string) => {
    const labels = {
      payment: 'Pago Completo',
      partial_payment: 'Abono Parcial',
      interest_adjustment: 'Ajuste de Tasa',
      term_extension: 'Extensión de Plazo',
      rate_change: 'Cambio de Tasa',
      balance_adjustment: 'Ajuste de Balance'
    };
    return labels[type as keyof typeof labels] || type;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="h-5 w-5" />
            Actualizar Préstamo - {loan.client.full_name}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Tipo de Actualización</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <FormField
                      control={form.control}
                      name="update_type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Seleccionar Acción</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Seleccionar tipo de actualización" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="payment">
                                <div className="flex items-center gap-2">
                                  <Receipt className="h-4 w-4" />
                                  Pago Completo de Cuota
                                </div>
                              </SelectItem>
                              <SelectItem value="partial_payment">
                                <div className="flex items-center gap-2">
                                  <DollarSign className="h-4 w-4" />
                                  Abono Parcial
                                </div>
                              </SelectItem>
                              <SelectItem value="interest_adjustment">
                                <div className="flex items-center gap-2">
                                  <Percent className="h-4 w-4" />
                                  Ajuste de Tasa de Interés
                                </div>
                              </SelectItem>
                              <SelectItem value="term_extension">
                                <div className="flex items-center gap-2">
                                  <Calendar className="h-4 w-4" />
                                  Extensión de Plazo
                                </div>
                              </SelectItem>
                              <SelectItem value="balance_adjustment">
                                <div className="flex items-center gap-2">
                                  <Calculator className="h-4 w-4" />
                                  Ajuste de Balance
                                </div>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Campos condicionales según el tipo de actualización */}
                    {['payment', 'partial_payment', 'balance_adjustment'].includes(form.watch('update_type')) && (
                      <FormField
                        control={form.control}
                        name="amount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>
                              {form.watch('update_type') === 'payment' ? 'Monto del Pago' :
                               form.watch('update_type') === 'partial_payment' ? 'Monto del Abono' :
                               'Nuevo Balance'}
                            </FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="0.00"
                                {...field}
                                onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    {form.watch('update_type') === 'interest_adjustment' && (
                      <FormField
                        control={form.control}
                        name="new_interest_rate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Nueva Tasa de Interés (%)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="15.00"
                                {...field}
                                onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    {form.watch('update_type') === 'term_extension' && (
                      <FormField
                        control={form.control}
                        name="additional_months"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Meses Adicionales</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                placeholder="6"
                                {...field}
                                onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    {['payment', 'partial_payment'].includes(form.watch('update_type')) && (
                      <>
                        <FormField
                          control={form.control}
                          name="payment_method"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Método de Pago</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
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

                        <FormField
                          control={form.control}
                          name="reference_number"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Número de Referencia</FormLabel>
                              <FormControl>
                                <Input placeholder="Número de comprobante, cheque, etc." {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </>
                    )}

                    <FormField
                      control={form.control}
                      name="adjustment_reason"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Razón del Ajuste</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Seleccionar razón" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="regular_payment">Pago Regular</SelectItem>
                              <SelectItem value="early_payment">Pago Anticipado</SelectItem>
                              <SelectItem value="partial_payment">Abono Parcial</SelectItem>
                              <SelectItem value="financial_difficulty">Dificultades Financieras</SelectItem>
                              <SelectItem value="rate_negotiation">Renegociación de Tasa</SelectItem>
                              <SelectItem value="payment_plan">Plan de Pagos</SelectItem>
                              <SelectItem value="administrative_adjustment">Ajuste Administrativo</SelectItem>
                              <SelectItem value="error_correction">Corrección de Error</SelectItem>
                              <SelectItem value="goodwill_adjustment">Ajuste de Buena Voluntad</SelectItem>
                              <SelectItem value="other">Otro</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="notes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Notas Adicionales</FormLabel>
                          <FormControl>
                            <Textarea placeholder="Detalles adicionales sobre la actualización..." {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </CardContent>
                </Card>

                <div className="flex gap-4">
                  <Button type="button" variant="outline" onClick={onClose}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={loading}>
                    {loading ? 'Procesando...' : 'Aplicar Actualización'}
                  </Button>
                </div>
              </form>
            </Form>
          </div>

          {/* Panel de Vista Previa */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calculator className="h-5 w-5" />
                  Vista Previa
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-3">
                    {getUpdateTypeIcon(form.watch('update_type'))}
                    <span className="font-semibold">{getUpdateTypeLabel(form.watch('update_type'))}</span>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Balance Actual:</span>
                      <span className="font-semibold">${loan.remaining_balance.toLocaleString()}</span>
                    </div>
                    
                    {['payment', 'partial_payment'].includes(form.watch('update_type')) && form.watch('amount') && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Monto a Aplicar:</span>
                          <span className="font-semibold text-blue-600">${form.watch('amount')?.toLocaleString()}</span>
                        </div>
                        
                        {calculatedValues.interestAmount > 0 && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">A Intereses:</span>
                            <span className="font-semibold text-orange-600">${calculatedValues.interestAmount.toLocaleString()}</span>
                          </div>
                        )}
                        
                        <div className="flex justify-between">
                          <span className="text-gray-600">A Principal:</span>
                          <span className="font-semibold text-green-600">${calculatedValues.principalAmount.toLocaleString()}</span>
                        </div>
                      </>
                    )}

                    <hr className="my-2" />
                    
                    <div className="flex justify-between">
                      <span className="text-gray-600">Nuevo Balance:</span>
                      <span className="font-bold text-lg text-green-600">
                        ${calculatedValues.newBalance.toLocaleString()}
                      </span>
                    </div>

                    {form.watch('update_type') === 'interest_adjustment' && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Tasa Actual:</span>
                          <span className="font-semibold">{loan.interest_rate}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Nueva Tasa:</span>
                          <span className="font-semibold text-blue-600">{form.watch('new_interest_rate')}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Nueva Cuota:</span>
                          <span className="font-bold text-green-600">${calculatedValues.newPayment.toLocaleString()}</span>
                        </div>
                      </>
                    )}

                    {form.watch('update_type') === 'term_extension' && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Plazo Actual:</span>
                          <span className="font-semibold">{loan.term_months} meses</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Meses Adicionales:</span>
                          <span className="font-semibold text-blue-600">+{form.watch('additional_months')} meses</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Nueva Cuota:</span>
                          <span className="font-bold text-green-600">${calculatedValues.newPayment.toLocaleString()}</span>
                        </div>
                        {calculatedValues.newEndDate && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">Nueva Fecha Fin:</span>
                            <span className="font-semibold">{new Date(calculatedValues.newEndDate).toLocaleDateString()}</span>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {calculatedValues.newBalance <= 0 && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 mt-4">
                      <div className="flex items-center gap-2 text-green-800">
                        <CheckCircle className="h-4 w-4" />
                        <span className="font-semibold">Préstamo será marcado como PAGADO</span>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Información del Préstamo */}
            <Card className="mt-4">
              <CardHeader>
                <CardTitle>Información del Préstamo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Cliente:</span>
                  <span className="font-semibold">{loan.client.full_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Cédula:</span>
                  <span className="font-semibold">{loan.client.dni}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Monto Original:</span>
                  <span className="font-semibold">${loan.amount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Cuota Mensual:</span>
                  <span className="font-semibold">${loan.monthly_payment.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Próximo Pago:</span>
                  <span className="font-semibold">{new Date(loan.next_payment_date).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Estado:</span>
                  <Badge variant={
                    loan.status === 'active' ? 'default' :
                    loan.status === 'overdue' ? 'destructive' :
                    loan.status === 'paid' ? 'secondary' : 'outline'
                  }>
                    {loan.status === 'active' ? 'Activo' :
                     loan.status === 'overdue' ? 'Vencido' :
                     loan.status === 'paid' ? 'Pagado' : loan.status}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
    </Dialog>
  );
};