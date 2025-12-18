import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface Loan {
  id: string;
  amount: number;
  interest_rate: number;
  term_months: number;
  monthly_payment: number;
  remaining_balance: number;
  next_payment_date: string;
  status: string;
  start_date: string;
  loan_type: string;
  payment_frequency?: string; // Frecuencia de pago
  amortization_type?: string; // Tipo de amortización (simple, french, german, american, indefinite)
  
  // Campos de mora
  late_fee_enabled?: boolean;
  late_fee_rate?: number;
  grace_period_days?: number;
  max_late_fee?: number;
  late_fee_calculation_type?: 'daily' | 'monthly' | 'compound';
  current_late_fee?: number;
  last_late_fee_calculation?: string;
  total_late_fee_paid?: number;
  paid_installments?: number[];
  
  // Campos de eliminación
  deleted_at?: string;
  deleted_reason?: string;
  
  client?: {
    full_name: string;
    dni: string;
  };
}

export const useLoans = () => {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefetching, setIsRefetching] = useState(false);
  const { user, profile, companyId } = useAuth();

  const fetchLoans = async (isRefetch = false) => {
    if (!user || !companyId) {
      setLoading(false);
      return;
    }

    // Evitar requests duplicados
    if (isRefetch && isRefetching) {
      return;
    }

    try {
      if (isRefetch) {
        setIsRefetching(true);
      } else {
        setLoading(true);
      }

      let query = supabase
        .from('loans')
        .select(`
          *,
          client:client_id (
            id,
            full_name,
            dni
          )
        `);

      // Si es empleado, filtrar por la empresa del empleado
      if (profile?.is_employee && profile?.company_owner_id) {
        query = query.eq('loan_officer_id', profile.company_owner_id);
      } else {
        // Si es dueño, mostrar sus propios préstamos
        query = query.eq('loan_officer_id', user.id);
      }
      
      const { data, error } = await query;

      if (error) {
        if (typeof error.message === 'string' && error.message.indexOf('rate limit') > -1) {
          toast.error('Has superado el límite de peticiones. Intenta más tarde.');
        } else {
          toast.error('Error al cargar préstamos');
        }
        return;
      }

      // Ordenar préstamos: pendientes primero, luego por fecha de creación
      const sortedLoans = (data || []).sort((a, b) => {
        // Si uno es pendiente y el otro no, el pendiente va primero
        if (a.status === 'pending' && b.status !== 'pending') return -1;
        if (a.status !== 'pending' && b.status === 'pending') return 1;
        
        // Si ambos tienen el mismo status, ordenar por fecha de creación (más reciente primero)
        return new Date(b.created_at || b.start_date).getTime() - new Date(a.created_at || a.start_date).getTime();
      });
      
      setLoans(sortedLoans);
    } catch (error: any) {
      if (typeof error?.message === 'string') {
        toast.error(error.message);
      } else {
        toast.error('Error inesperado al cargar préstamos');
      }
    } finally {
      if (isRefetch) {
        setIsRefetching(false);
      } else {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (user && companyId) {
      fetchLoans();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, companyId]);

  return {
    loans,
    loading: loading || isRefetching,
    refetch: () => fetchLoans(true),
  };
};
