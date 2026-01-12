import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Save, Building, Globe, Phone, Mail, MapPin, CreditCard, Settings, Shield, Bell, FileText, TrendingUp, Clock, Copy, Check, AlertTriangle, Trash2, Key, RefreshCw, Database } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const sanitizeNumber = (value: any, fallback: number) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const CompanySettings = () => {
  const { user, profile, companyId, refreshCompanySettings } = useAuth();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('general');
  const [copied, setCopied] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetCode, setResetCode] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetCodeError, setResetCodeError] = useState('');
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
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
    grace_period_days: 3,
    min_loan_amount: 1000,
    max_loan_amount: 500000,
    min_term_months: 6,
    max_term_months: 60,
    company_code: '',
    default_late_fee_rate: 2.0,
    default_pawn_period_days: 90,
    default_capital_payment_penalty_percentage: 0,
    auto_backup_enabled: false,
    auto_backup_interval_hours: 24,
    auto_backup_format: 'excel' as 'excel' | 'csv' | 'pdf',
    notify_late_fees: true,
    notify_rate_changes: true,
    notify_payment_reminders: true,
    notify_loan_approvals: true,
    notify_loan_rejections: true,
    ask_whatsapp_before_send: true
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
        setFormData(prev => ({
          ...prev,
          ...data,
          logo_url: data.logo_url || prev.logo_url, // Asegurar que logo_url se cargue
          interest_rate_default: sanitizeNumber(data.interest_rate_default, prev.interest_rate_default),
          grace_period_days: sanitizeNumber(data.grace_period_days, prev.grace_period_days),
          default_late_fee_rate: sanitizeNumber(data.default_late_fee_rate, prev.default_late_fee_rate),
          default_pawn_period_days: sanitizeNumber(data.default_pawn_period_days, prev.default_pawn_period_days),
          default_capital_payment_penalty_percentage: sanitizeNumber(data.default_capital_payment_penalty_percentage, prev.default_capital_payment_penalty_percentage),
          min_loan_amount: sanitizeNumber(data.min_loan_amount, prev.min_loan_amount),
          max_loan_amount: sanitizeNumber(data.max_loan_amount, prev.max_loan_amount),
          min_term_months: sanitizeNumber(data.min_term_months, prev.min_term_months),
          max_term_months: sanitizeNumber(data.max_term_months, prev.max_term_months),
          auto_backup_enabled: data.auto_backup_enabled ?? false,
          auto_backup_interval_hours: sanitizeNumber(data.auto_backup_interval_hours, 24),
          auto_backup_format: data.auto_backup_format || 'excel',
          notify_late_fees: data.notify_late_fees ?? true,
          notify_rate_changes: data.notify_rate_changes ?? true,
          notify_payment_reminders: data.notify_payment_reminders ?? true,
          notify_loan_approvals: data.notify_loan_approvals ?? true,
          notify_loan_rejections: data.notify_loan_rejections ?? true,
          ask_whatsapp_before_send: data.ask_whatsapp_before_send ?? true,
        }));
      } else {
        // Solo crear configuración si es el dueño de la empresa, no empleados
        if (user && !profile?.is_employee) {
          await createNewCompanySettings();
        } else {
          // Para empleados, mostrar mensaje de que no hay configuración
          toast.error('No se encontró configuración de empresa. Contacta al administrador.');
        }
      }
    } catch (error) {
      console.error('Error in fetchCompanySettings:', error);
    }
  };

  const createNewCompanySettings = async () => {
    if (!user) return;

    setLoading(true);
    try {
      // Generar código automáticamente
      const { data: codeData, error: codeError } = await supabase
        .rpc('generate_company_code');

      if (codeError) {
        toast.error('Error al generar el código de empresa');
        console.error('Error generating company code:', codeError);
        return;
      }

      // Crear nueva configuración con el código generado
      const { data, error } = await supabase
        .from('company_settings')
        .insert({
          user_id: user.id,
          company_code: codeData,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        toast.error('Error al crear la configuración de empresa');
        console.error('Error creating company settings:', error);
        return;
      }

      setFormData(data);
      toast.success('Configuración de empresa creada con código automático');
      await refreshCompanySettings();
    } catch (error) {
      console.error('Error in createNewCompanySettings:', error);
      toast.error('Error al crear la configuración de empresa');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string | number | boolean) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user || !companyId) return;

    // Validar que sea una imagen
    if (!file.type.startsWith('image/')) {
      toast.error('Por favor selecciona un archivo de imagen');
      return;
    }

    // Validar tamaño (máximo 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('La imagen es demasiado grande. Máximo 5MB');
      return;
    }

    setUploadingLogo(true);
    try {
      toast.loading('Subiendo logo...', { id: 'upload-logo' });

      // Subir imagen a Supabase Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${companyId}/logo_${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('company-assets')
        .upload(fileName, file, {
          upsert: true,
          contentType: file.type
        });

      if (uploadError) {
        // Si el bucket no existe, intentar crearlo o usar otro bucket
        console.error('Error uploading logo:', uploadError);
        
        // Intentar con el bucket 'documents' como fallback
        const fallbackFileName = `user-${companyId}/logo_${Date.now()}.${fileExt}`;
        const { error: fallbackError } = await supabase.storage
          .from('documents')
          .upload(fallbackFileName, file, {
            upsert: true,
            contentType: file.type
          });

        if (fallbackError) {
          throw fallbackError;
        }

        // Obtener URL pública
        const { data: urlData } = await supabase.storage
          .from('documents')
          .createSignedUrl(fallbackFileName, 31536000); // 1 año

        if (!urlData) {
          throw new Error('No se pudo obtener la URL del logo');
        }

        const logoUrl = urlData.signedUrl;
        handleInputChange('logo_url', logoUrl);
        
        // Guardar automáticamente en la base de datos
        // Primero verificar si existe un registro
        const { data: existingData } = await supabase
          .from('company_settings')
          .select('user_id')
          .eq('user_id', user.id)
          .maybeSingle();

        let saveError;
        if (existingData) {
          // Si existe, usar update
          const { error } = await supabase
            .from('company_settings')
            .update({
              logo_url: logoUrl,
              updated_at: new Date().toISOString()
            })
            .eq('user_id', user.id);
          saveError = error;
        } else {
          // Si no existe, crear con upsert usando los datos actuales del formData
          const { error } = await supabase
            .from('company_settings')
            .upsert({
              user_id: user.id,
              logo_url: logoUrl,
              ...formData,
              updated_at: new Date().toISOString()
            }, {
              onConflict: 'user_id'
            });
          saveError = error;
        }

        if (saveError) {
          console.error('Error saving logo URL:', saveError);
          toast.error('Logo subido pero no se pudo guardar en la base de datos', { id: 'upload-logo' });
        } else {
          toast.success('Logo subido y guardado exitosamente', { id: 'upload-logo' });
          // Recargar los datos de la empresa
          await fetchCompanySettings();
        }
      } else {
        // Obtener URL pública
        const { data: urlData } = await supabase.storage
          .from('company-assets')
          .createSignedUrl(fileName, 31536000); // 1 año

        if (!urlData) {
          throw new Error('No se pudo obtener la URL del logo');
        }

        const logoUrl = urlData.signedUrl;
        handleInputChange('logo_url', logoUrl);
        
        // Guardar automáticamente en la base de datos
        // Primero verificar si existe un registro
        const { data: existingData } = await supabase
          .from('company_settings')
          .select('user_id')
          .eq('user_id', user.id)
          .maybeSingle();

        let saveError;
        if (existingData) {
          // Si existe, usar update
          const { error } = await supabase
            .from('company_settings')
            .update({
              logo_url: logoUrl,
              updated_at: new Date().toISOString()
            })
            .eq('user_id', user.id);
          saveError = error;
        } else {
          // Si no existe, crear con upsert usando los datos actuales del formData
          const { error } = await supabase
            .from('company_settings')
            .upsert({
              user_id: user.id,
              logo_url: logoUrl,
              ...formData,
              updated_at: new Date().toISOString()
            }, {
              onConflict: 'user_id'
            });
          saveError = error;
        }

        if (saveError) {
          console.error('Error saving logo URL:', saveError);
          toast.error('Logo subido pero no se pudo guardar en la base de datos', { id: 'upload-logo' });
        } else {
          toast.success('Logo subido y guardado exitosamente', { id: 'upload-logo' });
          // Recargar los datos de la empresa
          await fetchCompanySettings();
        }
      }
    } catch (error: any) {
      console.error('Error uploading logo:', error);
      toast.error(error.message || 'Error al subir el logo', { id: 'upload-logo' });
    } finally {
      setUploadingLogo(false);
      // Limpiar el input
      if (logoInputRef.current) {
        logoInputRef.current.value = '';
      }
    }
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
        console.error('Error saving company settings:', error);
        // Fallback: guardar preferencia en localStorage si la columna no existe
        if ((error as any)?.code === 'PGRST204') {
          try {
            localStorage.setItem('auto_sequential_codes', 'false');
            toast.success('Configuración guardada localmente');
          } catch {}
        } else {
          toast.error('Error al guardar la configuración');
          return;
        }
      }

      toast.success('Configuración guardada exitosamente');
      await refreshCompanySettings();
    } catch (error) {
      console.error('Error in handleSave:', error);
      toast.error('Error al guardar la configuración');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (!formData.company_code) {
      toast.error('No hay código para copiar');
      return;
    }

    try {
      // Intentar usar la API moderna del portapapeles
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(formData.company_code);
        setCopied(true);
        toast.success('Código copiado al portapapeles');
        setTimeout(() => setCopied(false), 2000);
      } else {
        // Fallback para navegadores más antiguos o contextos no seguros
        const textArea = document.createElement('textarea');
        textArea.value = formData.company_code;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        const successful = document.execCommand('copy');
        document.body.removeChild(textArea);
        
        if (successful) {
          setCopied(true);
          toast.success('Código copiado al portapapeles');
          setTimeout(() => setCopied(false), 2000);
        } else {
          toast.error('No se pudo copiar el código automáticamente');
        }
      }
    } catch (error) {
      console.error('Error al copiar:', error);
      toast.error('Error al copiar el código. Intenta seleccionar y copiar manualmente.');
    }
  };

  const validateResetCode = async (code: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase
        .from('registration_codes')
        .select('*')
        .eq('code', code.toUpperCase().trim())
        .single();

      if (error || !data) {
        return false;
      }

      // Verificar si ha expirado
      if (data.expires_at && new Date(data.expires_at) < new Date()) {
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error validating reset code:', error);
      return false;
    }
  };

  const resetCompanyData = async () => {
    if (!user || !companyId) {
      toast.error('Error: Usuario no autenticado');
      return;
    }

    if (!resetCode.trim()) {
      setResetCodeError('Por favor ingresa el código de confirmación');
      return;
    }

    setResetCodeError('');
    setResetting(true);

    try {
      // Validar el código y obtener sus datos
      const { data: codeData, error: codeError } = await supabase
        .from('registration_codes')
        .select('*')
        .eq('code', resetCode.toUpperCase().trim())
        .single();

      if (codeError || !codeData) {
        setResetCodeError('Código inválido');
        setResetting(false);
        return;
      }

      // Verificar si ha expirado
      if (codeData.expires_at && new Date(codeData.expires_at) < new Date()) {
        setResetCodeError('El código ha expirado');
        setResetting(false);
        return;
      }

      const ownerId = companyId;

      console.log('🔄 Iniciando reset de empresa para ownerId:', ownerId);

      // Registrar uso del código para auditoría sin invalidarlo
      await supabase
        .from('registration_codes')
        .update({
          updated_at: new Date().toISOString(),
          used_by: ownerId,
          used_at: new Date().toISOString()
        })
        .eq('code', resetCode.toUpperCase().trim());

      // Llamar a la función de base de datos que tiene permisos elevados
      const { data, error } = await supabase.rpc('reset_company_data', {
        p_owner_id: ownerId
      });

      if (error) {
        console.error('❌ Error al resetear datos:', error);
        toast.error('Error al eliminar los datos: ' + (error.message || 'Error desconocido'));
        setResetting(false);
        return;
      }

      if (data) {
        const result = data as any;
        const deleted = result.deleted || {};
        const errors = result.errors || [];
        
        console.log('✅ Datos eliminados:', deleted);
        console.log('⚠️ Errores encontrados:', errors);
        
        // Si hay errores, mostrarlos de forma detallada
        if (errors.length > 0) {
          const errorMessages = errors.map((e: string) => `- ${e}`).join('\n');
          console.error('❌ Errores durante la eliminación:\n', errorMessages);
          
          // Mostrar un mensaje más detallado
          toast.error(
            `Error al eliminar algunos datos. ${errors.length} operación(es) fallaron. Revisa la consola para más detalles.`,
            {
              duration: 5000,
            }
          );
          
          // Mostrar los errores en un alert para que el usuario los vea
          alert(
            `Se encontraron ${errors.length} error(es) al eliminar los datos:\n\n${errorMessages}\n\nRevisa la consola del navegador para más detalles.`
          );
        }
        
        // Si success es false, no continuar
        if (result.success === false) {
          setResetting(false);
          return;
        }
        
        // Si llegamos aquí, la operación fue exitosa (aunque pueda tener advertencias)
        if (errors.length === 0) {
          toast.success('Todos los datos de la empresa han sido eliminados exitosamente');
        } else {
          toast.warning('Los datos se eliminaron, pero algunas operaciones arrojaron errores. Revisa la consola para más detalles.');
        }
        
        setShowResetDialog(false);
        setResetCode('');
        
        // Recargar la página para reflejar los cambios
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      }
    } catch (error: any) {
      console.error('Error al resetear datos:', error);
      toast.error('Error al eliminar los datos: ' + (error.message || 'Error desconocido'));
    } finally {
      setResetting(false);
    }
  };

  // Si es empleado, no mostrar la configuración de empresa
  if (profile?.is_employee) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Configuración de Empresa</h2>
        </div>
        <div className="text-center py-8">
          <p className="text-gray-500">Los empleados no pueden acceder a la configuración de empresa.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Configuración de Empresa</h2>
        <Button onClick={handleSave} disabled={loading}>
          <Save className="h-4 w-4 mr-2" />
          {loading ? 'Guardando...' : 'Guardar Cambios'}
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="general" className="flex items-center gap-2">
            <Building className="h-4 w-4" />
            General
          </TabsTrigger>
          <TabsTrigger value="configuracion" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Configuración
          </TabsTrigger>
        </TabsList>

                                   <TabsContent value="general" className="space-y-6">
            {/* Código de Empresa - Visible en la parte superior */}
            {formData.company_code ? (
             <Card className="border-blue-200 bg-blue-50">
               <CardHeader>
                 <CardTitle className="flex items-center text-blue-800">
                   <Building className="h-5 w-5 mr-2" />
                   Código de Empresa
                 </CardTitle>
               </CardHeader>
               <CardContent>
                 <div className="flex items-center justify-between">
                   <div>
                     <p className="text-sm text-blue-700 mb-2">
                       Este es el código que tus empleados deben usar para iniciar sesión:
                     </p>
                     <div className="flex items-center gap-3">
                       <div 
                         className="bg-white border-2 border-blue-300 rounded-lg p-3 inline-block select-all cursor-pointer hover:bg-blue-50 transition-colors"
                         onClick={() => {
                           const range = document.createRange();
                           const selection = window.getSelection();
                           const element = document.querySelector('.select-all span');
                           if (element) {
                             range.selectNodeContents(element);
                             selection?.removeAllRanges();
                             selection?.addRange(range);
                           }
                         }}
                         title="Haz clic para seleccionar el código"
                       >
                         <span className="font-mono text-2xl font-bold text-blue-800 tracking-wider">
                           {formData.company_code}
                         </span>
                       </div>
                       <Button
                         variant="outline"
                         size="sm"
                         onClick={copyToClipboard}
                         className="h-10"
                       >
                         {copied ? (
                           <>
                             <Check className="h-4 w-4 mr-2 text-green-600" />
                             Copiado
                           </>
                         ) : (
                           <>
                             <Copy className="h-4 w-4 mr-2" />
                             Copiar
                           </>
                         )}
                       </Button>
                     </div>
                     <p className="text-xs text-blue-600 mt-2">
                       💡 También puedes hacer clic en el código para seleccionarlo y copiarlo manualmente
                     </p>
                   </div>
                   <div className="text-right">
                     <p className="text-xs text-blue-600 mb-1">Estado:</p>
                     <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                       Activo
                     </span>
                   </div>
                 </div>
                 <div className="mt-4 p-3 bg-blue-100 rounded-lg">
                   <p className="text-sm text-blue-800">
                     <strong>Instrucciones para empleados:</strong> Al iniciar sesión, los empleados deben ingresar:
                   </p>
                   <ul className="text-sm text-blue-700 mt-2 space-y-1">
                     <li>• Su correo electrónico</li>
                     <li>• Su contraseña</li>
                     <li>• Este código de empresa: <strong>{formData.company_code}</strong></li>
                   </ul>
                 </div>
               </CardContent>
             </Card>
                       ) : (
              <Card className="border-orange-200 bg-orange-50">
                <CardHeader>
                  <CardTitle className="flex items-center text-orange-800">
                    <Building className="h-5 w-5 mr-2" />
                    Código de Empresa
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-4">
                    <p className="text-sm text-orange-700 mb-3">
                      Generando código de empresa...
                    </p>
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600 mx-auto"></div>
                  </div>
                </CardContent>
              </Card>
            )}

           <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
             {/* Información General */}
             <Card>
               <CardHeader>
                 <CardTitle className="flex items-center">
                   <Building className="h-5 w-5 mr-2" />
                   Información de la Empresa
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

                <div>
                  <Label htmlFor="logo_upload">Logo de la Empresa</Label>
                  <div className="mt-2 flex items-center space-x-4">
                    {formData.logo_url && (
                      <img
                        src={formData.logo_url}
                        alt="Logo"
                        className="h-16 w-16 object-contain rounded border"
                      />
                    )}
                    <div className="flex flex-col gap-2">
                      <Button 
                        variant="outline" 
                        type="button"
                        onClick={() => logoInputRef.current?.click()}
                        disabled={uploadingLogo}
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        {uploadingLogo ? 'Subiendo...' : 'Subir Logo'}
                      </Button>
                      <input
                        ref={logoInputRef}
                        type="file"
                        id="logo_upload"
                        accept="image/*"
                        onChange={handleLogoUpload}
                        style={{ display: 'none' }}
                      />
                      {formData.logo_url && (
                        <Button
                          variant="outline"
                          type="button"
                          size="sm"
                          onClick={() => handleInputChange('logo_url', '')}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Eliminar Logo
                        </Button>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    Formatos soportados: JPG, PNG, GIF. Tamaño máximo: 5MB
                  </p>
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

                <div>
                  <Label htmlFor="country">País</Label>
                  <Select value={formData.country} onValueChange={(value) => handleInputChange('country', value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Dominican Republic">República Dominicana</SelectItem>
                      <SelectItem value="United States">Estados Unidos</SelectItem>
                      <SelectItem value="Mexico">México</SelectItem>
                      <SelectItem value="Colombia">Colombia</SelectItem>
                      <SelectItem value="Other">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Configuración Financiera Básica */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <CreditCard className="h-5 w-5 mr-2" />
                  Configuración Financiera Básica
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
                    value={formData.interest_rate_default ?? ''}
                    onChange={(e) => handleInputChange('interest_rate_default', sanitizeNumber(e.target.value, 0))}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="default_late_fee_rate">Mora por Defecto (% mensual)</Label>
                    <Input
                      id="default_late_fee_rate"
                      type="number"
                      step="0.1"
                      value={formData.default_late_fee_rate ?? ''}
                      onChange={(e) => handleInputChange('default_late_fee_rate', sanitizeNumber(e.target.value, 0))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="default_pawn_period_days">Días por Defecto (Compra‑Venta)</Label>
                    <Input
                      id="default_pawn_period_days"
                      type="number"
                      value={formData.default_pawn_period_days ?? ''}
                      onChange={(e) => handleInputChange('default_pawn_period_days', sanitizeNumber(e.target.value, 0))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="default_capital_payment_penalty_percentage">Penalización Abono a Capital (% por defecto)</Label>
                    <Input
                      id="default_capital_payment_penalty_percentage"
                      type="number"
                      step="0.1"
                      value={formData.default_capital_payment_penalty_percentage ?? ''}
                      onChange={(e) => handleInputChange('default_capital_payment_penalty_percentage', sanitizeNumber(e.target.value, 0))}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="grace_period_days">Días de Gracia</Label>
                  <Input
                    id="grace_period_days"
                    type="number"
                    value={formData.grace_period_days ?? ''}
                    onChange={(e) => handleInputChange('grace_period_days', sanitizeNumber(e.target.value, 0))}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Límites de Préstamos */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <TrendingUp className="h-5 w-5 mr-2" />
                  Límites de Préstamos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="min_loan_amount">Monto Mínimo</Label>
                    <Input
                      id="min_loan_amount"
                      type="number"
                      value={formData.min_loan_amount ?? ''}
                      onChange={(e) => handleInputChange('min_loan_amount', sanitizeNumber(e.target.value, 0))}
                    />
                  </div>

                  <div>
                    <Label htmlFor="max_loan_amount">Monto Máximo</Label>
                    <Input
                      id="max_loan_amount"
                      type="number"
                      value={formData.max_loan_amount ?? ''}
                      onChange={(e) => handleInputChange('max_loan_amount', sanitizeNumber(e.target.value, 0))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="min_term_months">Plazo Mínimo (meses)</Label>
                    <Input
                      id="min_term_months"
                      type="number"
                      value={formData.min_term_months ?? ''}
                      onChange={(e) => handleInputChange('min_term_months', sanitizeNumber(e.target.value, 0))}
                      placeholder="Plazo mínimo en meses"
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="max_term_months">Plazo Máximo (meses)</Label>
                    <Input
                      id="max_term_months"
                      type="number"
                      value={formData.max_term_months ?? ''}
                      onChange={(e) => handleInputChange('max_term_months', sanitizeNumber(e.target.value, 0))}
                      placeholder="Plazo máximo en meses"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="configuracion" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                         {/* Código de Empresa */}
             <Card>
               <CardHeader>
                 <CardTitle className="flex items-center">
                   <Building className="h-5 w-5 mr-2" />
                   Código de Empresa
                 </CardTitle>
               </CardHeader>
               <CardContent className="space-y-4">
                 <div className="space-y-3">
                   <Label className="text-sm font-medium">Código de Acceso para Empleados</Label>
                   <p className="text-sm text-gray-600">
                     Cada empresa tiene automáticamente un código único que permite que tus empleados inicien sesión 
                     especificando a qué empresa pertenecen. Esto evita conflictos cuando diferentes empresas tienen 
                     empleados con el mismo correo electrónico.
                   </p>
                   <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                     <div className="flex items-center gap-2 text-green-800">
                       <span className="text-sm">
                         <strong>✅ Automático:</strong> Tu empresa ya tiene un código único asignado automáticamente.
                         Este código es permanente y no se puede cambiar.
                       </span>
                     </div>
                   </div>
                 </div>

                 {formData.company_code && (
                   <div className="space-y-4">
                     <div>
                       <Label htmlFor="company_code">Código de Empresa</Label>
                       <div className="flex space-x-2">
                         <Input
                           id="company_code"
                           type="text"
                           value={formData.company_code}
                           readOnly
                           placeholder="ABC123"
                           maxLength={6}
                           className="font-mono text-lg bg-gray-50"
                         />
                       </div>
                       <p className="text-xs text-gray-500 mt-1">
                         Código único de 6 caracteres que tus empleados usarán para iniciar sesión. 
                         Este código es permanente y no se puede cambiar.
                       </p>
                     </div>

                     <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                       <div className="flex items-center gap-2 text-blue-800">
                         <Building className="h-4 w-4" />
                         <div>
                           <span className="font-semibold">Código de Empresa: {formData.company_code}</span>
                           <p className="text-sm mt-1">
                             Comparte este código con tus empleados para que puedan iniciar sesión.
                             Los empleados deberán ingresar: su correo, contraseña y este código.
                             <strong>Este código es permanente y no se puede cambiar.</strong>
                           </p>
                         </div>
                       </div>
                     </div>
                   </div>
                 )}
               </CardContent>
             </Card>

            {/* Configuraciones de Notificaciones */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Bell className="h-5 w-5 mr-2" />
                  Configuraciones de Notificaciones
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Eventos a Notificar</Label>
                  <p className="text-xs text-gray-600">
                    Selecciona los eventos que deseas que aparezcan en el apartado de notificaciones del sistema.
                  </p>
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <input 
                        type="checkbox" 
                        checked={formData.notify_late_fees}
                        onChange={(e) => handleInputChange('notify_late_fees', e.target.checked)}
                        className="rounded" 
                      />
                      <Label className="text-sm">Notificar moras</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input 
                        type="checkbox" 
                        checked={formData.notify_rate_changes}
                        onChange={(e) => handleInputChange('notify_rate_changes', e.target.checked)}
                        className="rounded" 
                      />
                      <Label className="text-sm">Notificar cambios de tasa de interés</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input 
                        type="checkbox" 
                        checked={formData.notify_payment_reminders}
                        onChange={(e) => handleInputChange('notify_payment_reminders', e.target.checked)}
                        className="rounded" 
                      />
                      <Label className="text-sm">Notificar recordatorios de pago</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input 
                        type="checkbox" 
                        checked={formData.notify_loan_approvals}
                        onChange={(e) => handleInputChange('notify_loan_approvals', e.target.checked)}
                        className="rounded" 
                      />
                      <Label className="text-sm">Notificar aprobaciones de préstamos</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input 
                        type="checkbox" 
                        checked={formData.notify_loan_rejections}
                        onChange={(e) => handleInputChange('notify_loan_rejections', e.target.checked)}
                        className="rounded" 
                      />
                      <Label className="text-sm">Notificar rechazos de préstamos</Label>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Configuración de WhatsApp */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Phone className="h-5 w-5 mr-2" />
                  Configuración de WhatsApp
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex-1">
                      <Label htmlFor="ask_whatsapp_before_send" className="text-base font-semibold">
                        Preguntar antes de enviar por WhatsApp
                      </Label>
                      <p className="text-sm text-gray-600 mt-1">
                        Si está desactivado, después de cerrar el modal de impresión se enviará automáticamente a WhatsApp sin preguntar.
                      </p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="ask_whatsapp_before_send"
                        checked={formData.ask_whatsapp_before_send}
                        onChange={(e) => handleInputChange('ask_whatsapp_before_send', e.target.checked)}
                        className="w-5 h-5 rounded"
                      />
                    </div>
                  </div>
                  {!formData.ask_whatsapp_before_send && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-sm text-blue-800">
                        <strong>Modo automático:</strong> Después de imprimir un recibo, se abrirá WhatsApp automáticamente sin mostrar el diálogo de confirmación.
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Configuraciones de Almacenamiento de Documentos */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <FileText className="h-5 w-5 mr-2" />
                  Configuraciones de Almacenamiento de Documentos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm text-blue-800">
                    <strong>Nota:</strong> Los documentos requeridos para solicitudes de préstamo se configuran en el módulo de Solicitudes, pestaña "Config".
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="max_file_size">Tamaño Máximo de Archivo (MB)</Label>
                    <Input
                      id="max_file_size"
                      type="number"
                      min="1"
                      max="100"
                      defaultValue="10"
                      placeholder="Tamaño máximo por archivo"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Límite de tamaño para subir documentos (1-100 MB)
                    </p>
                  </div>
                  
                  <div>
                    <Label htmlFor="document_retention_years">Años de Retención de Documentos</Label>
                    <Input
                      id="document_retention_years"
                      type="number"
                      min="1"
                      max="30"
                      defaultValue="7"
                      placeholder="Años para mantener documentos"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Tiempo que se conservarán los documentos antes de poder eliminarlos (1-30 años)
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-sm font-medium">Formatos de Archivo Permitidos</Label>
                  <p className="text-xs text-gray-600">
                    Selecciona los formatos de archivo que se pueden subir como documentos.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div className="flex items-center space-x-2">
                      <input type="checkbox" defaultChecked className="rounded" disabled />
                      <Label className="text-sm">PDF (Recomendado)</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input type="checkbox" defaultChecked className="rounded" disabled />
                      <Label className="text-sm">Imágenes (JPG, PNG)</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input type="checkbox" defaultChecked className="rounded" disabled />
                      <Label className="text-sm">Documentos (DOC, DOCX)</Label>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">
                    Los formatos están predefinidos para garantizar compatibilidad y seguridad.
                  </p>
                </div>

                <div className="space-y-3">
                  <Label className="text-sm font-medium">Política de Almacenamiento</Label>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                    <p className="text-sm text-gray-700 mb-2">
                      <strong>Información sobre almacenamiento:</strong>
                    </p>
                    <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside">
                      <li>Los documentos se almacenan de forma segura en la nube</li>
                      <li>Cada documento está asociado a un préstamo o cliente específico</li>
                      <li>Los documentos se pueden visualizar y descargar desde el módulo de Documentos</li>
                      <li>Se recomienda mantener los documentos durante el período de retención configurado</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Configuraciones de Reportes */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Clock className="h-5 w-5 mr-2" />
                  Configuraciones de Reportes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
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
                </div>

                <div>
                  <Label htmlFor="report_recipients">Destinatarios de Reportes</Label>
                  <Input
                    id="report_recipients"
                    placeholder="emails@ejemplo.com, separados por comas"
                  />
                </div>

                <div className="space-y-3">
                  <Label className="text-sm font-medium">Tipos de Reportes Automáticos</Label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div className="flex items-center space-x-2">
                      <input type="checkbox" defaultChecked className="rounded" />
                      <Label className="text-sm">Reporte de cobranza diario</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input type="checkbox" defaultChecked className="rounded" />
                      <Label className="text-sm">Reporte financiero semanal</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input type="checkbox" className="rounded" />
                      <Label className="text-sm">Reporte de mora</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input type="checkbox" className="rounded" />
                      <Label className="text-sm">Reporte de nuevos clientes</Label>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Configuraciones de Backup Automático */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Database className="h-5 w-5 mr-2" />
                  Backup Automático
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <Database className="h-5 w-5 text-blue-600 mt-0.5" />
                    <div>
                      <p className="font-semibold text-blue-900 mb-1">Backups Automáticos</p>
                      <p className="text-sm text-blue-700">
                        Configura backups automáticos para proteger tus datos. El sistema creará un backup completo 
                        según el intervalo configurado.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex-1">
                      <Label htmlFor="auto_backup_enabled" className="text-base font-semibold">
                        Habilitar Backup Automático
                      </Label>
                      <p className="text-sm text-gray-600 mt-1">
                        Activa los backups automáticos del sistema
                      </p>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="auto_backup_enabled"
                        checked={formData.auto_backup_enabled}
                        onChange={(e) => handleInputChange('auto_backup_enabled', e.target.checked)}
                        className="w-5 h-5 rounded"
                      />
                    </div>
                  </div>

                  {formData.auto_backup_enabled && (
                    <>
                      <div>
                        <Label htmlFor="auto_backup_interval_hours">Intervalo entre Backups (horas)</Label>
                        <Input
                          id="auto_backup_interval_hours"
                          type="number"
                          min="1"
                          max="720"
                          value={formData.auto_backup_interval_hours}
                          onChange={(e) => handleInputChange('auto_backup_interval_hours', sanitizeNumber(e.target.value, 24))}
                          placeholder="24"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          El sistema creará un backup automáticamente cada {formData.auto_backup_interval_hours} hora(s).
                          Mínimo: 1 hora, Máximo: 720 horas (30 días)
                        </p>
                        <div className="mt-2 space-y-1 text-xs text-gray-600">
                          <p>• 1 hora = Backups cada hora</p>
                          <p>• 24 horas = Backups diarios</p>
                          <p>• 168 horas = Backups semanales</p>
                          <p>• 720 horas = Backups mensuales</p>
                        </div>
                      </div>

                      <div>
                        <Label htmlFor="auto_backup_format">Formato de Backup</Label>
                        <Select
                          value={formData.auto_backup_format}
                          onValueChange={(value: 'excel' | 'csv' | 'pdf') => handleInputChange('auto_backup_format', value)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="excel">Excel (Recomendado)</SelectItem>
                            <SelectItem value="csv">CSV</SelectItem>
                            <SelectItem value="pdf">PDF</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-gray-500 mt-1">
                          Formato en el que se guardarán los backups automáticos
                        </p>
                      </div>

                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                        <p className="text-sm text-yellow-800">
                          <strong>Nota:</strong> Los backups automáticos se ejecutarán en segundo plano. 
                          Asegúrate de tener suficiente espacio de almacenamiento.
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Reset de Empresa */}
            <Card className="border-red-200 bg-red-50">
              <CardHeader>
                <CardTitle className="flex items-center text-red-800">
                  <AlertTriangle className="h-5 w-5 mr-2" />
                  Zona de Peligro
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <p className="text-sm text-red-700">
                    <strong>⚠️ ADVERTENCIA:</strong> Esta acción eliminará permanentemente todos los datos de tu empresa.
                  </p>
                  <ul className="text-sm text-red-600 space-y-1 list-disc list-inside">
                    <li>Todos los préstamos (activos, pendientes, eliminados)</li>
                    <li>Todos los clientes</li>
                    <li>Todos los pagos y cuotas</li>
                    <li>Todos los productos en inventario</li>
                    <li>Todos los empeños</li>
                    <li>Todos los empleados</li>
                    <li>Todos los acuerdos y solicitudes</li>
                    <li>Todas las ventas y compras</li>
                    <li>Todos los reportes guardados</li>
                  </ul>
                  <p className="text-sm font-semibold text-red-800">
                    Solo se conservará la cuenta de empresa y su configuración.
                  </p>
                  <p className="text-xs text-red-600">
                    Esta acción NO se puede deshacer. Necesitarás un código de registro válido para confirmar.
                  </p>
                </div>
                <Button
                  variant="destructive"
                  onClick={() => setShowResetDialog(true)}
                  className="w-full"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Resetear Empresa a Cero
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Dialog de Confirmación de Reset */}
      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center text-red-600">
              <AlertTriangle className="h-5 w-5 mr-2" />
              Confirmar Reset de Empresa
            </DialogTitle>
            <DialogDescription className="pt-4">
              Esta acción eliminará <strong>permanentemente</strong> todos los datos de tu empresa.
              Solo se conservará la cuenta y configuración de empresa.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="reset-code" className="flex items-center gap-2">
                <Key className="h-4 w-4" />
                Código de Confirmación
              </Label>
              <Input
                id="reset-code"
                type="text"
                placeholder="Ingresa un código de registro válido"
                value={resetCode}
                onChange={(e) => {
                  setResetCode(e.target.value);
                  setResetCodeError('');
                }}
                className="mt-2 font-mono"
                disabled={resetting}
              />
              {resetCodeError && (
                <p className="text-sm text-red-600 mt-1">{resetCodeError}</p>
              )}
              <p className="text-xs text-gray-500 mt-1">
                Necesitas un código generado en el Generador de Códigos para confirmar esta acción.
              </p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-800 font-semibold">
                ⚠️ Esta acción NO se puede deshacer
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowResetDialog(false);
                setResetCode('');
                setResetCodeError('');
              }}
              disabled={resetting}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={resetCompanyData}
              disabled={resetting || !resetCode.trim()}
            >
              {resetting ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Eliminando...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Confirmar y Eliminar Todo
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CompanySettings;