// Utilidad para calcular mora usando cuotas de la tabla installments
import { getCurrentDateInSantoDomingo } from './dateUtils';
import {
  addPeriodsToDate,
  formatDateLocalIso,
  getFirstDueDateIso,
  getLateFeePeriodDays,
  parseIsoDateLocal,
} from './frequencyUtils';
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
    // CORRECCIÓN CRÍTICA (auditoría 2026-08-28): esta función NUNCA revisaba
    // `loan.late_fee_enabled`. El campo estaba declarado en la interfaz `LoanData` y todas
    // las pantallas se lo pasaban, pero el cálculo lo ignoraba por completo: un préstamo con
    // la mora DESACTIVADA seguía acumulando y mostrando mora en el estado de cuenta, el
    // detalle del préstamo, el formulario de cobro, el listado y las estadísticas. Solo
    // `useLateFee.updateAllLateFees` se salvaba porque filtraba por SQL antes de llamar.
    // Se trata `undefined` como "habilitado" para no romper a los llamadores que aún no
    // envían el campo (AccountStatement); solo un `false` explícito desactiva la mora.
    if (loan?.late_fee_enabled === false) {
      return { totalLateFee: 0, breakdown: [] };
    }

    console.log('🔍 getLateFeeBreakdownFromInstallments: Fecha de cálculo:', formatDateLocalIso(calculationDate));
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
    // CORRECCIÓN (auditoría 2026-08-28): faltaba `isCharge` en este tipo, aunque el código
    // más abajo lo escribe y lo lee (`breakdown.find(item => ... && !item.isCharge)`).
    // TypeScript lo reportaba como error; el build de Vite no hace type-check, así que el
    // fallo pasaba inadvertido.
    const breakdown: Array<{
      installment: number;
      dueDate: string;
      daysOverdue: number;
      principal: number;
      lateFee: number;
      isPaid: boolean;
      isCharge?: boolean;
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

    // ------------------------------------------------------------------------
    // CARGOS: asignación de pagos propia (corrección 2026-08-28)
    // ------------------------------------------------------------------------
    // Un cargo es una obligación independiente que puede compartir fecha con una cuota
    // regular. Antes, los pagos a cargos entraban al mismo mapa pago→cuota que el resto y
    // podían quedar asignados a la cuota regular de esa fecha (el `find` devolvía la primera
    // fila con ese due_date); además un abono PARCIAL a un cargo no reducía su monto en el
    // desglose. Ahora los pagos SIN interés cuya fecha coincide con un cargo se reparten
    // acumulativamente entre los cargos de esa fecha (mismo criterio que loanBalanceBreakdown
    // y el estado de cuenta), y el desglose reporta el monto RESTANTE del cargo.
    const isChargeRow = (inst: any) =>
      Math.abs(Number(inst?.interest_amount || 0)) < 0.01 && Number(inst?.principal_amount || 0) > 0.01;
    const dateOnly = (d: any) => String(d || '').split('T')[0];
    const chargeRowsSorted = installments
      .filter(isChargeRow)
      .sort((a, b) => dateOnly(a.due_date).localeCompare(dateOnly(b.due_date)) || (a.installment_number || 0) - (b.installment_number || 0));
    const chargeDueDates = new Set(chargeRowsSorted.map(c => dateOnly(c.due_date)));
    const isChargePayment = (p: any) =>
      !!p?.due_date && chargeDueDates.has(dateOnly(p.due_date)) && Math.abs(Number(p.interest_amount || 0)) < 0.01;

    const chargePaidById = new Map<string, number>();
    {
      const paidByChargeDue = new Map<string, number>();
      for (const p of payments || []) {
        if (!isChargePayment(p)) continue;
        const due = dateOnly(p.due_date);
        paidByChargeDue.set(due, (paidByChargeDue.get(due) || 0) + (Number(p.principal_amount) || Number(p.amount) || 0));
      }
      for (const ch of chargeRowsSorted) {
        const due = dateOnly(ch.due_date);
        const total = Number(ch.total_amount ?? ch.amount ?? ch.principal_amount ?? 0);
        const available = paidByChargeDue.get(due) || 0;
        const applied = Math.min(available, total);
        chargePaidById.set(ch.id, applied);
        paidByChargeDue.set(due, available - applied);
      }
    }

    // ------------------------------------------------------------------------
    // INDEFINIDOS: rejilla de períodos y asignación real de pagos (2026-08-29)
    // ------------------------------------------------------------------------
    // Antes, el estado de las cuotas de interés se decidía con el atajo
    // "due_date < next_payment_date ⇒ pagada". `next_payment_date` lo calcula un trigger
    // como `primera_cuota + FLOOR(interés_pagado / cuota)` períodos, y los pagos de CARGOS
    // desalinean ese conteo: basta un cargo cobrado para que la fecha salte varios períodos
    // hacia adelante y TODO lo anterior quede marcado como pagado. Esos períodos vencidos
    // desaparecían del desglose y el panel "Balance de interés por antigüedad" volcaba su
    // importe al rango "Al día" (vía la reconciliación con "Interés pend. hoy").
    //
    // Ahora se construye la rejilla real de períodos (desde la primera cuota hasta el primero
    // que aún no vence) y se reparten los pagos de interés sobre ella en orden cronológico,
    // igual que hace loanBalanceBreakdown.ts. Determinista y sin depender de columnas derivadas.
    const indefinitePeriods = (() => {
      if (!isIndefinite || !loan.start_date) return null;
      const frequency = loan.payment_frequency || 'monthly';
      const first = parseIsoDateLocal(getFirstDueDateIso(String(loan.start_date).split('T')[0], frequency));
      if (!first) return null;
      const todayIso = formatDateLocalIso(calculationDate);
      const dates: string[] = [];
      for (let n = 0; n < 100000; n++) { // tope de seguridad
        const iso = formatDateLocalIso(addPeriodsToDate(first, n, frequency));
        dates.push(iso);
        if (iso > todayIso) break; // incluye el primer período que aún no vence
      }
      const nonCharges = installments.filter(i => !isChargeRow(i));
      const lastNonCharge = nonCharges[nonCharges.length - 1];
      const base = Number(
        lastNonCharge?.interest_amount || lastNonCharge?.total_amount || lastNonCharge?.amount || loan.monthly_payment || 0
      );
      return { frequency, first, dates, base };
    })();

    /** Interés efectivamente pagado de cada período (0..base). */
    const paidPerPeriod = new Map<string, number>();
    if (indefinitePeriods && indefinitePeriods.base > 0.01) {
      const base = indefinitePeriods.base;
      const gridDates = new Set(indefinitePeriods.dates);
      let pool = 0; // pagos de interés cuyo due_date no cae en ningún período (fechas "clamp", etc.)
      for (const p of payments || []) {
        if (isChargePayment(p)) continue; // los abonos a cargos no son interés
        const interestField = Number(p.interest_amount || 0);
        const amt = Number(p.amount || 0);
        const value = interestField > 0.01
          ? interestField
          : (amt > 0.01 && amt <= base * 1.25 ? amt : 0);
        if (value <= 0.01) continue;
        const due = dateOnly(p.due_date);
        if (due && gridDates.has(due)) paidPerPeriod.set(due, (paidPerPeriod.get(due) || 0) + value);
        else pool += value;
      }
      // Cascada cronológica: cada período se cubre hasta `base`; el excedente pasa al siguiente.
      let carry = pool;
      for (const d of indefinitePeriods.dates) {
        let paid = paidPerPeriod.get(d) || 0;
        if (paid > base) {
          carry += paid - base;
          paid = base;
        } else if (carry > 0.01 && paid < base) {
          const take = Math.min(carry, base - paid);
          paid += take;
          carry -= take;
        }
        paidPerPeriod.set(d, Math.round(paid * 100) / 100);
      }
    }

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
          // CORRECCIÓN (auditoría 2026-08-28): antes se comparaba con
          // `new Date(x).toISOString().split('T')[0]`. Cuando la BD devuelve un timestamp sin
          // zona ('2025-03-02T00:00:00'), JS lo interpreta como medianoche LOCAL y `toISOString`
          // lo pasa a UTC: en cualquier equipo con zona horaria positiva el día retrocedía uno,
          // y los pagos dejaban de emparejar con su cuota (la cuota quedaba "impaga" y generaba
          // mora ya cobrada). Se comparan las fechas como texto, que es lo que hace el resto
          // de la aplicación.
          const paymentDueDate = String(payment.due_date).split('T')[0];
          // Los pagos a CARGOS ya fueron repartidos arriba (chargePaidById): no deben entrar
          // al mapa pago→cuota ni "pagar" la cuota regular que comparte fecha con el cargo.
          if (isChargePayment(payment)) {
            assignedPaymentIds.add(payment.id);
            continue;
          }
          const matchingInstallment = installments.find(
            inst => !isChargeRow(inst) && String(inst.due_date || '').split('T')[0] === paymentDueDate
          );
          
          if (matchingInstallment) {
            assignedPaymentIds.add(payment.id);
            paymentToInstallmentMap.set(payment.id, matchingInstallment.installment_number);
            console.log(`🔍 getLateFeeBreakdownFromInstallments: Asignación por due_date - Cuota ${matchingInstallment.installment_number} → Pago del ${payment.payment_date} (RD$${payment.amount}, due_date: ${payment.due_date})`);
          }
        }
      }
      
      // SEGUNDO: Asignar pagos restantes (sin due_date o sin coincidencia) en CASCADA.
      // IMPORTANTE: En préstamos indefinidos NO hacemos asignación secuencial, porque rompería el “pago parcial” (saltaría de cuota).
      //
      // CORRECCIÓN (auditoría 2026-08-28): la asignación anterior entregaba COMO MÁXIMO UN PAGO
      // POR CUOTA (`unassignedIdx++` una sola vez por cuota). Si un cliente abonaba dos veces
      // sobre la misma cuota —un pago parcial y luego el resto—, el segundo abono se asignaba a
      // la cuota SIGUIENTE. Consecuencias: la cuota 1 seguía figurando como impaga y acumulando
      // mora pese a estar saldada, y la cuota 2 aparecía "parcialmente pagada" con dinero que
      // nunca fue suyo. El error se propagaba en cascada a todas las cuotas posteriores.
      //
      // Ahora se reparte en cascada: se van asignando pagos a la MISMA cuota hasta cubrir su
      // monto esperado, y solo entonces se pasa a la siguiente. Se tiene en cuenta lo que ya
      // aportó la asignación por `due_date` de la primera pasada.
      if (!isIndefinite) {
        const unassignedPayments = sortedPayments.filter(p => !assignedPaymentIds.has(p.id));

        // Cuánto quedó ya cubierto de cada cuota por la asignación por due_date
        const coveredByInstallment = new Map<number, number>();
        for (const [paymentId, instNum] of paymentToInstallmentMap.entries()) {
          const p = payments.find(x => x.id === paymentId);
          coveredByInstallment.set(instNum, (coveredByInstallment.get(instNum) || 0) + (p?.amount || 0));
        }

        let unassignedIdx = 0;
        for (const installment of installments) {
          if (unassignedIdx >= unassignedPayments.length) break;

          const expectedTotal = Number(
            installment.total_amount ??
            ((installment.principal_amount || 0) + (installment.interest_amount || 0))
          );
          let covered = coveredByInstallment.get(installment.installment_number) || 0;

          // Seguir asignando pagos a ESTA cuota hasta cubrirla
          while (unassignedIdx < unassignedPayments.length && covered + 0.01 < expectedTotal) {
            const payment = unassignedPayments[unassignedIdx];
            assignedPaymentIds.add(payment.id);
            paymentToInstallmentMap.set(payment.id, installment.installment_number);
            covered += payment.amount || 0;
            unassignedIdx++;
            console.log(`🔍 getLateFeeBreakdownFromInstallments: Asignación en cascada - Cuota ${installment.installment_number} → Pago del ${payment.payment_date} (RD$${payment.amount}); cubierto ${covered}/${expectedTotal}`);
          }
        }
      }
    }
    
    // Si no hay pagos reales, no aplicar next_payment_date como "corte de pagados"
    const hasAnyPayments = payments && payments.length > 0;

    // Procesar cada cuota de la base de datos
    for (const installment of installments) {
      let daysOverdue = 0;
      let lateFee = 0;
      
      const thisRowIsCharge = isChargeRow(installment);

      // SIEMPRE calcular el total pagado para verificar si realmente está pagada completamente
      // Incluso si installment.is_paid es true en la BD, puede que no esté completamente pagada.
      // Los CARGOS usan su propia asignación acumulada (chargePaidById); las cuotas regulares,
      // el mapa pago→cuota.
      // En indefinidos, si la fila cae en la rejilla de períodos usamos la asignación real
      // de pagos de ese período (determinista, no depende de next_payment_date).
      const periodPaid = (isIndefinite && !thisRowIsCharge && paidPerPeriod.size > 0)
        ? paidPerPeriod.get(dateOnly(installment.due_date))
        : undefined;

      let totalPaidForInstallment = 0;
      if (thisRowIsCharge) {
        totalPaidForInstallment = chargePaidById.get(installment.id) || 0;
      } else if (periodPaid !== undefined) {
        totalPaidForInstallment = periodPaid;
      } else if (paymentToInstallmentMap.size > 0) {
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
      // Los cargos NO usan este ajuste: un cargo se considera pagado solo cuando los pagos lo cubren.
      const effectiveInstallmentTotalAmount = (isIndefinite && !thisRowIsCharge)
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
      //
      // CORRECCIÓN (2026-08-28): este atajo NUNCA debe aplicar a CARGOS. `next_payment_date`
      // solo rastrea las cuotas de interés; un cargo con fecha anterior a la próxima cuota
      // sigue debiéndose. Antes, al registrar el PRIMER pago del préstamo, todos los cargos
      // con fecha < next_payment_date se marcaban como pagados de golpe: el "Balance de
      // capital por antigüedad" caía (ej. de 7,500 a 2,500 tras abonar 1,000) y la mora de
      // esos cargos desaparecía.
      // (El atajo por `next_payment_date` se eliminó: ver la nota de la rejilla de períodos
      //  más arriba. El estado de cada cuota de interés lo decide la asignación de pagos.)

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
          // ya que principal_amount es 0.
          // CORRECCIÓN (auditoría 2026-08-28): la comparación era `principal_amount === 0`
          // (estricta). Postgres devuelve las columnas `numeric` como string o como `null`,
          // así que `"0" === 0` y `null === 0` son ambos `false`: en préstamos indefinidos la
          // condición nunca se cumplía y la mora se calculaba sobre `principal_amount` (que
          // vale 0) → mora 0 en todas las cuotas regulares de un indefinido. Se normaliza
          // a número antes de comparar.
          const baseAmount = isIndefinite && Number(installment.principal_amount || 0) < 0.01
            ? (installment.interest_amount || installment.total_amount || installment.amount || 0)
            : (installment.principal_amount || installment.total_amount || installment.amount || 0);

          switch (loan.late_fee_calculation_type) {
            case 'daily':
              lateFee = (baseAmount * loan.late_fee_rate / 100) * daysOverdue;
              break;
            case 'monthly': {
              // Usar el largo del período según la frecuencia de pago, no siempre 30 días
              const periodDays = getLateFeePeriodDays(loan.payment_frequency);
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
      const isCharge = thisRowIsCharge;

      // SIEMPRE agregar la cuota al desglose (pagada o pendiente)
      // Normalize dueDate to YYYY-MM-DD to avoid timestamp mismatch issues
      const normalizedDueDate = String(installment.due_date || '').split('T')[0];
      breakdown.push({
        installment: installment.installment_number,
        dueDate: normalizedDueDate,
        daysOverdue,
        // For regular indefinite cuotas (not CARGOs): principal_amount is 0, but interest_amount
        // is the per-period payment. Store the interest amount so aging balance can display it.
        // CARGOs: monto RESTANTE del cargo (total − abonos), para que un pago parcial se refleje
        // en el balance por antigüedad y cuadre con "Cargos pendientes".
        principal: isCharge
          ? Math.round(Math.max(0, (installmentTotalAmount || 0) - totalPaidForInstallment) * 100) / 100
          : isIndefinite
            // Interés RESTANTE del período: así un pago parcial se refleja en la antigüedad.
            ? Math.round(Math.max(0, (Number(installment.interest_amount || installment.total_amount || 0)) - totalPaidForInstallment) * 100) / 100
            : installment.principal_amount,
        lateFee: isActuallyPaid ? 0 : lateFee,
        isPaid: isActuallyPaid,
        isCharge
      });
    }
    
    // CORRECCIÓN: Para préstamos indefinidos, generar dinámicamente todas las cuotas vencidas
    // desde la primera no pagada hasta hoy
    if (loan.amortization_type === 'indefinite' && loan.start_date && loan.next_payment_date) {
      // CORRECCIÓN CRÍTICA (2026-08-29): la generación dinámica es POR FECHA, nunca por número
      // de cuota. Antes se generaba desde `max(installment_number regular) + 1` calculando la
      // fecha como `primera_cuota + (N−1) períodos`. Pero los CARGOS roban números de la
      // secuencia (`installment_number = max(TODOS) + 1` en add_charge), así que los números de
      // las cuotas regulares quedan con huecos y desalineados de sus períodos reales: los
      // períodos cuyos números se llevó un cargo NUNCA se generaban. Su interés desaparecía del
      // desglose y el panel "Balance de interés por antigüedad" lo volcaba al rango "Al día"
      // (vía la reconciliación con "Interés pend. hoy"), aunque la cuota estuviera vencida.
      // Ahora se recorre CADA período desde la primera cuota hasta hoy y se genera todo período
      // cuya fecha no tenga ya una cuota regular en el desglose; el número es el ordinal del
      // período (1, 2, 3…), independiente de los installment_number de la BD.

      // La rejilla de períodos y el reparto de pagos ya se calcularon arriba (indefinitePeriods
      // / paidPerPeriod). Incluye el primer período que aún NO vence, de modo que el desglose
      // cubra exactamente lo mismo que "Interés pend. hoy" y el panel de antigüedad no tenga
      // que inventar nada: cada importe cae en su rango real.
      if (!indefinitePeriods) {
        console.warn('getLateFeeBreakdownFromInstallments: start_date inválido:', loan.start_date);
        return { totalLateFee, breakdown };
      }
      const baseAmount = indefinitePeriods.base;

      console.log(`🔍 getLateFeeBreakdownFromInstallments: Generación dinámica - baseAmount=${baseAmount}, períodos=${indefinitePeriods.dates.length}`);

      for (let idx = 0; idx < indefinitePeriods.dates.length; idx++) {
        const installmentNum = idx + 1;
        const dueDateStr = indefinitePeriods.dates[idx];
        const installmentDate = parseIsoDateLocal(dueDateStr)!;

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
          // Estado del período según los pagos realmente asignados (ver rejilla arriba).
          // `remainingInterest` permite que un pago PARCIAL se refleje en la antigüedad.
          const periodPaidHere = paidPerPeriod.get(dueDateStr) || 0;
          const remainingInterest = Math.round(Math.max(0, baseAmount - periodPaidHere) * 100) / 100;
          const isPaid = remainingInterest <= 0.01;

          const daysSinceDue = Math.floor((calculationDate.getTime() - installmentDate.getTime()) / (1000 * 60 * 60 * 24));
          const daysOverdueForInstallment = Math.max(0, daysSinceDue - (loan.grace_period_days || 0));
          
          let lateFeeForInstallment = 0;
          // Solo calcular mora si la cuota NO está pagada y está vencida
          if (!isPaid && daysOverdueForInstallment > 0 && baseAmount > 0) {
            switch (loan.late_fee_calculation_type) {
              case 'daily':
                lateFeeForInstallment = (baseAmount * loan.late_fee_rate / 100) * daysOverdueForInstallment;
                break;
              // (baseAmount = interés íntegro del período: la mora se calcula sobre la obligación
              //  original, no sobre el saldo tras un abono parcial.)
              case 'monthly': {
                // CORRECCIÓN (auditoría 2026-08-28): aquí estaba fijo en "/30" mientras que la
                // rama que procesa las cuotas guardadas en la BD (unas líneas más arriba) ya
                // usaba el largo real del período según la frecuencia. En un mismo préstamo
                // indefinido diario/semanal/quincenal, las cuotas de la BD y las generadas
                // dinámicamente aplicaban DOS fórmulas de mora distintas: la mora de un
                // préstamo diario con 30 días de atraso salía como 1 período en vez de 30.
                const periodsOverdue = Math.ceil(daysOverdueForInstallment / getLateFeePeriodDays(loan.payment_frequency));
                lateFeeForInstallment = (baseAmount * loan.late_fee_rate / 100) * periodsOverdue;
                break;
              }
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
            // Interés RESTANTE del período (base − pagado), para que el balance por antigüedad
            // refleje los abonos parciales y su total coincida con "Interés pend. hoy".
            principal: remainingInterest,
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
      // Para préstamos no indefinidos, mantener la lógica original.
      // CORRECCIÓN (auditoría 2026-08-28): se parseaba `loan.next_payment_date` con
      // `.split('-')` SIN quitar antes la parte horaria. Si la BD devolvía un timestamp
      // ('2025-03-02T00:00:00'), el "día" quedaba en NaN → `new Date(y, m, NaN)` = Invalid Date
      // → `daysSinceNextPayment` = NaN → la condición `> 0` era falsa y la cuota vencida
      // simplemente NO se generaba: mora silenciosamente en 0.
      const nextPaymentDateIso = String(loan.next_payment_date).split('T')[0];
      const nextPaymentDate = parseIsoDateLocal(nextPaymentDateIso);
      const daysSinceNextPayment = nextPaymentDate
        ? Math.floor((calculationDate.getTime() - nextPaymentDate.getTime()) / (1000 * 60 * 60 * 24))
        : 0;

      // Verificar si ya existe una cuota con esta fecha en el breakdown.
      // CORRECCIÓN (auditoría 2026-08-28): se comparaba contra `loan.next_payment_date` sin
      // normalizar, mientras que las fechas del breakdown SÍ están normalizadas a 'YYYY-MM-DD'.
      // Con un timestamp en la BD nunca coincidían y se generaba una cuota DUPLICADA que
      // sumaba su mora otra vez al total.
      const existingInstallment = breakdown.find(item => item.dueDate === nextPaymentDateIso);

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
              const periodsOverdue2 = Math.ceil(daysOverdueForNext / getLateFeePeriodDays(loan.payment_frequency));
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
          dueDate: nextPaymentDateIso, // normalizado, igual que el resto del breakdown
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
