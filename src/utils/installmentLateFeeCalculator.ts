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
    
    // Procesar cada cuota de la base de datos
    for (const installment of installments) {
      let daysOverdue = 0;
      let lateFee = 0;
      
      if (installment.is_paid) {
        // Si está pagada, mostrar 0 días y 0 mora
        daysOverdue = 0;
        lateFee = 0;
      } else {
        // Calcular días de atraso desde la fecha de vencimiento hasta hoy
        const dueDate = new Date(installment.due_date);
        const daysSinceDue = Math.floor((calculationDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        daysOverdue = Math.max(0, daysSinceDue - (loan.grace_period_days || 0));
        
        // Calcular mora si hay días de atraso
        if (daysOverdue > 0) {
          switch (loan.late_fee_calculation_type) {
            case 'daily':
              lateFee = (installment.principal_amount * loan.late_fee_rate / 100) * daysOverdue;
              break;
            case 'monthly':
              const monthsOverdue = Math.ceil(daysOverdue / 30);
              lateFee = (installment.principal_amount * loan.late_fee_rate / 100) * monthsOverdue;
              break;
            case 'compound':
              lateFee = installment.principal_amount * (Math.pow(1 + loan.late_fee_rate / 100, daysOverdue) - 1);
              break;
            default:
              lateFee = (installment.principal_amount * loan.late_fee_rate / 100) * daysOverdue;
          }
          
          if (loan.max_late_fee && loan.max_late_fee > 0) {
            lateFee = Math.min(lateFee, loan.max_late_fee);
          }
          
          lateFee = Math.round(lateFee * 100) / 100;
        }
      }
      
      // Solo agregar al total si la cuota NO está pagada
      if (!installment.is_paid) {
        totalLateFee += lateFee;
      }
      
      // SIEMPRE agregar la cuota al desglose (pagada o pendiente)
      breakdown.push({
        installment: installment.installment_number,
        dueDate: installment.due_date,
        daysOverdue,
        principal: installment.principal_amount,
        lateFee: installment.is_paid ? 0 : lateFee,
        isPaid: installment.is_paid
      });
    }
    
    return { totalLateFee, breakdown };
  } catch (error) {
    console.error('Error en getLateFeeBreakdownFromInstallments:', error);
    return { totalLateFee: 0, breakdown: [] };
  }
};
