import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

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

export const useLoanPaymentStatus = (loan: Loan | null) => {
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>({
    currentPaymentDue: 0,
    currentPaymentPaid: 0,
    currentPaymentRemaining: 0,
    isCurrentPaymentComplete: false,
    hasPartialPayments: false,
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (loan) {
      // Inicializar con valores por defecto
      setPaymentStatus({
        currentPaymentDue: loan.monthly_payment,
        currentPaymentPaid: 0,
        currentPaymentRemaining: loan.monthly_payment,
        isCurrentPaymentComplete: false,
        hasPartialPayments: false,
      });
      fetchPaymentStatus();
    }
  }, [loan]);

  const fetchPaymentStatus = async () => {
    if (!loan) return;

    setLoading(true);
    try {
      // Obtener todos los pagos para este préstamo
      const { data: payments, error } = await supabase
        .from('payments')
        .select('id, amount, due_date, status, payment_date')
        .eq('loan_id', loan.id)
        .order('payment_date', { ascending: true });

      if (error) {
        console.error('Error fetching payments:', error);
        // En caso de error, mantener valores por defecto
        setPaymentStatus({
          currentPaymentDue: loan.monthly_payment,
          currentPaymentPaid: 0,
          currentPaymentRemaining: loan.monthly_payment,
          isCurrentPaymentComplete: false,
          hasPartialPayments: false,
        });
        return;
      }

      // Filtrar pagos que corresponden a la cuota actual
      // La cuota actual es la que tiene la fecha de vencimiento igual a next_payment_date
      const currentPayments = (payments || []).filter(payment => 
        payment.due_date === loan.next_payment_date
      );

      const currentPaymentDue = loan.monthly_payment;
      const currentPaymentPaid = currentPayments.reduce((sum, payment) => sum + payment.amount, 0);
      const currentPaymentRemaining = Math.max(0, currentPaymentDue - currentPaymentPaid);
      const isCurrentPaymentComplete = currentPaymentRemaining === 0;
      const hasPartialPayments = currentPayments.length > 0 && !isCurrentPaymentComplete;

      console.log('Payment Status Debug:', {
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
      // En caso de error, mantener valores por defecto
      setPaymentStatus({
        currentPaymentDue: loan.monthly_payment,
        currentPaymentPaid: 0,
        currentPaymentRemaining: loan.monthly_payment,
        isCurrentPaymentComplete: false,
        hasPartialPayments: false,
      });
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
