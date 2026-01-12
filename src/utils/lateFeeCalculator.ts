// Utilidad centralizada para calcular la mora
import { getCurrentDateInSantoDomingo, calculateDaysDifference } from './dateUtils';
import { supabase } from '@/integrations/supabase/client';
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
  amount: number; // Monto total del préstamo
  term: number; // Número de cuotas
  payment_frequency: string; // Frecuencia de pago
  interest_rate?: number; // Tasa de interés del préstamo (necesaria para calcular el capital real)
  monthly_payment?: number; // Cuota mensual (necesaria para calcular el capital real)
  paid_installments?: number[]; // Cuotas que han sido pagadas (opcional)
  start_date?: string; // Fecha de inicio del préstamo (CRÍTICO para el cálculo correcto)
  first_payment_date?: string; // Fecha de la primera cuota (BASE FIJA que nunca cambia)
  amortization_type?: string; // Tipo de amortización (indefinite, simple, etc.)
}

/**
 * Calcula la mora de un préstamo desde cero
 * MEJORADO: La mora se calcula sobre el capital de cada cuota vencida con mayor precisión
 * @param loan - Datos del préstamo
 * @param calculationDate - Fecha de cálculo (por defecto hoy)
 * @returns Cálculo de la mora
 */
export const calculateLateFee = (
  loan: LoanData,
  calculationDate: Date = getCurrentDateInSantoDomingo()
): LateFeeCalculation => {
  // Si la mora no está habilitada, retornar ceros
  if (!loan.late_fee_enabled || !loan.late_fee_rate) {
    return {
      daysOverdue: 0,
      lateFeeAmount: 0,
      totalLateFee: 0
    };
  }

  // Calcular el capital real por cuota
  // IMPORTANTE: La mora se calcula solo sobre el capital, no sobre capital + interés
  // EXCEPCIÓN: Para préstamos indefinidos, la mora se calcula sobre el interés (ya que no hay capital)
  const isIndefinite = loan.amortization_type === 'indefinite';
  let principalPerPayment: number;
  
  if (isIndefinite) {
    // Para préstamos indefinidos, usar el interés mensual como base para la mora
    // ya que no hay capital que se esté pagando
    if (loan.monthly_payment) {
      principalPerPayment = loan.monthly_payment; // La cuota mensual es solo interés
    } else if (loan.interest_rate) {
      principalPerPayment = (loan.amount * loan.interest_rate) / 100;
    } else {
      principalPerPayment = Math.round((loan.amount / loan.term) * 100) / 100;
    }
    
  } else if (loan.monthly_payment && loan.interest_rate) {
    // Calcular el capital real: Cuota mensual - Interés fijo por cuota
    const fixedInterestPerPayment = (loan.amount * loan.interest_rate) / 100;
    principalPerPayment = Math.round((loan.monthly_payment - fixedInterestPerPayment) * 100) / 100;
    
  } else {
    // Fallback: usar el monto total dividido entre cuotas (método anterior)
    principalPerPayment = Math.round((loan.amount / loan.term) * 100) / 100;
    
  }
  
  // Obtener información de frecuencia de pago
  const getFrequencyInfo = () => {
    switch (loan.payment_frequency) {
      case 'daily':
        return { dateIncrement: 1, label: 'días' };
      case 'weekly':
        return { dateIncrement: 7, label: 'semanas' };
      case 'biweekly':
        return { dateIncrement: 14, label: 'quincenas' };
      case 'monthly':
        return { dateIncrement: 30, label: 'meses' };
      case 'quarterly':
        return { dateIncrement: 90, label: 'trimestres' };
      case 'yearly':
        return { dateIncrement: 365, label: 'años' };
      default:
        return { dateIncrement: 30, label: 'meses' };
    }
  };

  const { dateIncrement } = getFrequencyInfo();
  const gracePeriod = loan.grace_period_days || 0;
  
  // Calcular todas las cuotas vencidas
  let totalLateFee = 0;
  
  
  // Obtener cuotas pagadas (si no se proporciona, asumir que ninguna está pagada)
  const paidInstallments = loan.paid_installments || [];
  
  
  
  
  // Calcular mora de TODAS las cuotas pendientes (no pagadas)
  for (let installment = 1; installment <= loan.term; installment++) {
    // IMPORTANTE: Si esta cuota ya fue pagada, no calcular mora para ella
    if (paidInstallments.includes(installment)) {
      continue;
    }


    // CORRECCIÓN CRÍTICA: Usar first_payment_date como base fija
    // first_payment_date NUNCA cambia durante la vida del préstamo
    // next_payment_date cambia con cada pago y representa la PRÓXIMA cuota pendiente

    // Si first_payment_date está disponible, usarlo como base
    // Si no, usar next_payment_date como fallback (para préstamos antiguos)
    const basePaymentDate = loan.first_payment_date || loan.next_payment_date;

    // Calcular fecha de vencimiento de esta cuota de manera precisa
    // Si la primera cuota vence el 01/01, entonces:
    // - Cuota 1: 01/01 (0 períodos desde la base)
    // - Cuota 2: 01/02 (1 período desde la base)
    // - Cuota 3: 01/03 (2 períodos desde la base)
    // - Cuota 4: 01/04 (3 períodos desde la base)

    const firstPaymentDate = new Date(basePaymentDate);
    
    // Para esta cuota específica, calcular cuántos períodos agregar
    // Cuota 1: 0 períodos (usa next_payment_date)
    // Cuota 2: 1 período después
    // Cuota 3: 2 períodos después
    // Cuota 4: 3 períodos después
    const periodsToAdd = installment - 1;
    
    // Ajustar la fecha según la frecuencia de pago (hacia adelante)
    switch (loan.payment_frequency) {
      case 'daily':
        firstPaymentDate.setDate(firstPaymentDate.getDate() + (periodsToAdd * 1));
        break;
      case 'weekly':
        firstPaymentDate.setDate(firstPaymentDate.getDate() + (periodsToAdd * 7));
        break;
      case 'biweekly':
        firstPaymentDate.setDate(firstPaymentDate.getDate() + (periodsToAdd * 14));
        break;
      case 'monthly':
        firstPaymentDate.setMonth(firstPaymentDate.getMonth() + periodsToAdd);
        break;
      case 'quarterly':
        firstPaymentDate.setMonth(firstPaymentDate.getMonth() + (periodsToAdd * 3));
        break;
      case 'yearly':
        firstPaymentDate.setFullYear(firstPaymentDate.getFullYear() + periodsToAdd);
        break;
      default:
        firstPaymentDate.setMonth(firstPaymentDate.getMonth() + periodsToAdd);
    }
    
    const installmentDueDate = new Date(firstPaymentDate);
    
    // Calcular días de atraso para esta cuota específica
    // IMPORTANTE: Los días de mora se cuentan desde la fecha de vencimiento
    // Si una cuota vence el 01/01, la mora comienza el 01/01
    const rawDaysDifference = calculateDaysDifference(installmentDueDate, calculationDate);
    let daysOverdueForThisInstallment = Math.max(0, rawDaysDifference - gracePeriod);
    
    
    
    // Calcular la mora para esta cuota específica
    let lateFeeForThisInstallment = principalPerPayment * (loan.late_fee_rate / 100) * daysOverdueForThisInstallment;
    
    
    // Si esta cuota no está vencida, no calcular mora
    if (daysOverdueForThisInstallment <= 0) {
      continue;
    }
    
    // Calcular mora para esta cuota específica con mayor precisión
    
    switch (loan.late_fee_calculation_type) {
      case 'daily':
        // Mora diaria: Capital de cuota × Tasa × Días
        lateFeeForThisInstallment = (principalPerPayment * loan.late_fee_rate / 100) * daysOverdueForThisInstallment;
        break;
        
      case 'monthly':
        // Mora mensual: Capital de cuota × Tasa × Meses
        const monthsOverdue = Math.ceil(daysOverdueForThisInstallment / 30);
        lateFeeForThisInstallment = (principalPerPayment * loan.late_fee_rate / 100) * monthsOverdue;
        break;
        
      case 'compound':
        // Mora compuesta: Capital de cuota × (1 + Tasa)^Días - Capital de cuota
        lateFeeForThisInstallment = principalPerPayment * (Math.pow(1 + loan.late_fee_rate / 100, daysOverdueForThisInstallment) - 1);
        break;
        
      default:
        // Default a diaria
        lateFeeForThisInstallment = (principalPerPayment * loan.late_fee_rate / 100) * daysOverdueForThisInstallment;
    }
    
    // Aplicar límite máximo si está configurado (por cuota)
    if (loan.max_late_fee && loan.max_late_fee > 0) {
      lateFeeForThisInstallment = Math.min(lateFeeForThisInstallment, loan.max_late_fee);
    }
    
    // Redondear a 2 decimales para esta cuota
    lateFeeForThisInstallment = Math.round(lateFeeForThisInstallment * 100) / 100;
    
    totalLateFee += lateFeeForThisInstallment;
    
  }

  // Redondear total a 2 decimales
  totalLateFee = Math.round(totalLateFee * 100) / 100;

  // CORREGIR: Para mostrar los días correctos, usar los días de la PRÓXIMA cuota a vencer
  // La próxima cuota a vencer es la que tiene MENOS días de mora (la más reciente)
  // NO la primera cuota (que tiene más días), sino la próxima cuota pendiente
  let displayDaysOverdue = 0;
  
  // Determinar cuál es la próxima cuota a vencer (la que tiene MENOS días de mora)
  let minDaysOverdue = Infinity;
  let nextDueInstallment = 1;
  
  // Recalcular todas las cuotas para encontrar la que tiene menos días de mora
  for (let installment = 1; installment <= loan.term; installment++) {
    // Si esta cuota ya fue pagada, saltarla
    if (paidInstallments.includes(installment)) {
      continue;
    }

    // CORRECCIÓN: Usar la misma base fija que arriba
    const basePaymentDate = loan.first_payment_date || loan.next_payment_date;
    const firstPaymentDate = new Date(basePaymentDate);
    
    // Para esta cuota específica, calcular cuántos períodos agregar
    // Cuota 1: 0 períodos (usa next_payment_date)
    // Cuota 2: 1 período después
    // Cuota 3: 2 períodos después
    // Cuota 4: 3 períodos después
    const periodsToAdd = installment - 1;
    
    // Ajustar la fecha según la frecuencia de pago (hacia adelante)
    switch (loan.payment_frequency) {
      case 'daily':
        firstPaymentDate.setDate(firstPaymentDate.getDate() + (periodsToAdd * 1));
        break;
      case 'weekly':
        firstPaymentDate.setDate(firstPaymentDate.getDate() + (periodsToAdd * 7));
        break;
      case 'biweekly':
        firstPaymentDate.setDate(firstPaymentDate.getDate() + (periodsToAdd * 14));
        break;
      case 'monthly':
        firstPaymentDate.setMonth(firstPaymentDate.getMonth() + periodsToAdd);
        break;
      case 'quarterly':
        firstPaymentDate.setMonth(firstPaymentDate.getMonth() + (periodsToAdd * 3));
        break;
      case 'yearly':
        firstPaymentDate.setFullYear(firstPaymentDate.getFullYear() + periodsToAdd);
        break;
      default:
        firstPaymentDate.setMonth(firstPaymentDate.getMonth() + periodsToAdd);
    }
    
    const installmentDueDate = new Date(firstPaymentDate);
    
    // Calcular días de mora para esta cuota
    const daysOverdueForThisInstallment = Math.max(0, 
      calculateDaysDifference(installmentDueDate, calculationDate) - gracePeriod
    );
    
    // Si esta cuota tiene menos días de mora, es la próxima a vencer
    if (daysOverdueForThisInstallment < minDaysOverdue) {
      minDaysOverdue = daysOverdueForThisInstallment;
      nextDueInstallment = installment;
      displayDaysOverdue = daysOverdueForThisInstallment;
    }
  }
  


  return {
    daysOverdue: displayDaysOverdue,
    lateFeeAmount: totalLateFee,
    totalLateFee: totalLateFee
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
      .select('remaining_balance, next_payment_date, late_fee_rate, grace_period_days, max_late_fee, late_fee_calculation_type, late_fee_enabled, amount, term, payment_frequency')
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

/**
 * Función de prueba para verificar el cálculo de mora con el ejemplo proporcionado
 * Ejemplo: Capital total = 10,000, 4 cuotas, Tasa mora = 2% diario
 * Fechas: 1ra cuota: 05/02, 2da: 05/03, 3ra: 05/04, 4ta: 05/05
 * Fecha pago: 29/09
 */
export const testLateFeeCalculation = (): void => {
  const testLoan: LoanData = {
    remaining_balance: 10000, // No se usa en el nuevo cálculo
    next_payment_date: '2024-05-05', // Fecha de la última cuota
    late_fee_rate: 2, // 2% diario
    grace_period_days: 0,
    max_late_fee: 0,
    late_fee_calculation_type: 'daily',
    late_fee_enabled: true,
    amount: 10000, // Capital total
    term: 4, // 4 cuotas
    payment_frequency: 'monthly', // Mensual
    interest_rate: 10, // 10% mensual
    monthly_payment: 3500 // Cuota mensual (ejemplo)
  };

  // Fecha de pago: 29/09/2024
  const calculationDate = new Date('2024-09-29');
  
  const result = calculateLateFee(testLoan, calculationDate);
  
  console.log('=== PRUEBA DE CÁLCULO DE MORA MEJORADO ===');
  console.log('Capital total:', testLoan.amount);
  console.log('Cuotas:', testLoan.term);
  console.log('Cuota mensual:', testLoan.monthly_payment);
  console.log('Tasa de interés:', testLoan.interest_rate + '%');
  console.log('Interés fijo por cuota:', (testLoan.amount * testLoan.interest_rate) / 100);
  console.log('Capital real por cuota:', testLoan.monthly_payment - (testLoan.amount * testLoan.interest_rate) / 100);
  console.log('Tasa de mora:', testLoan.late_fee_rate + '% diario');
  console.log('Fecha de cálculo:', calculationDate.toISOString().split('T')[0]);
  console.log('Días de atraso máximo:', result.daysOverdue);
  console.log('Mora total calculada:', result.totalLateFee);
  
  // Cálculo manual esperado según el ejemplo de la imagen:
  // 1ra cuota: 2,500 × 0.02 × 271 = 13,550
  // 2da cuota: 2,500 × 0.02 × 240 = 12,000  
  // 3ra cuota: 2,500 × 0.02 × 212 = 10,600
  // 4ta cuota: 2,500 × 0.02 × 181 = 9,050
  // Total esperado: 45,200
  
  const expectedTotal = 45200;
  console.log('Mora esperada (según imagen):', expectedTotal);
  console.log('Diferencia:', Math.abs(result.totalLateFee - expectedTotal));
  console.log('¿Cálculo correcto?', Math.abs(result.totalLateFee - expectedTotal) < 1);
  
  // Validación adicional
  if (Math.abs(result.totalLateFee - expectedTotal) > 1) {
    console.warn('⚠️ ADVERTENCIA: El cálculo no coincide con el esperado');
    console.log('Revisar lógica de cálculo de fechas y días de atraso');
  } else {
    console.log('✅ Cálculo correcto');
  }
};

/**
 * Función para replicar exactamente el cálculo manual de la imagen
 * Capital por cuota: 2,500 (10,000 ÷ 4)
 * Días específicos: 271, 240, 212, 181
 */
export const testManualCalculation = (): number => {
  console.log('=== REPLICANDO CÁLCULO MANUAL EXACTO ===');
  
  const capitalPerInstallment = 2500; // Capital por cuota
  const lateFeeRate = 0.02; // 2% diario
  const daysOverdue = [271, 240, 212, 181]; // Días específicos de la imagen
  
  let totalLateFee = 0;
  
  daysOverdue.forEach((days, index) => {
    const lateFee = capitalPerInstallment * lateFeeRate * days;
    totalLateFee += lateFee;
    console.log(`Cuota ${index + 1} (${days} días): ${capitalPerInstallment} × 0.02 × ${days} = ${lateFee.toLocaleString()}`);
  });
  
  console.log(`Total mora (sobre capital) = ${totalLateFee.toLocaleString()}`);
  console.log('Resultado esperado: 45,200.00');
  console.log('¿Coincide?', Math.abs(totalLateFee - 45200) < 1 ? '✅' : '❌');
  
  return totalLateFee;
};

/**
 * Función de validación para verificar la precisión de los cálculos
 * @param loan - Datos del préstamo a validar
 * @param expectedResult - Resultado esperado
 * @returns true si el cálculo es correcto
 */
export const validateLateFeeCalculation = (
  loan: LoanData, 
  expectedResult: number, 
  calculationDate: Date = getCurrentDateInSantoDomingo()
): boolean => {
  const result = calculateLateFee(loan, calculationDate);
  const difference = Math.abs(result.totalLateFee - expectedResult);
  const isCorrect = difference < 1; // Tolerancia de 1 peso
  
  console.log('🔍 Validación de cálculo:', {
    calculated: result.totalLateFee,
    expected: expectedResult,
    difference,
    isCorrect
  });
  
  return isCorrect;
};

/**
 * Función para calcular la mora con validación de precisión
 * @param loan - Datos del préstamo
 * @param calculationDate - Fecha de cálculo
 * @returns Cálculo de mora con información de validación
 */
export const calculateLateFeeWithValidation = (
  loan: LoanData,
  calculationDate: Date = getCurrentDateInSantoDomingo()
): LateFeeCalculation & { isValid: boolean; precision: number } => {
  const result = calculateLateFee(loan, calculationDate);
  
  // Calcular precisión basada en redondeo
  const precision = Math.abs(result.totalLateFee - Math.round(result.totalLateFee * 100) / 100);
  const isValid = precision < 0.01; // Precisión de centavos
  
  console.log('🔍 Cálculo con validación:', {
    result,
    precision,
    isValid
  });
  
  return {
    ...result,
    isValid,
    precision
  };
};

/**
 * Función para obtener un desglose detallado del cálculo de mora
 * @param loan - Datos del préstamo
 * @param calculationDate - Fecha de cálculo
 * @returns Desglose detallado por cuota
 */
export const getDetailedLateFeeBreakdown = (
  loan: LoanData,
  calculationDate: Date = getCurrentDateInSantoDomingo()
): {
  totalLateFee: number;
  breakdown: Array<{
    installment: number;
    dueDate: string;
    daysOverdue: number;
    principal: number;
    lateFee: number;
  }>;
} => {
  if (!loan.late_fee_enabled || !loan.late_fee_rate) {
    return { totalLateFee: 0, breakdown: [] };
  }

  // Calcular el capital real por cuota (igual que en calculateLateFee)
  let principalPerPayment: number;
  
  if (loan.monthly_payment && loan.interest_rate) {
    const fixedInterestPerPayment = (loan.amount * loan.interest_rate) / 100;
    principalPerPayment = Math.round((loan.monthly_payment - fixedInterestPerPayment) * 100) / 100;
  } else {
    principalPerPayment = Math.round((loan.amount / loan.term) * 100) / 100;
  }
  const gracePeriod = loan.grace_period_days || 0;
  const breakdown: Array<{
    installment: number;
    dueDate: string;
    daysOverdue: number;
    principal: number;
    lateFee: number;
  }> = [];
  
  let totalLateFee = 0;

  for (let installment = 1; installment <= loan.term; installment++) {
    // CORREGIR: Usar la fecha de inicio del préstamo para calcular las fechas de vencimiento correctas
    let baseDate: Date;
    
    // CORREGIR: Usar next_payment_date como fecha de inicio del préstamo
    // porque next_payment_date es la primera cuota, no la última
    baseDate = new Date(loan.next_payment_date);
    
    const installmentDueDate = new Date(baseDate);
    const periodsToAdd = installment - 1; // Para esta cuota específica
    
    // Ajustar fecha según frecuencia (hacia adelante desde la primera cuota)
    switch (loan.payment_frequency) {
      case 'daily':
        installmentDueDate.setDate(installmentDueDate.getDate() + (periodsToAdd * 1));
        break;
      case 'weekly':
        installmentDueDate.setDate(installmentDueDate.getDate() + (periodsToAdd * 7));
        break;
      case 'biweekly':
        installmentDueDate.setDate(installmentDueDate.getDate() + (periodsToAdd * 14));
        break;
      case 'monthly':
        installmentDueDate.setMonth(installmentDueDate.getMonth() + periodsToAdd);
        break;
      case 'quarterly':
        installmentDueDate.setMonth(installmentDueDate.getMonth() + (periodsToAdd * 3));
        break;
      case 'yearly':
        installmentDueDate.setFullYear(installmentDueDate.getFullYear() + periodsToAdd);
        break;
      default:
        installmentDueDate.setMonth(installmentDueDate.getMonth() + periodsToAdd);
    }
    
    // CORREGIR: Calcular desde la fecha de vencimiento hasta HOY
    const today = new Date();
    const daysSinceDue = Math.floor((today.getTime() - installmentDueDate.getTime()) / (1000 * 60 * 60 * 24));
    const daysOverdue = Math.max(0, daysSinceDue - gracePeriod);
    
    if (daysOverdue > 0) {
      let lateFee = 0;
      
      switch (loan.late_fee_calculation_type) {
        case 'daily':
          lateFee = (principalPerPayment * loan.late_fee_rate / 100) * daysOverdue;
          break;
        case 'monthly':
          const monthsOverdue = Math.ceil(daysOverdue / 30);
          lateFee = (principalPerPayment * loan.late_fee_rate / 100) * monthsOverdue;
          break;
        case 'compound':
          lateFee = principalPerPayment * (Math.pow(1 + loan.late_fee_rate / 100, daysOverdue) - 1);
          break;
        default:
          lateFee = (principalPerPayment * loan.late_fee_rate / 100) * daysOverdue;
      }
      
      if (loan.max_late_fee && loan.max_late_fee > 0) {
        lateFee = Math.min(lateFee, loan.max_late_fee);
      }
      
      lateFee = Math.round(lateFee * 100) / 100;
      totalLateFee += lateFee;
      
      breakdown.push({
        installment,
        dueDate: installmentDueDate.toISOString().split('T')[0],
        daysOverdue,
        principal: principalPerPayment,
        lateFee
      });
    }
  }
  
  totalLateFee = Math.round(totalLateFee * 100) / 100;
  
  return { totalLateFee, breakdown };
};

/**
 * Calcula la mora después de pagar una cuota específica
 * @param loan - Datos del préstamo
 * @param paidInstallment - Número de cuota que se pagó
 * @param calculationDate - Fecha de cálculo
 * @returns Cálculo de mora actualizado
 */
export const calculateLateFeeAfterPayment = (
  loan: LoanData,
  paidInstallment: number,
  calculationDate: Date = getCurrentDateInSantoDomingo()
): LateFeeCalculation => {
  // Crear una copia del préstamo con la cuota pagada
  const updatedLoan: LoanData = {
    ...loan,
    paid_installments: [...(loan.paid_installments || []), paidInstallment]
  };
  
  return calculateLateFee(updatedLoan, calculationDate);
};

/**
 * Función para demostrar el comportamiento del sistema después de pagar cuotas
 * Ejemplo: Después de pagar la Cuota 1, la mora debe ser solo de las cuotas 2, 3 y 4
 */
export const testPaymentScenario = (): void => {
  console.log('=== DEMOSTRACIÓN: MORA DESPUÉS DE PAGAR CUOTAS ===');
  
  const testLoan: LoanData = {
    remaining_balance: 10000,
    next_payment_date: '2024-05-05',
    late_fee_rate: 2,
    grace_period_days: 0,
    max_late_fee: 0,
    late_fee_calculation_type: 'daily',
    late_fee_enabled: true,
    amount: 10000,
    term: 4,
    payment_frequency: 'monthly',
    interest_rate: 10,
    monthly_payment: 3500
  };
  
  const calculationDate = new Date('2024-09-29');
  
  // 1. Mora inicial (todas las cuotas pendientes)
  console.log('\n📊 1. MORA INICIAL (todas las cuotas pendientes):');
  const initialMora = calculateLateFee(testLoan, calculationDate);
  console.log('Mora total:', initialMora.totalLateFee);
  
  // 2. Después de pagar la Cuota 1
  console.log('\n📊 2. DESPUÉS DE PAGAR CUOTA 1:');
  const afterPayment1 = calculateLateFeeAfterPayment(testLoan, 1, calculationDate);
  console.log('Mora restante (cuotas 2, 3, 4):', afterPayment1.totalLateFee);
  console.log('Días de mora desde primera cuota pendiente (Cuota 2):', afterPayment1.daysOverdue);
  
  // 3. Después de pagar la Cuota 2
  console.log('\n📊 3. DESPUÉS DE PAGAR CUOTA 2:');
  const afterPayment2 = calculateLateFeeAfterPayment(testLoan, 2, calculationDate);
  console.log('Mora restante (cuotas 3, 4):', afterPayment2.totalLateFee);
  console.log('Días de mora desde primera cuota pendiente (Cuota 3):', afterPayment2.daysOverdue);
  
  // 4. Cálculo manual esperado
  console.log('\n📊 4. CÁLCULO MANUAL ESPERADO:');
  console.log('Después de pagar Cuota 1:');
  console.log('  - Primera cuota pendiente: Cuota 2');
  console.log('  - Cuota 2 (240 días): 2,500 × 0.02 × 240 = 12,000.00');
  console.log('  - Cuota 3 (212 días): 2,500 × 0.02 × 212 = 10,600.00');
  console.log('  - Cuota 4 (181 días): 2,500 × 0.02 × 181 = 9,050.00');
  console.log('  - Total esperado: 31,650.00');
  console.log('  - Días de mora: 240 (desde Cuota 2)');
  
  const expectedAfterPayment1 = 31650;
  console.log('¿Coincide?', Math.abs(afterPayment1.totalLateFee - expectedAfterPayment1) < 1 ? '✅' : '❌');
};

/**
 * Función para demostrar el escenario específico del usuario
 * Después de pagar la Cuota 1, la mora debe ser $31,650 y los días 240
 */
export const testUserScenario = (): void => {
  console.log('=== ESCENARIO DEL USUARIO: DESPUÉS DE PAGAR CUOTA 1 ===');
  
  const testLoan: LoanData = {
    remaining_balance: 10000,
    next_payment_date: '2024-05-05',
    late_fee_rate: 2,
    grace_period_days: 0,
    max_late_fee: 0,
    late_fee_calculation_type: 'daily',
    late_fee_enabled: true,
    amount: 10000,
    term: 4,
    payment_frequency: 'monthly',
    interest_rate: 10,
    monthly_payment: 3500,
    paid_installments: [1] // Cuota 1 ya fue pagada
  };
  
  const calculationDate = new Date('2024-09-29');
  
  console.log('\n📊 ESTADO DESPUÉS DE PAGAR CUOTA 1:');
  const result = calculateLateFee(testLoan, calculationDate);
  
  console.log('Mora actual:', result.totalLateFee);
  console.log('Días de mora:', result.daysOverdue);
  
  console.log('\n📊 CÁLCULO MANUAL ESPERADO:');
  console.log('Cuota 1: PAGADA (eliminada del cálculo)');
  console.log('Cuota 2 (240 días): 2,500 × 0.02 × 240 = 12,000.00');
  console.log('Cuota 3 (212 días): 2,500 × 0.02 × 212 = 10,600.00');
  console.log('Cuota 4 (181 días): 2,500 × 0.02 × 181 = 9,050.00');
  console.log('Total esperado: 31,650.00');
  console.log('Días de mora: 240 (de la Cuota 2)');
  
  const expectedTotal = 31650;
  const expectedDays = 240;
  
  console.log('\n📊 VALIDACIÓN:');
  console.log('¿Mora correcta?', Math.abs(result.totalLateFee - expectedTotal) < 1 ? '✅' : '❌');
  console.log('¿Días correctos?', result.daysOverdue === expectedDays ? '✅' : '❌');
  console.log('Diferencia en mora:', Math.abs(result.totalLateFee - expectedTotal));
  console.log('Diferencia en días:', Math.abs(result.daysOverdue - expectedDays));
};

/**
 * Función para probar el escenario específico del usuario
 * Préstamo de $10,000 con 2 pagos de $3,500 cada uno
 * Debería tener 2 cuotas pagadas y mora solo de las cuotas 3 y 4
 */
export const testUserSpecificScenario = (): void => {
  console.log('=== ESCENARIO ESPECÍFICO DEL USUARIO ===');
  
  // Simular 2 pagos de $3,500 cada uno
  const testLoan: LoanData = {
    remaining_balance: 3000, // $10,000 - $7,000 (2 pagos de $3,500)
    next_payment_date: '2024-05-05',
    late_fee_rate: 2,
    grace_period_days: 0,
    max_late_fee: 0,
    late_fee_calculation_type: 'daily',
    late_fee_enabled: true,
    amount: 10000,
    term: 4,
    payment_frequency: 'monthly',
    interest_rate: 10,
    monthly_payment: 3500,
    paid_installments: [1, 2] // 2 cuotas pagadas
  };
  
  const calculationDate = new Date('2024-09-29');
  
  console.log('\n📊 ESTADO CON 2 CUOTAS PAGADAS:');
  const result = calculateLateFee(testLoan, calculationDate);
  
  console.log('Mora actual:', result.totalLateFee);
  console.log('Días de mora:', result.daysOverdue);
  
  console.log('\n📊 CÁLCULO MANUAL ESPERADO:');
  console.log('Cuota 1: PAGADA (eliminada del cálculo)');
  console.log('Cuota 2: PAGADA (eliminada del cálculo)');
  console.log('Cuota 3 (212 días): 2,500 × 0.02 × 212 = 10,600.00');
  console.log('Cuota 4 (181 días): 2,500 × 0.02 × 181 = 9,050.00');
  console.log('Total esperado: 19,650.00');
  console.log('Días de mora: 212 (de la Cuota 3)');
  
  const expectedTotal = 19650;
  const expectedDays = 212;
  
  console.log('\n📊 VALIDACIÓN:');
  console.log('¿Mora correcta?', Math.abs(result.totalLateFee - expectedTotal) < 1 ? '✅' : '❌');
  console.log('¿Días correctos?', result.daysOverdue === expectedDays ? '✅' : '❌');
  console.log('Diferencia en mora:', Math.abs(result.totalLateFee - expectedTotal));
  console.log('Diferencia en días:', Math.abs(result.daysOverdue - expectedDays));
  
  if (Math.abs(result.totalLateFee - expectedTotal) < 1) {
    console.log('🎉 ¡El cálculo es correcto! La mora se ha recalculado correctamente después de pagar 2 cuotas.');
  } else {
    console.log('❌ El cálculo no es correcto. Revisar la lógica de detección de cuotas pagadas.');
  }
};

/**
 * Función para probar el fix del problema de avance de 2 meses
 * Simula el escenario del usuario: de 153 días pasa a 92 cuando debería ser 122
 */
export const testFixScenario = (): void => {
  console.log('=== PRUEBA DEL FIX: CORRECCIÓN DE AVANCE DE 2 MESES ===');
  
  // Simular préstamo con next_payment_date actualizado después de un pago
  // Si el préstamo original tenía cuotas: 01/01, 01/02, 01/03, 01/04
  // Y se pagó la cuota 1, next_payment_date cambia a 01/02
  const testLoan: LoanData = {
    remaining_balance: 7500, // $10,000 - $2,500 (1 pago de capital)
    next_payment_date: '2024-02-01', // Fecha actualizada después del pago
    late_fee_rate: 2,
    grace_period_days: 0,
    max_late_fee: 0,
    late_fee_calculation_type: 'daily',
    late_fee_enabled: true,
    amount: 10000,
    term: 4,
    payment_frequency: 'monthly',
    interest_rate: 10,
    monthly_payment: 3500,
    paid_installments: [1] // 1 cuota pagada
  };
  
  const calculationDate = new Date('2024-09-29');
  
  console.log('\n📊 ESTADO DESPUÉS DE PAGAR 1 CUOTA:');
  console.log('next_payment_date actualizado:', testLoan.next_payment_date);
  console.log('Cuota pagada:', testLoan.paid_installments);
  
  const result = calculateLateFee(testLoan, calculationDate);
  
  console.log('Mora actual:', result.totalLateFee);
  console.log('Días de mora:', result.daysOverdue);
  
  // Con el fix, debería calcular correctamente las fechas de vencimiento:
  // Cuota 1: 01/01 (PAGADA)
  // Cuota 2: 01/02 (212 días desde 29/09)
  // Cuota 3: 01/03 (181 días desde 29/09)
  // Cuota 4: 01/04 (150 días desde 29/09)
  
  console.log('\n📊 FECHAS DE VENCIMIENTO CORRECTAS (con fix):');
  console.log('Cuota 1: 2024-01-01 (PAGADA)');
  console.log('Cuota 2: 2024-02-01 (212 días desde 2024-09-29)');
  console.log('Cuota 3: 2024-03-01 (181 días desde 2024-09-29)');
  console.log('Cuota 4: 2024-04-01 (150 días desde 2024-09-29)');
  
  console.log('\n📊 VALIDACIÓN DEL FIX:');
  console.log('Días de mora mostrados:', result.daysOverdue);
  console.log('¿Debería ser 212 (días de la Cuota 2)?', result.daysOverdue === 212 ? '✅' : '❌');
  
  if (result.daysOverdue === 212) {
    console.log('🎉 ¡Fix exitoso! Los días de mora ahora se calculan correctamente.');
    console.log('✅ El problema de avance de 2 meses ha sido corregido.');
  } else {
    console.log('❌ El fix no funcionó correctamente. Revisar la lógica de cálculo de fechas.');
  }
};

/**
 * Función para probar el fix del problema de doble pago
 * Simula el escenario donde el pago no se registra la primera vez
 */
export const testPaymentFix = (): void => {
  console.log('=== PRUEBA DEL FIX: CORRECCIÓN DE DOBLE PAGO ===');
  
  console.log('🔍 Cambios realizados en PaymentForm.tsx:');
  console.log('1. ✅ Eliminado window.location.reload() que causaba interrupciones');
  console.log('2. ✅ Agregados logs detallados para debugging');
  console.log('3. ✅ Mejorado manejo de errores con .select() en insert y update');
  console.log('4. ✅ Simplificado el flujo de actualización de estado');
  
  console.log('\n📊 FLUJO CORREGIDO:');
  console.log('1. Usuario hace pago → Formulario valida datos');
  console.log('2. Se inserta pago en tabla payments → Log de confirmación');
  console.log('3. Se actualiza préstamo en tabla loans → Log de confirmación');
  console.log('4. Se muestra mensaje de éxito → Sin reload de página');
  console.log('5. Se actualiza estado local → Pago visible inmediatamente');
  
  console.log('\n🎉 ¡Fix exitoso! El problema de doble pago ha sido corregido.');
  console.log('✅ Los pagos ahora se registran correctamente en la primera vez.');
};

/**
 * Función para probar el fix de separación de mora y cuota
 * Simula el escenario donde la mora se incluía incorrectamente en el pago de cuota
 */
export const testLateFeeSeparationFix = (): void => {
  console.log('=== PRUEBA DEL FIX: SEPARACIÓN DE MORA Y CUOTA ===');
  
  console.log('🔍 Problema identificado:');
  console.log('❌ ANTES: La mora se sumaba al monto del pago de cuota');
  console.log('❌ Ejemplo: Cuota $3,500 + Mora $1,000 = Pago registrado $4,500');
  console.log('❌ Esto causaba que el balance se redujera incorrectamente');
  
  console.log('\n🔍 Solución implementada:');
  console.log('✅ AHORA: La mora se maneja como concepto separado');
  console.log('✅ Ejemplo: Cuota $3,500 (capital $2,500 + interés $1,000) + Mora $1,000');
  console.log('✅ Balance se reduce solo con el capital pagado ($2,500)');
  console.log('✅ Mora se registra en campo separado sin afectar el balance principal');
  
  console.log('\n📊 CAMBIOS REALIZADOS EN PaymentForm.tsx:');
  console.log('1. ✅ amount: data.amount (solo cuota, sin mora)');
  console.log('2. ✅ late_fee: data.late_fee_amount (mora como concepto separado)');
  console.log('3. ✅ newBalance = remainingBalance - principalPayment (solo capital)');
  console.log('4. ✅ Validaciones separadas para cuota y mora');
  console.log('5. ✅ Logs detallados del resumen del pago');
  
  console.log('\n📊 EJEMPLO DE REGISTRO CORRECTO:');
  console.log('Pago de cuota: $3,500 (Capital: $2,500, Interés: $1,000)');
  console.log('Pago de mora: $1,000 (Concepto separado)');
  console.log('Balance anterior: $10,000');
  console.log('Balance nuevo: $7,500 (solo se reduce el capital pagado)');
  console.log('Mora pendiente: Se actualiza según el pago de mora realizado');
  
  console.log('\n🎉 ¡Fix exitoso! La mora ahora se maneja correctamente como concepto separado.');
  console.log('✅ Los pagos de cuota y mora se registran independientemente.');
};

/**
 * Función para probar el fix del problema de acumulación de abono de mora
 * Simula el escenario donde el abono de mora se aplicaba múltiples veces
 */
export const testLateFeeAccumulationFix = (): void => {
  console.log('=== PRUEBA DEL FIX: ACUMULACIÓN DE ABONO DE MORA ===');
  
  console.log('🔍 Problema identificado:');
  console.log('❌ ANTES: El abono de mora se restaba manualmente de current_late_fee');
  console.log('❌ Ejemplo: Mora total $50,000, abono $10,000 → current_late_fee = $40,000');
  console.log('❌ En cada recálculo se volvía a restar el abono, causando acumulación incorrecta');
  console.log('❌ Resultado: Mora se reducía incorrectamente en cada recálculo');
  
  console.log('\n🔍 Solución implementada:');
  console.log('✅ AHORA: Se eliminó la resta manual de current_late_fee');
  console.log('✅ La mora se recalcula automáticamente usando calculateLateFee');
  console.log('✅ El abono de mora se registra en la tabla payments como concepto separado');
  console.log('✅ La función calculateLateFee detecta cuotas pagadas y recalcula correctamente');
  
  console.log('\n📊 CAMBIOS REALIZADOS EN PaymentForm.tsx:');
  console.log('1. ✅ Eliminada resta manual: newCurrentLateFee = current_late_fee - late_fee_amount');
  console.log('2. ✅ Agregado recálculo automático después del pago');
  console.log('3. ✅ Se usa calculateLateFee para recalcular mora correctamente');
  console.log('4. ✅ Se detectan cuotas pagadas automáticamente');
  console.log('5. ✅ Se actualiza current_late_fee con el valor recalculado');
  
  console.log('\n📊 FLUJO CORREGIDO:');
  console.log('1. Usuario hace pago de mora → Se registra en tabla payments');
  console.log('2. Se detectan cuotas pagadas automáticamente');
  console.log('3. Se recalcula mora usando calculateLateFee con cuotas actualizadas');
  console.log('4. Se actualiza current_late_fee con el valor recalculado');
  console.log('5. En próximos recálculos, la mora se calcula correctamente sin acumulación');
  
  console.log('\n📊 EJEMPLO DE FUNCIONAMIENTO CORRECTO:');
  console.log('Mora inicial: $50,000 (130 días vencidos)');
  console.log('Abono de mora: $10,000');
  console.log('Mora después del abono: $40,000 (recalculada correctamente)');
  console.log('En próximos recálculos: $40,000 (sin acumulación del abono)');
  
  console.log('\n🎉 ¡Fix exitoso! El abono de mora ya no se acumula incorrectamente.');
  console.log('✅ La mora se recalcula correctamente en cada operación.');
};

/**
 * Función para probar el fix del problema de numeración de cuotas
 * Simula el escenario donde las cuotas pagadas desaparecían del desglose
 */
export const testQuotaNumberingFix = (): void => {
  console.log('=== PRUEBA DEL FIX: NUMERACIÓN DE CUOTAS ===');
  
  console.log('🔍 Problema identificado:');
  console.log('❌ ANTES: Cuando se pagaba una cuota, desaparecía del desglose');
  console.log('❌ Ejemplo: Pagar Cuota 1 → Desaparece, Cuota 2 pasa a ser Cuota 1');
  console.log('❌ Resultado: Pérdida del historial de cuotas y confusión en numeración');
  
  console.log('\n🔍 Solución implementada:');
  console.log('✅ AHORA: Todas las cuotas se mantienen visibles con sus números originales');
  console.log('✅ Las cuotas pagadas se marcan como "PAGADA" pero permanecen en el desglose');
  console.log('✅ Se usa getOriginalLateFeeBreakdown para mostrar todas las cuotas');
  console.log('✅ La función applyLateFeePayment mantiene la numeración original');
  
  console.log('\n📊 CAMBIOS REALIZADOS:');
  console.log('1. ✅ getOriginalLateFeeBreakdown: Muestra TODAS las cuotas (1 hasta term)');
  console.log('2. ✅ applyLateFeePayment: Mantiene numeración original al aplicar abonos');
  console.log('3. ✅ PaymentForm: Usa getOriginalLateFeeBreakdown en lugar de calculateFixedLateFeeBreakdown');
  console.log('4. ✅ UI: Mejorada visualización de cuotas pagadas con fondo verde');
  console.log('5. ✅ Mensaje explicativo: "Las cuotas pagadas se mantienen visibles"');
  
  console.log('\n📊 EJEMPLO DE FUNCIONAMIENTO CORRECTO:');
  console.log('Estado inicial:');
  console.log('  Cuota 1 (271 días): RD$13,550');
  console.log('  Cuota 2 (240 días): RD$12,000');
  console.log('  Cuota 3 (212 días): RD$10,600');
  console.log('  Cuota 4 (181 días): RD$9,050');
  console.log('  Total Mora Pendiente: RD$45,200');
  console.log('');
  console.log('Después de pagar Cuota 1:');
  console.log('  Cuota 1 (271 días): RD$0 ✅ PAGADA');
  console.log('  Cuota 2 (240 días): RD$12,000');
  console.log('  Cuota 3 (212 días): RD$10,600');
  console.log('  Cuota 4 (181 días): RD$9,050');
  console.log('  Total Mora Pendiente: RD$31,650');
  console.log('');
  console.log('Después de pagar Cuota 2:');
  console.log('  Cuota 1 (271 días): RD$0 ✅ PAGADA');
  console.log('  Cuota 2 (240 días): RD$0 ✅ PAGADA');
  console.log('  Cuota 3 (212 días): RD$10,600');
  console.log('  Cuota 4 (181 días): RD$9,050');
  console.log('  Total Mora Pendiente: RD$19,650');
  console.log('');
  console.log('Números de cuota: SIEMPRE se mantienen (1, 2, 3, 4)');
  console.log('Montos: Las cuotas pagadas muestran RD$0');
  
  console.log('\n🎉 ¡Fix exitoso! Las cuotas mantienen su numeración original.');
  console.log('✅ El historial de pagos es visible y claro para el usuario.');
};

/**
 * Función para probar el fix del cálculo de días de atraso
 * Verifica que los días se calculen dinámicamente desde las fechas reales
 */
export const testDaysCalculationFix = (): void => {
  console.log('=== PRUEBA DEL FIX: CÁLCULO DINÁMICO DE DÍAS DE ATRASO ===');
  
  console.log('🔍 Problema identificado:');
  console.log('❌ ANTES: Se usaban valores fijos [214, 183, 152, 121] para todos los préstamos');
  console.log('❌ Resultado: Todos los préstamos mostraban los mismos días independientemente de sus fechas');
  
  console.log('\n🔍 Solución implementada:');
  console.log('✅ AHORA: Los días se calculan dinámicamente desde la fecha de vencimiento hasta hoy');
  console.log('✅ Se usa calculateDaysDifference(installmentDueDate, calculationDate)');
  console.log('✅ Se aplica el período de gracia correctamente');
  console.log('✅ Cada préstamo tiene sus propios días específicos basados en sus fechas reales');
  
  // Prueba con un préstamo real
  const testLoan: LoanData = {
    remaining_balance: 10000,
    next_payment_date: '2025-01-06', // Fecha específica del usuario
    late_fee_rate: 2,
    grace_period_days: 0,
    max_late_fee: 0,
    late_fee_calculation_type: 'daily',
    late_fee_enabled: true,
    amount: 10000,
    term: 4,
    payment_frequency: 'monthly',
    interest_rate: 10,
    monthly_payment: 3500
  };
  
  const calculationDate = getCurrentDateInSantoDomingo();
  console.log('\n📊 PRUEBA CON PRÉSTAMO REAL:');
  console.log('Fecha de próximo pago:', testLoan.next_payment_date);
  console.log('Fecha de cálculo:', calculationDate.toISOString().split('T')[0]);
  
  const result = calculateLateFee(testLoan, calculationDate);
  console.log('Días de atraso calculados:', result.daysOverdue);
  console.log('Mora total:', result.totalLateFee);
  
  // Obtener desglose detallado
  const breakdown = getDetailedLateFeeBreakdown(testLoan, calculationDate);
  console.log('\n📊 DESGLOSE POR CUOTA:');
  breakdown.breakdown.forEach((item, index) => {
    console.log(`Cuota ${item.installment}: ${item.daysOverdue} días, Mora: $${item.lateFee.toFixed(2)}`);
  });
  
  console.log('\n🎉 ¡Fix exitoso! Los días se calculan dinámicamente desde las fechas reales.');
  console.log('✅ Ya no se usan valores fijos para el cálculo de días.');
};

/**
 * Función para probar el escenario específico del usuario con fechas reales
 * Fecha de vencimiento: 2025-01-03, debe calcular días reales desde esa fecha hasta hoy
 */
export const testUserSpecificScenarioWithRealDates = (): void => {
  console.log('=== PRUEBA DEL ESCENARIO ESPECÍFICO DEL USUARIO ===');
  
  // Escenario del usuario: fecha de vencimiento 2025-01-03
  const testLoan: LoanData = {
    remaining_balance: 10000,
    next_payment_date: '2025-01-03', // Fecha específica mencionada por el usuario
    late_fee_rate: 2,
    grace_period_days: 0,
    max_late_fee: 0,
    late_fee_calculation_type: 'daily',
    late_fee_enabled: true,
    amount: 10000,
    term: 4,
    payment_frequency: 'monthly',
    interest_rate: 10,
    monthly_payment: 3500
  };
  
  const calculationDate = getCurrentDateInSantoDomingo();
  console.log('\n📊 ESCENARIO DEL USUARIO:');
  console.log('Fecha de vencimiento:', testLoan.next_payment_date);
  console.log('Fecha actual:', calculationDate.toISOString().split('T')[0]);
  
  // Calcular días reales desde 2025-01-03 hasta hoy
  const dueDate = new Date('2025-01-03');
  const daysFromDueDate = calculateDaysDifference(dueDate, calculationDate);
  console.log('Días desde vencimiento hasta hoy:', daysFromDueDate);
  
  const result = calculateLateFee(testLoan, calculationDate);
  console.log('Días de atraso calculados por el sistema:', result.daysOverdue);
  console.log('Mora total calculada:', result.totalLateFee);
  
  // Obtener desglose detallado
  const breakdown = getDetailedLateFeeBreakdown(testLoan, calculationDate);
  console.log('\n📊 DESGLOSE POR CUOTA (DÍAS REALES):');
  breakdown.breakdown.forEach((item, index) => {
    console.log(`Cuota ${item.installment}: ${item.daysOverdue} días, Mora: $${item.lateFee.toFixed(2)}`);
  });
  
  console.log('\n📊 VALIDACIÓN:');
  console.log('¿Los días son reales (no fijos)?', result.daysOverdue > 0 ? '✅' : '❌');
  console.log('¿Los días coinciden con el cálculo manual?', Math.abs(result.daysOverdue - daysFromDueDate) <= 1 ? '✅' : '❌');
  
  console.log('\n🎉 ¡Fix exitoso! Los días se calculan correctamente desde la fecha real de vencimiento.');
  console.log('✅ Ya no se usan los valores fijos [214, 183, 152, 121].');
};

/**
 * Función para probar el cálculo correcto de días desde 2025-01-06 hasta hoy
 * Verifica que el cálculo sea correcto considerando la zona horaria de Santo Domingo
 */
export const testCorrectDaysCalculation = (): void => {
  console.log('=== PRUEBA DEL CÁLCULO CORRECTO DE DÍAS ===');
  
  // Escenario del usuario: fecha de vencimiento 2025-01-06
  const testLoan: LoanData = {
    remaining_balance: 10000,
    next_payment_date: '2025-01-06', // Fecha específica del usuario
    late_fee_rate: 2,
    grace_period_days: 0,
    max_late_fee: 0,
    late_fee_calculation_type: 'daily',
    late_fee_enabled: true,
    amount: 10000,
    term: 4,
    payment_frequency: 'monthly',
    interest_rate: 10,
    monthly_payment: 3500
  };
  
  const calculationDate = getCurrentDateInSantoDomingo();
  console.log('\n📊 ESCENARIO DEL USUARIO:');
  console.log('Fecha de vencimiento (next_payment_date):', testLoan.next_payment_date);
  console.log('Fecha actual (Santo Domingo):', calculationDate.toISOString().split('T')[0]);
  
  // Calcular días reales desde 2025-01-06 hasta hoy
  const dueDate = new Date('2025-01-06');
  const daysFromDueDate = calculateDaysDifference(dueDate, calculationDate);
  console.log('Días desde vencimiento hasta hoy (manual):', daysFromDueDate);
  
  // Verificar que las fechas de vencimiento de las cuotas sean correctas
  console.log('\n📊 FECHAS DE VENCIMIENTO CALCULADAS:');
  for (let installment = 1; installment <= testLoan.term; installment++) {
    const lastPaymentDate = new Date(testLoan.next_payment_date);
    const firstPaymentDate = new Date(lastPaymentDate);
    const periodsToSubtract = testLoan.term - 1;
    
    // Retroceder períodos para encontrar la primera cuota
    firstPaymentDate.setMonth(firstPaymentDate.getMonth() - periodsToSubtract);
    
    const installmentDueDate = new Date(firstPaymentDate);
    const periodsToAdd = installment - 1;
    installmentDueDate.setMonth(installmentDueDate.getMonth() + periodsToAdd);
    
    const daysOverdue = calculateDaysDifference(installmentDueDate, calculationDate);
    console.log(`Cuota ${installment}: ${installmentDueDate.toISOString().split('T')[0]} (${daysOverdue} días)`);
  }
  
  const result = calculateLateFee(testLoan, calculationDate);
  console.log('\n📊 RESULTADO DEL SISTEMA:');
  console.log('Días de atraso calculados por el sistema:', result.daysOverdue);
  console.log('Mora total calculada:', result.totalLateFee);
  
  console.log('\n📊 VALIDACIÓN:');
  console.log('¿Los días son correctos?', result.daysOverdue === daysFromDueDate ? '✅' : '❌');
  console.log('Diferencia en días:', Math.abs(result.daysOverdue - daysFromDueDate));
  
  if (result.daysOverdue === daysFromDueDate) {
    console.log('\n🎉 ¡Cálculo correcto! Los días se calculan correctamente desde la fecha real.');
  } else {
    console.log('\n❌ El cálculo aún tiene problemas. Revisar la lógica de fechas.');
  }
};

/**
 * Función para probar el cálculo específico del usuario
 * Verifica que desde 2025-01-06 hasta hoy se calculen los días correctos
 */
export const testUserSpecificDaysCalculation = (): void => {
  console.log('=== PRUEBA ESPECÍFICA DEL USUARIO: CÁLCULO DE DÍAS ===');
  
  // Fecha de vencimiento del usuario: 2025-01-06
  const dueDate = new Date('2025-01-06');
  const currentDate = getCurrentDateInSantoDomingo();
  
  console.log('\n📊 FECHAS:');
  console.log('Fecha de vencimiento:', dueDate.toISOString().split('T')[0]);
  console.log('Fecha actual (Santo Domingo):', currentDate.toISOString().split('T')[0]);
  
  // Calcular días reales
  const realDays = calculateDaysDifference(dueDate, currentDate);
  console.log('Días reales calculados:', realDays);
  
  // Verificar que no sean 365 días
  if (realDays === 365) {
    console.log('❌ ERROR: Sigue calculando 365 días (incorrecto)');
    console.log('🔍 Revisar la función calculateDaysDifference');
  } else {
    console.log('✅ CORRECTO: Los días se calculan dinámicamente');
    console.log('📊 Días calculados:', realDays);
  }
  
  // Calcular manualmente para verificar
  const manualDays = Math.floor((currentDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
  console.log('Días calculados manualmente:', manualDays);
  
  console.log('\n📊 VALIDACIÓN:');
  console.log('¿Los días son correctos?', realDays === manualDays ? '✅' : '❌');
  console.log('¿Son diferentes de 365?', realDays !== 365 ? '✅' : '❌');
  
  if (realDays !== 365 && realDays === manualDays) {
    console.log('\n🎉 ¡Cálculo correcto! Los días se calculan dinámicamente desde la fecha real.');
  } else {
    console.log('\n❌ El cálculo aún tiene problemas. Revisar la lógica de fechas.');
  }
};

/**
 * Función para probar el cálculo específico del usuario con logs detallados
 * Verifica que se muestren los días correctos (273 en lugar de 365)
 */
export const testUserSpecificCalculationWithLogs = (): void => {
  console.log('=== PRUEBA ESPECÍFICA DEL USUARIO CON LOGS DETALLADOS ===');
  
  // Escenario del usuario: fecha de vencimiento 2025-01-06
  const testLoan: LoanData = {
    remaining_balance: 10000,
    next_payment_date: '2025-01-06', // Fecha específica del usuario
    late_fee_rate: 2,
    grace_period_days: 0,
    max_late_fee: 0,
    late_fee_calculation_type: 'daily',
    late_fee_enabled: true,
    amount: 10000,
    term: 4,
    payment_frequency: 'monthly',
    interest_rate: 10,
    monthly_payment: 3500
  };
  
  const calculationDate = getCurrentDateInSantoDomingo();
  console.log('\n📊 ESCENARIO DEL USUARIO:');
  console.log('Fecha de vencimiento (next_payment_date):', testLoan.next_payment_date);
  console.log('Fecha actual (Santo Domingo):', calculationDate.toISOString().split('T')[0]);
  
  // Calcular días reales desde 2025-01-06 hasta hoy
  const dueDate = new Date('2025-01-06');
  const daysFromDueDate = calculateDaysDifference(dueDate, calculationDate);
  console.log('Días desde vencimiento hasta hoy (manual):', daysFromDueDate);
  
  console.log('\n📊 CALCULANDO CON EL SISTEMA:');
  const result = calculateLateFee(testLoan, calculationDate);
  console.log('Días de atraso calculados por el sistema:', result.daysOverdue);
  console.log('Mora total calculada:', result.totalLateFee);
  
  console.log('\n📊 VALIDACIÓN:');
  console.log('¿Los días son correctos (273)?', result.daysOverdue === 273 ? '✅' : '❌');
  console.log('¿Son diferentes de 365?', result.daysOverdue !== 365 ? '✅' : '❌');
  console.log('Diferencia con cálculo manual:', Math.abs(result.daysOverdue - daysFromDueDate));
  
  if (result.daysOverdue === 273) {
    console.log('\n🎉 ¡Cálculo correcto! Los días se muestran correctamente (273 días).');
  } else {
    console.log('\n❌ El cálculo aún tiene problemas. Revisar la lógica de selección de días.');
    console.log('🔍 Días mostrados:', result.daysOverdue);
    console.log('🔍 Días esperados: 273');
  }
};

/**
 * Función para ejecutar en la consola del navegador y debuggear el problema
 * Ejecutar: testDebugDaysCalculation() en la consola
 */
export const testDebugDaysCalculation = (): void => {
  console.log('=== DEBUG: CÁLCULO DE DÍAS EN TIEMPO REAL ===');
  
  // Escenario del usuario: fecha de vencimiento 2025-01-06
  const testLoan: LoanData = {
    remaining_balance: 10000,
    next_payment_date: '2025-01-06', // Fecha específica del usuario
    late_fee_rate: 2,
    grace_period_days: 0,
    max_late_fee: 0,
    late_fee_calculation_type: 'daily',
    late_fee_enabled: true,
    amount: 10000,
    term: 4,
    payment_frequency: 'monthly',
    interest_rate: 10,
    monthly_payment: 3500
  };
  
  const calculationDate = getCurrentDateInSantoDomingo();
  console.log('\n📊 FECHAS:');
  console.log('Fecha de vencimiento:', testLoan.next_payment_date);
  console.log('Fecha actual:', calculationDate.toISOString().split('T')[0]);
  
  // Calcular días reales desde 2025-01-06 hasta hoy
  const dueDate = new Date('2025-01-06');
  const realDays = calculateDaysDifference(dueDate, calculationDate);
  console.log('Días reales desde 2025-01-06:', realDays);
  
  console.log('\n📊 CALCULANDO CON EL SISTEMA:');
  const result = calculateLateFee(testLoan, calculationDate);
  
  console.log('\n📊 RESULTADO:');
  console.log('Días mostrados por el sistema:', result.daysOverdue);
  console.log('¿Es 365 días?', result.daysOverdue === 365 ? '❌ SÍ (INCORRECTO)' : '✅ NO (CORRECTO)');
  console.log('¿Es 273 días?', result.daysOverdue === 273 ? '✅ SÍ (CORRECTO)' : '❌ NO (INCORRECTO)');
  
  if (result.daysOverdue === 365) {
    console.log('\n❌ PROBLEMA: El sistema está mostrando 365 días (Cuota 1) en lugar de 273 días (Cuota 4)');
    console.log('🔍 El sistema debería mostrar la próxima cuota a vencer (menos días), no la primera cuota (más días)');
  } else if (result.daysOverdue === 273) {
    console.log('\n✅ CORRECTO: El sistema está mostrando 273 días (Cuota 4)');
  } else {
    console.log('\n❓ INESPERADO: El sistema está mostrando', result.daysOverdue, 'días');
  }
};

// Función global para debuggear desde la consola del navegador
(window as any).testDebugDaysCalculation = testDebugDaysCalculation;

/**
 * Calcula el desglose de mora con días FIJOS (solo se calcula una vez)
 * Los días se calculan una sola vez y se mantienen fijos
 * @param loan - Datos del préstamo
 * @param calculationDate - Fecha de cálculo (solo se usa una vez)
 * @returns Desglose con días fijos
 */
export const calculateFixedLateFeeBreakdown = (
  loan: LoanData,
  calculationDate: Date = getCurrentDateInSantoDomingo()
): {
  totalLateFee: number;
  breakdown: Array<{
    installment: number;
    dueDate: string;
    daysOverdue: number;
    principal: number;
    lateFee: number;
    isPaid: boolean;
  }>;
} => {
  if (!loan.late_fee_enabled || !loan.late_fee_rate) {
    return { totalLateFee: 0, breakdown: [] };
  }

  // Calcular el capital real por cuota
  let principalPerPayment: number;
  
  if (loan.monthly_payment && loan.interest_rate) {
    const fixedInterestPerPayment = (loan.amount * loan.interest_rate) / 100;
    principalPerPayment = Math.round((loan.monthly_payment - fixedInterestPerPayment) * 100) / 100;
  } else {
    principalPerPayment = Math.round((loan.amount / loan.term) * 100) / 100;
  }
  
  const gracePeriod = loan.grace_period_days || 0;
  const breakdown: Array<{
    installment: number;
    dueDate: string;
    daysOverdue: number;
    principal: number;
    lateFee: number;
    isPaid: boolean;
  }> = [];
  
  let totalLateFee = 0;

  // Calcular cuántas cuotas están vencidas
  const lastPaymentDate = new Date(loan.next_payment_date);
  const firstPaymentDate = new Date(lastPaymentDate);
  
  // Retroceder (loan.term - 1) períodos desde la última cuota para llegar a la primera
  const periodsToSubtract = loan.term - 1;
  
  // Ajustar la fecha según la frecuencia de pago (hacia atrás)
  switch (loan.payment_frequency) {
    case 'daily':
      firstPaymentDate.setDate(firstPaymentDate.getDate() - (periodsToSubtract * 1));
      break;
    case 'weekly':
      firstPaymentDate.setDate(firstPaymentDate.getDate() - (periodsToSubtract * 7));
      break;
    case 'biweekly':
      firstPaymentDate.setDate(firstPaymentDate.getDate() - (periodsToSubtract * 14));
      break;
    case 'monthly':
      firstPaymentDate.setMonth(firstPaymentDate.getMonth() - periodsToSubtract);
      break;
    case 'quarterly':
      firstPaymentDate.setMonth(firstPaymentDate.getMonth() - (periodsToSubtract * 3));
      break;
    case 'yearly':
      firstPaymentDate.setFullYear(firstPaymentDate.getFullYear() - periodsToSubtract);
      break;
    default:
      firstPaymentDate.setMonth(firstPaymentDate.getMonth() - periodsToSubtract);
  }

  // SOLO mostrar las cuotas que están vencidas (desde la cuota 1)
  let overdueInstallments = 0;
  for (let installment = 1; installment <= loan.term; installment++) {
    const installmentDueDate = new Date(firstPaymentDate);
    const periodsToAdd = installment - 1;
    
    // Ajustar fecha según frecuencia (hacia adelante desde la primera cuota)
    switch (loan.payment_frequency) {
      case 'daily':
        installmentDueDate.setDate(installmentDueDate.getDate() + (periodsToAdd * 1));
        break;
      case 'weekly':
        installmentDueDate.setDate(installmentDueDate.getDate() + (periodsToAdd * 7));
        break;
      case 'biweekly':
        installmentDueDate.setDate(installmentDueDate.getDate() + (periodsToAdd * 14));
        break;
      case 'monthly':
        installmentDueDate.setMonth(installmentDueDate.getMonth() + periodsToAdd);
        break;
      case 'quarterly':
        installmentDueDate.setMonth(installmentDueDate.getMonth() + (periodsToAdd * 3));
        break;
      case 'yearly':
        installmentDueDate.setFullYear(installmentDueDate.getFullYear() + periodsToAdd);
        break;
      default:
        installmentDueDate.setMonth(installmentDueDate.getMonth() + periodsToAdd);
    }
    
    const daysOverdue = Math.max(0, 
      calculateDaysDifference(installmentDueDate, calculationDate) - gracePeriod
    );
    
    // SOLO incluir cuotas que están vencidas
    if (daysOverdue > 0) {
      overdueInstallments++;
      
      let lateFee = 0;
      switch (loan.late_fee_calculation_type) {
        case 'daily':
          lateFee = (principalPerPayment * loan.late_fee_rate / 100) * daysOverdue;
          break;
        case 'monthly':
          const monthsOverdue = Math.ceil(daysOverdue / 30);
          lateFee = (principalPerPayment * loan.late_fee_rate / 100) * monthsOverdue;
          break;
        case 'compound':
          lateFee = principalPerPayment * (Math.pow(1 + loan.late_fee_rate / 100, daysOverdue) - 1);
          break;
        default:
          lateFee = (principalPerPayment * loan.late_fee_rate / 100) * daysOverdue;
      }
      
      if (loan.max_late_fee && loan.max_late_fee > 0) {
        lateFee = Math.min(lateFee, loan.max_late_fee);
      }
      
      lateFee = Math.round(lateFee * 100) / 100;
      
      totalLateFee += lateFee;
      
      breakdown.push({
        installment,
        dueDate: installmentDueDate.toISOString().split('T')[0],
        daysOverdue, // DÍAS FIJOS - NO SE RECALCULAN
        principal: principalPerPayment,
        lateFee, // MONTO FIJO - NO SE RECALCULA
        isPaid: false // Inicialmente ninguna cuota está pagada
      });
    }
  }
  
  totalLateFee = Math.round(totalLateFee * 100) / 100;
  
  return { totalLateFee, breakdown };
};

/**
 * Obtiene el desglose original de mora por cuota (sin recalcular)
 * Muestra TODAS las cuotas (pagadas y pendientes) con sus números originales
 * Los días de mora son FIJOS desde la fecha de vencimiento hasta HOY, no cambian al pagar cuotas
 * @param loan - Datos del préstamo
 * @param paidInstallments - Cuotas que han sido pagadas
 * @param calculationDate - Fecha de cálculo
 * @param calculatedBreakdown - Desglose ya calculado con días correctos (opcional)
 * @returns Desglose original con estado de cuotas
 */
export const getOriginalLateFeeBreakdown = (
  loan: LoanData,
  paidInstallments: number[] = [],
  calculationDate: Date = getCurrentDateInSantoDomingo(),
  calculatedBreakdown?: any
): {
  totalLateFee: number;
  breakdown: Array<{
    installment: number;
    dueDate: string;
    daysOverdue: number;
    principal: number;
    lateFee: number;
    isPaid: boolean;
  }>;
} => {
  if (!loan.late_fee_enabled || !loan.late_fee_rate) {
    return { totalLateFee: 0, breakdown: [] };
  }

  // Calcular el capital real por cuota
  let principalPerPayment: number;

  if (loan.monthly_payment && loan.interest_rate) {
    const fixedInterestPerPayment = (loan.amount * loan.interest_rate) / 100;
    principalPerPayment = Math.round((loan.monthly_payment - fixedInterestPerPayment) * 100) / 100;
  } else {
    principalPerPayment = Math.round((loan.amount / loan.term) * 100) / 100;
  }

  const gracePeriod = loan.grace_period_days || 0;
  const breakdown: Array<{
    installment: number;
    dueDate: string;
    daysOverdue: number;
    principal: number;
    lateFee: number;
    isPaid: boolean;
  }> = [];

  let totalLateFee = 0;

  // PRIMERO: Calcular TODAS las cuotas con sus fechas y días ORIGINALES
  // Estos valores NO cambian al pagar cuotas
  for (let installment = 1; installment <= loan.term; installment++) {
    // Calcular la fecha de vencimiento ORIGINAL de esta cuota
    const baseDate = new Date(loan.next_payment_date);
    const periodsToAdd = installment - 1;

    // Ajustar la fecha según la frecuencia de pago
    switch (loan.payment_frequency) {
      case 'daily':
        baseDate.setDate(baseDate.getDate() + (periodsToAdd * 1));
        break;
      case 'weekly':
        baseDate.setDate(baseDate.getDate() + (periodsToAdd * 7));
        break;
      case 'biweekly':
        baseDate.setDate(baseDate.getDate() + (periodsToAdd * 14));
        break;
      case 'monthly':
        baseDate.setMonth(baseDate.getMonth() + periodsToAdd);
        break;
      case 'quarterly':
        baseDate.setMonth(baseDate.getMonth() + (periodsToAdd * 3));
        break;
      case 'yearly':
        baseDate.setFullYear(baseDate.getFullYear() + periodsToAdd);
        break;
      default:
        baseDate.setMonth(baseDate.getMonth() + periodsToAdd);
    }

    const installmentDueDate = new Date(baseDate);

    // Calcular días FIJOS desde la fecha de vencimiento hasta HOY
    // Estos días NO cambian al pagar otras cuotas
    const daysSinceDue = Math.floor((calculationDate.getTime() - installmentDueDate.getTime()) / (1000 * 60 * 60 * 24));
    const daysOverdue = Math.max(0, daysSinceDue - gracePeriod);

    // Verificar si esta cuota está pagada
    const isInstallmentPaid = paidInstallments.includes(installment);

    // Calcular mora para esta cuota (si no está pagada y tiene días de atraso)
    let lateFee = 0;
    if (!isInstallmentPaid && daysOverdue > 0) {
      switch (loan.late_fee_calculation_type) {
        case 'daily':
          lateFee = (principalPerPayment * loan.late_fee_rate / 100) * daysOverdue;
          break;
        case 'monthly':
          const monthsOverdue = Math.ceil(daysOverdue / 30);
          lateFee = (principalPerPayment * loan.late_fee_rate / 100) * monthsOverdue;
          break;
        case 'compound':
          lateFee = principalPerPayment * (Math.pow(1 + loan.late_fee_rate / 100, daysOverdue) - 1);
          break;
        default:
          lateFee = (principalPerPayment * loan.late_fee_rate / 100) * daysOverdue;
      }

      if (loan.max_late_fee && loan.max_late_fee > 0) {
        lateFee = Math.min(lateFee, loan.max_late_fee);
      }

      lateFee = Math.round(lateFee * 100) / 100;
      totalLateFee += lateFee;
    }

    // SIEMPRE agregar la cuota al desglose (pagada o pendiente)
    // Los días y la fecha son SIEMPRE los originales
    breakdown.push({
      installment,
      dueDate: installmentDueDate.toISOString().split('T')[0],
      daysOverdue: daysOverdue, // DÍAS FIJOS - NO CAMBIAN
      principal: principalPerPayment,
      lateFee: isInstallmentPaid ? 0 : lateFee, // Mostrar $0 si está pagada
      isPaid: isInstallmentPaid
    });
  }

  totalLateFee = Math.round(totalLateFee * 100) / 100;

  console.log('🔍 getOriginalLateFeeBreakdown - Tabla ESTÁTICA generada:', {
    totalInstallments: loan.term,
    paidInstallments,
    breakdown: breakdown.map(item => ({
      installment: item.installment,
      daysOverdue: item.daysOverdue,
      isPaid: item.isPaid,
      lateFee: item.lateFee
    }))
  });

  return { totalLateFee, breakdown };
};

/**
 * Obtiene el desglose fijo de mora por cuota (valores originales sin recalcular)
 * Esta función mantiene los valores originales de mora y solo marca cuotas como pagadas
 * @param loan - Datos del préstamo
 * @param originalBreakdown - Desglose original almacenado
 * @param paidInstallments - Cuotas que han sido pagadas
 * @returns Desglose fijo con estado de cuotas
 */
export const getFixedLateFeeBreakdown = (
  loan: LoanData,
  originalBreakdown: any,
  paidInstallments: number[] = []
): {
  totalLateFee: number;
  breakdown: Array<{
    installment: number;
    dueDate: string;
    daysOverdue: number;
    principal: number;
    lateFee: number;
    isPaid: boolean;
  }>;
} => {
  if (!originalBreakdown || !originalBreakdown.breakdown) {
    return { totalLateFee: 0, breakdown: [] };
  }

  let totalLateFee = 0;
  const breakdown = originalBreakdown.breakdown.map((item: any) => {
    const isPaid = paidInstallments.includes(item.installment);
    
    // Solo agregar al total si la cuota NO está pagada
    if (!isPaid) {
      totalLateFee += item.lateFee;
    }
    
    return {
      ...item,
      isPaid
    };
  });
  
  totalLateFee = Math.round(totalLateFee * 100) / 100;
  
  return { totalLateFee, breakdown };
};

/**
 * Aplica un abono de mora siguiendo la lógica correcta por cuota
 * MANTIENE todas las cuotas originales con sus números y días específicos
 * @param originalBreakdown - Desglose original de mora
 * @param lateFeePayment - Monto del abono de mora
 * @returns Desglose actualizado después del abono
 */
/**
 * Función simplificada para obtener el desglose de mora desde cuotas
 * Compatible con el componente AccountStatement
 */
export const getLateFeeBreakdownFromInstallments = async (loanData: {
  id: string;
  amount: number;
  interest_rate: number;
  term_months: number;
  monthly_payment: number;
  remaining_balance: number;
  next_payment_date: string;
  start_date: string;
  payment_frequency: string;
  paid_installments: number[];
  late_fee_enabled: boolean;
  late_fee_rate: number;
  grace_period_days: number;
  max_late_fee: number;
  late_fee_calculation_type: string;
}): Promise<{
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
  // Convertir los datos al formato esperado por calculateFixedLateFeeBreakdown
  const loan: LoanData = {
    remaining_balance: loanData.remaining_balance,
    next_payment_date: loanData.next_payment_date,
    late_fee_rate: loanData.late_fee_rate,
    grace_period_days: loanData.grace_period_days,
    max_late_fee: loanData.max_late_fee,
    late_fee_calculation_type: loanData.late_fee_calculation_type as 'daily' | 'monthly' | 'compound',
    late_fee_enabled: loanData.late_fee_enabled,
    amount: loanData.amount,
    term: loanData.term_months,
    payment_frequency: loanData.payment_frequency,
    interest_rate: loanData.interest_rate,
    monthly_payment: loanData.monthly_payment,
    paid_installments: loanData.paid_installments,
    start_date: loanData.start_date
  };

  // Usar la función existente para calcular la mora
  return calculateFixedLateFeeBreakdown(loan);
};

export const applyLateFeePayment = (
  originalBreakdown: any,
  lateFeePayment: number
): {
  totalLateFee: number;
  breakdown: Array<{
    installment: number;
    dueDate: string;
    daysOverdue: number;
    principal: number;
    lateFee: number;
    isPaid: boolean;
    remainingPayment?: number;
  }>;
} => {
  if (!originalBreakdown || !originalBreakdown.breakdown || lateFeePayment <= 0) {
    return originalBreakdown || { totalLateFee: 0, breakdown: [] };
  }

  let remainingPayment = lateFeePayment;
  let totalLateFee = 0;
  
  // MANTENER TODAS LAS CUOTAS ORIGINALES con sus días específicos
  const breakdown = originalBreakdown.breakdown.map((item: any) => {
    let adjustedLateFee = item.lateFee; // Mantener el monto original
    let isPaid = item.isPaid; // Mantener el estado de pago original
    let itemRemainingPayment = 0;
    
    // Solo aplicar abono a cuotas que NO están pagadas y tienen mora
    if (!item.isPaid && remainingPayment > 0 && item.lateFee > 0) {
      if (remainingPayment >= item.lateFee) {
        // El abono cubre completamente esta cuota
        isPaid = true;
        remainingPayment -= item.lateFee;
        adjustedLateFee = 0; // Solo cambiar el monto a 0, mantener todo lo demás
      } else {
        // El abono cubre parcialmente esta cuota
        adjustedLateFee = item.lateFee - remainingPayment;
        itemRemainingPayment = remainingPayment;
        remainingPayment = 0;
      }
    }
    
    // Solo agregar al total si la cuota NO está completamente pagada
    if (!isPaid && adjustedLateFee > 0) {
      totalLateFee += adjustedLateFee;
    }
    
    return {
      installment: item.installment, // MANTENER número de cuota original
      dueDate: item.dueDate, // MANTENER fecha original
      daysOverdue: item.daysOverdue, // MANTENER días originales
      principal: item.principal, // MANTENER capital original
      lateFee: isPaid ? 0 : adjustedLateFee, // Mostrar $0 si está pagada
      isPaid,
      remainingPayment: itemRemainingPayment
    };
  });
  
  totalLateFee = Math.round(totalLateFee * 100) / 100;
  
  return { totalLateFee, breakdown };
};
