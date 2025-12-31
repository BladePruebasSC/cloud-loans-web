import { useState, useEffect, useRef, useCallback } from 'react';
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

// Estado inicial: null indica que aún no se ha cargado (evita render con valores incorrectos)
const INITIAL_STATUS: PaymentStatus | null = null;

export const useLoanPaymentStatusSimple = (loan: Loan | null) => {
  // Cambiar a null inicial para evitar render con valores incorrectos
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | null>(INITIAL_STATUS);
  const [loading, setLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const loanIdRef = useRef<string | null>(null);

  // Memoizar fetchPaymentStatus para evitar recreaciones innecesarias
  const fetchPaymentStatus = useCallback(async () => {
    if (!loan) {
      setPaymentStatus(null);
      return;
    }

    // Cancelar fetch anterior si existe
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

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

      // Verificar si fue cancelado
      if (abortControllerRef.current?.signal.aborted) return;

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

      // Verificar si fue cancelado
      if (abortControllerRef.current?.signal.aborted) return;

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

      // Solo actualizar si el loanId sigue siendo el mismo (evita race conditions)
      if (loanIdRef.current === loan.id) {
        setPaymentStatus({
          currentPaymentDue,
          currentPaymentPaid,
          currentPaymentRemaining,
          isCurrentPaymentComplete,
          hasPartialPayments,
        });
      }
    } catch (error) {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('Error calculating payment status:', error);
      }
    } finally {
      if (loanIdRef.current === loan?.id) {
        setLoading(false);
      }
    }
  }, [loan]);

  useEffect(() => {
    if (loan && loan.monthly_payment > 0) {
      loanIdRef.current = loan.id;
      // NO inicializar con valores por defecto - esperar datos reales
      // Esto evita el render con valores incorrectos
      fetchPaymentStatus();
    } else {
      loanIdRef.current = null;
      setPaymentStatus(null);
      setLoading(false);
    }

    // Cleanup: cancelar fetch si el componente se desmonta o cambia el loan
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [loan?.id, loan?.monthly_payment, loan?.next_payment_date, fetchPaymentStatus]);

  // Retornar valores por defecto solo cuando paymentStatus es null (aún no cargado)
  // Esto evita que el componente renderice con valores incorrectos
  return {
    paymentStatus: paymentStatus || {
      currentPaymentDue: 0,
      currentPaymentPaid: 0,
      currentPaymentRemaining: 0,
      isCurrentPaymentComplete: false,
      hasPartialPayments: false,
    },
    loading,
    refetch: fetchPaymentStatus,
    isReady: paymentStatus !== null, // Flag para saber si los datos están listos
  };
};
