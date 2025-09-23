import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { 
  Settings, 
  Save, 
  Globe, 
  Calculator,
  Info,
  AlertTriangle
} from 'lucide-react';

interface GlobalLateFeeConfig {
  default_late_fee_enabled: boolean;
  default_late_fee_rate: number;
  default_grace_period_days: number;
  default_max_late_fee: number;
  default_late_fee_calculation_type: 'daily' | 'monthly' | 'compound';
}

export const GlobalLateFeeConfig: React.FC = () => {
  const [config, setConfig] = useState<GlobalLateFeeConfig>({
    default_late_fee_enabled: true,
    default_late_fee_rate: 2.0,
    default_grace_period_days: 0,
    default_max_late_fee: 0,
    default_late_fee_calculation_type: 'daily'
  });
  const [loading, setLoading] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const { user } = useAuth();

  // Cargar configuración actual
  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('*')
        .eq('key', 'default_late_fee_config')
        .single();

      if (data && !error) {
        setConfig(JSON.parse(data.value));
      }
    } catch (error) {
      console.error('Error loading global late fee config:', error);
    }
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      
      // Primero intentar actualizar
      const { data: existingData, error: selectError } = await supabase
        .from('system_settings')
        .select('id')
        .eq('key', 'default_late_fee_config')
        .single();

      let error;
      
      if (existingData && !selectError) {
        // Si existe, actualizar
        const { error: updateError } = await supabase
          .from('system_settings')
          .update({
            value: JSON.stringify(config),
            updated_at: new Date().toISOString()
          })
          .eq('key', 'default_late_fee_config');
        error = updateError;
      } else {
        // Si no existe, insertar
        const { error: insertError } = await supabase
          .from('system_settings')
          .insert({
            key: 'default_late_fee_config',
            value: JSON.stringify(config),
            description: 'Configuración por defecto para la mora en nuevos préstamos'
          });
        error = insertError;
      }

      if (error) throw error;

      toast.success('Configuración global de mora guardada correctamente. La página se recargará para aplicar los cambios...');
      setShowDialog(false);
      
      // Recargar la página después de un breve delay para que el usuario vea el mensaje
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (error) {
      console.error('Error saving global late fee config:', error);
      toast.error('Error al guardar la configuración');
    } finally {
      setLoading(false);
    }
  };

  const getCalculationTypeDescription = (type: string) => {
    switch (type) {
      case 'daily':
        return 'Mora simple por día de retraso';
      case 'monthly':
        return 'Mora por mes completo de retraso';
      case 'compound':
        return 'Mora compuesta (interés sobre interés)';
      default:
        return '';
    }
  };

  return (
    <>
      <Card className="hover:shadow-md transition-shadow">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Globe className="h-5 w-5 text-blue-600" />
            Configuración Global de Mora
          </CardTitle>
          <p className="text-sm text-gray-600">
            Configuración por defecto para nuevos préstamos
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Resumen de configuración actual */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <div className="text-lg font-bold text-gray-800">
                {config.default_late_fee_enabled ? 'Habilitado' : 'Deshabilitado'}
              </div>
              <div className="text-xs text-gray-600">Estado</div>
            </div>
            
            <div className="text-center p-3 bg-blue-50 rounded-lg">
              <div className="text-lg font-bold text-blue-700">
                {config.default_late_fee_rate}%
              </div>
              <div className="text-xs text-blue-600">Tasa Diaria</div>
            </div>
            
            <div className="text-center p-3 bg-green-50 rounded-lg">
              <div className="text-lg font-bold text-green-700">
                {config.default_grace_period_days}
              </div>
              <div className="text-xs text-green-600">Días de Gracia</div>
            </div>
            
            <div className="text-center p-3 bg-orange-50 rounded-lg">
              <div className="text-lg font-bold text-orange-700 capitalize">
                {config.default_late_fee_calculation_type}
              </div>
              <div className="text-xs text-orange-600">Tipo</div>
            </div>
          </div>

          {/* Información adicional */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-blue-600 mt-0.5" />
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">¿Qué es la configuración global?</p>
                <p>
                  Esta configuración se aplicará automáticamente a todos los nuevos préstamos que crees. 
                  Puedes modificar la configuración individual de cada préstamo después de crearlo.
                </p>
              </div>
            </div>
          </div>

          <Button 
            onClick={() => setShowDialog(true)}
            className="w-full h-12 text-base font-semibold"
          >
            <Settings className="h-4 w-4 mr-2" />
            Configurar Valores por Defecto
          </Button>
        </CardContent>
      </Card>

      {/* Modal de configuración */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Configuración Global de Mora
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Habilitar/Deshabilitar mora por defecto */}
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <Label className="text-base font-semibold">Habilitar Mora por Defecto</Label>
                <p className="text-sm text-gray-600">Activar mora automáticamente en nuevos préstamos</p>
              </div>
              <Select
                value={config.default_late_fee_enabled ? 'enabled' : 'disabled'}
                onValueChange={(value) => setConfig({...config, default_late_fee_enabled: value === 'enabled'})}
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

            {config.default_late_fee_enabled && (
              <>
                {/* Tasa de mora por defecto */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="default_rate" className="text-sm font-semibold">
                      Tasa de Mora por Defecto (%)
                    </Label>
                    <Input
                      id="default_rate"
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={config.default_late_fee_rate}
                      onChange={(e) => setConfig({...config, default_late_fee_rate: parseFloat(e.target.value) || 0})}
                      className="h-12"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="default_grace" className="text-sm font-semibold">
                      Días de Gracia por Defecto
                    </Label>
                    <Input
                      id="default_grace"
                      type="number"
                      min="0"
                      max="30"
                      value={config.default_grace_period_days}
                      onChange={(e) => setConfig({...config, default_grace_period_days: parseInt(e.target.value) || 0})}
                      className="h-12"
                    />
                  </div>
                </div>

                {/* Tipo de cálculo y límite máximo */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="default_type" className="text-sm font-semibold">
                      Tipo de Cálculo por Defecto
                    </Label>
                    <Select
                      value={config.default_late_fee_calculation_type}
                      onValueChange={(value: 'daily' | 'monthly' | 'compound') => 
                        setConfig({...config, default_late_fee_calculation_type: value})
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
                      {getCalculationTypeDescription(config.default_late_fee_calculation_type)}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="default_max" className="text-sm font-semibold">
                      Mora Máxima por Defecto (RD$)
                    </Label>
                    <Input
                      id="default_max"
                      type="number"
                      min="0"
                      value={config.default_max_late_fee}
                      onChange={(e) => setConfig({...config, default_max_late_fee: parseFloat(e.target.value) || 0})}
                      className="h-12"
                      placeholder="0 (sin límite)"
                    />
                  </div>
                </div>

                {/* Vista previa */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Calculator className="h-5 w-5" />
                      Vista Previa
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div className="p-3 bg-blue-50 rounded-lg">
                        <div className="text-lg font-bold text-blue-700">
                          ${(100000 * config.default_late_fee_rate / 100).toLocaleString()}
                        </div>
                        <div className="text-sm text-blue-600">Por día</div>
                      </div>
                      <div className="p-3 bg-orange-50 rounded-lg">
                        <div className="text-lg font-bold text-orange-700">
                          ${(100000 * config.default_late_fee_rate / 100 * 7).toLocaleString()}
                        </div>
                        <div className="text-sm text-orange-600">Por semana</div>
                      </div>
                      <div className="p-3 bg-red-50 rounded-lg">
                        <div className="text-lg font-bold text-red-700">
                          ${(100000 * config.default_late_fee_rate / 100 * 30).toLocaleString()}
                        </div>
                        <div className="text-sm text-red-600">Por mes</div>
                      </div>
                    </div>
                    <p className="text-xs text-gray-600 mt-2 text-center">
                      Ejemplo con balance de RD$100,000
                    </p>
                  </CardContent>
                </Card>
              </>
            )}

            {/* Botones de acción */}
            <div className="flex gap-3 pt-4 border-t">
              <Button
                variant="outline"
                onClick={() => setShowDialog(false)}
                className="h-12 text-base font-semibold"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSave}
                disabled={loading}
                className="h-12 text-base font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 flex-1"
              >
                <Save className="h-4 w-4 mr-2" />
                {loading ? 'Guardando...' : 'Guardar Configuración'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
