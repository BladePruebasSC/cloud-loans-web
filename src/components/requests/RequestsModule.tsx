import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { formatDateStringForSantoDomingo } from '@/utils/dateUtils';
import { 
  FileText, 
  Plus, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  User,
  DollarSign,
  Settings,
  Eye,
  ArrowRight,
  Trash2,
  Shield,
  Search,
  Pencil,
  X,
  Upload,
  Download,
  File
} from 'lucide-react';

interface LoanRequest {
  id: string;
  client_id: string;
  requested_amount: number;
  purpose: string | null;
  monthly_income: number | null;
  existing_debts: number | null;
  employment_status: string | null;
  income_verification: string | null;
  collateral_description: string | null;
  // Nuevos campos para préstamos
  interest_rate: number | null;
  term_months: number | null;
  loan_type: string | null;
  amortization_type: string | null;
  payment_frequency: string | null;
  first_payment_date: string | null;
  closing_costs: number | null;
  late_fee: boolean | null;
  late_fee_enabled?: boolean | null;
  late_fee_rate?: number | null;
  grace_period_days?: number | null;
  max_late_fee?: number | null;
  late_fee_calculation_type?: string | null;
  minimum_payment_type: string | null;
  minimum_payment_percentage: number | null;
  guarantor_required: boolean | null;
  guarantor_name: string | null;
  guarantor_phone: string | null;
  guarantor_dni: string | null;
  notes: string | null;
  status: string;
  review_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  clients?: {
    id: string;
    full_name: string;
    dni: string;
    phone: string;
    email: string | null;
    credit_score: number | null;
  };
}

interface Client {
  id: string;
  full_name: string;
  dni: string;
  phone: string;
  email: string | null;
}

const RequestsModule = () => {
  const [requests, setRequests] = useState<LoanRequest[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [filteredClients, setFilteredClients] = useState<Client[]>([]);
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<LoanRequest | null>(null);
  const [activeTab, setActiveTab] = useState('lista-solicitudes');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [requestToDelete, setRequestToDelete] = useState<LoanRequest | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingRequest, setEditingRequest] = useState<LoanRequest | null>(null);
  const [editFormData, setEditFormData] = useState<any>(null);
  const [requestDocuments, setRequestDocuments] = useState<{[key: string]: any[]}>({});
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [selectedDocumentType, setSelectedDocumentType] = useState<string>('');
  const [pendingDocuments, setPendingDocuments] = useState<Array<{file: File, type: string, title: string}>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const newRequestFileInputRef = useRef<HTMLInputElement>(null);
  const [configData, setConfigData] = useState({
    min_credit_score: 650,
    min_income: 25000,
    min_employment_years: 1,
    required_documents: {
      identity_card: true,
      income_certificate: true,
      bank_statements: true,
      commercial_references: false,
      guarantees: false
    }
  });
  const { user, companyId, companySettings } = useAuth();

  // Función helper para formatear fechas con hora (timestamps)
  const formatDateTimeForSantoDomingo = (dateString: string): string => {
    if (!dateString) return '-';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('es-DO', {
        timeZone: 'America/Santo_Domingo',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      console.error('Error formatting date:', error);
      return '-';
    }
  };

  // Función helper para formatear fechas sin hora (YYYY-MM-DD)
  const formatDateOnlyForSantoDomingo = (dateString: string): string => {
    if (!dateString) return '-';
    try {
      // Si es una fecha en formato YYYY-MM-DD, parsearla como fecha local
      if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const [year, month, day] = dateString.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        return date.toLocaleDateString('es-DO', {
          timeZone: 'America/Santo_Domingo',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
      }
      // Si es un timestamp, usar formatDateTimeForSantoDomingo pero sin hora
      const date = new Date(dateString);
      return date.toLocaleDateString('es-DO', {
        timeZone: 'America/Santo_Domingo',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (error) {
      console.error('Error formatting date:', error);
      return '-';
    }
  };

  const [formData, setFormData] = useState({
    client_id: '',
    requested_amount: 0,
    purpose: '',
    monthly_income: 0,
    existing_debts: 0,
    employment_status: '',
    income_verification: '',
    collateral_description: '',
    // Nuevos campos para préstamos
    interest_rate: 0,
    term_months: 6, // Valor por defecto, se actualizará con min_term_months de companySettings
    loan_type: 'personal',
    amortization_type: 'simple',
    payment_frequency: 'monthly',
    first_payment_date: new Date().toISOString().split('T')[0], // Fecha actual por defecto
    closing_costs: 0,
    late_fee_enabled: false,
    late_fee_rate: 2.0,
    grace_period_days: 0,
    max_late_fee: 0,
    late_fee_calculation_type: 'daily',
    minimum_payment_type: 'interest',
    minimum_payment_percentage: 100,
    guarantor_required: false,
    guarantor_name: '',
    guarantor_phone: '',
    guarantor_dni: '',
    notes: ''
  });

  // Cargar valores por defecto de la configuración de la empresa
  useEffect(() => {
    if (companySettings) {
      setFormData(prev => ({
        ...prev,
        interest_rate: companySettings.interest_rate_default ?? prev.interest_rate,
        term_months: companySettings.min_term_months ?? prev.term_months,
        late_fee_rate: companySettings.default_late_fee_rate ?? prev.late_fee_rate,
        grace_period_days: companySettings.default_grace_period_days ?? companySettings.grace_period_days ?? prev.grace_period_days,
        late_fee_enabled: companySettings.default_late_fee_rate ? true : prev.late_fee_enabled
      }));
    }
  }, [companySettings]);

  useEffect(() => {
    if (user) {
      fetchRequests();
      fetchClients();
      fetchRequestConfig();
    }
  }, [user]);

  // Cargar documentos cuando se selecciona una solicitud
  useEffect(() => {
    if (selectedRequest) {
      fetchRequestDocuments(selectedRequest.id);
    }
  }, [selectedRequest]);

  // Cargar documentos cuando se abre el modal de edición
  useEffect(() => {
    if (editingRequest) {
      fetchRequestDocuments(editingRequest.id);
    }
  }, [editingRequest]);

  // Cargar documentos de una solicitud
  const fetchRequestDocuments = async (requestId: string) => {
    try {
      console.log('🔍 Cargando documentos para solicitud:', requestId);
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('request_id', requestId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Error en query de documentos:', error);
        throw error;
      }
      
      console.log('✅ Documentos encontrados:', data?.length || 0, data);
      
      setRequestDocuments(prev => ({
        ...prev,
        [requestId]: data || []
      }));
    } catch (error) {
      console.error('Error fetching request documents:', error);
      toast.error('Error al cargar documentos');
    }
  };

  // Subir documento para una solicitud
  const handleUploadDocument = async (requestId: string, file: File, documentType: string, title: string) => {
    if (!user || !companyId) {
      toast.error('Debes iniciar sesión para subir documentos');
      return;
    }

    try {
      setUploadingDocument(true);
      toast.loading('Subiendo documento...', { id: 'upload-doc' });

      // Subir archivo a storage
      const filePath = `user-${companyId}/requests/${requestId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file, {
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Obtener URL pública del archivo
      const { data: urlData } = supabase.storage
        .from('documents')
        .getPublicUrl(filePath);

      // Guardar metadata en la tabla documents
      const { error: insertError } = await supabase
        .from('documents')
        .insert({
          user_id: companyId,
          request_id: requestId,
          loan_id: null,
          client_id: null,
          title: title || file.name,
          file_name: file.name,
          file_url: urlData.publicUrl,
          description: null,
          document_type: documentType,
          mime_type: file.type || null,
          file_size: file.size || null,
          status: 'active',
        });

      if (insertError) throw insertError;

      toast.success('Documento subido correctamente', { id: 'upload-doc' });
      
      // Recargar documentos para actualizar la lista
      await fetchRequestDocuments(requestId);
      
      // Limpiar el selector de tipo de documento
      setSelectedDocumentType('');
    } catch (error: any) {
      console.error('Error al subir documento:', error);
      toast.error(error.message || 'Error al subir documento', { id: 'upload-doc' });
    } finally {
      setUploadingDocument(false);
    }
  };

  // Cargar configuración de solicitudes
  const fetchRequestConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'request_approval_criteria')
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching request config:', error);
        return;
      }

      if (data) {
        const config = JSON.parse(data.value);
        setConfigData(config);
      }
    } catch (error) {
      console.error('Error parsing request config:', error);
    }
  };

  // Guardar configuración de solicitudes
  const saveRequestConfig = async () => {
    try {
      const configValue = JSON.stringify(configData);
      
      const { error } = await supabase
        .from('system_settings')
        .upsert({
          key: 'request_approval_criteria',
          value: configValue,
          description: 'Configuración de criterios de aprobación y documentos requeridos para solicitudes de préstamo'
        }, {
          onConflict: 'key'
        });

      if (error) throw error;

      toast.success('Configuración guardada exitosamente');
    } catch (error) {
      console.error('Error saving request config:', error);
      toast.error('Error al guardar configuración');
    }
  };

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('loan_requests')
        .select(`
          *,
          clients (
            id,
            full_name,
            dni,
            phone,
            email,
            credit_score
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRequests(data || []);
    } catch (error) {
      console.error('Error fetching requests:', error);
      toast.error('Error al cargar solicitudes');
    } finally {
      setLoading(false);
    }
  };

  const fetchClients = async () => {
    if (!user || !companyId) return;

    try {
      const { data, error } = await supabase
        .from('clients')
        .select('id, full_name, dni, phone, email')
        .eq('user_id', companyId)
        .eq('status', 'active')
        .order('full_name');

      if (error) throw error;
      setClients(data || []);
      setFilteredClients(data || []);
    } catch (error) {
      console.error('Error fetching clients:', error);
      toast.error('Error al cargar clientes');
    }
  };

  const handleClientSearch = (searchTerm: string) => {
    setClientSearch(searchTerm);
    if (searchTerm.length === 0) {
      setFilteredClients([]);
      setShowClientDropdown(false);
      setSelectedClient(null);
      setFormData({...formData, client_id: ''});
      return;
    }

    const filtered = clients.filter(client =>
      client.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.dni.includes(searchTerm) ||
      client.phone.includes(searchTerm)
    );
    
    setFilteredClients(filtered);
    setShowClientDropdown(filtered.length > 0);
  };

  const selectClient = (client: Client) => {
    setSelectedClient(client);
    setClientSearch(client.full_name);
    setShowClientDropdown(false);
    setFormData({...formData, client_id: client.id});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    // Validar que el cliente esté seleccionado
    if (!formData.client_id || formData.client_id === '') {
      toast.error('Debes seleccionar un cliente');
      return;
    }

    // Validar documentos requeridos
    if (configData.required_documents) {
      const requiredDocs = Object.entries(configData.required_documents)
        .filter(([_, required]) => required === true)
        .map(([docType, _]) => docType);
      
      if (requiredDocs.length > 0) {
        const uploadedDocTypes = pendingDocuments.map(doc => doc.type);
        const missingDocs = requiredDocs.filter(docType => !uploadedDocTypes.includes(docType));
        
        if (missingDocs.length > 0) {
          const docNames: { [key: string]: string } = {
            identity_card: 'Cédula de Identidad',
            income_certificate: 'Certificación de Ingresos',
            bank_statements: 'Estados Bancarios',
            commercial_references: 'Referencias Comerciales',
            guarantees: 'Garantías/Colateral'
          };
          
          const missingDocNames = missingDocs.map(docType => docNames[docType] || docType).join(', ');
          toast.error(`Debes subir los siguientes documentos requeridos: ${missingDocNames}`);
          return;
        }
      }
    }

    try {
      const requestData = {
        ...formData,
        user_id: user.id,
        // Mapear late_fee_enabled a late_fee para compatibilidad
        late_fee: formData.late_fee_enabled
      };

      // Remover late_fee_enabled del objeto ya que se mapea a late_fee
      const { late_fee_enabled, ...dataToInsert } = requestData;

      const { data: newRequest, error } = await supabase
        .from('loan_requests')
        .insert([dataToInsert])
        .select()
        .single();

      if (error) throw error;

      // Subir documentos pendientes si hay
      if (pendingDocuments.length > 0 && newRequest) {
        toast.loading('Subiendo documentos...', { id: 'upload-docs' });
        for (const doc of pendingDocuments) {
          await handleUploadDocument(newRequest.id, doc.file, doc.type, doc.title);
        }
        toast.success('Solicitud y documentos creados exitosamente', { id: 'upload-docs' });
      } else {
        toast.success('Solicitud creada exitosamente');
      }

      setShowRequestForm(false);
      setPendingDocuments([]);
      resetForm();
      fetchRequests();
    } catch (error) {
      console.error('Error creating request:', error);
      toast.error('Error al crear solicitud');
    }
  };

  const handleCreateLoanFromRequest = (request: LoanRequest) => {
    // Crear URL con parámetros para pre-llenar el formulario de préstamo
    const loanParams = new URLSearchParams({
      client_id: request.client_id,
      amount: request.requested_amount.toString(),
      purpose: request.purpose || '',
      // Campos de préstamo
      interest_rate: (request.interest_rate || 0).toString(),
      term_months: (request.term_months || companySettings?.min_term_months || 6).toString(),
      loan_type: request.loan_type || 'personal',
      amortization_type: request.amortization_type || 'simple',
      payment_frequency: request.payment_frequency || 'monthly',
      first_payment_date: request.first_payment_date || new Date().toISOString().split('T')[0], // Fecha actual por defecto
      closing_costs: (request.closing_costs || 0).toString(),
      late_fee: (request.late_fee || false).toString(),
      minimum_payment_type: request.minimum_payment_type || 'interest',
      minimum_payment_percentage: (request.minimum_payment_percentage || 100).toString(),
      guarantor_required: (request.guarantor_required || false).toString(),
      guarantor_name: request.guarantor_name || '',
      guarantor_phone: request.guarantor_phone || '',
      guarantor_dni: request.guarantor_dni || '',
      notes: request.notes || '',
      // Campos adicionales de la solicitud
      monthly_income: (request.monthly_income || 0).toString(),
      existing_debts: (request.existing_debts || 0).toString(),
      employment_status: request.employment_status || '',
      // ID de la solicitud para copiar documentos
      request_id: request.id,
    });
    
    // Navegar al formulario de préstamos con los datos pre-llenados
    window.location.href = `/prestamos?create=true&${loanParams.toString()}`;
  };

  const updateRequestStatus = async (requestId: string, status: string, notes: string = '') => {
    try {
      const { error } = await supabase
        .from('loan_requests')
        .update({ 
          status, 
          review_notes: notes,
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString()
        })
        .eq('id', requestId);

      if (error) throw error;

      toast.success(`Solicitud ${status === 'approved' ? 'aprobada' : 'rechazada'} exitosamente`);
      fetchRequests();
    } catch (error) {
      console.error('Error updating request:', error);
      toast.error('Error al actualizar solicitud');
    }
  };

  const deleteApprovedRequest = async (requestId: string) => {
    try {
      const { error } = await supabase
        .from('loan_requests')
        .delete()
        .eq('id', requestId);

      if (error) throw error;

      toast.success('Solicitud eliminada exitosamente');
      fetchRequests();
    } catch (error) {
      console.error('Error deleting request:', error);
      toast.error('Error al eliminar solicitud');
    }
  };

  const handleDeleteRequest = (request: LoanRequest) => {
    setRequestToDelete(request);
    setShowDeleteDialog(true);
  };

  const confirmDeleteRequest = async () => {
    if (requestToDelete) {
      await deleteApprovedRequest(requestToDelete.id);
      setShowDeleteDialog(false);
      setRequestToDelete(null);
    }
  };

  const resetForm = () => {
    setFormData({
      client_id: '',
      requested_amount: 0,
      purpose: '',
      monthly_income: 0,
      existing_debts: 0,
      employment_status: '',
      income_verification: '',
      collateral_description: '',
      // Resetear nuevos campos con valores por defecto de la configuración
      interest_rate: companySettings?.interest_rate_default ?? 0,
      term_months: companySettings?.min_term_months ?? 6, // Usar mínimo de configuración
      loan_type: 'personal',
      amortization_type: 'simple',
      payment_frequency: 'monthly',
      first_payment_date: new Date().toISOString().split('T')[0], // Fecha actual por defecto
      closing_costs: 0,
      late_fee_enabled: companySettings?.default_late_fee_rate ? true : false,
      late_fee_rate: companySettings?.default_late_fee_rate ?? 2.0,
      grace_period_days: companySettings?.default_grace_period_days ?? companySettings?.grace_period_days ?? 0,
      max_late_fee: 0,
      late_fee_calculation_type: 'daily',
      minimum_payment_type: 'interest',
      minimum_payment_percentage: 100,
      guarantor_required: false,
      guarantor_name: '',
      guarantor_phone: '',
      guarantor_dni: '',
      notes: ''
    });
    setClientSearch('');
    setSelectedClient(null);
    setShowClientDropdown(false);
    setPendingDocuments([]);
    setSelectedDocumentType('');
  };

  // Cargar valores por defecto cuando se abre el formulario
  useEffect(() => {
    if (showRequestForm && companySettings) {
      setFormData(prev => ({
        ...prev,
        interest_rate: prev.interest_rate === 0 ? (companySettings.interest_rate_default ?? 0) : prev.interest_rate,
        late_fee_rate: prev.late_fee_rate === 2.0 ? (companySettings.default_late_fee_rate ?? 2.0) : prev.late_fee_rate,
        grace_period_days: prev.grace_period_days === 0 ? (companySettings.default_grace_period_days ?? companySettings.grace_period_days ?? 0) : prev.grace_period_days,
        late_fee_enabled: companySettings.default_late_fee_rate ? true : prev.late_fee_enabled
      }));
    }
  }, [showRequestForm, companySettings]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary" className="bg-orange-100 text-orange-800">Pendiente</Badge>;
      case 'approved':
        return <Badge variant="default" className="bg-green-100 text-green-800">Aprobada</Badge>;
      case 'rejected':
        return <Badge variant="destructive">Rechazada</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  // Filtrar solicitudes por término de búsqueda
  const filteredRequests = requests.filter(request => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    return (
      request.clients?.full_name?.toLowerCase().includes(searchLower) ||
      request.clients?.dni?.includes(searchTerm) ||
      request.clients?.phone?.includes(searchTerm) ||
      request.purpose?.toLowerCase().includes(searchLower)
    );
  });

  const pendingRequests = filteredRequests.filter(r => r.status === 'pending');
  const approvedRequests = filteredRequests.filter(r => r.status === 'approved');
  const rejectedRequests = filteredRequests.filter(r => r.status === 'rejected');

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Solicitudes de Préstamos</h1>
        <Button onClick={() => setShowRequestForm(true)} className="w-full sm:w-auto">
          <Plus className="h-4 w-4 mr-2" />
          Nueva Solicitud
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Solicitudes</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{requests.length}</div>
            <p className="text-xs text-muted-foreground">Este mes</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pendientes</CardTitle>
            <Clock className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{pendingRequests.length}</div>
            <p className="text-xs text-muted-foreground">En revisión</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Aprobadas</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{approvedRequests.length}</div>
            <p className="text-xs text-muted-foreground">Listas para préstamo</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rechazadas</CardTitle>
            <XCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{rejectedRequests.length}</div>
            <p className="text-xs text-muted-foreground">No aprobadas</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3 gap-1 h-auto">
          <TabsTrigger 
            value="nueva-solicitud" 
            className="text-xs sm:text-sm py-3 px-2 sm:px-4 min-h-[48px] flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 touch-manipulation"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden xs:inline">Nueva</span>
            <span className="xs:hidden">Nueva</span>
          </TabsTrigger>
          <TabsTrigger 
            value="lista-solicitudes" 
            className="text-xs sm:text-sm py-3 px-2 sm:px-4 min-h-[48px] flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 touch-manipulation"
          >
            <FileText className="h-4 w-4" />
            <span className="hidden xs:inline">Lista</span>
            <span className="xs:hidden">Lista</span>
          </TabsTrigger>
          <TabsTrigger 
            value="configuracion" 
            className="text-xs sm:text-sm py-3 px-2 sm:px-4 min-h-[48px] flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 touch-manipulation"
          >
            <Settings className="h-4 w-4" />
            <span className="hidden xs:inline">Config</span>
            <span className="xs:hidden">Config</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="nueva-solicitud" className="space-y-4 sm:space-y-6">
          <Card>
            <CardHeader className="pb-3 sm:pb-6">
              <CardTitle className="flex items-center text-base sm:text-lg">
                <FileText className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                <span className="hidden sm:inline">Crear Nueva Solicitud de Préstamo</span>
                <span className="sm:hidden">Nueva Solicitud</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="client_id">Cliente *</Label>
                    <div className="relative">
                      <Input
                        placeholder="Buscar cliente por nombre..."
                        value={clientSearch}
                        onChange={(e) => handleClientSearch(e.target.value)}
                        className="w-full"
                      />
                      
                      {showClientDropdown && (
                        <div className="absolute top-full left-0 right-0 bg-white border border-gray-300 rounded-md shadow-lg z-20 max-h-60 overflow-y-auto">
                          {filteredClients.map((client) => (
                            <div
                              key={client.id}
                              className="p-3 hover:bg-gray-100 cursor-pointer border-b"
                              onClick={() => selectClient(client)}
                            >
                              <div className="font-medium">{client.full_name}</div>
                              <div className="text-sm text-gray-600">
                                DNI: {client.dni} | Tel: {client.phone}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div>
                    <Label htmlFor="requested_amount">Monto Solicitado *</Label>
                    <Input
                      id="requested_amount"
                      type="number"
                      value={formData.requested_amount}
                      onChange={(e) => setFormData({...formData, requested_amount: Number(e.target.value)})}
                      required
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="purpose">Propósito del Préstamo</Label>
                  <Input
                    id="purpose"
                    value={formData.purpose}
                    onChange={(e) => setFormData({...formData, purpose: e.target.value})}
                    placeholder="Ej: Inversión en negocio, gastos médicos, etc."
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="monthly_income">Ingresos Mensuales</Label>
                    <Input
                      id="monthly_income"
                      type="number"
                      value={formData.monthly_income}
                      onChange={(e) => setFormData({...formData, monthly_income: Number(e.target.value)})}
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="existing_debts">Deudas Existentes</Label>
                    <Input
                      id="existing_debts"
                      type="number"
                      value={formData.existing_debts}
                      onChange={(e) => setFormData({...formData, existing_debts: Number(e.target.value)})}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="employment_status">Estado de Empleo</Label>
                    <Select value={formData.employment_status} onValueChange={(value) => setFormData({...formData, employment_status: value})}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar estado" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="employed">Empleado</SelectItem>
                        <SelectItem value="self_employed">Trabajador Independiente</SelectItem>
                        <SelectItem value="unemployed">Desempleado</SelectItem>
                        <SelectItem value="retired">Jubilado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label htmlFor="income_verification">Verificación de Ingresos</Label>
                    <Input
                      id="income_verification"
                      value={formData.income_verification}
                      onChange={(e) => setFormData({...formData, income_verification: e.target.value})}
                      placeholder="Documento de verificación"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="collateral_description">Descripción de Garantía</Label>
                  <Textarea
                    id="collateral_description"
                    value={formData.collateral_description}
                    onChange={(e) => setFormData({...formData, collateral_description: e.target.value})}
                    placeholder="Descripción de la garantía ofrecida (opcional)"
                  />
                </div>

                {/* Sección de Documentos */}
                <div className="border-t pt-4">
                  <div className="flex items-center justify-between mb-4">
                    <Label className="text-base font-semibold flex items-center gap-2">
                      <File className="h-5 w-5" />
                      Documentos
                    </Label>
                    <div className="flex items-center gap-2">
                      <Select 
                        value={selectedDocumentType} 
                        onValueChange={setSelectedDocumentType}
                      >
                        <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder="Tipo de documento" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="identity_card">Cédula de Identidad</SelectItem>
                          <SelectItem value="income_certificate">Certificación de Ingresos</SelectItem>
                          <SelectItem value="bank_statements">Estados Bancarios</SelectItem>
                          <SelectItem value="commercial_references">Referencias Comerciales</SelectItem>
                          <SelectItem value="guarantees">Garantías/Colateral</SelectItem>
                          <SelectItem value="other">Otro</SelectItem>
                        </SelectContent>
                      </Select>
                      <input
                        ref={newRequestFileInputRef}
                        type="file"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file && selectedDocumentType) {
                            setPendingDocuments(prev => [...prev, {
                              file,
                              type: selectedDocumentType,
                              title: file.name
                            }]);
                            setSelectedDocumentType('');
                            if (newRequestFileInputRef.current) {
                              newRequestFileInputRef.current.value = '';
                            }
                            toast.success('Documento agregado. Se subirá al crear la solicitud.');
                          }
                        }}
                        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (!selectedDocumentType) {
                            toast.error('Selecciona un tipo de documento primero');
                            return;
                          }
                          newRequestFileInputRef.current?.click();
                        }}
                        disabled={!selectedDocumentType}
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        Agregar
                      </Button>
                    </div>
                  </div>
                  {pendingDocuments.length > 0 ? (
                    <div className="space-y-2">
                      {pendingDocuments.map((doc, index) => (
                        <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center gap-3">
                            <File className="h-5 w-5 text-blue-600" />
                            <div>
                              <p className="text-sm font-medium">{doc.title}</p>
                              <p className="text-xs text-gray-500">
                                {doc.type === 'identity_card' ? 'Cédula de Identidad' :
                                 doc.type === 'income_certificate' ? 'Certificación de Ingresos' :
                                 doc.type === 'bank_statements' ? 'Estados Bancarios' :
                                 doc.type === 'commercial_references' ? 'Referencias Comerciales' :
                                 doc.type === 'guarantees' ? 'Garantías/Colateral' :
                                 doc.type}
                              </p>
                            </div>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setPendingDocuments(prev => prev.filter((_, i) => i !== index));
                            }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500 text-center py-4">
                      No hay documentos agregados. Selecciona un tipo y haz clic en "Agregar" para subir documentos.
                    </p>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row justify-end gap-2">
                  <Button 
                    type="submit" 
                    className="w-full sm:w-auto min-h-[44px] touch-manipulation"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Crear Solicitud
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="lista-solicitudes" className="space-y-4 sm:space-y-6">
          <Card>
            <CardHeader className="pb-3 sm:pb-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <CardTitle className="text-base sm:text-lg">Solicitudes Recientes</CardTitle>
                <div className="relative w-full sm:w-auto sm:min-w-[300px]">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    type="text"
                    placeholder="Buscar por nombre, DNI, teléfono o propósito..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 w-full"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {loading ? (
                <div className="text-center py-8">Cargando solicitudes...</div>
              ) : requests.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No hay solicitudes registradas</p>
                </div>
              ) : filteredRequests.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No se encontraron solicitudes con el término de búsqueda "{searchTerm}"</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredRequests.map((request) => (
                    <div key={request.id} className="border rounded-lg p-3 sm:p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 sm:gap-4">
                        <div className="space-y-2 flex-1 min-w-0">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                            <div className="flex items-center space-x-2 sm:space-x-3">
                              <User className="h-4 w-4 text-gray-500 flex-shrink-0" />
                              <h3 className="font-medium truncate">{request.clients?.full_name}</h3>
                            </div>
                            <div className="flex-shrink-0">
                              {getStatusBadge(request.status)}
                            </div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4 text-xs sm:text-sm text-gray-600">
                            <div className="flex items-center">
                              <DollarSign className="h-3 w-3 mr-1 flex-shrink-0" />
                              <span className="truncate">Solicita: ${request.requested_amount.toLocaleString()}</span>
                            </div>
                            <div className="flex items-center">
                              <Clock className="h-3 w-3 mr-1 flex-shrink-0" />
                              <span className="truncate">{new Date(request.created_at).toLocaleDateString()}</span>
                            </div>
                            <div className="flex items-center sm:col-span-2 lg:col-span-1">
                              <AlertCircle className="h-3 w-3 mr-1 flex-shrink-0" />
                              <span className="truncate">Score: {request.clients?.credit_score || 'N/A'}</span>
                            </div>
                          </div>
                          {request.purpose && (
                            <p className="text-xs sm:text-sm text-gray-600 line-clamp-2">
                              <strong>Propósito:</strong> {request.purpose}
                            </p>
                          )}
                          {request.review_notes && (
                            <p className="text-xs sm:text-sm text-gray-600 line-clamp-2">
                              <strong>Notas:</strong> {request.review_notes}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2 sm:gap-2 sm:ml-4">
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => setSelectedRequest(request)}
                            className="w-full sm:w-auto min-h-[36px] touch-manipulation"
                          >
                            <Eye className="h-4 w-4 mr-1 sm:mr-2" />
                            <span className="sm:hidden">Ver</span>
                            <span className="hidden sm:inline">Ver</span>
                          </Button>
                          
                          {/* Botón Crear Préstamo - Solo para solicitudes aprobadas */}
                          {request.status === 'approved' && (
                            <Button 
                              size="sm" 
                              variant="default" 
                              className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto min-h-[36px] touch-manipulation"
                              onClick={() => handleCreateLoanFromRequest(request)}
                            >
                              <ArrowRight className="h-4 w-4 mr-1 sm:mr-2" />
                              <span className="sm:hidden">Crear Préstamo</span>
                              <span className="hidden sm:inline">Crear Préstamo</span>
                            </Button>
                          )}
                          
                          {/* Botón Eliminar - Solo para solicitudes aprobadas */}
                          {request.status === 'approved' && (
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="text-red-600 hover:bg-red-50 w-full sm:w-auto min-h-[36px] touch-manipulation"
                              onClick={() => handleDeleteRequest(request)}
                            >
                              <Trash2 className="h-4 w-4 mr-1 sm:mr-2" />
                              <span className="sm:hidden">Eliminar</span>
                              <span className="hidden sm:inline">Eliminar</span>
                            </Button>
                          )}
                          
                          {/* Botones de Edición, Aprobación/Rechazo - Solo para solicitudes pendientes */}
                          {request.status === 'pending' && (
                            <>
                              <Button 
                                size="sm" 
                                variant="outline" 
                                className="text-blue-600 hover:bg-blue-50 w-full sm:w-auto min-h-[36px] touch-manipulation"
                                onClick={() => {
                                  setEditingRequest(request);
                                  setEditFormData({
                                    requested_amount: request.requested_amount,
                                    purpose: request.purpose || '',
                                    monthly_income: request.monthly_income || 0,
                                    existing_debts: request.existing_debts || 0,
                                    employment_status: request.employment_status || '',
                                    income_verification: request.income_verification || '',
                                    collateral_description: request.collateral_description || '',
                                    interest_rate: request.interest_rate || 0,
                                    term_months: request.term_months || companySettings?.min_term_months || 6,
                                    loan_type: request.loan_type || 'personal',
                                    amortization_type: request.amortization_type || 'simple',
                                    payment_frequency: request.payment_frequency || 'monthly',
                                    first_payment_date: request.first_payment_date || new Date().toISOString().split('T')[0], // Fecha actual por defecto
                                    closing_costs: request.closing_costs || 0,
                                    late_fee_enabled: request.late_fee || false,
                                    late_fee_rate: request.late_fee_rate || 2.0,
                                    grace_period_days: request.grace_period_days || 0,
                                    max_late_fee: request.max_late_fee || 0,
                                    late_fee_calculation_type: request.late_fee_calculation_type || 'daily',
                                    minimum_payment_type: request.minimum_payment_type || 'interest',
                                    minimum_payment_percentage: request.minimum_payment_percentage || 100,
                                    guarantor_required: request.guarantor_required || false,
                                    guarantor_name: request.guarantor_name || '',
                                    guarantor_phone: request.guarantor_phone || '',
                                    guarantor_dni: request.guarantor_dni || '',
                                    notes: request.notes || ''
                                  });
                                }}
                              >
                                <Pencil className="h-4 w-4 mr-1 sm:mr-2" />
                                Editar
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline" 
                                className="text-green-600 hover:bg-green-50 w-full sm:w-auto min-h-[36px] touch-manipulation"
                                onClick={() => updateRequestStatus(request.id, 'approved')}
                              >
                                <CheckCircle className="h-4 w-4 mr-1 sm:mr-2" />
                                Aprobar
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline" 
                                className="text-red-600 hover:bg-red-50 w-full sm:w-auto min-h-[36px] touch-manipulation"
                                onClick={() => updateRequestStatus(request.id, 'rejected')}
                              >
                                <XCircle className="h-4 w-4 mr-1 sm:mr-2" />
                                Rechazar
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="configuracion" className="space-y-4 sm:space-y-6">
          <Card>
            <CardHeader className="pb-3 sm:pb-6">
              <CardTitle className="flex items-center text-base sm:text-lg">
                <Settings className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                <span className="hidden sm:inline">Configuración de Solicitudes</span>
                <span className="sm:hidden">Configuración</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 sm:space-y-6 pt-0">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Criterios de Aprobación</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label htmlFor="min_credit_score">Score Crediticio Mínimo</Label>
                      <Input 
                        id="min_credit_score"
                        type="number" 
                        value={configData.min_credit_score}
                        onChange={(e) => setConfigData({...configData, min_credit_score: Number(e.target.value)})}
                        placeholder="Score mínimo requerido"
                      />
                    </div>
                    <div>
                      <Label htmlFor="min_income">Ingresos Mínimos Mensuales</Label>
                      <Input 
                        id="min_income"
                        type="number" 
                        value={configData.min_income}
                        onChange={(e) => setConfigData({...configData, min_income: Number(e.target.value)})}
                        placeholder="Ingresos mínimos en pesos"
                      />
                    </div>
                    <div>
                      <Label htmlFor="min_employment">Años de Empleo Mínimo</Label>
                      <Input 
                        id="min_employment"
                        type="number" 
                        value={configData.min_employment_years}
                        onChange={(e) => setConfigData({...configData, min_employment_years: Number(e.target.value)})}
                        placeholder="Años mínimos trabajando"
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Documentos Requeridos</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <input 
                        type="checkbox" 
                        checked={configData.required_documents.identity_card}
                        onChange={(e) => setConfigData({
                          ...configData, 
                          required_documents: {...configData.required_documents, identity_card: e.target.checked}
                        })}
                        className="rounded" 
                      />
                      <Label className="text-sm">Cédula de Identidad</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input 
                        type="checkbox" 
                        checked={configData.required_documents.income_certificate}
                        onChange={(e) => setConfigData({
                          ...configData, 
                          required_documents: {...configData.required_documents, income_certificate: e.target.checked}
                        })}
                        className="rounded" 
                      />
                      <Label className="text-sm">Certificación de Ingresos</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input 
                        type="checkbox" 
                        checked={configData.required_documents.bank_statements}
                        onChange={(e) => setConfigData({
                          ...configData, 
                          required_documents: {...configData.required_documents, bank_statements: e.target.checked}
                        })}
                        className="rounded" 
                      />
                      <Label className="text-sm">Estados Bancarios</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input 
                        type="checkbox" 
                        checked={configData.required_documents.commercial_references}
                        onChange={(e) => setConfigData({
                          ...configData, 
                          required_documents: {...configData.required_documents, commercial_references: e.target.checked}
                        })}
                        className="rounded" 
                      />
                      <Label className="text-sm">Referencias Comerciales</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input 
                        type="checkbox" 
                        checked={configData.required_documents.guarantees}
                        onChange={(e) => setConfigData({
                          ...configData, 
                          required_documents: {...configData.required_documents, guarantees: e.target.checked}
                        })}
                        className="rounded" 
                      />
                      <Label className="text-sm">Garantías/Colateral</Label>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="flex justify-end">
                <Button 
                  onClick={saveRequestConfig}
                  className="w-full sm:w-auto min-h-[44px] touch-manipulation"
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Guardar Configuración
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Request Details Dialog */}
      {selectedRequest && (
        <Dialog open={!!selectedRequest} onOpenChange={() => {
          setSelectedRequest(null);
          setSelectedDocumentType('');
        }}>
          <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] overflow-y-auto sm:w-[90vw]">
            <DialogHeader>
              <DialogTitle className="text-xl sm:text-2xl font-bold flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Detalles de la Solicitud
              </DialogTitle>
            </DialogHeader>
            
            <div className="space-y-6">
              {/* Información del Cliente */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Información del Cliente
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <Label className="text-xs font-medium text-gray-500 uppercase">Nombre Completo</Label>
                      <p className="text-sm font-semibold mt-1">{selectedRequest.clients?.full_name || 'N/A'}</p>
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-gray-500 uppercase">DNI</Label>
                      <p className="text-sm mt-1">{selectedRequest.clients?.dni || 'N/A'}</p>
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-gray-500 uppercase">Teléfono</Label>
                      <p className="text-sm mt-1">{selectedRequest.clients?.phone || 'N/A'}</p>
                    </div>
                    {selectedRequest.clients?.email && (
                      <div>
                        <Label className="text-xs font-medium text-gray-500 uppercase">Email</Label>
                        <p className="text-sm mt-1">{selectedRequest.clients.email}</p>
                      </div>
                    )}
                    <div>
                      <Label className="text-xs font-medium text-gray-500 uppercase">Score Crediticio</Label>
                      <p className="text-sm font-semibold mt-1">
                        {selectedRequest.clients?.credit_score ? (
                          <span className={selectedRequest.clients.credit_score >= 700 ? 'text-green-600' : selectedRequest.clients.credit_score >= 600 ? 'text-yellow-600' : 'text-red-600'}>
                            {selectedRequest.clients.credit_score}
                          </span>
                        ) : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-gray-500 uppercase">Estado</Label>
                      <div className="mt-1">{getStatusBadge(selectedRequest.status)}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Información Financiera */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Información Financiera
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <Label className="text-xs font-medium text-gray-500 uppercase">Monto Solicitado</Label>
                      <p className="text-lg font-bold text-blue-600 mt-1">RD$ {selectedRequest.requested_amount.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    </div>
                    {selectedRequest.monthly_income && (
                      <div>
                        <Label className="text-xs font-medium text-gray-500 uppercase">Ingresos Mensuales</Label>
                        <p className="text-sm font-semibold mt-1">RD$ {selectedRequest.monthly_income.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      </div>
                    )}
                    {selectedRequest.existing_debts && (
                      <div>
                        <Label className="text-xs font-medium text-gray-500 uppercase">Deudas Existentes</Label>
                        <p className="text-sm font-semibold mt-1">RD$ {selectedRequest.existing_debts.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      </div>
                    )}
                    {selectedRequest.closing_costs && (
                      <div>
                        <Label className="text-xs font-medium text-gray-500 uppercase">Costos de Cierre</Label>
                        <p className="text-sm font-semibold mt-1">RD$ {selectedRequest.closing_costs.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Detalles del Préstamo */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                    <Settings className="h-4 w-4" />
                    Detalles del Préstamo
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {selectedRequest.interest_rate !== null && selectedRequest.interest_rate !== undefined && (
                      <div>
                        <Label className="text-xs font-medium text-gray-500 uppercase">Tasa de Interés</Label>
                        <p className="text-sm font-semibold mt-1">{selectedRequest.interest_rate}%</p>
                      </div>
                    )}
                    {selectedRequest.term_months && (
                      <div>
                        <Label className="text-xs font-medium text-gray-500 uppercase">Plazo (meses)</Label>
                        <p className="text-sm font-semibold mt-1">{selectedRequest.term_months} meses</p>
                      </div>
                    )}
                    {selectedRequest.loan_type && (
                      <div>
                        <Label className="text-xs font-medium text-gray-500 uppercase">Tipo de Préstamo</Label>
                        <p className="text-sm font-semibold mt-1 capitalize">{selectedRequest.loan_type}</p>
                      </div>
                    )}
                    {selectedRequest.amortization_type && (
                      <div>
                        <Label className="text-xs font-medium text-gray-500 uppercase">Tipo de Amortización</Label>
                        <p className="text-sm font-semibold mt-1 capitalize">{selectedRequest.amortization_type}</p>
                      </div>
                    )}
                    {selectedRequest.payment_frequency && (
                      <div>
                        <Label className="text-xs font-medium text-gray-500 uppercase">Frecuencia de Pago</Label>
                        <p className="text-sm font-semibold mt-1 capitalize">
                          {selectedRequest.payment_frequency === 'monthly' ? 'Mensual' :
                           selectedRequest.payment_frequency === 'biweekly' ? 'Quincenal' :
                           selectedRequest.payment_frequency === 'weekly' ? 'Semanal' :
                           selectedRequest.payment_frequency === 'daily' ? 'Diario' :
                           selectedRequest.payment_frequency}
                        </p>
                      </div>
                    )}
                    {selectedRequest.first_payment_date && (
                      <div>
                        <Label className="text-xs font-medium text-gray-500 uppercase">Fecha de Creación del Préstamo</Label>
                        <p className="text-sm font-semibold mt-1">{formatDateOnlyForSantoDomingo(selectedRequest.first_payment_date)}</p>
                      </div>
                    )}
                    {selectedRequest.minimum_payment_type && (
                      <div>
                        <Label className="text-xs font-medium text-gray-500 uppercase">Tipo de Pago Mínimo</Label>
                        <p className="text-sm font-semibold mt-1 capitalize">
                          {selectedRequest.minimum_payment_type === 'interest' ? 'Interés' :
                           selectedRequest.minimum_payment_type === 'principal' ? 'Capital' :
                           selectedRequest.minimum_payment_type === 'both' ? 'Ambos' :
                           selectedRequest.minimum_payment_type}
                        </p>
                      </div>
                    )}
                    {selectedRequest.minimum_payment_percentage && (
                      <div>
                        <Label className="text-xs font-medium text-gray-500 uppercase">Porcentaje de Pago Mínimo</Label>
                        <p className="text-sm font-semibold mt-1">{selectedRequest.minimum_payment_percentage}%</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Configuración de Mora */}
              {(selectedRequest.late_fee || selectedRequest.late_fee_rate || selectedRequest.grace_period_days) && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      Configuración de Mora
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div>
                        <Label className="text-xs font-medium text-gray-500 uppercase">Mora Habilitada</Label>
                        <p className="text-sm font-semibold mt-1">
                          {selectedRequest.late_fee ? (
                            <span className="text-green-600">Sí</span>
                          ) : (
                            <span className="text-gray-400">No</span>
                          )}
                        </p>
                      </div>
                      {selectedRequest.late_fee_rate && (
                        <div>
                          <Label className="text-xs font-medium text-gray-500 uppercase">Tasa de Mora</Label>
                          <p className="text-sm font-semibold mt-1">{selectedRequest.late_fee_rate}%</p>
                        </div>
                      )}
                      {selectedRequest.grace_period_days !== null && selectedRequest.grace_period_days !== undefined && (
                        <div>
                          <Label className="text-xs font-medium text-gray-500 uppercase">Días de Gracia</Label>
                          <p className="text-sm font-semibold mt-1">{selectedRequest.grace_period_days} días</p>
                        </div>
                      )}
                      {selectedRequest.max_late_fee && (
                        <div>
                          <Label className="text-xs font-medium text-gray-500 uppercase">Mora Máxima</Label>
                          <p className="text-sm font-semibold mt-1">RD$ {selectedRequest.max_late_fee.toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        </div>
                      )}
                      {selectedRequest.late_fee_calculation_type && (
                        <div>
                          <Label className="text-xs font-medium text-gray-500 uppercase">Tipo de Cálculo</Label>
                          <p className="text-sm font-semibold mt-1 capitalize">
                            {selectedRequest.late_fee_calculation_type === 'daily' ? 'Diario' :
                             selectedRequest.late_fee_calculation_type === 'monthly' ? 'Mensual' :
                             selectedRequest.late_fee_calculation_type === 'compound' ? 'Compuesto' :
                             selectedRequest.late_fee_calculation_type}
                          </p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Información Laboral y Verificación */}
              {(selectedRequest.employment_status || selectedRequest.income_verification) && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Información Laboral
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {selectedRequest.employment_status && (
                        <div>
                          <Label className="text-xs font-medium text-gray-500 uppercase">Estado de Empleo</Label>
                          <p className="text-sm font-semibold mt-1 capitalize">{selectedRequest.employment_status}</p>
                        </div>
                      )}
                      {selectedRequest.income_verification && (
                        <div>
                          <Label className="text-xs font-medium text-gray-500 uppercase">Verificación de Ingresos</Label>
                          <p className="text-sm mt-1">{selectedRequest.income_verification}</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Garantía y Codeudor */}
              {(selectedRequest.collateral_description || selectedRequest.guarantor_required) && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      Garantía y Codeudor
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {selectedRequest.collateral_description && (
                        <div>
                          <Label className="text-xs font-medium text-gray-500 uppercase">Descripción de Garantía</Label>
                          <p className="text-sm mt-1 whitespace-pre-wrap">{selectedRequest.collateral_description}</p>
                        </div>
                      )}
                      {selectedRequest.guarantor_required && (
                        <>
                          <div>
                            <Label className="text-xs font-medium text-gray-500 uppercase">Codeudor Requerido</Label>
                            <p className="text-sm font-semibold mt-1 text-green-600">Sí</p>
                          </div>
                          {selectedRequest.guarantor_name && (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t">
                              <div>
                                <Label className="text-xs font-medium text-gray-500 uppercase">Nombre del Codeudor</Label>
                                <p className="text-sm font-semibold mt-1">{selectedRequest.guarantor_name}</p>
                              </div>
                              {selectedRequest.guarantor_phone && (
                                <div>
                                  <Label className="text-xs font-medium text-gray-500 uppercase">Teléfono</Label>
                                  <p className="text-sm mt-1">{selectedRequest.guarantor_phone}</p>
                                </div>
                              )}
                              {selectedRequest.guarantor_dni && (
                                <div>
                                  <Label className="text-xs font-medium text-gray-500 uppercase">DNI</Label>
                                  <p className="text-sm mt-1">{selectedRequest.guarantor_dni}</p>
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Propósito y Notas */}
              {(selectedRequest.purpose || selectedRequest.notes) && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Información Adicional
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {selectedRequest.purpose && (
                        <div>
                          <Label className="text-xs font-medium text-gray-500 uppercase">Propósito del Préstamo</Label>
                          <p className="text-sm mt-1 whitespace-pre-wrap">{selectedRequest.purpose}</p>
                        </div>
                      )}
                      {selectedRequest.notes && (
                        <div>
                          <Label className="text-xs font-medium text-gray-500 uppercase">Notas</Label>
                          <p className="text-sm mt-1 whitespace-pre-wrap">{selectedRequest.notes}</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Información de Revisión */}
              {selectedRequest.reviewed_by && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                      <CheckCircle className="h-4 w-4" />
                      Información de Revisión
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {selectedRequest.reviewed_at && (
                        <div>
                          <Label className="text-xs font-medium text-gray-500 uppercase">Fecha de Revisión</Label>
                          <p className="text-sm font-semibold mt-1">
                            {formatDateTimeForSantoDomingo(selectedRequest.reviewed_at)}
                          </p>
                        </div>
                      )}
                      {selectedRequest.review_notes && (
                        <div className="sm:col-span-2">
                          <Label className="text-xs font-medium text-gray-500 uppercase">Notas de Revisión</Label>
                          <p className="text-sm mt-1 whitespace-pre-wrap bg-gray-50 p-3 rounded-md">{selectedRequest.review_notes}</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Documentos */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                      <File className="h-4 w-4" />
                      Documentos
                    </CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  {requestDocuments[selectedRequest.id]?.length > 0 ? (
                    <div className="space-y-2">
                      {requestDocuments[selectedRequest.id].map((doc: any) => (
                        <div key={doc.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <File className="h-5 w-5 text-blue-600 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{doc.title}</p>
                              <p className="text-xs text-gray-500">
                                {doc.document_type === 'identity_card' ? 'Cédula de Identidad' :
                                 doc.document_type === 'income_certificate' ? 'Certificación de Ingresos' :
                                 doc.document_type === 'bank_statements' ? 'Estados Bancarios' :
                                 doc.document_type === 'commercial_references' ? 'Referencias Comerciales' :
                                 doc.document_type === 'guarantees' ? 'Garantías/Colateral' :
                                 doc.document_type}
                                {doc.file_size && ` • ${(doc.file_size / 1024).toFixed(2)} KB`}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {doc.file_url && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => window.open(doc.file_url, '_blank')}
                              >
                                <Eye className="h-4 w-4 mr-2" />
                                Ver
                              </Button>
                            )}
                            {selectedRequest.status === 'pending' && doc.file_url && (
                              <>
                                <input
                                  type="file"
                                  className="hidden"
                                  id={`replace-doc-${doc.id}`}
                                  data-doc-id={doc.id}
                                  data-doc-type={doc.document_type}
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    const docId = e.currentTarget.getAttribute('data-doc-id');
                                    const docType = e.currentTarget.getAttribute('data-doc-type');
                                    if (file && docId && docType && selectedRequest) {
                                      // Eliminar el documento anterior
                                      try {
                                        const { error: deleteError } = await supabase
                                          .from('documents')
                                          .delete()
                                          .eq('id', docId);
                                        
                                        if (deleteError) throw deleteError;
                                        
                                        // Subir el nuevo documento
                                        await handleUploadDocument(
                                          selectedRequest.id,
                                          file,
                                          docType,
                                          file.name
                                        );
                                        
                                        toast.success('Documento reemplazado correctamente');
                                      } catch (error: any) {
                                        console.error('Error replacing document:', error);
                                        toast.error('Error al reemplazar documento');
                                      }
                                      
                                      e.target.value = '';
                                    }
                                  }}
                                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                                />
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    const input = document.getElementById(`replace-doc-${doc.id}`) as HTMLInputElement;
                                    input?.click();
                                  }}
                                >
                                  <Upload className="h-4 w-4 mr-2" />
                                  Cambiar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-red-600 hover:bg-red-50"
                                  onClick={async () => {
                                    if (confirm('¿Estás seguro de que deseas eliminar este documento?')) {
                                      try {
                                        const { error } = await supabase
                                          .from('documents')
                                          .delete()
                                          .eq('id', doc.id);
                                        
                                        if (error) throw error;
                                        
                                        toast.success('Documento eliminado correctamente');
                                        await fetchRequestDocuments(selectedRequest.id);
                                      } catch (error: any) {
                                        console.error('Error deleting document:', error);
                                        toast.error('Error al eliminar documento');
                                      }
                                    }
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <File className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No hay documentos subidos</p>
                      {selectedRequest.status === 'pending' && (
                        <p className="text-xs mt-2">Selecciona un tipo de documento y haz clic en "Subir" para agregar documentos</p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Fechas */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base sm:text-lg flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Fechas
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs font-medium text-gray-500 uppercase">Fecha de Creación</Label>
                      <p className="text-sm font-semibold mt-1">
                        {formatDateTimeForSantoDomingo(selectedRequest.created_at)}
                      </p>
                    </div>
                    {selectedRequest.updated_at && (
                      <div>
                        <Label className="text-xs font-medium text-gray-500 uppercase">Última Actualización</Label>
                        <p className="text-sm font-semibold mt-1">
                          {formatDateTimeForSantoDomingo(selectedRequest.updated_at)}
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Request Dialog */}
      {editingRequest && editFormData && (
        <Dialog open={!!editingRequest} onOpenChange={() => {
          setEditingRequest(null);
          setEditFormData(null);
          setSelectedDocumentType('');
        }}>
          <DialogContent className="w-[95vw] max-w-4xl h-[95vh] max-h-[95vh] overflow-hidden flex flex-col sm:w-[90vw] lg:w-[80vw]">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="h-5 w-5" />
                Editar Solicitud - {editingRequest.clients?.full_name}
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto pr-1 sm:pr-2 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
              <form onSubmit={async (e) => {
                e.preventDefault();
                if (!user || !editingRequest) return;

                // Validar documentos requeridos
                if (configData.required_documents) {
                  const requiredDocs = Object.entries(configData.required_documents)
                    .filter(([_, required]) => required === true)
                    .map(([docType, _]) => docType);
                  
                  if (requiredDocs.length > 0) {
                    // Obtener documentos existentes de la solicitud
                    const existingDocs = requestDocuments[editingRequest.id] || [];
                    const existingDocTypes = existingDocs.map((doc: any) => doc.document_type);
                    
                    const missingDocs = requiredDocs.filter(docType => !existingDocTypes.includes(docType));
                    
                    if (missingDocs.length > 0) {
                      const docNames: { [key: string]: string } = {
                        identity_card: 'Cédula de Identidad',
                        income_certificate: 'Certificación de Ingresos',
                        bank_statements: 'Estados Bancarios',
                        commercial_references: 'Referencias Comerciales',
                        guarantees: 'Garantías/Colateral'
                      };
                      
                      const missingDocNames = missingDocs.map(docType => docNames[docType] || docType).join(', ');
                      toast.error(`Debes subir los siguientes documentos requeridos: ${missingDocNames}`);
                      return;
                    }
                  }
                }

                try {
                  const updateData: any = {
                    requested_amount: editFormData.requested_amount,
                    purpose: editFormData.purpose,
                    monthly_income: editFormData.monthly_income,
                    existing_debts: editFormData.existing_debts,
                    employment_status: editFormData.employment_status,
                    income_verification: editFormData.income_verification,
                    collateral_description: editFormData.collateral_description,
                    interest_rate: editFormData.interest_rate,
                    term_months: editFormData.term_months,
                    loan_type: editFormData.loan_type,
                    amortization_type: editFormData.amortization_type,
                    payment_frequency: editFormData.payment_frequency,
                    first_payment_date: editFormData.first_payment_date,
                    closing_costs: editFormData.closing_costs,
                    late_fee: editFormData.late_fee_enabled,
                    late_fee_rate: editFormData.late_fee_rate,
                    grace_period_days: editFormData.grace_period_days,
                    max_late_fee: editFormData.max_late_fee,
                    late_fee_calculation_type: editFormData.late_fee_calculation_type,
                    minimum_payment_type: editFormData.minimum_payment_type,
                    minimum_payment_percentage: editFormData.minimum_payment_percentage,
                    guarantor_required: editFormData.guarantor_required,
                    guarantor_name: editFormData.guarantor_name,
                    guarantor_phone: editFormData.guarantor_phone,
                    guarantor_dni: editFormData.guarantor_dni,
                    notes: editFormData.notes
                  };

                  const { error } = await supabase
                    .from('loan_requests')
                    .update(updateData)
                    .eq('id', editingRequest.id);

                  if (error) throw error;

                  toast.success('Solicitud actualizada exitosamente');
                  setEditingRequest(null);
                  setEditFormData(null);
                  fetchRequests();
                } catch (error) {
                  console.error('Error updating request:', error);
                  toast.error('Error al actualizar solicitud');
                }
              }} className="space-y-3 sm:space-y-4 pb-4">
                {/* Replicar todos los campos del formulario de nueva solicitud pero con editFormData */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <Label htmlFor="edit_requested_amount">Monto Solicitado *</Label>
                    <Input
                      id="edit_requested_amount"
                      type="number"
                      required
                      value={editFormData.requested_amount}
                      onChange={(e) => setEditFormData({...editFormData, requested_amount: Number(e.target.value)})}
                    />
                  </div>
                  <div>
                    <Label htmlFor="edit_purpose">Propósito</Label>
                    <Input
                      id="edit_purpose"
                      value={editFormData.purpose}
                      onChange={(e) => setEditFormData({...editFormData, purpose: e.target.value})}
                      placeholder="Propósito del préstamo"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="edit_monthly_income">Ingresos Mensuales</Label>
                    <Input
                      id="edit_monthly_income"
                      type="number"
                      value={editFormData.monthly_income}
                      onChange={(e) => setEditFormData({...editFormData, monthly_income: Number(e.target.value)})}
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="edit_existing_debts">Deudas Existentes</Label>
                    <Input
                      id="edit_existing_debts"
                      type="number"
                      value={editFormData.existing_debts}
                      onChange={(e) => setEditFormData({...editFormData, existing_debts: Number(e.target.value)})}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="edit_employment_status">Estado de Empleo</Label>
                    <Select value={editFormData.employment_status} onValueChange={(value) => setEditFormData({...editFormData, employment_status: value})}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar estado" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="employed">Empleado</SelectItem>
                        <SelectItem value="self_employed">Trabajador Independiente</SelectItem>
                        <SelectItem value="unemployed">Desempleado</SelectItem>
                        <SelectItem value="retired">Jubilado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label htmlFor="edit_income_verification">Verificación de Ingresos</Label>
                    <Input
                      id="edit_income_verification"
                      value={editFormData.income_verification}
                      onChange={(e) => setEditFormData({...editFormData, income_verification: e.target.value})}
                      placeholder="Documento de verificación"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="edit_collateral_description">Descripción de Garantía</Label>
                  <Textarea
                    id="edit_collateral_description"
                    value={editFormData.collateral_description}
                    onChange={(e) => setEditFormData({...editFormData, collateral_description: e.target.value})}
                    placeholder="Descripción de la garantía ofrecida (opcional)"
                  />
                </div>

                {/* Campos de préstamo - Replicar del formulario original */}
                <div className="border-t pt-4">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />
                    Datos del Préstamo
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="edit_interest_rate">Tasa de Interés (%)</Label>
                      <Input
                        id="edit_interest_rate"
                        type="number"
                        step="0.01"
                        value={editFormData.interest_rate}
                        onChange={(e) => setEditFormData({...editFormData, interest_rate: Number(e.target.value)})}
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit_term_months">Plazo (meses)</Label>
                      <Input
                        id="edit_term_months"
                        type="number"
                        value={editFormData.term_months}
                        onChange={(e) => setEditFormData({...editFormData, term_months: Number(e.target.value)})}
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit_loan_type">Tipo de Préstamo</Label>
                      <Select value={editFormData.loan_type} onValueChange={(value) => setEditFormData({...editFormData, loan_type: value})}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="personal">Personal</SelectItem>
                          <SelectItem value="business">Negocio</SelectItem>
                          <SelectItem value="mortgage">Hipotecario</SelectItem>
                          <SelectItem value="auto">Automotriz</SelectItem>
                          <SelectItem value="education">Educación</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="edit_amortization_type">Tipo de Amortización</Label>
                      <Select value={editFormData.amortization_type} onValueChange={(value) => setEditFormData({...editFormData, amortization_type: value})}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="simple">Simple</SelectItem>
                          <SelectItem value="french">Francés</SelectItem>
                          <SelectItem value="german">Alemán</SelectItem>
                          <SelectItem value="american">Americano</SelectItem>
                          <SelectItem value="indefinite">Indefinido</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="edit_payment_frequency">Frecuencia de Pago</Label>
                      <Select value={editFormData.payment_frequency} onValueChange={(value) => setEditFormData({...editFormData, payment_frequency: value})}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="monthly">Mensual</SelectItem>
                          <SelectItem value="biweekly">Quincenal</SelectItem>
                          <SelectItem value="weekly">Semanal</SelectItem>
                          <SelectItem value="daily">Diario</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="edit_first_payment_date">Fecha de Creación del Préstamo</Label>
                      <Input
                        id="edit_first_payment_date"
                        type="date"
                        value={editFormData.first_payment_date}
                        onChange={(e) => setEditFormData({...editFormData, first_payment_date: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label htmlFor="edit_closing_costs">Costos de Cierre</Label>
                      <Input
                        id="edit_closing_costs"
                        type="number"
                        step="0.01"
                        value={editFormData.closing_costs}
                        onChange={(e) => setEditFormData({...editFormData, closing_costs: Number(e.target.value)})}
                      />
                    </div>
                  </div>
                </div>

                {/* Configuración de mora */}
                <div className="border-t pt-4">
                  <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                    <AlertCircle className="h-5 w-5" />
                    Configuración de Mora
                  </h3>
                  <div className="space-y-4">
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="edit_late_fee_enabled"
                        checked={editFormData.late_fee_enabled}
                        onChange={(e) => setEditFormData({...editFormData, late_fee_enabled: e.target.checked})}
                        className="rounded"
                      />
                      <Label htmlFor="edit_late_fee_enabled">Incluir cargo por mora</Label>
                    </div>
                    {editFormData.late_fee_enabled && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div>
                          <Label htmlFor="edit_late_fee_rate">Tasa de Mora (%)</Label>
                          <Input
                            id="edit_late_fee_rate"
                            type="number"
                            step="0.01"
                            value={editFormData.late_fee_rate}
                            onChange={(e) => setEditFormData({...editFormData, late_fee_rate: Number(e.target.value)})}
                          />
                        </div>
                        <div>
                          <Label htmlFor="edit_grace_period_days">Días de Gracia</Label>
                          <Input
                            id="edit_grace_period_days"
                            type="number"
                            value={editFormData.grace_period_days}
                            onChange={(e) => setEditFormData({...editFormData, grace_period_days: Number(e.target.value)})}
                          />
                        </div>
                        <div>
                          <Label htmlFor="edit_max_late_fee">Mora Máxima (RD$)</Label>
                          <Input
                            id="edit_max_late_fee"
                            type="number"
                            step="0.01"
                            value={editFormData.max_late_fee}
                            onChange={(e) => setEditFormData({...editFormData, max_late_fee: Number(e.target.value)})}
                          />
                        </div>
                        <div>
                          <Label htmlFor="edit_late_fee_calculation_type">Tipo de Cálculo</Label>
                          <Select value={editFormData.late_fee_calculation_type} onValueChange={(value) => setEditFormData({...editFormData, late_fee_calculation_type: value})}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="daily">Diario</SelectItem>
                              <SelectItem value="monthly">Mensual</SelectItem>
                              <SelectItem value="compound">Compuesto</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Codeudor */}
                <div className="border-t pt-4">
                  <div className="flex items-center space-x-2 mb-4">
                    <input
                      type="checkbox"
                      id="edit_guarantor_required"
                      checked={editFormData.guarantor_required}
                      onChange={(e) => setEditFormData({...editFormData, guarantor_required: e.target.checked})}
                      className="rounded"
                    />
                    <Label htmlFor="edit_guarantor_required">Requiere Codeudor</Label>
                  </div>
                  {editFormData.guarantor_required && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <Label htmlFor="edit_guarantor_name">Nombre del Codeudor</Label>
                        <Input
                          id="edit_guarantor_name"
                          value={editFormData.guarantor_name}
                          onChange={(e) => setEditFormData({...editFormData, guarantor_name: e.target.value})}
                        />
                      </div>
                      <div>
                        <Label htmlFor="edit_guarantor_phone">Teléfono</Label>
                        <Input
                          id="edit_guarantor_phone"
                          value={editFormData.guarantor_phone}
                          onChange={(e) => setEditFormData({...editFormData, guarantor_phone: e.target.value})}
                        />
                      </div>
                      <div>
                        <Label htmlFor="edit_guarantor_dni">DNI</Label>
                        <Input
                          id="edit_guarantor_dni"
                          value={editFormData.guarantor_dni}
                          onChange={(e) => setEditFormData({...editFormData, guarantor_dni: e.target.value})}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Sección de Documentos */}
                <div className="border-t pt-4">
                  <div className="flex items-center justify-between mb-4">
                    <Label className="text-base font-semibold flex items-center gap-2">
                      <File className="h-5 w-5" />
                      Documentos
                    </Label>
                    <div className="flex items-center gap-2">
                      <Select 
                        value={selectedDocumentType} 
                        onValueChange={setSelectedDocumentType}
                      >
                        <SelectTrigger className="w-[180px]">
                          <SelectValue placeholder="Tipo de documento" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="identity_card">Cédula de Identidad</SelectItem>
                          <SelectItem value="income_certificate">Certificación de Ingresos</SelectItem>
                          <SelectItem value="bank_statements">Estados Bancarios</SelectItem>
                          <SelectItem value="commercial_references">Referencias Comerciales</SelectItem>
                          <SelectItem value="guarantees">Garantías/Colateral</SelectItem>
                          <SelectItem value="other">Otro</SelectItem>
                        </SelectContent>
                      </Select>
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file && selectedDocumentType && editingRequest) {
                            await handleUploadDocument(
                              editingRequest.id,
                              file,
                              selectedDocumentType,
                              file.name
                            );
                            if (fileInputRef.current) {
                              fileInputRef.current.value = '';
                            }
                            setSelectedDocumentType('');
                          }
                        }}
                        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (!selectedDocumentType) {
                            toast.error('Selecciona un tipo de documento primero');
                            return;
                          }
                          fileInputRef.current?.click();
                        }}
                        disabled={uploadingDocument || !selectedDocumentType}
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        Subir
                      </Button>
                    </div>
                  </div>
                  {requestDocuments[editingRequest.id]?.length > 0 ? (
                    <div className="space-y-2">
                      {requestDocuments[editingRequest.id].map((doc: any) => (
                        <div key={doc.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            <File className="h-5 w-5 text-blue-600 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{doc.title}</p>
                              <p className="text-xs text-gray-500">
                                {doc.document_type === 'identity_card' ? 'Cédula de Identidad' :
                                 doc.document_type === 'income_certificate' ? 'Certificación de Ingresos' :
                                 doc.document_type === 'bank_statements' ? 'Estados Bancarios' :
                                 doc.document_type === 'commercial_references' ? 'Referencias Comerciales' :
                                 doc.document_type === 'guarantees' ? 'Garantías/Colateral' :
                                 doc.document_type}
                                {doc.file_size && ` • ${(doc.file_size / 1024).toFixed(2)} KB`}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {doc.file_url && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => window.open(doc.file_url, '_blank')}
                              >
                                <Eye className="h-4 w-4 mr-2" />
                                Ver
                              </Button>
                            )}
                            {doc.file_url && (
                              <>
                                <input
                                  type="file"
                                  className="hidden"
                                  id={`edit-replace-doc-${doc.id}`}
                                  data-doc-id={doc.id}
                                  data-doc-type={doc.document_type}
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    const docId = e.currentTarget.getAttribute('data-doc-id');
                                    const docType = e.currentTarget.getAttribute('data-doc-type');
                                    if (file && docId && docType && editingRequest) {
                                      // Eliminar el documento anterior
                                      try {
                                        const { error: deleteError } = await supabase
                                          .from('documents')
                                          .delete()
                                          .eq('id', docId);
                                        
                                        if (deleteError) throw deleteError;
                                        
                                        // Subir el nuevo documento
                                        await handleUploadDocument(
                                          editingRequest.id,
                                          file,
                                          docType,
                                          file.name
                                        );
                                        
                                        toast.success('Documento reemplazado correctamente');
                                      } catch (error: any) {
                                        console.error('Error replacing document:', error);
                                        toast.error('Error al reemplazar documento');
                                      }
                                      
                                      e.target.value = '';
                                    }
                                  }}
                                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                                />
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    const input = document.getElementById(`edit-replace-doc-${doc.id}`) as HTMLInputElement;
                                    input?.click();
                                  }}
                                >
                                  <Upload className="h-4 w-4 mr-2" />
                                  Cambiar
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-red-600 hover:bg-red-50"
                                  onClick={async () => {
                                    if (confirm('¿Estás seguro de que deseas eliminar este documento?')) {
                                      try {
                                        const { error } = await supabase
                                          .from('documents')
                                          .delete()
                                          .eq('id', doc.id);
                                        
                                        if (error) throw error;
                                        
                                        toast.success('Documento eliminado correctamente');
                                        await fetchRequestDocuments(editingRequest.id);
                                      } catch (error: any) {
                                        console.error('Error deleting document:', error);
                                        toast.error('Error al eliminar documento');
                                      }
                                    }
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <File className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No hay documentos subidos</p>
                      <p className="text-xs mt-2">Selecciona un tipo de documento y haz clic en "Subir" para agregar documentos</p>
                    </div>
                  )}
                </div>

                {/* Notas */}
                <div>
                  <Label htmlFor="edit_notes">Notas</Label>
                  <Textarea
                    id="edit_notes"
                    value={editFormData.notes}
                    onChange={(e) => setEditFormData({...editFormData, notes: e.target.value})}
                    placeholder="Notas adicionales (opcional)"
                  />
                </div>

                <div className="flex flex-col sm:flex-row justify-end gap-2 pt-4 border-t">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setEditingRequest(null);
                      setEditFormData(null);
                    }}
                    className="w-full sm:w-auto"
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" className="w-full sm:w-auto">
                    <Pencil className="h-4 w-4 mr-2" />
                    Guardar Cambios
                  </Button>
                </div>
              </form>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* New Request Form Dialog */}
      <Dialog open={showRequestForm} onOpenChange={setShowRequestForm}>
        <DialogContent className="w-[95vw] max-w-4xl h-[95vh] max-h-[95vh] overflow-hidden flex flex-col sm:w-[90vw] lg:w-[80vw]">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>Nueva Solicitud de Préstamo</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto pr-1 sm:pr-2 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
            <form id="request-form" onSubmit={handleSubmit} className="space-y-3 sm:space-y-4 pb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <Label htmlFor="client_id">Cliente *</Label>
                <div className="relative">
                  <Input
                    placeholder="Buscar cliente por nombre..."
                    value={clientSearch}
                    onChange={(e) => handleClientSearch(e.target.value)}
                    className="w-full"
                  />
                  
                  {showClientDropdown && (
                    <div className="absolute top-full left-0 right-0 bg-white border border-gray-300 rounded-md shadow-lg z-20 max-h-60 overflow-y-auto">
                      {filteredClients.map((client) => (
                        <div
                          key={client.id}
                          className="p-3 hover:bg-gray-100 cursor-pointer border-b"
                          onClick={() => selectClient(client)}
                        >
                          <div className="font-medium">{client.full_name}</div>
                          <div className="text-sm text-gray-600">
                            DNI: {client.dni} | Tel: {client.phone}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              
              <div>
                <Label htmlFor="requested_amount">Monto Solicitado *</Label>
                <Input
                  id="requested_amount"
                  type="number"
                  value={formData.requested_amount}
                  onChange={(e) => setFormData({...formData, requested_amount: Number(e.target.value)})}
                  required
                />
              </div>
            </div>

            <div>
              <Label htmlFor="purpose">Propósito del Préstamo</Label>
              <Input
                id="purpose"
                value={formData.purpose}
                onChange={(e) => setFormData({...formData, purpose: e.target.value})}
                placeholder="Ej: Inversión en negocio, gastos médicos, etc."
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="monthly_income">Ingresos Mensuales</Label>
                <Input
                  id="monthly_income"
                  type="number"
                  value={formData.monthly_income}
                  onChange={(e) => setFormData({...formData, monthly_income: Number(e.target.value)})}
                />
              </div>
              
              <div>
                <Label htmlFor="existing_debts">Deudas Existentes</Label>
                <Input
                  id="existing_debts"
                  type="number"
                  value={formData.existing_debts}
                  onChange={(e) => setFormData({...formData, existing_debts: Number(e.target.value)})}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="employment_status">Estado de Empleo</Label>
                <Select value={formData.employment_status} onValueChange={(value) => setFormData({...formData, employment_status: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="employed">Empleado</SelectItem>
                    <SelectItem value="self_employed">Trabajador Independiente</SelectItem>
                    <SelectItem value="unemployed">Desempleado</SelectItem>
                    <SelectItem value="retired">Jubilado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="income_verification">Verificación de Ingresos</Label>
                <Input
                  id="income_verification"
                  value={formData.income_verification}
                  onChange={(e) => setFormData({...formData, income_verification: e.target.value})}
                  placeholder="Documento de verificación"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="collateral_description">Descripción de Garantía</Label>
              <Textarea
                id="collateral_description"
                value={formData.collateral_description}
                onChange={(e) => setFormData({...formData, collateral_description: e.target.value})}
                placeholder="Descripción de la garantía ofrecida (opcional)"
              />
            </div>

            {/* Sección de Documentos */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-4">
                <Label className="text-base font-semibold flex items-center gap-2">
                  <File className="h-5 w-5" />
                  Documentos
                </Label>
                <div className="flex items-center gap-2">
                  <Select 
                    value={selectedDocumentType} 
                    onValueChange={setSelectedDocumentType}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Tipo de documento" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="identity_card">Cédula de Identidad</SelectItem>
                      <SelectItem value="income_certificate">Certificación de Ingresos</SelectItem>
                      <SelectItem value="bank_statements">Estados Bancarios</SelectItem>
                      <SelectItem value="commercial_references">Referencias Comerciales</SelectItem>
                      <SelectItem value="guarantees">Garantías/Colateral</SelectItem>
                      <SelectItem value="other">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                  <input
                    ref={newRequestFileInputRef}
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file && selectedDocumentType) {
                        setPendingDocuments(prev => [...prev, {
                          file,
                          type: selectedDocumentType,
                          title: file.name
                        }]);
                        setSelectedDocumentType('');
                        if (newRequestFileInputRef.current) {
                          newRequestFileInputRef.current.value = '';
                        }
                        toast.success('Documento agregado. Se subirá al crear la solicitud.');
                      }
                    }}
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (!selectedDocumentType) {
                        toast.error('Selecciona un tipo de documento primero');
                        return;
                      }
                      newRequestFileInputRef.current?.click();
                    }}
                    disabled={!selectedDocumentType}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Agregar
                  </Button>
                </div>
              </div>
              {pendingDocuments.length > 0 ? (
                <div className="space-y-2">
                  {pendingDocuments.map((doc, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        <File className="h-5 w-5 text-blue-600" />
                        <div>
                          <p className="text-sm font-medium">{doc.title}</p>
                          <p className="text-xs text-gray-500">
                            {doc.type === 'identity_card' ? 'Cédula de Identidad' :
                             doc.type === 'income_certificate' ? 'Certificación de Ingresos' :
                             doc.type === 'bank_statements' ? 'Estados Bancarios' :
                             doc.type === 'commercial_references' ? 'Referencias Comerciales' :
                             doc.type === 'guarantees' ? 'Garantías/Colateral' :
                             doc.type}
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setPendingDocuments(prev => prev.filter((_, i) => i !== index));
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 text-center py-4">
                  No hay documentos agregados. Selecciona un tipo y haz clic en "Agregar" para subir documentos.
                </p>
              )}
            </div>

            {/* Sección de Datos del Préstamo */}
            <div className="border-t pt-4 sm:pt-6">
              <h3 className="text-lg font-semibold mb-3 sm:mb-4 text-blue-600">📋 Datos del Préstamo</h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <Label htmlFor="interest_rate">Tasa de Interés (%) *</Label>
                  <Input
                    id="interest_rate"
                    type="number"
                    step="0.01"
                    value={formData.interest_rate}
                    onChange={(e) => setFormData({...formData, interest_rate: Number(e.target.value)})}
                    placeholder="Ej: 15.5"
                    required
                  />
                </div>
                
                <div>
                  <Label htmlFor="term_months">Plazo (meses) *</Label>
                  <Input
                    id="term_months"
                    type="number"
                    value={formData.term_months}
                    onChange={(e) => setFormData({...formData, term_months: Number(e.target.value)})}
                    placeholder="Ej: 12"
                    required
                  />
                </div>
                
                <div>
                  <Label htmlFor="loan_type">Tipo de Préstamo *</Label>
                  <Select value={formData.loan_type} onValueChange={(value) => setFormData({...formData, loan_type: value})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="personal">Personal</SelectItem>
                      <SelectItem value="business">Empresarial</SelectItem>
                      <SelectItem value="mortgage">Hipotecario</SelectItem>
                      <SelectItem value="auto">Automotriz</SelectItem>
                      <SelectItem value="education">Educativo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="amortization_type">Tipo de Amortización *</Label>
                  <Select value={formData.amortization_type} onValueChange={(value) => setFormData({...formData, amortization_type: value})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="simple">Simple</SelectItem>
                      <SelectItem value="french">Francés</SelectItem>
                      <SelectItem value="german">Alemán</SelectItem>
                      <SelectItem value="american">Americano</SelectItem>
                      <SelectItem value="indefinite">Indefinido</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="payment_frequency">Frecuencia de Pago *</Label>
                  <Select value={formData.payment_frequency} onValueChange={(value) => setFormData({...formData, payment_frequency: value})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar frecuencia" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Mensual</SelectItem>
                      <SelectItem value="biweekly">Quincenal</SelectItem>
                      <SelectItem value="weekly">Semanal</SelectItem>
                      <SelectItem value="daily">Diario</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="first_payment_date">Fecha de Creación del Préstamo *</Label>
                  <Input
                    id="first_payment_date"
                    type="date"
                    value={formData.first_payment_date}
                    onChange={(e) => setFormData({...formData, first_payment_date: e.target.value})}
                    required
                  />
                </div>
                
                <div>
                  <Label htmlFor="closing_costs">Costos de Cierre</Label>
                  <Input
                    id="closing_costs"
                    type="number"
                    step="0.01"
                    value={formData.closing_costs}
                    onChange={(e) => setFormData({...formData, closing_costs: Number(e.target.value)})}
                    placeholder="0.00"
                  />
                </div>
                
              {/* Configuración de Mora */}
              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="late_fee_enabled"
                    checked={formData.late_fee_enabled}
                    onChange={(e) => setFormData({...formData, late_fee_enabled: e.target.checked})}
                    className="rounded"
                  />
                  <Label htmlFor="late_fee_enabled">Incluir cargo por mora</Label>
                </div>
                
                {formData.late_fee_enabled && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
                    <div>
                      <Label htmlFor="late_fee_rate">Tasa de Mora por Día (%)</Label>
                      <Input
                        id="late_fee_rate"
                        type="number"
                        step="0.1"
                        min="0"
                        max="100"
                        value={formData.late_fee_rate}
                        onChange={(e) => setFormData({...formData, late_fee_rate: Number(e.target.value)})}
                        placeholder="2.0"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="grace_period_days">Días de Gracia</Label>
                      <Input
                        id="grace_period_days"
                        type="number"
                        min="0"
                        max="30"
                        value={formData.grace_period_days}
                        onChange={(e) => setFormData({...formData, grace_period_days: Number(e.target.value)})}
                        placeholder="0"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="max_late_fee">Mora Máxima (RD$)</Label>
                      <Input
                        id="max_late_fee"
                        type="number"
                        min="0"
                        value={formData.max_late_fee}
                        onChange={(e) => setFormData({...formData, max_late_fee: Number(e.target.value)})}
                        placeholder="0"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="late_fee_calculation_type">Tipo de Cálculo</Label>
                      <Select value={formData.late_fee_calculation_type} onValueChange={(value) => setFormData({...formData, late_fee_calculation_type: value})}>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar tipo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">Diario</SelectItem>
                          <SelectItem value="monthly">Mensual</SelectItem>
                          <SelectItem value="compound">Compuesto</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}
              </div>
              </div>
              
              {/* Sección de Garantía */}
              <div className="mt-4 sm:mt-6">
                <h4 className="text-md font-semibold mb-3 text-gray-700">👥 Información de Garantía</h4>
                
                <div className="flex items-center space-x-2 mb-4">
                  <input
                    type="checkbox"
                    id="guarantor_required"
                    checked={formData.guarantor_required}
                    onChange={(e) => setFormData({...formData, guarantor_required: e.target.checked})}
                    className="rounded"
                  />
                  <Label htmlFor="guarantor_required">Requiere garantía</Label>
                </div>
                
                {formData.guarantor_required && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 p-3 sm:p-4 bg-gray-50 rounded-lg">
                    <div>
                      <Label htmlFor="guarantor_name">Nombre del Garante</Label>
                      <Input
                        id="guarantor_name"
                        value={formData.guarantor_name}
                        onChange={(e) => setFormData({...formData, guarantor_name: e.target.value})}
                        placeholder="Nombre completo"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="guarantor_phone">Teléfono del Garante</Label>
                      <Input
                        id="guarantor_phone"
                        value={formData.guarantor_phone}
                        onChange={(e) => setFormData({...formData, guarantor_phone: e.target.value})}
                        placeholder="(809) 123-4567"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="guarantor_dni">DNI del Garante</Label>
                      <Input
                        id="guarantor_dni"
                        value={formData.guarantor_dni}
                        onChange={(e) => setFormData({...formData, guarantor_dni: e.target.value})}
                        placeholder="000-0000000-0"
                      />
                    </div>
                  </div>
                )}
              </div>
              
              {/* Campo de Notas */}
              <div className="mt-4">
                <Label htmlFor="notes">Notas Adicionales</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  placeholder="Información adicional sobre el préstamo..."
                  rows={3}
                />
              </div>
            </div>

            </form>
          </div>
          <div className="flex-shrink-0 border-t pt-4 mt-4">
            <div className="flex justify-end">
              <Button type="submit" form="request-form">Crear Solicitud</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Confirmación de Eliminación */}
      <Dialog open={showDeleteDialog} onOpenChange={(open) => {
        if (!open) {
          setShowDeleteDialog(false);
          setRequestToDelete(null);
        }
      }}>
        <DialogContent className="w-[95vw] max-w-md sm:w-[90vw]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl">
              <Trash2 className="h-5 w-5 text-red-600" />
              Confirmar Eliminación
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 sm:space-y-4">
            <p className="text-gray-600">
              ¿Estás seguro de que deseas eliminar esta solicitud aprobada?
            </p>
            {requestToDelete && (
              <div className="bg-gray-50 p-4 rounded-lg">
                <h4 className="font-medium text-gray-900">
                  Solicitud de {requestToDelete.clients?.full_name}
                </h4>
                <p className="text-sm text-gray-600">
                  Monto: ${requestToDelete.requested_amount.toLocaleString()}
                </p>
                <p className="text-sm text-gray-600">
                  Fecha: {new Date(requestToDelete.created_at).toLocaleDateString()}
                </p>
              </div>
            )}
            <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowDeleteDialog(false);
                  setRequestToDelete(null);
                }}
                className="w-full sm:w-auto min-h-[40px] touch-manipulation"
              >
                Cancelar
              </Button>
              <Button 
                variant="destructive" 
                onClick={confirmDeleteRequest}
                className="w-full sm:w-auto min-h-[40px] touch-manipulation"
              >
                <Trash2 className="h-4 w-4 mr-1 sm:mr-2" />
                Eliminar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RequestsModule;
