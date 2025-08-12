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
  HandHeart, 
  Plus, 
  Calendar, 
  DollarSign, 
  Users,
  Clock,
  CheckCircle,
  XCircle,
  Edit,
  Trash2,
  FileText,
  Search,
  Filter,
  Download,
  Eye,
  AlertCircle,
  TrendingUp,
  Calculator
} from 'lucide-react';

interface PaymentAgreement {
  id: string;
  loan_id: string;
  client_name: string;
  client_dni: string;
  client_phone: string;
  loan_amount: number;
  original_payment: number;
  agreed_payment_amount: number;
  payment_frequency: string;
  start_date: string;
  end_date: string;
  status: string;
  reason: string;
  notes: string | null;
  created_at: string;
  approved_by: string | null;
  approved_at: string | null;
  loans?: {
    id: string;
    amount: number;
    remaining_balance: number;
    monthly_payment: number;
    clients?: {
      full_name: string;
      dni: string;
      phone: string;
    };
  };
}

interface Loan {
  id: string;
  amount: number;
  remaining_balance: number;
  monthly_payment: number;
  clients?: {
    full_name: string;
    dni: string;
    phone: string;
  };
}

export const PaymentAgreementsModule = () => {
  const [agreements, setAgreements] = useState<PaymentAgreement[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingAgreement, setEditingAgreement] = useState<PaymentAgreement | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [activeTab, setActiveTab] = useState('acuerdos');
  const { user } = useAuth();

  const [formData, setFormData] = useState({
    loan_id: '',
    agreed_payment_amount: 0,
    payment_frequency: 'monthly',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    reason: '',
    notes: ''
  });

  useEffect(() => {
    if (user) {
      fetchAgreements();
      fetchLoans();
    }
  }, [user]);

  const fetchAgreements = async () => {
    try {
      setLoading(true);
      
      // Simulamos datos de acuerdos de pago más completos
      const mockAgreements: PaymentAgreement[] = [
        {
          id: '1',
          loan_id: 'loan-1',
          client_name: 'Juan Pérez',
          client_dni: '001-1234567-8',
          client_phone: '(809) 123-4567',
          loan_amount: 50000,
          original_payment: 3500,
          agreed_payment_amount: 2500,
          payment_frequency: 'monthly',
          start_date: '2024-01-15',
          end_date: '2024-12-15',
          status: 'active',
          reason: 'Dificultades económicas temporales',
          notes: 'Cliente perdió empleo, nuevo acuerdo por 6 meses',
          created_at: '2024-01-10T10:00:00Z',
          approved_by: 'admin',
          approved_at: '2024-01-12T14:30:00Z'
        },
        {
          id: '2',
          loan_id: 'loan-2',
          client_name: 'María González',
          client_dni: '001-2345678-9',
          client_phone: '(809) 234-5678',
          loan_amount: 75000,
          original_payment: 5200,
          agreed_payment_amount: 4000,
          payment_frequency: 'monthly',
          start_date: '2024-02-01',
          end_date: '2024-08-01',
          status: 'pending',
          reason: 'Reducción de ingresos por enfermedad',
          notes: 'Solicita reducción temporal por 6 meses',
          created_at: '2024-01-28T14:30:00Z',
          approved_by: null,
          approved_at: null
        },
        {
          id: '3',
          loan_id: 'loan-3',
          client_name: 'Carlos Rodríguez',
          client_dni: '001-3456789-0',
          client_phone: '(809) 345-6789',
          loan_amount: 30000,
          original_payment: 2100,
          agreed_payment_amount: 1500,
          payment_frequency: 'biweekly',
          start_date: '2024-01-01',
          end_date: '2024-06-30',
          status: 'completed',
          reason: 'Emergencia familiar',
          notes: 'Acuerdo completado exitosamente',
          created_at: '2023-12-15T09:00:00Z',
          approved_by: 'admin',
          approved_at: '2023-12-16T10:00:00Z'
        }
      ];

      setAgreements(mockAgreements);
    } catch (error) {
      console.error('Error fetching agreements:', error);
      toast.error('Error al cargar acuerdos');
    } finally {
      setLoading(false);
    }
  };

  const fetchLoans = async () => {
    try {
      const { data, error } = await supabase
        .from('loans')
        .select(`
          id,
          amount,
          remaining_balance,
          monthly_payment,
          clients (
            full_name,
            dni,
            phone
          )
        `)
        .eq('status', 'active');

      if (error) throw error;
      setLoans((data as unknown as Loan[]) || []);
    } catch (error) {
      console.error('Error fetching loans:', error);
      toast.error('Error al cargar préstamos');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const selectedLoan = loans.find(l => l.id === formData.loan_id);
      if (!selectedLoan) {
        toast.error('Préstamo no encontrado');
        return;
      }

      const newAgreement: PaymentAgreement = {
        id: Date.now().toString(),
        loan_id: formData.loan_id,
        client_name: selectedLoan.clients?.full_name || 'N/A',
        client_dni: selectedLoan.clients?.dni || 'N/A',
        client_phone: selectedLoan.clients?.phone || 'N/A',
        loan_amount: selectedLoan.amount,
        original_payment: selectedLoan.monthly_payment,
        agreed_payment_amount: formData.agreed_payment_amount,
        payment_frequency: formData.payment_frequency,
        start_date: formData.start_date,
        end_date: formData.end_date,
        status: 'pending',
        reason: formData.reason,
        notes: formData.notes || null,
        created_at: new Date().toISOString(),
        approved_by: null,
        approved_at: null
      };

      if (editingAgreement) {
        setAgreements(prev => prev.map(agreement => 
          agreement.id === editingAgreement.id 
            ? { ...agreement, ...newAgreement, id: editingAgreement.id }
            : agreement
        ));
        toast.success('Acuerdo actualizado exitosamente');
      } else {
        setAgreements(prev => [newAgreement, ...prev]);
        toast.success('Acuerdo creado exitosamente');
      }

      setShowForm(false);
      setEditingAgreement(null);
      resetForm();
    } catch (error) {
      console.error('Error saving agreement:', error);
      toast.error('Error al guardar acuerdo');
    }
  };

  const handleEdit = (agreement: PaymentAgreement) => {
    setEditingAgreement(agreement);
    setFormData({
      loan_id: agreement.loan_id,
      agreed_payment_amount: agreement.agreed_payment_amount,
      payment_frequency: agreement.payment_frequency,
      start_date: agreement.start_date,
      end_date: agreement.end_date,
      reason: agreement.reason,
      notes: agreement.notes || ''
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Está seguro de eliminar este acuerdo?')) return;
    
    setAgreements(prev => prev.filter(agreement => agreement.id !== id));
    toast.success('Acuerdo eliminado exitosamente');
  };

  const updateStatus = (id: string, status: string) => {
    setAgreements(prev => prev.map(agreement => 
      agreement.id === id 
        ? { 
            ...agreement, 
            status,
            approved_by: status === 'approved' ? 'admin' : null,
            approved_at: status === 'approved' ? new Date().toISOString() : null
          } 
        : agreement
    ));
    toast.success(`Acuerdo ${status === 'approved' ? 'aprobado' : status === 'rejected' ? 'rechazado' : 'actualizado'} exitosamente`);
  };

  const resetForm = () => {
    setFormData({
      loan_id: '',
      agreed_payment_amount: 0,
      payment_frequency: 'monthly',
      start_date: new Date().toISOString().split('T')[0],
      end_date: '',
      reason: '',
      notes: ''
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge className="bg-orange-100 text-orange-800">Pendiente</Badge>;
      case 'approved':
        return <Badge className="bg-green-100 text-green-800">Aprobado</Badge>;
      case 'active':
        return <Badge className="bg-blue-100 text-blue-800">Activo</Badge>;
      case 'completed':
        return <Badge className="bg-purple-100 text-purple-800">Completado</Badge>;
      case 'rejected':
        return <Badge variant="destructive">Rechazado</Badge>;
      case 'cancelled':
        return <Badge variant="secondary">Cancelado</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getFrequencyLabel = (frequency: string) => {
    const frequencies = {
      weekly: 'Semanal',
      biweekly: 'Quincenal',
      monthly: 'Mensual'
    };
    return frequencies[frequency as keyof typeof frequencies] || frequency;
  };

  const filteredAgreements = agreements.filter(agreement => {
    const matchesSearch = agreement.client_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         agreement.client_dni.includes(searchTerm);
    const matchesStatus = statusFilter === 'all' || agreement.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const activeAgreements = agreements.filter(a => a.status === 'active').length;
  const pendingAgreements = agreements.filter(a => a.status === 'pending').length;
  const completedAgreements = agreements.filter(a => a.status === 'completed').length;
  const totalSavings = agreements
    .filter(a => a.status === 'active' || a.status === 'completed')
    .reduce((sum, a) => sum + (a.original_payment - a.agreed_payment_amount), 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Acuerdos de Pago</h1>
        <div className="flex gap-2">
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
          <Button onClick={() => {
            setShowForm(true);
            setEditingAgreement(null);
            resetForm();
          }}>
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Acuerdo
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="acuerdos">Acuerdos</TabsTrigger>
          <TabsTrigger value="pendientes">Pendientes</TabsTrigger>
          <TabsTrigger value="estadisticas">Estadísticas</TabsTrigger>
          <TabsTrigger value="configuracion">Configuración</TabsTrigger>
        </TabsList>

        <TabsContent value="acuerdos" className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Acuerdos</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{agreements.length}</div>
                <p className="text-xs text-muted-foreground">Acuerdos registrados</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Activos</CardTitle>
                <CheckCircle className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{activeAgreements}</div>
                <p className="text-xs text-muted-foreground">En vigencia</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pendientes</CardTitle>
                <Clock className="h-4 w-4 text-orange-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">{pendingAgreements}</div>
                <p className="text-xs text-muted-foreground">Por aprobar</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Ahorro Total</CardTitle>
                <TrendingUp className="h-4 w-4 text-purple-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-600">${totalSavings.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">Reducción mensual</p>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle>Filtros de Búsqueda</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Buscar por cliente o cédula..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Todos los estados" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los estados</SelectItem>
                    <SelectItem value="pending">Pendiente</SelectItem>
                    <SelectItem value="approved">Aprobado</SelectItem>
                    <SelectItem value="active">Activo</SelectItem>
                    <SelectItem value="completed">Completado</SelectItem>
                    <SelectItem value="rejected">Rechazado</SelectItem>
                    <SelectItem value="cancelled">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Agreements List */}
          <Card>
            <CardHeader>
              <CardTitle>Lista de Acuerdos ({filteredAgreements.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-gray-500">Cargando acuerdos...</div>
              ) : filteredAgreements.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <HandHeart className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No hay acuerdos de pago registrados</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredAgreements.map((agreement) => (
                    <div key={agreement.id} className="border rounded-lg p-4 hover:bg-gray-50">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <HandHeart className="h-5 w-5 text-blue-500" />
                            <h3 className="font-semibold text-lg">{agreement.client_name}</h3>
                            {getStatusBadge(agreement.status)}
                          </div>
                          
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600 mb-3">
                            <div>
                              <span className="font-medium">Cédula:</span> {agreement.client_dni}
                            </div>
                            <div>
                              <span className="font-medium">Teléfono:</span> {agreement.client_phone}
                            </div>
                            <div>
                              <span className="font-medium">Monto Préstamo:</span> ${agreement.loan_amount.toLocaleString()}
                            </div>
                            <div>
                              <span className="font-medium">Cuota Original:</span> ${agreement.original_payment.toLocaleString()}
                            </div>
                            <div>
                              <span className="font-medium">Cuota Acordada:</span> 
                              <span className="text-green-600 font-semibold"> ${agreement.agreed_payment_amount.toLocaleString()}</span>
                            </div>
                            <div>
                              <span className="font-medium">Ahorro:</span> 
                              <span className="text-purple-600 font-semibold"> ${(agreement.original_payment - agreement.agreed_payment_amount).toLocaleString()}</span>
                            </div>
                            <div>
                              <span className="font-medium">Frecuencia:</span> {getFrequencyLabel(agreement.payment_frequency)}
                            </div>
                            <div>
                              <span className="font-medium">Vigencia:</span> {new Date(agreement.start_date).toLocaleDateString()} - {new Date(agreement.end_date).toLocaleDateString()}
                            </div>
                          </div>

                          <div className="text-sm text-gray-600 mb-2">
                            <span className="font-medium">Razón:</span> {agreement.reason}
                          </div>
                          
                          {agreement.notes && (
                            <div className="text-sm text-gray-600 mb-2">
                              <span className="font-medium">Notas:</span> {agreement.notes}
                            </div>
                          )}

                          {agreement.approved_by && agreement.approved_at && (
                            <div className="text-xs text-gray-500">
                              Aprobado por {agreement.approved_by} el {new Date(agreement.approved_at).toLocaleDateString()}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {agreement.status === 'pending' && (
                            <>
                              <Button 
                                variant="outline" 
                                size="sm"
                                className="text-green-600 hover:bg-green-50"
                                onClick={() => updateStatus(agreement.id, 'approved')}
                              >
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm"
                                className="text-red-600 hover:bg-red-50"
                                onClick={() => updateStatus(agreement.id, 'rejected')}
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          
                          {agreement.status === 'approved' && (
                            <Button 
                              variant="outline" 
                              size="sm"
                              className="text-blue-600 hover:bg-blue-50"
                              onClick={() => updateStatus(agreement.id, 'active')}
                            >
                              Activar
                            </Button>
                          )}

                          {agreement.status === 'active' && (
                            <Button 
                              variant="outline" 
                              size="sm"
                              className="text-purple-600 hover:bg-purple-50"
                              onClick={() => updateStatus(agreement.id, 'completed')}
                            >
                              Completar
                            </Button>
                          )}
                          
                          <Button variant="outline" size="sm" onClick={() => handleEdit(agreement)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          
                          <Button variant="outline" size="sm" onClick={() => handleDelete(agreement.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pendientes" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <AlertCircle className="h-5 w-5 mr-2 text-orange-600" />
                Acuerdos Pendientes de Aprobación
              </CardTitle>
            </CardHeader>
            <CardContent>
              {agreements.filter(a => a.status === 'pending').length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No hay acuerdos pendientes de aprobación</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {agreements.filter(a => a.status === 'pending').map((agreement) => (
                    <div key={agreement.id} className="border border-orange-200 rounded-lg p-4 bg-orange-50">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold text-lg mb-2">{agreement.client_name}</h3>
                          <div className="grid grid-cols-2 gap-4 text-sm text-gray-600 mb-2">
                            <div>Cuota actual: ${agreement.original_payment.toLocaleString()}</div>
                            <div>Cuota propuesta: ${agreement.agreed_payment_amount.toLocaleString()}</div>
                            <div>Ahorro: ${(agreement.original_payment - agreement.agreed_payment_amount).toLocaleString()}</div>
                            <div>Período: {new Date(agreement.start_date).toLocaleDateString()} - {new Date(agreement.end_date).toLocaleDateString()}</div>
                          </div>
                          <div className="text-sm text-gray-600">
                            <span className="font-medium">Razón:</span> {agreement.reason}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button 
                            size="sm"
                            className="bg-green-600 hover:bg-green-700"
                            onClick={() => updateStatus(agreement.id, 'approved')}
                          >
                            Aprobar
                          </Button>
                          <Button 
                            variant="destructive"
                            size="sm"
                            onClick={() => updateStatus(agreement.id, 'rejected')}
                          >
                            Rechazar
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="estadisticas" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Resumen por Estado</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span>Acuerdos pendientes:</span>
                    <span className="font-semibold text-orange-600">{pendingAgreements}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Acuerdos activos:</span>
                    <span className="font-semibold text-green-600">{activeAgreements}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Acuerdos completados:</span>
                    <span className="font-semibold text-blue-600">{completedAgreements}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Acuerdos rechazados:</span>
                    <span className="font-semibold text-red-600">
                      {agreements.filter(a => a.status === 'rejected').length}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Análisis Financiero</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span>Ahorro total mensual:</span>
                    <span className="font-semibold text-purple-600">${totalSavings.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Promedio de reducción:</span>
                    <span className="font-semibold">
                      ${agreements.length > 0 ? Math.round(totalSavings / agreements.length).toLocaleString() : 0}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Tasa de aprobación:</span>
                    <span className="font-semibold">
                      {agreements.length > 0 ? Math.round(((activeAgreements + completedAgreements) / agreements.length) * 100) : 0}%
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="configuracion" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Configuración de Acuerdos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="max_reduction">Reducción Máxima Permitida (%)</Label>
                  <Input 
                    id="max_reduction"
                    type="number" 
                    defaultValue="50"
                    placeholder="Porcentaje máximo de reducción"
                  />
                </div>
                <div>
                  <Label htmlFor="max_duration">Duración Máxima (meses)</Label>
                  <Input 
                    id="max_duration"
                    type="number" 
                    defaultValue="12"
                    placeholder="Meses máximos para acuerdos"
                  />
                </div>
              </div>

              <div>
                <Label>Razones Predefinidas</Label>
                <div className="mt-2 space-y-2">
                  {[
                    'Dificultades económicas temporales',
                    'Pérdida de empleo',
                    'Emergencia médica',
                    'Reducción de ingresos',
                    'Emergencia familiar'
                  ].map((reason, index) => (
                    <div key={index} className="flex items-center justify-between p-2 border rounded">
                      <span className="text-sm">{reason}</span>
                      <Button size="sm" variant="outline">
                        <Edit className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button variant="outline" size="sm" className="mt-2">
                  <Plus className="h-3 w-3 mr-2" />
                  Agregar Razón
                </Button>
              </div>

              <div className="flex justify-end">
                <Button>Guardar Configuración</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingAgreement ? 'Editar Acuerdo' : 'Nuevo Acuerdo de Pago'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="loan_id">Préstamo *</Label>
              <Select value={formData.loan_id} onValueChange={(value) => setFormData({...formData, loan_id: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar préstamo" />
                </SelectTrigger>
                <SelectContent>
                  {loans.map((loan) => (
                    <SelectItem key={loan.id} value={loan.id}>
                      {loan.clients?.full_name} - ${loan.amount.toLocaleString()} (Cuota: ${loan.monthly_payment.toLocaleString()})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="agreed_payment_amount">Nueva Cuota Acordada *</Label>
                <Input
                  id="agreed_payment_amount"
                  type="number"
                  step="0.01"
                  value={formData.agreed_payment_amount}
                  onChange={(e) => setFormData({...formData, agreed_payment_amount: Number(e.target.value)})}
                  required
                />
              </div>

              <div>
                <Label htmlFor="payment_frequency">Frecuencia de Pago *</Label>
                <Select value={formData.payment_frequency} onValueChange={(value) => setFormData({...formData, payment_frequency: value})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Semanal</SelectItem>
                    <SelectItem value="biweekly">Quincenal</SelectItem>
                    <SelectItem value="monthly">Mensual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="start_date">Fecha de Inicio *</Label>
                <Input
                  id="start_date"
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({...formData, start_date: e.target.value})}
                  required
                />
              </div>
              <div>
                <Label htmlFor="end_date">Fecha de Fin *</Label>
                <Input
                  id="end_date"
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData({...formData, end_date: e.target.value})}
                  required
                />
              </div>
            </div>

            <div>
              <Label htmlFor="reason">Razón del Acuerdo *</Label>
              <Select value={formData.reason} onValueChange={(value) => setFormData({...formData, reason: value})}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar razón" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Dificultades económicas temporales">Dificultades económicas temporales</SelectItem>
                  <SelectItem value="Pérdida de empleo">Pérdida de empleo</SelectItem>
                  <SelectItem value="Emergencia médica">Emergencia médica</SelectItem>
                  <SelectItem value="Reducción de ingresos">Reducción de ingresos</SelectItem>
                  <SelectItem value="Emergencia familiar">Emergencia familiar</SelectItem>
                  <SelectItem value="Otro">Otro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="notes">Notas Adicionales</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                placeholder="Detalles adicionales sobre el acuerdo..."
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
              <Button type="submit">
                {editingAgreement ? 'Actualizar' : 'Crear'} Acuerdo
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};