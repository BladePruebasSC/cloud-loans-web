import React, { useEffect, useState, FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Loader2, UserPlus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

type ClientFormState = {
  full_name: string;
  dni: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  neighborhood: string;
  birth_date: string;
  occupation: string;
  monthly_income: string;
  credit_score: string;
  status: 'active' | 'inactive' | 'blacklisted';
};

const defaultFormState: ClientFormState = {
  full_name: '',
  dni: '',
  phone: '',
  email: '',
  address: '',
  city: '',
  neighborhood: '',
  birth_date: '',
  occupation: '',
  monthly_income: '',
  credit_score: '',
  status: 'active'
};

const ClientForm = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ id: string }>();
  const { companyId, user } = useAuth();

  const isEditing = location.pathname.startsWith('/clientes/editar');
  const [formData, setFormData] = useState<ClientFormState>(defaultFormState);
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isEditing && params.id) {
      fetchClient(params.id);
    }
  }, [isEditing, params.id]);

  const fetchClient = async (clientId: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        toast.error('Cliente no encontrado');
        navigate('/clientes');
        return;
      }

      setFormData({
        full_name: data.full_name || '',
        dni: data.dni || '',
        phone: data.phone || '',
        email: data.email || '',
        address: data.address || '',
        city: data.city || '',
        neighborhood: data.neighborhood || '',
        birth_date: data.birth_date || '',
        occupation: data.occupation || '',
        monthly_income: data.monthly_income ? String(data.monthly_income) : '',
        credit_score: data.credit_score ? String(data.credit_score) : '',
        status: (data.status as ClientFormState['status']) || 'active'
      });
    } catch (error) {
      console.error('Error cargando cliente', error);
      toast.error('No se pudo cargar la información del cliente');
      navigate('/clientes');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: keyof ClientFormState, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!companyId || !user?.id) {
      toast.error('No se pudo identificar la empresa');
      return;
    }

    if (!formData.full_name || !formData.dni || !formData.phone) {
      toast.error('Nombre, cédula y teléfono son obligatorios');
      return;
    }

    const payload = {
      full_name: formData.full_name.trim(),
      dni: formData.dni.trim(),
      phone: formData.phone.trim(),
      email: formData.email.trim() || null,
      address: formData.address.trim() || null,
      city: formData.city.trim() || null,
      neighborhood: formData.neighborhood.trim() || null,
      birth_date: formData.birth_date || null,
      occupation: formData.occupation.trim() || null,
      monthly_income: formData.monthly_income ? Number(formData.monthly_income) : null,
      credit_score: formData.credit_score ? Number(formData.credit_score) : null,
      status: formData.status,
      user_id: companyId,
      updated_at: new Date().toISOString()
    };

    setSaving(true);

    try {
      if (isEditing && params.id) {
        const { error } = await supabase.from('clients').update(payload).eq('id', params.id);
        if (error) throw error;
        toast.success('Cliente actualizado correctamente');
      } else {
        const { error } = await supabase
          .from('clients')
          .insert([{ ...payload, created_at: new Date().toISOString() }]);
        if (error) throw error;
        toast.success('Cliente creado correctamente');
      }
      navigate('/clientes');
    } catch (error) {
      console.error('Error guardando cliente', error);
      toast.error('No se pudo guardar el cliente');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <div className="flex items-center gap-2 text-gray-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          Cargando información del cliente...
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <p className="text-sm text-gray-500 uppercase tracking-wide">
            {isEditing ? 'Edición' : 'Registro'}
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            {isEditing ? 'Editar cliente' : 'Nuevo cliente'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Completa los datos principales del cliente para gestionar préstamos y seguimientos.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-start">
          <Button variant="outline" onClick={() => navigate('/clientes')} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <UserPlus className="h-4 w-4 mr-2" />
            {isEditing ? 'Guardar cambios' : 'Crear cliente'}
          </Button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Información principal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Nombre completo *</Label>
                <Input
                  value={formData.full_name}
                  onChange={(e) => handleChange('full_name', e.target.value)}
                  placeholder="Ej: Juan Pérez"
                  required
                />
              </div>
              <div>
                <Label>Cédula / DNI *</Label>
                <Input
                  value={formData.dni}
                  onChange={(e) => handleChange('dni', e.target.value)}
                  placeholder="000-0000000-0"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Teléfono *</Label>
                <Input
                  value={formData.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  placeholder="+1 809 000 0000"
                  required
                />
              </div>
              <div>
                <Label>Correo electrónico</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  placeholder="cliente@correo.com"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Ciudad</Label>
                <Input
                  value={formData.city}
                  onChange={(e) => handleChange('city', e.target.value)}
                  placeholder="Santo Domingo"
                />
              </div>
              <div>
                <Label>Barrio / Sector</Label>
                <Input
                  value={formData.neighborhood}
                  onChange={(e) => handleChange('neighborhood', e.target.value)}
                  placeholder="Ensanche, residencial..."
                />
              </div>
              <div>
                <Label>Estado</Label>
                <Select value={formData.status} onValueChange={(value) => handleChange('status', value as ClientFormState['status'])}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Activo</SelectItem>
                    <SelectItem value="inactive">Inactivo</SelectItem>
                    <SelectItem value="blacklisted">Bloqueado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Dirección</Label>
              <Textarea
                value={formData.address}
                onChange={(e) => handleChange('address', e.target.value)}
                placeholder="Calle, número, referencias..."
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Información financiera</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Ocupación</Label>
                <Input
                  value={formData.occupation}
                  onChange={(e) => handleChange('occupation', e.target.value)}
                  placeholder="Empleado, comerciante..."
                />
              </div>
              <div>
                <Label>Ingreso mensual (DOP)</Label>
                <Input
                  type="number"
                  min="0"
                  value={formData.monthly_income}
                  onChange={(e) => handleChange('monthly_income', e.target.value)}
                  placeholder="35000"
                />
              </div>
              <div>
                <Label>Score crediticio</Label>
                <Input
                  type="number"
                  min="0"
                  max="1000"
                  value={formData.credit_score}
                  onChange={(e) => handleChange('credit_score', e.target.value)}
                  placeholder="700"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Fecha de nacimiento</Label>
                <Input
                  type="date"
                  value={formData.birth_date}
                  onChange={(e) => handleChange('birth_date', e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
};

export default ClientForm;

