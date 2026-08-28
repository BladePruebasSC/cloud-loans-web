import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { getLateFeeBreakdownFromInstallments } from '@/utils/installmentLateFeeCalculator';
import { getCurrentDateInSantoDomingo } from '@/utils/dateUtils';
import { formatDateLocalIso } from '@/utils/frequencyUtils';

export interface LateFeeCalculation {
  days_overdue: number;
  late_fee_amount: number;
  total_late_fee: number;
}

export interface LateFeeConfig {
  late_fee_rate: number;
  grace_period_days: number;
  max_late_fee: number;
  late_fee_calculation_type: 'daily' | 'monthly' | 'compound';
  late_fee_enabled: boolean;
}

export interface LateFeeHistory {
  id: string;
  loan_id: string;
  calculation_date: string;
  days_overdue: number;
  late_fee_rate: number;
  late_fee_amount: number;
  total_late_fee: number;
  created_at: string;
}

export const useLateFee = () => {
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  // Calcular mora para un préstamo específico
  //
  // CORRECCIÓN CRÍTICA (auditoría de cálculos): esta función llamaba antes a la función SQL
  // `recalculate_late_fee_from_scratch`, que calculaba la mora multiplicando la tasa por
  // `loans.remaining_balance` (el saldo de TODO el préstamo: capital + interés de todas las
  // cuotas pendientes, no solo de la vencida) y por los días de atraso de una única cuota
  // (`next_payment_date`). Eso podía inflar la mora varias veces por encima del valor correcto,
  // y además no coincidía con la mora que se muestra en el resto del sistema (estado de cuenta,
  // detalle de préstamo, formulario de cobro), que SÍ se calcula cuota por cuota. Ahora se usa la
  // misma función centralizada que esas pantallas para que el resultado sea siempre el mismo.
  // CORRECCIÓN (auditoría 2026-08-28): `calculationDate` se recibía pero NUNCA se pasaba a
  // `getLateFeeBreakdownFromInstallments`, así que pedir la mora "a una fecha dada" devolvía
  // silenciosamente la mora de hoy. Además el valor por defecto era `new Date()` (fecha del
  // equipo) en vez de la fecha de Santo Domingo que usa el resto del sistema.
  const calculateLateFee = async (
    loanId: string,
    calculationDate: Date = getCurrentDateInSantoDomingo()
  ): Promise<LateFeeCalculation | null> => {
    try {
      setLoading(true);

      const { data: loan, error: loanError } = await supabase
        .from('loans')
        .select('id, amount, remaining_balance, next_payment_date, start_date, term_months, payment_frequency, amortization_type, interest_rate, monthly_payment, late_fee_rate, grace_period_days, max_late_fee, late_fee_calculation_type, late_fee_enabled, status')
        .eq('id', loanId)
        .single();

      if (loanError || !loan) throw loanError || new Error('Préstamo no encontrado');
      if (loan.status !== 'active' && loan.status !== 'overdue') {
        return { days_overdue: 0, late_fee_amount: 0, total_late_fee: 0 };
      }

      const loanDataForCalculation = {
        id: loan.id,
        amount: loan.amount,
        interest_rate: loan.interest_rate,
        monthly_payment: loan.monthly_payment,
        remaining_balance: loan.remaining_balance,
        next_payment_date: loan.next_payment_date,
        start_date: loan.start_date,
        term_months: loan.term_months,
        term: loan.term_months,
        payment_frequency: loan.payment_frequency || 'monthly',
        late_fee_enabled: loan.late_fee_enabled || false,
        late_fee_rate: loan.late_fee_rate || 2.0,
        grace_period_days: loan.grace_period_days || 0,
        max_late_fee: loan.max_late_fee || 0,
        late_fee_calculation_type: loan.late_fee_calculation_type || 'daily',
        amortization_type: loan.amortization_type
      };

      const breakdown = await getLateFeeBreakdownFromInstallments(loanId, loanDataForCalculation as any, calculationDate);
      const daysOverdue = breakdown.breakdown.reduce((max, item) => Math.max(max, item.isPaid ? 0 : item.daysOverdue), 0);

      return {
        days_overdue: daysOverdue,
        late_fee_amount: breakdown.totalLateFee,
        total_late_fee: breakdown.totalLateFee
      };
    } catch (error) {
      console.error('Error calculating late fee:', error);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // Actualizar mora de todos los préstamos vencidos
  //
  // CORRECCIÓN CRÍTICA (auditoría de cálculos): esta función llamaba antes a la función SQL
  // `update_all_late_fees_from_scratch`, que sufría el mismo problema descrito arriba y además
  // ESCRIBÍA directamente `loans.current_late_fee` para todos los préstamos activos vencidos.
  // Ese valor incorrecto luego se filtraba a Notificaciones, Reportes ("mora acumulada") y al
  // listado de préstamos (como respaldo mientras carga el cálculo en vivo), produciendo montos de
  // mora distintos entre pantallas. Ahora se recalcula cada préstamo con la misma función
  // centralizada usada en el resto de la aplicación antes de guardar el resultado.
  const updateAllLateFees = async (
    calculationDate: Date = getCurrentDateInSantoDomingo()
  ): Promise<number> => {
    try {
      setLoading(true);

      // CORRECCIÓN (auditoría 2026-08-28): `toISOString()` convierte a UTC. En Santo Domingo
      // (UTC-4) cualquier ejecución después de las 20:00 registraba `last_late_fee_calculation`
      // y `late_fee_history.calculation_date` con la fecha del DÍA SIGUIENTE, descuadrando los
      // reportes de mora por día y provocando registros de historial duplicados/faltantes.
      const calcDateStr = formatDateLocalIso(calculationDate);

      const { data: loans, error: loansError } = await supabase
        .from('loans')
        .select('id, amount, remaining_balance, next_payment_date, start_date, term_months, payment_frequency, amortization_type, interest_rate, monthly_payment, late_fee_rate, grace_period_days, max_late_fee, late_fee_calculation_type, late_fee_enabled, status')
        .in('status', ['active', 'overdue'])
        .eq('late_fee_enabled', true);

      if (loansError) throw loansError;

      let updatedCount = 0;

      for (const loan of loans || []) {
        try {
          const loanDataForCalculation = {
            id: loan.id,
            amount: loan.amount,
            interest_rate: loan.interest_rate,
            monthly_payment: loan.monthly_payment,
            remaining_balance: loan.remaining_balance,
            next_payment_date: loan.next_payment_date,
            start_date: loan.start_date,
            term_months: loan.term_months,
            term: loan.term_months,
            payment_frequency: loan.payment_frequency || 'monthly',
            late_fee_enabled: loan.late_fee_enabled || false,
            late_fee_rate: loan.late_fee_rate || 2.0,
            grace_period_days: loan.grace_period_days || 0,
            max_late_fee: loan.max_late_fee || 0,
            late_fee_calculation_type: loan.late_fee_calculation_type || 'daily',
            amortization_type: loan.amortization_type
          };

          const breakdown = await getLateFeeBreakdownFromInstallments(loan.id, loanDataForCalculation as any, calculationDate);
          const daysOverdue = breakdown.breakdown.reduce((max, item) => Math.max(max, item.isPaid ? 0 : item.daysOverdue), 0);

          const newStatus =
            daysOverdue > 0 && loan.status === 'active'
              ? 'overdue'
              : daysOverdue === 0 && loan.status === 'overdue'
                ? 'active'
                : loan.status;

          const { error: updateError } = await supabase
            .from('loans')
            .update({
              current_late_fee: breakdown.totalLateFee,
              last_late_fee_calculation: calcDateStr,
              status: newStatus
            })
            .eq('id', loan.id);

          if (updateError) {
            console.error(`Error updating loan ${loan.id} late fee:`, updateError);
            continue;
          }

          if (breakdown.totalLateFee > 0) {
            await supabase.from('late_fee_history').insert({
              loan_id: loan.id,
              calculation_date: calcDateStr,
              days_overdue: daysOverdue,
              late_fee_rate: loan.late_fee_rate,
              late_fee_amount: breakdown.totalLateFee,
              total_late_fee: breakdown.totalLateFee
            });
          }

          updatedCount++;
        } catch (perLoanError) {
          console.error(`Error recalculando mora del préstamo ${loan.id}:`, perLoanError);
        }
      }

      return updatedCount;
    } catch (error) {
      console.error('Error updating late fees:', error);
      return 0;
    } finally {
      setLoading(false);
    }
  };

  // Obtener historial de mora de un préstamo
  const getLateFeeHistory = async (loanId: string): Promise<LateFeeHistory[]> => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('late_fee_history')
        .select('*')
        .eq('loan_id', loanId)
        .order('calculation_date', { ascending: false });

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error fetching late fee history:', error);
      return [];
    } finally {
      setLoading(false);
    }
  };

  // Actualizar configuración de mora de un préstamo
  const updateLateFeeConfig = async (
    loanId: string, 
    config: Partial<LateFeeConfig>
  ): Promise<boolean> => {
    try {
      setLoading(true);
      
      const { error } = await supabase
        .from('loans')
        .update(config)
        .eq('id', loanId);

      if (error) throw error;

      return true;
    } catch (error) {
      console.error('Error updating late fee config:', error);
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Obtener préstamos con mora
  const getLoansWithLateFee = async (): Promise<any[]> => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('loans')
        .select(`
          *,
          clients!inner(full_name, dni, phone),
          late_fee_history!inner(*)
        `)
        .eq('status', 'overdue')
        .gt('current_late_fee', 0)
        .order('current_late_fee', { ascending: false });

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error fetching loans with late fee:', error);
      return [];
    } finally {
      setLoading(false);
    }
  };

  // Calcular mora acumulada hasta una fecha específica
  const calculateAccumulatedLateFee = async (
    loanId: string,
    fromDate: Date,
    toDate: Date
  ): Promise<number> => {
    try {
      const { data, error } = await supabase
        .from('late_fee_history')
        .select('late_fee_amount')
        .eq('loan_id', loanId)
        .gte('calculation_date', fromDate.toISOString().split('T')[0])
        .lte('calculation_date', toDate.toISOString().split('T')[0]);

      if (error) throw error;

      return data?.reduce((sum, record) => sum + record.late_fee_amount, 0) || 0;
    } catch (error) {
      console.error('Error calculating accumulated late fee:', error);
      return 0;
    }
  };

  // Obtener estadísticas de mora
  const getLateFeeStatistics = async () => {
    try {
      setLoading(true);
      
      // Total de mora pendiente
      const { data: totalLateFee, error: totalError } = await supabase
        .from('loans')
        .select('current_late_fee')
        .eq('status', 'overdue')
        .gt('current_late_fee', 0);

      if (totalError) throw totalError;

      // Número de préstamos en mora
      const { data: overdueCount, error: countError } = await supabase
        .from('loans')
        .select('id', { count: 'exact' })
        .eq('status', 'overdue');

      if (countError) throw countError;

      // Mora promedio por préstamo
      const totalMora = totalLateFee?.reduce((sum, loan) => sum + loan.current_late_fee, 0) || 0;
      const promedioMora = overdueCount && overdueCount.length > 0 
        ? totalMora / overdueCount.length 
        : 0;

      return {
        totalLateFee: totalMora,
        overdueLoansCount: overdueCount?.length || 0,
        averageLateFee: promedioMora
      };
    } catch (error) {
      console.error('Error fetching late fee statistics:', error);
      return {
        totalLateFee: 0,
        overdueLoansCount: 0,
        averageLateFee: 0
      };
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    calculateLateFee,
    updateAllLateFees,
    getLateFeeHistory,
    updateLateFeeConfig,
    getLoansWithLateFee,
    calculateAccumulatedLateFee,
    getLateFeeStatistics
  };
};
