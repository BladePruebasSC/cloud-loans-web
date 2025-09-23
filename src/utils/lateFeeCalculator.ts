// Utilidad centralizada para calcular la mora
export interface LateFeeCalculation {
  daysOverdue: number;
  lateFeeAmount: number;
  totalLateFee: number;
}

export interface LoanData {
  remaining_balance: number;
  next_payment_date: string;
  late_fee_rate: number;
  grace_period_days: number;
  max_late_fee: number;
  late_fee_calculation_type: 'daily' | 'monthly' | 'compound';
  late_fee_enabled: boolean;
}

/**
 * Calcula la mora de un préstamo desde cero
 * @param loan - Datos del préstamo
 * @param calculationDate - Fecha de cálculo (por defecto hoy)
 * @returns Cálculo de la mora
 */
export const calculateLateFee = (
  loan: LoanData, 
  calculationDate: Date = new Date()
): LateFeeCalculation => {
  // Si la mora no está habilitada, retornar ceros
  if (!loan.late_fee_enabled || !loan.late_fee_rate) {
    return {
      daysOverdue: 0,
      lateFeeAmount: 0,
      totalLateFee: 0
    };
  }

  const dueDate = new Date(loan.next_payment_date);
  const gracePeriod = loan.grace_period_days || 0;
  
  // Calcular días de retraso considerando el período de gracia
  const daysOverdue = Math.max(0, Math.ceil((calculationDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)) - gracePeriod);
  
  // Si no hay días de mora, retornar ceros
  if (daysOverdue <= 0) {
    return {
      daysOverdue: 0,
      lateFeeAmount: 0,
      totalLateFee: 0
    };
  }

  // Calcular mora según el tipo de cálculo
  let lateFeeAmount = 0;
  
  switch (loan.late_fee_calculation_type) {
    case 'daily':
      // Mora diaria simple: Balance × Tasa × Días
      lateFeeAmount = (loan.remaining_balance * loan.late_fee_rate / 100) * daysOverdue;
      break;
      
    case 'monthly':
      // Mora mensual: Balance × Tasa × Meses
      const monthsOverdue = Math.ceil(daysOverdue / 30);
      lateFeeAmount = (loan.remaining_balance * loan.late_fee_rate / 100) * monthsOverdue;
      break;
      
    case 'compound':
      // Mora compuesta: Balance × (1 + Tasa)^Días - Balance
      lateFeeAmount = loan.remaining_balance * (Math.pow(1 + loan.late_fee_rate / 100, daysOverdue) - 1);
      break;
      
    default:
      // Default a diaria
      lateFeeAmount = (loan.remaining_balance * loan.late_fee_rate / 100) * daysOverdue;
  }

  // Aplicar límite máximo si está configurado
  if (loan.max_late_fee && loan.max_late_fee > 0) {
    lateFeeAmount = Math.min(lateFeeAmount, loan.max_late_fee);
  }

  // Redondear a 2 decimales
  lateFeeAmount = Math.round(lateFeeAmount * 100) / 100;

  return {
    daysOverdue,
    lateFeeAmount,
    totalLateFee: lateFeeAmount // En este caso, la mora total es igual a la mora calculada
  };
};

/**
 * Actualiza la mora actual de un préstamo en la base de datos
 * @param loanId - ID del préstamo
 * @param calculation - Cálculo de la mora
 * @param supabase - Cliente de Supabase
 */
export const updateLoanLateFee = async (
  loanId: string, 
  calculation: LateFeeCalculation,
  supabase: any
): Promise<boolean> => {
  try {
    const { error } = await supabase
      .from('loans')
      .update({ 
        current_late_fee: calculation.totalLateFee,
        last_late_fee_calculation: new Date().toISOString().split('T')[0]
      })
      .eq('id', loanId);

    if (error) {
      console.error('Error updating loan late fee:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error updating loan late fee:', error);
    return false;
  }
};

/**
 * Recalcula y actualiza la mora de un préstamo específico
 * @param loanId - ID del préstamo
 * @param supabase - Cliente de Supabase
 * @returns Cálculo de la mora actualizado
 */
export const recalculateAndUpdateLoanLateFee = async (
  loanId: string,
  supabase: any
): Promise<LateFeeCalculation | null> => {
  try {
    // Obtener datos del préstamo
    const { data: loan, error: loanError } = await supabase
      .from('loans')
      .select('remaining_balance, next_payment_date, late_fee_rate, grace_period_days, max_late_fee, late_fee_calculation_type, late_fee_enabled')
      .eq('id', loanId)
      .single();

    if (loanError || !loan) {
      console.error('Error fetching loan data:', loanError);
      return null;
    }

    // Calcular la mora
    const calculation = calculateLateFee(loan);

    // Actualizar en la base de datos
    const success = await updateLoanLateFee(loanId, calculation, supabase);

    if (success) {
      return calculation;
    }

    return null;
  } catch (error) {
    console.error('Error recalculating loan late fee:', error);
    return null;
  }
};
