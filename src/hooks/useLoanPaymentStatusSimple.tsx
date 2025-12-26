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
      
      // Primero, obtener la primera cuota/cargo pendiente para saber qué estamos pagando
      const { data: firstUnpaidInstallment, error: installmentError } = await supabase
        .from('installments')
        .select('due_date, total_amount, principal_amount, interest_amount')
        .eq('loan_id', loan.id)
        .eq('is_paid', false)
        .order('due_date', { ascending: true })
        .limit(1);

      if (installmentError) {
        console.error('Error fetching installments:', installmentError);
        return;
      }

      // Determinar el due_date a usar: si hay una cuota pendiente, usar su due_date, sino usar next_payment_date
      const targetDueDate = firstUnpaidInstallment && firstUnpaidInstallment.length > 0 
        ? firstUnpaidInstallment[0].due_date.split('T')[0]
        : loan.next_payment_date;

      // Determinar si es un cargo
      const isCharge = firstUnpaidInstallment && firstUnpaidInstallment.length > 0 &&
        firstUnpaidInstallment[0].interest_amount === 0 &&
        firstUnpaidInstallment[0].principal_amount === firstUnpaidInstallment[0].total_amount;

      // Obtener todos los pagos para este préstamo
      const { data: payments, error } = await supabase
        .from('payments')
        .select('id, amount, due_date, status, payment_date, principal_amount')
        .eq('loan_id', loan.id)
        .order('payment_date', { ascending: true });

      if (error) {
        console.error('Error fetching payments:', error);
        return;
      }

      console.log('All payments found:', payments);

      // Filtrar pagos que corresponden a la cuota/cargo actual (usar targetDueDate)
      const currentPayments = (payments || []).filter(payment => 
        payment.due_date === targetDueDate
      );

      console.log('Current payments for date', targetDueDate, ':', currentPayments);

      // Si es un cargo, usar el monto del cargo; si no, usar monthly_payment
      const currentPaymentDue = isCharge && firstUnpaidInstallment && firstUnpaidInstallment.length > 0
        ? firstUnpaidInstallment[0].total_amount
        : loan.monthly_payment;
      
      // Para cargos, sumar principal_amount; para cuotas regulares, sumar amount
      const currentPaymentPaid = currentPayments.reduce((sum, payment) => {
        if (isCharge) {
          return sum + (payment.principal_amount || payment.amount || 0);
        } else {
          return sum + payment.amount;
        }
      }, 0);
      
      const currentPaymentRemaining = Math.max(0, currentPaymentDue - currentPaymentPaid);
      const isCurrentPaymentComplete = currentPaymentRemaining === 0;
      const hasPartialPayments = currentPayments.length > 0 && !isCurrentPaymentComplete;

      console.log('Payment Status Calculated:', {
        loanId: loan.id,
        targetDueDate,
        isCharge,
        currentPaymentDue,
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
