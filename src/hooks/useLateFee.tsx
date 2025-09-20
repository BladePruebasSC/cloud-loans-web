import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

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
  const calculateLateFee = async (
    loanId: string, 
    calculationDate: Date = new Date()
  ): Promise<LateFeeCalculation | null> => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase.rpc('calculate_late_fee', {
        p_loan_id: loanId,
        p_calculation_date: calculationDate.toISOString().split('T')[0]
      });

      if (error) throw error;

      return data && data.length > 0 ? data[0] : null;
    } catch (error) {
      console.error('Error calculating late fee:', error);
      return null;
    } finally {
      setLoading(false);
    }
  };

  // Actualizar mora de todos los préstamos vencidos
  const updateAllLateFees = async (
    calculationDate: Date = new Date()
  ): Promise<number> => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase.rpc('update_all_late_fees', {
        p_calculation_date: calculationDate.toISOString().split('T')[0]
      });

      if (error) throw error;

      return data || 0;
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
