// Utilidad para calcular mora usando cuotas de la tabla installments
import { getCurrentDateInSantoDomingo } from './dateUtils';
import { supabase } from '@/integrations/supabase/client';

export interface LoanData {
  id: string;
  remaining_balance: number;
  next_payment_date: string;
  late_fee_rate: number;
  grace_period_days: number;
  max_late_fee?: number;
  late_fee_calculation_type: 'daily' | 'monthly' | 'compound';
  late_fee_enabled: boolean;
  amount: number;
  term: number;
  payment_frequency: string;
  interest_rate?: number;
  monthly_payment?: number;
  start_date?: string;
  amortization_type?: string; // Tipo de amortización (indefinite, simple, etc.)
}

/**
 * Obtiene el desglose de mora usando las cuotas de la tabla installments
 */
export const getLateFeeBreakdownFromInstallments = async (
  loanId: string,
  loan: LoanData,
  calculationDate: Date = getCurrentDateInSantoDomingo()
): Promise<{
  totalLateFee: number;
  breakdown: Array<{
    installment: number;
    dueDate: string;
    daysOverdue: number;
    principal: number;
    lateFee: number;
    isPaid: boolean;
  }>;
}> => {
  try {
    console.log('🔍 getLateFeeBreakdownFromInstallments: Fecha de cálculo:', calculationDate.toISOString().split('T')[0]);
    console.log('🔍 getLateFeeBreakdownFromInstallments: Fecha actual del sistema:', new Date().toISOString().split('T')[0]);
    // Obtener las cuotas de la tabla installments
    const { data: installments, error } = await supabase
      .from('installments')
      .select('*')
      .eq('loan_id', loanId)
      .order('installment_number', { ascending: true });
      
    if (error) {
      console.error('Error obteniendo cuotas:', error);
      return { totalLateFee: 0, breakdown: [] };
    }
    
    if (!installments || installments.length === 0) {
      console.warn('No se encontraron cuotas en la tabla installments para el préstamo:', loanId);
      return { totalLateFee: 0, breakdown: [] };
    }
    
    let totalLateFee = 0;
    const breakdown: Array<{
      installment: number;
      dueDate: string;
      daysOverdue: number;
      principal: number;
      lateFee: number;
      isPaid: boolean;
    }> = [];
    
    // Obtener todos los pagos del préstamo para verificar si hay pagos que cubren cuotas
    const { data: payments, error: paymentsError } = await supabase
      .from('payments')
      .select('id, principal_amount, interest_amount, payment_date, amount')
      .eq('loan_id', loanId)
      .order('payment_date', { ascending: true });
    
    if (paymentsError) {
      console.error('Error obteniendo pagos:', paymentsError);
    }
    
    // Asignar pagos a cuotas en orden cronológico
    const paymentToInstallmentMap = new Map<string, number>();
    const assignedPaymentIds = new Set<string>();
    
    if (payments && payments.length > 0) {
      // Ordenar pagos por fecha
      const sortedPayments = [...payments].sort((a, b) => {
        return new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime();
      });
      
      // ESTRATEGIA SIMPLIFICADA: Asignar TODOS los pagos en orden cronológico a TODAS las cuotas en orden secuencial
      // Sin importar si están marcadas como pagadas o no
      // Esto asegura que cada pago se asigne a la cuota correcta
      let paymentIndex = 0;
      
      for (let i = 0; i < installments.length && paymentIndex < sortedPayments.length; i++) {
        const installment = installments[i];
        const payment = sortedPayments[paymentIndex];
        
        if (payment && !assignedPaymentIds.has(payment.id)) {
          assignedPaymentIds.add(payment.id);
          paymentToInstallmentMap.set(payment.id, installment.installment_number);
          paymentIndex++;
          console.log(`🔍 getLateFeeBreakdownFromInstallments: Asignación - Cuota ${installment.installment_number} → Pago del ${payment.payment_date} (RD$${payment.amount})`);
        }
      }
    }
    
    // Procesar cada cuota de la base de datos
    for (const installment of installments) {
      let daysOverdue = 0;
      let lateFee = 0;
      let isActuallyPaid = installment.is_paid;
      
      // Verificar si hay un pago asignado a esta cuota aunque no esté marcada como pagada
      if (!isActuallyPaid && paymentToInstallmentMap.size > 0) {
        for (const [paymentId, installmentNum] of paymentToInstallmentMap.entries()) {
          if (installmentNum === installment.installment_number) {
            isActuallyPaid = true;
            const assignedPayment = payments?.find(p => p.id === paymentId);
            console.log(`🔍 getLateFeeBreakdownFromInstallments: Cuota ${installment.installment_number} marcada como pagada por pago asignado:`, {
              paymentId,
              paymentDate: assignedPayment?.payment_date,
              paymentAmount: assignedPayment?.amount,
              installmentNumber: installmentNum
            });
            break;
          }
        }
      }
      
      console.log(`🔍 getLateFeeBreakdownFromInstallments: Cuota ${installment.installment_number} - Estado final:`, {
        is_paid_in_db: installment.is_paid,
        isActuallyPaid,
        hasAssignedPayment: Array.from(paymentToInstallmentMap.values()).includes(installment.installment_number)
      });
      
      if (isActuallyPaid) {
        // Si está pagada, mostrar 0 días y 0 mora
        daysOverdue = 0;
        lateFee = 0;
      } else {
        // Calcular días de atraso desde la fecha de vencimiento hasta hoy
        // Parsear la fecha como fecha local para evitar problemas de zona horaria
        const [year, month, day] = installment.due_date.split('-').map(Number);
        const dueDate = new Date(year, month - 1, day); // month es 0-indexado
        const daysSinceDue = Math.floor((calculationDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        daysOverdue = Math.max(0, daysSinceDue - (loan.grace_period_days || 0));
        
        console.log(`🔍 getLateFeeBreakdownFromInstallments: Cuota ${installment.installment_number}:`, {
          dueDate: installment.due_date,
          calculationDate: calculationDate.toISOString().split('T')[0],
          daysSinceDue,
          gracePeriodDays: loan.grace_period_days || 0,
          daysOverdue
        });
        
        // Calcular mora si hay días de atraso
        if (daysOverdue > 0) {
          // CORRECCIÓN: Para préstamos indefinidos, usar interest_amount o total_amount
          // ya que principal_amount es 0
          const isIndefinite = loan.amortization_type === 'indefinite';
          const baseAmount = isIndefinite && installment.principal_amount === 0
            ? (installment.interest_amount || installment.total_amount || installment.amount || 0)
            : (installment.principal_amount || installment.total_amount || installment.amount || 0);
          
          switch (loan.late_fee_calculation_type) {
            case 'daily':
              lateFee = (baseAmount * loan.late_fee_rate / 100) * daysOverdue;
              break;
            case 'monthly':
              const monthsOverdue = Math.ceil(daysOverdue / 30);
              lateFee = (baseAmount * loan.late_fee_rate / 100) * monthsOverdue;
              break;
            case 'compound':
              lateFee = baseAmount * (Math.pow(1 + loan.late_fee_rate / 100, daysOverdue) - 1);
              break;
            default:
              lateFee = (baseAmount * loan.late_fee_rate / 100) * daysOverdue;
          }
          
          if (loan.max_late_fee && loan.max_late_fee > 0) {
            lateFee = Math.min(lateFee, loan.max_late_fee);
          }
          
          lateFee = Math.round(lateFee * 100) / 100;
          
          // Restar la mora ya pagada de esta cuota
          const lateFeePaid = installment.late_fee_paid || 0;
          lateFee = Math.max(0, lateFee - lateFeePaid);
        }
      }
      
      // Solo agregar al total si la cuota NO está pagada
      if (!isActuallyPaid) {
        totalLateFee += lateFee;
      }
      
      // SIEMPRE agregar la cuota al desglose (pagada o pendiente)
      breakdown.push({
        installment: installment.installment_number,
        dueDate: installment.due_date,
        daysOverdue,
        principal: installment.principal_amount,
        lateFee: isActuallyPaid ? 0 : lateFee,
        isPaid: isActuallyPaid
      });
    }
    
    // CORRECCIÓN: Para préstamos indefinidos, generar dinámicamente todas las cuotas vencidas
    // desde la primera no pagada hasta hoy
    if (loan.amortization_type === 'indefinite' && loan.start_date && loan.next_payment_date) {
      const maxInstallmentNumber = installments.length > 0 
        ? Math.max(...installments.map(i => i.installment_number))
        : 0;
      
      // Calcular la primera fecha de pago desde start_date
      const startDateStr = loan.start_date.split('T')[0];
      const [startYear, startMonth, startDay] = startDateStr.split('-').map(Number);
      const startDate = new Date(startYear, startMonth - 1, startDay);
      
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
          // Preservar el día del mes de start_date
          const startDay = startDate.getDate();
          const nextMonth = startDate.getMonth() + 1;
          const nextYear = startDate.getFullYear();
          // Verificar si el día existe en el mes siguiente
          const lastDayOfNextMonth = new Date(nextYear, nextMonth + 1, 0).getDate();
          const dayToUse = Math.min(startDay, lastDayOfNextMonth);
          firstPaymentDate.setFullYear(nextYear, nextMonth, dayToUse);
          break;
      }
      
      // Calcular cuántas cuotas deberían existir desde firstPaymentDate hasta hoy
      const monthsElapsed = Math.max(0, 
        (calculationDate.getFullYear() - firstPaymentDate.getFullYear()) * 12 + 
        (calculationDate.getMonth() - firstPaymentDate.getMonth())
      );
      const totalExpected = monthsElapsed + 1;
      
      // Calcular el monto base para la mora (interés por cuota para indefinidos)
      const isIndefinite = loan.amortization_type === 'indefinite';
      let baseAmount = 0;
      
      if (isIndefinite) {
        const lastInstallment = installments[installments.length - 1];
        baseAmount = lastInstallment?.interest_amount || lastInstallment?.total_amount || lastInstallment?.amount || loan.monthly_payment || 0;
      } else {
        const lastInstallment = installments[installments.length - 1];
        baseAmount = lastInstallment?.principal_amount || lastInstallment?.total_amount || lastInstallment?.amount || 0;
      }
      
      // CORRECCIÓN: Calcular cuántas cuotas se han pagado basándose en los pagos
      // para saber cuáles cuotas generadas dinámicamente están pagadas
      let paidInstallmentsCount = 0;
      if (payments && payments.length > 0 && isIndefinite && baseAmount > 0) {
        // Para préstamos indefinidos, calcular cuántas cuotas de interés se han pagado
        const totalInterestPaid = payments.reduce((sum, p) => sum + (p.interest_amount || 0), 0);
        paidInstallmentsCount = Math.floor(totalInterestPaid / baseAmount);
        console.log(`🔍 getLateFeeBreakdownFromInstallments: Cuotas pagadas calculadas desde pagos:`, {
          totalInterestPaid,
          baseAmount,
          paidInstallmentsCount
        });
      }
      
      // Generar todas las cuotas desde (maxInstallmentNumber + 1) hasta totalExpected
      for (let installmentNum = maxInstallmentNumber + 1; installmentNum <= totalExpected; installmentNum++) {
        // Calcular la fecha de vencimiento de esta cuota
        const installmentDate = new Date(firstPaymentDate);
        const periodsToAdd = installmentNum - 1;
        
        switch (frequency) {
          case 'daily':
            installmentDate.setDate(firstPaymentDate.getDate() + periodsToAdd);
            break;
          case 'weekly':
            installmentDate.setDate(firstPaymentDate.getDate() + (periodsToAdd * 7));
            break;
          case 'biweekly':
            installmentDate.setDate(firstPaymentDate.getDate() + (periodsToAdd * 14));
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
            installmentDate.setFullYear(targetYear, targetMonth, dayToUse);
            break;
        }
        
        const dueDateStr = `${installmentDate.getFullYear()}-${String(installmentDate.getMonth() + 1).padStart(2, '0')}-${String(installmentDate.getDate()).padStart(2, '0')}`;
        
        // Verificar si ya existe una cuota con esta fecha en el breakdown
        const existingInstallment = breakdown.find(item => item.dueDate === dueDateStr);
        
        if (!existingInstallment) {
          // CORRECCIÓN: Verificar si esta cuota está pagada basándose en el número de cuotas pagadas
          // La cuota 1 es la primera, así que si se pagaron 4 cuotas, las cuotas 1-4 están pagadas
          const isPaid = isIndefinite && installmentNum <= paidInstallmentsCount;
          
          const daysSinceDue = Math.floor((calculationDate.getTime() - installmentDate.getTime()) / (1000 * 60 * 60 * 24));
          const daysOverdueForInstallment = Math.max(0, daysSinceDue - (loan.grace_period_days || 0));
          
          let lateFeeForInstallment = 0;
          // Solo calcular mora si la cuota NO está pagada y está vencida
          if (!isPaid && daysOverdueForInstallment > 0 && baseAmount > 0) {
            switch (loan.late_fee_calculation_type) {
              case 'daily':
                lateFeeForInstallment = (baseAmount * loan.late_fee_rate / 100) * daysOverdueForInstallment;
                break;
              case 'monthly':
                const monthsOverdue = Math.ceil(daysOverdueForInstallment / 30);
                lateFeeForInstallment = (baseAmount * loan.late_fee_rate / 100) * monthsOverdue;
                break;
              case 'compound':
                lateFeeForInstallment = baseAmount * (Math.pow(1 + loan.late_fee_rate / 100, daysOverdueForInstallment) - 1);
                break;
              default:
                lateFeeForInstallment = (baseAmount * loan.late_fee_rate / 100) * daysOverdueForInstallment;
            }
            
            if (loan.max_late_fee && loan.max_late_fee > 0) {
              lateFeeForInstallment = Math.min(lateFeeForInstallment, loan.max_late_fee);
            }
            
            lateFeeForInstallment = Math.round(lateFeeForInstallment * 100) / 100;
          }
          
          // Agregar la cuota generada dinámicamente al breakdown
          breakdown.push({
            installment: installmentNum,
            dueDate: dueDateStr,
            daysOverdue: isPaid ? 0 : daysOverdueForInstallment,
            principal: isIndefinite ? 0 : baseAmount,
            lateFee: isPaid ? 0 : lateFeeForInstallment,
            isPaid: isPaid
          });
          
          // Solo agregar la mora al total si la cuota NO está pagada
          if (!isPaid) {
            totalLateFee += lateFeeForInstallment;
          }
          
          console.log(`🔍 getLateFeeBreakdownFromInstallments: Cuota generada dinámicamente para indefinido:`, {
            installment: installmentNum,
            dueDate: dueDateStr,
            daysOverdue: isPaid ? 0 : daysOverdueForInstallment,
            lateFee: isPaid ? 0 : lateFeeForInstallment,
            isPaid
          });
        }
      }
    } else if (loan.next_payment_date) {
      // Para préstamos no indefinidos, mantener la lógica original
      const [nextYear, nextMonth, nextDay] = loan.next_payment_date.split('-').map(Number);
      const nextPaymentDate = new Date(nextYear, nextMonth - 1, nextDay);
      const daysSinceNextPayment = Math.floor((calculationDate.getTime() - nextPaymentDate.getTime()) / (1000 * 60 * 60 * 24));
      
      // Verificar si ya existe una cuota con esta fecha en el breakdown
      const existingInstallment = breakdown.find(item => item.dueDate === loan.next_payment_date);
      
      // Si no existe y la fecha está vencida, generar dinámicamente la cuota
      if (!existingInstallment && daysSinceNextPayment > 0) {
        const maxInstallmentNumber = installments.length > 0 
          ? Math.max(...installments.map(i => i.installment_number))
          : 0;
        const nextInstallmentNumber = maxInstallmentNumber + 1;
        
        const daysOverdueForNext = Math.max(0, daysSinceNextPayment - (loan.grace_period_days || 0));
        
        // Calcular el monto base para la mora
        const isIndefinite = loan.amortization_type === 'indefinite';
        let baseAmount = 0;
        
        if (isIndefinite) {
          const lastInstallment = installments[installments.length - 1];
          baseAmount = lastInstallment?.interest_amount || lastInstallment?.total_amount || lastInstallment?.amount || loan.monthly_payment || 0;
        } else {
          const lastInstallment = installments[installments.length - 1];
          baseAmount = lastInstallment?.principal_amount || lastInstallment?.total_amount || lastInstallment?.amount || 0;
        }
        
        let lateFeeForNext = 0;
        if (daysOverdueForNext > 0 && baseAmount > 0) {
          switch (loan.late_fee_calculation_type) {
            case 'daily':
              lateFeeForNext = (baseAmount * loan.late_fee_rate / 100) * daysOverdueForNext;
              break;
            case 'monthly':
              const monthsOverdue = Math.ceil(daysOverdueForNext / 30);
              lateFeeForNext = (baseAmount * loan.late_fee_rate / 100) * monthsOverdue;
              break;
            case 'compound':
              lateFeeForNext = baseAmount * (Math.pow(1 + loan.late_fee_rate / 100, daysOverdueForNext) - 1);
              break;
            default:
              lateFeeForNext = (baseAmount * loan.late_fee_rate / 100) * daysOverdueForNext;
          }
          
          if (loan.max_late_fee && loan.max_late_fee > 0) {
            lateFeeForNext = Math.min(lateFeeForNext, loan.max_late_fee);
          }
          
          lateFeeForNext = Math.round(lateFeeForNext * 100) / 100;
        }
        
        // Agregar la cuota generada dinámicamente al breakdown
        breakdown.push({
          installment: nextInstallmentNumber,
          dueDate: loan.next_payment_date,
          daysOverdue: daysOverdueForNext,
          principal: isIndefinite ? 0 : baseAmount,
          lateFee: lateFeeForNext,
          isPaid: false
        });
        
        // Agregar la mora al total
        totalLateFee += lateFeeForNext;
        
        console.log(`🔍 getLateFeeBreakdownFromInstallments: Cuota generada dinámicamente para next_payment_date:`, {
          installment: nextInstallmentNumber,
          dueDate: loan.next_payment_date,
          daysOverdue: daysOverdueForNext,
          lateFee: lateFeeForNext
        });
      }
    }
    
    return { totalLateFee, breakdown };
  } catch (error) {
    console.error('Error en getLateFeeBreakdownFromInstallments:', error);
    return { totalLateFee: 0, breakdown: [] };
  }
};
