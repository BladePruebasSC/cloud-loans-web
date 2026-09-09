// Mora de una CARTERA entera, calculada igual que la de un préstamo suelto.
//
// FALLO REPORTADO (2026-09-09), dos síntomas del mismo origen:
//   · el inicio seguía sumando en "Mora acumulada" una mora ya condonada;
//   · la cobranza mostraba "RD$0.00" en préstamos que sí tenían mora.
//
// CAUSA: las dos pantallas leían `loans.current_late_fee`, una columna CACHEADA. Solo la
// escriben algunos flujos (registrar un pago, el barrido de mora, la configuración global), así
// que en un préstamo por el que no ha pasado ninguno se queda en 0 para siempre —de ahí el
// RD$0.00— y en otro conserva un importe viejo que ya no se debe. El resto de la aplicación
// (detalle del préstamo, estado de cuenta, cobro rápido) nunca la usa: calcula la mora desde las
// cuotas. Estas dos pantallas eran las que iban por libre.
//
// Aquí se calcula con el MISMO motor, `getLateFeeBreakdownFromInstallments`, sin volver a
// consultar la base: ambas pantallas ya traen las cuotas y los pagos para otras cosas.

import {
  getLateFeeBreakdownFromInstallments,
  type LoanData,
} from './installmentLateFeeCalculator';
import { getCurrentDateInSantoDomingo } from './dateUtils';
import { supabase } from '@/integrations/supabase/client';

export interface LateFeeLoanLike {
  id: string;
  amount?: number | null;
  remaining_balance?: number | null;
  next_payment_date?: string | null;
  start_date?: string | null;
  interest_rate?: number | null;
  monthly_payment?: number | null;
  term_months?: number | null;
  payment_frequency?: string | null;
  amortization_type?: string | null;
  late_fee_enabled?: boolean | null;
  late_fee_rate?: number | null;
  grace_period_days?: number | null;
  max_late_fee?: number | null;
  late_fee_calculation_type?: string | null;
}

/** Traduce una fila de `loans` a lo que espera el motor de mora. */
export const toLateFeeLoanData = (loan: LateFeeLoanLike): LoanData => ({
  id: String(loan.id),
  remaining_balance: Number(loan.remaining_balance) || 0,
  next_payment_date: String(loan.next_payment_date || ''),
  late_fee_rate: Number(loan.late_fee_rate) || 0,
  grace_period_days: Number(loan.grace_period_days) || 0,
  max_late_fee: Number(loan.max_late_fee) || 0,
  late_fee_calculation_type: (loan.late_fee_calculation_type || 'daily') as 'daily' | 'monthly' | 'compound',
  // Solo un `false` explícito desactiva la mora, igual que en el motor: un `undefined` (porque
  // la consulta no trajo la columna) no debe apagarla en silencio.
  late_fee_enabled: loan.late_fee_enabled !== false,
  amount: Number(loan.amount) || 0,
  term: Number(loan.term_months) || 0,
  payment_frequency: String(loan.payment_frequency || 'monthly'),
  interest_rate: Number(loan.interest_rate) || 0,
  monthly_payment: Number(loan.monthly_payment) || 0,
  start_date: loan.start_date ? String(loan.start_date) : undefined,
  amortization_type: loan.amortization_type ? String(loan.amortization_type) : undefined,
});

/**
 * Mora de cada préstamo, a partir de cuotas y pagos YA LEÍDOS. No hace ninguna consulta.
 *
 * Un préstamo sin cuotas cargadas no aparece en el mapa: quien llama decide qué hacer con él
 * (normalmente, dejar el valor que traiga la fila). Devolver 0 sería peor —haría desaparecer una
 * mora real solo porque no se pidieron sus cuotas—.
 */
export const computeLateFeesByLoan = async (
  loans: LateFeeLoanLike[],
  installmentsByLoan: Map<string, any[]>,
  paymentsByLoan: Map<string, any[]>,
  calculationDate: Date = getCurrentDateInSantoDomingo(),
): Promise<Map<string, number>> => {
  const result = new Map<string, number>();

  const entries = await Promise.all(
    loans.map(async (loan) => {
      const id = String(loan.id);
      if (loan.late_fee_enabled === false) return [id, 0] as const;

      const installments = installmentsByLoan.get(id);
      if (!installments || installments.length === 0) return null;

      try {
        const breakdown = await getLateFeeBreakdownFromInstallments(
          id,
          toLateFeeLoanData(loan),
          calculationDate,
          { installments, payments: paymentsByLoan.get(id) || [] },
        );
        return [id, Math.round((breakdown?.totalLateFee || 0) * 100) / 100] as const;
      } catch (error) {
        console.error('Error calculando la mora del préstamo', id, error);
        return null;
      }
    })
  );

  for (const entry of entries) {
    if (entry) result.set(entry[0], entry[1]);
  }
  return result;
};

/** Lee en bloques para no pasarse del largo de URL con carteras grandes. */
const CHUNK = 100;

/**
 * Igual que `computeLateFeesByLoan`, pero trayendo cuotas y pagos de la base.
 *
 * Para quien no los tiene ya cargados (la pantalla de cobranza). Un fallo de lectura NO devuelve
 * ceros: el préstamo se queda fuera del mapa y quien llama conserva el valor que traía, porque
 * enseñar RD$0.00 de mora por un error de red es peor que enseñar un dato viejo.
 */
export const fetchLateFeesForLoans = async (
  loans: LateFeeLoanLike[],
  calculationDate: Date = getCurrentDateInSantoDomingo(),
): Promise<Map<string, number>> => {
  const ids = loans.map(l => String(l.id)).filter(Boolean);
  if (ids.length === 0) return new Map();

  const installmentsByLoan = new Map<string, any[]>();
  const paymentsByLoan = new Map<string, any[]>();

  try {
    for (let i = 0; i < ids.length; i += CHUNK) {
      const slice = ids.slice(i, i + CHUNK);
      const [instRes, payRes] = await Promise.all([
        supabase.from('installments')
          .select('id, loan_id, installment_number, due_date, amount, total_amount, principal_amount, interest_amount, paid_amount, late_fee_paid, is_paid')
          .in('loan_id', slice),
        supabase.from('payments')
          .select('id, loan_id, amount, principal_amount, interest_amount, payment_date, due_date')
          .in('loan_id', slice),
      ]);

      if (instRes.error) throw instRes.error;
      if (payRes.error) throw payRes.error;

      for (const row of instRes.data || []) {
        const lid = String((row as any).loan_id || '');
        if (!lid) continue;
        const list = installmentsByLoan.get(lid);
        if (list) list.push(row); else installmentsByLoan.set(lid, [row]);
      }
      for (const row of payRes.data || []) {
        const lid = String((row as any).loan_id || '');
        if (!lid) continue;
        const list = paymentsByLoan.get(lid);
        if (list) list.push(row); else paymentsByLoan.set(lid, [row]);
      }
    }
  } catch (error) {
    console.error('Error leyendo cuotas/pagos para calcular la mora:', error);
    return new Map();
  }

  return computeLateFeesByLoan(loans, installmentsByLoan, paymentsByLoan, calculationDate);
};
