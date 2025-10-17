import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { round2, approxZero } from '@/utils/numberUtils';

interface Payment {
  id: string;
  amount: number;
  due_date: string;
  status: string;
  payment_date: string;
}

interface Loan {
  id: string;
  monthly_payment: number;
  next_payment_date: string;
  remaining_balance: number;
}

interface PaymentStatus {
  currentPaymentDue: number;
  currentPaymentPaid: number;
  currentPaymentRemaining: number;
  isCurrentPaymentComplete: boolean;
  hasPartialPayments: boolean;
}

export const useLoanPaymentStatusSimple = (loan: Loan | null) => {
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>({
    currentPaymentDue: 0,
    currentPaymentPaid: 0,
    currentPaymentRemaining: 0,
    isCurrentPaymentComplete: false,
    hasPartialPayments: false,
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (loan && loan.monthly_payment > 0) {
      // Inicializar inmediatamente con valores por defecto
      const defaultStatus = {
        currentPaymentDue: loan.monthly_payment,
        currentPaymentPaid: 0,
        currentPaymentRemaining: loan.monthly_payment,
        isCurrentPaymentComplete: false,
        hasPartialPayments: false,
      };
      setPaymentStatus(defaultStatus);
      
      // Luego buscar pagos reales
      fetchPaymentStatus();
    }
  }, [loan?.id, loan?.monthly_payment, loan?.next_payment_date]);

  const fetchPaymentStatus = async () => {
    if (!loan) return;

    setLoading(true);
    try {
      console.log('Fetching payments for loan:', loan.id, 'next payment date:', loan.next_payment_date);
      
      // Obtener todos los pagos para este préstamo
      const { data: payments, error } = await supabase
        .from('payments')
        .select('id, amount, due_date, status, payment_date')
        .eq('loan_id', loan.id)
        .order('payment_date', { ascending: true });

      if (error) {
        console.error('Error fetching payments:', error);
        return;
      }

      console.log('All payments found:', payments);

      // Filtrar pagos que corresponden a la cuota actual
      const currentPayments = (payments || []).filter(payment => 
        payment.due_date === loan.next_payment_date
      );

      console.log('Current payments for date', loan.next_payment_date, ':', currentPayments);

      const currentPaymentDue = round2(loan.monthly_payment);
      const currentPaymentPaid = round2(currentPayments.reduce((sum, payment) => sum + payment.amount, 0));
      let currentPaymentRemaining = round2(currentPaymentDue - currentPaymentPaid);
      if (currentPaymentRemaining < 0) currentPaymentRemaining = 0;
      const isCurrentPaymentComplete = approxZero(currentPaymentRemaining);
      const hasPartialPayments = currentPayments.length > 0 && !isCurrentPaymentComplete;

      console.log('Payment Status Calculated:', {
        loanId: loan.id,
        nextPaymentDate: loan.next_payment_date,
        monthlyPayment: loan.monthly_payment,
        allPayments: payments,
        currentPayments,
        currentPaymentPaid,
        currentPaymentRemaining
      });

      setPaymentStatus({
        currentPaymentDue,
        currentPaymentPaid,
        currentPaymentRemaining,
        isCurrentPaymentComplete,
        hasPartialPayments,
      });
    } catch (error) {
      console.error('Error calculating payment status:', error);
    } finally {
      setLoading(false);
    }
  };

  return {
    paymentStatus,
    loading,
    refetch: fetchPaymentStatus,
  };
};
