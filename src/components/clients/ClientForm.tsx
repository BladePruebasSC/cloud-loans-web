// ============================================================================
// ALTA Y EDICIÓN DE CLIENTES
// ============================================================================
// Antes era una sola página con 7 tarjetas y ~50 campos seguidos, sin distinguir lo
// obligatorio de lo opcional: había que bajar por todo el formulario para descubrir qué
// faltaba, y los errores llegaban de golpe como un toast al final.
//
// Ahora es un asistente de 5 pasos con validación por paso y errores junto al campo. Cambios
// de fondo, no solo de aspecto:
//
//  · UBICACIÓN EN CASCADA: Provincia → Municipio → Distrito Municipal. Antes "Municipio" y
//    "Sector" eran texto libre con el marcador "SELECCIONAR PROVINCIA" — la cascada estaba
//    prevista pero nunca se construyó, así que cada empleado escribía el municipio a su
//    manera y los informes por zona no cuadraban.
//  · TELÉFONO OBLIGATORIO: antes bastaba con teléfono O WhatsApp. Un cliente sin teléfono
//    principal es incobrable.
//  · AVISO DE CÉDULA DUPLICADA: al salir del campo se comprueba si ya existe un cliente con
//    esa cédula en la empresa, con enlace para abrirlo. Evita el alta duplicada.
//  · SE ELIMINAN LOS CAMPOS DUPLICADOS "Ciudad" y "Barrio / Sector": eran los mismos datos
//    que Municipio y Sector en otra tarjeta, y se llenaban por separado. `city` y
//    `neighborhood` se siguen guardando (los usan el mapa, los informes y las cartas de
//    intimación), pero ahora se derivan de la cascada en vez de pedirse dos veces.

import React, { useEffect, useMemo, useRef, useState, FormEvent } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NumberInput } from '@/components/ui/number-input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertTriangle, ArrowLeft, ArrowRight, Briefcase, Camera, Check, Loader2, MapPin,
  MoreHorizontal, Phone, ShieldCheck, Unlock, Upload, User, UserPlus, X,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import {
  MUNICIPAL_SEAT, PROVINCE_NAMES, getDistricts, getMunicipalities,
  normalizeStoredTerritory,
} from '@/data/dominicanRepublic';
import {
  DOCUMENT_TYPES, formatDocument, documentToStored, getDocumentTypeInfo, supportsJceLookup,
  validateDocument, type DocumentType,
} from '@/utils/dominicanId';
import { useJceLookup } from '@/hooks/useJceLookup';
import { LocationPicker } from './LocationPicker';

const DOMINICAN_BANKS = [
  'Banco Popular Dominicano', 'Banco de Reservas', 'Banco BHD León', 'Banco del Progreso',
  'Banco Santa Cruz', 'Banco López de Haro', 'Banco Vimenca', 'Banco Ademi', 'Banco Caribe',
  'Banco Promerica', 'Banco BDI', 'Banco Múltiple Activo', 'Banco Unión', 'Banco Peravia',
  'Banco de Ahorro y Crédito', 'Otro',
];

const COLOR_CLASSIFICATIONS = [
  'Sin color asignado', 'Rojo', 'Verde', 'Azul', 'Amarillo', 'Naranja', 'Morado', 'Rosa', 'Gris',
];

const MARITAL_STATUSES = ['Soltero(a)', 'Casado(a)', 'Unión libre', 'Divorciado(a)', 'Viudo(a)'];

const EMPLOYMENT_STATUSES = [
  'Empleado privado', 'Empleado público', 'Independiente / Cuenta propia', 'Comerciante',
  'Pensionado / Jubilado', 'Desempleado', 'Estudiante', 'Otro',
];

/** Valor centinela del selector de distrito para escribir uno que no esté en el catálogo. */
const DISTRICT_OTHER = '__otro__';

type ClientFormState = {
  /** Qué documento presenta. El NÚMERO va en `dni` (así se llama la columna). */
  document_type: DocumentType;
  first_name: string; last_name: string; nickname: string; dni: string;
  nationality: string; birth_date: string; gender: string; marital_status: string; photo_url: string;
  occupation: string; monthly_income: string; housing: string; dependents: string;
  employment_status: string; rnc: string;
  whatsapp: string; phone: string; phone_secondary: string; email: string;
  address: string; province: string; municipality: string; municipal_district: string;
  sector: string; collection_route: string; workplace_name: string; workplace_address: string;
  card_number: string; bank_user: string; bank_code: string; bank_token_identifier: string; bank_name: string;
  recommended_by: string; color_classification: string; visible_in_loan_data: string;
  custom_field_1: string; custom_field_2: string; attachment_url: string;
  credit_score: string; status: 'active' | 'inactive' | 'blacklisted';
};

const defaultFormState: ClientFormState = {
  document_type: 'cedula',
  first_name: '', last_name: '', nickname: '', dni: '',
  nationality: 'Dominicano', birth_date: '', gender: '', marital_status: '', photo_url: '',
  occupation: '', monthly_income: '', housing: '', dependents: '', employment_status: '', rnc: '',
  whatsapp: '', phone: '', phone_secondary: '', email: '',
  address: '', province: '', municipality: '', municipal_district: '',
  sector: '', collection_route: '', workplace_name: '', workplace_address: '',
  card_number: '', bank_user: '', bank_code: '', bank_token_identifier: '', bank_name: '',
  recommended_by: '', color_classification: 'Sin color asignado', visible_in_loan_data: 'SI',
  custom_field_1: '', custom_field_2: '', attachment_url: '',
  credit_score: '', status: 'active',
};

// ---------------------------------------------------------------------------
// Formato
// ---------------------------------------------------------------------------

// El formato del documento lo resuelve `formatDocument` según el tipo (cédula con máscara,
// pasaporte/DNI/ID en mayúsculas), en `utils/dominicanId.ts`.

/** Teléfono: (000) 000-0000 */
const formatPhone = (value: string): string => {
  const d = value.replace(/\D/g, '').slice(0, 10);
  if (d.length === 0) return '';
  if (d.length <= 3) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
};

const digits = (v: string) => String(v || '').replace(/\D/g, '');

/** Convierte un teléfono guardado (+18091234567) al formato que muestra el campo. */
const phoneFromStored = (v?: string | null): string => {
  let d = digits(String(v ?? ''));
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  return formatPhone(d);
};

/** Normaliza para guardar: 10 dígitos con prefijo +1, o null si está vacío. */
const phoneToStored = (v: string): string | null => {
  let d = digits(v);
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  d = d.slice(0, 10);
  return d ? `+1${d}` : null;
};

// ---------------------------------------------------------------------------
// Pasos
// ---------------------------------------------------------------------------

type StepId = 'identidad' | 'contacto' | 'ubicacion' | 'trabajo' | 'extras';

const STEPS: { id: StepId; label: string; short: string; icon: React.ElementType }[] = [
  { id: 'identidad', label: 'Identidad', short: 'Quién es', icon: User },
  { id: 'contacto', label: 'Contacto', short: 'Cómo localizarlo', icon: Phone },
  { id: 'ubicacion', label: 'Ubicación', short: 'Dónde vive', icon: MapPin },
  { id: 'trabajo', label: 'Trabajo e ingresos', short: 'De qué vive', icon: Briefcase },
  { id: 'extras', label: 'Otros datos', short: 'Opcional', icon: MoreHorizontal },
];

type Errors = Partial<Record<keyof ClientFormState, string>>;

/** Validación de un paso. Devuelve los errores; vacío = paso completo. */
const validateStep = (step: StepId, d: ClientFormState): Errors => {
  const e: Errors = {};

  if (step === 'identidad') {
    if (!d.first_name.trim()) e.first_name = 'El nombre es obligatorio';
    if (!d.last_name.trim()) e.last_name = 'El apellido es obligatorio';
    // La validación depende del tipo: la cédula lleva dígito verificador, el resto no.
    const docError = validateDocument(d.document_type, d.dni);
    if (docError) e.dni = docError;
    if (d.birth_date) {
      const born = new Date(`${d.birth_date}T00:00:00`);
      if (Number.isNaN(born.getTime())) e.birth_date = 'Fecha inválida';
      else if (born > new Date()) e.birth_date = 'La fecha no puede ser futura';
      else {
        const age = Math.floor((Date.now() - born.getTime()) / (365.25 * 24 * 3600 * 1000));
        if (age < 18) e.birth_date = `El cliente tendría ${age} años: debe ser mayor de edad`;
        if (age > 110) e.birth_date = 'Revisa la fecha: la edad no es plausible';
      }
    }
  }

  if (step === 'contacto') {
    // CAMBIO: el teléfono principal pasa a ser obligatorio (antes bastaba con WhatsApp).
    const phone = digits(d.phone);
    if (!phone) e.phone = 'El teléfono principal es obligatorio';
    else if (phone.length !== 10) e.phone = `El teléfono debe tener 10 dígitos (llevas ${phone.length})`;

    const wa = digits(d.whatsapp);
    if (wa && wa.length !== 10) e.whatsapp = 'El WhatsApp debe tener 10 dígitos';

    const alt = digits(d.phone_secondary);
    if (alt && alt.length !== 10) e.phone_secondary = 'El teléfono alterno debe tener 10 dígitos';

    if (d.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) {
      e.email = 'Correo inválido';
    }
  }

  if (step === 'ubicacion') {
    if (!d.province) e.province = 'La provincia es obligatoria';
    if (!d.municipality) e.municipality = 'El municipio es obligatorio';
  }

  return e;
};

const STEP_ORDER: StepId[] = STEPS.map(s => s.id);

/**
 * Fila de `clients` tal como la lee este formulario.
 *
 * Se declara aquí porque `integrations/supabase/types.ts` está generado desde un esquema
 * anterior y no incluye las columnas añadidas después (`province`, `municipality`, `sector`,
 * `first_name`, `municipal_district`…). Todo opcional: un cliente antiguo puede no tenerlas.
 */
type ClientRow = Partial<Record<
  | 'full_name' | 'first_name' | 'last_name' | 'nickname' | 'dni' | 'nationality' | 'birth_date'
  | 'gender' | 'marital_status' | 'photo_url' | 'occupation' | 'employment_status' | 'rnc'
  | 'whatsapp' | 'phone' | 'phone_secondary' | 'email' | 'address' | 'province' | 'municipality'
  | 'municipal_district' | 'sector' | 'city' | 'neighborhood' | 'collection_route'
  | 'workplace_name' | 'workplace_address' | 'card_number' | 'bank_user' | 'bank_code'
  | 'bank_token_identifier' | 'bank_name' | 'recommended_by' | 'color_classification'
  | 'custom_field_1' | 'custom_field_2' | 'attachment_url' | 'status'
  | 'document_type' | 'location_note',
  string | null
>> & {
  monthly_income?: number | null; housing?: number | null; dependents?: number | null;
  credit_score?: number | null; visible_in_loan_data?: boolean | null;
  jce_verified?: boolean | null; latitude?: number | null; longitude?: number | null;
  location_accuracy?: number | null;
};

/** Valores admitidos por una columna de `clients` al guardar. */
type ClientPayload = Record<string, string | number | boolean | null>;

/**
 * Etiqueta + control + error/ayuda.
 *
 * Vive FUERA del componente a propósito: definido dentro, React lo vería como un tipo de
 * componente distinto en cada render, desmontaría el subárbol y el campo perdería el foco
 * en cada tecla.
 */
const Field = ({ label, required, error, hint, children }: {
  label: string; required?: boolean; error?: string; hint?: string; children: React.ReactNode;
}) => (
  <div className="space-y-1.5">
    <Label className={error ? 'text-red-600' : undefined}>
      {label}{required && <span className="ml-0.5 text-red-500">*</span>}
    </Label>
    {children}
    {error
      ? <p className="text-xs font-medium text-red-600">{error}</p>
      : hint ? <p className="text-xs text-gray-500">{hint}</p> : null}
  </div>
);

const ClientForm = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ id: string }>();
  const { companyId, user, profile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  const isEditing = location.pathname.startsWith('/clientes/editar');
  const [formData, setFormData] = useState<ClientFormState>(defaultFormState);
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [photoPreview, setPhotoPreview] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);

  const [step, setStep] = useState<StepId>('identidad');
  /** Pasos que el empleado ya intentó pasar: solo entonces se muestran sus errores. */
  const [visited, setVisited] = useState<Set<StepId>>(new Set());
  const [districtIsCustom, setDistrictIsCustom] = useState(false);
  const [waSameAsPhone, setWaSameAsPhone] = useState(false);
  const [duplicate, setDuplicate] = useState<{ id: string; full_name: string } | null>(null);
  const [checkingDni, setCheckingDni] = useState(false);

  // Consulta a la JCE. `verified` bloquea los campos que confirmó el registro civil.
  const {
    lookup: jceLookup, loading: jceLoading, error: jceError,
    diagnostic: jceDiagnostic, clearError: clearJceError,
  } = useJceLookup();
  const [jceConsent, setJceConsent] = useState(false);
  const [jceVerified, setJceVerified] = useState(false);
  const [jcePhoto, setJcePhoto] = useState<string | null>(null);
  const [jceCity, setJceCity] = useState<string | null>(null);

  // Ubicación GPS de la vivienda (para la ruta de cobro)
  // Se llama `homeLocation` y no `location` porque ese nombre ya lo ocupa `useLocation()`
  // del router unas líneas más arriba.
  const [homeLocation, setHomeLocation] = useState<{
    latitude: number | null; longitude: number | null; accuracy: number | null; note: string;
  }>({ latitude: null, longitude: null, accuracy: null, note: '' });

  // -------------------------------------------------------------------------
  // Carga
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (isEditing && params.id) fetchClient(params.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, params.id]);

  const fetchClient = async (clientId: string) => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('clients').select('*').eq('id', clientId).maybeSingle();
      if (error) throw error;
      if (!data) {
        toast.error('Cliente no encontrado');
        navigate('/clientes');
        return;
      }

      const d = data as ClientRow;
      const fullName = d.full_name || '';
      const parts = fullName.split(' ');

      // Datos antiguos: el municipio pudo guardarse solo en `city`, y el sector en
      // `neighborhood`. Se recuperan y se ajustan a la grafía del catálogo.
      const territory = normalizeStoredTerritory({
        province: d.province || '',
        municipality: d.municipality || d.city || '',
        district: d.municipal_district || '',
      });

      const phone = phoneFromStored(d.phone);
      const whatsapp = phoneFromStored(d.whatsapp);

      const documentType = (DOCUMENT_TYPES.some(t => t.value === d.document_type)
        ? d.document_type
        : 'cedula') as DocumentType;

      setFormData({
        document_type: documentType,
        first_name: d.first_name || parts[0] || '',
        last_name: d.last_name || parts.slice(1).join(' ') || '',
        nickname: d.nickname || '',
        dni: d.dni ? formatDocument(documentType, d.dni) : '',
        nationality: d.nationality || 'Dominicano',
        birth_date: d.birth_date || '',
        gender: d.gender || '',
        marital_status: d.marital_status || '',
        photo_url: d.photo_url || '',
        occupation: d.occupation || '',
        monthly_income: d.monthly_income ? String(d.monthly_income) : '',
        housing: d.housing ? String(d.housing) : '',
        dependents: d.dependents !== null && d.dependents !== undefined ? String(d.dependents) : '',
        employment_status: d.employment_status || '',
        rnc: d.rnc || '',
        whatsapp,
        phone,
        phone_secondary: phoneFromStored(d.phone_secondary),
        email: d.email || '',
        address: d.address || '',
        province: territory.province,
        municipality: territory.municipality,
        municipal_district: territory.district,
        sector: d.sector || d.neighborhood || '',
        collection_route: d.collection_route || '',
        workplace_name: d.workplace_name || '',
        workplace_address: d.workplace_address || '',
        card_number: d.card_number || '',
        bank_user: d.bank_user || '',
        bank_code: d.bank_code || '',
        bank_token_identifier: d.bank_token_identifier || '',
        bank_name: d.bank_name || '',
        recommended_by: d.recommended_by || '',
        color_classification: d.color_classification || 'Sin color asignado',
        visible_in_loan_data: d.visible_in_loan_data === false ? 'NO' : 'SI',
        custom_field_1: d.custom_field_1 || '',
        custom_field_2: d.custom_field_2 || '',
        attachment_url: d.attachment_url || '',
        credit_score: d.credit_score !== null && d.credit_score !== undefined ? String(d.credit_score) : '',
        status: (d.status as ClientFormState['status']) || 'active',
      });

      if (whatsapp && whatsapp === phone) setWaSameAsPhone(true);

      setJceVerified(d.jce_verified === true);
      setHomeLocation({
        latitude: d.latitude !== null && d.latitude !== undefined ? Number(d.latitude) : null,
        longitude: d.longitude !== null && d.longitude !== undefined ? Number(d.longitude) : null,
        accuracy: d.location_accuracy !== null && d.location_accuracy !== undefined
          ? Number(d.location_accuracy) : null,
        note: d.location_note || '',
      });

      // El distrito guardado no está en el catálogo → el selector arranca en "Otro".
      const known = getDistricts(territory.province, territory.municipality);
      if (territory.district && territory.district !== MUNICIPAL_SEAT && !known.includes(territory.district)) {
        setDistrictIsCustom(true);
      }
      if (d.photo_url) setPhotoPreview(d.photo_url);
    } catch (error) {
      console.error('Error cargando cliente', error);
      toast.error('No se pudo cargar la información del cliente');
      navigate('/clientes');
    } finally {
      setLoading(false);
    }
  };

  // -------------------------------------------------------------------------
  // Cambios
  // -------------------------------------------------------------------------
  const handleChange = (field: keyof ClientFormState, value: string) => {
    setFormData(prev => {
      let v = value;
      if (field === 'dni') v = formatDocument(prev.document_type, value);
      else if (field === 'phone' || field === 'whatsapp' || field === 'phone_secondary') v = formatPhone(value);

      const next = { ...prev, [field]: v } as ClientFormState;
      // Con "WhatsApp = teléfono" activo, el WhatsApp sigue al principal.
      if (field === 'phone' && waSameAsPhone) next.whatsapp = v;
      return next;
    });

    if (field === 'dni') {
      setDuplicate(null);
      // Cambiar el número invalida la verificación anterior: los campos vuelven a editarse.
      if (jceVerified) { setJceVerified(false); setJcePhoto(null); setJceCity(null); }
      clearJceError();
    }
  };

  /**
   * Cambiar el tipo de documento reformatea el número y anula la verificación: la cédula
   * lleva máscara y dígito verificador, un pasaporte no.
   */
  const handleDocumentTypeChange = (value: string) => {
    const type = value as DocumentType;
    setFormData(prev => ({ ...prev, document_type: type, dni: formatDocument(type, prev.dni) }));
    setDuplicate(null);
    setJceVerified(false);
    setJcePhoto(null);
    setJceCity(null);
    setJceConsent(false);
    clearJceError();
  };

  /** Consulta la JCE y rellena lo que confirma el registro civil. */
  const runJceLookup = async () => {
    const result = await jceLookup(formData.dni, jceConsent);
    if (!result) return;

    setFormData(prev => {
      const next: ClientFormState = {
        ...prev,
        first_name: result.firstName || prev.first_name,
        last_name: result.lastName || prev.last_name,
        birth_date: result.birthDate || prev.birth_date,
        gender: result.gender || prev.gender,
        nationality: result.nationality || prev.nationality,
        // El estado civil se autoselecciona solo si la JCE devolvió uno reconocible.
        marital_status: result.maritalStatus || prev.marital_status,
      };

      // La ciudad de la JCE es la del REGISTRO, no necesariamente donde vive hoy. Solo se
      // usa para precargar la cascada, y únicamente si el empleado no había puesto ya otra
      // cosa: lo que se guarda es el domicilio ACTUAL y él manda.
      if (result.province && !prev.province) {
        next.province = result.province;
        next.municipality = result.municipality;
        next.municipal_district = '';
      }
      return next;
    });

    setJceVerified(true);
    setJcePhoto(result.photoUrl);
    setJceCity(result.city);
    setDuplicate(null);
    toast.success(
      result.cached
        ? 'Datos verificados (desde la caché de consultas previas)'
        : 'Datos verificados con la JCE'
    );
  };

  /** Permite corregir a mano si el reparto nombre/apellido no salió bien. */
  const unlockJceFields = () => {
    setJceVerified(false);
    toast.info('Campos desbloqueados. El cliente quedará como no verificado.');
  };

  /** Cambiar provincia invalida municipio y distrito; cambiar municipio invalida distrito. */
  const handleProvinceChange = (province: string) => {
    setFormData(prev => ({ ...prev, province, municipality: '', municipal_district: '' }));
    setDistrictIsCustom(false);
  };

  const handleMunicipalityChange = (municipality: string) => {
    setFormData(prev => ({ ...prev, municipality, municipal_district: '' }));
    setDistrictIsCustom(false);
  };

  const handleDistrictChange = (value: string) => {
    if (value === DISTRICT_OTHER) {
      setDistrictIsCustom(true);
      setFormData(prev => ({ ...prev, municipal_district: '' }));
      return;
    }
    setDistrictIsCustom(false);
    setFormData(prev => ({ ...prev, municipal_district: value }));
  };

  const toggleWaSameAsPhone = (checked: boolean) => {
    setWaSameAsPhone(checked);
    if (checked) setFormData(prev => ({ ...prev, whatsapp: prev.phone }));
  };

  /** Avisa (sin bloquear) si ya existe un cliente con ese documento en la empresa. */
  const checkDuplicateDni = async () => {
    // Solo se busca cuando el número es válido para su tipo; si no, no hay nada que comparar.
    if (validateDocument(formData.document_type, formData.dni)) return;
    const dni = documentToStored(formData.document_type, formData.dni);
    if (!dni || !companyId) return;
    setCheckingDni(true);
    try {
      const { data } = await supabase
        .from('clients')
        .select('id, full_name')
        .eq('user_id', companyId)
        .eq('dni', dni)
        .limit(1);
      const hit = (data || [])[0];
      setDuplicate(hit && hit.id !== params.id ? hit : null);
    } catch (error) {
      console.error('Error verificando cédula duplicada', error);
    } finally {
      setCheckingDni(false);
    }
  };

  // -------------------------------------------------------------------------
  // Subidas
  // -------------------------------------------------------------------------
  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Por favor selecciona una imagen'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('La imagen debe ser menor a 5MB'); return; }

    setUploadingPhoto(true);
    try {
      if (!user?.id) throw new Error('Usuario no autenticado');
      const ext = file.name.split('.').pop();
      const filePath = `user-${user.id}/client-photos/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('documents').upload(filePath, file, { upsert: true });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(filePath);
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
      if (!user?.id) throw new Error('Usuario no autenticado');
      const filePath = `user-${user.id}/client-attachments/${Date.now()}_${file.name}`;
      const { error } = await supabase.storage.from('documents').upload(filePath, file, { upsert: true });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(filePath);
      setFormData(prev => ({ ...prev, attachment_url: publicUrl }));
      toast.success('Archivo adjunto subido exitosamente');
    } catch (error) {
      console.error('Error subiendo archivo', error);
      toast.error('Error al subir el archivo');
    } finally {
      setUploadingAttachment(false);
    }
  };

  // -------------------------------------------------------------------------
  // Validación
  // -------------------------------------------------------------------------
  const errorsByStep = useMemo(() => {
    const map = {} as Record<StepId, Errors>;
    for (const s of STEP_ORDER) map[s] = validateStep(s, formData);
    return map;
  }, [formData]);

  const allErrors = useMemo(
    () => Object.assign({}, ...STEP_ORDER.map(s => errorsByStep[s])) as Errors,
    [errorsByStep],
  );
  const isComplete = Object.keys(allErrors).length === 0;

  /** Los errores de un paso solo se muestran cuando ya se pasó por él. */
  const visibleErrors = (s: StepId): Errors => (visited.has(s) ? errorsByStep[s] : {});
  const err = (field: keyof ClientFormState): string | undefined => visibleErrors(step)[field];

  const markVisited = (s: StepId) => setVisited(prev => new Set(prev).add(s));

  const goTo = (target: StepId) => {
    markVisited(step);
    setStep(target);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goNext = () => {
    markVisited(step);
    const idx = STEP_ORDER.indexOf(step);
    if (Object.keys(errorsByStep[step]).length > 0) {
      toast.error('Revisa los campos marcados antes de continuar');
      return;
    }
    if (idx < STEP_ORDER.length - 1) goTo(STEP_ORDER[idx + 1]);
  };

  const goBack = () => {
    const idx = STEP_ORDER.indexOf(step);
    if (idx > 0) goTo(STEP_ORDER[idx - 1]);
  };

  // -------------------------------------------------------------------------
  // Guardar
  // -------------------------------------------------------------------------
  const handleSubmit = async (event?: FormEvent) => {
    event?.preventDefault();

    if (!companyId || !user?.id) {
      toast.error('No se pudo identificar la empresa');
      return;
    }

    setVisited(new Set(STEP_ORDER));
    if (!isComplete) {
      const firstBad = STEP_ORDER.find(s => Object.keys(errorsByStep[s]).length > 0)!;
      setStep(firstBad);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      toast.error(`Faltan datos en "${STEPS.find(s => s.id === firstBad)!.label}"`);
      return;
    }

    const fullName = `${formData.first_name.trim()} ${formData.last_name.trim()}`.trim();
    const municipality = formData.municipality.trim() || null;
    const sector = formData.sector.trim() || null;

    const payload: ClientPayload = {
      full_name: fullName,
      first_name: formData.first_name.trim(),
      last_name: formData.last_name.trim(),
      nickname: formData.nickname.trim() || null,
      document_type: formData.document_type,
      dni: documentToStored(formData.document_type, formData.dni),
      jce_verified: jceVerified,
      jce_verified_at: jceVerified ? new Date().toISOString() : null,
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
      whatsapp: phoneToStored(formData.whatsapp),
      phone: phoneToStored(formData.phone),
      phone_secondary: phoneToStored(formData.phone_secondary),
      email: formData.email.trim() || null,
      address: formData.address.trim() || null,
      province: formData.province || null,
      municipality,
      municipal_district: formData.municipal_district.trim() || null,
      sector,
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
      // `city` y `neighborhood` se derivan de la cascada: el mapa, los informes y las cartas
      // de intimación los siguen leyendo, pero ya no se piden dos veces al empleado.
      city: municipality,
      neighborhood: sector,
      // Ubicación de la vivienda, para la ruta de cobro
      latitude: homeLocation.latitude,
      longitude: homeLocation.longitude,
      // Radio de error del GPS. Sirve para saber si el punto es de fiar: uno tomado con
      // 500 m de error no distingue una casa de la siguiente calle.
      location_accuracy: homeLocation.accuracy,
      location_note: homeLocation.note.trim() || null,
      location_updated_at: homeLocation.latitude !== null ? new Date().toISOString() : null,
      credit_score: formData.credit_score ? Number(formData.credit_score) : null,
      status: formData.status,
      user_id: companyId,
      created_by: user.id,
      updated_at: new Date().toISOString(),
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
      toast.error(error instanceof Error ? error.message : 'No se pudo guardar el cliente');
    } finally {
      setSaving(false);
    }
  };

  // -------------------------------------------------------------------------
  // Opciones de la cascada
  // -------------------------------------------------------------------------
  // Si un valor guardado no está en el catálogo (datos antiguos escritos a mano), se añade
  // como opción para no perderlo al abrir la ficha.
  const provinceOptions = useMemo(() => {
    const list = [...PROVINCE_NAMES];
    if (formData.province && !list.includes(formData.province)) list.unshift(formData.province);
    return list;
  }, [formData.province]);

  const municipalityOptions = useMemo(() => {
    const list = getMunicipalities(formData.province);
    if (formData.municipality && !list.includes(formData.municipality)) return [formData.municipality, ...list];
    return list;
  }, [formData.province, formData.municipality]);

  const districtOptions = useMemo(
    () => getDistricts(formData.province, formData.municipality),
    [formData.province, formData.municipality],
  );

  const districtSelectValue = districtIsCustom
    ? DISTRICT_OTHER
    : (formData.municipal_district || undefined);

  const docInfo = getDocumentTypeInfo(formData.document_type);
  const canUseJce = supportsJceLookup(formData.document_type);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-6">
        <div className="flex items-center gap-2 text-gray-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          Cargando información del cliente…
        </div>
      </div>
    );
  }

  const stepIndex = STEP_ORDER.indexOf(step);
  const isLastStep = stepIndex === STEP_ORDER.length - 1;

  return (
    <div className="mx-auto max-w-5xl p-4 pb-28 sm:p-6">
      {/* Cabecera */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">
            {isEditing ? 'Edición' : 'Registro'}
          </p>
          <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
            {isEditing ? 'Editar cliente' : 'Nuevo cliente'}
          </h1>
          {(formData.first_name || formData.dni) && (
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-600">
              <span className="font-medium">
                {`${formData.first_name} ${formData.last_name}`.trim() || 'Sin nombre'}
              </span>
              {formData.dni && <Badge variant="outline">{formData.dni}</Badge>}
              {formData.phone && <Badge variant="outline">{formData.phone}</Badge>}
            </p>
          )}
        </div>
        <Button variant="outline" onClick={() => navigate('/clientes')} disabled={saving}>
          Cancelar
        </Button>
      </div>

      {/* Pasos */}
      <div className="mb-5 overflow-x-auto">
        <div className="flex min-w-max items-center gap-1">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const active = s.id === step;
            const stepErrors = Object.keys(errorsByStep[s.id]).length;
            const done = stepErrors === 0 && (visited.has(s.id) || i < stepIndex);
            const failing = visited.has(s.id) && stepErrors > 0;
            return (
              <React.Fragment key={s.id}>
                {i > 0 && <div className="h-px w-4 shrink-0 bg-gray-300 sm:w-8" />}
                <button
                  type="button"
                  onClick={() => goTo(s.id)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left transition ${
                    active
                      ? 'border-blue-500 bg-blue-50'
                      : failing
                        ? 'border-red-200 bg-red-50 hover:bg-red-100'
                        : 'border-gray-200 bg-white hover:bg-gray-50'
                  }`}
                >
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    failing ? 'bg-red-500 text-white'
                      : done ? 'bg-green-500 text-white'
                        : active ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
                  }`}>
                    {failing ? <AlertTriangle className="h-3.5 w-3.5" />
                      : done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  <span className="hidden sm:block">
                    <span className={`block text-sm font-medium ${active ? 'text-blue-900' : 'text-gray-700'}`}>
                      {s.label}
                    </span>
                    <span className="block text-[11px] text-gray-500">{s.short}</span>
                  </span>
                  <Icon className="h-4 w-4 text-gray-400 sm:hidden" />
                </button>
              </React.Fragment>
            );
          })}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* ---------------------------------------------------------------- */}
        {/* PASO 1 — IDENTIDAD                                                */}
        {/* ---------------------------------------------------------------- */}
        {step === 'identidad' && (
          <Card>
            <CardHeader>
              <CardTitle>¿Quién es el cliente?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                <div className="relative">
                  {photoPreview ? (
                    <>
                      <img src={photoPreview} alt="Foto del cliente"
                        className="h-24 w-24 rounded-full border object-cover" />
                      <button
                        type="button"
                        onClick={() => { setPhotoPreview(''); setFormData(p => ({ ...p, photo_url: '' })); }}
                        className="absolute -right-1 -top-1 rounded-full bg-red-500 p-1 text-white hover:bg-red-600"
                        aria-label="Quitar foto"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </>
                  ) : (
                    <div className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-dashed border-gray-300 bg-gray-50">
                      <Camera className="h-8 w-8 text-gray-400" />
                    </div>
                  )}
                </div>
                <div>
                  <input ref={fileInputRef} type="file" accept="image/*"
                    onChange={handlePhotoUpload} className="hidden" />
                  <Button type="button" variant="outline" size="sm"
                    onClick={() => fileInputRef.current?.click()} disabled={uploadingPhoto}>
                    {uploadingPhoto
                      ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Subiendo…</>
                      : <><Camera className="mr-2 h-4 w-4" />{photoPreview ? 'Cambiar foto' : 'Subir foto'}</>}
                  </Button>
                  <p className="mt-1 text-xs text-gray-500">Opcional. Máximo 5 MB.</p>
                </div>
              </div>

              {/* El documento va PRIMERO: de su tipo dependen la máscara, la validación y
                  si se puede consultar la JCE. */}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Field label="Tipo de documento" required>
                  <Select value={formData.document_type} onValueChange={handleDocumentTypeChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DOCUMENT_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field
                  label="Número de documento" required error={err('dni')}
                  hint={checkingDni ? 'Verificando…' : docInfo.hint}
                >
                  <Input
                    value={formData.dni}
                    autoFocus
                    inputMode={formData.document_type === 'cedula' ? 'numeric' : 'text'}
                    onChange={(e) => handleChange('dni', e.target.value)}
                    onBlur={checkDuplicateDni}
                    placeholder={docInfo.placeholder}
                  />
                </Field>
                <Field label="Apodo" hint="Como lo conocen en el barrio">
                  <Input value={formData.nickname}
                    onChange={(e) => handleChange('nickname', e.target.value)}
                    placeholder="Juancho" />
                </Field>
              </div>

              {/* Verificación con la JCE — solo para cédula */}
              {canUseJce && (
                <div className={`rounded-lg border p-3 ${jceVerified ? 'border-green-300 bg-green-50' : 'border-blue-200 bg-blue-50'}`}>
                  {jceVerified ? (
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        {jcePhoto && (
                          <img src={jcePhoto} alt="Foto de la JCE"
                            className="h-16 w-16 rounded border border-green-300 object-cover" />
                        )}
                        <div className="text-sm text-green-900">
                          <p className="flex items-center gap-1.5 font-semibold">
                            <ShieldCheck className="h-4 w-4" /> Verificado con la JCE
                          </p>
                          <p className="text-xs">
                            Nombre, apellido, sexo y fecha de nacimiento quedan bloqueados porque
                            los confirma el registro civil.
                            {jceCity && <> Ciudad de registro: <strong>{jceCity}</strong>.</>}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {jcePhoto && !photoPreview && (
                          <Button type="button" variant="outline" size="sm"
                            onClick={() => { setPhotoPreview(jcePhoto); setFormData(p => ({ ...p, photo_url: jcePhoto })); }}>
                            Usar esta foto
                          </Button>
                        )}
                        <Button type="button" variant="ghost" size="sm" onClick={unlockJceFields}>
                          <Unlock className="mr-1 h-3.5 w-3.5" /> Corregir a mano
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-blue-900">
                        Verificar la cédula con la JCE
                      </p>
                      <p className="text-xs text-blue-800">
                        Rellena nombre, apellido, sexo, fecha de nacimiento y estado civil desde el
                        registro civil, y evita errores de digitación.
                      </p>
                      <label className="flex cursor-pointer items-start gap-2 text-xs text-blue-900">
                        <Checkbox checked={jceConsent}
                          onCheckedChange={(c) => setJceConsent(c === true)} className="mt-0.5" />
                        <span>
                          El titular <strong>autoriza</strong> consultar sus datos en bases externas
                          (Ley 172-13 de Protección de Datos Personales). Cada consulta queda
                          registrada con el usuario que la hizo.
                        </span>
                      </label>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button" size="sm"
                          onClick={runJceLookup}
                          disabled={!jceConsent || jceLoading || !!validateDocument('cedula', formData.dni)}
                        >
                          {jceLoading
                            ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Consultando…</>
                            : <><ShieldCheck className="mr-2 h-4 w-4" />Verificar cédula</>}
                        </Button>
                        {!jceConsent && (
                          <span className="text-xs text-blue-700">Marca la autorización para continuar.</span>
                        )}
                      </div>
                      {jceError && (
                        <div className="space-y-1">
                          <p className="flex items-start gap-1.5 text-xs font-medium text-red-700">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{jceError}
                          </p>
                          {jceDiagnostic && (
                            <p className="rounded border border-red-200 bg-red-50 px-2 py-1 font-mono text-[11px] leading-snug text-red-800">
                              {jceDiagnostic}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Nombres" required error={err('first_name')}
                  hint={jceVerified ? 'Confirmado por la JCE' : undefined}>
                  <Input value={formData.first_name} disabled={jceVerified}
                    onChange={(e) => handleChange('first_name', e.target.value)}
                    placeholder="Juan Carlos" />
                </Field>
                <Field label="Apellidos" required error={err('last_name')}
                  hint={jceVerified ? 'Confirmado por la JCE' : undefined}>
                  <Input value={formData.last_name} disabled={jceVerified}
                    onChange={(e) => handleChange('last_name', e.target.value)}
                    placeholder="Pérez Santana" />
                </Field>
              </div>

              {duplicate && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    Ya existe un cliente con esta cédula: <strong>{duplicate.full_name}</strong>.
                    <button
                      type="button"
                      className="ml-2 underline"
                      onClick={() => navigate(`/clientes/editar/${duplicate.id}`)}
                    >
                      Abrir ese cliente
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Field label="Nacionalidad">
                  <Select value={formData.nationality || undefined}
                    onValueChange={(v) => handleChange('nationality', v)}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>
                      {['Dominicano', 'Haitiano', 'Estadounidense', 'Español', 'Venezolano', 'Otro'].map(n => (
                        <SelectItem key={n} value={n}>{n}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Fecha de nacimiento" error={err('birth_date')}
                  hint={jceVerified ? 'Confirmada por la JCE' : 'Opcional'}>
                  <Input type="date" value={formData.birth_date} disabled={jceVerified}
                    max={new Date().toISOString().split('T')[0]}
                    onChange={(e) => handleChange('birth_date', e.target.value)} />
                </Field>
                <Field label="Estado civil"
                  hint={jceVerified && formData.marital_status ? 'Traído de la JCE — puedes cambiarlo' : undefined}>
                  <Select value={formData.marital_status || undefined}
                    onValueChange={(v) => handleChange('marital_status', v)}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>
                      {MARITAL_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <Field label="Sexo" hint={jceVerified ? 'Confirmado por la JCE' : undefined}>
                <RadioGroup value={formData.gender} disabled={jceVerified}
                  onValueChange={(v) => handleChange('gender', v)}>
                  <div className="flex gap-6">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="MASCULINO" id="gender-m" />
                      <Label htmlFor="gender-m" className="cursor-pointer font-normal">Masculino</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="FEMENINO" id="gender-f" />
                      <Label htmlFor="gender-f" className="cursor-pointer font-normal">Femenino</Label>
                    </div>
                  </div>
                </RadioGroup>
              </Field>
            </CardContent>
          </Card>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* PASO 2 — CONTACTO                                                 */}
        {/* ---------------------------------------------------------------- */}
        {step === 'contacto' && (
          <Card>
            <CardHeader>
              <CardTitle>¿Cómo localizarlo?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Teléfono principal" required error={err('phone')}
                  hint="Es el número al que se llama para cobrar">
                  <Input type="tel" inputMode="numeric" value={formData.phone} autoFocus
                    onChange={(e) => handleChange('phone', e.target.value)}
                    placeholder="(809) 000-0000" />
                </Field>
                <Field label="WhatsApp" error={err('whatsapp')}>
                  <Input type="tel" inputMode="numeric" value={formData.whatsapp}
                    disabled={waSameAsPhone}
                    onChange={(e) => handleChange('whatsapp', e.target.value)}
                    placeholder="(809) 000-0000" />
                  <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-gray-600">
                    <Checkbox checked={waSameAsPhone}
                      onCheckedChange={(c) => toggleWaSameAsPhone(c === true)} />
                    Es el mismo que el teléfono principal
                  </label>
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Teléfono alterno" error={err('phone_secondary')}
                  hint="De un familiar o del trabajo">
                  <Input type="tel" inputMode="numeric" value={formData.phone_secondary}
                    onChange={(e) => handleChange('phone_secondary', e.target.value)}
                    placeholder="(809) 000-0000" />
                </Field>
                <Field label="Correo electrónico" error={err('email')}>
                  <Input type="email" value={formData.email}
                    onChange={(e) => handleChange('email', e.target.value)}
                    placeholder="cliente@correo.com" />
                </Field>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* PASO 3 — UBICACIÓN (cascada)                                      */}
        {/* ---------------------------------------------------------------- */}
        {step === 'ubicacion' && (
          <Card>
            <CardHeader>
              <CardTitle>¿Dónde vive?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <Field label="Provincia" required error={err('province')}>
                  <Select value={formData.province || undefined} onValueChange={handleProvinceChange}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar provincia" /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      {provinceOptions.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>

                <Field
                  label="Municipio" required error={err('municipality')}
                  hint={!formData.province ? 'Elige primero la provincia' : undefined}
                >
                  <Select
                    value={formData.municipality || undefined}
                    onValueChange={handleMunicipalityChange}
                    disabled={!formData.province}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={formData.province ? 'Seleccionar municipio' : '—'} />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {municipalityOptions.map(x => <SelectItem key={x} value={x}>{x}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>

                <Field
                  label="Distrito municipal"
                  hint={!formData.municipality ? 'Elige primero el municipio' : 'Opcional'}
                >
                  <Select
                    value={districtSelectValue}
                    onValueChange={handleDistrictChange}
                    disabled={!formData.municipality}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={formData.municipality ? 'Seleccionar' : '—'} />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      <SelectItem value={MUNICIPAL_SEAT}>{MUNICIPAL_SEAT}</SelectItem>
                      {districtOptions.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                      <SelectItem value={DISTRICT_OTHER}>Otro (escribirlo)</SelectItem>
                    </SelectContent>
                  </Select>
                  {districtIsCustom && (
                    <Input
                      className="mt-2"
                      value={formData.municipal_district}
                      onChange={(e) => handleChange('municipal_district', e.target.value)}
                      placeholder="Nombre del distrito municipal"
                    />
                  )}
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Sector / Barrio" hint="Ej.: Los Prados, Villa Juana">
                  <Input value={formData.sector}
                    onChange={(e) => handleChange('sector', e.target.value)}
                    placeholder="Sector donde vive" />
                </Field>
                <Field label="Ruta de cobro / entrega">
                  <Select value={formData.collection_route || undefined}
                    onValueChange={(v) => handleChange('collection_route', v)}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar ruta" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="RUTA PRINCIPAL">Ruta principal</SelectItem>
                      <SelectItem value="RUTA SECUNDARIA">Ruta secundaria</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <Field label="Dirección" hint="Calle, número, referencias para llegar">
                <Textarea rows={3} value={formData.address}
                  onChange={(e) => handleChange('address', e.target.value)}
                  placeholder="Calle Duarte #45, frente al colmado La Esperanza" />
              </Field>

              <div className="border-t pt-4">
                <LocationPicker
                  latitude={homeLocation.latitude}
                  longitude={homeLocation.longitude}
                  accuracy={homeLocation.accuracy}
                  note={homeLocation.note}
                  onChange={setHomeLocation}
                />
              </div>

              {formData.municipality && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                  <span className="text-xs uppercase tracking-wide text-gray-500">Ubicación</span>
                  <p className="font-medium">
                    {[formData.sector, formData.municipal_district === MUNICIPAL_SEAT ? null : formData.municipal_district,
                      formData.municipality, formData.province].filter(Boolean).join(' · ')}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* PASO 4 — TRABAJO E INGRESOS                                       */}
        {/* ---------------------------------------------------------------- */}
        {step === 'trabajo' && (
          <Card>
            <CardHeader>
              <CardTitle>¿De qué vive?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Ocupación">
                  <Input value={formData.occupation} autoFocus
                    onChange={(e) => handleChange('occupation', e.target.value)}
                    placeholder="Chofer, comerciante, enfermera…" />
                </Field>
                <Field label="Situación laboral">
                  <Select value={formData.employment_status || undefined}
                    onValueChange={(v) => handleChange('employment_status', v)}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>
                      {EMPLOYMENT_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Lugar de trabajo">
                  <Input value={formData.workplace_name}
                    onChange={(e) => handleChange('workplace_name', e.target.value)}
                    placeholder="Nombre de la empresa o negocio" />
                </Field>
                <Field label="Dirección del trabajo">
                  <Input value={formData.workplace_address}
                    onChange={(e) => handleChange('workplace_address', e.target.value)}
                    placeholder="Dónde queda" />
                </Field>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <Field label="Ingreso mensual (RD$)">
                  <NumberInput min="0" value={formData.monthly_income}
                    onChange={(e) => handleChange('monthly_income', e.target.value)} placeholder="0" />
                </Field>
                <Field label="Gasto de vivienda (RD$)">
                  <NumberInput min="0" value={formData.housing}
                    onChange={(e) => handleChange('housing', e.target.value)} placeholder="0" />
                </Field>
                <Field label="Dependientes">
                  <NumberInput min="0" value={formData.dependents}
                    onChange={(e) => handleChange('dependents', e.target.value)} placeholder="0" />
                </Field>
                <Field label="RNC" hint="Si tiene negocio">
                  <Input value={formData.rnc}
                    onChange={(e) => handleChange('rnc', e.target.value)} placeholder="000000000" />
                </Field>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* PASO 5 — OTROS DATOS                                              */}
        {/* ---------------------------------------------------------------- */}
        {step === 'extras' && (
          <div className="space-y-5">
            <Card>
              <CardHeader>
                <CardTitle>Clasificación y referencia</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <Field label="Recomendado por">
                    <Input value={formData.recommended_by}
                      onChange={(e) => handleChange('recommended_by', e.target.value)}
                      placeholder="Quién lo refirió" />
                  </Field>
                  <Field label="Clasificación por color">
                    <Select value={formData.color_classification || undefined}
                      onValueChange={(v) => handleChange('color_classification', v)}>
                      <SelectTrigger><SelectValue placeholder="Sin color asignado" /></SelectTrigger>
                      <SelectContent>
                        {COLOR_CLASSIFICATIONS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Estado del cliente">
                    <Select value={formData.status}
                      onValueChange={(v) => handleChange('status', v as ClientFormState['status'])}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Activo</SelectItem>
                        <SelectItem value="inactive">Inactivo</SelectItem>
                        <SelectItem value="blacklisted">Bloqueado</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <Field
                    label="Score crediticio"
                    hint="El CRM lo recalcula con el comportamiento de pago"
                  >
                    <NumberInput min="0" max="1000" value={formData.credit_score}
                      onChange={(e) => handleChange('credit_score', e.target.value)} placeholder="—" />
                  </Field>
                  <Field label="Visible en datos del préstamo">
                    <RadioGroup value={formData.visible_in_loan_data}
                      onValueChange={(v) => handleChange('visible_in_loan_data', v)}>
                      <div className="flex gap-6 pt-2">
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="SI" id="visible-yes" />
                          <Label htmlFor="visible-yes" className="cursor-pointer font-normal">Sí</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="NO" id="visible-no" />
                          <Label htmlFor="visible-no" className="cursor-pointer font-normal">No</Label>
                        </div>
                      </div>
                    </RadioGroup>
                  </Field>
                  <Field label="Creado por">
                    <Input value={profile?.full_name || user?.email || ''} disabled className="bg-gray-100" />
                  </Field>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Datos bancarios</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field label="Banco">
                    <Select value={formData.bank_name || undefined}
                      onValueChange={(v) => handleChange('bank_name', v)}>
                      <SelectTrigger><SelectValue placeholder="Seleccionar banco" /></SelectTrigger>
                      <SelectContent className="max-h-72">
                        {DOMINICAN_BANKS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Número de tarjeta / cuenta">
                    <Input value={formData.card_number} maxLength={19}
                      onChange={(e) => handleChange('card_number', e.target.value)}
                      placeholder="0000000000000" />
                  </Field>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <Field label="Usuario">
                    <Input value={formData.bank_user}
                      onChange={(e) => handleChange('bank_user', e.target.value)}
                      placeholder="Usuario del internet banking" />
                  </Field>
                  <Field label="Código">
                    <Input type="password" value={formData.bank_code}
                      onChange={(e) => handleChange('bank_code', e.target.value)}
                      placeholder="Clave" />
                  </Field>
                  <Field label="Identificador del token">
                    <Input value={formData.bank_token_identifier}
                      onChange={(e) => handleChange('bank_token_identifier', e.target.value)}
                      placeholder="Serial / IMEI" />
                  </Field>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Campos propios y adjuntos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field label="Campo personalizado 1">
                    <Input value={formData.custom_field_1}
                      onChange={(e) => handleChange('custom_field_1', e.target.value)} />
                  </Field>
                  <Field label="Campo personalizado 2">
                    <Input value={formData.custom_field_2}
                      onChange={(e) => handleChange('custom_field_2', e.target.value)} />
                  </Field>
                </div>
                <Field label="Documento adjunto">
                  <div className="flex items-center gap-2">
                    <input ref={attachmentInputRef} type="file"
                      onChange={handleAttachmentUpload} className="hidden" />
                    <Button type="button" variant="outline"
                      onClick={() => attachmentInputRef.current?.click()} disabled={uploadingAttachment}>
                      {uploadingAttachment
                        ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Subiendo…</>
                        : <><Upload className="mr-2 h-4 w-4" />Seleccionar archivo</>}
                    </Button>
                    {formData.attachment_url && (
                      <span className="text-sm text-green-600">✓ Archivo subido</span>
                    )}
                  </div>
                </Field>
              </CardContent>
            </Card>
          </div>
        )}
      </form>

      {/* Barra de acciones fija */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 p-3">
          <Button type="button" variant="outline" onClick={goBack} disabled={stepIndex === 0 || saving}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Atrás
          </Button>

          <div className="hidden text-xs text-gray-500 sm:block">
            Paso {stepIndex + 1} de {STEPS.length}
            {!isComplete && (
              <span className="ml-2 text-amber-700">
                · faltan {Object.keys(allErrors).length} {Object.keys(allErrors).length === 1 ? 'dato' : 'datos'}
              </span>
            )}
          </div>

          <div className="flex gap-2">
            {!isLastStep && (
              <Button type="button" variant="outline" onClick={goNext} disabled={saving}>
                Siguiente
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
            <Button type="button" onClick={() => handleSubmit()} disabled={saving}>
              {saving
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <UserPlus className="mr-2 h-4 w-4" />}
              {isEditing ? 'Guardar cambios' : 'Crear cliente'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClientForm;
