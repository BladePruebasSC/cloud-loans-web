
import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLoanPaymentStatusSimple } from '@/hooks/useLoanPaymentStatusSimple';
import { useLateFee } from '@/hooks/useLateFee';
import { calculateLateFee as calculateLateFeeUtil } from '@/utils/lateFeeCalculator';
import { getCurrentDateInSantoDomingo } from '@/utils/dateUtils';
import { toast } from 'sonner';
import { ArrowLeft, DollarSign, AlertTriangle } from 'lucide-react';
import { Search, User } from 'lucide-react';

const paymentSchema = z.object({
  loan_id: z.string().min(1, 'Debe seleccionar un préstamo'),
  amount: z.number().min(0.01, 'El monto debe ser mayor a 0'),
  payment_method: z.string().min(1, 'Debe seleccionar un método de pago'),
  reference_number: z.string().optional(),
  notes: z.string().optional(),
  late_fee_amount: z.number().min(0).optional(),
}).refine((data) => {
  // Esta validación se manejará en el onSubmit para tener acceso al selectedLoan
  return true;
}, {
  message: "Validación de monto máximo se maneja en el formulario"
});

type PaymentFormData = z.infer<typeof paymentSchema>;

interface Loan {
  id: string;
  amount: number;
  remaining_balance: number;
  monthly_payment: number;
  next_payment_date: string;
  interest_rate: number;
  late_fee_enabled?: boolean;
  late_fee_rate?: number;
  grace_period_days?: number;
  max_late_fee?: number;
  late_fee_calculation_type?: 'daily' | 'monthly' | 'compound';
  current_late_fee?: number;
  client: {
    full_name: string;
    dni: string;
  };
}

export const PaymentForm = ({ onBack, preselectedLoan, onPaymentSuccess }: { 
  onBack: () => void; 
  preselectedLoan?: Loan;
  onPaymentSuccess?: () => void;
}) => {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [filteredLoans, setFilteredLoans] = useState<Loan[]>([]);
  const [loanSearch, setLoanSearch] = useState('');
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const [showLoanDropdown, setShowLoanDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [paymentDistribution, setPaymentDistribution] = useState<any>(null);
  const [lateFeeAmount, setLateFeeAmount] = useState<number>(0);
  const [lateFeeCalculation, setLateFeeCalculation] = useState<any>(null);
  const { user, companyId } = useAuth();
  const { paymentStatus, refetch: refetchPaymentStatus } = useLoanPaymentStatusSimple(selectedLoan);
  const { calculateLateFee } = useLateFee();

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

  // Función para calcular la mora del préstamo usando la función centralizada
  const calculateLoanLateFee = async (loan: Loan) => {
    try {
      // Usar la función centralizada para calcular la mora
      const calculation = calculateLateFeeUtil({
        remaining_balance: loan.remaining_balance,
        next_payment_date: loan.next_payment_date,
        late_fee_rate: loan.late_fee_rate || 0,
        grace_period_days: loan.grace_period_days || 0,
        max_late_fee: loan.max_late_fee || 0,
        late_fee_calculation_type: loan.late_fee_calculation_type || 'daily',
        late_fee_enabled: loan.late_fee_enabled || false,
        amount: loan.amount, // Monto total del préstamo
        term: 4, // Número de cuotas (asumiendo 4 para el ejemplo)
        payment_frequency: 'monthly' // Frecuencia de pago
      });

      // Obtener pagos de mora previos
      const previousLateFeePayments = await getPreviousLateFeePayments(loan.id);
      
      // Calcular mora pendiente (mora total - mora ya pagada)
      const pendingLateFee = Math.max(0, calculation.lateFeeAmount - previousLateFeePayments);
      
      console.log('🔍 PaymentForm: Mora calculada:', calculation.lateFeeAmount);
      console.log('🔍 PaymentForm: Mora ya pagada:', previousLateFeePayments);
      console.log('🔍 PaymentForm: Mora pendiente:', pendingLateFee);

      setLateFeeAmount(pendingLateFee);
      setLateFeeCalculation({
        days_overdue: calculation.daysOverdue,
        late_fee_amount: pendingLateFee, // Usar la mora pendiente
        total_late_fee: pendingLateFee
      });
    } catch (error) {
      console.error('Error calculating late fee:', error);
      setLateFeeAmount(0);
      setLateFeeCalculation(null);
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

  // Actualizar automáticamente el monto del pago cuando cambie el estado
  React.useEffect(() => {
    if (selectedLoan && paymentStatus.currentPaymentRemaining > 0) {
      // Si hay un saldo pendiente menor a la cuota mensual, pre-llenar con ese monto
      if (paymentStatus.currentPaymentRemaining < selectedLoan.monthly_payment) {
        form.setValue('amount', paymentStatus.currentPaymentRemaining);
        setPaymentAmount(paymentStatus.currentPaymentRemaining);
      } else {
        // Si no hay pagos previos, usar la cuota mensual completa
        form.setValue('amount', selectedLoan.monthly_payment);
        setPaymentAmount(selectedLoan.monthly_payment);
      }
    }
  }, [paymentStatus.currentPaymentRemaining, selectedLoan, form]);

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
        clients (
          full_name,
          dni
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
        dni: (loan.clients as any)?.dni || ''
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
    // Calcular mora cuando se selecciona un préstamo
    calculateLoanLateFee(loan);
    // El monto se establecerá cuando se actualice el paymentStatus
  };

  const handleLoanSelect = (loanId: string) => {
    const loan = loans.find(l => l.id === loanId);
    setSelectedLoan(loan || null);
    if (loan) {
      form.setValue('loan_id', loan.id);
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

    // Calcular el interés fijo por cuota (amortización simple)
    // Fórmula: Interés por cuota = (Monto Original × Tasa × Plazo) ÷ Plazo
    // Simplificado: Interés por cuota = Monto Original × Tasa ÷ 100
    const fixedInterestPerPayment = (selectedLoan.amount * selectedLoan.interest_rate) / 100;
    
    console.log('🔍 Calculando distribución para préstamo:', selectedLoan.id);
    console.log('🔍 Monto del préstamo:', selectedLoan.amount);
    console.log('🔍 Tasa de interés:', selectedLoan.interest_rate);
    console.log('🔍 Interés fijo por cuota:', fixedInterestPerPayment);
    
    // Calcular cuánto interés ya se ha pagado en esta cuota
    console.log('🔍 Llamando a calculatePaidInterestForCurrentPayment para préstamo:', selectedLoan.id);
    const alreadyPaidInterest = await calculatePaidInterestForCurrentPayment(selectedLoan.id);
    
    // Calcular cuánto interés queda por pagar
    const remainingInterest = Math.max(0, fixedInterestPerPayment - alreadyPaidInterest);
    
    console.log('🔍 RESULTADO DE calculatePaidInterestForCurrentPayment:');
    console.log('🔍 Interés ya pagado (valor devuelto):', alreadyPaidInterest);
    console.log('🔍 Interés fijo por cuota:', fixedInterestPerPayment);
    console.log('🔍 Interés pendiente calculado:', remainingInterest);
    console.log('🔍 ¿El interés está completo?', alreadyPaidInterest >= fixedInterestPerPayment ? 'SÍ ✅' : 'NO ❌');
    
    let interestPayment = 0;
    let principalPayment = 0;
    
    if (amount <= remainingInterest) {
      // Si el pago es menor o igual al interés pendiente, todo va al interés
      interestPayment = amount;
      principalPayment = 0;
    } else {
      // Si el pago excede el interés pendiente, primero se paga el interés completo y el resto al capital
      interestPayment = remainingInterest;
      principalPayment = amount - remainingInterest;
    }
    
    console.log('🔍 Distribución final:', {
      amount,
      interestPayment,
      principalPayment,
      fixedInterestPerPayment,
      remainingInterest,
      alreadyPaidInterest
    });
    
    return { 
      interestPayment, 
      principalPayment, 
      monthlyInterestAmount: fixedInterestPerPayment,
      remainingInterest,
      alreadyPaidInterest
    };
  };

  const onSubmit = async (data: PaymentFormData) => {
    if (!user || !companyId || !selectedLoan) return;

    // Evitar múltiples envíos
    if (loading) return;

    setLoading(true);
    try {
      // Validaciones antes de procesar el pago
      const monthlyPayment = selectedLoan.monthly_payment;
      const remainingBalance = selectedLoan.remaining_balance;
      const currentPaymentRemaining = paymentStatus.currentPaymentRemaining;
      const interestRate = selectedLoan.interest_rate; // Tasa de interés mensual [[memory:6311805]]
      
      // Validación 1: No permitir pagos que excedan el balance restante + mora
      const totalPaymentAmount = data.amount + (data.late_fee_amount || 0);
      if (totalPaymentAmount > remainingBalance + lateFeeAmount) {
        toast.error(`El pago total (cuota + mora) no puede exceder RD$${(remainingBalance + lateFeeAmount).toLocaleString()}`);
        return;
      }
      
      // Validación 2: No permitir pagos negativos o cero
      if (data.amount <= 0) {
        toast.error('El monto del pago debe ser mayor a 0');
        return;
      }

      // Validación 3: No permitir pagos que excedan lo que falta de la cuota actual
      // Si currentPaymentRemaining es 0, usar la cuota mensual completa
      const maxAllowedPayment = currentPaymentRemaining > 0 ? currentPaymentRemaining : monthlyPayment;
      if (data.amount > maxAllowedPayment) {
        toast.error(`El pago de cuota no puede exceder lo que falta de la cuota actual: RD$${maxAllowedPayment.toLocaleString()}`);
        return;
      }

      // Calcular la distribución del pago considerando pagos previos
      const distribution = await calculatePaymentDistribution(data.amount);
      const { interestPayment, principalPayment, remainingInterest } = distribution;
      
      // Determinar si es un pago completo o parcial
      const isFullPayment = data.amount >= maxAllowedPayment;
      const paymentStatusValue = isFullPayment ? 'completed' : 'pending';
      
      // Si es pago parcial, mostrar advertencia
      if (!isFullPayment) {
        const remainingAmount = maxAllowedPayment - data.amount;
        toast.warning(`Pago parcial registrado. Queda pendiente RD$${remainingAmount.toLocaleString()} de la cuota mensual.`);
      }

      // Mostrar información sobre la distribución del pago
        const distributionMessage = principalPayment > 0 
          ? `Pago aplicado: RD$${interestPayment.toLocaleString()} al interés, RD$${principalPayment.toLocaleString()} al capital`
          : `Pago aplicado: RD$${interestPayment.toLocaleString()} al interés (pendiente interés: RD$${(remainingInterest - interestPayment).toLocaleString()})`;
        
        toast.info(distributionMessage);

      const paymentData = {
        loan_id: data.loan_id,
        amount: data.amount + (data.late_fee_amount || 0),
        principal_amount: principalPayment,
        interest_amount: interestPayment,
        late_fee: data.late_fee_amount || 0,
        due_date: selectedLoan.next_payment_date,
        payment_method: data.payment_method,
        reference_number: data.reference_number,
        notes: data.notes,
        status: paymentStatusValue,
        created_by: companyId,
      };

      const { error: paymentError } = await supabase
        .from('payments')
        .insert([paymentData]);

      if (paymentError) throw paymentError;

      // Actualizar el balance restante del préstamo (se reduce con el monto total pagado)
      const newBalance = Math.max(0, remainingBalance - data.amount);
      
      // Solo actualizar la fecha del próximo pago si es un pago completo
      let nextPaymentDate = selectedLoan.next_payment_date;
      if (isFullPayment) {
        const nextDate = new Date(selectedLoan.next_payment_date);
        nextDate.setMonth(nextDate.getMonth() + 1);
        nextPaymentDate = nextDate.toISOString().split('T')[0];
      }

      // Calcular la nueva mora actual después del pago
      let newCurrentLateFee = selectedLoan.current_late_fee || 0;
      if (data.late_fee_amount && data.late_fee_amount > 0) {
        // Restar la mora pagada de la mora actual
        newCurrentLateFee = Math.max(0, newCurrentLateFee - data.late_fee_amount);
      }

      const { error: loanError } = await supabase
        .from('loans')
        .update({
          remaining_balance: newBalance,
          next_payment_date: nextPaymentDate,
          status: newBalance <= 0 ? 'paid' : 'active',
          current_late_fee: newCurrentLateFee,
        })
        .eq('id', data.loan_id);

      if (loanError) throw loanError;

      let successMessage = isFullPayment 
        ? 'Pago completo registrado exitosamente' 
        : 'Pago parcial registrado exitosamente';
      
      if (data.late_fee_amount && data.late_fee_amount > 0) {
        successMessage += ` (incluye mora de RD$${data.late_fee_amount.toLocaleString()})`;
      }
      
      toast.success(successMessage);
      
      // Actualizar el estado del pago
      await refetchPaymentStatus();
      
      // Llamar al callback para actualizar los datos del padre
      if (onPaymentSuccess) {
        onPaymentSuccess();
      }
      
      onBack();
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
                                {loan.client?.dni} • Balance: ${loan.remaining_balance.toLocaleString()}
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
                                ${selectedLoan.remaining_balance.toLocaleString()}
                              </div>
                            </div>
                            <div>
                              <span className="font-medium text-gray-600">Próximo Pago:</span>
                              <div className="text-sm">
                                {new Date(selectedLoan.next_payment_date).toLocaleDateString()}
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
              📊 Distribución del Pago (RD${paymentAmount.toLocaleString()})
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-green-700">Interés fijo por cuota:</span>
                <span className="font-semibold">RD${paymentDistribution.monthlyInterestAmount.toLocaleString()}</span>
              </div>
              {paymentDistribution.alreadyPaidInterest > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-green-700">Interés ya pagado:</span>
                  <span className="font-semibold text-gray-600">RD${paymentDistribution.alreadyPaidInterest.toLocaleString()}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-green-700">Interés pendiente:</span>
                <span className="font-semibold text-orange-600">RD${paymentDistribution.remainingInterest.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-green-700">Se aplica al interés:</span>
                <span className="font-semibold text-orange-600">RD${paymentDistribution.interestPayment.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-green-700">Se aplica al capital:</span>
                <span className="font-semibold text-blue-600">RD${paymentDistribution.principalPayment.toLocaleString()}</span>
              </div>
              {paymentDistribution.interestPayment < paymentDistribution.remainingInterest && (
                <div className="mt-2 p-2 bg-yellow-100 border border-yellow-300 rounded text-xs text-yellow-800">
                  ⚠️ Pago parcial al interés. Queda pendiente: RD${(paymentDistribution.remainingInterest - paymentDistribution.interestPayment).toLocaleString()}
                </div>
              )}
              {paymentDistribution.principalPayment > 0 && (
                <div className="mt-2 p-2 bg-blue-100 border border-blue-300 rounded text-xs text-blue-800">
                  ✅ El balance del préstamo se reducirá en RD${paymentDistribution.principalPayment.toLocaleString()}
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
                <span className="font-semibold">RD${paymentAmount.toLocaleString()}</span>
              </div>
              {form.watch('late_fee_amount') && form.watch('late_fee_amount') > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-blue-700">Pago de mora:</span>
                  <span className="font-semibold text-orange-600">RD${form.watch('late_fee_amount').toLocaleString()}</span>
                </div>
              )}
              <div className="border-t pt-2 flex justify-between items-center">
                <span className="text-blue-800 font-medium">Total a pagar:</span>
                <span className="font-bold text-lg text-blue-800">
                  RD${(paymentAmount + (form.watch('late_fee_amount') || 0)).toLocaleString()}
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
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              placeholder="0.00"
                              {...field}
                              value={field.value || ''}
                              onChange={async (e) => {
                                const value = e.target.value;
                                const numValue = value === '' ? 0 : parseFloat(value) || 0;
                                field.onChange(numValue);
                                setPaymentAmount(numValue);
                                
                                // Calcular distribución en tiempo real
                                if (selectedLoan && numValue > 0) {
                                  const distribution = await calculatePaymentDistribution(numValue);
                                  setPaymentDistribution(distribution);
                                } else {
                                  setPaymentDistribution(null);
                                }
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

                    {/* Campo para pago de mora */}
                    {selectedLoan?.late_fee_enabled && lateFeeAmount > 0 && (
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
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  max={lateFeeAmount}
                                  placeholder="0.00"
                                  {...field}
                                  value={field.value || ''}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    const numValue = value === '' ? 0 : parseFloat(value) || 0;
                                    field.onChange(numValue);
                                  }}
                                />
                              </FormControl>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => field.onChange(lateFeeAmount)}
                                className="whitespace-nowrap"
                              >
                                Pagar Toda
                              </Button>
                            </div>
                            <div className="text-xs text-orange-600 mt-1">
                              💡 Mora pendiente: RD${lateFeeAmount.toLocaleString()}
                            </div>
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
                    <span className="text-sm text-gray-600">Balance Pendiente:</span>
                    <span className="font-bold text-red-600">
                      ${selectedLoan.remaining_balance.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Cuota Mensual:</span>
                    <span className="font-semibold">
                      ${selectedLoan.monthly_payment.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Próximo Pago:</span>
                    <span className="font-semibold">
                      {new Date(selectedLoan.next_payment_date).toLocaleDateString()}
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
                                RD${lateFeeAmount.toLocaleString()}
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
                          </>
                        )}
                      </div>
                    </>
                  )}
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Interés Fijo por Cuota:</span>
                  <span className="font-semibold text-orange-600">
                    RD${((selectedLoan.amount * selectedLoan.interest_rate) / 100).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Capital por Cuota:</span>
                  <span className="font-semibold text-blue-600">
                    RD${(selectedLoan.monthly_payment - ((selectedLoan.amount * selectedLoan.interest_rate) / 100)).toLocaleString()}
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
                              ${paymentStatus.currentPaymentRemaining.toLocaleString()}
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
                        <li>• Pago completo: ${(paymentStatus.currentPaymentRemaining > 0 ? paymentStatus.currentPaymentRemaining : selectedLoan.monthly_payment).toLocaleString()} o más</li>
                        <li>• Pago parcial: Menos de ${(paymentStatus.currentPaymentRemaining > 0 ? paymentStatus.currentPaymentRemaining : selectedLoan.monthly_payment).toLocaleString()}</li>
                        <li>• Máximo permitido: ${selectedLoan.remaining_balance.toLocaleString()}</li>
                        {selectedLoan.late_fee_enabled && lateFeeAmount > 0 && (
                          <li>• Mora pendiente: ${lateFeeAmount.toLocaleString()} (opcional pagar)</li>
                        )}
                      </ul>
                    </div>
                  </div>
                  
                  <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="text-sm text-blue-800">
                      <div className="font-medium mb-1">🎯 Lógica de Aplicación de Pagos:</div>
                      <ul className="text-xs space-y-1">
                        <li>• <strong>Cuota mensual:</strong> RD${selectedLoan.monthly_payment.toLocaleString()} (interés + capital)</li>
                        <li>• <strong>Interés fijo:</strong> RD${((selectedLoan.amount * selectedLoan.interest_rate) / 100).toLocaleString()} por cuota</li>
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
    </div>
  );
};
