import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  MoreHorizontal, 
  Eye, 
  Edit, 
  Trash2, 
  Printer, 
  Download,
  User,
  DollarSign,
  Receipt,
  X,
  MessageCircle
} from 'lucide-react';
import { generateLoanPaymentReceipt, openWhatsApp, formatPhoneForWhatsApp } from '@/utils/whatsappReceipt';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { getLateFeeBreakdownFromInstallments } from '@/utils/installmentLateFeeCalculator';
import { PasswordVerificationDialog } from '@/components/common/PasswordVerificationDialog';

interface Payment {
  id: string;
  amount: number;
  principal_amount: number;
  interest_amount: number;
  late_fee: number;
  payment_date: string;
  due_date: string;
  payment_method: string;
  reference_number?: string;
  notes?: string;
  status: string;
  created_at: string;
  loan_id: string;
}

interface Loan {
  id: string;
  amount: number;
  interest_rate: number;
  term_months: number;
  client: {
    full_name: string;
    dni: string;
    phone?: string;
    address?: string;
  };
}

interface CompanySettings {
  company_name: string;
  business_type?: string;
  tax_id?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
  logo_url?: string;
  website?: string;
}

interface PaymentActionsProps {
  payment: Payment;
  onPaymentUpdated?: () => void;
  loanStatus?: string; // Estado del préstamo para validar si se puede eliminar
}

// Función para traducir el método de pago en las notas
const translatePaymentNotes = (notes: string) => {
  if (!notes) return notes;
  
  // Si las notas contienen "Cobro rápido - [método]", traducir el método
  const quickCollectionPattern = /Cobro rápido\s*-\s*(\w+)/i;
  const match = notes.match(quickCollectionPattern);
  
  if (match) {
    const method = match[1].toLowerCase();
    const methodTranslations: { [key: string]: string } = {
      'cash': 'Efectivo',
      'bank_transfer': 'Transferencia Bancaria',
      'check': 'Cheque',
      'card': 'Tarjeta',
      'online': 'Pago en línea'
    };
    
    const translatedMethod = methodTranslations[method] || method;
    return notes.replace(quickCollectionPattern, `Cobro rápido - ${translatedMethod}`);
  }
  
  return notes;
};

export const PaymentActions: React.FC<PaymentActionsProps> = ({ 
  payment, 
  onPaymentUpdated,
  loanStatus
}) => {
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showPrintFormatModal, setShowPrintFormatModal] = useState(false);
  const [showPasswordVerification, setShowPasswordVerification] = useState(false);
  const [loan, setLoan] = useState<Loan | null>(null);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [isLatestPayment, setIsLatestPayment] = useState(false);
  const [hasLaterCapitalPayment, setHasLaterCapitalPayment] = useState(false);
  const [forceDelete, setForceDelete] = useState(false);

  // Verificar si este pago es el último del préstamo y si hay abonos a capital posteriores
  useEffect(() => {
    const checkIfLatestPayment = async () => {
      try {
        console.log('🔍 Verificando último pago para:', payment.id);

        const { data: allPayments, error } = await supabase
          .from('payments')
          .select('id, created_at')
          .eq('loan_id', payment.loan_id)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false }); // Ordenar también por ID para consistencia

        if (error) {
          console.error('🔍 Error verificando último pago:', error);
          setIsLatestPayment(false);
          return;
        }

        if (allPayments && allPayments.length > 0) {
          const latestPaymentId = allPayments[0].id;
          const isLatest = latestPaymentId === payment.id;

          console.log('🔍 Resultado:', {
            currentPaymentId: payment.id,
            latestPaymentId: latestPaymentId,
            totalPayments: allPayments.length,
            isLatest: isLatest
          });

          setIsLatestPayment(isLatest);
        } else {
          console.log('🔍 No hay pagos encontrados');
          setIsLatestPayment(false);
        }

        // Verificar si existe algún abono a capital posterior a este pago
        const paymentDate = (payment.payment_date as string)?.split('T')[0] || payment.payment_date;
        if (paymentDate) {
          const { data: laterCapital } = await supabase
            .from('capital_payments')
            .select('id')
            .eq('loan_id', payment.loan_id)
            .gt('created_at', paymentDate)
            .limit(1);
          setHasLaterCapitalPayment(!!(laterCapital && laterCapital.length > 0));
        }
      } catch (error) {
        console.error('🔍 Error en verificación:', error);
        setIsLatestPayment(false);
      }
    };

    checkIfLatestPayment();
    
    // Verificar nuevamente cada 5 segundos para detectar cambios
    const interval = setInterval(checkIfLatestPayment, 5000);
    
    return () => clearInterval(interval);
  }, [payment.id, payment.loan_id]);



  const fetchLoanDetails = async () => {
    try {
      const { data, error } = await supabase
        .from('loans')
        .select(`
          id,
          amount,
          interest_rate,
          term_months,
          client:client_id (
            full_name,
            dni,
            phone,
            address
          )
        `)
        .eq('id', payment.loan_id)
        .single();

      if (error) throw error;
      
      const transformedData = {
        ...data,
        client: {
          full_name: (data.client as any)?.full_name || '',
          dni: (data.client as any)?.dni || '',
          phone: (data.client as any)?.phone || '',
          address: (data.client as any)?.address || ''
        }
      };
      setLoan(transformedData);
    } catch (error) {
      console.error('Error fetching loan details:', error);
      toast.error('Error al cargar detalles del préstamo');
    }
  };

  const fetchCompanySettings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('company_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching company settings:', error);
        return;
      }

      if (data) {
        setCompanySettings(data);
      }
    } catch (error) {
      console.error('Error in fetchCompanySettings:', error);
    }
  };

  const handleViewReceipt = async () => {
    if (!loan) {
      setLoading(true);
      await fetchLoanDetails();
      setLoading(false);
    }
    if (!companySettings) {
      await fetchCompanySettings();
    }
    setShowReceiptModal(true);
  };


  const handleDelete = async () => {
    try {
      setLoading(true);
      
      console.log('🗑️ ELIMINACIÓN DEL PAGO - Iniciando...');
      console.log('🗑️ Pago ID:', payment.id);
      console.log('🗑️ Monto:', payment.amount);
      console.log('🗑️ Préstamo ID:', payment.loan_id);
      
      // PASO 1: Obtener todos los datos del préstamo necesarios
      console.log('🗑️ OBTENIENDO DATOS DEL PRÉSTAMO...');
      const { data: loanData, error: loanError } = await supabase
        .from('loans')
        .select('remaining_balance, amount, interest_rate, term_months, payment_frequency, amortization_type, start_date, next_payment_date, paid_installments, current_late_fee, late_fee_rate, grace_period_days, max_late_fee, late_fee_calculation_type, late_fee_enabled, monthly_payment')
        .eq('id', payment.loan_id)
        .single();

      if (loanError) {
        console.error('🗑️ ERROR obteniendo préstamo:', loanError);
        throw loanError;
      }

      console.log('🗑️ Datos del préstamo obtenidos:', loanData);

      // VALIDACIÓN: No permitir eliminar un pago si existe un abono a capital posterior a él.
      // Eliminarlo alteraría el historial de saldo sobre el que se calculó ese abono.
      const paymentDate = (payment.payment_date as string)?.split('T')[0] || payment.payment_date;
      if (paymentDate) {
        const { data: laterCapitalPayments, error: capCheckError } = await supabase
          .from('capital_payments')
          .select('id, created_at, amount')
          .eq('loan_id', payment.loan_id)
          .gt('created_at', paymentDate)
          .limit(1);

        if (!capCheckError && laterCapitalPayments && laterCapitalPayments.length > 0) {
          const capDate = String(laterCapitalPayments[0].created_at).split('T')[0];
          toast.error(
            `No se puede eliminar este pago porque existe un abono a capital realizado el ${capDate} que depende del historial previo. Elimine primero el abono a capital.`
          );
          setLoading(false);
          setShowDeleteModal(false);
          return;
        }
      }

      // PASO 2: Eliminar el pago
      console.log('🗑️ ELIMINANDO PAGO...');
      const { error: deleteError } = await supabase
        .from('payments')
        .delete()
        .eq('id', payment.id);

      if (deleteError) {
        console.error('🗑️ ERROR eliminando pago:', deleteError);
        throw deleteError;
      }

      console.log('🗑️ ✅ Pago eliminado exitosamente');

      // PASO 2.5: Si era un pago de cargo, eliminar la entrada correspondiente en loan_history
      if (payment.notes?.startsWith('Pago de cargo')) {
        try {
          const { data: historyEntries } = await supabase
            .from('loan_history')
            .select('id, notes, description, created_at')
            .eq('loan_id', payment.loan_id);

          let historyIdToDelete: string | null = null;

          // Método 1: buscar por payment_id guardado en notes (entradas nuevas)
          const byPaymentId = (historyEntries || []).find(entry => {
            try {
              const parsed = JSON.parse(entry.notes || '{}');
              return Array.isArray(parsed.payment_ids) && parsed.payment_ids.includes(payment.id);
            } catch { return false; }
          });

          if (byPaymentId) {
            historyIdToDelete = byPaymentId.id;
          } else {
            // Método 2 (fallback para entradas antiguas): coincidir por descripción + proximidad de timestamp
            const paymentTime = new Date(payment.created_at).getTime();
            const windowMs = 5 * 60 * 1000; // 5 minutos
            const byTimestamp = (historyEntries || []).find(entry => {
              if (!(entry.description as string)?.startsWith('pay_charges:')) return false;
              const entryTime = new Date(entry.created_at).getTime();
              return Math.abs(entryTime - paymentTime) <= windowMs;
            });
            if (byTimestamp) historyIdToDelete = byTimestamp.id;
          }

          if (historyIdToDelete) {
            await supabase.from('loan_history').delete().eq('id', historyIdToDelete);
            console.log('🗑️ ✅ Entrada de historial del cargo eliminada:', historyIdToDelete);
          }
        } catch (historyError) {
          console.error('🗑️ Error al eliminar entrada del historial:', historyError);
        }
      }

      // PASO 2.6: Si era un pago de cargo, recalcular paid_amount en la tabla installments
      if (payment.notes?.startsWith('Pago de cargo') && payment.due_date) {
        try {
          const chargeDueDate = String(payment.due_date).split('T')[0];

          // Sumar todos los pagos de cargo que quedan para esta cuota (mismo loan_id + due_date + sin interés)
          const { data: remainingCargoPayments } = await supabase
            .from('payments')
            .select('principal_amount, amount')
            .eq('loan_id', payment.loan_id)
            .eq('due_date', chargeDueDate)
            .lt('interest_amount', 0.01);

          const totalRemaining = (remainingCargoPayments || []).reduce(
            (sum: number, p: any) => sum + (Number(p.principal_amount) || Number(p.amount) || 0), 0
          );

          // Buscar el installment del cargo por loan_id + due_date
          const { data: cargoInstallments } = await supabase
            .from('installments')
            .select('id, total_amount')
            .eq('loan_id', payment.loan_id)
            .eq('due_date', chargeDueDate)
            .lt('interest_amount', 0.01);

          for (const cargoInst of (cargoInstallments || [])) {
            const newPaid = Math.min(totalRemaining, Number(cargoInst.total_amount) || 0);
            const isNowFullyPaid = newPaid >= (Number(cargoInst.total_amount) || 0) - 0.01;
            await supabase
              .from('installments')
              .update({ paid_amount: newPaid, is_paid: isNowFullyPaid })
              .eq('id', cargoInst.id);
          }
        } catch (cargoUpdateError) {
          console.error('🗑️ Error recalculando paid_amount del cargo:', cargoUpdateError);
        }
      }

      // PASO 3: Obtener todos los pagos restantes
      console.log('🗑️ OBTENIENDO PAGOS RESTANTES...');
      const { data: remainingPayments, error: paymentsError } = await supabase
        .from('payments')
        .select('id, principal_amount, interest_amount, late_fee, payment_date, due_date, amount')
        .eq('loan_id', payment.loan_id)
        .order('payment_date', { ascending: true });

      if (paymentsError) {
        console.error('🗑️ ERROR obteniendo pagos restantes:', paymentsError);
        throw paymentsError;
      }

      console.log('🗑️ Pagos restantes:', remainingPayments?.length || 0);
      const remainingTotalLateFeePaid = (remainingPayments || []).reduce(
        (sum, p) => sum + (Number(p.late_fee) || 0),
        0
      );
      console.log('🗑️ Total de mora pagada restante (desde payments):', remainingTotalLateFeePaid);

      // CORRECCIÓN: NO recalcular balance manualmente aquí
      // El trigger de la BD ya actualizó remaining_balance correctamente (incluyendo cargos)
      // Recalcular manualmente aquí causaría que se sobrescriba el valor correcto del trigger
      // Solo necesitamos obtener el valor actualizado de la BD después de que el trigger lo calcule
      
      // Esperar un momento para que los triggers completen el cálculo
      // Aumentado a 300ms para asegurar que los triggers de payments e installments completen
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Obtener los valores actualizados de la BD (ya calculados por los triggers con cargos incluidos)
      // Reintentar varias veces si es necesario para asegurar que los triggers completaron
      let updatedLoanData: any = null;
      let fetchError: any = null;
      let retries = 3;
      
      while (retries > 0) {
        const result = await supabase
          .from('loans')
          .select('remaining_balance, next_payment_date')
          .eq('id', payment.loan_id)
          .single();
        
        fetchError = result.error;
        updatedLoanData = result.data;
        
        // Si no hay error y tenemos datos, salir del loop
        if (!fetchError && updatedLoanData) {
          break;
        }
        
        retries--;
        if (retries > 0) {
          // Esperar un poco más antes de reintentar
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      let newBalance: number;
      if (fetchError || !updatedLoanData) {
        console.error('🗑️ ERROR obteniendo valores actualizados de la BD:', fetchError);
        // Fallback al balance anterior si hay error (no ideal pero mejor que crashear)
      if (loanData.amortization_type === 'indefinite') {
          newBalance = loanData.amount;
      } else {
        const totalPrincipalPaid = remainingPayments?.reduce((sum, p) => sum + (p.principal_amount || 0), 0) || 0;
        newBalance = loanData.amount - totalPrincipalPaid;
      }
      } else {
        // Usar los valores calculados por los triggers (incluyen cargos)
        newBalance = updatedLoanData.remaining_balance || loanData.remaining_balance || 0;
      }
      
      console.log('🗑️ Valores obtenidos de BD (calculados por triggers con cargos):', {
        amount: loanData.amount,
        amortization_type: loanData.amortization_type,
        remaining_balance_from_bd: updatedLoanData?.remaining_balance,
        next_payment_date_from_bd: updatedLoanData?.next_payment_date,
        newBalance,
        bdCalculated: !fetchError && updatedLoanData
      });

      // CORRECCIÓN: Los triggers de la BD ya actualizaron remaining_balance y next_payment_date correctamente (incluyendo cargos)
      // NO recalcular manualmente, solo calcular paid_installments que es necesario para actualizar las cuotas
      
      // PASO 5: Recalcular paid_installments basándose en los pagos restantes (necesario para actualizar el estado de las cuotas)
      let updatedPaidInstallments: number[] = [];

      if (loanData.amortization_type === 'indefinite') {
        // Para préstamos indefinidos, calcular basándose en el interés pagado
        const interestPerPayment = (loanData.amount * loanData.interest_rate) / 100;
        let paidInstallmentsCount = 0;
        let currentInstallmentInterestPaid = 0;
        
        if (remainingPayments && remainingPayments.length > 0) {
          for (const p of remainingPayments) {
            currentInstallmentInterestPaid += p.interest_amount || 0;
            if (currentInstallmentInterestPaid >= interestPerPayment * 0.99) {
              paidInstallmentsCount++;
              currentInstallmentInterestPaid = 0;
            }
          }
        }

        // CORRECCIÓN: NO calcular next_payment_date manualmente
        // El trigger de la BD ya lo actualizó correctamente (incluyendo cargos)

        // Actualizar paid_installments para préstamos indefinidos
        for (let i = 1; i <= paidInstallmentsCount; i++) {
          updatedPaidInstallments.push(i);
        }
      } else {
        // Para préstamos no indefinidos, calcular basándose en la acumulación de interés y capital
        const interestPerPayment = (loanData.amount * loanData.interest_rate) / 100;
        const principalPerPayment = loanData.monthly_payment - interestPerPayment;
        let paidInstallmentsCount = 0;
        let currentInstallmentInterestPaid = 0;
        let currentInstallmentPrincipalPaid = 0;
        
        if (remainingPayments && remainingPayments.length > 0) {
          for (const p of remainingPayments) {
            const paymentInterest = p.interest_amount || 0;
            const paymentPrincipal = p.principal_amount || 0;
            
            currentInstallmentInterestPaid += paymentInterest;
            currentInstallmentPrincipalPaid += paymentPrincipal;
            
            // Verificar si esta cuota está completamente pagada
            if (currentInstallmentInterestPaid >= interestPerPayment * 0.99 && 
                currentInstallmentPrincipalPaid >= principalPerPayment * 0.99) {
              paidInstallmentsCount++;
              currentInstallmentInterestPaid = 0;
              currentInstallmentPrincipalPaid = 0;
            } else {
              // Limitar a los montos requeridos
              currentInstallmentInterestPaid = Math.min(currentInstallmentInterestPaid, interestPerPayment);
              currentInstallmentPrincipalPaid = Math.min(currentInstallmentPrincipalPaid, principalPerPayment);
            }
          }
        }

        // CORRECCIÓN: NO calcular next_payment_date manualmente
        // El trigger de la BD ya lo actualizó correctamente (incluyendo cargos)

        // Actualizar paid_installments para préstamos no indefinidos
        for (let i = 1; i <= paidInstallmentsCount; i++) {
          updatedPaidInstallments.push(i);
        }
      }

      console.log('🗑️ Cuotas pagadas recalculadas:', updatedPaidInstallments);
      console.log('🗑️ next_payment_date y remaining_balance fueron actualizados por triggers de la BD (incluyen cargos)');

      // PASO 6: Revertir el estado de las cuotas y cargos que ya no deberían estar pagados
      // CORRECCIÓN: Necesitamos diferenciar entre cuotas regulares y cargos
      console.log('🗑️ REVIRTIENDO ESTADO DE CUOTAS Y CARGOS...');
      const { data: allInstallments, error: installmentsError } = await supabase
        .from('installments')
        .select('id, installment_number, is_paid, paid_amount, due_date, total_amount, principal_amount, interest_amount')
        .eq('loan_id', payment.loan_id)
        .order('due_date', { ascending: true })
        .order('installment_number', { ascending: true });

      if (!installmentsError && allInstallments) {
        // Agrupar cargos por fecha de vencimiento para calcular pagos aplicados
        const chargesByDate = new Map<string, typeof allInstallments>();
        const regularInstallments = allInstallments.filter(inst => 
          Math.abs(inst.interest_amount || 0) >= 0.01 || 
          Math.abs((inst.principal_amount || 0) - (inst.total_amount || 0)) >= 0.01
        );
        
        // Agrupar cargos por fecha
        allInstallments.forEach(inst => {
          const isCharge = Math.abs(inst.interest_amount || 0) < 0.01 && 
                          Math.abs((inst.principal_amount || 0) - (inst.total_amount || 0)) < 0.01;
          if (isCharge) {
            const dateKey = inst.due_date.split('T')[0];
            if (!chargesByDate.has(dateKey)) {
              chargesByDate.set(dateKey, []);
            }
            chargesByDate.get(dateKey)!.push(inst);
          }
        });

        // Ordenar cargos dentro de cada fecha por installment_number
        chargesByDate.forEach((charges, date) => {
          charges.sort((a, b) => a.installment_number - b.installment_number);
        });

        // Calcular pagos aplicados a cargos
        const paymentsForCharges = (remainingPayments || []).filter(p => 
          Math.abs(p.interest_amount || 0) < 0.01
        );

        // Procesar cada installment
        for (const installment of allInstallments) {
          const isCharge = Math.abs(installment.interest_amount || 0) < 0.01 && 
                          Math.abs((installment.principal_amount || 0) - (installment.total_amount || 0)) < 0.01;
          
          let shouldBePaid: boolean;
          let totalPaidForThisCharge = 0; // En scope para toda la iteración
          
          if (isCharge) {
            // Para cargos: calcular si está pagado basándose en pagos aplicados a ese cargo específico
            const chargeDate = installment.due_date.split('T')[0];
            const chargesWithSameDate = chargesByDate.get(chargeDate) || [];
            const chargeIndex = chargesWithSameDate.findIndex(c => c.installment_number === installment.installment_number);
            
            // Filtrar pagos que corresponden a cargos de esta fecha (usar due_date, no payment_date)
            const paymentsForThisDate = paymentsForCharges.filter(p => {
              const pDue = (p.due_date as string)?.split('T')[0];
              return pDue === chargeDate;
            });
            
            // Calcular total pagado a cargos de esta fecha
            const totalPaidForDate = paymentsForThisDate.reduce((sum, p) => 
              sum + (p.principal_amount || p.amount || 0), 0
            );
            
            // Asignar pagos secuencialmente a los cargos
            let remainingPaymentsForCharges = totalPaidForDate;
            
            for (let i = 0; i < chargeIndex; i++) {
              const prevCharge = chargesWithSameDate[i];
              const amountForPrevCharge = Math.min(remainingPaymentsForCharges, prevCharge.total_amount || 0);
              remainingPaymentsForCharges -= amountForPrevCharge;
            }
            
            totalPaidForThisCharge = Math.min(remainingPaymentsForCharges, installment.total_amount || 0);
            shouldBePaid = totalPaidForThisCharge >= (installment.total_amount || 0) - 0.01;
            
            console.log(`🗑️ Cargo ${installment.installment_number}:`, {
              totalAmount: installment.total_amount,
              totalPaid: totalPaidForThisCharge,
              shouldBePaid
            });
          } else {
            // Para cuotas regulares: usar updatedPaidInstallments
            shouldBePaid = updatedPaidInstallments.includes(installment.installment_number);
          }
          
          if (installment.is_paid && !shouldBePaid) {
            console.log(`🗑️ Revirtiendo ${isCharge ? 'cargo' : 'cuota'} ${installment.installment_number} a pendiente`);
            const updateData: Record<string, unknown> = { is_paid: false, paid_date: null };
            if (isCharge) updateData.paid_amount = Math.round(totalPaidForThisCharge * 100) / 100;
            await supabase
              .from('installments')
              .update(updateData)
              .eq('loan_id', payment.loan_id)
              .eq('installment_number', installment.installment_number);
            // El trigger actualizará remaining_balance y next_payment_date automáticamente
          } else if (!installment.is_paid && shouldBePaid) {
            console.log(`🗑️ Marcando ${isCharge ? 'cargo' : 'cuota'} ${installment.installment_number} como pagado`);
            const lastPaymentDate = remainingPayments && remainingPayments.length > 0 
              ? remainingPayments[remainingPayments.length - 1].payment_date?.split('T')[0] 
              : null;
            const markPaidData: Record<string, unknown> = { is_paid: true, paid_date: lastPaymentDate };
            if (isCharge) markPaidData.paid_amount = installment.total_amount || 0;
            await supabase
              .from('installments')
              .update(markPaidData)
              .eq('loan_id', payment.loan_id)
              .eq('installment_number', installment.installment_number);
            // El trigger actualizará remaining_balance y next_payment_date automáticamente
          } else if (isCharge && Math.abs((installment.paid_amount || 0) - totalPaidForThisCharge) > 0.01) {
            // Cargo parcial: actualizar paid_amount para que "Pagar Cargos" muestre el monto correcto
            console.log(`🗑️ Actualizando paid_amount del cargo ${installment.installment_number}: ${totalPaidForThisCharge}`);
            await supabase
              .from('installments')
              .update({ paid_amount: Math.round(totalPaidForThisCharge * 100) / 100 })
              .eq('loan_id', payment.loan_id)
              .eq('installment_number', installment.installment_number);
          }
        }
      }

      // PASO 6.5: Esperar a que los triggers completen después de revertir installments
      // Los triggers se ejecutan automáticamente cuando se actualizan installments
      // Esperar tiempo suficiente para que todos los triggers completen
      console.log('🗑️ Esperando a que los triggers actualicen el balance después de revertir installments...');
      await new Promise(resolve => setTimeout(resolve, 400));
      
      // Obtener el balance final actualizado de la BD (después de que los triggers actualicen installments)
      let finalUpdatedLoanData: any = null;
      let finalFetchError: any = null;
      let finalRetries = 3;
      
      while (finalRetries > 0) {
        const finalResult = await supabase
          .from('loans')
          .select('remaining_balance, next_payment_date')
          .eq('id', payment.loan_id)
          .single();
        
        finalFetchError = finalResult.error;
        finalUpdatedLoanData = finalResult.data;
        
        if (!finalFetchError && finalUpdatedLoanData) {
          break;
        }
        
        finalRetries--;
        if (finalRetries > 0) {
          await new Promise(resolve => setTimeout(resolve, 150));
        }
      }
      
      // Usar el balance final actualizado si está disponible
      if (!finalFetchError && finalUpdatedLoanData) {
        newBalance = finalUpdatedLoanData.remaining_balance || newBalance;
        console.log('🗑️ Balance final actualizado después de revertir installments:', {
          remaining_balance: finalUpdatedLoanData.remaining_balance,
          next_payment_date: finalUpdatedLoanData.next_payment_date
        });
      }

      // PASO 6.8: Recalcular mora pagada por cuota (late_fee_paid) basándonos en pagos reales
      // BUGFIX: al eliminar un pago con mora, `installments.late_fee_paid` quedaba “pegado” y la Mora Actual bajaba
      // aunque el pago ya no existiera. Para que sea determinístico, se resetea y se redistribuye desde `payments.late_fee`.
      console.log('🗑️ Recalculando distribución de late_fee_paid en installments...');
      const { error: resetLateFeePaidError } = await supabase
        .from('installments')
        .update({ late_fee_paid: 0 })
        .eq('loan_id', payment.loan_id);
      if (resetLateFeePaidError) {
        console.error('🗑️ Error reseteando late_fee_paid:', resetLateFeePaidError);
      }

      const nextPaymentDateFromBD =
        finalUpdatedLoanData?.next_payment_date ||
        updatedLoanData?.next_payment_date ||
        loanData.next_payment_date;

      if (remainingTotalLateFeePaid > 0.009) {
        const loanDataForLateFeeBase = {
          id: payment.loan_id,
          remaining_balance: newBalance,
          next_payment_date: nextPaymentDateFromBD,
          late_fee_rate: loanData.late_fee_rate || 0,
          grace_period_days: loanData.grace_period_days || 0,
          max_late_fee: loanData.max_late_fee || 0,
          late_fee_calculation_type: loanData.late_fee_calculation_type || 'daily',
          late_fee_enabled: loanData.late_fee_enabled || false,
          amount: loanData.amount,
          term: loanData.term_months || 4,
          payment_frequency: loanData.payment_frequency || 'monthly',
          interest_rate: loanData.interest_rate,
          monthly_payment: loanData.monthly_payment,
          start_date: loanData.start_date,
          amortization_type: loanData.amortization_type
        };

        const baseBreakdown = await getLateFeeBreakdownFromInstallments(payment.loan_id, loanDataForLateFeeBase);
        let remainingToApply = remainingTotalLateFeePaid;

        for (const item of baseBreakdown.breakdown) {
          if (remainingToApply <= 0) break;
          if (item.isPaid) continue;
          if ((Number(item.lateFee) || 0) <= 0) continue;

          const toApply = Math.min(remainingToApply, Number(item.lateFee) || 0);
          const { error: applyErr } = await supabase
            .from('installments')
            .update({ late_fee_paid: Math.round(toApply * 100) / 100 })
            .eq('loan_id', payment.loan_id)
            .eq('installment_number', item.installment);

          if (applyErr) {
            console.error(`🗑️ Error aplicando late_fee_paid a cuota ${item.installment}:`, applyErr);
          } else {
            remainingToApply = Math.round((remainingToApply - toApply) * 100) / 100;
          }
        }

        if (remainingToApply > 0.009) {
          console.log('🗑️ Advertencia: quedó mora pagada sin aplicar (posible pago > mora actual):', remainingToApply);
        }
      }

      // PASO 7: Recalcular la mora
      // CORRECCIÓN: Usar next_payment_date de la BD (ya calculado por el trigger con cargos incluidos)
      console.log('🗑️ RECALCULANDO MORA...');
      const loanDataForLateFee = {
        id: payment.loan_id,
        remaining_balance: newBalance,
        next_payment_date: nextPaymentDateFromBD,
        late_fee_rate: loanData.late_fee_rate || 0,
        grace_period_days: loanData.grace_period_days || 0,
        max_late_fee: loanData.max_late_fee || 0,
        late_fee_calculation_type: loanData.late_fee_calculation_type || 'daily',
        late_fee_enabled: loanData.late_fee_enabled || false,
        amount: loanData.amount,
        term: loanData.term_months || 4,
        payment_frequency: loanData.payment_frequency || 'monthly',
        interest_rate: loanData.interest_rate,
        monthly_payment: loanData.monthly_payment,
        start_date: loanData.start_date,
        amortization_type: loanData.amortization_type
      };

      const lateFeeBreakdown = await getLateFeeBreakdownFromInstallments(payment.loan_id, loanDataForLateFee);
      const newCurrentLateFee = lateFeeBreakdown.totalLateFee;

      console.log('🗑️ Mora recalculada:', newCurrentLateFee);

      // PASO 8: Actualizar solo los campos que no son manejados por triggers
      // CORRECCIÓN: NO incluir remaining_balance ni next_payment_date en el update
      // Ambos ya fueron actualizados correctamente por los triggers de la BD (incluyendo cargos)
      // Incluirlos aquí sobrescribiría los valores correctos calculados por los triggers
      console.log('🗑️ ACTUALIZANDO PRÉSTAMO (solo campos no manejados por triggers)...');
      const updateData: any = {
        // remaining_balance: NO incluir - ya fue actualizado correctamente por el trigger de la BD (incluye cargos)
        // next_payment_date: NO incluir - ya fue actualizado correctamente por el trigger de la BD (incluye cargos)
        paid_installments: updatedPaidInstallments,
        current_late_fee: newCurrentLateFee,
        total_late_fee_paid: remainingTotalLateFeePaid,
        last_late_fee_calculation: new Date().toISOString().split('T')[0],
        status: newBalance <= 0 ? 'paid' : 'active'
      };
      
      const { error: updateError } = await supabase
        .from('loans')
        .update(updateData)
        .eq('id', payment.loan_id);

      if (updateError) {
        console.error('🗑️ ERROR actualizando préstamo:', updateError);
        throw updateError;
      }

      console.log('🗑️ ✅ Préstamo actualizado exitosamente');
      console.log('🗑️ remaining_balance y next_payment_date fueron actualizados por triggers (incluyen cargos)');

      // PASO 9: Esperar un momento adicional para asegurar que todos los triggers completaron
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Verificar que los valores estén correctos en la BD
      const { data: finalLoanData, error: finalCheckError } = await supabase
        .from('loans')
        .select('remaining_balance, next_payment_date')
        .eq('id', payment.loan_id)
        .single();
      
      if (!finalCheckError && finalLoanData) {
        console.log('🗑️ Verificación final - Valores en BD después de triggers:', {
          remaining_balance: finalLoanData.remaining_balance,
          next_payment_date: finalLoanData.next_payment_date
        });
      }

      // Notificar éxito y refrescar
      toast.success('Pago eliminado exitosamente. Todos los datos han sido revertidos.');
      setShowDeleteModal(false);
      
      // Notificar a LoanUpdateForm y otros para que refetchen installments (cargos)
      try {
        window.dispatchEvent(new CustomEvent('installmentsUpdated', { detail: { loanId: payment.loan_id, source: 'PaymentActions' } }));
      } catch { /* no-op */ }
      
      // Refrescar inmediatamente para que se vean los valores correctos
      if (onPaymentUpdated) {
        console.log('🗑️ Refrescando lista para mostrar valores actualizados de la BD...');
        onPaymentUpdated();
      }
      
    } catch (error) {
      console.error('🗑️ ERROR GENERAL:', error);
      toast.error(`Error al eliminar el pago: ${error.message || 'Error desconocido'}`);
    } finally {
      setLoading(false);
      console.log('🗑️ Proceso finalizado');
    }
  };


  // Función para generar el HTML del recibo según el formato
  const generateReceiptHTML = (format: string) => {
    if (!loan) return '';
    
    // Asegurar que tenemos los datos de la empresa
    if (!companySettings) {
      fetchCompanySettings();
    }

    const getFormatStyles = (format: string) => {
      switch (format) {
        case 'POS58':
          return `
            * { box-sizing: border-box; }
            body { 
              font-family: 'Courier New', monospace; 
              margin: 0 !important; 
              padding: 0 !important;
              font-size: 12px;
              line-height: 1.2;
              color: #000;
              width: 100% !important;
              min-width: 100% !important;
            }
            .receipt-container {
              width: 100% !important;
              max-width: none !important;
              margin: 0 !important;
              padding: 5px !important;
              min-width: 100% !important;
            }
            .header { text-align: center; margin-bottom: 10px; width: 100%; }
            .receipt-title { font-size: 14px; font-weight: bold; margin-bottom: 5px; }
            .receipt-number { font-size: 10px; }
            .section { margin-bottom: 10px; width: 100%; }
            .section-title { font-weight: bold; font-size: 11px; margin-bottom: 5px; text-decoration: underline; }
            .info-row { margin-bottom: 3px; font-size: 10px; width: 100%; }
            .amount-section { margin: 10px 0; width: 100%; }
            .total-amount { font-size: 14px; font-weight: bold; text-align: center; margin-top: 10px; }
            .footer { margin-top: 15px; text-align: center; font-size: 9px; width: 100%; }
            @media print { 
              * { box-sizing: border-box; }
              body { 
                margin: 0 !important; 
                padding: 0 !important; 
                width: 100% !important;
                min-width: 100% !important;
              }
              .receipt-container { 
                border: none; 
                width: 100% !important; 
                max-width: none !important; 
                margin: 0 !important;
                min-width: 100% !important;
              }
              @page { 
                margin: 0 !important; 
                size: auto !important;
              }
            }
          `;
        
        case 'POS80':
          return `
            * { box-sizing: border-box; }
            body { 
              font-family: 'Courier New', monospace; 
              margin: 0 !important; 
              padding: 0 !important;
              font-size: 14px;
              line-height: 1.3;
              color: #000;
              width: 100% !important;
              min-width: 100% !important;
            }
            .receipt-container {
              width: 100% !important;
              max-width: none !important;
              margin: 0 !important;
              padding: 8px !important;
              min-width: 100% !important;
            }
            .header { text-align: center; margin-bottom: 15px; width: 100%; }
            .receipt-title { font-size: 16px; font-weight: bold; margin-bottom: 8px; }
            .receipt-number { font-size: 12px; }
            .section { margin-bottom: 15px; width: 100%; }
            .section-title { font-weight: bold; font-size: 13px; margin-bottom: 8px; text-decoration: underline; }
            .info-row { margin-bottom: 4px; font-size: 12px; width: 100%; }
            .amount-section { margin: 15px 0; width: 100%; }
            .total-amount { font-size: 16px; font-weight: bold; text-align: center; margin-top: 15px; }
            .footer { margin-top: 20px; text-align: center; font-size: 10px; width: 100%; }
            @media print { 
              * { box-sizing: border-box; }
              body { 
                margin: 0 !important; 
                padding: 0 !important; 
                width: 100% !important;
                min-width: 100% !important;
              }
              .receipt-container { 
                border: none; 
                width: 100% !important; 
                max-width: none !important; 
                margin: 0 !important;
                min-width: 100% !important;
              }
              @page { 
                margin: 0 !important; 
                size: auto !important;
              }
            }
          `;
        
        case 'LETTER':
          return `
            body { 
              font-family: Arial, sans-serif; 
              margin: 20px; 
              line-height: 1.6;
              color: #333;
            }
            .receipt-container {
              max-width: 8.5in;
              margin: 0 auto;
              padding: 30px;
              border: 1px solid #ddd;
              border-radius: 8px;
            }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
            .receipt-title { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
            .receipt-number { font-size: 14px; color: #666; }
            .section { margin-bottom: 25px; }
            .section-title { font-weight: bold; font-size: 16px; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 5px; }
            .info-row { display: flex; justify-content: space-between; margin-bottom: 8px; }
            .amount-section { background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .total-amount { font-size: 20px; font-weight: bold; color: #28a745; text-align: center; margin-top: 10px; }
            .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #eee; padding-top: 20px; }
            @media print { 
              body { margin: 0; }
              .receipt-container { border: none; max-width: 8.5in; }
            }
          `;
        
        case 'A4':
          return `
            body { 
              font-family: Arial, sans-serif; 
              margin: 20px; 
              line-height: 1.6;
              color: #333;
            }
            .receipt-container {
              max-width: 210mm;
              margin: 0 auto;
              padding: 30px;
              border: 1px solid #ddd;
              border-radius: 8px;
            }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
            .receipt-title { font-size: 24px; font-weight: bold; margin-bottom: 10px; }
            .receipt-number { font-size: 14px; color: #666; }
            .section { margin-bottom: 25px; }
            .section-title { font-weight: bold; font-size: 16px; margin-bottom: 10px; border-bottom: 1px solid #eee; padding-bottom: 5px; }
            .info-row { display: flex; justify-content: space-between; margin-bottom: 8px; }
            .amount-section { background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0; }
            .total-amount { font-size: 20px; font-weight: bold; color: #28a745; text-align: center; margin-top: 10px; }
            .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #666; border-top: 1px solid #eee; padding-top: 20px; }
            @media print { 
              body { margin: 0; }
              .receipt-container { border: none; max-width: 210mm; }
            }
          `;
        
        default:
          return '';
      }
    };

    const getFormatTitle = (format: string) => {
      switch (format) {
        case 'POS58': return 'RECIBO DE PAGO - POS58';
        case 'POS80': return 'RECIBO DE PAGO - POS80';
        case 'LETTER': return 'RECIBO DE PAGO';
        case 'A4': return 'RECIBO DE PAGO';
        default: return 'RECIBO DE PAGO';
      }
    };

    return `
      <html>
        <head>
          <title>${getFormatTitle(format)} - ${loan.client.full_name}</title>
          <style>
            ${getFormatStyles(format)}
          </style>
        </head>
        <body>
          <div class="receipt-container">
            <div class="header">
              ${companySettings ? `
                <div style="margin-bottom: 15px; text-align: center;">
                  <div style="font-size: ${format.includes('POS') ? '14px' : '18px'}; font-weight: bold; margin-bottom: 5px;">
                    ${companySettings.company_name}
                  </div>
                  ${companySettings.business_type ? `<div style="font-size: ${format.includes('POS') ? '10px' : '12px'}; margin-bottom: 3px;">${companySettings.business_type}</div>` : ''}
                  ${companySettings.address ? `<div style="font-size: ${format.includes('POS') ? '9px' : '11px'}; margin-bottom: 2px;">${companySettings.address}</div>` : ''}
                  ${companySettings.city && companySettings.state ? `<div style="font-size: ${format.includes('POS') ? '9px' : '11px'}; margin-bottom: 2px;">${companySettings.city}, ${companySettings.state}</div>` : ''}
                  ${companySettings.tax_id ? `<div style="font-size: ${format.includes('POS') ? '9px' : '11px'}; margin-bottom: 5px;">RNC: ${companySettings.tax_id}</div>` : ''}
                </div>
                <hr style="border: none; border-top: 1px solid #000; margin: 10px 0;">
              ` : ''}
              <div class="receipt-title">${getFormatTitle(format)}</div>
              <div class="receipt-number">Recibo #${payment.id.slice(0, 8).toUpperCase()}</div>
              <div style="margin-top: 10px; font-size: ${format.includes('POS') ? '10px' : '14px'};">
                ${new Date(payment.created_at).toLocaleDateString('es-ES', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </div>
            </div>

            <div class="section">
              <div class="section-title">INFORMACIÓN DEL CLIENTE</div>
              <div class="info-row">
                <span>Nombre: ${loan.client.full_name}</span>
              </div>
              <div class="info-row">
                <span>Cédula: ${loan.client.dni}</span>
              </div>
              ${loan.client.phone ? `<div class="info-row"><span>Teléfono: ${loan.client.phone}</span></div>` : ''}
              ${loan.client.address ? `<div class="info-row"><span>Dirección: ${loan.client.address}</span></div>` : ''}
            </div>

            <div class="section">
              <div class="section-title">DETALLES DEL PRÉSTAMO</div>
              <div class="info-row">
                <span>Préstamo ID: ${loan.id.slice(0, 8).toUpperCase()}</span>
              </div>
              <div class="info-row">
                <span>Monto Original: RD$${loan.amount.toLocaleString()}</span>
              </div>
              <div class="info-row">
                <span>Tasa de Interés: ${loan.interest_rate}%</span>
              </div>
              <div class="info-row">
                <span>Plazo: ${loan.term_months} meses</span>
              </div>
            </div>

            <div class="section">
              <div class="section-title">DETALLES DEL PAGO</div>
              <div class="info-row">
                <span>Fecha de Pago: ${payment.payment_date}</span>
              </div>
              <div class="info-row">
                <span>Fecha de Vencimiento: ${payment.due_date}</span>
              </div>
              <div class="info-row">
                <span>Método de Pago: ${getPaymentMethodLabel(payment.payment_method)}</span>
              </div>
              ${payment.reference_number ? `<div class="info-row"><span>Referencia: ${payment.reference_number}</span></div>` : ''}
            </div>

            <div class="amount-section">
              <div class="section-title">DESGLOSE DEL PAGO</div>
              <div class="info-row">
                <span>Pago a Principal: RD$${payment.principal_amount.toLocaleString()}</span>
              </div>
              <div class="info-row">
                <span>Pago a Intereses: RD$${payment.interest_amount.toLocaleString()}</span>
              </div>
              ${payment.late_fee > 0 ? `<div class="info-row"><span>Cargo por Mora: RD$${payment.late_fee.toLocaleString()}</span></div>` : ''}
              <div class="total-amount">
                TOTAL: RD$${payment.amount.toLocaleString()}
              </div>
            </div>

            ${payment.notes ? `
            <div class="section">
              <div class="section-title">NOTAS</div>
              <div style="background-color: #f8f9fa; padding: 10px; border-radius: 5px;">
                ${payment.notes}
              </div>
            </div>
            ` : ''}

            <div class="footer">
              <p>Este documento es un comprobante oficial de pago.</p>
              <p>Para cualquier consulta, contacte a nuestro departamento de atención al cliente.</p>
              <p style="margin-top: 20px;">
                <strong>Firma del Cliente:</strong> _________________________
              </p>
              <p style="margin-top: 10px;">
                <strong>Firma del Representante:</strong> _________________________
              </p>
            </div>
          </div>
        </body>
      </html>
    `;
  };

  const printReceipt = (format: string = 'LETTER') => {
    if (!loan) return;
    
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      const receiptHTML = generateReceiptHTML(format);
      printWindow.document.write(receiptHTML);
      printWindow.document.close();
      printWindow.print();
    }
  };

  const downloadReceipt = (format: string = 'LETTER') => {
    if (!loan) return;
    
    const receiptHTML = generateReceiptHTML(format);

    const blob = new Blob([receiptHTML], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `recibo_${loan.client.full_name.replace(/\s+/g, '_')}_${new Date(payment.payment_date).toISOString().split('T')[0]}_${format}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getPaymentMethodLabel = (method: string) => {
    const methods = {
      cash: 'Efectivo',
      bank_transfer: 'Transferencia',
      check: 'Cheque',
      card: 'Tarjeta',
      online: 'En línea'
    };
    return methods[method as keyof typeof methods] || method;
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">Abrir menú</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={handleViewReceipt}>
            <Eye className="mr-2 h-4 w-4" />
            Ver Recibo
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowPrintFormatModal(true)}>
            <Printer className="mr-2 h-4 w-4" />
            Imprimir
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setShowPrintFormatModal(true)}>
            <Download className="mr-2 h-4 w-4" />
            Descargar
          </DropdownMenuItem>
          <DropdownMenuItem onClick={async () => {
            try {
              // Obtener solo los datos mínimos necesarios: teléfono del cliente, nombre de la empresa y datos básicos del préstamo
              const { data: loanBasicData, error: loanError } = await supabase
                .from('loans')
                .select('client_id, amount, interest_rate, remaining_balance, next_payment_date, amortization_type')
                .eq('id', payment.loan_id)
                .single();
              
              if (loanError || !loanBasicData) {
                toast.error('Error al cargar datos del préstamo');
                return;
              }
              
              // Obtener datos del cliente
              const { data: clientData, error: clientError } = await supabase
                .from('clients')
                .select('full_name, dni, phone')
                .eq('id', loanBasicData.client_id)
                .single();
              
              if (clientError || !clientData) {
                toast.error('Error al cargar datos del cliente');
                return;
              }
              
              if (!clientData.phone) {
                toast.error('No se encontró el número de teléfono del cliente');
                return;
              }
              
              // Obtener configuración de la empresa
              const { data: { user } } = await supabase.auth.getUser();
              if (!user) {
                toast.error('No se pudo obtener información del usuario');
                return;
              }
              
              const { data: companyData } = await supabase
                .from('company_settings')
                .select('company_name')
                .eq('user_id', user.id)
                .maybeSingle();
              
              // CORRECCIÓN: Para préstamos indefinidos, el balance restante es el monto original (no cambia)
              const remainingBalance = loanBasicData.amortization_type === 'indefinite'
                ? loanBasicData.amount
                : loanBasicData.remaining_balance;
              
              const receiptMessage = generateLoanPaymentReceipt({
                companyName: companyData?.company_name || 'Mi Empresa',
                clientName: clientData.full_name,
                clientDni: clientData.dni,
                paymentDate: new Date(payment.payment_date).toLocaleDateString('es-DO', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                }),
                paymentAmount: payment.amount,
                principalAmount: payment.principal_amount,
                interestAmount: payment.interest_amount,
                lateFeeAmount: payment.late_fee || 0,
                paymentMethod: payment.payment_method,
                loanAmount: loanBasicData.amount,
                remainingBalance: remainingBalance,
                interestRate: loanBasicData.interest_rate,
                nextPaymentDate: loanBasicData.next_payment_date ? new Date(loanBasicData.next_payment_date).toLocaleDateString('es-DO', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                }) : undefined,
                referenceNumber: payment.reference_number
              });
              
              openWhatsApp(clientData.phone, receiptMessage);
              toast.success('Abriendo WhatsApp...');
            } catch (error: any) {
              console.error('Error abriendo WhatsApp:', error);
              toast.error(error.message || 'Error al abrir WhatsApp');
            }
          }}>
            <MessageCircle className="mr-2 h-4 w-4" />
            Enviar por WhatsApp
          </DropdownMenuItem>
          {isLatestPayment && loanStatus !== 'paid' && !hasLaterCapitalPayment && (
            <DropdownMenuItem
              onClick={() => {
                setForceDelete(false);
                setShowPasswordVerification(true);
              }}
              className="text-red-600"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Eliminar Pago
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Modal del Recibo */}
      <Dialog open={showReceiptModal} onOpenChange={setShowReceiptModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Receipt className="h-5 w-5" />
                Recibo de Pago - {loan?.client.full_name}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setShowPrintFormatModal(true)}>
                  <Printer className="h-4 w-4 mr-2" />
                  Imprimir
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowPrintFormatModal(true)}>
                  <Download className="h-4 w-4 mr-2" />
                  Descargar
                </Button>
                <Button size="sm" variant="outline" onClick={async () => {
                  try {
                    // Obtener solo los datos mínimos necesarios: teléfono del cliente, nombre de la empresa y datos básicos del préstamo
                    const { data: loanBasicData, error: loanError } = await supabase
                      .from('loans')
                      .select('client_id, amount, interest_rate, remaining_balance, next_payment_date, amortization_type')
                      .eq('id', payment.loan_id)
                      .single();
                    
                    if (loanError || !loanBasicData) {
                      toast.error('Error al cargar datos del préstamo');
                      return;
                    }
                    
                    // Obtener datos del cliente
                    const { data: clientData, error: clientError } = await supabase
                      .from('clients')
                      .select('full_name, dni, phone')
                      .eq('id', loanBasicData.client_id)
                      .single();
                    
                    if (clientError || !clientData) {
                      toast.error('Error al cargar datos del cliente');
                      return;
                    }
                    
                    if (!clientData.phone) {
                      toast.error('No se encontró el número de teléfono del cliente');
                      return;
                    }
                    
                    // Obtener configuración de la empresa
                    const { data: { user } } = await supabase.auth.getUser();
                    if (!user) {
                      toast.error('No se pudo obtener información del usuario');
                      return;
                    }
                    
                    const { data: companyData } = await supabase
                      .from('company_settings')
                      .select('company_name')
                      .eq('user_id', user.id)
                      .maybeSingle();
                    
                    // CORRECCIÓN: Para préstamos indefinidos, el balance restante es el monto original (no cambia)
                    const remainingBalance = loanBasicData.amortization_type === 'indefinite'
                      ? loanBasicData.amount
                      : loanBasicData.remaining_balance;
                    
                    const receiptMessage = generateLoanPaymentReceipt({
                      companyName: companyData?.company_name || 'Mi Empresa',
                      clientName: clientData.full_name,
                      clientDni: clientData.dni,
                      paymentDate: new Date(payment.payment_date).toLocaleDateString('es-DO', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      }),
                      paymentAmount: payment.amount,
                      principalAmount: payment.principal_amount,
                      interestAmount: payment.interest_amount,
                      lateFeeAmount: payment.late_fee || 0,
                      paymentMethod: payment.payment_method,
                      loanAmount: loanBasicData.amount,
                      remainingBalance: remainingBalance,
                      interestRate: loanBasicData.interest_rate,
                      nextPaymentDate: loanBasicData.next_payment_date ? new Date(loanBasicData.next_payment_date).toLocaleDateString('es-DO', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      }) : undefined,
                      referenceNumber: payment.reference_number
                    });
                    
                    openWhatsApp(clientData.phone, receiptMessage);
                    toast.success('Abriendo WhatsApp...');
                  } catch (error: any) {
                    console.error('Error abriendo WhatsApp:', error);
                    toast.error(error.message || 'Error al abrir WhatsApp');
                  }
                }}>
                  <MessageCircle className="h-4 w-4 mr-2" />
                  WhatsApp
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowReceiptModal(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </DialogTitle>
          </DialogHeader>

          {loan && (
            <div className="space-y-6">
              {/* Información del Cliente */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Información del Cliente
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <span className="font-medium text-gray-600">Nombre:</span>
                      <div className="font-semibold">{loan.client.full_name}</div>
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">Cédula:</span>
                      <div className="font-semibold">{loan.client.dni}</div>
                    </div>
                    {loan.client.phone && (
                      <div>
                        <span className="font-medium text-gray-600">Teléfono:</span>
                        <div className="font-semibold">{loan.client.phone}</div>
                      </div>
                    )}
                    {loan.client.address && (
                      <div>
                        <span className="font-medium text-gray-600">Dirección:</span>
                        <div className="font-semibold">{loan.client.address}</div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Detalles del Préstamo */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />
                    Detalles del Préstamo
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <span className="font-medium text-gray-600">Préstamo ID:</span>
                      <div className="font-semibold">{loan.id.slice(0, 8).toUpperCase()}</div>
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">Monto Original:</span>
                      <div className="font-semibold">RD${loan.amount.toLocaleString()}</div>
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">Tasa de Interés:</span>
                      <div className="font-semibold">{loan.interest_rate}%</div>
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">Plazo:</span>
                      <div className="font-semibold">{loan.term_months} meses</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Detalles del Pago */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Receipt className="h-5 w-5" />
                    Detalles del Pago
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <span className="font-medium text-gray-600">Fecha de Pago:</span>
                      <div className="font-semibold">{new Date(payment.payment_date).toLocaleDateString()}</div>
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">Fecha de Vencimiento:</span>
                      <div className="font-semibold">{new Date(payment.due_date).toLocaleDateString()}</div>
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">Método de Pago:</span>
                      <div className="font-semibold">{getPaymentMethodLabel(payment.payment_method)}</div>
                    </div>
                    {payment.reference_number && (
                      <div>
                        <span className="font-medium text-gray-600">Número de Referencia:</span>
                        <div className="font-semibold">{payment.reference_number}</div>
                      </div>
                    )}
                  </div>

                  {/* Desglose del Pago */}
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h4 className="font-semibold mb-3">Desglose del Pago</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Pago a Principal:</span>
                        <span className="font-semibold">RD${payment.principal_amount.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Pago a Intereses:</span>
                        <span className="font-semibold">RD${(payment.interest_amount || Math.max(0, payment.amount - (payment.principal_amount || 0))).toLocaleString()}</span>
                      </div>
                      {payment.late_fee > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-600">Cargo por Mora:</span>
                          <span className="font-semibold text-red-600">RD${payment.late_fee.toLocaleString()}</span>
                        </div>
                      )}
                      <hr className="my-2" />
                      <div className="flex justify-between text-lg font-bold text-green-600">
                        <span>TOTAL:</span>
                        <span>RD${(payment.amount + (payment.late_fee || 0)).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  {payment.notes && (
                    <div className="mt-4">
                      <span className="font-medium text-gray-600">Notas:</span>
                      <div className="mt-2 p-3 bg-blue-50 rounded-lg">
                        {translatePaymentNotes(payment.notes)}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowReceiptModal(false)}>
                  Cerrar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

             {/* Modal de Eliminación */}
       <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
         <DialogContent>
           <DialogHeader>
             <DialogTitle>Confirmar Eliminación</DialogTitle>
           </DialogHeader>
           <div className="space-y-4">
             <p>¿Estás seguro de que quieres eliminar este pago?</p>
             <p className="text-sm text-blue-600 font-semibold">
               ✅ Este es el último pago del préstamo
             </p>
             <p className="text-sm text-gray-600">
               Esta acción no se puede deshacer y se actualizará el balance del préstamo.
             </p>
             <div className="flex justify-end gap-2">
               <Button 
                 variant="outline" 
                 onClick={() => setShowDeleteModal(false)}
                 disabled={loading}
               >
                 Cancelar
               </Button>
               <Button 
                 variant="destructive" 
                 onClick={handleDelete}
                 disabled={loading}
               >
                 {loading ? 'Eliminando...' : 'Eliminar'}
               </Button>
             </div>
           </div>
         </DialogContent>
       </Dialog>


       {/* Modal de Selección de Formato de Impresión */}
       <Dialog open={showPrintFormatModal} onOpenChange={setShowPrintFormatModal}>
         <DialogContent className="max-w-md">
           <DialogHeader>
             <DialogTitle className="flex items-center gap-2">
               <Printer className="h-5 w-5" />
               Seleccionar Formato de Impresión
             </DialogTitle>
           </DialogHeader>
           
           <div className="space-y-4">
             <p className="text-sm text-gray-600">
               Selecciona el formato de impresión según tu impresora:
             </p>
             
             <div className="grid grid-cols-1 gap-3">
               {/* POS58 - Impresoras portátiles Verifone */}
               <Button 
                 variant="outline" 
                 className="h-auto p-4 flex flex-col items-start"
                 onClick={() => {
                   printReceipt('POS58');
                   setShowPrintFormatModal(false);
                 }}
               >
                 <div className="flex items-center gap-2 mb-2">
                   <div className="w-8 h-8 bg-blue-100 rounded flex items-center justify-center">
                     <span className="text-xs font-bold">58</span>
                   </div>
                   <div className="text-left">
                     <div className="font-medium">POS58</div>
                     <div className="text-xs text-gray-500">Verifone / Impresoras Portátiles</div>
                   </div>
                 </div>
                 <div className="text-xs text-gray-400">
                   Ancho: 58mm - Ideal para impresoras portátiles
                 </div>
               </Button>

               {/* POS80 - Punto de venta */}
               <Button 
                 variant="outline" 
                 className="h-auto p-4 flex flex-col items-start"
                 onClick={() => {
                   printReceipt('POS80');
                   setShowPrintFormatModal(false);
                 }}
               >
                 <div className="flex items-center gap-2 mb-2">
                   <div className="w-8 h-8 bg-green-100 rounded flex items-center justify-center">
                     <span className="text-xs font-bold">80</span>
                   </div>
                   <div className="text-left">
                     <div className="font-medium">POS80</div>
                     <div className="text-xs text-gray-500">Punto de Venta</div>
                   </div>
                 </div>
                 <div className="text-xs text-gray-400">
                   Ancho: 80mm - Para impresoras de punto de venta
                 </div>
               </Button>

               {/* Carta 8½ x 11 */}
               <Button 
                 variant="outline" 
                 className="h-auto p-4 flex flex-col items-start"
                 onClick={() => {
                   printReceipt('LETTER');
                   setShowPrintFormatModal(false);
                 }}
               >
                 <div className="flex items-center gap-2 mb-2">
                   <div className="w-8 h-8 bg-purple-100 rounded flex items-center justify-center">
                     <span className="text-xs font-bold">8½</span>
                   </div>
                   <div className="text-left">
                     <div className="font-medium">Carta (8½ x 11)</div>
                     <div className="text-xs text-gray-500">Impresoras de Escritorio</div>
                   </div>
                 </div>
                 <div className="text-xs text-gray-400">
                   Formato: 8.5 x 11 pulgadas - Estándar americano
                 </div>
               </Button>

               {/* A4 */}
               <Button 
                 variant="outline" 
                 className="h-auto p-4 flex flex-col items-start"
                 onClick={() => {
                   printReceipt('A4');
                   setShowPrintFormatModal(false);
                 }}
               >
                 <div className="flex items-center gap-2 mb-2">
                   <div className="w-8 h-8 bg-orange-100 rounded flex items-center justify-center">
                     <span className="text-xs font-bold">A4</span>
                   </div>
                   <div className="text-left">
                     <div className="font-medium">A4</div>
                     <div className="text-xs text-gray-500">Impresoras de Escritorio</div>
                   </div>
                 </div>
                 <div className="text-xs text-gray-400">
                   Formato: 210 x 297mm - Estándar internacional
                 </div>
               </Button>
             </div>

             <div className="pt-4 border-t">
               <p className="text-xs text-gray-500 mb-3">
                 También puedes descargar el recibo en formato HTML:
               </p>
               <div className="grid grid-cols-2 gap-2">
                 <Button 
                   size="sm" 
                   variant="secondary"
                   onClick={() => {
                     downloadReceipt('POS58');
                     setShowPrintFormatModal(false);
                   }}
                 >
                   <Download className="h-3 w-3 mr-1" />
                   POS58
                 </Button>
                 <Button 
                   size="sm" 
                   variant="secondary"
                   onClick={() => {
                     downloadReceipt('LETTER');
                     setShowPrintFormatModal(false);
                   }}
                 >
                   <Download className="h-3 w-3 mr-1" />
                   Carta
                 </Button>
               </div>
             </div>
           </div>

           <div className="flex justify-end gap-2 pt-4">
             <Button variant="outline" onClick={() => setShowPrintFormatModal(false)}>
               Cancelar
             </Button>
           </div>
        </DialogContent>
      </Dialog>

      {/* Diálogo de Verificación de Contraseña */}
      <PasswordVerificationDialog
        isOpen={showPasswordVerification}
        onClose={() => setShowPasswordVerification(false)}
        onVerify={() => {
          setShowPasswordVerification(false);
          setShowDeleteModal(true);
        }}
        title="Verificar Contraseña"
        description="Por seguridad, ingresa tu contraseña para confirmar la eliminación del pago."
        entityName="pago"
      />
    </>
  );
};
