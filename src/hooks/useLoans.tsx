
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
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
  const { companyId } = useAuth();

  const fetchLoans = async () => {
    if (!companyId) return;

    try {
      const { data, error } = await supabase
        .from('loans')
        .select(`
          *,
          clients (
            full_name,
            dni
          )
        `)
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching loans:', error);
        toast.error('Error al cargar préstamos');
        return;
      }

      setLoans(data || []);
    } catch (error) {
      console.error('Error in fetchLoans:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (companyId) {
      fetchLoans();
    }
  }, [companyId]);

  return {
    loans,
    loading,
    refetch: fetchLoans,
  };
};
