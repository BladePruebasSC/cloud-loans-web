
import React, { useState, useEffect } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
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
  Clock, 
  Plus, 
  Calendar, 
  Users, 
  CheckCircle,
  XCircle,
  AlertCircle,
  User,
  MapPin,
  Edit,
  Trash2
} from 'lucide-react';

interface Appointment {
  id: string;
  user_id: string;
  client_id: string | null;
  appointment_date: string;
  appointment_time: string;
  type: string;
  title: string;
  description: string | null;
  location: string | null;
  status: string;
  duration_minutes: number;
  reminder_sent: boolean;
  created_at: string;
  updated_at: string;
  clients?: {
    id: string;
    full_name: string;
    phone: string;
  };
}

interface Client {
  id: string;
  full_name: string;
  dni: string;
  phone: string;
}

const ShiftsModule = () => {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('agenda');
  const [showAppointmentForm, setShowAppointmentForm] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const { user } = useAuth();

  const [appointmentForm, setAppointmentForm] = useState({
    client_id: '',
    appointment_date: new Date().toISOString().split('T')[0],
    appointment_time: '09:00',
    type: 'meeting',
    title: '',
    description: '',
    location: '',
    duration_minutes: 60
  });

  useEffect(() => {
    if (user) {
      fetchAppointments();
      fetchClients();
    }
  }, [user]);

  // Leer parámetros de URL y prellenar formulario si vienen de un préstamo
  useEffect(() => {
    const dateParam = searchParams.get('date');
    const loanIdParam = searchParams.get('loan_id');
    const clientIdParam = searchParams.get('client_id');

    if ((dateParam || loanIdParam || clientIdParam) && clients.length > 0) {
      // Buscar cliente por DNI si viene client_id
      if (clientIdParam) {
        const client = clients.find(c => c.dni === clientIdParam);
        if (client) {
          setAppointmentForm(prev => ({
            ...prev,
            client_id: client.id,
            appointment_date: dateParam || prev.appointment_date,
            type: 'collection',
            title: `Cobro de préstamo${loanIdParam ? ` #${loanIdParam}` : ''}`,
            description: loanIdParam ? `Cita para cobro del préstamo ${loanIdParam}` : 'Cita para cobro de préstamo'
          }));
          setActiveTab('agenda');
          setShowAppointmentForm(true);
        }
      } else if (dateParam) {
        setAppointmentForm(prev => ({
          ...prev,
          appointment_date: dateParam
        }));
      }
    }
  }, [searchParams, clients]);

  const fetchAppointments = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          *,
          clients (
            id,
            full_name,
            phone
          )
        `)
        .order('appointment_date', { ascending: true })
        .order('appointment_time', { ascending: true });

      if (error) throw error;
      setAppointments(data || []);
    } catch (error) {
      console.error('Error fetching appointments:', error);
      toast.error('Error al cargar citas');
    } finally {
      setLoading(false);
    }
  };

  const fetchClients = async () => {
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('id, full_name, dni, phone')
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
      const appointmentData = {
        ...appointmentForm,
        user_id: user.id,
        status: 'scheduled'
      };

      if (editingAppointment) {
        const { error } = await supabase
          .from('appointments')
          .update(appointmentData)
          .eq('id', editingAppointment.id);

        if (error) throw error;
        toast.success('Cita actualizada exitosamente');
      } else {
        const { error } = await supabase
          .from('appointments')
          .insert([appointmentData]);

        if (error) throw error;
        toast.success('Cita programada exitosamente');
      }

      setShowAppointmentForm(false);
      setEditingAppointment(null);
      resetForm();
      fetchAppointments();
    } catch (error) {
      console.error('Error saving appointment:', error);
      toast.error('Error al guardar cita');
    }
  };

  const updateAppointmentStatus = async (appointmentId: string, status: string) => {
    try {
      const { error } = await supabase
        .from('appointments')
        .update({ status })
        .eq('id', appointmentId);

      if (error) throw error;

      toast.success(`Cita ${status === 'confirmed' ? 'confirmada' : status === 'completed' ? 'completada' : 'cancelada'} exitosamente`);
      fetchAppointments();
    } catch (error) {
      console.error('Error updating appointment:', error);
      toast.error('Error al actualizar cita');
    }
  };

  const deleteAppointment = async (appointmentId: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar esta cita?')) return;

    try {
      const { error } = await supabase
        .from('appointments')
        .delete()
        .eq('id', appointmentId);

      if (error) throw error;

      toast.success('Cita eliminada exitosamente');
      fetchAppointments();
    } catch (error) {
      console.error('Error deleting appointment:', error);
      toast.error('Error al eliminar cita');
    }
  };

  const resetForm = () => {
    setAppointmentForm({
      client_id: '',
      appointment_date: new Date().toISOString().split('T')[0],
      appointment_time: '09:00',
      type: 'meeting',
      title: '',
      description: '',
      location: '',
      duration_minutes: 60
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'scheduled':
        return <Badge variant="secondary" className="bg-blue-100 text-blue-800">Programada</Badge>;
      case 'confirmed':
        return <Badge variant="default" className="bg-green-100 text-green-800">Confirmada</Badge>;
      case 'completed':
        return <Badge variant="default" className="bg-purple-100 text-purple-800">Completada</Badge>;
      case 'cancelled':
        return <Badge variant="destructive">Cancelada</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const todayAppointments = appointments.filter(apt => 
    apt.appointment_date === new Date().toISOString().split('T')[0]
  );
  const confirmedAppointments = todayAppointments.filter(apt => apt.status === 'confirmed');
  const pendingAppointments = todayAppointments.filter(apt => apt.status === 'scheduled');
  const cancelledAppointments = todayAppointments.filter(apt => apt.status === 'cancelled');

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Gestión de Turnos</h1>
        <Button onClick={() => setShowAppointmentForm(true)} className="w-full sm:w-auto">
          <Plus className="h-4 w-4 mr-2" />
          Nuevo Turno
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 gap-1 sm:gap-2">
          <TabsTrigger value="agenda" className="text-xs sm:text-sm">Agenda</TabsTrigger>
          <TabsTrigger value="empleados" className="text-xs sm:text-sm">Empleados</TabsTrigger>
          <TabsTrigger value="horarios" className="text-xs sm:text-sm">Horarios</TabsTrigger>
          <TabsTrigger value="reportes">Reportes</TabsTrigger>
        </TabsList>

        <TabsContent value="agenda" className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Turnos Hoy</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{todayAppointments.length}</div>
                <p className="text-xs text-muted-foreground">Programados</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Confirmados</CardTitle>
                <CheckCircle className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{confirmedAppointments.length}</div>
                <p className="text-xs text-muted-foreground">Asistirán</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pendientes</CardTitle>
                <AlertCircle className="h-4 w-4 text-orange-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">{pendingAppointments.length}</div>
                <p className="text-xs text-muted-foreference">Sin confirmar</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Cancelados</CardTitle>
                <XCircle className="h-4 w-4 text-red-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{cancelledAppointments.length}</div>
                <p className="text-xs text-muted-foreground">Hoy</p>
              </CardContent>
            </Card>
          </div>

          {/* Appointments List */}
          <Card>
            <CardHeader>
              <CardTitle>Turnos Programados</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">Cargando turnos...</div>
              ) : appointments.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No hay turnos programados</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {appointments.map((appointment) => (
                    <div key={appointment.id} className="border rounded-lg p-4 hover:bg-gray-50">
                      <div className="flex justify-between items-start">
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center space-x-3">
                            <Clock className="h-4 w-4 text-gray-500" />
                            <span className="font-medium">
                              {new Date(appointment.appointment_date).toLocaleDateString()} - {appointment.appointment_time}
                            </span>
                            {getStatusBadge(appointment.status)}
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
                            <div className="flex items-center">
                              <User className="h-3 w-3 mr-1" />
                              {appointment.clients?.full_name || 'Cliente no especificado'}
                            </div>
                            <div>{appointment.title}</div>
                            <div className="flex items-center">
                              <MapPin className="h-3 w-3 mr-1" />
                              {appointment.location || 'Oficina'}
                            </div>
                          </div>
                          {appointment.description && (
                            <p className="text-sm text-gray-600">
                              <strong>Descripción:</strong> {appointment.description}
                            </p>
                          )}
                        </div>
                        <div className="flex space-x-2 ml-4">
                          {appointment.status === 'scheduled' && (
                            <Button 
                              size="sm" 
                              variant="outline"
                              className="text-green-600 hover:bg-green-50"
                              onClick={() => updateAppointmentStatus(appointment.id, 'confirmed')}
                            >
                              Confirmar
                            </Button>
                          )}
                          {appointment.status === 'confirmed' && (
                            <Button 
                              size="sm"
                              onClick={() => updateAppointmentStatus(appointment.id, 'completed')}
                            >
                              Completar
                            </Button>
                          )}
                          <Button size="sm" variant="outline" onClick={() => {
                            setEditingAppointment(appointment);
                            setAppointmentForm({
                              client_id: appointment.client_id || '',
                              appointment_date: appointment.appointment_date,
                              appointment_time: appointment.appointment_time,
                              type: appointment.type,
                              title: appointment.title,
                              description: appointment.description || '',
                              location: appointment.location || '',
                              duration_minutes: appointment.duration_minutes
                            });
                            setShowAppointmentForm(true);
                          }}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => deleteAppointment(appointment.id)}>
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

        <TabsContent value="empleados" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Gestión de Empleados</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-gray-500">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Funcionalidad de empleados en desarrollo</p>
                <p className="text-sm">Próximamente podrás gestionar empleados y asignar turnos</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="horarios" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Configuración de Horarios</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-gray-500">
                <Clock className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Configuración de horarios en desarrollo</p>
                <p className="text-sm">Próximamente podrás configurar horarios de atención</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reportes" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Esta Semana</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{appointments.length}</div>
                <p className="text-sm text-gray-600">Turnos programados</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Confirmados</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {appointments.filter(apt => apt.status === 'confirmed').length}
                </div>
                <p className="text-sm text-gray-600">
                  {appointments.length > 0 
                    ? Math.round((appointments.filter(apt => apt.status === 'confirmed').length / appointments.length) * 100)
                    : 0}% de confirmación
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Completados</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-600">
                  {appointments.filter(apt => apt.status === 'completed').length}
                </div>
                <p className="text-sm text-gray-600">
                  {appointments.length > 0 
                    ? Math.round((appointments.filter(apt => apt.status === 'completed').length / appointments.length) * 100)
                    : 0}% completados
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Appointment Form Dialog */}
      <Dialog open={showAppointmentForm} onOpenChange={setShowAppointmentForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingAppointment ? 'Editar Turno' : 'Programar Nuevo Turno'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="client_id">Cliente</Label>
              <Select value={appointmentForm.client_id} onValueChange={(value) => setAppointmentForm({...appointmentForm, client_id: value})}>
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

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="appointment_date">Fecha *</Label>
                <Input
                  id="appointment_date"
                  type="date"
                  value={appointmentForm.appointment_date}
                  onChange={(e) => setAppointmentForm({...appointmentForm, appointment_date: e.target.value})}
                  required
                />
              </div>
              <div>
                <Label htmlFor="appointment_time">Hora *</Label>
                <Input
                  id="appointment_time"
                  type="time"
                  value={appointmentForm.appointment_time}
                  onChange={(e) => setAppointmentForm({...appointmentForm, appointment_time: e.target.value})}
                  required
                />
              </div>
            </div>

            <div>
              <Label htmlFor="title">Título *</Label>
              <Input
                id="title"
                value={appointmentForm.title}
                onChange={(e) => setAppointmentForm({...appointmentForm, title: e.target.value})}
                placeholder="Ej: Reunión de seguimiento"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="type">Tipo</Label>
                <Select value={appointmentForm.type} onValueChange={(value) => setAppointmentForm({...appointmentForm, type: value})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="meeting">Reunión</SelectItem>
                    <SelectItem value="payment">Cobro de Cuota</SelectItem>
                    <SelectItem value="consultation">Consulta</SelectItem>
                    <SelectItem value="new_loan">Nuevo Préstamo</SelectItem>
                    <SelectItem value="documentation">Documentación</SelectItem>
                    <SelectItem value="other">Otros</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="duration_minutes">Duración (min)</Label>
                <Input
                  id="duration_minutes"
                  type="number"
                  value={appointmentForm.duration_minutes}
                  onChange={(e) => setAppointmentForm({...appointmentForm, duration_minutes: Number(e.target.value)})}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="location">Ubicación</Label>
              <Input
                id="location"
                value={appointmentForm.location}
                onChange={(e) => setAppointmentForm({...appointmentForm, location: e.target.value})}
                placeholder="Dirección o lugar de encuentro"
              />
            </div>

            <div>
              <Label htmlFor="description">Descripción</Label>
              <Textarea
                id="description"
                value={appointmentForm.description}
                onChange={(e) => setAppointmentForm({...appointmentForm, description: e.target.value})}
                placeholder="Detalles adicionales..."
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => {
                setShowAppointmentForm(false);
                setEditingAppointment(null);
                resetForm();
              }}>
                Cancelar
              </Button>
              <Button type="submit">
                {editingAppointment ? 'Actualizar' : 'Programar'} Turno
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ShiftsModule;
