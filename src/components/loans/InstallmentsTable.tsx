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
            console.log('🔔 Cambio detectado en cuotas:', payload);
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
            console.log('🔔 Cambio detectado en préstamo:', payload);
            setTimeout(() => {
              fetchData();
            }, 500);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(paymentsChannel);
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
      
      // CORRECCIÓN: Para préstamos indefinidos, obtener TODAS las cuotas (incluyendo cargos)
      // Antes solo se obtenía 1 cuota, lo que excluía los cargos
      const isIndefinite = loanInfo?.amortization_type === 'indefinite';
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
        // CORRECCIÓN: Usar next_payment_date o first_payment_date directamente si está disponible
        // Solo calcular desde start_date si no están disponibles
        const firstPaymentDateStr = loanInfo.first_payment_date?.split('T')[0] || (loanInfo as any).next_payment_date?.split('T')[0];
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
          
          // Calcular la primera fecha de pago (un mes después de start_date)
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
              // Usar setFullYear para preservar el día exacto
              firstPaymentDateBase.setFullYear(startDate.getFullYear(), startDate.getMonth() + 1, startDate.getDate());
              break;
          }
        }
        
        if (firstPaymentDateBase) {
          // Obtener todos los pagos para determinar cuántas cuotas se han pagado
          const { data: allPayments, error: paymentsError } = await supabase
            .from('payments')
            .select('id, interest_amount, payment_date')
            .eq('loan_id', loanId)
            .order('payment_date', { ascending: true });

          // Calcular cuántas cuotas se han pagado basándose en los pagos
          // Para préstamos indefinidos, acumular interés pagado para manejar múltiples pagos
          const interestPerPayment = (loanInfo.amount || 0) * ((loanInfo.interest_rate || 0) / 100);
          let paidInstallmentsCount = 0;
          if (allPayments && interestPerPayment > 0) {
            // CORRECCIÓN: Acumular interés pagado para contar correctamente cuando hay múltiples pagos
            let totalInterestPaid = 0;
            for (const payment of allPayments) {
              totalInterestPaid += payment.interest_amount || 0;
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
          const monthsFromTime = Math.max(1, monthsElapsed + 1); // +1 para incluir el mes siguiente
          const monthsFromPayments = Math.max(1, paidInstallmentsCount + 1); // +1 para incluir la próxima cuota
          monthsElapsed = Math.max(monthsFromTime, monthsFromPayments);
          
          console.log('🔍 InstallmentsTable: Cálculo de cuotas para préstamo indefinido:', {
            loanId,
            paidInstallmentsCount,
            monthsFromTime,
            monthsFromPayments,
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
                // Usar setFullYear para preservar el día exacto y evitar problemas de zona horaria
                // La cuota 1 usa la fecha base (i - 1 = 0), la cuota 2 suma 1 mes, etc.
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
            
            dynamicInstallments.push({
              id: existingInstallment?.id || `dynamic-${i}`,
              loan_id: loanId,
              installment_number: i,
              due_date: finalDueDate,
              amount: existingInstallment?.amount || interestPerPayment,
              // CORRECCIÓN: Para préstamos indefinidos, las cuotas normales (con interés) deben tener principal_amount = 0
              // Solo los cargos (sin interés) tienen principal_amount > 0
              principal_amount: isChargeFromDB ? (existingInstallment.principal_amount || 0) : 0,
              interest_amount: existingInstallment?.interest_amount || interestPerPayment,
              late_fee_paid: existingInstallment?.late_fee_paid || 0,
              is_paid: existingInstallment?.is_paid || false,
              is_settled: existingInstallment?.is_settled || false,
              paid_date: existingInstallment?.paid_date || null,
              created_at: existingInstallment?.created_at || new Date().toISOString(),
              updated_at: existingInstallment?.updated_at || new Date().toISOString(),
              total_amount: existingInstallment?.total_amount || interestPerPayment
            });
          }
          
          // Asignar pagos a las cuotas generadas - CORRECCIÓN: Acumular interés pagado para manejar múltiples pagos
          if (allPayments && allPayments.length > 0 && interestPerPayment > 0) {
            // Ordenar pagos por fecha
            const sortedPayments = [...allPayments].sort((a, b) => 
              new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime()
            );
            
            // Acumular interés pagado para asignar correctamente cuando hay múltiples pagos
            let accumulatedInterest = 0;
            let paymentIndex = 0;
            let firstPaymentDateForInstallment: string | null = null;
            
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
                installment.amount = interestPerPayment;
                installment.interest_amount = interestPerPayment;
                
                // Restar el interés usado para esta cuota (el excedente se usa para la siguiente)
                accumulatedInterest -= interestPerPayment;
                
                // Resetear la fecha del primer pago para la siguiente cuota
                firstPaymentDateForInstallment = null;
              }
            }
          }
          
          // CORRECCIÓN: Mezclar cuotas dinámicas con cargos de la BD
          // Los cargos deben incluirse porque están en la BD y no se generan dinámicamente
          data = [...dynamicInstallments, ...chargesFromDB];
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
        if (!isCharge && loanInfo?.amortization_type === 'indefinite') {
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
        if (loanInfo?.amortization_type === 'indefinite') {
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

      // CORRECCIÓN: Calcular dinámicamente qué cuotas están pagadas basándose en los pagos reales
      // Esto asegura que cuando se elimina un pago, las cuotas se actualicen correctamente
      const { data: allPaymentsForStatus, error: paymentsStatusError } = await supabase
        .from('payments')
        .select('id, principal_amount, interest_amount, payment_date, amount, due_date')
        .eq('loan_id', loanId)
        .order('payment_date', { ascending: true });

      if (!paymentsStatusError && allPaymentsForStatus && allPaymentsForStatus.length > 0) {
        const isIndefinite = loanInfo?.amortization_type === 'indefinite';
        const sortedPayments = [...allPaymentsForStatus].sort((a, b) => 
          new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime()
        );

        // Crear un mapa de cuotas por número para acceso rápido
        const installmentsMap = new Map();
        sortedInstallments.forEach(inst => {
          installmentsMap.set(inst.installment_number, inst);
        });

        // Para préstamos indefinidos, procesar primero cargos y luego cuotas regulares (igual que préstamos no indefinidos)
        if (isIndefinite) {
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
              const paymentDueDate = (payment.due_date as string)?.split('T')[0] || (payment.due_date as string);
              
              const hasNoInterest = (payment.interest_amount || 0) < 0.01;
              const reasonableAmount = (payment.principal_amount || payment.amount || 0) <= chargeTotal * 1.1;
              const paymentMatchesCharge = paymentDueDate === chargeDueDate && hasNoInterest && reasonableAmount;

              if (paymentMatchesCharge) {
                const paymentAmount = payment.principal_amount || payment.amount || 0;
                const remainingCharge = chargeTotal - accumulatedPrincipal;

                if (paymentAmount > 0 && paymentAmount <= remainingCharge * 1.1) {
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

          // SEGUNDO: Procesar cuotas regulares (de interés)
          const interestPerPayment = (loanInfo.amount || 0) * ((loanInfo.interest_rate || 0) / 100);
          let accumulatedInterest = 0;
          let paymentIndex = 0;
          let firstPaymentDateForInstallment: string | null = null;

          // Crear un Set de IDs de pagos ya asignados a cargos
          const paymentsAssignedToCharges = new Set<string>();
          for (const chargeInst of chargeInstallments) {
            const chargeTotal = chargeInst.total_amount || chargeInst.amount || chargeInst.principal_amount;
            const chargeDueDate = chargeInst.due_date?.split('T')[0];
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

          for (let i = 0; i < sortedInstallments.length && paymentIndex < sortedPayments.length; i++) {
            const installment = sortedInstallments[i];

            // Saltar si es un cargo (ya fue procesado)
            const isCharge = Math.abs((installment as any).interest_amount || 0) < 0.01 &&
                            (installment as any).principal_amount > 0 &&
                            Math.abs((installment as any).principal_amount - ((installment as any).total_amount || installment.amount || 0)) < 0.01;
            if (isCharge) {
              continue;
            }

            // Acumular interés de los pagos hasta que se complete esta cuota (excluyendo pagos asignados a cargos)
            while (paymentIndex < sortedPayments.length && accumulatedInterest < interestPerPayment * 0.99) {
              const payment = sortedPayments[paymentIndex];
              
              // Saltar pagos ya asignados a cargos
              if (paymentsAssignedToCharges.has(payment.id)) {
                paymentIndex++;
                continue;
              }

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
              accumulatedInterest -= interestPerPayment;
              firstPaymentDateForInstallment = null;
            } else {
              // Si no hay suficiente interés, la cuota no está pagada
              installment.is_paid = false;
              installment.paid_date = null;
            }
          }
        } else {
          // Para préstamos no indefinidos, procesar primero cargos y luego cuotas regulares
          let paymentIndex = 0;
          let accumulatedPrincipal = 0;
          let accumulatedInterest = 0;

          // PRIMERO: Procesar TODOS los cargos
          const chargeInstallments: typeof sortedInstallments = [];
          for (const inst of sortedInstallments) {
            const isCharge = inst.interest_amount === 0 && 
                            inst.principal_amount > 0 && 
                            Math.abs(inst.principal_amount - (inst.total_amount || inst.amount || 0)) < 0.01;
            if (isCharge) {
              chargeInstallments.push(inst);
            }
          }

          // Procesar cada cargo
          for (const chargeInst of chargeInstallments) {
            const chargeTotal = chargeInst.total_amount || chargeInst.amount || chargeInst.principal_amount;
            const chargeDueDate = chargeInst.due_date?.split('T')[0];
            const chargeInstallmentNumber = chargeInst.installment_number;
            accumulatedPrincipal = 0;

            // CORRECCIÓN: Buscar TODOS los pagos que correspondan a este cargo específico
            // No usar paymentIndex porque necesitamos buscar en todos los pagos, no solo desde un índice
            // Verificar por due_date Y que no tenga interés (característica de cargos)
            for (let pIdx = 0; pIdx < sortedPayments.length && accumulatedPrincipal < chargeTotal * 0.99; pIdx++) {
              const payment = sortedPayments[pIdx];
              const paymentDueDate = (payment.due_date as string)?.split('T')[0] || (payment.due_date as string);
              
              // CORRECCIÓN: Verificar si el pago corresponde a este cargo por:
              // 1. Mismo due_date, Y
              // 2. No tiene interés (interest_amount = 0 o muy pequeño), Y
              // 3. El monto es razonable para este cargo
              const hasNoInterest = (payment.interest_amount || 0) < 0.01;
              const reasonableAmount = (payment.principal_amount || payment.amount || 0) <= chargeTotal * 1.1;
              const paymentMatchesCharge = paymentDueDate === chargeDueDate && hasNoInterest && reasonableAmount;

              if (paymentMatchesCharge) {
                const paymentAmount = payment.principal_amount || payment.amount || 0;
                const remainingCharge = chargeTotal - accumulatedPrincipal;

                if (paymentAmount > 0 && paymentAmount <= remainingCharge * 1.1) {
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
          // CORRECCIÓN: Crear un Set de IDs de pagos ya asignados a cargos para no reutilizarlos
          const paymentsAssignedToCharges = new Set<string>();
          
          // Recopilar IDs de pagos asignados a cargos
          for (const chargeInst of chargeInstallments) {
            const chargeTotal = chargeInst.total_amount || chargeInst.amount || chargeInst.principal_amount;
            const chargeDueDate = chargeInst.due_date?.split('T')[0];
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

            // Acumular pagos hasta que se complete esta cuota (excluyendo pagos ya asignados a cargos)
            while (paymentIndex < sortedPayments.length && 
                   (accumulatedPrincipal < expectedPrincipal * 0.99 || accumulatedInterest < expectedInterest * 0.99)) {
              const payment = sortedPayments[paymentIndex];
              
              // CORRECCIÓN: Saltar pagos que ya fueron asignados a cargos
              if (paymentsAssignedToCharges.has(payment.id)) {
                paymentIndex++;
                continue;
              }
              
              // Guardar la fecha del primer pago de esta cuota
              if (firstPaymentDateForInstallment === null) {
                firstPaymentDateForInstallment = payment.payment_date?.split('T')[0] || payment.payment_date || null;
              }
              
              accumulatedPrincipal += (payment.principal_amount || 0);
              accumulatedInterest += (payment.interest_amount || 0);
              paymentIndex++;
            }

            // Si se acumuló suficiente capital e interés, la cuota está completa
            if (accumulatedPrincipal >= expectedPrincipal * 0.99 && accumulatedInterest >= expectedInterest * 0.99) {
              regularInst.is_paid = true;
              regularInst.paid_date = firstPaymentDateForInstallment;
              
              // Restar el capital e interés usados para esta cuota
              accumulatedPrincipal = Math.max(0, accumulatedPrincipal - expectedPrincipal);
              accumulatedInterest = Math.max(0, accumulatedInterest - expectedInterest);
            } else {
              regularInst.is_paid = false;
              regularInst.paid_date = null;
            }
          }
        }
      }

      // Establecer las cuotas inmediatamente para mostrar los datos
      setInstallments(sortedInstallments);

      // Calcular el total pagado desde los pagos reales (no desde cuotas marcadas como pagadas)
      const { data: payments, error: paymentsError } = await supabase
        .from('payments')
        .select('amount')
        .eq('loan_id', loanId);

      if (!paymentsError && payments) {
        const totalPaid = payments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0);
        setTotalPaidFromPayments(totalPaid);
      } else {
        // Fallback: calcular desde cuotas pagadas si no hay pagos
        const totalPaid = correctedInstallments
          .filter(inst => inst.is_paid)
          .reduce((sum, inst) => sum + (inst.amount || 0), 0);
        setTotalPaidFromPayments(totalPaid);
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
  
  if (loanInfo) {
    const isIndefinite = loanInfo.amortization_type === 'indefinite';
    
    if (isIndefinite) {
      // Para préstamos indefinidos: Total = Capital + Interés total + Todos los cargos
      // Calcular todos los cargos (cuotas con interest_amount = 0 y principal_amount = total_amount)
      const chargesTotal = installments.reduce((sum, inst) => {
        const isCharge = Math.abs((inst as any).interest_amount || 0) < 0.01 && 
                        Math.abs((inst as any).principal_amount - ((inst as any).total_amount || inst.amount || 0)) < 0.01 &&
                        (inst as any).principal_amount > 0;
        if (isCharge) {
          // Usar total_amount de la BD si está disponible, sino usar amount
          const chargeAmount = (inst as any).total_amount !== undefined && (inst as any).total_amount !== null
            ? (inst as any).total_amount
            : (inst.amount || 0);
          return sum + Number(chargeAmount);
        }
        return sum;
      }, 0);
      
      // Calcular el interés total sumando todas las cuotas de interés (excluyendo cargos)
      const interestTotal = installments.reduce((sum, inst) => {
        const isCharge = Math.abs((inst as any).interest_amount || 0) < 0.01 && 
                        Math.abs((inst as any).principal_amount - ((inst as any).total_amount || inst.amount || 0)) < 0.01 &&
                        (inst as any).principal_amount > 0;
        if (!isCharge) {
          // Sumar el interés de esta cuota
          const interestAmount = (inst as any).interest_amount !== undefined && (inst as any).interest_amount !== null
            ? (inst as any).interest_amount
            : (inst.interest_amount || 0);
          return sum + Number(interestAmount);
        }
        return sum;
      }, 0);
      
      // Total = Capital + Interés total + Todos los cargos
      totalAmount = loanInfo.amount + interestTotal + chargesTotal;
      
      // Total pagado: usar los pagos reales si están disponibles
      if (totalPaidFromPayments > 0) {
        totalPaid = totalPaidFromPayments;
      } else {
        // Fallback: calcular desde cuotas pagadas sumando sus montos reales
        totalPaid = installments
          .filter(inst => inst.is_paid)
          .reduce((sum, inst) => {
            const amount = (inst as any).total_amount !== undefined && (inst as any).total_amount !== null
              ? (inst as any).total_amount
              : (inst.amount || 0);
            return sum + Number(amount);
          }, 0);
      }
    } else {
      // Para préstamos con plazo definido: calcular el total correctamente
      // IMPORTANTE: Usar total_amount del préstamo como base (sin redondear) y sumar solo los cargos
      // Esto evita problemas de redondeo acumulativo al sumar cuotas individuales
      const baseLoanTotal = (loanInfo as any).total_amount;
      
      if (baseLoanTotal && baseLoanTotal > 0) {
        // Si hay total_amount del préstamo, usarlo como base
        // Luego sumar solo los cargos (cuotas con interest_amount = 0 y principal_amount = total_amount)
        const chargesTotal = installments.reduce((sum, inst) => {
          const isCharge = (inst as any).interest_amount === 0 && 
                          (inst as any).principal_amount > 0 && 
                          Math.abs((inst as any).principal_amount - ((inst as any).total_amount || inst.amount || 0)) < 0.01;
          if (isCharge) {
            // Usar total_amount de la BD si está disponible, sino usar amount
            const chargeAmount = (inst as any).total_amount !== undefined && (inst as any).total_amount !== null
              ? (inst as any).total_amount
              : (inst.amount || 0);
            return sum + Number(chargeAmount);
          }
          return sum;
        }, 0);
        
        totalAmount = baseLoanTotal + chargesTotal;
      } else {
        // Si no hay total_amount del préstamo, sumar todas las cuotas (incluyendo cargos)
        // Usar SIEMPRE total_amount de la BD sin redondear
        totalAmount = installments.reduce((sum, inst) => {
          const amount = (inst as any).total_amount !== undefined && (inst as any).total_amount !== null
            ? (inst as any).total_amount
            : (inst.amount || 0);
          return sum + Number(amount);
        }, 0);
        
        // Si el total es 0, calcular usando la fórmula
        if (totalAmount === 0) {
          const totalInterest = (loanInfo.amount * loanInfo.interest_rate * (loanInfo.term_months || installments.length)) / 100;
          totalAmount = loanInfo.amount + totalInterest;
        }
      }
      
      // Total pagado: usar los pagos reales si están disponibles, sino calcular desde cuotas pagadas
      if (totalPaidFromPayments > 0) {
        totalPaid = totalPaidFromPayments;
      } else {
        // Calcular usando el monto real por cuota (sin redondear) × número de cuotas pagadas
        const paidInstallments = installments.filter(inst => inst.is_paid).length;
        if ((loanInfo as any).total_amount && (loanInfo as any).total_amount > 0) {
          // Usar total_amount / term_months para obtener el monto real por cuota
          const realAmountPerPayment = (loanInfo as any).total_amount / (loanInfo.term_months || installments.length);
          totalPaid = realAmountPerPayment * paidInstallments;
        } else {
          // Fallback: calcular usando la fórmula
          const totalInterest = (loanInfo.amount * loanInfo.interest_rate * (loanInfo.term_months || installments.length)) / 100;
          const realAmountPerPayment = (loanInfo.amount + totalInterest) / (loanInfo.term_months || installments.length);
          totalPaid = realAmountPerPayment * paidInstallments;
        }
      }
    }
  } else {
    // Fallback: usar valores de la BD si no hay loanInfo
    totalAmount = installments.reduce((sum, inst) => {
      const amount = (inst as any).total_amount || inst.amount || 0;
      return sum + amount;
    }, 0);
    
    totalPaid = totalPaidFromPayments > 0 ? totalPaidFromPayments : 
      installments.filter(inst => inst.is_paid).reduce((sum, inst) => {
        const amount = (inst as any).total_amount || inst.amount || 0;
        return sum + amount;
      }, 0);
  }
  
  // Si el préstamo está saldado, el total pendiente debe ser 0
  const isLoanSettled = loanInfo?.status === 'paid';
  
  // Si el préstamo está saldado, el total pendiente es 0
  const totalPending = isLoanSettled ? 0 : totalAmount - totalPaid;
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
                      {loanInfo?.amortization_type === 'indefinite' ? '1/X' : installments.length}
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
                              {loanInfo?.amortization_type === 'indefinite' 
                                ? `#${installment.installment_number}/X` 
                                : `#${installment.installment_number}`}
                            </span>
                            {getStatusBadge(installment)}
                          </div>
                          <div className="text-right">
                            <div className="font-bold text-green-600">
                              RD${formatCurrencyNumber(installment.amount || 0)}
                            </div>
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
                              {loanInfo?.amortization_type === 'indefinite' 
                                ? `#${installment.installment_number}/X` 
                                : `#${installment.installment_number}`}
                            </td>
                            <td className="p-3">{formatDate(installment.due_date)}</td>
                            <td className="p-3 font-semibold text-green-600">
                              RD${formatCurrencyNumber(installment.amount || 0)}
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
