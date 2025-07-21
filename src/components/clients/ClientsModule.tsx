
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, 
  Users, 
  Search, 
  Mail, 
  Phone, 
  MapPin,
  Calendar,
  DollarSign,
  Edit,
  Eye,
  UserCheck,
  UserX,
  Filter
} from 'lucide-react';

interface Client {
  id: string;
  full_name: string;
  email: string | null;
  phone: string;
  dni: string;
  address: string | null;
  city: string | null;
  monthly_income: number | null;
  credit_score: number | null;
  status: string;
  created_at: string;
}

export const ClientsModule = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const { user, companyId } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user && companyId) {
      fetchClients();
    }
  }, [user, companyId]);

  const fetchClients = async () => {
    if (!user || !companyId) {
      console.log('Missing user or companyId:', { user: !!user, companyId });
      return;
    }

    try {
      setLoading(true);
      
      console.log('Fetching clients for companyId:', companyId);
      
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('user_id', companyId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching clients:', error);
        toast.error('Error al cargar clientes: ' + error.message);
        return;
      }

      console.log('Fetched clients:', data);
      setClients(data || []);
    } catch (error) {
      console.error('Error fetching clients:', error);
      toast.error('Error al cargar clientes');
    } finally {
      setLoading(false);
    }
  };

  const toggleClientStatus = async (clientId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';

    try {
      const { error } = await supabase
        .from('clients')
        .update({ status: newStatus })
        .eq('id', clientId);

      if (error) throw error;

      setClients(prev => prev.map(client => 
        client.id === clientId 
          ? { ...client, status: newStatus }
          : client
      ));

      toast.success(`Cliente ${newStatus === 'active' ? 'activado' : 'desactivado'} exitosamente`);
    } catch (error) {
      console.error('Error updating client status:', error);
      toast.error('Error al actualizar estado del cliente');
    }
  };

  const filteredClients = clients.filter(client =>
    client.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    client.dni.includes(searchTerm) ||
    client.phone.includes(searchTerm) ||
    (client.email && client.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const activeClients = clients.filter(c => c.status === 'active').length;
  const totalIncome = clients
    .filter(c => c.status === 'active' && c.monthly_income)
    .reduce((sum, c) => sum + (c.monthly_income || 0), 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Gestión de Clientes</h1>
        <Button onClick={() => navigate('/clientes/nuevo')}>
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Cliente
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Clientes</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clients.length}</div>
            <p className="text-xs text-muted-foreground">
              {activeClients} activos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Clientes Activos</CardTitle>
            <UserCheck className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{activeClients}</div>
            <p className="text-xs text-muted-foreground">
              {clients.length - activeClients} inactivos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ingresos Totales</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalIncome.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Ingresos mensuales</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Score Promedio</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {clients.filter(c => c.credit_score).length > 0 
                ? Math.round(clients.filter(c => c.credit_score).reduce((sum, c) => sum + (c.credit_score || 0), 0) / clients.filter(c => c.credit_score).length)
                : 0}
            </div>
            <p className="text-xs text-muted-foreground">Score crediticio</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="lista" className="space-y-6">
        <TabsList>
          <TabsTrigger value="lista">Lista de Clientes</TabsTrigger>
          <TabsTrigger value="busqueda">Búsqueda Avanzada</TabsTrigger>
        </TabsList>

        <TabsContent value="lista" className="space-y-6">
          {/* Search */}
          <Card>
            <CardHeader>
              <CardTitle>Buscar Clientes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-2">
                <Search className="h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Buscar por nombre, cédula, teléfono o email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="max-w-sm"
                />
                <Button variant="outline">
                  <Filter className="h-4 w-4 mr-2" />
                  Filtros
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Clients List */}
          <Card>
            <CardHeader>
              <CardTitle>Clientes ({filteredClients.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <p className="text-gray-500">Cargando clientes...</p>
                </div>
              ) : filteredClients.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>
                    {searchTerm ? 'No se encontraron clientes con ese criterio de búsqueda' : 'No hay clientes registrados'}
                  </p>
                  <Button className="mt-4" onClick={() => navigate('/clientes/nuevo')}>
                    <Plus className="h-4 w-4 mr-2" />
                    Crear Primer Cliente
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredClients.map((client) => (
                    <div key={client.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold text-lg">{client.full_name}</h3>
                            <Badge variant={client.status === 'active' ? 'default' : 'secondary'}>
                              {client.status === 'active' ? 'Activo' : 'Inactivo'}
                            </Badge>
                          </div>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm text-gray-600">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">Cédula:</span>
                              <span>{client.dni}</span>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <Phone className="h-4 w-4" />
                              <span>{client.phone}</span>
                            </div>
                            
                            {client.email && (
                              <div className="flex items-center gap-2">
                                <Mail className="h-4 w-4" />
                                <span>{client.email}</span>
                              </div>
                            )}
                            
                            {client.city && (
                              <div className="flex items-center gap-2">
                                <MapPin className="h-4 w-4" />
                                <span>{client.city}</span>
                              </div>
                            )}
                            
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4" />
                              <span>Desde: {new Date(client.created_at).toLocaleDateString()}</span>
                            </div>
                            
                            {client.monthly_income && (
                              <div className="flex items-center gap-2">
                                <DollarSign className="h-4 w-4" />
                                <span>${client.monthly_income.toLocaleString()}</span>
                              </div>
                            )}

                            {client.credit_score && (
                              <div className="flex items-center gap-2">
                                <span className="font-medium">Score:</span>
                                <span className={client.credit_score >= 700 ? 'text-green-600' : client.credit_score >= 600 ? 'text-yellow-600' : 'text-red-600'}>
                                  {client.credit_score}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => toggleClientStatus(client.id, client.status)}
                          >
                            {client.status === 'active' ? (
                              <UserX className="h-4 w-4" />
                            ) : (
                              <UserCheck className="h-4 w-4" />
                            )}
                          </Button>
                          
                          <Button variant="outline" size="sm" onClick={() => setSelectedClient(client)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          
                          <Button variant="outline" size="sm" onClick={() => navigate(`/clientes/editar/${client.id}`)}>
                            <Edit className="h-4 w-4" />
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

        <TabsContent value="busqueda">
          <Card>
            <CardHeader>
              <CardTitle>Búsqueda Avanzada</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-gray-500">
                <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Funcionalidad de búsqueda avanzada en desarrollo</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Client Details Dialog */}
      {selectedClient && (
        <Dialog open={!!selectedClient} onOpenChange={() => setSelectedClient(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Detalles del Cliente</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Nombre Completo</label>
                  <p className="text-lg font-semibold">{selectedClient.full_name}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Cédula</label>
                  <p className="text-lg">{selectedClient.dni}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Teléfono</label>
                  <p className="text-lg">{selectedClient.phone}</p>
                </div>
                {selectedClient.email && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">Email</label>
                    <p className="text-lg">{selectedClient.email}</p>
                  </div>
                )}
                {selectedClient.monthly_income && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">Ingresos Mensuales</label>
                    <p className="text-lg">${selectedClient.monthly_income.toLocaleString()}</p>
                  </div>
                )}
                {selectedClient.credit_score && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">Score Crediticio</label>
                    <p className="text-lg">{selectedClient.credit_score}</p>
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};
