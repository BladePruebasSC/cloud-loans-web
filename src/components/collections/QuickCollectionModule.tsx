import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
// El rediseño usa contenedores propios (`rounded-xl border bg-white`) en vez de `Card`: la
// pantalla es una sola columna de bloques y `Card` añadía un nivel de anidamiento y una
// cabecera con título que aquí solo repetía lo evidente.
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLoanPaymentStatusSimple } from '@/hooks/useLoanPaymentStatusSimple';
import { getLateFeeBreakdownFromInstallments } from '@/utils/installmentLateFeeCalculator';
import { getCurrentDateInSantoDomingo, getCurrentDateStringForSantoDomingo } from '@/utils/dateUtils';
import { getLateFeePeriodDays } from '@/utils/frequencyUtils';
import { toast } from 'sonner';
import {
  Search,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Smartphone,
  Printer,
  X
} from 'lucide-react';
import { formatCurrency, formatCurrencyNumber } from '@/lib/utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { generateLoanPaymentReceipt, openWhatsApp } from '@/utils/whatsappReceipt';
import { formatDateStringForSantoDomingo } from '@/utils/dateUtils';
import { MessageCircle } from 'lucide-react';

const paymentSchema = z.object({
  loan_id: z.string().min(1, 'Debe seleccionar un préstamo'),
  amount: z.number().min(0, 'El monto no puede ser negativo'),
  payment_method: z.string().min(1, 'Debe seleccionar un método de pago'),
  late_fee_amount: z.number().min(0).optional(),
}).refine((data) => {
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
  interest_rate: number;
  late_fee_enabled?: boolean;
  late_fee_rate?: number;
  grace_period_days?: number;
  max_late_fee?: number;
  late_fee_calculation_type?: 'daily' | 'monthly' | 'compound';
  // Necesarios para calcular la mora igual que el resto del sistema (ver nota en la consulta)
  term_months?: number;
  payment_frequency?: string;
  amortization_type?: string;
  start_date?: string;
  client: {
    full_name: string;
    dni: string;
    // El recibo de WhatsApp lee `client.phone`; faltaba en el tipo.
    phone?: string;
  };
}

export const QuickCollectionModule = () => {
  const [isMobile, setIsMobile] = useState(false);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [filteredLoans, setFilteredLoans] = useState<Loan[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const [showLoanList, setShowLoanList] = useState(false);
  const [loading, setLoading] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [lateFeeAmount, setLateFeeAmount] = useState<number>(0);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showWhatsAppDialog, setShowWhatsAppDialog] = useState(false);
  const [lastPayment, setLastPayment] = useState<any>(null);
  const [companySettings, setCompanySettings] = useState<any>(null);
  const { user, companyId } = useAuth();
  const { paymentStatus, refetch: refetchPaymentStatus } = useLoanPaymentStatusSimple(selectedLoan);

  const form = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      payment_method: 'cash',
    },
  });

  // Detectar si es dispositivo móvil
  useEffect(() => {
    const checkMobile = () => {
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 768;
      setIsMobile(isMobileDevice);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Cargar préstamos activos
  useEffect(() => {
    if (user && companyId && isMobile) {
      fetchActiveLoans();
      fetchCompanySettings();
    }
  }, [user, companyId, isMobile]);

  // Obtener datos de la empresa
  const fetchCompanySettings = async () => {
    if (!companyId) return;
    
    try {
      const { data, error } = await supabase
        .from('company_settings')
        .select('*')
        .eq('user_id', companyId)
        .maybeSingle();
      
      if (error) {
        console.error('Error obteniendo datos de la empresa:', error);
        return;
      }
      
      if (data) {
        setCompanySettings(data);
      }
    } catch (error) {
      console.error('Error obteniendo datos de la empresa:', error);
    }
  };

  // Filtrar préstamos cuando cambia el término de búsqueda
  useEffect(() => {
    if (searchTerm.length === 0) {
      setFilteredLoans([]);
      setShowLoanList(false);
      return;
    }

    const filtered = loans.filter(loan =>
      loan.client?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      loan.client?.dni?.includes(searchTerm)
    );
    
    setFilteredLoans(filtered);
    setShowLoanList(filtered.length > 0);
  }, [searchTerm, loans]);

  // Calcular mora cuando se selecciona un préstamo
  useEffect(() => {
    if (selectedLoan) {
      calculateLoanLateFee(selectedLoan);
    }
  }, [selectedLoan]);

  // Pre-llenar monto de pago cuando cambia el paymentStatus
  useEffect(() => {
    if (selectedLoan && paymentStatus.currentPaymentRemaining !== undefined) {
      const amount = paymentStatus.currentPaymentRemaining > 0 
        ? paymentStatus.currentPaymentRemaining 
        : selectedLoan.monthly_payment;
      setPaymentAmount(Math.round(amount));
      form.setValue('amount', Math.round(amount));
      form.setValue('loan_id', selectedLoan.id);
    }
  }, [selectedLoan, paymentStatus.currentPaymentRemaining, form]);

  // Restringir acceso si no es móvil - DESPUÉS de todos los hooks
  if (!isMobile) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center p-6">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
            <Smartphone className="h-7 w-7 text-slate-500" />
          </div>
          <h2 className="text-lg font-semibold text-slate-900">Cobro Rápido es para el móvil</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Está pensado para cobrar en la calle, con una mano y sin buscar nada. Ábrelo desde
            el teléfono o la tableta.
          </p>
          <p className="mt-4 text-sm text-slate-500">
            Desde el escritorio, usa <strong className="font-medium text-slate-700">Préstamos → Registrar Pago</strong>.
          </p>
          <Button variant="outline" className="mt-6 w-full" onClick={() => window.history.back()}>
            Volver
          </Button>
        </div>
      </div>
    );
  }

  const fetchActiveLoans = async () => {
    if (!user || !companyId) return;

    try {
      // CORRECCIÓN (auditoría 2026-08-28): esta consulta no traía `term_months`,
      // `payment_frequency`, `amortization_type` ni `start_date`. Por eso el cálculo de mora de
      // este módulo terminó pasando valores fijos inventados ('monthly', plazo 4,
      // next_payment_date como fecha de inicio). Sin estos campos era imposible que la mora
      // coincidiera con la del detalle del préstamo o el estado de cuenta.
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
          term_months,
          payment_frequency,
          amortization_type,
          start_date,
          clients (
            full_name,
            dni
          )
        `)
        .in('status', ['active', 'overdue'])
        .eq('loan_officer_id', companyId)
        .order('next_payment_date');

      if (error) throw error;

      const transformedLoans = (data || []).map(loan => ({
        ...loan,
        client: {
          full_name: (loan.clients as any)?.full_name || '',
          dni: (loan.clients as any)?.dni || ''
        }
      }));

      setLoans(transformedLoans);
    } catch (error) {
      console.error('Error fetching loans:', error);
      toast.error('Error al cargar préstamos');
    }
  };

  const calculateLoanLateFee = async (loan: Loan) => {
    try {
      // CORRECCIÓN CRÍTICA (auditoría 2026-08-28): este módulo pasaba al motor de mora unos
      // datos INVENTADOS en vez de los del préstamo:
      //   - `term: 4` fijo (el plazo real no se usaba),
      //   - `payment_frequency: 'monthly'` fijo (un préstamo diario o quincenal se calculaba
      //      como si fuera mensual),
      //   - `start_date: loan.next_payment_date` (¡la fecha del próximo pago usada como fecha
      //      de inicio del préstamo!), lo que en préstamos indefinidos hace que la generación
      //      dinámica de cuotas arranque desde una fecha equivocada y se pierdan períodos,
      //   - y NO enviaba `amortization_type`, así que todo préstamo indefinido se calculaba
      //      con la lógica de plazo fijo.
      // Consecuencia: la mora mostrada en "Cobro Rápido" no coincidía con la del detalle del
      // préstamo ni con la del estado de cuenta, y era la que se cobraba realmente al cliente.
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
        term: (loan as any).term_months || 0,
        payment_frequency: (loan as any).payment_frequency || 'monthly',
        interest_rate: loan.interest_rate,
        monthly_payment: loan.monthly_payment,
        start_date: (loan as any).start_date || loan.next_payment_date,
        amortization_type: (loan as any).amortization_type
      };

      const breakdown = await getLateFeeBreakdownFromInstallments(loan.id, loanData);
      setLateFeeAmount(breakdown.totalLateFee);
    } catch (error) {
      console.error('Error calculating late fee:', error);
      setLateFeeAmount(0);
    }
  };

  const selectLoan = (loan: Loan) => {
    setSelectedLoan(loan);
    setSearchTerm(`${loan.client?.full_name} - ${loan.client?.dni}`);
    setShowLoanList(false);
    setShowPaymentForm(true);
  };

  // Función para obtener el label del método de pago en español
  const getPaymentMethodLabel = (method: string) => {
    const methods: { [key: string]: string } = {
      cash: 'Efectivo',
      bank_transfer: 'Transferencia Bancaria',
      check: 'Cheque',
      card: 'Tarjeta',
      online: 'Pago en línea'
    };
    return methods[method] || method;
  };

  const calculatePaymentDistribution = async (amount: number) => {
    if (!selectedLoan || amount <= 0) {
      return { interestPayment: 0, principalPayment: 0 };
    }

    const fixedInterestPerPayment = (selectedLoan.amount * selectedLoan.interest_rate) / 100;
    
    // Obtener pagos previos para calcular interés ya pagado
    const { data: payments } = await supabase
      .from('payments')
      .select('interest_amount, principal_amount')
      .eq('loan_id', selectedLoan.id)
      .order('payment_date', { ascending: true });

    let totalInterestPaid = 0;
    let totalPrincipalPaid = 0;
    const monthlyPayment = selectedLoan.monthly_payment;
    const fixedPrincipalPerPayment = monthlyPayment - fixedInterestPerPayment;
    let completedInstallments = 0;
    let currentInstallmentInterestPaid = 0;
    let currentInstallmentPrincipalPaid = 0;

    for (const payment of payments || []) {
      const paymentInterest = payment.interest_amount || 0;
      const paymentPrincipal = payment.principal_amount || 0;
      
      totalInterestPaid += paymentInterest;
      totalPrincipalPaid += paymentPrincipal;
      
      const newInterestPaid = currentInstallmentInterestPaid + paymentInterest;
      const newPrincipalPaid = currentInstallmentPrincipalPaid + paymentPrincipal;
      
      if (newInterestPaid >= fixedInterestPerPayment && newPrincipalPaid >= fixedPrincipalPerPayment) {
        completedInstallments++;
        currentInstallmentInterestPaid = 0;
        currentInstallmentPrincipalPaid = 0;
      } else {
        currentInstallmentInterestPaid = Math.min(newInterestPaid, fixedInterestPerPayment);
        currentInstallmentPrincipalPaid = Math.min(newPrincipalPaid, fixedPrincipalPerPayment);
      }
    }

    const remainingInterest = Math.max(0, fixedInterestPerPayment - currentInstallmentInterestPaid);
    
    let interestPayment = 0;
    let principalPayment = 0;
    
    if (amount <= remainingInterest) {
      interestPayment = amount;
      principalPayment = 0;
    } else {
      interestPayment = remainingInterest;
      principalPayment = amount - remainingInterest;
    }
    
    return { interestPayment, principalPayment };
  };

  const onSubmit = async (data: PaymentFormData) => {
    if (!user || !companyId || !selectedLoan) return;

    if (loading) return;

    setLoading(true);
    try {
      // Validaciones
      if (data.amount > selectedLoan.remaining_balance) {
        toast.error(`El pago no puede exceder el balance de ${formatCurrency(selectedLoan.remaining_balance)}`);
        setLoading(false);
        return;
      }

      if (data.late_fee_amount && data.late_fee_amount > lateFeeAmount) {
        toast.error(`La mora no puede exceder ${formatCurrency(lateFeeAmount)}`);
        setLoading(false);
        return;
      }

      // Calcular distribución del pago
      const distribution = await calculatePaymentDistribution(Math.round(data.amount));
      const interestPayment = distribution.interestPayment;
      const principalPayment = distribution.principalPayment;

      // Crear fecha en zona horaria de Santo Domingo
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
      const hour = parts.find(part => part.type === 'hour')?.value;
      const minute = parts.find(part => part.type === 'minute')?.value;
      const second = parts.find(part => part.type === 'second')?.value;
      
      const santoDomingoDate = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}`);
      const paymentDate = `${year}-${month}-${day}`;
      const paymentTimeLocal = santoDomingoDate.toISOString();
      const paymentTimezone = 'America/Santo_Domingo';

      // Determinar si es pago completo
      const maxAllowedPayment = paymentStatus.currentPaymentRemaining > 0 
        ? paymentStatus.currentPaymentRemaining 
        : selectedLoan.monthly_payment;
      const isFullPayment = Math.round(data.amount) >= Math.round(maxAllowedPayment);
      const paymentStatusValue = isFullPayment ? 'completed' : 'pending';

      const paymentData = {
        loan_id: data.loan_id,
        amount: Math.round(data.amount),
        principal_amount: Math.round(principalPayment),
        interest_amount: Math.round(interestPayment),
        late_fee: Math.round(data.late_fee_amount || 0),
        due_date: selectedLoan.next_payment_date,
        payment_date: paymentDate,
        payment_time_local: paymentTimeLocal,
        payment_timezone: paymentTimezone,
        payment_method: data.payment_method,
        notes: `Cobro rápido - ${getPaymentMethodLabel(data.payment_method)}`,
        status: paymentStatusValue,
        created_by: companyId,
        company_id: companyId,
      };

      const { data: insertedPayment, error: paymentError } = await supabase
        .from('payments')
        .insert([paymentData])
        .select()
        .single();

      if (paymentError) throw paymentError;

      // Calcular balance restante después del pago
      const balanceAfterPayment = Math.max(0, selectedLoan.remaining_balance - Math.round(data.amount));
      
      // Obtener el teléfono del cliente
      let clientPhone = null;
      try {
        const { data: loanData } = await supabase
          .from('loans')
          .select('client_id')
          .eq('id', data.loan_id)
          .single();
        
        if (loanData?.client_id) {
          const { data: clientData } = await supabase
            .from('clients')
            .select('phone')
            .eq('id', loanData.client_id)
            .maybeSingle();
          
          if (clientData) {
            clientPhone = clientData.phone;
          }
        }
      } catch (error) {
        console.error('Error obteniendo teléfono del cliente:', error);
      }
      
      // Guardar datos del pago para el recibo
      setLastPayment({
        ...insertedPayment,
        loan: {
          ...selectedLoan,
          remaining_balance: balanceAfterPayment,
          client: {
            ...selectedLoan.client,
            phone: clientPhone || selectedLoan.client?.phone
          }
        },
        distribution: { interestPayment, principalPayment },
        clientPhone
      });

      // Actualizar mora en cuotas si se pagó mora
      if (data.late_fee_amount && data.late_fee_amount > 0) {
        // CORRECCIÓN (auditoría 2026-08-28): faltaban `interest_amount`, `total_amount` y
        // `amount` en el select, pero el código de abajo los usa como base de mora en préstamos
        // indefinidos (donde `principal_amount` es 0). Venían `undefined` → base 0 → mora 0 →
        // el abono de mora se distribuía mal y `late_fee_paid` quedaba incorrecto.
        const { data: allInstallments } = await supabase
          .from('installments')
          .select('installment_number, late_fee_paid, is_paid, due_date, principal_amount, interest_amount, total_amount, amount')
          .eq('loan_id', data.loan_id)
          .order('installment_number', { ascending: true });
        
        let remainingLateFeePayment = data.late_fee_amount;
        
        for (const installment of allInstallments || []) {
          if (remainingLateFeePayment <= 0) break;
          if (installment.is_paid) continue;
          
          const currentLateFeePaid = installment.late_fee_paid || 0;
          // CORRECCIÓN (auditoría de cálculos): `new Date(installment.due_date)` interpreta
          // "YYYY-MM-DD" como medianoche UTC en vez de medianoche en Santo Domingo (UTC-4), lo que
          // puede restar un día de mora cerca de la medianoche y desalinear este cálculo con el
          // desglose que el usuario vio antes de cobrar. Se usa el mismo parseo seguro que el
          // resto de la aplicación (installmentLateFeeCalculator.ts).
          const dueDateOnly = String(installment.due_date || '').split('T')[0];
          const [dueYear, dueMonth, dueDay] = dueDateOnly.split('-').map(Number);
          const dueDate = new Date(dueYear, (dueMonth || 1) - 1, dueDay || 1);
          const calculationDate = getCurrentDateInSantoDomingo();
          const daysSinceDue = Math.floor((calculationDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
          const daysOverdue = Math.max(0, daysSinceDue - (selectedLoan.grace_period_days || 0));
          
          // For indefinite loans, regular cuotas have principal_amount=0; use interest_amount instead.
          const isIndefiniteForDist = String(selectedLoan.amortization_type || '').toLowerCase() === 'indefinite';
          const baseForMora = isIndefiniteForDist && (!installment.principal_amount || installment.principal_amount === 0)
            ? (installment.interest_amount || installment.total_amount || installment.amount || 0)
            : installment.principal_amount;

          let totalLateFeeForThisInstallment = 0;
          if (daysOverdue > 0) {
            switch (selectedLoan.late_fee_calculation_type) {
              case 'daily':
                totalLateFeeForThisInstallment = (baseForMora * selectedLoan.late_fee_rate / 100) * daysOverdue;
                break;
              case 'monthly': {
                // "/30" fijo: no coincidía con el prorrateo por período real del motor de mora.
                const periodsOverdue = Math.ceil(daysOverdue / getLateFeePeriodDays(selectedLoan.payment_frequency));
                totalLateFeeForThisInstallment = (baseForMora * selectedLoan.late_fee_rate / 100) * periodsOverdue;
                break;
              }
              case 'compound':
                totalLateFeeForThisInstallment = baseForMora * (Math.pow(1 + selectedLoan.late_fee_rate / 100, daysOverdue) - 1);
                break;
              default:
                totalLateFeeForThisInstallment = (baseForMora * selectedLoan.late_fee_rate / 100) * daysOverdue;
            }
            
            if (selectedLoan.max_late_fee && selectedLoan.max_late_fee > 0) {
              totalLateFeeForThisInstallment = Math.min(totalLateFeeForThisInstallment, selectedLoan.max_late_fee);
            }
            
            totalLateFeeForThisInstallment = Math.round(totalLateFeeForThisInstallment * 100) / 100;
          }
          
          const remainingLateFeeForThisInstallment = Math.max(0, totalLateFeeForThisInstallment - currentLateFeePaid);
          
          if (remainingLateFeeForThisInstallment > 0) {
            const moraToPay = Math.min(remainingLateFeePayment, remainingLateFeeForThisInstallment);
            const newLateFeePaid = currentLateFeePaid + moraToPay;
            
            await supabase
              .from('installments')
              .update({ late_fee_paid: newLateFeePaid })
              .eq('loan_id', data.loan_id)
              .eq('installment_number', installment.installment_number);
            
            remainingLateFeePayment -= moraToPay;
          }
        }
      }

      // Actualizar préstamo
      const newBalance = Math.max(0, selectedLoan.remaining_balance - Math.round(data.amount));
      let nextPaymentDate = selectedLoan.next_payment_date;

      if (isFullPayment) {
        const nextDate = new Date(selectedLoan.next_payment_date);
        nextDate.setMonth(nextDate.getMonth() + 1);
        nextPaymentDate = nextDate.toISOString().split('T')[0];

        // Marcar cuota como pagada
        const { data: installments } = await supabase
          .from('installments')
          .select('installment_number, is_paid')
          .eq('loan_id', data.loan_id)
          .order('installment_number', { ascending: true });

        const firstUnpaidInstallment = installments?.find(i => !i.is_paid);
        if (firstUnpaidInstallment) {
          await supabase
            .from('installments')
            .update({
              is_paid: true,
              paid_date: paymentDate,
              late_fee_paid: 0
            })
            .eq('loan_id', data.loan_id)
            .eq('installment_number', firstUnpaidInstallment.installment_number);
        }
      }

      const loanUpdateData: any = {
        remaining_balance: newBalance,
        next_payment_date: nextPaymentDate,
        status: newBalance <= 0 ? 'paid' : 'active',
      };

      if (data.late_fee_amount && data.late_fee_amount > 0) {
        const { data: currentLoan } = await supabase
          .from('loans')
          .select('total_late_fee_paid')
          .eq('id', data.loan_id)
          .single();

        if (currentLoan) {
          const currentTotalPaid = currentLoan.total_late_fee_paid || 0;
          loanUpdateData.total_late_fee_paid = currentTotalPaid + data.late_fee_amount;
        }
      }

      await supabase
        .from('loans')
        .update(loanUpdateData)
        .eq('id', data.loan_id);

      // Recalcular mora
      if (selectedLoan.late_fee_enabled) {
        const loanData = {
          id: data.loan_id,
          remaining_balance: newBalance,
          next_payment_date: nextPaymentDate,
          late_fee_rate: selectedLoan.late_fee_rate || 0,
          grace_period_days: selectedLoan.grace_period_days || 0,
          max_late_fee: selectedLoan.max_late_fee || 0,
          late_fee_calculation_type: selectedLoan.late_fee_calculation_type || 'daily',
          late_fee_enabled: selectedLoan.late_fee_enabled || false,
          amount: selectedLoan.amount,
          // Ver nota en `calculateLoanLateFee`: aquí también se pasaban plazo, frecuencia y
          // fecha de inicio inventados, y el resultado se ESCRIBÍA en `loans.current_late_fee`,
          // propagando la mora incorrecta a notificaciones, reportes y al listado de préstamos.
          term: (selectedLoan as any).term_months || 0,
          payment_frequency: (selectedLoan as any).payment_frequency || 'monthly',
          interest_rate: selectedLoan.interest_rate,
          monthly_payment: selectedLoan.monthly_payment,
          start_date: (selectedLoan as any).start_date || selectedLoan.next_payment_date,
          amortization_type: (selectedLoan as any).amortization_type
        };

        const updatedBreakdown = await getLateFeeBreakdownFromInstallments(data.loan_id, loanData);
        await supabase
          .from('loans')
          .update({
            current_late_fee: updatedBreakdown.totalLateFee,
            // Fecha de Santo Domingo, no UTC: `toISOString()` adelanta un día por las noches.
            last_late_fee_calculation: getCurrentDateStringForSantoDomingo()
          })
          .eq('id', data.loan_id);
      }

      await refetchPaymentStatus();
      
      const successMessage = isFullPayment 
        ? '✅ Pago completo registrado' 
        : '✅ Pago parcial registrado';
      
      toast.success(successMessage);
      
      // Mostrar modal de recibo
      setShowReceiptModal(true);
      
      // Resetear formulario después de un delay para que se vea el recibo
      setTimeout(() => {
        setSelectedLoan(null);
        setSearchTerm('');
        setShowPaymentForm(false);
        setPaymentAmount(0);
        setLateFeeAmount(0);
        form.reset();
        fetchActiveLoans();
      }, 100);
    } catch (error) {
      console.error('Error processing payment:', error);
      toast.error('Error al procesar el pago');
    } finally {
      setLoading(false);
    }
  };

  // Botones de monto rápido
  const quickAmountButtons = selectedLoan ? [
    { label: 'Cuota Completa', amount: Math.round(paymentStatus.currentPaymentRemaining > 0 ? paymentStatus.currentPaymentRemaining : selectedLoan.monthly_payment) },
    { label: '50%', amount: Math.round((selectedLoan.monthly_payment * 0.5)) },
    { label: '25%', amount: Math.round((selectedLoan.monthly_payment * 0.25)) },
  ] : [];

  // Función para generar y imprimir recibo
  const printReceipt = () => {
    if (!lastPayment || !lastPayment.loan) return;

    const payment = lastPayment;
    const loan = lastPayment.loan;
    const paymentDate = new Date(payment.payment_date);
    const paymentTime = payment.payment_time_local 
      ? new Date(payment.payment_time_local).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })
      : paymentDate.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });

    const getPaymentMethodLabel = (method: string) => {
      const methods: { [key: string]: string } = {
        cash: 'Efectivo',
        bank_transfer: 'Transferencia Bancaria',
        check: 'Cheque',
        card: 'Tarjeta',
        online: 'Pago en línea'
      };
      return methods[method] || method;
    };

    const receiptHTML = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Recibo de Pago</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { 
            font-family: 'Courier New', monospace, Arial, sans-serif; 
            margin: 0; 
            padding: 10px;
            font-size: 12px;
            line-height: 1.4;
            color: #000;
          }
          .receipt-container {
            max-width: 80mm;
            margin: 0 auto;
            padding: 10px;
            border: 1px dashed #ccc;
          }
          .header { 
            text-align: center; 
            margin-bottom: 15px; 
            border-bottom: 1px solid #000;
            padding-bottom: 10px;
          }
          .company-name {
            font-size: 16px;
            font-weight: bold;
            margin-bottom: 5px;
          }
          .receipt-title {
            font-size: 14px;
            font-weight: bold;
            margin: 10px 0 5px 0;
          }
          .receipt-number {
            font-size: 10px;
            margin-bottom: 5px;
          }
          .section {
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 1px dashed #ccc;
          }
          .section-title {
            font-weight: bold;
            font-size: 11px;
            margin-bottom: 5px;
            text-decoration: underline;
          }
          .info-row {
            margin-bottom: 3px;
            font-size: 10px;
            display: flex;
            justify-content: space-between;
          }
          .info-label {
            font-weight: bold;
          }
          .amount-section {
            margin: 15px 0;
            padding: 10px;
            background-color: #f5f5f5;
            border: 1px solid #000;
          }
          .amount-row {
            display: flex;
            justify-content: space-between;
            margin-bottom: 5px;
            font-size: 11px;
          }
          .total-amount {
            font-size: 16px;
            font-weight: bold;
            text-align: center;
            margin-top: 10px;
            padding-top: 10px;
            border-top: 2px solid #000;
          }
          .footer {
            margin-top: 15px;
            text-align: center;
            font-size: 9px;
            border-top: 1px dashed #ccc;
            padding-top: 10px;
          }
          .signature-line {
            margin-top: 20px;
            border-top: 1px solid #000;
            padding-top: 5px;
            font-size: 9px;
          }
          @media print {
            body { margin: 0; padding: 0; }
            .receipt-container { 
              border: none; 
              max-width: 80mm;
            }
            @page {
              size: 80mm auto;
              margin: 0;
            }
          }
        </style>
      </head>
      <body>
        <div class="receipt-container">
          <div class="header">
            <div class="company-name">ProPréstamos</div>
            <div class="receipt-title">RECIBO DE PAGO</div>
            <div class="receipt-number">Recibo #${payment.id.slice(0, 8).toUpperCase()}</div>
            <div style="font-size: 10px;">
              ${paymentDate.toLocaleDateString('es-DO', { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
              })} ${paymentTime}
            </div>
          </div>

          <div class="section">
            <div class="section-title">CLIENTE</div>
            <div class="info-row">
              <span class="info-label">Nombre:</span>
              <span>${loan.client?.full_name || 'N/A'}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Cédula:</span>
              <span>${loan.client?.dni || 'N/A'}</span>
            </div>
          </div>

          <div class="section">
            <div class="section-title">DETALLES DEL PAGO</div>
            <div class="info-row">
              <span class="info-label">Método:</span>
              <span>${getPaymentMethodLabel(payment.payment_method)}</span>
            </div>
            ${payment.reference_number ? `
            <div class="info-row">
              <span class="info-label">Referencia:</span>
              <span>${payment.reference_number}</span>
            </div>
            ` : ''}
            <div class="info-row">
              <span class="info-label">Fecha Vencimiento:</span>
              <span>${new Date(payment.due_date).toLocaleDateString('es-DO')}</span>
            </div>
          </div>

          <div class="amount-section">
            <div class="section-title" style="margin-bottom: 8px;">DESGLOSE</div>
            <div class="amount-row">
              <span>Principal:</span>
              <span>RD$${payment.principal_amount.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
            </div>
            <div class="amount-row">
              <span>Interés:</span>
              <span>RD$${payment.interest_amount.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
            </div>
            ${payment.late_fee > 0 ? `
            <div class="amount-row">
              <span>Mora:</span>
              <span>RD$${payment.late_fee.toLocaleString('es-DO', { minimumFractionDigits: 2 })}</span>
            </div>
            ` : ''}
            <div class="total-amount">
              TOTAL: RD$${payment.amount.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
            </div>
          </div>

          ${payment.notes ? `
          <div class="section">
            <div class="section-title">NOTAS</div>
            <div style="font-size: 9px; margin-top: 5px;">
              ${payment.notes}
            </div>
          </div>
          ` : ''}

          <div class="footer">
            <div style="margin-bottom: 10px;">
              <div>Balance Restante:</div>
              <div style="font-weight: bold; font-size: 11px;">
                RD$${((loan.remaining_balance || 0) - (payment.principal_amount || 0)).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
            <div class="signature-line">
              <div style="margin-bottom: 20px;">
                <div>Firma del Cliente</div>
                <div style="margin-top: 15px;">_________________________</div>
              </div>
            </div>
            <div style="font-size: 8px; margin-top: 10px;">
              Este documento es un comprobante oficial de pago.
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(receiptHTML);
      printWindow.document.close();
      // Pequeño delay para asegurar que el contenido se cargue
      setTimeout(() => {
        printWindow.print();
      }, 250);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      {/* ==================================================================== */}
      {/* Cabecera                                                             */}
      {/* ==================================================================== */}
      {/* Sin degradados ni sombras marcadas: en la calle, con sol, lo que se lee
          es el contraste del texto, no el color de fondo. */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-base font-semibold tracking-tight text-slate-900">Cobro Rápido</h1>
            <p className="text-xs text-slate-500">
              {loans.length} {loans.length === 1 ? 'préstamo activo' : 'préstamos activos'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11px] uppercase tracking-wide text-slate-400">Por cobrar</p>
            <p className="text-sm font-semibold tabular-nums text-slate-900">
              {formatCurrency(loans.reduce((sum, l) => sum + l.monthly_payment, 0))}
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-2xl space-y-3 px-4 py-4">
        {!showPaymentForm ? (
          <>
            {/* ============================================================ */}
            {/* Búsqueda                                                      */}
            {/* ============================================================ */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Nombre o cédula del cliente"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-12 rounded-xl border-slate-200 bg-white pl-10 text-base shadow-sm placeholder:text-slate-400"
                autoFocus
                inputMode="search"
              />
              {searchTerm.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  aria-label="Limpiar búsqueda"
                  className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 active:bg-slate-100"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* Resultados */}
            {showLoanList && filteredLoans.length > 0 && (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                {filteredLoans.map((loan, index) => (
                  <button
                    key={loan.id}
                    type="button"
                    onClick={() => selectLoan(loan)}
                    className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors active:bg-slate-100 ${
                      index > 0 ? 'border-t border-slate-100' : ''
                    }`}
                  >
                    {/* Inicial del cliente: ancla visual para recorrer la lista a ojo */}
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
                      {(loan.client?.full_name || '?').trim().charAt(0).toUpperCase()}
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-900">{loan.client?.full_name}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {loan.client?.dni}
                        <span className="mx-1.5 text-slate-300">·</span>
                        vence {formatDateStringForSantoDomingo(String(loan.next_payment_date || '').split('T')[0])}
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="font-semibold tabular-nums text-slate-900">
                        {formatCurrency(loan.monthly_payment)}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        saldo {formatCurrency(loan.remaining_balance)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {searchTerm.length > 0 && !showLoanList && (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-10 text-center">
                <p className="text-sm font-medium text-slate-700">Sin resultados</p>
                <p className="mt-1 text-sm text-slate-500">
                  No hay ningún préstamo activo de «{searchTerm}».
                </p>
              </div>
            )}

            {searchTerm.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-12 text-center">
                <Search className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-3 text-sm font-medium text-slate-700">Busca al cliente</p>
                <p className="mt-1 text-sm text-slate-500">
                  Escribe su nombre o su cédula para cobrarle.
                </p>
              </div>
            )}
          </>
        ) : (
          /* Formulario de pago */
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
              {/* ============================================================ */}
              {/* Cliente                                                       */}
              {/* ============================================================ */}
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center gap-3 px-4 py-3">
                  <button
                    type="button"
                    aria-label="Volver a la búsqueda"
                    onClick={() => {
                      setShowPaymentForm(false);
                      setSelectedLoan(null);
                      setSearchTerm('');
                    }}
                    className="-ml-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 active:bg-slate-100"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900">
                      {selectedLoan?.client?.full_name}
                    </p>
                    <p className="truncate text-xs text-slate-500">{selectedLoan?.client?.dni}</p>
                  </div>
                </div>

                {/* Las dos cifras que el cobrador necesita tener delante al cobrar. */}
                <div className="grid grid-cols-2 divide-x divide-slate-100 border-t border-slate-100">
                  <div className="px-4 py-3">
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">Cuota</p>
                    <p className="mt-0.5 font-semibold tabular-nums text-slate-900">
                      {formatCurrency(selectedLoan?.monthly_payment || 0)}
                    </p>
                  </div>
                  <div className="px-4 py-3">
                    <p className="text-[11px] uppercase tracking-wide text-slate-400">Saldo pendiente</p>
                    <p className="mt-0.5 font-semibold tabular-nums text-slate-900">
                      {formatCurrency(selectedLoan?.remaining_balance || 0)}
                    </p>
                  </div>
                </div>
              </div>

              {/* ============================================================ */}
              {/* Monto                                                         */}
              {/* ============================================================ */}
              <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <FormField
                    control={form.control}
                    name="amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-medium uppercase tracking-wide text-slate-500">
                          Monto a cobrar
                        </FormLabel>
                        <FormControl>
                          <div className="relative">
                            {/* El símbolo va fuera del campo: dentro, el teclado numérico del
                                móvil lo borra al escribir y confunde. */}
                            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg font-medium text-slate-400">
                              RD$
                            </span>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              inputMode="decimal"
                              placeholder="0.00"
                              className="h-16 rounded-xl border-slate-200 pl-14 text-right text-2xl font-semibold tabular-nums"
                              {...field}
                              value={field.value || ''}
                              onChange={(e) => {
                                const value = e.target.value === '' ? 0 : parseFloat(e.target.value) || 0;
                                field.onChange(value);
                                setPaymentAmount(value);
                              }}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Atajos de monto. Tres en una fila: se alcanzan con el pulgar y no
                      empujan el resto del formulario fuera de la pantalla. El importe se
                      muestra UNA vez —antes salía dos veces en el mismo botón. */}
                  {quickAmountButtons.length > 0 && (
                    <div className="grid grid-cols-3 gap-2">
                      {quickAmountButtons.map((btn, idx) => {
                        const isSelected = Math.round(paymentAmount) === btn.amount;
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              form.setValue('amount', btn.amount);
                              setPaymentAmount(btn.amount);
                            }}
                            className={`rounded-xl border px-2 py-2.5 text-center transition-colors ${
                              isSelected
                                ? 'border-slate-900 bg-slate-900 text-white'
                                : 'border-slate-200 bg-white text-slate-700 active:bg-slate-50'
                            }`}
                          >
                            <span className="block text-[11px] font-medium uppercase tracking-wide opacity-70">
                              {btn.label}
                            </span>
                            <span className="mt-0.5 block text-sm font-semibold tabular-nums">
                              {formatCurrency(btn.amount)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Pago de mora */}
                  {selectedLoan?.late_fee_enabled && lateFeeAmount > 0 && (
                    <FormField
                      control={form.control}
                      name="late_fee_amount"
                      render={({ field }) => (
                        <FormItem className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <FormLabel className="flex items-center gap-1.5 text-sm font-medium text-amber-900">
                              <AlertTriangle className="h-4 w-4" />
                              Mora acumulada
                            </FormLabel>
                            <span className="text-sm font-semibold tabular-nums text-amber-900">
                              {formatCurrency(lateFeeAmount)}
                            </span>
                          </div>
                          <div className="mt-2.5 flex gap-2">
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                max={lateFeeAmount}
                                inputMode="decimal"
                                placeholder="0.00"
                                className="h-11 rounded-lg border-amber-200 bg-white text-right font-semibold tabular-nums"
                                {...field}
                                value={field.value || ''}
                                onChange={(e) => {
                                  const value = e.target.value === '' ? 0 : parseFloat(e.target.value) || 0;
                                  field.onChange(value);
                                }}
                              />
                            </FormControl>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => field.onChange(lateFeeAmount)}
                              className="h-11 shrink-0 border-amber-300 bg-white px-3 text-amber-900 hover:bg-amber-100"
                            >
                              Toda
                            </Button>
                          </div>
                          <p className="mt-2 text-xs text-amber-800/80">
                            Cobrarla es opcional: déjalo en 0 si no la vas a cobrar hoy.
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
              </div>

              {/* ============================================================ */}
              {/* Método de pago                                                */}
              {/* ============================================================ */}
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <FormField
                  control={form.control}
                  name="payment_method"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Método de pago
                      </FormLabel>
                      <FormControl>
                        {/* Sin emoji: en un recibo y en un arqueo de caja lo que se lee es
                            la palabra, y los emoji se ven distintos en cada teléfono. */}
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <SelectTrigger className="h-12 rounded-xl border-slate-200 text-base">
                            <SelectValue placeholder="Seleccionar método" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cash" className="py-2.5 text-base">Efectivo</SelectItem>
                            <SelectItem value="bank_transfer" className="py-2.5 text-base">Transferencia</SelectItem>
                            <SelectItem value="card" className="py-2.5 text-base">Tarjeta</SelectItem>
                            <SelectItem value="check" className="py-2.5 text-base">Cheque</SelectItem>
                            <SelectItem value="online" className="py-2.5 text-base">En línea</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* ============================================================ */}
              {/* Barra de cobro                                                */}
              {/* ============================================================ */}
              {/* El total vive AQUÍ, junto al botón que lo cobra, y no en una tarjeta
                  más arriba: es la última cifra que se mira antes de pulsar. */}
              <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
                <div className="mx-auto max-w-2xl px-4 py-3">
                  <div className="mb-2.5 flex items-baseline justify-between">
                    <div>
                      <span className="text-xs uppercase tracking-wide text-slate-500">Total a cobrar</span>
                      {(form.watch('late_fee_amount') || 0) > 0 && (
                        <p className="text-[11px] text-slate-400">
                          cuota {formatCurrency(paymentAmount)}
                          {' + '}mora {formatCurrency(form.watch('late_fee_amount') || 0)}
                        </p>
                      )}
                    </div>
                    <span className="text-2xl font-semibold tabular-nums text-slate-900">
                      {formatCurrency(paymentAmount + (form.watch('late_fee_amount') || 0))}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-12 flex-1 rounded-xl"
                      onClick={() => {
                        setShowPaymentForm(false);
                        setSelectedLoan(null);
                        setSearchTerm('');
                        form.reset();
                      }}
                      disabled={loading}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="submit"
                      className="h-12 flex-[2] rounded-xl bg-emerald-600 text-base font-semibold hover:bg-emerald-700"
                      disabled={loading}
                    >
                      {loading ? 'Registrando…' : (
                        <>
                          <CheckCircle2 className="mr-2 h-5 w-5" />
                          Registrar cobro
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </form>
          </Form>
        )}
      </div>

      {/* Recibo del cobro recién hecho */}
      <Dialog open={showReceiptModal} onOpenChange={setShowReceiptModal}>
        <DialogContent className="mx-auto max-w-sm rounded-2xl">
          <DialogHeader className="items-center text-center">
            <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
              <CheckCircle2 className="h-6 w-6 text-emerald-600" />
            </div>
            <DialogTitle className="text-base font-semibold">Cobro registrado</DialogTitle>
          </DialogHeader>

          {lastPayment && lastPayment.loan && (
            <div className="space-y-4">
              {/* El importe manda: es lo que el cobrador confirma en voz alta al cliente. */}
              <p className="text-center text-3xl font-semibold tabular-nums text-slate-900">
                {formatCurrency(lastPayment.amount + (lastPayment.late_fee || 0))}
              </p>

              <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
                <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <dt className="text-slate-500">Cliente</dt>
                  <dd className="truncate font-medium text-slate-900">
                    {lastPayment.loan.client?.full_name}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <dt className="text-slate-500">Fecha</dt>
                  <dd className="text-slate-900">
                    {formatDateStringForSantoDomingo(
                      String(lastPayment.payment_date || '').split('T')[0]
                    )}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <dt className="text-slate-500">Método</dt>
                  <dd className="text-slate-900">
                    {lastPayment.payment_method === 'cash' ? 'Efectivo' :
                     lastPayment.payment_method === 'bank_transfer' ? 'Transferencia' :
                     lastPayment.payment_method === 'card' ? 'Tarjeta' :
                     lastPayment.payment_method === 'check' ? 'Cheque' : 'En línea'}
                  </dd>
                </div>
              </dl>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowReceiptModal(false);
                    setShowWhatsAppDialog(true);
                  }}
                  className="h-11 flex-1 rounded-xl"
                >
                  Continuar
                </Button>
                <Button
                  onClick={() => {
                    printReceipt();
                    setTimeout(() => {
                      setShowReceiptModal(false);
                      setShowWhatsAppDialog(true);
                    }, 500);
                  }}
                  className="h-11 flex-1 rounded-xl"
                >
                  <Printer className="mr-2 h-4 w-4" />
                  Imprimir
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Diálogo de confirmación de WhatsApp */}
      <Dialog open={showWhatsAppDialog} onOpenChange={setShowWhatsAppDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Enviar recibo por WhatsApp?</DialogTitle>
            <DialogDescription>
              ¿Deseas enviar el recibo del pago al cliente por WhatsApp?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowWhatsAppDialog(false);
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={async () => {
                if (!lastPayment || !lastPayment.loan) {
                  toast.error('No hay información del pago disponible');
                  setShowWhatsAppDialog(false);
                  return;
                }

                const clientPhone = lastPayment.clientPhone || lastPayment.loan?.client?.phone;
                
                if (!clientPhone) {
                  toast.error('No se encontró el número de teléfono del cliente. Por favor, verifica que el cliente tenga un número de teléfono registrado.');
                  setShowWhatsAppDialog(false);
                  return;
                }

                try {
                  const companyName = companySettings?.company_name || 'LA EMPRESA';
                  // CORRECCIÓN: Para préstamos indefinidos, el balance restante es el monto original (no cambia)
                  const remainingBalance = lastPayment.loan.amortization_type === 'indefinite'
                    ? lastPayment.loan.amount
                    : lastPayment.loan.remaining_balance;
                  
                  const receiptMessage = generateLoanPaymentReceipt({
                    companyName,
                    clientName: lastPayment.loan.client.full_name,
                    clientDni: lastPayment.loan.client.dni,
                    paymentDate: formatDateStringForSantoDomingo(lastPayment.payment_date),
                    paymentAmount: lastPayment.amount + (lastPayment.late_fee || 0),
                    principalAmount: lastPayment.distribution?.principalPayment || lastPayment.principal_amount || 0,
                    interestAmount: lastPayment.distribution?.interestPayment || lastPayment.interest_amount || 0,
                    lateFeeAmount: lastPayment.late_fee > 0 ? lastPayment.late_fee : undefined,
                    paymentMethod: lastPayment.payment_method,
                    loanAmount: lastPayment.loan.amount,
                    remainingBalance: remainingBalance,
                    interestRate: lastPayment.loan.interest_rate,
                    nextPaymentDate: formatDateStringForSantoDomingo(lastPayment.loan.next_payment_date),
                    referenceNumber: lastPayment.reference_number
                  });

                  openWhatsApp(clientPhone, receiptMessage);
                  toast.success('Abriendo WhatsApp...');
                } catch (error: any) {
                  console.error('Error abriendo WhatsApp:', error);
                  toast.error(error.message || 'Error al abrir WhatsApp');
                }

                setShowWhatsAppDialog(false);
              }}
            >
              <MessageCircle className="h-4 w-4 mr-2" />
              Enviar por WhatsApp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

