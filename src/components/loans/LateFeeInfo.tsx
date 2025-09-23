import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useLateFee, LateFeeCalculation, LateFeeHistory } from '@/hooks/useLateFee';
import { calculateLateFee as calculateLateFeeUtil } from '@/utils/lateFeeCalculator';
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
  clientName
}) => {
  const [showDetails, setShowDetails] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [lateFeeCalculation, setLateFeeCalculation] = useState<LateFeeCalculation | null>(null);
  const [lateFeeHistory, setLateFeeHistory] = useState<LateFeeHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const { calculateLateFee, getLateFeeHistory, loading } = useLateFee();

  // Función para calcular la mora localmente (consistente con PaymentForm)
  const calculateLocalLateFee = () => {
    if (!lateFeeEnabled || !lateFeeRate) {
      return null;
    }

    const calculation = calculateLateFeeUtil({
      remaining_balance: remainingBalance,
      next_payment_date: nextPaymentDate,
      late_fee_rate: lateFeeRate,
      grace_period_days: gracePeriodDays,
      max_late_fee: maxLateFee,
      late_fee_calculation_type: lateFeeCalculationType,
      late_fee_enabled: lateFeeEnabled
    });

    return {
      days_overdue: calculation.daysOverdue,
      late_fee_amount: calculation.lateFeeAmount,
      total_late_fee: calculation.totalLateFee
    };
  };

  // Calcular días de mora
  const today = new Date();
  const paymentDate = new Date(nextPaymentDate);
  const daysOverdue = Math.max(0, Math.ceil((today.getTime() - paymentDate.getTime()) / (1000 * 60 * 60 * 24)) - gracePeriodDays);

  // Calcular mora localmente cuando cambien los parámetros
  useEffect(() => {
    if (daysOverdue > 0 && lateFeeEnabled) {
      const localCalculation = calculateLocalLateFee();
      if (localCalculation) {
        setLateFeeCalculation(localCalculation);
      }
    } else {
      setLateFeeCalculation(null);
    }
  }, [loanId, daysOverdue, lateFeeEnabled, lateFeeRate, gracePeriodDays, lateFeeCalculationType, remainingBalance, nextPaymentDate, maxLateFee]);

  // Cargar historial de mora optimizado
  const loadHistory = async () => {
    try {
      setHistoryLoading(true);
      const { data, error } = await supabase
        .from('late_fee_history')
        .select('*')
        .eq('loan_id', loanId)
        .order('calculation_date', { ascending: false })
        .limit(50); // Limitar a 50 registros para mejor rendimiento

      if (error) {
        console.error('Error fetching late fee history:', error);
        setLateFeeHistory([]);
      } else {
        setLateFeeHistory(data || []);
      }
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
    if (daysOverdue <= 0) return { status: 'current', color: 'bg-green-100 text-green-700', icon: Clock };
    if (daysOverdue <= 7) return { status: 'warning', color: 'bg-yellow-100 text-yellow-700', icon: AlertTriangle };
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

  if (daysOverdue <= 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-green-600">
        <Clock className="h-4 w-4" />
        <span>Al día</span>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {/* Indicador principal de mora */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <StatusIcon className="h-4 w-4" />
            <Badge className={lateFeeStatus.color}>
              {daysOverdue} día{daysOverdue !== 1 ? 's' : ''} de mora
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
                    <span className="text-gray-600">Días de mora:</span>
                    <div className="font-semibold text-red-600">{daysOverdue} días</div>
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
                        ${(lateFeeCalculation?.late_fee_amount || currentLateFee).toLocaleString()}
                      </span>
                    </div>
                    
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

            {/* Proyección de mora */}
            <Card>
              <CardContent className="p-4">
                <h4 className="font-semibold mb-3">Proyección de Mora</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>En 7 días más:</span>
                    <span className="font-semibold">
                      ${((remainingBalance * lateFeeRate / 100) * (daysOverdue + 7)).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>En 15 días más:</span>
                    <span className="font-semibold">
                      ${((remainingBalance * lateFeeRate / 100) * (daysOverdue + 15)).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>En 30 días más:</span>
                    <span className="font-semibold">
                      ${((remainingBalance * lateFeeRate / 100) * (daysOverdue + 30)).toLocaleString()}
                    </span>
                  </div>
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
                  <Card key={record.id} className="border-l-4 border-l-red-500">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-red-600" />
                          <span className="font-semibold">
                            {new Date(record.calculation_date).toLocaleDateString()}
                          </span>
                        </div>
                        <Badge variant="destructive">
                          {record.days_overdue} días
                        </Badge>
                      </div>
                      
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
          if (daysOverdue > 0 && lateFeeEnabled) {
            const localCalculation = calculateLocalLateFee();
            if (localCalculation) {
              setLateFeeCalculation(localCalculation);
            }
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
