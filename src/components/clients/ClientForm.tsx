import React, { useEffect, useState, FormEvent, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Loader2, UserPlus, Camera, Upload, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

// Lista de provincias de República Dominicana
const PROVINCES = [
  'Distrito Nacional',
  'Santo Domingo',
  'Santiago',
  'La Altagracia',
  'San Cristóbal',
  'La Vega',
  'Puerto Plata',
  'Duarte',
  'Espaillat',
  'San Pedro de Macorís',
  'La Romana',
  'Azua',
  'San Juan',
  'Peravia',
  'Barahona',
  'Valverde',
  'Monte Plata',
  'Hato Mayor',
  'San José de Ocoa',
  'Dajabón',
  'Bahoruco',
  'El Seibo',
  'Hermanas Mirabal',
  'Independencia',
  'María Trinidad Sánchez',
  'Monseñor Nouel',
  'Monte Cristi',
  'Pedernales',
  'Samaná',
  'Sánchez Ramírez',
  'Santiago Rodríguez',
  'Elías Piña'
];

// Lista de bancos dominicanos
const DOMINICAN_BANKS = [
  'Banco Popular Dominicano',
  'Banco de Reservas',
  'Banco BHD León',
  'Banco del Progreso',
  'Banco Santa Cruz',
  'Banco López de Haro',
  'Banco Vimenca',
  'Banco Ademi',
  'Banco Caribe',
  'Banco Promerica',
  'Banco BDI',
  'Banco Múltiple Activo',
  'Banco Unión',
  'Banco Peravia',
  'Banco de Ahorro y Crédito',
  'Otro'
];

// Clasificaciones por color
const COLOR_CLASSIFICATIONS = [
  'Sin color asignado',
  'Rojo',
  'Verde',
  'Azul',
  'Amarillo',
  'Naranja',
  'Morado',
  'Rosa',
  'Gris'
];

type ClientFormState = {
  // Datos personales
  first_name: string;
  last_name: string;
  nickname: string;
  dni: string;
  nationality: string;
  birth_date: string;
  gender: string;
  marital_status: string;
  photo_url: string;
  
  // Datos básicos
  occupation: string;
  monthly_income: string;
  housing: string;
  dependents: string;
  employment_status: string;
  rnc: string;
  
  // Datos de contacto
  whatsapp: string;
  phone: string;
  phone_secondary: string;
  email: string;
  
  // Direcciones
  address: string;
  province: string;
  municipality: string;
  sector: string;
  collection_route: string;
  workplace_name: string;
  workplace_address: string;
  
  // Datos bancarios
  card_number: string;
  bank_user: string;
  bank_code: string;
  bank_token_identifier: string;
  bank_name: string;
  
  // Otros
  recommended_by: string;
  color_classification: string;
  visible_in_loan_data: string;
  custom_field_1: string;
  custom_field_2: string;
  attachment_url: string;
  
  // Campos existentes
  city: string;
  neighborhood: string;
  credit_score: string;
  status: 'active' | 'inactive' | 'blacklisted';
};

const defaultFormState: ClientFormState = {
  first_name: '',
  last_name: '',
  nickname: '',
  dni: '',
  nationality: 'Dominicano',
  birth_date: '',
  gender: '',
  marital_status: '',
  photo_url: '',
  occupation: '',
  monthly_income: '',
  housing: '',
  dependents: '',
  employment_status: '',
  rnc: '',
  whatsapp: '',
  phone: '',
  phone_secondary: '',
  email: '',
  address: '',
  province: '',
  municipality: '',
  sector: '',
  collection_route: '',
  workplace_name: '',
  workplace_address: '',
  card_number: '',
  bank_user: '',
  bank_code: '',
  bank_token_identifier: '',
  bank_name: '',
  recommended_by: '',
  color_classification: 'Sin color asignado',
  visible_in_loan_data: 'SI',
  custom_field_1: '',
  custom_field_2: '',
  attachment_url: '',
  city: '',
  neighborhood: '',
  credit_score: '',
  status: 'active'
};

// Función para formatear cédula dominicana: 000-0000000-0
const formatDni = (value: string): string => {
  const numbers = value.replace(/\D/g, '');
  const limited = numbers.slice(0, 11);
  
  if (limited.length <= 3) {
    return limited;
  } else if (limited.length <= 10) {
    return `${limited.slice(0, 3)}-${limited.slice(3)}`;
  } else {
    return `${limited.slice(0, 3)}-${limited.slice(3, 10)}-${limited.slice(10)}`;
  }
};

// Función para formatear teléfono
const formatPhone = (value: string): string => {
  const numbers = value.replace(/\D/g, '');
  if (numbers.length === 0) return '';
  
  if (numbers.length <= 3) {
    return `(${numbers}`;
  } else if (numbers.length <= 6) {
    return `(${numbers.slice(0, 3)}) ${numbers.slice(3)}`;
  } else {
    return `(${numbers.slice(0, 3)}) ${numbers.slice(3, 6)}-${numbers.slice(6, 10)}`;
  }
};

const ClientForm = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ id: string }>();
  const { companyId, user, profile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [photoPreview, setPhotoPreview] = useState<string>('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);

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

      if (error) throw error;
      if (!data) {
        toast.error('Cliente no encontrado');
        navigate('/clientes');
        return;
      }

      // Separar full_name en first_name y last_name si existe
      const fullName = data.full_name || '';
      const nameParts = fullName.split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';

      const loadedData: ClientFormState = {
        first_name: data.first_name || firstName,
        last_name: data.last_name || lastName,
        nickname: data.nickname || '',
        dni: data.dni ? formatDni(data.dni) : '',
        nationality: data.nationality || 'Dominicano',
        birth_date: data.birth_date || '',
        gender: data.gender || '',
        marital_status: data.marital_status || '',
        photo_url: data.photo_url || '',
        occupation: data.occupation || '',
        monthly_income: data.monthly_income ? String(data.monthly_income) : '',
        housing: data.housing ? String(data.housing) : '',
        dependents: data.dependents ? String(data.dependents) : '',
        employment_status: data.employment_status || '',
        rnc: data.rnc || '',
        whatsapp: data.whatsapp || '',
        phone: data.phone || '',
        phone_secondary: data.phone_secondary || '',
        email: data.email || '',
        address: data.address || '',
        province: data.province || '',
        municipality: data.municipality || '',
        sector: data.sector || '',
        collection_route: data.collection_route || '',
        workplace_name: data.workplace_name || '',
        workplace_address: data.workplace_address || '',
        card_number: data.card_number || '',
        bank_user: data.bank_user || '',
        bank_code: data.bank_code || '',
        bank_token_identifier: data.bank_token_identifier || '',
        bank_name: data.bank_name || '',
        recommended_by: data.recommended_by || '',
        color_classification: data.color_classification || 'Sin color asignado',
        visible_in_loan_data: data.visible_in_loan_data === false ? 'NO' : 'SI',
        custom_field_1: data.custom_field_1 || '',
        custom_field_2: data.custom_field_2 || '',
        attachment_url: data.attachment_url || '',
        city: data.city || '',
        neighborhood: data.neighborhood || '',
        credit_score: data.credit_score ? String(data.credit_score) : '',
        status: (data.status as ClientFormState['status']) || 'active'
      };
      
      setFormData(loadedData);
      if (loadedData.photo_url) {
        setPhotoPreview(loadedData.photo_url);
      }
    } catch (error) {
      console.error('Error cargando cliente', error);
      toast.error('No se pudo cargar la información del cliente');
      navigate('/clientes');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: keyof ClientFormState, value: string) => {
    let formattedValue = value;
    
    if (field === 'dni') {
      formattedValue = formatDni(value);
    } else if (field === 'phone' || field === 'whatsapp' || field === 'phone_secondary') {
      formattedValue = formatPhone(value);
    }
    
    setFormData((prev) => ({
      ...prev,
      [field]: formattedValue
    }));
  };

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Por favor selecciona una imagen');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('La imagen debe ser menor a 5MB');
      return;
    }

    setUploadingPhoto(true);
    try {
      if (!user?.id) {
        throw new Error('Usuario no autenticado');
      }

      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      // Usar el formato que requieren las políticas: user-{uid}/client-photos/...
      const filePath = `user-${user.id}/client-photos/${fileName}`;

      // Subir a Supabase Storage (bucket 'documents')
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Obtener URL pública
      const { data: { publicUrl } } = supabase.storage
        .from('documents')
        .getPublicUrl(filePath);

      setFormData(prev => ({ ...prev, photo_url: publicUrl }));
      setPhotoPreview(publicUrl);
      toast.success('Foto subida exitosamente');
    } catch (error) {
      console.error('Error subiendo foto', error);
      toast.error('Error al subir la foto');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleAttachmentUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingAttachment(true);
    try {
      if (!user?.id) {
        throw new Error('Usuario no autenticado');
      }

      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${file.name}`;
      // Usar el formato que requieren las políticas: user-{uid}/client-attachments/...
      const filePath = `user-${user.id}/client-attachments/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Obtener URL pública
      const { data: { publicUrl } } = supabase.storage
        .from('documents')
        .getPublicUrl(filePath);

      setFormData(prev => ({ ...prev, attachment_url: publicUrl }));
      toast.success('Archivo adjunto subido exitosamente');
    } catch (error) {
      console.error('Error subiendo archivo', error);
      toast.error('Error al subir el archivo');
    } finally {
      setUploadingAttachment(false);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!companyId || !user?.id) {
      toast.error('No se pudo identificar la empresa');
      return;
    }

    // Validaciones
    if (!formData.first_name || !formData.last_name) {
      toast.error('Nombre y apellido son obligatorios');
      return;
    }

    if (!formData.dni) {
      toast.error('La cédula es obligatoria');
      return;
    }

    if (!formData.phone && !formData.whatsapp) {
      toast.error('Al menos un teléfono (principal o WhatsApp) es obligatorio');
      return;
    }

    // Limpiar formato de DNI
    const cleanDni = formData.dni.replace(/\D/g, '');
    
    // Limpiar teléfonos
    const cleanPhone = formData.phone.replace(/\D/g, '');
    const cleanWhatsapp = formData.whatsapp.replace(/\D/g, '');
    const cleanPhoneSecondary = formData.phone_secondary.replace(/\D/g, '');
    
    // Formatear teléfono principal con +1
    let formattedPhone = cleanPhone;
    if (formattedPhone.startsWith('1') && formattedPhone.length > 10) {
      formattedPhone = formattedPhone.slice(1);
    }
    formattedPhone = formattedPhone.slice(0, 10);
    const finalPhone = formattedPhone ? `+1${formattedPhone}` : formData.phone.trim();

    // Construir full_name desde first_name y last_name
    const fullName = `${formData.first_name.trim()} ${formData.last_name.trim()}`.trim();

    const payload: any = {
      full_name: fullName,
      first_name: formData.first_name.trim(),
      last_name: formData.last_name.trim(),
      nickname: formData.nickname.trim() || null,
      dni: cleanDni || formData.dni.trim(),
      nationality: formData.nationality || 'Dominicano',
      birth_date: formData.birth_date || null,
      gender: formData.gender || null,
      marital_status: formData.marital_status || null,
      photo_url: formData.photo_url || null,
      occupation: formData.occupation.trim() || null,
      monthly_income: formData.monthly_income ? Number(formData.monthly_income) : null,
      housing: formData.housing ? Number(formData.housing) : null,
      dependents: formData.dependents ? Number(formData.dependents) : null,
      employment_status: formData.employment_status.trim() || null,
      rnc: formData.rnc.trim() || null,
      whatsapp: cleanWhatsapp ? `+1${cleanWhatsapp.slice(0, 10)}` : null,
      phone: finalPhone || formData.phone.trim(),
      phone_secondary: cleanPhoneSecondary ? `+1${cleanPhoneSecondary.slice(0, 10)}` : null,
      email: formData.email.trim() || null,
      address: formData.address.trim() || null,
      province: formData.province || null,
      municipality: formData.municipality || null,
      sector: formData.sector || null,
      collection_route: formData.collection_route || null,
      workplace_name: formData.workplace_name.trim() || null,
      workplace_address: formData.workplace_address.trim() || null,
      card_number: formData.card_number.trim() || null,
      bank_user: formData.bank_user.trim() || null,
      bank_code: formData.bank_code.trim() || null,
      bank_token_identifier: formData.bank_token_identifier.trim() || null,
      bank_name: formData.bank_name || null,
      recommended_by: formData.recommended_by.trim() || null,
      color_classification: formData.color_classification === 'Sin color asignado' ? null : formData.color_classification,
      visible_in_loan_data: formData.visible_in_loan_data === 'SI',
      custom_field_1: formData.custom_field_1.trim() || null,
      custom_field_2: formData.custom_field_2.trim() || null,
      attachment_url: formData.attachment_url || null,
      city: formData.city.trim() || null,
      neighborhood: formData.neighborhood.trim() || null,
      credit_score: formData.credit_score ? Number(formData.credit_score) : null,
      status: formData.status,
      user_id: companyId,
      created_by: user.id,
      updated_at: new Date().toISOString()
    };

    setSaving(true);

    try {
      if (isEditing && params.id) {
        const { error } = await supabase
          .from('clients')
          .update(payload)
          .eq('id', params.id);
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
    } catch (error: any) {
      console.error('Error guardando cliente', error);
      toast.error(error.message || 'No se pudo guardar el cliente');
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
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <p className="text-sm text-gray-500 uppercase tracking-wide">
            {isEditing ? 'Edición' : 'Registro'}
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            {isEditing ? 'Editar cliente' : 'Nuevo cliente'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Completa todos los datos del cliente para una gestión completa.
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
        {/* Foto del cliente */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                {photoPreview ? (
                  <div className="relative">
                    <img
                      src={photoPreview}
                      alt="Foto del cliente"
                      className="w-32 h-32 rounded-full object-cover border-4 border-gray-200"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setPhotoPreview('');
                        setFormData(prev => ({ ...prev, photo_url: '' }));
                      }}
                      className="absolute top-0 right-0 bg-red-500 text-white rounded-full p-1 hover:bg-red-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="w-32 h-32 rounded-full border-4 border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:border-blue-500 transition-colors"
                  >
                    <Camera className="h-8 w-8 text-gray-400" />
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-2">Selecciona una imagen</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingPhoto}
                >
                  {uploadingPhoto ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Subiendo...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Subir foto
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Datos personales */}
        <Card>
          <CardHeader>
            <CardTitle>Datos personales</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Nombres *</Label>
                <Input
                  value={formData.first_name}
                  onChange={(e) => handleChange('first_name', e.target.value)}
                  placeholder="Nombre del cliente"
                  required
                />
              </div>
              <div>
                <Label>Apellidos *</Label>
                <Input
                  value={formData.last_name}
                  onChange={(e) => handleChange('last_name', e.target.value)}
                  placeholder="Apellido del cliente"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Apodo</Label>
                <Input
                  value={formData.nickname}
                  onChange={(e) => handleChange('nickname', e.target.value)}
                  placeholder="Apodo del cliente"
                />
              </div>
              <div>
                <Label>Doc. Identidad *</Label>
                <Input
                  value={formData.dni}
                  onChange={(e) => handleChange('dni', e.target.value)}
                  placeholder="000-0000000-0"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Nacionalidad</Label>
                <Select value={formData.nationality || undefined} onValueChange={(value) => handleChange('nationality', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar nacionalidad" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Dominicano">Dominicano</SelectItem>
                    <SelectItem value="Haitiano">Haitiano</SelectItem>
                    <SelectItem value="Estadounidense">Estadounidense</SelectItem>
                    <SelectItem value="Español">Español</SelectItem>
                    <SelectItem value="Otro">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Fecha Nacimiento *</Label>
                <Input
                  type="date"
                  value={formData.birth_date}
                  onChange={(e) => handleChange('birth_date', e.target.value)}
                  required
                />
              </div>
              <div>
                <Label>Sexo</Label>
                <RadioGroup value={formData.gender} onValueChange={(value) => handleChange('gender', value)}>
                  <div className="flex gap-4">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="MASCULINO" id="gender-m" />
                      <Label htmlFor="gender-m" className="cursor-pointer">MASCULINO</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="FEMENINO" id="gender-f" />
                      <Label htmlFor="gender-f" className="cursor-pointer">FEMENINO</Label>
                    </div>
                  </div>
                </RadioGroup>
              </div>
            </div>
            <div>
              <Label>Estado Civil</Label>
              <Input
                value={formData.marital_status}
                onChange={(e) => handleChange('marital_status', e.target.value)}
                placeholder="Estado civil del cliente"
              />
            </div>
          </CardContent>
        </Card>

        {/* Datos básicos */}
        <Card>
          <CardHeader>
            <CardTitle>Datos básicos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Ocupación</Label>
                <Input
                  value={formData.occupation}
                  onChange={(e) => handleChange('occupation', e.target.value)}
                  placeholder="Ocupación del cliente"
                />
              </div>
              <div>
                <Label>Ingresos (DOP)</Label>
                <Input
                  type="number"
                  min="0"
                  value={formData.monthly_income}
                  onChange={(e) => handleChange('monthly_income', e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>Vivienda (DOP)</Label>
                <Input
                  type="number"
                  min="0"
                  value={formData.housing}
                  onChange={(e) => handleChange('housing', e.target.value)}
                  placeholder="0"
                />
              </div>
              <div>
                <Label>Dependientes</Label>
                <Input
                  type="number"
                  min="0"
                  value={formData.dependents}
                  onChange={(e) => handleChange('dependents', e.target.value)}
                  placeholder="0"
                />
              </div>
              <div>
                <Label>RNC</Label>
                <Input
                  value={formData.rnc}
                  onChange={(e) => handleChange('rnc', e.target.value)}
                  placeholder="000000000"
                />
              </div>
            </div>
            <div>
              <Label>Situación Laboral</Label>
              <Input
                value={formData.employment_status}
                onChange={(e) => handleChange('employment_status', e.target.value)}
                placeholder="Situación laboral del cliente"
              />
            </div>
          </CardContent>
        </Card>

        {/* Datos de contacto */}
        <Card>
          <CardHeader>
            <CardTitle>Datos de contacto</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>WhatsApp *</Label>
                <Input
                  type="tel"
                  value={formData.whatsapp}
                  onChange={(e) => handleChange('whatsapp', e.target.value)}
                  placeholder="(000) 000-0000"
                  required
                />
              </div>
              <div>
                <Label>Tel. Principal *</Label>
                <Input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  placeholder="(000) 000-0000"
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Tel. Otro</Label>
                <Input
                  type="tel"
                  value={formData.phone_secondary}
                  onChange={(e) => handleChange('phone_secondary', e.target.value)}
                  placeholder="(000) 000-0000"
                />
              </div>
              <div>
                <Label>Correo Electrónico</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  placeholder="email@gmail.com"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Direcciones */}
        <Card>
          <CardHeader>
            <CardTitle>Direcciones</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Dirección</Label>
              <Textarea
                value={formData.address}
                onChange={(e) => handleChange('address', e.target.value)}
                placeholder="Dirección del cliente"
                rows={3}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label>Provincia</Label>
                <Select value={formData.province || undefined} onValueChange={(value) => handleChange('province', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="SELECCIONAR" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVINCES.map(province => (
                      <SelectItem key={province} value={province}>{province}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Municipio</Label>
                <Input
                  value={formData.municipality}
                  onChange={(e) => handleChange('municipality', e.target.value)}
                  placeholder="SELECCIONAR PROVINCIA"
                />
              </div>
              <div>
                <Label>Sector</Label>
                <Input
                  value={formData.sector}
                  onChange={(e) => handleChange('sector', e.target.value)}
                  placeholder="SELECCIONAR MUNICIPIO"
                />
              </div>
              <div>
                <Label>Ruta de Cobro / Entrega</Label>
                <Select value={formData.collection_route || undefined} onValueChange={(value) => handleChange('collection_route', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="RUTA PRINCIPAL" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RUTA PRINCIPAL">RUTA PRINCIPAL</SelectItem>
                    <SelectItem value="RUTA SECUNDARIA">RUTA SECUNDARIA</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Lugar de trabajo</Label>
                <Input
                  value={formData.workplace_name}
                  onChange={(e) => handleChange('workplace_name', e.target.value)}
                  placeholder="Lugar de trabajo del cliente"
                />
              </div>
              <div>
                <Label>Dirección de trabajo</Label>
                <Input
                  value={formData.workplace_address}
                  onChange={(e) => handleChange('workplace_address', e.target.value)}
                  placeholder="Dirección de trabajo del cliente"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Datos bancarios (opcional) */}
        <Card>
          <CardHeader>
            <CardTitle>Datos bancarios (opcional)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Número de Tarjeta</Label>
                <Input
                  value={formData.card_number}
                  onChange={(e) => handleChange('card_number', e.target.value)}
                  placeholder="0000000000000"
                  maxLength={19}
                />
              </div>
              <div>
                <Label>Usuario</Label>
                <Input
                  value={formData.bank_user}
                  onChange={(e) => handleChange('bank_user', e.target.value)}
                  placeholder="Usuario del internet banking"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Código</Label>
                <Input
                  type="password"
                  value={formData.bank_code}
                  onChange={(e) => handleChange('bank_code', e.target.value)}
                  placeholder="Clave de internet banking"
                />
              </div>
              <div>
                <Label>Identificador del Token o Tarjeta de Claves</Label>
                <Input
                  value={formData.bank_token_identifier}
                  onChange={(e) => handleChange('bank_token_identifier', e.target.value)}
                  placeholder="Serial/IMEI/identificador"
                />
              </div>
            </div>
            <div>
              <Label>Banco</Label>
              <Select value={formData.bank_name || undefined} onValueChange={(value) => handleChange('bank_name', value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar banco" />
                </SelectTrigger>
                <SelectContent>
                  {DOMINICAN_BANKS.map(bank => (
                    <SelectItem key={bank} value={bank}>{bank}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Otros */}
        <Card>
          <CardHeader>
            <CardTitle>Otros</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Recomendado por</Label>
                <Input
                  value={formData.recommended_by}
                  onChange={(e) => handleChange('recommended_by', e.target.value)}
                  placeholder="RECOMENDADO POR"
                />
              </div>
              <div>
                <Label>Clasificación por color</Label>
                <Select value={formData.color_classification || undefined} onValueChange={(value) => handleChange('color_classification', value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sin color asignado" />
                  </SelectTrigger>
                  <SelectContent>
                    {COLOR_CLASSIFICATIONS.map(color => (
                      <SelectItem key={color} value={color}>{color}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>CREADO POR</Label>
                <Input
                  value={profile?.full_name || user?.email || ''}
                  disabled
                  className="bg-gray-100"
                />
              </div>
              <div>
                <Label>Visible en datapréstamo</Label>
                <RadioGroup value={formData.visible_in_loan_data} onValueChange={(value) => handleChange('visible_in_loan_data', value)}>
                  <div className="flex gap-4">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="SI" id="visible-yes" />
                      <Label htmlFor="visible-yes" className="cursor-pointer">SI</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="NO" id="visible-no" />
                      <Label htmlFor="visible-no" className="cursor-pointer">NO</Label>
                    </div>
                  </div>
                </RadioGroup>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Campo personalizado 1</Label>
                <Input
                  value={formData.custom_field_1}
                  onChange={(e) => handleChange('custom_field_1', e.target.value)}
                  placeholder="Campo personalizado 1"
                />
              </div>
              <div>
                <Label>Campo personalizado 2</Label>
                <Input
                  value={formData.custom_field_2}
                  onChange={(e) => handleChange('custom_field_2', e.target.value)}
                  placeholder="Campo personalizado 2"
                />
              </div>
            </div>
            <div>
              <Label>SUBIR ADJUNTO</Label>
              <div className="flex items-center gap-2">
                <Input
                  ref={attachmentInputRef}
                  type="file"
                  onChange={handleAttachmentUpload}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => attachmentInputRef.current?.click()}
                  disabled={uploadingAttachment}
                >
                  {uploadingAttachment ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Subiendo...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Seleccionar archivo
                    </>
                  )}
                </Button>
                {formData.attachment_url && (
                  <span className="text-sm text-green-600">✓ Archivo subido</span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Campos adicionales existentes */}
        <Card>
          <CardHeader>
            <CardTitle>Información adicional</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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
          </CardContent>
        </Card>
      </form>
    </div>
  );
};

export default ClientForm;
