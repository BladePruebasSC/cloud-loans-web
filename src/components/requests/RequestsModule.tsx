import React, { useState, useEffect } from 'react';
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
  Trash2
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
  const { user, companyId } = useAuth();

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
    term_months: 12,
    loan_type: 'personal',
    amortization_type: 'simple',
    payment_frequency: 'monthly',
    first_payment_date: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().split('T')[0],
    closing_costs: 0,
    late_fee: false,
    minimum_payment_type: 'interest',
    minimum_payment_percentage: 100,
    guarantor_required: false,
    guarantor_name: '',
    guarantor_phone: '',
    guarantor_dni: '',
    notes: ''
  });

  useEffect(() => {
    if (user) {
      fetchRequests();
      fetchClients();
    }
  }, [user]);

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

    try {
      const requestData = {
        ...formData,
        user_id: user.id
      };

      const { error } = await supabase
        .from('loan_requests')
        .insert([requestData]);

      if (error) throw error;

      toast.success('Solicitud creada exitosamente');
      setShowRequestForm(false);
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
      term_months: (request.term_months || 12).toString(),
      loan_type: request.loan_type || 'personal',
      amortization_type: request.amortization_type || 'simple',
      payment_frequency: request.payment_frequency || 'monthly',
      first_payment_date: request.first_payment_date || new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().split('T')[0],
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
      // Resetear nuevos campos
      interest_rate: 0,
      term_months: 12,
      loan_type: 'personal',
      amortization_type: 'simple',
      payment_frequency: 'monthly',
      first_payment_date: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString().split('T')[0],
      closing_costs: 0,
      late_fee: false,
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
  };

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

  const pendingRequests = requests.filter(r => r.status === 'pending');
  const approvedRequests = requests.filter(r => r.status === 'approved');
  const rejectedRequests = requests.filter(r => r.status === 'rejected');

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
              <CardTitle className="text-base sm:text-lg">Solicitudes Recientes</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {loading ? (
                <div className="text-center py-8">Cargando solicitudes...</div>
              ) : requests.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No hay solicitudes registradas</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {requests.map((request) => (
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
                          
                          {/* Botones de Aprobación/Rechazo - Solo para solicitudes pendientes */}
                          {request.status === 'pending' && (
                            <>
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
                        defaultValue="650"
                        placeholder="Score mínimo requerido"
                      />
                    </div>
                    <div>
                      <Label htmlFor="min_income">Ingresos Mínimos Mensuales</Label>
                      <Input 
                        id="min_income"
                        type="number" 
                        defaultValue="25000"
                        placeholder="Ingresos mínimos en pesos"
                      />
                    </div>
                    <div>
                      <Label htmlFor="min_employment">Años de Empleo Mínimo</Label>
                      <Input 
                        id="min_employment"
                        type="number" 
                        defaultValue="1"
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
                      <input type="checkbox" defaultChecked className="rounded" />
                      <Label className="text-sm">Cédula de Identidad</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input type="checkbox" defaultChecked className="rounded" />
                      <Label className="text-sm">Certificación de Ingresos</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input type="checkbox" defaultChecked className="rounded" />
                      <Label className="text-sm">Estados Bancarios</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input type="checkbox" className="rounded" />
                      <Label className="text-sm">Referencias Comerciales</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <input type="checkbox" className="rounded" />
                      <Label className="text-sm">Garantías/Colateral</Label>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="flex justify-end">
                <Button className="w-full sm:w-auto min-h-[44px] touch-manipulation">
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
        <Dialog open={!!selectedRequest} onOpenChange={() => setSelectedRequest(null)}>
          <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto sm:w-[90vw]">
            <DialogHeader>
              <DialogTitle className="text-lg sm:text-xl">Detalles de la Solicitud</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 sm:space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <Label className="text-sm font-medium text-gray-500">Cliente</Label>
                  <p className="text-lg font-semibold">{selectedRequest.clients?.full_name}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-500">Estado</Label>
                  <div className="mt-1">{getStatusBadge(selectedRequest.status)}</div>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-500">Monto Solicitado</Label>
                  <p className="text-lg">${selectedRequest.requested_amount.toLocaleString()}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-500">Fecha de Solicitud</Label>
                  <p className="text-lg">{new Date(selectedRequest.created_at).toLocaleDateString()}</p>
                </div>
                {selectedRequest.monthly_income && (
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Ingresos Mensuales</Label>
                    <p className="text-lg">${selectedRequest.monthly_income.toLocaleString()}</p>
                  </div>
                )}
                {selectedRequest.existing_debts && (
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Deudas Existentes</Label>
                    <p className="text-lg">${selectedRequest.existing_debts.toLocaleString()}</p>
                  </div>
                )}
              </div>
              {selectedRequest.purpose && (
                <div>
                  <Label className="text-sm font-medium text-gray-500">Propósito</Label>
                  <p className="text-base">{selectedRequest.purpose}</p>
                </div>
              )}
              {selectedRequest.collateral_description && (
                <div>
                  <Label className="text-sm font-medium text-gray-500">Garantía</Label>
                  <p className="text-base">{selectedRequest.collateral_description}</p>
                </div>
              )}
              {selectedRequest.review_notes && (
                <div>
                  <Label className="text-sm font-medium text-gray-500">Notas de Revisión</Label>
                  <p className="text-base">{selectedRequest.review_notes}</p>
                </div>
              )}
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
                  <Label htmlFor="first_payment_date">Fecha del Primer Pago *</Label>
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
                
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="late_fee"
                    checked={formData.late_fee}
                    onChange={(e) => setFormData({...formData, late_fee: e.target.checked})}
                    className="rounded"
                  />
                  <Label htmlFor="late_fee">Incluir cargo por mora</Label>
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
