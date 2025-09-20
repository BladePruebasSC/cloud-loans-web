import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useLateFee } from '@/hooks/useLateFee';
import { toast } from 'sonner';
import { 
  Settings, 
  Calculator, 
  Clock, 
  DollarSign, 
  AlertTriangle,
  Save,
  X,
  Info
} from 'lucide-react';

interface LateFeeConfigModalProps {
  loanId: string;
  clientName: string;
  isOpen: boolean;
  onClose: () => void;
  onConfigUpdated?: () => void;
  currentConfig?: {
    late_fee_enabled: boolean;
    late_fee_rate: number;
    grace_period_days: number;
    max_late_fee: number;
    late_fee_calculation_type: 'daily' | 'monthly' | 'compound';
  };
}

export const LateFeeConfigModal: React.FC<LateFeeConfigModalProps> = ({
  loanId,
  clientName,
  isOpen,
  onClose,
  onConfigUpdated,
  currentConfig
}) => {
  const [config, setConfig] = useState({
    late_fee_enabled: false,
    late_fee_rate: 2.0,
    grace_period_days: 0,
    max_late_fee: 0,
    late_fee_calculation_type: 'daily' as 'daily' | 'monthly' | 'compound'
  });
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState({
    dailyFee: 0,
    weeklyFee: 0,
    monthlyFee: 0
  });

  const { updateLateFeeConfig, calculateLateFee } = useLateFee();

  // Cargar configuración actual
  useEffect(() => {
    if (currentConfig) {
      setConfig(currentConfig);
    }
  }, [currentConfig]);

  // Calcular preview de mora
  useEffect(() => {
    if (config.late_fee_enabled && config.late_fee_rate > 0) {
      const baseAmount = 100000; // Monto base para el cálculo
      const dailyRate = config.late_fee_rate / 100;
      
      setPreview({
        dailyFee: baseAmount * dailyRate,
        weeklyFee: baseAmount * dailyRate * 7,
        monthlyFee: baseAmount * dailyRate * 30
      });
    }
  }, [config.late_fee_rate, config.late_fee_enabled]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setLoading(true);
      
      const success = await updateLateFeeConfig(loanId, config);
      
      if (success) {
        toast.success('Configuración de mora actualizada correctamente');
        onConfigUpdated?.();
        onClose();
      } else {
        toast.error('Error al actualizar la configuración');
      }
    } catch (error) {
      console.error('Error updating late fee config:', error);
      toast.error('Error al actualizar la configuración');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setConfig({
      late_fee_enabled: false,
      late_fee_rate: 2.0,
      grace_period_days: 0,
      max_late_fee: 0,
      late_fee_calculation_type: 'daily'
    });
  };

  const getCalculationTypeDescription = (type: string) => {
    switch (type) {
      case 'daily':
        return 'Mora simple: Se calcula por cada día de retraso';
      case 'monthly':
        return 'Mora mensual: Se calcula por mes completo de retraso';
      case 'compound':
        return 'Mora compuesta: Interés sobre interés (crecimiento exponencial)';
      default:
        return '';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Configuración de Mora - {clientName}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Configuración básica */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Calculator className="h-5 w-5" />
                Configuración Básica
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Habilitar/Deshabilitar mora */}
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div>
                  <Label className="text-base font-semibold">Habilitar Mora</Label>
                  <p className="text-sm text-gray-600">Activar el cálculo automático de mora para este préstamo</p>
                </div>
                <Select
                  value={config.late_fee_enabled ? 'enabled' : 'disabled'}
                  onValueChange={(value) => setConfig({...config, late_fee_enabled: value === 'enabled'})}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="enabled">Habilitado</SelectItem>
                    <SelectItem value="disabled">Deshabilitado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {config.late_fee_enabled && (
                <>
                  {/* Tasa de mora */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="late_fee_rate" className="text-sm font-semibold">
                        Tasa de Mora por Día (%)
                      </Label>
                      <Input
                        id="late_fee_rate"
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        value={config.late_fee_rate}
                        onChange={(e) => setConfig({...config, late_fee_rate: parseFloat(e.target.value) || 0})}
                        className="h-12"
                        placeholder="2.0"
                      />
                      <p className="text-xs text-gray-600">
                        Porcentaje diario sobre el balance pendiente
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="grace_period_days" className="text-sm font-semibold">
                        Días de Gracia
                      </Label>
                      <Input
                        id="grace_period_days"
                        type="number"
                        min="0"
                        max="30"
                        value={config.grace_period_days}
                        onChange={(e) => setConfig({...config, grace_period_days: parseInt(e.target.value) || 0})}
                        className="h-12"
                        placeholder="0"
                      />
                      <p className="text-xs text-gray-600">
                        Días sin mora después del vencimiento
                      </p>
                    </div>
                  </div>

                  {/* Tipo de cálculo y límite máximo */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="calculation_type" className="text-sm font-semibold">
                        Tipo de Cálculo
                      </Label>
                      <Select
                        value={config.late_fee_calculation_type}
                        onValueChange={(value: 'daily' | 'monthly' | 'compound') => 
                          setConfig({...config, late_fee_calculation_type: value})
                        }
                      >
                        <SelectTrigger className="h-12">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">Diario</SelectItem>
                          <SelectItem value="monthly">Mensual</SelectItem>
                          <SelectItem value="compound">Compuesto</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-gray-600">
                        {getCalculationTypeDescription(config.late_fee_calculation_type)}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="max_late_fee" className="text-sm font-semibold">
                        Mora Máxima (RD$)
                      </Label>
                      <Input
                        id="max_late_fee"
                        type="number"
                        min="0"
                        value={config.max_late_fee}
                        onChange={(e) => setConfig({...config, max_late_fee: parseFloat(e.target.value) || 0})}
                        className="h-12"
                        placeholder="0 (sin límite)"
                      />
                      <p className="text-xs text-gray-600">
                        0 = Sin límite máximo
                      </p>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Preview de cálculo */}
          {config.late_fee_enabled && config.late_fee_rate > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Info className="h-5 w-5" />
                  Vista Previa de Cálculo
                </CardTitle>
                <p className="text-sm text-gray-600">
                  Ejemplo con un balance de RD$100,000
                </p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <Clock className="h-6 w-6 mx-auto mb-2 text-blue-600" />
                    <div className="text-lg font-bold text-blue-700">
                      ${preview.dailyFee.toLocaleString()}
                    </div>
                    <div className="text-sm text-blue-600">Por día</div>
                  </div>
                  
                  <div className="text-center p-4 bg-orange-50 rounded-lg">
                    <AlertTriangle className="h-6 w-6 mx-auto mb-2 text-orange-600" />
                    <div className="text-lg font-bold text-orange-700">
                      ${preview.weeklyFee.toLocaleString()}
                    </div>
                    <div className="text-sm text-orange-600">Por semana</div>
                  </div>
                  
                  <div className="text-center p-4 bg-red-50 rounded-lg">
                    <DollarSign className="h-6 w-6 mx-auto mb-2 text-red-600" />
                    <div className="text-lg font-bold text-red-700">
                      ${preview.monthlyFee.toLocaleString()}
                    </div>
                    <div className="text-sm text-red-600">Por mes</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Configuración actual */}
          {currentConfig && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Configuración Actual</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Estado:</span>
                    <div>
                      <Badge variant={currentConfig.late_fee_enabled ? 'default' : 'secondary'}>
                        {currentConfig.late_fee_enabled ? 'Habilitado' : 'Deshabilitado'}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-600">Tasa:</span>
                    <div className="font-semibold">{currentConfig.late_fee_rate}%</div>
                  </div>
                  <div>
                    <span className="text-gray-600">Gracia:</span>
                    <div className="font-semibold">{currentConfig.grace_period_days} días</div>
                  </div>
                  <div>
                    <span className="text-gray-600">Tipo:</span>
                    <div className="font-semibold capitalize">{currentConfig.late_fee_calculation_type}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Botones de acción */}
          <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={handleReset}
              className="h-12 text-base font-semibold"
            >
              <X className="h-4 w-4 mr-2" />
              Restablecer
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="h-12 text-base font-semibold"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="h-12 text-base font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 flex-1 sm:flex-none"
            >
              <Save className="h-4 w-4 mr-2" />
              {loading ? 'Guardando...' : 'Guardar Configuración'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
