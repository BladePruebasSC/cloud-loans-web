
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { calculateLateFee as calculateLateFeeUtil, getDetailedLateFeeBreakdown, getOriginalLateFeeBreakdown, getFixedLateFeeBreakdown, applyLateFeePayment, calculateFixedLateFeeBreakdown } from '@/utils/lateFeeCalculator';
import { getLateFeeBreakdownFromInstallments } from '@/utils/installmentLateFeeCalculator';
import { getCurrentDateInSantoDomingo, getCurrentDateString } from '@/utils/dateUtils';
import { toast } from 'sonner';
import { ArrowLeft, DollarSign, AlertTriangle } from 'lucide-react';
import { Search, User } from 'lucide-react';
import { formatCurrency, formatCurrencyNumber } from '@/lib/utils';

const paymentSchema = z.object({
  loan_id: z.string().min(1, 'Debe seleccionar un préstamo'),
  amount: z.number().min(0, 'El monto no puede ser negativo'),
  payment_method: z.string().min(1, 'Debe seleccionar un método de pago'),
  reference_number: z.string().optional(),
  notes: z.string().optional(),
  late_fee_amount: z.number().min(0).optional(),
}).refine((data) => {
  // Validar que al menos uno de los montos (cuota o mora) sea mayor a 0
  return data.amount > 0 || (data.late_fee_amount && data.late_fee_amount > 0);
}, {
  message: "Debe pagar al menos algo de la cuota o de la mora"
});

type PaymentFormData = z.infer<typeof paymentSchema>;

interface Loan {
  id: string;
  amount: number;
  remaining_balance: number;
  monthly_payment: number;
  next_payment_date: string;
  first_payment_date?: string; // Fecha de la primera cuota (BASE FIJA que nunca cambia)
  start_date?: string;
  interest_rate: number;
  term_months?: number;
  payment_frequency?: string;
  late_fee_enabled?: boolean;
  late_fee_rate?: number;
  grace_period_days?: number;
  max_late_fee?: number;
  late_fee_calculation_type?: 'daily' | 'monthly' | 'compound';
  current_late_fee?: number;
  paid_installments?: number[];
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
  const navigate = useNavigate();
  
  // Función helper para redondear a 2 decimales de forma precisa
  const roundToTwoDecimals = (value: number): number => {
    // Usar toFixed para evitar problemas de precisión de punto flotante
    return parseFloat(value.toFixed(2));
  };
  
  // Detectar si es dispositivo móvil
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
  
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
  const [lateFeeBreakdown, setLateFeeBreakdown] = useState<any>(null);
  const [originalLateFeeBreakdown, setOriginalLateFeeBreakdown] = useState<any>(null);
  const [appliedLateFeePayment, setAppliedLateFeePayment] = useState<number>(0);
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

  // Función para detectar cuotas pagadas automáticamente
  const getPaidInstallments = async (loan: Loan) => {
    try {
      console.log('🔍 PaymentForm: Detectando cuotas pagadas para loan:', loan.id);
      
      const { data: payments, error } = await supabase
        .from('payments')
        .select('principal_amount, payment_date')
        .eq('loan_id', loan.id)
        .order('payment_date', { ascending: true });

      if (error) {
        console.error('Error obteniendo pagos:', error);
        return [];
      }

      if (!payments || payments.length === 0) {
        console.log('🔍 PaymentForm: No hay pagos encontrados');
        return [];
      }

      console.log('🔍 PaymentForm: Pagos encontrados:', payments);

      // Calcular el capital por cuota (misma fórmula que LateFeeInfo)
      // Fórmula correcta: interés fijo por cuota = (monto_total * tasa_interés) / 100
      const fixedInterestPerPayment = (loan.amount * loan.interest_rate) / 100;
      const principalPerPayment = loan.monthly_payment - fixedInterestPerPayment;
      
      console.log('🔍 PaymentForm: Cálculos base:', {
        principalPerPayment,
        monthlyPayment: loan.monthly_payment,
        interestRate: loan.interest_rate,
        fixedInterestPerPayment
      });
      
      console.log('🔍 PaymentForm: DEBUG - Verificando cálculo de capital:', {
        amount: loan.amount,
        interestRate: loan.interest_rate,
        fixedInterestPerPayment: (loan.amount * loan.interest_rate) / 100,
        monthlyPayment: loan.monthly_payment,
        principalPerPayment: loan.monthly_payment - ((loan.amount * loan.interest_rate) / 100)
      });

      // Detectar cuotas completas basándose en pagos de capital (misma lógica que LateFeeInfo)
      const paidInstallments: number[] = [];
      let totalPrincipalPaid = 0;
      let installmentNumber = 1;

      for (const payment of payments) {
        const principalPaid = payment.principal_amount || 0;
        totalPrincipalPaid += principalPaid;
        
        console.log(`🔍 PaymentForm: Pago ${payment.payment_date}:`, {
          principalPaid,
          totalPrincipalPaid,
          installmentNumber,
          principalPerPayment
        });

        // Si se ha pagado suficiente capital para una cuota completa
        while (totalPrincipalPaid >= principalPerPayment && installmentNumber <= 4) {
          paidInstallments.push(installmentNumber);
          totalPrincipalPaid -= principalPerPayment;
          installmentNumber++;
          
          console.log(`🔍 PaymentForm: Cuota ${installmentNumber - 1} completada`);
          console.log(`🔍 PaymentForm: DEBUG - Estado después de completar cuota:`, {
            cuotaCompletada: installmentNumber - 1,
            totalPrincipalPaidRestante: totalPrincipalPaid,
            installmentNumberSiguiente: installmentNumber,
            paidInstallments: [...paidInstallments]
          });
        }
      }

      console.log('🔍 PaymentForm: Cuotas pagadas detectadas:', paidInstallments);
      console.log('🔍 PaymentForm: Total capital pagado:', totalPrincipalPaid);
      
      return paidInstallments;
    } catch (error) {
      console.error('Error detectando cuotas pagadas:', error);
      return [];
    }
  };

  // Función para calcular la mora del préstamo usando la función que considera pagos parciales
  const calculateLoanLateFee = async (loan: Loan) => {
    try {
      console.log('🔍 PaymentForm: Calculando mora usando getLateFeeBreakdownFromInstallments...');
      
      // Preparar los datos del préstamo para la función
      const loanData = {
        id: loan.id,
        remaining_balance: loan.remaining_balance,
        next_payment_date: loan.next_payment_date,
        late_fee_rate: loan.late_fee_rate || 0,
        grace_period_days: loan.grace_period_days || 0,
        max_late_fee: loan.max_late_fee || 0,
        late_fee_calculation_type: loan.late_fee_calculation_type || 'daily',
        late_fee_enabled: loan.late_fee_enabled || false,
        amount: loan.amount,
        term: loan.term_months || 4,
        payment_frequency: loan.payment_frequency || 'monthly',
        interest_rate: loan.interest_rate,
        monthly_payment: loan.monthly_payment,
        start_date: loan.start_date
      };
      
      console.log('🔍 PaymentForm: Datos del préstamo:', loanData);
      
      // USAR LA FUNCIÓN CORRECTA QUE CONSIDERA PAGOS PARCIALES
      const breakdown = await getLateFeeBreakdownFromInstallments(loan.id, loanData);
      
      console.log('🔍 PaymentForm: Desglose obtenido:', breakdown);
      console.log('🔍 PaymentForm: Total mora (considerando pagos parciales):', breakdown.totalLateFee);
      
      // Configurar el estado con el desglose correcto
      setOriginalLateFeeBreakdown(breakdown);
      setLateFeeAmount(roundToTwoDecimals(breakdown.totalLateFee));
      
      // Encontrar la próxima cuota pendiente de pago para mostrar sus días de atraso
      console.log('🔍 PaymentForm: Desglose completo para encontrar próxima cuota:', breakdown.breakdown);
      
      const nextUnpaidInstallment = breakdown.breakdown.find(item => !item.isPaid && item.lateFee > 0);
      console.log('🔍 PaymentForm: Próxima cuota pendiente encontrada:', nextUnpaidInstallment);
      
      const daysOverdueForNextUnpaid = nextUnpaidInstallment ? nextUnpaidInstallment.daysOverdue : 0;
      console.log('🔍 PaymentForm: Días de atraso para mostrar:', daysOverdueForNextUnpaid);
      
      setLateFeeCalculation({
        days_overdue: daysOverdueForNextUnpaid,
        late_fee_amount: breakdown.totalLateFee,
        total_late_fee: breakdown.totalLateFee
      });
      setLateFeeBreakdown(breakdown);
      
      console.log('🔍 PaymentForm: Estado actualizado correctamente');
    } catch (error) {
      console.error('Error calculating late fee:', error);
      setLateFeeAmount(0);
      setLateFeeCalculation(null);
      setLateFeeBreakdown(null);
      setOriginalLateFeeBreakdown(null);
      setAppliedLateFeePayment(0);
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
        const roundedAmount = Math.round(paymentStatus.currentPaymentRemaining);
        form.setValue('amount', roundedAmount);
        setPaymentAmount(roundedAmount);
      } else {
        // Si no hay pagos previos, usar la cuota mensual completa
        const roundedAmount = Math.round(selectedLoan.monthly_payment);
        form.setValue('amount', roundedAmount);
        setPaymentAmount(roundedAmount);
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

  // Aplicar abono de mora cuando cambie el monto
  React.useEffect(() => {
    if (selectedLoan && originalLateFeeBreakdown) {
      const lateFeeAmount = form.watch('late_fee_amount') || 0;
      if (lateFeeAmount > 0) {
        const updatedBreakdown = applyLateFeePayment(originalLateFeeBreakdown, lateFeeAmount);
        setLateFeeBreakdown(updatedBreakdown);
        setAppliedLateFeePayment(lateFeeAmount);
      } else {
        // Resetear al desglose original
        setLateFeeBreakdown(originalLateFeeBreakdown);
        setAppliedLateFeePayment(0);
      }
    }
  }, [form.watch('late_fee_amount'), originalLateFeeBreakdown, selectedLoan]);

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
    // Limpiar el desglose original para recalcular con el nuevo préstamo
    setOriginalLateFeeBreakdown(null);
    setAppliedLateFeePayment(0);
    // Calcular mora cuando se selecciona un préstamo
    calculateLoanLateFee(loan);
    // El monto se establecerá cuando se actualice el paymentStatus
  };

  const handleLoanSelect = (loanId: string) => {
    const loan = loans.find(l => l.id === loanId);
    setSelectedLoan(loan || null);
    if (loan) {
      form.setValue('loan_id', loan.id);
      // Limpiar el desglose original para recalcular con el nuevo préstamo
      setOriginalLateFeeBreakdown(null);
      setAppliedLateFeePayment(0);
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
    if (loading) {
      console.log('🔍 PaymentForm: Ya hay un pago en proceso, ignorando...');
      return;
    }

    console.log('🔍 PaymentForm: Iniciando proceso de pago...');
    setLoading(true);
    try {
      // Validaciones antes de procesar el pago
      const monthlyPayment = selectedLoan.monthly_payment;
      const remainingBalance = selectedLoan.remaining_balance;
      const currentPaymentRemaining = paymentStatus.currentPaymentRemaining;
      const interestRate = selectedLoan.interest_rate; // Tasa de interés mensual [[memory:6311805]]
      
      // Validación 1: No permitir que la cuota exceda el balance restante
      if (data.amount > remainingBalance) {
        toast.error(`El pago de cuota no puede exceder el balance restante de ${formatCurrency(remainingBalance)}`);
        return;
      }
      
      // Validación 1b: No permitir que la mora exceda la mora actual
      const roundedLateFeeAmount = roundToTwoDecimals(lateFeeAmount);
      const roundedLateFeePayment = roundToTwoDecimals(data.late_fee_amount || 0);
      if (data.late_fee_amount && roundedLateFeePayment > roundedLateFeeAmount) {
        toast.error(`El pago de mora no puede exceder la mora actual de RD$${roundedLateFeeAmount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
        return;
      }
      
      // Validación 2: No permitir pagos negativos, pero permitir 0 si hay pago de mora
      if (data.amount < 0) {
        toast.error('El monto del pago no puede ser negativo');
        return;
      }
      
      // Validación 2b: Debe haber al menos un pago (cuota o mora)
      if (data.amount <= 0 && (!data.late_fee_amount || data.late_fee_amount <= 0)) {
        toast.error('Debe pagar al menos algo de la cuota o de la mora');
        return;
      }

      // Validación 3: No permitir pagos que excedan lo que falta de la cuota actual (solo si hay pago de cuota)
      if (data.amount > 0) {
        const maxAllowedPayment = currentPaymentRemaining > 0 ? currentPaymentRemaining : monthlyPayment;
        const roundedMaxAllowed = Math.round(maxAllowedPayment);
        if (data.amount > roundedMaxAllowed) {
          toast.error(`El pago de cuota no puede exceder lo que falta de la cuota actual: ${formatCurrency(roundedMaxAllowed)}`);
          return;
        }
      }

      // Calcular la distribución del pago considerando pagos previos (solo si hay pago de cuota)
      let distribution = { interestPayment: 0, principalPayment: 0, remainingInterest: 0 };
      let isFullPayment = false;
      let paymentStatusValue = 'pending';
      let interestPayment = 0;
      let principalPayment = 0;
      let remainingInterest = 0;
      
      if (data.amount > 0) {
        distribution = await calculatePaymentDistribution(Math.round(data.amount));
        interestPayment = distribution.interestPayment;
        principalPayment = distribution.principalPayment;
        remainingInterest = distribution.remainingInterest;
        
        // Determinar si es un pago completo o parcial
        const maxAllowedPayment = currentPaymentRemaining > 0 ? currentPaymentRemaining : monthlyPayment;
        const roundedMaxAllowed = Math.round(maxAllowedPayment);
        isFullPayment = Math.round(data.amount) >= roundedMaxAllowed;
        paymentStatusValue = isFullPayment ? 'completed' : 'pending';
        
        // Si es pago parcial, mostrar advertencia
        if (!isFullPayment) {
          const remainingAmount = roundedMaxAllowed - Math.round(data.amount);
          toast.warning(`Pago parcial registrado. Queda pendiente ${formatCurrency(remainingAmount)} de la cuota mensual.`);
        }

        // Mostrar información sobre la distribución del pago
        const distributionMessage = principalPayment > 0 
          ? `Pago aplicado: ${formatCurrency(interestPayment)} al interés, ${formatCurrency(principalPayment)} al capital`
          : `Pago aplicado: ${formatCurrency(interestPayment)} al interés (pendiente interés: ${formatCurrency(remainingInterest - interestPayment)})`;
        
        toast.info(distributionMessage);
      } else {
        // Solo pago de mora, no hay distribución de cuota
        const lateFeeAmount = roundToTwoDecimals(data.late_fee_amount || 0);
        toast.info(`Pago de mora registrado: RD$${lateFeeAmount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      }

      // CORREGIR: Crear fecha y hora correcta para Santo Domingo
      const now = new Date();
      
      // Crear fecha en zona horaria de Santo Domingo usando Intl.DateTimeFormat
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
      const hour = parts.find(part => part.type === 'hour')?.value;
      const minute = parts.find(part => part.type === 'minute')?.value;
      const second = parts.find(part => part.type === 'second')?.value;
      
      // Crear fecha local en Santo Domingo
      const santoDomingoDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
      const paymentDate = `${year}-${month}-${day}`; // YYYY-MM-DD
      
      // Crear timestamp con zona horaria local (sin conversión UTC)
      const paymentTimeLocal = santoDomingoDate.toISOString();
      const paymentTimezone = 'America/Santo_Domingo';
      
      console.log('🔍 PaymentForm: DEBUGGING HORA LOCAL:', {
        nowUTC: now.toISOString(),
        nowLocal: now.toLocaleString('es-DO', { timeZone: 'America/Santo_Domingo' }),
        santoDomingoDate: santoDomingoDate.toISOString(),
        santoDomingoLocal: santoDomingoDate.toLocaleString('es-DO', { timeZone: 'America/Santo_Domingo' }),
        paymentDate,
        paymentTimeLocal,
        paymentTimezone,
        parts: { year, month, day, hour, minute, second }
      });
      
      const paymentData = {
        loan_id: data.loan_id,
        amount: Math.round(data.amount), // Solo el monto de la cuota, sin incluir la mora (redondeado)
        principal_amount: Math.round(principalPayment),
        interest_amount: Math.round(interestPayment),
        late_fee: roundToTwoDecimals(data.late_fee_amount || 0), // Mora como concepto separado (redondeado a 2 decimales)
        due_date: selectedLoan.next_payment_date,
        payment_date: paymentDate, // Usar fecha actual en zona horaria de Santo Domingo
        payment_time_local: paymentTimeLocal, // Timestamp con zona horaria local
        payment_timezone: paymentTimezone, // Zona horaria del pago
        payment_method: data.payment_method,
        reference_number: data.reference_number,
        notes: data.notes,
        status: paymentStatusValue,
        created_by: user?.id || companyId, // Usar el user_id del usuario actual, o companyId como respaldo
      };
      
      console.log('🔍 PaymentForm: Datos del pago que se enviarán:', paymentData);

      // Sin verificación de duplicados - permitir cualquier pago

      const { data: insertedPayment, error: paymentError } = await supabase
        .from('payments')
        .insert([paymentData])
        .select();

      if (paymentError) {
        console.error('🔍 PaymentForm: Error insertando pago:', paymentError);
        throw paymentError;
      }
      
      console.log('🔍 PaymentForm: Pago insertado exitosamente:', insertedPayment);

      // Si se pagó mora, actualizar el campo late_fee_paid en las cuotas afectadas
      if (data.late_fee_amount && data.late_fee_amount > 0 && lateFeeBreakdown) {
        console.log('🔍 PaymentForm: Distribuyendo pago de mora entre cuotas...');
        let remainingLateFeePayment = data.late_fee_amount;
        
        // Obtener TODAS las cuotas del préstamo (no solo las del desglose actual)
        const { data: allInstallments, error: installmentsError } = await supabase
          .from('installments')
          .select('installment_number, late_fee_paid, is_paid, due_date, principal_amount')
          .eq('loan_id', data.loan_id)
          .order('installment_number', { ascending: true });
        
        if (installmentsError) {
          console.error('Error obteniendo cuotas:', installmentsError);
        } else {
          console.log('🔍 PaymentForm: Todas las cuotas obtenidas:', allInstallments);
          
          // Procesar solo las cuotas que NO están pagadas y tienen mora
          for (const installment of allInstallments || []) {
            if (remainingLateFeePayment <= 0) break;
            if (installment.is_paid) continue; // Saltar cuotas ya pagadas
            
            const currentLateFeePaid = installment.late_fee_paid || 0;
            
            // Calcular la mora total de esta cuota (sin considerar pagos previos)
            const dueDate = new Date(installment.due_date);
            const calculationDate = getCurrentDateInSantoDomingo();
            const daysSinceDue = Math.floor((calculationDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
            const daysOverdue = Math.max(0, daysSinceDue - (selectedLoan.grace_period_days || 0));
            
            let totalLateFeeForThisInstallment = 0;
            if (daysOverdue > 0) {
              switch (selectedLoan.late_fee_calculation_type) {
                case 'daily':
                  totalLateFeeForThisInstallment = (installment.principal_amount * selectedLoan.late_fee_rate / 100) * daysOverdue;
                  break;
                case 'monthly':
                  const monthsOverdue = Math.ceil(daysOverdue / 30);
                  totalLateFeeForThisInstallment = (installment.principal_amount * selectedLoan.late_fee_rate / 100) * monthsOverdue;
                  break;
                case 'compound':
                  totalLateFeeForThisInstallment = installment.principal_amount * (Math.pow(1 + selectedLoan.late_fee_rate / 100, daysOverdue) - 1);
                  break;
                default:
                  totalLateFeeForThisInstallment = (installment.principal_amount * selectedLoan.late_fee_rate / 100) * daysOverdue;
              }
              
              if (selectedLoan.max_late_fee && selectedLoan.max_late_fee > 0) {
                totalLateFeeForThisInstallment = Math.min(totalLateFeeForThisInstallment, selectedLoan.max_late_fee);
              }
              
              totalLateFeeForThisInstallment = Math.round(totalLateFeeForThisInstallment * 100) / 100;
            }
            
            // Calcular cuánta mora queda por pagar en esta cuota
            const remainingLateFeeForThisInstallment = Math.max(0, totalLateFeeForThisInstallment - currentLateFeePaid);
            
            console.log(`🔍 PaymentForm: Cuota ${installment.installment_number}:`, {
              totalLateFeeForThisInstallment,
              currentLateFeePaid,
              remainingLateFeeForThisInstallment,
              remainingLateFeePayment,
              daysOverdue
            });
            
            // Solo aplicar pago si queda mora pendiente en esta cuota
            if (remainingLateFeeForThisInstallment > 0) {
              const moraToPay = Math.min(remainingLateFeePayment, remainingLateFeeForThisInstallment);
              const newLateFeePaid = currentLateFeePaid + moraToPay;
              
              console.log(`🔍 PaymentForm: Aplicando pago a cuota ${installment.installment_number}:`, {
                moraToPay,
                currentLateFeePaid,
                newLateFeePaid
              });
              
              // Actualizar el campo late_fee_paid de esta cuota
              const { error: updateError } = await supabase
                .from('installments')
                .update({ late_fee_paid: newLateFeePaid })
                .eq('loan_id', data.loan_id)
                .eq('installment_number', installment.installment_number);
              
              if (updateError) {
                console.error(`Error actualizando late_fee_paid para cuota ${installment.installment_number}:`, updateError);
              } else {
                console.log(`✅ Cuota ${installment.installment_number}: late_fee_paid actualizado de ${currentLateFeePaid} a ${newLateFeePaid}`);
              }
              
              remainingLateFeePayment -= moraToPay;
            }
          }
        }
        
        if (remainingLateFeePayment > 0) {
          console.log(`⚠️ PaymentForm: Quedó mora sin aplicar: ${formatCurrency(remainingLateFeePayment)}`);
        }
        
        console.log('🔍 PaymentForm: Distribución de mora completada');
      }

      // CORREGIR: El balance se reduce por el pago completo (capital + interés), no solo por el capital
      const newBalance = Math.max(0, remainingBalance - Math.round(data.amount));
      
      // Solo actualizar la fecha del próximo pago si es un pago completo
      let nextPaymentDate = selectedLoan.next_payment_date;
      let updatedPaidInstallments = selectedLoan.paid_installments || [];

      if (isFullPayment) {
        // CORRECCIÓN: next_payment_date representa la PRÓXIMA cuota pendiente
        // Se actualiza sumando un período de pago según la frecuencia
        const nextDate = new Date(selectedLoan.next_payment_date);

        // Ajustar según la frecuencia de pago
        switch (selectedLoan.payment_frequency) {
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

        nextPaymentDate = nextDate.toISOString().split('T')[0];

        // CORRECCIÓN FUNDAMENTAL: Marcar la PRIMERA cuota NO pagada
        // NO calcular basándose en fechas, sino en el array paid_installments

        // Encontrar la primera cuota NO pagada (de 1 a term_months)
        const totalInstallments = selectedLoan.term_months || 4;
        let firstUnpaidInstallment = null;

        for (let i = 1; i <= totalInstallments; i++) {
          if (!updatedPaidInstallments.includes(i)) {
            firstUnpaidInstallment = i;
            break;
          }
        }

        if (firstUnpaidInstallment) {
          // Agregar esta cuota a las pagadas
          updatedPaidInstallments.push(firstUnpaidInstallment);
          updatedPaidInstallments.sort((a, b) => a - b); // Mantener ordenado

          console.log('🔍 PaymentForm: Cuota marcada como pagada:', {
            paidInstallment: firstUnpaidInstallment,
            updatedPaidInstallments,
            totalInstallments
          });

          // Marcar la cuota como pagada en la tabla installments y resetear late_fee_paid
          const { error: installmentError } = await supabase
            .from('installments')
            .update({
              is_paid: true,
              paid_date: new Date().toISOString().split('T')[0],
              late_fee_paid: 0 // Resetear mora pagada cuando se marca como pagada
            })
            .eq('loan_id', data.loan_id)
            .eq('installment_number', firstUnpaidInstallment);

          if (installmentError) {
            console.error('Error marcando cuota como pagada en installments:', installmentError);
          } else {
            console.log(`✅ Cuota ${firstUnpaidInstallment} marcada como pagada en la tabla installments`);
          }
        } else {
          console.log('⚠️ No se encontró ninguna cuota sin pagar para marcar');
        }
      }

      // La mora se recalculará automáticamente usando calculateLateFee
      // No restamos manualmente el abono de mora para evitar acumulación incorrecta

      console.log('🔍 PaymentForm: Actualizando préstamo con:', {
        loanId: data.loan_id,
        newBalance,
        nextPaymentDate,
        status: newBalance <= 0 ? 'paid' : 'active'
      });

      // Preparar datos de actualización del préstamo
      const loanUpdateData: any = {
        remaining_balance: newBalance,
        next_payment_date: nextPaymentDate,
        status: newBalance <= 0 ? 'paid' : 'active',
        paid_installments: updatedPaidInstallments,
      };

      // Si se pagó mora, actualizar el campo total_late_fee_paid
      if (data.late_fee_amount && data.late_fee_amount > 0) {
        const { data: currentLoan, error: loanError } = await supabase
          .from('loans')
          .select('total_late_fee_paid')
          .eq('id', data.loan_id)
          .single();

        if (!loanError && currentLoan) {
          const currentTotalPaid = currentLoan.total_late_fee_paid || 0;
          loanUpdateData.total_late_fee_paid = currentTotalPaid + data.late_fee_amount;
          console.log('🔍 PaymentForm: Actualizando total_late_fee_paid:', {
            anterior: currentTotalPaid,
            pago: data.late_fee_amount,
            nuevo: loanUpdateData.total_late_fee_paid
          });
        }
      }

      const { data: updatedLoan, error: loanError } = await supabase
        .from('loans')
        .update(loanUpdateData)
        .eq('id', data.loan_id)
        .select();

      if (loanError) {
        console.error('🔍 PaymentForm: Error actualizando préstamo:', loanError);
        throw loanError;
      }
      
      console.log('🔍 PaymentForm: Préstamo actualizado exitosamente:', updatedLoan);

      let successMessage = isFullPayment 
        ? 'Pago completo registrado exitosamente' 
        : 'Pago parcial registrado exitosamente';
      
      if (data.late_fee_amount && data.late_fee_amount > 0) {
        const lateFeeAmount = roundToTwoDecimals(data.late_fee_amount);
        successMessage += ` + Mora de RD$${lateFeeAmount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      }
      
      console.log('🔍 PaymentForm: Resumen del pago registrado:', {
        cuotaPagada: data.amount,
        capitalPagado: principalPayment,
        interesPagado: interestPayment,
        moraPagada: data.late_fee_amount || 0,
        balanceAnterior: remainingBalance,
        balanceNuevo: newBalance
      });
      
      toast.success(successMessage);
      
      // Recalcular automáticamente la mora después del pago usando la función correcta
      try {
        console.log('🔍 PaymentForm: Recalculando mora después del pago...');
        
        // Preparar los datos actualizados del préstamo
        const updatedLoanData = {
          id: data.loan_id,
          remaining_balance: newBalance,
          next_payment_date: nextPaymentDate,
          late_fee_rate: selectedLoan.late_fee_rate || 0,
          grace_period_days: selectedLoan.grace_period_days || 0,
          max_late_fee: selectedLoan.max_late_fee || 0,
          late_fee_calculation_type: selectedLoan.late_fee_calculation_type || 'daily',
          late_fee_enabled: selectedLoan.late_fee_enabled || false,
          amount: selectedLoan.amount,
          term: selectedLoan.term_months || 4,
          payment_frequency: selectedLoan.payment_frequency || 'monthly',
          interest_rate: selectedLoan.interest_rate,
          monthly_payment: selectedLoan.monthly_payment,
          start_date: selectedLoan.start_date
        };
        
        // USAR LA FUNCIÓN CORRECTA QUE CONSIDERA PAGOS PARCIALES
        console.log('🔍 PaymentForm: Recalculando con getLateFeeBreakdownFromInstallments...');
        const updatedBreakdown = await getLateFeeBreakdownFromInstallments(data.loan_id, updatedLoanData);
        
        console.log('🔍 PaymentForm: Desglose actualizado después del pago:', updatedBreakdown);
        
        // Actualizar la mora en la base de datos con el resultado correcto
        const { error: lateFeeError } = await supabase
          .from('loans')
          .update({ 
            current_late_fee: updatedBreakdown.totalLateFee,
            last_late_fee_calculation: new Date().toISOString().split('T')[0]
          })
          .eq('id', data.loan_id);
          
        if (lateFeeError) {
          console.error('Error actualizando mora:', lateFeeError);
        } else {
          console.log('🔍 PaymentForm: Mora recalculada exitosamente considerando pagos parciales:', updatedBreakdown.totalLateFee);
        }
      } catch (error) {
        console.error('Error recalculando mora:', error);
      }
      
      // Actualizar el estado del pago
      await refetchPaymentStatus();
      
      // Llamar al callback para actualizar los datos del padre
      if (onPaymentSuccess) {
        onPaymentSuccess();
      }
      
      // Si es móvil, redirigir a Cobro Rápido
      if (isMobile) {
        toast.success('Redirigiendo a Cobro Rápido...');
        setTimeout(() => {
          navigate('/cobro-rapido');
        }, 1000);
      } else {
      onBack();
      }
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
                                {loan.client?.dni} • Balance: ${formatCurrencyNumber(loan.remaining_balance)}
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
                                ${formatCurrencyNumber(selectedLoan.remaining_balance)}
                              </div>
                            </div>
                            <div>
                              <span className="font-medium text-gray-600">Próximo Pago:</span>
                              <div className="text-sm">
                                {selectedLoan.next_payment_date}
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
              📊 Distribución del Pago (${formatCurrency(paymentAmount)})
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-green-700">Interés fijo por cuota:</span>
                <span className="font-semibold">{formatCurrency(paymentDistribution.monthlyInterestAmount)}</span>
              </div>
              {paymentDistribution.alreadyPaidInterest > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-green-700">Interés ya pagado:</span>
                  <span className="font-semibold text-gray-600">{formatCurrency(paymentDistribution.alreadyPaidInterest)}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-green-700">Interés pendiente:</span>
                <span className="font-semibold text-orange-600">{formatCurrency(paymentDistribution.remainingInterest)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-green-700">Se aplica al interés:</span>
                <span className="font-semibold text-orange-600">{formatCurrency(paymentDistribution.interestPayment)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-green-700">Se aplica al capital:</span>
                <span className="font-semibold text-blue-600">{formatCurrency(paymentDistribution.principalPayment)}</span>
              </div>
              {paymentDistribution.interestPayment < paymentDistribution.remainingInterest && (
                <div className="mt-2 p-2 bg-yellow-100 border border-yellow-300 rounded text-xs text-yellow-800">
                  ⚠️ Pago parcial al interés. Queda pendiente: {formatCurrency(paymentDistribution.remainingInterest - paymentDistribution.interestPayment)}
                </div>
              )}
              {paymentDistribution.principalPayment > 0 && (
                <div className="mt-2 p-2 bg-blue-100 border border-blue-300 rounded text-xs text-blue-800">
                  ✅ El balance del préstamo se reducirá en {formatCurrency(paymentDistribution.principalPayment)}
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
                <span className="font-semibold">{formatCurrency(paymentAmount)}</span>
              </div>
              {form.watch('late_fee_amount') && form.watch('late_fee_amount') > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-blue-700">Pago de mora:</span>
                  <span className="font-semibold text-orange-600">RD${roundToTwoDecimals(form.watch('late_fee_amount') || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              )}
              <div className="border-t pt-2 flex justify-between items-center">
                <span className="text-blue-800 font-medium">Total a pagar:</span>
                <span className="font-bold text-lg text-blue-800">
                  {formatCurrency(paymentAmount + (form.watch('late_fee_amount') || 0))}
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
                                const roundedValue = roundToTwoDecimals(numValue);
                                field.onChange(roundedValue);
                                setPaymentAmount(roundedValue);
                                
                                // Calcular distribución en tiempo real
                                if (selectedLoan && roundedValue > 0) {
                                  const distribution = await calculatePaymentDistribution(roundedValue);
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

                    {/* Campo para pago de mora - siempre mostrar si hay mora habilitada */}
                    {selectedLoan?.late_fee_enabled && (
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
                                  max={roundToTwoDecimals(lateFeeAmount)}
                                  placeholder="0.00"
                                  {...field}
                                  value={field.value || ''}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    const numValue = value === '' ? 0 : parseFloat(value) || 0;
                                    const roundedValue = roundToTwoDecimals(numValue);
                                    field.onChange(roundedValue);
                                  }}
                                />
                              </FormControl>
                              {lateFeeAmount > 0 && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => field.onChange(roundToTwoDecimals(lateFeeAmount))}
                                className="whitespace-nowrap"
                              >
                                Pagar Toda
                              </Button>
                              )}
                            </div>
                            {lateFeeAmount > 0 ? (
                            <div className="text-xs text-orange-600 mt-1">
                              💡 Mora pendiente: RD${lateFeeAmount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </div>
                            ) : (
                              <div className="text-xs text-green-600 mt-1">
                                ✅ No hay mora pendiente
                              </div>
                            )}
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
                      ${formatCurrencyNumber(selectedLoan.remaining_balance)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Cuota Mensual:</span>
                    <span className="font-semibold">
                      ${formatCurrencyNumber(selectedLoan.monthly_payment)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Próximo Pago:</span>
                    <span className="font-semibold">
                      {selectedLoan.next_payment_date}
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
                                RD${lateFeeAmount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                            
                            {/* Tabla de desglose de mora por cuota */}
                            {lateFeeBreakdown && lateFeeBreakdown.breakdown && lateFeeBreakdown.breakdown.length > 0 && (
                              <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                                <div className="text-sm font-medium text-orange-800 mb-2">
                                  📊 Desglose de Mora por Cuota
                                </div>
                                <div className="space-y-1">
                                  {lateFeeBreakdown.breakdown.map((item: any, index: number) => (
                                    <div key={index} className={`flex justify-between items-center text-xs ${item.isPaid ? 'bg-green-100 border border-green-300 rounded px-2 py-1' : ''}`}>
                                      <span className={`text-orange-700 ${item.isPaid ? 'text-green-700' : ''}`}>
                                        Cuota {item.installment} ({item.daysOverdue} días):
                                        {item.isPaid && ' ✅ PAGADA'}
                                      </span>
                                      <span className={`font-semibold ${item.isPaid ? 'text-green-700' : 'text-orange-800'}`}>
                                        RD${item.lateFee.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </span>
                                    </div>
                                  ))}
                                  <div className="border-t pt-1 mt-2 flex justify-between items-center font-bold text-orange-900">
                                    <span>Total Mora Pendiente:</span>
                                    <span>RD${lateFeeBreakdown.totalLateFee.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                                  </div>
                                </div>
                                 <div className="mt-2 text-xs text-gray-600">
                                   💡 Solo se muestran las cuotas pendientes de pago
                                 </div>
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
                    {formatCurrency((selectedLoan.amount * selectedLoan.interest_rate) / 100)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Capital por Cuota:</span>
                  <span className="font-semibold text-blue-600">
                    {formatCurrency(selectedLoan.monthly_payment - ((selectedLoan.amount * selectedLoan.interest_rate) / 100))}
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
                              ${formatCurrencyNumber(paymentStatus.currentPaymentRemaining)}
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
                        <li>• Pago completo: ${formatCurrencyNumber(paymentStatus.currentPaymentRemaining > 0 ? paymentStatus.currentPaymentRemaining : selectedLoan.monthly_payment)} o más</li>
                        <li>• Pago parcial: Menos de ${formatCurrencyNumber(paymentStatus.currentPaymentRemaining > 0 ? paymentStatus.currentPaymentRemaining : selectedLoan.monthly_payment)}</li>
                        <li>• Máximo permitido: ${formatCurrencyNumber(selectedLoan.remaining_balance)}</li>
                        {selectedLoan.late_fee_enabled && lateFeeAmount > 0 && (
                          <li>• Mora pendiente: ${lateFeeAmount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (opcional pagar)</li>
                        )}
                      </ul>
                    </div>
                  </div>
                  
                  <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="text-sm text-blue-800">
                      <div className="font-medium mb-1">🎯 Lógica de Aplicación de Pagos:</div>
                      <ul className="text-xs space-y-1">
                        <li>• <strong>Cuota mensual:</strong> {formatCurrency(selectedLoan.monthly_payment)} (interés + capital)</li>
                        <li>• <strong>Interés fijo:</strong> {formatCurrency((selectedLoan.amount * selectedLoan.interest_rate) / 100)} por cuota</li>
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
