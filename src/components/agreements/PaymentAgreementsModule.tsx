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
  client_id: string;
  amount: number;
  remaining_balance: number;
  monthly_payment: number;
  clients?: {
    id: string;
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
      
      const { data, error } = await supabase
        .from('payment_agreements')
        .select(`
          *,
          loans (
            id,
            amount,
            remaining_balance,
            monthly_payment,
            clients (
              full_name,
              dni,
              phone
            )
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Transformar los datos para que coincidan con la interfaz
      const transformedAgreements: PaymentAgreement[] = (data || []).map((agreement: any) => ({
        id: agreement.id,
        loan_id: agreement.loan_id,
        client_name: agreement.loans?.clients?.full_name || 'N/A',
        client_dni: agreement.loans?.clients?.dni || 'N/A',
        client_phone: agreement.loans?.clients?.phone || 'N/A',
        loan_amount: agreement.loans?.amount || 0,
        original_payment: agreement.original_amount || agreement.loans?.monthly_payment || 0,
        agreed_payment_amount: agreement.agreed_amount || 0,
        payment_frequency: agreement.payment_frequency || 'monthly',
        start_date: agreement.start_date,
        end_date: agreement.end_date || '',
        status: agreement.status || 'pending',
        reason: agreement.reason || '',
        notes: agreement.notes || null,
        created_at: agreement.created_at,
        approved_by: agreement.approved_by,
        approved_at: agreement.approved_at,
        loans: agreement.loans
      }));

      setAgreements(transformedAgreements);
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
          client_id,
          amount,
          remaining_balance,
          monthly_payment,
          clients (
            id,
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

      if (!user) {
        toast.error('Usuario no autenticado');
        return;
      }

      const agreementData = {
        loan_id: formData.loan_id,
        client_id: selectedLoan.client_id,
        agreed_amount: formData.agreed_payment_amount,
        original_amount: selectedLoan.monthly_payment,
        payment_frequency: formData.payment_frequency,
        start_date: formData.start_date,
        end_date: formData.end_date || null,
        status: 'pending',
        reason: formData.reason || null,
        notes: formData.notes || null,
        user_id: user.id
      };

      if (editingAgreement) {
        // Actualizar acuerdo existente
        const { data, error } = await supabase
          .from('payment_agreements')
          .update({
            agreed_amount: formData.agreed_payment_amount,
            original_amount: selectedLoan.monthly_payment,
            payment_frequency: formData.payment_frequency,
            start_date: formData.start_date,
            end_date: formData.end_date || null,
            reason: formData.reason || null,
            notes: formData.notes || null,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingAgreement.id)
          .select()
          .single();

        if (error) throw error;
        toast.success('Acuerdo actualizado exitosamente');
      } else {
        // Crear nuevo acuerdo
        const { data, error } = await supabase
          .from('payment_agreements')
          .insert([agreementData])
          .select()
          .single();

        if (error) throw error;
        toast.success('Acuerdo creado exitosamente');
      }

      setShowForm(false);
      setEditingAgreement(null);
      resetForm();
      fetchAgreements(); // Recargar acuerdos desde la base de datos
    } catch (error: any) {
      console.error('Error saving agreement:', error);
      toast.error(`Error al guardar acuerdo: ${error.message || 'Error desconocido'}`);
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
    
    try {
      const { error } = await supabase
        .from('payment_agreements')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Acuerdo eliminado exitosamente');
      fetchAgreements(); // Recargar acuerdos desde la base de datos
    } catch (error: any) {
      console.error('Error deleting agreement:', error);
      toast.error(`Error al eliminar acuerdo: ${error.message || 'Error desconocido'}`);
    }
  };

  const updateStatus = async (id: string, newStatus: string) => {
    try {
      if (!user) {
        toast.error('Usuario no autenticado');
        return;
      }

      const updateData: any = {
        status: newStatus,
        updated_at: new Date().toISOString()
      };

      if (newStatus === 'approved' || newStatus === 'active') {
        updateData.approved_by = user.id;
        updateData.approved_at = new Date().toISOString();
      } else if (newStatus === 'rejected' || newStatus === 'cancelled') {
        updateData.approved_by = null;
        updateData.approved_at = null;
      }

      const { error } = await supabase
        .from('payment_agreements')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;

      toast.success(`Acuerdo ${newStatus === 'approved' ? 'aprobado' : newStatus === 'active' ? 'activado' : newStatus === 'rejected' ? 'rechazado' : 'actualizado'} exitosamente`);
      fetchAgreements(); // Recargar acuerdos desde la base de datos
    } catch (error: any) {
      console.error('Error updating status:', error);
      toast.error(`Error al actualizar estado: ${error.message || 'Error desconocido'}`);
    }
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
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Acuerdos de Pago</h1>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <Button variant="outline" className="w-full sm:w-auto">
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
          <Button onClick={() => {
            setShowForm(true);
            setEditingAgreement(null);
            resetForm();
          }} className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Acuerdo
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 gap-1 sm:gap-2">
          <TabsTrigger value="acuerdos" className="text-xs sm:text-sm">Acuerdos</TabsTrigger>
          <TabsTrigger value="pendientes" className="text-xs sm:text-sm">Pendientes</TabsTrigger>
          <TabsTrigger value="estadisticas" className="text-xs sm:text-sm">Estadísticas</TabsTrigger>
          <TabsTrigger value="configuracion" className="text-xs sm:text-sm">Configuración</TabsTrigger>
        </TabsList>

        <TabsContent value="acuerdos" className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
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
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Buscar por cliente o cédula..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 text-sm"
                    />
                  </div>
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-48 text-sm">
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
                          
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4 text-sm text-gray-600 mb-3">
                            <div className="flex flex-col sm:flex-row sm:items-center">
                              <span className="font-medium text-xs sm:text-sm">Cédula:</span> 
                              <span className="text-xs sm:text-sm">{agreement.client_dni}</span>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center">
                              <span className="font-medium text-xs sm:text-sm">Teléfono:</span> 
                              <span className="text-xs sm:text-sm">{agreement.client_phone}</span>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center">
                              <span className="font-medium text-xs sm:text-sm">Monto Préstamo:</span> 
                              <span className="text-xs sm:text-sm">${agreement.loan_amount.toLocaleString()}</span>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center">
                              <span className="font-medium text-xs sm:text-sm">Cuota Original:</span> 
                              <span className="text-xs sm:text-sm">${agreement.original_payment.toLocaleString()}</span>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center">
                              <span className="font-medium text-xs sm:text-sm">Cuota Acordada:</span> 
                              <span className="text-xs sm:text-sm text-green-600 font-semibold"> ${agreement.agreed_payment_amount.toLocaleString()}</span>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center">
                              <span className="font-medium text-xs sm:text-sm">Ahorro:</span> 
                              <span className="text-xs sm:text-sm text-purple-600 font-semibold"> ${(agreement.original_payment - agreement.agreed_payment_amount).toLocaleString()}</span>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center">
                              <span className="font-medium text-xs sm:text-sm">Frecuencia:</span> 
                              <span className="text-xs sm:text-sm">{getFrequencyLabel(agreement.payment_frequency)}</span>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center">
                              <span className="font-medium text-xs sm:text-sm">Vigencia:</span> 
                              <span className="text-xs sm:text-sm">{new Date(agreement.start_date).toLocaleDateString()} - {new Date(agreement.end_date).toLocaleDateString()}</span>
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

                        <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-2 mt-2 sm:mt-0">
                          {agreement.status === 'pending' && (
                            <>
                              <Button 
                                variant="outline" 
                                size="sm"
                                className="text-green-600 hover:bg-green-50 w-full sm:w-auto text-xs"
                                onClick={() => updateStatus(agreement.id, 'approved')}
                              >
                                <CheckCircle className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-0" />
                                <span className="sm:hidden">Aprobar</span>
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm"
                                className="text-red-600 hover:bg-red-50 w-full sm:w-auto text-xs"
                                onClick={() => updateStatus(agreement.id, 'rejected')}
                              >
                                <XCircle className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-0" />
                                <span className="sm:hidden">Rechazar</span>
                              </Button>
                            </>
                          )}
                          
                          {agreement.status === 'approved' && (
                            <Button 
                              variant="outline" 
                              size="sm"
                              className="text-blue-600 hover:bg-blue-50 w-full sm:w-auto text-xs"
                              onClick={() => updateStatus(agreement.id, 'active')}
                            >
                              <span className="sm:hidden">Activar</span>
                              <span className="hidden sm:inline">Activar</span>
                            </Button>
                          )}

                          {agreement.status === 'active' && (
                            <Button 
                              variant="outline" 
                              size="sm"
                              className="text-purple-600 hover:bg-purple-50 w-full sm:w-auto text-xs"
                              onClick={() => updateStatus(agreement.id, 'completed')}
                            >
                              <span className="sm:hidden">Completar</span>
                              <span className="hidden sm:inline">Completar</span>
                            </Button>
                          )}
                          
                          <Button variant="outline" size="sm" onClick={() => handleEdit(agreement)} className="w-full sm:w-auto text-xs">
                            <Edit className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-0" />
                            <span className="sm:hidden">Editar</span>
                          </Button>
                          
                          <Button variant="outline" size="sm" onClick={() => handleDelete(agreement.id)} className="w-full sm:w-auto text-xs">
                            <Trash2 className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-0" />
                            <span className="sm:hidden">Eliminar</span>
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
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 text-sm text-gray-600 mb-2">
                            <div className="flex flex-col sm:flex-row sm:items-center">
                              <span className="font-medium text-xs sm:text-sm">Cuota actual:</span> 
                              <span className="text-xs sm:text-sm">${agreement.original_payment.toLocaleString()}</span>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center">
                              <span className="font-medium text-xs sm:text-sm">Cuota propuesta:</span> 
                              <span className="text-xs sm:text-sm">${agreement.agreed_payment_amount.toLocaleString()}</span>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center">
                              <span className="font-medium text-xs sm:text-sm">Ahorro:</span> 
                              <span className="text-xs sm:text-sm">${(agreement.original_payment - agreement.agreed_payment_amount).toLocaleString()}</span>
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center">
                              <span className="font-medium text-xs sm:text-sm">Período:</span> 
                              <span className="text-xs sm:text-sm">{new Date(agreement.start_date).toLocaleDateString()} - {new Date(agreement.end_date).toLocaleDateString()}</span>
                            </div>
                          </div>
                          <div className="text-sm text-gray-600">
                            <span className="font-medium">Razón:</span> {agreement.reason}
                          </div>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-1 sm:gap-2 mt-2 sm:mt-0">
                          <Button 
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 w-full sm:w-auto text-xs"
                            onClick={() => updateStatus(agreement.id, 'approved')}
                          >
                            Aprobar
                          </Button>
                          <Button 
                            variant="destructive"
                            size="sm"
                            className="w-full sm:w-auto text-xs"
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                <div>
                  <Label htmlFor="max_reduction">Reducción Máxima Permitida (%)</Label>
                  <Input 
                    id="max_reduction"
                    type="number" 
                    defaultValue="50"
                    placeholder="Porcentaje máximo de reducción"
                    className="text-sm"
                  />
                </div>
                <div>
                  <Label htmlFor="max_duration">Duración Máxima (meses)</Label>
                  <Input 
                    id="max_duration"
                    type="number" 
                    defaultValue="12"
                    placeholder="Meses máximos para acuerdos"
                    className="text-sm"
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
                      <span className="text-xs sm:text-sm">{reason}</span>
                      <Button size="sm" variant="outline" className="text-xs">
                        <Edit className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
                <Button variant="outline" size="sm" className="mt-2 text-xs">
                  <Plus className="h-3 w-3 mr-1 sm:mr-2" />
                  Agregar Razón
                </Button>
              </div>

              <div className="flex justify-end">
                <Button className="text-sm">Guardar Configuración</Button>
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
              <Label htmlFor="loan_id" className="text-sm">Préstamo *</Label>
              <Select value={formData.loan_id} onValueChange={(value) => setFormData({...formData, loan_id: value})}>
                <SelectTrigger className="text-sm">
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <Label htmlFor="agreed_payment_amount" className="text-sm">Nueva Cuota Acordada *</Label>
                <Input
                  id="agreed_payment_amount"
                  type="number"
                  step="0.01"
                  value={formData.agreed_payment_amount}
                  onChange={(e) => setFormData({...formData, agreed_payment_amount: Number(e.target.value)})}
                  required
                  className="text-sm"
                />
              </div>

              <div>
                <Label htmlFor="payment_frequency" className="text-sm">Frecuencia de Pago *</Label>
                <Select value={formData.payment_frequency} onValueChange={(value) => setFormData({...formData, payment_frequency: value})}>
                  <SelectTrigger className="text-sm">
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <Label htmlFor="start_date" className="text-sm">Fecha de Inicio *</Label>
                <Input
                  id="start_date"
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => setFormData({...formData, start_date: e.target.value})}
                  required
                  className="text-sm"
                />
              </div>
              <div>
                <Label htmlFor="end_date" className="text-sm">Fecha de Fin *</Label>
                <Input
                  id="end_date"
                  type="date"
                  value={formData.end_date}
                  onChange={(e) => setFormData({...formData, end_date: e.target.value})}
                  required
                  className="text-sm"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="reason" className="text-sm">Razón del Acuerdo *</Label>
              <Select value={formData.reason} onValueChange={(value) => setFormData({...formData, reason: value})}>
                <SelectTrigger className="text-sm">
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
              <Label htmlFor="notes" className="text-sm">Notas Adicionales</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                placeholder="Detalles adicionales sobre el acuerdo..."
                className="text-sm"
              />
            </div>

            <div className="flex flex-col sm:flex-row justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)} className="w-full sm:w-auto text-sm">
                Cancelar
              </Button>
              <Button type="submit" className="w-full sm:w-auto text-sm">
                {editingAgreement ? 'Actualizar' : 'Crear'} Acuerdo
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};