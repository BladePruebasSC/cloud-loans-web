
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { User, Phone, Mail, MapPin, Briefcase, Heart, DollarSign, Building } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ClientFormProps {
  onSuccess?: () => void;
}

const ClientForm = ({ onSuccess }: ClientFormProps) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    // Información Personal
    full_name: '',
    dni: '',
    birth_date: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    marital_status: '',
    spouse_name: '',
    spouse_phone: '',
    
    // Contacto de Emergencia
    emergency_contact_name: '',
    emergency_contact_phone: '',
    
    // Información Laboral
    occupation: '',
    workplace_name: '',
    workplace_address: '',
    workplace_phone: '',
    years_employed: '',
    supervisor_name: '',
    supervisor_phone: '',
    monthly_income: '',
    
    // Información Bancaria
    bank_name: '',
    account_number: '',
    routing_number: '',
    
    // Referencias
    reference1_name: '',
    reference1_phone: '',
    reference1_relationship: '',
    reference2_name: '',
    reference2_phone: '',
    reference2_relationship: '',
    
    credit_score: ''
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    try {
      const references = [
        {
          name: formData.reference1_name,
          phone: formData.reference1_phone,
          relationship: formData.reference1_relationship
        },
        {
          name: formData.reference2_name,
          phone: formData.reference2_phone,
          relationship: formData.reference2_relationship
        }
      ].filter(ref => ref.name && ref.phone);

      const { error } = await supabase
        .from('clients')
        .insert({
          user_id: user.id,
          full_name: formData.full_name,
          dni: formData.dni,
          birth_date: formData.birth_date || null,
          phone: formData.phone,
          email: formData.email || null,
          address: formData.address || null,
          city: formData.city || null,
          marital_status: formData.marital_status || null,
          spouse_name: formData.spouse_name || null,
          spouse_phone: formData.spouse_phone || null,
          emergency_contact_name: formData.emergency_contact_name || null,
          emergency_contact_phone: formData.emergency_contact_phone || null,
          occupation: formData.occupation || null,
          workplace_name: formData.workplace_name || null,
          workplace_address: formData.workplace_address || null,
          workplace_phone: formData.workplace_phone || null,
          years_employed: formData.years_employed ? parseInt(formData.years_employed) : null,
          supervisor_name: formData.supervisor_name || null,
          supervisor_phone: formData.supervisor_phone || null,
          monthly_income: formData.monthly_income ? parseFloat(formData.monthly_income) : null,
          bank_name: formData.bank_name || null,
          account_number: formData.account_number || null,
          routing_number: formData.routing_number || null,
          references_json: references,
          credit_score: formData.credit_score ? parseInt(formData.credit_score) : 0
        });

      if (error) {
        toast.error('Error al crear el cliente');
        console.error('Error creating client:', error);
        return;
      }

      toast.success('Cliente creado exitosamente');
      onSuccess?.();
    } catch (error) {
      console.error('Error in handleSubmit:', error);
      toast.error('Error al crear el cliente');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Nuevo Cliente</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Información Personal */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <User className="h-5 w-5 mr-2" />
                Información Personal
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="full_name">Nombre Completo *</Label>
                <Input
                  id="full_name"
                  value={formData.full_name}
                  onChange={(e) => handleInputChange('full_name', e.target.value)}
                  placeholder="Nombre y apellidos"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="dni">Cédula/DNI *</Label>
                  <Input
                    id="dni"
                    value={formData.dni}
                    onChange={(e) => handleInputChange('dni', e.target.value)}
                    placeholder="000-0000000-0"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="birth_date">Fecha de Nacimiento</Label>
                  <Input
                    id="birth_date"
                    type="date"
                    value={formData.birth_date}
                    onChange={(e) => handleInputChange('birth_date', e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="phone">Teléfono *</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => handleInputChange('phone', e.target.value)}
                    placeholder="(809) 000-0000"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    placeholder="cliente@email.com"
                  />
                </div>
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

              <div>
                <Label htmlFor="city">Ciudad</Label>
                <Input
                  id="city"
                  value={formData.city}
                  onChange={(e) => handleInputChange('city', e.target.value)}
                  placeholder="Santo Domingo"
                />
              </div>
            </CardContent>
          </Card>

          {/* Estado Civil */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Heart className="h-5 w-5 mr-2" />
                Estado Civil
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="marital_status">Estado Civil</Label>
                <Select value={formData.marital_status} onValueChange={(value) => handleInputChange('marital_status', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar estado civil" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="soltero">Soltero/a</SelectItem>
                    <SelectItem value="casado">Casado/a</SelectItem>
                    <SelectItem value="divorciado">Divorciado/a</SelectItem>
                    <SelectItem value="viudo">Viudo/a</SelectItem>
                    <SelectItem value="union_libre">Unión Libre</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {(formData.marital_status === 'casado' || formData.marital_status === 'union_libre') && (
                <>
                  <div>
                    <Label htmlFor="spouse_name">Nombre del Cónyuge</Label>
                    <Input
                      id="spouse_name"
                      value={formData.spouse_name}
                      onChange={(e) => handleInputChange('spouse_name', e.target.value)}
                      placeholder="Nombre del cónyuge"
                    />
                  </div>
                  <div>
                    <Label htmlFor="spouse_phone">Teléfono del Cónyuge</Label>
                    <Input
                      id="spouse_phone"
                      value={formData.spouse_phone}
                      onChange={(e) => handleInputChange('spouse_phone', e.target.value)}
                      placeholder="(809) 000-0000"
                    />
                  </div>
                </>
              )}

              <div>
                <Label htmlFor="emergency_contact_name">Contacto de Emergencia</Label>
                <Input
                  id="emergency_contact_name"
                  value={formData.emergency_contact_name}
                  onChange={(e) => handleInputChange('emergency_contact_name', e.target.value)}
                  placeholder="Nombre completo"
                />
              </div>

              <div>
                <Label htmlFor="emergency_contact_phone">Teléfono de Emergencia</Label>
                <Input
                  id="emergency_contact_phone"
                  value={formData.emergency_contact_phone}
                  onChange={(e) => handleInputChange('emergency_contact_phone', e.target.value)}
                  placeholder="(809) 000-0000"
                />
              </div>
            </CardContent>
          </Card>

          {/* Información Laboral */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Briefcase className="h-5 w-5 mr-2" />
                Información Laboral
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="occupation">Ocupación</Label>
                <Input
                  id="occupation"
                  value={formData.occupation}
                  onChange={(e) => handleInputChange('occupation', e.target.value)}
                  placeholder="Ej: Contador, Ingeniero, etc."
                />
              </div>

              <div>
                <Label htmlFor="workplace_name">Empresa donde Trabaja</Label>
                <Input
                  id="workplace_name"
                  value={formData.workplace_name}
                  onChange={(e) => handleInputChange('workplace_name', e.target.value)}
                  placeholder="Nombre de la empresa"
                />
              </div>

              <div>
                <Label htmlFor="workplace_address">Dirección del Trabajo</Label>
                <Input
                  id="workplace_address"
                  value={formData.workplace_address}
                  onChange={(e) => handleInputChange('workplace_address', e.target.value)}
                  placeholder="Dirección completa"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="workplace_phone">Teléfono del Trabajo</Label>
                  <Input
                    id="workplace_phone"
                    value={formData.workplace_phone}
                    onChange={(e) => handleInputChange('workplace_phone', e.target.value)}
                    placeholder="(809) 000-0000"
                  />
                </div>
                <div>
                  <Label htmlFor="years_employed">Años Trabajando</Label>
                  <Input
                    id="years_employed"
                    type="number"
                    value={formData.years_employed}
                    onChange={(e) => handleInputChange('years_employed', e.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="supervisor_name">Nombre del Supervisor</Label>
                <Input
                  id="supervisor_name"
                  value={formData.supervisor_name}
                  onChange={(e) => handleInputChange('supervisor_name', e.target.value)}
                  placeholder="Nombre completo"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="supervisor_phone">Teléfono del Supervisor</Label>
                  <Input
                    id="supervisor_phone"
                    value={formData.supervisor_phone}
                    onChange={(e) => handleInputChange('supervisor_phone', e.target.value)}
                    placeholder="(809) 000-0000"
                  />
                </div>
                <div>
                  <Label htmlFor="monthly_income">Ingresos Mensuales</Label>
                  <Input
                    id="monthly_income"
                    type="number"
                    step="0.01"
                    value={formData.monthly_income}
                    onChange={(e) => handleInputChange('monthly_income', e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Información Bancaria */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Building className="h-5 w-5 mr-2" />
                Información Bancaria
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="bank_name">Banco</Label>
                <Input
                  id="bank_name"
                  value={formData.bank_name}
                  onChange={(e) => handleInputChange('bank_name', e.target.value)}
                  placeholder="Nombre del banco"
                />
              </div>

              <div>
                <Label htmlFor="account_number">Número de Cuenta</Label>
                <Input
                  id="account_number"
                  value={formData.account_number}
                  onChange={(e) => handleInputChange('account_number', e.target.value)}
                  placeholder="000000000000"
                />
              </div>

              <div>
                <Label htmlFor="routing_number">Número de Ruta</Label>
                <Input
                  id="routing_number"
                  value={formData.routing_number}
                  onChange={(e) => handleInputChange('routing_number', e.target.value)}
                  placeholder="000000000"
                />
              </div>

              <div>
                <Label htmlFor="credit_score">Score Crediticio</Label>
                <Input
                  id="credit_score"
                  type="number"
                  min="300"
                  max="850"
                  value={formData.credit_score}
                  onChange={(e) => handleInputChange('credit_score', e.target.value)}
                  placeholder="700"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Referencias */}
        <Card>
          <CardHeader>
            <CardTitle>Referencias Personales</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h4 className="font-medium">Referencia #1</h4>
                <div>
                  <Label htmlFor="reference1_name">Nombre Completo</Label>
                  <Input
                    id="reference1_name"
                    value={formData.reference1_name}
                    onChange={(e) => handleInputChange('reference1_name', e.target.value)}
                    placeholder="Nombre completo"
                  />
                </div>
                <div>
                  <Label htmlFor="reference1_phone">Teléfono</Label>
                  <Input
                    id="reference1_phone"
                    value={formData.reference1_phone}
                    onChange={(e) => handleInputChange('reference1_phone', e.target.value)}
                    placeholder="(809) 000-0000"
                  />
                </div>
                <div>
                  <Label htmlFor="reference1_relationship">Parentesco/Relación</Label>
                  <Input
                    id="reference1_relationship"
                    value={formData.reference1_relationship}
                    onChange={(e) => handleInputChange('reference1_relationship', e.target.value)}
                    placeholder="Ej: Hermano, Amigo, etc."
                  />
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="font-medium">Referencia #2</h4>
                <div>
                  <Label htmlFor="reference2_name">Nombre Completo</Label>
                  <Input
                    id="reference2_name"
                    value={formData.reference2_name}
                    onChange={(e) => handleInputChange('reference2_name', e.target.value)}
                    placeholder="Nombre completo"
                  />
                </div>
                <div>
                  <Label htmlFor="reference2_phone">Teléfono</Label>
                  <Input
                    id="reference2_phone"
                    value={formData.reference2_phone}
                    onChange={(e) => handleInputChange('reference2_phone', e.target.value)}
                    placeholder="(809) 000-0000"
                  />
                </div>
                <div>
                  <Label htmlFor="reference2_relationship">Parentesco/Relación</Label>
                  <Input
                    id="reference2_relationship"
                    value={formData.reference2_relationship}
                    onChange={(e) => handleInputChange('reference2_relationship', e.target.value)}
                    placeholder="Ej: Hermano, Amigo, etc."
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end space-x-4">
          <Button type="button" variant="outline">
            Cancelar
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? 'Guardando...' : 'Guardar Cliente'}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default ClientForm;
