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
  client?: {
    full_name: string;
    dni: string;
  };
}

export const useLoans = () => {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, profile, companyId } = useAuth();

  const fetchLoans = async () => {
    if (!user || !companyId) {
      setLoading(false);
      return;
    }

    try {
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

      setLoans(data || []);
    } catch (error: any) {
      if (typeof error?.message === 'string') {
        toast.error(error.message);
      } else {
        toast.error('Error inesperado al cargar préstamos');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && profile !== undefined) {
      fetchLoans();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, profile, companyId]);

  return {
    loans,
    loading,
    refetch: fetchLoans,
  };
};
