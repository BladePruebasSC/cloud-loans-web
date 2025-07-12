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
  Filter
} from 'lucide-react';

interface PaymentAgreement {
  id: string;
  loan_id: string;
  client_name: string;
  client_dni: string;
  loan_amount: number;
  agreed_payment_amount: number;
  payment_frequency: string;
  start_date: string;
  end_date: string;
  status: string;
  notes: string | null;
  created_at: string;
  loans?: {
    id: string;
    amount: number;
    remaining_balance: number;
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
  const { user } = useAuth();

  const [formData, setFormData] = useState({
    loan_id: '',
    agreed_payment_amount: 0,
    payment_frequency: 'weekly',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
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
      
      // Simulamos datos de acuerdos de pago
      // En una implementación real, estos se almacenarían en una tabla específica
      const mockAgreements: PaymentAgreement[] = [
        {
          id: '1',
          loan_id: 'loan-1',
          client_name: 'Juan Pérez',
          client_dni: '001-1234567-8',
          loan_amount: 50000,
          agreed_payment_amount: 2500,
          payment_frequency: 'weekly',
          start_date: '2024-01-15',
          end_date: '2024-12-15',
          status: 'active',
          notes: 'Acuerdo especial por situación económica',
          created_at: '2024-01-10T10:00:00Z'
        },
        {
          id: '2',
          loan_id: 'loan-2',
          client_name: 'María González',
          client_dni: '001-2345678-9',
          loan_amount: 75000,
          agreed_payment_amount: 5000,
          payment_frequency: 'monthly',
          start_date: '2024-02-01',
          end_date: '2024-12-31',
          status: 'pending',
          notes: null,
          created_at: '2024-01-28T14:30:00Z'
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
          clients (
            full_name,
            dni,
            phone
          )
        `)
        .eq('status', 'active');

      if (error) throw error;
      setLoans(data || []);
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
        loan_amount: selectedLoan.amount,
        agreed_payment_amount: formData.agreed_payment_amount,
        payment_frequency: formData.payment_frequency,
        start_date: formData.start_date,
        end_date: formData.end_date,
        status: 'pending',
        notes: formData.notes || null,
        created_at: new Date().toISOString()
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
      agreement.id === id ? { ...agreement, status } : agreement
    ));
    toast.success('Estado actualizado exitosamente');
  };

  const resetForm = () => {
    setFormData({
      loan_id: '',
      agreed_payment_amount: 0,
      payment_frequency: 'weekly',
      start_date: new Date().toISOString().split('T')[0],
      end_date: '',
      notes: ''
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800">Activo</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800">Pendiente</Badge>;
      case 'completed':
        return <Badge className="bg-blue-100 text-blue-800">Completado</Badge>;
      case 'cancelled':
        return <Badge variant="destructive">Cancelado</Badge>;
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
  const totalAmount = agreements.reduce((sum, a) => sum + a.agreed_payment_amount, 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Acuerdos de Pago</h1>
        <Button onClick={() => {
          setShowForm(true);
          setEditingAgreement(null);
          resetForm();
        }}>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Acuerdo
        </Button>
      </div>

      <Tabs defaultValue="acuerdos">
        <TabsList>
          <TabsTrigger value="acuerdos">Lista de Acuerdos</TabsTrigger>
          <TabsTrigger value="estadisticas">Estadísticas</TabsTrigger>
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
                <CardTitle className="text-sm font-medium">Monto Total</CardTitle>
                <DollarSign className="h-4 w-4 text-purple-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-600">${totalAmount.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">Pagos acordados</p>
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
                    <SelectItem value="active">Activo</SelectItem>
                    <SelectItem value="pending">Pendiente</SelectItem>
                    <SelectItem value="completed">Completado</SelectItem>
                    <SelectItem value="cancelled">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Agreements List */}
          <Card>
            <CardHeader>
              <CardTitle>Acuerdos de Pago ({filteredAgreements.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">Cargando acuerdos...</div>
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
                          
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600">
                            <div>
                              <span className="font-medium">Cédula:</span> {agreement.client_dni}
                            </div>
                            <div>
                              <span className="font-medium">Monto Préstamo:</span> ${agreement.loan_amount.toLocaleString()}
                            </div>
                            <div>
                              <span className="font-medium">Pago Acordado:</span> ${agreement.agreed_payment_amount.toLocaleString()}
                            </div>
                            <div>
                              <span className="font-medium">Frecuencia:</span> {getFrequencyLabel(agreement.payment_frequency)}
                            </div>
                            <div>
                              <span className="font-medium">Inicio:</span> {new Date(agreement.start_date).toLocaleDateString()}
                            </div>
                            <div>
                              <span className="font-medium">Fin:</span> {new Date(agreement.end_date).toLocaleDateString()}
                            </div>
                            <div>
                              <span className="font-medium">Creado:</span> {new Date(agreement.created_at).toLocaleDateString()}
                            </div>
                          </div>
                          
                          {agreement.notes && (
                            <div className="mt-2">
                              <span className="text-sm font-medium text-gray-600">Notas:</span>
                              <p className="text-sm text-gray-600">{agreement.notes}</p>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <Select 
                            value={agreement.status} 
                            onValueChange={(value) => updateStatus(agreement.id, value)}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">Pendiente</SelectItem>
                              <SelectItem value="active">Activo</SelectItem>
                              <SelectItem value="completed">Completado</SelectItem>
                              <SelectItem value="cancelled">Cancelado</SelectItem>
                            </SelectContent>
                          </Select>
                          
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

        <TabsContent value="estadisticas">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Resumen por Estado</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span>Acuerdos activos:</span>
                    <span className="font-semibold text-green-600">{activeAgreements}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Acuerdos pendientes:</span>
                    <span className="font-semibold text-orange-600">{pendingAgreements}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Acuerdos completados:</span>
                    <span className="font-semibold text-blue-600">
                      {agreements.filter(a => a.status === 'completed').length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Acuerdos cancelados:</span>
                    <span className="font-semibold text-red-600">
                      {agreements.filter(a => a.status === 'cancelled').length}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Análisis de Frecuencias</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span>Pagos semanales:</span>
                    <span className="font-semibold">
                      {agreements.filter(a => a.payment_frequency === 'weekly').length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Pagos quincenales:</span>
                    <span className="font-semibold">
                      {agreements.filter(a => a.payment_frequency === 'biweekly').length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Pagos mensuales:</span>
                    <span className="font-semibold">
                      {agreements.filter(a => a.payment_frequency === 'monthly').length}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Form Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
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
                      {loan.clients?.full_name} - ${loan.amount.toLocaleString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="agreed_payment_amount">Monto del Pago Acordado *</Label>
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
              <Label htmlFor="notes">Notas</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                placeholder="Notas adicionales sobre el acuerdo..."
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