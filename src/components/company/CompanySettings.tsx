import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, Save, Building, Globe, Phone, Mail, MapPin, CreditCard, Settings } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const CompanySettings = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    company_name: '',
    business_type: '',
    tax_id: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    state: '',
    postal_code: '',
    country: 'Dominican Republic',
    logo_url: '',
    website: '',
    description: '',
    currency: 'DOP',
    interest_rate_default: 15.0,
    late_fee_percentage: 5.0,
    grace_period_days: 3,
    min_loan_amount: 1000,
    max_loan_amount: 500000
  });

  useEffect(() => {
    if (user) {
      fetchCompanySettings();
    }
  }, [user]);

  const fetchCompanySettings = async () => {
    try {
      const { data, error } = await supabase
        .from('company_settings')
        .select('*')
        .eq('user_id', user?.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching company settings:', error);
        return;
      }

      if (data) {
        setFormData(data);
      }
    } catch (error) {
      console.error('Error in fetchCompanySettings:', error);
    }
  };

  const handleInputChange = (field: string, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSave = async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('company_settings')
        .upsert({
          ...formData,
          user_id: user.id,
          updated_at: new Date().toISOString()
        });

      if (error) {
        toast.error('Error al guardar la configuración');
        console.error('Error saving company settings:', error);
        return;
      }

      toast.success('Configuración guardada exitosamente');
    } catch (error) {
      console.error('Error in handleSave:', error);
      toast.error('Error al guardar la configuración');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Configuración de Empresa</h1>
        <Button onClick={handleSave} disabled={loading}>
          <Save className="h-4 w-4 mr-2" />
          {loading ? 'Guardando...' : 'Guardar Cambios'}
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Información General */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Building className="h-5 w-5 mr-2" />
              Información General
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="company_name">Nombre de la Empresa *</Label>
              <Input
                id="company_name"
                value={formData.company_name}
                onChange={(e) => handleInputChange('company_name', e.target.value)}
                placeholder="Ej: Mi Empresa de Préstamos"
              />
            </div>

            <div>
              <Label htmlFor="business_type">Tipo de Negocio</Label>
              <Select value={formData.business_type} onValueChange={(value) => handleInputChange('business_type', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar tipo de negocio" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="prestamos">Préstamos Personales</SelectItem>
                  <SelectItem value="financiera">Financiera</SelectItem>
                  <SelectItem value="cooperativa">Cooperativa</SelectItem>
                  <SelectItem value="banco">Banco</SelectItem>
                  <SelectItem value="otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="tax_id">RNC/Cédula</Label>
              <Input
                id="tax_id"
                value={formData.tax_id}
                onChange={(e) => handleInputChange('tax_id', e.target.value)}
                placeholder="000-00000000-0"
              />
            </div>

            <div>
              <Label htmlFor="description">Descripción</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="Descripción de tu empresa..."
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Información de Contacto */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Phone className="h-5 w-5 mr-2" />
              Información de Contacto
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="phone">Teléfono</Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => handleInputChange('phone', e.target.value)}
                placeholder="(809) 000-0000"
              />
            </div>

            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                placeholder="contacto@empresa.com"
              />
            </div>

            <div>
              <Label htmlFor="website">Sitio Web</Label>
              <Input
                id="website"
                value={formData.website}
                onChange={(e) => handleInputChange('website', e.target.value)}
                placeholder="https://www.empresa.com"
              />
            </div>

            <div>
              <Label htmlFor="address">Dirección</Label>
              <Input
                id="address"
                value={formData.address}
                onChange={(e) => handleInputChange('address', e.target.value)}
                placeholder="Calle, Número, Sector"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="city">Ciudad</Label>
                <Input
                  id="city"
                  value={formData.city}
                  onChange={(e) => handleInputChange('city', e.target.value)}
                  placeholder="Santo Domingo"
                />
              </div>
              <div>
                <Label htmlFor="postal_code">Código Postal</Label>
                <Input
                  id="postal_code"
                  value={formData.postal_code}
                  onChange={(e) => handleInputChange('postal_code', e.target.value)}
                  placeholder="10101"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Configuración Financiera */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <CreditCard className="h-5 w-5 mr-2" />
              Configuración Financiera
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="currency">Moneda</Label>
              <Select value={formData.currency} onValueChange={(value) => handleInputChange('currency', value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DOP">Peso Dominicano (DOP)</SelectItem>
                  <SelectItem value="USD">Dólar Americano (USD)</SelectItem>
                  <SelectItem value="EUR">Euro (EUR)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="interest_rate_default">Tasa de Interés por Defecto (%)</Label>
              <Input
                id="interest_rate_default"
                type="number"
                step="0.1"
                value={formData.interest_rate_default}
                onChange={(e) => handleInputChange('interest_rate_default', parseFloat(e.target.value))}
              />
            </div>

            <div>
              <Label htmlFor="late_fee_percentage">Mora por Atraso (%)</Label>
              <Input
                id="late_fee_percentage"
                type="number"
                step="0.1"
                value={formData.late_fee_percentage}
                onChange={(e) => handleInputChange('late_fee_percentage', parseFloat(e.target.value))}
              />
            </div>

            <div>
              <Label htmlFor="grace_period_days">Días de Gracia</Label>
              <Input
                id="grace_period_days"
                type="number"
                value={formData.grace_period_days}
                onChange={(e) => handleInputChange('grace_period_days', parseInt(e.target.value))}
              />
            </div>
          </CardContent>
        </Card>

        {/* Límites de Préstamos */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Settings className="h-5 w-5 mr-2" />
              Límites de Préstamos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="min_loan_amount">Monto Mínimo de Préstamo</Label>
                <Input
                  id="min_loan_amount"
                  type="number"
                  value={formData.min_loan_amount}
                  onChange={(e) => handleInputChange('min_loan_amount', parseFloat(e.target.value))}
                />
              </div>

              <div>
                <Label htmlFor="max_loan_amount">Monto Máximo de Préstamo</Label>
                <Input
                  id="max_loan_amount"
                  type="number"
                  value={formData.max_loan_amount}
                  onChange={(e) => handleInputChange('max_loan_amount', parseFloat(e.target.value))}
                />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Configuraciones Adicionales</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="max_term_months">Plazo Máximo (meses)</Label>
                  <Input
                    id="max_term_months"
                    type="number"
                    defaultValue="60"
                    placeholder="Plazo máximo en meses"
                  />
                </div>
                
                <div>
                  <Label htmlFor="min_term_months">Plazo Mínimo (meses)</Label>
                  <Input
                    id="min_term_months"
                    type="number"
                    defaultValue="6"
                    placeholder="Plazo mínimo en meses"
                  />
                </div>
                
                <div>
                  <Label htmlFor="max_interest_rate">Tasa Máxima de Interés (%)</Label>
                  <Input
                    id="max_interest_rate"
                    type="number"
                    step="0.1"
                    defaultValue="30"
                    placeholder="Tasa máxima permitida"
                  />
                </div>
                
                <div>
                  <Label htmlFor="min_interest_rate">Tasa Mínima de Interés (%)</Label>
                  <Input
                    id="min_interest_rate"
                    type="number"
                    step="0.1"
                    defaultValue="5"
                    placeholder="Tasa mínima permitida"
                  />
                </div>
                
                <div>
                  <Label htmlFor="payment_reminder_days">Días de Recordatorio de Pago</Label>
                  <Input
                    id="payment_reminder_days"
                    type="number"
                    defaultValue="3"
                    placeholder="Días antes del vencimiento"
                  />
                </div>
                
                <div>
                  <Label htmlFor="overdue_grace_days">Días de Gracia por Mora</Label>
                  <Input
                    id="overdue_grace_days"
                    type="number"
                    defaultValue="5"
                    placeholder="Días de gracia antes de aplicar mora"
                  />
                </div>
                
                <div>
                  <Label htmlFor="backup_frequency">Frecuencia de Respaldo</Label>
                  <Select defaultValue="daily">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Diario</SelectItem>
                      <SelectItem value="weekly">Semanal</SelectItem>
                      <SelectItem value="monthly">Mensual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="report_frequency">Frecuencia de Reportes</Label>
                  <Select defaultValue="monthly">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Semanal</SelectItem>
                      <SelectItem value="monthly">Mensual</SelectItem>
                      <SelectItem value="quarterly">Trimestral</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="space-y-4">
                <h4 className="font-medium">Configuraciones de Seguridad</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="session_timeout">Tiempo de Sesión (minutos)</Label>
                    <Input
                      id="session_timeout"
                      type="number"
                      defaultValue="480"
                      placeholder="Tiempo antes de cerrar sesión automáticamente"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="password_min_length">Longitud Mínima de Contraseña</Label>
                    <Input
                      id="password_min_length"
                      type="number"
                      defaultValue="8"
                      placeholder="Caracteres mínimos para contraseñas"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="max_login_attempts">Intentos Máximos de Login</Label>
                    <Input
                      id="max_login_attempts"
                      type="number"
                      defaultValue="5"
                      placeholder="Intentos antes de bloquear cuenta"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="lockout_duration">Duración de Bloqueo (minutos)</Label>
                    <Input
                      id="lockout_duration"
                      type="number"
                      defaultValue="30"
                      placeholder="Tiempo de bloqueo tras intentos fallidos"
                    />
                  </div>
                </div>
              </div>
              
              <div className="space-y-4">
                <h4 className="font-medium">Configuraciones de Notificaciones</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center space-x-2">
                    <input type="checkbox" defaultChecked className="rounded" />
                    <Label className="text-sm">Notificaciones por email</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input type="checkbox" defaultChecked className="rounded" />
                    <Label className="text-sm">Recordatorios de pago</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input type="checkbox" defaultChecked className="rounded" />
                    <Label className="text-sm">Alertas de mora</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input type="checkbox" className="rounded" />
                    <Label className="text-sm">Notificaciones SMS</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input type="checkbox" defaultChecked className="rounded" />
                    <Label className="text-sm">Reportes automáticos</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input type="checkbox" className="rounded" />
                    <Label className="text-sm">Alertas de seguridad</Label>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="font-medium">Configuraciones de Integración</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="whatsapp_api">API de WhatsApp</Label>
                  <Input
                    id="whatsapp_api"
                    placeholder="Token de API de WhatsApp"
                  />
                </div>
                
                <div>
                  <Label htmlFor="sms_provider">Proveedor SMS</Label>
                  <Select defaultValue="none">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Ninguno</SelectItem>
                      <SelectItem value="twilio">Twilio</SelectItem>
                      <SelectItem value="nexmo">Nexmo</SelectItem>
                      <SelectItem value="local">Proveedor Local</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="email_provider">Proveedor de Email</Label>
                  <Select defaultValue="smtp">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="smtp">SMTP</SelectItem>
                      <SelectItem value="sendgrid">SendGrid</SelectItem>
                      <SelectItem value="mailgun">Mailgun</SelectItem>
                      <SelectItem value="ses">Amazon SES</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="payment_gateway">Pasarela de Pago</Label>
                  <Select defaultValue="none">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Ninguna</SelectItem>
                      <SelectItem value="stripe">Stripe</SelectItem>
                      <SelectItem value="paypal">PayPal</SelectItem>
                      <SelectItem value="azul">Azul (RD)</SelectItem>
                      <SelectItem value="banreservas">BanReservas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            
            <div className="space-y-4">
              <h4 className="font-medium">Configuraciones de Cobranza</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="collection_strategy">Estrategia de Cobranza</Label>
                  <Select defaultValue="standard">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="standard">Estándar</SelectItem>
                      <SelectItem value="aggressive">Agresiva</SelectItem>
                      <SelectItem value="soft">Suave</SelectItem>
                      <SelectItem value="custom">Personalizada</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="auto_late_fees">Aplicar Moras Automáticamente</Label>
                  <Select defaultValue="yes">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">Sí</SelectItem>
                      <SelectItem value="no">No</SelectItem>
                      <SelectItem value="after_grace">Después del período de gracia</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="collection_calls_per_day">Llamadas de Cobranza por Día</Label>
                  <Input
                    id="collection_calls_per_day"
                    type="number"
                    defaultValue="3"
                    placeholder="Máximo de llamadas diarias"
                  />
                </div>
                
                <div>
                  <Label htmlFor="collection_start_time">Hora de Inicio de Cobranza</Label>
                  <Input
                    id="collection_start_time"
                    type="time"
                    defaultValue="08:00"
                  />
                </div>
                
                <div>
                  <Label htmlFor="collection_end_time">Hora de Fin de Cobranza</Label>
                  <Input
                    id="collection_end_time"
                    type="time"
                    defaultValue="18:00"
                  />
                </div>
                
                <div>
                  <Label htmlFor="weekend_collections">Cobranza en Fines de Semana</Label>
                  <Select defaultValue="no">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">Sí</SelectItem>
                      <SelectItem value="no">No</SelectItem>
                      <SelectItem value="saturday_only">Solo sábados</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            
            <div className="space-y-4">
              <h4 className="font-medium">Configuraciones de Riesgo</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="max_debt_to_income">Máximo Deuda/Ingreso (%)</Label>
                  <Input
                    id="max_debt_to_income"
                    type="number"
                    defaultValue="40"
                    placeholder="Porcentaje máximo de endeudamiento"
                  />
                </div>
                
                <div>
                  <Label htmlFor="min_credit_score_required">Score Mínimo Requerido</Label>
                  <Input
                    id="min_credit_score_required"
                    type="number"
                    defaultValue="600"
                    placeholder="Score crediticio mínimo"
                  />
                </div>
                
                <div>
                  <Label htmlFor="max_loans_per_client">Máximo Préstamos por Cliente</Label>
                  <Input
                    id="max_loans_per_client"
                    type="number"
                    defaultValue="3"
                    placeholder="Número máximo de préstamos simultáneos"
                  />
                </div>
                
                <div>
                  <Label htmlFor="risk_assessment_model">Modelo de Evaluación de Riesgo</Label>
                  <Select defaultValue="basic">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="basic">Básico</SelectItem>
                      <SelectItem value="advanced">Avanzado</SelectItem>
                      <SelectItem value="ai_powered">Con IA</SelectItem>
                      <SelectItem value="custom">Personalizado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="auto_approval_limit">Límite de Aprobación Automática</Label>
                  <Input
                    id="auto_approval_limit"
                    type="number"
                    defaultValue="25000"
                    placeholder="Monto máximo para aprobación automática"
                  />
                </div>
                
                <div>
                  <Label htmlFor="require_guarantor_above">Requerir Garante Arriba de</Label>
                  <Input
                    id="require_guarantor_above"
                    type="number"
                    defaultValue="100000"
                    placeholder="Monto que requiere garante"
                  />
                </div>
              </div>
            </div>
            
            <div className="space-y-4">
              <h4 className="font-medium">Configuraciones de Documentación</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center space-x-2">
                  <input type="checkbox" defaultChecked className="rounded" />
                  <Label className="text-sm">Requerir foto de cédula</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <input type="checkbox" defaultChecked className="rounded" />
                  <Label className="text-sm">Requerir comprobante de ingresos</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <input type="checkbox" className="rounded" />
                  <Label className="text-sm">Requerir referencias laborales</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <input type="checkbox" className="rounded" />
                  <Label className="text-sm">Requerir estados bancarios</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <input type="checkbox" defaultChecked className="rounded" />
                  <Label className="text-sm">Requerir foto del cliente</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <input type="checkbox" className="rounded" />
                  <Label className="text-sm">Requerir firma digital</Label>
                </div>
              </div>
            </div>
            
            <div className="space-y-4">
              <h4 className="font-medium">Configuraciones de Reportes</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="daily_report_time">Hora de Reporte Diario</Label>
                  <Input
                    id="daily_report_time"
                    type="time"
                    defaultValue="18:00"
                  />
                </div>
                
                <div>
                  <Label htmlFor="weekly_report_day">Día de Reporte Semanal</Label>
                  <Select defaultValue="friday">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monday">Lunes</SelectItem>
                      <SelectItem value="tuesday">Martes</SelectItem>
                      <SelectItem value="wednesday">Miércoles</SelectItem>
                      <SelectItem value="thursday">Jueves</SelectItem>
                      <SelectItem value="friday">Viernes</SelectItem>
                      <SelectItem value="saturday">Sábado</SelectItem>
                      <SelectItem value="sunday">Domingo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="monthly_report_day">Día de Reporte Mensual</Label>
                  <Input
                    id="monthly_report_day"
                    type="number"
                    min="1"
                    max="28"
                    defaultValue="1"
                    placeholder="Día del mes (1-28)"
                  />
                </div>
                
                <div>
                  <Label htmlFor="report_recipients">Destinatarios de Reportes</Label>
                  <Input
                    id="report_recipients"
                    placeholder="emails@ejemplo.com, separados por comas"
                  />
                </div>
              </div>
            </div>

            <div className="pt-4">
              <Label htmlFor="logo_upload">Logo de la Empresa</Label>
              <div className="mt-2 flex items-center space-x-4">
                {formData.logo_url && (
                  <img
                    src={formData.logo_url}
                    alt="Logo"
                    className="h-16 w-16 object-contain rounded border"
                  />
                )}
                <Button variant="outline">
                  <Upload className="h-4 w-4 mr-2" />
                  Subir Logo
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CompanySettings;