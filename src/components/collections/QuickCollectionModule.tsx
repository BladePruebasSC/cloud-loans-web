import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLoanPaymentStatusSimple } from '@/hooks/useLoanPaymentStatusSimple';
import { getLateFeeBreakdownFromInstallments } from '@/utils/installmentLateFeeCalculator';
import { getCurrentDateInSantoDomingo } from '@/utils/dateUtils';
import { toast } from 'sonner';
import { 
  Search, 
  User, 
  DollarSign, 
  CreditCard, 
  CheckCircle2, 
  AlertTriangle,
  ArrowLeft,
  Smartphone,
  Zap,
  Calendar,
  TrendingUp,
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
  client: {
    full_name: string;
    dni: string;
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
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <Smartphone className="h-6 w-6" />
              Acceso Restringido
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-gray-600">
              Este módulo está diseñado exclusivamente para dispositivos móviles.
            </p>
            <p className="text-sm text-gray-500">
              Por favor, accede desde un teléfono o tablet para usar el módulo de Cobro Rápido.
            </p>
            <div className="pt-4">
              <Button 
                onClick={() => window.history.back()} 
                className="w-full"
              >
                Volver
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const fetchActiveLoans = async () => {
    if (!user || !companyId) return;

    try {
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
        term: 4,
        payment_frequency: 'monthly',
        interest_rate: loan.interest_rate,
        monthly_payment: loan.monthly_payment,
        start_date: loan.next_payment_date
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
        const { data: allInstallments } = await supabase
          .from('installments')
          .select('installment_number, late_fee_paid, is_paid, due_date, principal_amount')
          .eq('loan_id', data.loan_id)
          .order('installment_number', { ascending: true });
        
        let remainingLateFeePayment = data.late_fee_amount;
        
        for (const installment of allInstallments || []) {
          if (remainingLateFeePayment <= 0) break;
          if (installment.is_paid) continue;
          
          const currentLateFeePaid = installment.late_fee_paid || 0;
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
          term: 4,
          payment_frequency: 'monthly',
          interest_rate: selectedLoan.interest_rate,
          monthly_payment: selectedLoan.monthly_payment,
          start_date: selectedLoan.next_payment_date
        };
        
        const updatedBreakdown = await getLateFeeBreakdownFromInstallments(data.loan_id, loanData);
        await supabase
          .from('loans')
          .update({ 
            current_late_fee: updatedBreakdown.totalLateFee,
            last_late_fee_calculation: new Date().toISOString().split('T')[0]
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 pb-24">
      {/* Header móvil optimizado */}
      <div className="sticky top-0 z-10 bg-white border-b shadow-md">
        <div className="px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-md">
              <Zap className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-gray-900">Cobro Rápido</h1>
              <p className="text-xs text-gray-500">Búsqueda y cobro instantáneo</p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4 max-w-2xl mx-auto">
        {/* Búsqueda de préstamos */}
        {!showPaymentForm ? (
          <>
            <Card className="border-2 border-blue-200 shadow-lg">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Search className="h-5 w-5 text-blue-600" />
                  Buscar Préstamo
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <Input
                    placeholder="Buscar por nombre o cédula..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 h-12 text-base"
                    autoFocus
                  />
                </div>

                {/* Lista de préstamos */}
                {showLoanList && filteredLoans.length > 0 && (
                  <div className="border rounded-lg max-h-64 overflow-y-auto">
                    {filteredLoans.map((loan) => (
                      <div
                        key={loan.id}
                        onClick={() => selectLoan(loan)}
                        className="p-4 border-b last:border-b-0 hover:bg-blue-50 cursor-pointer transition-colors active:bg-blue-100"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <div className="font-semibold text-gray-900 mb-1">
                              {loan.client?.full_name}
                            </div>
                            <div className="text-sm text-gray-600 mb-2">
                              <Badge variant="outline" className="text-xs">
                                {loan.client?.dni}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-4 text-xs text-gray-500">
                              <span className="flex items-center gap-1">
                                <DollarSign className="h-3 w-3" />
                                {formatCurrency(loan.remaining_balance)}
                              </span>
                              <span className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {new Date(loan.next_payment_date).toLocaleDateString('es-DO')}
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <Badge className="bg-blue-600">
                              {formatCurrency(loan.monthly_payment)}
                            </Badge>
                            {loan.late_fee_enabled && lateFeeAmount > 0 && (
                              <Badge variant="destructive" className="text-xs">
                                Mora: {formatCurrency(lateFeeAmount)}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {searchTerm.length > 0 && !showLoanList && (
                  <div className="text-center py-8 text-gray-500">
                    <Search className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No se encontraron préstamos</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Estadísticas rápidas */}
            <div className="grid grid-cols-2 gap-3">
              <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white border-0">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs opacity-90 mb-1">Préstamos Activos</p>
                      <p className="text-2xl font-bold">{loans.length}</p>
                    </div>
                    <TrendingUp className="h-8 w-8 opacity-80" />
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white border-0">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs opacity-90 mb-1">Total a Cobrar</p>
                      <p className="text-2xl font-bold">
                        {formatCurrency(loans.reduce((sum, l) => sum + l.monthly_payment, 0))}
                      </p>
                    </div>
                    <DollarSign className="h-8 w-8 opacity-80" />
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        ) : (
          /* Formulario de pago */
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* Información del cliente */}
              <Card className="border-2 border-blue-200">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <User className="h-5 w-5 text-blue-600" />
                      Cliente
                    </CardTitle>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowPaymentForm(false);
                        setSelectedLoan(null);
                        setSearchTerm('');
                      }}
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <div className="font-semibold text-gray-900 mb-1">
                      {selectedLoan?.client?.full_name}
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {selectedLoan?.client?.dni}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="p-2 bg-gray-50 rounded">
                      <div className="text-gray-600">Balance</div>
                      <div className="font-bold text-red-600">
                        {formatCurrency(selectedLoan?.remaining_balance || 0)}
                      </div>
                    </div>
                    <div className="p-2 bg-gray-50 rounded">
                      <div className="text-gray-600">Cuota</div>
                      <div className="font-bold text-blue-600">
                        {formatCurrency(selectedLoan?.monthly_payment || 0)}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Monto del pago */}
              <Card className="border-2 border-green-200 shadow-lg">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-green-600" />
                    Monto a Cobrar
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-base font-semibold">Monto de la Cuota</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="0.00"
                            className="h-16 text-2xl font-bold text-center"
                            {...field}
                            value={field.value || ''}
                            onChange={(e) => {
                              const value = e.target.value === '' ? 0 : parseFloat(e.target.value) || 0;
                              field.onChange(value);
                              setPaymentAmount(value);
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Botones de monto rápido - Diseño tipo app móvil */}
                  {quickAmountButtons.length > 0 && (
                    <div className="space-y-2">
                      <FormLabel className="text-sm font-medium text-gray-600">Opciones Rápidas</FormLabel>
                      <div className="grid grid-cols-1 gap-3">
                        {quickAmountButtons.map((btn, idx) => (
                          <Button
                            key={idx}
                            type="button"
                            variant={idx === 0 ? "default" : "outline"}
                            className={`h-16 w-full flex items-center justify-between px-4 ${
                              idx === 0 
                                ? 'bg-green-600 hover:bg-green-700 text-white shadow-md' 
                                : 'bg-white hover:bg-gray-50 border-2 border-gray-200'
                            }`}
                            onClick={() => {
                              form.setValue('amount', btn.amount);
                              setPaymentAmount(btn.amount);
                            }}
                          >
                            <div className="flex flex-col items-start">
                              <span className={`text-sm font-semibold ${idx === 0 ? 'text-white' : 'text-gray-700'}`}>
                                {btn.label}
                              </span>
                              <span className={`text-xs ${idx === 0 ? 'text-green-100' : 'text-gray-500'}`}>
                                {formatCurrency(btn.amount)}
                              </span>
                            </div>
                            <div className={`text-lg font-bold ${idx === 0 ? 'text-white' : 'text-green-600'}`}>
                              {formatCurrency(btn.amount)}
                            </div>
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Pago de mora */}
                  {selectedLoan?.late_fee_enabled && lateFeeAmount > 0 && (
                    <FormField
                      control={form.control}
                      name="late_fee_amount"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2 text-base font-semibold">
                            <AlertTriangle className="h-5 w-5 text-orange-600" />
                            Mora (Opcional)
                          </FormLabel>
                          <div className="space-y-2">
                            <div className="flex gap-2">
                              <FormControl>
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  max={lateFeeAmount}
                                  placeholder="0.00"
                                  className="h-14 text-lg font-semibold"
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
                                className="h-14 px-4 whitespace-nowrap border-2 border-orange-300 hover:bg-orange-50"
                              >
                                Pagar Toda
                              </Button>
                            </div>
                            <div className="text-sm text-orange-600 font-medium bg-orange-50 p-2 rounded">
                              Mora pendiente: {formatCurrency(lateFeeAmount)}
                            </div>
                          </div>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  {/* Resumen del total */}
                  <div className="p-5 bg-gradient-to-br from-green-500 to-green-600 rounded-xl shadow-lg">
                    <div className="flex flex-col space-y-2">
                      <span className="text-white text-sm font-medium opacity-90">Total a Cobrar</span>
                      <span className="text-3xl font-bold text-white">
                        {formatCurrency(
                          paymentAmount + (form.watch('late_fee_amount') || 0)
                        )}
                      </span>
                      {(form.watch('late_fee_amount') || 0) > 0 && (
                        <div className="pt-2 border-t border-green-400/30">
                          <div className="flex justify-between text-sm text-green-100">
                            <span>Cuota:</span>
                            <span>{formatCurrency(paymentAmount)}</span>
                          </div>
                          <div className="flex justify-between text-sm text-green-100">
                            <span>Mora:</span>
                            <span>{formatCurrency(form.watch('late_fee_amount') || 0)}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Método de pago */}
              <Card className="border-2 border-gray-200 shadow-md">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <CreditCard className="h-5 w-5 text-gray-600" />
                    Método de Pago
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <FormField
                    control={form.control}
                    name="payment_method"
                    render={({ field }) => (
                      <FormItem>
                        <FormControl>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <SelectTrigger className="h-14 text-base font-medium">
                              <SelectValue placeholder="Seleccionar método" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="cash" className="text-base py-3">💵 Efectivo</SelectItem>
                              <SelectItem value="bank_transfer" className="text-base py-3">🏦 Transferencia</SelectItem>
                              <SelectItem value="card" className="text-base py-3">💳 Tarjeta</SelectItem>
                              <SelectItem value="check" className="text-base py-3">📝 Cheque</SelectItem>
                              <SelectItem value="online" className="text-base py-3">🌐 En línea</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              {/* Botones de acción */}
              <div className="flex gap-3 sticky bottom-0 bg-white pt-4 pb-6">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 h-14"
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
                  className="flex-1 h-14 bg-green-600 hover:bg-green-700 text-lg font-semibold"
                  disabled={loading}
                >
                  {loading ? (
                    <>⏳ Procesando...</>
                  ) : (
                    <>
                      <CheckCircle2 className="h-5 w-5 mr-2" />
                      Registrar Cobro
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Form>
        )}
      </div>

      {/* Modal de Recibo */}
      <Dialog open={showReceiptModal} onOpenChange={setShowReceiptModal}>
        <DialogContent className="max-w-md mx-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <span>Pago Registrado</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowReceiptModal(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {lastPayment && lastPayment.loan && (
              <>
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="text-center mb-4">
                    <div className="text-2xl font-bold text-green-600 mb-2">
                      {formatCurrency(lastPayment.amount + (lastPayment.late_fee || 0))}
                    </div>
                    <div className="text-sm text-gray-600">
                      Pago registrado exitosamente
                    </div>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Cliente:</span>
                      <span className="font-semibold">{lastPayment.loan.client?.full_name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Fecha:</span>
                      <span>{new Date(lastPayment.payment_date).toLocaleDateString('es-DO')}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Método:</span>
                      <span>{lastPayment.payment_method === 'cash' ? 'Efectivo' : 
                             lastPayment.payment_method === 'bank_transfer' ? 'Transferencia' :
                             lastPayment.payment_method === 'card' ? 'Tarjeta' :
                             lastPayment.payment_method === 'check' ? 'Cheque' : 'En línea'}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      printReceipt();
                      setTimeout(() => {
                        setShowReceiptModal(false);
                        setShowWhatsAppDialog(true);
                      }, 500);
                    }}
                    className="flex-1 bg-blue-600 hover:bg-blue-700"
                  >
                    <Printer className="h-4 w-4 mr-2" />
                    Imprimir Recibo
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowReceiptModal(false);
                      setShowWhatsAppDialog(true);
                    }}
                    className="flex-1"
                  >
                    Cerrar
                  </Button>
                </div>
              </>
            )}
          </div>
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

