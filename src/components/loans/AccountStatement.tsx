import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { 
  FileText, 
  Download, 
  Calendar, 
  DollarSign, 
  CheckCircle, 
  Clock, 
  AlertTriangle,
  X,
  RefreshCw,
  Printer,
  Mail,
  Eye,
  Filter,
  Search,
  Receipt
} from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getLateFeeBreakdownFromInstallments } from '@/utils/installmentLateFeeCalculator';
import { formatCurrency } from '@/lib/utils';
import { formatInTimeZone } from 'date-fns-tz';
import { addHours } from 'date-fns';
import { formatDateStringForSantoDomingo, createDateInSantoDomingo, getCurrentDateInSantoDomingo } from '@/utils/dateUtils';

interface Payment {
  id: string;
  loan_id: string;
  amount: number;
  principal_amount: number;
  interest_amount: number;
  late_fee: number;
  payment_date: string;
  due_date: string;
  payment_method: string;
  reference_number?: string;
  notes?: string;
  status: string;
  created_at: string;
}

interface Installment {
  id: string;
  loan_id: string;
  installment_number: number;
  due_date: string;
  amount: number;
  principal_amount: number;
  interest_amount: number;
  late_fee_paid: number;
  is_paid: boolean;
  is_settled?: boolean;
  paid_date?: string;
  created_at: string;
  updated_at: string;
}

interface Loan {
  id: string;
  amount: number;
  remaining_balance: number;
  total_amount?: number;
  monthly_payment: number;
  interest_rate: number;
  term_months: number;
  start_date: string;
  next_payment_date: string;
  status: string;
  amortization_type?: string;
  clients: {
    full_name: string;
    dni: string;
  };
}

interface AccountStatementProps {
  loanId: string;
  isOpen: boolean;
  onClose: () => void;
}

export const AccountStatement: React.FC<AccountStatementProps> = ({ 
  loanId, 
  isOpen, 
  onClose 
}) => {
  const [loading, setLoading] = useState(false);
  const [loan, setLoan] = useState<Loan | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [statementDate, setStatementDate] = useState(new Date().toISOString().split('T')[0]);
  const [filteredPayments, setFilteredPayments] = useState<Payment[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [methodFilter, setMethodFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [currentLateFee, setCurrentLateFee] = useState(0);
  const [amortizationPeriod, setAmortizationPeriod] = useState('all');
  const [amortizationSchedule, setAmortizationSchedule] = useState<any[]>([]);

  // Función para traducir el método de pago en las notas
  const translatePaymentNotes = (notes: string) => {
    if (!notes) return notes;
    
    // Si las notas contienen "Cobro rápido - [método]", traducir el método
    const quickCollectionPattern = /Cobro rápido\s*-\s*(\w+)/i;
    const match = notes.match(quickCollectionPattern);
    
    if (match) {
      const method = match[1].toLowerCase();
      const methodTranslations: { [key: string]: string } = {
        'cash': 'Efectivo',
        'bank_transfer': 'Transferencia Bancaria',
        'check': 'Cheque',
        'card': 'Tarjeta',
        'online': 'Pago en línea'
      };
      
      const translatedMethod = methodTranslations[method] || method;
      return notes.replace(quickCollectionPattern, `Cobro rápido - ${translatedMethod}`);
    }
    
    return notes;
  };

  useEffect(() => {
    if (isOpen && loanId) {
      fetchAccountData();
      
      // Suscribirse a cambios en la tabla de pagos, cuotas y préstamos
      const updatesChannel = supabase
        .channel(`account-statement-${loanId}`)
        .on('postgres_changes', 
          { 
            event: '*', 
            schema: 'public', 
            table: 'payments',
            filter: `loan_id=eq.${loanId}`
          }, 
          (payload) => {
            console.log('🔔 AccountStatement: Cambio detectado en pagos:', payload);
            setTimeout(() => {
              fetchAccountData();
            }, 500);
          }
        )
        .on('postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'installments',
            filter: `loan_id=eq.${loanId}`
          },
          (payload) => {
            console.log('🔔 AccountStatement: Cambio detectado en cuotas:', payload);
            setTimeout(() => {
              fetchAccountData();
            }, 500);
          }
        )
        .on('postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'loans',
            filter: `id=eq.${loanId}`
          },
          (payload) => {
            console.log('🔔 AccountStatement: Cambio detectado en préstamo:', payload);
            setTimeout(() => {
              fetchAccountData();
            }, 500);
          }
        )
        .subscribe();

      // Escuchar evento personalizado para refrescar después de abono a capital
      const handleInstallmentsUpdated = (event: CustomEvent) => {
        if (event.detail?.loanId === loanId) {
          console.log('🔔 AccountStatement: Evento installmentsUpdated recibido, refrescando datos');
          setTimeout(() => {
            fetchAccountData();
          }, 500);
        }
      };

      window.addEventListener('installmentsUpdated', handleInstallmentsUpdated as EventListener);

      return () => {
        supabase.removeChannel(updatesChannel);
        window.removeEventListener('installmentsUpdated', handleInstallmentsUpdated as EventListener);
      };
    }
  }, [isOpen, loanId]);

  // Aplicar filtros a los pagos
  useEffect(() => {
    let filtered = [...payments];

    // Filtro por término de búsqueda
    if (searchTerm) {
      filtered = filtered.filter(payment => 
        payment.reference_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        payment.notes?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        payment.payment_method.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filtro por estado
    if (statusFilter !== 'all') {
      filtered = filtered.filter(payment => payment.status === statusFilter);
    }

    // Filtro por método de pago
    if (methodFilter !== 'all') {
      filtered = filtered.filter(payment => payment.payment_method === methodFilter);
    }

    // Filtro por fecha
    if (dateFilter !== 'all') {
      const now = new Date();
      const filterDate = new Date();
      
      switch (dateFilter) {
        case 'today':
          filterDate.setHours(0, 0, 0, 0);
          filtered = filtered.filter(payment => {
            const paymentDate = new Date(payment.payment_date);
            return paymentDate >= filterDate;
          });
          break;
        case 'week':
          filterDate.setDate(filterDate.getDate() - 7);
          filtered = filtered.filter(payment => {
            const paymentDate = new Date(payment.payment_date);
            return paymentDate >= filterDate;
          });
          break;
        case 'month':
          filterDate.setMonth(filterDate.getMonth() - 1);
          filtered = filtered.filter(payment => {
            const paymentDate = new Date(payment.payment_date);
            return paymentDate >= filterDate;
          });
          break;
        case 'year':
          filterDate.setFullYear(filterDate.getFullYear() - 1);
          filtered = filtered.filter(payment => {
            const paymentDate = new Date(payment.payment_date);
            return paymentDate >= filterDate;
          });
          break;
      }
    }

    setFilteredPayments(filtered);
  }, [payments, searchTerm, statusFilter, methodFilter, dateFilter]);

  // Calcular tabla de amortización cuando se cargan los datos del préstamo y las cuotas
  useEffect(() => {
    const calculateSchedule = async () => {
      // En préstamos indefinidos, las cuotas pueden ser generadas dinámicamente desde pagos.
      // Aun si no hay cuotas reales en BD, queremos generar la tabla.
      if (loan) {
        console.log('🔍 AccountStatement: Loan data for amortization:', {
          id: loan.id,
          amount: loan.amount,
          term_months: loan.term_months,
          interest_rate: loan.interest_rate,
          monthly_payment: loan.monthly_payment,
          amortization_type: loan.amortization_type,
          start_date: loan.start_date,
        });
        const schedule = await calculateAmortizationSchedule(loan, installments || []);
        setAmortizationSchedule(schedule);
      }
    };
    
    calculateSchedule();
  }, [loan, installments]);

  // Debug: Log cuando currentLateFee cambia
  useEffect(() => {
    console.log('🔍 AccountStatement: currentLateFee cambió a:', currentLateFee);
  }, [currentLateFee]);

  const fetchAccountData = async () => {
    setLoading(true);
    try {
      // Obtener información del préstamo
      const { data: loanData, error: loanError } = await supabase
        .from('loans')
        .select(`
          id,
          amount,
          remaining_balance,
          total_amount,
          monthly_payment,
          interest_rate,
          term_months,
          start_date,
          next_payment_date,
          status,
          client_id,
          payment_frequency,
          late_fee_enabled,
          late_fee_rate,
          grace_period_days,
          max_late_fee,
          late_fee_calculation_type,
          amortization_type
        `)
        .eq('id', loanId)
        .single();

      if (loanError) throw loanError;

      // Obtener información del cliente por separado
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('full_name, dni')
        .eq('id', loanData.client_id)
        .single();

      if (clientError) throw clientError;

      // Obtener todos los pagos del préstamo primero para calcular el balance correcto
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('payments')
        .select('*')
        .eq('loan_id', loanId)
        .order('payment_date', { ascending: true });

      if (paymentsError) throw paymentsError;
      setPayments(paymentsData || []);
      
      // Obtener abonos a capital
      const { data: capitalPaymentsData, error: capitalPaymentsError } = await supabase
        .from('capital_payments')
        .select('amount')
        .eq('loan_id', loanId);
      
      if (capitalPaymentsError) {
        console.error('Error obteniendo abonos a capital:', capitalPaymentsError);
      }
      
      // Calcular el balance correcto (capital + interés total - pagos realizados)
      // Si total_amount está disponible y es mayor que amount, usarlo; si no, calcularlo
      let correctTotalAmount = loanData.total_amount;
      if (!correctTotalAmount || correctTotalAmount <= loanData.amount) {
        // Calcular total_amount: capital + interés total
        const totalInterest = loanData.amount * (loanData.interest_rate / 100) * loanData.term_months;
        correctTotalAmount = loanData.amount + totalInterest;
      }
      
      // Calcular el total pagado (capital + interés)
      const totalPaid = (paymentsData || []).reduce((sum, p) => sum + ((p.principal_amount || 0) + (p.interest_amount || 0)), 0);
      
      // El balance restante base es el total menos lo pagado
      // Los cargos se agregarán después cuando se obtengan los installments
      // Por ahora, usar el balance base sin cargos
      let correctRemainingBalance = Math.max(0, correctTotalAmount - totalPaid);
      
      // Combinar los datos iniciales
      const combinedLoanData = {
        ...loanData,
        total_amount: correctTotalAmount,
        remaining_balance: correctRemainingBalance, // Se actualizará con cargos después
        clients: clientData
      };

      setLoan(combinedLoanData as Loan);

      // Obtener las cuotas del préstamo
      const amortizationTypeLower = String(loanData.amortization_type || '').toLowerCase();
      const isIndefinite = amortizationTypeLower === 'indefinite';
      let installmentsQuery = supabase
        .from('installments')
        .select('*, is_settled, total_amount')
        .eq('loan_id', loanId)
        .order('due_date', { ascending: true })
        .order('installment_number', { ascending: true }); // Orden secundario por número de cuota
      
      const { data: installmentsDataRaw, error: installmentsError } = await installmentsQuery;
      
      // Para préstamos indefinidos, separar cargos de cuotas regulares (igual que InstallmentsTable)
      let chargesFromDB: typeof installmentsDataRaw = [];
      if (isIndefinite && installmentsDataRaw) {
        chargesFromDB = installmentsDataRaw.filter(inst => {
          const isCharge = Math.abs((inst as any).interest_amount || 0) < 0.01 &&
                          (inst as any).principal_amount > 0 &&
                          Math.abs((inst as any).principal_amount - ((inst as any).total_amount || 0)) < 0.01;
          return isCharge;
        });
      }
      
      // Para préstamos indefinidos, generar cuotas dinámicamente basándose en el tiempo transcurrido
      let installmentsData = installmentsDataRaw || [];
      if (isIndefinite && loanData) {
        // ✅ CORRECCIÓN: Para préstamos indefinidos, siempre calcular desde start_date
        // y usar overflow (30-ene + 1 mes = 02-mar), NO “clamp” a fin de mes (28-feb).
        const startDateStr = loanData.start_date?.split('T')[0];
        let firstPaymentDateBase: Date;
        const today = getCurrentDateInSantoDomingo();
        const frequency = loanData.payment_frequency || 'monthly';
        
        if (!startDateStr) {
          installmentsData = installmentsDataRaw || [];
        } else {
          const [startYear, startMonth, startDay] = startDateStr.split('-').map(Number);
          const startDate = new Date(startYear, startMonth - 1, startDay);
          firstPaymentDateBase = new Date(startDate);
          
          // Calcular la primera fecha de pago (un mes después de start_date)
          // Para préstamos indefinidos, siempre usar el día 1 del mes siguiente
          switch (frequency) {
            case 'daily':
              firstPaymentDateBase.setDate(startDate.getDate() + 1);
              break;
            case 'weekly':
              firstPaymentDateBase.setDate(startDate.getDate() + 7);
              break;
            case 'biweekly':
              firstPaymentDateBase.setDate(startDate.getDate() + 14);
              break;
            case 'monthly':
            default:
              // Overflow intencional
              firstPaymentDateBase.setFullYear(startDate.getFullYear(), startDate.getMonth() + 1, startDate.getDate());
              break;
          }
        }
          
        if (firstPaymentDateBase) {
          // Obtener todos los pagos para determinar cuántas cuotas se han pagado
          const { data: allPayments, error: paymentsError } = await supabase
            .from('payments')
            .select('id, amount, interest_amount, payment_date, due_date')
            .eq('loan_id', loanId)
            .order('payment_date', { ascending: true });

          // Calcular cuántas cuotas se han pagado basándose en los pagos
          // Para préstamos indefinidos, acumular interés pagado para manejar múltiples pagos
          const periodRate = (loanData.interest_rate || 0) / 100;
          // Usar monthly_payment si está disponible: ya refleja la frecuencia de pago correcta.
          // Fallback a capital×tasa mensual solo si monthly_payment no está definido.
          const interestPerPayment = (loanData.monthly_payment && loanData.monthly_payment > 0)
            ? Number(loanData.monthly_payment)
            : (loanData.amount || 0) * periodRate;
          let paidInstallmentsCount = 0;
          if (allPayments && interestPerPayment > 0) {
            // CORRECCIÓN: Acumular interés pagado para contar correctamente cuando hay múltiples pagos
            let totalInterestPaid = 0;
            for (const payment of allPayments) {
              const interestField = Number((payment as any).interest_amount || 0) || 0;
              const amt = Number((payment as any).amount || 0) || 0;
              const paidValue = interestField > 0.01 ? interestField : (amt > 0.01 && amt <= interestPerPayment * 1.25 ? amt : 0);
              totalInterestPaid += paidValue;
            }
            // Calcular cuántas cuotas completas se han pagado
            paidInstallmentsCount = Math.floor(totalInterestPaid / interestPerPayment);
          }
          
          // Calcular cuántas cuotas deben generarse basándose en la frecuencia y tiempo transcurrido
          let monthsElapsed = 0;
          
          switch (frequency) {
            case 'daily':
              monthsElapsed = Math.floor((today.getTime() - firstPaymentDateBase.getTime()) / (1000 * 60 * 60 * 24 * 30));
              break;
            case 'weekly':
              monthsElapsed = Math.floor((today.getTime() - firstPaymentDateBase.getTime()) / (1000 * 60 * 60 * 24 * 7 * 4));
              break;
            case 'biweekly':
              monthsElapsed = Math.floor((today.getTime() - firstPaymentDateBase.getTime()) / (1000 * 60 * 60 * 24 * 14 * 2));
              break;
            case 'monthly':
            default:
              // Calcular meses transcurridos correctamente
              const yearsDiff = today.getFullYear() - firstPaymentDateBase.getFullYear();
              const monthsDiff = today.getMonth() - firstPaymentDateBase.getMonth();
              monthsElapsed = yearsDiff * 12 + monthsDiff;
              // Si el día del mes ya pasó o es el mismo día, contar ese mes también
              if (today.getDate() >= firstPaymentDateBase.getDate()) {
                monthsElapsed += 1;
              }
              break;
          }
          
          // CORRECCIÓN: Para préstamos indefinidos, usar el máximo entre:
          // 1. Cuotas pagadas (basadas en pagos reales)
          // 2. Meses transcurridos + 1 mes futuro
          // Esto asegura que se muestren todas las cuotas pagadas y al menos 1 mes futuro
          // ✅ Siempre generar al menos 2 filas: cuota actual + próxima
          const monthsFromTime = Math.max(2, monthsElapsed + 2); // +2 para incluir mes siguiente
          const monthsFromPayments = Math.max(2, paidInstallmentsCount + 2); // +2 para incluir la próxima cuota
          monthsElapsed = Math.max(monthsFromTime, monthsFromPayments);
          
          // Generar cuotas dinámicamente
          const dynamicInstallments = [];
          
          // CORRECCIÓN: Usar la fecha calculada correctamente
          const firstPaymentDate = new Date(firstPaymentDateBase);
          
          // Generar cuotas hasta el mes actual
          for (let i = 1; i <= Math.max(1, monthsElapsed); i++) {
            const installmentDate = new Date(firstPaymentDate);
            
            // Calcular fecha según frecuencia
            switch (frequency) {
              case 'daily':
                installmentDate.setDate(firstPaymentDate.getDate() + (i - 1));
                break;
              case 'weekly':
                installmentDate.setDate(firstPaymentDate.getDate() + ((i - 1) * 7));
                break;
              case 'biweekly':
                installmentDate.setDate(firstPaymentDate.getDate() + ((i - 1) * 14));
                break;
            case 'monthly':
            default:
                // Overflow intencional
                installmentDate.setFullYear(firstPaymentDate.getFullYear(), firstPaymentDate.getMonth() + (i - 1), firstPaymentDate.getDate());
                break;
            }
            
            // CORRECCIÓN UTC-4: Formatear fecha directamente sin usar toISOString()
            // para evitar problemas de zona horaria que cambian el día
            const year = installmentDate.getFullYear();
            const month = installmentDate.getMonth() + 1;
            const day = installmentDate.getDate();
            // Formatear directamente como YYYY-MM-DD sin conversión de zona horaria
            const formattedDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            
            // Buscar si existe una cuota real en la BD para este número
            const existingInstallment = installmentsDataRaw?.find(inst => inst.installment_number === i);
            
            // CORRECCIÓN: Para préstamos indefinidos, siempre usar la fecha calculada
            // para evitar usar fechas incorrectas guardadas en la BD
            const finalDueDate = formattedDate; // Siempre usar la fecha calculada correctamente
            
            // Para préstamos indefinidos, inicializar is_paid como false
            // Se determinará correctamente basándose en el interés acumulado de los pagos
            const initialIsPaid = isIndefinite 
              ? false 
              : (existingInstallment?.is_paid || false);
            
            dynamicInstallments.push({
              id: existingInstallment?.id || `dynamic-${i}`,
              loan_id: loanId,
              installment_number: i,
              due_date: finalDueDate,
              amount: existingInstallment?.amount || interestPerPayment,
              principal_amount: existingInstallment?.principal_amount || 0,
              interest_amount: existingInstallment?.interest_amount || interestPerPayment,
              late_fee_paid: existingInstallment?.late_fee_paid || 0,
              is_paid: initialIsPaid,
              is_settled: existingInstallment?.is_settled || false,
              paid_date: existingInstallment?.paid_date || null,
              created_at: existingInstallment?.created_at || new Date().toISOString(),
              updated_at: existingInstallment?.updated_at || new Date().toISOString(),
              total_amount: existingInstallment?.total_amount || interestPerPayment
            });
          }
          
          // CORRECCIÓN: Asignar pagos acumulando interés para marcar cuotas como pagadas cuando hay múltiples pagos
          // Para préstamos indefinidos, esta es la fuente de verdad para determinar si una cuota está pagada
          if (allPayments && allPayments.length > 0 && interestPerPayment > 0) {
            // Ordenar pagos por fecha
            const sortedPayments = [...allPayments].sort((a, b) => 
              new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime()
            );
            
            // Acumular interés pagado para asignar correctamente cuando hay múltiples pagos
            let accumulatedInterest = 0;
            let paymentIndex = 0;
            let firstPaymentDateForInstallment: string | null = null;
            
            // CORRECCIÓN: Usar la misma lógica que InstallmentsTable.tsx
            // El loop se detiene cuando no hay más pagos disponibles
            for (let i = 0; i < dynamicInstallments.length && paymentIndex < sortedPayments.length; i++) {
              const installment = dynamicInstallments[i];
              
              // Acumular interés de los pagos hasta que se complete esta cuota
              while (paymentIndex < sortedPayments.length && accumulatedInterest < interestPerPayment * 0.99) {
                const payment = sortedPayments[paymentIndex];
                const paymentInterest = payment.interest_amount || 0;
                
                if (firstPaymentDateForInstallment === null) {
                  firstPaymentDateForInstallment = payment.payment_date?.split('T')[0] || payment.payment_date || null;
                }
                
                accumulatedInterest += paymentInterest;
                paymentIndex++;
              }
              
              // Si se acumuló suficiente interés, marcar la cuota como pagada
              if (accumulatedInterest >= interestPerPayment * 0.99) {
                installment.is_paid = true;
                installment.paid_date = firstPaymentDateForInstallment;
                
                // Restar el interés usado para esta cuota (el excedente se usa para la siguiente)
                accumulatedInterest -= interestPerPayment;
                
                // Resetear la fecha del primer pago para la siguiente cuota
                firstPaymentDateForInstallment = null;
              }
              // Si no hay suficiente interés acumulado, la cuota NO está pagada
              // El loop se detendrá automáticamente cuando no haya más pagos (condición en el for)
            }
          }
          
          // CORRECCIÓN: Mezclar cuotas dinámicas con cargos de la BD (igual que InstallmentsTable)
          // Los cargos deben incluirse porque están en la BD y no se generan dinámicamente
          // CORRECCIÓN: Para indefinidos, en Estado de Cuenta queremos reflejar los pagos de interés como cuotas separadas
          // (ej: RD$50 pagado y RD$25 pagado deben verse como 2 cuotas pagadas), y una cuota futura.
          const round2 = (v: number) => Math.round(v * 100) / 100;
          const interestPayments = (allPayments || []).filter(p => (p.interest_amount || 0) > 0.01);
          const nowIso = new Date().toISOString();

          const computeDueDateFromStart = (startDateStr: string, frequency: string, periodsToAdd: number) => {
            const base = startDateStr.split('T')[0];
            const [y, m, d] = base.split('-').map(Number);
            const date = new Date(y, m - 1, d);
            const out = new Date(date);
            switch (frequency) {
              case 'daily':
                out.setDate(date.getDate() + periodsToAdd);
                break;
              case 'weekly':
                out.setDate(date.getDate() + (periodsToAdd * 7));
                break;
              case 'biweekly':
                out.setDate(date.getDate() + (periodsToAdd * 14));
                break;
              case 'monthly':
              default: {
                const paymentDay = date.getDate();
                const targetMonth = date.getMonth() + periodsToAdd;
                const targetYear = date.getFullYear();
                const lastDayOfTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
                const dayToUse = Math.min(paymentDay, lastDayOfTargetMonth);
                out.setFullYear(targetYear, targetMonth, dayToUse);
                break;
              }
            }
            const yy = out.getFullYear();
            const mm = out.getMonth() + 1;
            const dd = out.getDate();
            return `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
          };

          const regularFromPayments = interestPayments.map((p, idx) => {
            const due = (p.due_date as string)?.split('T')[0] || (p.due_date as string) || null;
            const paidDate = p.payment_date?.split('T')[0] || p.payment_date || null;
            const paidInterest = round2(Number(p.interest_amount || p.amount || 0));
            return {
              id: `interest-payment-${p.id}`,
              loan_id: loanId,
              installment_number: idx + 1,
              due_date: due,
              amount: paidInterest,
              principal_amount: 0,
              interest_amount: paidInterest,
              late_fee_paid: 0,
              is_paid: true,
              is_settled: false,
              paid_date: paidDate,
              created_at: nowIso,
              updated_at: nowIso,
              total_amount: paidInterest
            } as any;
          });

          const nextDue =
            (loanData.next_payment_date as any)?.split?.('T')?.[0] ||
            (loanData.next_payment_date as any) ||
            (loanData.start_date
              ? computeDueDateFromStart(
                  String(loanData.start_date),
                  String(loanData.payment_frequency || 'monthly'),
                  regularFromPayments.length + 1
                )
              : null);

          const pendingRegular = {
            id: `interest-pending-${loanId}`,
            loan_id: loanId,
            installment_number: regularFromPayments.length + 1,
            due_date: nextDue,
            amount: round2(interestPerPayment),
            principal_amount: 0,
            interest_amount: round2(interestPerPayment),
            late_fee_paid: 0,
            is_paid: false,
            is_settled: false,
            paid_date: null,
            created_at: nowIso,
            updated_at: nowIso,
            total_amount: round2(interestPerPayment)
          } as any;

          installmentsData = [...chargesFromDB, ...regularFromPayments, pendingRegular];
        }
      }

      if (installmentsError) throw installmentsError;
      setInstallments(installmentsData || []);
      
      // CORRECCIÓN: Recalcular el balance restante correctamente para préstamos indefinidos
      // Para indefinidos: capital + interés pendiente + cargos - pagos de capital/cargos (NO pagos de interés)
      let finalRemainingBalance: number;
      if (isIndefinite) {
        // Calcular interés pendiente (similar a calculatePendingInterestForIndefinite)
        const interestPerPayment = (loanData.amount || 0) * ((loanData.interest_rate || 0) / 100);
        const startDateStr = loanData.start_date?.split('T')[0];
        let pendingInterest = 0;
        
        if (startDateStr) {
          const [startYear, startMonth, startDay] = startDateStr.split('-').map(Number);
          const startDate = new Date(startYear, startMonth - 1, startDay);
          const currentDate = getCurrentDateInSantoDomingo();
          const monthsElapsed = Math.max(0, 
            (currentDate.getFullYear() - startDate.getFullYear()) * 12 + 
            (currentDate.getMonth() - startDate.getMonth())
          );
          
          // Calcular cuántas cuotas se han pagado
        let paidCount = 0;
        if (paymentsData && interestPerPayment > 0) {
          const totalInterestPaid = (paymentsData || []).reduce((sum, p: any) => {
            const interestField = Number(p?.interest_amount || 0) || 0;
            const amt = Number(p?.amount || 0) || 0;
            const paidValue = interestField > 0.01 ? interestField : (amt > 0.01 && amt <= interestPerPayment * 1.25 ? amt : 0);
            return sum + paidValue;
          }, 0);
          paidCount = Math.floor(totalInterestPaid / interestPerPayment);
        }
          
          // CORRECCIÓN: El total esperado debe ser al menos (paidCount + 1) para asegurar que siempre hay 1 cuota pendiente
          // También debe ser al menos (monthsElapsed + 1) para reflejar el tiempo transcurrido
          const totalExpectedInstallments = Math.max(paidCount + 1, monthsElapsed + 1);
          
          const unpaidCount = Math.max(1, totalExpectedInstallments - paidCount); // Siempre al menos 1 cuota pendiente
          pendingInterest = unpaidCount * interestPerPayment;
        }
        
        // Calcular total de cargos
        const totalChargesAmount = chargesFromDB.reduce((sum, inst) => sum + ((inst as any).total_amount || 0), 0);
        
        // Solo restar pagos de capital/cargos, NO pagos de interés
        const totalPaidCapital = (paymentsData || []).reduce((sum, p) => sum + (Number(p.principal_amount) || 0), 0);
        
        finalRemainingBalance = Math.round((Math.max(0, loanData.amount + pendingInterest + totalChargesAmount - totalPaidCapital)) * 100) / 100;
        
        // CORRECCIÓN: Priorizar valor de BD si está disponible y la diferencia es pequeña (por redondeo)
        if (loanData.remaining_balance !== null && loanData.remaining_balance !== undefined) {
          const diff = Math.abs(finalRemainingBalance - loanData.remaining_balance);
          // Si la diferencia es pequeña (menos de 5 pesos), usar el valor de la BD como fuente de verdad
          if (diff < 5) {
            finalRemainingBalance = Math.round(loanData.remaining_balance * 100) / 100;
          }
        }
      } else {
        // CORRECCIÓN: Calcular balance igual que LoanDetailsView
        // Balance = Capital Pendiente + Interés Pendiente + Cargos no pagados
        
        // 1. Calcular cargos
        const allCharges = (installmentsData || []).filter(inst => {
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
          
          const paymentsForCharges = (paymentsData || []).filter(p => {
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
        const unpaidChargesAmount = totalChargesAmount - paidChargesAmount;

        // ✅ Plazo fijo: balance restante debe incluir cargos y evitar desfaces por redondeo de cuotas.
        // Base = total_amount (o fórmula) - pagos regulares - abonos a capital; luego + cargos pendientes.
        const round2 = (n: number) => Math.round((Number(n || 0) * 100)) / 100;
        const totalCapitalPayments = round2((capitalPaymentsData || []).reduce((s, cp: any) => s + (Number(cp?.amount) || 0), 0));

        // Pagado total (monto), sin incluir fallidos
        const totalPaidAmount = round2((paymentsData || []).reduce((s, p: any) => s + (Number(p?.amount) || 0), 0));

        // Pagos asignados a cargos (heurística: mismo due_date del cargo y sin interés)
        const chargeDueDates = new Set<string>();
        for (const c of allCharges) {
          const d = c?.due_date ? String(c.due_date).split('T')[0] : null;
          if (d) chargeDueDates.add(d);
        }
        const totalPaidToCharges = round2(
          (paymentsData || [])
            .filter((p: any) => {
              const due = p?.due_date ? String(p.due_date).split('T')[0] : null;
              if (!due) return false;
              if (!chargeDueDates.has(due)) return false;
              return Math.abs(Number(p?.interest_amount || 0)) < 0.01;
            })
            .reduce((s: number, p: any) => s + (Number(p?.principal_amount || p?.amount || 0) || 0), 0)
        );
        const totalPaidRegular = round2(Math.max(0, totalPaidAmount - totalPaidToCharges));

        let baseLoanTotal = Number(loanData.total_amount || 0) || 0;
        if (!(baseLoanTotal > 0) || baseLoanTotal <= Number(loanData.amount || 0)) {
          const term = Number(loanData.term_months || 0) || 0;
          const totalInterest = Number(loanData.amount || 0) * (Number(loanData.interest_rate || 0) / 100) * term;
          baseLoanTotal = Number(loanData.amount || 0) + totalInterest;
        }
        baseLoanTotal = round2(baseLoanTotal);

        const baseRemaining = round2(Math.max(0, baseLoanTotal - totalPaidRegular - totalCapitalPayments));
        finalRemainingBalance = round2(baseRemaining + round2(unpaidChargesAmount));
      }
      
      // Actualizar el loan con el balance que incluye cargos
      setLoan(prev => ({
        ...prev,
        remaining_balance: finalRemainingBalance,
        correctRemainingBalance: finalRemainingBalance
      } as Loan));

      // Calcular la mora actual basándose en las cuotas reales del préstamo
      // Si el préstamo está saldado (status = 'paid'), la mora debe ser 0
      if (loanData && installmentsData) {
        // Si el préstamo está saldado, no calcular mora
        if (loanData.status === 'paid') {
          console.log('🔍 AccountStatement: Préstamo saldado - mora establecida en 0');
          setCurrentLateFee(0);
          return;
        }

        try {
          console.log('🔍 AccountStatement: Calculando mora usando getLateFeeBreakdownFromInstallments...');
          
          // CORRECCIÓN: Usar la misma función que LateFeeInfo para mantener consistencia
          const loanDataForCalculation = {
            id: loanData.id,
            amount: loanData.amount,
            remaining_balance: loanData.remaining_balance,
            next_payment_date: loanData.next_payment_date,
            late_fee_enabled: loanData.late_fee_enabled || false,
            late_fee_rate: loanData.late_fee_rate || 0,
            grace_period_days: loanData.grace_period_days || 0,
            max_late_fee: loanData.max_late_fee || 0,
            late_fee_calculation_type: (loanData.late_fee_calculation_type || 'daily') as 'daily' | 'monthly' | 'compound',
            term: loanData.term_months || 0,
            payment_frequency: loanData.payment_frequency || 'monthly',
            interest_rate: loanData.interest_rate || 0,
            monthly_payment: loanData.monthly_payment || 0,
            start_date: loanData.start_date,
            amortization_type: loanData.amortization_type
          };

          const breakdown = await getLateFeeBreakdownFromInstallments(loanData.id, loanDataForCalculation);
          const totalCurrentLateFee = breakdown.totalLateFee || 0;
          
          console.log('🔍 AccountStatement: Total mora actual calculado:', totalCurrentLateFee);
          console.log('🔍 AccountStatement: Desglose completo:', breakdown);

          // Usar el total de mora actual calculado desde la función correcta
          setCurrentLateFee(totalCurrentLateFee);
          console.log('🔍 AccountStatement: currentLateFee establecido a:', totalCurrentLateFee);
        } catch (lateFeeError) {
          console.error('🔍 AccountStatement: Error calculating late fee:', lateFeeError);
          setCurrentLateFee(0);
        }
      } else {
        console.log('🔍 AccountStatement: No se puede calcular mora - loanData:', !!loanData, 'installmentsData:', !!installmentsData);
      }

    } catch (error) {
      console.error('Error fetching account data:', error);
      toast.error('Error al cargar el estado de cuenta');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    try {
      // Usar la función de utilidad que maneja correctamente la zona horaria de Santo Domingo
      return formatDateStringForSantoDomingo(dateString);
    } catch (error) {
      return '-';
    }
  };

  const formatDateTime = (payment: any) => {
    // Priorizar payment_time_local si existe, sino usar created_at
    const dateString = payment.payment_time_local || payment.created_at;
    if (!dateString) return '-';
    
    try {
      const date = new Date(dateString);
      const formatted = formatInTimeZone(
        date,
        'America/Santo_Domingo',
        'dd MMM yyyy, hh:mm a'
      );
      
      console.log('🔍 formatDateTime:', {
        original: dateString,
        payment_time_local: payment.payment_time_local,
        created_at: payment.created_at,
        formatted,
        timezone: payment.payment_timezone || 'America/Santo_Domingo'
      });
      
      return formatted;
    } catch (error) {
      console.error('Error in formatDateTime:', error);
      return '-';
    }
  };

  const calculateAmortizationSchedule = async (loanData: any, installmentsData: any[]) => {
    if (!loanData || installmentsData === null || installmentsData === undefined) return [];

    console.log('🔍 AccountStatement: Calculando tabla de amortización interactiva...');
    console.log('🔍 AccountStatement: Datos de cuotas:', installmentsData);

    console.log('🔍 INICIO - calculateAmortizationSchedule:', {
      loanData,
      monthlyPayment: loanData.monthly_payment,
      amount: loanData.amount,
      term_months: loanData.term_months,
      remaining_balance: loanData.remaining_balance
    });

    const schedule = [];
    const principal = Number(loanData.amount || 0);
    const amortizationType = String(loanData.amortization_type || 'simple').toLowerCase();
    const interestRate = Number(loanData.interest_rate || 0);
    // Para préstamos indefinidos, NO usar installmentsData.length porque puede incluir duplicados
    // (ej: cargos + pagos de interés con mismo installment_number), lo que rompe el cálculo.
    const isIndefinite = amortizationType === 'indefinite';
    const maxInstallmentNumberFromData = (installmentsData || []).reduce((max: number, inst: any) => {
      const n = Number(inst?.installment_number);
      if (!Number.isFinite(n) || n <= 0) return max;
      return Math.max(max, n);
    }, 0);
    const numberOfPayments = Math.max(
      1,
      isIndefinite ? (maxInstallmentNumberFromData || 1) : (Number(loanData.term_months) || 1)
    );
    
    console.log('🔍 TIPO DE AMORTIZACIÓN DETECTADO:', {
      amortizationType,
      principal,
      numberOfPayments,
      interestRate,
      monthlyPayment: loanData.monthly_payment,
      rawAmortizationType: loanData.amortization_type
    });

    // Calcular tabla según el tipo de amortización
    let amortizationData = [];
    
    if (amortizationType === 'simple') {
      console.log('🔍 calculateAmortizationSchedule: Ejecutando lógica SIMPLE/ABSOLUTO');
      // Amortización Simple/Absoluto - Capital e interés fijos
      const monthlyPayment = loanData.monthly_payment;
      const fixedPrincipal = principal / numberOfPayments;
      const fixedInterest = monthlyPayment - fixedPrincipal;
      
      amortizationData = Array(numberOfPayments).fill(null).map((_, i) => ({
        installment: i + 1,
        principalPayment: fixedPrincipal,
        interestPayment: fixedInterest,
        monthlyPayment: monthlyPayment
      }));
      
      console.log('🔍 AMORTIZACIÓN SIMPLE:', {
        monthlyPayment,
        fixedPrincipal,
        fixedInterest
      });
      
    } else if (amortizationType === 'french') {
      console.log('🔍 calculateAmortizationSchedule: Ejecutando lógica FRANCESA/INSOLUTO');
      // Amortización Francesa - Cuota fija, capital creciente, interés decreciente
      const monthlyPayment = loanData.monthly_payment;
      const periodRate = interestRate / 100;
      let remainingBalance = principal;
      
      for (let i = 1; i <= numberOfPayments; i++) {
        const interestPayment = remainingBalance * periodRate;
        const principalPayment = monthlyPayment - interestPayment;
        remainingBalance -= principalPayment;
        
        amortizationData.push({
          installment: i,
          principalPayment: principalPayment,
          interestPayment: interestPayment,
          monthlyPayment: monthlyPayment
        });
      }
      
      console.log('🔍 AMORTIZACIÓN FRANCESA:', {
        monthlyPayment,
        periodRate,
        totalInstallments: amortizationData.length,
        firstInstallment: amortizationData[0],
        lastInstallment: amortizationData[amortizationData.length - 1]
      });
      
    } else if (amortizationType === 'german') {
      console.log('🔍 calculateAmortizationSchedule: Ejecutando lógica ALEMANA');
      // Amortización Alemana - Cuota decreciente, capital fijo
      const fixedPrincipal = principal / numberOfPayments;
      let remainingBalance = principal;
      
      for (let i = 1; i <= numberOfPayments; i++) {
        const interestPayment = remainingBalance * (interestRate / 100);
        const principalPayment = fixedPrincipal;
        const monthlyPayment = principalPayment + interestPayment;
        remainingBalance -= principalPayment;
        
        amortizationData.push({
          installment: i,
          principalPayment: principalPayment,
          interestPayment: interestPayment,
          monthlyPayment: monthlyPayment
        });
      }
      
      console.log('🔍 AMORTIZACIÓN ALEMANA:', {
        fixedPrincipal,
        totalInstallments: amortizationData.length
      });
      
    } else if (amortizationType === 'american') {
      console.log('🔍 calculateAmortizationSchedule: Ejecutando lógica AMERICANA');
      // Amortización Americana - Solo intereses, capital al final
      const interestPayment = principal * (interestRate / 100);
      
      for (let i = 1; i <= numberOfPayments; i++) {
        const principalPayment = i === numberOfPayments ? principal : 0;
        const monthlyPayment = principalPayment + interestPayment;
        
        amortizationData.push({
          installment: i,
          principalPayment: principalPayment,
          interestPayment: interestPayment,
          monthlyPayment: monthlyPayment
        });
      }
      
      console.log('🔍 AMORTIZACIÓN AMERICANA:', {
        interestPayment,
        totalInstallments: amortizationData.length
      });
      
    } else if (amortizationType === 'indefinite') {
      console.log('🔍 calculateAmortizationSchedule: Ejecutando lógica INDEFINIDO');
      // Plazo indefinido - Solo intereses, sin capital
      // CORRECCIÓN: Reflejar montos reales por cuota usando `installmentsData`
      // (para que se vea 50 pagado, 25 pagado, y una cuota pendiente 25, igual que "Ver Cuotas").
      const regularInstallments = (installmentsData || []).filter(inst => (inst.interest_amount || 0) > 0.01);
      for (let i = 0; i < regularInstallments.length; i++) {
        const inst = regularInstallments[i];
        const interestPayment = Number(inst.interest_amount || inst.amount || 0);
        amortizationData.push({
          installment: i + 1,
          principalPayment: 0,
          interestPayment,
          monthlyPayment: interestPayment
        });
      }
      
      console.log('🔍 AMORTIZACIÓN INDEFINIDA:', {
        totalInstallments: amortizationData.length
      });
      
    } else {
      console.log('🔍 calculateAmortizationSchedule: Ejecutando lógica FALLBACK (SIMPLE) - Tipo no reconocido:', amortizationType);
      // Fallback a simple si no se reconoce el tipo
      const monthlyPayment = loanData.monthly_payment;
      const fixedPrincipal = principal / numberOfPayments;
      const fixedInterest = monthlyPayment - fixedPrincipal;
      
      amortizationData = Array(numberOfPayments).fill(null).map((_, i) => ({
        installment: i + 1,
        principalPayment: fixedPrincipal,
        interestPayment: fixedInterest,
        monthlyPayment: monthlyPayment
      }));
      
      console.log('🔍 AMORTIZACIÓN FALLBACK (SIMPLE):', {
        monthlyPayment,
        fixedPrincipal,
        fixedInterest,
        unrecognizedType: amortizationType
      });
    }

    // ✅ INDEFINIDOS: La tabla debe incluir también CARGOS.
    // El `installment_number` puede repetirse (ej: #2/X cargo y #2/X interés), así que NO usamos Map por installment_number.
    // Construimos el schedule directamente desde installmentsData (igual que "Ver Cuotas") y damos una key única.
    if (amortizationType === 'indefinite') {
      const round2 = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;
      const remainingBalanceNow = round2(Number(loanData.remaining_balance ?? principal));

      const isCharge = (inst: any) => {
        const interest = Math.abs(Number(inst?.interest_amount || 0));
        const principalAmt = Number(inst?.principal_amount || 0);
        const total = Number(inst?.total_amount ?? inst?.amount ?? principalAmt);
        return interest < 0.01 && principalAmt > 0 && Math.abs(principalAmt - total) < 0.01;
      };

      // Para cargos, NO confiar en inst.is_paid (puede estar mal cuando hay pagos parciales).
      // Calcular pagado vs parcial vs pendiente desde payments (por due_date).
      const { data: paymentsRaw, error: paymentsFetchError } = await supabase
        .from('payments')
        .select('id, principal_amount, interest_amount, amount, due_date, payment_date, status')
        .eq('loan_id', loanData.id)
        .order('payment_date', { ascending: true });

      if (paymentsFetchError) {
        console.error('AccountStatement: Error obteniendo pagos para cargos:', paymentsFetchError);
      }

      const paymentsForCalc = (paymentsRaw || []).filter((p: any) => {
        // Contar pagos "pending" también (para reflejar inmediatamente en UI), pero excluir fallidos.
        const st = String(p?.status || '').toLowerCase();
        return st !== 'failed';
      });

      // Monto por cuota correcto para la frecuencia actual (monthly_payment ya incluye el factor quincenal/semanal)
      const currentPeriodPayment = (loanData.monthly_payment && loanData.monthly_payment > 0)
        ? Number(loanData.monthly_payment)
        : round2(principal * (interestRate / 100));

      // Obtener total_amount de BD para cada cuota (el handler de abono a capital los actualiza)
      // Solo se guarda si el monto no supera el esperado actual: si lo supera es el monto mensual
      // incorrecto que se guardó para un préstamo quincenal/semanal y debe ignorarse.
      const { data: dbInstallmentsForExp } = await supabase
        .from('installments')
        .select('due_date, total_amount, interest_amount, principal_amount')
        .eq('loan_id', loanData.id);
      const dbAmountByDueDateForSchedule = new Map<string, number>();
      for (const inst of dbInstallmentsForExp || []) {
        const isCh = Math.abs(Number((inst as any).interest_amount || 0)) < 0.01 && Number((inst as any).principal_amount || 0) > 0;
        if (isCh) continue;
        const due = (inst as any).due_date?.split('T')[0];
        const amt = Number((inst as any).total_amount || 0);
        if (due && amt > 0.01 && amt <= currentPeriodPayment * 1.05) {
          dbAmountByDueDateForSchedule.set(due, amt);
        }
      }

      // Para indefinidos: la cuota que vence en (abono_date + 1 periodo) se pagó con capital anterior.
      // Así 5,000 pagado para vencimiento 18 mar (abono 18 feb) se muestra como 1 cuota de 5,000, no 2×2,500.
      const addPeriodForCap = (iso: string, f: string) => {
        const [yy, mm, dd] = String(iso || '').split('T')[0].split('-').map(Number);
        if (!yy || !mm || !dd) return iso;
        const base = new Date(yy, mm - 1, dd);
        const dt = new Date(base);
        switch (String(f || 'monthly').toLowerCase()) {
          case 'daily': dt.setDate(dt.getDate() + 1); break;
          case 'weekly': dt.setDate(dt.getDate() + 7); break;
          case 'biweekly': dt.setDate(dt.getDate() + 14); break;
          default: dt.setFullYear(dt.getFullYear(), dt.getMonth() + 1, dt.getDate()); break;
        }
        return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
      };
      const { data: capitalPaymentsForSchedule } = await supabase
        .from('capital_payments')
        .select('capital_before, capital_after, created_at')
        .eq('loan_id', loanData.id)
        .order('created_at', { ascending: true });
      const frequencyForCap = String((loanData as any)?.payment_frequency || 'monthly');
      const getExpectedForDueDate = (dueDate: string): number => {
        if (!dueDate) return currentPeriodPayment;
        // Priorizar total_amount de BD si fue actualizado por abono a capital
        // (ya filtrado: solo valores <= currentPeriodPayment * 1.05)
        const dbAmt = dbAmountByDueDateForSchedule.get(dueDate);
        if (dbAmt && dbAmt > 0.01) return dbAmt;
        if (!capitalPaymentsForSchedule || capitalPaymentsForSchedule.length === 0) return currentPeriodPayment;
        // rateRatio = currentPeriodPayment / capital_actual: ya incorpora la frecuencia.
        // capital_before * rateRatio devuelve el monto correcto para la frecuencia del préstamo.
        const rateRatioForSchedule = principal > 0.01 ? currentPeriodPayment / principal : (interestRate / 100);
        for (const cp of capitalPaymentsForSchedule) {
          const createdDate = (cp as any).created_at ? String((cp as any).created_at).split('T')[0] : null;
          if (!createdDate) continue;
          const cutoff = addPeriodForCap(createdDate, frequencyForCap);
          if (dueDate <= cutoff) return round2(Number((cp as any).capital_before) * rateRatioForSchedule);
        }
        const last = capitalPaymentsForSchedule[capitalPaymentsForSchedule.length - 1];
        return round2(Number((last as any).capital_after) * rateRatioForSchedule);
      };

      const dueKeyOf = (d: any) => (String(d || '').split('T')[0] || '').trim() || null;
      const chargeKey = (inst: any, idx: number) => {
        const dueKey = dueKeyOf(inst?.due_date);
        const n = Number(inst?.installment_number) || 0;
        return String(inst?.id || `${dueKey || 'no-due'}-${n}-${idx}`);
      };

      const chargePaidByKey = new Map<string, number>();
      const chargePaidDateByKey = new Map<string, string | null>();

      // Agrupar cargos por fecha de vencimiento (orden estable para Cargo #1, #2, ...)
      const charges = (installmentsData || [])
        .filter((inst: any) => isCharge(inst))
        .sort((a: any, b: any) => {
          const da = dueKeyOf(a?.due_date) || '';
          const db = dueKeyOf(b?.due_date) || '';
          if (da !== db) return da.localeCompare(db);
          return (Number(a.installment_number) || 0) - (Number(b.installment_number) || 0);
        });
      const chargesByDue = new Map<string, Array<{ inst: any; idx: number }>>();
      charges.forEach((inst: any, idx: number) => {
        const key = dueKeyOf(inst?.due_date) || 'no-due';
        const list = chargesByDue.get(key) || [];
        list.push({ inst, idx });
        chargesByDue.set(key, list);
      });

      // Para cada fecha, repartir pagos de cargo en orden de installment_number (maneja múltiples cargos misma fecha)
      for (const [dueKey, list] of chargesByDue.entries()) {
        const chargesSorted = [...list].sort((a, b) => {
          const an = Number(a.inst?.installment_number) || 0;
          const bn = Number(b.inst?.installment_number) || 0;
          if (an !== bn) return an - bn;
          return a.idx - b.idx;
        });

        const paymentsForThisDue = paymentsForCalc
          .filter((p: any) => {
            const pDue = dueKeyOf(p?.due_date) || 'no-due';
            const noInterest = Math.abs(Number(p?.interest_amount || 0)) < 0.01;
            return pDue === dueKey && noInterest;
          })
          .sort((a: any, b: any) => new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime());

        let remainingPaid = round2(
          paymentsForThisDue.reduce((sum: number, p: any) => {
            const paidAmount = Number(p?.principal_amount ?? p?.amount ?? 0) || 0;
            return sum + paidAmount;
          }, 0)
        );

        const paidDateForThisDue =
          paymentsForThisDue.length > 0
            ? (String(paymentsForThisDue[paymentsForThisDue.length - 1].payment_date || '').split('T')[0] || null)
            : null;

        for (const { inst, idx } of chargesSorted) {
          const total = round2(Number(inst?.total_amount ?? inst?.amount ?? inst?.principal_amount ?? 0));
          const paid = round2(Math.min(Math.max(0, remainingPaid), total));
          remainingPaid = round2(Math.max(0, remainingPaid - paid));
          const key = chargeKey(inst, idx);
          chargePaidByKey.set(key, paid);
          if (paid > 0.01) {
            chargePaidDateByKey.set(key, paidDateForThisDue);
          }
        }
      }

      // ✅ NUEVO: En Estado de Cuenta, para cuotas regulares de indefinidos queremos 1 fila por due_date:
      // - Cuota mensual = interés esperado (p.ej. 500)
      // - Pagado = suma por due_date
      // - Falta = esperado - pagado
      // Esto evita filas duplicadas (250 pagado + 500 pendiente) y muestra "Parcial (Falta 250)".

      // 1) Construir filas de cargos desde installmentsData (con pagos parciales reales)
      const chargeRows = (charges || []).map((inst: any, idx: number) => {
        const total = round2(Number(inst?.total_amount ?? inst?.amount ?? inst?.principal_amount ?? 0));
        const principalPayment = round2(Number(inst?.principal_amount ?? total));
        const dueDate = (inst?.due_date as string | undefined)?.split?.('T')?.[0] || (inst?.due_date as string | undefined) || null;
        const paidDateFromDb = (inst?.paid_date as string | undefined)?.split?.('T')?.[0] || (inst?.paid_date as string | undefined) || null;

        const key = chargeKey(inst, idx);
        const paidAmt = round2(chargePaidByKey.get(key) || 0);
        const remaining = round2(Math.max(0, principalPayment - paidAmt));
        const paid = remaining <= 0.01;
        const isPartial = !paid && paidAmt > 0.01;
        const paidDate = (paid || isPartial) ? (chargePaidDateByKey.get(key) || paidDateFromDb) : null;

        return {
          installment: `Cargo #${idx + 1}`,
          rowKey: String(inst?.id || `charge-${loanData.id}-${dueDate || 'no-due'}-${idx}`),
          dueDate: dueDate || (loanData?.start_date?.split?.('T')?.[0] || null),
          monthlyPayment: total,
          principalPayment: principalPayment,
          interestPayment: 0,
          principalPaid: paidAmt,
          interestPaid: 0,
          remainingPrincipal: remaining,
          remainingInterest: 0,
          remainingPayment: remaining,
          remainingBalance: remainingBalanceNow,
          isPaid: paid,
          isPartial,
          isSettled: !!inst?.is_settled && !paid,
          paidDate,
          hasRealData: true,
          paymentStatus: paid ? 'paid' : isPartial ? 'partial' : 'pending',
          actualPaymentAmount: paid ? total : isPartial ? paidAmt : 0
        };
      });

      // 2) Construir filas regulares por due_date desde payments (excluyendo fechas de cargos)
      const chargeDueDates = new Set<string>();
      for (const c of charges || []) {
        const d = dueKeyOf(c?.due_date);
        if (d) chargeDueDates.add(d);
      }

      const paymentsByDue = new Map<string, { paid: number; lastPaidDate: string | null }>();
      const interestPerPayment =
        round2(Number(loanData.monthly_payment || 0)) > 0
          ? round2(Number(loanData.monthly_payment))
          : round2(principal * (interestRate / 100));

      // ✅ INDEFINIDOS: NO confiar en loan.next_payment_date (puede venir “clamp” 28-feb).
      // Generar siempre desde start_date con overflow y añadir 1 cuota futura.
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
            // Overflow intencional (30-ene + 1 mes => 02-mar)
            dt.setFullYear(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
            break;
        }
        const y = dt.getFullYear();
        const m = String(dt.getMonth() + 1).padStart(2, '0');
        const d = String(dt.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      };

      const frequency = String((loanData as any)?.payment_frequency || 'monthly');
      const startIso = String((loanData as any)?.start_date || '').split('T')[0] || '';
      const firstDueFromStart = startIso ? addPeriodIso(startIso, frequency) : null;

      // ✅ INDEFINIDOS: Solo 1 cuota pendiente a la vez.
      // - Historial: solo due_dates FULLY PAID
      // - Si hay una cuota PARCIAL, NO generar la siguiente hasta completar.
      const tol = 0.05;
      let invalidPaidTotal = 0;
      let invalidLastPaidDate: string | null = null;

      for (const p of paymentsForCalc) {
        const rawDue = dueKeyOf(p?.due_date);
        if (!rawDue || chargeDueDates.has(rawDue)) continue;

        const interest = Number(p?.interest_amount || 0) || 0;
        const amt = Number(p?.amount || 0) || 0;
        const paidValue =
          interest > 0.01
            ? interest
            : (amt > 0.01 && amt <= (loanData.monthly_payment || (interestRate * principal / 100) || 0) * 1.25 ? amt : 0);
        if (paidValue <= 0.01) continue;

        const pDate = p?.payment_date ? String(p.payment_date).split('T')[0] : null;

        if (firstDueFromStart && rawDue < firstDueFromStart) {
          invalidPaidTotal = round2(invalidPaidTotal + paidValue);
          invalidLastPaidDate = pDate || invalidLastPaidDate;
          continue;
        }

        const prev = paymentsByDue.get(rawDue);
        paymentsByDue.set(rawDue, {
          paid: round2((prev?.paid || 0) + paidValue),
          lastPaidDate: pDate || prev?.lastPaidDate || null
        });
      }

      const fullyPaidDueDates: string[] = [];
      let partialDue: string | null = null;

      for (const [due, info] of paymentsByDue.entries()) {
        const paidAmt = round2(info?.paid || 0);
        if (paidAmt <= 0.01) continue;
        const expectedForDue = getExpectedForDueDate(due);
        if (paidAmt + tol < expectedForDue) {
          // Tomar la más temprana parcial (la que debe seguirse pagando)
          partialDue = !partialDue || due < partialDue ? due : partialDue;
        } else {
          fullyPaidDueDates.push(due);
        }
      }

      const maxFullyPaidDue = fullyPaidDueDates.sort((a, b) => a.localeCompare(b)).slice(-1)[0] || null;
      const activeDue =
        partialDue ||
        (maxFullyPaidDue ? addPeriodIso(maxFullyPaidDue, frequency) : firstDueFromStart);

      // Reasignar pagos inválidos (ej. 28-feb clamp) a la cuota activa real
      if (activeDue && invalidPaidTotal > 0.01) {
        const prev = paymentsByDue.get(activeDue);
        paymentsByDue.set(activeDue, {
          paid: round2((prev?.paid || 0) + invalidPaidTotal),
          lastPaidDate: prev?.lastPaidDate || invalidLastPaidDate || null
        });
      }

      // ✅ Normalizar “overpay” en cuotas ya saldadas:
      // si por bug un pago nuevo se guarda con due_date de una cuota anterior ya pagada,
      // mover el excedente a la cuota activa (para que "Falta" se reduzca correctamente).
      if (activeDue) {
        let rollover = 0;
        for (const [due, info] of paymentsByDue.entries()) {
          if (due >= activeDue) continue;
          const expectedForDue = getExpectedForDueDate(due);
          if (expectedForDue <= 0.01) continue;
          const paidAmt = round2(info?.paid || 0);
          const capped = round2(Math.min(paidAmt, expectedForDue));
          const overflow = round2(Math.max(0, paidAmt - expectedForDue));
          if (overflow > 0.01) {
            rollover = round2(rollover + overflow);
            paymentsByDue.set(due, { paid: capped, lastPaidDate: info?.lastPaidDate || null });
          }
        }
        if (rollover > 0.01) {
          const prev = paymentsByDue.get(activeDue);
          paymentsByDue.set(activeDue, {
            paid: round2((prev?.paid || 0) + rollover),
            lastPaidDate: prev?.lastPaidDate || null
          });
        }
      }

      // Mostrar cada período como fila individual según el tiempo sin pagar.
      const todayIsoForRows = (() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      })();
      const fullyPaidSet = new Set<string>(fullyPaidDueDates);

      const regularRows: any[] = [];
      if (firstDueFromStart) {
        let cur = firstDueFromStart;
        let rowNum = 1;
        const MAX_PERIODS = 500;

        while (rowNum <= MAX_PERIODS) {
          if (chargeDueDates.has(cur)) {
            if (cur > todayIsoForRows) break;
            cur = addPeriodIso(cur, frequency);
            continue;
          }

          const paidInfo = paymentsByDue.get(cur);
          const paidAmt = round2(paidInfo?.paid || 0);
          const expected = getExpectedForDueDate(cur);
          const remaining = round2(Math.max(0, expected - paidAmt));
          const isPaid = fullyPaidSet.has(cur) || (remaining <= 0.01 && paidAmt > 0.01);
          const isPartial = !isPaid && paidAmt > 0.01 && remaining > 0.01;

          regularRows.push({
            installment: `${rowNum}/X`,
            rowKey: `regular-${loanData.id}-${cur}`,
            dueDate: cur,
            monthlyPayment: round2(expected),
            principalPayment: 0,
            interestPayment: round2(expected),
            principalPaid: 0,
            interestPaid: paidAmt,
            remainingPrincipal: 0,
            remainingInterest: remaining,
            remainingPayment: remaining,
            remainingBalance: remainingBalanceNow,
            isPaid,
            isPartial,
            isSettled: false,
            paidDate: (isPaid || isPartial) ? (paidInfo?.lastPaidDate || null) : null,
            hasRealData: true,
            paymentStatus: isPaid ? 'paid' : isPartial ? 'partial' : 'pending',
            actualPaymentAmount: isPaid ? expected : isPartial ? paidAmt : 0
          });

          rowNum++;
          // Parar después de incluir el primer período futuro (próxima cuota pendiente)
          if (cur > todayIsoForRows) break;
          cur = addPeriodIso(cur, frequency);
        }
      }

      const combined = [...chargeRows, ...regularRows].sort((a, b) => {
        if (a.dueDate && b.dueDate) {
          const da = new Date(a.dueDate).getTime();
          const db = new Date(b.dueDate).getTime();
          if (da !== db) return da - db;
        }
        const aIsCharge = String(a.installment || '').startsWith('Cargo');
        const bIsCharge = String(b.installment || '').startsWith('Cargo');
        if (aIsCharge !== bIsCharge) return aIsCharge ? -1 : 1;
        return String(a.rowKey).localeCompare(String(b.rowKey));
      });

      return combined;
    }

    // Parsear la fecha de inicio correctamente en zona horaria de Santo Domingo
    const startDateStrRaw = (loanData.start_date as string | undefined)?.split?.('T')?.[0]; // Obtener solo la parte de fecha
    let startDate: Date;
    if (startDateStrRaw) {
      const [startYear, startMonth, startDay] = startDateStrRaw.split('-').map(Number);
      startDate = createDateInSantoDomingo(startYear, startMonth, startDay);
    } else {
      const now = getCurrentDateInSantoDomingo();
      startDate = createDateInSantoDomingo(now.getFullYear(), now.getMonth() + 1, now.getDate());
    }

    // Crear un mapa de cuotas para acceso rápido
    const installmentsMap = new Map();
    installmentsData.forEach(installment => {
      installmentsMap.set(installment.installment_number, installment);
    });

    // Obtener todos los pagos del préstamo para calcular saldos pendientes
    const { data: payments, error } = await supabase
      .from('payments')
      .select('id, principal_amount, interest_amount, payment_date, amount, due_date')
      .eq('loan_id', loanData.id)
      .order('payment_date', { ascending: true });

    if (error) {
      console.error('Error obteniendo pagos:', error);
    }

    // Crear un Set global para rastrear qué pagos (por ID) ya han sido asignados a cuotas
    const assignedPaymentIds = new Set<string>();
    // Mapa para rastrear qué pago está asignado a qué cuota
    const paymentToInstallmentMap = new Map<string, number>();

    const isChargeInstallment = (inst: any) => {
      const interest = Math.abs(Number(inst?.interest_amount || 0));
      const principalAmt = Number(inst?.principal_amount || 0);
      const total = Number(inst?.amount || (inst as any)?.total_amount || 0);
      return interest < 0.01 && principalAmt > 0 && Math.abs(principalAmt - total) < 0.01;
    };
    const chargeAmountOf = (inst: any) =>
      Number((inst as any)?.total_amount || inst?.amount || inst?.principal_amount || 0) || 0;
    // ✅ Un cargo debe reflejarse en el capital pendiente de TODAS las cuotas (aunque venza más adelante).
    const totalChargesAll = (installmentsData || []).reduce((sum: number, inst: any) => {
      return sum + (isChargeInstallment(inst) ? chargeAmountOf(inst) : 0);
    }, 0);

    // Calcular el capital total pagado para determinar el balance general
    const totalPrincipalPaid = payments?.reduce((sum, payment) => sum + (payment.principal_amount || 0), 0) || 0;
    
    // Calcular el capital promedio por cuota para determinar pagos completos
    const averagePrincipalPerInstallment = principal / numberOfPayments;

    console.log('🔍 AccountStatement: Mapa de cuotas creado:', installmentsMap);
    console.log('🔍 AccountStatement: Pagos encontrados:', payments);
    console.log('🔍 AccountStatement: Capital total pagado:', totalPrincipalPaid);
    console.log('🔍 AccountStatement: Capital promedio por cuota:', averagePrincipalPerInstallment);

    // CORRECCIÓN: Para préstamos indefinidos, acumular interés de múltiples pagos para completar cada cuota
    // Ordenar pagos por fecha (más antiguo primero)
    const sortedPayments = payments ? [...payments].sort((a, b) => {
      return new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime();
    }) : [];
    
    // Para préstamos indefinidos, PRIMERO procesar todos los cargos, LUEGO las cuotas regulares de interés
    if (amortizationType === 'indefinite' && sortedPayments.length > 0) {
      // PRIMERO: Procesar TODOS los cargos
      const chargeInstallments: number[] = [];
      for (let i = 1; i <= numberOfPayments; i++) {
        const realInstallment = installmentsMap.get(i);
        const isCharge = realInstallment && 
                         Math.abs((realInstallment as any).interest_amount || 0) < 0.01 &&
                         (realInstallment as any).principal_amount > 0 && 
                         Math.abs((realInstallment as any).principal_amount - ((realInstallment as any).total_amount || (realInstallment as any).amount || 0)) < 0.01;
        if (isCharge) {
          chargeInstallments.push(i);
        }
      }

      // Procesar cada cargo
      for (const i of chargeInstallments) {
        const realInstallment = installmentsMap.get(i);
        if (!realInstallment) continue;
        
        const chargeTotal = (realInstallment as any).total_amount || (realInstallment as any).amount || (realInstallment as any).principal_amount;
        const chargeDueDate = (realInstallment as any).due_date?.split('T')[0] || (realInstallment as any).due_date;
        let accumulatedPrincipal = 0; // Resetear para cada cargo
        
        // Buscar TODOS los pagos que correspondan a este cargo específico
        for (let pIdx = 0; pIdx < sortedPayments.length && accumulatedPrincipal < chargeTotal * 0.99; pIdx++) {
          const payment = sortedPayments[pIdx];
          
          // Si el pago ya fue asignado, saltarlo
          if (assignedPaymentIds.has(payment.id)) {
            continue;
          }
          
          // Verificar si este pago corresponde a este cargo específico
          const paymentDueDate = (payment.due_date as string)?.split('T')[0] || (payment.due_date as string);
          const hasNoInterest = (payment.interest_amount || 0) < 0.01;
          const reasonableAmount = (payment.principal_amount || payment.amount || 0) <= chargeTotal * 1.1;
          const paymentMatchesCharge = paymentDueDate === chargeDueDate && hasNoInterest && reasonableAmount;
          
          // Solo asignar si corresponde a este cargo y el monto es razonable
          if (paymentMatchesCharge) {
            const paymentAmount = payment.principal_amount || payment.amount || 0;
            
            // Verificar que el monto del pago no exceda el cargo pendiente
            const remainingCharge = chargeTotal - accumulatedPrincipal;
            if (paymentAmount > 0 && paymentAmount <= remainingCharge * 1.1) {
              assignedPaymentIds.add(payment.id);
              paymentToInstallmentMap.set(payment.id, i);
              accumulatedPrincipal += paymentAmount;
              
              // Si el cargo está completo, pasar al siguiente cargo
              if (accumulatedPrincipal >= chargeTotal * 0.99) {
                break;
              }
            }
          }
        }
      }
      
      // SEGUNDO: Procesar cuotas regulares (de interés)
      const interestPerPayment = (loanData.amount * loanData.interest_rate) / 100;
      let accumulatedInterest = 0;
      let paymentIndex = 0;
      let firstPaymentDateForInstallment: string | null = null;
      
      // Crear un Set de IDs de pagos ya asignados a cargos para no reutilizarlos
      const paymentsAssignedToCharges = new Set<string>();
      for (const i of chargeInstallments) {
        const realInstallment = installmentsMap.get(i);
        if (!realInstallment) continue;
        
        const chargeTotal = (realInstallment as any).total_amount || (realInstallment as any).amount || (realInstallment as any).principal_amount;
        const chargeDueDate = (realInstallment as any).due_date?.split('T')[0] || (realInstallment as any).due_date;
        let chargeAccumulated = 0;
        
        for (const payment of sortedPayments) {
          if (paymentsAssignedToCharges.has(payment.id)) continue;
          
          const paymentDueDate = (payment.due_date as string)?.split('T')[0] || (payment.due_date as string);
          const hasNoInterest = (payment.interest_amount || 0) < 0.01;
          const reasonableAmount = (payment.principal_amount || payment.amount || 0) <= chargeTotal * 1.1;
          const paymentMatchesCharge = paymentDueDate === chargeDueDate && hasNoInterest && reasonableAmount;
          
          if (paymentMatchesCharge && chargeAccumulated < chargeTotal * 0.99) {
            const paymentAmount = payment.principal_amount || payment.amount || 0;
            if (paymentAmount > 0 && paymentAmount <= (chargeTotal - chargeAccumulated) * 1.1) {
              paymentsAssignedToCharges.add(payment.id);
              chargeAccumulated += paymentAmount;
              if (chargeAccumulated >= chargeTotal * 0.99) break;
            }
          }
        }
      }

      // Procesar cuotas regulares (excluyendo cargos)
      // CORRECCIÓN CLAVE (INDEFINIDOS):
      // NO acumular/redistribuir un pago grande entre múltiples cuotas.
      // En indefinidos, cada PAGO DE INTERÉS es 1 cuota pagada (monto histórico), y la pendiente es la que cambia.
      const interestPaymentsOnly = sortedPayments.filter(p => {
        if (paymentsAssignedToCharges.has(p.id)) return false;
        if (assignedPaymentIds.has(p.id)) return false;
        return (p.interest_amount || 0) > 0.01;
      });
      let interestPaymentIdx = 0;
      for (let i = 1; i <= numberOfPayments && interestPaymentIdx < interestPaymentsOnly.length; i++) {
        const realInstallment = installmentsMap.get(i);
        const isCharge = realInstallment &&
                         Math.abs((realInstallment as any).interest_amount || 0) < 0.01 &&
                         (realInstallment as any).principal_amount > 0 &&
                         Math.abs((realInstallment as any).principal_amount - ((realInstallment as any).total_amount || (realInstallment as any).amount || 0)) < 0.01;
        if (isCharge) continue;
        // Solo asignar pagos de interés a cuotas regulares (interés > 0)
        if ((realInstallment as any)?.interest_amount !== undefined && (realInstallment as any).interest_amount <= 0.01) continue;

        const payment = interestPaymentsOnly[interestPaymentIdx];
        assignedPaymentIds.add(payment.id);
        paymentToInstallmentMap.set(payment.id, i);
        interestPaymentIdx++;
      }
    } else {
      // Para préstamos no indefinidos, PRIMERO procesar todos los cargos, LUEGO las cuotas regulares
      // Esto asegura que los pagos se asignen correctamente a los cargos antes que a las cuotas regulares
      let paymentIndex = 0;
      let accumulatedPrincipal = 0;
      let accumulatedInterest = 0;
      
      // PRIMERO: Procesar TODOS los cargos (en cualquier orden de cuota)
      const chargeInstallments: number[] = [];
      for (let i = 1; i <= numberOfPayments; i++) {
        const realInstallment = installmentsMap.get(i);
        const isCharge = realInstallment && 
                         realInstallment.interest_amount === 0 && 
                         realInstallment.principal_amount > 0 && 
                         Math.abs(realInstallment.principal_amount - (realInstallment.amount || (realInstallment as any).total_amount || 0)) < 0.01;
        if (isCharge) {
          chargeInstallments.push(i);
        }
      }
      
      // Procesar cada cargo
      for (const i of chargeInstallments) {
        const realInstallment = installmentsMap.get(i);
        if (!realInstallment) continue;
        
        const chargeTotal = realInstallment.total_amount || realInstallment.amount || realInstallment.principal_amount;
        const chargeDueDate = realInstallment.due_date.split('T')[0];
        accumulatedPrincipal = 0; // Resetear para cada cargo
        
        // CORRECCIÓN: Buscar TODOS los pagos que correspondan a este cargo específico
        // No usar paymentIndex porque necesitamos buscar en todos los pagos para este cargo
        for (let pIdx = 0; pIdx < sortedPayments.length && accumulatedPrincipal < chargeTotal * 0.99; pIdx++) {
          const payment = sortedPayments[pIdx];
          
          // Si el pago ya fue asignado, saltarlo
          if (assignedPaymentIds.has(payment.id)) {
            continue;
          }
          
          // CORRECCIÓN: Verificar si este pago corresponde a este cargo específico
          // Verificar por due_date Y que no tenga interés (característica de cargos)
          const paymentDueDate = (payment.due_date as string)?.split('T')[0] || (payment.due_date as string);
          
          // CORRECCIÓN: Verificar si el pago corresponde a este cargo por:
          // 1. Mismo due_date, Y
          // 2. No tiene interés (interest_amount = 0 o muy pequeño), Y
          // 3. El monto es razonable para este cargo
          const hasNoInterest = (payment.interest_amount || 0) < 0.01;
          const reasonableAmount = (payment.principal_amount || payment.amount || 0) <= chargeTotal * 1.1;
          const paymentMatchesCharge = paymentDueDate === chargeDueDate && hasNoInterest && reasonableAmount;
          
          // Solo asignar si corresponde a este cargo y el monto es razonable
          if (paymentMatchesCharge) {
            const paymentAmount = payment.principal_amount || payment.amount || 0;
            
            // Verificar que el monto del pago no exceda el cargo pendiente
            const remainingCharge = chargeTotal - accumulatedPrincipal;
            if (paymentAmount > 0 && paymentAmount <= remainingCharge * 1.1) {
              assignedPaymentIds.add(payment.id);
              paymentToInstallmentMap.set(payment.id, i);
              accumulatedPrincipal += paymentAmount;
              
              // Si el cargo está completo, pasar al siguiente cargo
              if (accumulatedPrincipal >= chargeTotal * 0.99) {
                break;
              }
            }
          }
        }
      }
      
      // SEGUNDO: Procesar todas las cuotas regulares (excluyendo cargos)
      // CORRECCIÓN: Crear un Set de IDs de pagos ya asignados a cargos para no reutilizarlos
      const paymentsAssignedToCharges = new Set<string>();
      
      // Recopilar IDs de pagos asignados a cargos
      for (const i of chargeInstallments) {
        const realInstallment = installmentsMap.get(i);
        if (!realInstallment) continue;
        
        const chargeTotal = realInstallment.total_amount || realInstallment.amount || realInstallment.principal_amount;
        const chargeDueDate = realInstallment.due_date.split('T')[0];
        let chargeAccumulated = 0;
        
        for (const payment of sortedPayments) {
          if (paymentsAssignedToCharges.has(payment.id)) continue; // Ya asignado a otro cargo
          
          const paymentDueDate = (payment.due_date as string)?.split('T')[0] || (payment.due_date as string);
          const hasNoInterest = (payment.interest_amount || 0) < 0.01;
          const reasonableAmount = (payment.principal_amount || payment.amount || 0) <= chargeTotal * 1.1;
          const paymentMatchesCharge = paymentDueDate === chargeDueDate && hasNoInterest && reasonableAmount;
          
          if (paymentMatchesCharge && chargeAccumulated < chargeTotal * 0.99) {
            const paymentAmount = payment.principal_amount || payment.amount || 0;
            if (paymentAmount > 0 && paymentAmount <= (chargeTotal - chargeAccumulated) * 1.1) {
              paymentsAssignedToCharges.add(payment.id);
              chargeAccumulated += paymentAmount;
              if (chargeAccumulated >= chargeTotal * 0.99) break;
            }
          }
        }
      }
      
      // Crear lista de cuotas regulares ordenadas por número de cuota
      const regularInstallments: Array<{ installmentNumber: number; installment: any }> = [];
      for (let i = 1; i <= numberOfPayments; i++) {
        const realInstallment = installmentsMap.get(i);
        if (!realInstallment) continue;
        
        const isCharge = realInstallment.interest_amount === 0 && 
                         realInstallment.principal_amount > 0 && 
                         Math.abs(realInstallment.principal_amount - (realInstallment.amount || (realInstallment as any).total_amount || 0)) < 0.01;
        
        if (!isCharge) {
          regularInstallments.push({ installmentNumber: i, installment: realInstallment });
        }
        }
        
      // CORRECCIÓN: Usar los valores reales de cada cuota (principal_amount e interest_amount)
      // no calcular promedios, para que coincida con InstallmentsTable
      accumulatedPrincipal = 0;
      accumulatedInterest = 0;
      let firstPaymentDateForInstallment: string | null = null;
      paymentIndex = 0; // Resetear el índice para procesar desde el inicio

      // CORRECCIÓN CLAVE (INDEFINIDOS):
      // No acumular/redistribuir un pago grande entre múltiples cuotas.
      // En préstamos indefinidos, cada PAGO DE INTERÉS es una cuota pagada (mismo monto histórico),
      // y la cuota pendiente es la que cambia cuando hay abono a capital.
      if (amortizationType === 'indefinite') {
        const interestPaymentsOnly = sortedPayments.filter(p => {
          if (paymentsAssignedToCharges.has(p.id)) return false;
          if (assignedPaymentIds.has(p.id)) return false;
          return (p.interest_amount || 0) > 0.01;
        });

        const regularOnly = regularInstallments
          .filter(({ installment }) => (installment?.interest_amount || 0) > 0.01)
          .sort((a, b) => a.installmentNumber - b.installmentNumber);

        const assignCount = Math.min(interestPaymentsOnly.length, regularOnly.length);
        for (let idx = 0; idx < assignCount; idx++) {
          const payment = interestPaymentsOnly[idx];
          const instNum = regularOnly[idx].installmentNumber;
          assignedPaymentIds.add(payment.id);
          paymentToInstallmentMap.set(payment.id, instNum);
        }

        // Saltar la lógica de acumulación (no aplica a indefinidos)
      } else {
      
      for (const { installmentNumber: i, installment: regularInst } of regularInstallments) {
        // CORRECCIÓN: Usar los valores reales de cada cuota (principal_amount e interest_amount)
        const expectedPrincipal = regularInst.principal_amount || 0;
        const expectedInterest = regularInst.interest_amount || 0;
        
        // Resetear la fecha del primer pago para esta cuota
        firstPaymentDateForInstallment = null;
        
        // Acumular pagos hasta que se complete esta cuota (excluyendo pagos ya asignados a cargos)
        while (paymentIndex < sortedPayments.length && 
               (accumulatedPrincipal < expectedPrincipal * 0.99 || accumulatedInterest < expectedInterest * 0.99)) {
          const payment = sortedPayments[paymentIndex];
          
          // CORRECCIÓN: Saltar pagos que ya fueron asignados a cargos
          if (paymentsAssignedToCharges.has(payment.id)) {
            paymentIndex++;
            continue;
          }
          
          // Si el pago ya fue asignado a otro cargo, saltarlo
          if (assignedPaymentIds.has(payment.id)) {
            paymentIndex++;
            continue;
          }
          
          // Pagos sin interés: solo aplicarlos a esta cuota si due_date coincide con la cuota (así no se aplican pagos de cargos a cuotas regulares)
          const instDueDate = (regularInst.due_date || '').split('T')[0];
          const paymentDueDate = (payment.due_date as string)?.split('T')[0] || '';
          if ((payment.interest_amount || 0) < 0.01 && paymentDueDate !== instDueDate) {
            paymentIndex++;
            continue;
          }
          
          // Guardar la fecha del primer pago de esta cuota
          if (firstPaymentDateForInstallment === null) {
            firstPaymentDateForInstallment = payment.payment_date?.split('T')[0] || payment.payment_date || null;
          }
          
            assignedPaymentIds.add(payment.id);
            paymentToInstallmentMap.set(payment.id, i);
            accumulatedPrincipal += (payment.principal_amount || 0);
            accumulatedInterest += (payment.interest_amount || 0);
            paymentIndex++;
            
            console.log(`🔍 Acumulando pago para cuota ${i}:`, {
              paymentDate: payment.payment_date,
              principalPaid: payment.principal_amount,
              interestPaid: payment.interest_amount,
              accumulatedPrincipal,
              accumulatedInterest,
              expectedPrincipal,
              expectedInterest
            });
        }
        
        // Si se acumuló suficiente capital e interés, la cuota está completa
        if (accumulatedPrincipal >= expectedPrincipal * 0.99 && accumulatedInterest >= expectedInterest * 0.99) {
          // Restar el capital e interés usados para esta cuota (el excedente se usa para la siguiente)
          accumulatedPrincipal = Math.max(0, accumulatedPrincipal - expectedPrincipal);
          accumulatedInterest = Math.max(0, accumulatedInterest - expectedInterest);
        } else {
          // Si no hay suficiente acumulado, detener el procesamiento
          // Las cuotas siguientes están pendientes
          break;
        }
      }
      }
    }

    for (let i = 1; i <= numberOfPayments; i++) {
      // Obtener datos reales de la cuota si existe (debe estar antes de usarla)
      const realInstallment = installmentsMap.get(i);
      
      // Usar datos calculados según el tipo de amortización
      // (fallback para evitar crash si amortizationData no tiene entrada para i)
      const installmentData =
        amortizationData[i - 1] || { principalPayment: 0, interestPayment: 0, monthlyPayment: 0 };
      
      // CORRECCIÓN: Siempre usar los valores reales de la cuota cuando estén disponibles
      // Esto asegura que coincida con InstallmentsTable
      const isCharge = realInstallment && 
                       realInstallment.interest_amount === 0 && 
                       realInstallment.principal_amount > 0 && 
                       Math.abs(realInstallment.principal_amount - (realInstallment.amount || (realInstallment as any).total_amount || 0)) < 0.01;
      
      // CORRECCIÓN: Usar siempre los valores reales de la base de datos cuando estén disponibles
      // Para cuotas regulares, usar principal_amount e interest_amount reales
      // Para cargos, usar principal_amount (total del cargo)
      const originalPrincipal = realInstallment && realInstallment.principal_amount > 0
        ? realInstallment.principal_amount 
        : (isCharge && realInstallment 
            ? realInstallment.principal_amount 
            : installmentData.principalPayment);
      const originalInterest = isCharge 
        ? 0 
        : (realInstallment && realInstallment.interest_amount !== undefined && realInstallment.interest_amount !== null
            ? realInstallment.interest_amount
            : installmentData.interestPayment);
      const monthlyPayment = realInstallment && (realInstallment.amount || (realInstallment as any).total_amount)
        ? (realInstallment.amount || (realInstallment as any).total_amount || realInstallment.principal_amount)
        : installmentData.monthlyPayment;

      // Calcular fecha de vencimiento correctamente en zona horaria de Santo Domingo
      // Usar la fecha real de la cuota si existe, de lo contrario calcularla
      let dueDate: Date;
      if (realInstallment && realInstallment.due_date) {
        // Parsear la fecha de vencimiento como fecha local (no UTC) para evitar problemas de zona horaria
        const [year, month, day] = realInstallment.due_date.split('-').map(Number);
        dueDate = new Date(year, month - 1, day); // month es 0-indexado
      } else {
        // Calcular fecha basándose en la frecuencia de pago
        dueDate = new Date(startDate);
        const periodsToAdd = i - 1; // i-1 porque la primera cuota es en startDate + 1 período
        
        switch (loanData.payment_frequency) {
          case 'daily':
            dueDate.setDate(startDate.getDate() + periodsToAdd + 1);
            break;
          case 'weekly':
            dueDate.setDate(startDate.getDate() + (periodsToAdd + 1) * 7);
            break;
          case 'biweekly':
            dueDate.setDate(startDate.getDate() + (periodsToAdd + 1) * 14);
            break;
          case 'monthly':
          default:
            dueDate.setMonth(startDate.getMonth() + periodsToAdd + 1);
            break;
        }
      }

      // realInstallment ya está declarado arriba
      const isPaid = realInstallment ? realInstallment.is_paid : false;
      const isSettled = realInstallment ? (realInstallment as any).is_settled : false;
      const paidDate = realInstallment ? realInstallment.paid_date : null;

      // CORRECCIÓN: Usar la tabla installments directamente para determinar qué cuotas están pagadas
      // y buscar el pago real asociado a cada cuota para mostrar el monto correcto
      // Si la cuota no está marcada como pagada pero hay un pago que debería pagarla, asignarlo
      let principalPaidForThisInstallment = 0;
      let interestPaidForThisInstallment = 0;
      let actualPaymentAmount = 0; // Monto real pagado (puede ser diferente con acuerdos)
      let foundPayment = null;
      
      // Buscar el pago asignado a esta cuota (ya asignado en la pasada inicial)
      let paymentForThisInstallment = null;
      
      // Buscar el pago que está asignado a esta cuota
      for (const [paymentId, installmentNum] of paymentToInstallmentMap.entries()) {
        if (installmentNum === i) {
          paymentForThisInstallment = payments?.find(p => p.id === paymentId);
          break;
        }
      }
      
      if (paymentForThisInstallment) {
        // Sumar todos los pagos asignados a esta cuota (tanto para indefinidos como no indefinidos)
        const allPaymentsForThisInstallment: any[] = [];
        for (const [paymentId, installmentNum] of paymentToInstallmentMap.entries()) {
          if (installmentNum === i) {
            const payment = payments?.find(p => p.id === paymentId);
            if (payment) {
              allPaymentsForThisInstallment.push(payment);
            }
          }
        }
        
        // Sumar todos los pagos asignados a esta cuota
        principalPaidForThisInstallment = allPaymentsForThisInstallment.reduce((sum, p) => sum + (p.principal_amount || 0), 0);
        interestPaidForThisInstallment = allPaymentsForThisInstallment.reduce((sum, p) => sum + (p.interest_amount || 0), 0);
        actualPaymentAmount = allPaymentsForThisInstallment.reduce((sum, p) => sum + (p.amount || 0), 0);
        foundPayment = allPaymentsForThisInstallment[0]; // Usar el primer pago para la fecha
        
        console.log(`🔍 Cuota ${i} - Pagos acumulados:`, {
          totalPayments: allPaymentsForThisInstallment.length,
          principalPaid: principalPaidForThisInstallment,
          interestPaid: interestPaidForThisInstallment,
          actualAmount: actualPaymentAmount
        });
        
        console.log(`🔍 Cuota ${i} - Pago asignado:`, {
          paymentDate: foundPayment?.payment_date,
          paidDate,
          principalPaid: principalPaidForThisInstallment,
          interestPaid: interestPaidForThisInstallment,
          actualAmount: actualPaymentAmount,
          originalMonthlyPayment: monthlyPayment
        });
      } else if (isPaid) {
        // Si está marcada como pagada pero no encontramos pago, usar valores originales
          principalPaidForThisInstallment = originalPrincipal;
          interestPaidForThisInstallment = originalInterest;
        actualPaymentAmount = monthlyPayment;
        console.log(`⚠️ Cuota ${i} - Marcada como pagada pero no se encontró pago, usando valores originales`);
      } else if (!isPaid && payments && payments.length > 0) {
        // Para préstamos indefinidos, no buscar pagos no asignados aquí
        // porque la asignación ya se hizo con acumulación de interés arriba
        if (amortizationType === 'indefinite') {
          // No hacer nada, la asignación ya se hizo arriba
        } else {
          // Para préstamos no indefinidos, la asignación ya se hizo en la pasada inicial
          // Si no encontramos un pago asignado, la cuota está realmente sin pagar
          if (!foundPayment) {
            principalPaidForThisInstallment = 0;
            interestPaidForThisInstallment = 0;
            actualPaymentAmount = 0;
          }
        }
      } else if (!isPaid) {
        // Cuota no pagada y no hay pagos disponibles
        principalPaidForThisInstallment = 0;
        interestPaidForThisInstallment = 0;
        actualPaymentAmount = 0;
      }

      // Calcular saldos pendientes
      const remainingPrincipal = Math.max(0, originalPrincipal - principalPaidForThisInstallment);
      const remainingInterest = Math.max(0, originalInterest - interestPaidForThisInstallment);
      const remainingPayment = remainingPrincipal + remainingInterest;

      // Determinar estado de la cuota y fecha de pago
      // Si encontramos un pago para esta cuota (aunque no esté marcada como pagada), considerarla pagada
      let paymentStatus = isPaid ? 'paid' : 'pending';
      let displayPaidDate = paidDate; // Fecha de pago a mostrar
      
      // Para préstamos indefinidos, verificar cargos y cuotas de interés por separado
      if (amortizationType === 'indefinite') {
        // Si es un cargo, verificar si el total pagado cubre el cargo completo
        if (isCharge && realInstallment) {
          const chargeTotal = realInstallment.total_amount || realInstallment.amount || monthlyPayment;
          if (actualPaymentAmount >= chargeTotal * 0.99) {
            paymentStatus = 'paid';
            if (foundPayment && !displayPaidDate) {
              displayPaidDate = foundPayment.payment_date?.split('T')[0] || foundPayment.payment_date;
            }
            console.log(`🔍 Cuota ${i} - Cargo completado (indefinido):`, {
              actualAmount: actualPaymentAmount,
              chargeTotal,
              paymentDate: foundPayment?.payment_date,
              displayPaidDate
            });
          } else if (actualPaymentAmount > 0) {
            paymentStatus = 'partial';
            console.log(`🔍 Cuota ${i} - Cargo parcialmente pagado (indefinido):`, {
              actualAmount: actualPaymentAmount,
              chargeTotal,
              remaining: chargeTotal - actualPaymentAmount
            });
          }
        } else {
          // Para cuotas regulares de interés, verificar que el interés acumulado sea suficiente
        const interestPerPayment = (loanData.amount * loanData.interest_rate) / 100;
        if (interestPaidForThisInstallment >= interestPerPayment * 0.99) {
          paymentStatus = 'paid';
          if (foundPayment && !displayPaidDate) {
            displayPaidDate = foundPayment.payment_date?.split('T')[0] || foundPayment.payment_date;
          }
        } else if (interestPaidForThisInstallment > 0) {
          paymentStatus = 'partial';
          }
        }
      } else {
        // Para préstamos no indefinidos, verificar si el total acumulado cubre la cuota completa
        // Si es un cargo, verificar si el total pagado cubre el cargo completo
        if (isCharge && realInstallment) {
          const chargeTotal = realInstallment.total_amount || realInstallment.amount || monthlyPayment;
          if (actualPaymentAmount >= chargeTotal * 0.99) {
            paymentStatus = 'paid';
            if (foundPayment && !displayPaidDate) {
              displayPaidDate = foundPayment.payment_date?.split('T')[0] || foundPayment.payment_date;
            }
            console.log(`🔍 Cuota ${i} - Cargo completado:`, {
              actualAmount: actualPaymentAmount,
              chargeTotal,
              paymentDate: foundPayment?.payment_date,
              displayPaidDate
            });
          } else if (actualPaymentAmount > 0) {
            paymentStatus = 'partial';
            console.log(`🔍 Cuota ${i} - Cargo parcialmente pagado:`, {
              actualAmount: actualPaymentAmount,
              chargeTotal,
              remaining: chargeTotal - actualPaymentAmount
            });
          }
        } else {
          // Para cuotas regulares, verificar si el capital e interés acumulados cubren la cuota completa
          const expectedPrincipal = originalPrincipal;
          const expectedInterest = originalInterest;
          
          if (principalPaidForThisInstallment >= expectedPrincipal * 0.99 && 
              interestPaidForThisInstallment >= expectedInterest * 0.99) {
            paymentStatus = 'paid';
            if (foundPayment && !displayPaidDate) {
              displayPaidDate = foundPayment.payment_date?.split('T')[0] || foundPayment.payment_date;
            }
            console.log(`🔍 Cuota ${i} - Marcada como pagada basándose en acumulación:`, {
              principalPaid: principalPaidForThisInstallment,
              interestPaid: interestPaidForThisInstallment,
              expectedPrincipal,
              expectedInterest,
              actualAmount: actualPaymentAmount,
              paymentDate: foundPayment?.payment_date,
              displayPaidDate
            });
          } else if (principalPaidForThisInstallment > 0 || interestPaidForThisInstallment > 0) {
            paymentStatus = 'partial';
            console.log(`🔍 Cuota ${i} - Parcialmente pagada:`, {
              principalPaid: principalPaidForThisInstallment,
              interestPaid: interestPaidForThisInstallment,
              expectedPrincipal,
              expectedInterest
            });
          }
        }
      }
      
      // Si encontramos un pago pero no hay paidDate, usar la fecha del pago
      if (foundPayment && !displayPaidDate) {
        displayPaidDate = foundPayment.payment_date?.split('T')[0] || foundPayment.payment_date;
      }
      
      console.log(`🔍 DETERMINACIÓN DE ESTADO - Cuota ${i}:`, {
        isPaid,
        principalPaidForThisInstallment,
        interestPaidForThisInstallment,
        actualPaymentAmount,
        originalMonthlyPayment: monthlyPayment,
        paymentStatus
      });
      
      // Calcular el balance pendiente del préstamo de manera PROGRESIVA
      // LÓGICA: El capital pendiente muestra el saldo ANTES de pagar esta cuota
      // - Al agregar un cargo: afecta todas las cuotas DESDE ESA FECHA en adelante (cronológicamente)
      // - Al pagar una cuota: muestra el capital que había ANTES de pagarla (se congela)
      // - La siguiente cuota muestra el nuevo capital (después de restar el pago anterior)
      // - Los PAGOS de CARGOS solo afectan cuotas que vienen DESPUÉS del cargo (por fecha)
      
      let totalChargesPaidBeforeThisDate = 0;
      let totalCapitalPaidBeforeThisInstallment = 0;
      
      const isCurrentCharge = isChargeInstallment(realInstallment);
      const currentDueDate = new Date(dueDate);
      
      // PASO 1: Calcular pagos de cargos que vienen ANTES de esta cuota (por fecha de vencimiento)
      // Solo afectan el capital pendiente si el cargo vence ANTES o AL MISMO TIEMPO que esta cuota
      for (let j = 1; j <= numberOfPayments; j++) {
        const prevInstallment = installmentsMap.get(j);
        if (!prevInstallment) continue;
        
        const isPrevCharge = isChargeInstallment(prevInstallment);
        
        if (isPrevCharge) {
          const chargeDueDate = new Date(prevInstallment.due_date);
          
          // Solo incluir cargos que vencen ANTES de la fecha de esta cuota
          // Excluir el cargo si es la cuota actual (para mostrar el saldo antes de su propio pago)
          const isBeforeCurrentDate = chargeDueDate < currentDueDate;
          const isCurrentInstallment = j === i;
          
          if (isBeforeCurrentDate && !isCurrentInstallment) {
            // Buscar pagos asignados a este cargo
            const chargePayments: any[] = [];
            for (const [paymentId, installmentNum] of paymentToInstallmentMap.entries()) {
              if (installmentNum === j) {
                const payment = payments?.find(p => p.id === paymentId);
                if (payment) {
                  chargePayments.push(payment);
                }
              }
            }
            
            const chargePaid = chargePayments.reduce((sum, p) => sum + (p.principal_amount || p.amount || 0), 0);
            totalChargesPaidBeforeThisDate += chargePaid;
            
            console.log(`🔍 Cargo ${j} - Sumando al total (fecha anterior):`, {
              chargeDueDate: chargeDueDate.toISOString().split('T')[0],
              currentDueDate: currentDueDate.toISOString().split('T')[0],
              chargePaid,
              totalChargesPaidSoFar: totalChargesPaidBeforeThisDate
            });
          }
        }
      }
      
      // PASO 2: Calcular pagos de cuotas regulares ANTES de la cuota actual (por número de cuota)
      // Las cuotas regulares solo afectan el capital progresivamente
      for (let j = 1; j < i; j++) {
        const prevInstallment = installmentsMap.get(j);
        if (!prevInstallment) continue;
        
        const isPrevCharge = isChargeInstallment(prevInstallment);
        
        if (!isPrevCharge) {
          // Buscar pagos asignados a esta cuota regular
          const installmentPayments: any[] = [];
          for (const [paymentId, installmentNum] of paymentToInstallmentMap.entries()) {
            if (installmentNum === j) {
              const payment = payments?.find(p => p.id === paymentId);
              if (payment) {
                installmentPayments.push(payment);
              }
            }
          }
          
          // Sumar el capital pagado de esta cuota
          const installmentPrincipalPaid = installmentPayments.reduce((sum, p) => sum + (p.principal_amount || 0), 0);
          totalCapitalPaidBeforeThisInstallment += installmentPrincipalPaid;
        }
      }
      
      // Capital pendiente ANTES de pagar esta cuota: 
      // (Capital original + TODOS los cargos) - (Pagos de capital antes + Pagos de cargos con fecha anterior)
      const remainingBalanceAfterThisInstallment = Math.max(
        0,
        (principal + totalChargesAll) - (totalCapitalPaidBeforeThisInstallment + totalChargesPaidBeforeThisDate)
      );

      console.log(`🔍 RESUMEN FINAL - Cuota ${i}:`, {
        exists: !!realInstallment,
        isPaid,
        paidDate,
        dueDate: dueDate.toISOString().split('T')[0],
        originalPrincipal,
        originalInterest,
        principalPaidForThisInstallment,
        interestPaidForThisInstallment,
        actualPaymentAmount,
        monthlyPayment,
        remainingPrincipal,
        remainingInterest,
        remainingPayment,
        paymentStatus,
        isCurrentCharge,
        totalCapitalPaidBeforeThisInstallment,
        totalChargesPaidBeforeThisDate,
        totalChargesAll,
        remainingBalanceAfterThisInstallment,
        ESTADO_FINAL: paymentStatus === 'paid' ? '✅ PAGADO' : paymentStatus === 'partial' ? '⚠️ PARCIAL' : '❌ PENDIENTE'
      });

      // Determinar el monto a mostrar: si hay un pago encontrado (pagada o no), usar el monto real, sino usar el monto de la cuota
      const displayAmount = (paymentStatus === 'paid' && actualPaymentAmount > 0) ? actualPaymentAmount : monthlyPayment;
      
      console.log(`🔍 Cuota ${i} - Monto a mostrar:`, {
        isPaid,
        paymentStatus,
        actualPaymentAmount,
        monthlyPayment,
        displayAmount,
        foundPayment: !!foundPayment
      });

      schedule.push({
        installment: isIndefinite ? `${i}/X` : i,
        dueDate: dueDate.toISOString().split('T')[0],
        monthlyPayment: displayAmount, // Mostrar monto real pagado si existe, sino el monto de la cuota
        principalPayment: originalPrincipal,
        interestPayment: originalInterest,
        principalPaid: principalPaidForThisInstallment,
        interestPaid: interestPaidForThisInstallment,
        remainingPrincipal: remainingPrincipal,
        remainingInterest: remainingInterest,
        remainingPayment: remainingPayment,
        remainingBalance: remainingBalanceAfterThisInstallment,
        isPaid: paymentStatus === 'paid',
        isPartial: paymentStatus === 'partial',
        isSettled: isSettled && !isPaid, // Saldada solo si está saldada pero no pagada individualmente
        paidDate: displayPaidDate, // Usar la fecha de pago correcta (del pago encontrado o de la cuota)
        hasRealData: !!realInstallment,
        paymentStatus,
        actualPaymentAmount // Guardar el monto real pagado para referencia
      });
    }

    console.log('🔍 AccountStatement: Tabla de amortización generada:', schedule);
    
    // Ordenar las cuotas por fecha de vencimiento (y por número de cuota como orden secundario)
    const sortedSchedule = schedule.sort((a, b) => {
      // Primero ordenar por fecha de vencimiento
      if (a.dueDate && b.dueDate) {
        const dateA = new Date(a.dueDate);
        const dateB = new Date(b.dueDate);
        const dateDiff = dateA.getTime() - dateB.getTime();
        if (dateDiff !== 0) {
          return dateDiff;
        }
      }
      // Si las fechas son iguales o no hay fecha, ordenar por número de cuota
      const numA = typeof a.installment === 'number' ? a.installment : parseInt(a.installment.toString().split('/')[0]) || 0;
      const numB = typeof b.installment === 'number' ? b.installment : parseInt(b.installment.toString().split('/')[0]) || 0;
      return numA - numB;
    });
    
    return sortedSchedule;
  };


  const getPaymentMethodLabel = (method: string) => {
    const methods = {
      cash: 'Efectivo',
      bank_transfer: 'Transferencia',
      check: 'Cheque',
      card: 'Tarjeta',
      online: 'En línea'
    };
    return methods[method as keyof typeof methods] || method;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <Badge variant="secondary" className="bg-green-100 text-green-800">
            <CheckCircle className="h-3 w-3 mr-1" />
            Completado
          </Badge>
        );
      case 'pending':
        return (
          <Badge variant="outline">
            <Clock className="h-3 w-3 mr-1" />
            Pendiente
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="destructive">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Fallido
          </Badge>
        );
      default:
        return (
          <Badge variant="outline">
            {status}
          </Badge>
        );
    }
  };

  const calculateTotals = () => {
    const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);
    const totalPrincipal = payments.reduce((sum, payment) => sum + payment.principal_amount, 0);
    const totalInterest = payments.reduce((sum, payment) => sum + payment.interest_amount, 0);
    const totalLateFee = payments.reduce((sum, payment) => sum + payment.late_fee, 0);
    
    return {
      totalPaid,
      totalPrincipal,
      totalInterest,
      totalLateFee
    };
  };

  const handleViewReceipt = (payment: Payment) => {
    setSelectedPayment(payment);
    setShowReceiptModal(true);
  };

  const printReceipt = (payment: Payment) => {
    if (!loan || !payment) return;

    const printWindow = window.open('', '_blank');
    
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Recibo de Pago - ${loan.clients.full_name}</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; }
              .header { text-align: center; margin-bottom: 30px; }
              .header h1 { color: #2563eb; margin: 0; }
              .header h2 { color: #666; margin: 5px 0; }
              .info { margin-bottom: 20px; }
              .info table { width: 100%; border-collapse: collapse; }
              .info td { padding: 5px; border-bottom: 1px solid #eee; }
              .info td:first-child { font-weight: bold; width: 30%; }
              .payment-details { background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0; }
              .payment-details h3 { margin-top: 0; color: #2563eb; }
              .payment-details table { width: 100%; }
              .payment-details td { padding: 5px; }
              .payment-details .total { font-weight: bold; font-size: 1.1em; }
              .footer { margin-top: 30px; text-align: center; color: #666; font-size: 0.9em; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>RECIBO DE PAGO</h1>
              <h2>${loan.clients.full_name}</h2>
              <p>Fecha de emisión: ${formatDate(statementDate)}</p>
            </div>

            <div class="info">
              <table>
                <tr><td>Cliente:</td><td>${loan.clients.full_name}</td></tr>
                <tr><td>Cédula:</td><td>${loan.clients.dni}</td></tr>
                <tr><td>Fecha de Pago:</td><td>${formatDateTime(payment)}</td></tr>
                <tr><td>Método de Pago:</td><td>${getPaymentMethodLabel(payment.payment_method)}</td></tr>
                ${payment.reference_number ? `<tr><td>Referencia:</td><td>${payment.reference_number}</td></tr>` : ''}
              </table>
            </div>

            <div class="payment-details">
              <h3>Detalle del Pago</h3>
              <table>
                <tr><td>Monto Total:</td><td class="total">${formatCurrency(payment.amount + (payment.late_fee || 0))}</td></tr>
                <tr><td>A Principal:</td><td>${formatCurrency(payment.principal_amount)}</td></tr>
                <tr><td>A Intereses:</td><td>${formatCurrency(payment.interest_amount || Math.max(0, payment.amount - (payment.principal_amount || 0)))}</td></tr>
                <tr><td>Mora:</td><td>${formatCurrency(payment.late_fee)}</td></tr>
                <tr><td>Estado:</td><td>${payment.status}</td></tr>
              </table>
            </div>

            ${payment.notes ? `
              <div class="payment-details">
                <h3>Notas</h3>
                <p>${translatePaymentNotes(payment.notes)}</p>
              </div>
            ` : ''}

            <div class="footer">
              <p>Este recibo fue generado automáticamente el ${formatDate(statementDate)}</p>
              <p>Sistema de Gestión de Préstamos</p>
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  };

  const exportToPDF = () => {
    if (!loan) return;

    const totals = calculateTotals();
    const printWindow = window.open('', '_blank');
    
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Estado de Cuenta - ${loan.clients.full_name}</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; font-size: 12px; }
              .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #2563eb; padding-bottom: 15px; }
              .header h1 { color: #2563eb; margin: 0; font-size: 24px; }
              .header h2 { color: #666; margin: 5px 0; font-size: 18px; }
              .header p { color: #888; margin: 5px 0; }
              
              .section { margin-bottom: 25px; page-break-inside: avoid; }
              .section h3 { color: #2563eb; margin-bottom: 10px; font-size: 16px; border-bottom: 1px solid #ddd; padding-bottom: 5px; }
              
              .info-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
              .info-table td { padding: 8px; border-bottom: 1px solid #eee; }
              .info-table td:first-child { font-weight: bold; width: 30%; background-color: #f8f9fa; }
              
              .summary-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; margin-bottom: 20px; }
              .summary-card { background: #f8f9fa; padding: 15px; border-radius: 5px; text-align: center; }
              .summary-card .amount { font-size: 18px; font-weight: bold; margin-bottom: 5px; }
              .summary-card .label { font-size: 12px; color: #666; }
              .summary-card.total-paid .amount { color: #2563eb; }
              .summary-card.principal .amount { color: #059669; }
              .summary-card.interest .amount { color: #ea580c; }
              .summary-card.late-fee-paid .amount { color: #dc2626; }
              .summary-card.current-late-fee .amount { color: #d97706; }
              .summary-card.payment-count .amount { color: #7c3aed; }
              
              .table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
              .table th, .table td { padding: 6px; text-align: left; border: 1px solid #ddd; }
              .table th { background-color: #f8f9fa; font-weight: bold; }
              .table tr:nth-child(even) { background-color: #f9f9f9; }
              
              .status-badge { padding: 2px 6px; border-radius: 3px; font-size: 10px; font-weight: bold; }
              .status-paid { background-color: #dcfce7; color: #166534; }
              .status-settled { background-color: #dbeafe; color: #1e40af; }
              .status-partial { background-color: #fed7aa; color: #c2410c; }
              .status-pending { background-color: #fef3c7; color: #92400e; }
              .status-failed { background-color: #fee2e2; color: #991b1b; }
              
              .footer { margin-top: 30px; text-align: center; color: #666; font-size: 10px; border-top: 1px solid #ddd; padding-top: 15px; }
              
              @media print {
                body { margin: 10px; }
                .section { page-break-inside: avoid; }
              }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>ESTADO DE CUENTA</h1>
              <h2>${loan.clients.full_name}</h2>
              <p>Cédula: ${loan.clients.dni} | Fecha de emisión: ${formatDate(statementDate)}</p>
            </div>

            <div class="section">
              <h3>Información del Préstamo</h3>
              <table class="info-table">
                <tr><td>Cliente:</td><td>${loan.clients.full_name}</td></tr>
                <tr><td>Cédula:</td><td>${loan.clients.dni}</td></tr>
                <tr><td>Monto Original:</td><td>${formatCurrency(loan.amount)}</td></tr>
                <tr><td>Balance Restante:</td><td>${formatCurrency(loan.remaining_balance)}</td></tr>
                <tr><td>Cuota Mensual:</td><td>${formatCurrency(loan.monthly_payment)}</td></tr>
                <tr><td>Tasa de Interés:</td><td>${loan.interest_rate}%</td></tr>
                <tr><td>Fecha de Inicio:</td><td>${formatDate(loan.start_date)}</td></tr>
                <tr><td>Próximo Pago:</td><td>${
                  (loan.status === 'paid' || loan.remaining_balance === 0)
                    ? 'N/A'
                    : (String(loan?.amortization_type || '').toLowerCase() === 'indefinite'
                        ? (() => {
                            const next = (amortizationSchedule || []).find((r: any) => r?.paymentStatus !== 'paid' && !!r?.dueDate);
                            return next?.dueDate ? formatDate(next.dueDate) : 'N/A';
                          })()
                        : (loan.next_payment_date ? formatDate(loan.next_payment_date) : 'N/A'))
                }</td></tr>
                <tr><td>Estado:</td><td>${loan.status}</td></tr>
              </table>
            </div>

            <div class="section">
              <h3>Resumen de Pagos</h3>
              <div class="summary-grid">
                <div class="summary-card total-paid">
                  <div class="amount">${formatCurrency(totals.totalPaid)}</div>
                  <div class="label">Total Pagado</div>
                </div>
                <div class="summary-card principal">
                  <div class="amount">${formatCurrency(totals.totalPrincipal)}</div>
                  <div class="label">A Principal</div>
                </div>
                <div class="summary-card interest">
                  <div class="amount">${formatCurrency(totals.totalInterest)}</div>
                  <div class="label">A Intereses</div>
                </div>
                <div class="summary-card late-fee-paid">
                  <div class="amount">${formatCurrency(totals.totalLateFee)}</div>
                  <div class="label">Mora Pagada</div>
                </div>
                ${loan.status !== 'paid' ? `
                <div class="summary-card current-late-fee">
                  <div class="amount">${formatCurrency(currentLateFee)}</div>
                  <div class="label">Mora Actual</div>
                </div>
                ` : ''}
                <div class="summary-card payment-count">
                  <div class="amount">${payments.length}</div>
                  <div class="label">Número de Pagos</div>
                </div>
              </div>
            </div>

            <div class="section">
              <h3>Tabla de Amortización</h3>
              <table class="table">
                <thead>
                  <tr>
                    <th>Cuota</th>
                    <th>Fecha Vencimiento</th>
                    <th>Cuota Mensual</th>
                    <th>Capital</th>
                    <th>Interés</th>
                    <th>Capital Pendiente</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  ${amortizationSchedule.map(installment => `
                    <tr style="${installment.isSettled ? 'background-color: #eff6ff;' : installment.isPaid ? 'background-color: #f0fdf4;' : installment.isPartial ? 'background-color: #fef3c7;' : ''}">
                      <td style="padding: 6px; text-align: left; border: 1px solid #ddd; font-weight: bold;">
                        ${installment.installment}
                        ${installment.isSettled ? ' 🔵' : installment.isPaid ? ' ✅' : installment.isPartial ? ' ⚠️' : ''}
                      </td>
                      <td style="padding: 6px; text-align: left; border: 1px solid #ddd;">${formatDate(installment.dueDate)}</td>
                      <td style="padding: 6px; text-align: left; border: 1px solid #ddd;">
                        <div style="${installment.isPaid ? 'color: #16a34a; text-decoration: line-through;' : installment.isPartial ? 'color: #ea580c;' : 'color: #2563eb; font-weight: bold;'}">
                          ${formatCurrency(installment.monthlyPayment)}
                        </div>
                        ${installment.isPaid && installment.paidDate ? `
                          <div style="font-size: 10px; color: #16a34a; margin-top: 2px;">
                            Pagado: ${formatDate(installment.paidDate)}
                          </div>
                        ` : ''}
                        ${installment.isPartial && installment.remainingPayment > 0 ? `
                          <div style="font-size: 10px; color: #ea580c; margin-top: 2px;">
                            Falta: ${formatCurrency(installment.remainingPayment)}
                          </div>
                        ` : ''}
                      </td>
                      <td style="padding: 6px; text-align: left; border: 1px solid #ddd; ${installment.isPaid ? 'color: #16a34a; text-decoration: line-through;' : installment.isPartial ? 'color: #ea580c;' : ''}">
                        ${formatCurrency(installment.principalPayment)}
                        ${installment.isPartial && installment.remainingPrincipal > 0 ? `
                          <div style="font-size: 10px; color: #ea580c; margin-top: 2px;">
                            Falta: ${formatCurrency(installment.remainingPrincipal)}
                          </div>
                        ` : ''}
                      </td>
                      <td style="padding: 6px; text-align: left; border: 1px solid #ddd; ${installment.isPaid ? 'color: #16a34a; text-decoration: line-through;' : installment.isPartial ? 'color: #ea580c;' : ''}">
                        ${formatCurrency(installment.interestPayment)}
                        ${installment.isPartial && installment.remainingInterest > 0 ? `
                          <div style="font-size: 10px; color: #ea580c; margin-top: 2px;">
                            Falta: ${formatCurrency(installment.remainingInterest)}
                          </div>
                        ` : ''}
                      </td>
                      <td style="padding: 6px; text-align: left; border: 1px solid #ddd; ${installment.isPaid ? 'color: #16a34a; text-decoration: line-through;' : ''}">
                        ${formatCurrency(installment.remainingBalance)}
                      </td>
                      <td style="padding: 6px; text-align: left; border: 1px solid #ddd;">
                        <span class="status-badge ${installment.isSettled ? 'status-settled' : installment.isPaid ? 'status-paid' : installment.isPartial ? 'status-partial' : 'status-pending'}">
                          ${installment.isSettled ? 'Saldada' : installment.isPaid ? 'Pagado' : installment.isPartial ? 'Parcial' : 'Pendiente'}
                        </span>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>

            <div class="section">
              <h3>Historial de Pagos</h3>
              ${payments.length > 0 ? `
                <table class="table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Monto</th>
                    <th>Principal</th>
                    <th>Interés</th>
                    <th>Mora</th>
                    <th>Método</th>
                    <th>Estado</th>
                      <th>Referencia</th>
                  </tr>
                </thead>
                <tbody>
                  ${payments.map(payment => `
                    <tr>
                      <td>${formatDateTime(payment)}</td>
                      <td>${formatCurrency(payment.amount + (payment.late_fee || 0))}</td>
                      <td>${formatCurrency(payment.principal_amount)}</td>
                      <td>${formatCurrency(payment.interest_amount || Math.max(0, payment.amount - (payment.principal_amount || 0)))}</td>
                      <td>${formatCurrency(payment.late_fee)}</td>
                      <td>${getPaymentMethodLabel(payment.payment_method)}</td>
                        <td>
                          <span class="status-badge status-${payment.status}">
                            ${payment.status === 'completed' ? 'Completado' : 
                              payment.status === 'pending' ? 'Pendiente' : 
                              payment.status === 'failed' ? 'Fallido' : payment.status}
                          </span>
                        </td>
                        <td>${payment.reference_number || '-'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
              ` : `
                <p style="text-align: center; color: #666; font-style: italic; padding: 20px;">
                  No se han registrado pagos para este préstamo
                </p>
              `}
            </div>

            <div class="footer">
              <p><strong>ESTADO DE CUENTA GENERADO AUTOMÁTICAMENTE</strong></p>
              <p>Fecha de emisión: ${formatDate(statementDate)} | Sistema de Gestión de Préstamos</p>
              <p>Este documento es válido únicamente en la fecha de emisión</p>
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();
      
      // Esperar a que el contenido se cargue antes de imprimir
      setTimeout(() => {
      printWindow.print();
      }, 500);
    }
  };

  const printStatement = () => {
    if (!loan) return;

    const totals = calculateTotals();
    
    // Crear un elemento temporal para el contenido de impresión
    const printContent = document.createElement('div');
    printContent.style.position = 'absolute';
    printContent.style.left = '-9999px';
    printContent.style.top = '-9999px';
    printContent.innerHTML = `
      <div style="font-family: Arial, sans-serif; margin: 20px; font-size: 12px;">
        <div style="text-align: center; margin-bottom: 30px; border-bottom: 2px solid #2563eb; padding-bottom: 15px;">
          <h1 style="color: #2563eb; margin: 0; font-size: 24px;">ESTADO DE CUENTA</h1>
          <h2 style="color: #666; margin: 5px 0; font-size: 18px;">${loan.clients.full_name}</h2>
          <p style="color: #888; margin: 5px 0;">Cédula: ${loan.clients.dni} | Fecha de emisión: ${formatDate(statementDate)}</p>
        </div>

        <div style="margin-bottom: 25px;">
          <h3 style="color: #2563eb; margin-bottom: 10px; font-size: 16px; border-bottom: 1px solid #ddd; padding-bottom: 5px;">Información del Préstamo</h3>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold; width: 30%; background-color: #f8f9fa;">Cliente:</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${loan.clients.full_name}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold; background-color: #f8f9fa;">Cédula:</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${loan.clients.dni}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold; background-color: #f8f9fa;">Monto Original:</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${formatCurrency(loan.amount)}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold; background-color: #f8f9fa;">Balance Restante:</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${formatCurrency(loan.remaining_balance)}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold; background-color: #f8f9fa;">Cuota Mensual:</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${formatCurrency(loan.monthly_payment)}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold; background-color: #f8f9fa;">Tasa de Interés:</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${loan.interest_rate}%</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold; background-color: #f8f9fa;">Fecha de Inicio:</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${formatDate(loan.start_date)}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold; background-color: #f8f9fa;">Próximo Pago:</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${
              (loan.status === 'paid' || loan.remaining_balance === 0)
                ? 'N/A'
                : (String(loan?.amortization_type || '').toLowerCase() === 'indefinite'
                    ? (() => {
                        const next = (amortizationSchedule || []).find((r: any) => r?.paymentStatus !== 'paid' && !!r?.dueDate);
                        return next?.dueDate ? formatDate(next.dueDate) : 'N/A';
                      })()
                    : (loan.next_payment_date ? formatDate(loan.next_payment_date) : 'N/A'))
            }</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold; background-color: #f8f9fa;">Estado:</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${loan.status}</td></tr>
          </table>
        </div>

        <div style="margin-bottom: 25px;">
          <h3 style="color: #2563eb; margin-bottom: 10px; font-size: 16px; border-bottom: 1px solid #ddd; padding-bottom: 5px;">Resumen de Pagos</h3>
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; margin-bottom: 20px;">
            <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; text-align: center;">
              <div style="font-size: 18px; font-weight: bold; margin-bottom: 5px; color: #2563eb;">${formatCurrency(totals.totalPaid)}</div>
              <div style="font-size: 12px; color: #666;">Total Pagado</div>
            </div>
            <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; text-align: center;">
              <div style="font-size: 18px; font-weight: bold; margin-bottom: 5px; color: #059669;">${formatCurrency(totals.totalPrincipal)}</div>
              <div style="font-size: 12px; color: #666;">A Principal</div>
            </div>
            <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; text-align: center;">
              <div style="font-size: 18px; font-weight: bold; margin-bottom: 5px; color: #ea580c;">${formatCurrency(totals.totalInterest)}</div>
              <div style="font-size: 12px; color: #666;">A Intereses</div>
            </div>
            <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; text-align: center;">
              <div style="font-size: 18px; font-weight: bold; margin-bottom: 5px; color: #dc2626;">${formatCurrency(totals.totalLateFee)}</div>
              <div style="font-size: 12px; color: #666;">Mora Pagada</div>
            </div>
            ${loan.status !== 'paid' ? `
            <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; text-align: center;">
              <div style="font-size: 18px; font-weight: bold; margin-bottom: 5px; color: #d97706;">${formatCurrency(currentLateFee)}</div>
              <div style="font-size: 12px; color: #666;">Mora Actual</div>
            </div>
            ` : ''}
            <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; text-align: center;">
              <div style="font-size: 18px; font-weight: bold; margin-bottom: 5px; color: #7c3aed;">${payments.length}</div>
              <div style="font-size: 12px; color: #666;">Número de Pagos</div>
            </div>
          </div>
        </div>

        <div style="margin-bottom: 25px;">
          <h3 style="color: #2563eb; margin-bottom: 10px; font-size: 16px; border-bottom: 1px solid #ddd; padding-bottom: 5px;">Historial de Pagos</h3>
          ${payments.length > 0 ? `
            <table style="width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px;">
              <thead>
                <tr>
                  <th style="padding: 6px; text-align: left; border: 1px solid #ddd; background-color: #f8f9fa; font-weight: bold;">Fecha</th>
                  <th style="padding: 6px; text-align: left; border: 1px solid #ddd; background-color: #f8f9fa; font-weight: bold;">Monto</th>
                  <th style="padding: 6px; text-align: left; border: 1px solid #ddd; background-color: #f8f9fa; font-weight: bold;">Principal</th>
                  <th style="padding: 6px; text-align: left; border: 1px solid #ddd; background-color: #f8f9fa; font-weight: bold;">Interés</th>
                  <th style="padding: 6px; text-align: left; border: 1px solid #ddd; background-color: #f8f9fa; font-weight: bold;">Mora</th>
                  <th style="padding: 6px; text-align: left; border: 1px solid #ddd; background-color: #f8f9fa; font-weight: bold;">Método</th>
                  <th style="padding: 6px; text-align: left; border: 1px solid #ddd; background-color: #f8f9fa; font-weight: bold;">Estado</th>
                </tr>
              </thead>
              <tbody>
                ${payments.map(payment => `
                  <tr style="background-color: #f9f9f9;">
                    <td style="padding: 6px; text-align: left; border: 1px solid #ddd;">${formatDateTime(payment)}</td>
                    <td style="padding: 6px; text-align: left; border: 1px solid #ddd;">${formatCurrency(payment.amount + (payment.late_fee || 0))}</td>
                    <td style="padding: 6px; text-align: left; border: 1px solid #ddd;">${formatCurrency(payment.principal_amount)}</td>
                    <td style="padding: 6px; text-align: left; border: 1px solid #ddd;">${formatCurrency(payment.interest_amount || Math.max(0, payment.amount - (payment.principal_amount || 0)))}</td>
                    <td style="padding: 6px; text-align: left; border: 1px solid #ddd;">${formatCurrency(payment.late_fee)}</td>
                    <td style="padding: 6px; text-align: left; border: 1px solid #ddd;">${getPaymentMethodLabel(payment.payment_method)}</td>
                    <td style="padding: 6px; text-align: left; border: 1px solid #ddd;">${payment.status}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : `
            <p style="text-align: center; color: #666; font-style: italic; padding: 20px;">
              No se han registrado pagos para este préstamo
            </p>
          `}
        </div>

        <div style="margin-top: 30px; text-align: center; color: #666; font-size: 10px; border-top: 1px solid #ddd; padding-top: 15px;">
          <p><strong>ESTADO DE CUENTA GENERADO AUTOMÁTICAMENTE</strong></p>
          <p>Fecha de emisión: ${formatDate(statementDate)} | Sistema de Gestión de Préstamos</p>
          <p>Este documento es válido únicamente en la fecha de emisión</p>
        </div>
      </div>
    `;

    document.body.appendChild(printContent);
    
    // Imprimir
    window.print();
    
    // Limpiar
    document.body.removeChild(printContent);
  };

  const totals = calculateTotals();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Estado de Cuenta
              {loan && (
                <span className="text-sm font-normal text-gray-600">
                  - {loan.clients.full_name}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchAccountData}
                disabled={loading}
                className="flex items-center gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Actualizar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={printStatement}
                className="flex items-center gap-2"
              >
                <Printer className="h-4 w-4" />
                Imprimir
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={exportToPDF}
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Exportar PDF
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
              <p className="text-gray-600">Cargando estado de cuenta...</p>
            </div>
          </div>
        ) : !loan ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <FileText className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <p className="text-gray-600">No se encontró información del préstamo</p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Información del préstamo */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Información del Préstamo</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Cliente:</span>
                    <div className="font-semibold">{loan.clients.full_name}</div>
                  </div>
                  <div>
                    <span className="text-gray-600">Cédula:</span>
                    <div className="font-semibold">{loan.clients.dni}</div>
                  </div>
                  <div>
                    <span className="text-gray-600">Monto Original:</span>
                    <div className="font-semibold">{formatCurrency(loan.amount)}</div>
                  </div>
                  <div>
                    <span className="text-gray-600">Balance Restante:</span>
                    <div className="font-semibold">{formatCurrency(loan.remaining_balance)}</div>
                  </div>
                  <div>
                    <span className="text-gray-600">Cuota Mensual:</span>
                    <div className="font-semibold">{formatCurrency(loan.monthly_payment)}</div>
                  </div>
                  <div>
                    <span className="text-gray-600">Tasa de Interés:</span>
                    <div className="font-semibold">{loan.interest_rate}%</div>
                  </div>
                  <div>
                    <span className="text-gray-600">Fecha de Inicio:</span>
                    <div className="font-semibold">{formatDate(loan.start_date)}</div>
                  </div>
                  <div>
                    <span className="text-gray-600">Próximo Pago:</span>
                    <div className="font-semibold">
                      {(() => {
                        if (loan.status === 'paid' || loan.remaining_balance === 0) return 'N/A';
                        const amort = String(loan?.amortization_type || '').toLowerCase();
                        if (amort === 'indefinite') {
                          const next = (amortizationSchedule || []).find((r: any) => r?.paymentStatus !== 'paid' && !!r?.dueDate);
                          return next?.dueDate ? formatDate(next.dueDate) : 'N/A';
                        }
                        return loan.next_payment_date ? formatDate(loan.next_payment_date) : 'N/A';
                      })()}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Resumen de pagos */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Resumen de Pagos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                  <div className="text-center p-3 bg-blue-50 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">{formatCurrency(totals.totalPaid)}</div>
                    <div className="text-sm text-gray-600">Total Pagado</div>
                  </div>
                  <div className="text-center p-3 bg-green-50 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">{formatCurrency(totals.totalPrincipal)}</div>
                    <div className="text-sm text-gray-600">A Principal</div>
                  </div>
                  <div className="text-center p-3 bg-orange-50 rounded-lg">
                    <div className="text-2xl font-bold text-orange-600">{formatCurrency(totals.totalInterest)}</div>
                    <div className="text-sm text-gray-600">A Intereses</div>
                  </div>
                  <div className="text-center p-3 bg-red-50 rounded-lg">
                    <div className="text-2xl font-bold text-red-600">{formatCurrency(totals.totalLateFee)}</div>
                    <div className="text-sm text-gray-600">Mora Pagada</div>
                  </div>
                {loan?.status !== 'paid' && (
                  <div className="text-center p-3 bg-yellow-50 rounded-lg">
                    <div className="text-2xl font-bold text-yellow-600">{formatCurrency(currentLateFee)}</div>
                    <div className="text-sm text-gray-600">Mora Actual</div>
                  </div>
                )}
                  <div className="text-center p-3 bg-purple-50 rounded-lg">
                    <div className="text-2xl font-bold text-purple-600">{payments.length}</div>
                    <div className="text-sm text-gray-600">Número de Pagos</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Tabla de Amortización */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Tabla de Amortización</CardTitle>
                <div className="flex flex-col sm:flex-row gap-4 mt-4">
                  {/* Filtro de período */}
                  <div className="flex gap-2">
                    <Select value={amortizationPeriod} onValueChange={setAmortizationPeriod}>
                      <SelectTrigger className="w-[160px]">
                        <SelectValue placeholder="Período" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Toda la Tabla</SelectItem>
                        <SelectItem value="2">Próximos 2 Meses</SelectItem>
                        <SelectItem value="3">Próximos 3 Meses</SelectItem>
                        <SelectItem value="6">Próximos 6 Meses</SelectItem>
                        <SelectItem value="12">Próximos 12 Meses</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="mt-2 text-sm text-gray-600 bg-blue-50 p-3 rounded-lg border border-blue-200">
                  💡 <strong>Tabla Interactiva:</strong> Las cuotas pagadas se marcan en verde y mantienen su numeración original. 
                  Al pagar una cuota, se actualiza automáticamente el estado sin cambiar las fechas de vencimiento.
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left p-3 font-semibold">Cuota</th>
                        <th className="text-left p-3 font-semibold">Fecha Vencimiento</th>
                        <th className="text-left p-3 font-semibold">Cuota Mensual</th>
                        <th className="text-left p-3 font-semibold">Capital</th>
                        <th className="text-left p-3 font-semibold">Interés</th>
                        <th className="text-left p-3 font-semibold">Capital Pendiente</th>
                        <th className="text-left p-3 font-semibold">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {amortizationSchedule
                        .filter((_, index) => {
                          if (amortizationPeriod === 'all') return true;
                          const limit = parseInt(amortizationPeriod);
                          return index < limit;
                        })
                        .map((installment) => (
                          <tr key={(installment as any).rowKey || installment.installment} className={`border-b hover:bg-gray-50 ${(installment as any).isSettled ? 'bg-blue-50' : installment.isPaid ? 'bg-green-50' : ''}`}>
                            <td className="p-3">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{installment.installment}</span>
                                {(installment as any).isSettled ? (
                                  <CheckCircle className="h-4 w-4 text-blue-600" />
                                ) : installment.isPaid && (
                                  <CheckCircle className="h-4 w-4 text-green-600" />
                                )}
                              </div>
                            </td>
                            <td className="p-3">{formatDate(installment.dueDate)}</td>
                            <td className="p-3">
                              <div className={`font-semibold ${installment.isPaid ? 'text-green-600 line-through' : installment.isPartial ? 'text-orange-600' : 'text-blue-600'}`}>
                              {formatCurrency(installment.monthlyPayment)}
                              </div>
                              {installment.isPaid && installment.paidDate && (
                                <div className="text-xs text-green-600 mt-1">
                                  Pagado: {formatDate(installment.paidDate)}
                                </div>
                              )}
                              {installment.isPartial && installment.remainingPayment > 0 && (
                                <div className="text-xs text-orange-600 mt-1">
                                  Falta: {formatCurrency(installment.remainingPayment)}
                                </div>
                              )}
                            </td>
                            <td className="p-3">
                              <div className={installment.isPaid ? 'text-green-600 line-through' : installment.isPartial ? 'text-orange-600' : ''}>
                                {formatCurrency(installment.principalPayment)}
                              </div>
                              {installment.isPartial && installment.remainingPrincipal > 0 && (
                                <div className="text-xs text-orange-600 mt-1">
                                  Falta: {formatCurrency(installment.remainingPrincipal)}
                                </div>
                              )}
                            </td>
                            <td className="p-3">
                              <div className={installment.isPaid ? 'text-green-600 line-through' : installment.isPartial ? 'text-orange-600' : ''}>
                                {formatCurrency(installment.interestPayment)}
                              </div>
                              {installment.isPartial && installment.remainingInterest > 0 && (
                                <div className="text-xs text-orange-600 mt-1">
                                  Falta: {formatCurrency(installment.remainingInterest)}
                                </div>
                              )}
                            </td>
                            <td className="p-3">
                              <div className={
                                installment.isPaid 
                                  ? 'text-green-600 line-through' 
                                  : installment.isPartial 
                                    ? 'text-orange-600' 
                                    : ''
                              }>
                                {formatCurrency(installment.remainingBalance)}
                              </div>
                            </td>
                            <td className="p-3">
                              {(installment as any).isSettled ? (
                                <Badge variant="secondary" className="bg-blue-100 text-blue-800 border-blue-200">
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Saldada
                                </Badge>
                              ) : installment.isPaid ? (
                                <Badge variant="secondary" className="bg-green-100 text-green-800 border-green-200">
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Pagado
                                </Badge>
                              ) : installment.isPartial ? (
                                <Badge variant="outline" className="border-orange-200 text-orange-800 bg-orange-50">
                                  <Clock className="h-3 w-3 mr-1" />
                                  Parcial
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="border-orange-200 text-orange-800">
                                  <Clock className="h-3 w-3 mr-1" />
                                  Pendiente
                                </Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  
                  {amortizationSchedule.length === 0 && (
                    <div className="text-center py-8">
                      <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                      <p className="text-gray-600">No hay datos de amortización disponibles</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Historial de pagos */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Historial de Pagos</CardTitle>
                <div className="flex flex-col sm:flex-row gap-4 mt-4">
                  {/* Búsqueda */}
                  <div className="flex-1">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                      <Input
                        placeholder="Buscar por referencia, notas o método..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  
                  {/* Filtros */}
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-full sm:w-[140px]">
                        <SelectValue placeholder="Estado" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos los Estados</SelectItem>
                        <SelectItem value="completed">Completado</SelectItem>
                        <SelectItem value="pending">Pendiente</SelectItem>
                        <SelectItem value="failed">Fallido</SelectItem>
                      </SelectContent>
                    </Select>

                    <Select value={methodFilter} onValueChange={setMethodFilter}>
                      <SelectTrigger className="w-full sm:w-[140px]">
                        <SelectValue placeholder="Método" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos los Métodos</SelectItem>
                        <SelectItem value="cash">Efectivo</SelectItem>
                        <SelectItem value="bank_transfer">Transferencia</SelectItem>
                        <SelectItem value="check">Cheque</SelectItem>
                        <SelectItem value="card">Tarjeta</SelectItem>
                        <SelectItem value="online">En línea</SelectItem>
                      </SelectContent>
                    </Select>

                    <Select value={dateFilter} onValueChange={setDateFilter}>
                      <SelectTrigger className="w-full sm:w-[140px]">
                        <SelectValue placeholder="Fecha" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas las Fechas</SelectItem>
                        <SelectItem value="today">Hoy</SelectItem>
                        <SelectItem value="week">Última Semana</SelectItem>
                        <SelectItem value="month">Último Mes</SelectItem>
                        <SelectItem value="year">Último Año</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {filteredPayments.length === 0 ? (
                  <div className="text-center py-8">
                    <DollarSign className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                    <p className="text-gray-600">
                      {payments.length === 0 
                        ? "No se han registrado pagos para este préstamo"
                        : "No se encontraron pagos con los filtros aplicados"
                      }
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    {/* Vista móvil */}
                    <div className="block md:hidden space-y-3">
                      {filteredPayments.map((payment) => (
                        <div key={payment.id} className="border rounded-lg p-4 bg-white">
                          <div className="flex justify-between items-start mb-3">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-lg">{formatDateTime(payment)}</span>
                              {getStatusBadge(payment.status)}
                            </div>
                            <div className="text-right">
                              <div className="font-bold text-green-600">
                                {formatCurrency(payment.amount + (payment.late_fee || 0))}
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                            <div>
                              <span className="font-medium">Principal:</span>
                              <div>{formatCurrency(payment.principal_amount)}</div>
                            </div>
                            <div>
                              <span className="font-medium">Interés:</span>
                              <div>{formatCurrency(payment.interest_amount || Math.max(0, payment.amount - (payment.principal_amount || 0)))}</div>
                            </div>
                            <div>
                              <span className="font-medium">Mora:</span>
                              <div>{formatCurrency(payment.late_fee)}</div>
                            </div>
                            <div>
                              <span className="font-medium">Método:</span>
                              <div>{getPaymentMethodLabel(payment.payment_method)}</div>
                            </div>
                          </div>

                          {payment.reference_number && (
                            <div className="mt-2 pt-2 border-t text-sm text-gray-600">
                              <span className="font-medium">Referencia:</span> {payment.reference_number}
                            </div>
                          )}

                          {payment.notes && (
                            <div className="mt-2 pt-2 border-t text-sm text-gray-600">
                              <span className="font-medium">Notas:</span> {translatePaymentNotes(payment.notes)}
                            </div>
                          )}

                          <div className="mt-3 pt-2 border-t">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleViewReceipt(payment)}
                              className="w-full"
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              Ver Recibo
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Vista desktop */}
                    <div className="hidden md:block">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="border-b bg-gray-50">
                            <th className="text-left p-3 font-semibold">Fecha</th>
                            <th className="text-left p-3 font-semibold">Monto</th>
                            <th className="text-left p-3 font-semibold">Principal</th>
                            <th className="text-left p-3 font-semibold">Interés</th>
                            <th className="text-left p-3 font-semibold">Mora</th>
                            <th className="text-left p-3 font-semibold">Método</th>
                            <th className="text-left p-3 font-semibold">Estado</th>
                            <th className="text-left p-3 font-semibold">Referencia</th>
                            <th className="text-left p-3 font-semibold">Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredPayments.map((payment) => (
                            <tr key={payment.id} className="border-b hover:bg-gray-50">
                              <td className="p-3">{formatDateTime(payment)}</td>
                              <td className="p-3 font-semibold text-green-600">
                                {formatCurrency(payment.amount + (payment.late_fee || 0))}
                              </td>
                              <td className="p-3">{formatCurrency(payment.principal_amount)}</td>
                              <td className="p-3">{formatCurrency(payment.interest_amount || Math.max(0, payment.amount - (payment.principal_amount || 0)))}</td>
                              <td className="p-3">{formatCurrency(payment.late_fee)}</td>
                              <td className="p-3">{getPaymentMethodLabel(payment.payment_method)}</td>
                              <td className="p-3">{getStatusBadge(payment.status)}</td>
                              <td className="p-3">{payment.reference_number || '-'}</td>
                              <td className="p-3">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleViewReceipt(payment)}
                                >
                                  <Eye className="h-4 w-4 mr-1" />
                                  Recibo
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button variant="outline" onClick={onClose}>
                <X className="h-4 w-4 mr-2" />
                Cerrar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>

      {/* Modal de Recibo */}
      {selectedPayment && (
        <Dialog open={showReceiptModal} onOpenChange={setShowReceiptModal}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5" />
                Recibo de Pago
                {loan && (
                  <span className="text-sm font-normal text-gray-600">
                    - {loan.clients.full_name}
                  </span>
                )}
              </DialogTitle>
            </DialogHeader>

            {selectedPayment && loan && (
              <div className="space-y-6">
                {/* Información del cliente */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Información del Cliente</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Cliente:</span>
                        <div className="font-semibold">{loan.clients.full_name}</div>
                      </div>
                      <div>
                        <span className="text-gray-600">Cédula:</span>
                        <div className="font-semibold">{loan.clients.dni}</div>
                      </div>
                      <div>
                        <span className="text-gray-600">Fecha de Pago:</span>
                        <div className="font-semibold">{formatDateTime(selectedPayment)}</div>
                      </div>
                      <div>
                        <span className="text-gray-600">Método de Pago:</span>
                        <div className="font-semibold">{getPaymentMethodLabel(selectedPayment.payment_method)}</div>
                      </div>
                      {selectedPayment.reference_number && (
                        <div>
                          <span className="text-gray-600">Referencia:</span>
                          <div className="font-semibold">{selectedPayment.reference_number}</div>
                        </div>
                      )}
                      <div>
                        <span className="text-gray-600">Estado:</span>
                        <div>{getStatusBadge(selectedPayment.status)}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Detalle del pago */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Detalle del Pago</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Monto Total:</span>
                        <span className="font-bold text-lg text-green-600">
                          {formatCurrency(selectedPayment.amount + (selectedPayment.late_fee || 0))}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">A Principal:</span>
                        <span className="font-semibold">{formatCurrency(selectedPayment.principal_amount)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">A Intereses:</span>
                        <span className="font-semibold">{formatCurrency(selectedPayment.interest_amount || Math.max(0, selectedPayment.amount - (selectedPayment.principal_amount || 0)))}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Mora:</span>
                        <span className="font-semibold">{formatCurrency(selectedPayment.late_fee)}</span>
                      </div>
                    </div>

                    {selectedPayment.notes && (
                      <div className="mt-4 pt-4 border-t">
                        <span className="text-gray-600 font-medium">Notas:</span>
                        <p className="mt-1 text-sm">{translatePaymentNotes(selectedPayment.notes)}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowReceiptModal(false)}>
                    <X className="h-4 w-4 mr-2" />
                    Cerrar
                  </Button>
                  <Button onClick={() => printReceipt(selectedPayment)}>
                    <Printer className="h-4 w-4 mr-2" />
                    Imprimir Recibo
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </Dialog>
  );
};
