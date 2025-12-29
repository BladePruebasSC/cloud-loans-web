
import React, { useState, useEffect } from 'react';
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
  const [calculatedRemainingBalances, setCalculatedRemainingBalances] = useState<{[key: string]: number}>({});
  
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
  const calculateRemainingBalance = async (loan: any): Promise<number> => {
    // Para préstamos indefinidos, usar la lógica existente
    if (loan.amortization_type === 'indefinite') {
      const baseAmount = loan.amount || 0;
      const pendingInterest = pendingInterestForIndefinite[loan.id] || 0;
      return baseAmount + pendingInterest;
    }
    
    // Para otros tipos, calcular el total correcto y restar los pagos
    const correctTotalAmount = calculateTotalAmount(loan);
    
    // Obtener todos los pagos del préstamo
    try {
      const { data: payments, error } = await supabase
        .from('payments')
        .select('principal_amount, interest_amount')
        .eq('loan_id', loan.id);
      
      if (error) {
        console.error('Error obteniendo pagos para calcular balance:', error);
        return loan.remaining_balance; // Fallback al valor de BD
      }
      
      // Calcular el total pagado (capital + interés)
      const totalPaid = (payments || []).reduce((sum, p) => sum + ((p.principal_amount || 0) + (p.interest_amount || 0)), 0);
      
      // El balance restante es el total menos lo pagado
      return Math.max(0, correctTotalAmount - totalPaid);
    } catch (error) {
      console.error('Error calculando balance pendiente:', error);
      return loan.remaining_balance; // Fallback al valor de BD
    }
  };

  // Función helper para calcular la fecha ISO de la próxima cuota no pagada (para LateFeeInfo)
  const calculateNextPaymentDateISO = async (loan: any): Promise<string | null> => {
    // SIEMPRE buscar la primera cuota/cargo pendiente ordenada por fecha de vencimiento
    try {
      const { data: installments, error } = await supabase
        .from('installments')
        .select('due_date, is_paid, total_amount, principal_amount, interest_amount')
        .eq('loan_id', loan.id)
        .eq('is_paid', false)
        .order('due_date', { ascending: true })
        .limit(1);
      
      if (!error && installments && installments.length > 0) {
        const firstUnpaid = installments[0];
        if (firstUnpaid.due_date) {
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
            // Para indefinidos mensuales, preservar el día del mes de start_date
            const startDay = startDate.getDate();
            const nextMonth = startDate.getMonth() + 1;
            const nextYear = startDate.getFullYear();
            // Verificar si el día existe en el mes siguiente
            const lastDayOfNextMonth = new Date(nextYear, nextMonth + 1, 0).getDate();
            const dayToUse = Math.min(startDay, lastDayOfNextMonth);
            firstPaymentDate.setFullYear(nextYear, nextMonth, dayToUse);
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
            // Preservar el día del mes de firstPaymentDate
            const paymentDay = firstPaymentDate.getDate();
            const targetMonth = firstPaymentDate.getMonth() + periodsToAdd;
            const targetYear = firstPaymentDate.getFullYear();
            // Verificar si el día existe en el mes objetivo
            const lastDayOfTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
            const dayToUse = Math.min(paymentDay, lastDayOfTargetMonth);
            nextDate.setFullYear(targetYear, targetMonth, dayToUse);
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
    // Usar la fecha calculada si está disponible, sino usar la fecha almacenada
    const isoDate = nextPaymentDates[loan.id] || loan.next_payment_date?.split('T')[0] || null;
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
  
  // Calcular fechas de próximo pago para todos los préstamos
  useEffect(() => {
    const calculateAllNextPaymentDates = async () => {
      if (!loans || loans.length === 0) return;
      
      const dates: { [loanId: string]: string | null } = {};
      for (const loan of loans) {
        const date = await calculateNextPaymentDateISO(loan);
        dates[loan.id] = date;
      }
      setNextPaymentDates(dates);
    };
    
    calculateAllNextPaymentDates();
  }, [loans]);

  // Calcular montos totales y balances pendientes correctos para todos los préstamos
  useEffect(() => {
    const calculateAllAmounts = async () => {
      if (!loans || loans.length === 0) return;
      
      const totalAmounts: { [loanId: string]: number } = {};
      const remainingBalances: { [loanId: string]: number } = {};
      
      for (const loan of loans) {
        // Calcular monto total
        totalAmounts[loan.id] = calculateTotalAmount(loan);
        
        // Calcular balance pendiente
        remainingBalances[loan.id] = await calculateRemainingBalance(loan);
      }
      
      setCalculatedTotalAmounts(totalAmounts);
      setCalculatedRemainingBalances(remainingBalances);
    };
    
    calculateAllAmounts();
  }, [loans, pendingInterestForIndefinite]);

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

      // Obtener las cuotas del préstamo
      const { data: installments, error } = await supabase
        .from('installments')
        .select('*')
        .eq('loan_id', loan.id)
        .order('installment_number', { ascending: true });

      // Calcular interés por cuota para préstamos indefinidos
      const interestPerPayment = (loan.amount * loan.interest_rate) / 100;
      
      if (!loan.start_date) {
        console.warn('🔍 calculatePendingInterestForIndefinite: Falta start_date, no se puede calcular');
        return { pendingInterest: 0, paidCount: 0 };
      }
      
      // SIEMPRE calcular dinámicamente cuántas cuotas deberían existir desde start_date hasta hoy
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
      
      console.log('🔍 calculatePendingInterestForIndefinite: Cálculo dinámico de cuotas esperadas', {
        startDate: loan.start_date,
        currentDate: currentDate.toISOString().split('T')[0],
        monthsElapsed,
        totalExpectedInstallments
      });
      
      // Calcular cuántas cuotas se han pagado
      let paidCount = 0;
      
      // Primero, intentar contar desde las cuotas en la BD
      if (installments && installments.length > 0) {
        paidCount = installments.filter((inst: any) => inst.is_paid).length;
        console.log('🔍 calculatePendingInterestForIndefinite: Cuotas pagadas desde BD', {
          totalInBD: installments.length,
          paidInBD: paidCount
        });
      }
      
      // También verificar pagos para calcular cuántas cuotas de interés se han pagado
      const { data: payments } = await supabase
        .from('payments')
        .select('interest_amount')
        .eq('loan_id', loan.id);
      
      if (payments && payments.length > 0) {
        // Calcular cuántas cuotas de interés se han pagado
        const totalInterestPaid = payments.reduce((sum, p) => sum + (p.interest_amount || 0), 0);
        const paidFromPayments = Math.floor(totalInterestPaid / interestPerPayment);
        
        // Usar el mayor entre las cuotas pagadas en BD y las calculadas desde pagos
        paidCount = Math.max(paidCount, paidFromPayments);
        
        console.log('🔍 calculatePendingInterestForIndefinite: Cuotas pagadas desde pagos', {
          totalInterestPaid,
          paidFromPayments,
          finalPaidCount: paidCount
        });
      }
      
      // Cuotas pendientes = total esperadas - pagadas
      const unpaidCount = Math.max(0, totalExpectedInstallments - paidCount);
      
      console.log('🔍 calculatePendingInterestForIndefinite: Resumen final', {
        totalExpectedInstallments,
        paidCount,
        unpaidCount
      });
      
      // Calcular interés pendiente total
      const totalPendingInterest = unpaidCount * interestPerPayment;
      
      console.log('🔍 calculatePendingInterestForIndefinite: Resultado final', {
        loanId: loan.id,
        interestPerPayment,
        unpaidCount,
        totalPendingInterest,
        paidCount
      });
      
      return { pendingInterest: totalPendingInterest, paidCount };
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

  // Actualizar moras dinámicas y interés pendiente cuando cambien los préstamos
  useEffect(() => {
    if (loans && loans.length > 0) {
      updateDynamicLateFees();
      updatePendingInterestForIndefinite();
      fetchLoanAgreements();
    }
  }, [loans]);
  
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
    
    if (action && loanId) {
      // Esperar a que los préstamos estén cargados
      if (loading) {
        return; // Esperar a que termine la carga
      }
      
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
        
        // Limpiar URL para evitar re-aplicación
        window.history.replaceState({}, '', '/prestamos');
      } else if (!loading) {
        // Solo mostrar error si ya terminó de cargar y no encontró el préstamo
        toast.error('Préstamo no encontrado. Puede que haya sido eliminado o no tengas acceso.');
        // Limpiar URL incluso si no se encuentra el préstamo
        window.history.replaceState({}, '', '/prestamos');
      }
    }
  }, [loans, loading, location.search]); // Dependencia en loans, loading y location.search para detectar cambios en query params

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
          setShowPaymentForm(false);
          setSelectedLoanForPayment(null);
        }} 
        preselectedLoan={selectedLoanForPayment}
        onPaymentSuccess={() => {
          refetch(); // Actualizar los datos de préstamos
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
                              ${formatCurrencyNumber(calculatedTotalAmounts[loan.id] || calculateTotalAmount(loan))}
                            </div>
                            <div className="text-sm text-green-600 font-medium">Monto Total</div>
                          </div>
                          
                          <div className="text-center p-4 bg-gradient-to-br from-red-50 to-rose-50 rounded-xl border border-red-100">
                            <div className="text-2xl font-bold text-red-700 mb-1">
                              ${formatCurrencyNumber(
                                calculatedRemainingBalances[loan.id] !== undefined
                                  ? calculatedRemainingBalances[loan.id]
                                  : (loan.amortization_type === 'indefinite' 
                                      ? (() => {
                                          const baseAmount = loan.amount || 0;
                                          const pendingInterest = pendingInterestForIndefinite[loan.id] || 0;
                                          return baseAmount + pendingInterest;
                                        })()
                                      : loan.remaining_balance)
                              )}
                            </div>
                            <div className="text-sm text-red-600 font-medium">Balance Pendiente</div>
                            {loan.amortization_type === 'indefinite' && (pendingInterestForIndefinite[loan.id] || 0) > 0 && (
                              <div className="text-xs text-red-500 mt-1">
                                Balance + Interés Pendiente
                              </div>
                            )}
                          </div>

                          <div className="text-center p-4 bg-gradient-to-br from-purple-50 to-violet-50 rounded-xl border border-purple-100">
                            <div className="text-2xl font-bold text-purple-700 mb-1">
                              ${formatCurrencyNumber(
                                loan.status === 'paid' 
                                  ? 0 
                                  : ((calculatedRemainingBalances[loan.id] !== undefined
                                      ? calculatedRemainingBalances[loan.id]
                                      : (loan.amortization_type === 'indefinite' 
                                          ? loan.amount + (pendingInterestForIndefinite[loan.id] || 0)
                                          : loan.remaining_balance)) + 
                                     (dynamicLateFees[loan.id] || loan.current_late_fee || 0))
                              )}
                            </div>
                            <div className="text-sm text-purple-600 font-medium">Balance Total Pendiente</div>
                            {loan.status !== 'paid' && (
                              <div className="text-xs text-purple-500 mt-1">
                                {loan.amortization_type === 'indefinite' 
                                  ? 'Balance + Interés + Mora'
                                  : 'Balance + Mora Actual'}
                              </div>
                            )}
                          </div>
                          
                          <div className="text-center p-4 bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl border border-blue-100">
                            <div className="text-2xl font-bold text-blue-700 mb-1">
                              ${formatCurrencyNumber(loan.monthly_payment)}
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
                              {(loan as any).amortization_type === 'indefinite' ? '' : 'Meses'}
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
                               <span className="text-xs sm:text-sm">${formatCurrencyNumber(loan.remaining_balance)}</span>
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
                                   <span className="text-xs sm:text-sm font-semibold text-red-600">${formatCurrencyNumber(loan.remaining_balance)}</span>
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
                                   Balance: ${formatCurrencyNumber(loan.remaining_balance)}
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
           setShowCollectionTracking(false);
           setSelectedLoanForTracking(null);
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
