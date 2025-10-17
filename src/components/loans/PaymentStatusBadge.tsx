import React, { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { round2, approxZero, formatMoney } from '@/utils/numberUtils';

interface PaymentStatusBadgeProps {
  loanId: string;
  monthlyPayment: number;
  nextPaymentDate: string;
  remainingBalance: number;
}

interface PaymentStatus {
  currentPaymentDue: number;
  currentPaymentPaid: number;
  currentPaymentRemaining: number;
  isCurrentPaymentComplete: boolean;
  hasPartialPayments: boolean;
}

export const PaymentStatusBadge: React.FC<PaymentStatusBadgeProps> = ({
  loanId,
  monthlyPayment,
  nextPaymentDate,
  remainingBalance,
}) => {
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>({
    currentPaymentDue: monthlyPayment,
    currentPaymentPaid: 0,
    currentPaymentRemaining: monthlyPayment,
    isCurrentPaymentComplete: false,
    hasPartialPayments: false,
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchPaymentStatus();
  }, [loanId, nextPaymentDate]);

  const fetchPaymentStatus = async () => {
    setLoading(true);
    try {
      // Obtener todos los pagos para este préstamo
      const { data: payments, error } = await supabase
        .from('payments')
        .select('id, amount, due_date, status, payment_date')
        .eq('loan_id', loanId)
        .order('payment_date', { ascending: true });

      if (error) {
        console.error('Error fetching payments:', error);
        return;
      }

      // Filtrar pagos que corresponden a la cuota actual
      const currentPayments = (payments || []).filter(payment => 
        payment.due_date === nextPaymentDate
      );

      const currentPaymentDue = round2(monthlyPayment);
      const currentPaymentPaid = round2(currentPayments.reduce((sum, payment) => sum + payment.amount, 0));
      let currentPaymentRemaining = round2(currentPaymentDue - currentPaymentPaid);
      if (currentPaymentRemaining < 0) currentPaymentRemaining = 0;
      const isCurrentPaymentComplete = approxZero(currentPaymentRemaining);
      const hasPartialPayments = currentPayments.length > 0 && !isCurrentPaymentComplete;

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

  if (loading) {
    return <Badge variant="outline">Cargando...</Badge>;
  }

  if (paymentStatus.hasPartialPayments) {
    return (
      <div className="flex flex-col gap-1">
          <Badge variant="secondary" className="text-xs">
          Pagado: ${formatMoney(paymentStatus.currentPaymentPaid)}
        </Badge>
        <Badge variant="destructive" className="text-xs">
          Falta: ${formatMoney(paymentStatus.currentPaymentRemaining)}
        </Badge>
      </div>
    );
  }

  if (paymentStatus.isCurrentPaymentComplete) {
    return <Badge variant="default">Completo</Badge>;
  }

  return (
    <Badge variant="outline" className="text-xs">
      Falta: ${formatMoney(paymentStatus.currentPaymentRemaining)}
    </Badge>
  );
};
