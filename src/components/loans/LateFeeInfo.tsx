import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useLateFee, LateFeeCalculation, LateFeeHistory } from '@/hooks/useLateFee';
import { 
  calculateLateFee as calculateLateFeeUtil, 
  calculateLateFeeWithValidation,
  getDetailedLateFeeBreakdown,
  getOriginalLateFeeBreakdown
} from '@/utils/lateFeeCalculator';
import { getLateFeeBreakdownFromInstallments } from '@/utils/installmentLateFeeCalculator';
import { getCurrentDateInSantoDomingo, getCurrentDateString } from '@/utils/dateUtils';
import { LateFeeConfigModal } from './LateFeeConfigModal';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  AlertTriangle, 
  Clock, 
  DollarSign, 
  TrendingUp, 
  History,
  Calculator,
  Settings,
  Cog
} from 'lucide-react';

interface LateFeeInfoProps {
  loanId: string;
  nextPaymentDate: string;
  currentLateFee: number;
  lateFeeEnabled: boolean;
  lateFeeRate: number;
  gracePeriodDays: number;
  maxLateFee?: number;
  lateFeeCalculationType?: 'daily' | 'monthly' | 'compound';
  remainingBalance: number;
  clientName: string;
  // Nuevos campos necesarios para el cálculo correcto de mora
  amount: number; // Monto total del préstamo
  term: number; // Número de cuotas
  payment_frequency: string; // Frecuencia de pago
  interest_rate?: number; // Tasa de interés del préstamo
  monthly_payment?: number; // Cuota mensual
  paid_installments?: number[]; // Cuotas que han sido pagadas
  start_date?: string; // Fecha de inicio del préstamo (CRÍTICO para el cálculo correcto)
}

export const LateFeeInfo: React.FC<LateFeeInfoProps> = ({
  loanId,
  nextPaymentDate,
  currentLateFee,
  lateFeeEnabled,
  lateFeeRate,
  gracePeriodDays,
  maxLateFee = 0,
  lateFeeCalculationType = 'daily',
  remainingBalance,
  clientName,
  amount,
  term,
  payment_frequency,
  interest_rate,
  monthly_payment,
  paid_installments,
  start_date
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [lateFeeCalculation, setLateFeeCalculation] = useState<LateFeeCalculation | null>(null);
  const [lateFeeHistory, setLateFeeHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [pendingCapital, setPendingCapital] = useState<number>(0);
  const [detectedPaidInstallments, setDetectedPaidInstallments] = useState<number[]>([]);
  const [manualBreakdownState, setManualBreakdownState] = useState<any[]>([]);
  const { calculateLateFee, getLateFeeHistory, loading } = useLateFee();

  // Función para obtener pagos de mora previos
  const getPreviousLateFeePayments = async () => {
    try {
      const { data, error } = await supabase
        .from('payments')
        .select('late_fee')
        .eq('loan_id', loanId)
        .not('late_fee', 'is', null);

      if (error) throw error;
      
      const totalPaidLateFee = data?.reduce((sum, payment) => sum + (payment.late_fee || 0), 0) || 0;
      console.log('🔍 LateFeeInfo: Pagos de mora previos:', totalPaidLateFee);
      return totalPaidLateFee;
    } catch (error) {
      console.error('Error obteniendo pagos de mora previos:', error);
      return 0;
    }
  };

  // Función para detectar cuotas pagadas basándose en los pagos realizados
  const getPaidInstallments = async () => {
    try {
      console.log('🔍 LateFeeInfo: Detectando cuotas pagadas...');
      
      // Obtener todos los pagos del préstamo
      const { data: payments, error } = await supabase
        .from('payments')
        .select('principal_amount, interest_amount, payment_date, amount')
        .eq('loan_id', loanId)
        .order('payment_date', { ascending: true });

      if (error) throw error;

      if (!payments || payments.length === 0) {
        console.log('🔍 LateFeeInfo: No hay pagos para el préstamo');
        return [];
      }

      console.log('🔍 LateFeeInfo: Pagos encontrados:', payments);

      // Calcular el capital por cuota
      // Fórmula correcta: interés fijo por cuota = (monto_total * tasa_interés) / 100
      const fixedInterestPerPayment = (amount * (interest_rate || 0)) / 100;
      const principalPerPayment = (monthly_payment || 0) - fixedInterestPerPayment;
      
      console.log('🔍 LateFeeInfo: Cálculos base:', {
        principalPerPayment,
        monthlyPayment: monthly_payment,
        interestRate: interest_rate,
        fixedInterestPerPayment
      });

      // Detectar cuotas completas basándose en pagos de capital
      const paidInstallments: number[] = [];
      let totalPrincipalPaid = 0;
      let installmentNumber = 1;

      for (const payment of payments) {
        const principalPaid = payment.principal_amount || 0;
        totalPrincipalPaid += principalPaid;
        
        console.log(`🔍 LateFeeInfo: Pago ${payment.payment_date}:`, {
          principalPaid,
          totalPrincipalPaid,
          installmentNumber,
          principalPerPayment
        });

        // Si se ha pagado suficiente capital para una cuota completa
        while (totalPrincipalPaid >= principalPerPayment && installmentNumber <= term) {
          paidInstallments.push(installmentNumber);
          totalPrincipalPaid -= principalPerPayment;
          installmentNumber++;
          
          console.log(`🔍 LateFeeInfo: Cuota ${installmentNumber - 1} completada`);
        }
      }

      console.log('🔍 LateFeeInfo: Cuotas pagadas detectadas:', paidInstallments);
      
      console.log('🔍 LateFeeInfo: DEBUG - Detalle de detección de cuotas:', {
        totalPayments: payments.length,
        totalPrincipalPaid,
        principalPerPayment,
        paidInstallments,
        nextPaymentDate: nextPaymentDate
      });
      
      // Validación específica para diferentes escenarios
      if (paidInstallments.length === 1) {
        console.log('🔍 LateFeeInfo: VALIDACIÓN - 1 cuota pagada detectada');
        console.log('🔍 LateFeeInfo: Mora esperada: $31,650 (cuotas 2+3+4)');
        console.log('🔍 LateFeeInfo: Cálculo esperado:');
        console.log('  - Cuota 2 (240 días): 2,500 × 0.02 × 240 = 12,000.00');
        console.log('  - Cuota 3 (212 días): 2,500 × 0.02 × 212 = 10,600.00');
        console.log('  - Cuota 4 (181 días): 2,500 × 0.02 × 181 = 9,050.00');
        console.log('  - Total: 31,650.00');
      } else if (paidInstallments.length === 2) {
        console.log('🔍 LateFeeInfo: VALIDACIÓN - 2 cuotas pagadas detectadas');
        console.log('🔍 LateFeeInfo: Mora esperada: $19,650 (solo cuotas 3 y 4)');
        console.log('🔍 LateFeeInfo: Cálculo esperado:');
        console.log('  - Cuota 3 (212 días): 2,500 × 0.02 × 212 = 10,600.00');
        console.log('  - Cuota 4 (181 días): 2,500 × 0.02 × 181 = 9,050.00');
        console.log('  - Total: 19,650.00');
      } else {
        console.log('🔍 LateFeeInfo: ADVERTENCIA - No se detectaron las cuotas esperadas');
        console.log('🔍 LateFeeInfo: Cuotas detectadas:', paidInstallments.length);
        console.log('🔍 LateFeeInfo: Total capital pagado:', totalPrincipalPaid);
        console.log('🔍 LateFeeInfo: Capital por cuota:', principalPerPayment);
        console.log('🔍 LateFeeInfo: Cuotas esperadas con este capital:', Math.floor(totalPrincipalPaid / principalPerPayment));
      }
      
      return paidInstallments;
    } catch (error) {
      console.error('Error detectando cuotas pagadas:', error);
      return [];
    }
  };

  // Función para calcular el capital pendiente dinámicamente
  const calculatePendingCapital = async () => {
    try {
      // Obtener todos los pagos del préstamo
      const { data: payments, error } = await supabase
        .from('payments')
        .select('principal_amount')
        .eq('loan_id', loanId)
        .order('payment_date', { ascending: true });

      if (error) throw error;

      // Calcular cuánto capital se ha pagado
      const totalPaidCapital = payments?.reduce((sum, payment) => sum + (payment.principal_amount || 0), 0) || 0;
      
      // Capital pendiente = Monto total - Capital pagado
      const pendingCapital = Math.max(0, amount - totalPaidCapital);
      
      console.log('🔍 LateFeeInfo: Capital pendiente calculado:', {
        amount,
        totalPaidCapital,
        pendingCapital
      });
      
      return pendingCapital;
    } catch (error) {
      console.error('Error calculando capital pendiente:', error);
      return amount; // Fallback al monto total
    }
  };

  // Función para calcular la mora localmente (consistente con PaymentForm)
  const calculateLocalLateFee = async () => {
    if (!lateFeeEnabled || !lateFeeRate) {
      console.log('🔍 LateFeeInfo: Mora deshabilitada o sin tasa');
      return null;
    }

    // DEBUG: Verificar la fecha de inicio del préstamo
    console.log('🔍 LateFeeInfo: DEBUG - Fecha de inicio del préstamo:', {
      start_date,
      nextPaymentDate,
      amount,
      term
    });

  // CORREGIR: Siempre calcular la fecha real de inicio del préstamo
  // porque start_date puede ser incorrecta o no existir
  let correctedStartDate = start_date;
  
  console.log('🔍 LateFeeInfo: Verificando start_date:', {
    start_date,
    isStartDateFuture: start_date ? new Date(start_date) > new Date() : false,
    currentDate: new Date().toISOString().split('T')[0]
  });
  
  // CORREGIR: Si next_payment_date es la primera cuota, usar esa fecha directamente
  console.log('🔍 LateFeeInfo: CORRIGIENDO lógica de fecha de inicio');
  
  // Si next_payment_date es la primera cuota (como 2025-01-06), usar esa fecha
  // No necesitamos calcular hacia atrás
  correctedStartDate = nextPaymentDate;
  
  console.log('🔍 LateFeeInfo: Fecha de inicio corregida:', {
    originalStartDate: start_date,
    nextPaymentDate: nextPaymentDate,
    correctedStartDate,
    explanation: 'Usando next_payment_date como fecha de inicio del préstamo'
  });

    // USAR DIRECTAMENTE paid_installments de la base de datos
    // NO detectar automáticamente basándose en capital pagado
    const finalPaidInstallments = paid_installments || [];
    setDetectedPaidInstallments(finalPaidInstallments);

    console.log('🔍 LateFeeInfo: Calculando mora local con datos mejorados:', {
      amount,
      term,
      payment_frequency,
      late_fee_rate: lateFeeRate,
      next_payment_date: nextPaymentDate,
      grace_period_days: gracePeriodDays,
      late_fee_calculation_type: lateFeeCalculationType,
      paidInstallments: finalPaidInstallments
    });

    // USAR LA MISMA LÓGICA MANUAL QUE PaymentForm
    // CREAR DESGLOSE MANUAL QUE SOLO MUESTRE CUOTAS PENDIENTES
    const manualBreakdown = [];
    let totalManualLateFee = 0;

    // Calcular el capital real por cuota
    const fixedInterestPerPayment = (amount * (interest_rate || 0)) / 100;
    const principalPerPayment = Math.round(((monthly_payment || 0) - fixedInterestPerPayment) * 100) / 100;

    console.log('🔍 LateFeeInfo: ===== CREANDO DESGLOSE MANUAL =====');
    console.log('🔍 LateFeeInfo: Cuotas pagadas:', finalPaidInstallments);
    console.log('🔍 LateFeeInfo: Capital real por cuota:', principalPerPayment);
    console.log('🔍 LateFeeInfo: Total de cuotas:', term);

    // Procesar TODAS las cuotas pendientes
    const totalInstallments = term || 4;

    for (let installment = 1; installment <= totalInstallments; installment++) {
      // Saltar cuotas que ya están pagadas
      if (finalPaidInstallments.includes(installment)) {
        console.log(`🔍 LateFeeInfo: Saltando cuota ${installment} (ya pagada)`);
        continue;
      }
      console.log(`🔍 LateFeeInfo: Procesando cuota ${installment} (pendiente)`);

      // Calcular fecha de vencimiento de esta cuota
      const baseDate = new Date(correctedStartDate);
      const periodsToAdd = installment - 1;

      // Ajustar fecha según la frecuencia de pago
      switch (payment_frequency) {
        case 'daily':
          baseDate.setDate(baseDate.getDate() + (periodsToAdd * 1));
          break;
        case 'weekly':
          baseDate.setDate(baseDate.getDate() + (periodsToAdd * 7));
          break;
        case 'biweekly':
          baseDate.setDate(baseDate.getDate() + (periodsToAdd * 14));
          break;
        case 'monthly':
          baseDate.setMonth(baseDate.getMonth() + periodsToAdd);
          break;
        case 'quarterly':
          baseDate.setMonth(baseDate.getMonth() + (periodsToAdd * 3));
          break;
        case 'yearly':
          baseDate.setFullYear(baseDate.getFullYear() + periodsToAdd);
          break;
        default:
          baseDate.setMonth(baseDate.getMonth() + periodsToAdd);
      }

      const installmentDueDate = new Date(baseDate);
      const calculationDate = getCurrentDateInSantoDomingo();

      // Calcular días de atraso
      const daysSinceDue = Math.floor((calculationDate.getTime() - installmentDueDate.getTime()) / (1000 * 60 * 60 * 24));
      const daysOverdue = Math.max(0, daysSinceDue - gracePeriodDays);

      // Calcular mora para esta cuota
      let lateFee = 0;
      if (daysOverdue > 0) {
        switch (lateFeeCalculationType) {
          case 'daily':
            lateFee = (principalPerPayment * lateFeeRate / 100) * daysOverdue;
            break;
          case 'monthly':
            const monthsOverdue = Math.ceil(daysOverdue / 30);
            lateFee = (principalPerPayment * lateFeeRate / 100) * monthsOverdue;
            break;
          case 'compound':
            lateFee = principalPerPayment * (Math.pow(1 + lateFeeRate / 100, daysOverdue) - 1);
            break;
          default:
            lateFee = (principalPerPayment * lateFeeRate / 100) * daysOverdue;
        }

        if (maxLateFee && maxLateFee > 0) {
          lateFee = Math.min(lateFee, maxLateFee);
        }

        lateFee = Math.round(lateFee * 100) / 100;
        totalManualLateFee += lateFee;
      }

      manualBreakdown.push({
        installment,
        dueDate: installmentDueDate.toISOString().split('T')[0],
        daysOverdue,
        principal: principalPerPayment,
        lateFee: lateFee,
        isPaid: false
      });

      console.log(`🔍 LateFeeInfo: Cuota ${installment} (PENDIENTE):`, {
        dueDate: installmentDueDate.toISOString().split('T')[0],
        daysOverdue,
        principal: principalPerPayment,
        lateFee
      });
    }

    console.log('🔍 LateFeeInfo: RESUMEN DEL CÁLCULO MANUAL');
    console.log('🔍 LateFeeInfo: Total mora de cuotas pendientes:', totalManualLateFee);
    console.log('🔍 LateFeeInfo: Número de cuotas pendientes:', manualBreakdown.length);

    // Obtener días de atraso de la primera cuota pendiente
    const daysOverdue = manualBreakdown.length > 0 ? manualBreakdown[0].daysOverdue : 0;

    // LA TABLA ES LA LÓGICA CORRECTA
    // Usar totalManualLateFee directamente
    const tableTotalLateFee = totalManualLateFee;

    console.log('🔍 LateFeeInfo: ===== USANDO TOTAL DE LA TABLA MANUAL =====');
    console.log('🔍 LateFeeInfo: Total manual de la tabla:', tableTotalLateFee);
    console.log('🔍 LateFeeInfo: Días de atraso:', daysOverdue);
    console.log('🔍 LateFeeInfo: DEBUG - Desglose por cuotas:');
    manualBreakdown.forEach((item: any) => {
      console.log(`  - Cuota ${item.installment}: ${item.isPaid ? 'PAGADA' : `RD$${item.lateFee}`} (${item.daysOverdue} días)`);
    });
    console.log('🔍 LateFeeInfo: DEBUG - finalPaidInstallments:', finalPaidInstallments);
    console.log('🔍 LateFeeInfo: TOTAL CORRECTO (suma de la tabla):', tableTotalLateFee);

    // Guardar el desglose manual en el estado para usarlo en el modal
    setManualBreakdownState(manualBreakdown);

    // Actualizar los días de mora calculados
    setCalculatedDaysOverdue(daysOverdue);

    if (process.env.NODE_ENV === 'development') {
      const currentDate = getCurrentDateInSantoDomingo();
      console.log('🔍 DEBUG LateFeeInfo - Días calculados:', {
        breakdownDaysOverdue: daysOverdue,
        currentCalculatedDaysOverdue: calculatedDaysOverdue,
        currentDaysOverdue: daysOverdue,
        nextPaymentDate: nextPaymentDate,
        calculationDate: currentDate.toISOString().split('T')[0],
        currentDateReal: new Date().toISOString().split('T')[0],
        santoDomingoDate: currentDate.toISOString().split('T')[0]
      });
    }

    // Forzar actualización del estado
    console.log('🔍 LateFeeInfo: Forzando actualización de días a:', daysOverdue);

    return {
      days_overdue: daysOverdue,
      late_fee_amount: tableTotalLateFee, // Usar el total de la tabla directamente
      total_late_fee: tableTotalLateFee   // Usar el total de la tabla directamente
    };
  };

  // Estado para días de mora calculados desde el último pago
  const [daysOverdue, setDaysOverdue] = useState(0);
  const [calculatedDaysOverdue, setCalculatedDaysOverdue] = useState(0);

  // Función para obtener la fecha del último pago
  const getLastPaymentDate = async () => {
    try {
      const { data, error } = await supabase
        .from('payments')
        .select('payment_date')
        .eq('loan_id', loanId)
        .order('payment_date', { ascending: false })
        .limit(1);

      if (error) throw error;
      
      if (data && data.length > 0) {
        return data[0].payment_date;
      }
      
      // Si no hay pagos, usar la fecha de vencimiento de la primera cuota
      return nextPaymentDate;
    } catch (error) {
      console.error('Error obteniendo último pago:', error);
      return nextPaymentDate;
    }
  };

  // Efecto para actualizar los días cuando cambie el cálculo
  useEffect(() => {
    if (lateFeeCalculation && lateFeeCalculation.days_overdue !== calculatedDaysOverdue) {
      console.log('🔍 LateFeeInfo: Actualizando días desde lateFeeCalculation:', lateFeeCalculation.days_overdue);
      setCalculatedDaysOverdue(lateFeeCalculation.days_overdue);
    }
  }, [lateFeeCalculation, calculatedDaysOverdue]);

  // Calcular mora localmente cuando cambien los parámetros
  useEffect(() => {
    console.log('🔍 LateFeeInfo: useEffect ejecutándose con:', {
      daysOverdue,
      lateFeeEnabled,
      amount,
      term,
      payment_frequency
    });
    
    const calculateAndSetLateFee = async () => {
      if (lateFeeEnabled) {
        // Calcular capital pendiente primero
        const capital = await calculatePendingCapital();
        setPendingCapital(capital);
        
        const localCalculation = await calculateLocalLateFee();
        if (localCalculation) {
          console.log('🔍 LateFeeInfo: Estableciendo cálculo local:', localCalculation);
          setLateFeeCalculation(localCalculation);
        } else {
          console.log('🔍 LateFeeInfo: No se pudo calcular la mora local');
        }
      } else {
        console.log('🔍 LateFeeInfo: No hay días de mora o mora deshabilitada');
        setLateFeeCalculation(null);
        // Aún así calcular el capital pendiente para la proyección
        const capital = await calculatePendingCapital();
        setPendingCapital(capital);
      }
    };

    calculateAndSetLateFee();
  }, [loanId, daysOverdue, lateFeeEnabled, lateFeeRate, gracePeriodDays, lateFeeCalculationType, remainingBalance, nextPaymentDate, maxLateFee, amount, term, payment_frequency]);

  // Cargar historial de mora optimizado (incluyendo pagos)
  const loadHistory = async () => {
    try {
      setHistoryLoading(true);
      
      // Obtener historial de cálculos de mora
      const { data: historyData, error: historyError } = await supabase
        .from('late_fee_history')
        .select('*')
        .eq('loan_id', loanId)
        .order('calculation_date', { ascending: false })
        .limit(50);

      if (historyError) {
        console.error('Error fetching late fee history:', historyError);
      }

      // Obtener pagos de mora
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('payments')
        .select('*')
        .eq('loan_id', loanId)
        .not('late_fee', 'is', null)
        .gt('late_fee', 0)
        .order('payment_date', { ascending: false })
        .limit(50);

      if (paymentsError) {
        console.error('Error fetching late fee payments:', paymentsError);
      }

      // Combinar y ordenar por fecha
      const combinedHistory = [
        ...(historyData || []).map(record => ({
          ...record,
          type: 'calculation',
          date: record.calculation_date,
          description: 'Cálculo de mora'
        })),
        ...(paymentsData || []).map(payment => ({
          id: `payment_${payment.id}`,
          type: 'payment',
          date: payment.payment_date,
          description: 'Pago de mora',
          late_fee_amount: payment.late_fee,
          total_late_fee: payment.late_fee,
          days_overdue: 0,
          late_fee_rate: 0,
          payment_method: payment.payment_method,
          reference_number: payment.reference_number
        }))
      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setLateFeeHistory(combinedHistory);
    } catch (error) {
      console.error('Error loading late fee history:', error);
      setLateFeeHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleShowHistory = () => {
    setShowHistory(true);
    loadHistory();
  };


  const getLateFeeStatus = () => {
    if (!lateFeeEnabled) return { status: 'disabled', color: 'bg-gray-100 text-gray-600', icon: Settings };
    // Usar solo los días calculados por el lateFeeCalculator
    const effectiveDaysOverdue = calculatedDaysOverdue;
    if (effectiveDaysOverdue <= 0) return { status: 'current', color: 'bg-green-100 text-green-700', icon: Clock };
    if (effectiveDaysOverdue <= 7) return { status: 'warning', color: 'bg-yellow-100 text-yellow-700', icon: AlertTriangle };
    return { status: 'overdue', color: 'bg-red-100 text-red-700', icon: AlertTriangle };
  };

  const lateFeeStatus = getLateFeeStatus();
  const StatusIcon = lateFeeStatus.icon;

  if (!lateFeeEnabled) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Settings className="h-4 w-4" />
        <span>Mora deshabilitada</span>
      </div>
    );
  }

  // Mostrar siempre la información de mora, incluso cuando es 0

  return (
    <>
      <div className="space-y-2">
        {/* Indicador principal de mora */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StatusIcon className="h-4 w-4" />
            <Badge className={lateFeeStatus.color}>
              {calculatedDaysOverdue} día{calculatedDaysOverdue !== 1 ? 's' : ''} vencido{calculatedDaysOverdue !== 1 ? 's' : ''}
            </Badge>
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDetails(true)}
              className="h-6 w-6 p-0"
              title="Ver detalles de mora"
            >
              <Calculator className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleShowHistory}
              className="h-6 w-6 p-0"
              title="Ver historial de mora"
            >
              <History className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowConfig(true)}
              className="h-6 w-6 p-0"
              title="Configurar mora"
            >
              <Cog className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Información de mora actual */}
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-red-800">Mora Actual</span>
            <div className="flex items-center gap-2">
              {loading && (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
              )}
              <span className="text-lg font-bold text-red-700">
                ${(lateFeeCalculation?.late_fee_amount || currentLateFee).toLocaleString()}
              </span>
            </div>
          </div>
          
          {lateFeeCalculation && (
            <div className="text-xs text-red-600 space-y-1">
              <div className="flex justify-between">
                <span>Tasa {lateFeeCalculationType === 'daily' ? 'diaria' : lateFeeCalculationType === 'monthly' ? 'mensual' : 'compuesta'}:</span>
                <span>{lateFeeRate}%</span>
              </div>
              <div className="flex justify-between">
                <span>Días de gracia:</span>
                <span>{gracePeriodDays}</span>
              </div>
              <div className="flex justify-between">
                <span>Mora calculada:</span>
                <span>${lateFeeCalculation.late_fee_amount.toLocaleString()}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal de detalles de mora */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Detalles de Mora - {clientName}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Información básica */}
            <Card>
              <CardContent className="p-4">
                <h4 className="font-semibold mb-3">Información del Préstamo</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Balance pendiente:</span>
                    <div className="font-semibold">${remainingBalance.toLocaleString()}</div>
                  </div>
                  <div>
                    <span className="text-gray-600">Fecha de pago:</span>
                    <div className="font-semibold">{new Date(nextPaymentDate).toLocaleDateString()}</div>
                  </div>
                  <div>
                    <span className="text-gray-600">Días vencidos:</span>
                    <div className="font-semibold text-red-600">{calculatedDaysOverdue} días</div>
                  </div>
                  <div>
                    <span className="text-gray-600">Días de gracia:</span>
                    <div className="font-semibold">{gracePeriodDays} días</div>
                  </div>
                  <div>
                    <span className="text-gray-600">Tipo de cálculo:</span>
                    <div className="font-semibold">
                      {lateFeeCalculationType === 'daily' ? 'Diario' : 
                       lateFeeCalculationType === 'monthly' ? 'Mensual' : 'Compuesto'}
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-600">Tasa de mora:</span>
                    <div className="font-semibold">{lateFeeRate}%</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Cálculo de mora */}
            {lateFeeCalculation && (
              <Card>
                <CardContent className="p-4">
                  <h4 className="font-semibold mb-3">Cálculo de Mora</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                      <span className="text-red-800 font-medium">Mora Actual:</span>
                      <span className="text-red-700 font-bold text-lg">
                        ${lateFeeCalculation?.late_fee_amount.toLocaleString() || '0'}
                      </span>
                    </div>
                    {/* Debug info */}
                    {process.env.NODE_ENV === 'development' && (
                      <div className="text-xs text-gray-500 mt-2">
                        Debug: lateFeeCalculation={JSON.stringify(lateFeeCalculation)}, currentLateFee={currentLateFee}
                      </div>
                    )}
                    
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Tasa de mora:</span>
                        <div className="font-semibold">{lateFeeRate}% {lateFeeCalculationType === 'daily' ? 'por día' : lateFeeCalculationType === 'monthly' ? 'por mes' : 'compuesta'}</div>
                      </div>
                      <div>
                        <span className="text-gray-600">Mora calculada:</span>
                        <div className="font-semibold">${lateFeeCalculation.late_fee_amount.toLocaleString()}</div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Desglose detallado por cuota */}
            {lateFeeCalculation && (
              <Card>
                <CardContent className="p-4">
                  <h4 className="font-semibold mb-3">Desglose por Cuota</h4>
                  <div className="space-y-2">
                    <div className="text-sm text-gray-600">
                      💡 Días de mora FIJOS desde la fecha de vencimiento. Al pagar una cuota se marca como PAGADA pero mantiene sus días originales.
                    </div>
                    {(() => {
                      // Usar el desglose manual calculado en calculateLocalLateFee
                      return manualBreakdownState.map((item, index) => {
                        return (
                          <div key={index} className={`flex justify-between items-center p-2 rounded ${
                            item.isPaid ? 'bg-green-50 border border-green-200' : 'bg-gray-50'
                          }`}>
                            <div className="text-sm">
                              <span className="font-medium">
                                Cuota {item.installment}
                                {item.isPaid && <span className="ml-2 text-green-600 text-xs">✅ PAGADA</span>}
                              </span>
                              <div className="text-xs text-gray-600">
                                Vence: {new Date(item.dueDate).toLocaleDateString()} |
                                {item.daysOverdue} días de atraso
                              </div>
                            </div>
                            <div className="text-right">
                              <div className={`font-semibold ${item.isPaid ? 'text-green-600' : 'text-red-600'}`}>
                                {item.isPaid ? 'PAGADA' : `$${item.lateFee.toLocaleString()}`}
                              </div>
                              <div className="text-xs text-gray-500">
                                Capital: ${item.principal.toLocaleString()}
                              </div>
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Proyección de mora mejorada */}
            <Card>
              <CardContent className="p-4">
                <h4 className="font-semibold mb-3">Proyección de Mora</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>En 7 días más:</span>
                    <span className="font-semibold">
                      ${lateFeeCalculation ? (lateFeeCalculation.late_fee_amount + (pendingCapital * lateFeeRate / 100 * 7)).toLocaleString() : '0'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>En 15 días más:</span>
                    <span className="font-semibold">
                      ${lateFeeCalculation ? (lateFeeCalculation.late_fee_amount + (pendingCapital * lateFeeRate / 100 * 15)).toLocaleString() : '0'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>En 30 días más:</span>
                    <span className="font-semibold">
                      ${lateFeeCalculation ? (lateFeeCalculation.late_fee_amount + (pendingCapital * lateFeeRate / 100 * 30)).toLocaleString() : '0'}
                    </span>
                  </div>
                </div>
                <div className="mt-3 text-xs text-gray-600">
                  💡 Cálculo: Mora actual + (Capital pendiente × {lateFeeRate}% × días adicionales)
                  <br />
                  📊 Capital pendiente: ${pendingCapital.toLocaleString()} | Incremento diario: ${(pendingCapital * lateFeeRate / 100).toLocaleString()}
                  <br />
                  🔍 Tipo de cálculo: {lateFeeCalculationType === 'daily' ? 'Diario' : lateFeeCalculationType === 'monthly' ? 'Mensual' : 'Compuesto'}
                </div>
              </CardContent>
            </Card>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de historial de mora */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              Historial de Mora - {clientName}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {historyLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600 mx-auto"></div>
                <p className="text-gray-600 mt-2">Cargando historial...</p>
              </div>
            ) : lateFeeHistory.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <History className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                <h3 className="text-lg font-medium mb-2">Sin historial de mora</h3>
                <p className="text-gray-600">No hay registros de cálculo de mora para este préstamo</p>
              </div>
            ) : (
              <div className="space-y-3">
                {lateFeeHistory.map((record) => (
                  <Card key={record.id} className={`border-l-4 ${
                    record.type === 'payment' 
                      ? 'border-l-green-500 bg-green-50' 
                      : 'border-l-red-500 bg-red-50'
                  }`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {record.type === 'payment' ? (
                            <DollarSign className="h-4 w-4 text-green-600" />
                          ) : (
                            <TrendingUp className="h-4 w-4 text-red-600" />
                          )}
                          <span className="font-semibold">
                            {new Date(record.date).toLocaleDateString()}
                          </span>
                          <Badge variant={record.type === 'payment' ? 'default' : 'destructive'}>
                            {record.description}
                          </Badge>
                        </div>
                        {record.type === 'calculation' && (
                          <Badge variant="destructive">
                            {record.days_overdue} días
                          </Badge>
                        )}
                      </div>
                      
                      {record.type === 'payment' ? (
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="text-gray-600">Mora pagada:</span>
                            <div className="font-semibold text-green-600">
                              ${record.late_fee_amount.toLocaleString()}
                            </div>
                          </div>
                          <div>
                            <span className="text-gray-600">Método de pago:</span>
                            <div className="font-semibold capitalize">
                              {record.payment_method}
                            </div>
                          </div>
                          {record.reference_number && (
                            <div className="col-span-2">
                              <span className="text-gray-600">Referencia:</span>
                              <div className="font-semibold">{record.reference_number}</div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <span className="text-gray-600">Tasa aplicada:</span>
                            <div className="font-semibold">{record.late_fee_rate}%</div>
                          </div>
                          <div>
                            <span className="text-gray-600">Mora del período:</span>
                            <div className="font-semibold">${record.late_fee_amount.toLocaleString()}</div>
                          </div>
                          <div>
                            <span className="text-gray-600">Total acumulado:</span>
                            <div className="font-semibold">${record.total_late_fee.toLocaleString()}</div>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de configuración de mora */}
      <LateFeeConfigModal
        loanId={loanId}
        clientName={clientName}
        isOpen={showConfig}
        onClose={() => setShowConfig(false)}
        onConfigUpdated={() => {
          // Recargar el cálculo de mora cuando se actualice la configuración
          if (lateFeeEnabled) {
            calculateLocalLateFee().then(localCalculation => {
              if (localCalculation) {
                setLateFeeCalculation(localCalculation);
              }
            });
          }
        }}
        currentConfig={{
          late_fee_enabled: lateFeeEnabled,
        late_fee_rate: lateFeeRate,
        grace_period_days: gracePeriodDays,
        max_late_fee: maxLateFee,
        late_fee_calculation_type: lateFeeCalculationType
        }}
      />
    </>
  );
};
