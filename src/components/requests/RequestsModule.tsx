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
  Eye
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
  const [loading, setLoading] = useState(true);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<LoanRequest | null>(null);
  const [activeTab, setActiveTab] = useState('lista-solicitudes');
  const { user } = useAuth();

  const [formData, setFormData] = useState({
    client_id: '',
    requested_amount: 0,
    purpose: '',
    monthly_income: 0,
    existing_debts: 0,
    employment_status: '',
    income_verification: '',
    collateral_description: ''
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
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('id, full_name, dni, phone, email')
        .eq('status', 'active')
        .order('full_name');

      if (error) throw error;
      setClients(data || []);
    } catch (error) {
      console.error('Error fetching clients:', error);
      toast.error('Error al cargar clientes');
    }
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

  const resetForm = () => {
    setFormData({
      client_id: '',
      requested_amount: 0,
      purpose: '',
      monthly_income: 0,
      existing_debts: 0,
      employment_status: '',
      income_verification: '',
      collateral_description: ''
    });
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
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Solicitudes de Préstamos</h1>
        <Button onClick={() => setShowRequestForm(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nueva Solicitud
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
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
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="nueva-solicitud">Nueva Solicitud</TabsTrigger>
          <TabsTrigger value="lista-solicitudes">Lista de Solicitudes</TabsTrigger>
          <TabsTrigger value="configuracion">Configuración</TabsTrigger>
        </TabsList>

        <TabsContent value="nueva-solicitud" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <FileText className="h-5 w-5 mr-2" />
                Crear Nueva Solicitud de Préstamo
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="client_id">Cliente *</Label>
                    <Select value={formData.client_id} onValueChange={(value) => setFormData({...formData, client_id: value})}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar cliente" />
                      </SelectTrigger>
                      <SelectContent>
                        {clients.map(client => (
                          <SelectItem key={client.id} value={client.id}>
                            {client.full_name} - {client.dni}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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

                <div className="flex justify-end">
                  <Button type="submit">Crear Solicitud</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="lista-solicitudes" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Solicitudes Recientes</CardTitle>
            </CardHeader>
            <CardContent>
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
                    <div key={request.id} className="border rounded-lg p-4 hover:bg-gray-50">
                      <div className="flex justify-between items-start">
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center space-x-3">
                            <User className="h-4 w-4 text-gray-500" />
                            <h3 className="font-medium">{request.clients?.full_name}</h3>
                            {getStatusBadge(request.status)}
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
                            <div className="flex items-center">
                              <DollarSign className="h-3 w-3 mr-1" />
                              Solicita: ${request.requested_amount.toLocaleString()}
                            </div>
                            <div className="flex items-center">
                              <Clock className="h-3 w-3 mr-1" />
                              {new Date(request.created_at).toLocaleDateString()}
                            </div>
                            <div className="flex items-center">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              Score: {request.clients?.credit_score || 'N/A'}
                            </div>
                          </div>
                          {request.purpose && (
                            <p className="text-sm text-gray-600">
                              <strong>Propósito:</strong> {request.purpose}
                            </p>
                          )}
                          {request.review_notes && (
                            <p className="text-sm text-gray-600">
                              <strong>Notas:</strong> {request.review_notes}
                            </p>
                          )}
                        </div>
                        <div className="flex space-x-2 ml-4">
                          <Button size="sm" variant="outline" onClick={() => setSelectedRequest(request)}>
                            <Eye className="h-4 w-4 mr-1" />
                            Ver
                          </Button>
                          {request.status === 'pending' && (
                            <>
                              <Button 
                                size="sm" 
                                variant="outline" 
                                className="text-green-600 hover:bg-green-50"
                                onClick={() => updateRequestStatus(request.id, 'approved')}
                              >
                                Aprobar
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline" 
                                className="text-red-600 hover:bg-red-50"
                                onClick={() => updateRequestStatus(request.id, 'rejected')}
                              >
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

        <TabsContent value="configuracion" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Settings className="h-5 w-5 mr-2" />
                Configuración de Solicitudes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                <Button>Guardar Configuración</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Request Details Dialog */}
      {selectedRequest && (
        <Dialog open={!!selectedRequest} onOpenChange={() => setSelectedRequest(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Detalles de la Solicitud</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
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
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nueva Solicitud de Préstamo</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="client_id">Cliente *</Label>
                <Select value={formData.client_id} onValueChange={(value) => setFormData({...formData, client_id: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map(client => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.full_name} - {client.dni}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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

            <div className="flex justify-end">
              <Button type="submit">Crear Solicitud</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RequestsModule;
