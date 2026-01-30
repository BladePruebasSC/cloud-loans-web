
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { LoanForm } from './LoanForm';
import { PaymentForm } from './PaymentForm';
import { LoanUpdateForm } from './LoanUpdateForm';
import { LoanHistoryView } from './LoanHistoryView';
import { LoanStatistics } from './LoanStatistics';
import { LoanDetailsView } from './LoanDetailsView';
import { PaymentStatusBadge } from './PaymentStatusBadge';
import { CollectionTracking } from './CollectionTracking';
import { LateFeeInfo } from './LateFeeInfo';
import { GlobalLateFeeConfig } from './GlobalLateFeeConfig';
import { LateFeeReports } from './LateFeeReports';
import { AccountStatement } from './AccountStatement';
import { useLoans } from '@/hooks/useLoans';
import { useAuth } from '@/hooks/useAuth';
import { useLateFee } from '@/hooks/useLateFee';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getCurrentDateInSantoDomingo, formatDateStringForSantoDomingo, getCurrentDateStringForSantoDomingo } from '@/utils/dateUtils';
import { formatCurrencyNumber } from '@/lib/utils';
import { getLoanBalanceBreakdown } from '@/utils/loanBalanceBreakdown';
import { 
  CreditCard, 
  Plus, 
  Search, 
  Clock, 
  Calendar,
  DollarSign,
  Users,
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Filter,
  FileText,
  Receipt,
  Edit,
  History,
  X,
  ChevronLeft,
  ArrowRight,
  ChevronRight,
  Trash2,
  RotateCcw,
  BarChart3,
  Phone,
  Eye
} from 'lucide-react';

export const LoansModule = () => {
  const location = useLocation();
  const [activeTab, setActiveTab] = useState('mis-prestamos');
  const [showLoanForm, setShowLoanForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [showHistoryView, setShowHistoryView] = useState(false);
  const [showStatistics, setShowStatistics] = useState(false);
  const [showDetailsView, setShowDetailsView] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [selectedLoanForPayment, setSelectedLoanForPayment] = useState(null);
  const [initialLoanData, setInitialLoanData] = useState(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [showRequestSelector, setShowRequestSelector] = useState(false);
  const [requests, setRequests] = useState([]);
  const [currentViewMonth, setCurrentViewMonth] = useState(new Date());
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [loanToCancel, setLoanToCancel] = useState(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showCollectionTracking, setShowCollectionTracking] = useState(false);
  const [selectedLoanForTracking, setSelectedLoanForTracking] = useState(null);
  const [showAccountStatement, setShowAccountStatement] = useState(false);
  const [selectedLoanForStatement, setSelectedLoanForStatement] = useState(null);
  const [statementSearchTerm, setStatementSearchTerm] = useState('');
  const [statementStatusFilter, setStatementStatusFilter] = useState('all');
  const [statementAmountFilter, setStatementAmountFilter] = useState('all');
  const [dynamicLateFees, setDynamicLateFees] = useState<{[key: string]: number}>({});
  const [pendingInterestForIndefinite, setPendingInterestForIndefinite] = useState<{[key: string]: number}>({});
  const [paidInstallmentsCountForIndefinite, setPaidInstallmentsCountForIndefinite] = useState<{[key: string]: number}>({});
  const [loanAgreements, setLoanAgreements] = useState<{[key: string]: any[]}>({});
  const [calculatedTotalAmounts, setCalculatedTotalAmounts] = useState<{[key: string]: number}>({});
  // Total (sin mora): balance del préstamo + cargos pendientes
  const [calculatedRemainingBalances, setCalculatedRemainingBalances] = useState<{[key: string]: number}>({});
  // Base: balance del préstamo (capital + interés), SIN cargos
  const [calculatedBaseBalances, setCalculatedBaseBalances] = useState<{[key: string]: number}>({});
  // Cargos pendientes (para mostrar por separado / sumar al total)
  const [calculatedPendingCharges, setCalculatedPendingCharges] = useState<{[key: string]: number}>({});
  // Evitar mostrar balances "stale" al abrir: esperamos el cálculo inicial
  const [balancesHydrated, setBalancesHydrated] = useState(false);
  // Timestamp de última actualización optimista por préstamo para evitar sobrescrituras
  const optimisticUpdateTimestampsRef = useRef<{[key: string]: number}>({});
  // Timestamp de última autocorrección de remaining_balance (evita loops/spam)
  const lastBalanceFixTimestampsRef = useRef<{[key: string]: number}>({});
  // Ref para rastrear si ya se procesó una acción desde la URL (evitar re-ejecuciones)
  const processedActionRef = useRef<string | null>(null);
  // Ref para rastrear si el usuario cerró el formulario manualmente (evitar re-abrir)
  const manuallyClosedRef = useRef<boolean>(false);
  // Ref para rastrear la última URL procesada (para detectar cambios de URL)
  const lastProcessedUrlRef = useRef<string | null>(null);
  // Ref para rastrear si la última URL tenía parámetros (para detectar nueva navegación)
  const lastUrlHadParamsRef = useRef<boolean>(false);
  
  // Función helper para calcular el monto total correcto (capital + interés total)
  const calculateTotalAmount = (loan: any): number => {
    // Si total_amount está disponible y es mayor que amount, usarlo
    if (loan.total_amount && loan.total_amount > loan.amount) {
      return loan.total_amount;
    }
    // Si no, calcularlo: capital + interés total
    const totalInterest = loan.amount * (loan.interest_rate / 100) * loan.term_months;
    return loan.amount + totalInterest;
  };

  // Función helper para calcular el balance pendiente correcto
  // CORRECCIÓN: Calcular dinámicamente igual que LoanDetailsView
  // Esto asegura que el preview muestre el mismo valor que Detalles incluso cuando la BD no se actualiza
  const calculateBalanceBreakdown = async (loan: any): Promise<{ baseBalance: number; pendingCharges: number; totalBalance: number }> => {
    try {
      // ✅ INDEFINIDOS: usar la misma lógica centralizada que Detalles/Estado de cuenta
      // (normaliza pagos con due_date inválidos como 28-feb y soporta pagos parciales).
      if (String(loan?.amortization_type || loan?.amortization_type || '').toLowerCase() === 'indefinite') {
        return await getLoanBalanceBreakdown(supabase as any, loan);
      }

      // Obtener todos los pagos del préstamo (necesitamos principal_amount, interest_amount, due_date)
      const { data: payments, error: paymentsError } = await supabase
        .from('payments')
        .select('amount, principal_amount, interest_amount, due_date')
        .eq('loan_id', loan.id);
      
      // Obtener abonos a capital
      const { data: capitalPayments, error: capitalPaymentsError } = await supabase
        .from('capital_payments')
        .select('amount')
        .eq('loan_id', loan.id);
      
      if (capitalPaymentsError) {
        console.error('Error obteniendo abonos a capital:', capitalPaymentsError);
      }
      
      if (paymentsError) {
        console.error('Error obteniendo pagos para calcular balance:', paymentsError);
        const fallback = Number(loan.remaining_balance || 0) || 0;
        return { baseBalance: fallback, pendingCharges: 0, totalBalance: fallback };
      }
      
      // Obtener TODOS los installments (cuotas regulares y cargos)
      const { data: allInstallments, error: installmentsError } = await supabase
        .from('installments')
        .select('id, total_amount, principal_amount, interest_amount, is_paid, due_date, installment_number')
        .eq('loan_id', loan.id);
      
      // Calcular el total pagado usando amount (igual que InstallmentsTable)
      const totalPaid = (payments || []).reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
      
      // CORRECCIÓN (INDEFINIDOS): el balance pendiente incluye capital + interés pendiente + cargos pendientes.
      // Por tanto, pagar interés (parcial o completo) SÍ reduce el balance.
      if (loan.amortization_type === 'indefinite') {
        const baseAmount = loan.amount || 0;
        const amortizationType = String(loan.amortization_type || '').toLowerCase();

        // Calcular interés pendiente por due_date (soporta pagos parciales)
        let pendingInterest = 0;
        const isCharge = (inst: any) =>
          Math.abs(inst?.interest_amount || 0) < 0.01 &&
          Math.abs((inst?.principal_amount || 0) - (inst?.total_amount || 0)) < 0.01;

        const expectedInterestByDate = new Map<string, number>();
        const paidInterestByDate = new Map<string, number>();

        if (allInstallments && allInstallments.length > 0) {
          const regular = allInstallments.filter((inst: any) => !isCharge(inst));
          for (const inst of regular) {
            const due = inst?.due_date ? String(inst.due_date).split('T')[0] : null;
            if (!due) continue;
            const expected = Number(inst.interest_amount || (inst.total_amount || 0)) || 0;
            if (expected <= 0) continue;
            expectedInterestByDate.set(due, (expectedInterestByDate.get(due) || 0) + expected);
          }
        }

        const interestPerPayment = (baseAmount || 0) * ((loan.interest_rate || 0) / 100);

        if (payments && payments.length > 0) {
          for (const p of payments) {
            const due = p?.due_date ? String(p.due_date).split('T')[0] : null;
            if (!due) continue;
            const interestField = Number((p as any).interest_amount || 0) || 0;
            const amt = Number((p as any).amount || 0) || 0;
            const paidValue =
              interestField > 0.01
                ? interestField
                : (amt > 0.01 && interestPerPayment > 0.01 && amt <= (interestPerPayment * 1.25) ? amt : 0);
            if (paidValue <= 0.01) continue;
            paidInterestByDate.set(due, (paidInterestByDate.get(due) || 0) + paidValue);
          }
        }

        // Asegurar que exista al menos la cuota actual SOLO si aún no hay cuotas regulares en BD.
        // (Evita duplicar interés cuando `next_payment_date` está desfasado vs installments)
        const nextDue = loan.next_payment_date ? String(loan.next_payment_date).split('T')[0] : null;
        if (expectedInterestByDate.size === 0 && nextDue && !expectedInterestByDate.has(nextDue)) {
          const interestPerPayment = (baseAmount || 0) * ((loan.interest_rate || 0) / 100);
          if (interestPerPayment > 0) expectedInterestByDate.set(nextDue, interestPerPayment);
        }

        for (const [due, expected] of expectedInterestByDate.entries()) {
          const paid = paidInterestByDate.get(due) || 0;
          pendingInterest += Math.max(0, expected - paid);
        }

        // ✅ Si ya se pagó la cuota completa (pendingInterest ~ 0), el próximo interés sigue igual:
        // incluir 1 período futuro como pendiente.
        if (pendingInterest <= 0.01 && interestPerPayment > 0.01) {
          pendingInterest = interestPerPayment;
        }
        
        // Calcular el total de TODOS los cargos (pagados y no pagados)
        let pendingChargesAmount = 0;
        if (allInstallments && allInstallments.length > 0) {
          const allChargesList = allInstallments.filter(inst => {
            const isCharge = Math.abs(inst.interest_amount || 0) < 0.01 && 
                            Math.abs((inst.principal_amount || 0) - (inst.total_amount || 0)) < 0.01;
            return isCharge;
          });
          // Calcular cargos pendientes considerando pagos parciales por due_date
          const paidPrincipalByDate = new Map<string, number>();
          for (const p of (payments || [])) {
            const due = p?.due_date ? String(p.due_date).split('T')[0] : null;
            if (!due) continue;
            const principalPaid = Number(p.principal_amount || 0) || 0;
            if (principalPaid <= 0) continue;
            paidPrincipalByDate.set(due, (paidPrincipalByDate.get(due) || 0) + principalPaid);
          }

          // Agrupar cargos por fecha
          const chargeTotalByDate = new Map<string, number>();
          for (const c of allChargesList) {
            const due = c?.due_date ? String(c.due_date).split('T')[0] : null;
            if (!due) continue;
            chargeTotalByDate.set(due, (chargeTotalByDate.get(due) || 0) + (Number(c.total_amount || 0) || 0));
          }

          for (const [due, total] of chargeTotalByDate.entries()) {
            const paid = paidPrincipalByDate.get(due) || 0;
            pendingChargesAmount += Math.max(0, total - paid);
          }
        }

        const baseBalance = Math.max(0, baseAmount + pendingInterest);
        const totalBalance = Math.max(0, baseBalance + pendingChargesAmount);
        
        console.log('🔍 calculateRemainingBalance: Balance calculado para indefinido', {
          loanId: loan.id,
          baseAmount,
          pendingInterest,
          pendingChargesAmount,
          totalPaid, // Para comparación
          remainingBalance: totalBalance,
          bdRemainingBalance: loan.remaining_balance
        });
        
        return { baseBalance, pendingCharges: pendingChargesAmount, totalBalance };
      }
      
      if (installmentsError) {
        console.error('Error obteniendo installments para calcular balance:', installmentsError);
        // Fallback al cálculo tradicional
        let correctTotalAmount = (loan as any).total_amount;
        if (!correctTotalAmount || correctTotalAmount <= loan.amount) {
          const totalInterest = loan.amount * (loan.interest_rate / 100) * loan.term_months;
          correctTotalAmount = loan.amount + totalInterest;
        }
        const fallback = Math.max(0, correctTotalAmount - totalPaid);
        return { baseBalance: fallback, pendingCharges: 0, totalBalance: fallback };
      }
      
      // CORRECCIÓN: Calcular balance igual que LoanDetailsView
      // Balance = Capital Pendiente + Interés Pendiente + Cargos no pagados
      
      // 1. Calcular cargos
      const allCharges = (allInstallments || []).filter(inst => {
        const isCharge = Math.abs(inst.interest_amount || 0) < 0.01 && 
                        Math.abs((inst.principal_amount || 0) - (inst.total_amount || 0)) < 0.01;
        return isCharge;
      });
      const totalChargesAmount = allCharges.reduce((sum, inst) => sum + (inst.total_amount || 0), 0);
      // CORRECCIÓN: Calcular cargos pagados considerando pagos parciales
      const paidChargesAmount = allCharges.reduce((sum, inst) => {
        const chargeDueDate = inst.due_date?.split('T')[0];
        if (!chargeDueDate) return sum;
        
        const chargesWithSameDate = allCharges.filter(c => c.due_date?.split('T')[0] === chargeDueDate)
          .sort((a, b) => (a.installment_number || 0) - (b.installment_number || 0));
        
        const paymentsForCharges = (payments || []).filter(p => {
          const paymentDueDate = p.due_date?.split('T')[0];
          const hasNoInterest = Math.abs(p.interest_amount || 0) < 0.01;
          return paymentDueDate === chargeDueDate && hasNoInterest;
        });
        
        const totalPaidForDate = paymentsForCharges.reduce((s, p) => s + (p.principal_amount || p.amount || 0), 0);
        const chargeIndex = chargesWithSameDate.findIndex(c => c.id === inst.id);
        
        let principalPaidForThisCharge = 0;
        if (chargeIndex >= 0 && chargesWithSameDate.length > 0) {
          let remainingPayments = totalPaidForDate;
          for (let i = 0; i < chargeIndex; i++) {
            const prevCharge = chargesWithSameDate[i];
            remainingPayments -= Math.min(remainingPayments, prevCharge.total_amount || 0);
          }
          principalPaidForThisCharge = Math.min(remainingPayments, inst.total_amount || 0);
        } else {
          principalPaidForThisCharge = Math.min(totalPaidForDate, inst.total_amount || 0);
        }
        
        return sum + principalPaidForThisCharge;
      }, 0);
      // IMPORTANTE: Redondear a 2 decimales usando Math.round(value * 100) / 100 para valores monetarios
      const unpaidChargesAmount = Math.round((totalChargesAmount - paidChargesAmount) * 100) / 100;
      
      // 2. Calcular capital pagado y abonos a capital
      const totalCapitalPayments = (capitalPayments || []).reduce((sum, cp) => sum + (cp.amount || 0), 0);
      // CORRECCIÓN: Para el CAPITAL (principal) NO usar la suma de principal por cuotas,
      // porque por redondeos puede generar discrepancias (ej. 10,000 → 10,002).
      // El capital pendiente debe partir de loan.amount, restando SOLO pagos de cuotas regulares
      // (excluyendo pagos a cargos) y abonos a capital.
      const round2 = (n: number) => Math.round((Number(n || 0) * 100)) / 100;
      const isChargeInst = (inst: any) =>
        Math.abs(Number(inst?.interest_amount || 0)) < 0.01 &&
        Math.abs((Number(inst?.principal_amount || 0)) - (Number(inst?.total_amount || 0))) < 0.01;

      const paidAmountByDue = new Map<string, number>();
      for (const p of payments || []) {
        const due = (p as any)?.due_date ? String((p as any).due_date).split('T')[0] : null;
        if (!due) continue;
        paidAmountByDue.set(due, round2((paidAmountByDue.get(due) || 0) + (Number((p as any).amount) || 0)));
      }

      // ✅ CORRECCIÓN: calcular capital pagado por cuota usando MONTO por due_date e interés primero.
      const capitalPaidFromLoan = (allInstallments || [])
        .filter(inst => !isChargeInst(inst))
        .reduce((sum, inst) => {
          const due = inst.due_date ? String(inst.due_date).split('T')[0] : null;
          if (!due) return sum;
          const totalPaid = paidAmountByDue.get(due) || 0;
          const expectedInterest = round2(Number(inst.interest_amount || 0));
          const expectedPrincipal = round2(Number(inst.principal_amount || 0));
          const principalPaid = Math.min(expectedPrincipal, Math.max(0, round2(totalPaid - expectedInterest)));
          return sum + principalPaid;
        }, 0);

      // IMPORTANTE: Redondear a 2 decimales usando Math.round(value * 100) / 100 para valores monetarios
      const capitalPending = Math.round(
        Math.max(0, (loan.amount || 0) - capitalPaidFromLoan - (totalCapitalPayments || 0)) * 100
      ) / 100;
      
      // 4. Calcular interés pendiente (solo de cuotas regulares, no cargos)
      // CORRECCIÓN CRÍTICA: Considerar pagos parciales - restar lo que ya se pagó de interés de cada cuota
      // IMPORTANTE: Incluir TODAS las cuotas regulares (no solo is_paid = false) para incluir pagos parciales
      // IMPORTANTE: Redondear cada valor individual antes de sumar
      const interestPending = (allInstallments || [])
        .filter(inst => {
          const isCharge = Math.abs(inst.interest_amount || 0) < 0.01 && 
                          Math.abs((inst.principal_amount || 0) - (inst.total_amount || 0)) < 0.01;
          return !isCharge;
        })
        .reduce((sum, inst) => {
          const originalInterest = round2(inst.interest_amount || 0);
          const installmentDueDate = inst.due_date?.split('T')[0];
          let totalPaidForDue = 0;

          if (installmentDueDate) {
            totalPaidForDue = paidAmountByDue.get(installmentDueDate) || 0;
          }

          // Interés primero
          const interestPaidForThisInstallment = Math.min(originalInterest, totalPaidForDue);
          const remainingInterest = Math.max(0, round2(originalInterest - interestPaidForThisInstallment));
          // Solo incluir si hay algo pendiente (remainingInterest > 0.01)
          if (remainingInterest > 0.01) {
            return sum + remainingInterest;
          }
          return sum;
        }, 0);
      
      // IMPORTANTE: Redondear interés pendiente a 2 decimales usando Math.round(value * 100) / 100 para valores monetarios
      const interestPendingRounded = Math.round(interestPending * 100) / 100;
      
      // ✅ Separar balance (sin cargos) y total (con cargos)
      const baseBalance = Math.round((capitalPending + interestPendingRounded) * 100) / 100;
      const totalBalance = Math.round((baseBalance + unpaidChargesAmount) * 100) / 100;
      
      console.log('🔍 calculateRemainingBalance: Balance calculado dinámicamente (fixed-term, corregido)', {
        loanId: loan.id,
        capitalPending,
        interestPending: interestPendingRounded,
        unpaidChargesAmount,
        remainingBalance: totalBalance,
        bdRemainingBalance: loan.remaining_balance
      });
      
      return { baseBalance, pendingCharges: unpaidChargesAmount, totalBalance };
    } catch (error) {
      console.error('Error calculando balance pendiente:', error);
      const fallback = Number(loan.remaining_balance || 0) || 0;
      return { baseBalance: fallback, pendingCharges: 0, totalBalance: fallback };
    }
  };

  const calculateRemainingBalance = async (loan: any): Promise<number> => {
    const b = await calculateBalanceBreakdown(loan);
    return b.totalBalance;
  };

  // Función helper para calcular la fecha ISO de la próxima cuota no pagada (para LateFeeInfo)
  const calculateNextPaymentDateISO = async (loan: any): Promise<string | null> => {
    // ✅ INDEFINIDOS: calcular desde pagos + start_date (no confiar en installments/is_paid ni next_payment_date)
    if (String(loan?.amortization_type || '').toLowerCase() === 'indefinite' && loan?.start_date) {
      try {
        const addPeriodIso = (iso: string, freq: string) => {
          const [yy, mm, dd] = String(iso || '').split('T')[0].split('-').map(Number);
          if (!yy || !mm || !dd) return iso;
          const base = new Date(yy, mm - 1, dd);
          const dt = new Date(base);
          switch (String(freq || 'monthly').toLowerCase()) {
            case 'daily':
              dt.setDate(dt.getDate() + 1);
              break;
            case 'weekly':
              dt.setDate(dt.getDate() + 7);
              break;
            case 'biweekly':
              dt.setDate(dt.getDate() + 14);
              break;
            case 'monthly':
            default:
              dt.setFullYear(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
              break;
          }
          const y = dt.getFullYear();
          const m = String(dt.getMonth() + 1).padStart(2, '0');
          const d = String(dt.getDate()).padStart(2, '0');
          return `${y}-${m}-${d}`;
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

        const paidByDue = new Map<string, number>(); // solo dues válidos (>= firstDueFromStart)
        for (const p of (payRows || []) as any[]) {
          const rawDue = p?.due_date ? String(p.due_date).split('T')[0] : null;
          if (!rawDue) continue;
          const interest = Number(p?.interest_amount || 0) || 0;
          const amt = Number(p?.amount || 0) || 0;
          const paidValue = interest > 0.01 ? interest : (amt > 0.01 && amt <= (interestPerPayment * 1.25) ? amt : 0);
          if (paidValue <= 0.01) continue;
          if (rawDue < firstDueFromStart) {
            // Ignorar dues inválidos (ej. 28-feb) para determinar la fecha activa.
          } else {
            paidByDue.set(rawDue, (paidByDue.get(rawDue) || 0) + paidValue);
          }
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

        const next = partialDue || (maxFull ? addPeriodIso(maxFull, freq) : firstDueFromStart);
        return next || null;
      } catch (e) {
        // si falla, caer a la lógica previa
      }
    }

    // SIEMPRE buscar la primera cuota/cargo pendiente ordenada por fecha de vencimiento
    try {
      const { data: installments, error } = await supabase
        .from('installments')
        .select('due_date, is_paid, total_amount, principal_amount, interest_amount')
        .eq('loan_id', loan.id)
        .eq('is_paid', false)
        .order('due_date', { ascending: true })
        .limit(25);
      
      if (!error && installments && installments.length > 0) {
        const amort = String(loan?.amortization_type || '').toLowerCase();
        const isIndefinite = amort === 'indefinite';
        const isCharge = (inst: any) =>
          Math.abs(Number(inst?.interest_amount || 0)) < 0.01 &&
          Math.abs(Number(inst?.principal_amount || 0) - Number(inst?.total_amount ?? 0)) < 0.01;

        // ✅ INDEFINIDOS: ignorar cuotas “clamp” anteriores a la primera fecha real (ej. 28-feb cuando debe ser 02-mar)
        let firstDueFromStart: string | null = null;
        if (isIndefinite && loan?.start_date) {
          const startDateStr = String(loan.start_date).split('T')[0];
          const [y, m, d] = startDateStr.split('-').map(Number);
          if (y && m && d) {
            const start = new Date(y, m - 1, d);
            const first = new Date(start);
            const frequency = String(loan.payment_frequency || 'monthly').toLowerCase();
            switch (frequency) {
              case 'daily':
                first.setDate(start.getDate() + 1);
                break;
              case 'weekly':
                first.setDate(start.getDate() + 7);
                break;
              case 'biweekly':
                first.setDate(start.getDate() + 14);
                break;
              case 'monthly':
              default:
                // Overflow intencional (30-ene + 1 mes => 02-mar)
                first.setFullYear(start.getFullYear(), start.getMonth() + 1, start.getDate());
                break;
            }
            const fy = first.getFullYear();
            const fm = String(first.getMonth() + 1).padStart(2, '0');
            const fd = String(first.getDate()).padStart(2, '0');
            firstDueFromStart = `${fy}-${fm}-${fd}`;
          }
        }

        const firstUnpaid = (installments || []).find((inst: any) => {
          if (!inst?.due_date) return false;
          const dueKey = String(inst.due_date).split('T')[0];
          if (!dueKey) return false;
          if (!isIndefinite) return true;
          if (isCharge(inst)) return true;
          return !firstDueFromStart || dueKey >= firstDueFromStart;
        });

        if (firstUnpaid?.due_date) {
          console.log('🔍 calculateNextPaymentDateISO: Primera cuota pendiente encontrada:', {
            loanId: loan.id,
            dueDate: firstUnpaid.due_date,
            isCharge: firstUnpaid.interest_amount === 0 && firstUnpaid.principal_amount === firstUnpaid.total_amount
          });
          return firstUnpaid.due_date.split('T')[0];
        }
      }
    } catch (error) {
      console.error('Error buscando primera cuota pendiente:', error);
    }
    
    // Si no se encontró ninguna cuota pendiente, usar la lógica de respaldo
    if (!loan.next_payment_date) return null;
    
    // CORRECCIÓN: Para préstamos indefinidos, calcular la primera cuota NO PAGADA (vencida o no)
    if (loan.amortization_type === 'indefinite' && loan.start_date) {
      try {
        const startDateStr = loan.start_date.split('T')[0];
        const [startYear, startMonth, startDay] = startDateStr.split('-').map(Number);
        const startDate = new Date(startYear, startMonth - 1, startDay);
        
        // Calcular la primera fecha de pago (un período después de start_date)
        const firstPaymentDate = new Date(startDate);
        const frequency = loan.payment_frequency || 'monthly';
        
        switch (frequency) {
          case 'daily':
            firstPaymentDate.setDate(startDate.getDate() + 1);
            break;
          case 'weekly':
            firstPaymentDate.setDate(startDate.getDate() + 7);
            break;
          case 'biweekly':
            firstPaymentDate.setDate(startDate.getDate() + 14);
            break;
          case 'monthly':
          default:
            // Overflow intencional (30-ene + 1 mes => 02-mar)
            firstPaymentDate.setFullYear(startDate.getFullYear(), startDate.getMonth() + 1, startDate.getDate());
            break;
        }
        
        // CORRECCIÓN: Calcular la primera cuota NO PAGADA basándose en el tiempo transcurrido y el interés pendiente
        const today = getCurrentDateInSantoDomingo();
        
        // Calcular cuántas cuotas deberían existir desde firstPaymentDate hasta el final del mes actual + 1 mes futuro
        // Si firstPaymentDate es nov y hoy es dic, entonces hay 3 cuotas: nov, dic, ene (próximo mes)
        const monthsElapsed = Math.max(0, 
          (today.getFullYear() - firstPaymentDate.getFullYear()) * 12 + 
          (today.getMonth() - firstPaymentDate.getMonth())
        );
        // totalExpected = número de cuotas desde firstPaymentDate hasta el final del mes actual + 1 mes futuro
        // Si firstPaymentDate es nov y hoy es dic, entonces monthsElapsed = 1, y totalExpected = 3 (nov, dic, ene)
        // Esto asegura que siempre incluya al menos el mes actual y el próximo mes
        const totalExpected = monthsElapsed + 2;
        
        // Calcular cuántas cuotas se han pagado basándose en el interés pendiente o los pagos reales
        const pendingInterest = pendingInterestForIndefinite[loan.id];
        const storedPaidCount = paidInstallmentsCountForIndefinite[loan.id];
        const interestPerPayment = (loan.amount * loan.interest_rate) / 100;
        let paidCount: number;
        
        // Calcular meses transcurridos desde firstPaymentDate hasta hoy
        const monthsFromStart = Math.max(0, 
          (today.getFullYear() - firstPaymentDate.getFullYear()) * 12 + 
          (today.getMonth() - firstPaymentDate.getMonth())
        );
        // Total de cuotas que deberían existir desde firstPaymentDate hasta hoy (inclusive)
        const totalExpectedFromStart = monthsFromStart + 1;
        
        if (storedPaidCount !== undefined && storedPaidCount !== null) {
          // Si tenemos el número de cuotas pagadas almacenado, usarlo directamente
          paidCount = storedPaidCount;
        } else if (pendingInterest !== undefined && pendingInterest !== null) {
          // Si tenemos el interés pendiente, usarlo para calcular
          const unpaidCount = pendingInterest > 0 ? Math.ceil(pendingInterest / interestPerPayment) : 0;
          
          // CORRECCIÓN: Cuando pendingInterest es 0, significa que no hay interés pendiente,
          // lo cual significa que se pagaron todas las cuotas hasta hoy (y posiblemente más).
          // Necesitamos calcular desde los meses transcurridos para saber cuántas cuotas se pagaron.
          if (unpaidCount === 0 && pendingInterest === 0) {
            // Si no hay interés pendiente, se pagaron todas las cuotas hasta hoy
            // La próxima cuota es la primera del mes siguiente
            // Usar totalExpectedFromStart que cuenta desde firstPaymentDate hasta hoy
            paidCount = totalExpectedFromStart; // Se pagaron todas las cuotas hasta hoy
          } else {
            // Si hay cuotas no pagadas, calcular normalmente
            // Usar totalExpectedFromStart en lugar de totalExpected para tener el cálculo correcto
            paidCount = unpaidCount > 0 
              ? Math.max(0, totalExpectedFromStart - unpaidCount) 
              : totalExpectedFromStart;
          }
        } else {
          // Si no tenemos el interés pendiente ni el número de cuotas pagadas, calcular desde los meses transcurridos
          // Asumimos que se pagaron todas las cuotas hasta hoy
          paidCount = totalExpectedFromStart;
        }
        
        // La próxima cuota no pagada es la cuota (paidCount + 1)
        // Si se pagaron 4 cuotas (nov, dic, ene, feb), la próxima no pagada es la cuota 5 (mar)
        // La cuota 5 está a 4 períodos de la primera cuota (nov)
        const nextDate = new Date(firstPaymentDate);
        const periodsToAdd = paidCount; // Si paidCount = 4, entonces nextDate = nov + 4 meses = mar
        
        switch (frequency) {
          case 'daily':
            nextDate.setDate(firstPaymentDate.getDate() + periodsToAdd);
            break;
          case 'weekly':
            nextDate.setDate(firstPaymentDate.getDate() + (periodsToAdd * 7));
            break;
          case 'biweekly':
            nextDate.setDate(firstPaymentDate.getDate() + (periodsToAdd * 14));
            break;
          case 'monthly':
          default:
            // Overflow intencional
            nextDate.setFullYear(firstPaymentDate.getFullYear(), firstPaymentDate.getMonth() + periodsToAdd, firstPaymentDate.getDate());
            break;
        }
        
        const correctedYear = nextDate.getFullYear();
        const correctedMonth = String(nextDate.getMonth() + 1).padStart(2, '0');
        const correctedDay = String(nextDate.getDate()).padStart(2, '0');
        const result = `${correctedYear}-${correctedMonth}-${correctedDay}`;
        
        console.log('🔍 calculateNextPaymentDateISO:', {
          loanId: loan.id,
          startDate: startDateStr,
          firstPaymentDate: `${firstPaymentDate.getFullYear()}-${String(firstPaymentDate.getMonth() + 1).padStart(2, '0')}-${String(firstPaymentDate.getDate()).padStart(2, '0')}`,
          today: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`,
          monthsElapsed,
          totalExpected,
          pendingInterest: pendingInterestForIndefinite[loan.id],
          paidCount,
          periodsToAdd,
          result
        });
        
        return result;
      } catch (error) {
        console.error('Error en calculateNextPaymentDateISO:', error);
        // Si hay error, usar la fecha original pero corregir el día
        const date = new Date(loan.next_payment_date);
        const year = date.getFullYear();
        const month = date.getMonth();
        const day = date.getDate();
        const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
        
        if (day === lastDayOfMonth || day !== 1) {
          const correctedDate = day === lastDayOfMonth 
            ? new Date(year, month + 1, 1)
            : new Date(year, month, 1);
          return correctedDate.toISOString().split('T')[0];
        }
        return loan.next_payment_date.split('T')[0];
      }
    }
    
    return loan.next_payment_date.split('T')[0];
  };

  // Función helper para formatear la visualización de next_payment_date
  const formatNextPaymentDate = (loan: any) => {
    const amortizationTypeLower = String(loan?.amortization_type || '').toLowerCase();
    const isIndefinite = amortizationTypeLower === 'indefinite';

    // ✅ INDEFINIDOS: usar la primera cuota/cargo pendiente (desde installments) cuando esté disponible,
    // porque `next_payment_date` puede quedar desfasado (ej. 28-Feb vs 02-Mar).
    const isoDate = (isIndefinite ? (nextPaymentDates[loan.id] || null) : null) || loan.next_payment_date?.split('T')[0] || null;
    if (!isoDate) return 'N/A';
    return formatDateStringForSantoDomingo(isoDate);
  };
  
  // Estado para almacenar las fechas de próximo pago calculadas
  const [nextPaymentDates, setNextPaymentDates] = useState<{ [loanId: string]: string | null }>({});
  
     // Estados para filtros y búsqueda
   const [searchTerm, setSearchTerm] = useState('');
   // Cargar filtros desde localStorage si existen
   const [statusFilter, setStatusFilter] = useState(() => {
     const saved = localStorage.getItem('loans_statusFilter');
     return saved || 'active';
   });
   const [dateFilter, setDateFilter] = useState(() => {
     const saved = localStorage.getItem('loans_dateFilter');
     return saved || 'all';
   });
   const [amountFilter, setAmountFilter] = useState(() => {
     const saved = localStorage.getItem('loans_amountFilter');
     return saved || 'all';
   });
   const [overdueFilter, setOverdueFilter] = useState(() => {
     const saved = localStorage.getItem('loans_overdueFilter');
     return saved === 'true';
   });
   const [showDeleted, setShowDeleted] = useState(() => {
     const saved = localStorage.getItem('loans_showDeleted');
     return saved === 'true';
   });

   // Guardar filtros en localStorage cuando cambien
   useEffect(() => {
     localStorage.setItem('loans_statusFilter', statusFilter);
   }, [statusFilter]);

   useEffect(() => {
     localStorage.setItem('loans_dateFilter', dateFilter);
   }, [dateFilter]);

   useEffect(() => {
     localStorage.setItem('loans_amountFilter', amountFilter);
   }, [amountFilter]);

   useEffect(() => {
     localStorage.setItem('loans_overdueFilter', overdueFilter.toString());
   }, [overdueFilter]);

   useEffect(() => {
     localStorage.setItem('loans_showDeleted', showDeleted.toString());
   }, [showDeleted]);
  
  const { loans, loading, refetch } = useLoans();
  const { profile, companyId } = useAuth();
  const { updateAllLateFees, loading: lateFeeLoading } = useLateFee();

  // Fallback (sin Realtime): cuando `LoanUpdateForm` termina un abono a capital / recalculo de cuotas,
  // dispara `installmentsUpdated`. Escuchamos ese evento para refrescar y recalcular balances al instante.
  useEffect(() => {
    const handler = (event: Event) => {
      const e = event as CustomEvent;
      const affectedLoanId = e?.detail?.loanId as string | undefined;
      if (!affectedLoanId) return;

      // Refetch para traer valores actualizados (si triggers existen) y recalcular localmente (si no).
      setTimeout(() => {
        try {
          refetch();
        } catch (err) {
          console.error('Error haciendo refetch tras installmentsUpdated:', err);
        }

        const loan = (loans || []).find((l: any) => l.id === affectedLoanId);
        if (!loan) return;

        calculateBalanceBreakdown(loan).then((b) => {
          setCalculatedRemainingBalances((prev) => ({
            ...prev,
            [affectedLoanId]: Math.round(Number(b.totalBalance || 0) * 100) / 100
          }));
          setCalculatedBaseBalances((prev) => ({
            ...prev,
            [affectedLoanId]: Math.round(Number(b.baseBalance || 0) * 100) / 100
          }));
          setCalculatedPendingCharges((prev) => ({
            ...prev,
            [affectedLoanId]: Math.round(Number(b.pendingCharges || 0) * 100) / 100
          }));
        });

        // ✅ También refrescar el "Próximo Pago" calculado en indefinidos (evita quedarse en 28-feb).
        if (String((loan as any)?.amortization_type || loan?.amortization_type || '').toLowerCase() === 'indefinite') {
          calculateNextPaymentDateISO(loan)
            .then((iso) => {
              setNextPaymentDates((prev) => ({ ...prev, [affectedLoanId]: iso }));
            })
            .catch(() => {
              // no-op
            });
        }
      }, 300);
    };

    window.addEventListener('installmentsUpdated', handler as EventListener);
    return () => window.removeEventListener('installmentsUpdated', handler as EventListener);
  }, [loans, refetch]);
  
  // OPTIMIZADO: Usar next_payment_date de la BD para NO-indefinidos.
  // Para INDEFINIDOS, derivar desde installments (primera pendiente) para evitar fechas “clamp” de fin de mes.
  // La BD ahora actualiza automáticamente este valor con triggers cuando cambian pagos/installments
  // No necesitamos calcular dinámicamente
  const nextPaymentDatesMemo = useMemo(() => {
    if (!loans || loans.length === 0) return {};
    
    const dates: { [loanId: string]: string | null } = {};
    
    // Usar next_payment_date de la BD directamente (ya incluye cargos gracias a los triggers)
    loans.forEach(loan => {
      const amortizationTypeLower = String((loan as any).amortization_type || loan.amortization_type || '').toLowerCase();
      const isIndefinite = amortizationTypeLower === 'indefinite';
      if (isIndefinite) return; // se calcula aparte
      if (loan.next_payment_date) {
        dates[loan.id] = loan.next_payment_date.split('T')[0];
      } else {
        dates[loan.id] = null;
      }
    });
    
    return dates;
  }, [loans?.map(l => `${l.id}-${l.next_payment_date}`).join(',')]);

  // Actualizar estado solo cuando el memo cambie
  useEffect(() => {
    // No sobreescribir indefinidos calculados; solo mergear NO-indefinidos
    setNextPaymentDates(prev => ({ ...prev, ...nextPaymentDatesMemo }));
  }, [nextPaymentDatesMemo]);

  // ✅ Calcular nextPaymentDate para INDEFINIDOS desde installments (primera cuota/cargo pendiente)
  useEffect(() => {
    if (!loans || loans.length === 0) return;
    let cancelled = false;

    const indefiniteLoans = loans.filter((l: any) => String((l as any).amortization_type || l.amortization_type || '').toLowerCase() === 'indefinite');
    if (indefiniteLoans.length === 0) return;

    (async () => {
      const entries = await Promise.all(
        indefiniteLoans.map(async (loan: any) => {
          try {
            const iso = await calculateNextPaymentDateISO(loan);
            return [loan.id, iso] as const;
          } catch {
            return [loan.id, loan.next_payment_date?.split('T')[0] || null] as const;
          }
        })
      );
      if (cancelled) return;
      setNextPaymentDates(prev => {
        const next = { ...prev } as any;
        for (const [id, iso] of entries) next[id] = iso;
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [loans?.map(l => `${l.id}-${(l as any).amortization_type || l.amortization_type}-${l.next_payment_date}`).join(',')]);

  // OPTIMIZADO: Ya no necesitamos recalcular fechas dinámicamente
  // La BD ahora actualiza next_payment_date automáticamente con triggers cuando cambian pagos/installments
  // Solo usamos next_payment_date de la BD directamente

  // OPTIMIZADO: Calcular balances dinámicamente igual que LoanDetailsView
  // Memoizar montos y balances usando los datos que ya vienen de la BD
  const amountsMemo = useMemo(() => {
    if (!loans || loans.length === 0) return { totalAmounts: {}, remainingBalances: {} };
    
    const totalAmounts: { [loanId: string]: number } = {};
    const remainingBalances: { [loanId: string]: number } = {};
    
    // Calcular balances dinámicamente para cada préstamo
    loans.forEach(loan => {
      // Calcular total amount (síncrono, no requiere queries)
      totalAmounts[loan.id] = calculateTotalAmount(loan);
      
      // CORRECCIÓN: Usar remaining_balance de la BD directamente
      // La BD ahora actualiza automáticamente este valor con triggers cuando cambian pagos/installments
      // Solo calcular dinámicamente para préstamos indefinidos que requieren cálculo de interés pendiente
      if (loan.amortization_type === 'indefinite') {
        // Para préstamos indefinidos, calcular con interés pendiente
        const baseAmount = loan.amount || 0;
        const pendingInterest = pendingInterestForIndefinite[loan.id] || 0;
        remainingBalances[loan.id] = baseAmount + pendingInterest;
      } else {
        // Para otros tipos, usar remaining_balance de la BD (ya incluye cargos gracias a los triggers)
        remainingBalances[loan.id] = loan.remaining_balance || 0;
      }
    });
    
    return { totalAmounts, remainingBalances };
  }, [
    loans?.map(l => `${l.id}-${l.amount}-${l.remaining_balance}-${l.total_amount}`).join(','),
    // Incluir calculatedRemainingBalances para que se use cuando esté disponible
    Object.keys(calculatedRemainingBalances).join(','),
    // Incluir pendingInterestForIndefinite para préstamos indefinidos
    Object.keys(pendingInterestForIndefinite).join(',')
  ]);

  // Actualizar estado solo cuando el memo cambie
  // CORRECCIÓN: No sobrescribir calculatedRemainingBalances desde amountsMemo porque amountsMemo
  // puede usar valores de BD que están desactualizados. Los balances se actualizan desde
  // el useEffect que calcula dinámicamente (línea 543-588)
  useEffect(() => {
    setCalculatedTotalAmounts(amountsMemo.totalAmounts);
    // No actualizar calculatedRemainingBalances desde aquí porque se actualiza
    // dinámicamente en el useEffect que calcula balances (línea 543-588)
  }, [amountsMemo]);

  // CORRECCIÓN: Calcular balances dinámicamente y verificar/corregir discrepancias con BD
  // Para préstamos indefinidos: calcular siempre
  // Para otros préstamos: calcular y comparar con BD, actualizar si hay discrepancia significativa
  useEffect(() => {
    if (!loans || loans.length === 0) return;
    
    const recalculateAndVerifyBalances = async () => {
      try {
        const remainingBalances: { [loanId: string]: number } = {};
        const loansToUpdate: string[] = [];
        const balanceFixes: Array<{ loanId: string; newBalance: number }> = [];
    
        // Calcular balances para todos los préstamos
        const calculations = loans.map(async (loan) => {
          const breakdown = await calculateBalanceBreakdown(loan);
          const calculatedBalance = breakdown.totalBalance;
          const dbBalance = loan.remaining_balance || 0;
          const discrepancy = Math.abs(calculatedBalance - dbBalance);
          const amortizationTypeLower = ((loan as any).amortization_type || loan.amortization_type || '').toLowerCase();
          const isIndefinite = amortizationTypeLower === 'indefinite';
          
          // Si hay discrepancia significativa (> 0.01), marcar para actualización
          if (discrepancy > 0.01 && loan.status !== 'deleted' && loan.status !== 'paid') {
            loansToUpdate.push(loan.id);
            console.log('🔍 Discrepancia detectada en balance:', {
              loanId: loan.id,
              calculated: calculatedBalance,
              db: dbBalance,
              discrepancy
            });

            // FIX CRÍTICO: en indefinidos la BD puede quedarse desactualizada (ej. después de abono + cargo)
            // Autocorregir remaining_balance en BD para que el preview no quede pegado en el valor errado.
            if (isIndefinite) {
              const rounded = Math.round(calculatedBalance * 100) / 100;
              balanceFixes.push({ loanId: loan.id, newBalance: rounded });
            }
          }
          
          return { 
            loanId: loan.id, 
            remainingBalance: calculatedBalance,
            baseBalance: breakdown.baseBalance,
            pendingCharges: breakdown.pendingCharges,
            needsUpdate: discrepancy > 0.01 
          };
      });
      
      const results = await Promise.all(calculations);
      
        // Actualizar estado con balances calculados
        results.forEach(({ loanId, remainingBalance, baseBalance, pendingCharges }) => {
        // Solo actualizar si no hay actualización optimista reciente
        const lastOptimisticUpdate = optimisticUpdateTimestampsRef.current[loanId];
        const now = Date.now();
        const timeSinceOptimistic = lastOptimisticUpdate ? now - lastOptimisticUpdate : Infinity;
        
        if (timeSinceOptimistic > 2000) {
          // IMPORTANTE: Redondear el balance a 2 decimales antes de guardarlo para evitar diferencias de redondeo
          remainingBalances[loanId] = Math.round(remainingBalance * 100) / 100;
          setCalculatedBaseBalances(prev => ({ ...prev, [loanId]: Math.round(Number(baseBalance || 0) * 100) / 100 }));
          setCalculatedPendingCharges(prev => ({ ...prev, [loanId]: Math.round(Number(pendingCharges || 0) * 100) / 100 }));
        }
      });
      
        // Actualizar estado con balances calculados
      if (Object.keys(remainingBalances).length > 0) {
        setCalculatedRemainingBalances(prev => ({
          ...prev,
          ...remainingBalances
        }));
      }
        
        // Autocorrección: solo para indefinidos y con rate-limit por préstamo
        if (balanceFixes.length > 0) {
          const now = Date.now();
          const fixesToApply = balanceFixes.filter(f => {
            const lastFix = lastBalanceFixTimestampsRef.current[f.loanId] || 0;
            return now - lastFix > 60_000; // 60s por préstamo
          });

          if (fixesToApply.length > 0) {
            await Promise.all(
              fixesToApply.map(async ({ loanId, newBalance }) => {
                const { error } = await supabase
                  .from('loans')
                  .update({ remaining_balance: newBalance })
                  .eq('id', loanId);
                if (!error) {
                  lastBalanceFixTimestampsRef.current[loanId] = now;
                  console.log('✅ Autocorrección remaining_balance (indefinido):', { loanId, newBalance });
                } else {
                  console.error('❌ Error autocorrigiendo remaining_balance:', { loanId, error });
                }
              })
            );
          }
        } else if (loansToUpdate.length > 0) {
          console.log('🔍 Discrepancia detectada en balances, pero sin autocorrección aplicada (no indefinido)');
        }
      } catch (error) {
        console.error('Error calculando y verificando balances:', error);
      }
    };

    // Al cambiar la lista, no mostrar valores stale
    let cancelled = false;
    setBalancesHydrated(false);

    (async () => {
      await recalculateAndVerifyBalances();
      if (!cancelled) setBalancesHydrated(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [
    loans?.map(l => `${l.id}-${l.amount}-${l.remaining_balance}-${l.total_amount}`).join(','),
    pendingInterestForIndefinite ? Object.keys(pendingInterestForIndefinite).join(',') : ''
  ]);
  
  // OPTIMIZADO: Escuchar cambios en installments, loans y payments
  // Usar refs para mantener canales y evitar recreaciones innecesarias
  const channelsRef = useRef<{
    installments?: any;
    loans?: any;
    payments?: any;
  }>({});
  const loanIdsRef = useRef<string[]>([]);
  const refetchTimeoutIdRef = useRef<NodeJS.Timeout | null>(null);

  // Memoizar loanIds para evitar recreaciones
  const loanIds = useMemo(() => {
    if (!loans || loans.length === 0) return [];
    return loans.map(loan => loan.id).sort().join(',');
  }, [loans?.map(l => l.id).sort().join(',')]);

  useEffect(() => {
    if (!loans || loans.length === 0) {
      // Limpiar canales si no hay préstamos
      Object.values(channelsRef.current).forEach(channel => {
        if (channel) supabase.removeChannel(channel);
      });
      channelsRef.current = {};
      loanIdsRef.current = [];
      return;
    }
    
    const currentLoanIds = loans.map(loan => loan.id).sort();
    const currentLoanIdsStr = currentLoanIds.join(',');
    
    // Solo recrear canales si los IDs cambiaron
    if (loanIdsRef.current.join(',') === currentLoanIdsStr) {
      return; // No hacer nada si los IDs son los mismos
    }
    
    // Limpiar canales anteriores
    Object.values(channelsRef.current).forEach(channel => {
      if (channel) supabase.removeChannel(channel);
    });
    channelsRef.current = {};
    loanIdsRef.current = currentLoanIds;
    
    // Cancelar timeout anterior
    if (refetchTimeoutIdRef.current) {
      clearTimeout(refetchTimeoutIdRef.current);
      refetchTimeoutIdRef.current = null;
    }
    
    // Función para actualización optimista inmediata (sin queries, solo desde payload)
    const updateOptimistically = (loanId: string, payload: any) => {
      // Si el cambio viene de la tabla loans, actualizar directamente los campos
      if (payload.new) {
        const updatedLoan = payload.new as any;
        
        // Actualizar fecha de próximo pago si cambió
        if (updatedLoan.next_payment_date) {
          setNextPaymentDates(prev => ({
            ...prev,
            [loanId]: updatedLoan.next_payment_date?.split('T')[0] || null
          }));
        }
        
        // Actualizar balance si cambió
        if (updatedLoan.remaining_balance !== undefined) {
          setCalculatedRemainingBalances(prev => ({
            ...prev,
            [loanId]: updatedLoan.remaining_balance
          }));
        }
      }
    };
    
    // Función para actualización optimista cuando se agregan cargos (installments)
    // SÍNCRONA para actualización inmediata sin esperas
    const updateOptimisticallyForInstallments = (loanId: string, payload?: any) => {
      const loan = loans.find(l => l.id === loanId);
      if (!loan) return;
      
      // Si tenemos el payload del evento, usar los datos directamente para actualización inmediata
      if (payload?.new) {
        const newInstallment = payload.new as any;
        const isCharge = newInstallment.interest_amount === 0 && 
                        newInstallment.principal_amount === newInstallment.total_amount;
        
        if (isCharge) {
          // CORRECCIÓN: NO hacer actualización optimista aquí porque los triggers de la BD
          // ya actualizarán remaining_balance y next_payment_date correctamente (incluyendo cargos)
          // Hacer actualización optimista aquí puede sobrescribir los valores correctos calculados por los triggers
          // Solo marcar timestamp para evitar recálculos innecesarios y confiar en el refetch
          optimisticUpdateTimestampsRef.current[loanId] = Date.now();
          
          console.log('⚡ Cargo detectado - esperando triggers de BD para actualizar valores:', {
            loanId,
            chargeAmount: newInstallment.total_amount || 0,
            // No actualizar estado aquí, dejar que los triggers actualicen y el refetch traiga los valores correctos
          });
          
          // NO salir temprano, dejar que el refetchImmediately() actualice los valores correctos desde la BD
          // return; // REMOVIDO: Necesitamos que el refetch se ejecute
        }
      }
      
      // Fallback: recalcular balance si no tenemos payload (más lento, async)
      // Esto solo se ejecuta si no hay payload
      calculateRemainingBalance(loan).then(newBalance => {
        setCalculatedRemainingBalances(prev => ({
          ...prev,
          [loanId]: newBalance
        }));
      });
    };
    
    // Función para recargar datos después de que los triggers completen
    const refetchImmediately = () => {
      // Cancelar timeout anterior si existe
      if (refetchTimeoutIdRef.current) {
        clearTimeout(refetchTimeoutIdRef.current);
        refetchTimeoutIdRef.current = null;
      }
      
      // CORRECCIÓN: Esperar un momento (300ms) antes de refetch para asegurar que los triggers completen
      // Los triggers de PostgreSQL necesitan tiempo para ejecutarse y actualizar remaining_balance y next_payment_date
      // Ejecutar refetch después de que los triggers completen su actualización
        refetchTimeoutIdRef.current = setTimeout(() => {
        console.log('🔄 Refetching loans después de cambio (esperando triggers)...');
          refetch();
          refetchTimeoutIdRef.current = null;
      }, 300);
    };
    
    // Crear canal de Realtime para escuchar cambios en installments
    const installmentsChannel = supabase
      .channel(`loans-installments-changes-${Date.now()}`)
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'installments'
        }, 
        async (payload) => {
          const affectedLoanId = (payload.new as any)?.loan_id || (payload.old as any)?.loan_id;
          if (affectedLoanId && currentLoanIds.includes(affectedLoanId)) {
            // Actualización optimista inmediata para installments (cargos) usando el payload
            if (payload.new) {
              updateOptimisticallyForInstallments(affectedLoanId, payload);
            }
            
            // OPTIMIZADO: La BD ya actualiza next_payment_date automáticamente con triggers
            // No necesitamos recalcular, el refetch traerá el valor correcto
            // El valor se actualizará automáticamente cuando se haga el refetch
            
            // Refetch en background (no bloquea la UI)
            refetchImmediately();
          }
        }
      )
      .subscribe();
    
    // Crear canal de Realtime para escuchar cambios en loans
    const loansChannel = supabase
      .channel(`loans-direct-changes-${Date.now()}`)
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'loans',
          filter: `id=in.(${currentLoanIds.join(',')})`
        }, 
        (payload) => {
          const affectedLoanId = (payload.new as any)?.id || (payload.old as any)?.id;
          if (affectedLoanId && currentLoanIds.includes(affectedLoanId)) {
            // Actualización optimista inmediata desde el payload
            updateOptimistically(affectedLoanId, payload);
            // Refetch inmediato para sincronizar
            refetchImmediately();
          }
        }
      )
      .subscribe();
    
    // Crear canal de Realtime para escuchar cambios en payments
    const paymentsChannel = supabase
      .channel(`loans-payments-changes-${Date.now()}`)
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'payments'
        }, 
        async (payload) => {
          const affectedLoanId = (payload.new as any)?.loan_id || (payload.old as any)?.loan_id;
          if (affectedLoanId && currentLoanIds.includes(affectedLoanId)) {
            // CORRECCIÓN: Recalcular balance Y fecha de próximo pago dinámicamente cuando cambian los pagos
            // para asegurar que el preview muestre el mismo valor que Detalles
            // Primero obtener el préstamo más reciente de la BD para asegurar datos actualizados
            const { data: freshLoanData } = await supabase
              .from('loans')
              .select('*, total_amount')
              .eq('id', affectedLoanId)
              .single();
            
            if (freshLoanData) {
              // OPTIMIZADO: La BD ya actualiza remaining_balance automáticamente con triggers
              // No necesitamos recalcular dinámicamente, solo confiar en el valor de la BD
              // El refetchImmediately() abajo actualizará los préstamos con los valores correctos
              if (freshLoanData.amortization_type !== 'indefinite') {
                // Para préstamos no-indefinidos, el trigger ya actualizó remaining_balance en la BD
                // El refetch traerá el valor correcto
                console.log('🔍 Balance actualizado en BD por trigger:', {
                  loanId: affectedLoanId,
                  bdRemainingBalance: freshLoanData.remaining_balance,
                  event: payload.eventType
                });
              }
              // Para préstamos indefinidos, el cálculo dinámico se hace en otro useEffect
              
              // OPTIMIZADO: La BD ya actualiza next_payment_date automáticamente con triggers
              // No necesitamos recalcular, el refetch traerá el valor correcto
              // El valor se actualizará automáticamente cuando se haga el refetch
            }
            
            // Refetch inmediato para cambios en payments (afectan balances y fechas)
            refetchImmediately();
          }
        }
      )
      .subscribe();
    
    // Guardar referencias a los canales
    channelsRef.current = {
      installments: installmentsChannel,
      loans: loansChannel,
      payments: paymentsChannel
    };
    
    return () => {
      if (refetchTimeoutIdRef.current) {
        clearTimeout(refetchTimeoutIdRef.current);
        refetchTimeoutIdRef.current = null;
      }
      // Los canales se limpian automáticamente cuando se recrean arriba
    };
  }, [loanIds, refetch]); // Solo cuando cambien los IDs de préstamos

  // Función para calcular el interés pendiente total para préstamos indefinidos
  // Ahora también devuelve el número de cuotas pagadas
  const calculatePendingInterestForIndefinite = async (loan: any): Promise<{pendingInterest: number, paidCount: number}> => {
    try {
      // Solo para préstamos indefinidos
      if (loan.amortization_type !== 'indefinite') {
        return { pendingInterest: 0, paidCount: 0 };
      }

      console.log('🔍 calculatePendingInterestForIndefinite: Iniciando cálculo para préstamo indefinido', {
        loanId: loan.id,
        amount: loan.amount,
        interest_rate: loan.interest_rate,
        start_date: loan.start_date,
        next_payment_date: loan.next_payment_date
      });

      if (!loan.start_date) {
        console.warn('🔍 calculatePendingInterestForIndefinite: Falta start_date, no se puede calcular');
        return { pendingInterest: 0, paidCount: 0 };
      }

      // ✅ Nuevo cálculo (INDEFINIDOS): siempre 1 cuota activa (puede estar parcial),
      // y normalizar pagos con due_date inválido (< primera cuota real) hacia la cuota activa real.
      const addPeriodIso = (iso: string, freq: string) => {
        const [yy, mm, dd] = String(iso || '').split('T')[0].split('-').map(Number);
        if (!yy || !mm || !dd) return iso;
        const base = new Date(yy, mm - 1, dd);
        const dt = new Date(base);
        switch (String(freq || 'monthly').toLowerCase()) {
          case 'daily':
            dt.setDate(dt.getDate() + 1);
            break;
          case 'weekly':
            dt.setDate(dt.getDate() + 7);
            break;
          case 'biweekly':
            dt.setDate(dt.getDate() + 14);
            break;
          case 'monthly':
          default:
            dt.setFullYear(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
            break;
        }
        const y = dt.getFullYear();
        const m = String(dt.getMonth() + 1).padStart(2, '0');
        const d = String(dt.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      };

      const freq = String(loan.payment_frequency || 'monthly');
      const startIso = String(loan.start_date).split('T')[0];
      const firstDueFromStart = addPeriodIso(startIso, freq);
      const tol = 0.05;

      const interestPerPayment =
        (Number(loan.monthly_payment || 0) > 0.01)
          ? Number(loan.monthly_payment)
          : (Number(loan.amount || 0) * (Number(loan.interest_rate || 0) / 100));

      const { data: payments } = await supabase
        .from('payments')
        .select('amount, interest_amount, due_date')
        .eq('loan_id', loan.id);

      const paidByDueValid = new Map<string, number>();
      let invalidPaidTotal = 0;
      for (const p of (payments || []) as any[]) {
        const rawDue = p?.due_date ? String(p.due_date).split('T')[0] : null;
        if (!rawDue) continue;
        const interestField = Number(p?.interest_amount || 0) || 0;
        const amt = Number(p?.amount || 0) || 0;
        const paidValue =
          interestField > 0.01
            ? interestField
            : (amt > 0.01 && amt <= (interestPerPayment * 1.25) ? amt : 0);
        if (paidValue <= 0.01) continue;

        if (rawDue < firstDueFromStart) invalidPaidTotal += paidValue;
        else paidByDueValid.set(rawDue, (paidByDueValid.get(rawDue) || 0) + paidValue);
      }

      const fullyPaid: string[] = [];
      let partialDue: string | null = null;
      for (const [due, paid] of paidByDueValid.entries()) {
        if (paid <= 0.01) continue;
        if (paid + tol < interestPerPayment) {
          partialDue = !partialDue || due < partialDue ? due : partialDue;
        } else {
          fullyPaid.push(due);
        }
      }
      const maxFull = fullyPaid.sort((a, b) => a.localeCompare(b)).slice(-1)[0] || null;
      const activeDue = partialDue || (maxFull ? addPeriodIso(maxFull, freq) : firstDueFromStart);

      let paidActive = activeDue ? (paidByDueValid.get(activeDue) || 0) : 0;
      if (activeDue) paidActive += invalidPaidTotal;

      let pendingInterest = Math.max(0, interestPerPayment - paidActive);
      if (pendingInterest <= 0.01 && interestPerPayment > 0.01) pendingInterest = interestPerPayment;

      const paidCount = fullyPaid.length;
      return { pendingInterest: Math.round(pendingInterest * 100) / 100, paidCount };
    } catch (error) {
      console.error('❌ Error calculando interés pendiente para préstamo indefinido:', error);
      return { pendingInterest: 0, paidCount: 0 };
    }
  };

  // Función para calcular la mora actual de un préstamo
  const calculateCurrentLateFee = async (loan: any) => {
    try {
      if (!loan.late_fee_enabled || !loan.late_fee_rate) {
        return 0;
      }

      // Obtener las cuotas del préstamo
      const { data: installments, error } = await supabase
        .from('installments')
        .select('*')
        .eq('loan_id', loan.id)
        .order('installment_number', { ascending: true });

      if (error || !installments) {
        console.error('Error obteniendo cuotas:', error);
        return loan.current_late_fee || 0;
      }

      // Calcular mora actual basándose en las cuotas reales
      const currentDate = getCurrentDateInSantoDomingo();
      let totalCurrentLateFee = 0;

      installments.forEach((installment: any) => {
        // Parsear la fecha de vencimiento como fecha local para evitar problemas de zona horaria
        const [year, month, day] = installment.due_date.split('-').map(Number);
        const dueDate = new Date(year, month - 1, day);
        const daysOverdue = Math.max(0, Math.floor((currentDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
        
        // Solo calcular mora para cuotas vencidas y no pagadas
        if (daysOverdue > 0 && !installment.is_paid) {
          const gracePeriod = loan.grace_period_days || 0;
          const effectiveDaysOverdue = Math.max(0, daysOverdue - gracePeriod);
          
          if (effectiveDaysOverdue > 0) {
            // CORRECCIÓN: Para préstamos indefinidos, usar interest_amount o total_amount
            // ya que principal_amount es 0
            const isIndefinite = loan.amortization_type === 'indefinite';
            const baseAmount = isIndefinite && installment.principal_amount === 0
              ? (installment.interest_amount || installment.total_amount || installment.amount || 0)
              : (installment.principal_amount || installment.total_amount || installment.amount || 0);
            const lateFeeRate = loan.late_fee_rate || 2;
            
            let lateFee = 0;
            switch (loan.late_fee_calculation_type) {
              case 'daily':
                lateFee = (baseAmount * lateFeeRate / 100) * effectiveDaysOverdue;
                break;
              case 'monthly':
                const monthsOverdue = Math.ceil(effectiveDaysOverdue / 30);
                lateFee = (baseAmount * lateFeeRate / 100) * monthsOverdue;
                break;
              case 'compound':
                lateFee = baseAmount * (Math.pow(1 + lateFeeRate / 100, effectiveDaysOverdue) - 1);
                break;
              default:
                lateFee = (baseAmount * lateFeeRate / 100) * effectiveDaysOverdue;
            }
            
            // Aplicar límite máximo de mora si está configurado
            if (loan.max_late_fee && loan.max_late_fee > 0) {
              lateFee = Math.min(lateFee, loan.max_late_fee);
            }
            
            // Restar la mora ya pagada de esta cuota
            const remainingLateFee = Math.max(0, lateFee - installment.late_fee_paid);
            totalCurrentLateFee += remainingLateFee;
          }
        }
      });

      return Math.round(totalCurrentLateFee * 100) / 100;
    } catch (error) {
      console.error('Error calculando mora actual:', error);
      return loan.current_late_fee || 0;
    }
  };

  // Función para actualizar las moras dinámicas
  const updateDynamicLateFees = async () => {
    const newLateFees: {[key: string]: number} = {};
    
    for (const loan of loans) {
      const currentLateFee = await calculateCurrentLateFee(loan);
      newLateFees[loan.id] = currentLateFee;
    }
    
    setDynamicLateFees(newLateFees);
  };

  // Función para actualizar el interés pendiente para préstamos indefinidos
  const updatePendingInterestForIndefinite = async () => {
    console.log('🔍 updatePendingInterestForIndefinite: Iniciando actualización');
    const newPendingInterest: {[key: string]: number} = {};
    const newPaidCounts: {[key: string]: number} = {};
    
    if (!loans || loans.length === 0) {
      console.log('🔍 updatePendingInterestForIndefinite: No hay préstamos');
      return;
    }
    
    const indefiniteLoans = loans.filter(loan => loan.amortization_type === 'indefinite');
    console.log('🔍 updatePendingInterestForIndefinite: Préstamos indefinidos encontrados:', indefiniteLoans.length);
    console.log('🔍 updatePendingInterestForIndefinite: IDs de préstamos indefinidos:', indefiniteLoans.map(l => l.id));
    console.log('🔍 updatePendingInterestForIndefinite: Todos los préstamos con amortization_type:', loans.map(l => ({ id: l.id, amortization_type: l.amortization_type })));
    
    for (const loan of indefiniteLoans) {
      console.log('🔍 updatePendingInterestForIndefinite: Calculando para préstamo', loan.id);
      const result = await calculatePendingInterestForIndefinite(loan);
      newPendingInterest[loan.id] = result.pendingInterest;
      newPaidCounts[loan.id] = result.paidCount;
      console.log('🔍 updatePendingInterestForIndefinite: Resultado para', loan.id, ':', result);
    }
    
    console.log('🔍 updatePendingInterestForIndefinite: Estado actualizado:', newPendingInterest);
    setPendingInterestForIndefinite(newPendingInterest);
    setPaidInstallmentsCountForIndefinite(newPaidCounts);
  };

  // Función para cargar acuerdos de pago activos
  const fetchLoanAgreements = async () => {
    try {
      if (!loans || loans.length === 0) return;
      
      const loanIds = loans.map(loan => loan.id);
      
      const { data: agreements, error } = await supabase
        .from('payment_agreements')
        .select('*')
        .in('loan_id', loanIds)
        .in('status', ['approved', 'active']);
      
      if (error) {
        console.error('Error fetching agreements:', error);
        return;
      }
      
      // Agrupar acuerdos por loan_id
      const agreementsByLoan: {[key: string]: any[]} = {};
      (agreements || []).forEach((agreement: any) => {
        if (!agreementsByLoan[agreement.loan_id]) {
          agreementsByLoan[agreement.loan_id] = [];
        }
        agreementsByLoan[agreement.loan_id].push(agreement);
      });
      
      setLoanAgreements(agreementsByLoan);
    } catch (error) {
      console.error('Error fetching loan agreements:', error);
    }
  };

  // Función para verificar si un préstamo tiene un acuerdo activo dentro de la fecha
  const hasActiveAgreement = (loanId: string): boolean => {
    const agreements = loanAgreements[loanId] || [];
    if (agreements.length === 0) return false;
    
    const currentDate = new Date();
    currentDate.setHours(0, 0, 0, 0);
    
    // Verificar si hay algún acuerdo activo dentro del período
    return agreements.some((agreement: any) => {
      const startDate = new Date(agreement.start_date);
      startDate.setHours(0, 0, 0, 0);
      
      const endDate = agreement.end_date ? new Date(agreement.end_date) : null;
      if (endDate) {
        endDate.setHours(23, 59, 59, 999);
      }
      
      // El acuerdo está activo si:
      // 1. Está aprobado o activo
      // 2. La fecha actual está después o igual a start_date
      // 3. Si hay end_date, la fecha actual está antes o igual a end_date
      const isAfterStart = currentDate >= startDate;
      const isBeforeEnd = !endDate || currentDate <= endDate;
      
      return isAfterStart && isBeforeEnd;
    });
  };

  // OPTIMIZADO: Actualizar moras dinámicas y interés pendiente SOLO cuando sea necesario
  // Usar useMemo para identificar préstamos que realmente necesitan actualización
  const loansSignature = useMemo(() => {
    if (!loans || loans.length === 0) return '';
    // Crear una firma basada en IDs y fechas relevantes (no recalcular si solo cambian otros campos)
    return loans.map(l => `${l.id}-${l.start_date}-${l.next_payment_date}`).join(',');
  }, [loans?.map(l => `${l.id}-${l.start_date}-${l.next_payment_date}`).join(',')]);

  // Memoizar función para evitar recreaciones
  const updateDynamicLateFeesMemo = useCallback(async () => {
    if (!loans || loans.length === 0) return;
    
    const newLateFees: {[key: string]: number} = {};
    
    // Solo calcular para préstamos que tienen mora habilitada
    const loansWithLateFee = loans.filter(loan => loan.late_fee_enabled);
    
    if (loansWithLateFee.length === 0) {
      setDynamicLateFees({});
      return;
    }
    
    // Ejecutar en paralelo pero en background
    const calculations = loansWithLateFee.map(async (loan) => {
      const currentLateFee = await calculateCurrentLateFee(loan);
      return { loanId: loan.id, lateFee: currentLateFee };
    });
    
    const results = await Promise.all(calculations);
    
    results.forEach(({ loanId, lateFee }) => {
      newLateFees[loanId] = lateFee;
    });
    
    setDynamicLateFees(newLateFees);
  }, [loans?.length]);

  const updatePendingInterestForIndefiniteMemo = useCallback(async () => {
    if (!loans || loans.length === 0) {
      setPendingInterestForIndefinite({});
      setPaidInstallmentsCountForIndefinite({});
      return;
    }
    
    const indefiniteLoans = loans.filter(loan => loan.amortization_type === 'indefinite');
    
    if (indefiniteLoans.length === 0) {
      setPendingInterestForIndefinite({});
      setPaidInstallmentsCountForIndefinite({});
      return;
    }
    
    const newPendingInterest: {[key: string]: number} = {};
    const newPaidCounts: {[key: string]: number} = {};
    
    // Ejecutar en paralelo pero en background
    const calculations = indefiniteLoans.map(async (loan) => {
      const result = await calculatePendingInterestForIndefinite(loan);
      return { loanId: loan.id, pendingInterest: result.pendingInterest, paidCount: result.paidCount };
    });
    
    const results = await Promise.all(calculations);
    
    results.forEach(({ loanId, pendingInterest, paidCount }) => {
      newPendingInterest[loanId] = pendingInterest;
      newPaidCounts[loanId] = paidCount;
    });
    
    setPendingInterestForIndefinite(newPendingInterest);
    setPaidInstallmentsCountForIndefinite(newPaidCounts);
  }, [loans?.filter(l => l.amortization_type === 'indefinite').map(l => l.id).join(',')]);

  // Ejecutar actualizaciones en BACKGROUND - no bloquear render inicial
  useEffect(() => {
    if (!loans || loans.length === 0) {
      setDynamicLateFees({});
      setPendingInterestForIndefinite({});
      setPaidInstallmentsCountForIndefinite({});
      return;
    }

    // Ejecutar en background usando requestIdleCallback para no bloquear la UI
    const executeUpdates = () => {
      updateDynamicLateFeesMemo();
      updatePendingInterestForIndefiniteMemo();
      fetchLoanAgreements();
    };

    // Usar requestIdleCallback si está disponible, sino setTimeout con delay
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      requestIdleCallback(executeUpdates, { timeout: 2000 });
    } else {
      // Delay de 500ms para permitir que la UI se renderice primero
      setTimeout(executeUpdates, 500);
    }
  }, [loansSignature, updateDynamicLateFeesMemo, updatePendingInterestForIndefiniteMemo]); // Solo cuando cambie la firma
  
  // Constante para el texto del botón Editar
  const EDIT_BUTTON_TEXT = 'Actualizar';

  // Funciones para navegación del calendario
  const navigateMonth = (direction: 'prev' | 'next') => {
    const newMonth = new Date(currentViewMonth);
    if (direction === 'prev') {
      newMonth.setMonth(newMonth.getMonth() - 1);
    } else {
      newMonth.setMonth(newMonth.getMonth() + 1);
    }
    setCurrentViewMonth(newMonth);
  };

  const navigateMonths = (months: number) => {
    const newMonth = new Date(currentViewMonth);
    newMonth.setMonth(newMonth.getMonth() + months);
    setCurrentViewMonth(newMonth);
  };

  const resetToCurrentMonth = () => {
    setCurrentViewMonth(new Date());
  };

  const goToSpecificMonth = (month: number, year: number) => {
    setCurrentViewMonth(new Date(year, month, 1));
  };

  // Detectar parámetros de URL para crear préstamo desde solicitud
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const createParam = urlParams.get('create');
    
    if (createParam === 'true') {
      const initialData = {
        client_id: urlParams.get('client_id') || undefined,
        amount: urlParams.get('amount') ? Number(urlParams.get('amount')) : undefined,
        purpose: urlParams.get('purpose') || undefined,
        monthly_income: urlParams.get('monthly_income') ? Number(urlParams.get('monthly_income')) : undefined,
        existing_debts: urlParams.get('existing_debts') ? Number(urlParams.get('existing_debts')) : undefined,
        employment_status: urlParams.get('employment_status') || undefined,
        // Campos de préstamo
        interest_rate: urlParams.get('interest_rate') ? Number(urlParams.get('interest_rate')) : undefined,
        term_months: urlParams.get('term_months') ? Number(urlParams.get('term_months')) : undefined,
        loan_type: urlParams.get('loan_type') || undefined,
        amortization_type: urlParams.get('amortization_type') || undefined,
        payment_frequency: urlParams.get('payment_frequency') || undefined,
        first_payment_date: urlParams.get('first_payment_date') || undefined,
        closing_costs: urlParams.get('closing_costs') ? Number(urlParams.get('closing_costs')) : undefined,
        late_fee: urlParams.get('late_fee') === 'true',
        minimum_payment_type: urlParams.get('minimum_payment_type') || undefined,
        minimum_payment_percentage: urlParams.get('minimum_payment_percentage') ? Number(urlParams.get('minimum_payment_percentage')) : undefined,
        guarantor_required: urlParams.get('guarantor_required') === 'true',
        guarantor_name: urlParams.get('guarantor_name') || undefined,
        guarantor_phone: urlParams.get('guarantor_phone') || undefined,
        guarantor_dni: urlParams.get('guarantor_dni') || undefined,
        notes: urlParams.get('notes') || undefined,
        // ID de la solicitud para copiar documentos
        request_id: urlParams.get('request_id') || undefined,
      };
      
      // Solo configurar si hay al menos un parámetro válido
      if (initialData.client_id || initialData.amount) {
        setInitialLoanData(initialData);
        setShowLoanForm(true);
        
        // Limpiar URL para evitar re-aplicación
        window.history.replaceState({}, '', '/prestamos');
      }
    }
  }, []);

  // Detectar parámetros de URL para acciones específicas desde notificaciones
  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const action = urlParams.get('action');
    const loanId = urlParams.get('loanId');
    
    // Si no hay parámetros en la URL, solo marcar que la URL no tiene parámetros
    // NO resetear manuallyClosedRef aquí - mantenerlo para prevenir re-apertura
    if (!action || !loanId) {
      lastUrlHadParamsRef.current = false;
      return;
    }
    
    // VERIFICACIÓN CRÍTICA: Si el usuario cerró manualmente Y el formulario está cerrado, NO procesar
    // Esto previene que se reabra el formulario después de cerrarlo
    if (manuallyClosedRef.current && !showPaymentForm && !showCollectionTracking) {
      // Limpiar URL y no procesar
      window.history.replaceState({}, '', '/prestamos');
      lastUrlHadParamsRef.current = false;
      return;
    }
    
    // Crear una clave única para esta acción y la URL completa
    const actionKey = `${action}-${loanId}`;
    const currentUrl = location.search;
    
    // Detectar si es una nueva navegación: la URL cambió de no tener parámetros a tenerlos
    // Esto ocurre cuando el usuario hace clic en una notificación
    const isNewNavigation = !lastUrlHadParamsRef.current;
    
    // Si es una nueva navegación, resetear el flag de cierre manual para permitir abrir
    if (isNewNavigation) {
      manuallyClosedRef.current = false;
      processedActionRef.current = null; // Resetear también para permitir procesar
    }
    
    // Si es una acción diferente a la procesada anteriormente, resetear también processedActionRef
    // Esto permite abrir desde notificaciones incluso si el usuario cerró un formulario anterior
    if (processedActionRef.current !== actionKey) {
      manuallyClosedRef.current = false; // Resetear también manuallyClosedRef para acción diferente
    }
    
    // Si ya procesamos esta acción exacta Y no es una nueva navegación, no procesar de nuevo
    // (esto previene re-procesar la misma acción cuando la URL no cambió)
    if (processedActionRef.current === actionKey && !isNewNavigation) {
      return;
    }
    
      // Esperar a que los préstamos estén cargados
      if (loading) {
        return; // Esperar a que termine la carga
      }
    
    // Limpiar URL ANTES de procesar la acción para evitar re-ejecuciones
    window.history.replaceState({}, '', '/prestamos');
    
    // Marcar esta acción como procesada, resetear el flag de cierre manual, y guardar la URL
    processedActionRef.current = actionKey;
    manuallyClosedRef.current = false;
    lastProcessedUrlRef.current = currentUrl;
    lastUrlHadParamsRef.current = true; // Marcar que la URL tenía parámetros
      
      // Buscar el préstamo específico
      const targetLoan = loans.find(loan => loan.id === loanId);
      
      if (targetLoan) {
        // Pequeño delay para asegurar que el componente esté listo
        setTimeout(() => {
        if (action === 'payment') {
          // Abrir formulario de pago
          setSelectedLoanForPayment(targetLoan);
          setShowPaymentForm(true);
          toast.success(`Abriendo formulario de pago para ${targetLoan.client?.full_name}`);
        } else if (action === 'tracking') {
          // Abrir formulario de seguimiento
          setSelectedLoanForTracking(targetLoan);
          setShowCollectionTracking(true);
          toast.success(`Abriendo formulario de seguimiento para ${targetLoan.client?.full_name}`);
        }
        }, 100);
      } else if (!loading) {
        // Solo mostrar error si ya terminó de cargar y no encontró el préstamo
        toast.error('Préstamo no encontrado. Puede que haya sido eliminado o no tengas acceso.');
      }
  }, [loans, loading, location.search, showPaymentForm, showCollectionTracking]); // Agregar showPaymentForm y showCollectionTracking a las dependencias

  // Función para actualizar mora de todos los préstamos
  const handleUpdateLateFees = async () => {
    try {
      const updatedCount = await updateAllLateFees();
      if (updatedCount > 0) {
        toast.success(`Mora actualizada para ${updatedCount} préstamos`);
        refetch(); // Recargar los préstamos para mostrar los cambios
      } else {
        toast.info('No hay préstamos que requieran actualización de mora');
      }
    } catch (error) {
      toast.error('Error al actualizar la mora');
    }
  };

  // Cargar solicitudes para el selector
  const fetchRequests = async () => {
    try {
      const { data, error } = await supabase
        .from('loan_requests')
        .select(`
          *,
          clients (
            id,
            full_name,
            dni,
            phone,
            email
          )
        `)
        .eq('status', 'approved')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRequests(data || []);
    } catch (error) {
      console.error('Error fetching requests:', error);
    }
  };

  // Función para seleccionar una solicitud y crear préstamo
  const handleSelectRequestForLoan = (request) => {
    const initialData = {
      client_id: request.client_id,
      amount: request.requested_amount,
      purpose: request.purpose,
      monthly_income: request.monthly_income,
      existing_debts: request.existing_debts,
      employment_status: request.employment_status,
      // Campos de préstamo
      interest_rate: request.interest_rate,
      term_months: request.term_months,
      loan_type: request.loan_type,
      amortization_type: request.amortization_type,
      payment_frequency: request.payment_frequency,
      first_payment_date: request.first_payment_date,
      closing_costs: request.closing_costs,
      late_fee: request.late_fee,
      minimum_payment_type: request.minimum_payment_type,
      minimum_payment_percentage: request.minimum_payment_percentage,
      guarantor_required: request.guarantor_required,
      guarantor_name: request.guarantor_name,
      guarantor_phone: request.guarantor_phone,
      guarantor_dni: request.guarantor_dni,
      notes: request.notes,
    };
    
    setInitialLoanData(initialData);
    setShowRequestSelector(false);
    setShowLoanForm(true);
  };

  // Función para aprobar préstamos pendientes
  const handleApproveLoan = async (loanId: string) => {
    try {
      const { data, error } = await supabase
        .from('loans')
        .update({ status: 'active' })
        .eq('id', loanId);

      if (error) {
        console.error('Error al aprobar préstamo:', error);
        toast.error('Error al aprobar el préstamo');
        return;
      }

      toast.success('Préstamo aprobado exitosamente');
      refetch(); // Actualizar los datos de préstamos
    } catch (error) {
      console.error('Error al aprobar préstamo:', error);
      toast.error('Error al aprobar el préstamo');
    }
  };

  // Función para mostrar diálogo de confirmación de cancelación
  const handleCancelLoanClick = (loan: any) => {
    setLoanToCancel(loan);
    setShowCancelDialog(true);
  };

  // Función para cancelar préstamos pendientes
  const handleCancelLoan = async () => {
    console.log('handleCancelLoan ejecutándose...', loanToCancel);
    if (!loanToCancel || isCancelling) {
      console.log('No hay préstamo para cancelar o ya se está cancelando');
      return;
    }
    
    setIsCancelling(true);
    
    try {
      console.log('Intentando cancelar préstamo:', loanToCancel.id);
      const { data, error } = await supabase
        .from('loans')
        .update({ 
          status: 'deleted',
          deleted_at: new Date().toISOString(),
          deleted_reason: 'Cancelado por administrador'
        })
        .eq('id', loanToCancel.id);

      if (error) {
        console.error('Error al cancelar préstamo:', error);
        toast.error('Error al cancelar el préstamo');
        return;
      }

      console.log('Préstamo cancelado exitosamente');
      toast.success('Préstamo cancelado exitosamente');
      refetch(); // Actualizar los datos de préstamos
      setShowCancelDialog(false);
      setLoanToCancel(null);
    } catch (error) {
      console.error('Error al cancelar préstamo:', error);
      toast.error('Error al cancelar el préstamo');
    } finally {
      setIsCancelling(false);
    }
  };

  // Función para recuperar préstamos eliminados
  const handleRecoverLoan = async (loanId: string) => {
    try {
      const { data, error } = await supabase
        .from('loans')
        .update({ 
          status: 'active',
          deleted_at: null,
          deleted_reason: null
        })
        .eq('id', loanId);

      if (error) {
        console.error('Error al recuperar préstamo:', error);
        toast.error('Error al recuperar el préstamo');
        return;
      }

      toast.success('Préstamo recuperado exitosamente');
      refetch(); // Actualizar los datos de préstamos
    } catch (error) {
      console.error('Error al recuperar préstamo:', error);
      toast.error('Error al recuperar el préstamo');
    }
  };

  console.log('LoansModule - Profile:', profile);
  console.log('LoansModule - CompanyId:', companyId);

     // Función para filtrar préstamos
   const filteredLoans = loans.filter(loan => {
     // Si se está mostrando solo eliminados, filtrar solo por eliminados
     if (showDeleted) {
       return loan.status === 'deleted';
     }
     
     // Por defecto, excluir préstamos eliminados
     if (loan.status === 'deleted') {
       return false;
     }

     // Filtro por término de búsqueda
     const matchesSearch = searchTerm === '' || 
       loan.client?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
       loan.client?.dni?.includes(searchTerm) ||
       loan.id.toLowerCase().includes(searchTerm.toLowerCase());

    // Filtro por estado
    let matchesStatus = false;
    if (statusFilter === 'all') {
      // Mostrar todos excepto completados y cancelados por defecto
      const isCancelled = loan.status === 'deleted' && 
                          (loan.deleted_reason?.toLowerCase().includes('cancelado') || 
                           loan.deleted_reason?.toLowerCase().includes('cancel'));
      matchesStatus = loan.status !== 'paid' && !isCancelled;
    } else if (statusFilter === 'active') {
      // Mostrar solo activos y vencidos (NO pendientes)
      matchesStatus = loan.status === 'active' || loan.status === 'overdue';
    } else if (statusFilter === 'in_agreement') {
      // Mostrar solo préstamos con acuerdo activo dentro de la fecha
      matchesStatus = hasActiveAgreement(loan.id);
    } else if (statusFilter === 'pending') {
      // Mostrar solo pendientes
      matchesStatus = loan.status === 'pending';
    } else if (statusFilter === 'cancelled') {
      // Mostrar préstamos cancelados (deleted con deleted_reason que indique cancelación)
      matchesStatus = loan.status === 'deleted' && 
                      (loan.deleted_reason?.toLowerCase().includes('cancelado') || 
                       loan.deleted_reason?.toLowerCase().includes('cancel'));
    } else {
      // Mostrar el estado específico seleccionado
      matchesStatus = loan.status === statusFilter;
    }

    // Filtro por fecha
    let matchesDate = true;
    if (dateFilter !== 'all') {
      const loanDate = new Date(loan.start_date);
      const today = new Date();
      const diffTime = Math.abs(today.getTime() - loanDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      switch (dateFilter) {
        case 'today':
          matchesDate = diffDays === 0;
          break;
        case 'week':
          matchesDate = diffDays <= 7;
          break;
        case 'month':
          matchesDate = diffDays <= 30;
          break;
        case 'quarter':
          matchesDate = diffDays <= 90;
          break;
      }
    }

    // Filtro por monto
    let matchesAmount = true;
    if (amountFilter !== 'all') {
      switch (amountFilter) {
        case 'low':
          matchesAmount = loan.amount <= 50000;
          break;
        case 'medium':
          matchesAmount = loan.amount > 50000 && loan.amount <= 200000;
          break;
        case 'high':
          matchesAmount = loan.amount > 200000;
          break;
      }
    }

         // Filtro por mora
     const matchesOverdue = !overdueFilter || loan.status === 'overdue';

     return matchesSearch && matchesStatus && matchesDate && matchesAmount && matchesOverdue;
  }).sort((a, b) => {
    // Ordenar por prioridad: pendientes primero, luego por fecha de próximo pago
    const statusPriority = {
      'pending': 0,    // Pendientes primero (requieren aprobación)
      'overdue': 1,    // Vencidos segundo (requieren atención urgente)
      'active': 2,     // Activos tercero
      'paid': 3,       // Completados cuarto
      'deleted': 4     // Eliminados último
    };

    const aPriority = statusPriority[a.status] || 5;
    const bPriority = statusPriority[b.status] || 5;

    // Si tienen la misma prioridad, ordenar por fecha de próximo pago (más cercana primero)
    if (aPriority === bPriority) {
      return new Date(a.next_payment_date).getTime() - new Date(b.next_payment_date).getTime();
    }

    return aPriority - bPriority;
  });

  // Calcular estadísticas basadas en préstamos filtrados (excluyendo eliminados)
  const activeLoans = filteredLoans.filter(loan => loan.status === 'active' && !hasActiveAgreement(loan.id));
  const overdueLoans = filteredLoans.filter(loan => loan.status === 'overdue');
  const pendingLoans = filteredLoans.filter(loan => loan.status === 'pending');
  const inAgreementLoans = filteredLoans.filter(loan => hasActiveAgreement(loan.id));
  const totalAmount = filteredLoans.filter(loan => loan.status !== 'deleted').reduce((sum, loan) => sum + loan.amount, 0);
  const totalBalance = filteredLoans.filter(loan => loan.status !== 'deleted').reduce((sum, loan) => sum + loan.remaining_balance, 0);

  if (showLoanForm) {
    return (
      <LoanForm 
        onBack={() => {
          setShowLoanForm(false);
          setInitialLoanData(null); // Limpiar datos iniciales
        }}
        onLoanCreated={() => {
          setShowLoanForm(false);
          setInitialLoanData(null); // Limpiar datos iniciales
          setStatusFilter('pending'); // Cambiar automáticamente al filtro de pendientes
          refetch(); // Actualizar los datos de préstamos
        }}
        initialData={initialLoanData}
      />
    );
  }

  if (showPaymentForm) {
    return (
      <PaymentForm 
        onBack={() => {
          // Limpiar URL INMEDIATAMENTE para prevenir re-ejecución del useEffect
          window.history.replaceState({}, '', '/prestamos');
          setShowPaymentForm(false);
          setSelectedLoanForPayment(null);
          // Marcar que el usuario cerró el formulario manualmente
          manuallyClosedRef.current = true;
          // Resetear processedActionRef para permitir abrir desde nuevas notificaciones
          processedActionRef.current = null;
          lastUrlHadParamsRef.current = false;
          // Refetch para obtener datos actualizados
          refetch();
        }} 
        preselectedLoan={selectedLoanForPayment}
        onPaymentSuccess={() => {
          // Refetch inmediatamente después de registrar un pago
          // Los datos se actualizarán automáticamente vía Realtime
          setTimeout(() => {
            refetch();
          }, 50); // Pequeño delay para asegurar que el cambio se haya guardado
        }}
      />
    );
  }

  if (showUpdateForm && selectedLoan) {
    return (
      <LoanUpdateForm
        loan={selectedLoan}
        isOpen={showUpdateForm}
        onClose={() => {
          setShowUpdateForm(false);
          setSelectedLoan(null);
          setIsEditMode(false);
        }}
        onUpdate={() => {
          setShowUpdateForm(false);
          setSelectedLoan(null);
          setIsEditMode(false);
          // Refresh loans data
          refetch();
        }}
        editOnly={isEditMode}
      />
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      {/* Header mejorado para móviles */}
      <div className="space-y-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center sm:text-left">Gestión de Préstamos</h1>
        
        {/* Botones principales - diseño móvil optimizado */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 sm:gap-4">
          <Button 
            onClick={() => {
              setSelectedLoanForPayment(null);
              setShowPaymentForm(true);
            }} 
            className="h-12 sm:h-10 text-base sm:text-sm font-medium"
            size="lg"
          >
            <DollarSign className="h-5 w-5 mr-2" />
            Registrar Pago
          </Button>
          <Button 
            onClick={() => setShowLoanForm(true)} 
            className="h-12 sm:h-10 text-base sm:text-sm font-medium"
            size="lg"
          >
            <Plus className="h-5 w-5 mr-2" />
            Nuevo Préstamo
          </Button>
          <Button 
            onClick={() => {
              fetchRequests();
              setShowRequestSelector(true);
            }} 
            className="h-12 sm:h-10 text-base sm:text-sm font-medium"
            variant="outline"
            size="lg"
          >
            <FileText className="h-5 w-5 mr-2" />
            Desde Solicitud
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-1 h-auto">
          <TabsTrigger 
            value="mis-prestamos" 
            className="text-xs sm:text-sm py-3 px-2 sm:px-4 min-h-[48px] flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 touch-manipulation"
          >
            <CreditCard className="h-4 w-4" />
            <span className="hidden xs:inline">Mis</span>
            <span className="xs:hidden">Mis</span>
          </TabsTrigger>
          <TabsTrigger 
            value="nuevo-prestamo" 
            className="text-xs sm:text-sm py-3 px-2 sm:px-4 min-h-[48px] flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 touch-manipulation"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden xs:inline">Nuevo</span>
            <span className="xs:hidden">Nuevo</span>
          </TabsTrigger>
          <TabsTrigger 
            value="buscar" 
            className="text-xs sm:text-sm py-3 px-2 sm:px-4 min-h-[48px] flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 touch-manipulation"
          >
            <Search className="h-4 w-4" />
            <span className="hidden xs:inline">Buscar</span>
            <span className="xs:hidden">Buscar</span>
          </TabsTrigger>
          <TabsTrigger 
            value="pendientes" 
            className="text-xs sm:text-sm py-3 px-2 sm:px-4 min-h-[48px] flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 touch-manipulation"
          >
            <Clock className="h-4 w-4" />
            <span className="hidden xs:inline">Pend.</span>
            <span className="xs:hidden">Pend.</span>
          </TabsTrigger>
          <TabsTrigger 
            value="agenda" 
            className="text-xs sm:text-sm py-3 px-2 sm:px-4 min-h-[48px] flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 touch-manipulation"
          >
            <Calendar className="h-4 w-4" />
            <span className="hidden xs:inline">Agenda</span>
            <span className="xs:hidden">Agenda</span>
          </TabsTrigger>
          <TabsTrigger 
            value="configuracion-mora" 
            className="text-xs sm:text-sm py-3 px-2 sm:px-4 min-h-[48px] flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 touch-manipulation"
          >
            <AlertTriangle className="h-4 w-4" />
            <span className="hidden xs:inline">Mora</span>
            <span className="xs:hidden">Mora</span>
          </TabsTrigger>
          <TabsTrigger 
            value="estado-cuenta" 
            className="text-xs sm:text-sm py-3 px-2 sm:px-4 min-h-[48px] flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 touch-manipulation"
          >
            <FileText className="h-4 w-4" />
            <span className="hidden xs:inline">Estado</span>
            <span className="xs:hidden">Estado</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="mis-prestamos" className="space-y-6">
          {/* Stats Cards - optimizado para móviles */}
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <Card className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-sm sm:text-sm font-medium">Total Préstamos</CardTitle>
                <CreditCard className="h-5 w-5 text-muted-foreground" />
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-2xl sm:text-3xl font-bold">{loans.length}</div>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                  {activeLoans.length} activos
                  {pendingLoans.length > 0 && ` • ${pendingLoans.length} pendientes`}
                </p>
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-sm sm:text-sm font-medium">Préstamos Activos</CardTitle>
                <CheckCircle className="h-5 w-5 text-green-600" />
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-2xl sm:text-3xl font-bold text-green-600">{activeLoans.length + pendingLoans.length}</div>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                  {activeLoans.length} activos
                  {pendingLoans.length > 0 && ` • ${pendingLoans.length} por aprobar`}
                </p>
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-sm sm:text-sm font-medium">Préstamos Vencidos</CardTitle>
                <AlertCircle className="h-5 w-5 text-red-600" />
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-2xl sm:text-3xl font-bold text-red-600">{overdueLoans.length}</div>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1">Requieren atención</p>
              </CardContent>
            </Card>

            <Card className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-sm sm:text-sm font-medium">Capital Prestado</CardTitle>
                <DollarSign className="h-5 w-5 text-muted-foreground" />
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-2xl sm:text-3xl font-bold">${formatCurrencyNumber(totalBalance)}</div>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1">Balance pendiente</p>
              </CardContent>
            </Card>
          </div>

          {/* Filtros y búsqueda */}
          <Card>
            <CardHeader>
              <CardTitle>Filtros de Búsqueda</CardTitle>
            </CardHeader>
                         <CardContent className="space-y-4">
               {/* Filtros */}
              <div className="flex flex-wrap gap-2 sm:gap-4">
                {/* Filtro por Estado */}
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-auto min-w-[140px]">
                    <SelectValue placeholder="Estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos (excepto completados)</SelectItem>
                    <SelectItem value="active">Activos y Vencidos</SelectItem>
                    <SelectItem value="in_agreement">En Acuerdo</SelectItem>
                    <SelectItem value="pending">Pendientes</SelectItem>
                    <SelectItem value="overdue">Solo Vencidos</SelectItem>
                    <SelectItem value="cancelled">Cancelados</SelectItem>
                    <SelectItem value="paid">Completados</SelectItem>
                    <SelectItem value="deleted">Eliminados</SelectItem>
                  </SelectContent>
                </Select>

                {/* Filtro por Fecha */}
                <Select value={dateFilter} onValueChange={setDateFilter}>
                  <SelectTrigger className="w-auto min-w-[140px]">
                    <SelectValue placeholder="Fecha" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las Fechas</SelectItem>
                    <SelectItem value="today">Hoy</SelectItem>
                    <SelectItem value="week">Última Semana</SelectItem>
                    <SelectItem value="month">Último Mes</SelectItem>
                    <SelectItem value="quarter">Último Trimestre</SelectItem>
                  </SelectContent>
                </Select>

                {/* Filtro por Monto */}
                <Select value={amountFilter} onValueChange={setAmountFilter}>
                  <SelectTrigger className="w-auto min-w-[140px]">
                    <SelectValue placeholder="Monto" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los Montos</SelectItem>
                    <SelectItem value="low">Bajo (≤ $50,000)</SelectItem>
                    <SelectItem value="medium">Medio ($50,001 - $200,000)</SelectItem>
                    <SelectItem value="high">Alto (&gt; $200,000)</SelectItem>
                  </SelectContent>
                </Select>

                {/* Filtro por Mora */}
                <Button
                  variant={overdueFilter ? "default" : "outline"}
                  size="sm"
                  onClick={() => setOverdueFilter(!overdueFilter)}
                  className="text-xs sm:text-sm"
                >
                  <AlertCircle className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                  <span className="hidden sm:inline">Solo Vencidos</span>
                  <span className="sm:hidden">Vencidos</span>
                </Button>

                {/* Filtro para Préstamos Eliminados */}
                <Button
                  variant={showDeleted ? "default" : "outline"}
                  size="sm"
                  onClick={() => setShowDeleted(!showDeleted)}
                  className="text-xs sm:text-sm"
                >
                  <Trash2 className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                  <span className="hidden sm:inline">{showDeleted ? 'Ocultar Eliminados' : 'Solo Eliminados'}</span>
                  <span className="sm:hidden">Eliminados</span>
                </Button>

                                 {/* Limpiar Filtros */}
                 {(statusFilter !== 'all' || dateFilter !== 'all' || amountFilter !== 'all' || overdueFilter) && (
                   <Button
                     variant="outline"
                     size="sm"
                     onClick={() => {
                       setStatusFilter('all');
                       setDateFilter('all');
                       setAmountFilter('all');
                       setOverdueFilter(false);
                     }}
                     className="text-xs sm:text-sm"
                   >
                     <X className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                     <span className="hidden sm:inline">Limpiar Filtros</span>
                     <span className="sm:hidden">Limpiar</span>
                </Button>
                 )}
              </div>

                             {/* Resumen de filtros aplicados */}
               {(statusFilter !== 'all' || dateFilter !== 'all' || amountFilter !== 'all' || overdueFilter) && (
                 <div className="text-sm text-gray-600">
                   Mostrando {filteredLoans.length} de {loans.length} préstamos
                   {statusFilter !== 'all' && ` • Estado: ${statusFilter === 'in_agreement' ? 'En Acuerdo' : statusFilter === 'active' ? 'Activos y Vencidos' : statusFilter === 'pending' ? 'Pendientes' : statusFilter === 'overdue' ? 'Vencidos' : statusFilter === 'paid' ? 'Completados' : statusFilter === 'deleted' ? 'Eliminados' : statusFilter === 'cancelled' ? 'Cancelados' : statusFilter}`}
                   {dateFilter !== 'all' && ` • Fecha: ${dateFilter}`}
                   {amountFilter !== 'all' && ` • Monto: ${amountFilter}`}
                   {overdueFilter && ` • Solo vencidos`}
              </div>
               )}
            </CardContent>
          </Card>

          {/* Lista de préstamos */}
          <Card>
            <CardHeader>
              <CardTitle>Lista de Préstamos</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-gray-500">Cargando préstamos...</div>
              ) : filteredLoans.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>{loans.length === 0 ? 'No hay préstamos registrados' : 'No se encontraron préstamos con los filtros aplicados'}</p>
                  {loans.length === 0 ? (
                  <Button className="mt-4" onClick={() => setShowLoanForm(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Crear Primer Préstamo
                  </Button>
                                     ) : (
                     <Button className="mt-4" variant="outline" onClick={() => {
                       setStatusFilter('all');
                       setDateFilter('all');
                       setAmountFilter('all');
                       setOverdueFilter(false);
                     }}>
                       <X className="h-4 w-4 mr-2" />
                       Limpiar Filtros
                     </Button>
                   )}
                </div>
              ) : (
                <div className="space-y-6">
                  {filteredLoans.map((loan) => (
                    <div key={loan.id} className="bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-lg transition-all duration-200 overflow-hidden">
                      {/* Header con gradiente */}
                      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-4 border-b border-gray-100">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
                              {loan.client?.full_name?.charAt(0) || 'C'}
                            </div>
                            <div>
                              <h3 className="font-bold text-xl text-gray-900">
                                {loan.client?.full_name}
                              </h3>
                              <p className="text-sm text-gray-600">DNI: {loan.client?.dni}</p>
                            </div>
                          </div>
                          <span className={`px-4 py-2 rounded-full text-sm font-semibold ${
                            hasActiveAgreement(loan.id) ? 'bg-purple-100 text-purple-800 border border-purple-200' :
                            loan.status === 'active' ? 'bg-green-100 text-green-800 border border-green-200' :
                            loan.status === 'overdue' ? 'bg-red-100 text-red-800 border border-red-200' :
                            loan.status === 'paid' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                            loan.status === 'pending' ? 'bg-yellow-100 text-yellow-800 border border-yellow-200' :
                            loan.status === 'deleted' ? 'bg-gray-100 text-gray-800 border border-gray-200' :
                            'bg-gray-100 text-gray-800 border border-gray-200'
                          }`}>
                            {hasActiveAgreement(loan.id) ? 'En Acuerdo' :
                             loan.status === 'active' ? 'Activo' :
                             loan.status === 'overdue' ? 'Vencido' :
                             loan.status === 'paid' ? 'Pagado' :
                             loan.status === 'pending' ? 'Pendiente' :
                             loan.status === 'deleted' ? 'Eliminado' :
                             loan.status}
                          </span>
                        </div>
                      </div>

                      {/* Contenido principal */}
                      <div className="p-6">
                        {/* Información financiera destacada */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                          <div className="text-center p-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl border border-green-100">
                            <div className="text-2xl font-bold text-green-700 mb-1">
                              ${formatCurrencyNumber(loan.amount)}
                            </div>
                            <div className="text-sm text-green-600 font-medium">Monto Prestado</div>
                          </div>
                          
                          <div className="text-center p-4 bg-gradient-to-br from-red-50 to-rose-50 rounded-xl border border-red-100">
                            <div className="text-2xl font-bold text-red-700 mb-1">
                              {(() => {
                                const amortizationTypeLower = ((loan.amortization_type || '') as string).toLowerCase();
                                const isIndefinite = amortizationTypeLower === 'indefinite';
                                const calculatedBase = calculatedBaseBalances[loan.id];
                                const calculatedTotal = calculatedRemainingBalances[loan.id];
                                const db = loan.remaining_balance;

                                // En préstamos a plazo fijo: NO mostrar BD "stale" mientras hidrata
                                if (!isIndefinite && !balancesHydrated && calculatedBase === undefined) {
                                  return 'Cargando...';
                                }

                                const value = (() => {
                                  if (isIndefinite) {
                                    // ✅ Balance Pendiente debe incluir cargos (totalBalance)
                                    if (calculatedTotal !== undefined) return calculatedTotal;
                                    // Fallback: derivar con interés pendiente (sin cargos) si aún no está calculado
                                    return (loan.amount || 0) + (pendingInterestForIndefinite[loan.id] || 0);
                                  }

                                  // ✅ Plazo fijo: incluir cargos en Balance Pendiente (totalBalance)
                                  if (calculatedTotal !== undefined) return calculatedTotal;
                                  // Último fallback
                                  if (db !== null && db !== undefined) return Number(db);
                                  return loan.amount || 0;
                                })();

                                return `$${formatCurrencyNumber(value)}`;
                              })()}
                            </div>
                            <div className="text-sm text-red-600 font-medium">Balance Pendiente</div>
                            {((loan.amortization_type || '').toLowerCase() === 'indefinite') && (pendingInterestForIndefinite[loan.id] || 0) > 0 && (
                              <div className="text-xs text-red-500 mt-1">
                                Balance + Interés Pendiente
                              </div>
                            )}
                          </div>

                          <div className="text-center p-4 bg-gradient-to-br from-purple-50 to-violet-50 rounded-xl border border-purple-100">
                            <div className="text-2xl font-bold text-purple-700 mb-1">
                              {(() => {
                                if (loan.status === 'paid') return `$${formatCurrencyNumber(0)}`;

                                const amortizationTypeLower = ((loan.amortization_type || '') as string).toLowerCase();
                                const isIndefinite = amortizationTypeLower === 'indefinite';
                                const calculatedBase = calculatedBaseBalances[loan.id];
                                const calculatedTotal = calculatedRemainingBalances[loan.id];
                                const db = loan.remaining_balance;

                                // En préstamos a plazo fijo: NO mostrar BD "stale" mientras hidrata
                                if (!isIndefinite && !balancesHydrated && calculatedBase === undefined) {
                                  return 'Cargando...';
                                }

                                const base = (() => {
                                  // ✅ Balance Total Pendiente = Balance Pendiente (incluye cargos) + Mora
                                  // Usamos totalBalance como base para evitar perder cargos.
                                  if (calculatedTotal !== undefined) return calculatedTotal;

                                  if (db !== null && db !== undefined) return Number(db);
                                  return loan.amount || 0;
                                })();

                                const total = Math.round((Number(base) + (dynamicLateFees[loan.id] || loan.current_late_fee || 0)) * 100) / 100;
                                return `$${formatCurrencyNumber(total)}`;
                              })()}
                            </div>
                            <div className="text-sm text-purple-600 font-medium">Balance Total Pendiente</div>
                            {loan.status !== 'paid' && (
                              <div className="text-xs text-purple-500 mt-1">
                                {((loan.amortization_type || '').toLowerCase() === 'indefinite')
                                  ? 'Balance + Interés + Mora'
                                  : 'Balance + Mora Actual'}
                              </div>
                            )}
                          </div>
                          
                          <div className="text-center p-4 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl border border-blue-100">
                            <div className="text-2xl font-bold text-blue-700 mb-1">
                              ${formatCurrencyNumber(Math.round(loan.monthly_payment))}
                            </div>
                            <div className="text-sm text-blue-600 font-medium">Cuota Mensual</div>
                          </div>
                        </div>

                        {/* Información adicional en grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                          {(loan.status === 'paid' || loan.remaining_balance === 0 || !loan.next_payment_date) ? (
                            <div className="text-center p-3 bg-gray-50 rounded-lg">
                              <div className="text-lg font-bold text-gray-800 mb-1">
                                -
                              </div>
                              <div className="text-xs text-gray-600">Próximo Pago</div>
                            </div>
                          ) : (
                            <div className="text-center p-3 bg-gray-50 rounded-lg">
                              <div className="text-lg font-bold text-gray-800 mb-1">
                                {formatNextPaymentDate(loan)}
                              </div>
                              <div className="text-xs text-gray-600">Próximo Pago</div>
                            </div>
                          )}
                          
                          <div className="text-center p-3 bg-gray-50 rounded-lg">
                            <div className="text-lg font-bold text-gray-800 mb-1">
                              {(loan as any).amortization_type === 'indefinite' ? 'Indefinido' : loan.term_months}
                            </div>
                            <div className="text-xs text-gray-600">
                              {(loan as any).amortization_type === 'indefinite' ? '' : 'Cuotas'}
                            </div>
                          </div>
                          
                          <div className="text-center p-3 bg-gray-50 rounded-lg">
                            <div className="text-lg font-bold text-gray-800 mb-1">
                              {loan.interest_rate}%
                            </div>
                            <div className="text-xs text-gray-600">Tasa</div>
                          </div>
                          
                          <div className="text-center p-3 bg-gray-50 rounded-lg">
                            <div className="text-lg font-bold text-gray-800 mb-1 capitalize">
                              {loan.loan_type}
                            </div>
                            <div className="text-xs text-gray-600">Tipo</div>
                          </div>
                        </div>

                        {/* Información de mora - Solo mostrar si el préstamo no está saldado */}
                        {loan.status !== 'paid' && (
                          <LateFeeInfo
                            loanId={loan.id}
                            nextPaymentDate={nextPaymentDates[loan.id] || loan.next_payment_date?.split('T')[0] || ''}
                            currentLateFee={loan.current_late_fee || 0}
                            lateFeeEnabled={loan.late_fee_enabled || false}
                            lateFeeRate={loan.late_fee_rate || 2.0}
                            gracePeriodDays={loan.grace_period_days || 0}
                            maxLateFee={loan.max_late_fee || 0}
                            lateFeeCalculationType={loan.late_fee_calculation_type || 'daily'}
                            remainingBalance={loan.remaining_balance}
                            clientName={loan.client?.full_name || 'Cliente'}
                            amount={loan.amount}
                            term={loan.term_months}
                            payment_frequency={loan.payment_frequency || 'monthly'}
                            interest_rate={loan.interest_rate}
                            monthly_payment={loan.monthly_payment}
                            paid_installments={loan.paid_installments || []} // Usar cuotas pagadas de la base de datos
                            start_date={loan.start_date} // CRÍTICO: Fecha de inicio del préstamo
                            amortization_type={(loan as any).amortization_type}
                          />
                        )}

                        {/* Botones de acción mejorados */}
                        <div className="border-t border-gray-100 pt-6">
                          {loan.status === 'pending' ? (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <Button
                                variant="default"
                                size="lg"
                                onClick={() => handleApproveLoan(loan.id)}
                                className="h-12 text-base font-semibold bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 shadow-lg hover:shadow-xl transition-all duration-200"
                              >
                                <CheckCircle className="h-5 w-5 mr-2" />
                                Aprobar Préstamo
                              </Button>
                              <Button
                                variant="outline"
                                size="lg"
                                onClick={() => {
                                  setSelectedLoan(loan);
                                  setIsEditMode(true);
                                  setShowUpdateForm(true);
                                }}
                                className="h-12 text-base font-semibold border-2 border-blue-200 text-blue-700 hover:bg-blue-50 hover:border-blue-300 transition-all duration-200"
                              >
                                <Edit className="h-5 w-5 mr-2" />
                                Editar
                              </Button>
                              <Button
                                variant="destructive"
                                size="lg"
                                onClick={() => handleCancelLoanClick(loan)}
                                className="h-12 text-base font-semibold bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 shadow-lg hover:shadow-xl transition-all duration-200"
                              >
                                <X className="h-5 w-5 mr-2" />
                                Cancelar
                              </Button>
                            </div>
                          ) : loan.status === 'deleted' ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                              <Button
                                variant="default"
                                size="lg"
                                onClick={() => handleRecoverLoan(loan.id)}
                                className="h-12 text-base font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg hover:shadow-xl transition-all duration-200"
                              >
                                <RotateCcw className="h-5 w-5 mr-2" />
                                Recuperar Préstamo
                              </Button>
                              <Button
                                variant="outline"
                                size="lg"
                                onClick={() => {
                                  setSelectedLoan(loan);
                                  setIsEditMode(false);
                                  setShowUpdateForm(true);
                                }}
                                className="h-12 text-base font-semibold border-2 border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all duration-200"
                              >
                                <Eye className="h-5 w-5 mr-2" />
                                Ver Préstamo
                              </Button>
                            </div>
                          ) : (
                            <div className="flex flex-wrap justify-center gap-3">
                              <Button
                                variant="default"
                                size="lg"
                                onClick={() => {
                                  setSelectedLoanForPayment(loan);
                                  setShowPaymentForm(true);
                                }}
                                disabled={loan.status === 'paid'}
                                className="h-12 text-base font-semibold bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:from-gray-400 disabled:to-gray-500 shadow-lg hover:shadow-xl transition-all duration-200"
                              >
                                <Receipt className="h-5 w-5 mr-2" />
                                Registrar Pago
                              </Button>
                              <Button
                                variant="outline"
                                size="lg"
                                onClick={() => {
                                  setSelectedLoanForTracking(loan);
                                  setShowCollectionTracking(true);
                                }}
                                className="h-12 text-base font-semibold border-2 border-blue-200 text-blue-700 hover:bg-blue-50 hover:border-blue-300 transition-all duration-200"
                              >
                                <Phone className="h-5 w-5 mr-2" />
                                Seguimiento
                              </Button>
                              <Button
                                variant="outline"
                                size="lg"
                                onClick={() => {
                                  setSelectedLoan(loan);
                                  setIsEditMode(loan.status === 'pending');
                                  setShowUpdateForm(true);
                                }}
                                disabled={loan.status === 'paid'}
                                className="h-12 text-base font-semibold border-2 border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300 disabled:opacity-50 transition-all duration-200"
                              >
                                <Edit className="h-5 w-5 mr-2" />
                                <span>{EDIT_BUTTON_TEXT}</span>
                              </Button>
                              <Button
                                variant="outline"
                                size="lg"
                                onClick={() => {
                                  setSelectedLoan(loan);
                                  setShowDetailsView(true);
                                }}
                                className="h-12 text-base font-semibold border-2 border-blue-200 text-blue-700 hover:bg-blue-50 hover:border-blue-300 transition-all duration-200"
                              >
                                <Eye className="h-5 w-5 mr-2" />
                                Detalles
                              </Button>
                              <Button
                                variant="outline"
                                size="lg"
                                onClick={() => {
                                  setSelectedLoan(loan);
                                  setShowHistoryView(true);
                                }}
                                className="h-12 text-base font-semibold border-2 border-purple-200 text-purple-700 hover:bg-purple-50 hover:border-purple-300 transition-all duration-200"
                              >
                                <History className="h-5 w-5 mr-2" />
                                Historial
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="nuevo-prestamo" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Crear Nuevo Préstamo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <Plus className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                <h3 className="text-lg font-medium mb-2">Formulario de Nuevo Préstamo</h3>
                <p className="text-gray-600 mb-4">Completa la información para crear un nuevo préstamo</p>
                <Button onClick={() => setShowLoanForm(true)}>Comenzar</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="buscar" className="space-y-6">
           {/* Campo de búsqueda principal */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center text-lg">
                <Search className="h-5 w-5 mr-2" />
                 Búsqueda de Préstamos
              </CardTitle>
            </CardHeader>
             <CardContent className="space-y-4">
               <div className="relative">
                 <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                 <Input
                   placeholder="Buscar por nombre del cliente, DNI, ID de préstamo..."
                   value={searchTerm}
                   onChange={(e) => setSearchTerm(e.target.value)}
                   className="pl-12 h-12 text-base"
                 />
                 {searchTerm && (
                   <Button
                     variant="ghost"
                     size="sm"
                     onClick={() => setSearchTerm('')}
                     className="absolute right-2 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0"
                   >
                     <X className="h-4 w-4" />
                   </Button>
                 )}
               </div>
               
               {/* Filtros avanzados - optimizado para móviles */}
               <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
                 <Select value={statusFilter} onValueChange={setStatusFilter}>
                   <SelectTrigger className="h-12 text-base">
                     <SelectValue placeholder="Estado del préstamo" />
                   </SelectTrigger>
                   <SelectContent>
                     <SelectItem value="all">Todos (excepto completados)</SelectItem>
                     <SelectItem value="active">Activos y Vencidos</SelectItem>
                     <SelectItem value="in_agreement">En Acuerdo</SelectItem>
                     <SelectItem value="pending">Pendientes</SelectItem>
                     <SelectItem value="overdue">Solo Vencidos</SelectItem>
                     <SelectItem value="paid">Completados</SelectItem>
                     <SelectItem value="deleted">Eliminados</SelectItem>
                   </SelectContent>
                 </Select>

                 <Select value={dateFilter} onValueChange={setDateFilter}>
                   <SelectTrigger className="h-12 text-base">
                     <SelectValue placeholder="Fecha de inicio" />
                   </SelectTrigger>
                   <SelectContent>
                     <SelectItem value="all">Todas las Fechas</SelectItem>
                     <SelectItem value="today">Hoy</SelectItem>
                     <SelectItem value="week">Última Semana</SelectItem>
                     <SelectItem value="month">Último Mes</SelectItem>
                     <SelectItem value="quarter">Último Trimestre</SelectItem>
                   </SelectContent>
                 </Select>

                 <Select value={amountFilter} onValueChange={setAmountFilter}>
                   <SelectTrigger className="h-12 text-base">
                     <SelectValue placeholder="Rango de monto" />
                   </SelectTrigger>
                   <SelectContent>
                     <SelectItem value="all">Todos los Montos</SelectItem>
                     <SelectItem value="low">Bajo (≤ $50,000)</SelectItem>
                     <SelectItem value="medium">Medio ($50,001 - $200,000)</SelectItem>
                     <SelectItem value="high">Alto (&gt; $200,000)</SelectItem>
                   </SelectContent>
                 </Select>

                 <Button
                   variant={overdueFilter ? "default" : "outline"}
                   onClick={() => setOverdueFilter(!overdueFilter)}
                   className="w-full h-12 text-base font-medium"
                 >
                   <AlertCircle className="h-5 w-5 mr-2" />
                   Solo Vencidos
                 </Button>

                 <Button
                   variant={showDeleted ? "default" : "outline"}
                   onClick={() => setShowDeleted(!showDeleted)}
                   className="w-full h-12 text-base font-medium"
                 >
                   <Trash2 className="h-5 w-5 mr-2" />
                   {showDeleted ? 'Ocultar Eliminados' : 'Solo Eliminados'}
                 </Button>
               </div>

               {/* Botón limpiar filtros */}
               {(searchTerm || statusFilter !== 'all' || dateFilter !== 'all' || amountFilter !== 'all' || overdueFilter || showDeleted) && (
                 <div className="flex justify-center pt-2">
                   <Button
                     variant="outline"
                     onClick={() => {
                       setSearchTerm('');
                       setStatusFilter('all');
                       setDateFilter('all');
                       setAmountFilter('all');
                       setOverdueFilter(false);
                       setShowDeleted(false);
                     }}
                     className="h-12 px-6 text-base font-medium"
                   >
                     <X className="h-5 w-5 mr-2" />
                     Limpiar Filtros
                   </Button>
                 </div>
               )}
             </CardContent>
           </Card>

           {/* Resultados de búsqueda */}
           <Card>
             <CardHeader>
               <CardTitle>Resultados de Búsqueda</CardTitle>
               {(searchTerm || statusFilter !== 'all' || dateFilter !== 'all' || amountFilter !== 'all' || overdueFilter || showDeleted) && (
                 <div className="text-sm text-gray-600">
                   Mostrando {filteredLoans.length} de {loans.length} préstamos
                   {searchTerm && ` • Búsqueda: "${searchTerm}"`}
                   {statusFilter !== 'all' && ` • Estado: ${statusFilter === 'in_agreement' ? 'En Acuerdo' : statusFilter === 'active' ? 'Activos y Vencidos' : statusFilter === 'pending' ? 'Pendientes' : statusFilter === 'overdue' ? 'Vencidos' : statusFilter === 'paid' ? 'Completados' : statusFilter === 'deleted' ? 'Eliminados' : statusFilter === 'cancelled' ? 'Cancelados' : statusFilter}`}
                   {dateFilter !== 'all' && ` • Fecha: ${dateFilter}`}
                   {amountFilter !== 'all' && ` • Monto: ${amountFilter}`}
                   {overdueFilter && ` • Solo vencidos`}
                   {showDeleted && ` • Mostrando eliminados`}
                 </div>
               )}
            </CardHeader>
            <CardContent>
               {loading ? (
                 <div className="text-center py-8 text-gray-500">Cargando préstamos...</div>
               ) : filteredLoans.length === 0 ? (
                 <div className="text-center py-8 text-gray-500">
                   <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                   <p>{loans.length === 0 ? 'No hay préstamos registrados' : 'No se encontraron préstamos con los criterios de búsqueda'}</p>
                   {loans.length === 0 ? (
                     <Button className="mt-4" onClick={() => setShowLoanForm(true)}>
                       <Plus className="h-4 w-4 mr-2" />
                       Crear Primer Préstamo
                     </Button>
                   ) : (
                     <Button className="mt-4" variant="outline" onClick={() => {
                       setSearchTerm('');
                       setStatusFilter('all');
                       setDateFilter('all');
                       setAmountFilter('all');
                       setOverdueFilter(false);
                       setShowDeleted(false);
                     }}>
                       <X className="h-4 w-4 mr-2" />
                       Limpiar Búsqueda
                     </Button>
                   )}
              </div>
               ) : (
                 <div className="space-y-4">
                   {filteredLoans.map((loan) => (
                     <div key={loan.id} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                       <div className="flex items-center justify-between">
                         <div className="flex-1">
                           <div className="flex items-center gap-3 mb-2">
                             <h3 className="font-semibold text-lg">
                               {loan.client?.full_name} - {loan.client?.dni}
                             </h3>
                             <span className={`px-2 py-1 rounded text-xs font-medium ${
                               hasActiveAgreement(loan.id) ? 'bg-purple-100 text-purple-800' :
                               loan.status === 'active' ? 'bg-green-100 text-green-800' :
                               loan.status === 'overdue' ? 'bg-red-100 text-red-800' :
                               loan.status === 'paid' ? 'bg-blue-100 text-blue-800' :
                               loan.status === 'pending' ? 'bg-blue-100 text-blue-800' :
                               loan.status === 'deleted' ? 'bg-gray-100 text-gray-800' :
                               'bg-gray-100 text-gray-800'
                             }`}>
                               {hasActiveAgreement(loan.id) ? 'En Acuerdo' :
                                loan.status === 'active' ? 'Activo' :
                                loan.status === 'overdue' ? 'Vencido' :
                                loan.status === 'paid' ? 'Pagado' :
                                loan.status === 'pending' ? 'Pendiente' :
                                loan.status === 'deleted' ? 'Eliminado' :
                                loan.status}
                             </span>
                           </div>
                           
                           <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4 text-sm text-gray-600">
                             <div className="flex flex-col sm:flex-row sm:items-center">
                               <span className="font-medium text-xs sm:text-sm">Monto:</span> 
                               <span className="text-xs sm:text-sm">${formatCurrencyNumber(loan.amount)}</span>
                             </div>
                             <div className="flex flex-col sm:flex-row sm:items-center">
                               <span className="font-medium text-xs sm:text-sm">Balance:</span> 
                               <span className="text-xs sm:text-sm">${formatCurrencyNumber(
                                 // CORRECCIÓN: Priorizar valor de BD si está disponible (es más confiable que el cálculo dinámico)
                                 (loan.remaining_balance !== null && loan.remaining_balance !== undefined)
                                   ? loan.remaining_balance
                                   : (calculatedRemainingBalances[loan.id] !== undefined
                                       ? calculatedRemainingBalances[loan.id]
                                       : loan.amount || 0)
                               )}</span>
                             </div>
                             <div className="flex flex-col sm:flex-row sm:items-center">
                               <span className="font-medium text-xs sm:text-sm">Cuota:</span> 
                               <span className="text-xs sm:text-sm">${formatCurrencyNumber(loan.monthly_payment)}</span>
                             </div>
                             <div className="flex flex-col sm:flex-row sm:items-center">
                               <span className="font-medium text-xs sm:text-sm">Próximo Pago:</span> 
                               <span className="text-xs sm:text-sm">
                                 {(loan.status === 'paid' || loan.remaining_balance === 0 || !loan.next_payment_date) 
                                   ? 'N/A' 
                                   : formatNextPaymentDate(loan)}
                               </span>
                             </div>
                             <div className="flex flex-col sm:flex-row sm:items-center">
                               <span className="font-medium text-xs sm:text-sm">Plazo:</span> 
                               <span className="text-xs sm:text-sm">
                                 {(loan as any).amortization_type === 'indefinite' ? 'Indefinido' : `${loan.term_months} meses`}
                               </span>
                             </div>
                             <div className="flex flex-col sm:flex-row sm:items-center">
                               <span className="font-medium text-xs sm:text-sm">Tasa:</span> 
                               <span className="text-xs sm:text-sm">{loan.interest_rate}%</span>
                             </div>
                             <div className="flex flex-col sm:flex-row sm:items-center">
                               <span className="font-medium text-xs sm:text-sm">Tipo:</span> 
                               <span className="text-xs sm:text-sm">{loan.loan_type}</span>
                             </div>
                             <div className="flex flex-col sm:flex-row sm:items-center">
                               <span className="font-medium text-xs sm:text-sm">Inicio:</span> 
                               <span className="text-xs sm:text-sm">{new Date(loan.start_date).toLocaleDateString()}</span>
                             </div>
                           </div>
                         </div>

                         <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 mt-2 sm:mt-0">
                           {loan.status === 'pending' ? (
                             <div className="flex flex-col sm:flex-row gap-1 sm:gap-2 w-full sm:w-auto">
                               <Button
                                 variant="default"
                                 size="sm"
                                 onClick={() => handleApproveLoan(loan.id)}
                                 className="w-full sm:w-auto text-xs bg-green-600 hover:bg-green-700"
                               >
                                 <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-0" />
                                 <span className="sm:hidden">Aprobar</span>
                                 <span className="hidden sm:inline">Aprobar</span>
                               </Button>
                               <Button
                                 variant="destructive"
                                 size="sm"
                                 onClick={() => handleCancelLoanClick(loan)}
                                 className="w-full sm:w-auto text-xs"
                               >
                                 <X className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-0" />
                                 <span className="sm:hidden">Cancelar</span>
                                 <span className="hidden sm:inline">Cancelar</span>
                               </Button>
                             </div>
                           ) : loan.status === 'deleted' ? (
                             <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                               <Button
                                 variant="default"
                                 size="sm"
                                 onClick={() => handleRecoverLoan(loan.id)}
                                 className="w-full sm:w-auto text-xs bg-blue-600 hover:bg-blue-700"
                               >
                                 <RotateCcw className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-0" />
                                 <span className="sm:hidden">Recuperar</span>
                                 <span className="hidden sm:inline">Recuperar Préstamo</span>
                               </Button>
                               <Button
                                 variant="outline"
                                 size="sm"
                                 onClick={() => {
                                   setSelectedLoan(loan);
                                   setIsEditMode(false);
                                   setShowUpdateForm(true);
                                 }}
                                 className="w-full sm:w-auto text-xs"
                               >
                                 <Eye className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-0" />
                                 <span className="sm:hidden">Ver</span>
                                 <span className="hidden sm:inline">Ver Préstamo</span>
                               </Button>
                             </div>
                           ) : (
                             <>
                               <Button
                                 variant="outline"
                                 size="sm"
                                 onClick={() => {
                                   setSelectedLoanForPayment(loan);
                                   setShowPaymentForm(true);
                                 }}
                                 disabled={loan.status === 'paid'}
                                 className="w-full sm:w-auto text-xs"
                               >
                                 <Receipt className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-0" />
                                 <span className="sm:hidden">Pagar</span>
                               </Button>
                               <Button
                                 variant="outline"
                                 size="sm"
                                 onClick={() => {
                                   setSelectedLoan(loan);
                                   setIsEditMode(loan.status === 'pending');
                                   setShowUpdateForm(true);
                                 }}
                                 disabled={loan.status === 'paid'}
                                 className="w-full sm:w-auto text-xs"
                               >
                                 <Edit className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-0" />
                                 <span className="sm:hidden">{EDIT_BUTTON_TEXT}</span>
                               </Button>
                                                             <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedLoan(loan);
                                  setShowHistoryView(true);
                                }}
                                className="w-full sm:w-auto text-xs"
                              >
                                <History className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-0" />
                                <span className="sm:hidden">Historial</span>
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setSelectedLoan(loan);
                                  setShowStatistics(true);
                                }}
                                className="w-full sm:w-auto text-xs"
                              >
                                <BarChart3 className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-0" />
                                <span className="sm:hidden">Stats</span>
                              </Button>
                            </>
                          )}
                         </div>
                       </div>
                     </div>
                   ))}
              </div>
               )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pendientes" className="space-y-6">
           {/* Stats Cards para Pendientes */}
           <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6">
             <Card>
               <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                 <CardTitle className="text-sm font-medium">Total Pendientes</CardTitle>
                 <Clock className="h-4 w-4 text-orange-600" />
               </CardHeader>
               <CardContent>
                 <div className="text-2xl font-bold text-orange-600">{loans.filter(loan => {
                   // Excluir préstamos cancelados o pagados
                   if (loan.status === 'cancelled' || loan.status === 'paid') {
                     return false;
                   }
                   const nextPayment = new Date(loan.next_payment_date + 'T00:00:00');
                   const today = getCurrentDateInSantoDomingo();
                   const diffDays = Math.ceil((nextPayment.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                   return loan.status === 'pending' || 
                          loan.status === 'overdue' || 
                          nextPayment <= today ||
                          (loan.status === 'active' && diffDays <= 7 && diffDays >= 0);
                 }).length}</div>
                 <p className="text-xs text-muted-foreground">Requieren atención</p>
               </CardContent>
             </Card>

             <Card>
               <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                 <CardTitle className="text-sm font-medium">Vencidos</CardTitle>
                 <AlertCircle className="h-4 w-4 text-red-600" />
               </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">{loans.filter(loan => 
                    loan.status === 'overdue'
                  ).length}</div>
                  <p className="text-xs text-muted-foreground">Pagos atrasados</p>
                </CardContent>
             </Card>

             <Card>
               <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                 <CardTitle className="text-sm font-medium">Próximos a Vencer</CardTitle>
                 <Calendar className="h-4 w-4 text-yellow-600" />
               </CardHeader>
               <CardContent>
                  <div className="text-2xl font-bold text-yellow-600">{loans.filter(loan => {
                    // Excluir préstamos eliminados o pagados
                    if (loan.status === 'deleted' || loan.status === 'paid') {
                      return false;
                    }
                   const nextPayment = new Date(loan.next_payment_date + 'T00:00:00');
                   const today = getCurrentDateInSantoDomingo();
                   const diffDays = Math.ceil((nextPayment.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                   return loan.status === 'active' && diffDays <= 7 && diffDays > 0;
                 }).length}</div>
                 <p className="text-xs text-muted-foreground">En los próximos 7 días</p>
               </CardContent>
             </Card>

             <Card>
               <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                 <CardTitle className="text-sm font-medium">Monto Pendiente</CardTitle>
                 <DollarSign className="h-4 w-4 text-muted-foreground" />
               </CardHeader>
               <CardContent>
                 <div className="text-2xl font-bold">${formatCurrencyNumber(loans.filter(loan => {
                   // Excluir préstamos cancelados o pagados
                   if (loan.status === 'cancelled' || loan.status === 'paid') {
                     return false;
                   }
                   const nextPayment = new Date(loan.next_payment_date);
                   const today = new Date();
                   const diffDays = Math.ceil((nextPayment.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                   return loan.status === 'pending' || 
                          loan.status === 'overdue' || 
                          nextPayment <= today ||
                          (loan.status === 'active' && diffDays <= 7 && diffDays >= 0);
                 }).reduce((sum, loan) => sum + loan.remaining_balance, 0))}</div>
                 <p className="text-xs text-muted-foreground">Capital por cobrar</p>
               </CardContent>
             </Card>
           </div>

           {/* Lista de Préstamos Pendientes */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Clock className="h-5 w-5 mr-2" />
                 Préstamos Pendientes de Pago
              </CardTitle>
            </CardHeader>
            <CardContent>
               {loading ? (
                 <div className="text-center py-8 text-gray-500">Cargando préstamos pendientes...</div>
               ) : (() => {
                 const pendingLoans = loans.filter(loan => {
                   // Excluir préstamos eliminados, cancelados o pagados completamente
                   if (loan.status === 'deleted' || loan.status === 'cancelled' || loan.status === 'paid') {
                     return false;
                   }
                   
                   const nextPayment = new Date(loan.next_payment_date + 'T00:00:00');
                   const today = getCurrentDateInSantoDomingo();
                   const diffDays = Math.ceil((nextPayment.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                   
                   // Incluir préstamos que:
                   // 1. Tienen estado 'pending' (pendientes)
                   // 2. Tienen estado 'overdue' (vencidos)
                   // 3. La fecha de pago ya pasó
                   // 4. Están activos y vencen en los próximos 7 días
                   return loan.status === 'pending' || 
                          loan.status === 'overdue' || 
                          nextPayment <= today ||
                          (loan.status === 'active' && diffDays <= 7 && diffDays >= 0);
                 });

                 if (pendingLoans.length === 0) {
                   return (
                     <div className="text-center py-8 text-gray-500">
                       <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                       <h3 className="text-lg font-medium mb-2">¡Excelente!</h3>
                       <p className="text-gray-600">No hay préstamos pendientes de pago</p>
              </div>
                   );
                 }

                 return (
                   <div className="space-y-4">
                     {pendingLoans.map((loan) => {
                                               const nextPayment = new Date(loan.next_payment_date + 'T00:00:00');
                        const today = getCurrentDateInSantoDomingo();
                        const diffDays = Math.ceil((nextPayment.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                        const isPending = loan.status === 'pending';
                        const isOverdue = loan.status === 'overdue' || nextPayment < today;
                        const isDueToday = diffDays === 0;
                        const isDueSoon = diffDays > 0 && diffDays <= 7;

                       return (
                                                   <div key={loan.id} className={`border rounded-lg p-4 ${isPending ? 'border-blue-200 bg-blue-50' : isOverdue ? 'border-red-200 bg-red-50' : isDueToday ? 'border-yellow-200 bg-yellow-50' : 'border-orange-200 bg-orange-50'}`}>
                           <div className="flex items-center justify-between">
                             <div className="flex-1">
                               <div className="flex items-center gap-3 mb-2">
                                 <h3 className="font-semibold text-lg">
                                   {loan.client?.full_name} - {loan.client?.dni}
                                 </h3>
                                                                   <span className={`px-2 py-1 rounded text-xs font-medium ${
                                    isPending ? 'bg-blue-100 text-blue-800' :
                                    isOverdue ? 'bg-red-100 text-red-800' :
                                    isDueToday ? 'bg-yellow-100 text-yellow-800' :
                                    'bg-orange-100 text-orange-800'
                                  }`}>
                                    {isPending ? 'Pendiente' : isOverdue ? 'Vencido' : isDueToday ? 'Vence Hoy' : 'Próximo a Vencer'}
                                  </span>
                                 {isOverdue && (
                                   <span className="text-xs text-red-600 font-medium">
                                     {Math.abs(diffDays)} día{diffDays !== 1 ? 's' : ''} de retraso
                                   </span>
                                 )}
                                                                   {isPending && (
                                    <span className="text-xs text-blue-600 font-medium">
                                      Préstamo pendiente de aprobación
                                    </span>
                                  )}
                                  {isDueSoon && !isDueToday && (
                                    <span className="text-xs text-orange-600 font-medium">
                                      Vence en {diffDays} día{diffDays !== 1 ? 's' : ''}
                                    </span>
                                  )}
                               </div>
                               
                               <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2 sm:gap-4 text-sm text-gray-600">
                                 <div className="flex flex-col sm:flex-row sm:items-center">
                                   <span className="font-medium text-xs sm:text-sm">Balance Total:</span> 
                                   <span className="text-xs sm:text-sm font-semibold text-red-600">${formatCurrencyNumber(
                                     // CORRECCIÓN: Priorizar valor de BD si está disponible (es más confiable que el cálculo dinámico)
                                     (loan.remaining_balance !== null && loan.remaining_balance !== undefined)
                                       ? loan.remaining_balance
                                       : (calculatedRemainingBalances[loan.id] !== undefined
                                           ? calculatedRemainingBalances[loan.id]
                                           : loan.amount || 0)
                                   )}</span>
                                 </div>
                                 <div className="flex flex-col sm:flex-row sm:items-center">
                                   <span className="font-medium text-xs sm:text-sm">Cuota Mensual:</span> 
                                   <span className="text-xs sm:text-sm">${formatCurrencyNumber(loan.monthly_payment)}</span>
                                 </div>
                                 <div className="flex flex-col sm:flex-row sm:items-center">
                                   <span className="font-medium text-xs sm:text-sm">Estado Cuota:</span> 
                                   <PaymentStatusBadge 
                                     loanId={loan.id}
                                     monthlyPayment={loan.monthly_payment}
                                     nextPaymentDate={loan.next_payment_date}
                                     remainingBalance={loan.remaining_balance}
                                   />
                                 </div>
                                 <div className="flex flex-col sm:flex-row sm:items-center">
                                   <span className="font-medium text-xs sm:text-sm">Vence:</span> 
                                   <span className="text-xs sm:text-sm font-semibold">{formatNextPaymentDate(loan)}</span>
                                 </div>
                                 <div className="flex flex-col sm:flex-row sm:items-center">
                                   <span className="font-medium text-xs sm:text-sm">Tasa:</span> 
                                   <span className="text-xs sm:text-sm">{loan.interest_rate}%</span>
                                 </div>
                               </div>
                             </div>

                             <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 mt-2 sm:mt-0">
                               {loan.status === 'pending' ? (
                                 <div className="flex flex-col sm:flex-row gap-1 sm:gap-2 w-full sm:w-auto">
                                   <Button
                                     variant="default"
                                     size="sm"
                                     onClick={() => handleApproveLoan(loan.id)}
                                     className="w-full sm:w-auto text-xs bg-green-600 hover:bg-green-700"
                                   >
                                     <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-0" />
                                     <span className="sm:hidden">Aprobar</span>
                                     <span className="hidden sm:inline">Aprobar</span>
                                   </Button>
                                   <Button
                                     variant="outline"
                                     size="sm"
                                     onClick={() => {
                                       setSelectedLoan(loan);
                                       setIsEditMode(loan.status === 'pending');
                                       setShowUpdateForm(true);
                                     }}
                                     className="w-full sm:w-auto text-xs"
                                   >
                                     <Edit className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-0" />
                                       <span className="sm:hidden">{EDIT_BUTTON_TEXT}</span>
                                      <span className="hidden sm:inline">{EDIT_BUTTON_TEXT}</span>
                                   </Button>
                                   <Button
                                     variant="destructive"
                                     size="sm"
                                     onClick={() => handleCancelLoanClick(loan)}
                                     className="w-full sm:w-auto text-xs"
                                   >
                                     <X className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-0" />
                                     <span className="sm:hidden">Cancelar</span>
                                     <span className="hidden sm:inline">Cancelar</span>
                                   </Button>
                                 </div>
                               ) : loan.status === 'deleted' ? (
                                 <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                                   <Button
                                     variant="default"
                                     size="sm"
                                     onClick={() => handleRecoverLoan(loan.id)}
                                     className="w-full sm:w-auto text-xs bg-blue-600 hover:bg-blue-700"
                                   >
                                     <RotateCcw className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-0" />
                                     <span className="sm:hidden">Recuperar</span>
                                     <span className="hidden sm:inline">Recuperar Préstamo</span>
                                   </Button>
                                   <Button
                                     variant="outline"
                                     size="sm"
                                     onClick={() => {
                                       setSelectedLoan(loan);
                                       setIsEditMode(false);
                                       setShowUpdateForm(true);
                                     }}
                                     className="w-full sm:w-auto text-xs"
                                   >
                                     <Eye className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-0" />
                                     <span className="sm:hidden">Ver</span>
                                     <span className="hidden sm:inline">Ver Préstamo</span>
                                   </Button>
                                 </div>
                               ) : (
                                 <>
                                   <Button
                                     variant="default"
                                     size="sm"
                                     onClick={() => {
                                       setSelectedLoanForPayment(loan);
                                       setShowPaymentForm(true);
                                     }}
                                     className="w-full sm:w-auto text-xs bg-green-600 hover:bg-green-700"
                                   >
                                     <Receipt className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-0" />
                                     <span className="sm:hidden">Pagar</span>
                                     <span className="hidden sm:inline">Registrar Pago</span>
                                   </Button>
                                   <Button
                                     variant="outline"
                                     size="sm"
                                     onClick={() => {
                                       setSelectedLoan(loan);
                                       setIsEditMode(loan.status === 'pending');
                                       setShowUpdateForm(true);
                                     }}
                                     className="w-full sm:w-auto text-xs"
                                   >
                                     <Edit className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-0" />
                                     <span className="sm:hidden">{EDIT_BUTTON_TEXT}</span>
                                   </Button>
                                 </>
                               )}
                             </div>
                           </div>
                         </div>
                       );
                     })}
              </div>
                 );
               })()}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="agenda" className="space-y-6">
           {(() => {
             // Función para generar todos los pagos futuros de un préstamo
             const generateAllPayments = (loan: any) => {
               const payments = [];
               const startDate = new Date(loan.start_date);
               const today = new Date();
               
               // Determinar la frecuencia de pago
               const frequency = loan.payment_frequency || 'monthly';
               let intervalDays = 30; // mensual por defecto
               
               switch (frequency) {
                 case 'daily':
                   intervalDays = 1;
                   break;
                 case 'weekly':
                   intervalDays = 7;
                   break;
                 case 'biweekly':
                   intervalDays = 14;
                   break;
                 case 'monthly':
                   intervalDays = 30;
                   break;
               }
               
               // Usar next_payment_date como punto de partida si existe, sino start_date
               let currentPaymentDate = new Date(loan.next_payment_date || loan.start_date);
               console.log('🔍 Agenda: Fecha de inicio del pago:', {
                 next_payment_date: loan.next_payment_date,
                 start_date: loan.start_date,
                 currentPaymentDate: currentPaymentDate.toISOString().split('T')[0],
                 isValid: !isNaN(currentPaymentDate.getTime())
               });
               let paymentNumber = 1;
               const maxPayments = loan.term_months || 12;
               
               // Calcular cuántos pagos ya se han hecho basado en el balance restante
               const totalAmount = loan.total_amount || 0;
               const remainingBalance = loan.remaining_balance || totalAmount;
               const monthlyPayment = loan.monthly_payment || 0;
               const paidPayments = monthlyPayment > 0 ? Math.floor((totalAmount - remainingBalance) / monthlyPayment) : 0;
               
               // Ajustar el número de pago inicial
               paymentNumber = Math.max(1, paidPayments + 1);
               
               console.log('🔍 Agenda: Generando pagos para préstamo:', {
                 id: loan.id,
                 client_name: loan.client?.full_name,
                 start_date: loan.start_date,
                 next_payment_date: loan.next_payment_date,
                 currentPaymentDate: currentPaymentDate.toISOString().split('T')[0],
                 paymentNumber,
                 maxPayments,
                 paidPayments,
                 remaining_balance: loan.remaining_balance,
                 monthly_payment: loan.monthly_payment,
                 frequency: frequency,
                 intervalDays: intervalDays
               });
               
               // Generar pagos para los próximos 6 meses desde la fecha actual
               const endDate = new Date(today);
               endDate.setMonth(endDate.getMonth() + 6);
               
               while (paymentNumber <= maxPayments && currentPaymentDate <= endDate) {
                 // Incluir pagos pasados recientes (últimos 365 días), del día actual y futuros
                 const daysDiff = Math.floor((currentPaymentDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                 if (daysDiff >= -365) { // Incluir pagos de los últimos 365 días
                   payments.push({
                     ...loan,
                     payment_date: new Date(currentPaymentDate),
                     payment_number: paymentNumber,
                     is_last_payment: paymentNumber === maxPayments,
                     remaining_payments: maxPayments - paymentNumber + 1,
                     is_overdue: daysDiff < 0 // Marcar como vencido si es un día pasado
                   });
                 }
                 
                 // Calcular siguiente fecha de pago
                 if (frequency === 'monthly') {
                   // Para pagos mensuales, mantener el día del mes
                   const nextMonth = new Date(currentPaymentDate);
                   nextMonth.setMonth(nextMonth.getMonth() + 1);
                   currentPaymentDate = nextMonth;
                 } else {
                   // Para otras frecuencias, agregar días
                   currentPaymentDate = new Date(currentPaymentDate);
                   currentPaymentDate.setDate(currentPaymentDate.getDate() + intervalDays);
                 }
                 paymentNumber++;
               }
               
               console.log('🔍 Agenda: Pagos generados para préstamo', loan.id, ':', payments.length);
               if (payments.length > 0) {
                 console.log('🔍 Agenda: Primeros pagos generados:', payments.slice(0, 3).map(p => ({
                   payment_date: p.payment_date.toISOString().split('T')[0],
                   payment_number: p.payment_number,
                   is_overdue: p.is_overdue
                 })));
               }
               return payments;
             };

             // Generar todos los pagos futuros de todos los préstamos (excluyendo préstamos pagados)
             console.log('🔍 Agenda: Total préstamos cargados:', loans.length);
             console.log('🔍 Agenda: Estados de préstamos:', loans.map(l => ({ 
               id: l.id, 
               status: l.status, 
               remaining_balance: l.remaining_balance,
               next_payment_date: l.next_payment_date,
               start_date: l.start_date,
               monthly_payment: l.monthly_payment,
               term_months: l.term_months
             })));
             
             // Filtrar préstamos activos (excluir eliminados y pagados)
             const activeLoans = loans.filter(loan => 
               loan.remaining_balance > 0 && 
               loan.status !== 'deleted' && 
               loan.status !== 'paid'
             );
             console.log('🔍 Agenda: Préstamos activos (excluyendo eliminados):', activeLoans.length);
             
             // Crear pagos simples basados en next_payment_date
             const allPayments = [];
             activeLoans.forEach(loan => {
               if (loan.next_payment_date) {
                 const paymentDate = new Date(loan.next_payment_date + 'T00:00:00');
                 const today = getCurrentDateInSantoDomingo();
                 const daysDiff = Math.floor((paymentDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                 
                 allPayments.push({
                   ...loan,
                   payment_date: paymentDate,
                   payment_number: 1,
                   is_last_payment: false,
                   remaining_payments: 1,
                   is_overdue: daysDiff < 0
                 });
               }
             });
             
             console.log('🔍 Agenda: Total pagos generados (simplificado):', allPayments.length);
             console.log('🔍 Agenda: Pagos generados:', allPayments.map(p => ({
               id: p.id,
               client_name: p.client?.full_name,
               payment_date: p.payment_date.toISOString().split('T')[0],
               is_overdue: p.is_overdue
             })));

             return (
               <>
                 {/* Stats Cards para Agenda */}
                 <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6">
             <Card>
               <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                 <CardTitle className="text-sm font-medium">Cobros Hoy</CardTitle>
                 <Calendar className="h-4 w-4 text-blue-600" />
               </CardHeader>
               <CardContent>
                 <div className="text-2xl font-bold text-blue-600">{loans.filter(loan => {
                   const nextPayment = new Date(loan.next_payment_date + 'T00:00:00');
                   const today = getCurrentDateInSantoDomingo();
                   return (loan.status === 'active' || loan.status === 'overdue') && 
                          loan.remaining_balance > 0 &&
                          nextPayment.toDateString() === today.toDateString();
                 }).length}</div>
                 <p className="text-xs text-muted-foreground">Pagos programados</p>
               </CardContent>
             </Card>

             <Card>
               <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                 <CardTitle className="text-sm font-medium">Esta Semana</CardTitle>
                 <Clock className="h-4 w-4 text-orange-600" />
               </CardHeader>
               <CardContent>
                 <div className="text-2xl font-bold text-orange-600">{loans.filter(loan => {
                   const nextPayment = new Date(loan.next_payment_date);
                   const today = new Date();
                   const endOfWeek = new Date(today);
                   endOfWeek.setDate(today.getDate() + 7);
                   return (loan.status === 'active' || loan.status === 'overdue') && 
                          loan.remaining_balance > 0 &&
                          nextPayment >= today && nextPayment <= endOfWeek;
                 }).length}</div>
                 <p className="text-xs text-muted-foreground">Próximos 7 días</p>
               </CardContent>
             </Card>

             <Card>
               <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                 <CardTitle className="text-sm font-medium">Este Mes</CardTitle>
                 <Calendar className="h-4 w-4 text-green-600" />
               </CardHeader>
               <CardContent>
                 <div className="text-2xl font-bold text-green-600">{loans.filter(loan => {
                   const nextPayment = new Date(loan.next_payment_date);
                   const today = new Date();
                   const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                   return (loan.status === 'active' || loan.status === 'overdue') && 
                          loan.remaining_balance > 0 &&
                          nextPayment >= today && nextPayment <= endOfMonth;
                 }).length}</div>
                 <p className="text-xs text-muted-foreground">Próximos 30 días</p>
               </CardContent>
             </Card>

             <Card>
               <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                 <CardTitle className="text-sm font-medium">Monto a Cobrar</CardTitle>
                 <DollarSign className="h-4 w-4 text-muted-foreground" />
               </CardHeader>
               <CardContent>
                 <div className="text-2xl font-bold">${formatCurrencyNumber(loans.filter(loan => {
                   const nextPayment = new Date(loan.next_payment_date);
                   const today = new Date();
                   const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                   return (loan.status === 'active' || loan.status === 'overdue') && 
                          loan.remaining_balance > 0 &&
                          nextPayment >= today && nextPayment <= endOfMonth;
                 }).reduce((sum, loan) => sum + loan.monthly_payment, 0))}</div>
                 <p className="text-xs text-muted-foreground">Este mes</p>
               </CardContent>
             </Card>
           </div>

           {/* Calendario de Cobros */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Calendar className="h-5 w-5 mr-2" />
                 Calendario de Cobros
              </CardTitle>
            </CardHeader>
            <CardContent>
                                {loading ? (
                   <div className="text-center py-8 text-gray-500">Cargando agenda...</div>
                                  ) : (() => {
                   // Función para generar todos los pagos futuros de un préstamo
                   const generateAllPayments = (loan: any) => {
                     const payments = [];
                     const startDate = new Date(loan.start_date);
                     const today = new Date();
                     
                     // Determinar la frecuencia de pago
                     const frequency = loan.payment_frequency || 'monthly';
                     let intervalDays = 30; // mensual por defecto
                     
                     switch (frequency) {
                       case 'daily':
                         intervalDays = 1;
                         break;
                       case 'weekly':
                         intervalDays = 7;
                         break;
                       case 'biweekly':
                         intervalDays = 14;
                         break;
                       case 'monthly':
                         intervalDays = 30;
                         break;
                     }
                     
                     // Usar next_payment_date como punto de partida si existe, sino start_date
                     let currentPaymentDate = new Date((loan.next_payment_date || loan.start_date) + 'T00:00:00');
                     let paymentNumber = 1;
                     const maxPayments = loan.term_months || 12;
                     
                     // Calcular cuántos pagos ya se han hecho basado en el balance restante
                     const totalAmount = loan.total_amount || 0;
                     const remainingBalance = loan.remaining_balance || totalAmount;
                     const monthlyPayment = loan.monthly_payment || 0;
                     const paidPayments = monthlyPayment > 0 ? Math.floor((totalAmount - remainingBalance) / monthlyPayment) : 0;
                     
                     // Ajustar el número de pago inicial
                     paymentNumber = Math.max(1, paidPayments + 1);
                     
                     // Generar pagos para los próximos 6 meses desde la fecha actual
                     const endDate = new Date(today);
                     endDate.setMonth(endDate.getMonth() + 6);
                     
                     while (paymentNumber <= maxPayments && currentPaymentDate <= endDate) {
                       // Incluir pagos pasados recientes (últimos 365 días), del día actual y futuros
                       const daysDiff = Math.floor((currentPaymentDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                       if (daysDiff >= -365) { // Incluir pagos de los últimos 365 días
                         payments.push({
                           ...loan,
                           payment_date: new Date(currentPaymentDate),
                           payment_number: paymentNumber,
                           is_last_payment: paymentNumber === maxPayments,
                           remaining_payments: maxPayments - paymentNumber + 1,
                           is_overdue: daysDiff < 0 // Marcar como vencido si es un día pasado
                         });
                       }
                       
                       // Calcular siguiente fecha de pago
                       if (frequency === 'monthly') {
                         // Para pagos mensuales, mantener el día del mes
                         const nextMonth = new Date(currentPaymentDate);
                         nextMonth.setMonth(nextMonth.getMonth() + 1);
                         currentPaymentDate = nextMonth;
                       } else {
                         // Para otras frecuencias, agregar días
                         currentPaymentDate = new Date(currentPaymentDate);
                         currentPaymentDate.setDate(currentPaymentDate.getDate() + intervalDays);
                       }
                       paymentNumber++;
                     }
                     
                     return payments;
                   };

                   // Generar fechas para el mes seleccionado
                   const today = getCurrentDateInSantoDomingo();
                   const currentMonth = currentViewMonth.getMonth();
                   const currentYear = currentViewMonth.getFullYear();
                   const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
                   const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
                   
                   // Generar todos los pagos futuros de todos los préstamos
                   const allPayments = loans
                     .filter(loan => (loan.status === 'active' || loan.status === 'overdue') && loan.remaining_balance > 0)
                     .flatMap(loan => generateAllPayments(loan));
                  
                  // Crear array de días del mes
                  const calendarDays = [];
                  
                  // Agregar días vacíos del inicio
                  for (let i = 0; i < firstDayOfMonth; i++) {
                    calendarDays.push(null);
                  }
                  
                  // Agregar días del mes
                  for (let day = 1; day <= daysInMonth; day++) {
                    const date = new Date(currentYear, currentMonth, day);
                    const paymentsForDay = allPayments.filter(payment => {
                      return payment.payment_date.toDateString() === date.toDateString();
                    });
                    
                    calendarDays.push({
                      day,
                      date,
                      payments: paymentsForDay,
                      isToday: date.toDateString() === today.toDateString(),
                      isPast: date < today
                    });
                  }

                 return (
                   <div className="space-y-4">
                     {/* Navegación del mes mejorada */}
                     <div className="bg-white rounded-lg border p-4 shadow-sm">
                       <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                         {/* Navegación principal */}
                         <div className="flex items-center gap-2">
                           {/* Navegación rápida -3M */}
                           <Button
                             variant="outline"
                             size="sm"
                             onClick={() => navigateMonths(-3)}
                             className="h-9 px-3 text-xs font-medium hover:bg-blue-50 hover:border-blue-300"
                           >
                             -3M
                           </Button>
                           
                           {/* Navegación mensual */}
                           <Button
                             variant="outline"
                             size="sm"
                             onClick={() => navigateMonth('prev')}
                             className="h-9 w-9 p-0 hover:bg-blue-50 hover:border-blue-300"
                           >
                             <ChevronLeft className="h-4 w-4" />
                           </Button>
                           
                           {/* Mes y año actual */}
                           <div className="min-w-[200px] text-center">
                             <h3 className="text-lg font-semibold text-gray-900">
                               {currentViewMonth.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
                             </h3>
                             <p className="text-xs text-gray-500">
                               {currentViewMonth.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric' })}
                             </p>
                           </div>
                           
                           <Button
                             variant="outline"
                             size="sm"
                             onClick={() => navigateMonth('next')}
                             className="h-9 w-9 p-0 hover:bg-blue-50 hover:border-blue-300"
                           >
                             <ChevronRight className="h-4 w-4" />
                           </Button>
                           
                           {/* Navegación rápida +3M */}
                           <Button
                             variant="outline"
                             size="sm"
                             onClick={() => navigateMonths(3)}
                             className="h-9 px-3 text-xs font-medium hover:bg-blue-50 hover:border-blue-300"
                           >
                             +3M
                           </Button>
                         </div>
                         
                         {/* Información y acciones */}
                         <div className="flex items-center gap-3">
                           <div className="text-center">
                             <div className="text-sm font-medium text-gray-900">
                               {allPayments.filter(payment => {
                                 const paymentDate = payment.payment_date;
                                 const endOfMonth = new Date(currentYear, currentMonth + 1, 0);
                                 return paymentDate >= new Date(currentYear, currentMonth, 1) && paymentDate <= endOfMonth;
                               }).length}
                             </div>
                             <div className="text-xs text-gray-500">cobros</div>
                           </div>
                           
                           <Button
                             variant="default"
                             size="sm"
                             onClick={resetToCurrentMonth}
                             className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium"
                           >
                             <Calendar className="h-4 w-4 mr-2" />
                             Hoy
                           </Button>
                         </div>
                       </div>
                       
                       {/* Navegación rápida por trimestres */}
                       <div className="mt-3 pt-3 border-t border-gray-100">
                         <div className="flex items-center justify-center gap-2">
                           <span className="text-xs text-gray-500 font-medium">Navegación rápida:</span>
                           {[-6, -3, 3, 6].map(months => (
                             <Button
                               key={months}
                               variant="ghost"
                               size="sm"
                               onClick={() => navigateMonths(months)}
                               className="h-7 px-2 text-xs hover:bg-gray-100"
                             >
                               {months > 0 ? `+${months}M` : `${months}M`}
                             </Button>
                           ))}
                         </div>
                       </div>
                     </div>

                     {/* Calendario */}
                     <div className="grid grid-cols-7 gap-1">
                       {/* Días de la semana */}
                       {['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].map(day => (
                         <div key={day} className="p-2 text-center text-sm font-medium text-gray-500 bg-gray-50">
                           {day}
                         </div>
                       ))}
                       
                       {/* Días del mes */}
                       {calendarDays.map((dayData, index) => (
                         <div
                           key={index}
                           className={`min-h-[80px] p-1 border ${
                             dayData === null ? 'bg-gray-50' :
                             dayData.isToday ? 'bg-blue-50 border-blue-200' :
                             dayData.isPast ? 'bg-gray-50' : 'bg-white'
                           }`}
                         >
                           {dayData && (
                             <>
                               <div className={`text-xs font-medium ${
                                 dayData.isToday ? 'text-blue-600' :
                                 dayData.isPast ? 'text-gray-400' : 'text-gray-900'
                               }`}>
                                 {dayData.day}
                               </div>
                               
                               {/* Cobros del día */}
                               {dayData.payments.length > 0 && (
                                 <div className="mt-1 space-y-1">
                                   {dayData.payments.slice(0, 2).map(payment => (
                                     <div
                                       key={`${payment.id}-${payment.payment_number}`}
                                       className={`text-xs p-1 rounded cursor-pointer hover:opacity-80 transition-colors ${
                                         payment.is_overdue
                                           ? 'bg-red-100 text-red-800 border border-red-200' // Pagos vencidos en rojo
                                           : payment.is_last_payment 
                                             ? 'bg-purple-100 text-purple-800' 
                                             : 'bg-green-100 text-green-800'
                                       }`}
                                       onClick={() => {
                                         setSelectedLoanForPayment(payment);
                                         setShowPaymentForm(true);
                                       }}
                                       title={`${payment.client?.full_name} - Pago ${payment.payment_number}/${payment.term_months || 12} - $${formatCurrencyNumber(payment.monthly_payment)}${payment.is_overdue ? ' (VENCIDO)' : ''}${payment.is_last_payment ? ' (Último pago)' : ''}`}
                                     >
                                       <div className="font-medium truncate">{payment.client?.full_name?.split(' ')[0]}</div>
                                       <div className="text-xs flex justify-between">
                                         <span>${formatCurrencyNumber(payment.monthly_payment)}</span>
                                         <span className="opacity-70">#{payment.payment_number}</span>
                                       </div>
                                       {payment.is_last_payment && (
                                         <div className="text-xs font-bold">ÚLTIMO</div>
                                       )}
                                     </div>
                                   ))}
                                   {dayData.payments.length > 2 && (
                                     <div className="text-xs text-gray-500 text-center">
                                       +{dayData.payments.length - 2} más
                                     </div>
                                   )}
                                 </div>
                               )}
                             </>
                           )}
                         </div>
                       ))}
                     </div>

                     {/* Leyenda */}
                     <div className="flex items-center justify-center gap-4 text-xs text-gray-600 mt-4 flex-wrap">
                       <div className="flex items-center gap-1">
                         <div className="w-3 h-3 bg-blue-50 border border-blue-200 rounded"></div>
                         <span>Hoy</span>
                       </div>
                       <div className="flex items-center gap-1">
                         <div className="w-3 h-3 bg-red-100 border border-red-200 rounded"></div>
                         <span>Pago vencido</span>
                       </div>
                       <div className="flex items-center gap-1">
                         <div className="w-3 h-3 bg-green-100 rounded"></div>
                         <span>Cobro programado</span>
                       </div>
                       <div className="flex items-center gap-1">
                         <div className="w-3 h-3 bg-purple-100 rounded"></div>
                         <span>Último pago</span>
                       </div>
                       <div className="flex items-center gap-1">
                         <div className="w-3 h-3 bg-gray-50 rounded"></div>
                         <span>Día pasado</span>
                       </div>
                     </div>
                   </div>
                 );
               })()}
             </CardContent>
           </Card>

           {/* Lista de Próximos Cobros */}
           <Card>
             <CardHeader>
               <CardTitle className="flex items-center">
                 <Clock className="h-5 w-5 mr-2" />
                 Próximos Cobros
              </CardTitle>
            </CardHeader>
            <CardContent>
               {(() => {
                 // Usar los pagos generados para la lista de próximos cobros
                 const upcomingPayments = allPayments
                   .sort((a, b) => a.payment_date.getTime() - b.payment_date.getTime())
                   .slice(0, 10); // Mostrar solo los próximos 10

                 if (upcomingPayments.length === 0) {
                   return (
                     <div className="text-center py-8 text-gray-500">
                       <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                       <h3 className="text-lg font-medium mb-2">No hay cobros programados</h3>
                       <p className="text-gray-600">Todos los préstamos están al día</p>
                     </div>
                   );
                 }

                 return (
                   <div className="space-y-3">
                     {upcomingPayments.map((payment) => {
                       const paymentDate = payment.payment_date;
                       const today = getCurrentDateInSantoDomingo();
                       const diffDays = Math.floor((paymentDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                       const isToday = diffDays === 0;
                       const isTomorrow = diffDays === 1;

                       return (
                         <div key={`${payment.id}-${payment.payment_number}`} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors">
                           <div className="flex-1">
                             <div className="flex items-center gap-3">
                               <h4 className="font-medium">{payment.client?.full_name}</h4>
                               <span className={`px-2 py-1 rounded text-xs font-medium ${
                                 payment.is_overdue ? 'bg-red-100 text-red-800' :
                                 payment.is_last_payment ? 'bg-purple-100 text-purple-800' :
                                 isToday ? 'bg-blue-100 text-blue-800' :
                                 isTomorrow ? 'bg-orange-100 text-orange-800' :
                                 'bg-gray-100 text-gray-800'
                               }`}>
                                 {payment.is_overdue ? 'VENCIDO' :
                                  payment.is_last_payment ? 'Último pago' :
                                  isToday ? 'Hoy' : 
                                  isTomorrow ? 'Mañana' : 
                                  `En ${diffDays} días`}
                               </span>
                             </div>
                             <div className="text-sm text-gray-600 mt-1">
                               <span className="font-medium">${formatCurrencyNumber(payment.monthly_payment)}</span> • 
                               Pago {payment.payment_number}/{payment.term_months || 12} • 
                               {paymentDate.toLocaleDateString('es-ES', { 
                                 weekday: 'long', 
                                 year: 'numeric', 
                                 month: 'long', 
                                 day: 'numeric' 
                               })}
                             </div>
                           </div>
                           <Button
                             variant="outline"
                             size="sm"
                             onClick={() => {
                               setSelectedLoanForPayment(payment);
                               setShowPaymentForm(true);
                             }}
                             className="ml-4"
                           >
                             <Receipt className="h-4 w-4 mr-2" />
                             Cobrar
                           </Button>
                         </div>
                       );
                     })}
              </div>
                 );
               })()}
            </CardContent>
          </Card>
                 </>
               );
             })()}
         </TabsContent>

         <TabsContent value="configuracion-mora" className="space-y-6">
           <div className="space-y-6">
             <div className="text-center">
               <h2 className="text-2xl font-bold text-gray-900 mb-2">Gestión de Mora</h2>
               <p className="text-gray-600">Configura y analiza la mora en tus préstamos</p>
             </div>
             
             {/* Configuración Global */}
             <Card>
               <CardHeader>
                 <CardTitle className="flex items-center gap-2">
                   <AlertTriangle className="h-5 w-5 text-orange-600" />
                   Configuración Global de Mora
                 </CardTitle>
                 <p className="text-sm text-gray-600">Establece los parámetros por defecto para nuevos préstamos</p>
               </CardHeader>
               <CardContent>
                 <GlobalLateFeeConfig onConfigUpdated={refetch} />
               </CardContent>
             </Card>
             
             {/* Reportes y Estadísticas */}
             <Card>
               <CardHeader>
                 <CardTitle className="flex items-center gap-2">
                   <BarChart3 className="h-5 w-5 text-blue-600" />
                   Reportes y Estadísticas de Mora
                 </CardTitle>
                 <p className="text-sm text-gray-600">Análisis detallado del comportamiento de mora en tu cartera</p>
               </CardHeader>
               <CardContent>
                 <LateFeeReports />
               </CardContent>
             </Card>
           </div>
         </TabsContent>

         <TabsContent value="estado-cuenta" className="space-y-6">
           <div className="space-y-6">
             <div className="text-center">
               <h2 className="text-2xl font-bold text-gray-900 mb-2">Estado de Cuenta</h2>
               <p className="text-gray-600">Consulta el historial detallado de pagos de tus préstamos</p>
             </div>
             
             {/* Lista de préstamos para seleccionar */}
             <Card>
               <CardHeader>
                 <CardTitle className="flex items-center gap-2">
                   <FileText className="h-5 w-5 text-blue-600" />
                   Seleccionar Préstamo
                 </CardTitle>
                 <p className="text-sm text-gray-600">Elige un préstamo para ver su estado de cuenta completo</p>
                 
                 {/* Filtros para la lista de préstamos */}
                 <div className="flex flex-col sm:flex-row gap-4 mt-4">
                   {/* Búsqueda */}
                   <div className="flex-1">
                     <div className="relative">
                       <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                       <Input
                         placeholder="Buscar por nombre del cliente..."
                         value={statementSearchTerm}
                         onChange={(e) => setStatementSearchTerm(e.target.value)}
                         className="pl-10"
                       />
                     </div>
                   </div>
                   
                   {/* Filtros */}
                   <div className="flex flex-col sm:flex-row gap-2">
                     <Select value={statementStatusFilter} onValueChange={setStatementStatusFilter}>
                       <SelectTrigger className="w-full sm:w-[140px]">
                         <SelectValue placeholder="Estado" />
                       </SelectTrigger>
                       <SelectContent>
                         <SelectItem value="all">Todos los Estados</SelectItem>
                         <SelectItem value="active">Activo</SelectItem>
                         <SelectItem value="in_agreement">En Acuerdo</SelectItem>
                         <SelectItem value="overdue">Vencido</SelectItem>
                         <SelectItem value="paid">Pagado</SelectItem>
                         <SelectItem value="pending">Pendiente</SelectItem>
                         <SelectItem value="deleted">Eliminados</SelectItem>
                       </SelectContent>
                     </Select>

                     <Select value={statementAmountFilter} onValueChange={setStatementAmountFilter}>
                       <SelectTrigger className="w-full sm:w-[140px]">
                         <SelectValue placeholder="Monto" />
                       </SelectTrigger>
                       <SelectContent>
                         <SelectItem value="all">Todos los Montos</SelectItem>
                         <SelectItem value="0-5000">RD$0 - RD$5,000</SelectItem>
                         <SelectItem value="5000-10000">RD$5,000 - RD$10,000</SelectItem>
                         <SelectItem value="10000-25000">RD$10,000 - RD$25,000</SelectItem>
                         <SelectItem value="25000+">RD$25,000+</SelectItem>
                       </SelectContent>
                     </Select>
                   </div>
                 </div>
               </CardHeader>
               <CardContent>
                 {loading ? (
                   <div className="flex items-center justify-center py-8">
                     <div className="text-center">
                       <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                       <p className="text-gray-600">Cargando préstamos...</p>
                     </div>
                   </div>
                 ) : loans.length === 0 ? (
                   <div className="text-center py-8">
                     <FileText className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                     <p className="text-gray-600">No tienes préstamos registrados</p>
                   </div>
                 ) : (() => {
                   const filteredLoans = loans.filter(loan => {
                         // Si el filtro es 'deleted', mostrar solo eliminados
                         // Si el filtro no es 'deleted' ni 'all', excluir eliminados
                         if (statementStatusFilter === 'deleted') {
                           // Solo mostrar eliminados cuando el filtro es 'deleted'
                           if (loan.status !== 'deleted') return false;
                         } else if (statementStatusFilter !== 'all') {
                           // Para otros filtros, excluir eliminados
                           if (loan.status === 'deleted') return false;
                           if (statementStatusFilter === 'in_agreement') {
                             // Filtrar por préstamos con acuerdo activo
                             if (!hasActiveAgreement(loan.id)) {
                               return false;
                             }
                           } else if (loan.status !== statementStatusFilter) {
                             return false;
                           }
                         } else {
                           // Para 'all', excluir eliminados por defecto
                           if (loan.status === 'deleted') return false;
                         }
                         
                         // Filtro por búsqueda
                         if (statementSearchTerm) {
                           const searchLower = statementSearchTerm.toLowerCase();
                           if (!loan.client?.full_name?.toLowerCase().includes(searchLower)) {
                             return false;
                           }
                         }
                         
                         // Filtro por monto
                         if (statementAmountFilter !== 'all') {
                           const amount = loan.amount;
                           switch (statementAmountFilter) {
                             case '0-5000':
                               if (amount > 5000) return false;
                               break;
                             case '5000-10000':
                               if (amount < 5000 || amount > 10000) return false;
                               break;
                             case '10000-25000':
                               if (amount < 10000 || amount > 25000) return false;
                               break;
                             case '25000+':
                               if (amount < 25000) return false;
                               break;
                           }
                         }
                         
                         return true;
                       });
                       
                   return filteredLoans.length === 0 ? (
                     <div className="text-center py-8">
                       <Search className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                       <p className="text-gray-600">No se encontraron préstamos con los filtros aplicados</p>
                       <Button 
                         variant="outline" 
                         onClick={() => {
                           setStatementSearchTerm('');
                           setStatementStatusFilter('all');
                           setStatementAmountFilter('all');
                         }}
                         className="mt-2"
                       >
                         Limpiar Filtros
                       </Button>
                     </div>
                   ) : (
                     <div className="grid gap-4">
                       {filteredLoans.map((loan) => (
                       <Card key={loan.id} className="hover:bg-gray-50 cursor-pointer transition-colors">
                         <CardContent className="p-4">
                           <div className="flex justify-between items-start">
                             <div className="space-y-2 flex-1">
                               <div className="flex items-center space-x-3">
                                 <CreditCard className="h-4 w-4 text-gray-500" />
                                 <h3 className="font-medium">{loan.client?.full_name}</h3>
                                 <Badge variant={
                                   hasActiveAgreement(loan.id) ? 'secondary' :
                                   loan.status === 'active' ? 'default' :
                                   loan.status === 'overdue' ? 'destructive' :
                                   loan.status === 'paid' ? 'secondary' :
                                   loan.status === 'deleted' ? 'outline' : 'outline'
                                 } className={
                                   hasActiveAgreement(loan.id) ? 'bg-purple-100 text-purple-800 hover:bg-purple-200' : ''
                                 }>
                                   {hasActiveAgreement(loan.id) ? 'En Acuerdo' :
                                    loan.status === 'active' ? 'Activo' :
                                    loan.status === 'overdue' ? 'Vencido' :
                                    loan.status === 'paid' ? 'Pagado' :
                                    loan.status === 'deleted' ? 'Eliminado' : loan.status}
                                 </Badge>
                               </div>
                               <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm text-gray-600">
                                 <div className="flex items-center">
                                   <DollarSign className="h-3 w-3 mr-1" />
                                   Monto: ${formatCurrencyNumber(loan.amount)}
                                 </div>
                                 <div className="flex items-center">
                                   <DollarSign className="h-3 w-3 mr-1" />
                                   Balance: ${formatCurrencyNumber(
                                     (loan.remaining_balance !== null && loan.remaining_balance !== undefined)
                                       ? loan.remaining_balance
                                       : (calculatedRemainingBalances[loan.id] !== undefined
                                           ? calculatedRemainingBalances[loan.id]
                                           : loan.amount || 0)
                                   )}
                                 </div>
                                 <div className="flex items-center">
                                   <Calendar className="h-3 w-3 mr-1" />
                                   Inicio: {new Date(loan.start_date).toLocaleDateString()}
                                 </div>
                                 <div className="flex items-center">
                                   <Clock className="h-3 w-3 mr-1" />
                                   Próximo: {(loan.status === 'paid' || loan.remaining_balance === 0 || !loan.next_payment_date) 
                                     ? 'N/A' 
                                     : new Date(loan.next_payment_date).toLocaleDateString()}
                                 </div>
                               </div>
                             </div>
                             <div className="flex gap-2 ml-4">
                               {loan.status === 'deleted' ? (
                                 <>
                                   <Button 
                                     onClick={() => handleRecoverLoan(loan.id)}
                                     variant="outline"
                                     className="flex items-center gap-1"
                                   >
                                     <RotateCcw className="h-4 w-4" />
                                     Recuperar
                                   </Button>
                                   <Button 
                                     onClick={() => {
                                       setSelectedLoan(loan);
                                       setIsEditMode(false);
                                       setShowUpdateForm(true);
                                     }}
                                     variant="ghost"
                                     className="flex items-center gap-1"
                                   >
                                     <Eye className="h-4 w-4" />
                                     Ver Préstamo
                                   </Button>
                                 </>
                               ) : (
                                 <Button 
                                   onClick={() => {
                                     setSelectedLoanForStatement(loan);
                                     setShowAccountStatement(true);
                                   }}
                                 >
                                   <FileText className="h-4 w-4 mr-1" />
                                   Ver Estado
                                 </Button>
                               )}
                             </div>
                           </div>
                         </CardContent>
                       </Card>
                     ))}
                   </div>
                   );
                 })()}
               </CardContent>
             </Card>
           </div>
         </TabsContent>
       </Tabs>

      {/* Loan Details View */}
      {selectedLoan && (
        <LoanDetailsView
          loanId={selectedLoan.id}
          isOpen={showDetailsView}
          onClose={() => {
            setShowDetailsView(false);
            setSelectedLoan(null);
          }}
          onRefresh={refetch}
        />
      )}

      {/* Loan History View */}
      {selectedLoan && (
        <LoanHistoryView
          loanId={selectedLoan.id}
          isOpen={showHistoryView}
          onClose={() => {
            setShowHistoryView(false);
            setSelectedLoan(null);
          }}
          onRefresh={() => {
            // Esta función se puede usar para recargar el historial
          }}
        />
      )}

     {/* Loan Statistics */}
     {selectedLoan && (
       <LoanStatistics
         loanId={selectedLoan.id}
         isOpen={showStatistics}
         onClose={() => {
           setShowStatistics(false);
           setSelectedLoan(null);
         }}
       />
     )}

     {/* Dialog de Confirmación de Cancelación */}
     <Dialog 
       open={showCancelDialog} 
       onOpenChange={(open) => {
         if (!open) {
           setShowCancelDialog(false);
           setLoanToCancel(null);
           setIsCancelling(false);
         }
       }}
     >
       <DialogContent>
         <DialogHeader>
           <DialogTitle className="flex items-center gap-2">
             <AlertCircle className="h-5 w-5 text-red-600" />
             Confirmar Cancelación
           </DialogTitle>
         </DialogHeader>
         <div className="space-y-4">
           <p className="text-gray-600">
             ¿Estás seguro de que deseas cancelar el préstamo de{' '}
             <span className="font-semibold">{loanToCancel?.client?.full_name}</span>?
           </p>
           <div className="bg-red-50 border border-red-200 rounded-lg p-3">
             <div className="flex items-center gap-2 text-red-800">
               <AlertCircle className="h-4 w-4" />
               <div>
                 <span className="font-semibold">⚠️ ADVERTENCIA</span>
                 <p className="text-sm mt-1">
                   • El préstamo será marcado como cancelado<br/>
                   • Se puede recuperar durante 2 meses<br/>
                   • Después de 2 meses se eliminará permanentemente
                 </p>
               </div>
             </div>
           </div>
           <div className="flex justify-end gap-2">
             <Button 
               variant="outline" 
               onClick={() => {
                 setShowCancelDialog(false);
                 setLoanToCancel(null);
                 setIsCancelling(false);
               }}
               disabled={isCancelling}
             >
               Cancelar
             </Button>
             <Button 
               variant="destructive" 
               onClick={handleCancelLoan}
               disabled={isCancelling}
             >
               {isCancelling ? 'Cancelando...' : 'Confirmar Cancelación'}
             </Button>
           </div>
         </div>
       </DialogContent>
     </Dialog>

     {/* Modal de Selección de Solicitudes */}
     <Dialog open={showRequestSelector} onOpenChange={setShowRequestSelector}>
       <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
         <DialogHeader>
           <DialogTitle>Seleccionar Solicitud para Crear Préstamo</DialogTitle>
         </DialogHeader>
         <div className="space-y-4">
           {requests.length === 0 ? (
             <div className="text-center py-8">
               <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
               <p className="text-gray-500">No hay solicitudes aprobadas disponibles</p>
             </div>
           ) : (
             <div className="grid gap-4">
               {requests.map((request) => (
                 <Card key={request.id} className="hover:bg-gray-50 cursor-pointer transition-colors">
                   <CardContent className="p-4">
                     <div className="flex justify-between items-start">
                       <div className="space-y-2 flex-1">
                         <div className="flex items-center space-x-3">
                           <Users className="h-4 w-4 text-gray-500" />
                           <h3 className="font-medium">{request.clients?.full_name}</h3>
                           <Badge variant="outline" className="text-green-600 border-green-600">
                             Aprobada
                           </Badge>
                         </div>
                         <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
                           <div className="flex items-center">
                             <DollarSign className="h-3 w-3 mr-1" />
                             Solicita: ${formatCurrencyNumber(request.requested_amount)}
                           </div>
                           <div className="flex items-center">
                             <Clock className="h-3 w-3 mr-1" />
                             {new Date(request.created_at).toLocaleDateString()}
                           </div>
                           {request.clients?.credit_score && (
                             <div className="flex items-center">
                               <AlertCircle className="h-3 w-3 mr-1" />
                               Score: {request.clients.credit_score}
                             </div>
                           )}
                         </div>
                         {request.purpose && (
                           <p className="text-sm text-gray-600">
                             <strong>Propósito:</strong> {request.purpose}
                           </p>
                         )}
                         {request.monthly_income && (
                           <p className="text-sm text-gray-600">
                             <strong>Ingresos:</strong> ${formatCurrencyNumber(request.monthly_income)}/mes
                           </p>
                         )}
                       </div>
                       <Button 
                         onClick={() => handleSelectRequestForLoan(request)}
                         className="ml-4"
                       >
                         <ArrowRight className="h-4 w-4 mr-1" />
                         Usar Solicitud
                       </Button>
                     </div>
                   </CardContent>
                 </Card>
               ))}
             </div>
           )}
         </div>
       </DialogContent>
     </Dialog>

     {/* Modal de Seguimiento de Cobro */}
     {selectedLoanForTracking && (
       <CollectionTracking
         loanId={selectedLoanForTracking.id}
         clientName={selectedLoanForTracking.client?.full_name || 'Cliente'}
         isOpen={showCollectionTracking}
         onClose={() => {
           // Limpiar URL INMEDIATAMENTE para prevenir re-ejecución del useEffect
           window.history.replaceState({}, '', '/prestamos');
           setShowCollectionTracking(false);
           setSelectedLoanForTracking(null);
           // Marcar que el usuario cerró el formulario manualmente
           manuallyClosedRef.current = true;
           // Resetear processedActionRef para permitir abrir desde nuevas notificaciones
           processedActionRef.current = null;
           lastUrlHadParamsRef.current = false;
         }}
       />
     )}

     {/* Modal de Estado de Cuenta */}
     {selectedLoanForStatement && (
       <AccountStatement
         loanId={selectedLoanForStatement.id}
         isOpen={showAccountStatement}
         onClose={() => {
           setShowAccountStatement(false);
           setSelectedLoanForStatement(null);
         }}
       />
     )}
   </div>
 );
};
