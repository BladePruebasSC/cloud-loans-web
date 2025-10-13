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
  Calculator,
  AlertCircle,
  CheckCircle,
  Clock,
  CreditCard,
  Receipt,
  Trash2
} from 'lucide-react';

const updateSchema = z.object({
  update_type: z.enum(['payment', 'partial_payment', 'term_extension', 'balance_adjustment', 'delete_loan', 'late_fee_config']),
  amount: z.number().min(0.01, 'El monto debe ser mayor a 0').optional(),
  additional_months: z.number().min(0, 'Los meses adicionales deben ser mayor o igual a 0').optional(),
  adjustment_reason: z.string().min(1, 'Debe especificar la razón del ajuste'),
  payment_method: z.string().optional(),
  reference_number: z.string().optional(),
  notes: z.string().optional(),
  // Campos de mora
  late_fee_enabled: z.boolean().optional(),
  late_fee_rate: z.number().min(0).max(100).optional(),
  grace_period_days: z.number().min(0).max(30).optional(),
  max_late_fee: z.number().min(0).optional(),
  late_fee_calculation_type: z.enum(['daily', 'monthly', 'compound']).optional(),
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
  start_date: string;
  status: string;
  paid_installments?: number[];
  payment_frequency?: string;
  first_payment_date?: string;
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

  const watchedValues = form.watch(['update_type', 'amount', 'additional_months']);

  useEffect(() => {
    calculateUpdatedValues();
  }, [watchedValues]);

  // Pre-llenar el monto cuando se selecciona "Pago Completo de Cuota"
  useEffect(() => {
    const updateType = form.watch('update_type');
    if (updateType === 'payment') {
      // Para pago completo de cuota, usar la cuota mensual
      form.setValue('amount', loan.monthly_payment);
    }
  }, [form.watch('update_type'), form, loan.monthly_payment]);

  const calculateUpdatedValues = () => {
    const [updateType, amount, additionalMonths] = watchedValues;
    
    let newBalance = loan.remaining_balance;
    let newPayment = loan.monthly_payment;
    let newEndDate = '';
    let interestAmount = 0;
    let principalAmount = 0;

    switch (updateType) {
        case 'payment':
          if (amount) {
            // Calcular el interés fijo por cuota (amortización simple)
            // Fórmula: Interés por cuota = Monto Original × Tasa de Interés ÷ 100
            const fixedInterestPerPayment = (loan.amount * loan.interest_rate) / 100;
            
            // TODO: Implementar cálculo de interés ya pagado en esta cuota
            // Por ahora, usar la lógica original hasta que se implemente completamente
            if (amount <= fixedInterestPerPayment) {
              interestAmount = amount;
              principalAmount = 0;
            } else {
              interestAmount = fixedInterestPerPayment;
              principalAmount = amount - fixedInterestPerPayment;
            }
            
            newBalance = Math.max(0, loan.remaining_balance - amount);
          }
          break;
        
      case 'partial_payment':
        if (amount) {
          // Para abono parcial, todo va al principal
          principalAmount = amount;
          newBalance = Math.max(0, loan.remaining_balance - amount);
        }
        break;
        

        
      case 'term_extension':
        if (additionalMonths) {
          // Calcular meses restantes actuales
          const totalPayments = loan.term_months;
          const paidPayments = Math.floor((loan.amount - loan.remaining_balance) / loan.monthly_payment);
          const currentRemainingMonths = Math.max(1, totalPayments - paidPayments);
          const newTotalMonths = currentRemainingMonths + additionalMonths;
          const newTotalPayments = totalPayments + additionalMonths;
          
          // Fórmula correcta: (Monto Original × Tasa × Plazo + Monto Original) ÷ Plazo
          const totalInterest = (loan.amount * loan.interest_rate * newTotalPayments) / 100;
          const totalAmount = totalInterest + loan.amount;
          newPayment = totalAmount / newTotalPayments;
          
          // Calcular nuevo balance: el balance actual + las cuotas adicionales
          const additionalBalance = newPayment * additionalMonths;
          newBalance = loan.remaining_balance + additionalBalance;
          
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
        
      case 'delete_loan':
        // Para eliminar préstamos, no necesitamos calcular nuevos valores
        // Solo marcamos como eliminado
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

    // Evitar múltiples envíos
    if (loading) return;
    
    setLoading(true);
    try {
      const updateType = data.update_type;
      
      // Registrar la transacción en la tabla de pagos si es un pago o abono
      if (['payment', 'partial_payment'].includes(updateType) && data.amount) {
        // Validaciones para pagos
        if (data.amount > loan.remaining_balance) {
          toast.error(`El pago no puede exceder el balance restante de RD$${loan.remaining_balance.toLocaleString()}`);
          setLoading(false);
          return;
        }

        if (data.amount <= 0) {
          toast.error('El monto del pago debe ser mayor a 0');
          setLoading(false);
          return;
        }

        // Determinar si es pago completo o parcial
        const isFullPayment = data.amount >= loan.monthly_payment;
        const paymentStatus = isFullPayment ? 'completed' : 'pending';
        
        // Mostrar advertencia para pagos parciales
        if (!isFullPayment && updateType === 'payment') {
          const remainingAmount = loan.monthly_payment - data.amount;
          toast.warning(`Pago parcial registrado. Queda pendiente RD$${remainingAmount.toLocaleString()} de la cuota mensual.`);
        }

        // Ajustar fecha para zona horaria de Santo Domingo antes de enviar
        const now = new Date();
        const santoDomingoDate = new Date(now.toLocaleString("en-US", {timeZone: "America/Santo_Domingo"}));
        const paymentDate = santoDomingoDate.toISOString().split('T')[0]; // YYYY-MM-DD en Santo Domingo
        
        console.log('🔍 LoanUpdateForm: Fecha del pago que se enviará:', paymentDate);

        const paymentData = {
          loan_id: loan.id,
          amount: data.amount,
          principal_amount: calculatedValues.principalAmount,
          interest_amount: calculatedValues.interestAmount,
          late_fee: 0,
          due_date: loan.next_payment_date,
          payment_date: paymentDate, // Agregar fecha del pago
          payment_method: data.payment_method || 'cash',
          reference_number: data.reference_number,
          notes: `${updateType === 'partial_payment' ? 'Abono parcial' : 'Pago'}: ${data.notes || ''}`,
          status: paymentStatus, // Agregar el status del pago
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

          // IMPORTANTE: Solo actualizar next_payment_date y paid_installments si es un pago COMPLETO
          // Los abonos parciales (partial_payment) NO marcan cuotas como pagadas
          // ni avanzan la fecha de próximo pago
          if (updateType === 'payment' && calculatedValues.newBalance > 0) {
            // Actualizar next_payment_date según la frecuencia de pago
            const nextDate = new Date(loan.next_payment_date);
            const frequency = loan.payment_frequency || 'monthly';

            switch (frequency) {
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
                nextDate.setMonth(nextDate.getMonth() + 1);
                break;
              case 'quarterly':
                nextDate.setMonth(nextDate.getMonth() + 3);
                break;
              case 'yearly':
                nextDate.setFullYear(nextDate.getFullYear() + 1);
                break;
              default:
                nextDate.setMonth(nextDate.getMonth() + 1);
            }

            loanUpdates.next_payment_date = nextDate.toISOString().split('T')[0];

            // Actualizar paid_installments: marcar la primera cuota NO pagada
            const updatedPaidInstallments = [...(loan.paid_installments || [])];
            const totalInstallments = loan.term_months || 4;
            let firstUnpaidInstallment = null;

            for (let i = 1; i <= totalInstallments; i++) {
              if (!updatedPaidInstallments.includes(i)) {
                firstUnpaidInstallment = i;
                break;
              }
            }

            if (firstUnpaidInstallment) {
              updatedPaidInstallments.push(firstUnpaidInstallment);
              updatedPaidInstallments.sort((a, b) => a - b);
              loanUpdates.paid_installments = updatedPaidInstallments;

              // Marcar la cuota como pagada en la tabla installments
              try {
                await supabase
                  .from('installments')
                  .update({
                    is_paid: true,
                    paid_date: new Date().toISOString().split('T')[0],
                    late_fee_paid: 0
                  })
                  .eq('loan_id', loan.id)
                  .eq('installment_number', firstUnpaidInstallment);

                console.log(`✅ Cuota ${firstUnpaidInstallment} marcada como pagada`);
              } catch (error) {
                console.error('Error marcando cuota como pagada:', error);
              }
            }
          }
          break;
          

          
        case 'term_extension':
          {
            const additionalMonths = data.additional_months || 0;
            const newTermMonths = loan.term_months + additionalMonths;

            loanUpdates = {
              term_months: newTermMonths,
              monthly_payment: calculatedValues.newPayment,
              end_date: calculatedValues.newEndDate,
            };

            // Crear las nuevas cuotas en la tabla installments
            try {
              const newInstallments = [];
              const startDate = new Date(loan.first_payment_date || loan.next_payment_date);
              const frequency = loan.payment_frequency || 'monthly';

              for (let i = loan.term_months + 1; i <= newTermMonths; i++) {
                const dueDate = new Date(startDate);
                const periodsToAdd = i - 1;

                switch (frequency) {
                  case 'daily':
                    dueDate.setDate(dueDate.getDate() + periodsToAdd);
                    break;
                  case 'weekly':
                    dueDate.setDate(dueDate.getDate() + periodsToAdd * 7);
                    break;
                  case 'biweekly':
                    dueDate.setDate(dueDate.getDate() + periodsToAdd * 14);
                    break;
                  case 'monthly':
                    dueDate.setMonth(dueDate.getMonth() + periodsToAdd);
                    break;
                  case 'quarterly':
                    dueDate.setMonth(dueDate.getMonth() + periodsToAdd * 3);
                    break;
                  case 'yearly':
                    dueDate.setFullYear(dueDate.getFullYear() + periodsToAdd);
                    break;
                  default:
                    dueDate.setMonth(dueDate.getMonth() + periodsToAdd);
                }

                newInstallments.push({
                  loan_id: loan.id,
                  installment_number: i,
                  due_date: dueDate.toISOString().split('T')[0],
                  amount: calculatedValues.newPayment,
                  is_paid: false,
                  principal_amount: 0,
                  interest_amount: 0,
                  late_fee_paid: 0
                });
              }

              if (newInstallments.length > 0) {
                const { error: installmentsError } = await supabase
                  .from('installments')
                  .insert(newInstallments);

                if (installmentsError) {
                  console.error('Error creando nuevas cuotas:', installmentsError);
                } else {
                  console.log(`✅ ${newInstallments.length} nuevas cuotas creadas`);
                }
              }
            } catch (error) {
              console.error('Error en extensión de plazo:', error);
            }
          }
          break;
          
        case 'balance_adjustment':
          loanUpdates = {
            remaining_balance: calculatedValues.newBalance,
          };
          // NOTA: El ajuste de balance no afecta paid_installments ni installments
          // porque solo modifica el balance restante sin marcar cuotas como pagadas
          // La mora se recalculará automáticamente basándose en las cuotas pendientes
          break;
          
        case 'late_fee_config':
          loanUpdates = {
            late_fee_enabled: data.late_fee_enabled,
            late_fee_rate: data.late_fee_rate,
            grace_period_days: data.grace_period_days,
            max_late_fee: data.max_late_fee,
            late_fee_calculation_type: data.late_fee_calculation_type,
          };
          break;
          
        case 'delete_loan':
          loanUpdates = {
            status: 'deleted',
            deleted_at: new Date().toISOString(),
            deleted_reason: data.adjustment_reason,
          };
          break;
      }

      // Agregar notas de auditoría
      const auditNote = `${new Date().toLocaleDateString()} - ${updateType}: ${data.adjustment_reason}`;
      // Note: loan.notes doesn't exist in the Loan interface, using purpose instead
      loanUpdates.purpose = auditNote;
      
      // CRÍTICO: Preservar la fecha de inicio original en todas las actualizaciones
      loanUpdates.start_date = loan.start_date;

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
              rate: loan.interest_rate
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
        term_extension: 'Plazo extendido exitosamente',
        balance_adjustment: 'Balance ajustado exitosamente',
        late_fee_config: 'Configuración de mora actualizada exitosamente',
        delete_loan: 'Préstamo eliminado exitosamente (recuperable por 2 meses)'
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
      case 'term_extension': return <Calendar className="h-4 w-4" />;
      case 'balance_adjustment': return <Calculator className="h-4 w-4" />;
      case 'late_fee_config': return <AlertCircle className="h-4 w-4" />;
      case 'delete_loan': return <Trash2 className="h-4 w-4" />;
      default: return <Edit className="h-4 w-4" />;
    }
  };

  const getUpdateTypeLabel = (type: string) => {
    const labels = {
      payment: 'Pago Completo',
      partial_payment: 'Abono Parcial',
      term_extension: 'Extensión de Plazo',
      balance_adjustment: 'Ajuste de Balance',
      late_fee_config: 'Configurar Mora',
      delete_loan: 'Eliminar Préstamo'
    };
    return labels[type as keyof typeof labels] || type;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="h-5 w-5" />
            Editar Préstamo - {loan.client.full_name}
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
                              <SelectItem value="delete_loan">
                                <div className="flex items-center gap-2">
                                  <Trash2 className="h-4 w-4" />
                                  Eliminar Préstamo
                                </div>
                              </SelectItem>
                              <SelectItem value="late_fee_config">
                                <div className="flex items-center gap-2">
                                  <AlertCircle className="h-4 w-4" />
                                  Configurar Mora
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
                                placeholder="0"
                                step="0.01"
                                {...field}
                                value={field.value || ''}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  field.onChange(value === '' ? 0 : parseFloat(value) || 0);
                                }}
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
                                type="text"
                                placeholder="0"
                                {...field}
                                value={field.value || ''}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  if (value === '' || /^\d*$/.test(value)) {
                                    field.onChange(value === '' ? 0 : parseInt(value) || 0);
                                  }
                                }}
                                className="[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    {/* Configuración de Mora */}
                    {form.watch('update_type') === 'late_fee_config' && (
                      <div className="space-y-4">
                        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                          <h4 className="text-sm font-semibold text-orange-800 mb-3">Configuración de Mora</h4>
                          
                          <div className="space-y-4">
                            {/* Habilitar Mora */}
                            <FormField
                              control={form.control}
                              name="late_fee_enabled"
                              render={({ field }) => (
                                <FormItem>
                                  <div className="flex items-center justify-between p-3 bg-white rounded-lg border">
                                    <div>
                                      <FormLabel className="text-sm font-semibold">Habilitar Mora</FormLabel>
                                      <p className="text-xs text-gray-600">Activar el cálculo automático de mora</p>
                                    </div>
                                    <FormControl>
                                      <input
                                        type="checkbox"
                                        checked={field.value || false}
                                        onChange={field.onChange}
                                        className="rounded scale-125"
                                      />
                                    </FormControl>
                                  </div>
                                </FormItem>
                              )}
                            />

                            {/* Campos de configuración de mora */}
                            {form.watch('late_fee_enabled') && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {/* Tasa de mora */}
                                <FormField
                                  control={form.control}
                                  name="late_fee_rate"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel className="text-sm font-semibold">Tasa de Mora por Día (%)</FormLabel>
                                      <FormControl>
                                        <Input
                                          type="number"
                                          step="0.1"
                                          min="0"
                                          max="100"
                                          placeholder="2.0"
                                          {...field}
                                          value={field.value || ''}
                                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />

                                {/* Días de gracia */}
                                <FormField
                                  control={form.control}
                                  name="grace_period_days"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel className="text-sm font-semibold">Días de Gracia</FormLabel>
                                      <FormControl>
                                        <Input
                                          type="number"
                                          min="0"
                                          max="30"
                                          placeholder="0"
                                          {...field}
                                          value={field.value || ''}
                                          onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />

                                {/* Tipo de cálculo */}
                                <FormField
                                  control={form.control}
                                  name="late_fee_calculation_type"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel className="text-sm font-semibold">Tipo de Cálculo</FormLabel>
                                      <Select onValueChange={field.onChange} defaultValue={field.value || 'daily'}>
                                        <FormControl>
                                          <SelectTrigger>
                                            <SelectValue placeholder="Seleccionar tipo" />
                                          </SelectTrigger>
                                        </FormControl>
                                        <SelectContent>
                                          <SelectItem value="daily">Diario</SelectItem>
                                          <SelectItem value="monthly">Mensual</SelectItem>
                                          <SelectItem value="compound">Compuesto</SelectItem>
                                        </SelectContent>
                                      </Select>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />

                                {/* Mora máxima */}
                                <FormField
                                  control={form.control}
                                  name="max_late_fee"
                                  render={({ field }) => (
                                    <FormItem>
                                      <FormLabel className="text-sm font-semibold">Mora Máxima (0 = sin límite)</FormLabel>
                                      <FormControl>
                                        <Input
                                          type="number"
                                          min="0"
                                          placeholder="0"
                                          {...field}
                                          value={field.value || ''}
                                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                                        />
                                      </FormControl>
                                      <FormMessage />
                                    </FormItem>
                                  )}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
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
                    {loading ? 'Procesando...' : 'Guardar Cambios'}
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

                    {form.watch('update_type') === 'delete_loan' && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-4">
                        <div className="flex items-center gap-2 text-red-800">
                          <AlertCircle className="h-4 w-4" />
                          <div>
                            <span className="font-semibold">⚠️ ADVERTENCIA: Eliminación de Préstamo</span>
                            <p className="text-sm mt-1">
                              • El préstamo será marcado como eliminado<br/>
                              • Se puede recuperar durante 2 meses<br/>
                              • Después de 2 meses se eliminará permanentemente
                            </p>
                          </div>
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
                  <span className="font-semibold">{loan.next_payment_date}</span>
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
      </DialogContent>
    </Dialog>
  );
};