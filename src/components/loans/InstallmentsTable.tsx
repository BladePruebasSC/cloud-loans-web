import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { 
  Calendar, 
  DollarSign, 
  CheckCircle, 
  Clock, 
  AlertTriangle,
  Eye,
  X,
  RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrencyNumber } from '@/lib/utils';
import { formatDateStringForSantoDomingo, getCurrentDateInSantoDomingo } from '@/utils/dateUtils';

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
  // Extras para UI (especialmente en préstamos indefinidos con pagos parciales)
  paid_amount?: number;
  remaining_amount?: number;
  expected_amount?: number;
  is_partial?: boolean;
}

interface InstallmentsTableProps {
  loanId: string;
  isOpen: boolean;
  onClose: () => void;
}

export const InstallmentsTable: React.FC<InstallmentsTableProps> = ({ 
  loanId, 
  isOpen, 
  onClose 
}) => {
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [loading, setLoading] = useState(false);
  const [loanInfo, setLoanInfo] = useState<any>(null);
  const [totalPaidFromPayments, setTotalPaidFromPayments] = useState(0);
  const [capitalPayments, setCapitalPayments] = useState<any[]>([]);
  const [allPayments, setAllPayments] = useState<any[]>([]);

  useEffect(() => {
    if (isOpen && loanId) {
      fetchData();
      
      // Suscribirse a cambios en la tabla de pagos y cuotas
      const paymentsChannel = supabase
        .channel(`installments-payments-${loanId}`)
        .on('postgres_changes', 
          { 
            event: '*', 
            schema: 'public', 
            table: 'payments',
            filter: `loan_id=eq.${loanId}`
          }, 
          (payload) => {
            console.log('🔔 Cambio detectado en pagos:', payload);
            // Refrescar datos después de un pequeño delay para asegurar que la BD se actualizó
            setTimeout(() => {
              fetchData();
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
            setTimeout(() => {
              fetchData();
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
            setTimeout(() => {
              fetchData();
            }, 500);
          }
        )
        .subscribe();

      // Escuchar evento personalizado para refrescar después de abono a capital
      const handleInstallmentsUpdated = (event: CustomEvent) => {
        if (event.detail?.loanId === loanId) {
          setTimeout(() => {
            fetchData();
          }, 500);
        }
      };

      window.addEventListener('installmentsUpdated', handleInstallmentsUpdated as EventListener);

      return () => {
        supabase.removeChannel(paymentsChannel);
        window.removeEventListener('installmentsUpdated', handleInstallmentsUpdated as EventListener);
      };
    }
  }, [isOpen, loanId]);

  // Función para refrescar los datos
  const refreshData = () => {
    fetchData();
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      // Primero obtener la información del préstamo para saber si es indefinido
      const loanInfoResult = await supabase
        .from('loans')
        .select(`
          id,
          amount,
          remaining_balance,
          monthly_payment,
          interest_rate,
          term_months,
          status,
          start_date,
          first_payment_date,
          payment_frequency,
          amortization_type,
          total_amount,
          clients:client_id (
            full_name,
            dni
          )
        `)
        .eq('id', loanId)
        .single();

      if (loanInfoResult.error) throw loanInfoResult.error;

      const loanInfo = loanInfoResult.data;
      const isIndefinite = (loanInfo?.amortization_type || '').toLowerCase() === 'indefinite';

      // Para préstamos indefinidos, necesitamos la línea de tiempo de abonos a capital
      // y los pagos con due_date para no "partir" pagos históricos cuando cambia el interés.
      const { data: capitalPaymentsDataRaw, error: capitalPaymentsError } = await supabase
        .from('capital_payments')
        .select('amount, capital_before, capital_after, keep_installments, created_at')
        .eq('loan_id', loanId)
        .order('created_at', { ascending: true });

      if (capitalPaymentsError) {
        console.error('Error obteniendo abonos a capital:', capitalPaymentsError);
      }
      setCapitalPayments(capitalPaymentsDataRaw || []);
      
      // CORRECCIÓN: Para préstamos indefinidos, obtener TODAS las cuotas (incluyendo cargos)
      // Antes solo se obtenía 1 cuota, lo que excluía los cargos
      const installmentsQuery = supabase
        .from('installments')
        .select('*, is_settled, total_amount')
        .eq('loan_id', loanId)
        .order('due_date', { ascending: true })
        .order('installment_number', { ascending: true }); // Orden secundario por número de cuota
      
      const installmentsResult = await installmentsQuery;
      
      if (installmentsResult.error) throw installmentsResult.error;

      let data = installmentsResult.data || [];
      
      // Para préstamos indefinidos, separar cargos de cuotas regulares
      let chargesFromDB: typeof data = [];
      let regularInstallmentsFromDB: typeof data = [];
      if (isIndefinite) {
        chargesFromDB = data.filter(inst => {
          const isCharge = Math.abs((inst as any).interest_amount || 0) < 0.01 &&
                          (inst as any).principal_amount > 0 &&
                          Math.abs((inst as any).principal_amount - ((inst as any).total_amount || 0)) < 0.01;
          return isCharge;
        });
        regularInstallmentsFromDB = data.filter(inst => {
          const isCharge = Math.abs((inst as any).interest_amount || 0) < 0.01 &&
                          (inst as any).principal_amount > 0 &&
                          Math.abs((inst as any).principal_amount - ((inst as any).total_amount || 0)) < 0.01;
          return !isCharge;
        });
      }

      // Para préstamos indefinidos, generar cuotas dinámicamente basándose en el tiempo transcurrido
      if (isIndefinite && loanInfo) {
        // ✅ CORRECCIÓN: En INDEFINIDOS, calcular SIEMPRE desde start_date (no usar first_payment_date/next_payment_date),
        // para evitar fechas “clamp” (ej. 30-ene → 28-feb). Usamos overflow (30-ene + 1 mes = 02-mar).
        const firstPaymentDateStr = loanInfo.start_date?.split('T')[0];
        let firstPaymentDateBase: Date;
        const today = getCurrentDateInSantoDomingo();
        const frequency = loanInfo.payment_frequency || 'monthly';
        
        if (firstPaymentDateStr) {
          // CORRECCIÓN UTC-4: Parsear como fecha local para evitar problemas de zona horaria
          const [firstYear, firstMonth, firstDay] = firstPaymentDateStr.split('-').map(Number);
          // Usar new Date(year, month - 1, day) para crear fecha local (no UTC)
          firstPaymentDateBase = new Date(firstYear, firstMonth - 1, firstDay);
          
          // CORRECCIÓN: Si first_payment_date o next_payment_date es igual a start_date,
          // entonces calcular un mes después (la primera cuota debe ser un mes después de start_date)
          const startDateStr = loanInfo.start_date?.split('T')[0];
          if (startDateStr && firstPaymentDateStr === startDateStr) {
            // Si la fecha es igual a start_date, calcular un mes después
            const [startYear, startMonth, startDay] = startDateStr.split('-').map(Number);
            const startDate = new Date(startYear, startMonth - 1, startDay);
            firstPaymentDateBase = new Date(startDate);
            
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
                firstPaymentDateBase.setFullYear(startDate.getFullYear(), startDate.getMonth() + 1, startDate.getDate());
                break;
            }
          }
        } else {
          // Si no hay first_payment_date ni next_payment_date, calcular desde start_date
          const startDateStr = loanInfo.start_date?.split('T')[0];
          if (!startDateStr) return;
          
          const [startYear, startMonth, startDay] = startDateStr.split('-').map(Number);
          const startDate = new Date(startYear, startMonth - 1, startDay);
          firstPaymentDateBase = new Date(startDate);
          
          // Calcular la primera fecha de pago (un período después de start_date)
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
              // Overflow intencional (30-ene + 1 mes => 02-mar)
              firstPaymentDateBase.setFullYear(startDate.getFullYear(), startDate.getMonth() + 1, startDate.getDate());
              break;
          }
        }
        
        if (firstPaymentDateBase) {
          // Obtener todos los pagos para determinar cuántas cuotas se han pagado
          const { data: allPayments, error: paymentsError } = await supabase
            .from('payments')
            .select('id, amount, principal_amount, interest_amount, payment_date, due_date')
            .eq('loan_id', loanId)
            .order('payment_date', { ascending: true });

          if (paymentsError) throw paymentsError;

          // Interés "actual" (para cuotas futuras sin pagos): usar monthly_payment si está alineado, sino calcularlo
          const interestPerPayment = (loanInfo.monthly_payment && loanInfo.monthly_payment > 0)
            ? Number(loanInfo.monthly_payment)
            : (Number(loanInfo.amount || 0) * (Number(loanInfo.interest_rate || 0) / 100));

          // Para indefinidos: mapear pagos de interés por due_date para respetar el historial
          // (ej: un pago de RD$50 con due_date 2026-02-16 debe quedarse como 50, aunque hoy el interés sea 25)
          const interestPaidByDueDate = new Map<string, { sum: number; firstPaidDate: string | null }>();
          let maxDueDateFromPayments: string | null = null;
          for (const p of allPayments || []) {
            const dueKey = (p as any).due_date ? String((p as any).due_date).split('T')[0] : null;
            if (!dueKey) continue;
            const interestField = Number((p as any).interest_amount) || 0;
            const amt = Number((p as any).amount) || 0;
            // ✅ En indefinidos, algunos pagos parciales pueden venir con interest_amount=0.
            // Tomar amount como interés cuando sea razonable.
            const paidInterest = interestField > 0.01 ? interestField : (amt > 0.01 && amt <= (interestPerPayment || 0) * 1.25 ? amt : 0);
            if (paidInterest <= 0) continue; // ignorar pagos de cargos
            const paymentDateKey = (p as any).payment_date ? String((p as any).payment_date).split('T')[0] : null;

            const prev = interestPaidByDueDate.get(dueKey);
            const nextSum = (prev?.sum || 0) + paidInterest;
            const nextPaidDate =
              !prev?.firstPaidDate || (paymentDateKey && paymentDateKey < prev.firstPaidDate)
                ? paymentDateKey
                : prev.firstPaidDate;
            interestPaidByDueDate.set(dueKey, { sum: nextSum, firstPaidDate: nextPaidDate });

            if (!maxDueDateFromPayments || dueKey > maxDueDateFromPayments) {
              maxDueDateFromPayments = dueKey;
            }
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
          
          // INDEFINIDOS: solo debe existir 1 cuota pendiente a la vez.
          // - Si NO hay pagos: generar solo la primera cuota (firstPaymentDateBase)
          // - Si hay pagos: mostrar historial (hasta max due pagada) y generar SOLO la siguiente.
          const monthsFromTime = Math.max(1, monthsElapsed + 1);
          if (maxDueDateFromPayments) {
            // Extender generación hasta cubrir (maxDueDateFromPayments + 1 período) para que,
            // tras pagar la cuota, se genere la siguiente (sin crear 2 pendientes).
            const maxDueNext = (() => {
              const [yy, mm, dd] = String(maxDueDateFromPayments).split('T')[0].split('-').map(Number);
              if (!yy || !mm || !dd) return maxDueDateFromPayments;
              const base = new Date(yy, mm - 1, dd);
              const dt = new Date(base);
              switch (String(frequency || 'monthly').toLowerCase()) {
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
                  // overflow intencional
                  dt.setFullYear(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
                  break;
              }
              const y = dt.getFullYear();
              const m = String(dt.getMonth() + 1).padStart(2, '0');
              const d = String(dt.getDate()).padStart(2, '0');
              return `${y}-${m}-${d}`;
            })();

            let probeCount = 1;
            while (probeCount < 500) { // safety
              const probeDate = new Date(firstPaymentDateBase);
              switch (frequency) {
                case 'daily':
                  probeDate.setDate(firstPaymentDateBase.getDate() + (probeCount - 1));
                  break;
                case 'weekly':
                  probeDate.setDate(firstPaymentDateBase.getDate() + ((probeCount - 1) * 7));
                  break;
                case 'biweekly':
                  probeDate.setDate(firstPaymentDateBase.getDate() + ((probeCount - 1) * 14));
                  break;
                case 'monthly':
                default:
                  probeDate.setFullYear(firstPaymentDateBase.getFullYear(), firstPaymentDateBase.getMonth() + (probeCount - 1), firstPaymentDateBase.getDate());
                  break;
              }
              const y = probeDate.getFullYear();
              const m = probeDate.getMonth() + 1;
              const d = probeDate.getDate();
              const probeKey = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
              if (probeKey >= maxDueNext) {
                break;
              }
              probeCount++;
            }
            monthsElapsed = Math.max(monthsFromTime, probeCount);
          } else {
            monthsElapsed = monthsFromTime;
          }
          
          console.log('🔍 InstallmentsTable: Cálculo de cuotas para préstamo indefinido:', {
            loanId,
            monthsFromTime,
            finalMonthsElapsed: monthsElapsed,
            totalPayments: allPayments?.length || 0,
            interestPerPayment
          });
          
          // Generar cuotas dinámicamente
          const dynamicInstallments = [];
          
          // CORRECCIÓN: Usar la fecha calculada correctamente
          const firstPaymentDate = new Date(firstPaymentDateBase);
          
          // Generar cuotas hasta el mes actual
          for (let i = 1; i <= Math.max(1, monthsElapsed); i++) {
            const installmentDate = new Date(firstPaymentDate);
            
            // Calcular fecha según frecuencia
            // CORRECCIÓN: La cuota 1 debe usar la fecha base sin ajustar (i - 1 = 0)
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
                // Overflow intencional para mantener periodicidad real (30-ene => 02-mar, luego 02-abr, etc.)
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
            const existingInstallment = data.find(inst => inst.installment_number === i);
            
            // CORRECCIÓN: Para préstamos indefinidos, siempre usar la fecha calculada
            // para evitar usar fechas incorrectas guardadas en la BD
            const finalDueDate = formattedDate; // Siempre usar la fecha calculada correctamente
            
            // Para préstamos indefinidos, las cuotas normales (con interés) NO deben tener capital
            // Solo los cargos (sin interés) tienen capital
            const isChargeFromDB = existingInstallment && 
                                   Math.abs((existingInstallment.interest_amount || 0)) < 0.01 &&
                                   existingInstallment.principal_amount > 0 &&
                                   Math.abs(existingInstallment.principal_amount - (existingInstallment.total_amount || existingInstallment.amount || 0)) < 0.01;
            
            const paidInfo = interestPaidByDueDate.get(finalDueDate);
            const paidAmt = Number(paidInfo?.sum || 0) || 0;
            const tol = 0.05;
            const isFullyPaid = !!paidInfo && interestPerPayment > 0.01 && (paidAmt + tol >= interestPerPayment);
            const isPartial = !!paidInfo && paidAmt > 0.01 && !isFullyPaid;
            const scheduledInterest = interestPerPayment; // ✅ siempre fijo por período

            dynamicInstallments.push({
              id: existingInstallment?.id || `dynamic-${i}`,
              loan_id: loanId,
              installment_number: i,
              due_date: finalDueDate,
              amount: isChargeFromDB
                ? (existingInstallment?.amount || (existingInstallment as any)?.total_amount || existingInstallment?.principal_amount || 0)
                : scheduledInterest,
              // CORRECCIÓN: Para préstamos indefinidos, las cuotas normales (con interés) deben tener principal_amount = 0
              // Solo los cargos (sin interés) tienen principal_amount > 0
              principal_amount: isChargeFromDB ? (existingInstallment.principal_amount || 0) : 0,
              interest_amount: isChargeFromDB ? (existingInstallment?.interest_amount || 0) : scheduledInterest,
              late_fee_paid: existingInstallment?.late_fee_paid || 0,
              is_paid: isChargeFromDB ? (existingInstallment?.is_paid || false) : isFullyPaid,
              is_settled: existingInstallment?.is_settled || false,
              paid_date: isChargeFromDB ? (existingInstallment?.paid_date || null) : ((isFullyPaid || isPartial) ? (paidInfo?.firstPaidDate || null) : null),
              created_at: existingInstallment?.created_at || new Date().toISOString(),
              updated_at: existingInstallment?.updated_at || new Date().toISOString(),
              total_amount: isChargeFromDB
                ? (existingInstallment?.total_amount || existingInstallment?.amount || existingInstallment?.principal_amount || 0)
                : scheduledInterest
            });
          }
          
          // CORRECCIÓN: Para indefinidos, los cargos ya están incluidos en dynamicInstallments
          // (cuando existingInstallment con ese installment_number es un cargo). No agregar chargesFromDB
          // de nuevo para evitar cargos duplicados (ej. "3er y 4to cargo" que no existen).
          data = dynamicInstallments;
        }
      }

      // Establecer loanInfo inmediatamente para mostrar datos básicos
      setLoanInfo(loanInfo);

      // Usar loanInfo para los cálculos (ya tiene todos los campos necesarios)
      const loanData = {
        monthly_payment: loanInfo.monthly_payment,
        amount: loanInfo.amount,
        interest_rate: loanInfo.interest_rate
      };

      // Corregir los datos de las cuotas (solo en memoria, sin actualizar BD inmediatamente)
      const correctedInstallments = (data || []).map(installment => {
        // Usar total_amount de la BD como fuente de verdad para evitar problemas de redondeo
        const totalAmountFromDB = (installment as any).total_amount;
        let correctedAmount = totalAmountFromDB || installment.amount;
        let correctedPrincipal = installment.principal_amount;
        let correctedInterest = installment.interest_amount;

        // Si no hay total_amount en la BD, usar el amount o calcularlo
        if (!correctedAmount || correctedAmount === 0) {
          correctedAmount = loanData.monthly_payment;
        }

        // Verificar si es un cargo (cuando principal_amount es igual a total_amount y interest_amount es 0)
        // Los cargos no tienen interés, solo capital
        const isCharge = correctedInterest === 0 && 
                         correctedPrincipal > 0 && 
                         Math.abs(correctedPrincipal - correctedAmount) < 0.01; // Permitir pequeñas diferencias por redondeo

        // Si no es un cargo y no hay interés, calcularlo
        if (!isCharge && (!correctedInterest || correctedInterest === 0)) {
          correctedInterest = (loanData.amount * loanData.interest_rate) / 100;
        }

        // CORRECCIÓN: Para préstamos indefinidos, las cuotas normales (con interés) NO deben tener capital
        // Solo los cargos (sin interés) tienen capital
        if (!isCharge && String(loanInfo?.amortization_type || '').toLowerCase() === 'indefinite') {
          // Para préstamos indefinidos, las cuotas normales siempre tienen principal_amount = 0
          correctedPrincipal = 0;
        } else if (!isCharge && (!correctedPrincipal || correctedPrincipal === 0)) {
          // Para otros tipos de préstamos, calcular el capital normalmente
          correctedPrincipal = correctedAmount - correctedInterest;
        }
        
        // Si es un cargo, asegurar que el monto sea igual al capital y el interés sea 0
        if (isCharge) {
          correctedAmount = correctedPrincipal;
          correctedInterest = 0;
        }

        // CORRECCIÓN: Para préstamos indefinidos, el amount debe ser siempre principal + interés
        // No usar totalAmountFromDB si es indefinido porque puede estar desactualizado
        // Para otros tipos de préstamos, usar totalAmountFromDB si está disponible
        let finalAmount: number;
        if (String(loanInfo?.amortization_type || '').toLowerCase() === 'indefinite') {
          // Para indefinidos, calcular el amount como la suma de principal + interés
          finalAmount = correctedPrincipal + correctedInterest;
        } else {
          // Para otros tipos, usar total_amount de la BD si está disponible (evita problemas de redondeo)
          finalAmount = totalAmountFromDB || (correctedPrincipal + correctedInterest);
        }
        
        const finalPrincipal = isCharge ? correctedPrincipal : Math.round(correctedPrincipal * 100) / 100;
        const finalInterest = isCharge ? 0 : Math.round(correctedInterest * 100) / 100;

        return {
          ...installment,
          amount: finalAmount,
          principal_amount: finalPrincipal,
          interest_amount: finalInterest,
          // Asegurar que total_amount esté presente para el cálculo del total
          total_amount: totalAmountFromDB || finalAmount
        };
      });

      // Ordenar las cuotas por fecha de vencimiento (y por número de cuota como orden secundario)
      const sortedInstallments = correctedInstallments.sort((a, b) => {
        // Primero ordenar por fecha de vencimiento
        if (a.due_date && b.due_date) {
          const dateA = new Date(a.due_date);
          const dateB = new Date(b.due_date);
          const dateDiff = dateA.getTime() - dateB.getTime();
          if (dateDiff !== 0) {
            return dateDiff;
          }
        }
        // Si las fechas son iguales o no hay fecha, ordenar por número de cuota
        return a.installment_number - b.installment_number;
      });
      
      // Lista final que se mostrará en UI (puede diferir de lo que viene de BD, especialmente en indefinidos)
      let finalInstallmentsForUI = sortedInstallments;

      // CORRECCIÓN: Calcular dinámicamente qué cuotas están pagadas basándose en los pagos reales
      // Esto asegura que cuando se elimina un pago, las cuotas se actualicen correctamente
      const { data: allPaymentsForStatus, error: paymentsStatusError } = await supabase
        .from('payments')
        .select('id, principal_amount, interest_amount, payment_date, amount, due_date')
        .eq('loan_id', loanId)
        .order('payment_date', { ascending: true });

      if (!paymentsStatusError && allPaymentsForStatus && allPaymentsForStatus.length > 0) {
        const isIndefinite = String(loanInfo?.amortization_type || '').toLowerCase() === 'indefinite';
        const sortedPayments = [...allPaymentsForStatus].sort((a, b) => 
          new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime()
        );

        // Crear un mapa de cuotas por número para acceso rápido
        const installmentsMap = new Map();
        sortedInstallments.forEach(inst => {
          installmentsMap.set(inst.installment_number, inst);
        });

        // Para préstamos indefinidos, procesar primero cargos y luego cuotas regulares (igual que AccountStatement)
        if (isIndefinite) {
          // Crear un Set global para rastrear qué pagos (por ID) ya han sido asignados a cuotas
          const assignedPaymentIds = new Set<string>();
          
          // PRIMERO: Procesar TODOS los cargos
          const chargeInstallments: typeof sortedInstallments = [];
          for (const inst of sortedInstallments) {
            const isCharge = Math.abs((inst as any).interest_amount || 0) < 0.01 &&
                            (inst as any).principal_amount > 0 &&
                            Math.abs((inst as any).principal_amount - ((inst as any).total_amount || inst.amount || 0)) < 0.01;
            if (isCharge) {
              chargeInstallments.push(inst);
            }
          }

          // Procesar cada cargo
          for (const chargeInst of chargeInstallments) {
            const chargeTotal = chargeInst.total_amount || chargeInst.amount || chargeInst.principal_amount;
            const chargeDueDate = chargeInst.due_date?.split('T')[0];
            let accumulatedPrincipal = 0;

            // Buscar TODOS los pagos que correspondan a este cargo específico
            for (let pIdx = 0; pIdx < sortedPayments.length && accumulatedPrincipal < chargeTotal * 0.99; pIdx++) {
              const payment = sortedPayments[pIdx];
              
              // Si el pago ya fue asignado, saltarlo
              if (assignedPaymentIds.has(payment.id)) {
                continue;
              }
              
              const paymentDueDate = (payment.due_date as string)?.split('T')[0] || (payment.due_date as string);
              const hasNoInterest = (payment.interest_amount || 0) < 0.01;
              const reasonableAmount = (payment.principal_amount || payment.amount || 0) <= chargeTotal * 1.1;
              const paymentMatchesCharge = paymentDueDate === chargeDueDate && hasNoInterest && reasonableAmount;

              if (paymentMatchesCharge) {
                const paymentAmount = payment.principal_amount || payment.amount || 0;
                const remainingCharge = chargeTotal - accumulatedPrincipal;

                if (paymentAmount > 0 && paymentAmount <= remainingCharge * 1.1) {
                  assignedPaymentIds.add(payment.id);
                  accumulatedPrincipal += paymentAmount;

                  if (accumulatedPrincipal >= chargeTotal * 0.99) {
                    break;
                  }
                }
              }
            }

            // Si el cargo no se completó por due_date exacto, asignar pagos solo-principal no asignados
            // (p. ej. pago guardado con due_date equivocado) al primer cargo pendiente
            let fallbackPaymentForDate: typeof sortedPayments[0] | null = null;
            if (accumulatedPrincipal < chargeTotal * 0.99) {
              for (const payment of sortedPayments) {
                if (assignedPaymentIds.has(payment.id)) continue;
                const hasNoInterest = (payment.interest_amount || 0) < 0.01;
                const paymentAmount = payment.principal_amount || payment.amount || 0;
                if (!hasNoInterest || paymentAmount <= 0) continue;
                const remainingCharge = chargeTotal - accumulatedPrincipal;
                if (paymentAmount <= remainingCharge * 1.1) {
                  assignedPaymentIds.add(payment.id);
                  accumulatedPrincipal += paymentAmount;
                  if (!fallbackPaymentForDate) fallbackPaymentForDate = payment;
                  if (accumulatedPrincipal >= chargeTotal * 0.99) break;
                }
              }
            }

            // Marcar el cargo como pagado si se acumuló suficiente monto
            if (accumulatedPrincipal >= chargeTotal * 0.99) {
              chargeInst.is_paid = true;
              const paymentForCharge = sortedPayments.find(p => assignedPaymentIds.has(p.id) && (p.due_date as string)?.split('T')[0] === chargeDueDate);
              if (paymentForCharge) {
                chargeInst.paid_date = (paymentForCharge as any).payment_date?.split?.('T')[0] || (paymentForCharge as any).payment_date || null;
              } else if (fallbackPaymentForDate) {
                chargeInst.paid_date = (fallbackPaymentForDate as any).payment_date?.split?.('T')[0] || (fallbackPaymentForDate as any).payment_date || null;
              }
            } else {
              chargeInst.is_paid = false;
              chargeInst.paid_date = null;
            }
          }

          // SEGUNDO: En indefinidos, mostrar 1 fila por cuota regular (por due_date).
          // Esto permite que una cuota de RD$500 pagada parcialmente se vea como “Parcial” y “Falta RD$250.00”.
          const round2 = (v: number) => Math.round(v * 100) / 100;
          const interestPerPayment = round2(((loanInfo?.amount || 0) * (loanInfo?.interest_rate || 0)) / 100);
          const nowIso = new Date().toISOString();

          // Monto de cuota vigente: la cuota que vence en (abono_date + 1 periodo) se pagó con capital anterior.
          // Así 5,000 pagado para vencimiento 18 mar (abono 18 feb) se muestra como 1 cuota de 5,000, no 2×2,500.
          const addPeriodIsoForCap = (iso: string, f: string) => {
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
          const getExpectedForDueDate = (dueDate: string): number => {
            if (!dueDate) return interestPerPayment;
            if (!capitalPaymentsDataRaw || capitalPaymentsDataRaw.length === 0) return interestPerPayment;
            const freq = String(loanInfo?.payment_frequency || 'monthly');
            for (const cp of capitalPaymentsDataRaw) {
              const createdDate = (cp as any).created_at ? String((cp as any).created_at).split('T')[0] : null;
              if (!createdDate) continue;
              const cutoff = addPeriodIsoForCap(createdDate, freq);
              if (dueDate <= cutoff) return round2(Number((cp as any).capital_before) * (Number(loanInfo?.interest_rate || 0) / 100));
            }
            const last = capitalPaymentsDataRaw[capitalPaymentsDataRaw.length - 1];
            return round2(Number((last as any).capital_after) * (Number(loanInfo?.interest_rate || 0) / 100));
          };

          // Conjunto de due_dates de cargos (evita mezclar pagos de cargos con cuotas regulares)
          const chargeDueDates = new Set<string>();
          for (const c of chargeInstallments) {
            const d = c.due_date?.split('T')[0];
            if (d) chargeDueDates.add(d);
          }

          // Pagos no asignados a cargos
          const unassignedPayments = sortedPayments.filter(p => !assignedPaymentIds.has(p.id));

          // Sumar pagos por due_date (cuotas regulares). Máximo aceptable = esperado vigente para esa fecha (ej. 5000 para cuota antigua)
          const getMaxAcceptableForDue = (due: string) => getExpectedForDueDate(due) * 1.25;

          // Sumar pagos por due_date (cuotas regulares)
          // ✅ Normalizar due_date inválido (< primera cuota real) hacia la cuota activa,
          // para evitar “28-feb” fantasma cuando la BD tiene next_payment_date clamp.
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

          const freq = String(loanInfo?.payment_frequency || 'monthly');
          const startIso = String(loanInfo?.start_date || '').split('T')[0] || '';
          const firstDueFromStart = startIso ? addPeriodIso(startIso, freq) : null;
          const tol = 0.05;

          const paidByDueDateRaw = new Map<string, { paid: number; firstPaidDate: string | null }>();
          for (const p of unassignedPayments) {
            const due = (p.due_date as string)?.split('T')[0] || (p.due_date as string) || null;
            if (!due || chargeDueDates.has(due)) continue;
            // No contar pagos solo a capital (cargos) como pago de cuota regular: evita que un pago de cargo
            // se muestre como "Parcial" en la cuota de interés cuando el due_date no coincide con el cargo.
            if ((Number((p as any).interest_amount || 0) || 0) < 0.01) continue;

            const interest = Number((p as any).interest_amount || 0) || 0;
            const amt = Number((p as any).amount || 0) || 0;

            // Preferir interest_amount; si viene 0, usar amount si es razonable para ESA cuota (monto vigente en esa fecha).
            const maxAcceptable = getMaxAcceptableForDue(due);
            const paidValue =
              interest > 0.01
                ? interest
                : (amt > 0.01 && amt <= maxAcceptable ? amt : 0);
            if (paidValue <= 0.01) continue;

            const paidDate = (p as any).payment_date ? String((p as any).payment_date).split('T')[0] : null;
            // Guardar en mapa “raw” primero
            const prev = paidByDueDateRaw.get(due);
            const nextPaid = round2((prev?.paid || 0) + paidValue);
            const nextFirstDate = !prev?.firstPaidDate || (paidDate && paidDate < prev.firstPaidDate) ? paidDate : prev.firstPaidDate;
            paidByDueDateRaw.set(due, { paid: nextPaid, firstPaidDate: nextFirstDate });
          }

          // Calcular cuota activa con pagos válidos (>= firstDueFromStart)
          const validEntries: Array<[string, { paid: number; firstPaidDate: string | null }]> = [];
          const invalidEntries: Array<[string, { paid: number; firstPaidDate: string | null }]> = [];
          for (const e of paidByDueDateRaw.entries()) {
            const due = e[0];
            if (firstDueFromStart && due < firstDueFromStart) invalidEntries.push(e);
            else validEntries.push(e);
          }

          const fullyPaid: string[] = [];
          let partialDue: string | null = null;
          for (const [due, info] of validEntries) {
            const paid = round2(info?.paid || 0);
            if (paid <= 0.01) continue;
            const expectedForDue = getExpectedForDueDate(due);
            if (paid + tol < expectedForDue) {
              partialDue = !partialDue || due < partialDue ? due : partialDue;
            } else {
              fullyPaid.push(due);
            }
          }
          const maxFull = fullyPaid.sort((a, b) => a.localeCompare(b)).slice(-1)[0] || null;
          const activeDue = partialDue || (maxFull ? addPeriodIso(maxFull, freq) : firstDueFromStart);

          const paidByDueDate = new Map<string, { paid: number; firstPaidDate: string | null }>();
          // Copiar válidos
          for (const [due, info] of validEntries) paidByDueDate.set(due, info);
          // Reasignar inválidos a la cuota activa (evita 28-feb fantasma)
          if (activeDue) {
            for (const [, info] of invalidEntries) {
              const prev = paidByDueDate.get(activeDue);
              paidByDueDate.set(activeDue, {
                paid: round2((prev?.paid || 0) + (info?.paid || 0)),
                firstPaidDate: prev?.firstPaidDate || info?.firstPaidDate || null
              });
            }
          }

          // ✅ Normalizar “overpay” en cuotas ya saldadas:
          // si por bug un pago nuevo se guarda con due_date de una cuota anterior ya pagada,
          // mover el excedente a la cuota activa (para que "Falta" se reduzca).
          if (activeDue) {
            let rollover = 0;
            for (const [due, info] of paidByDueDate.entries()) {
              if (due >= activeDue) continue;
              const expectedForDue = getExpectedForDueDate(due);
              if (expectedForDue <= 0.01) continue;
              const paid = round2(info?.paid || 0);
              const capped = round2(Math.min(paid, expectedForDue));
              const overflow = round2(Math.max(0, paid - expectedForDue));
              if (overflow > 0.01) {
                rollover = round2(rollover + overflow);
                paidByDueDate.set(due, { paid: capped, firstPaidDate: info?.firstPaidDate || null });
              }
            }
            if (rollover > 0.01) {
              const prev = paidByDueDate.get(activeDue);
              paidByDueDate.set(activeDue, {
                paid: round2((prev?.paid || 0) + rollover),
                firstPaidDate: prev?.firstPaidDate || null
              });
            }
          }

          // ✅ INDEFINIDOS: Solo 1 cuota pendiente a la vez.
          // Ya calculamos `fullyPaid` y `activeDue` arriba (y normalizamos invalid due_dates a activeDue).
          const dueDates = new Set<string>(fullyPaid);
          if (activeDue && !chargeDueDates.has(activeDue)) dueDates.add(activeDue);
          const dueDatesSorted = Array.from(dueDates).sort((a, b) => a.localeCompare(b));

          const regularInstallments: any[] = [];
          for (let idx = 0; idx < dueDatesSorted.length; idx++) {
            const due = dueDatesSorted[idx];
            const paidInfo = paidByDueDate.get(due);
            const paid = round2(paidInfo?.paid || 0);
            // En indefinidos, la cuota “esperada” es fija por período (no se reduce por pago parcial)
            const expected = getExpectedForDueDate(due);
            const remaining = round2(Math.max(0, expected - paid));

            const isPaid = remaining <= 0.01 && paid > 0.01;
            const isPartial = !isPaid && paid > 0.01 && remaining > 0.01;

            regularInstallments.push({
              id: `regular-${loanId}-${due}`,
              loan_id: loanId,
              installment_number: idx + 1,
              due_date: due,
              amount: expected,
              principal_amount: 0,
              interest_amount: expected,
              late_fee_paid: 0,
              is_paid: isPaid,
              is_settled: false,
              paid_date: paidInfo?.firstPaidDate || null,
              created_at: nowIso,
              updated_at: nowIso,
              // extras para UI
              expected_amount: expected,
              paid_amount: paid,
              remaining_amount: remaining,
              is_partial: isPartial
            });
          }

          // ✅ Garantía de comportamiento indefinido:
          // Siempre debe existir UNA cuota pendiente visible.
          // Si por cualquier razón no quedó incluida la `activeDue` (o quedaron todas pagadas),
          // agregar la siguiente cuota.
          const hasAnyPendingRegular = regularInstallments.some((r) => !r.is_paid && (Number(r.remaining_amount || 0) > 0.01));

          // 1) Asegurar que exista la cuota activa calculada
          if (activeDue && !chargeDueDates.has(activeDue)) {
            const existsActive = regularInstallments.some((r) => String(r.due_date).split('T')[0] === activeDue);
            if (!existsActive) {
              const paidInfo = paidByDueDate.get(activeDue);
              const paid = round2(paidInfo?.paid || 0);
              const expected = getExpectedForDueDate(activeDue);
              const remaining = round2(Math.max(0, expected - paid));
              const isPaid = remaining <= 0.01 && paid > 0.01;
              const isPartial = !isPaid && paid > 0.01 && remaining > 0.01;
              regularInstallments.push({
                id: `regular-${loanId}-${activeDue}`,
                loan_id: loanId,
                installment_number: regularInstallments.length + 1,
                due_date: activeDue,
                amount: expected,
                principal_amount: 0,
                interest_amount: expected,
                late_fee_paid: 0,
                is_paid: isPaid,
                is_settled: false,
                paid_date: paidInfo?.firstPaidDate || null,
                created_at: nowIso,
                updated_at: nowIso,
                expected_amount: expected,
                paid_amount: paid,
                remaining_amount: remaining,
                is_partial: isPartial
              });
            }
          }

          // 2) Si aun así no hay pendiente (todas pagadas), agregar la siguiente
          if (!hasAnyPendingRegular) {
            const baseForNext = activeDue || maxFull || firstDueFromStart;
            const nextDue = baseForNext ? addPeriodIso(baseForNext, freq) : null;
            if (nextDue && !chargeDueDates.has(nextDue)) {
              const expected = getExpectedForDueDate(nextDue);
              regularInstallments.push({
                id: `regular-${loanId}-${nextDue}`,
                loan_id: loanId,
                installment_number: regularInstallments.length + 1,
                due_date: nextDue,
                amount: expected,
                principal_amount: 0,
                interest_amount: expected,
                late_fee_paid: 0,
                is_paid: false,
                is_settled: false,
                paid_date: null,
                created_at: nowIso,
                updated_at: nowIso,
                expected_amount: expected,
                paid_amount: 0,
                remaining_amount: expected,
                is_partial: false
              });
            }
          }

          finalInstallmentsForUI = [
            ...chargeInstallments,
            ...regularInstallments
          ];
        } else {
          // Para préstamos no indefinidos, procesar primero cargos y luego cuotas regulares
          let paymentIndex = 0;
          let accumulatedPrincipal = 0;
          let accumulatedInterest = 0;

          // PRIMERO: Procesar TODOS los cargos (cada pago solo puede asignarse a un cargo)
          const chargeInstallments: typeof sortedInstallments = [];
          for (const inst of sortedInstallments) {
            const isCharge = inst.interest_amount === 0 && 
                            inst.principal_amount > 0 && 
                            Math.abs(inst.principal_amount - (inst.total_amount || inst.amount || 0)) < 0.01;
            if (isCharge) {
              chargeInstallments.push(inst);
            }
          }

          const assignedPaymentIdsForCharges = new Set<string>();

          // Procesar cada cargo (orden: por número de cuota, así el primer cargo con mismo due_date recibe el pago primero)
          for (const chargeInst of chargeInstallments) {
            const chargeTotal = chargeInst.total_amount || chargeInst.amount || chargeInst.principal_amount;
            const chargeDueDate = chargeInst.due_date?.split('T')[0];
            accumulatedPrincipal = 0;

            // Buscar pagos que correspondan a este cargo y no estén ya asignados a otro cargo
            for (let pIdx = 0; pIdx < sortedPayments.length && accumulatedPrincipal < chargeTotal * 0.99; pIdx++) {
              const payment = sortedPayments[pIdx];
              if (assignedPaymentIdsForCharges.has(payment.id)) continue;

              const paymentDueDate = (payment.due_date as string)?.split('T')[0] || (payment.due_date as string);
              const hasNoInterest = (payment.interest_amount || 0) < 0.01;
              const reasonableAmount = (payment.principal_amount || payment.amount || 0) <= chargeTotal * 1.1;
              const paymentMatchesCharge = paymentDueDate === chargeDueDate && hasNoInterest && reasonableAmount;

              if (paymentMatchesCharge) {
                const paymentAmount = payment.principal_amount || payment.amount || 0;
                const remainingCharge = chargeTotal - accumulatedPrincipal;

                if (paymentAmount > 0 && paymentAmount <= remainingCharge * 1.1) {
                  assignedPaymentIdsForCharges.add(payment.id);
                  accumulatedPrincipal += paymentAmount;

                  if (accumulatedPrincipal >= chargeTotal * 0.99) {
                    break;
                  }
                }
              }
            }

            // Marcar el cargo como pagado si se acumuló suficiente monto
            if (accumulatedPrincipal >= chargeTotal * 0.99) {
              chargeInst.is_paid = true;
              // Buscar la fecha del primer pago de este cargo
              const paymentForCharge = sortedPayments.find(p => {
                const paymentDueDate = (p.due_date as string)?.split('T')[0] || (p.due_date as string);
                return paymentDueDate === chargeDueDate;
              });
              if (paymentForCharge) {
                chargeInst.paid_date = paymentForCharge.payment_date?.split('T')[0] || paymentForCharge.payment_date || null;
              }
            } else {
              chargeInst.is_paid = false;
              chargeInst.paid_date = null;
            }
          }

          // SEGUNDO: Procesar todas las cuotas regulares (excluyendo cargos)
          // Usar el mismo set de pagos ya asignados a cargos para no contarlos en cuotas regulares
          const paymentsAssignedToCharges = assignedPaymentIdsForCharges;

          accumulatedPrincipal = 0;
          accumulatedInterest = 0;
          let firstPaymentDateForInstallment: string | null = null;
          paymentIndex = 0; // Resetear el índice para procesar desde el inicio

          for (const regularInst of sortedInstallments) {
            // Saltar si es un cargo (ya fue procesado)
            const isCharge = regularInst.interest_amount === 0 && 
                            regularInst.principal_amount > 0 && 
                            Math.abs(regularInst.principal_amount - (regularInst.total_amount || regularInst.amount || 0)) < 0.01;
            if (isCharge) {
              continue;
            }

            // CORRECCIÓN: Usar los valores reales de cada cuota (principal_amount e interest_amount)
            // no calcular promedios, para que coincida con AccountStatement
            const expectedPrincipal = regularInst.principal_amount || 0;
            const expectedInterest = regularInst.interest_amount || 0;

            // Resetear la fecha del primer pago para esta cuota
            firstPaymentDateForInstallment = null;

            // ✅ CORRECCIÓN: Determinar estado por `due_date` y MONTO pagado (no por splits guardados),
            // porque tras un abono a capital los splits viejos (principal/interest) pueden no coincidir.
            const round2 = (v: number) => Math.round((Number(v || 0) * 100)) / 100;
            const dueKey = regularInst.due_date?.split('T')[0] || regularInst.due_date;
            const expectedTotal = round2(
              Number(regularInst.total_amount ?? (regularInst.amount || (expectedPrincipal + expectedInterest))) || 0
            );

            let totalPaidForDue = 0;
            let firstPaidDate: string | null = null;
            if (dueKey) {
              const paymentsForThisDue = sortedPayments.filter(p => {
                if (paymentsAssignedToCharges.has(p.id)) return false;
                const pDue = (p.due_date as any)?.split?.('T')?.[0] || (p.due_date as any) || null;
                return pDue === dueKey;
              });

              totalPaidForDue = round2(paymentsForThisDue.reduce((s, p) => s + (Number(p.amount || 0) || 0), 0));
              const first = paymentsForThisDue[0];
              firstPaidDate = first ? (first.payment_date?.split('T')[0] || first.payment_date || null) : null;
            }

            if (totalPaidForDue + 0.05 >= expectedTotal && expectedTotal > 0) {
              regularInst.is_paid = true;
              regularInst.paid_date = firstPaidDate;
            } else {
              regularInst.is_paid = false;
              regularInst.paid_date = null;
            }
          }
        }
      }

      // Establecer las cuotas inmediatamente para mostrar los datos
      setInstallments(finalInstallmentsForUI);

      // Abonos a capital ya se obtuvieron al inicio de fetchData()

      // Calcular el total pagado desde los pagos reales (no desde cuotas marcadas como pagadas)
      const { data: payments, error: paymentsError } = await supabase
        .from('payments')
        .select('id, amount, principal_amount, interest_amount, due_date, payment_date')
        .eq('loan_id', loanId)
        .order('payment_date', { ascending: true });

      if (!paymentsError && payments) {
        const totalPaid = payments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
        setTotalPaidFromPayments(totalPaid);
        setAllPayments(payments || []);
      } else {
        // Fallback: calcular desde cuotas pagadas si no hay pagos
        const totalPaid = correctedInstallments
          .filter(inst => inst.is_paid)
          .reduce((sum, inst) => sum + (inst.amount || 0), 0);
        setTotalPaidFromPayments(totalPaid);
        setAllPayments([]);
      }

      // Actualizar BD en segundo plano (no bloquea la UI)
      const needsUpdate = (data || []).some(inst => 
        !inst.amount || inst.amount === 0 || 
        !inst.principal_amount || inst.principal_amount === 0 || 
        !inst.interest_amount || inst.interest_amount === 0
      );

      if (needsUpdate) {
        // Hacer las actualizaciones en segundo plano sin bloquear
        setTimeout(async () => {
          const updates = [];
        for (let i = 0; i < (data || []).length; i++) {
          const originalInstallment = data[i];
          const correctedInstallment = correctedInstallments[i];
          
          if ((!originalInstallment.amount || originalInstallment.amount === 0) && 
              correctedInstallment.amount > 0) {
              updates.push(
                supabase
                .from('installments')
                .update({
                  amount: correctedInstallment.amount,
                  principal_amount: correctedInstallment.principal_amount,
                  interest_amount: correctedInstallment.interest_amount
                })
                  .eq('id', originalInstallment.id)
              );
            }
          }
          // Ejecutar todas las actualizaciones en paralelo
          if (updates.length > 0) {
            await Promise.all(updates);
            }
        }, 0);
      }
    } catch (error) {
      console.error('Error fetching installments:', error);
      toast.error('Error al cargar las cuotas');
    } finally {
      setLoading(false);
    }
  };


  const getStatusBadge = (installment: Installment) => {
    // Si la cuota está marcada como saldada (pero no pagada individualmente), mostrar "Saldada"
    // Esto tiene prioridad sobre is_paid porque indica que fue saldada en una negociación
    if (installment.is_settled && !installment.is_paid) {
      return (
        <Badge variant="secondary" className="bg-blue-100 text-blue-800">
          <CheckCircle className="h-3 w-3 mr-1" />
          Saldada
        </Badge>
      );
    }

    // Si la cuota está marcada como pagada (y no está saldada), mostrar "Pagada"
    if (installment.is_paid) {
      return (
        <Badge variant="secondary" className="bg-green-100 text-green-800">
          <CheckCircle className="h-3 w-3 mr-1" />
          Pagada
        </Badge>
      );
    }

    // Parcial (pagos parciales en una misma cuota)
    if (installment.is_partial || ((installment.paid_amount || 0) > 0.01 && (installment.remaining_amount || 0) > 0.01)) {
      return (
        <Badge variant="secondary" className="bg-orange-100 text-orange-800">
          <Clock className="h-3 w-3 mr-1" />
          Parcial
        </Badge>
      );
    }

    if (!installment.due_date) {
      return (
        <Badge variant="outline">
          <Clock className="h-3 w-3 mr-1" />
          Pendiente
        </Badge>
      );
    }

    try {
      // Parsear la fecha de vencimiento como fecha local (no UTC) para evitar problemas de zona horaria
      // Usar la fecha directamente sin conversión a Date para evitar problemas de zona horaria
      const [year, month, day] = installment.due_date.split('-').map(Number);
      const dueDate = new Date(year, month - 1, day); // month es 0-indexado, crear como fecha local
      const today = getCurrentDateInSantoDomingo();
      
      // Comparar solo las fechas (sin hora) para evitar problemas de zona horaria
      const dueDateOnly = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
      const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const isOverdue = dueDateOnly < todayOnly;

      if (isOverdue) {
        return (
          <Badge variant="destructive">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Vencida
          </Badge>
        );
      }
    } catch (error) {
      // Si hay error con la fecha, mostrar como pendiente
    }

    return (
      <Badge variant="outline">
        <Clock className="h-3 w-3 mr-1" />
        Pendiente
      </Badge>
    );
  };

  const getDaysOverdue = (dueDate: string) => {
    // Si el préstamo está saldado, no mostrar días de atraso
    if (loanInfo?.status === 'paid') {
      return 0;
    }
    if (!dueDate) return 0;
    try {
      // Parsear la fecha de vencimiento como fecha local (no UTC) para evitar problemas de zona horaria
      const [year, month, day] = dueDate.split('-').map(Number);
      const due = new Date(year, month - 1, day); // month es 0-indexado, crear como fecha local
      const today = getCurrentDateInSantoDomingo();
      
      // Comparar solo las fechas (sin hora) para evitar problemas de zona horaria
      const dueDateOnly = new Date(due.getFullYear(), due.getMonth(), due.getDate());
      const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      
      // Calcular diferencia en días
      const diffTime = todayOnly.getTime() - dueDateOnly.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      return Math.max(0, diffDays);
    } catch (error) {
      return 0;
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    try {
      // Usar formatDateStringForSantoDomingo para evitar problemas de zona horaria
      return formatDateStringForSantoDomingo(dateString);
    } catch (error) {
      return '-';
    }
  };

  // CORRECCIÓN: Calcular totales usando valores originales sin redondear
  // Para evitar que la suma de valores redondeados cause diferencias (ej: 13,002 vs 13,000)
  let totalAmount = 0;
  let totalPaid = 0;
  let balancePending = 0; // Declarar fuera para usarlo después
  
  // Calcular total de abonos a capital
  const totalCapitalPayments = capitalPayments.reduce((sum, cp) => sum + (cp.amount || 0), 0);
  
  if (loanInfo) {
    const isIndefinite = String(loanInfo.amortization_type || '').toLowerCase() === 'indefinite';
    
    if (isIndefinite) {
      // Para préstamos indefinidos: Total = Capital Original + Interés total + Todos los cargos
      // El capital original es loanInfo.amount (que es el actual) + los abonos realizados
      const originalCapital = loanInfo.amount + totalCapitalPayments;
      
      // Calcular todos los cargos (cuotas con interest_amount = 0 y principal_amount = total_amount)
      // IMPORTANTE: Redondear cada valor individual ANTES de sumar para evitar diferencias de redondeo
      const chargesTotal = installments.reduce((sum, inst) => {
        const isCharge = Math.abs((inst as any).interest_amount || 0) < 0.01 && 
                        Math.abs((inst as any).principal_amount - ((inst as any).total_amount || inst.amount || 0)) < 0.01 &&
                        (inst as any).principal_amount > 0;
        if (isCharge) {
          const chargeAmount = (inst as any).total_amount !== undefined && (inst as any).total_amount !== null
            ? (inst as any).total_amount
            : (inst.amount || 0);
          return sum + Math.round(Number(chargeAmount));
        }
        return sum;
      }, 0);
      
      // Calcular el interés total (pagado y pendiente)
      const interestTotal = installments.reduce((sum, inst) => {
        const isCharge = Math.abs((inst as any).interest_amount || 0) < 0.01 && 
                        Math.abs((inst as any).principal_amount - ((inst as any).total_amount || inst.amount || 0)) < 0.01 &&
                        (inst as any).principal_amount > 0;
        if (!isCharge) {
          const interestAmount = (inst as any).interest_amount !== undefined && (inst as any).interest_amount !== null
            ? (inst as any).interest_amount
            : (inst.interest_amount || 0);
          return sum + Math.round(Number(interestAmount));
        }
        return sum;
      }, 0);
      
      // Total a pagar = Capital Original + Intereses (pagados y pendientes) + Cargos
      totalAmount = Math.round(originalCapital) + interestTotal + chargesTotal;
      
      // Total pagado: usar los pagos reales + abonos a capital
      totalPaid = Math.round((totalPaidFromPayments + totalCapitalPayments) * 100) / 100;
      
      // Balance pendiente = Capital actual + Interés pendiente + Cargos no pagados
      const unpaidChargesAmountIndefinite = installments
        .filter(inst => {
          const isCharge = Math.abs((inst as any).interest_amount || 0) < 0.01 && 
                          Math.abs((inst as any).principal_amount - ((inst as any).total_amount || inst.amount || 0)) < 0.01 &&
                          (inst as any).principal_amount > 0;
          return isCharge && !inst.is_paid;
        })
        .reduce((sum, inst) => sum + Math.round(Number((inst as any).total_amount || inst.amount || 0)), 0);
      
      const unpaidInterestTotal = installments
        .filter(inst => {
          const isCharge = Math.abs((inst as any).interest_amount || 0) < 0.01 && 
                          Math.abs((inst as any).principal_amount - ((inst as any).total_amount || inst.amount || 0)) < 0.01 &&
                          (inst as any).principal_amount > 0;
          return !isCharge && !inst.is_paid;
        })
        .reduce((sum, inst) => sum + Math.round(Number((inst as any).interest_amount || 0)), 0);
      
      balancePending = Math.round(loanInfo.amount) + unpaidInterestTotal + unpaidChargesAmountIndefinite;
    } else {
      // Para préstamos con plazo definido: calcular el total correctamente
      // IMPORTANTE: Usar total_amount del préstamo como base (sin redondear) y sumar solo los cargos
      // Esto evita problemas de redondeo acumulativo al sumar cuotas individuales
      // IMPORTANTE: El capital base debe reducirse por los abonos a capital
      const capitalAfterAbonos = Math.max(0, loanInfo.amount - totalCapitalPayments);
      const baseLoanTotal = (loanInfo as any).total_amount;
      
      if (baseLoanTotal && baseLoanTotal > 0) {
        // CORRECCIÓN: El total a pagar debe ser la suma de TODAS las cuotas (pagadas y pendientes) + todos los cargos
        // IMPORTANTE: Redondear cada valor individual ANTES de sumar para evitar diferencias de redondeo
        const allChargesTotal = installments.reduce((sum, inst) => {
          const isCharge = (inst as any).interest_amount === 0 && 
                          (inst as any).principal_amount > 0 && 
                          Math.abs((inst as any).principal_amount - ((inst as any).total_amount || inst.amount || 0)) < 0.01;
          if (isCharge) {
            const chargeAmount = (inst as any).total_amount !== undefined && (inst as any).total_amount !== null
              ? (inst as any).total_amount
              : (inst.amount || 0);
            // Redondear cada valor individual antes de sumar
            return sum + Math.round(Number(chargeAmount));
          }
          return sum;
        }, 0);
        
        // Calcular suma de TODAS las cuotas (pagadas + pendientes, regulares, no cargos)
        const allRegularInstallmentsTotal = installments.reduce((sum, inst) => {
          const isCharge = (inst as any).interest_amount === 0 && 
                          (inst as any).principal_amount > 0 && 
                          Math.abs((inst as any).principal_amount - ((inst as any).total_amount || inst.amount || 0)) < 0.01;
          if (!isCharge) {
            const amount = (inst as any).total_amount !== undefined && (inst as any).total_amount !== null
              ? (inst as any).total_amount
              : (inst.amount || 0);
            // Redondear cada valor individual antes de sumar
            return sum + Math.round(Number(amount));
          }
          return sum;
        }, 0);
        
        // Total a pagar = Suma de TODAS las cuotas regulares (pagadas + pendientes) + Todos los cargos
        totalAmount = allRegularInstallmentsTotal + allChargesTotal;
        
        console.log('🔍 InstallmentsTable - Cálculo detallado de totalAmount:', {
          loanId,
          baseLoanTotal,
          allRegularInstallmentsTotal,
          allChargesTotal,
          totalAmount,
          installmentsCount: installments.length
        });
      } else {
        // Si no hay total_amount del préstamo, calcular usando la fórmula con capital ORIGINAL
        // El interés se calcula sobre el capital original, NO sobre el capital después de abonos
        const totalInterest = (loanInfo.amount * loanInfo.interest_rate * (loanInfo.term_months || installments.length)) / 100;
        // El total base usa el capital después de abonos pero el interés original
        const calculatedBaseTotal = capitalAfterAbonos + totalInterest;
        
        // Sumar solo los cargos (excluyendo penalidades)
        // IMPORTANTE: Redondear cada valor individual ANTES de sumar para evitar diferencias de redondeo
        const chargesTotal = installments.reduce((sum, inst) => {
          const isCharge = (inst as any).interest_amount === 0 && 
                          (inst as any).principal_amount > 0 && 
                          Math.abs((inst as any).principal_amount - ((inst as any).total_amount || inst.amount || 0)) < 0.01;
          if (isCharge) {
            const chargeAmount = (inst as any).total_amount !== undefined && (inst as any).total_amount !== null
              ? (inst as any).total_amount
              : (inst.amount || 0);
            // Redondear cada valor individual antes de sumar
            return sum + Math.round(Number(chargeAmount));
          }
          return sum;
        }, 0);
        
        totalAmount = Math.round(calculatedBaseTotal) + chargesTotal;
      }
      
      // Total pagado: sumar montos de todas las cuotas pagadas (regulares + cargos pagados)
      // IMPORTANTE: Redondear cada valor individual ANTES de sumar para evitar diferencias de redondeo
      const paidRegularInstallmentsTotal = installments
        .filter(inst => {
          const isCharge = (inst as any).interest_amount === 0 && 
                          (inst as any).principal_amount > 0 && 
                          Math.abs((inst as any).principal_amount - ((inst as any).total_amount || inst.amount || 0)) < 0.01;
          return inst.is_paid && !isCharge;
        })
        .reduce((sum, inst) => {
          const amount = (inst as any).total_amount !== undefined && (inst as any).total_amount !== null
            ? (inst as any).total_amount
            : (inst.amount || 0);
          // Redondear cada valor individual antes de sumar
          return sum + Math.round(Number(amount));
        }, 0);
      
      const paidChargesTotal = installments
        .filter(inst => {
          const isCharge = (inst as any).interest_amount === 0 && 
                          (inst as any).principal_amount > 0 && 
                          Math.abs((inst as any).principal_amount - ((inst as any).total_amount || inst.amount || 0)) < 0.01;
          return isCharge && inst.is_paid;
        })
        .reduce((sum, inst) => {
          const chargeAmount = (inst as any).total_amount !== undefined && (inst as any).total_amount !== null
            ? (inst as any).total_amount
            : (inst.amount || 0);
          // Redondear cada valor individual antes de sumar
          return sum + Math.round(Number(chargeAmount));
        }, 0);
      
      // CORRECCIÓN: Si tenemos totalPaidFromPayments (calculado desde pagos reales), usarlo
      // IMPORTANTE: Incluir abonos a capital en el total pagado
      if (totalPaidFromPayments > 0 || totalCapitalPayments > 0) {
        totalPaid = Math.round((totalPaidFromPayments + totalCapitalPayments) * 100) / 100;
      } else {
        // Fallback: Total pagado = suma de todas las cuotas pagadas (regulares + cargos pagados) + abonos a capital
        totalPaid = Math.round((paidRegularInstallmentsTotal + paidChargesTotal + totalCapitalPayments) * 100) / 100;
      }
      
      console.log('🔍 InstallmentsTable - Cálculo detallado de totalPaid:', {
        loanId,
        paidRegularInstallmentsTotal,
        paidChargesTotal,
        totalPaid,
        totalPaidFromPayments
      });
      
      // CORRECCIÓN: Calcular el balance pendiente como suma de cuotas pendientes + cargos no pagados
      // Las cuotas pendientes incluyen tanto capital como interés
      // IMPORTANTE: Redondear cada valor individual ANTES de sumar para evitar diferencias de redondeo
      // CORRECCIÓN CRÍTICA: Considerar pagos parciales - calcular cuánto se ha pagado de cada cargo
      const allCharges = installments.filter(inst => {
        const isCharge = (inst as any).interest_amount === 0 && 
                        (inst as any).principal_amount > 0 && 
                        Math.abs((inst as any).principal_amount - ((inst as any).total_amount || inst.amount || 0)) < 0.01;
        return isCharge;
      });
      
      const unpaidChargesAmount = allCharges.reduce((sum, inst) => {
        const chargeAmount = (inst as any).total_amount !== undefined && (inst as any).total_amount !== null
          ? (inst as any).total_amount
          : (inst.amount || 0);
        
        const chargeDueDate = inst.due_date?.split('T')[0];
        if (!chargeDueDate) {
          // Si no tiene fecha, usar el monto completo si no está pagado
          return sum + (inst.is_paid ? 0 : Math.round(Number(chargeAmount)));
        }
        
        // Obtener cargos con la misma fecha para distribuir pagos correctamente
        const chargesWithSameDate = allCharges.filter(c => c.due_date?.split('T')[0] === chargeDueDate)
          .sort((a, b) => (a.installment_number || 0) - (b.installment_number || 0));
        
        // Obtener pagos asignados a cargos con esta fecha
        const paymentsForCharges = (allPayments || []).filter(p => {
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
            remainingPayments -= Math.min(remainingPayments, prevCharge.total_amount || prevCharge.amount || 0);
          }
          principalPaidForThisCharge = Math.min(remainingPayments, chargeAmount);
        } else {
          principalPaidForThisCharge = Math.min(totalPaidForDate, chargeAmount);
        }
        
        const remainingChargeAmount = Math.max(0, chargeAmount - principalPaidForThisCharge);
        // Redondear cada valor individual antes de sumar
        return sum + Math.round(remainingChargeAmount);
      }, 0);
      
      // CORRECCIÓN: Calcular capital pendiente e interés pendiente por separado
      // Capital pendiente de cuotas regulares (sin cargos)
      const unpaidCapitalFromRegular = installments
        .filter(inst => {
          const isCharge = (inst as any).interest_amount === 0 && 
                          (inst as any).principal_amount > 0 && 
                          Math.abs((inst as any).principal_amount - ((inst as any).total_amount || inst.amount || 0)) < 0.01;
          return !inst.is_paid && !isCharge;
        })
        .reduce((sum, inst) => {
          const round2 = (v: number) => Math.round((Number(v || 0) * 100)) / 100;
          const principal = round2((inst as any).principal_amount || 0);
          const interest = round2((inst as any).interest_amount || 0);

          // Calcular pagos por due_date usando el MONTO (no el split guardado),
          // y distribuir: interés primero, luego capital.
          const instDueDate = inst.due_date?.split('T')[0];
          let totalPaid = 0;
          if (instDueDate) {
            const paymentsForThisInst = (allPayments || []).filter(p => {
              const paymentDueDate = p.due_date?.split('T')[0];
              return paymentDueDate === instDueDate;
            });
            totalPaid = round2(paymentsForThisInst.reduce((s, p) => s + (Number(p.amount || 0) || 0), 0));
          }

          const principalPaid = Math.min(principal, Math.max(0, round2(totalPaid - interest)));
          const remainingPrincipal = Math.max(0, round2(principal - principalPaid));
          return sum + (remainingPrincipal > 0.01 ? remainingPrincipal : 0);
        }, 0);
      
      // Interés pendiente de cuotas regulares
      const unpaidInterestFromRegular = installments
        .filter(inst => {
          const isCharge = (inst as any).interest_amount === 0 && 
                          (inst as any).principal_amount > 0 && 
                          Math.abs((inst as any).principal_amount - ((inst as any).total_amount || inst.amount || 0)) < 0.01;
          return !inst.is_paid && !isCharge;
        })
        .reduce((sum, inst) => {
          const round2 = (v: number) => Math.round((Number(v || 0) * 100)) / 100;
          const interest = round2((inst as any).interest_amount || 0);

          const instDueDate = inst.due_date?.split('T')[0];
          let totalPaid = 0;
          if (instDueDate) {
            const paymentsForThisInst = (allPayments || []).filter(p => {
              const paymentDueDate = p.due_date?.split('T')[0];
              return paymentDueDate === instDueDate;
            });
            totalPaid = round2(paymentsForThisInst.reduce((s, p) => s + (Number(p.amount || 0) || 0), 0));
          }

          const interestPaid = Math.min(interest, totalPaid);
          const remainingInterest = Math.max(0, round2(interest - interestPaid));
          return sum + (remainingInterest > 0.01 ? remainingInterest : 0);
        }, 0);
      
      // Balance pendiente = Capital pendiente (incluye cargos) + Interés pendiente
      // El capital pendiente de las cuotas regulares NO incluye los cargos, entonces se suman por separado
      balancePending = Math.round((unpaidCapitalFromRegular + unpaidInterestFromRegular + unpaidChargesAmount) * 100) / 100;
      
      // CORRECCIÓN: Priorizar valor de BD para balancePending si está disponible
      if (loanInfo.remaining_balance !== null && loanInfo.remaining_balance !== undefined) {
        const diff = Math.abs(balancePending - loanInfo.remaining_balance);
        // Si la diferencia es pequeña (menos de 5 pesos), usar el valor de la BD como fuente de verdad
        if (diff < 5) {
          balancePending = Math.round(loanInfo.remaining_balance * 100) / 100;
        }
      }
      
      // Asegurar que totalAmount = totalPaid + balancePending para consistencia
      // Esto corrige cualquier diferencia por redondeo acumulativo
      // IMPORTANTE: Redondear a 2 decimales para evitar errores de redondeo
      // Total = Pagado + Pendiente (preferir remaining_balance de BD si existe)
      const pendingFromDb = (loanInfo.remaining_balance !== null && loanInfo.remaining_balance !== undefined)
        ? Number(loanInfo.remaining_balance)
        : balancePending;
      const recalculatedTotalAmount = Math.round((totalPaid + pendingFromDb) * 100) / 100;
      totalAmount = recalculatedTotalAmount;
      
      console.log('🔍 InstallmentsTable - Cálculo detallado de balance:', {
        loanId,
        unpaidCapitalFromRegular,
        unpaidInterestFromRegular,
        unpaidChargesAmount,
        balancePending,
        totalPaid,
        totalAmount,
        totalAmountRecalculated: totalPaid + balancePending
      });
    }
  } else {
    // Fallback: usar valores de la BD si no hay loanInfo
    // IMPORTANTE: Redondear cada valor individual ANTES de sumar para evitar diferencias de redondeo
    totalPaid = totalPaidFromPayments > 0 ? Math.round(totalPaidFromPayments * 100) / 100 : 
      installments.filter(inst => inst.is_paid).reduce((sum, inst) => {
        const amount = (inst as any).total_amount || inst.amount || 0;
        return sum + (Math.round(Number(amount) * 100) / 100);
      }, 0);
    
    // Calcular balance pendiente considerando pagos parciales
    const allCharges = installments.filter(inst => {
      const isCharge = Math.abs((inst as any).interest_amount || 0) < 0.01 && 
                      Math.abs((inst as any).principal_amount - ((inst as any).total_amount || inst.amount || 0)) < 0.01;
      return isCharge;
    });
    
    const unpaidChargesAmount = allCharges.reduce((sum, inst) => {
      const chargeAmount = (inst as any).total_amount || inst.amount || 0;
      const chargeDueDate = inst.due_date?.split('T')[0];
      
      if (!chargeDueDate) {
        return sum + (inst.is_paid ? 0 : (Math.round(Number(chargeAmount) * 100) / 100));
      }
      
      const chargesWithSameDate = allCharges.filter(c => c.due_date?.split('T')[0] === chargeDueDate)
        .sort((a, b) => (a.installment_number || 0) - (b.installment_number || 0));
      
      const paymentsForCharges = (allPayments || []).filter(p => {
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
          remainingPayments -= Math.min(remainingPayments, prevCharge.total_amount || prevCharge.amount || 0);
        }
        principalPaidForThisCharge = Math.min(remainingPayments, chargeAmount);
      } else {
        principalPaidForThisCharge = Math.min(totalPaidForDate, chargeAmount);
      }
      
      const remainingChargeAmount = Math.max(0, chargeAmount - principalPaidForThisCharge);
      return sum + (Math.round(remainingChargeAmount * 100) / 100);
    }, 0);
    
    const capitalPending = Math.round(((loanInfo?.amount || 0) - totalPaidFromPayments) * 100) / 100;
    const interestPending = installments
      .filter(inst => !inst.is_paid && !(Math.abs((inst as any).interest_amount || 0) < 0.01))
      .reduce((sum, inst) => sum + (Math.round(((inst as any).interest_amount || 0) * 100) / 100), 0);
    
    balancePending = capitalPending + interestPending + unpaidChargesAmount;
    totalAmount = totalPaid + balancePending;
  }
  
  // Si el préstamo está saldado, el total pendiente debe ser 0
  const isLoanSettled = loanInfo?.status === 'paid';

  // ✅ CORRECCIÓN: El "Total Pendiente" debe salir del plan de cuotas real (installments),
  // no de `loan.total_amount` (puede quedar desactualizado tras un abono a capital).
  // `balancePending` ya se calcula como: capital pendiente (regular) + interés pendiente + cargos pendientes.
  const round2 = (v: number) => Math.round((Number(v || 0) * 100)) / 100;
  let totalPending = isLoanSettled ? 0 : Math.max(0, round2(balancePending));

  // ✅ Plazo fijo: El TOTAL y el BALANCE deben incluir cargos y evitar desfaces por redondeo
  // (ej. 20,333 * 12 = 243,996 vs total_amount = 244,000).
  // Usar `loanInfo.total_amount` (o fórmula) como base y sumar cargos.
  if (loanInfo && String(loanInfo?.amortization_type || '').toLowerCase() !== 'indefinite') {
    const isCharge = (inst: any) =>
      Math.abs(Number((inst as any).interest_amount || 0)) < 0.01 &&
      Number((inst as any).principal_amount || 0) > 0 &&
      Math.abs(Number((inst as any).principal_amount || 0) - Number((inst as any).total_amount ?? inst.amount ?? 0)) < 0.01;

    const chargesTotal = round2(
      (installments || []).filter(isCharge).reduce((s, inst: any) => s + (Number(inst.total_amount ?? inst.amount ?? 0) || 0), 0)
    );

    let baseLoanTotal = Number((loanInfo as any).total_amount || 0) || 0;
    if (!(baseLoanTotal > 0)) {
      const term = Number(loanInfo.term_months || 0) || 0;
      const totalInterest = Number(loanInfo.amount || 0) * (Number(loanInfo.interest_rate || 0) / 100) * term;
      baseLoanTotal = Number(loanInfo.amount || 0) + totalInterest;
    }
    baseLoanTotal = round2(baseLoanTotal);

    // Total pagado ya incluye abonos a capital en esta pantalla
    const paid = round2(totalPaid);
    totalAmount = round2(baseLoanTotal + chargesTotal);
    totalPending = isLoanSettled ? 0 : Math.max(0, round2(totalAmount - paid));
    balancePending = totalPending;
  }

  // CORRECCIÓN: El "Total a Pagar" debe ser consistente:
  // Total a pagar = Total pagado + Total pendiente
  // (El total pagado incluye abonos a capital; el total pendiente se calcula desde total_amount/cargos/pagos)
  totalAmount = Math.round((totalPaid + totalPending) * 100) / 100;
  
  console.log('🔍 InstallmentsTable - Cálculo de totales finales:', {
    loanId,
    totalAmount,
    totalPaid,
    totalCapitalPayments,
    totalPending,
    isLoanSettled
  });
  const paidCount = installments.filter(inst => inst.is_paid).length;
  const pendingCount = installments.length - paidCount;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Tabla de Cuotas
              {loanInfo && (
                <span className="text-sm font-normal text-gray-600">
                  - {loanInfo.clients?.full_name}
                </span>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={refreshData}
              disabled={loading}
              className="flex items-center gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </Button>
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
              <p className="text-gray-600">Cargando cuotas...</p>
            </div>
          </div>
        ) : installments.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <p className="text-gray-600">No se encontraron cuotas para este préstamo</p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Resumen del préstamo */}
            {loanInfo && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Información del Préstamo</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Cliente:</span>
                      <div className="font-semibold">{loanInfo.clients?.full_name}</div>
                    </div>
                    <div>
                      <span className="text-gray-600">Monto Original:</span>
                      <div className="font-semibold">RD${formatCurrencyNumber(loanInfo.amount || 0)}</div>
                    </div>
                    <div>
                      <span className="text-gray-600">Balance Restante:</span>
                      <div className="font-semibold">RD${formatCurrencyNumber(totalPending)}</div>
                    </div>
                    <div>
                      <span className="text-gray-600">Cuota Mensual:</span>
                      <div className="font-semibold">RD${formatCurrencyNumber(loanInfo.monthly_payment || 0)}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Estadísticas de cuotas */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Resumen de Cuotas</CardTitle>
                {installments.some(inst => !inst.amount || !inst.due_date) && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-2">
                    <div className="flex items-center gap-2 text-yellow-800">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="text-sm">
                        ⚠️ Algunas cuotas tienen datos incompletos. Esto puede deberse a extensiones de plazo recientes.
                      </span>
                    </div>
                  </div>
                )}
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-3 bg-blue-50 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">
                      {String(loanInfo?.amortization_type || '').toLowerCase() === 'indefinite' ? '1/X' : installments.length}
                    </div>
                    <div className="text-sm text-gray-600">Total Cuotas</div>
                  </div>
                  <div className="text-center p-3 bg-green-50 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">{paidCount}</div>
                    <div className="text-sm text-gray-600">Pagadas</div>
                  </div>
                  <div className="text-center p-3 bg-orange-50 rounded-lg">
                    <div className="text-2xl font-bold text-orange-600">{pendingCount}</div>
                    <div className="text-sm text-gray-600">Pendientes</div>
                  </div>
                  <div className="text-center p-3 bg-red-50 rounded-lg">
                    <div className="text-2xl font-bold text-red-600">
                      {installments.filter(inst => !inst.is_paid && getDaysOverdue(inst.due_date) > 0).length}
                    </div>
                    <div className="text-sm text-gray-600">Vencidas</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Tabla de cuotas */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Detalle de Cuotas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  {/* Vista móvil */}
                  <div className="block md:hidden space-y-3">
                    {installments.map((installment) => (
                      <div key={installment.id} className="border rounded-lg p-4 bg-white">
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-lg">
                              {String(loanInfo?.amortization_type || '').toLowerCase() === 'indefinite' 
                                ? `#${installment.installment_number}/X` 
                                : `#${installment.installment_number}`}
                            </span>
                            {getStatusBadge(installment)}
                          </div>
                          <div className="text-right">
                            <div className="font-bold text-green-600">
                              RD${formatCurrencyNumber(installment.amount || 0)}
                            </div>
                            {(installment.remaining_amount || 0) > 0.01 && (installment.paid_amount || 0) > 0.01 && (
                              <div className="text-xs mt-1 space-y-0.5">
                                <div className="text-gray-600">Pagado: RD${formatCurrencyNumber(installment.paid_amount || 0)}</div>
                                <div className="text-orange-600 font-semibold">Falta: RD${formatCurrencyNumber(installment.remaining_amount || 0)}</div>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-2 text-sm text-gray-600">
                          <div>
                            <span className="font-medium">Vence:</span>
                            <div>{formatDate(installment.due_date)}</div>
                          </div>
                          <div>
                            <span className="font-medium">Capital:</span>
                            <div>RD${formatCurrencyNumber(installment.principal_amount || 0)}</div>
                          </div>
                          <div>
                            <span className="font-medium">Interés:</span>
                            <div>RD${formatCurrencyNumber(installment.interest_amount || 0)}</div>
                          </div>
                          <div>
                            <span className="font-medium">Mora Pagada:</span>
                            <div>RD${formatCurrencyNumber(installment.late_fee_paid || 0)}</div>
                          </div>
                        </div>

                        {installment.is_paid && installment.paid_date && (
                          <div className="mt-2 pt-2 border-t text-sm text-green-600">
                            <span className="font-medium">Pagada el:</span> {formatDate(installment.paid_date)}
                          </div>
                        )}

                        {!isLoanSettled && !installment.is_paid && getDaysOverdue(installment.due_date) > 0 && (
                          <div className="mt-2 pt-2 border-t text-sm text-red-600">
                            <span className="font-medium">Días de atraso:</span> {getDaysOverdue(installment.due_date)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Vista desktop */}
                  <div className="hidden md:block">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b bg-gray-50">
                          <th className="text-left p-3 font-semibold"># Cuota</th>
                          <th className="text-left p-3 font-semibold">Fecha Vencimiento</th>
                          <th className="text-left p-3 font-semibold">Monto</th>
                          <th className="text-left p-3 font-semibold">Capital</th>
                          <th className="text-left p-3 font-semibold">Interés</th>
                          <th className="text-left p-3 font-semibold">Mora Pagada</th>
                          <th className="text-left p-3 font-semibold">Estado</th>
                          <th className="text-left p-3 font-semibold">Fecha Pago</th>
                          <th className="text-left p-3 font-semibold">Días Atraso</th>
                        </tr>
                      </thead>
                      <tbody>
                        {installments.map((installment) => (
                          <tr key={installment.id} className="border-b hover:bg-gray-50">
                            <td className="p-3 font-semibold">
                              {String(loanInfo?.amortization_type || '').toLowerCase() === 'indefinite' 
                                ? `#${installment.installment_number}/X` 
                                : `#${installment.installment_number}`}
                            </td>
                            <td className="p-3">{formatDate(installment.due_date)}</td>
                            <td className="p-3 font-semibold text-green-600">
                              <div>RD${formatCurrencyNumber(installment.amount || 0)}</div>
                              {(installment.remaining_amount || 0) > 0.01 && (installment.paid_amount || 0) > 0.01 && (
                                <div className="text-xs mt-1">
                                  <div className="text-gray-600">Pagado: RD${formatCurrencyNumber(installment.paid_amount || 0)}</div>
                                  <div className="text-orange-600 font-semibold">Falta: RD${formatCurrencyNumber(installment.remaining_amount || 0)}</div>
                                </div>
                              )}
                            </td>
                            <td className="p-3">RD${formatCurrencyNumber(installment.principal_amount || 0)}</td>
                            <td className="p-3">RD${formatCurrencyNumber(installment.interest_amount || 0)}</td>
                            <td className="p-3">RD${formatCurrencyNumber(installment.late_fee_paid || 0)}</td>
                            <td className="p-3">{getStatusBadge(installment)}</td>
                            <td className="p-3">
                              {installment.paid_date ? formatDate(installment.paid_date) : '-'}
                            </td>
                            <td className="p-3">
                              {!isLoanSettled && !installment.is_paid && getDaysOverdue(installment.due_date) > 0 ? (
                                <span className="text-red-600 font-semibold">
                                  {getDaysOverdue(installment.due_date)} días
                                </span>
                              ) : (
                                '-'
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Totales */}
            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                  <div>
                    <div className="text-lg font-bold text-blue-600">
                      RD${formatCurrencyNumber(totalAmount)}
                    </div>
                    <div className="text-sm text-gray-600">Total a Pagar</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-green-600">
                      RD${formatCurrencyNumber(totalPaid)}
                    </div>
                    <div className="text-sm text-gray-600">Total Pagado</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-orange-600">
                      RD${formatCurrencyNumber(totalPending)}
                    </div>
                    <div className="text-sm text-gray-600">Total Pendiente</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-gray-600">
                      {totalAmount > 0 ? Math.round((totalPaid / totalAmount) * 100) : 0}%
                    </div>
                    <div className="text-sm text-gray-600">% Pagado</div>
                  </div>
                </div>
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
    </Dialog>
  );
};
