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
    isCharge?: boolean;
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
    // For indefinite loans: tracks late_fee_paid that wasn't consumed reducing DB installment mora.
    // Applied as a pool against dynamic installments so "Eliminar Mora" zeroes the Mora Actual widget.
    let lateFeePaidSurplusPool = 0;
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
      .select('id, principal_amount, interest_amount, payment_date, amount, due_date')
      .eq('loan_id', loanId)
      .order('payment_date', { ascending: true });
    
    if (paymentsError) {
      console.error('Error obteniendo pagos:', paymentsError);
    }
    
    const amortizationType = String(loan.amortization_type || '').toLowerCase();
    const isIndefinite = amortizationType === 'indefinite';

    // Asignar pagos a cuotas: primero por due_date, luego secuencialmente (NO secuencial en indefinidos)
    const paymentToInstallmentMap = new Map<string, number>();
    const assignedPaymentIds = new Set<string>();
    
    if (payments && payments.length > 0) {
      // Ordenar pagos por fecha
      const sortedPayments = [...payments].sort((a, b) => {
        return new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime();
      });
      
      // PRIMERO: Asignar pagos que tienen due_date específico a la cuota correspondiente
      for (const payment of sortedPayments) {
        if (payment.due_date && !assignedPaymentIds.has(payment.id)) {
          // Buscar la cuota que corresponde a este due_date
          const matchingInstallment = installments.find(inst => {
            const installmentDueDate = new Date(inst.due_date).toISOString().split('T')[0];
            const paymentDueDate = new Date(payment.due_date).toISOString().split('T')[0];
            return installmentDueDate === paymentDueDate;
          });
          
          if (matchingInstallment) {
            assignedPaymentIds.add(payment.id);
            paymentToInstallmentMap.set(payment.id, matchingInstallment.installment_number);
            console.log(`🔍 getLateFeeBreakdownFromInstallments: Asignación por due_date - Cuota ${matchingInstallment.installment_number} → Pago del ${payment.payment_date} (RD$${payment.amount}, due_date: ${payment.due_date})`);
          }
        }
      }
      
      // SEGUNDO: Asignar pagos restantes (sin due_date o sin coincidencia) secuencialmente
      // IMPORTANTE: En préstamos indefinidos NO hacemos asignación secuencial, porque rompería el “pago parcial” (saltaría de cuota).
      if (!isIndefinite) {
        // Pre-filter: only payments not yet assigned in the first pass
        const unassignedPayments = sortedPayments.filter(p => !assignedPaymentIds.has(p.id));
        // Pre-compute which installment numbers already have a payment from the first pass
        const coveredInstNums = new Set(paymentToInstallmentMap.values());

        let unassignedIdx = 0;
        for (let i = 0; i < installments.length && unassignedIdx < unassignedPayments.length; i++) {
          const installment = installments[i];
          // Skip installments already covered by a due_date-matched payment
          if (coveredInstNums.has(installment.installment_number)) continue;

          const payment = unassignedPayments[unassignedIdx];
          assignedPaymentIds.add(payment.id);
          paymentToInstallmentMap.set(payment.id, installment.installment_number);
          unassignedIdx++;
          console.log(`🔍 getLateFeeBreakdownFromInstallments: Asignación secuencial - Cuota ${installment.installment_number} → Pago del ${payment.payment_date} (RD$${payment.amount})`);
        }
      }
    }
    
    // Si no hay pagos reales, no aplicar next_payment_date como "corte de pagados"
    const hasAnyPayments = payments && payments.length > 0;

    // Procesar cada cuota de la base de datos
    for (const installment of installments) {
      let daysOverdue = 0;
      let lateFee = 0;
      
      // SIEMPRE calcular el total pagado para verificar si realmente está pagada completamente
      // Incluso si installment.is_paid es true en la BD, puede que no esté completamente pagada
      let totalPaidForInstallment = 0;
      if (paymentToInstallmentMap.size > 0) {
        for (const [paymentId, installmentNum] of paymentToInstallmentMap.entries()) {
          if (installmentNum === installment.installment_number) {
            const assignedPayment = payments?.find(p => p.id === paymentId);
            if (assignedPayment) {
              totalPaidForInstallment += assignedPayment.amount || 0;
            }
          }
        }
      }
      
      // Obtener el monto total de la cuota
      const installmentTotalAmount = installment.total_amount || (installment.principal_amount || 0) + (installment.interest_amount || 0);
      // En indefinidos, el monto “histórico” pagado puede ser mayor que el total_amount actual (p.ej. tras abono a capital).
      // Para evitar casos como “pagado 75 vs total 25”, tomamos el esperado como el máximo entre ambos.
      const effectiveInstallmentTotalAmount = isIndefinite
        ? Math.max(installmentTotalAmount || 0, totalPaidForInstallment || 0)
        : installmentTotalAmount;
      
      // Determinar si está realmente pagada: el total pagado debe ser >= monto total
      // Ignorar installment.is_paid de la BD y calcular basándose en los pagos reales
      const isActuallyPaid = totalPaidForInstallment >= effectiveInstallmentTotalAmount - 0.01;
      
      if (isActuallyPaid && totalPaidForInstallment > 0) {
        console.log(`🔍 getLateFeeBreakdownFromInstallments: Cuota ${installment.installment_number} marcada como pagada - Total pagado: RD$${totalPaidForInstallment}, Monto total: RD$${effectiveInstallmentTotalAmount}`);
      } else if (totalPaidForInstallment > 0 && totalPaidForInstallment < effectiveInstallmentTotalAmount) {
        console.log(`🔍 getLateFeeBreakdownFromInstallments: Cuota ${installment.installment_number} con pago parcial - Total pagado: RD$${totalPaidForInstallment}, Monto total: RD$${effectiveInstallmentTotalAmount}, Pendiente: RD$${effectiveInstallmentTotalAmount - totalPaidForInstallment}`);
      }
      
      console.log(`🔍 getLateFeeBreakdownFromInstallments: Cuota ${installment.installment_number} - Estado final:`, {
        is_paid_in_db: installment.is_paid,
        isActuallyPaid,
        late_fee_paid: installment.late_fee_paid,
        due_date: installment.due_date,
        interest_amount: installment.interest_amount,
        total_amount: installment.total_amount,
        hasAssignedPayment: Array.from(paymentToInstallmentMap.values()).includes(installment.installment_number)
      });

      // Para préstamos indefinidos con pagos: confiar en next_payment_date como fuente de verdad.
      // Sin pagos, no podemos asumir que ninguna cuota está pagada por fecha.
      if (isIndefinite && loan.next_payment_date && hasAnyPayments) {
        const instDue = String(installment.due_date || '').split('T')[0];
        const nextPay = loan.next_payment_date.split('T')[0];
        if (instDue < nextPay) {
          lateFeePaidSurplusPool += installment.late_fee_paid || 0;
          breakdown.push({
            installment: installment.installment_number,
            dueDate: instDue,
            daysOverdue: 0,
            principal: 0,
            lateFee: 0,
            isPaid: true
          });
          continue;
        }
      }

      if (isActuallyPaid) {
        // Si está pagada, mostrar 0 días y 0 mora
        daysOverdue = 0;
        lateFee = 0;
        // For indefinite: late_fee_paid was never used (mora already 0), so add to surplus pool
        if (isIndefinite) {
          lateFeePaidSurplusPool += installment.late_fee_paid || 0;
        }
      } else {
        // Calcular días de atraso desde la fecha de vencimiento hasta hoy
        // Parsear la fecha como fecha local para evitar problemas de zona horaria
        // split('T')[0] handles both 'YYYY-MM-DD' and 'YYYY-MM-DDTHH:MM:SS' formats from DB
        const dueDateOnly = String(installment.due_date || '').split('T')[0];
        const [year, month, day] = dueDateOnly.split('-').map(Number);
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
            case 'monthly': {
              // Usar el largo del período según la frecuencia de pago, no siempre 30 días
              const periodDays =
                loan.payment_frequency === 'weekly' ? 7 :
                loan.payment_frequency === 'biweekly' ? 14 :
                loan.payment_frequency === 'daily' ? 1 : 30;
              const periodsOverdue = Math.ceil(daysOverdue / periodDays);
              lateFee = (baseAmount * loan.late_fee_rate / 100) * periodsOverdue;
              break;
            }
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
          const rawLateFeePaid = installment.late_fee_paid || 0;
          let lateFeePaid = rawLateFeePaid;
          // For indefinite loans: if there is no payment directly linked to this installment
          // but late_fee_paid is set, treat it as surplus for dynamic installments.
          // This prevents stale late_fee_paid values (from incorrect redistribution or a
          // "Eliminar Mora" that predates a newly-added CARGO) from hiding owed mora.
          if (isIndefinite && rawLateFeePaid > 0 && totalPaidForInstallment <= 0) {
            lateFeePaidSurplusPool += Math.round(rawLateFeePaid * 100) / 100;
            lateFeePaid = 0;
          } else if (isIndefinite && rawLateFeePaid > lateFee) {
            lateFeePaidSurplusPool += Math.round((rawLateFeePaid - lateFee) * 100) / 100;
          }
          lateFee = Math.max(0, lateFee - lateFeePaid);
        }
      }
      
      // Solo agregar al total si la cuota NO está pagada
      if (!isActuallyPaid) {
        totalLateFee += lateFee;
      }
      
      // Detect CARGO (charge): interest = 0, principal = total, no interest component
      const isCharge = Math.abs(installment.interest_amount || 0) < 0.01 &&
        (installment.principal_amount || 0) > 0.01;

      // SIEMPRE agregar la cuota al desglose (pagada o pendiente)
      // Normalize dueDate to YYYY-MM-DD to avoid timestamp mismatch issues
      const normalizedDueDate = String(installment.due_date || '').split('T')[0];
      breakdown.push({
        installment: installment.installment_number,
        dueDate: normalizedDueDate,
        daysOverdue,
        // For regular indefinite cuotas (not CARGOs): principal_amount is 0, but interest_amount
        // is the per-period payment. Store the interest amount so aging balance can display it.
        // CARGOs (isCharge=true) keep their principal_amount (the charge amount).
        principal: (isIndefinite && !isCharge)
          ? (installment.interest_amount || installment.total_amount || 0)
          : installment.principal_amount,
        lateFee: isActuallyPaid ? 0 : lateFee,
        isPaid: isActuallyPaid,
        isCharge
      });
    }
    
    // CORRECCIÓN: Para préstamos indefinidos, generar dinámicamente todas las cuotas vencidas
    // desde la primera no pagada hasta hoy
    if (loan.amortization_type === 'indefinite' && loan.start_date && loan.next_payment_date) {
      // CORRECCIÓN CRÍTICA (auditoría de cálculos): `maxInstallmentNumber` se usa más abajo para
      // saber "cuántos períodos de interés ya existen" y a partir de ahí generar los que faltan
      // hasta hoy. Un CARGO se numera con `installment_number = max(actual) + 1` (ver add_charge
      // en LoanUpdateForm.tsx/PaymentForm.tsx) SIN importar su fecha — puede caer a mitad del
      // préstamo pero de todos modos "roba" el siguiente número de la secuencia. Si se incluye a
      // los cargos en este cálculo, `maxInstallmentNumber` queda inflado por cada cargo agregado,
      // y la generación dinámica de cuotas de interés empieza a contar desde un número más alto
      // del que le corresponde: se salta un período completo de interés/mora y, peor, TODAS las
      // fechas de las cuotas generadas después quedan corridas un período entero (por eso "cuando
      // llega a un cargo deja de seguir bien" el interés o el balance). Se excluyen los cargos:
      // solo las cuotas regulares (con interés) cuentan como "períodos" para esta numeración.
      const isChargeInstallmentForSeq = (inst: any) =>
        Math.abs(inst.interest_amount || 0) < 0.01 && (inst.principal_amount || 0) > 0.01;
      const regularInstallmentsForSeq = installments.filter(i => !isChargeInstallmentForSeq(i));
      const maxInstallmentNumber = regularInstallmentsForSeq.length > 0
        ? Math.max(...regularInstallmentsForSeq.map(i => i.installment_number))
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
      
      // Calcular cuántas cuotas deberían existir: SOLO las que ya vencieron o vencen HOY
      // (calculationDate). Se cuenta período por período (en vez de aproximar con "días/30"
      // o diferencia de meses) para que sea exacto en cualquier frecuencia y NUNCA incluya un
      // período cuya fecha de vencimiento todavía no ha llegado. La aproximación anterior por
      // diferencia de meses (para 'monthly') tenía el mismo problema que "días/30" tenía para
      // diario/semanal/quincenal: contaba un período como vencido con solo que cambiara el mes,
      // sin fijarse si el día del mes de vencimiento ya había llegado o no (ej: cuota vence el
      // día 25 y hoy es el día 10 del mes siguiente → esa cuota aún no vence, pero se contaba).
      const toIsoLocal = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const calculationDateIso = toIsoLocal(calculationDate);

      const addPeriodsToDate = (base: Date, periods: number): Date => {
        const dt = new Date(base);
        switch (frequency) {
          case 'daily':
            dt.setDate(dt.getDate() + periods);
            break;
          case 'weekly':
            dt.setDate(dt.getDate() + (periods * 7));
            break;
          case 'biweekly':
            dt.setDate(dt.getDate() + (periods * 14));
            break;
          case 'monthly':
          default: {
            const day = base.getDate();
            const targetMonth = base.getMonth() + periods;
            const targetYear = base.getFullYear();
            const lastDayOfTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
            dt.setFullYear(targetYear, targetMonth, Math.min(day, lastDayOfTargetMonth));
            break;
          }
        }
        return dt;
      };

      let totalExpected = 0;
      for (let n = 0; n < 100000; n++) { // safety cap, nunca debería alcanzarse
        const dueIso = toIsoLocal(addPeriodsToDate(firstPaymentDate, n));
        if (dueIso > calculationDateIso) break;
        totalExpected = n + 1;
      }
      totalExpected = Math.max(1, totalExpected);
      
      // Calcular el monto base para la mora (interés por cuota para indefinidos)
      const isIndefinite = loan.amortization_type === 'indefinite';
      let baseAmount = 0;
      
      if (isIndefinite) {
        // Skip CARGO installments (interest_amount≈0, principal_amount>0) when determining
        // the per-period interest base. CARGOs are one-off charges, not recurring interest cuotas.
        const nonCharges = installments.filter(inst =>
          !(Math.abs(inst.interest_amount || 0) < 0.01 && (inst.principal_amount || 0) > 0.01)
        );
        const lastNonCharge = nonCharges[nonCharges.length - 1];
        baseAmount = lastNonCharge?.interest_amount ||
          lastNonCharge?.total_amount ||
          lastNonCharge?.amount ||
          loan.monthly_payment || 0;
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
      
      console.log(`🔍 getLateFeeBreakdownFromInstallments: Generación dinámica - baseAmount=${baseAmount}, maxInst=${maxInstallmentNumber}, totalExpected=${totalExpected}, paidCount=${paidInstallmentsCount}`);

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

        // Verificar si ya existe una CUOTA REGULAR con esta fecha en el breakdown.
        // CORRECCIÓN CRÍTICA (auditoría de cálculos): antes este `find` no excluía los cargos, así
        // que si un cargo tenía la MISMA fecha que el período regular que tocaba generar (algo común:
        // se agrega un cargo el mismo día que vence una cuota), el código creía "esta fecha ya tiene
        // una cuota" y se saltaba por completo la generación del interés de ese período — el cargo y
        // la cuota de interés son dos obligaciones distintas que pueden coincidir en fecha, no la
        // misma cosa. Ese período de interés desaparecía sin dejar rastro del cálculo, dando un
        // total de interés pendiente (y de la tabla "por antigüedad") menor al real.
        const existingInstallment = breakdown.find(item => item.dueDate === dueDateStr && !item.isCharge);

        if (!existingInstallment) {
          // CORRECCIÓN: Verificar si esta cuota está pagada.
          // Primero: si la fecha < next_payment_date, está pagada (fuente de verdad: payments table)
          // Segundo: fallback con paidInstallmentsCount (para cuando next_payment_date no cubre el período)
          const nextPayStr = loan.next_payment_date?.split('T')[0] || '';
          const isPaid = isIndefinite && (
            (hasAnyPayments && nextPayStr && dueDateStr < nextPayStr) ||
            installmentNum <= paidInstallmentsCount
          );
          
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

            // Apply surplus pool from DB installments (e.g. late_fee_paid set by "Eliminar Mora")
            if (lateFeePaidSurplusPool > 0) {
              const applied = Math.min(lateFeePaidSurplusPool, lateFeeForInstallment);
              lateFeeForInstallment = Math.max(0, lateFeeForInstallment - applied);
              lateFeePaidSurplusPool = Math.max(0, lateFeePaidSurplusPool - applied);
            }
          }

          // Agregar la cuota generada dinámicamente al breakdown
          breakdown.push({
            installment: installmentNum,
            dueDate: dueDateStr,
            daysOverdue: isPaid ? 0 : daysOverdueForInstallment,
            // baseAmount for indefinite = per-period interest; for non-indefinite = principal per cuota.
            // Both cases: store in principal so aging balance can consume it uniformly.
            principal: baseAmount,
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
        // Ver nota arriba sobre excluir cargos al numerar períodos (mismo bug, aplicado aquí solo
        // a la etiqueta de la cuota generada, no a fechas — impacto menor pero mismo origen).
        const isChargeInstallmentForSeq2 = (inst: any) =>
          Math.abs(inst.interest_amount || 0) < 0.01 && (inst.principal_amount || 0) > 0.01;
        const regularInstallmentsForSeq2 = installments.filter(i => !isChargeInstallmentForSeq2(i));
        const maxInstallmentNumber = regularInstallmentsForSeq2.length > 0
          ? Math.max(...regularInstallmentsForSeq2.map(i => i.installment_number))
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
            case 'monthly': {
              const periodDays2 =
                loan.payment_frequency === 'weekly' ? 7 :
                loan.payment_frequency === 'biweekly' ? 14 :
                loan.payment_frequency === 'daily' ? 1 : 30;
              const periodsOverdue2 = Math.ceil(daysOverdueForNext / periodDays2);
              lateFeeForNext = (baseAmount * loan.late_fee_rate / 100) * periodsOverdue2;
              break;
            }
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
