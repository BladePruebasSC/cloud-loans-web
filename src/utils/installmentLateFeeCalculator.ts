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
        const dueDate = new Date(installment.due_date);
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
    
    return { totalLateFee, breakdown };
  } catch (error) {
    console.error('Error en getLateFeeBreakdownFromInstallments:', error);
    return { totalLateFee: 0, breakdown: [] };
  }
};
