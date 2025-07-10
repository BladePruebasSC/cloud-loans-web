
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
        .single();

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
