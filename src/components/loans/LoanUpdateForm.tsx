import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { getLateFeeBreakdownFromInstallments } from '@/utils/installmentLateFeeCalculator';
import { PasswordVerificationDialog } from '@/components/common/PasswordVerificationDialog';
import {
  getCurrentDateInSantoDomingo, getCurrentDateStringForSantoDomingo, formatDateStringForSantoDomingo,
} from '@/utils/dateUtils';
import {
  addPeriodsToDate,
  formatDateLocalIso,
  getFrequencyLabel,
  getFrequencyRateFactor,
  parseIsoDateLocal,
} from '@/utils/frequencyUtils';
import { computeExtendedSchedule } from '@/utils/loanRescheduling';
import type { RawPayment } from '@/utils/installmentDues';
import { formatCurrency } from '@/lib/utils';
import { generateLoanPaymentReceipt, generateCapitalPaymentReceipt, openWhatsApp, formatPhoneForWhatsApp } from '@/utils/whatsappReceipt';
import { getLoanBalanceBreakdown } from '@/utils/loanBalanceBreakdown';
import { getFirstUnpaidDueDate } from '@/utils/nextPaymentDateFromInstallments';
import { 
  Edit, 
  DollarSign, 
  Calendar, 
  Calculator,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Clock,
  CreditCard,
  Receipt,
  Eye,
  Table,
  Trash2,
  PlusCircle,
  MinusCircle,
  Printer,
  Download,
  MessageCircle
} from 'lucide-react';
import { LateFeeInfo } from './LateFeeInfo';
import { PaymentForm } from './PaymentForm';
import { Handshake } from 'lucide-react';

const updateSchema = z.object({
  update_type: z.enum(['add_charge', 'pay_charges', 'term_extension', 'settle_loan', 'delete_loan', 'remove_late_fee', 'payment_agreement', 'edit_loan', 'capital_payment']),
  amount: z.number().min(0.01, 'El monto debe ser mayor a 0').optional(),
  late_fee_amount: z.number().min(0.01, 'El monto de mora debe ser mayor a 0').optional(),
  // Nota: el nombre del campo se conserva por compatibilidad con el historial ya guardado,
  // pero su unidad son CUOTAS de la frecuencia del préstamo, no meses.
  additional_months: z.number().min(0, 'Las cuotas adicionales deben ser mayor o igual a 0').optional(),
  adjustment_reason: z.string().optional(),
  payment_method: z.string().optional(),
  reference_number: z.string().optional(),
  notes: z.string().optional(),
  charge_date: z.string().optional(), // Fecha de creación del cargo
  charge_due_date: z.string().optional(), // Fecha de vencimiento del cargo
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
  // Campos para abono a capital
  capital_payment_amount: z.number().min(0.01, 'El monto debe ser mayor a 0').optional(),
  keep_installments: z.boolean().optional(),
  is_penalty: z.boolean().optional(),
  penalty_percentage: z.number().min(0).max(100, 'El porcentaje debe ser entre 0 y 100').optional(),
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
    // edit_amount is excluded here because it may be disabled (undefined) for pending/factura loans.
    // The onSubmit handler validates edit_amount separately for non-pending loans.
    return data.edit_interest_rate !== undefined &&
           data.edit_term_months !== undefined && data.edit_amortization_type !== undefined;
  }
  return true;
}, {
  message: 'Debe completar todos los campos requeridos para editar el préstamo',
  path: ['edit_interest_rate'],
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
}).refine((data) => {
  if (data.update_type === 'capital_payment') {
    return data.capital_payment_amount !== undefined && data.capital_payment_amount > 0;
  }
  return true;
}, {
  message: 'Debe especificar el monto del abono a capital',
  path: ['capital_payment_amount'],
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
  /** Fecha de próximo pago calculada (primera cuota/cargo pendiente). Si no se pasa, se usa loan.next_payment_date. */
  displayNextPaymentDate?: string | null;
}

export const LoanUpdateForm: React.FC<LoanUpdateFormProps> = ({ 
  loan, 
  isOpen, 
  onClose, 
  onUpdate,
  editOnly = false,
  displayNextPaymentDate
}) => {
  const round2 = (n: number) => Math.round(((Number.isFinite(n) ? n : 0) * 100)) / 100;
  const isIndefiniteLoan = (loan?.amortization_type || '').toLowerCase() === 'indefinite';

  const [loading, setLoading] = useState(false);
  const [currentLateFee, setCurrentLateFee] = useState(loan.current_late_fee || 0);
  const [freshRemainingBalance, setFreshRemainingBalance] = useState<number | null>(null);
  const [isFetchingFreshBalance, setIsFetchingFreshBalance] = useState(false);
  const [showAgreementsDialog, setShowAgreementsDialog] = useState(false);
  const [agreements, setAgreements] = useState<any[]>([]);
  const [selectedAgreement, setSelectedAgreement] = useState<any | null>(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [balanceCalculated, setBalanceCalculated] = useState(false);
  const [calculatedValues, setCalculatedValues] = useState({
    currentBalance: loan.remaining_balance,
    newBalance: loan.remaining_balance,
    newPayment: loan.monthly_payment,
    newEndDate: '',
    interestAmount: 0,
    principalAmount: 0
  });
  const [installments, setInstallments] = useState<any[]>([]);
  /** Pagos del préstamo: la extensión los necesita para ver las cuotas abonadas a medias. */
  const [loanPayments, setLoanPayments] = useState<RawPayment[]>([]);
  /** Abonos DIRECTOS a capital: estos sí reducen el capital a repartir. */
  const [totalCapitalPaid, setTotalCapitalPaid] = useState(0);
  /**
   * Pagos eliminados por la última extensión de plazo, para dejar constancia en el historial
   * del préstamo. Es una ref y no estado porque se escribe y se lee dentro del mismo guardado.
   */
  const discardedPaymentsRef = useRef<{ amount: number; due_date: string }[]>([]);
  const [settleBreakdown, setSettleBreakdown] = useState({
    capitalPending: 0,
    interestPending: 0,
    lateFeePending: 0,
    totalToSettle: 0
  });
  const [pendingInterestForIndefinite, setPendingInterestForIndefinite] = useState<number>(0);
  const [showPasswordVerification, setShowPasswordVerification] = useState(false);
  const [pendingFormData, setPendingFormData] = useState<UpdateFormData | null>(null);
  const [showPrintFormatModal, setShowPrintFormatModal] = useState(false);
  const [showWhatsAppDialog, setShowWhatsAppDialog] = useState(false);
  const [isClosingPrintModal, setIsClosingPrintModal] = useState(false);
  const [lastSettlePaymentData, setLastSettlePaymentData] = useState<any>(null);
  const [lastCapitalPaymentData, setLastCapitalPaymentData] = useState<any>(null);
  const [companySettings, setCompanySettings] = useState<any>(null);
  const [pendingCapital, setPendingCapital] = useState<number>(0);
  const [capitalPaymentPreview, setCapitalPaymentPreview] = useState({
    newPendingCapital: 0,
    installmentsImpact: '',
    newInstallmentAmount: 0,
    newInstallmentCount: 0
  });
  const [penaltyAmount, setPenaltyAmount] = useState<number>(0);
  const [originalPendingCapital, setOriginalPendingCapital] = useState<number>(0); // Capital pendiente original antes del abono
  const [showPreviewTable, setShowPreviewTable] = useState(false);
  const [previewInstallments, setPreviewInstallments] = useState<any[]>([]);
  /** Próximo pago calculado desde installments + payments al abrir (misma lógica que Detalles). */
  const [localNextPaymentDate, setLocalNextPaymentDate] = useState<string | null>(null);
  
  // Estados para Pagar Cargos
  const [selectedCharges, setSelectedCharges] = useState<string[]>([]); // IDs de cargos seleccionados
  const [chargePaymentAmount, setChargePaymentAmount] = useState<number>(0);
  const [chargePaymentMethod, setChargePaymentMethod] = useState<string>('cash');
  const [chargePaymentReference, setChargePaymentReference] = useState<string>('');
  
  const { user, companyId, companySettings: authCompanySettings } = useAuth();

  const form = useForm<UpdateFormData>({
    resolver: zodResolver(updateSchema),
    defaultValues: {
      update_type: editOnly ? 'edit_loan' : 'add_charge',
      payment_method: 'cash',
    },
  });

  // ✅ Al abrir: calcular balance pendiente desde el plan real de cuotas (installments),
  // no depender de `remaining_balance`/`total_amount` (pueden quedar mal tras abono a capital).
  useEffect(() => {
    if (!isOpen || !loan?.id) return;
    let cancelled = false;

    const fetchFreshRemainingBalance = async () => {
      try {
        setIsFetchingFreshBalance(true);
        // Evitar mostrar un valor stale al abrir: esperamos el valor de BD.
        setFreshRemainingBalance(null);
        const { data, error } = await supabase
          .from('loans')
          .select('monthly_payment, amortization_type, interest_rate, term_months, next_payment_date, amount')
          .eq('id', loan.id)
          .single();
        if (error) throw error;
        if (cancelled) return;

        const mergedLoan = {
          ...loan,
          ...(data || {})
        } as any;

        // ✅ Balance pendiente igual a Detalles: capital + interés + cargos (totalBalance)
        const breakdown = await getLoanBalanceBreakdown(supabase as any, mergedLoan);
        if (cancelled) return;
        const rb = round2(breakdown.totalBalance ?? breakdown.baseBalance);
        setFreshRemainingBalance(rb);

        const updateTypeNow = form.getValues('update_type');
        const amountNow = Number(form.getValues('amount') || 0);
        const newBalanceNow = updateTypeNow === 'add_charge' && amountNow > 0 ? round2(rb + amountNow) : rb;

        setCalculatedValues(prev => ({
          ...prev,
          currentBalance: rb,
          newBalance: newBalanceNow,
          newPayment: Number((data as any)?.monthly_payment ?? prev.newPayment) || prev.newPayment,
        }));
      } catch (e) {
        console.warn('LoanUpdateForm: no se pudo obtener remaining_balance actualizado, usando props.', e);
      } finally {
        if (!cancelled) setIsFetchingFreshBalance(false);
      }
    };

    fetchFreshRemainingBalance();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, loan?.id]);

  // Obtener cuotas del préstamo
  const fetchInstallments = useCallback(async () => {
    if (!loan?.id) return;
    try {
      // Se traen también los pagos y los abonos a capital: sin ellos la extensión de plazo
      // no puede saber qué cuotas están ABONADAS A MEDIAS ni cuánto capital ya se pagó por
      // fuera de las cuotas.
      const [{ data, error }, { data: payRows }, { data: capitalRows }] = await Promise.all([
        supabase.from('installments').select('*')
          .eq('loan_id', loan.id).order('installment_number', { ascending: true }),
        supabase.from('payments')
          .select('amount, principal_amount, interest_amount, due_date, superseded_at')
          .eq('loan_id', loan.id),
        supabase.from('capital_payments').select('amount').eq('loan_id', loan.id),
      ]);

      if (error) throw error;
      setInstallments(data || []);
      setLoanPayments((payRows || []) as RawPayment[]);
      setTotalCapitalPaid(
        (capitalRows || []).reduce((sum, cp) => sum + (Number(cp.amount) || 0), 0)
      );
    } catch (error) {
      console.error('Error obteniendo cuotas:', error);
    }
  }, [loan?.id]);

  useEffect(() => {
    if (isOpen && loan.id) {
      fetchInstallments();
    }
  }, [isOpen, loan.id, fetchInstallments]);

  // Refetch cuando PaymentForm u otro componente actualiza cuotas (ej. pago parcial de cargo)
  useEffect(() => {
    if (!isOpen || !loan?.id) return;
    const handler = (e: CustomEvent<{ loanId?: string }>) => {
      if (e.detail?.loanId === loan.id) fetchInstallments();
    };
    window.addEventListener('installmentsUpdated', handler as EventListener);
    return () => window.removeEventListener('installmentsUpdated', handler as EventListener);
  }, [isOpen, loan?.id, fetchInstallments]);

  // Calcular próxima fecha de pago desde installments + payments (misma lógica que Detalles) al abrir el modal
  useEffect(() => {
    if (!isOpen || !loan?.id || isIndefiniteLoan) {
      setLocalNextPaymentDate(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const [instRes, payRes] = await Promise.all([
        supabase.from('installments').select('id, loan_id, due_date, installment_number, principal_amount, interest_amount, total_amount, amount, is_paid').eq('loan_id', loan.id),
        supabase.from('payments').select('id, loan_id, due_date, amount, principal_amount, interest_amount, payment_date, payment_time_local, created_at').eq('loan_id', loan.id)
      ]);
      if (cancelled || instRes.error || payRes.error) return;
      const due = getFirstUnpaidDueDate(instRes.data || [], payRes.data || []);
      if (!cancelled) setLocalNextPaymentDate(due);
    })();
    return () => { cancelled = true; };
  }, [isOpen, loan?.id, isIndefiniteLoan]);

  // Observar el tipo de actualización
  const updateType = useWatch({
    control: form.control,
    name: 'update_type'
  });

  // Si el préstamo es indefinido, NO permitir extensión de plazo.
  // Si por estado previo quedó seleccionado, forzarlo a "Agregar Cargo".
  useEffect(() => {
    if (!isOpen) return;
    if (!isIndefiniteLoan) return;
    if (updateType === 'term_extension') {
      form.setValue('update_type', 'add_charge' as any);
      form.clearErrors('additional_months' as any);
      toast.error('No puedes usar "Extensión de Plazo" en un préstamo indefinido.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isIndefiniteLoan, updateType]);

  // Calcular desglose para saldar préstamo
  useEffect(() => {
    if (isOpen && loan.id && updateType === 'settle_loan') {
      const calculateSettleBreakdown = async () => {
        try {

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

          // remaining_balance (sin mora) como fuente de verdad cuando exista
          const remainingFromDb =
            (freshRemainingBalance !== null && freshRemainingBalance !== undefined)
              ? freshRemainingBalance
              : (loan.remaining_balance !== null && loan.remaining_balance !== undefined
                  ? Number(loan.remaining_balance)
                  : null);
          
          // Para préstamos indefinidos, el capital pendiente debe incluir el capital base + cargos pendientes
          if ((loan.amortization_type || '').toLowerCase() === 'indefinite') {
            // 1) Cargos pendientes (principal puro)
            const unpaidChargesAmountRaw = round2(
              installments
                .filter(inst => {
                  const isCharge = Math.abs(inst.interest_amount || 0) < 0.01 &&
                    Math.abs((inst.principal_amount || 0) - (inst.total_amount || 0)) < 0.01;
                  return isCharge && !inst.is_paid;
                })
                .reduce((sum, inst) => sum + Number((inst.total_amount ?? inst.amount ?? inst.principal_amount) || 0), 0)
            );

            // 2) Interés pendiente: usar remaining_balance (BD) como fuente de verdad cuando exista
            if (remainingFromDb !== null) {
              // remaining_balance = capital + cargos + interés (mora se suma aparte en lateFeePending)
              // IMPORTANTE: si por algún motivo la lista de cuotas contiene “cargos” inconsistentes
              // (ej. de otro estado/trigger) y el remaining_balance de BD no los refleja,
              // priorizamos BD para evitar inflar el capital pendiente.
              const baseCapital = round2(Number(loan.amount || 0));
              const maxNonPrincipal = round2(Math.max(0, Number(remainingFromDb) - baseCapital));

              // Si los cargos detectados exceden lo que “cabe” en remaining_balance - capital base,
              // asumimos que están stale/mal clasificados y los ignoramos.
              const unpaidChargesAmount =
                unpaidChargesAmountRaw > (maxNonPrincipal + 0.01)
                  ? 0
                  : unpaidChargesAmountRaw;

              // 3) Capital pendiente = capital base + cargos pendientes (si aplican)
              capitalPending = round2(baseCapital + unpaidChargesAmount);

              // 4) Interés pendiente = restante - (capital + cargos)
              interestPending = round2(Math.max(0, Number(remainingFromDb) - capitalPending));
            } else {
              // Fallback: calcular interés pendiente dinámicamente (asegurando que siempre haya 1 cuota pendiente)
              const interestPerPayment = (Number(loan.amount || 0) * Number(loan.interest_rate || 0)) / 100;
              // En fallback, los cargos se consideran capital pendiente si existen
              capitalPending = round2(Number(loan.amount || 0) + unpaidChargesAmountRaw);

              if (loan.start_date && interestPerPayment > 0) {
                const [startYear, startMonth, startDay] = loan.start_date.split('-').map(Number);
                const startDate = new Date(startYear, startMonth - 1, startDay);
                const currentDate = getCurrentDateInSantoDomingo();

                const monthsElapsed = Math.max(0,
                  (currentDate.getFullYear() - startDate.getFullYear()) * 12 +
                  (currentDate.getMonth() - startDate.getMonth())
                );

                // En indefinidos siempre existe una próxima cuota de interés.
                const paidCount = (payments || []).filter(p => (p.interest_amount || 0) > 0.01).length;
                const totalExpectedInstallments = Math.max(paidCount + 1, monthsElapsed + 1);
                const unpaidCount = Math.max(1, totalExpectedInstallments - paidCount);
                interestPending = round2(unpaidCount * interestPerPayment);
              } else {
                // Si no hay start_date, usar cuotas vs pagos (simple)
                const totalInterestFromInstallments = installments.reduce((sum, inst) => sum + (inst.interest_amount || 0), 0);
                const totalPaidInterest = payments?.reduce((sum, payment) => sum + (payment.interest_amount || 0), 0) || 0;
                interestPending = round2(Math.max(0, totalInterestFromInstallments - totalPaidInterest));
              }
            }
          } else {
            // Para préstamos con plazo fijo, usar la lógica original
            // Sumar el capital e interés de todas las cuotas
            const totalCapitalFromInstallments = installments.reduce((sum, inst) => sum + (inst.principal_amount || 0), 0);
            const totalInterestFromInstallments = installments.reduce((sum, inst) => sum + (inst.interest_amount || 0), 0);
            
            // Calcular cuánto capital e interés se han pagado desde los pagos
            const totalPaidCapital = payments?.reduce((sum, payment) => sum + (payment.principal_amount || 0), 0) || 0;
            const totalPaidInterest = payments?.reduce((sum, payment) => sum + (payment.interest_amount || 0), 0) || 0;
            
            
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

            // 🔒 Fuente de verdad: si tenemos remaining_balance (BD) y no coincide con capital+interés calculados,
            // ajustamos para que el total sea consistente con el balance restante real.
            // Esto evita casos donde las cuotas/principal_amount estén desfasadas y “Saldar” muestre un capital distinto.
            if (remainingFromDb !== null) {
              const calculatedTotal = round2(capitalPending + interestPending);
              if (Math.abs(calculatedTotal - Number(remainingFromDb)) > 0.01) {
                // Preferimos mantener el interés calculado (suele ser más estable) y ajustar capital.
                let adjustedCapital = round2(Number(remainingFromDb) - round2(interestPending));
                if (adjustedCapital < 0) {
                  // Si el interés excede el balance, todo es interés.
                  interestPending = round2(Number(remainingFromDb));
                  adjustedCapital = 0;
                }
                capitalPending = round2(adjustedCapital);
              }
            }
          }

          // Mora pendiente
          const lateFeePending = currentLateFee || 0;

          // Total a saldar
          const totalToSettle = capitalPending + interestPending + lateFeePending;

          const breakdown = {
            capitalPending: round2(capitalPending),
            interestPending: round2(interestPending),
            lateFeePending: round2(lateFeePending),
            totalToSettle: round2(totalToSettle)
          };

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
  }, [isOpen, loan.id, loan.amount, loan.remaining_balance, freshRemainingBalance, loan.amortization_type, loan.interest_rate, loan.start_date, installments, currentLateFee, updateType]);

  // Calcular interés pendiente para préstamos indefinidos
  useEffect(() => {
    if (isOpen && loan.id && (loan.amortization_type || '').toLowerCase() === 'indefinite') {
      calculatePendingInterestForIndefinite();
    } else {
      setPendingInterestForIndefinite(0);
    }
  }, [isOpen, loan.id, loan.amortization_type, loan.start_date, installments]);

  // Resetear flag de balance calculado cuando se abre el modal
  useEffect(() => {
    if (isOpen) {
      setBalanceCalculated(false);
    }
  }, [isOpen]);

  // Calcular capital pendiente (necesario para calcular balance actual correctamente)
  useEffect(() => {
    if (isOpen && loan.id) {
      const calculatePendingCapital = async () => {
        try {
          // ✅ Para ABONO A CAPITAL: el capital pendiente debe EXCLUIR cargos.
          // No usar principal_amount/interest_amount del pago (pueden quedar desfasados tras abonos a capital).
          // Usamos `amount` por `due_date` y aplicamos interés primero según `installments`.
          const { data: payments, error: paymentsError } = await supabase
            .from('payments')
            .select('amount, due_date')
            .eq('loan_id', loan.id);

          if (paymentsError) throw paymentsError;

          // Obtener todos los abonos a capital anteriores
          const { data: capitalPayments, error: capitalPaymentsError } = await supabase
            .from('capital_payments')
            .select('amount')
            .eq('loan_id', loan.id);

          if (capitalPaymentsError) throw capitalPaymentsError;

          const round2 = (v: number) => Math.round((Number(v || 0) * 100)) / 100;
          const isChargeInst = (inst: any) =>
            Math.abs(Number(inst?.interest_amount || 0)) < 0.01 &&
            Math.abs(Number(inst?.principal_amount || 0) - Number(inst?.total_amount || inst?.amount || 0)) < 0.01;

          // Total de abonos a capital anteriores
          const totalCapitalPayments = (capitalPayments || []).reduce((sum, cp) => sum + (cp.amount || 0), 0);

          // Pagos por due_date (monto total pagado a esa cuota)
          const paidByDue = new Map<string, number>();
          for (const p of payments || []) {
            const due = (p as any)?.due_date ? String((p as any).due_date).split('T')[0] : null;
            if (!due) continue;
            paidByDue.set(due, round2((paidByDue.get(due) || 0) + (Number((p as any).amount) || 0)));
          }

          // Capital pagado (solo cuotas regulares) = max(0, pago - interésEsperado), limitado a principalEsperado
          const principalPaidRegular = round2(
            (installments || [])
              .filter(inst => !isChargeInst(inst))
              .reduce((sum, inst) => {
                const due = inst?.due_date ? String(inst.due_date).split('T')[0] : null;
                if (!due) return sum;
                const totalPaid = paidByDue.get(due) || 0;
                const expectedInterest = round2(Number(inst.interest_amount || 0));
                const expectedPrincipal = round2(Number(inst.principal_amount || 0));
                const principalPaid = Math.min(expectedPrincipal, Math.max(0, round2(totalPaid - expectedInterest)));
                return sum + principalPaid;
              }, 0)
          );
          
          // ✅ Capital pendiente (para ABONO A CAPITAL) = SOLO principal del préstamo.
          // Los cargos NO deben influir en capital pendiente (los cargos no cambian con abonos a capital).
          let calculatedPendingCapital: number;
          if ((loan.amortization_type || '').toLowerCase() === 'indefinite') {
            // CORRECCIÓN: Para préstamos indefinidos, el capital pendiente es directamente loan.amount
            // porque loan.amount ya refleja el capital después de los abonos (se actualiza en LoanUpdateForm cuando se hace un abono)
            // No incluir cargos aquí.
            calculatedPendingCapital = Math.round((loan.amount) * 100) / 100;
          } else {
            // Calcular cargos pendientes (NO deben incluirse en el capital disponible para abono a capital)
            // Nota: normalmente los cargos tienen un due_date distinto a las cuotas regulares, así que podemos
            // medir pagos a cargos por due_date (monto) sin mezclar con cuotas.
            const unpaidChargesAmount = round2((installments || [])
              .filter(inst => isChargeInst(inst))
              .reduce((sum, inst) => {
                const due = inst?.due_date ? String(inst.due_date).split('T')[0] : null;
                const chargeTotal = round2(Number((inst as any).total_amount || inst.amount || 0));
                const paid = due ? (paidByDue.get(due) || 0) : 0;
                return sum + Math.max(0, round2(chargeTotal - paid));
              }, 0));

            // Para préstamos con plazo fijo:
            // NO usar la suma de capital por cuotas, porque por redondeos de la cuota mensual puede dar
            // discrepancias (ej. 10,000 → 10,002). El capital pendiente debe partir de loan.amount.
            const capitalPendingFromRegular = Math.round(
              Math.max(0, (loan.amount || 0) - (principalPaidRegular || 0) - (totalCapitalPayments || 0)) * 100
            ) / 100;
            
            // ✅ SOLO EN ABONO A CAPITAL: excluir cargos pendientes del capital disponible
            calculatedPendingCapital = round2(Math.max(0, round2(capitalPendingFromRegular) - unpaidChargesAmount));
          }
          
          setPendingCapital(calculatedPendingCapital);
          setOriginalPendingCapital(calculatedPendingCapital); // Guardar el capital pendiente original para calcular penalidad
        } catch (error) {
          console.error('Error calculando capital pendiente:', error);
          // Fallback: nunca usar remaining_balance (incluye cargos/interés). Preferir principal (loan.amount).
          setPendingCapital(loan.amount);
        }
      };

      calculatePendingCapital();
    }
  }, [isOpen, loan.id, form.watch('update_type'), installments]);

  // Calcular monto de penalidad cuando cambia el porcentaje
  // IMPORTANTE: La penalidad se calcula sobre el capital pendiente ORIGINAL (antes del abono)
  // Usamos originalPendingCapital, no pendingCapital, para asegurar que siempre use el valor original
  useEffect(() => {
    const updateType = form.watch('update_type');
    const isPenalty = form.watch('is_penalty');
    const penaltyPercentage = form.watch('penalty_percentage');

    if (updateType === 'capital_payment' && isPenalty && penaltyPercentage && penaltyPercentage > 0 && originalPendingCapital > 0) {
      // La penalidad siempre se calcula sobre el capital pendiente original (originalPendingCapital)
      // No sobre el nuevo capital pendiente después del abono
      const calculatedPenalty = (originalPendingCapital * penaltyPercentage) / 100;
      setPenaltyAmount(Math.round(calculatedPenalty * 100) / 100);
    } else {
      setPenaltyAmount(0);
    }
  }, [form.watch('is_penalty'), form.watch('penalty_percentage'), originalPendingCapital, form.watch('update_type')]);

  // Calcular vista previa del impacto del abono a capital
  useEffect(() => {
    const updateType = form.watch('update_type');
    const capitalPaymentAmount = form.watch('capital_payment_amount');
    const keepInstallments = form.watch('keep_installments');
    const isPenalty = form.watch('is_penalty');
    const penaltyAmountValue = penaltyAmount || 0;

    // IMPORTANTE: Usar originalPendingCapital siempre, no pendingCapital
    // La penalidad se calcula sobre el capital original, y la vista previa también
    if (updateType === 'capital_payment' && capitalPaymentAmount && capitalPaymentAmount > 0 && originalPendingCapital > 0) {
      const calculatePreview = () => {
        // Función auxiliar para obtener la unidad de tiempo según la frecuencia de pago
        const getPaymentFrequencyUnit = (frequency: string) => {
          switch (frequency) {
            case 'daily':
              return { singular: 'día', plural: 'días', cuota: 'diaria', cuotas: 'diarias' };
            case 'weekly':
              return { singular: 'semana', plural: 'semanas', cuota: 'semanal', cuotas: 'semanales' };
            case 'biweekly':
              return { singular: 'quincena', plural: 'quincenas', cuota: 'quincenal', cuotas: 'quincenales' };
            case 'monthly':
            default:
              return { singular: 'mes', plural: 'meses', cuota: 'mensual', cuotas: 'mensuales' };
          }
        };
        
        const paymentFrequency = loan.payment_frequency || 'monthly';
        const frequencyUnit = getPaymentFrequencyUnit(paymentFrequency);
        
        // Si hay penalidad, el monto total del abono incluye la penalidad
        const totalPaymentAmount = capitalPaymentAmount + (isPenalty ? penaltyAmountValue : 0);
        
        if (capitalPaymentAmount > originalPendingCapital) {
          // El monto excede el capital pendiente, no calcular preview
          setCapitalPaymentPreview({
            newPendingCapital: 0,
            installmentsImpact: 'El monto excede el capital pendiente',
            newInstallmentAmount: 0,
            newInstallmentCount: 0
          });
          return;
        }

        // El nuevo capital pendiente se reduce solo por el capitalPaymentAmount (sin incluir penalidad)
        // La penalidad será un cargo adicional
        // IMPORTANTE: Usar originalPendingCapital, no pendingCapital
        const newPendingCapital = originalPendingCapital - capitalPaymentAmount;
        
        if ((loan.amortization_type || '').toLowerCase() === 'indefinite') {
          // Para préstamos indefinidos, el interés se recalcula con el nuevo capital
          const newInterestPerPayment = (newPendingCapital * loan.interest_rate) / 100;
          const currentInterestPerPayment = (loan.amount * loan.interest_rate) / 100;
          
          setCapitalPaymentPreview({
            newPendingCapital,
            installmentsImpact: keepInstallments 
              ? `Las cuotas ${frequencyUnit.cuotas} de interés se reducirán de RD$${currentInterestPerPayment.toFixed(2)} a RD$${newInterestPerPayment.toFixed(2)}`
              : `Las cuotas ${frequencyUnit.cuotas} de interés se reducirán a RD$${newInterestPerPayment.toFixed(2)}`,
            newInstallmentAmount: newInterestPerPayment,
            newInstallmentCount: 0 // No aplica para indefinidos
          });
        } else {
          // Para préstamos con plazo fijo
          const unpaidInstallments = installments.filter(inst => !inst.is_paid);
          const remainingInstallmentsCount = unpaidInstallments.length;

          if (keepInstallments) {
            // Mantener número de cuotas: recalcular el monto de cada cuota
            const interestPerPayment = (newPendingCapital * loan.interest_rate) / 100;
            const principalPerPayment = remainingInstallmentsCount > 0 ? newPendingCapital / remainingInstallmentsCount : 0;
            const newInstallmentAmount = interestPerPayment + principalPerPayment;
            const currentInstallmentAmount = loan.monthly_payment;
            
            setCapitalPaymentPreview({
              newPendingCapital,
              installmentsImpact: `Las ${remainingInstallmentsCount} cuotas restantes se reducirán de RD$${currentInstallmentAmount.toFixed(2)} a RD$${newInstallmentAmount.toFixed(2)} cada una`,
              newInstallmentAmount,
              newInstallmentCount: remainingInstallmentsCount
            });
          } else {
            // Mantener monto de cuota: reducir número de cuotas
            const interestPerPayment = (newPendingCapital * loan.interest_rate) / 100;
            const principalPerPayment = loan.monthly_payment - (loan.amount * loan.interest_rate / 100);
            const newInstallmentCount = principalPerPayment > 0 ? Math.ceil(newPendingCapital / principalPerPayment) : remainingInstallmentsCount;
            const reductionInInstallments = Math.max(0, remainingInstallmentsCount - newInstallmentCount);
            
            const timeUnit = reductionInInstallments === 1 ? frequencyUnit.singular : frequencyUnit.plural;
            
            setCapitalPaymentPreview({
              newPendingCapital,
              installmentsImpact: reductionInInstallments > 0
                ? `Se reducirán ${reductionInInstallments} cuota(s). El préstamo finalizará ${reductionInInstallments} ${timeUnit} antes.`
                : `El número de cuotas se mantendrá en ${remainingInstallmentsCount}`,
              newInstallmentAmount: loan.monthly_payment,
              newInstallmentCount
            });
          }
        }
      };

      calculatePreview();
    } else {
      // Resetear preview
      setCapitalPaymentPreview({
        newPendingCapital: 0,
        installmentsImpact: '',
        newInstallmentAmount: 0,
        newInstallmentCount: 0
      });
    }
  }, [form.watch('capital_payment_amount'), form.watch('keep_installments'), form.watch('is_penalty'), penaltyAmount, originalPendingCapital, installments, loan, form.watch('update_type')]);

  // Calcular cuotas vencidas para validación de abono a capital
  const overdueInstallmentsCount = useMemo(() => {
    if (form.watch('update_type') !== 'capital_payment') return 0;

    const today = getCurrentDateInSantoDomingo();
    const todayDateOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const gracePeriod = (loan as any).grace_period_days || 0;

    // Para préstamos indefinidos, las cuotas vencidas pueden ser dinámicas (no en DB).
    // Se verifica directamente si next_payment_date ya pasó el período de gracia.
    if (isIndefiniteLoan) {
      const effectiveNext = displayNextPaymentDate ?? loan.next_payment_date ?? '';
      if (effectiveNext) {
        const [ny, nm, nd] = effectiveNext.split('T')[0].split('-').map(Number);
        const nextDate = new Date(ny, nm - 1, nd);
        const daysPast = Math.floor((todayDateOnly.getTime() - nextDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysPast > gracePeriod) return 1; // Al menos una cuota vencida
      }
    }

    return installments.filter(inst => {
      if (inst.is_paid) return false;

      const dueDateStr = inst.due_date?.split('T')[0];
      if (!dueDateStr) return false;

      const [dueYear, dueMonth, dueDay] = dueDateStr.split('-').map(Number);
      const dueDate = new Date(dueYear, dueMonth - 1, dueDay);
      const dueDateOnly = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
      const daysPast = Math.floor((todayDateOnly.getTime() - dueDateOnly.getTime()) / (1000 * 60 * 60 * 24));

      return daysPast > gracePeriod;
    }).length;
  }, [form.watch('update_type'), installments, isIndefiniteLoan, displayNextPaymentDate, loan]);

  // Función para calcular las cuotas futuras después del abono
  const calculatePreviewInstallments = () => {
    const capitalPaymentAmount = form.watch('capital_payment_amount') || 0;
    const keepInstallments = form.watch('keep_installments') || false;
    const isPenalty = form.watch('is_penalty') || false;
    
    if (capitalPaymentAmount <= 0 || originalPendingCapital <= 0) {
      return [];
    }

    const newPendingCapital = originalPendingCapital - capitalPaymentAmount;
    
    // IMPORTANTE: Separar cuotas regulares de cargos
    // Los cargos NO se recalculan, solo las cuotas regulares
    const unpaidRegularInstallments = installments.filter(inst => {
      const isCharge = Math.abs(inst.interest_amount || 0) < 0.01 && 
                      Math.abs((inst.principal_amount || 0) - (inst.total_amount || 0)) < 0.01;
      return !inst.is_paid && !isCharge; // Solo cuotas regulares no pagadas
    });
    
    // Obtener cargos no pagados (NO se recalculan, se mantienen como están)
    const unpaidCharges = installments.filter(inst => {
      const isCharge = Math.abs(inst.interest_amount || 0) < 0.01 && 
                      Math.abs((inst.principal_amount || 0) - (inst.total_amount || 0)) < 0.01;
      return isCharge && !inst.is_paid;
    });
    
    const remainingInstallmentsCount = unpaidRegularInstallments.length;

    if ((loan.amortization_type || '').toLowerCase() === 'indefinite') {
      // Para préstamos indefinidos: solo interés. Si no hay cuotas regulares en BD, generar futuras con nuevo monto.
      const newInterestPerPayment = (newPendingCapital * loan.interest_rate) / 100;
      let previewInsts: any[] = [];

      if (unpaidRegularInstallments.length > 0) {
        previewInsts = unpaidRegularInstallments.map((inst) => ({
          installment_number: inst.installment_number,
          due_date: inst.due_date,
          interest_amount: newInterestPerPayment,
          principal_amount: 0,
          total_amount: newInterestPerPayment,
          is_paid: false,
          description: `Cuota ${inst.installment_number} - Interés recalculado`
        }));
      } else {
        // Indefinidos a menudo no tienen cuotas futuras en BD; generar las próximas 12 con el nuevo interés
        const freq = (loan.payment_frequency || 'monthly').toLowerCase();
        const nextStr = loan.next_payment_date?.split?.('T')?.[0];
        const startStr = loan.start_date?.split?.('T')?.[0];
        const baseStr = nextStr || startStr;
        if (baseStr) {
          const [by, bm, bd] = baseStr.split('-').map(Number);
          const baseDate = new Date(by, bm - 1, bd);
          for (let i = 0; i < 12; i++) {
            const due = new Date(baseDate);
            if (freq === 'monthly') due.setMonth(baseDate.getMonth() + i);
            else if (freq === 'weekly') due.setDate(baseDate.getDate() + i * 7);
            else if (freq === 'biweekly') due.setDate(baseDate.getDate() + i * 14);
            else due.setMonth(baseDate.getMonth() + i);
            const dueStr = due.getFullYear() + '-' + String(due.getMonth() + 1).padStart(2, '0') + '-' + String(due.getDate()).padStart(2, '0');
            previewInsts.push({
              installment_number: i + 1,
              due_date: dueStr,
              interest_amount: newInterestPerPayment,
              principal_amount: 0,
              total_amount: newInterestPerPayment,
              is_paid: false,
              description: `Cuota ${i + 1} - Interés después del abono`
            });
          }
        }
      }

      // IMPORTANTE: Agregar cargos no pagados como cuotas extra separadas
      unpaidCharges.forEach((charge) => {
        previewInsts.push({
          installment_number: previewInsts.length + 1,
          due_date: charge.due_date,
          interest_amount: 0,
          principal_amount: charge.total_amount,
          total_amount: charge.total_amount,
          is_paid: false,
          description: `Cargo extra - No afectado por abono`
        });
      });

      return previewInsts;
    } else {
      // Para préstamos con plazo fijo
      let previewInsts: any[] = [];

      if (keepInstallments) {
        // Mantener número de cuotas: recalcular el monto
        const interestPerPayment = (newPendingCapital * loan.interest_rate) / 100;
        const principalPerPayment = remainingInstallmentsCount > 0 ? newPendingCapital / remainingInstallmentsCount : 0;
        const newInstallmentAmount = interestPerPayment + principalPerPayment;

        unpaidRegularInstallments.forEach((inst) => {
          previewInsts.push({
            installment_number: inst.installment_number,
            due_date: inst.due_date,
            interest_amount: interestPerPayment,
            principal_amount: principalPerPayment,
            total_amount: newInstallmentAmount,
            is_paid: false,
            description: `Cuota ${inst.installment_number} recalculada`
          });
        });
      } else {
        // Mantener monto de cuota: reducir número de cuotas
        const interestPerPayment = (newPendingCapital * loan.interest_rate) / 100;
        const principalPerPayment = loan.monthly_payment - (loan.amount * loan.interest_rate / 100);
        const newInstallmentCount = principalPerPayment > 0 ? Math.ceil(newPendingCapital / principalPerPayment) : remainingInstallmentsCount;
        
        // Generar las nuevas cuotas (solo las que quedan)
        let remainingCapital = newPendingCapital;
        for (let i = 0; i < Math.min(newInstallmentCount, remainingInstallmentsCount) && remainingCapital > 0.01; i++) {
          const inst = unpaidRegularInstallments[i];
          const principalForThisPayment = Math.min(principalPerPayment, remainingCapital);
          const totalForThisPayment = interestPerPayment + principalForThisPayment;
          
          previewInsts.push({
            installment_number: inst ? inst.installment_number : remainingInstallmentsCount - newInstallmentCount + i + 1,
            due_date: inst ? inst.due_date : '',
            interest_amount: interestPerPayment,
            principal_amount: principalForThisPayment,
            total_amount: totalForThisPayment,
            is_paid: false,
            description: `Cuota ${inst ? inst.installment_number : remainingInstallmentsCount - newInstallmentCount + i + 1} recalculada`
          });
          
          remainingCapital -= principalForThisPayment;
        }
      }

      // IMPORTANTE: Agregar cargos no pagados como cuotas extra separadas
      // Los cargos NO se recalculan, mantienen su monto original
      unpaidCharges.forEach((charge) => {
        previewInsts.push({
          installment_number: charge.installment_number,
          due_date: charge.due_date,
          interest_amount: 0,
          principal_amount: charge.total_amount,
          total_amount: charge.total_amount,
          is_paid: false,
          description: `Cargo extra - No afectado por abono`
        });
      });

      // La penalidad NO es una cuota, se paga junto con el abono a capital
      // No se incluye en la tabla de cuotas

      return previewInsts;
    }
  };

  // Manejar click en botón de previsualización
  const handlePreviewTable = () => {
    const preview = calculatePreviewInstallments();
    setPreviewInstallments(preview);
    setShowPreviewTable(true);
  };

  // Obtener datos de la empresa para el recibo
  useEffect(() => {
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
    
    fetchCompanySettings();
  }, [companyId]);

  // Función para calcular el interés pendiente total para préstamos indefinidos
  const calculatePendingInterestForIndefinite = async () => {
    if (!loan || loan.amortization_type !== 'indefinite') {
      setPendingInterestForIndefinite(0);
      return;
    }

    try {
      if (!loan.start_date) {
        console.warn('🔍 LoanUpdateForm - calculatePendingInterestForIndefinite: Falta start_date, no se puede calcular');
        setPendingInterestForIndefinite(0);
        return;
      }

      // Calcular interés por cuota para préstamos indefinidos
      const interestPerPayment = (loan.amount * loan.interest_rate) / 100;

      // Calcular dinámicamente cuántas cuotas deberían existir desde start_date hasta hoy
      const [startYear, startMonth, startDay] = loan.start_date.split('-').map(Number);
      const startDate = new Date(startYear, startMonth - 1, startDay);
      const currentDate = getCurrentDateInSantoDomingo();

      // Calcular meses transcurridos desde el inicio
      const monthsElapsed = Math.max(0, 
        (currentDate.getFullYear() - startDate.getFullYear()) * 12 + 
        (currentDate.getMonth() - startDate.getMonth())
      );

      // Total de cuotas que deberían existir desde el inicio hasta hoy
      const totalExpectedInstallments = Math.max(1, monthsElapsed + 1); // +1 para incluir el mes actual

      // Calcular cuántas cuotas se han pagado desde los pagos
      let paidCount = 0;
      if (loan.id) {
        const { data: payments, error: paymentsError } = await supabase
          .from('payments')
          .select('interest_amount')
          .eq('loan_id', loan.id);

        if (!paymentsError && payments && payments.length > 0) {
          const totalInterestPaid = payments.reduce((sum, p) => sum + (p.interest_amount || 0), 0);
          paidCount = Math.floor(totalInterestPaid / interestPerPayment);

        }
      }

      // Cuotas pendientes = total esperadas - pagadas
      const unpaidCount = Math.max(0, totalExpectedInstallments - paidCount);

      // Calcular interés pendiente total
      const totalPendingInterest = unpaidCount * interestPerPayment;

      setPendingInterestForIndefinite(totalPendingInterest);
    } catch (error) {
      console.error('❌ Error calculando interés pendiente para préstamo indefinido en LoanUpdateForm:', error);
      setPendingInterestForIndefinite(0);
    }
  };

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
            // Para préstamos indefinidos: calcular next_payment_date real desde pagos,
            // igual que LoanDetailsView. El valor en DB puede estar desactualizado y
            // haría que todas las cuotas parezcan pagadas (mora = 0).
            let effectiveNextPaymentDate = loan.next_payment_date;

            if (isIndefiniteLoan && loan.start_date) {
              const addPeriodIso = (iso: string, freq: string) => {
                const [yy, mm, dd] = String(iso || '').split('T')[0].split('-').map(Number);
                if (!yy || !mm || !dd) return iso;
                const base = new Date(yy, mm - 1, dd);
                const dt = new Date(base);
                switch (String(freq || 'monthly').toLowerCase()) {
                  case 'daily': dt.setDate(dt.getDate() + 1); break;
                  case 'weekly': dt.setDate(dt.getDate() + 7); break;
                  case 'biweekly': dt.setDate(dt.getDate() + 14); break;
                  default: dt.setFullYear(dt.getFullYear(), dt.getMonth() + 1, dt.getDate()); break;
                }
                return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
              };

              const { data: payRows } = await supabase
                .from('payments')
                .select('amount, interest_amount, due_date')
                .eq('loan_id', loan.id);

              const interestPerPayment =
                (Number(loan.monthly_payment || 0) > 0.01)
                  ? Number(loan.monthly_payment)
                  : (Number(loan.amount || 0) * (Number(loan.interest_rate || 0) / 100));
              const tol = 0.05;
              const freq = String(loan.payment_frequency || 'monthly');
              const startIso = String(loan.start_date).split('T')[0];
              const firstDueFromStart = addPeriodIso(startIso, freq);

              const paidByDue = new Map<string, number>();
              for (const p of (payRows || []) as any[]) {
                const due = p?.due_date ? String(p.due_date).split('T')[0] : null;
                if (!due || due < firstDueFromStart) continue;
                const interest = Number(p?.interest_amount || 0) || 0;
                const amt = Number(p?.amount || 0) || 0;
                const paidValue = interest > 0.01 ? interest : (amt > 0.01 && amt <= (interestPerPayment * 1.25) ? amt : 0);
                if (paidValue <= 0.01) continue;
                paidByDue.set(due, (paidByDue.get(due) || 0) + paidValue);
              }

              const fullyPaid: string[] = [];
              let partialDue: string | null = null;
              for (const [due, paid] of paidByDue.entries()) {
                if (paid <= 0.01) continue;
                if (paid + tol < interestPerPayment) {
                  partialDue = !partialDue || due < partialDue ? due : partialDue;
                } else {
                  fullyPaid.push(due);
                }
              }
              const maxFull = fullyPaid.sort((a, b) => a.localeCompare(b)).slice(-1)[0] || null;
              effectiveNextPaymentDate = partialDue || (maxFull ? addPeriodIso(maxFull, freq) : firstDueFromStart);
              console.log('🔍 LoanUpdateForm: next_payment_date efectivo para indefinido:', effectiveNextPaymentDate);
              // Actualizar localNextPaymentDate para que LateFeeInfo use la fecha correcta.
              // El useEffect de localNextPaymentDate la deja en null para indefinidos, así que
              // la sobreescribimos aquí una vez que tenemos el valor calculado.
              setLocalNextPaymentDate(effectiveNextPaymentDate);
            }

            const loanData = {
              id: loan.id,
              remaining_balance: loan.remaining_balance,
              next_payment_date: effectiveNextPaymentDate,
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
                  return;
                }
              }
            }
            
            setCurrentLateFee(data.current_late_fee || 0);
          } else {
            // Fallback al valor del préstamo
            setCurrentLateFee(loan.current_late_fee || 0);
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

  const watchedValues = form.watch(['update_type', 'amount', 'additional_months', 'late_fee_amount', 'edit_amount', 'edit_interest_rate', 'edit_term_months', 'edit_amortization_type', 'settle_capital', 'settle_interest', 'settle_late_fee', 'capital_payment_amount', 'keep_installments', 'is_penalty', 'penalty_percentage']);

  // CORRECCIÓN (2026-08-31): la extensión de plazo tenía tres cálculos distintos para lo mismo
  // — el de la vista previa, el que se guardaba en `loans` y el que generaba las cuotas — y los
  // tres discrepaban. Ahora los tres pasan por `computeExtendedSchedule`, que es una función
  // pura: con las mismas entradas no puede dar resultados distintos.
  const buildExtensionSchedule = useCallback((additionalCount: number) => {
    if ((loan.amortization_type || '').toLowerCase() === 'indefinite') return null;
    return computeExtendedSchedule({
      amount: Number(loan.amount) || 0,
      interestRate: Number(loan.interest_rate) || 0,
      frequency: loan.payment_frequency || 'monthly',
      amortizationType: loan.amortization_type || 'simple',
      installments,
      payments: loanPayments,
      capitalPayments: totalCapitalPaid,
      // Regla de la empresa: la extensión es un recálculo nuevo y no arrastra los abonos
      // hechos a cuotas sin terminar de pagar. Los pagos se siguen pasando solo para poder
      // AVISAR en pantalla de cuánto se está descartando.
      ignorePriorPartialPayments: true,
      additionalCount,
      fallbackDueDate: String(loan.next_payment_date || '').split('T')[0],
    });
  }, [loan.amount, loan.interest_rate, loan.payment_frequency, loan.amortization_type,
      loan.next_payment_date, installments, loanPayments, totalCapitalPaid]);

  /** Vista previa de la extensión con el número de cuotas escrito ahora mismo. */
  const extensionPreview = useMemo(() => {
    if (form.watch('update_type') !== 'term_extension') return null;
    return buildExtensionSchedule(Number(form.watch('additional_months')) || 0);
  }, [watchedValues, buildExtensionSchedule]);

  useEffect(() => {
    const updateType = form.watch('update_type');
    if (updateType !== 'payment_agreement') {
      (async () => {
        await calculateUpdatedValues();
      })();
    }
  }, [watchedValues, pendingInterestForIndefinite, pendingCapital, installments]);

    // Resetear el campo de razón cuando cambia el tipo de actualización
  useEffect(() => {
    const updateType = form.watch('update_type');
    form.setValue('adjustment_reason', '');
    form.setValue('late_fee_amount', undefined);
    form.setValue('amount', undefined);
    form.setValue('capital_payment_amount', undefined);
    form.setValue('keep_installments', false);
    form.setValue('is_penalty', false);
    
    // Si es "capital_payment", establecer el valor por defecto del porcentaje de penalidad desde companySettings
    if (updateType === 'capital_payment' && authCompanySettings) {
      const defaultPenaltyPercentage = authCompanySettings.default_capital_payment_penalty_percentage;
      if (defaultPenaltyPercentage !== null && defaultPenaltyPercentage !== undefined) {
        form.setValue('penalty_percentage', defaultPenaltyPercentage, { shouldDirty: false });
      } else {
        form.setValue('penalty_percentage', undefined);
      }
    } else {
      form.setValue('penalty_percentage', undefined);
    }
    
    setPenaltyAmount(0);
    setOriginalPendingCapital(0);
    
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
  }, [form.watch('update_type'), isOpen, loan.id, authCompanySettings]);

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


  const calculateUpdatedValues = async () => {
    const [updateType, amount, additionalMonths, , editAmount, editInterestRate, editTermMonths, editAmortizationType, settleCapital, settleInterest, settleLateFee, capitalPaymentAmount, keepInstallments] = watchedValues;
    
    // ✅ Fuente de verdad: remaining_balance en BD.
    // Esto evita “cargar lento”/parpadeos y errores por cálculos temporales en el cliente.
    if (freshRemainingBalance === null || freshRemainingBalance === undefined) {
      // Aún no hay balance de BD. No calcular preview para evitar mostrar valores erróneos.
      return;
    }
    const currentBalance = round2(freshRemainingBalance);
    
    let newBalance = currentBalance;
    let newPayment = loan.monthly_payment;
    let newEndDate = '';
    let interestAmount = 0;
    let principalAmount = 0;

    switch (updateType) {
      case 'add_charge':
        if (amount) {
          // Agregar el monto del cargo al balance (sin redondear aún)
          newBalance = currentBalance + amount;
          principalAmount = amount;
        }
        break;
        
      case 'term_extension':
        if ((loan.amortization_type || '').toLowerCase() === 'indefinite') {
          // No aplica para indefinidos.
          break;
        }
        {
          // Se calcula también con 0 cuotas adicionales: eso re-amortiza el tramo pendiente sin
          // cambiar el plazo, que es la forma de reparar un préstamo extendido con la fórmula
          // vieja (cuotas de importes distintos). Antes este bloque estaba dentro de
          // `if (additionalMonths)` y la vista previa se quedaba con el balance sin recalcular.
          //
          // CORRECCIÓN (2026-08-31): antes se calculaba aquí con
          // `(monto × tasa × (term_months + adicionales)) / 100`, que:
          //   · ignoraba la frecuencia (en un quincenal cobraba el doble de interés),
          //   · usaba `term_months` mientras la vista previa mostraba "cuotas pendientes",
          //   · sumaba el balance mezclando capital pendiente con cuotas completas.
          // Ahora el reparto lo hace `computeExtendedSchedule`, la misma función que usa el
          // guardado, así que la vista previa y el resultado coinciden siempre.
          const schedule = buildExtensionSchedule(additionalMonths);
          if (schedule) {
            newPayment = schedule.representativePayment;
            newEndDate = schedule.newEndDate;
            // El balance sale de `newRemainingBalance`, que replica la fórmula de la base
            // (total + cargos − pagos). Antes se sumaba aquí a mano y no descontaba los pagos,
            // así que la vista previa y el préstamo guardado podían no coincidir.
            newBalance = schedule.newRemainingBalance;
          }
        }
        break;
        
      case 'settle_loan':
        // Calcular nuevo balance restando los montos pagados
        const capitalPaid = settleCapital || 0;
        const interestPaid = settleInterest || 0;
        newBalance = Math.max(0, currentBalance - capitalPaid - interestPaid);
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

      case 'capital_payment':
        // Calcular el nuevo balance después del abono a capital
        const capitalPaymentAmount = form.watch('capital_payment_amount') || 0;
        if (capitalPaymentAmount > 0 && originalPendingCapital > 0) {
          const capitalAfter = Math.max(0, originalPendingCapital - capitalPaymentAmount);
          
          // Calcular cargos no pagados para incluirlos en el balance
          const unpaidCharges = installments.filter(inst => {
            const isCharge = Math.abs(inst.interest_amount || 0) < 0.01 && 
                            Math.abs((inst.principal_amount || 0) - (inst.total_amount || 0)) < 0.01;
            return isCharge && !inst.is_paid;
          });
          const unpaidChargesAmount = unpaidCharges.reduce((sum, inst) => sum + (inst.total_amount || 0), 0);
          
          // Para préstamos con plazo fijo, recalcular el balance
          if (loan.amortization_type !== 'indefinite') {
            const unpaidInstallments = installments.filter(inst => !inst.is_paid && 
              !(Math.abs(inst.interest_amount || 0) < 0.01 && Math.abs((inst.principal_amount || 0) - (inst.total_amount || 0)) < 0.01));
            const remainingInstallmentsCount = unpaidInstallments.length;
            const keepInstallments = form.watch('keep_installments') || false;
            
            // Calcular interés pendiente después del abono
            let newInterestPending = 0;
            if (keepInstallments && remainingInstallmentsCount > 0) {
              // Mantener número de cuotas: recalcular el monto de cada cuota
              const newInterestPerPayment = (capitalAfter * loan.interest_rate) / 100;
              const newPrincipalPerPayment = capitalAfter / remainingInstallmentsCount;
              const newInstallmentAmount = newInterestPerPayment + newPrincipalPerPayment;
              newPayment = newInstallmentAmount;
              newInterestPending = newInterestPerPayment * remainingInstallmentsCount;
            } else {
              // Mantener monto de cuota: el balance se reduce por el capital abonado
              const interestPerPayment = (capitalAfter * loan.interest_rate) / 100;
              const originalPrincipalPerPayment = loan.monthly_payment - (loan.amount * loan.interest_rate / 100);
              const newInstallmentCount = originalPrincipalPerPayment > 0 ? Math.ceil(capitalAfter / originalPrincipalPerPayment) : remainingInstallmentsCount;
              newInterestPending = interestPerPayment * newInstallmentCount;
            }
            
            // Balance = Capital Pendiente + Interés Pendiente + Cargos no pagados
            newBalance = capitalAfter + newInterestPending + unpaidChargesAmount;
          } else {
            // CORRECCIÓN: Para préstamos indefinidos, el interés pendiente se recalcula con el nuevo capital
            // Nuevo interés por cuota = (capitalAfter * interés) / 100
            // El interés pendiente típicamente es 1 cuota (la próxima cuota pendiente)
            const newInterestPerPayment = (capitalAfter * loan.interest_rate) / 100;
            // Para préstamos indefinidos, típicamente hay 1 cuota pendiente de interés
            // Balance = Capital Pendiente + Interés Pendiente (nuevo) + Cargos no pagados
            newBalance = capitalAfter + newInterestPerPayment + unpaidChargesAmount;
          }
        }
        break;
    }

    // IMPORTANTE: Redondear a 2 decimales para evitar diferencias de redondeo
    setCalculatedValues({
      currentBalance: Math.round(currentBalance * 100) / 100,
      newBalance: Math.round(newBalance * 100) / 100,
      newPayment: Math.round(newPayment * 100) / 100,
      newEndDate,
      interestAmount: Math.round(interestAmount * 100) / 100,
      principalAmount: Math.round(principalAmount * 100) / 100
    });
  };

  // Función para generar el HTML del recibo según el formato
  const generateReceiptHTMLWithFormat = (format: string = 'LETTER'): string => {
    if (!lastSettlePaymentData) return '';
    
    const payment = lastSettlePaymentData.payment;
    const loan = lastSettlePaymentData.loan;
    // Manejar tanto 'client' como 'clients' (puede venir de diferentes consultas)
    const client = loan.client || (loan as any).clients;
    
    const getPaymentMethodLabel = (method: string) => {
      const methods: { [key: string]: string } = {
        cash: 'Efectivo',
        bank_transfer: 'Transferencia',
        check: 'Cheque',
        card: 'Tarjeta',
        online: 'En línea'
      };
      return methods[method] || method;
    };

    const getFormatStyles = (format: string) => {
      switch (format) {
        case 'POS58':
          return `
            * { box-sizing: border-box; }
            body { 
              font-family: 'Courier New', monospace; 
              margin: 0 !important; 
              padding: 0 !important;
              font-size: 12px;
              line-height: 1.2;
              color: #000;
              width: 100% !important;
              min-width: 100% !important;
            }
            .receipt-container {
              width: 100% !important;
              max-width: none !important;
              margin: 0 !important;
              padding: 5px !important;
              min-width: 100% !important;
            }
            .header { text-align: center; margin-bottom: 10px; width: 100%; }
            .receipt-title { font-size: 14px; font-weight: bold; margin-bottom: 5px; }
            .receipt-number { font-size: 10px; }
            .section { margin-bottom: 10px; width: 100%; }
            .section-title { font-weight: bold; font-size: 11px; margin-bottom: 5px; text-decoration: underline; }
            .info-row { margin-bottom: 3px; font-size: 10px; width: 100%; }
            .amount-section { margin: 10px 0; width: 100%; }
            .total-amount { font-size: 14px; font-weight: bold; text-align: center; margin-top: 10px; }
            .footer { margin-top: 15px; text-align: center; font-size: 9px; width: 100%; }
            @media print { 
              * { box-sizing: border-box; }
              body { 
                margin: 0 !important; 
                padding: 0 !important; 
                width: 100% !important;
                min-width: 100% !important;
              }
              .receipt-container { 
                border: none; 
                width: 100% !important; 
                max-width: none !important; 
                margin: 0 !important;
                min-width: 100% !important;
              }
              @page { 
                margin: 0 !important; 
                size: auto !important;
              }
            }
          `;
        
        case 'POS80':
          return `
            * { box-sizing: border-box; }
            body { 
              font-family: 'Courier New', monospace; 
              margin: 0 !important; 
              padding: 0 !important;
              font-size: 14px;
              line-height: 1.3;
              color: #000;
              width: 100% !important;
              min-width: 100% !important;
            }
            .receipt-container {
              width: 100% !important;
              max-width: none !important;
              margin: 0 !important;
              padding: 8px !important;
              min-width: 100% !important;
            }
            .header { text-align: center; margin-bottom: 15px; width: 100%; }
            .receipt-title { font-size: 16px; font-weight: bold; margin-bottom: 8px; }
            .receipt-number { font-size: 12px; }
            .section { margin-bottom: 15px; width: 100%; }
            .section-title { font-weight: bold; font-size: 13px; margin-bottom: 8px; text-decoration: underline; }
            .info-row { margin-bottom: 4px; font-size: 12px; width: 100%; }
            .amount-section { margin: 15px 0; width: 100%; }
            .total-amount { font-size: 16px; font-weight: bold; text-align: center; margin-top: 15px; }
            .footer { margin-top: 20px; text-align: center; font-size: 10px; width: 100%; }
            @media print { 
              * { box-sizing: border-box; }
              body { 
                margin: 0 !important; 
                padding: 0 !important; 
                width: 100% !important;
                min-width: 100% !important;
              }
              .receipt-container { 
                border: none; 
                width: 100% !important; 
                max-width: none !important; 
                margin: 0 !important;
                min-width: 100% !important;
              }
              @page { 
                margin: 0 !important; 
                size: auto !important;
              }
            }
          `;
        
        case 'LETTER':
          return `
            body { 
              font-family: Arial, sans-serif; 
              margin: 20px; 
              line-height: 1.6;
              color: #333;
            }
            .receipt-container {
              max-width: 8.5in;
              margin: 0 auto;
              padding: 30px;
              border: 1px solid #ddd;
              border-radius: 8px;
            }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
            .receipt-title { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
            .receipt-number { font-size: 14px; color: #666; }
            .section { margin-bottom: 25px; }
            .section-title { font-weight: bold; font-size: 16px; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 5px; }
            .info-row { display: flex; justify-content: space-between; margin-bottom: 8px; }
            .amount-section { background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .total-amount { font-size: 20px; font-weight: bold; color: #28a745; text-align: center; margin-top: 10px; }
            .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #eee; padding-top: 20px; }
            @media print { 
              body { margin: 0; }
              .receipt-container { border: none; max-width: 8.5in; }
            }
          `;
        
        case 'A4':
          return `
            body { 
              font-family: Arial, sans-serif; 
              margin: 20px; 
              line-height: 1.6;
              color: #333;
            }
            .receipt-container {
              max-width: 210mm;
              margin: 0 auto;
              padding: 30px;
              border: 1px solid #ddd;
              border-radius: 8px;
            }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
            .receipt-title { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
            .receipt-number { font-size: 14px; color: #666; }
            .section { margin-bottom: 25px; }
            .section-title { font-weight: bold; font-size: 16px; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 5px; }
            .info-row { display: flex; justify-content: space-between; margin-bottom: 8px; }
            .amount-section { background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .total-amount { font-size: 20px; font-weight: bold; color: #28a745; text-align: center; margin-top: 10px; }
            .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #eee; padding-top: 20px; }
            @media print { 
              body { margin: 0; }
              .receipt-container { border: none; max-width: 210mm; }
            }
          `;
        
        default:
          return '';
      }
    };

    const getFormatTitle = (format: string) => {
      switch (format) {
        case 'POS58': return 'RECIBO DE PAGO - SALDO - POS58';
        case 'POS80': return 'RECIBO DE PAGO - SALDO - POS80';
        case 'LETTER': return 'RECIBO DE PAGO - SALDO';
        case 'A4': return 'RECIBO DE PAGO - SALDO';
        default: return 'RECIBO DE PAGO - SALDO';
      }
    };

    return `
      <html>
        <head>
          <title>${getFormatTitle(format)} - ${client?.full_name || ''}</title>
          <style>
            ${getFormatStyles(format)}
          </style>
        </head>
        <body>
          <div class="receipt-container">
            <div class="header">
              ${companySettings ? `
                <div style="margin-bottom: 15px; text-align: center;">
                  <div style="font-size: ${format.includes('POS') ? '14px' : '18px'}; font-weight: bold; margin-bottom: 5px;">
                    ${companySettings.company_name || 'LA EMPRESA'}
                  </div>
                  ${companySettings.address ? `<div style="font-size: ${format.includes('POS') ? '9px' : '11px'}; margin-bottom: 2px;">${companySettings.address}</div>` : ''}
                  ${companySettings.tax_id ? `<div style="font-size: ${format.includes('POS') ? '9px' : '11px'}; margin-bottom: 5px;">RNC: ${companySettings.tax_id}</div>` : ''}
                </div>
                <hr style="border: none; border-top: 1px solid #000; margin: 10px 0;">
              ` : ''}
              <div class="receipt-title">${getFormatTitle(format)}</div>
              <div class="receipt-number">Recibo #${payment.id.slice(0, 8).toUpperCase()}</div>
              <div style="margin-top: 10px; font-size: ${format.includes('POS') ? '10px' : '14px'};">
                ${new Date(payment.created_at || payment.payment_date || lastSettlePaymentData.paymentDate).toLocaleDateString('es-ES', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </div>
            </div>

            <div class="section">
              <div class="section-title">INFORMACIÓN DEL CLIENTE</div>
              <div class="info-row">
                <span>Nombre: ${client?.full_name || 'N/A'}</span>
              </div>
              <div class="info-row">
                <span>Cédula: ${client?.dni || 'N/A'}</span>
              </div>
              ${client?.phone ? `<div class="info-row"><span>Teléfono: ${client.phone}</span></div>` : ''}
            </div>

            <div class="section">
              <div class="section-title">DETALLES DEL PRÉSTAMO</div>
              <div class="info-row">
                <span>Monto Original: RD$${loan.amount.toLocaleString()}</span>
              </div>
              <div class="info-row">
                <span>Tasa de Interés: ${loan.interest_rate}%</span>
              </div>
            </div>

            <div class="section">
              <div class="section-title">DETALLES DEL PAGO</div>
              <div class="info-row">
                <span>Fecha de Pago: ${formatDateStringForSantoDomingo(payment.payment_date)}</span>
              </div>
              <div class="info-row">
                <span>Método de Pago: ${getPaymentMethodLabel(payment.payment_method)}</span>
              </div>
              ${payment.reference_number ? `<div class="info-row"><span>Referencia: ${payment.reference_number}</span></div>` : ''}
            </div>

            <div class="amount-section">
              <div class="section-title">DESGLOSE DEL PAGO</div>
              <div class="info-row">
                <span>Pago a Principal: RD$${(payment.principal_amount || 0).toLocaleString()}</span>
              </div>
              <div class="info-row">
                <span>Pago a Intereses: RD$${(payment.interest_amount || 0).toLocaleString()}</span>
              </div>
              ${(payment.late_fee || 0) > 0 ? `<div class="info-row"><span>Cargo por Mora: RD$${(payment.late_fee || 0).toLocaleString()}</span></div>` : ''}
              <div class="total-amount">
                TOTAL: RD$${payment.amount.toLocaleString()}
              </div>
            </div>

            ${payment.notes ? `
            <div class="section">
              <div class="section-title">NOTAS</div>
              <div style="background-color: #f8f9fa; padding: 10px; border-radius: 5px;">
                ${payment.notes}
              </div>
            </div>
            ` : ''}

            <div class="footer">
              <p>Este documento es un comprobante oficial de pago. Préstamo saldado.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  };

  // Función para generar el HTML del recibo de abono a capital según el formato
  const generateCapitalPaymentReceiptHTML = (format: string = 'LETTER'): string => {
    if (!lastCapitalPaymentData) return '';
    
    const capitalPayment = lastCapitalPaymentData.capitalPayment;
    const loan = lastCapitalPaymentData.loan;
    const client = loan.clients || loan.client;
    
    const getFormatStyles = (format: string) => {
      switch (format) {
        case 'POS58':
          return `
            * { box-sizing: border-box; }
            body { 
              font-family: 'Courier New', monospace; 
              margin: 0 !important; 
              padding: 0 !important;
              font-size: 12px;
              line-height: 1.2;
              color: #000;
              width: 100% !important;
              min-width: 100% !important;
            }
            .receipt-container {
              width: 100% !important;
              max-width: none !important;
              margin: 0 !important;
              padding: 5px !important;
              min-width: 100% !important;
            }
            .header { text-align: center; margin-bottom: 10px; width: 100%; }
            .receipt-title { font-size: 14px; font-weight: bold; margin-bottom: 5px; }
            .receipt-number { font-size: 10px; }
            .section { margin-bottom: 10px; width: 100%; }
            .section-title { font-weight: bold; font-size: 11px; margin-bottom: 5px; text-decoration: underline; }
            .info-row { margin-bottom: 3px; font-size: 10px; width: 100%; }
            .amount-section { margin: 10px 0; width: 100%; }
            .total-amount { font-size: 14px; font-weight: bold; text-align: center; margin-top: 10px; }
            .footer { margin-top: 15px; text-align: center; font-size: 9px; width: 100%; }
            @media print { 
              * { box-sizing: border-box; }
              body { 
                margin: 0 !important; 
                padding: 0 !important; 
                width: 100% !important;
                min-width: 100% !important;
              }
              .receipt-container { 
                border: none; 
                width: 100% !important; 
                max-width: none !important; 
                margin: 0 !important;
                min-width: 100% !important;
              }
              @page { 
                margin: 0 !important; 
                size: auto !important;
              }
            }
          `;
        
        case 'POS80':
          return `
            * { box-sizing: border-box; }
            body { 
              font-family: 'Courier New', monospace; 
              margin: 0 !important; 
              padding: 0 !important;
              font-size: 14px;
              line-height: 1.3;
              color: #000;
              width: 100% !important;
              min-width: 100% !important;
            }
            .receipt-container {
              width: 100% !important;
              max-width: none !important;
              margin: 0 !important;
              padding: 8px !important;
              min-width: 100% !important;
            }
            .header { text-align: center; margin-bottom: 15px; width: 100%; }
            .receipt-title { font-size: 16px; font-weight: bold; margin-bottom: 8px; }
            .receipt-number { font-size: 12px; }
            .section { margin-bottom: 15px; width: 100%; }
            .section-title { font-weight: bold; font-size: 13px; margin-bottom: 8px; text-decoration: underline; }
            .info-row { margin-bottom: 4px; font-size: 12px; width: 100%; }
            .amount-section { margin: 15px 0; width: 100%; }
            .total-amount { font-size: 16px; font-weight: bold; text-align: center; margin-top: 15px; }
            .footer { margin-top: 20px; text-align: center; font-size: 10px; width: 100%; }
            @media print { 
              * { box-sizing: border-box; }
              body { 
                margin: 0 !important; 
                padding: 0 !important; 
                width: 100% !important;
                min-width: 100% !important;
              }
              .receipt-container { 
                border: none; 
                width: 100% !important; 
                max-width: none !important; 
                margin: 0 !important;
                min-width: 100% !important;
              }
              @page { 
                margin: 0 !important; 
                size: auto !important;
              }
            }
          `;
        
        case 'LETTER':
          return `
            body { 
              font-family: Arial, sans-serif; 
              margin: 20px; 
              line-height: 1.6;
              color: #333;
            }
            .receipt-container {
              max-width: 8.5in;
              margin: 0 auto;
              padding: 30px;
              border: 1px solid #ddd;
              border-radius: 8px;
            }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
            .receipt-title { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
            .receipt-number { font-size: 14px; color: #666; }
            .section { margin-bottom: 25px; }
            .section-title { font-weight: bold; font-size: 16px; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 5px; }
            .info-row { display: flex; justify-content: space-between; margin-bottom: 8px; }
            .amount-section { background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .total-amount { font-size: 20px; font-weight: bold; color: #28a745; text-align: center; margin-top: 10px; }
            .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #eee; padding-top: 20px; }
            @media print { 
              body { margin: 0; }
              .receipt-container { border: none; max-width: 8.5in; }
            }
          `;
        
        case 'A4':
          return `
            body { 
              font-family: Arial, sans-serif; 
              margin: 20px; 
              line-height: 1.6;
              color: #333;
            }
            .receipt-container {
              max-width: 210mm;
              margin: 0 auto;
              padding: 30px;
              border: 1px solid #ddd;
              border-radius: 8px;
            }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
            .receipt-title { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
            .receipt-number { font-size: 14px; color: #666; }
            .section { margin-bottom: 25px; }
            .section-title { font-weight: bold; font-size: 16px; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 5px; }
            .info-row { display: flex; justify-content: space-between; margin-bottom: 8px; }
            .amount-section { background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .total-amount { font-size: 20px; font-weight: bold; color: #28a745; text-align: center; margin-top: 10px; }
            .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #eee; padding-top: 20px; }
            @media print { 
              body { margin: 0; }
              .receipt-container { border: none; max-width: 210mm; }
            }
          `;
        
        default:
          return '';
      }
    };

    const getFormatTitle = (format: string) => {
      switch (format) {
        case 'POS58': return 'RECIBO DE ABONO A CAPITAL - POS58';
        case 'POS80': return 'RECIBO DE ABONO A CAPITAL - POS80';
        case 'LETTER': return 'RECIBO DE ABONO A CAPITAL';
        case 'A4': return 'RECIBO DE ABONO A CAPITAL';
        default: return 'RECIBO DE ABONO A CAPITAL';
      }
    };

    return `
      <html>
        <head>
          <title>${getFormatTitle(format)} - ${client?.full_name || ''}</title>
          <style>
            ${getFormatStyles(format)}
          </style>
        </head>
        <body>
          <div class="receipt-container">
            <div class="header">
              ${companySettings ? `
                <div style="margin-bottom: 15px; text-align: center;">
                  <div style="font-size: ${format.includes('POS') ? '14px' : '18px'}; font-weight: bold; margin-bottom: 5px;">
                    ${companySettings.company_name || 'LA EMPRESA'}
                  </div>
                  ${companySettings.address ? `<div style="font-size: ${format.includes('POS') ? '9px' : '11px'}; margin-bottom: 2px;">${companySettings.address}</div>` : ''}
                  ${companySettings.tax_id ? `<div style="font-size: ${format.includes('POS') ? '9px' : '11px'}; margin-bottom: 5px;">RNC: ${companySettings.tax_id}</div>` : ''}
                </div>
                <hr style="border: none; border-top: 1px solid #000; margin: 10px 0;">
              ` : ''}
              <div class="receipt-title">${getFormatTitle(format)}</div>
              <div class="receipt-number">Fecha: ${capitalPayment.paymentDate}</div>
            </div>

            <div class="section">
              <div class="section-title">INFORMACIÓN DEL CLIENTE</div>
              <div class="info-row">
                <span>Nombre: ${client?.full_name || 'N/A'}</span>
              </div>
              <div class="info-row">
                <span>Cédula: ${client?.dni || 'N/A'}</span>
              </div>
              ${client?.phone ? `<div class="info-row"><span>Teléfono: ${client.phone}</span></div>` : ''}
            </div>

            <div class="section">
              <div class="section-title">DETALLES DEL PRÉSTAMO</div>
              <div class="info-row">
                <span>Monto Original: RD$${loan.amount.toLocaleString()}</span>
              </div>
              <div class="info-row">
                <span>Tasa de Interés: ${loan.interest_rate}%</span>
              </div>
            </div>

            <div class="section">
              <div class="section-title">DETALLES DEL ABONO A CAPITAL</div>
              <div class="info-row">
                <span>Fecha: ${capitalPayment.paymentDate}</span>
              </div>
              <div class="info-row">
                <span>Capital pendiente antes: RD$${capitalPayment.capitalBefore.toLocaleString()}</span>
              </div>
              <div class="info-row">
                <span>Monto del abono: RD$${capitalPayment.amount.toLocaleString()}</span>
              </div>
              ${capitalPayment.penaltyAmount > 0 ? `
                <div class="info-row">
                  <span>Penalidad aplicada: RD$${capitalPayment.penaltyAmount.toLocaleString()}</span>
                </div>
              ` : ''}
              <div class="info-row">
                <span>Capital pendiente después: RD$${capitalPayment.capitalAfter.toLocaleString()}</span>
              </div>
              <div class="info-row">
                <span>Configuración de cuotas: ${capitalPayment.keepInstallments ? 'Mantener número de cuotas (reducir monto)' : 'Reducir número de cuotas (mantener monto)'}</span>
              </div>
              ${capitalPayment.adjustmentReason ? `
                <div class="info-row">
                  <span>Razón: ${capitalPayment.adjustmentReason}</span>
                </div>
              ` : ''}
            </div>

            <div class="amount-section">
              <div class="total-amount">
                TOTAL ABONADO: RD$${(capitalPayment.amount + (capitalPayment.penaltyAmount || 0)).toLocaleString()}
              </div>
              ${lastCapitalPaymentData.remainingBalance !== undefined ? `
                <div style="text-align: center; margin-top: 10px; font-size: ${format.includes('POS') ? '10px' : '14px'};">
                  Balance restante: RD$${lastCapitalPaymentData.remainingBalance.toLocaleString()}
                </div>
              ` : ''}
            </div>

            <div class="footer">
              <p>Este documento es un comprobante oficial de abono a capital.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  };

  const printReceipt = (format: string = 'LETTER') => {
    if (lastCapitalPaymentData) {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        const receiptHTML = generateCapitalPaymentReceiptHTML(format);
        printWindow.document.write(receiptHTML);
        printWindow.document.close();
        printWindow.print();
      }
      return;
    }
    
    if (!lastSettlePaymentData) return;
    
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      const receiptHTML = generateReceiptHTMLWithFormat(format);
      printWindow.document.write(receiptHTML);
      printWindow.document.close();
      printWindow.print();
    }
  };

  const downloadReceipt = (format: string = 'LETTER') => {
    if (lastCapitalPaymentData) {
      const receiptHTML = generateCapitalPaymentReceiptHTML(format);
      const client = lastCapitalPaymentData.loan.clients || lastCapitalPaymentData.loan.client;

      const blob = new Blob([receiptHTML], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `recibo_abono_capital_${client.full_name.replace(/\s+/g, '_')}_${new Date(lastCapitalPaymentData.capitalPayment.paymentDate).toISOString().split('T')[0]}_${format}.html`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return;
    }
    
    if (!lastSettlePaymentData) return;
    
    const receiptHTML = generateReceiptHTMLWithFormat(format);
    const client = lastSettlePaymentData.loan.client;

    const blob = new Blob([receiptHTML], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recibo_saldo_${client.full_name.replace(/\s+/g, '_')}_${new Date(lastSettlePaymentData.paymentDate || lastSettlePaymentData.payment.payment_date).toISOString().split('T')[0]}_${format}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const sendWhatsAppDirectly = async () => {
    // Manejar abono a capital primero
    if (lastCapitalPaymentData) {
      if (!companySettings) {
        toast.error('Error: No se encontraron los datos de la empresa');
        return;
      }

      try {
        const capitalPayment = lastCapitalPaymentData.capitalPayment;
        const loan = lastCapitalPaymentData.loan;
        const client = loan.clients || loan.client;
        
        if (!client) {
          toast.error('No se pudo obtener la información del cliente');
          return;
        }
        
        const receiptData = {
          companyName: companySettings?.company_name || 'LA EMPRESA',
          clientName: client?.full_name || 'Cliente',
          clientDni: client?.dni,
          paymentDate: capitalPayment.paymentDate,
          capitalPaymentAmount: capitalPayment.amount,
          penaltyAmount: capitalPayment.penaltyAmount || 0,
          capitalBefore: capitalPayment.capitalBefore,
          capitalAfter: capitalPayment.capitalAfter,
          loanAmount: loan.amount,
          remainingBalance: lastCapitalPaymentData.remainingBalance,
          interestRate: loan.interest_rate,
          nextPaymentDate: loan.next_payment_date,
          keepInstallments: capitalPayment.keepInstallments,
          adjustmentReason: capitalPayment.adjustmentReason
        };

        const receiptMessage = generateCapitalPaymentReceipt(receiptData);
        const clientPhone = client?.phone;
        
        if (!clientPhone) {
          toast.error('El cliente no tiene un número de teléfono registrado');
          return;
        }

        const formattedPhone = formatPhoneForWhatsApp(clientPhone);
        await openWhatsApp(formattedPhone, receiptMessage);
        toast.success('Recibo enviado por WhatsApp');
        setShowPrintFormatModal(false);
        setShowWhatsAppDialog(false);
        setLastCapitalPaymentData(null);
        onUpdate();
        onClose();
      } catch (error: any) {
        console.error('Error enviando recibo por WhatsApp:', error);
        toast.error('Error al enviar recibo por WhatsApp');
      }
      return;
    }

    if (!lastSettlePaymentData || !companySettings) {
      toast.error('Error: No se encontraron los datos necesarios');
      return;
    }

    try {
      const payment = lastSettlePaymentData.payment;
      const loan = lastSettlePaymentData.loan;
      // Manejar tanto 'client' como 'clients' (puede venir de diferentes consultas)
      let client = loan.client || (loan as any).clients;
      
      // Si es un array, tomar el primer elemento
      if (Array.isArray(client)) {
        client = client[0];
      }
      
      // Si el cliente no está disponible o no tiene teléfono, intentar obtenerlo desde la BD
      const clientIdToUse = lastSettlePaymentData.clientId || (loan as any).client_id;
      
      if (!client || !client.phone) {
        if (clientIdToUse) {
          const { data: clientInfo, error: clientError } = await supabase
            .from('clients')
            .select('id, full_name, dni, phone, email')
            .eq('id', clientIdToUse)
            .single();
          
          if (!clientError && clientInfo) {
            client = clientInfo;
          }
        }
      }
      
      if (!client) {
        toast.error('No se pudo obtener la información del cliente');
        return;
      }
      
      const receiptData = {
        companyName: companySettings?.company_name || 'LA EMPRESA',
        clientName: client?.full_name || 'Cliente',
        clientDni: client?.dni,
        paymentDate: formatDateStringForSantoDomingo(payment.payment_date),
        paymentAmount: payment.amount,
        principalAmount: payment.principal_amount || 0,
        interestAmount: payment.interest_amount || 0,
        lateFeeAmount: payment.late_fee || 0,
        paymentMethod: payment.payment_method || 'cash',
        loanAmount: loan.amount,
        remainingBalance: 0, // Préstamo saldado
        interestRate: loan.interest_rate,
        referenceNumber: payment.reference_number
      };

      const receiptMessage = generateLoanPaymentReceipt(receiptData);
      const clientPhone = client?.phone;
      
      if (!clientPhone) {
        toast.error('El cliente no tiene número de teléfono registrado');
        return;
      }

      const formattedPhone = formatPhoneForWhatsApp(clientPhone);
      await openWhatsApp(formattedPhone, receiptMessage);
      toast.success('Recibo enviado por WhatsApp');
    } catch (error: any) {
      console.error('Error enviando recibo por WhatsApp:', error);
      toast.error('Error al enviar recibo por WhatsApp');
    }
  };

  const handleClosePrintModalAndShowWhatsApp = (action?: (() => void) | React.MouseEvent) => {
    setIsClosingPrintModal(true);
    // Ejecutar la acción primero si existe y es una función (no un evento de React)
    if (action && typeof action === 'function' && !('target' in action)) {
      action();
    }
    // Cerrar el modal
    setShowPrintFormatModal(false);
    
    // Verificar si debe preguntar antes de enviar
    const askBeforeSend = companySettings?.ask_whatsapp_before_send !== false; // Por defecto true
    
    setTimeout(() => {
      if (askBeforeSend) {
        // Mostrar el diálogo de WhatsApp
        setShowWhatsAppDialog(true);
      } else {
        // Enviar directamente a WhatsApp
        sendWhatsAppDirectly();
      }
      setIsClosingPrintModal(false);
    }, 300);
  };

  const executeDeleteLoan = async (data: UpdateFormData) => {
    if (!user || !companyId) return;
    
    setLoading(true);
    try {
      const loanUpdates: any = {
        status: 'deleted',
        deleted_at: new Date().toISOString(),
        deleted_reason: data.adjustment_reason,
      };

      // Agregar notas de auditoría
      const auditNote = `${new Date().toLocaleDateString()} - delete_loan: ${data.adjustment_reason}`;
      loanUpdates.purpose = auditNote;
      
      // CRÍTICO: Preservar la fecha de inicio original
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
          change_type: 'status_change', // delete_loan no está permitido, usar status_change
          old_value: JSON.stringify({
            balance: loan.remaining_balance,
            payment: loan.monthly_payment,
            rate: loan.interest_rate
          }),
          new_value: JSON.stringify({
            balance: loan.remaining_balance,
            payment: loan.monthly_payment,
            rate: loan.interest_rate
          }),
          description: `Eliminar Préstamo: ${data.adjustment_reason || 'Sin razón especificada'}`,
          created_by: companyId,
        };
        
        const { error: historyInsertError } = await supabase
          .from('loan_history')
          .insert([historyData]);
        
        if (historyInsertError) {
          // Ignorar error si la tabla no existe
          console.log('Historial no disponible:', historyInsertError);
        }
      } catch (historyError) {
        console.error('Error registrando en historial:', historyError);
        // No fallar si el historial falla
      }

      toast.success('Préstamo eliminado exitosamente (recuperable por 2 meses)');
      onUpdate();
      onClose();
    } catch (error: any) {
      console.error('Error eliminando préstamo:', error);
      toast.error(`Error al eliminar préstamo: ${error.message || 'Error desconocido'}`);
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data: UpdateFormData) => {
    if (!user || !companyId) return;

    // Evitar múltiples envíos
    if (loading) return;
    
    const updateType = data.update_type;
    if (isIndefiniteLoan && updateType === 'term_extension') {
      toast.error('No puedes usar "Extensión de Plazo" en un préstamo indefinido.');
      return;
    }
    // Variable para guardar la fecha del pago cuando se salda un préstamo
    let settlePaymentDate: string | null = null;
    
    // Si es eliminar préstamo, primero verificar contraseña
    if (updateType === 'delete_loan') {
      setPendingFormData(data);
      setShowPasswordVerification(true);
      return;
    }
    
    setLoading(true);
    try {
      
      // Actualizar el préstamo según el tipo de actualización
      let loanUpdates: any = {};
      let chargePaymentIds: string[] = [];

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

          // CORRECCIÓN: Parsear la fecha como fecha local (no UTC) para evitar problemas de zona horaria
          // Parsear manualmente YYYY-MM-DD para crear fecha local en Santo Domingo
          const [chargeYear, chargeMonth, chargeDay] = data.charge_date.split('-').map(Number);
          const chargeDate = new Date(chargeYear, chargeMonth - 1, chargeDay); // month es 0-indexado, crear como fecha local
          
          if (isNaN(chargeDate.getTime())) {
            toast.error('La fecha del cargo no es válida');
            setLoading(false);
            return;
          }

          // Usar la fecha de vencimiento proporcionada, o calcularla como un día después de la fecha del cargo
          let dueDateString: string;
          if (data.charge_due_date) {
            // Parsear la fecha de vencimiento como fecha local
            const [dueYear, dueMonth, dueDay] = data.charge_due_date.split('-').map(Number);
            const dueDate = new Date(dueYear, dueMonth - 1, dueDay); // month es 0-indexado, crear como fecha local
            
            if (isNaN(dueDate.getTime())) {
              toast.error('La fecha de vencimiento no es válida');
              setLoading(false);
              return;
            }
            
            // Formatear como YYYY-MM-DD (fecha local, no UTC)
            dueDateString = `${dueYear}-${String(dueMonth).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`;
          } else {
            // Calcular la fecha de vencimiento como un día después de la fecha del cargo
            const newDueDate = new Date(chargeDate);
            newDueDate.setDate(newDueDate.getDate() + 1);
            
            // Formatear como YYYY-MM-DD (fecha local, no UTC)
            const dueYear = newDueDate.getFullYear();
            const dueMonth = String(newDueDate.getMonth() + 1).padStart(2, '0');
            const dueDay = String(newDueDate.getDate()).padStart(2, '0');
            dueDateString = `${dueYear}-${dueMonth}-${dueDay}`;
          }

          // Crear la nueva cuota con el cargo
          const newChargeInstallment = {
            loan_id: loan.id,
            installment_number: nextInstallmentNumber,
            due_date: dueDateString,
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

          // IMPORTANTE: Recalcular balance usando la misma lógica que LoanDetailsView
          // Obtener TODAS las cuotas actualizadas (incluyendo el nuevo cargo) y pagos para considerar pagos parciales
          const { data: updatedInstallments } = await supabase
            .from('installments')
            .select('id, principal_amount, interest_amount, total_amount, is_paid, due_date, installment_number')
            .eq('loan_id', loan.id);
          
          const { data: allPaymentsForBalanceCalc } = await supabase
            .from('payments')
            .select('amount, principal_amount, interest_amount, due_date')
            .eq('loan_id', loan.id);

          const round2 = (n: number) => Math.round(((Number.isFinite(n) ? n : 0) * 100)) / 100;
          const amortizationTypeLower = ((loan as any).amortization_type || loan.amortization_type || '').toLowerCase();
          const isIndefinite = amortizationTypeLower === 'indefinite';
          
          // Calcular capital pendiente desde TODAS las cuotas (considerando pagos parciales)
          const principalPendingTotals = (updatedInstallments || []).reduce((acc, inst) => {
            const originalPrincipal = inst.principal_amount || 0;
            const isCharge = Math.abs(inst.interest_amount || 0) < 0.01 && 
                            Math.abs(originalPrincipal - (inst.total_amount || 0)) < 0.01;
            
            let principalPaidForThisInstallment = 0;
            
            if (isCharge) {
              const chargeDueDate = inst.due_date?.split('T')[0];
              if (chargeDueDate) {
                const chargesWithSameDate = (updatedInstallments || []).filter(otherInst => {
                  const otherIsCharge = Math.abs(otherInst.interest_amount || 0) < 0.01 && 
                                       Math.abs((otherInst.principal_amount || 0) - (otherInst.total_amount || 0)) < 0.01;
                  return otherIsCharge && otherInst.due_date?.split('T')[0] === chargeDueDate;
                }).sort((a, b) => (a.installment_number || 0) - (b.installment_number || 0));
                
                const paymentsForCharges = (allPaymentsForBalanceCalc || []).filter(p => {
                  const paymentDueDate = p.due_date?.split('T')[0];
                  const hasNoInterest = Math.abs(p.interest_amount || 0) < 0.01;
                  return paymentDueDate === chargeDueDate && hasNoInterest;
                });
                
                const totalPaidForDate = paymentsForCharges.reduce((s, p) => s + (p.principal_amount || 0), 0);
                const chargeIndex = chargesWithSameDate.findIndex(c => c.id === inst.id);
                
                if (chargeIndex >= 0 && chargesWithSameDate.length > 0) {
                  let remainingPayments = totalPaidForDate;
                  for (let i = 0; i < chargeIndex; i++) {
                    const prevCharge = chargesWithSameDate[i];
                    remainingPayments -= Math.min(remainingPayments, prevCharge.total_amount || 0);
                  }
                  principalPaidForThisInstallment = Math.min(remainingPayments, originalPrincipal);
                } else {
                  principalPaidForThisInstallment = Math.min(totalPaidForDate, originalPrincipal);
                }
              }
            } else {
              const installmentDueDate = inst.due_date?.split('T')[0];
              if (installmentDueDate) {
                const paymentsForThisInstallment = (allPaymentsForBalanceCalc || []).filter(p => {
                  const paymentDueDate = p.due_date?.split('T')[0];
                  return paymentDueDate === installmentDueDate;
                });
                principalPaidForThisInstallment = paymentsForThisInstallment.reduce((s, p) => s + (p.principal_amount || 0), 0);
              }
            }
            
            const remainingPrincipal = Math.max(0, originalPrincipal - principalPaidForThisInstallment);
            if (remainingPrincipal > 0.01) {
              acc.total = round2(acc.total + remainingPrincipal);
              if (isCharge) acc.charges = round2(acc.charges + remainingPrincipal);
              return acc;
            }
            return acc;
          }, { total: 0, charges: 0 });

          const capitalPendingFromInstallments = round2(principalPendingTotals.total);
          const unpaidChargesAmountFromInstallments = round2(principalPendingTotals.charges);
          
          // Calcular interés pendiente considerando pagos parciales
          const interestPendingFromInstallments = (updatedInstallments || [])
            .filter(inst => {
              const isCharge = Math.abs(inst.interest_amount || 0) < 0.01 && 
                              Math.abs((inst.principal_amount || 0) - (inst.total_amount || 0)) < 0.01;
              return !isCharge;
            })
            .reduce((sum, inst) => {
              const originalInterest = inst.interest_amount || 0;
              const installmentDueDate = inst.due_date?.split('T')[0];
              let interestPaidForThisInstallment = 0;
              
              if (installmentDueDate) {
                const paymentsForThisInstallment = (allPaymentsForBalanceCalc || []).filter(p => {
                  const paymentDueDate = p.due_date?.split('T')[0];
                  return paymentDueDate === installmentDueDate;
                });
                interestPaidForThisInstallment = paymentsForThisInstallment.reduce((s, p) => s + (p.interest_amount || 0), 0);
              }
              
              const remainingInterest = Math.max(0, originalInterest - interestPaidForThisInstallment);
              if (remainingInterest > 0.01) {
                return round2(sum + remainingInterest);
              }
              return sum;
            }, 0);
          
          // Balance:
          // - Indefinido: capital actual + interés del período + cargos pendientes
          // - Plazo fijo: (total_amount del préstamo - pagos regulares - abonos a capital) + cargos pendientes
          let newBalance = 0;
          if (isIndefinite) {
            // CORRECCIÓN: Usar capital actual desde la BD (puede haber cambiado por abono a capital)
            // para que el balance refleje correctamente el cargo recién agregado
            let capitalNow = round2(loan.amount || 0);
            const { data: freshLoan } = await supabase
              .from('loans')
              .select('amount')
              .eq('id', loan.id)
              .single();
            if (freshLoan?.amount != null) {
              capitalNow = round2(Number(freshLoan.amount));
            }
            const fallbackInterestPerPayment = round2((capitalNow * (loan.interest_rate || 0)) / 100);
            const pendingInterest = round2(
              (interestPendingFromInstallments || 0) > 0.01
                ? (interestPendingFromInstallments || 0)
                : fallbackInterestPerPayment
            );
            newBalance = round2(capitalNow + pendingInterest + unpaidChargesAmountFromInstallments);
          } else {
            // total_amount base (sin cargos) como fuente de verdad para evitar desfaces por cuota redondeada
            let baseLoanTotal = Number((loan as any).total_amount || 0) || 0;
            if (!(baseLoanTotal > 0) || baseLoanTotal <= Number(loan.amount || 0)) {
              const term = Number(loan.term_months || 0) || 0;
              const totalInterest = Number(loan.amount || 0) * (Number(loan.interest_rate || 0) / 100) * term;
              baseLoanTotal = Number(loan.amount || 0) + totalInterest;
            }
            baseLoanTotal = round2(baseLoanTotal);

            // Abonos a capital
            const { data: cps } = await supabase
              .from('capital_payments')
              .select('amount')
              .eq('loan_id', loan.id);
            const totalCapitalPayments = round2((cps || []).reduce((s: number, cp: any) => s + (Number(cp?.amount) || 0), 0));

            // Pagos: separar lo pagado a cargos (por due_date + sin interés) para no restarlo del total base
            const chargeDueDates = new Set<string>();
            for (const inst of (updatedInstallments || [])) {
              const isChargeInst =
                Math.abs(Number(inst?.interest_amount || 0)) < 0.01 &&
                Math.abs(Number(inst?.principal_amount || 0) - Number(inst?.total_amount || 0)) < 0.01;
              if (!isChargeInst) continue;
              const d = inst?.due_date ? String(inst.due_date).split('T')[0] : null;
              if (d) chargeDueDates.add(d);
            }

            const totalPaidAmount = round2(
              (allPaymentsForBalanceCalc || []).reduce((s: number, p: any) => s + (Number(p?.amount) || 0), 0)
            );
            const totalPaidToCharges = round2(
              (allPaymentsForBalanceCalc || [])
                .filter((p: any) => {
                  const due = p?.due_date ? String(p.due_date).split('T')[0] : null;
                  if (!due) return false;
                  if (!chargeDueDates.has(due)) return false;
                  return Math.abs(Number(p?.interest_amount || 0)) < 0.01;
                })
                .reduce((s: number, p: any) => s + (Number(p?.principal_amount || p?.amount || 0) || 0), 0)
            );
            const totalPaidRegular = round2(Math.max(0, totalPaidAmount - totalPaidToCharges));

            const baseRemaining = round2(Math.max(0, baseLoanTotal - totalPaidRegular - totalCapitalPayments));
            newBalance = round2(baseRemaining + unpaidChargesAmountFromInstallments);
          }

          // Actualizar el balance del préstamo
          loanUpdates = {
            remaining_balance: newBalance,
            ...(isIndefinite ? {} : { term_months: nextInstallmentNumber }), // no tocar term_months en indefinidos
          };

          console.log(`✅ Nueva cuota ${nextInstallmentNumber} creada con cargo de RD$${data.amount.toLocaleString()}`);
          console.log(`🔍 Balance actualizado - currentBalance: ${calculatedValues.currentBalance}, newBalance: ${calculatedValues.newBalance}, cargo: ${data.amount}`);
          break;
          
        case 'pay_charges':
          {
            // Validar que haya cargos seleccionados
            if (selectedCharges.length === 0) {
              toast.error('Debes seleccionar al menos un cargo para pagar');
              setLoading(false);
              return;
            }

            // Validar que haya un monto a pagar
            if (chargePaymentAmount <= 0) {
              toast.error('El monto a pagar debe ser mayor a 0');
              setLoading(false);
              return;
            }

            // Obtener los datos completos de los cargos seleccionados
            const { data: selectedChargesData, error: chargesError } = await supabase
              .from('installments')
              .select('*')
              .in('id', selectedCharges)
              .order('due_date', { ascending: true });

            if (chargesError || !selectedChargesData) {
              console.error('Error obteniendo cargos:', chargesError);
              toast.error('Error al obtener información de los cargos');
              setLoading(false);
              return;
            }

            // Calcular el total pendiente de los cargos seleccionados
            const totalPendingCharges = selectedChargesData.reduce((sum, charge) => {
              const total = charge.total_amount || 0;
              const paid = charge.paid_amount || 0;
              return sum + (total - paid);
            }, 0);

            // Validar que el monto no exceda el total pendiente
            if (chargePaymentAmount > totalPendingCharges) {
              toast.error(`El monto a pagar no puede exceder el total pendiente (RD$${totalPendingCharges.toLocaleString('es-DO', { minimumFractionDigits: 2 })})`);
              setLoading(false);
              return;
            }

            // Distribuir el pago entre los cargos seleccionados
            let remainingAmount = chargePaymentAmount;
            const paymentsToInsert: any[] = [];
            const installmentsToUpdate: { id: string, paid_amount: number, is_paid: boolean }[] = [];

            for (const charge of selectedChargesData) {
              if (remainingAmount <= 0) break;

              const chargePending = (charge.total_amount || 0) - (charge.paid_amount || 0);
              const amountForThisCharge = Math.min(remainingAmount, chargePending);

              // Obtener la etiqueta en español de la razón
              const reasonLabel = data.adjustment_reason ? getReasonLabel('pay_charges', data.adjustment_reason) : '';

              // Crear el pago (status: 'completed' solo si el cargo queda totalmente pagado)
              const chargeFullyPaid = ((charge.paid_amount || 0) + amountForThisCharge) >= (charge.total_amount || 0);
              paymentsToInsert.push({
                loan_id: loan.id,
                amount: amountForThisCharge,
                principal_amount: amountForThisCharge,
                interest_amount: 0,
                late_fee: 0,
                payment_date: getCurrentDateInSantoDomingo(),
                due_date: charge.due_date,
                payment_method: chargePaymentMethod || 'cash',
                reference_number: chargePaymentReference || null,
                notes: `Pago de cargo - Cuota #${charge.installment_number}${reasonLabel ? ` - ${reasonLabel}` : ''}`,
                status: chargeFullyPaid ? 'completed' : 'pending',
                created_by: user.id,
                company_id: companyId
              });

              // Actualizar el estado del cargo
              const newPaidAmount = (charge.paid_amount || 0) + amountForThisCharge;
              const isFullyPaid = newPaidAmount >= (charge.total_amount || 0);

              installmentsToUpdate.push({
                id: charge.id,
                paid_amount: newPaidAmount,
                is_paid: isFullyPaid
              });

              remainingAmount -= amountForThisCharge;
            }

            // Insertar los pagos
            const { data: insertedChargePayments, error: paymentsError } = await supabase
              .from('payments')
              .insert(paymentsToInsert)
              .select('id');

            if (paymentsError) {
              console.error('Error insertando pagos:', paymentsError);
              console.error('Detalles del error:', JSON.stringify(paymentsError, null, 2));
              console.error('Datos a insertar:', paymentsToInsert);
              toast.error(`Error al registrar el pago: ${paymentsError.message || 'Error desconocido'}`);
              setLoading(false);
              return;
            }

            // Guardar IDs para vincularlos al historial
            chargePaymentIds = (insertedChargePayments || []).map((p: any) => p.id);

            // Actualizar los cargos
            for (const installmentUpdate of installmentsToUpdate) {
              const { error: updateError } = await supabase
                .from('installments')
                .update({
                  paid_amount: installmentUpdate.paid_amount,
                  is_paid: installmentUpdate.is_paid
                })
                .eq('id', installmentUpdate.id);

              if (updateError) {
                console.error('Error actualizando cargo:', updateError);
              }
            }

            // Recalcular el balance del préstamo
            const { data: updatedInstallments } = await supabase
              .from('installments')
              .select('principal_amount, is_paid')
              .eq('loan_id', loan.id);

            const newRemainingBalance = (updatedInstallments || [])
              .filter(inst => !inst.is_paid)
              .reduce((sum, inst) => sum + (inst.principal_amount || 0), 0);

            loanUpdates = {
              remaining_balance: Math.max(0, newRemainingBalance)
            };

            // Obtener el cliente para el recibo
            const { data: clientInfo } = await supabase
              .from('clients')
              .select('id, full_name, dni, phone, email')
              .eq('id', (loan as any).client_id)
              .single();

            // Preparar datos para el modal flotante (igual que en otros pagos)
            if (clientInfo) {
              // Obtener la etiqueta en español de la razón
              const reasonLabel = data.adjustment_reason ? getReasonLabel('pay_charges', data.adjustment_reason) : '';
              
              const receiptData = {
                payment: {
                  amount: chargePaymentAmount,
                  principal_amount: chargePaymentAmount, // Todo el pago es capital en cargos
                  interest_amount: 0, // Los cargos no tienen interés
                  payment_method: chargePaymentMethod,
                  reference: chargePaymentReference,
                  payment_date: getCurrentDateInSantoDomingo(),
                  notes: `Pago de ${selectedCharges.length} cargo(s)${reasonLabel ? ` - ${reasonLabel}` : ''}`
                },
                loan: loan,
                client: clientInfo,
                company: companySettings || authCompanySettings
              };

              // Guardar datos para el modal flotante
              setLastSettlePaymentData(receiptData);
              setShowPrintFormatModal(true);
            }
            
            // Limpiar estados
            setSelectedCharges([]);
            setChargePaymentAmount(0);
            setChargePaymentReference('');

            // Refrescar cuotas para que "Pagar Cargos" muestre datos actualizados
            await fetchInstallments();
            window.dispatchEvent(new CustomEvent('installmentsUpdated', { detail: { loanId: loan.id } }));
          }
          break;


        case 'term_extension':
          {
            const additionalMonths = data.additional_months || 0;

            // CORRECCIÓN (2026-08-31): antes solo se INSERTABAN las cuotas nuevas, calculadas con
            // una cuota distinta a la del resto del préstamo. El capital quedaba sobre-repartido
            // (p. ej. 6 × 1,666.67 + 2 × 2,000 = 14,000 en un préstamo de 10,000) y `total_amount`
            // ni siquiera se actualizaba, así que la BD, la vista previa y la tabla de
            // amortización mostraban tres cifras distintas.
            // Ahora se re-amortiza todo el tramo PENDIENTE: las cuotas existentes se actualizan y
            // las nuevas se insertan, todas con el mismo reparto. Las pagadas no se tocan.
            const schedule = buildExtensionSchedule(additionalMonths);
            if (!schedule) {
              toast.error('La extensión de plazo no aplica a este préstamo');
              setLoading(false);
              return;
            }

            console.log('🔍 LoanUpdateForm: Extensión de plazo:', {
              additionalMonths,
              pendientesAntes: schedule.pendingCountBefore,
              pendientesDespues: schedule.pendingCountAfter,
              capitalPendiente: schedule.outstandingCapital,
              cuota: schedule.representativePayment,
              nuevoTotal: schedule.newTotalAmount,
              nuevoPlazo: schedule.newTermPeriods,
            });

            loanUpdates = {
              term_months: schedule.newTermPeriods,
              monthly_payment: schedule.representativePayment,
              total_amount: schedule.newTotalAmount,
              // CORRECCIÓN (2026-09-01): hay que escribir el balance a mano.
              // Las cuotas se guardan ANTES que el préstamo, y sus triggers recalculan el
              // balance con el `total_amount` todavía viejo. Como no existe ningún trigger
              // sobre `loans`, al actualizar `total_amount` después nadie volvía a calcularlo:
              // el préstamo se quedaba con el balance anterior a la extensión.
              remaining_balance: schedule.newRemainingBalance,
              end_date: schedule.newEndDate,
            };

            try {
              // 1) Actualizar las cuotas pendientes que ya existían, con el nuevo reparto.
              //    Su número y su fecha NO cambian (renumerarlas rompería `paid_installments` y
              //    el historial); solo cambia cómo se reparte capital e interés.
              for (const row of schedule.updatedRows) {
                if (!row.id) continue;
                const { error: updErr } = await supabase
                  .from('installments')
                  .update({
                    principal_amount: row.principal,
                    interest_amount: row.interest,
                    total_amount: row.total,
                    // Si el abono que ya tenía la cuota cubre su nuevo importe, queda saldada.
                    // Sin esto seguiría figurando como pendiente pese a estar cobrada.
                    ...(row.pendingAfter <= 0.005 && row.alreadyPaid > 0
                      ? { is_paid: true, paid_date: getCurrentDateStringForSantoDomingo() }
                      : {}),
                  })
                  .eq('id', row.id);
                if (updErr) throw updErr;
              }

              // 1.b) ELIMINAR los abonos hechos a cuotas que no estaban terminadas de pagar.
              //
              // Regla de la empresa: la extensión rehace el préstamo con las cuotas pendientes
              // como si fuera nuevo, y olvida todo lo anterior salvo las cuotas YA PAGADAS.
              //
              // No basta con ignorarlos en el cálculo: los pagos viven en `payments` atados a su
              // fecha de vencimiento, así que la tabla de amortización, el estado de cuenta, el
              // pago avanzado y el balance que recalcula Postgres los seguirían contando, y la
              // cuota seguiría saliendo como "Parcial · Falta …".
              //
              // Solo se borran los de cuotas PENDIENTES: los de cuotas saldadas no se tocan.
              // Antes de borrarlos se anota qué se elimina, para que quede rastro en el
              // historial del préstamo.
              let discardedPayments: { amount: number; due_date: string }[] = [];
              if (schedule.discardedPaymentDueDates.length > 0) {
                const { data: toDelete, error: readError } = await supabase
                  .from('payments')
                  .select('id, amount, due_date')
                  .eq('loan_id', loan.id)
                  .in('due_date', schedule.discardedPaymentDueDates);
                if (readError) throw readError;

                discardedPayments = (toDelete || []).map(p => ({
                  amount: Number(p.amount) || 0,
                  due_date: String(p.due_date || '').split('T')[0],
                }));

                if (discardedPayments.length > 0) {
                  const { error: deleteError } = await supabase
                    .from('payments')
                    .delete()
                    .eq('loan_id', loan.id)
                    .in('due_date', schedule.discardedPaymentDueDates);
                  if (deleteError) throw deleteError;
                }
              }
              discardedPaymentsRef.current = discardedPayments;

              // 2) Insertar las cuotas nuevas.
              const newInstallments = schedule.newRows.map(row => ({
                loan_id: loan.id,
                installment_number: row.installmentNumber,
                due_date: row.dueDate,
                total_amount: row.total,
                principal_amount: row.principal,
                interest_amount: row.interest,
                is_paid: false,
                late_fee_paid: 0,
              }));

              if (newInstallments.length > 0) {
                const { error: installmentsError } = await supabase
                  .from('installments')
                  .insert(newInstallments);
                if (installmentsError) throw installmentsError;
              }

              const descartado = discardedPayments.reduce((s, p) => s + p.amount, 0);
              const resumen =
                (schedule.uniformPayment
                  ? `${schedule.pendingCountAfter} cuotas pendientes de ${formatCurrency(schedule.representativePayment)}.`
                  : `${schedule.pendingCountAfter} cuotas pendientes (cuota decreciente desde ${formatCurrency(schedule.representativePayment)}).`)
                + (descartado > 0
                  ? ` Se eliminaron ${formatCurrency(descartado)} en abonos a cuotas sin terminar de pagar.`
                  : '');
              toast.success(
                schedule.additionalCount > 0
                  ? `${schedule.additionalCount} ${schedule.additionalCount === 1 ? 'cuota agregada' : 'cuotas agregadas'}. ${resumen}`
                  : `Cuotas recalculadas sin cambiar el plazo. ${resumen}`
              );

              await fetchInstallments();
              window.dispatchEvent(new CustomEvent('installmentsUpdated', { detail: { loanId: loan.id } }));
            } catch (error) {
              console.error('❌ Error en extensión de plazo:', error);
              toast.error('Error procesando la extensión de plazo');
              setLoading(false);
              return;
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

            // CORRECCIÓN: Para saldar un préstamo, es obligatorio pagar todo el capital pendiente como mínimo
            // El interés y la mora pueden ser lo que se ponga, pero el capital debe ser completo
            if (settleBreakdown.capitalPending > 0 && capitalPayment < settleBreakdown.capitalPending) {
              toast.error(`Para saldar el préstamo debe pagar todo el capital pendiente (RD$${settleBreakdown.capitalPending.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) como mínimo. El interés y la mora pueden ser lo que se ponga.`);
              setLoading(false);
              return;
            }

            try {
              // Usar los valores directamente de los campos
              const principalPayment = capitalPayment;
              const actualInterestPayment = interestPayment;
              const actualLateFeePayment = lateFeePayment;

              // OBTENER EL CLIENTE ANTES DE INSERTAR EL PAGO Y ACTUALIZAR EL PRÉSTAMO
              // Esto asegura que tengamos el cliente completo incluso después de que el préstamo se actualice
              console.log('🔍 Obteniendo cliente completo desde BD ANTES de saldar préstamo...');
              console.log('🔍 Loan client_id:', (loan as any).client_id);
              
              let clientData = null;
              
              // Obtener el cliente directamente desde la tabla clients usando client_id
              // Guardar el client_id en una variable para asegurarnos de tenerlo
              const clientIdToUse = (loan as any).client_id;
              
              const { data: clientInfo, error: clientError } = await supabase
                .from('clients')
                .select('id, full_name, dni, phone, email')
                .eq('id', clientIdToUse)
                .single();
              
              if (!clientError && clientInfo) {
                console.log('🔍 Cliente obtenido desde BD:', clientInfo);
                console.log('🔍 Teléfono obtenido:', clientInfo.phone);
                clientData = clientInfo;
              } else {
                console.error('❌ Error obteniendo cliente:', clientError);
                console.error('❌ Loan client_id era:', clientIdToUse);
                
                // Fallback: usar el cliente del préstamo si existe
                const fallbackClient = loan.client || (loan as any).clients;
                if (fallbackClient) {
                  console.log('🔍 Usando cliente del préstamo como fallback:', fallbackClient);
                  clientData = Array.isArray(fallbackClient) ? fallbackClient[0] : fallbackClient;
                }
              }

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
              // Guardar la fecha del pago para usarla en loan_history
              settlePaymentDate = paymentDate;

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
                company_id: companyId,
              };

              const { data: insertedPayment, error: paymentError } = await supabase
                .from('payments')
                .insert([paymentData])
                .select();

              if (paymentError) {
                console.error('Error insertando pago:', paymentError);
                throw paymentError;
              }

              // Guardar los datos del pago para mostrar el recibo
              // Usar el cliente que ya obtuvimos ANTES de actualizar el préstamo
              if (insertedPayment && insertedPayment.length > 0) {
                // Crear un objeto loan con el cliente ya obtenido
                const loanWithClient = {
                  ...loan,
                  client: clientData,
                  client_id: clientIdToUse // Asegurar que el client_id esté presente
                };
                
                console.log('🔍 Cliente final para lastSettlePaymentData:', clientData);
                console.log('🔍 Teléfono del cliente:', clientData?.phone);
                console.log('🔍 Client ID guardado:', clientIdToUse);
                
                setLastSettlePaymentData({
                  payment: insertedPayment[0],
                  loan: loanWithClient,
                  paymentDate: paymentDate,
                  clientId: clientIdToUse // Guardar también el client_id por separado como respaldo
                });
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
          // CORRECCIÓN (auditoría de cálculos): antes esto SIEMPRE sumaba "+1 mes" al calcular
          // nextPaymentDate/firstPaymentDate, sin importar la frecuencia de pago del préstamo — una
          // cuota diaria, semanal o quincenal terminaba con su primera fecha mal calculada (fuera de
          // orden respecto a start_date). También se parseaba `loan.start_date` con `new Date(string)`,
          // que interpreta una fecha "YYYY-MM-DD" como medianoche UTC en vez de Santo Domingo.
          // Este código está inactivo en la práctica (edit_loan solo se disparaba desde el botón
          // "Editar" de un préstamo pendiente, y ese botón ahora usa el formulario de creación —
          // ver openEditLoanForm en LoansModule.tsx), pero se corrige de todos modos como red de
          // seguridad, y por si algún préstamo ya quedó con cuotas mal generadas por este bug.
          const editFrequency = data.edit_payment_frequency || loan.payment_frequency || 'monthly';
          const startDate = parseIsoDateLocal(String(loan.start_date)) || getCurrentDateInSantoDomingo();

          // CORRECCIÓN (auditoría 2026-08-28): `end_date` sumaba `edit_term_months` MESES sin
          // importar la frecuencia, pero el plazo está expresado en PERÍODOS: un préstamo
          // diario a 30 días quedaba con vencimiento a 30 meses.
          const newEndDate = addPeriodsToDate(startDate, data.edit_term_months, editFrequency);
          const nextPaymentDate = addPeriodsToDate(startDate, 1, editFrequency);
          const firstPaymentDate = new Date(nextPaymentDate);

          // Calcular total_amount
          // Si el préstamo es pendiente, no modificar el monto (es un financiamiento de factura)
          const finalAmount = loan.status === 'pending' ? loan.amount : data.edit_amount;

          // CORRECCIÓN CRÍTICA (auditoría 2026-08-28): el interés total se calculaba como
          // `monto × tasa_mensual × plazo / 100`, tratando el plazo como si siempre fueran
          // MESES. Como el plazo está en períodos de la frecuencia, un préstamo DIARIO de
          // 30 días al 10% mensual quedaba con un interés total del 300% (10% × 30) en vez
          // del 10%; uno quincenal de 12 quincenas, con 120% en vez de 60%. Ese
          // `total_amount` inflado se guarda en el préstamo y es la base del
          // `remaining_balance` que calcula el trigger de la BD, así que el cliente terminaba
          // debiendo varias veces lo pactado. Se aplica el factor de frecuencia.
          const editPeriodRate = (data.edit_interest_rate / 100) * getFrequencyRateFactor(editFrequency);
          const totalInterest = finalAmount * editPeriodRate * data.edit_term_months;
          const totalAmount = finalAmount + totalInterest;
          
          loanUpdates = {
            amount: finalAmount, // Usar el monto original si es pendiente
            interest_rate: data.edit_interest_rate,
            term_months: data.edit_term_months,
            monthly_payment: calculatedValues.newPayment,
            total_amount: totalAmount,
            remaining_balance: finalAmount,
            // Formateo local: `toISOString()` convierte a UTC y desplaza el día.
            end_date: formatDateLocalIso(newEndDate),
            next_payment_date: formatDateLocalIso(nextPaymentDate),
            first_payment_date: formatDateLocalIso(firstPaymentDate),
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
            // La frecuencia mensual usaba `setMonth()` a secas (31-ene + 1 mes = 03-mar) y no
            // contemplaba trimestral/anual. `addPeriodsToDate` recorta al último día del mes.
            const dueDate = addPeriodsToDate(firstPaymentDate, i - 1, paymentFrequency);

            newInstallments.push({
              loan_id: loan.id,
              installment_number: i,
              due_date: formatDateLocalIso(dueDate),
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
            
            // Obtener las cuotas para distribuir la mora eliminada.
            // Para préstamos indefinidos no filtramos is_paid porque la cuota DB
            // puede estar marcada is_paid=true aunque el préstamo siga activo.
            const installmentsBaseQuery = supabase
              .from('installments')
              .select('*')
              .eq('loan_id', loan.id)
              .order('installment_number', { ascending: true });
            const { data: installments, error: installmentsError } = isIndefiniteLoan
              ? await installmentsBaseQuery
              : await installmentsBaseQuery.eq('is_paid', false);
            
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
              const currentDate = getCurrentDateInSantoDomingo();
              let totalCalculatedLateFee = 0;
              const installmentLateFees: Array<{ id: string; lateFee: number }> = [];

              // Para indefinidos: usar la fecha efectiva de próximo pago (igual que getLateFeeBreakdownFromInstallments)
              // para saber qué cuotas ignorar (las que ya pasaron y están cubiertas por pagos anteriores).
              const effectiveNextPayDateForWaiver = isIndefiniteLoan
                ? (displayNextPaymentDate ?? loan.next_payment_date ?? '')
                : '';

              installments.forEach((installment: any) => {
                // Para indefinidos: ignorar cuotas con due_date < next_payment_date (ya cubiertas).
                // Esto garantiza distribuir solo en las cuotas que getLateFeeBreakdownFromInstallments incluye.
                if (isIndefiniteLoan && effectiveNextPayDateForWaiver) {
                  const instDue = String(installment.due_date || '').split('T')[0];
                  const nextPay = effectiveNextPayDateForWaiver.split('T')[0];
                  if (instDue < nextPay) return;
                }

                const [dy, dm, dd] = String(installment.due_date).split('T')[0].split('-').map(Number);
                const dueDate = new Date(dy, dm - 1, dd);
                const daysOverdue = Math.max(0, Math.floor((currentDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
                
                if (daysOverdue > 0) {
                  const gracePeriod = (loan as any).grace_period_days || 0;
                  const effectiveDaysOverdue = Math.max(0, daysOverdue - gracePeriod);
                  
                  if (effectiveDaysOverdue > 0) {
                    // Para préstamos indefinidos, usar interest_amount/total_amount/amount
                    // porque principal_amount = 0 (cuotas de interés puro)
                    const principalPerPayment = isIndefiniteLoan && (!installment.principal_amount || installment.principal_amount === 0)
                      ? (installment.interest_amount || installment.total_amount || installment.amount || 0)
                      : installment.principal_amount;
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
              } else if (installments.length > 0) {
                // Fallback: si no se pudo calcular mora dinámica (ej. aún sin días de gracia vencidos),
                // registrar el monto eliminado en la primera cuota para que el recálculo devuelva 0
                const firstInstallment = installments[0];
                const currentLateFeePaid = firstInstallment?.late_fee_paid || 0;
                await supabase
                  .from('installments')
                  .update({ late_fee_paid: Math.round((currentLateFeePaid + lateFeeToRemove) * 100) / 100 })
                  .eq('id', firstInstallment.id);
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

        case 'capital_payment':
          {
            // Validar que el préstamo no esté liquidado
            if (loan.status === 'paid') {
              toast.error('No se pueden realizar abonos a capital en préstamos ya liquidados');
              setLoading(false);
              return;
            }

            // Validar monto del abono
            const capitalPaymentAmount = data.capital_payment_amount || 0;
            if (capitalPaymentAmount <= 0) {
              toast.error('El monto del abono debe ser mayor a 0');
              setLoading(false);
              return;
            }

            // IMPORTANTE: Usar originalPendingCapital para la validación
            if (capitalPaymentAmount > originalPendingCapital) {
              toast.error(`El abono no puede ser mayor al capital pendiente (RD$${originalPendingCapital.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`);
              setLoading(false);
              return;
            }

            // Validar que no haya cuotas vencidas antes de permitir el abono a capital
            {
              const todayCheck = getCurrentDateInSantoDomingo();
              const todayOnly = new Date(todayCheck.getFullYear(), todayCheck.getMonth(), todayCheck.getDate());
              const graceCheck = (loan as any).grace_period_days || 0;
              let hasOverdue = false;

              if (isIndefiniteLoan) {
                const nextEff = displayNextPaymentDate ?? loan.next_payment_date ?? '';
                if (nextEff) {
                  const [ny, nm, nd] = nextEff.split('T')[0].split('-').map(Number);
                  const nextD = new Date(ny, nm - 1, nd);
                  const days = Math.floor((todayOnly.getTime() - nextD.getTime()) / (1000 * 60 * 60 * 24));
                  if (days > graceCheck) hasOverdue = true;
                }
              } else {
                hasOverdue = installments.some(inst => {
                  if (inst.is_paid) return false;
                  const dueDateStr = inst.due_date?.split('T')[0];
                  if (!dueDateStr) return false;
                  const [dy2, dm2, dd2] = dueDateStr.split('-').map(Number);
                  const dD = new Date(dy2, dm2 - 1, dd2);
                  const days = Math.floor((todayOnly.getTime() - dD.getTime()) / (1000 * 60 * 60 * 24));
                  return days > graceCheck;
                });
              }

              if (hasOverdue) {
                toast.error('No se puede realizar un abono a capital mientras haya cuotas vencidas. Pague las cuotas vencidas primero.');
                setLoading(false);
                return;
              }
            }

            const keepInstallments = data.keep_installments || false;
            const isPenalty = data.is_penalty || false;
            const penaltyPercentage = data.penalty_percentage || 0;
            // IMPORTANTE: Usar originalPendingCapital para calcular la penalidad (capital antes del abono)
            const calculatedPenaltyAmount = isPenalty && penaltyPercentage > 0 ? (originalPendingCapital * penaltyPercentage) / 100 : 0;
            const capitalBefore = originalPendingCapital; // Usar el capital original antes del abono
            const capitalAfter = Math.max(0, originalPendingCapital - capitalPaymentAmount);

            // Registrar el abono a capital
            console.log('💰 REGISTRANDO ABONO A CAPITAL:', {
              loan_id: loan.id,
              amount: capitalPaymentAmount,
              capital_before: capitalBefore,
              capital_after: capitalAfter,
              keep_installments: keepInstallments,
              penalty: calculatedPenaltyAmount
            });
            
            const { data: insertedCapitalPayment, error: capitalPaymentError } = await supabase
              .from('capital_payments')
              // Anti-duplicado: si el usuario reintenta por error de UI, evitamos insertar el mismo abono dos veces.
              // Buscamos un registro idéntico reciente (misma transacción lógica).
              .select('id, amount, capital_before, capital_after, created_at')
              .eq('loan_id', loan.id)
              .eq('amount', capitalPaymentAmount)
              .eq('capital_before', capitalBefore)
              .eq('capital_after', capitalAfter)
              .order('created_at', { ascending: false })
              .limit(1);

            let capitalPaymentRecord = insertedCapitalPayment?.[0];

            if (capitalPaymentError) {
              console.error('❌ Error consultando posible duplicado:', capitalPaymentError);
              toast.error('Error al registrar el abono a capital');
              setLoading(false);
              return;
            }

            // Si hay un registro idéntico en los últimos 2 minutos, lo reutilizamos; si no, insertamos.
            if (insertedCapitalPayment && insertedCapitalPayment.length > 0) {
              const last = insertedCapitalPayment[0] as any;
              const lastAt = last?.created_at ? new Date(last.created_at).getTime() : 0;
              const now = Date.now();
              const isRecent = lastAt && (now - lastAt) < 2 * 60 * 1000;
              if (isRecent) {
                capitalPaymentRecord = last;
                console.log('🧯 Abono a capital duplicado evitado (reutilizando registro reciente):', last);
              }
            }

            if (!capitalPaymentRecord) {
              const { data: inserted, error: insertErr } = await supabase
                .from('capital_payments')
                .insert([{
                  loan_id: loan.id,
                  amount: capitalPaymentAmount,
                  capital_before: capitalBefore,
                  capital_after: capitalAfter,
                  keep_installments: keepInstallments,
                  adjustment_reason: data.adjustment_reason,
                  created_by: user?.id || companyId
                }])
                .select();

              if (insertErr) {
                console.error('❌ Error registrando abono a capital:', insertErr);
                toast.error('Error al registrar el abono a capital');
                setLoading(false);
                return;
              }

              capitalPaymentRecord = inserted?.[0];
              console.log('✅ Abono a capital registrado:', inserted);
            } else {
              console.log('✅ Abono a capital (reutilizado):', capitalPaymentRecord);
            }

            // Mantener log original para compatibilidad con debugging

            // IMPORTANTE: La penalidad NO se crea como cargo/instalment
            // Se paga junto con el abono a capital, no como una cuota separada
            // El monto total a pagar es: capitalPaymentAmount + calculatedPenaltyAmount
            // La penalidad se registra solo en las notas del historial y en el recibo

            // Obtener cuotas pendientes para recalcular (EXCLUIR CARGOS)
            // Los cargos NO se recalculan, solo las cuotas regulares del préstamo
            const unpaidInstallments = installments.filter(inst => {
              // Excluir cargos: un cargo es cuando interest_amount === 0 y principal_amount === total_amount
              const isCharge = Math.abs(inst.interest_amount || 0) < 0.01 && 
                              Math.abs((inst.principal_amount || 0) - (inst.total_amount || 0)) < 0.01;
              return !inst.is_paid && !isCharge; // Solo cuotas regulares no pagadas
            }).sort((a, b) => a.installment_number - b.installment_number);
            const remainingInstallmentsCount = unpaidInstallments.length;

            if ((loan.amortization_type || '').toLowerCase() === 'indefinite') {
              // CORRECCIÓN: Para préstamos indefinidos, las cuotas solo tienen interés (sin capital)
              // Cuando se reduce el capital base con un abono, el interés DEBE reducirse proporcionalmente
              // Por lo tanto, debemos actualizar TODAS las cuotas pendientes con el nuevo interés
              const newInterestPerPayment = (capitalAfter * loan.interest_rate) / 100;
              
              // Obtener todas las cuotas regulares pendientes (excluyendo cargos)
              const unpaidRegularInstallments = installments.filter(inst => {
                const isCharge = Math.abs(inst.interest_amount || 0) < 0.01 && 
                                Math.abs((inst.principal_amount || 0) - (inst.total_amount || 0)) < 0.01;
                return !inst.is_paid && !isCharge; // Solo cuotas regulares no pagadas
              });
              
              // IMPORTANTE: Actualizar el interés de TODAS las cuotas pendientes
              // En préstamos indefinidos, el interés depende directamente del capital base
              // Si el capital se reduce, el interés de las cuotas pendientes también debe reducirse
              for (const installment of unpaidRegularInstallments) {
                await supabase
                  .from('installments')
                  .update({
                    interest_amount: Math.round(newInterestPerPayment * 100) / 100,
                    total_amount: Math.round(newInterestPerPayment * 100) / 100, // En indefinidos, total = interés (sin capital)
                    principal_amount: 0 // Asegurar que no tenga capital
                  })
                  .eq('id', installment.id);
              }
              
              // Calcular interés pendiente actualizado (todas las cuotas pendientes ahora tienen el nuevo interés)
              const updatedPendingInterest = unpaidRegularInstallments.length * newInterestPerPayment;
              const pendingInterest = updatedPendingInterest > 0 ? updatedPendingInterest : newInterestPerPayment;
              
              // IMPORTANTE: Recalcular balance usando la misma lógica que LoanDetailsView
              // Obtener TODAS las cuotas pendientes actualizadas (después del abono y recálculo de cuotas)
              const { data: updatedInstallments } = await supabase
                .from('installments')
                .select('id, installment_number, principal_amount, interest_amount, is_paid, total_amount, due_date, amount')
                .eq('loan_id', loan.id);
              
              // Calcular cargos no pagados
              const allCharges = (updatedInstallments || []).filter(inst => {
                const isCharge = Math.abs(inst.interest_amount || 0) < 0.01 && 
                                Math.abs((inst.principal_amount || 0) - (inst.total_amount || 0)) < 0.01;
                return isCharge && !inst.is_paid;
              });
              
              // Obtener pagos para calcular cargos parcialmente pagados
              const { data: paymentsForCharges } = await supabase
                .from('payments')
                .select('principal_amount, interest_amount, due_date, amount')
                .eq('loan_id', loan.id);
              
              const unpaidChargesAmount = allCharges.reduce((sum, inst) => {
                const chargeAmount = inst.total_amount || 0;
                const chargeDueDate = inst.due_date?.split('T')[0];
                
                if (!chargeDueDate) {
                  return sum + Math.round(Number(chargeAmount));
                }
                
                const chargesWithSameDate = allCharges.filter(c => c.due_date?.split('T')[0] === chargeDueDate)
                  .sort((a, b) => (a.installment_number || 0) - (b.installment_number || 0));
                
                const paymentsForDate = (paymentsForCharges || []).filter(p => {
                  const paymentDueDate = p.due_date?.split('T')[0];
                  const hasNoInterest = Math.abs(p.interest_amount || 0) < 0.01;
                  return paymentDueDate === chargeDueDate && hasNoInterest;
                });
                
                const totalPaidForDate = paymentsForDate.reduce((s, p) => s + (p.principal_amount || p.amount || 0), 0);
                const chargeIndex = chargesWithSameDate.findIndex(c => c.id === inst.id);
                
                let principalPaidForThisCharge = 0;
                if (chargeIndex >= 0 && chargesWithSameDate.length > 0) {
                  let remainingPayments = totalPaidForDate;
                  for (let i = 0; i < chargeIndex; i++) {
                    const prevCharge = chargesWithSameDate[i];
                    remainingPayments -= Math.min(remainingPayments, prevCharge.total_amount || 0);
                  }
                  principalPaidForThisCharge = Math.min(remainingPayments, chargeAmount);
                } else {
                  principalPaidForThisCharge = Math.min(totalPaidForDate, chargeAmount);
                }
                
                const remainingChargeAmount = Math.max(0, chargeAmount - principalPaidForThisCharge);
                return sum + Math.round(remainingChargeAmount);
              }, 0);
              
              // CORRECCIÓN: Para préstamos indefinidos, el capital pendiente es el capital base (amount)
              // porque las cuotas no tienen principal_amount (solo interés)
              // Balance = Capital base + Interés pendiente + Cargos pendientes
              
              // Calcular interés pendiente (solo de cuotas regulares, no cargos)
              // Después de actualizar las cuotas pendientes, todas deberían tener el nuevo interés
              const interestPendingFromInstallments = (updatedInstallments || [])
                .filter(inst => {
                  const isCharge = Math.abs(inst.interest_amount || 0) < 0.01 && 
                                  Math.abs((inst.principal_amount || 0) - (inst.total_amount || 0)) < 0.01;
                  return !inst.is_paid && !isCharge;
                })
                .reduce((sum, inst) => sum + Math.round(inst.interest_amount || 0), 0);
              
              // Para préstamos indefinidos: Balance = Capital base + Interés pendiente + Cargos pendientes
              // El capital pendiente es el capital base (capitalAfter) porque no hay capital en las cuotas
              const newBalance = Math.round((capitalAfter + interestPendingFromInstallments + unpaidChargesAmount) * 100) / 100;
              
              // IMPORTANTE: Actualizar monthly_payment para reflejar el nuevo interés
              // En préstamos indefinidos, monthly_payment = interés mensual (no hay capital en la cuota)
              loanUpdates = {
                amount: capitalAfter, // Actualizar el capital base
                monthly_payment: Math.round(newInterestPerPayment * 100) / 100, // Actualizar cuota mensual con nuevo interés
                remaining_balance: newBalance
              };
              
              // Disparar evento para refrescar tablas después de actualizar cuotas
              console.log('🔄 Disparando evento installmentsUpdated después de actualizar cuotas (indefinido)');
              window.dispatchEvent(new CustomEvent('installmentsUpdated', { 
                detail: { loanId: loan.id } 
              }));
            } else {
              // Para préstamos con plazo fijo
              // Helper local (evita NaN/Infinity y problemas de hoisting/TDZ en ramas distintas)
              function round2(value: number) {
                return Math.round(((Number.isFinite(value) ? value : 0) * 100)) / 100;
              }

              if (keepInstallments) {
                // Mantener número de cuotas: recalcular el monto de cada cuota
                // CORRECCIÓN CRÍTICA:
                // - NO usar Math.round (redondeo a entero) porque introduce diferencias de RD$2.00 (ej. 1166.67 → 1167)
                // - Ajustar la ÚLTIMA cuota para cuadrar centavos: suma(principal) = capitalAfter y suma(interés) = interés total
                const count = unpaidInstallments.length;
                const interestPerPayment = round2((capitalAfter * (loan.interest_rate || 0)) / 100);
                const rawPrincipalPerPayment = count > 0 ? capitalAfter / count : 0;
                const principalPerPayment = round2(rawPrincipalPerPayment);

                // Total de capital e interés que deben quedar en cuotas pendientes
                const targetTotalPrincipal = round2(capitalAfter);
                const targetTotalInterest = round2(interestPerPayment * count);

                // Total de cuotas regulares ya pagadas (para recalcular total_amount del préstamo)
                const paidRegularTotal = round2(
                  installments
                    .filter(inst => {
                      const isCharge = Math.abs(inst.interest_amount || 0) < 0.01 &&
                        Math.abs((inst.principal_amount || 0) - (inst.total_amount || 0)) < 0.01;
                      return Boolean(inst.is_paid) && !isCharge;
                    })
                    .reduce((sum, inst) => sum + Number(inst.total_amount || inst.amount || 0), 0)
                );

                // Actualizar cuotas pendientes distribuyendo el capital y ajustando la última
                let accumulatedPrincipal = 0;
                let accumulatedInterest = 0;
                for (let i = 0; i < unpaidInstallments.length; i++) {
                  const installment = unpaidInstallments[i];
                  const isLast = i === unpaidInstallments.length - 1;

                  const principal = isLast
                    ? round2(targetTotalPrincipal - accumulatedPrincipal)
                    : principalPerPayment;
                  const interest = isLast
                    ? round2(targetTotalInterest - accumulatedInterest)
                    : interestPerPayment;
                  const total = round2(principal + interest);

                  accumulatedPrincipal = round2(accumulatedPrincipal + principal);
                  accumulatedInterest = round2(accumulatedInterest + interest);

                  await supabase
                    .from('installments')
                    .update({
                      principal_amount: principal,
                      interest_amount: interest,
                      total_amount: total,
                      amount: total
                    } as any)
                    .eq('id', installment.id);
                }

                // Total de cuotas regulares pendientes (ya redondeadas y con ajuste en la última)
                const unpaidRegularTotal = round2(
                  unpaidInstallments.reduce((sum, _, idx) => {
                    // Re-calcular igual que arriba (sin re-consultar)
                    const isLast = idx === unpaidInstallments.length - 1;
                    const principal = isLast
                      ? round2(targetTotalPrincipal - round2(principalPerPayment * (unpaidInstallments.length - 1)))
                      : principalPerPayment;
                    const interest = interestPerPayment; // el ajuste de interés cae en la última, pero el total se corrige abajo
                    return sum + round2(principal + (isLast ? round2(targetTotalInterest - round2(interestPerPayment * (unpaidInstallments.length - 1))) : interest));
                  }, 0)
                );
                  
                  // Disparar evento para refrescar tablas después de actualizar cuotas
                  console.log('🔄 Disparando evento installmentsUpdated después de actualizar cuotas');
                  window.dispatchEvent(new CustomEvent('installmentsUpdated', { 
                    detail: { loanId: loan.id } 
                  }));

                  // Calcular el nuevo total_amount del préstamo (SOLO cuotas regulares, sin cargos)
                  // Debe cumplir: total_amount = total_regular_pagado + total_regular_pendiente
                  const newTotalAmount = round2(paidRegularTotal + unpaidRegularTotal);

                  // Calcular remaining_balance consistente con la función de BD:
                  // remaining_balance = (total_amount + total_cargos) - total_pagado
                  // (total_pagado incluye pagos de cuotas y pagos a cargos, NO incluye abonos a capital)
                  const { data: paymentsForBalance } = await supabase
                    .from('payments')
                    .select('amount')
                    .eq('loan_id', loan.id);
                  const totalPaidAmount = round2((paymentsForBalance || []).reduce((s, p: any) => s + (Number(p.amount) || 0), 0));

                  const chargesTotal = round2(
                    installments
                      .filter(inst => {
                        const isCharge = Math.abs(inst.interest_amount || 0) < 0.01 &&
                          Math.abs((inst.principal_amount || 0) - (inst.total_amount || 0)) < 0.01;
                        return isCharge;
                      })
                      .reduce((s, inst) => s + Number(inst.total_amount || inst.amount || 0), 0)
                  );
                  const newBalance = round2((newTotalAmount + chargesTotal) - totalPaidAmount);
                  
                  loanUpdates = {
                    monthly_payment: round2(round2(targetTotalPrincipal + targetTotalInterest) / Math.max(1, unpaidInstallments.length)), // valor “promedio”
                    remaining_balance: newBalance,
                    total_amount: newTotalAmount
                  };
              } else {
                // Mantener monto de cuota: reducir número de cuotas
                // IMPORTANTE: Los cargos NO se eliminan ni se modifican, solo las cuotas regulares
                // CORRECCIÓN: evitar redondeo a entero y ajustar la última cuota
                const interestPerPayment = round2((capitalAfter * (loan.interest_rate || 0)) / 100);
                const installmentAmount = round2(Number(loan.monthly_payment || 0));
                const principalPerPayment = round2(Math.max(0, installmentAmount - interestPerPayment));
                const isPaidOff = capitalAfter <= 0.009;

                // Si el capital queda en 0, este flujo debe “cerrar” las cuotas regulares pendientes:
                // - Evitar newInstallmentCount = 0 → slices/borrados/term negativos/NaN
                // - No dejar monthly_payment inválido
                if (isPaidOff) {
                  // Eliminar TODAS las cuotas regulares pendientes (NO cargos)
                  for (const installment of unpaidInstallments) {
                    const { error: delErr } = await supabase
                      .from('installments')
                      .delete()
                      .eq('id', installment.id);
                    if (delErr) throw delErr;
                  }

                  // Recalcular totales/balance con datos ya persistidos
                  const { data: refreshedInstallments, error: refInstErr } = await supabase
                    .from('installments')
                    .select('principal_amount, interest_amount, total_amount, amount, is_paid')
                    .eq('loan_id', loan.id);
                  if (refInstErr) throw refInstErr;

                  const paidRegularTotal = round2(
                    installments
                      .filter(inst => {
                        const isCharge = Math.abs(inst.interest_amount || 0) < 0.01 &&
                          Math.abs((inst.principal_amount || 0) - (inst.total_amount || 0)) < 0.01;
                        return Boolean(inst.is_paid) && !isCharge;
                      })
                      .reduce((sum, inst) => sum + Number(inst.total_amount || inst.amount || 0), 0)
                  );
                  const newTotalAmount = paidRegularTotal;

                  const { data: paymentsForBalance, error: payErr } = await supabase
                    .from('payments')
                    .select('amount')
                    .eq('loan_id', loan.id);
                  if (payErr) throw payErr;
                  const totalPaidAmount = round2((paymentsForBalance || []).reduce((s, p: any) => s + (Number(p.amount) || 0), 0));

                  const chargesTotal = round2(
                    (refreshedInstallments || [])
                      .filter((inst: any) => {
                        const isCharge = Math.abs(inst.interest_amount || 0) < 0.01 &&
                          Math.abs((inst.principal_amount || 0) - (inst.total_amount || 0)) < 0.01;
                        return isCharge;
                      })
                      .reduce((s: number, inst: any) => s + Number(inst.total_amount || inst.amount || 0), 0)
                  );

                  const newBalance = Math.max(0, round2((newTotalAmount + chargesTotal) - totalPaidAmount));
                  const newTermMonths = Math.max(0, (loan.term_months || 0) - remainingInstallmentsCount);

                  loanUpdates = {
                    term_months: newTermMonths,
                    monthly_payment: 0,
                    remaining_balance: newBalance,
                    total_amount: newTotalAmount,
                    ...(newBalance <= 0.01 ? { status: 'paid' } : {})
                  };

                  // Refrescar UI
                  console.log('🔄 Disparando evento installmentsUpdated después de pago total por abono a capital');
                  window.dispatchEvent(new CustomEvent('installmentsUpdated', {
                    detail: { loanId: loan.id }
                  }));
                } else {
                  const newInstallmentCount = principalPerPayment > 0
                    ? Math.ceil(capitalAfter / principalPerPayment)
                    : remainingInstallmentsCount;

                  // Eliminar cuotas sobrantes (las últimas) - SOLO cuotas regulares, NO cargos
                  if (newInstallmentCount < remainingInstallmentsCount) {
                    const installmentsToDelete = unpaidInstallments.slice(newInstallmentCount);
                    for (const installment of installmentsToDelete) {
                      const { error: delErr } = await supabase
                        .from('installments')
                        .delete()
                        .eq('id', installment.id);
                      if (delErr) throw delErr;
                    }

                    // Actualizar las cuotas restantes con el nuevo capital
                    const remainingInstallments = unpaidInstallments.slice(0, newInstallmentCount);
                    let accPrincipal = 0;
                    for (let i = 0; i < remainingInstallments.length; i++) {
                      const installment = remainingInstallments[i];
                      const isLast = i === remainingInstallments.length - 1;
                      const principal = isLast ? round2(capitalAfter - accPrincipal) : principalPerPayment;
                      accPrincipal = round2(accPrincipal + principal);
                      const total = round2(principal + interestPerPayment);
                      const { error: updErr } = await supabase
                        .from('installments')
                        .update({
                          principal_amount: principal,
                          interest_amount: interestPerPayment,
                          total_amount: total,
                          amount: total
                        } as any)
                        .eq('id', installment.id);
                      if (updErr) throw updErr;
                    }

                    // IMPORTANTE: Recalcular balance usando la misma lógica que LoanDetailsView
                    // Obtener TODAS las cuotas pendientes actualizadas (después de actualizar/eliminar cuotas)
                    const { data: updatedInstallments, error: updInstErr } = await supabase
                      .from('installments')
                      .select('id, installment_number, principal_amount, interest_amount, is_paid, total_amount, due_date, amount')
                      .eq('loan_id', loan.id);
                    if (updInstErr) throw updInstErr;
                  
                    // Calcular cargos no pagados (considerando pagos parciales)
                    const allCharges = (updatedInstallments || []).filter(inst => {
                      const isCharge = Math.abs(inst.interest_amount || 0) < 0.01 && 
                                      Math.abs((inst.principal_amount || 0) - (inst.total_amount || 0)) < 0.01;
                      return isCharge && !inst.is_paid;
                    });
                  
                    // Obtener pagos para calcular cargos parcialmente pagados
                    const { data: paymentsForCharges, error: pfcErr } = await supabase
                      .from('payments')
                      .select('principal_amount, interest_amount, due_date, amount')
                      .eq('loan_id', loan.id);
                    if (pfcErr) throw pfcErr;
                  
                    const unpaidChargesAmount = allCharges.reduce((sum, inst) => {
                      const chargeAmount = Number(inst.total_amount || inst.amount || 0);
                      const chargeDueDate = inst.due_date?.split('T')[0];
                      
                      if (!chargeDueDate) {
                        return round2(sum + chargeAmount);
                      }
                    
                      const chargesWithSameDate = allCharges.filter(c => c.due_date?.split('T')[0] === chargeDueDate)
                        .sort((a, b) => (a.installment_number || 0) - (b.installment_number || 0));
                    
                      const paymentsForDate = (paymentsForCharges || []).filter(p => {
                        const paymentDueDate = p.due_date?.split('T')[0];
                        const hasNoInterest = Math.abs(p.interest_amount || 0) < 0.01;
                        return paymentDueDate === chargeDueDate && hasNoInterest;
                      });
                    
                      const totalPaidForDate = paymentsForDate.reduce((s, p: any) => s + (Number(p.principal_amount) || Number(p.amount) || 0), 0);
                      const chargeIndex = chargesWithSameDate.findIndex(c => c.id === inst.id);
                    
                      let principalPaidForThisCharge = 0;
                      if (chargeIndex >= 0 && chargesWithSameDate.length > 0) {
                        let remainingPayments = totalPaidForDate;
                        for (let i = 0; i < chargeIndex; i++) {
                          const prevCharge = chargesWithSameDate[i];
                          remainingPayments -= Math.min(remainingPayments, Number(prevCharge.total_amount || prevCharge.amount || 0));
                        }
                        principalPaidForThisCharge = Math.min(remainingPayments, chargeAmount);
                      } else {
                        principalPaidForThisCharge = Math.min(totalPaidForDate, chargeAmount);
                      }
                    
                      const remainingChargeAmount = Math.max(0, chargeAmount - principalPaidForThisCharge);
                      return round2(sum + remainingChargeAmount);
                    }, 0);
                  
                    // Recalcular total_amount y remaining_balance sin redondear a entero
                    const paidRegularTotal = round2(
                      installments
                        .filter(inst => {
                          const isCharge = Math.abs(inst.interest_amount || 0) < 0.01 &&
                            Math.abs((inst.principal_amount || 0) - (inst.total_amount || 0)) < 0.01;
                          return Boolean(inst.is_paid) && !isCharge;
                        })
                        .reduce((sum, inst) => sum + Number(inst.total_amount || inst.amount || 0), 0)
                    );
                    const unpaidRegularTotal = round2(
                      remainingInstallments.reduce((sum, inst) => sum + Number(inst.total_amount || inst.amount || 0), 0)
                    );
                    const newTotalAmount = round2(paidRegularTotal + unpaidRegularTotal);

                    const { data: paymentsForBalance, error: pfbErr } = await supabase
                      .from('payments')
                      .select('amount')
                      .eq('loan_id', loan.id);
                    if (pfbErr) throw pfbErr;
                    const totalPaidAmount = round2((paymentsForBalance || []).reduce((s, p: any) => s + (Number(p.amount) || 0), 0));
                    const chargesTotal = round2(
                      (updatedInstallments || [])
                        .filter(inst => {
                          const isCharge = Math.abs(inst.interest_amount || 0) < 0.01 &&
                            Math.abs((inst.principal_amount || 0) - (inst.total_amount || 0)) < 0.01;
                          return isCharge;
                        })
                        .reduce((s, inst: any) => s + Number(inst.total_amount || inst.amount || 0), 0)
                    );
                    const newBalance = Math.max(0, round2((newTotalAmount + chargesTotal) - totalPaidAmount));
                  
                    // Disparar evento para refrescar tablas después de actualizar cuotas
                    console.log('🔄 Disparando evento installmentsUpdated después de actualizar cuotas (mantener monto - con eliminación)');
                    window.dispatchEvent(new CustomEvent('installmentsUpdated', { 
                      detail: { loanId: loan.id } 
                    }));

                    loanUpdates = {
                      term_months: Math.max(0, (loan.term_months || 0) - (remainingInstallmentsCount - newInstallmentCount)),
                      remaining_balance: newBalance,
                      total_amount: newTotalAmount
                    };

                    // Actualizar end_date si es necesario
                    if (loan.end_date) {
                      const endDate = new Date(loan.end_date);
                      const reductionInMonths = remainingInstallmentsCount - newInstallmentCount;
                      endDate.setMonth(endDate.getMonth() - reductionInMonths);
                      loanUpdates.end_date = endDate.toISOString().split('T')[0];
                    }
                  } else {
                    // Si no se reducen cuotas, solo actualizar los montos
                    for (const installment of unpaidInstallments) {
                      const { error: updErr } = await supabase
                        .from('installments')
                        .update({
                          principal_amount: principalPerPayment,
                          interest_amount: interestPerPayment,
                          total_amount: installmentAmount,
                          amount: installmentAmount
                        })
                        .eq('id', installment.id);
                      if (updErr) throw updErr;
                    }

                    // IMPORTANTE: Recalcular balance usando la misma lógica que LoanDetailsView
                    // Obtener TODAS las cuotas pendientes actualizadas (después de actualizar los montos)
                    const { data: updatedInstallments, error: updInstErr2 } = await supabase
                      .from('installments')
                      .select('id, installment_number, principal_amount, interest_amount, is_paid, total_amount, due_date, amount')
                      .eq('loan_id', loan.id);
                    if (updInstErr2) throw updInstErr2;
                  
                    // Calcular cargos no pagados (considerando pagos parciales)
                    const allCharges = (updatedInstallments || []).filter(inst => {
                      const isCharge = Math.abs(inst.interest_amount || 0) < 0.01 && 
                                      Math.abs((inst.principal_amount || 0) - (inst.total_amount || 0)) < 0.01;
                      return isCharge && !inst.is_paid;
                    });
                  
                    // Obtener pagos para calcular cargos parcialmente pagados
                    const { data: paymentsForCharges, error: pfcErr2 } = await supabase
                      .from('payments')
                      .select('principal_amount, interest_amount, due_date, amount')
                      .eq('loan_id', loan.id);
                    if (pfcErr2) throw pfcErr2;
                  
                    const unpaidChargesAmount = allCharges.reduce((sum, inst) => {
                      const chargeAmount = Number(inst.total_amount || inst.amount || 0);
                      const chargeDueDate = inst.due_date?.split('T')[0];
                      
                      if (!chargeDueDate) {
                        return round2(sum + chargeAmount);
                      }
                    
                      const chargesWithSameDate = allCharges.filter(c => c.due_date?.split('T')[0] === chargeDueDate)
                        .sort((a, b) => (a.installment_number || 0) - (b.installment_number || 0));
                    
                      const paymentsForDate = (paymentsForCharges || []).filter(p => {
                        const paymentDueDate = p.due_date?.split('T')[0];
                        const hasNoInterest = Math.abs(p.interest_amount || 0) < 0.01;
                        return paymentDueDate === chargeDueDate && hasNoInterest;
                      });
                    
                      const totalPaidForDate = paymentsForDate.reduce((s, p: any) => s + (Number(p.principal_amount) || Number(p.amount) || 0), 0);
                      const chargeIndex = chargesWithSameDate.findIndex(c => c.id === inst.id);
                    
                      let principalPaidForThisCharge = 0;
                      if (chargeIndex >= 0 && chargesWithSameDate.length > 0) {
                        let remainingPayments = totalPaidForDate;
                        for (let i = 0; i < chargeIndex; i++) {
                          const prevCharge = chargesWithSameDate[i];
                          remainingPayments -= Math.min(remainingPayments, Number(prevCharge.total_amount || prevCharge.amount || 0));
                        }
                        principalPaidForThisCharge = Math.min(remainingPayments, chargeAmount);
                      } else {
                        principalPaidForThisCharge = Math.min(totalPaidForDate, chargeAmount);
                      }
                    
                      const remainingChargeAmount = Math.max(0, chargeAmount - principalPaidForThisCharge);
                      return round2(sum + remainingChargeAmount);
                    }, 0);
                  
                    // Calcular capital pendiente desde cuotas regulares (excluyendo cargos)
                    const capitalPendingFromInstallments = round2((updatedInstallments || [])
                      .filter(inst => {
                        const isCharge = Math.abs(inst.interest_amount || 0) < 0.01 && 
                                        Math.abs((inst.principal_amount || 0) - (inst.total_amount || 0)) < 0.01;
                        return !inst.is_paid && !isCharge;
                      })
                      .reduce((sum, inst) => sum + Number(inst.principal_amount || 0), 0));
                  
                    // Calcular interés pendiente (solo de cuotas regulares, no cargos)
                    const interestPendingFromInstallments = round2((updatedInstallments || [])
                      .filter(inst => {
                        const isCharge = Math.abs(inst.interest_amount || 0) < 0.01 && 
                                        Math.abs((inst.principal_amount || 0) - (inst.total_amount || 0)) < 0.01;
                        return !inst.is_paid && !isCharge;
                      })
                      .reduce((sum, inst) => sum + Number(inst.interest_amount || 0), 0));
                  
                    // Balance = Capital pendiente + Interés pendiente + Cargos pendientes
                    const newBalance = Math.max(0, round2(capitalPendingFromInstallments + interestPendingFromInstallments + unpaidChargesAmount));
                  
                    // Disparar evento para refrescar tablas después de actualizar cuotas
                    console.log('🔄 Disparando evento installmentsUpdated después de actualizar cuotas (mantener monto - sin eliminación)');
                    window.dispatchEvent(new CustomEvent('installmentsUpdated', { 
                      detail: { loanId: loan.id } 
                    }));

                    // Calcular el nuevo total_amount del préstamo
                    const newTotalInterest = round2((capitalAfter * loan.interest_rate / 100) * remainingInstallmentsCount);
                    const newTotalAmount = round2(capitalAfter + newTotalInterest);
                  
                    loanUpdates = {
                      remaining_balance: newBalance,
                      total_amount: newTotalAmount
                    };
                  }
                }
              }
            }

            console.log('📝 ACTUALIZANDO PRÉSTAMO con loanUpdates:', loanUpdates);
            
            // Guardar datos del abono para mostrar recibo
            const paymentDate = new Date().toLocaleDateString('es-DO');
            const { data: updatedLoanData } = await supabase
              .from('loans')
              .select(`
                *,
                clients:client_id (
                  id,
                  full_name,
                  dni,
                  phone
                )
              `)
              .eq('id', loan.id)
              .single();

            console.log('📊 Datos del préstamo después del update:', updatedLoanData);

            if (updatedLoanData) {
              setLastCapitalPaymentData({
                loan: updatedLoanData,
                capitalPayment: {
                  amount: capitalPaymentAmount,
                  penaltyAmount: calculatedPenaltyAmount,
                  capitalBefore,
                  capitalAfter,
                  keepInstallments,
                  adjustmentReason: data.adjustment_reason,
                  paymentDate
                },
                remainingBalance: loanUpdates.remaining_balance || updatedLoanData.remaining_balance
              });

              // Mostrar modal de impresión después del éxito
              setShowPrintFormatModal(true);
              
              // IMPORTANTE: Actualizar el préstamo incluso si se muestra el modal
              // Disparar evento para refrescar historial y actualizar datos
              console.log('🔄 Disparando evento loanHistoryRefresh para loanId:', loan.id);
              window.dispatchEvent(new CustomEvent('loanHistoryRefresh', { 
                detail: { loanId: loan.id } 
              }));
              
              // Llamar a onUpdate para refrescar los datos del préstamo
              console.log('🔄 Llamando a onUpdate()');
              onUpdate();
            }

            const successMessage = isPenalty && calculatedPenaltyAmount > 0
              ? `Abono a capital de RD$${capitalPaymentAmount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} registrado exitosamente. Penalidad de RD$${calculatedPenaltyAmount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} agregada como cargo adicional.`
              : `Abono a capital de RD$${capitalPaymentAmount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} registrado exitosamente`;
            toast.success(successMessage);
            
            // NO cerrar el modal ni retornar aquí - dejar que el flujo continúe para que se actualice el préstamo
          }
          break;
      }

      // IMPORTANTE: Obtener valores actuales de la BD ANTES de la actualización
      // para asegurar que los valores anteriores en el historial sean correctos
      const { data: loanBeforeUpdate, error: fetchError } = await supabase
        .from('loans')
        .select('remaining_balance, monthly_payment, interest_rate, term_months')
        .eq('id', loan.id)
        .single();
      
      if (fetchError) {
        console.error('⚠️ Error obteniendo valores antes de actualización:', fetchError);
      }
      
      // Usar valores de la BD si están disponibles, sino usar los valores del objeto loan
      const actualBalance = loanBeforeUpdate?.remaining_balance ?? loan.remaining_balance;
      const actualPayment = loanBeforeUpdate?.monthly_payment ?? loan.monthly_payment;
      const actualRate = loanBeforeUpdate?.interest_rate ?? loan.interest_rate;
      const actualTermMonths = loanBeforeUpdate?.term_months ?? loan.term_months;
      
      console.log('📝 Valores obtenidos de BD ANTES de actualización:', {
        from_bd: !!loanBeforeUpdate,
        actualBalance,
        actualPayment,
        actualRate,
        actualTermMonths,
        loanBalance_prop: loan.remaining_balance,
        loanPayment_prop: loan.monthly_payment
      });

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

      // Para cargos y otros cambios que afectan el balance, asegurarse de que la actualización se complete
      // antes de continuar, para que los datos estén actualizados cuando se recarguen
      if (updateType === 'add_charge' || updateType === 'remove_late_fee' || updateType === 'term_extension' || updateType === 'capital_payment') {
        // Verificar que la actualización se completó correctamente leyendo los datos actualizados
        const { data: updatedLoan, error: verifyError } = await supabase
          .from('loans')
          .select('remaining_balance, term_months, monthly_payment, next_payment_date')
          .eq('id', loan.id)
          .single();
        
        if (verifyError) {
          console.warn('Error verificando actualización del préstamo:', verifyError);
        } else if (updatedLoan) {
          // Los datos se actualizaron correctamente, continuar
          console.log('✅ Préstamo actualizado correctamente:', updatedLoan);
        }
        
        // Disparar evento adicional para asegurar que las tablas se refresquen
        if (updateType === 'capital_payment') {
          console.log('🔄 Disparando evento installmentsUpdated después de actualizar préstamo');
          window.dispatchEvent(new CustomEvent('installmentsUpdated', { 
            detail: { loanId: loan.id } 
          }));
        }
      }

      // Registrar en historial de cambios (si existe la tabla)
      try {
        // Mapear updateType a valores permitidos en loan_history.change_type
        // Guardar el update_type original en notes para poder mostrar nombres descriptivos
        const mapChangeType = (type: string): string => {
          switch (type) {
            case 'settle_loan':
              return 'payment'; // Pago completo del préstamo
            case 'add_charge':
              return 'balance_adjustment'; // Se guardará el tipo original en notes
            case 'remove_late_fee':
              return 'balance_adjustment'; // Se guardará el tipo original en notes
            case 'term_extension':
              return 'term_extension';
            case 'edit_loan':
              return 'balance_adjustment'; // Se guardará el tipo original en notes
            case 'payment_agreement':
              return 'balance_adjustment'; // Se guardará el tipo original en notes
            case 'capital_payment':
              return 'balance_adjustment'; // Abono a capital (usar balance_adjustment porque capital_payment no está en el schema)
            case 'delete_loan':
              return 'status_change'; // Eliminación de préstamo
            default:
              return 'balance_adjustment';
          }
        };

        // Construir old_value y new_value como strings JSON
        // Para capital_payment, usar loanUpdates en lugar de calculatedValues
        const finalNewBalance = updateType === 'capital_payment' && loanUpdates.remaining_balance !== undefined
          ? loanUpdates.remaining_balance
          : calculatedValues.newBalance;
        const finalNewPayment = updateType === 'capital_payment' && loanUpdates.monthly_payment !== undefined
          ? loanUpdates.monthly_payment
          : (updateType === 'capital_payment' ? loan.monthly_payment : calculatedValues.newPayment);
        
        // IMPORTANTE: Los valores anteriores deben ser los valores ANTES de cualquier cambio
        // Usar los valores obtenidos de la BD ANTES de la actualización (actualBalance, actualPayment, etc.)
        let oldValueObj: any = {
          balance: actualBalance,
          payment: actualPayment,
          rate: actualRate
        };
        
        let newValueObj: any = {
          balance: finalNewBalance,
          payment: finalNewPayment,
          rate: actualRate
        };
        
        // Agregar term_months para extensiones de plazo
        if (updateType === 'term_extension') {
          oldValueObj.term_months = actualTermMonths;
          newValueObj.term_months = buildExtensionSchedule(data.additional_months || 0)?.newTermPeriods
            ?? (actualTermMonths || 0) + (data.additional_months || 0);
        }

        let description = `${updateType}: ${data.adjustment_reason}`;

        if (updateType === 'term_extension') {
          // CORRECCIÓN (2026-08-31): este texto multiplicaba el número por 30/4/2 porque el
          // campo se interpretaba como MESES y había que convertirlo a períodos. Ahora el campo
          // ya son CUOTAS de la frecuencia del préstamo, así que la conversión sobraba y además
          // era aproximada ("30 días" por mes). Se nombra la frecuencia y ya.
          const schedule = buildExtensionSchedule(data.additional_months || 0);
          const added = schedule?.additionalCount ?? (data.additional_months || 0);
          const freqLabel = getFrequencyLabel(loan.payment_frequency, added !== 1);

          description = `Extensión de Plazo: ${data.adjustment_reason}. ` +
            `Se ${added === 1 ? 'agregó 1 cuota' : `agregaron ${added} cuotas`} (${added} ${freqLabel}).`;
          if (schedule) {
            description += ` ${schedule.pendingCountAfter} cuotas pendientes de ` +
              `RD$${schedule.representativePayment.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`;
          }
          // Rastro de los abonos eliminados: el pago desaparece de `payments`, así que este es
          // el único sitio donde queda constancia de cuánto se descartó y de qué cuotas.
          const borrados = discardedPaymentsRef.current;
          if (borrados.length > 0) {
            const totalBorrado = borrados.reduce((s, p) => s + p.amount, 0);
            description += ` ELIMINADOS ${borrados.length} abono(s) por ` +
              `RD$${totalBorrado.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ` +
              `en cuotas sin terminar de pagar (${borrados.map(p => p.due_date).join(', ')}).`;
            newValueObj.discarded_payments = borrados.length;
            newValueObj.discarded_amount = totalBorrado;
          }
          if (data.notes) {
            description += ` Notas: ${data.notes}`;
          }
        } else if (updateType === 'remove_late_fee') {
          oldValueObj.current_late_fee = currentLateFee;
          newValueObj.current_late_fee = (currentLateFee || 0) - (data.late_fee_amount || 0);
          description = `Eliminar Mora: ${data.adjustment_reason}. Monto eliminado: RD$${(data.late_fee_amount || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        } else if (updateType === 'add_charge') {
          oldValueObj.balance =
            (freshRemainingBalance !== null && freshRemainingBalance !== undefined)
              ? freshRemainingBalance
              : loan.remaining_balance;
          newValueObj.balance =
            (loanUpdates?.remaining_balance !== null && loanUpdates?.remaining_balance !== undefined)
              ? loanUpdates.remaining_balance
              : calculatedValues.newBalance;
          description = `Agregar Cargo: ${data.adjustment_reason}. Monto: RD$${(data.amount || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          if (data.notes) {
            description += `. Notas: ${data.notes}`;
          }
        } else if (updateType === 'edit_loan') {
          oldValueObj = {
            amount: loan.amount,
            balance: loan.remaining_balance,
            payment: loan.monthly_payment,
            rate: loan.interest_rate,
            term_months: loan.term_months,
            amortization_type: loan.amortization_type || 'simple'
          };
          const finalAmountForHistory = loan.status === 'pending' ? loan.amount : (data.edit_amount || loan.amount);
          newValueObj = {
            amount: finalAmountForHistory,
            balance: calculatedValues.newBalance,
            payment: calculatedValues.newPayment,
            rate: data.edit_interest_rate || loan.interest_rate,
            term_months: data.edit_term_months || loan.term_months,
            amortization_type: data.edit_amortization_type || loan.amortization_type || 'simple'
          };
          description = `Editar Préstamo: ${data.adjustment_reason}`;
        } else if (updateType === 'settle_loan') {
          const totalAmount = (data.settle_capital || 0) + (data.settle_interest || 0) + (data.settle_late_fee || 0);
          description = `Saldar Préstamo: ${data.adjustment_reason}. Monto total: RD$${totalAmount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          if (data.payment_method) {
            description += `. Método: ${data.payment_method}`;
          }
          if (data.notes) {
            description += `. Notas: ${data.notes}`;
          }
        } else if (updateType === 'capital_payment') {
          const capitalAfter = Math.max(0, originalPendingCapital - (data.capital_payment_amount || 0));
          // Usar loanUpdates si está disponible (ya calculado correctamente), sino usar finalNewBalance
          const newBalance = loanUpdates.remaining_balance !== undefined ? loanUpdates.remaining_balance : finalNewBalance;
          
          oldValueObj = {
            balance: loan.remaining_balance,
            capital_before: originalPendingCapital,
            payment: loan.monthly_payment,
            rate: loan.interest_rate
          };
          newValueObj = {
            balance: newBalance,
            capital_after: capitalAfter,
            payment: finalNewPayment,
            rate: loan.interest_rate
          };
          
          if (data.is_penalty && data.penalty_percentage) {
            const calculatedPenalty = (originalPendingCapital * data.penalty_percentage) / 100;
            description = `Abono a capital: RD$${(data.capital_payment_amount || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. Penalidad (${data.penalty_percentage}%): RD$${calculatedPenalty.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. ${data.adjustment_reason || ''}`;
            if (data.notes) {
              description += `. ${data.notes}`;
            }
          } else {
            description = `Abono a capital: RD$${(data.capital_payment_amount || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. ${data.adjustment_reason || ''}`;
            if (data.notes) {
              description += `. ${data.notes}`;
            }
          }
        }
        
        const historyData: any = {
          loan_id: loan.id,
          change_type: mapChangeType(updateType),
          old_value: JSON.stringify(oldValueObj),
          new_value: JSON.stringify(newValueObj),
          description: description,
          created_by: companyId,
          ...(updateType === 'pay_charges' && chargePaymentIds.length > 0
            ? { notes: JSON.stringify({ payment_ids: chargePaymentIds, update_type: 'pay_charges' }) }
            : {})
        };
        
        console.log('📝 INSERTANDO EN HISTORIAL:', {
          updateType,
          change_type: mapChangeType(updateType),
          historyData,
          loan_id: loan.id
        });
        
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
          console.log('📊 Historial insertado - ID:', insertedHistory?.[0]?.id);
          // Disparar evento inmediatamente después de guardar exitosamente
          if (updateType === 'add_charge' || updateType === 'remove_late_fee' || updateType === 'capital_payment') {
            console.log('🔄 Disparando evento loanHistoryRefresh para:', updateType);
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
        pay_charges: 'Pago de cargo(s) registrado exitosamente',
        term_extension: 'Plazo extendido exitosamente',
        settle_loan: 'Préstamo saldado exitosamente',
        delete_loan: 'Préstamo eliminado exitosamente (recuperable por 2 meses)',
        remove_late_fee: `Mora eliminada exitosamente`,
        edit_loan: 'Préstamo editado exitosamente. Las cuotas han sido recalculadas.'
      };

      // Si es settle_loan o pay_charges, mostrar modal de impresión en lugar de cerrar
      if (updateType === 'settle_loan' || updateType === 'pay_charges') {
        // Mostrar primero el modal de impresión
        setShowPrintFormatModal(true);
        setLoading(false);
        // No cerrar el modal ni llamar a onUpdate todavía, esperar a que el usuario imprima/envíe por WhatsApp
        return;
      }

      const message = updateType === 'remove_late_fee' 
        ? `Mora eliminada exitosamente. Nueva mora: RD$${((currentLateFee || 0) - (data.late_fee_amount || 0)).toLocaleString()}`
        : actionMessages[updateType] || 'Préstamo actualizado exitosamente';
      
      toast.success(message);
      
      // Llamar a onUpdate() inmediatamente para que los datos se actualicen sin delays
      // Los listeners de Realtime se encargarán de actualizar la UI instantáneamente
      onUpdate();
      
      // Cerrar el modal inmediatamente - las actualizaciones optimistas y Realtime
      // se encargarán de actualizar la UI sin necesidad de delays
      onClose();
    } catch (error: any) {
      const msg =
        error?.message ||
        error?.error_description ||
        error?.details ||
        (typeof error === 'string' ? error : '');
      console.error('Error updating loan:', error);
      toast.error(`Error al actualizar el préstamo${msg ? `: ${msg}` : ''}`);
    } finally {
      setLoading(false);
    }
  };

  const getUpdateTypeIcon = (type: string) => {
    switch (type) {
      case 'add_charge': return <PlusCircle className="h-4 w-4" />;
      case 'pay_charges': return <Receipt className="h-4 w-4" />;
      case 'term_extension': return <Calendar className="h-4 w-4" />;
      case 'settle_loan': return <DollarSign className="h-4 w-4" />;
      case 'delete_loan': return <Trash2 className="h-4 w-4" />;
      case 'remove_late_fee': return <MinusCircle className="h-4 w-4" />;
      case 'payment_agreement': return <Handshake className="h-4 w-4" />;
      case 'capital_payment': return <CreditCard className="h-4 w-4" />;
      case 'edit_loan': return <Edit className="h-4 w-4" />;
      default: return <Edit className="h-4 w-4" />;
    }
  };

  const getUpdateTypeLabel = (type: string) => {
    const labels = {
      add_charge: 'Agregar Cargo',
      pay_charges: 'Pagar Cargos',
      term_extension: 'Extensión de Plazo',
      settle_loan: 'Saldar Préstamo',
      delete_loan: 'Eliminar Préstamo',
      remove_late_fee: 'Eliminar Mora',
      payment_agreement: 'Acuerdos de Pago',
      capital_payment: 'Abono a Capital',
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
      case 'pay_charges':
        return [
          { value: 'payment_agreement', label: 'Acuerdo de pago' },
          { value: 'goodwill', label: 'Buena voluntad del cliente' },
          { value: 'payment_plan', label: 'Plan de pagos' },
          { value: 'financial_hardship', label: 'Dificultad financiera' },
          { value: 'dispute_resolution', label: 'Resolución de disputa' },
          { value: 'promotional', label: 'Promoción especial' },
          { value: 'partial_payment', label: 'Pago parcial acordado' },
          { value: 'client_request', label: 'Solicitud del cliente' },
          { value: 'early_payment', label: 'Pago anticipado' },
          { value: 'refinancing', label: 'Refinanciamiento' },
          { value: 'debt_consolidation', label: 'Consolidación de deuda' },
          { value: 'family_support', label: 'Apoyo familiar' },
          { value: 'income_received', label: 'Ingreso recibido' },
          { value: 'bonus_payment', label: 'Pago con bono/aguinaldo' },
          { value: 'tax_refund', label: 'Devolución de impuestos' },
          { value: 'other', label: 'Otra razón' }
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
      case 'capital_payment':
        return [
          { value: 'client_request', label: 'Solicitud del Cliente' },
          { value: 'early_payment', label: 'Pago Anticipado' },
          { value: 'extra_payment', label: 'Pago Extraordinario' },
          { value: 'capital_reduction', label: 'Reducción de Capital' },
          { value: 'payment_agreement', label: 'Acuerdo de Pago' },
          { value: 'other', label: 'Otra Razón' }
        ];
      default:
        return [
          { value: 'other', label: 'Otra Razón' }
        ];
    }
  };

  // Función para obtener la etiqueta en español de una razón
  const getReasonLabel = (updateType: string, reasonValue: string) => {
    const reasons = getReasonsForUpdateType(updateType);
    const reason = reasons.find(r => r.value === reasonValue);
    return reason ? reason.label : reasonValue;
  };

  // Calcular si hay cargos pendientes
  const hasPendingCharges = useMemo(() => {
    return installments.some(inst => {
      const isCharge = Math.abs(inst.interest_amount || 0) < 0.01 && 
                      Math.abs((inst.principal_amount || 0) - (inst.total_amount || 0)) < 0.01;
      const pending = (inst.total_amount || 0) - (inst.paid_amount || 0);
      return isCharge && pending > 0.01;
    });
  }, [installments]);

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
                                  <SelectItem value="pay_charges">
                                    <div className="flex items-center gap-2">
                                      <Receipt className="h-4 w-4" />
                                      Pagar Cargos
                                    </div>
                                  </SelectItem>
                                {!isIndefiniteLoan && (
                                  <SelectItem value="term_extension" disabled={hasPendingCharges}>
                                    <div className="flex items-center gap-2">
                                      <Calendar className="h-4 w-4" />
                                      <span>Extensión de Plazo</span>
                                      {hasPendingCharges && (
                                        <span className="text-xs text-orange-600">(Pagar cargos primero)</span>
                                      )}
                                    </div>
                                  </SelectItem>
                                )}
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
                                  <SelectItem value="capital_payment">
                                    <div className="flex items-center gap-2">
                                      <CreditCard className="h-4 w-4" />
                                      Abono a Capital
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
                              <NumberInput
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
                                <NumberInput
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
                                <NumberInput
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
                                <NumberInput
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

                        <FormField
                          control={form.control}
                          name="payment_method"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Método de Pago</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value || 'cash'}>
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
                                <NumberInput
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

                    {form.watch('update_type') === 'capital_payment' && (
                      <div className="space-y-4">
                        {overdueInstallmentsCount > 0 && (
                          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                            <div className="text-sm text-red-800 space-y-1">
                              <div className="font-semibold flex items-center gap-2">
                                <AlertCircle className="h-4 w-4" />
                                No se puede realizar abono a capital
                              </div>
                              <div>
                                Tiene {overdueInstallmentsCount} cuota(s) vencida(s). Debe pagar todas las cuotas vencidas antes de realizar un abono a capital.
                              </div>
                            </div>
                          </div>
                        )}
                        <div className={`space-y-4 ${overdueInstallmentsCount > 0 ? 'opacity-50' : ''}`}>
                          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                          <div className="text-sm text-green-800 space-y-1">
                            <div><strong>Capital Pendiente Actual:</strong> RD${pendingCapital.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                          </div>
                        </div>

                        <FormField
                          control={form.control}
                          name="capital_payment_amount"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Monto a Abonar</FormLabel>
                              <FormControl>
                                <NumberInput
                                  placeholder="0.00"
                                  step="0.01"
                                  min="0.01"
                                  max={pendingCapital}
                                  disabled={overdueInstallmentsCount > 0}
                                  {...field}
                                  value={field.value || ''}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    if (value === '') {
                                      field.onChange(undefined);
                                    } else {
                                      const numValue = parseFloat(value);
                                      if (!isNaN(numValue) && numValue >= 0.01) {
                                        field.onChange(Math.min(numValue, pendingCapital));
                                      }
                                    }
                                  }}
                                />
                              </FormControl>
                              <div className="text-xs text-gray-500">
                                Máximo: RD${pendingCapital.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="keep_installments"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                              <FormControl>
                                <input
                                  type="checkbox"
                                  checked={field.value || false}
                                  onChange={field.onChange}
                                  disabled={overdueInstallmentsCount > 0}
                                  className="mt-1"
                                />
                              </FormControl>
                              <div className="space-y-1 leading-none">
                                <FormLabel>Mantener Cuotas</FormLabel>
                                <p className="text-xs text-gray-500">
                                  Si está marcado: El número de cuotas no cambia, se recalcula el interés y las cuotas futuras disminuyen de monto.
                                  <br />
                                  Si no está marcado: Se mantiene el monto de la cuota y se reduce el número de cuotas.
                                </p>
                              </div>
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="is_penalty"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                              <FormControl>
                                <input
                                  type="checkbox"
                                  checked={field.value || false}
                                  onChange={(e) => {
                                    field.onChange(e.target.checked);
                                    if (!e.target.checked) {
                                      form.setValue('penalty_percentage', undefined);
                                      setPenaltyAmount(0);
                                    }
                                  }}
                                  disabled={overdueInstallmentsCount > 0}
                                  className="mt-1"
                                />
                              </FormControl>
                              <div className="space-y-1 leading-none flex-1">
                                <FormLabel>Penalidad</FormLabel>
                                <p className="text-xs text-gray-500">
                                  Aplicar una penalidad como porcentaje del capital pendiente. El monto de la penalidad se agregará como un cargo adicional.
                                </p>
                              </div>
                            </FormItem>
                          )}
                        />

                        {form.watch('is_penalty') && (
                          <div className="space-y-4 pl-6 border-l-2 border-orange-300">
                            <FormField
                              control={form.control}
                              name="penalty_percentage"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Porcentaje de Penalidad (%)</FormLabel>
                                  <FormControl>
                                    <NumberInput
                                      placeholder="0.00"
                                      step="0.01"
                                      min="0"
                                      max="100"
                                      disabled={overdueInstallmentsCount > 0}
                                      {...field}
                                      value={field.value || ''}
                                      onChange={(e) => {
                                        const value = e.target.value;
                                        if (value === '') {
                                          field.onChange(undefined);
                                          setPenaltyAmount(0);
                                        } else {
                                          const numValue = parseFloat(value);
                                          if (!isNaN(numValue) && numValue >= 0 && numValue <= 100) {
                                            field.onChange(numValue);
                                            // El monto se calculará automáticamente en el useEffect
                                          }
                                        }
                                      }}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            {penaltyAmount > 0 && (
                              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                                <div className="text-sm text-orange-800 space-y-1">
                                  <div><strong>Monto de Penalidad:</strong> RD${penaltyAmount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                  <div className="text-xs text-orange-700">
                                    Este monto se agregará como un cargo adicional al préstamo.
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {form.watch('capital_payment_amount') && form.watch('capital_payment_amount')! > 0 && (
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
                            <div className="text-sm font-semibold text-blue-900">Vista Previa del Impacto:</div>
                            <div className="text-sm text-blue-800 space-y-1">
                              <div><strong>Nuevo Capital Pendiente:</strong> RD${capitalPaymentPreview.newPendingCapital.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                              {form.watch('is_penalty') && penaltyAmount > 0 && (
                                <div className="pt-2 border-t border-blue-300">
                                  <div className="text-orange-700"><strong>Cargo de Penalidad:</strong> RD${penaltyAmount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                                </div>
                              )}
                              {capitalPaymentPreview.installmentsImpact && (
                                <div className="pt-2 border-t border-blue-300">
                                  <strong>Impacto en Cuotas:</strong> {capitalPaymentPreview.installmentsImpact}
                                </div>
                              )}
                            </div>
                            <div className="pt-3">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={handlePreviewTable}
                                disabled={overdueInstallmentsCount > 0}
                                className="w-full"
                              >
                                <Eye className="h-4 w-4 mr-2" />
                                Previsualizar Tabla de Cuotas
                              </Button>
                            </div>
                          </div>
                        )}
                        </div>
                      </div>
                    )}



                    {form.watch('update_type') === 'pay_charges' && (
                      <div className="space-y-4">
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                          <div className="text-sm text-blue-800">
                            <strong>💳 Pagar Cargos</strong>
                            <p className="mt-1">Selecciona uno o más cargos que deseas pagar.</p>
                          </div>
                        </div>

                        {/* Tabla de Cargos Pendientes */}
                        <div className="border rounded-lg overflow-hidden">
                          <div className="bg-gray-50 px-4 py-2 border-b">
                            <h4 className="font-semibold text-gray-900">Cargos Pendientes</h4>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full">
                              <thead>
                                <tr className="border-b bg-gray-50 text-xs">
                                  <th className="text-left p-2 font-semibold">
                                    <input 
                                      type="checkbox"
                                      checked={(() => {
                                        const charges = installments.filter(inst => {
                                          const isCharge = Math.abs(inst.interest_amount || 0) < 0.01 && 
                                                          Math.abs((inst.principal_amount || 0) - (inst.total_amount || 0)) < 0.01;
                                          return isCharge && !inst.is_paid;
                                        });
                                        return charges.length > 0 && selectedCharges.length === charges.length;
                                      })()}
                                      onChange={(e) => {
                                        const charges = installments.filter(inst => {
                                          const isCharge = Math.abs(inst.interest_amount || 0) < 0.01 &&
                                                          Math.abs((inst.principal_amount || 0) - (inst.total_amount || 0)) < 0.01;
                                          const pending = (inst.total_amount || 0) - (inst.paid_amount || 0);
                                          return isCharge && pending > 0.01;
                                        });
                                        if (e.target.checked) {
                                          setSelectedCharges(charges.map(c => c.id));
                                          const totalPending = charges.reduce((sum, c) => {
                                            const total = c.total_amount || 0;
                                            const paid = c.paid_amount || 0;
                                            return sum + (total - paid);
                                          }, 0);
                                          setChargePaymentAmount(totalPending);
                                        } else {
                                          setSelectedCharges([]);
                                          setChargePaymentAmount(0);
                                        }
                                      }}
                                      className="cursor-pointer"
                                    />
                                  </th>
                                  <th className="text-left p-2 font-semibold">Cuota #</th>
                                  <th className="text-left p-2 font-semibold">Fecha Venc.</th>
                                  <th className="text-left p-2 font-semibold">Descripción</th>
                                  <th className="text-right p-2 font-semibold">Total</th>
                                  <th className="text-right p-2 font-semibold">Pagado</th>
                                  <th className="text-right p-2 font-semibold">Pendiente</th>
                                  <th className="text-center p-2 font-semibold">Estado</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(() => {
                                  const charges = installments.filter(inst => {
                                    const isCharge = Math.abs(inst.interest_amount || 0) < 0.01 &&
                                                    Math.abs((inst.principal_amount || 0) - (inst.total_amount || 0)) < 0.01 &&
                                                    (inst.principal_amount || 0) > 0;
                                    // Use is_paid as the authoritative field; paid_amount may lag behind
                                    return isCharge && !inst.is_paid;
                                  });

                                  if (charges.length === 0) {
                                    return (
                                      <tr>
                                        <td colSpan={8} className="text-center py-8 text-gray-500">
                                          <div className="flex flex-col items-center gap-2">
                                            <CheckCircle className="h-12 w-12 text-gray-300" />
                                            <p>No hay cargos pendientes</p>
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  }

                                  return charges.map((charge) => {
                                    const totalAmount = charge.total_amount || charge.amount || 0;
                                    const paidAmount = charge.paid_amount || 0;
                                    const pendingAmount = totalAmount - paidAmount;
                                    const isPartial = paidAmount > 0 && paidAmount < totalAmount;
                                    const isSelected = selectedCharges.includes(charge.id);

                                    return (
                                      <tr 
                                        key={charge.id} 
                                        className={`border-b hover:bg-gray-50 cursor-pointer ${isPartial ? 'bg-orange-50' : ''} ${isSelected ? 'bg-blue-50' : ''}`}
                                        onClick={() => {
                                          const newSelected = isSelected
                                            ? selectedCharges.filter(id => id !== charge.id)
                                            : [...selectedCharges, charge.id];
                                          setSelectedCharges(newSelected);
                                          
                                          const totalPending = charges
                                            .filter(c => newSelected.includes(c.id))
                                            .reduce((sum, c) => {
                                              const total = c.total_amount || 0;
                                              const paid = c.paid_amount || 0;
                                              return sum + (total - paid);
                                            }, 0);
                                          setChargePaymentAmount(totalPending);
                                        }}
                                      >
                                        <td className="p-2" onClick={(e) => e.stopPropagation()}>
                                          <input 
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={(e) => {
                                              const newSelected = e.target.checked
                                                ? [...selectedCharges, charge.id]
                                                : selectedCharges.filter(id => id !== charge.id);
                                              setSelectedCharges(newSelected);
                                              
                                              const totalPending = charges
                                                .filter(c => newSelected.includes(c.id))
                                                .reduce((sum, c) => {
                                                  const total = c.total_amount || 0;
                                                  const paid = c.paid_amount || 0;
                                                  return sum + (total - paid);
                                                }, 0);
                                              setChargePaymentAmount(totalPending);
                                            }}
                                            className="cursor-pointer"
                                          />
                                        </td>
                                        <td className="p-2 font-medium">{charge.installment_number}</td>
                                        <td className="p-2 text-sm">{new Date(charge.due_date).toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                                        <td className="p-2 text-sm">
                                          {charge.notes || charge.reason || 'Cargo adicional'}
                                        </td>
                                        <td className="p-2 text-right">
                                          RD${totalAmount.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="p-2 text-right text-green-600">
                                          RD${paidAmount.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="p-2 text-right font-bold text-red-600">
                                          RD${pendingAmount.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                                        </td>
                                        <td className="p-2 text-center">
                                          {isPartial ? (
                                            <Badge variant="outline" className="border-orange-200 text-orange-800 bg-orange-50">
                                              Parcial
                                            </Badge>
                                          ) : (
                                            <Badge variant="outline" className="border-red-200 text-red-800">
                                              Pendiente
                                            </Badge>
                                          )}
                                        </td>
                                      </tr>
                                    );
                                  });
                                })()}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Formulario de Pago */}
                        {selectedCharges.length > 0 && (
                          <div className="space-y-4 border-t pt-4">
                            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                              <div className="text-sm text-green-800">
                                <strong>✓ {selectedCharges.length} cargo(s) seleccionado(s)</strong>
                                <p className="mt-1">
                                  Monto a pagar: RD${chargePaymentAmount.toLocaleString('es-DO', { minimumFractionDigits: 2 })}
                                  {(() => {
                                    const charges = installments.filter(inst => {
                                      const isCharge = Math.abs(inst.interest_amount || 0) < 0.01 && 
                                                      Math.abs((inst.principal_amount || 0) - (inst.total_amount || 0)) < 0.01;
                                      const pending = (inst.total_amount || 0) - (inst.paid_amount || 0);
                                      return isCharge && pending > 0.01 && selectedCharges.includes(inst.id);
                                    });
                                    const totalSelected = charges.reduce((sum, c) => {
                                      const total = c.total_amount || 0;
                                      const paid = c.paid_amount || 0;
                                      return sum + (total - paid);
                                    }, 0);
                                    const remaining = totalSelected - chargePaymentAmount;
                                    if (remaining > 0) {
                                      return ` • Quedará pendiente: RD$${remaining.toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
                                    } else if (remaining === 0) {
                                      return ` • Quedará pagado completamente`;
                                    }
                                    return '';
                                  })()}
                                </p>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 gap-4">
                              <div>
                                <Label>Monto a Pagar</Label>
                                <NumberInput
                                  value={chargePaymentAmount > 0 ? chargePaymentAmount : ''}
                                  onChange={(e) => {
                                    const value = parseFloat(e.target.value) || 0;
                                    setChargePaymentAmount(value);
                                  }}
                                  step="0.01"
                                  min="0.01"
                                  placeholder="0.00"
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                  Puedes pagar parcialmente modificando el monto
                                </p>
                              </div>

                              <div>
                                <Label>Método de Pago</Label>
                                <Select value={chargePaymentMethod} onValueChange={setChargePaymentMethod}>
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="cash">Efectivo</SelectItem>
                                    <SelectItem value="bank_transfer">Transferencia</SelectItem>
                                    <SelectItem value="check">Cheque</SelectItem>
                                    <SelectItem value="card">Tarjeta</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>

                              <div>
                                <Label>Referencia (Opcional)</Label>
                                <Input
                                  value={chargePaymentReference}
                                  onChange={(e) => setChargePaymentReference(e.target.value)}
                                  placeholder="Número de referencia, cheque, etc."
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}



                    {form.watch('update_type') === 'term_extension' && (
                      <FormField
                        control={form.control}
                        name="additional_months"
                        render={({ field }) => (
                          <FormItem>
                            {/* CORRECCIÓN (2026-08-31): decía "Meses Adicionales", pero el plazo
                                del préstamo está en PERÍODOS de su frecuencia. En un préstamo
                                quincenal, escribir 2 agrega 2 quincenas, no 2 meses. */}
                            <FormLabel>Cuotas Adicionales</FormLabel>
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
                            <FormDescription>
                              Cada cuota que agregues equivale a <strong>1 {getFrequencyLabel(loan.payment_frequency, false)}</strong>,
                              que es la frecuencia de pago de este préstamo.
                            </FormDescription>
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
                                <NumberInput
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
                                <NumberInput
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
                                <NumberInput
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
                                    <NumberInput
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
                                    <NumberInput
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
                                Si no se especifica una fecha de vencimiento, se calculará automáticamente como un día después. La mora se calculará desde la fecha de vencimiento, no desde el inicio del préstamo.
                              </p>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="charge_due_date"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Fecha de Vencimiento</FormLabel>
                              <FormControl>
                                <Input
                                  type="date"
                                  {...field}
                                  value={field.value || ''}
                                  min={form.watch('charge_date') || undefined}
                                />
                              </FormControl>
                              <FormMessage />
                              <p className="text-xs text-gray-500">
                                Si no se especifica, se calculará automáticamente como un día después de la fecha del cargo.
                              </p>
                            </FormItem>
                          )}
                        />
                        {form.watch('charge_date') && (
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                            <div className="text-sm text-blue-800">
                              <strong>Fecha de Vencimiento:</strong>{' '}
                              {(() => {
                                const dueDateValue = form.watch('charge_due_date');
                                if (dueDateValue) {
                                  // Parsear como fecha local para evitar problemas de zona horaria
                                  const [year, month, day] = dueDateValue.split('-').map(Number);
                                  const dueDate = new Date(year, month - 1, day);
                                  return dueDate.toLocaleDateString('es-DO', {
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric'
                                  });
                                } else {
                                  // Parsear la fecha del cargo como fecha local
                                  const chargeDateStr = form.watch('charge_date') || '';
                                  const [year, month, day] = chargeDateStr.split('-').map(Number);
                                  const chargeDate = new Date(year, month - 1, day);
                                  const dueDate = new Date(chargeDate);
                                  dueDate.setDate(dueDate.getDate() + 1);
                                  return dueDate.toLocaleDateString('es-DO', {
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric'
                                  }) + ' (calculada automáticamente)';
                                }
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
                                 form.watch('update_type') === 'capital_payment' ? 'Razón del Abono a Capital' :
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
                    <Button 
                      type="submit" 
                      disabled={
                        loading || 
                        (form.watch('update_type') === 'capital_payment' && overdueInstallmentsCount > 0) ||
                        (form.watch('update_type') === 'pay_charges' && (selectedCharges.length === 0 || chargePaymentAmount <= 0))
                      }
                    >
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
                      <span className="font-semibold">
                        {isFetchingFreshBalance || freshRemainingBalance === null || freshRemainingBalance === undefined
                          ? 'Cargando...'
                          : `RD$${round2(freshRemainingBalance).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                      </span>
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
                                {(() => {
                                  const chargeDateStr = form.watch('charge_date');
                                  if (!chargeDateStr) return '-';
                                  // Parsear como fecha local para evitar problemas de zona horaria
                                  const [year, month, day] = chargeDateStr.split('-').map(Number);
                                  const date = new Date(year, month - 1, day);
                                  return date.toLocaleDateString('es-DO', {
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric'
                                  });
                                })()}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Fecha de Vencimiento:</span>
                              <span className="font-semibold text-green-600">
                                {(() => {
                                  const dueDateValue = form.watch('charge_due_date');
                                  if (dueDateValue) {
                                    // Parsear como fecha local para evitar problemas de zona horaria
                                    const [year, month, day] = dueDateValue.split('-').map(Number);
                                    const dueDate = new Date(year, month - 1, day);
                                    return dueDate.toLocaleDateString('es-DO', {
                                      year: 'numeric',
                                      month: 'long',
                                      day: 'numeric'
                                    });
                                  } else {
                                    // Parsear la fecha del cargo como fecha local
                                    const chargeDateStr = form.watch('charge_date') || '';
                                    const [year, month, day] = chargeDateStr.split('-').map(Number);
                                    const chargeDate = new Date(year, month - 1, day);
                                    const dueDate = new Date(chargeDate);
                                    dueDate.setDate(dueDate.getDate() + 1);
                                    return dueDate.toLocaleDateString('es-DO', {
                                      year: 'numeric',
                                      month: 'long',
                                      day: 'numeric'
                                    });
                                  }
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
                        {(isFetchingFreshBalance || freshRemainingBalance === null || freshRemainingBalance === undefined)
                          ? 'Cargando...'
                          : `RD$${(Math.round((calculatedValues.newBalance || 0) * 100) / 100).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                      </span>
                    </div>



                    {/* CORRECCIÓN (2026-08-31): esta vista previa contaba las cuotas pendientes
                        mientras el cálculo del importe usaba `term_months` (que incluye las ya
                        pagadas). Ahora todo sale de `extensionPreview`, el mismo objeto que se
                        guarda, y se muestra el reparto real cuota por cuota. */}
                    {form.watch('update_type') === 'term_extension' && extensionPreview && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Cuotas Pendientes:</span>
                          <span className="font-semibold">{extensionPreview.pendingCountBefore} cuotas</span>
                        </div>
                        {extensionPreview.paidCount > 0 && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">Cuotas Pagadas (no se tocan):</span>
                            <span className="font-semibold text-gray-500">{extensionPreview.paidCount} cuotas</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-gray-600">Cuotas Adicionales:</span>
                          <span className="font-semibold text-blue-600">
                            +{extensionPreview.additionalCount} {extensionPreview.additionalCount === 1 ? 'cuota' : 'cuotas'}
                            {' '}<span className="text-xs font-normal text-gray-500">
                              ({extensionPreview.additionalCount} {getFrequencyLabel(loan.payment_frequency, extensionPreview.additionalCount !== 1)})
                            </span>
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Nuevo Total Pendiente:</span>
                          <span className="font-bold text-purple-600">{extensionPreview.pendingCountAfter} cuotas</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Capital a Repartir:</span>
                          <span className="font-semibold">{formatCurrency(extensionPreview.outstandingCapital)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">
                            {extensionPreview.uniformPayment ? 'Nueva Cuota (todas):' : 'Primera Cuota:'}
                          </span>
                          <span className="font-bold text-green-600">{formatCurrency(extensionPreview.representativePayment)}</span>
                        </div>
                        {extensionPreview.totalAlreadyPaid > 0 && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">Abonos que se eliminan:</span>
                            <span className="font-semibold text-amber-700">
                              −{formatCurrency(extensionPreview.totalAlreadyPaid)}
                            </span>
                          </div>
                        )}
                        {extensionPreview.newEndDate && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">Nueva Fecha Fin:</span>
                            <span className="font-semibold">{formatDateStringForSantoDomingo(extensionPreview.newEndDate)}</span>
                          </div>
                        )}

                        {/* El desglose cuota por cuota NO va aquí: esta columna es estrecha y la
                            tabla salía con seis columnas comprimidas y scroll horizontal, ilegible.
                            Se muestra a lo ancho, debajo del formulario. */}
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
                  nextPaymentDate={(localNextPaymentDate ?? displayNextPaymentDate ?? loan.next_payment_date?.split?.('T')?.[0] ?? loan.next_payment_date) || ''}
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
                  amortization_type={loan.amortization_type}
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
                    {(loan.status === 'paid' || loan.remaining_balance === 0) 
                      ? 'N/A' 
                      : (() => {
                          const nextDue = localNextPaymentDate ?? displayNextPaymentDate ?? loan.next_payment_date?.split?.('T')?.[0] ?? loan.next_payment_date;
                          return nextDue ? formatDateStringForSantoDomingo(nextDue) : 'N/A';
                        })()}
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

          {/* ---------------------------------------------------------------- */}
          {/* Desglose de la extensión, A LO ANCHO                              */}
          {/* ---------------------------------------------------------------- */}
          {/* Ocupa las tres columnas y va al final del grid, en el hueco que deja el
              formulario. Antes vivía en la columna de la derecha, donde una tabla de seis
              columnas quedaba comprimida con scroll horizontal y no se podía leer — que es
              justo lo que hay que revisar antes de confirmar una extensión. */}
          {form.watch('update_type') === 'term_extension'
            && extensionPreview
            && extensionPreview.rows.length > 0 && (
            <div className="lg:col-span-3">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                <div className="text-sm text-blue-900 font-semibold">Cómo se reparten las cuotas</div>
                <p className="text-xs text-blue-800">{extensionPreview.description}</p>
                <p className="text-xs text-blue-800">
                  {extensionPreview.additionalCount > 0 ? (
                    <>
                      Se <strong>recalculan las {extensionPreview.pendingCountBefore} cuotas pendientes</strong> y se
                      crean <strong>{extensionPreview.additionalCount} nuevas</strong>, para que todas queden con el
                      mismo reparto. Las {extensionPreview.paidCount} cuotas ya pagadas no se modifican.
                    </>
                  ) : (
                    <>
                      Con <strong>0 cuotas adicionales</strong> no se alarga el plazo: solo se
                      <strong> vuelve a repartir</strong> el capital pendiente entre las
                      {' '}{extensionPreview.pendingCountBefore} cuotas que quedan. Sirve para corregir un préstamo
                      cuyas cuotas quedaron con importes distintos entre sí.
                    </>
                  )}
                </p>

                {extensionPreview.totalAlreadyPaid > 0 && (
                  <div className="flex items-start gap-2 rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>
                      <p className="font-semibold">
                        Se ELIMINARÁN {formatCurrency(extensionPreview.totalAlreadyPaid)} en abonos
                      </p>
                      <p className="mt-1">
                        La extensión rehace el préstamo con las cuotas pendientes como si fuera nuevo. Los
                        abonos a cuotas que <strong>no están terminadas de pagar</strong> se
                        <strong> borran</strong>: el cliente volverá a deber ese dinero y los pagos
                        desaparecerán del historial.
                      </p>
                      <p className="mt-1">
                        Las cuotas ya <strong>pagadas por completo</strong> y sus pagos no se tocan.
                        Queda constancia de lo eliminado en el historial del préstamo.
                      </p>
                    </div>
                  </div>
                )}

                {/* Con el ancho completo caben todas las cuotas sin comprimir; el scroll
                    vertical solo aparece si el plazo es largo. */}
                <div className="max-h-96 overflow-y-auto rounded border border-blue-200 bg-white">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-blue-100 text-blue-900">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold">#</th>
                        <th className="px-3 py-2 text-left font-semibold">Vence</th>
                        <th className="px-3 py-2 text-right font-semibold">Capital</th>
                        <th className="px-3 py-2 text-right font-semibold">Interés</th>
                        <th className="px-3 py-2 text-right font-semibold">Cuota</th>
                        <th className="px-3 py-2 text-right font-semibold">Abonado (se elimina)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {extensionPreview.rows.map((row) => (
                        <tr key={`${row.installmentNumber}-${row.dueDate}`} className={row.isNew ? 'bg-green-50' : ''}>
                          <td className="px-3 py-2">
                            {row.installmentNumber}
                            {row.isNew && <span className="ml-1 text-[10px] font-semibold text-green-700">NUEVA</span>}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">{formatDateStringForSantoDomingo(row.dueDate)}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(row.principal)}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(row.interest)}</td>
                          <td className="px-3 py-2 text-right font-semibold">
                            {formatCurrency(row.total)}
                            {row.cappedByPayment && (
                              <span className="ml-1 text-[10px] font-normal text-amber-700">fijada</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-amber-700 line-through">
                            {row.alreadyPaid > 0 ? formatCurrency(row.alreadyPaid) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t border-blue-200 bg-blue-50 font-semibold text-blue-900">
                      <tr>
                        <td className="px-3 py-2" colSpan={2}>Total</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(extensionPreview.outstandingCapital)}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(extensionPreview.totalPendingInterest)}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(extensionPreview.totalPendingAmount)}</td>
                        <td className="px-3 py-2 text-right text-amber-700 line-through">
                          {extensionPreview.totalAlreadyPaid > 0 ? formatCurrency(extensionPreview.totalAlreadyPaid) : '—'}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          )}
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

    {/* Diálogo de Verificación de Contraseña */}
    <PasswordVerificationDialog
      isOpen={showPasswordVerification}
      onClose={() => {
        setShowPasswordVerification(false);
        setPendingFormData(null);
      }}
      onVerify={() => {
        if (pendingFormData) {
          executeDeleteLoan(pendingFormData);
        }
        setShowPasswordVerification(false);
        setPendingFormData(null);
      }}
      title="Verificar Contraseña"
      description="Por seguridad, ingresa tu contraseña para confirmar la eliminación del préstamo."
      entityName="préstamo"
    />

    {/* Modal de Formato de Impresión */}
    <Dialog open={showPrintFormatModal} onOpenChange={(open) => {
      if (!open && !isClosingPrintModal) {
        // Cuando se cierra el modal (X o clic fuera) y no se está cerrando desde un botón
        setShowPrintFormatModal(false);
        const askBeforeSend = companySettings?.ask_whatsapp_before_send !== false; // Por defecto true
        setTimeout(() => {
          if (askBeforeSend) {
            setShowWhatsAppDialog(true);
          } else {
            sendWhatsAppDirectly();
          }
        }, 300);
      }
    }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            {lastCapitalPaymentData ? 'Recibo de Abono a Capital' : 'Seleccionar Formato de Impresión'}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            {lastCapitalPaymentData 
              ? 'Selecciona el formato de impresión para el recibo del abono a capital:'
              : 'Selecciona el formato de impresión según tu impresora:'}
          </p>
          
          <div className="grid grid-cols-1 gap-3">
            {/* POS58 - Impresoras portátiles Verifone */}
            <Button 
              variant="outline" 
              className="h-auto p-4 flex flex-col items-start"
              onClick={() => {
                handleClosePrintModalAndShowWhatsApp(() => {
                  printReceipt('POS58');
                });
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-blue-100 rounded flex items-center justify-center">
                  <span className="text-xs font-bold">58</span>
                </div>
                <div className="text-left">
                  <div className="font-medium">POS58</div>
                  <div className="text-xs text-gray-500">Verifone / Impresoras Portátiles</div>
                </div>
              </div>
              <div className="text-xs text-gray-400">
                Ancho: 58mm - Ideal para impresoras portátiles
              </div>
            </Button>

            {/* POS80 - Punto de venta */}
            <Button 
              variant="outline" 
              className="h-auto p-4 flex flex-col items-start"
              onClick={() => {
                handleClosePrintModalAndShowWhatsApp(() => {
                  printReceipt('POS80');
                });
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-green-100 rounded flex items-center justify-center">
                  <span className="text-xs font-bold">80</span>
                </div>
                <div className="text-left">
                  <div className="font-medium">POS80</div>
                  <div className="text-xs text-gray-500">Punto de Venta</div>
                </div>
              </div>
              <div className="text-xs text-gray-400">
                Ancho: 80mm - Para impresoras de punto de venta
              </div>
            </Button>

            {/* Carta 8½ x 11 */}
            <Button 
              variant="outline" 
              className="h-auto p-4 flex flex-col items-start"
              onClick={() => {
                handleClosePrintModalAndShowWhatsApp(() => {
                  printReceipt('LETTER');
                });
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-purple-100 rounded flex items-center justify-center">
                  <span className="text-xs font-bold">8½</span>
                </div>
                <div className="text-left">
                  <div className="font-medium">Carta (8½ x 11)</div>
                  <div className="text-xs text-gray-500">Impresoras de Escritorio</div>
                </div>
              </div>
              <div className="text-xs text-gray-400">
                Formato: 8.5 x 11 pulgadas - Estándar americano
              </div>
            </Button>

            {/* A4 */}
            <Button 
              variant="outline" 
              className="h-auto p-4 flex flex-col items-start"
              onClick={() => {
                handleClosePrintModalAndShowWhatsApp(() => {
                  printReceipt('A4');
                });
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 bg-orange-100 rounded flex items-center justify-center">
                  <span className="text-xs font-bold">A4</span>
                </div>
                <div className="text-left">
                  <div className="font-medium">A4</div>
                  <div className="text-xs text-gray-500">Formato Internacional</div>
                </div>
              </div>
              <div className="text-xs text-gray-400">
                Formato: 210 x 297mm - Estándar internacional
              </div>
            </Button>
          </div>

          {/* Botones de descarga rápida */}
          <div className="pt-4 border-t">
            <p className="text-sm font-medium mb-2">Descargar en formato:</p>
            <div className="flex flex-wrap gap-2">
              <Button 
                size="sm" 
                variant="secondary"
                onClick={() => {
                  handleClosePrintModalAndShowWhatsApp(() => {
                    downloadReceipt('POS58');
                  });
                }}
              >
                <Download className="h-3 w-3 mr-1" />
                POS58
              </Button>
              <Button 
                size="sm" 
                variant="secondary"
                onClick={() => {
                  handleClosePrintModalAndShowWhatsApp(() => {
                    downloadReceipt('POS80');
                  });
                }}
              >
                <Download className="h-3 w-3 mr-1" />
                POS80
              </Button>
              <Button 
                size="sm" 
                variant="secondary"
                onClick={() => {
                  handleClosePrintModalAndShowWhatsApp(() => {
                    downloadReceipt('LETTER');
                  });
                }}
              >
                <Download className="h-3 w-3 mr-1" />
                Carta
              </Button>
              <Button 
                size="sm" 
                variant="secondary"
                onClick={() => {
                  handleClosePrintModalAndShowWhatsApp(() => {
                    downloadReceipt('A4');
                  });
                }}
              >
                <Download className="h-3 w-3 mr-1" />
                A4
              </Button>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => handleClosePrintModalAndShowWhatsApp()}>
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    {/* Modal de WhatsApp */}
    <Dialog open={showWhatsAppDialog} onOpenChange={(open) => {
      if (!open) {
        setShowWhatsAppDialog(false);
        onUpdate();
        onClose();
      }
    }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>¿Enviar recibo por WhatsApp?</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <p>¿Deseas enviar el recibo del pago al cliente por WhatsApp?</p>
        </div>
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setShowWhatsAppDialog(false);
              onUpdate();
              onClose();
            }}
          >
            Cancelar
          </Button>
          <Button
            onClick={async () => {
              if (!lastSettlePaymentData || !companySettings) {
                toast.error('Error: No se encontraron los datos necesarios');
                return;
              }

              try {
                const payment = lastSettlePaymentData.payment;
                const loan = lastSettlePaymentData.loan;
                // Manejar tanto 'client' como 'clients' (puede venir de diferentes consultas)
                let client = loan.client || (loan as any).clients;
                
                // Si es un array, tomar el primer elemento
                if (Array.isArray(client)) {
                  client = client[0];
                }
                
                // Si el cliente no está disponible o no tiene teléfono, intentar obtenerlo desde la BD
                const clientIdToUse = lastSettlePaymentData.clientId || (loan as any).client_id;
                
                if (!client || !client.phone) {
                  console.log('🔍 WhatsApp - Cliente no disponible o sin teléfono, obteniendo desde BD...');
                  console.log('🔍 WhatsApp - Client ID a usar:', clientIdToUse);
                  
                  if (clientIdToUse) {
                    const { data: clientInfo, error: clientError } = await supabase
                      .from('clients')
                      .select('id, full_name, dni, phone, email')
                      .eq('id', clientIdToUse)
                      .single();
                    
                    if (!clientError && clientInfo) {
                      console.log('🔍 WhatsApp - Cliente obtenido desde BD:', clientInfo);
                      client = clientInfo;
                    } else {
                      console.error('❌ WhatsApp - Error obteniendo cliente desde BD:', clientError);
                    }
                  }
                }
                
                console.log('🔍 WhatsApp - Cliente final:', client);
                console.log('🔍 WhatsApp - Teléfono del cliente:', client?.phone);
                
                if (!client) {
                  console.error('❌ WhatsApp - No se pudo obtener el cliente');
                  toast.error('No se pudo obtener la información del cliente');
                  return;
                }
                
                const receiptData = {
                  companyName: companySettings?.company_name || 'LA EMPRESA',
                  clientName: client?.full_name || 'Cliente',
                  clientDni: client?.dni,
                  paymentDate: formatDateStringForSantoDomingo(payment.payment_date),
                  paymentAmount: payment.amount,
                  principalAmount: payment.principal_amount || 0,
                  interestAmount: payment.interest_amount || 0,
                  lateFeeAmount: payment.late_fee || 0,
                  paymentMethod: payment.payment_method || 'cash',
                  loanAmount: loan.amount,
                  remainingBalance: 0, // Préstamo saldado
                  interestRate: loan.interest_rate,
                  referenceNumber: payment.reference_number
                };

                const receiptMessage = generateLoanPaymentReceipt(receiptData);
                const clientPhone = client?.phone;
                
                console.log('🔍 WhatsApp - Teléfono a usar:', clientPhone);
                
                if (!clientPhone) {
                  console.error('❌ WhatsApp - El cliente no tiene teléfono:', client);
                  toast.error('El cliente no tiene número de teléfono registrado');
                  return;
                }

                const formattedPhone = formatPhoneForWhatsApp(clientPhone);
                console.log('🔍 WhatsApp - Teléfono formateado:', formattedPhone);
                await openWhatsApp(formattedPhone, receiptMessage);
                toast.success('Recibo enviado por WhatsApp');
              } catch (error) {
                console.error('Error enviando recibo por WhatsApp:', error);
                toast.error('Error al enviar recibo por WhatsApp');
              }

              setShowWhatsAppDialog(false);
              onUpdate();
              onClose();
            }}
          >
            <MessageCircle className="h-4 w-4 mr-2" />
            Enviar por WhatsApp
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    {/* Modal de Previsualización de Tabla de Cuotas */}
    <Dialog open={showPreviewTable} onOpenChange={setShowPreviewTable}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Table className="h-5 w-5" />
            Previsualización de Cuotas después del Abono a Capital
          </DialogTitle>
          <DialogDescription>
            Esta es una vista previa de cómo quedarán las cuotas después del abono. Los cambios se aplicarán al confirmar el abono.
          </DialogDescription>
        </DialogHeader>

        {previewInstallments.length > 0 ? (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="text-sm space-y-1">
                <div><strong>Capital Pendiente Original:</strong> RD${originalPendingCapital.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                <div><strong>Monto del Abono:</strong> RD${(form.watch('capital_payment_amount') || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                {form.watch('is_penalty') && penaltyAmount > 0 && (
                  <>
                    <div className="text-orange-700"><strong>Cargo de Penalidad:</strong> RD${penaltyAmount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                    <div className="text-orange-700 font-semibold pt-1 border-t border-orange-300"><strong>Total a Pagar (Abono + Penalidad):</strong> RD${((form.watch('capital_payment_amount') || 0) + penaltyAmount).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                  </>
                )}
                <div className="pt-1 border-t border-blue-300"><strong>Nuevo Capital Pendiente:</strong> RD${capitalPaymentPreview.newPendingCapital.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
              </div>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 border-b">
                    <tr>
                      <th className="px-4 py-2 text-left font-semibold">#</th>
                      <th className="px-4 py-2 text-left font-semibold">Fecha Vencimiento</th>
                      <th className="px-4 py-2 text-right font-semibold">Capital</th>
                      <th className="px-4 py-2 text-right font-semibold">Interés</th>
                      <th className="px-4 py-2 text-right font-semibold">Total</th>
                      <th className="px-4 py-2 text-center font-semibold">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewInstallments.map((inst, index) => (
                      <tr 
                        key={index} 
                        className={`border-b ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}
                      >
                        <td className="px-4 py-2">
                          {(loan?.amortization_type || '').toLowerCase() === 'indefinite'
                            ? `${inst.installment_number}/X`
                            : inst.installment_number}
                        </td>
                        <td className="px-4 py-2">
                          {inst.due_date ? formatDateStringForSantoDomingo(inst.due_date) : '-'}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {inst.principal_amount > 0 ? `RD$${inst.principal_amount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {inst.interest_amount > 0 ? `RD$${inst.interest_amount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                        </td>
                        <td className="px-4 py-2 text-right font-semibold">
                          RD${inst.total_amount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-2 text-center">
                          <Badge variant="outline" className="bg-gray-100 text-gray-600">
                            Pendiente
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-gray-100 border-t-2">
                    <tr>
                      <td colSpan={2} className="px-4 py-2 font-semibold">Total</td>
                      <td className="px-4 py-2 text-right font-semibold">
                        RD${previewInstallments.reduce((sum, inst) => sum + (inst.principal_amount || 0), 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-2 text-right font-semibold">
                        RD${previewInstallments.reduce((sum, inst) => sum + (inst.interest_amount || 0), 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-2 text-right font-semibold">
                        RD${previewInstallments.reduce((sum, inst) => sum + (inst.total_amount || 0), 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowPreviewTable(false)}>
                Cerrar
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            No hay cuotas futuras para previsualizar
          </div>
        )}
      </DialogContent>
    </Dialog>
    </>
  );
};