import React, { useState, useEffect } from 'react';
import { useForm, useWatch } from 'react-hook-form';
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
import { getLateFeeBreakdownFromInstallments } from '@/utils/installmentLateFeeCalculator';
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
  Trash2,
  PlusCircle,
  MinusCircle
} from 'lucide-react';
import { LateFeeInfo } from './LateFeeInfo';
import { PaymentForm } from './PaymentForm';
import { Handshake } from 'lucide-react';

const updateSchema = z.object({
  update_type: z.enum(['add_charge', 'term_extension', 'settle_loan', 'delete_loan', 'remove_late_fee', 'payment_agreement', 'edit_loan']),
  amount: z.number().min(0.01, 'El monto debe ser mayor a 0').optional(),
  late_fee_amount: z.number().min(0.01, 'El monto de mora debe ser mayor a 0').optional(),
  additional_months: z.number().min(0, 'Los meses adicionales deben ser mayor o igual a 0').optional(),
  adjustment_reason: z.string().min(1, 'Debe especificar la razón del ajuste'),
  payment_method: z.string().optional(),
  reference_number: z.string().optional(),
  notes: z.string().optional(),
  charge_date: z.string().optional(), // Fecha de creación del cargo
  settle_amount: z.number().min(0.01, 'El monto debe ser mayor a 0').optional(), // Monto para saldar préstamo (deprecated, usar campos separados)
  settle_capital: z.number().min(0, 'El capital no puede ser negativo').optional(), // Capital a pagar
  settle_interest: z.number().min(0, 'El interés no puede ser negativo').optional(), // Interés a pagar
  settle_late_fee: z.number().min(0, 'La mora no puede ser negativa').optional(), // Mora a pagar
  // Campos para editar préstamo
  edit_amount: z.number().min(0.01, 'El monto debe ser mayor a 0').optional(),
  edit_interest_rate: z.number().min(0, 'La tasa de interés debe ser mayor o igual a 0').optional(),
  edit_term_months: z.number().min(1, 'El plazo debe ser al menos 1 mes').optional(),
  edit_amortization_type: z.enum(['simple', 'french']).optional(),
  edit_payment_frequency: z.enum(['daily', 'weekly', 'biweekly', 'monthly']).optional(),
  edit_late_fee_enabled: z.boolean().optional(),
  edit_late_fee_rate: z.number().min(0).max(100).optional(),
  edit_grace_period_days: z.number().min(0).max(30).optional(),
}).refine((data) => {
  if (data.update_type === 'remove_late_fee') {
    return data.late_fee_amount !== undefined && data.late_fee_amount > 0;
  }
  return true;
}, {
  message: 'Debe especificar el monto de mora a eliminar',
  path: ['late_fee_amount'],
}).refine((data) => {
  if (data.update_type === 'add_charge') {
    return data.charge_date !== undefined && data.charge_date !== '';
  }
  return true;
}, {
  message: 'Debe especificar la fecha del cargo',
  path: ['charge_date'],
}).refine((data) => {
  if (data.update_type === 'edit_loan') {
    return data.edit_amount !== undefined && data.edit_interest_rate !== undefined && 
           data.edit_term_months !== undefined && data.edit_amortization_type !== undefined;
  }
  return true;
}, {
  message: 'Debe completar todos los campos requeridos para editar el préstamo',
  path: ['edit_amount'],
}).refine((data) => {
  if (data.update_type === 'settle_loan') {
    // Validar que al menos uno de los campos tenga un valor mayor a 0
    const hasCapital = data.settle_capital !== undefined && data.settle_capital > 0;
    const hasInterest = data.settle_interest !== undefined && data.settle_interest > 0;
    const hasLateFee = data.settle_late_fee !== undefined && data.settle_late_fee > 0;
    const hasOldAmount = data.settle_amount !== undefined && data.settle_amount > 0;
    
    return hasCapital || hasInterest || hasLateFee || hasOldAmount;
  }
  return true;
}, {
  message: 'Debe especificar al menos un monto para saldar el préstamo',
  path: ['settle_capital'],
}).refine((data) => {
  if (data.update_type === 'settle_loan') {
    // Validar que el capital no exceda el capital pendiente
    if (data.settle_capital !== undefined && data.settle_capital > 0) {
      // Esta validación se hará en el componente con el breakdown
      return true;
    }
    return true;
  }
  return true;
}, {
  message: 'El capital a pagar no puede exceder el capital pendiente',
  path: ['settle_capital'],
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
  end_date?: string;
  status: string;
  paid_installments?: number[];
  payment_frequency?: string;
  first_payment_date?: string;
  current_late_fee?: number;
  late_fee_enabled?: boolean;
  late_fee_rate?: number;
  grace_period_days?: number;
  max_late_fee?: number;
  late_fee_calculation_type?: 'daily' | 'monthly' | 'compound';
  amortization_type?: string;
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
  editOnly?: boolean; // Si es true, solo muestra la opción de editar préstamo
}

export const LoanUpdateForm: React.FC<LoanUpdateFormProps> = ({ 
  loan, 
  isOpen, 
  onClose, 
  onUpdate,
  editOnly = false
}) => {
  const [loading, setLoading] = useState(false);
  const [currentLateFee, setCurrentLateFee] = useState(loan.current_late_fee || 0);
  const [showAgreementsDialog, setShowAgreementsDialog] = useState(false);
  const [agreements, setAgreements] = useState<any[]>([]);
  const [selectedAgreement, setSelectedAgreement] = useState<any | null>(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [calculatedValues, setCalculatedValues] = useState({
    newBalance: loan.remaining_balance,
    newPayment: loan.monthly_payment,
    newEndDate: '',
    interestAmount: 0,
    principalAmount: 0
  });
  const [installments, setInstallments] = useState<any[]>([]);
  const [settleBreakdown, setSettleBreakdown] = useState({
    capitalPending: 0,
    interestPending: 0,
    lateFeePending: 0,
    totalToSettle: 0
  });
  const { user, companyId } = useAuth();

  const form = useForm<UpdateFormData>({
    resolver: zodResolver(updateSchema),
    defaultValues: {
      update_type: editOnly ? 'edit_loan' : 'add_charge',
      payment_method: 'cash',
    },
  });

  // Obtener cuotas del préstamo
  useEffect(() => {
    if (isOpen && loan.id) {
      const fetchInstallments = async () => {
        try {
          const { data, error } = await supabase
            .from('installments')
            .select('*')
            .eq('loan_id', loan.id)
            .order('installment_number', { ascending: true });

          if (error) throw error;
          setInstallments(data || []);
        } catch (error) {
          console.error('Error obteniendo cuotas:', error);
        }
      };
      fetchInstallments();
    }
  }, [isOpen, loan.id]);

  // Observar el tipo de actualización
  const updateType = useWatch({
    control: form.control,
    name: 'update_type'
  });

  // Calcular desglose para saldar préstamo
  useEffect(() => {
    if (isOpen && loan.id && updateType === 'settle_loan') {
      const calculateSettleBreakdown = async () => {
        try {
          console.log('🔍 Calculando desglose para saldar préstamo:', {
            loanId: loan.id,
            loanAmount: loan.amount,
            installmentsCount: installments.length,
            currentLateFee,
            remainingBalance: loan.remaining_balance
          });

          // Obtener todos los pagos para calcular el capital e interés pagados
          const { data: payments, error: paymentsError } = await supabase
            .from('payments')
            .select('principal_amount, interest_amount')
            .eq('loan_id', loan.id);

          if (paymentsError) {
            console.error('Error obteniendo pagos:', paymentsError);
            throw paymentsError;
          }

          // Calcular desde las cuotas primero (fuente de verdad)
          const unpaidInstallments = installments.filter(inst => !inst.is_paid);
          let capitalPending = 0;
          let interestPending = 0;
          
          // Sumar el capital e interés de todas las cuotas
          const totalCapitalFromInstallments = installments.reduce((sum, inst) => sum + (inst.principal_amount || 0), 0);
          const totalInterestFromInstallments = installments.reduce((sum, inst) => sum + (inst.interest_amount || 0), 0);
          
          // Calcular cuánto capital e interés se han pagado desde los pagos
          const totalPaidCapital = payments?.reduce((sum, payment) => sum + (payment.principal_amount || 0), 0) || 0;
          const totalPaidInterest = payments?.reduce((sum, payment) => sum + (payment.interest_amount || 0), 0) || 0;
          
          console.log('🔍 Capital total de cuotas:', totalCapitalFromInstallments);
          console.log('🔍 Interés total de cuotas:', totalInterestFromInstallments);
          console.log('🔍 Capital pagado:', totalPaidCapital);
          console.log('🔍 Interés pagado:', totalPaidInterest);
          console.log('🔍 Remaining balance:', loan.remaining_balance);
          
          if (unpaidInstallments.length > 0) {
            // Si hay cuotas no pagadas, calcular desde ellas directamente
            capitalPending = unpaidInstallments.reduce((sum, inst) => sum + (inst.principal_amount || 0), 0);
            interestPending = unpaidInstallments.reduce((sum, inst) => sum + (inst.interest_amount || 0), 0);
          } else {
            // Si todas las cuotas están marcadas como pagadas pero hay remaining_balance,
            // calcular desde el total de cuotas menos lo pagado
            capitalPending = Math.max(0, totalCapitalFromInstallments - totalPaidCapital);
            interestPending = Math.max(0, totalInterestFromInstallments - totalPaidInterest);
            
            // Si el remaining_balance no coincide con capital + interés pendientes,
            // usar el remaining_balance como fuente de verdad y distribuir proporcionalmente
            const calculatedTotal = capitalPending + interestPending;
            if (Math.abs(calculatedTotal - loan.remaining_balance) > 0.01 && calculatedTotal > 0) {
              // Ajustar proporcionalmente para que coincida con remaining_balance
              const ratio = loan.remaining_balance / calculatedTotal;
              capitalPending = Math.round(capitalPending * ratio * 100) / 100;
              interestPending = Math.round(interestPending * ratio * 100) / 100;
            } else if (calculatedTotal === 0 && loan.remaining_balance > 0) {
              // Si no hay cuotas o el cálculo da 0 pero hay remaining_balance,
              // asumir que todo el remaining_balance es interés (ya que el capital debería estar pagado)
              capitalPending = 0;
              interestPending = loan.remaining_balance;
            }
            
            // Asegurar que el capital pendiente no exceda el monto original
            if (capitalPending > loan.amount) {
              interestPending += (capitalPending - loan.amount);
              capitalPending = loan.amount;
            }
          }

          console.log('🔍 Interés pendiente:', interestPending, 'de', unpaidInstallments.length, 'cuotas no pagadas');
          console.log('🔍 Cuotas no pagadas:', unpaidInstallments.map(inst => ({
            num: inst.installment_number,
            principal: inst.principal_amount,
            interest: inst.interest_amount,
            isPaid: inst.is_paid
          })));
          console.log('🔍 Capital pendiente calculado:', capitalPending);
          console.log('🔍 Interés pendiente calculado:', interestPending);

          // Mora pendiente
          const lateFeePending = currentLateFee || 0;

          // Total a saldar
          const totalToSettle = capitalPending + interestPending + lateFeePending;

          const breakdown = {
            capitalPending: Math.round(capitalPending * 100) / 100,
            interestPending: Math.round(interestPending * 100) / 100,
            lateFeePending: Math.round(lateFeePending * 100) / 100,
            totalToSettle: Math.round(totalToSettle * 100) / 100
          };

          console.log('🔍 Desglose calculado:', breakdown);
          setSettleBreakdown(breakdown);
        } catch (error) {
          console.error('Error calculando desglose:', error);
          // Establecer valores por defecto en caso de error
          const fallbackBreakdown = {
            capitalPending: Math.round(loan.remaining_balance * 100) / 100,
            interestPending: 0,
            lateFeePending: Math.round((currentLateFee || 0) * 100) / 100,
            totalToSettle: Math.round((loan.remaining_balance + (currentLateFee || 0)) * 100) / 100
          };
          console.log('🔍 Usando desglose de respaldo:', fallbackBreakdown);
          setSettleBreakdown(fallbackBreakdown);
        }
      };
      
      // Ejecutar el cálculo
      calculateSettleBreakdown();
    } else {
      // Resetear el desglose cuando no es settle_loan
      setSettleBreakdown({
        capitalPending: 0,
        interestPending: 0,
        lateFeePending: 0,
        totalToSettle: 0
      });
    }
  }, [isOpen, loan.id, loan.amount, loan.remaining_balance, installments, currentLateFee, updateType]);

  // Obtener la mora actual del préstamo cuando se abre el formulario
  // Calcular la mora basándose en las cuotas reales, no solo leer de la BD
  useEffect(() => {
    if (isOpen && loan.id) {
      const fetchCurrentLateFee = async () => {
        try {
          // Primero intentar calcular la mora desde las cuotas reales
          const lateFeeEnabled = (loan as any).late_fee_enabled;
          const lateFeeRate = (loan as any).late_fee_rate;
          
          if (lateFeeEnabled && lateFeeRate) {
            const loanData = {
              id: loan.id,
              remaining_balance: loan.remaining_balance,
              next_payment_date: loan.next_payment_date,
              late_fee_rate: lateFeeRate || 0,
              grace_period_days: (loan as any).grace_period_days || 0,
              max_late_fee: (loan as any).max_late_fee || 0,
              late_fee_calculation_type: ((loan as any).late_fee_calculation_type || 'daily') as 'daily' | 'monthly' | 'compound',
              late_fee_enabled: lateFeeEnabled || false,
              amount: loan.amount,
              term: loan.term_months || 0,
              payment_frequency: loan.payment_frequency || 'monthly',
              interest_rate: loan.interest_rate,
              monthly_payment: loan.monthly_payment,
              start_date: loan.start_date,
              amortization_type: loan.amortization_type
            };
            
            console.log('🔍 LoanUpdateForm: Calculando mora con datos:', loanData);
            
            const breakdown = await getLateFeeBreakdownFromInstallments(loan.id, loanData);
            if (breakdown && breakdown.totalLateFee !== undefined) {
              const calculatedLateFee = Math.round(breakdown.totalLateFee * 100) / 100;
              setCurrentLateFee(calculatedLateFee);
              console.log('🔍 LoanUpdateForm: Mora calculada desde cuotas:', calculatedLateFee);
              return;
            }
          }
          
          // Si no se pudo calcular, leer de la base de datos como fallback
          const { data, error } = await supabase
            .from('loans')
            .select('current_late_fee, late_fee_enabled, late_fee_rate, grace_period_days, max_late_fee, late_fee_calculation_type')
            .eq('id', loan.id)
            .single();
          
          if (!error && data) {
            // Si la mora está habilitada pero el valor es 0, intentar calcular
            if (data.late_fee_enabled && data.late_fee_rate && (!data.current_late_fee || data.current_late_fee === 0)) {
              // Obtener datos completos del préstamo para calcular
              const { data: fullLoan, error: fullLoanError } = await supabase
                .from('loans')
                .select('*')
                .eq('id', loan.id)
                .single();
              
              if (!fullLoanError && fullLoan) {
                const loanDataForCalc = {
                  id: fullLoan.id,
                  remaining_balance: fullLoan.remaining_balance,
                  next_payment_date: fullLoan.next_payment_date,
                  late_fee_rate: fullLoan.late_fee_rate || 0,
                  grace_period_days: fullLoan.grace_period_days || 0,
                  max_late_fee: fullLoan.max_late_fee || 0,
                  late_fee_calculation_type: (fullLoan.late_fee_calculation_type || 'daily') as 'daily' | 'monthly' | 'compound',
                  late_fee_enabled: fullLoan.late_fee_enabled || false,
                  amount: fullLoan.amount,
                  term: fullLoan.term_months || 0,
                  payment_frequency: fullLoan.payment_frequency || 'monthly',
                  interest_rate: fullLoan.interest_rate,
                  monthly_payment: fullLoan.monthly_payment,
                  start_date: fullLoan.start_date,
                  amortization_type: fullLoan.amortization_type
                };
                
                const breakdown = await getLateFeeBreakdownFromInstallments(fullLoan.id, loanDataForCalc);
                if (breakdown && breakdown.totalLateFee !== undefined) {
                  const calculatedLateFee = Math.round(breakdown.totalLateFee * 100) / 100;
                  setCurrentLateFee(calculatedLateFee);
                  console.log('🔍 LoanUpdateForm: Mora calculada desde BD completa:', calculatedLateFee);
                  return;
                }
              }
            }
            
            setCurrentLateFee(data.current_late_fee || 0);
            console.log('🔍 LoanUpdateForm: Mora leída de BD:', data.current_late_fee);
          } else {
            // Fallback al valor del préstamo
            setCurrentLateFee(loan.current_late_fee || 0);
            console.log('🔍 LoanUpdateForm: Usando mora del objeto loan:', loan.current_late_fee);
          }
        } catch (error) {
          console.error('Error obteniendo mora actual:', error);
          // Fallback al valor del préstamo
          setCurrentLateFee(loan.current_late_fee || 0);
        }
      };
      
      fetchCurrentLateFee();
    }
  }, [isOpen, loan.id]);

  // Establecer el tipo de actualización cuando editOnly cambia
  useEffect(() => {
    if (isOpen && editOnly) {
      form.setValue('update_type', 'edit_loan');
    }
  }, [isOpen, editOnly, form]);

  const watchedValues = form.watch(['update_type', 'amount', 'additional_months', 'late_fee_amount', 'edit_amount', 'edit_interest_rate', 'edit_term_months', 'edit_amortization_type', 'settle_capital', 'settle_interest', 'settle_late_fee']);

  useEffect(() => {
    const updateType = form.watch('update_type');
    if (updateType !== 'payment_agreement') {
      calculateUpdatedValues();
    }
  }, [watchedValues]);

  // Resetear el campo de razón cuando cambia el tipo de actualización
  useEffect(() => {
    const updateType = form.watch('update_type');
    form.setValue('adjustment_reason', '');
    form.setValue('late_fee_amount', undefined);
    form.setValue('amount', undefined);
    
    // Si es "add_charge", establecer fecha por defecto (hoy)
    if (updateType === 'add_charge') {
      const defaultDate = new Date();
      form.setValue('charge_date', defaultDate.toISOString().split('T')[0]);
    } else {
      form.setValue('charge_date', undefined);
    }
    
    // Recalcular la mora cuando cambia el tipo de actualización
    // Esto asegura que siempre se muestre el valor correcto
    if (isOpen && loan.id) {
      const recalculateLateFee = async () => {
        try {
          const lateFeeEnabled = (loan as any).late_fee_enabled;
          const lateFeeRate = (loan as any).late_fee_rate;
          
          if (lateFeeEnabled && lateFeeRate) {
            const loanData = {
              id: loan.id,
              remaining_balance: loan.remaining_balance,
              next_payment_date: loan.next_payment_date,
              late_fee_rate: lateFeeRate || 0,
              grace_period_days: (loan as any).grace_period_days || 0,
              max_late_fee: (loan as any).max_late_fee || 0,
              late_fee_calculation_type: ((loan as any).late_fee_calculation_type || 'daily') as 'daily' | 'monthly' | 'compound',
              late_fee_enabled: lateFeeEnabled || false,
              amount: loan.amount,
              term: loan.term_months || 0,
              payment_frequency: loan.payment_frequency || 'monthly',
              interest_rate: loan.interest_rate,
              monthly_payment: loan.monthly_payment,
              start_date: loan.start_date,
              amortization_type: loan.amortization_type
            };
            
            const breakdown = await getLateFeeBreakdownFromInstallments(loan.id, loanData);
            if (breakdown && breakdown.totalLateFee !== undefined) {
              const calculatedLateFee = Math.round(breakdown.totalLateFee * 100) / 100;
              setCurrentLateFee(calculatedLateFee);
            }
          }
        } catch (error) {
          console.error('Error recalculando mora:', error);
        }
      };
      
      recalculateLateFee();
    }
  }, [form.watch('update_type'), isOpen, loan.id]);

  // Cargar acuerdos de pago
  const fetchAgreements = async () => {
    try {
      const { data, error } = await supabase
        .from('payment_agreements')
        .select('*')
        .eq('loan_id', loan.id)
        .in('status', ['approved', 'active'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAgreements(data || []);
      console.log('Acuerdos encontrados:', data);
    } catch (error) {
      console.error('Error fetching agreements:', error);
      toast.error('Error al cargar acuerdos de pago');
    }
  };

  useEffect(() => {
    if (isOpen && loan) {
      fetchAgreements();
    }
  }, [isOpen, loan.id]);


  const calculateUpdatedValues = () => {
    const [updateType, amount, additionalMonths, , editAmount, editInterestRate, editTermMonths, editAmortizationType, settleCapital, settleInterest, settleLateFee] = watchedValues;
    
    let newBalance = loan.remaining_balance;
    let newPayment = loan.monthly_payment;
    let newEndDate = '';
    let interestAmount = 0;
    let principalAmount = 0;

    switch (updateType) {
      case 'add_charge':
        if (amount) {
          // Agregar el monto del cargo al balance
          newBalance = loan.remaining_balance + amount;
          principalAmount = amount;
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
        
      case 'settle_loan':
        // Calcular nuevo balance restando los montos pagados
        const capitalPaid = settleCapital || 0;
        const interestPaid = settleInterest || 0;
        newBalance = Math.max(0, loan.remaining_balance - capitalPaid - interestPaid);
        principalAmount = capitalPaid;
        interestAmount = interestPaid;
        break;
        
      case 'edit_loan':
        if (editAmount && editInterestRate !== undefined && editTermMonths && editAmortizationType) {
          // Calcular nueva cuota mensual según el tipo de amortización
          let monthlyInterest = 0;
          let monthlyPrincipal = 0;
          
          if (editAmortizationType === 'french') {
            // Amortización francesa - cuota fija
            const periodRate = editInterestRate / 100;
            if (periodRate > 0) {
              newPayment = (editAmount * periodRate * Math.pow(1 + periodRate, editTermMonths)) / 
                          (Math.pow(1 + periodRate, editTermMonths) - 1);
              monthlyInterest = editAmount * periodRate;
              monthlyPrincipal = newPayment - monthlyInterest;
            } else {
              newPayment = editAmount / editTermMonths;
              monthlyPrincipal = newPayment;
              monthlyInterest = 0;
            }
          } else {
            // Amortización simple (por defecto)
            monthlyInterest = Math.round((editAmount * editInterestRate / 100) * 100) / 100;
            monthlyPrincipal = Math.round((editAmount / editTermMonths) * 100) / 100;
            newPayment = Math.round((monthlyInterest + monthlyPrincipal) * 100) / 100;
          }
          
          newBalance = editAmount; // El balance restante es el nuevo monto
          
          // Calcular nueva fecha de fin
          const startDate = new Date(loan.start_date);
          const newEndDateObj = new Date(startDate);
          newEndDateObj.setMonth(newEndDateObj.getMonth() + editTermMonths);
          newEndDate = newEndDateObj.toISOString().split('T')[0];
          
          interestAmount = monthlyInterest;
          principalAmount = monthlyPrincipal;
        }
        break;
        
      case 'delete_loan':
        // Para eliminar préstamos, no necesitamos calcular nuevos valores
        // Solo marcamos como eliminado
        break;
        
      case 'remove_late_fee':
        // No afecta el balance, solo la mora
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
      
      // Actualizar el préstamo según el tipo de actualización
      let loanUpdates: any = {};

      switch (updateType) {
        case 'add_charge':
          if (!data.amount || data.amount <= 0) {
            toast.error('El monto del cargo debe ser mayor a 0');
            setLoading(false);
            return;
          }

          // Obtener todas las cuotas existentes para determinar el siguiente número
          const { data: existingInstallments, error: installmentsError } = await supabase
            .from('installments')
            .select('installment_number')
            .eq('loan_id', loan.id)
            .order('installment_number', { ascending: false })
            .limit(1);

          if (installmentsError) {
            console.error('Error obteniendo cuotas:', installmentsError);
            toast.error('Error al obtener información de cuotas');
            setLoading(false);
            return;
          }

          // Calcular el número de la siguiente cuota
          // Si no hay cuotas, usar el término original + 1
          // Si hay cuotas, usar el máximo número de cuota + 1
          const nextInstallmentNumber = existingInstallments && existingInstallments.length > 0
            ? existingInstallments[0].installment_number + 1
            : (loan.term_months || 0) + 1;

          // Usar la fecha del cargo proporcionada por el usuario
          if (!data.charge_date) {
            toast.error('Debe especificar la fecha del cargo');
            setLoading(false);
            return;
          }

          const chargeDate = new Date(data.charge_date);
          if (isNaN(chargeDate.getTime())) {
            toast.error('La fecha del cargo no es válida');
            setLoading(false);
            return;
          }

          // Calcular la fecha de vencimiento como un día después de la fecha del cargo
          const newDueDate = new Date(chargeDate);
          newDueDate.setDate(newDueDate.getDate() + 1);

          // Crear la nueva cuota con el cargo
          const newChargeInstallment = {
            loan_id: loan.id,
            installment_number: nextInstallmentNumber,
            due_date: newDueDate.toISOString().split('T')[0],
            total_amount: data.amount,
            principal_amount: data.amount,
            interest_amount: 0,
            is_paid: false,
            late_fee_paid: 0
          };

          const { error: insertError } = await supabase
            .from('installments')
            .insert([newChargeInstallment]);

          if (insertError) {
            console.error('Error creando nueva cuota de cargo:', insertError);
            toast.error('Error al crear la nueva cuota');
            setLoading(false);
            return;
          }

          // Actualizar el balance del préstamo
          loanUpdates = {
            remaining_balance: calculatedValues.newBalance,
            term_months: nextInstallmentNumber, // Actualizar el número total de cuotas
          };

          console.log(`✅ Nueva cuota ${nextInstallmentNumber} creada con cargo de RD$${data.amount.toLocaleString()}`);
          break;
          

          
        case 'term_extension':
          {
            const additionalMonths = data.additional_months || 0;
            const newTermMonths = loan.term_months + additionalMonths;

            console.log('🔍 LoanUpdateForm: Iniciando extensión de plazo:', {
              additionalMonths,
              currentTermMonths: loan.term_months,
              newTermMonths,
              newPayment: calculatedValues.newPayment
            });

            loanUpdates = {
              term_months: newTermMonths,
              monthly_payment: calculatedValues.newPayment,
              end_date: calculatedValues.newEndDate,
            };

            // Crear las nuevas cuotas en la tabla installments
            try {
              const newInstallments = [];
              const startDate = new Date(loan.first_payment_date || loan.start_date || loan.next_payment_date);
              const frequency = loan.payment_frequency || 'monthly';

              console.log('🔍 LoanUpdateForm: Fecha base para cuotas:', {
                first_payment_date: loan.first_payment_date,
                start_date: loan.start_date,
                next_payment_date: loan.next_payment_date,
                startDate: startDate.toISOString()
              });

              // Calcular el monto de capital e interés para cada cuota nueva
              const fixedInterestPerPayment = (loan.amount * loan.interest_rate) / 100;
              const principalPerPayment = calculatedValues.newPayment - fixedInterestPerPayment;

              console.log('🔍 LoanUpdateForm: Distribución por cuota:', {
                totalPayment: calculatedValues.newPayment,
                interest: fixedInterestPerPayment,
                principal: principalPerPayment
              });

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

                const installmentData = {
                  loan_id: loan.id,
                  installment_number: i,
                  due_date: dueDate.toISOString().split('T')[0],
                  total_amount: calculatedValues.newPayment,
                  principal_amount: principalPerPayment,
                  interest_amount: fixedInterestPerPayment,
                  is_paid: false,
                  late_fee_paid: 0
                };

                newInstallments.push(installmentData);
                
                console.log(`🔍 LoanUpdateForm: Cuota ${i} programada:`, installmentData);
              }

              if (newInstallments.length > 0) {
                console.log(`🔍 LoanUpdateForm: Insertando ${newInstallments.length} cuotas nuevas...`);
                
                const { data: insertedData, error: installmentsError } = await supabase
                  .from('installments')
                  .insert(newInstallments)
                  .select();

                if (installmentsError) {
                  console.error('❌ Error creando nuevas cuotas:', installmentsError);
                  toast.error('Error creando nuevas cuotas');
                } else {
                  console.log(`✅ ${newInstallments.length} nuevas cuotas creadas exitosamente:`, insertedData);
                  toast.success(`${newInstallments.length} cuotas adicionales agregadas al préstamo`);
                }
              }
            } catch (error) {
              console.error('❌ Error en extensión de plazo:', error);
              toast.error('Error procesando extensión de plazo');
            }
          }
          break;
          
        case 'settle_loan':
          {
            // Obtener valores de los 3 campos separados
            const capitalPayment = data.settle_capital || 0;
            const interestPayment = data.settle_interest || 0;
            const lateFeePayment = data.settle_late_fee || 0;
            
            // Validar que al menos uno tenga un valor mayor a 0
            if (capitalPayment <= 0 && interestPayment <= 0 && lateFeePayment <= 0) {
              toast.error('Debe especificar al menos un monto para saldar el préstamo');
              setLoading(false);
              return;
            }

            // Validar que los montos no excedan los pendientes
            if (capitalPayment > settleBreakdown.capitalPending) {
              toast.error(`El capital a pagar no puede exceder RD$${settleBreakdown.capitalPending.toLocaleString()}`);
              setLoading(false);
              return;
            }

            if (interestPayment > settleBreakdown.interestPending) {
              toast.error(`El interés a pagar no puede exceder RD$${settleBreakdown.interestPending.toLocaleString()}`);
              setLoading(false);
              return;
            }

            if (lateFeePayment > settleBreakdown.lateFeePending) {
              toast.error(`La mora a pagar no puede exceder RD$${settleBreakdown.lateFeePending.toLocaleString()}`);
              setLoading(false);
              return;
            }

            // Permitir pagos parciales negociados - no validar que el capital deba ser completo

            try {
              // Usar los valores directamente de los campos
              const principalPayment = capitalPayment;
              const actualInterestPayment = interestPayment;
              const actualLateFeePayment = lateFeePayment;

              // Crear fecha de pago en zona horaria de Santo Domingo
              const now = new Date();
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
              const paymentDate = `${year}-${month}-${day}`;

              // Registrar el pago en la tabla payments
              // Usar user?.id del usuario actual, o loan_officer_id del préstamo, o companyId como último recurso
              const createdBy = user?.id || (loan as any).loan_officer_id || companyId;
              const paymentData = {
                loan_id: loan.id,
                amount: Math.round(principalPayment + actualInterestPayment),
                principal_amount: Math.round(principalPayment),
                interest_amount: Math.round(actualInterestPayment),
                late_fee: Math.round(actualLateFeePayment * 100) / 100,
                due_date: loan.next_payment_date || (loan as any).end_date || paymentDate,
                payment_date: paymentDate,
                payment_method: data.payment_method || 'cash',
                reference_number: data.reference_number,
                notes: data.notes || `Saldado - Capital: RD$${principalPayment.toLocaleString()}, Interés: RD$${actualInterestPayment.toLocaleString()}, Mora: RD$${actualLateFeePayment.toLocaleString()} - ${getAdjustmentReasonLabel(data.adjustment_reason)}`,
                status: 'completed',
                created_by: createdBy,
              };

              const { data: insertedPayment, error: paymentError } = await supabase
                .from('payments')
                .insert([paymentData])
                .select();

              if (paymentError) {
                console.error('Error insertando pago:', paymentError);
                throw paymentError;
              }

              // En "Saldar Préstamo", NO marcar todas las cuotas como pagadas
              // Solo marcar como pagadas las cuotas que realmente se pagaron antes del saldo
              // Las cuotas restantes se marcan como "saldadas" (is_settled: true) pero NO como pagadas
              
              // Obtener todas las cuotas
              const { data: allInstallments, error: allInstallmentsError } = await supabase
                .from('installments')
                .select('installment_number, is_paid')
                .eq('loan_id', loan.id);

              if (allInstallmentsError) {
                console.error('Error obteniendo todas las cuotas:', allInstallmentsError);
                throw allInstallmentsError;
              }

              // Identificar cuotas realmente pagadas (is_paid: true)
              const paidInstallments = allInstallments?.filter(inst => inst.is_paid) || [];
              const unpaidInstallments = allInstallments?.filter(inst => !inst.is_paid) || [];

              // Marcar las cuotas no pagadas como "saldadas" (pero NO como pagadas)
              if (unpaidInstallments.length > 0) {
                const unpaidInstallmentNumbers = unpaidInstallments.map(inst => inst.installment_number);
                const { error: updateSettledError } = await supabase
                  .from('installments')
                  .update({
                    is_settled: true,
                    late_fee_paid: 0 // Resetear mora pagada
                  })
                  .eq('loan_id', loan.id)
                  .in('installment_number', unpaidInstallmentNumbers);

                if (updateSettledError) {
                  console.error('Error marcando cuotas como saldadas:', updateSettledError);
                  throw updateSettledError;
                }
              }

              // Solo usar las cuotas que realmente están pagadas para paid_installments
              const allPaidInstallments = paidInstallments.map(inst => inst.installment_number).sort((a, b) => a - b);

              // En "Saldar Préstamo", siempre se marca como completado y todo queda en 0
              // Esto es una negociación, así que el préstamo queda saldado sin importar el monto
              loanUpdates = {
                remaining_balance: 0, // Siempre en 0
                status: 'paid', // Siempre marcado como pagado
                paid_installments: allPaidInstallments, // Todas las cuotas
                current_late_fee: 0, // Siempre en 0
                next_payment_date: (loan as any).end_date || null, // Usar end_date o null
              };

              // Si se pagó mora, actualizar total_late_fee_paid
              if (actualLateFeePayment > 0) {
                const { data: currentLoan, error: loanError } = await supabase
                  .from('loans')
                  .select('total_late_fee_paid')
                  .eq('id', loan.id)
                  .single();

                if (!loanError && currentLoan) {
                  const currentTotalPaid = currentLoan.total_late_fee_paid || 0;
                  loanUpdates.total_late_fee_paid = currentTotalPaid + actualLateFeePayment;
                }
              }

              console.log('✅ Préstamo saldado exitosamente (negociación):', {
                capitalPayment: principalPayment,
                interestPayment: actualInterestPayment,
                lateFeePayment: actualLateFeePayment,
                status: 'paid',
                remaining_balance: 0
              });
            } catch (error) {
              console.error('Error saldando préstamo:', error);
              toast.error('Error al saldar el préstamo');
              setLoading(false);
              return;
            }
          }
          break;
          
        case 'edit_loan':
          // Solo permitir editar préstamos pendientes
          if (loan.status !== 'pending') {
            toast.error('Solo se pueden editar préstamos pendientes');
            setLoading(false);
            return;
          }
          
          // Si el préstamo es pendiente, no validar edit_amount (no se puede modificar)
          if (loan.status === 'pending') {
            if (!data.edit_interest_rate || !data.edit_term_months || !data.edit_amortization_type) {
              toast.error('Debe completar todos los campos requeridos');
              setLoading(false);
              return;
            }
          } else {
            if (!data.edit_amount || !data.edit_interest_rate || !data.edit_term_months || !data.edit_amortization_type) {
              toast.error('Debe completar todos los campos requeridos');
              setLoading(false);
              return;
            }
          }
          
          // Calcular nuevas fechas
          const startDate = new Date(loan.start_date);
          const newEndDate = new Date(startDate);
          newEndDate.setMonth(newEndDate.getMonth() + data.edit_term_months);
          const nextPaymentDate = new Date(startDate);
          nextPaymentDate.setMonth(nextPaymentDate.getMonth() + 1);
          const firstPaymentDate = new Date(nextPaymentDate);
          
          // Calcular total_amount
          // Si el préstamo es pendiente, no modificar el monto (es un financiamiento de factura)
          const finalAmount = loan.status === 'pending' ? loan.amount : data.edit_amount;
          const totalInterest = (finalAmount * data.edit_interest_rate * data.edit_term_months) / 100;
          const totalAmount = finalAmount + totalInterest;
          
          loanUpdates = {
            amount: finalAmount, // Usar el monto original si es pendiente
            interest_rate: data.edit_interest_rate,
            term_months: data.edit_term_months,
            monthly_payment: calculatedValues.newPayment,
            total_amount: totalAmount,
            remaining_balance: finalAmount,
            end_date: newEndDate.toISOString().split('T')[0],
            next_payment_date: nextPaymentDate.toISOString().split('T')[0],
            first_payment_date: firstPaymentDate.toISOString().split('T')[0],
            amortization_type: data.edit_amortization_type,
            payment_frequency: data.edit_payment_frequency || loan.payment_frequency || 'monthly',
            late_fee_enabled: data.edit_late_fee_enabled !== undefined ? data.edit_late_fee_enabled : (loan.late_fee_enabled || false),
            late_fee_rate: data.edit_late_fee_enabled && data.edit_late_fee_rate !== undefined ? data.edit_late_fee_rate : (loan.late_fee_rate || null),
            grace_period_days: data.edit_late_fee_enabled && data.edit_grace_period_days !== undefined ? data.edit_grace_period_days : (loan.grace_period_days || null),
          };
          
          // Eliminar todas las cuotas existentes y crear nuevas
          const { error: deleteInstallmentsError } = await supabase
            .from('installments')
            .delete()
            .eq('loan_id', loan.id);
          
          if (deleteInstallmentsError) {
            console.error('Error eliminando cuotas antiguas:', deleteInstallmentsError);
            toast.error('Error al eliminar cuotas antiguas');
            setLoading(false);
            return;
          }
          
          // Crear nuevas cuotas
          const newInstallments = [];
          const monthlyInterest = calculatedValues.interestAmount;
          const monthlyPrincipal = calculatedValues.principalAmount;
          const paymentFrequency = data.edit_payment_frequency || loan.payment_frequency || 'monthly';
          
          for (let i = 1; i <= data.edit_term_months; i++) {
            const dueDate = new Date(firstPaymentDate);
            let periodsToAdd = i - 1;
            
            switch (paymentFrequency) {
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
              default:
                dueDate.setMonth(dueDate.getMonth() + periodsToAdd);
            }
            
            newInstallments.push({
              loan_id: loan.id,
              installment_number: i,
              due_date: dueDate.toISOString().split('T')[0],
              total_amount: calculatedValues.newPayment,
              principal_amount: monthlyPrincipal,
              interest_amount: monthlyInterest,
              is_paid: false,
              late_fee_paid: 0
            });
          }
          
          const { error: insertInstallmentsError } = await supabase
            .from('installments')
            .insert(newInstallments);
          
          if (insertInstallmentsError) {
            console.error('Error creando nuevas cuotas:', insertInstallmentsError);
            toast.error('Error al crear nuevas cuotas');
            setLoading(false);
            return;
          }
          
          break;
          
        case 'delete_loan':
          loanUpdates = {
            status: 'deleted',
            deleted_at: new Date().toISOString(),
            deleted_reason: data.adjustment_reason,
          };
          break;
          
        case 'remove_late_fee':
          {
            const lateFeeToRemove = data.late_fee_amount || 0;
            const currentLateFeeValue = currentLateFee || 0;
            
            if (lateFeeToRemove <= 0) {
              toast.error('El monto de mora a eliminar debe ser mayor a 0');
              setLoading(false);
              return;
            }
            
            if (lateFeeToRemove > currentLateFeeValue) {
              toast.error(`No se puede eliminar más mora de la disponible. Mora actual: RD$${currentLateFeeValue.toLocaleString()}`);
              setLoading(false);
              return;
            }
            
            // Obtener las cuotas pendientes para distribuir la mora eliminada
            const { data: installments, error: installmentsError } = await supabase
              .from('installments')
              .select('*')
              .eq('loan_id', loan.id)
              .eq('is_paid', false)
              .order('installment_number', { ascending: true });
            
            if (installmentsError) {
              console.error('Error obteniendo cuotas:', installmentsError);
              toast.error('Error al obtener información de cuotas');
              setLoading(false);
              return;
            }
            
            if (!installments || installments.length === 0) {
              // Si no hay cuotas pendientes, solo actualizar el campo
              const newLateFee = Math.max(0, currentLateFeeValue - lateFeeToRemove);
              loanUpdates = {
                current_late_fee: newLateFee,
              };
              console.log(`✅ Eliminando mora: ${lateFeeToRemove} de ${currentLateFeeValue}, nueva mora: ${newLateFee}`);
            } else {
              // Calcular la mora total de todas las cuotas pendientes para distribuir proporcionalmente
              const currentDate = new Date();
              let totalCalculatedLateFee = 0;
              const installmentLateFees: Array<{ id: string; lateFee: number }> = [];
              
              installments.forEach((installment: any) => {
                const dueDate = new Date(installment.due_date);
                const daysOverdue = Math.max(0, Math.floor((currentDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
                
                if (daysOverdue > 0) {
                  const gracePeriod = (loan as any).grace_period_days || 0;
                  const effectiveDaysOverdue = Math.max(0, daysOverdue - gracePeriod);
                  
                  if (effectiveDaysOverdue > 0) {
                    const principalPerPayment = installment.principal_amount;
                    const lateFeeRate = (loan as any).late_fee_rate || 2;
                    
                    let lateFee = 0;
                    switch ((loan as any).late_fee_calculation_type) {
                      case 'daily':
                        lateFee = (principalPerPayment * lateFeeRate / 100) * effectiveDaysOverdue;
                        break;
                      case 'monthly':
                        const monthsOverdue = Math.ceil(effectiveDaysOverdue / 30);
                        lateFee = (principalPerPayment * lateFeeRate / 100) * monthsOverdue;
                        break;
                      case 'compound':
                        lateFee = principalPerPayment * (Math.pow(1 + lateFeeRate / 100, effectiveDaysOverdue) - 1);
                        break;
                      default:
                        lateFee = (principalPerPayment * lateFeeRate / 100) * effectiveDaysOverdue;
                    }
                    
                    if ((loan as any).max_late_fee && (loan as any).max_late_fee > 0) {
                      lateFee = Math.min(lateFee, (loan as any).max_late_fee);
                    }
                    
                    const remainingLateFee = Math.max(0, lateFee - (installment.late_fee_paid || 0));
                    totalCalculatedLateFee += remainingLateFee;
                    
                    installmentLateFees.push({
                      id: installment.id,
                      lateFee: remainingLateFee
                    });
                  }
                }
              });
              
              // Distribuir proporcionalmente la mora eliminada entre las cuotas
              if (totalCalculatedLateFee > 0) {
                for (const installmentFee of installmentLateFees) {
                  const proportion = installmentFee.lateFee / totalCalculatedLateFee;
                  const lateFeeToRemoveFromThisInstallment = lateFeeToRemove * proportion;
                  
                  // Actualizar late_fee_paid en esta cuota
                  const currentLateFeePaid = installments.find((i: any) => i.id === installmentFee.id)?.late_fee_paid || 0;
                  const newLateFeePaid = currentLateFeePaid + lateFeeToRemoveFromThisInstallment;
                  
                  await supabase
                    .from('installments')
                    .update({ late_fee_paid: Math.round(newLateFeePaid * 100) / 100 })
                    .eq('id', installmentFee.id);
                  
                  console.log(`✅ Cuota ${installments.find((i: any) => i.id === installmentFee.id)?.installment_number}: eliminando ${lateFeeToRemoveFromThisInstallment.toFixed(2)} de mora`);
                }
              }
              
              // Actualizar el campo current_late_fee en el préstamo
              const newLateFee = Math.max(0, currentLateFeeValue - lateFeeToRemove);
              loanUpdates = {
                current_late_fee: newLateFee,
              };
              
              console.log(`✅ Eliminando mora: ${lateFeeToRemove} de ${currentLateFeeValue}, nueva mora: ${newLateFee}`);
            }
          }
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
        const historyData: any = {
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
          created_by: companyId,
        };
        
        if (updateType === 'remove_late_fee') {
          historyData.old_values.current_late_fee = currentLateFee;
          historyData.new_values.current_late_fee = (currentLateFee || 0) - (data.late_fee_amount || 0);
          historyData.amount = data.late_fee_amount;
        } else if (updateType === 'add_charge') {
          // Para agregar cargo, incluir información adicional
          historyData.amount = data.amount;
          historyData.old_values.balance = loan.remaining_balance;
          historyData.new_values.balance = calculatedValues.newBalance;
          // Agregar información adicional en notes si está disponible
          if (data.notes) {
            historyData.notes = data.notes;
          }
          if (data.reference_number) {
            historyData.reference_number = data.reference_number;
          }
          if (data.charge_date) {
            historyData.charge_date = data.charge_date;
          }
        } else if (updateType === 'edit_loan') {
          historyData.old_values = {
            amount: loan.amount,
            balance: loan.remaining_balance,
            payment: loan.monthly_payment,
            rate: loan.interest_rate,
            term_months: loan.term_months,
            amortization_type: loan.amortization_type || 'simple'
          };
          // Si el préstamo es pendiente, no modificar el monto en el historial
          const finalAmountForHistory = loan.status === 'pending' ? loan.amount : (data.edit_amount || loan.amount);
          historyData.new_values = {
            amount: finalAmountForHistory,
            balance: calculatedValues.newBalance,
            payment: calculatedValues.newPayment,
            rate: data.edit_interest_rate || loan.interest_rate,
            term_months: data.edit_term_months || loan.term_months,
            amortization_type: data.edit_amortization_type || loan.amortization_type || 'simple'
          };
          historyData.amount = finalAmountForHistory;
        } else {
          historyData.amount = data.amount;
        }
        
        const { data: insertedHistory, error: historyInsertError } = await supabase
          .from('loan_history')
          .insert([historyData])
          .select();
        
        if (historyInsertError) {
          console.error('❌ Error insertando en historial:', historyInsertError);
          console.error('📋 Datos que se intentaron insertar:', historyData);
          // Mostrar error al usuario para que sepa que no se guardó
          toast.error(`Error al guardar en historial: ${historyInsertError.message}`);
        } else {
          console.log('✅ Historial guardado exitosamente:', insertedHistory);
          // Disparar evento inmediatamente después de guardar exitosamente
          if (updateType === 'add_charge' || updateType === 'remove_late_fee') {
            window.dispatchEvent(new CustomEvent('loanHistoryRefresh', { 
              detail: { loanId: loan.id } 
            }));
          }
        }
      } catch (historyError) {
        // Si la tabla no existe, continuar sin error
        console.error('Error al guardar historial:', historyError);
      }

      const actionMessages = {
        add_charge: 'Cargo agregado exitosamente como nueva cuota',
        term_extension: 'Plazo extendido exitosamente',
        settle_loan: 'Préstamo saldado exitosamente',
        delete_loan: 'Préstamo eliminado exitosamente (recuperable por 2 meses)',
        remove_late_fee: `Mora eliminada exitosamente`,
        edit_loan: 'Préstamo editado exitosamente. Las cuotas han sido recalculadas.'
      };

      const message = updateType === 'remove_late_fee' 
        ? `Mora eliminada exitosamente. Nueva mora: RD$${((currentLateFee || 0) - (data.late_fee_amount || 0)).toLocaleString()}`
        : actionMessages[updateType] || 'Préstamo actualizado exitosamente';
      
      toast.success(message);
      
      // Si se eliminó mora, esperar un momento para que se actualicen las cuotas antes de cerrar
      if (updateType === 'remove_late_fee') {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // onUpdate() ya recarga los préstamos, pero también necesitamos recargar el historial
      // El evento ya se disparó arriba si se guardó exitosamente
      onUpdate();
      
      // Esperar un momento antes de cerrar para que el historial se recargue
      if (updateType === 'add_charge' || updateType === 'remove_late_fee') {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
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
      case 'add_charge': return <PlusCircle className="h-4 w-4" />;
      case 'term_extension': return <Calendar className="h-4 w-4" />;
      case 'settle_loan': return <DollarSign className="h-4 w-4" />;
      case 'delete_loan': return <Trash2 className="h-4 w-4" />;
      case 'remove_late_fee': return <MinusCircle className="h-4 w-4" />;
      case 'payment_agreement': return <Handshake className="h-4 w-4" />;
      case 'edit_loan': return <Edit className="h-4 w-4" />;
      default: return <Edit className="h-4 w-4" />;
    }
  };

  const getUpdateTypeLabel = (type: string) => {
    const labels = {
      add_charge: 'Agregar Cargo',
      term_extension: 'Extensión de Plazo',
      settle_loan: 'Saldar Préstamo',
      delete_loan: 'Eliminar Préstamo',
      remove_late_fee: 'Eliminar Mora',
      payment_agreement: 'Acuerdos de Pago',
      edit_loan: 'Editar Préstamo'
    };
    return labels[type as keyof typeof labels] || type;
  };

  // Función auxiliar para obtener la etiqueta en español de un adjustment_reason
  const getAdjustmentReasonLabel = (reason: string): string => {
    // Buscar en todas las categorías
    const allReasons = [
      // add_charge
      { value: 'late_payment_fee', label: 'Multa por Pago Tardío' },
      { value: 'administrative_fee', label: 'Tarifa Administrativa' },
      { value: 'penalty_fee', label: 'Cargo por Penalización' },
      { value: 'insurance_fee', label: 'Seguro del Préstamo' },
      { value: 'processing_fee', label: 'Tarifa de Procesamiento' },
      { value: 'legal_fee', label: 'Gastos Legales' },
      { value: 'collection_fee', label: 'Gastos de Cobranza' },
      { value: 'other_charge', label: 'Otro Cargo' },
      // term_extension
      { value: 'financial_difficulty', label: 'Dificultades Financieras' },
      { value: 'job_loss', label: 'Pérdida de Empleo' },
      { value: 'medical_emergency', label: 'Emergencia Médica' },
      { value: 'family_emergency', label: 'Emergencia Familiar' },
      { value: 'income_reduction', label: 'Reducción de Ingresos' },
      { value: 'payment_plan', label: 'Plan de Pagos Especial' },
      { value: 'rate_negotiation', label: 'Renegociación de Condiciones' },
      { value: 'goodwill_extension', label: 'Extensión de Buena Voluntad' },
      // settle_loan
      { value: 'full_payment', label: 'Pago Completo del Préstamo' },
      { value: 'early_settlement', label: 'Liquidación Anticipada' },
      { value: 'client_request', label: 'Solicitud del Cliente' },
      { value: 'refinancing', label: 'Refinanciamiento' },
      // delete_loan
      { value: 'duplicate_entry', label: 'Entrada Duplicada' },
      { value: 'data_entry_error', label: 'Error de Captura de Datos' },
      { value: 'wrong_client', label: 'Cliente Incorrecto' },
      { value: 'test_entry', label: 'Entrada de Prueba' },
      { value: 'cancelled_loan', label: 'Préstamo Cancelado' },
      { value: 'paid_outside_system', label: 'Pagado Fuera del Sistema' },
      { value: 'fraud', label: 'Fraude Detectado' },
      // remove_late_fee
      { value: 'error_correction', label: 'Corrección de Error' },
      { value: 'goodwill_adjustment', label: 'Ajuste de Buena Voluntad' },
      { value: 'payment_agreement', label: 'Acuerdo de Pago' },
      { value: 'system_error', label: 'Error del Sistema' },
      { value: 'other', label: 'Otra Razón' }
    ];
    
    const found = allReasons.find(r => r.value === reason);
    return found ? found.label : reason;
  };

  const getReasonsForUpdateType = (updateType: string) => {
    switch (updateType) {
      case 'add_charge':
        return [
          { value: 'late_payment_fee', label: 'Multa por Pago Tardío' },
          { value: 'administrative_fee', label: 'Tarifa Administrativa' },
          { value: 'penalty_fee', label: 'Cargo por Penalización' },
          { value: 'insurance_fee', label: 'Seguro del Préstamo' },
          { value: 'processing_fee', label: 'Tarifa de Procesamiento' },
          { value: 'legal_fee', label: 'Gastos Legales' },
          { value: 'collection_fee', label: 'Gastos de Cobranza' },
          { value: 'other_charge', label: 'Otro Cargo' }
        ];
      case 'term_extension':
        return [
          { value: 'financial_difficulty', label: 'Dificultades Financieras' },
          { value: 'job_loss', label: 'Pérdida de Empleo' },
          { value: 'medical_emergency', label: 'Emergencia Médica' },
          { value: 'family_emergency', label: 'Emergencia Familiar' },
          { value: 'income_reduction', label: 'Reducción de Ingresos' },
          { value: 'payment_plan', label: 'Plan de Pagos Especial' },
          { value: 'rate_negotiation', label: 'Renegociación de Condiciones' },
          { value: 'goodwill_extension', label: 'Extensión de Buena Voluntad' },
          { value: 'other', label: 'Otra Razón' }
        ];
      case 'settle_loan':
        return [
          { value: 'full_payment', label: 'Pago Completo del Préstamo' },
          { value: 'early_settlement', label: 'Liquidación Anticipada' },
          { value: 'client_request', label: 'Solicitud del Cliente' },
          { value: 'refinancing', label: 'Refinanciamiento' },
          { value: 'other', label: 'Otra Razón' }
        ];
      case 'delete_loan':
        return [
          { value: 'duplicate_entry', label: 'Entrada Duplicada' },
          { value: 'data_entry_error', label: 'Error de Captura de Datos' },
          { value: 'wrong_client', label: 'Cliente Incorrecto' },
          { value: 'test_entry', label: 'Entrada de Prueba' },
          { value: 'cancelled_loan', label: 'Préstamo Cancelado' },
          { value: 'paid_outside_system', label: 'Pagado Fuera del Sistema' },
          { value: 'fraud', label: 'Fraude Detectado' },
          { value: 'other', label: 'Otra Razón' }
        ];
      case 'remove_late_fee':
        return [
          { value: 'error_correction', label: 'Corrección de Error' },
          { value: 'goodwill_adjustment', label: 'Ajuste de Buena Voluntad' },
          { value: 'payment_agreement', label: 'Acuerdo de Pago' },
          { value: 'administrative_decision', label: 'Decisión Administrativa' },
          { value: 'client_complaint', label: 'Reclamo del Cliente' },
          { value: 'system_error', label: 'Error del Sistema' },
          { value: 'other', label: 'Otra Razón' }
        ];
      case 'edit_loan':
        return [
          { value: 'data_correction', label: 'Corrección de Datos' },
          { value: 'client_request', label: 'Solicitud del Cliente' },
          { value: 'rate_adjustment', label: 'Ajuste de Tasa' },
          { value: 'term_adjustment', label: 'Ajuste de Plazo' },
          { value: 'amount_adjustment', label: 'Ajuste de Monto' },
          { value: 'other', label: 'Otra Razón' }
        ];
      default:
        return [
          { value: 'other', label: 'Otra Razón' }
        ];
    }
  };

  return (
    <>
    <Dialog open={isOpen && !showPaymentForm} onOpenChange={onClose}>
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
                          <Select 
                            onValueChange={field.onChange} 
                            defaultValue={field.value}
                            disabled={editOnly}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Seleccionar tipo de actualización" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {!editOnly && (
                                <>
                                  <SelectItem value="add_charge">
                                    <div className="flex items-center gap-2">
                                      <PlusCircle className="h-4 w-4" />
                                      Agregar Cargo
                                    </div>
                                  </SelectItem>
                                  <SelectItem value="term_extension">
                                    <div className="flex items-center gap-2">
                                      <Calendar className="h-4 w-4" />
                                      Extensión de Plazo
                                    </div>
                                  </SelectItem>
                                  <SelectItem value="settle_loan">
                                    <div className="flex items-center gap-2">
                                      <DollarSign className="h-4 w-4" />
                                      Saldar Préstamo
                                    </div>
                                  </SelectItem>
                                  <SelectItem value="delete_loan">
                                    <div className="flex items-center gap-2">
                                      <Trash2 className="h-4 w-4" />
                                      Eliminar Préstamo
                                    </div>
                                  </SelectItem>
                                  <SelectItem value="remove_late_fee">
                                    <div className="flex items-center gap-2">
                                      <MinusCircle className="h-4 w-4" />
                                      Eliminar Mora
                                    </div>
                                  </SelectItem>
                                  <SelectItem value="payment_agreement">
                                    <div className="flex items-center gap-2">
                                      <Handshake className="h-4 w-4" />
                                      Acuerdos de Pago
                                    </div>
                                  </SelectItem>
                                </>
                              )}
                              {loan.status === 'pending' && (
                                <SelectItem value="edit_loan">
                                  <div className="flex items-center gap-2">
                                    <Edit className="h-4 w-4" />
                                    Editar Préstamo
                                  </div>
                                </SelectItem>
                              )}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Mostrar diálogo de acuerdos cuando se selecciona payment_agreement */}
                    {form.watch('update_type') === 'payment_agreement' && (
                      <div className="pt-4 border-t">
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full"
                          onClick={() => {
                            if (agreements.length === 0) {
                              toast.info('No hay acuerdos de pago aprobados o activos para este préstamo');
                              return;
                            }
                            setShowAgreementsDialog(true);
                          }}
                        >
                          <Handshake className="h-4 w-4 mr-2" />
                          Seleccionar Acuerdo de Pago
                        </Button>
                      </div>
                    )}

                    {/* Campos condicionales según el tipo de actualización */}
                    {form.watch('update_type') === 'add_charge' && (
                      <FormField
                        control={form.control}
                        name="amount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Monto del Cargo</FormLabel>
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

                    {form.watch('update_type') === 'settle_loan' && (
                      <div className="space-y-4">
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                          <div className="text-sm text-blue-800 space-y-1">
                            <div><strong>Capital Pendiente:</strong> RD${settleBreakdown.capitalPending.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                            <div><strong>Interés Pendiente:</strong> RD${settleBreakdown.interestPending.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                            <div><strong>Mora Pendiente:</strong> RD${settleBreakdown.lateFeePending.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                            <div className="pt-2 border-t border-blue-300">
                              <strong>Total a Saldar:</strong> RD${settleBreakdown.totalToSettle.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                          </div>
                        </div>
                        
                        <FormField
                          control={form.control}
                          name="settle_capital"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Capital a Pagar</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  placeholder={settleBreakdown.capitalPending.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  step="0.01"
                                  min="0"
                                  max={settleBreakdown.capitalPending}
                                  {...field}
                                  value={field.value || ''}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    if (value === '') {
                                      field.onChange(undefined);
                                    } else {
                                      const numValue = parseFloat(value);
                                      if (!isNaN(numValue) && numValue >= 0) {
                                        field.onChange(Math.min(numValue, settleBreakdown.capitalPending));
                                      }
                                    }
                                  }}
                                />
                              </FormControl>
                              <div className="text-xs text-gray-500">
                                Máximo: RD${settleBreakdown.capitalPending.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="settle_interest"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Interés a Pagar</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  placeholder={settleBreakdown.interestPending.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  step="0.01"
                                  min="0"
                                  max={settleBreakdown.interestPending}
                                  {...field}
                                  value={field.value || ''}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    if (value === '') {
                                      field.onChange(undefined);
                                    } else {
                                      const numValue = parseFloat(value);
                                      if (!isNaN(numValue) && numValue >= 0) {
                                        field.onChange(Math.min(numValue, settleBreakdown.interestPending));
                                      }
                                    }
                                  }}
                                />
                              </FormControl>
                              <div className="text-xs text-gray-500">
                                Máximo: RD${settleBreakdown.interestPending.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="settle_late_fee"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Mora a Pagar</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  placeholder={settleBreakdown.lateFeePending.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  step="0.01"
                                  min="0"
                                  max={settleBreakdown.lateFeePending}
                                  {...field}
                                  value={field.value || ''}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    if (value === '') {
                                      field.onChange(undefined);
                                    } else {
                                      const numValue = parseFloat(value);
                                      if (!isNaN(numValue) && numValue >= 0) {
                                        field.onChange(Math.min(numValue, settleBreakdown.lateFeePending));
                                      }
                                    }
                                  }}
                                />
                              </FormControl>
                              <div className="text-xs text-gray-500">
                                Máximo: RD${settleBreakdown.lateFeePending.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <Button
                          type="button"
                          variant="outline"
                          className="w-full"
                          onClick={() => {
                            form.setValue('settle_capital', settleBreakdown.capitalPending);
                            form.setValue('settle_interest', settleBreakdown.interestPending);
                            form.setValue('settle_late_fee', settleBreakdown.lateFeePending);
                          }}
                        >
                          Usar Monto Total a Saldar
                        </Button>
                      </div>
                    )}

                    {form.watch('update_type') === 'remove_late_fee' && (
                      <div className="space-y-4">
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                          <div className="text-sm text-blue-800">
                            <strong>Mora Actual:</strong> RD${currentLateFee.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                          </div>
                        </div>
                        <FormField
                          control={form.control}
                          name="late_fee_amount"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Monto de Mora a Eliminar</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  placeholder="0.00"
                                  step="0.01"
                                  min="0"
                                  max={currentLateFee}
                                  {...field}
                                  value={field.value || ''}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    const numValue = value === '' ? 0 : parseFloat(value) || 0;
                                    field.onChange(Math.min(numValue, currentLateFee));
                                  }}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          className="w-full"
                          onClick={() => {
                            form.setValue('late_fee_amount', currentLateFee);
                          }}
                        >
                          Eliminar Toda la Mora
                        </Button>
                      </div>
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

                    {form.watch('update_type') === 'edit_loan' && (
                      <div className="space-y-4">
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                          <div className="text-sm text-yellow-800">
                            <strong>Nota:</strong> Solo se pueden editar préstamos pendientes. Al editar, se eliminarán todas las cuotas existentes y se crearán nuevas cuotas según los nuevos parámetros.
                          </div>
                        </div>
                        <FormField
                          control={form.control}
                          name="edit_amount"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Monto del Préstamo</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  placeholder={loan.amount.toString()}
                                  step="0.01"
                                  disabled={loan.status === 'pending'}
                                  {...field}
                                  value={field.value || loan.amount}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    field.onChange(value === '' ? loan.amount : parseFloat(value) || loan.amount);
                                  }}
                                />
                              </FormControl>
                              {loan.status === 'pending' && (
                                <p className="text-xs text-gray-500">
                                  El monto no se puede modificar porque este préstamo es un financiamiento de una factura.
                                </p>
                              )}
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="edit_interest_rate"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Tasa de Interés (%)</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  placeholder={loan.interest_rate.toString()}
                                  step="0.01"
                                  {...field}
                                  value={field.value || loan.interest_rate}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    field.onChange(value === '' ? loan.interest_rate : parseFloat(value) || loan.interest_rate);
                                  }}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="edit_term_months"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Plazo (Meses)</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  placeholder={loan.term_months.toString()}
                                  min="1"
                                  {...field}
                                  value={field.value || loan.term_months}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    field.onChange(value === '' ? loan.term_months : parseInt(value) || loan.term_months);
                                  }}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="edit_amortization_type"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Tipo de Amortización</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value || loan.amortization_type || 'simple'}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Seleccionar tipo de amortización" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="simple">Simple</SelectItem>
                                  <SelectItem value="french">Francesa</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="edit_payment_frequency"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Frecuencia de Pago</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value || loan.payment_frequency || 'monthly'}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Seleccionar frecuencia" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="daily">Diaria</SelectItem>
                                  <SelectItem value="weekly">Semanal</SelectItem>
                                  <SelectItem value="biweekly">Quincenal</SelectItem>
                                  <SelectItem value="monthly">Mensual</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="edit_late_fee_enabled"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                              <div className="space-y-0.5">
                                <FormLabel>Habilitar Mora</FormLabel>
                                <div className="text-sm text-muted-foreground">
                                  Activar cálculo de mora para este préstamo
                                </div>
                              </div>
                              <FormControl>
                                <input
                                  type="checkbox"
                                  checked={field.value !== undefined ? field.value : (loan.late_fee_enabled || false)}
                                  onChange={(e) => field.onChange(e.target.checked)}
                                  className="h-4 w-4"
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        {form.watch('edit_late_fee_enabled') && (
                          <>
                            <FormField
                              control={form.control}
                              name="edit_late_fee_rate"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Tasa de Mora (%)</FormLabel>
                                  <FormControl>
                                    <Input
                                      type="number"
                                      placeholder={(loan.late_fee_rate || 3).toString()}
                                      step="0.01"
                                      min="0"
                                      max="100"
                                      {...field}
                                      value={field.value || loan.late_fee_rate || 3}
                                      onChange={(e) => {
                                        const value = e.target.value;
                                        field.onChange(value === '' ? (loan.late_fee_rate || 3) : parseFloat(value) || (loan.late_fee_rate || 3));
                                      }}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name="edit_grace_period_days"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Días de Gracia</FormLabel>
                                  <FormControl>
                                    <Input
                                      type="number"
                                      placeholder={(loan.grace_period_days || 3).toString()}
                                      min="0"
                                      max="30"
                                      {...field}
                                      value={field.value || loan.grace_period_days || 3}
                                      onChange={(e) => {
                                        const value = e.target.value;
                                        field.onChange(value === '' ? (loan.grace_period_days || 3) : parseInt(value) || (loan.grace_period_days || 3));
                                      }}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </>
                        )}
                      </div>
                    )}

                    {form.watch('update_type') === 'add_charge' && (
                      <>
                        <FormField
                          control={form.control}
                          name="charge_date"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Fecha del Cargo</FormLabel>
                              <FormControl>
                                <Input
                                  type="date"
                                  {...field}
                                  value={field.value || ''}
                                  max={new Date().toISOString().split('T')[0]}
                                />
                              </FormControl>
                              <FormMessage />
                              <p className="text-xs text-gray-500">
                                La fecha de vencimiento se calculará automáticamente como un día después. La mora se calculará desde la fecha de vencimiento, no desde el inicio del préstamo.
                              </p>
                            </FormItem>
                          )}
                        />
                        {form.watch('charge_date') && (
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                            <div className="text-sm text-blue-800">
                              <strong>Fecha de Vencimiento Calculada:</strong>{' '}
                              {(() => {
                                const chargeDate = new Date(form.watch('charge_date') || '');
                                const dueDate = new Date(chargeDate);
                                dueDate.setDate(dueDate.getDate() + 1);
                                return dueDate.toLocaleDateString('es-DO', {
                                  year: 'numeric',
                                  month: 'long',
                                  day: 'numeric'
                                });
                              })()}
                            </div>
                          </div>
                        )}
                        <FormField
                          control={form.control}
                          name="reference_number"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Número de Referencia</FormLabel>
                              <FormControl>
                                <Input placeholder="Número de comprobante, factura, etc." {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </>
                    )}

                    {/* Campos de razón y notas - ocultar para payment_agreement */}
                    {form.watch('update_type') !== 'payment_agreement' && (
                      <>
                        <FormField
                          control={form.control}
                          name="adjustment_reason"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>
                                {form.watch('update_type') === 'add_charge' ? 'Razón del Cargo' :
                                 form.watch('update_type') === 'delete_loan' ? 'Razón de Eliminación' :
                                 form.watch('update_type') === 'remove_late_fee' ? 'Razón de Eliminación de Mora' :
                                 form.watch('update_type') === 'edit_loan' ? 'Razón de Edición' :
                                 form.watch('update_type') === 'settle_loan' ? 'Razón de Saldo' :
                                 'Razón del Ajuste'}
                              </FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Seleccionar razón" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {getReasonsForUpdateType(form.watch('update_type')).map((reason) => (
                                    <SelectItem key={reason.value} value={reason.value}>
                                      {reason.label}
                                    </SelectItem>
                                  ))}
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
                      </>
                    )}
                  </CardContent>
                </Card>

                {/* Botones - ocultar para payment_agreement ya que solo redirige */}
                {form.watch('update_type') !== 'payment_agreement' && (
                  <div className="flex gap-4">
                    <Button type="button" variant="outline" onClick={onClose}>
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={loading}>
                      {loading ? 'Procesando...' : 'Guardar Cambios'}
                    </Button>
                  </div>
                )}
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
                    
                    {form.watch('update_type') === 'add_charge' && form.watch('amount') && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Monto del Cargo:</span>
                          <span className="font-semibold text-blue-600">${form.watch('amount')?.toLocaleString()}</span>
                        </div>
                        {form.watch('charge_date') && (
                          <>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Fecha del Cargo:</span>
                              <span className="font-semibold text-blue-600">
                                {new Date(form.watch('charge_date') || '').toLocaleDateString('es-DO', {
                                  year: 'numeric',
                                  month: 'long',
                                  day: 'numeric'
                                })}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Fecha de Vencimiento:</span>
                              <span className="font-semibold text-green-600">
                                {(() => {
                                  const chargeDate = new Date(form.watch('charge_date') || '');
                                  const dueDate = new Date(chargeDate);
                                  dueDate.setDate(dueDate.getDate() + 1);
                                  return dueDate.toLocaleDateString('es-DO', {
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric'
                                  });
                                })()}
                              </span>
                            </div>
                          </>
                        )}
                        
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-2">
                          <div className="text-sm text-blue-800">
                            <strong>💡 Nueva Cuota</strong>
                            <p className="mt-1 text-xs">
                              Este cargo se agregará como una nueva cuota adicional al préstamo (ej: Cuota {loan.term_months + 1}). 
                              La fecha de vencimiento se calcula automáticamente como un día después de la fecha del cargo. 
                              La mora se calculará desde la fecha de vencimiento, no desde el inicio del préstamo.
                            </p>
                          </div>
                        </div>
                      </>
                    )}
                    
                    {form.watch('update_type') === 'settle_loan' && (
                      <>
                        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                          <div className="text-sm font-semibold text-green-800 mb-2">Desglose del Saldo</div>
                          <div className="space-y-1 text-sm">
                            <div className="flex justify-between">
                              <span className="text-gray-600">Capital Pendiente:</span>
                              <span className="font-semibold">RD${settleBreakdown.capitalPending.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Interés Pendiente:</span>
                              <span className="font-semibold">RD${settleBreakdown.interestPending.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Mora Pendiente:</span>
                              <span className="font-semibold text-red-600">RD${settleBreakdown.lateFeePending.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                            <hr className="my-2" />
                            <div className="flex justify-between">
                              <span className="text-gray-700 font-semibold">Total a Saldar:</span>
                              <span className="font-bold text-lg text-green-600">RD${settleBreakdown.totalToSettle.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                            {(form.watch('settle_capital') || form.watch('settle_interest') || form.watch('settle_late_fee')) && (
                              <>
                                <hr className="my-2" />
                                <div className="space-y-1">
                                  <div className="flex justify-between">
                                    <span className="text-gray-700">Capital a Pagar:</span>
                                    <span className="font-semibold text-blue-600">RD${(form.watch('settle_capital') || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-gray-700">Interés a Pagar:</span>
                                    <span className="font-semibold text-blue-600">RD${(form.watch('settle_interest') || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span className="text-gray-700">Mora a Pagar:</span>
                                    <span className="font-semibold text-blue-600">RD${(form.watch('settle_late_fee') || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                  </div>
                                  <hr className="my-2" />
                                  <div className="flex justify-between">
                                    <span className="text-gray-700 font-semibold">Total a Pagar:</span>
                                    <span className="font-bold text-lg text-blue-600">
                                      RD${((form.watch('settle_capital') || 0) + (form.watch('settle_interest') || 0) + (form.watch('settle_late_fee') || 0)).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                  </div>
                                  {(() => {
                                    const capitalPaid = form.watch('settle_capital') || 0;
                                    const interestPaid = form.watch('settle_interest') || 0;
                                    const lateFeePaid = form.watch('settle_late_fee') || 0;
                                    const isFullySettled = capitalPaid >= settleBreakdown.capitalPending && 
                                                          interestPaid >= settleBreakdown.interestPending &&
                                                          lateFeePaid >= settleBreakdown.lateFeePending;
                                    return isFullySettled && (
                                      <div className="bg-green-100 border border-green-300 rounded p-2 mt-2">
                                        <div className="flex items-center gap-2 text-green-800 text-xs">
                                          <CheckCircle className="h-4 w-4" />
                                          <span>El préstamo será saldado completamente</span>
                                        </div>
                                      </div>
                                    );
                                  })()}
                                </div>
                              </>
                            )}
                          </div>
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
                          <span className="font-semibold">{loan.term_months} cuotas</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Cuotas Adicionales:</span>
                          <span className="font-semibold text-blue-600">+{form.watch('additional_months')} cuotas</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Nuevo Total:</span>
                          <span className="font-bold text-purple-600">{(loan.term_months || 0) + (form.watch('additional_months') || 0)} cuotas</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Nueva Cuota Mensual:</span>
                          <span className="font-bold text-green-600">RD${calculatedValues.newPayment.toLocaleString()}</span>
                        </div>
                        {calculatedValues.newEndDate && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">Nueva Fecha Fin:</span>
                            <span className="font-semibold">{new Date(calculatedValues.newEndDate).toLocaleDateString()}</span>
                          </div>
                        )}
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-2">
                          <div className="text-sm text-blue-800">
                            <strong>📋 Se crearán {form.watch('additional_months')} cuotas nuevas</strong>
                            <p className="mt-1 text-xs">
                              Las nuevas cuotas se agregarán a la tabla de desglose después de guardar
                            </p>
                          </div>
                        </div>
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

                    {form.watch('update_type') === 'remove_late_fee' && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Mora Actual:</span>
                          <span className="font-semibold text-red-600">RD${currentLateFee.toLocaleString()}</span>
                        </div>
                        {form.watch('late_fee_amount') && form.watch('late_fee_amount')! > 0 && (
                          <>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Mora a Eliminar:</span>
                              <span className="font-semibold text-blue-600">-RD${form.watch('late_fee_amount')?.toLocaleString()}</span>
                            </div>
                            <hr className="my-2" />
                            <div className="flex justify-between">
                              <span className="text-gray-600">Nueva Mora:</span>
                              <span className="font-bold text-lg text-green-600">
                                RD${Math.max(0, currentLateFee - (form.watch('late_fee_amount') || 0)).toLocaleString()}
                              </span>
                            </div>
                          </>
                        )}
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-4">
                          <div className="flex items-center gap-2 text-yellow-800">
                            <AlertCircle className="h-4 w-4" />
                            <div>
                              <span className="font-semibold">⚠️ IMPORTANTE</span>
                              <p className="text-sm mt-1">
                                Esta acción elimina la mora del préstamo, pero NO registra un pago. 
                                La mora simplemente se reduce del monto acumulado.
                              </p>
                            </div>
                          </div>
                        </div>
                      </>
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

            {/* Desglose de Mora - mostrar en todas las actualizaciones excepto eliminar, eliminar mora, acuerdos de pago y si el préstamo está saldado */}
            {form.watch('update_type') !== 'delete_loan' && form.watch('update_type') !== 'remove_late_fee' && form.watch('update_type') !== 'payment_agreement' && loan.status !== 'paid' && (
              <div className="mt-4">
                <LateFeeInfo
                  loanId={loan.id}
                  nextPaymentDate={loan.next_payment_date}
                  currentLateFee={currentLateFee}
                  lateFeeEnabled={(loan as any).late_fee_enabled || false}
                  lateFeeRate={(loan as any).late_fee_rate || 0}
                  gracePeriodDays={(loan as any).grace_period_days || 0}
                  maxLateFee={(loan as any).max_late_fee || 0}
                  lateFeeCalculationType={((loan as any).late_fee_calculation_type || 'daily') as 'daily' | 'monthly' | 'compound'}
                  remainingBalance={loan.remaining_balance}
                  clientName={loan.client.full_name}
                  amount={loan.amount}
                  term={loan.term_months || 4}
                  payment_frequency={loan.payment_frequency || 'monthly'}
                  interest_rate={loan.interest_rate}
                  monthly_payment={loan.monthly_payment}
                  paid_installments={loan.paid_installments}
                  start_date={loan.start_date}
                />
              </div>
            )}

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
                  <span className="font-semibold">
                    {(loan.status === 'paid' || loan.remaining_balance === 0 || !loan.next_payment_date) 
                      ? 'N/A' 
                      : loan.next_payment_date}
                  </span>
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

    {/* Diálogo de Selección de Acuerdos de Pago */}
    <Dialog open={showAgreementsDialog} onOpenChange={setShowAgreementsDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Seleccionar Acuerdo de Pago</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {agreements.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Handshake className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No hay acuerdos de pago aprobados para este préstamo</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {agreements.map((agreement) => (
                <Card
                  key={agreement.id}
                  className="cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => {
                    setSelectedAgreement(agreement);
                    setShowAgreementsDialog(false);
                    setShowPaymentForm(true);
                    // NO cerrar el diálogo de actualización aquí, el PaymentForm se mostrará encima
                  }}
                >
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <div className="font-semibold">
                          Monto acordado: ${(agreement.agreed_amount || agreement.agreed_payment_amount || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div className="text-sm text-gray-600">
                          Monto original: ${(agreement.original_amount || agreement.original_payment || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div className="text-sm text-gray-600">
                          Frecuencia: {agreement.payment_frequency === 'monthly' ? 'Mensual' :
                                       agreement.payment_frequency === 'biweekly' ? 'Quincenal' :
                                       agreement.payment_frequency === 'weekly' ? 'Semanal' :
                                       agreement.payment_frequency === 'daily' ? 'Diario' : agreement.payment_frequency}
                        </div>
                        <div className="text-sm text-gray-600">
                          Período: {new Date(agreement.start_date).toLocaleDateString('es-DO')} - {agreement.end_date ? new Date(agreement.end_date).toLocaleDateString('es-DO') : 'Sin fecha de fin'}
                        </div>
                        {agreement.reason && (
                          <div className="text-sm text-gray-600">
                            Razón: {agreement.reason}
                          </div>
                        )}
                      </div>
                      <Badge variant={agreement.status === 'approved' || agreement.status === 'active' ? 'default' : 'secondary'}>
                        {agreement.status === 'approved' ? 'Aprobado' : 
                         agreement.status === 'active' ? 'Activo' : 
                         agreement.status}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>

    {/* PaymentForm con datos del acuerdo */}
    {showPaymentForm && selectedAgreement && (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-y-auto">
          <PaymentForm
            onBack={() => {
              setShowPaymentForm(false);
              setSelectedAgreement(null);
            }}
            preselectedLoan={{
              id: loan.id,
              amount: loan.amount,
              remaining_balance: loan.remaining_balance,
              monthly_payment: selectedAgreement?.agreed_amount || selectedAgreement?.agreed_payment_amount || loan.monthly_payment,
              interest_rate: loan.interest_rate,
              term_months: loan.term_months,
              next_payment_date: loan.next_payment_date,
              start_date: loan.start_date,
              late_fee_enabled: (loan as any).late_fee_enabled || false,
              late_fee_rate: (loan as any).late_fee_rate || 0,
              grace_period_days: (loan as any).grace_period_days || 0,
              max_late_fee: (loan as any).max_late_fee || 0,
              late_fee_calculation_type: ((loan as any).late_fee_calculation_type || 'daily') as 'daily' | 'monthly' | 'compound',
              current_late_fee: (loan as any).current_late_fee || 0,
              payment_frequency: loan.payment_frequency || 'monthly',
              client: loan.client
            }}
            onPaymentSuccess={() => {
              setShowPaymentForm(false);
              setSelectedAgreement(null);
              onUpdate();
              onClose(); // Cerrar el diálogo de actualización solo después del pago exitoso
            }}
          />
        </div>
      </div>
    )}
    </>
  );
};