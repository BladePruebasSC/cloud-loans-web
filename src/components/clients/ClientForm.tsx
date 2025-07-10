
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { User, Heart, Briefcase, CreditCard, Users, Star } from 'lucide-react';

const ClientForm = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('personal');

  const [formData, setFormData] = useState({
    // Información Personal
    full_name: '',
    dni: '',
    birth_date: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    
    // Información Marital
    marital_status: '',
    spouse_name: '',
    spouse_phone: '',
    
    // Contactos de Emergencia
    emergency_contact_name: '',
    emergency_contact_phone: '',
    
    // Información Laboral
    workplace_name: '',
    workplace_address: '',
    workplace_phone: '',
    occupation: '',
    years_employed: '',
    monthly_income: '',
    supervisor_name: '',
    supervisor_phone: '',
    
    // Información Bancaria
    bank_name: '',
    account_number: '',
    routing_number: '',
    
    // Información Crediticia
    credit_score: '',
    
    // Referencias
    references: [
      { name: '', phone: '', relationship: '' },
      { name: '', phone: '', relationship: '' },
    ]
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleReferenceChange = (index: number, field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      references: prev.references.map((ref, i) => 
        i === index ? { ...ref, [field]: value } : ref
      )
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    try {
      const clientData = {
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
        workplace_name: formData.workplace_name || null,
        workplace_address: formData.workplace_address || null,
        workplace_phone: formData.workplace_phone || null,
        occupation: formData.occupation || null,
        years_employed: formData.years_employed ? parseInt(formData.years_employed) : null,
        monthly_income: formData.monthly_income ? parseFloat(formData.monthly_income) : null,
        supervisor_name: formData.supervisor_name || null,
        supervisor_phone: formData.supervisor_phone || null,
        bank_name: formData.bank_name || null,
        account_number: formData.account_number || null,
        routing_number: formData.routing_number || null,
        credit_score: formData.credit_score ? parseInt(formData.credit_score) : null,
        references_json: formData.references.filter(ref => ref.name || ref.phone),
        status: 'active'
      };

      const { error } = await supabase
        .from('clients')
        .insert([clientData]);

      if (error) {
        console.error('Error creating client:', error);
        toast.error('Error al crear el cliente');
        return;
      }

      toast.success('Cliente creado exitosamente');
      navigate('/clientes');
    } catch (error) {
      console.error('Error in handleSubmit:', error);
      toast.error('Error inesperado al crear el cliente');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Nuevo Cliente</h1>
        <Button variant="outline" onClick={() => navigate('/clientes')}>
          Cancelar
        </Button>
      </div>

      <form onSubmit={handleSubmit}>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="personal" className="flex items-center">
              <User className="h-4 w-4 mr-1" />
              Personal
            </TabsTrigger>
            <TabsTrigger value="marital" className="flex items-center">
              <Heart className="h-4 w-4 mr-1" />
              Marital
            </TabsTrigger>
            <TabsTrigger value="laboral" className="flex items-center">
              <Briefcase className="h-4 w-4 mr-1" />
              Laboral
            </TabsTrigger>
            <TabsTrigger value="bancaria" className="flex items-center">
              <CreditCard className="h-4 w-4 mr-1" />
              Bancaria
            </TabsTrigger>
            <TabsTrigger value="referencias" className="flex items-center">
              <Users className="h-4 w-4 mr-1" />
              Referencias
            </TabsTrigger>
            <TabsTrigger value="crediticia" className="flex items-center">
              <Star className="h-4 w-4 mr-1" />
              Crediticia
            </TabsTrigger>
          </TabsList>

          <TabsContent value="personal" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Información Personal</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="full_name">Nombre Completo *</Label>
                    <Input
                      id="full_name"
                      value={formData.full_name}
                      onChange={(e) => handleInputChange('full_name', e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="dni">Cédula/DNI *</Label>
                    <Input
                      id="dni"
                      value={formData.dni}
                      onChange={(e) => handleInputChange('dni', e.target.value)}
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
                  <div>
                    <Label htmlFor="phone">Teléfono *</Label>
                    <Input
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => handleInputChange('phone', e.target.value)}
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
                    />
                  </div>
                  <div>
                    <Label htmlFor="city">Ciudad</Label>
                    <Input
                      id="city"
                      value={formData.city}
                      onChange={(e) => handleInputChange('city', e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="address">Dirección</Label>
                  <Textarea
                    id="address"
                    value={formData.address}
                    onChange={(e) => handleInputChange('address', e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Contacto de Emergencia</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="emergency_contact_name">Nombre</Label>
                    <Input
                      id="emergency_contact_name"
                      value={formData.emergency_contact_name}
                      onChange={(e) => handleInputChange('emergency_contact_name', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="emergency_contact_phone">Teléfono</Label>
                    <Input
                      id="emergency_contact_phone"
                      value={formData.emergency_contact_phone}
                      onChange={(e) => handleInputChange('emergency_contact_phone', e.target.value)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="marital" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Estado Civil</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="marital_status">Estado Civil</Label>
                  <Select value={formData.marital_status} onValueChange={(value) => handleInputChange('marital_status', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar estado civil" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="single">Soltero/a</SelectItem>
                      <SelectItem value="married">Casado/a</SelectItem>
                      <SelectItem value="divorced">Divorciado/a</SelectItem>
                      <SelectItem value="widowed">Viudo/a</SelectItem>
                      <SelectItem value="union">Unión Libre</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {(formData.marital_status === 'married' || formData.marital_status === 'union') && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="spouse_name">Nombre del Cónyuge</Label>
                      <Input
                        id="spouse_name"
                        value={formData.spouse_name}
                        onChange={(e) => handleInputChange('spouse_name', e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="spouse_phone">Teléfono del Cónyuge</Label>
                      <Input
                        id="spouse_phone"
                        value={formData.spouse_phone}
                        onChange={(e) => handleInputChange('spouse_phone', e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="laboral" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Información Laboral</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="workplace_name">Empresa</Label>
                    <Input
                      id="workplace_name"
                      value={formData.workplace_name}
                      onChange={(e) => handleInputChange('workplace_name', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="occupation">Ocupación</Label>
                    <Input
                      id="occupation"
                      value={formData.occupation}
                      onChange={(e) => handleInputChange('occupation', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="years_employed">Años Trabajando</Label>
                    <Input
                      id="years_employed"
                      type="number"
                      value={formData.years_employed}
                      onChange={(e) => handleInputChange('years_employed', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="monthly_income">Ingresos Mensuales</Label>
                    <Input
                      id="monthly_income"
                      type="number"
                      value={formData.monthly_income}
                      onChange={(e) => handleInputChange('monthly_income', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="workplace_phone">Teléfono de la Empresa</Label>
                    <Input
                      id="workplace_phone"
                      value={formData.workplace_phone}
                      onChange={(e) => handleInputChange('workplace_phone', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="supervisor_name">Nombre del Supervisor</Label>
                    <Input
                      id="supervisor_name"
                      value={formData.supervisor_name}
                      onChange={(e) => handleInputChange('supervisor_name', e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="workplace_address">Dirección de la Empresa</Label>
                  <Textarea
                    id="workplace_address"
                    value={formData.workplace_address}
                    onChange={(e) => handleInputChange('workplace_address', e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="bancaria" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Información Bancaria</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="bank_name">Banco</Label>
                    <Input
                      id="bank_name"
                      value={formData.bank_name}
                      onChange={(e) => handleInputChange('bank_name', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="account_number">Número de Cuenta</Label>
                    <Input
                      id="account_number"
                      value={formData.account_number}
                      onChange={(e) => handleInputChange('account_number', e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="routing_number">Número de Ruta</Label>
                    <Input
                      id="routing_number"
                      value={formData.routing_number}
                      onChange={(e) => handleInputChange('routing_number', e.target.value)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="referencias" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Referencias Personales</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {formData.references.map((reference, index) => (
                  <div key={index} className="border rounded-lg p-4">
                    <h3 className="font-medium mb-3">Referencia {index + 1}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <Label htmlFor={`reference_name_${index}`}>Nombre</Label>
                        <Input
                          id={`reference_name_${index}`}
                          value={reference.name}
                          onChange={(e) => handleReferenceChange(index, 'name', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor={`reference_phone_${index}`}>Teléfono</Label>
                        <Input
                          id={`reference_phone_${index}`}
                          value={reference.phone}
                          onChange={(e) => handleReferenceChange(index, 'phone', e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor={`reference_relationship_${index}`}>Relación</Label>
                        <Input
                          id={`reference_relationship_${index}`}
                          value={reference.relationship}
                          onChange={(e) => handleReferenceChange(index, 'relationship', e.target.value)}
                          placeholder="Ej: Amigo, Familiar"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="crediticia" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Información Crediticia</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="credit_score">Score Crediticio</Label>
                  <Input
                    id="credit_score"
                    type="number"
                    min="300"
                    max="850"
                    value={formData.credit_score}
                    onChange={(e) => handleInputChange('credit_score', e.target.value)}
                    placeholder="Ej: 750"
                  />
                  <p className="text-sm text-gray-600 mt-1">
                    Rango típico: 300-850 (Mayor es mejor)
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end space-x-4 mt-6">
          <Button type="button" variant="outline" onClick={() => navigate('/clientes')}>
            Cancelar
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? 'Guardando...' : 'Crear Cliente'}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default ClientForm;
