
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { 
  Plus, 
  MapPin, 
  Search, 
  Edit,
  Trash2,
  Clock,
  Navigation,
  Route
} from 'lucide-react';

const routeSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  description: z.string().optional(),
  start_location: z.string().optional(),
  end_location: z.string().optional(),
  estimated_duration_minutes: z.number().min(0, 'La duración debe ser mayor o igual a 0').optional(),
  distance_km: z.number().min(0, 'La distancia debe ser mayor o igual a 0').optional(),
  status: z.string().default('active'),
});

type RouteFormData = z.infer<typeof routeSchema>;

interface RouteData {
  id: string;
  name: string;
  description: string | null;
  start_location: string | null;
  end_location: string | null;
  estimated_duration_minutes: number | null;
  distance_km: number | null;
  status: string;
  created_at: string;
}

export const RoutesModule = () => {
  const [routes, setRoutes] = useState<RouteData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState<RouteData | null>(null);
  const { user } = useAuth();

  const form = useForm<RouteFormData>({
    resolver: zodResolver(routeSchema),
    defaultValues: {
      status: 'active',
    },
  });

  useEffect(() => {
    fetchRoutes();
  }, []);

  const fetchRoutes = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('routes')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRoutes(data || []);
    } catch (error) {
      console.error('Error fetching routes:', error);
      toast.error('Error al cargar rutas');
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data: RouteFormData) => {
    if (!user) return;

    setLoading(true);
    try {
      const routeData = {
        ...data,
        user_id: user.id,
        estimated_duration_minutes: data.estimated_duration_minutes || null,
        distance_km: data.distance_km || null,
      };

      if (editingRoute) {
        const { error } = await supabase
          .from('routes')
          .update(routeData)
          .eq('id', editingRoute.id);

        if (error) throw error;
        toast.success('Ruta actualizada exitosamente');
      } else {
        const { error } = await supabase
          .from('routes')
          .insert([routeData]);

        if (error) throw error;
        toast.success('Ruta agregada exitosamente');
      }

      setIsDialogOpen(false);
      setEditingRoute(null);
      form.reset();
      fetchRoutes();
    } catch (error) {
      console.error('Error saving route:', error);
      toast.error('Error al guardar ruta');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (route: RouteData) => {
    setEditingRoute(route);
    form.reset({
      name: route.name,
      description: route.description || '',
      start_location: route.start_location || '',
      end_location: route.end_location || '',
      estimated_duration_minutes: route.estimated_duration_minutes || undefined,
      distance_km: route.distance_km || undefined,
      status: route.status,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Está seguro de eliminar esta ruta?')) return;

    try {
      const { error } = await supabase
        .from('routes')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Ruta eliminada exitosamente');
      fetchRoutes();
    } catch (error) {
      console.error('Error deleting route:', error);
      toast.error('Error al eliminar ruta');
    }
  };

  const filteredRoutes = routes.filter(route =>
    route.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    route.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    route.start_location?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    route.end_location?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const activeRoutes = routes.filter(r => r.status === 'active').length;
  const totalDistance = routes
    .filter(r => r.status === 'active' && r.distance_km)
    .reduce((sum, r) => sum + (r.distance_km || 0), 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Rutas</h1>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => {
              setEditingRoute(null);
              form.reset();
            }}>
              <Plus className="h-4 w-4 mr-2" />
              Nueva Ruta
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingRoute ? 'Editar Ruta' : 'Nueva Ruta'}
              </DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nombre de la Ruta</FormLabel>
                      <FormControl>
                        <Input placeholder="Ej: Ruta Centro - Norte" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="start_location"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ubicación de Inicio</FormLabel>
                        <FormControl>
                          <Input placeholder="Punto de partida" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="end_location"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Ubicación de Destino</FormLabel>
                        <FormControl>
                          <Input placeholder="Punto de llegada" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="distance_km"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Distancia (KM)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.1"
                            placeholder="0.0"
                            {...field}
                            onChange={(e) => field.onChange(parseFloat(e.target.value) || undefined)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="estimated_duration_minutes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Duración Estimada (Minutos)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            placeholder="0"
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || undefined)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Estado</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar estado" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="bg-white">
                          <SelectItem value="active">Activa</SelectItem>
                          <SelectItem value="inactive">Inactiva</SelectItem>
                          <SelectItem value="maintenance">En Mantenimiento</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Descripción</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Descripción de la ruta, puntos importantes, etc." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex gap-4">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={loading}>
                    {loading ? 'Guardando...' : editingRoute ? 'Actualizar' : 'Crear'}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Rutas</CardTitle>
            <Route className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{routes.length}</div>
            <p className="text-xs text-muted-foreground">Registradas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rutas Activas</CardTitle>
            <Navigation className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{activeRoutes}</div>
            <p className="text-xs text-muted-foreground">En operación</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Distancia Total</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalDistance.toFixed(1)} KM</div>
            <p className="text-xs text-muted-foreground">Rutas activas</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <CardHeader>
          <CardTitle>Buscar Rutas</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-2">
            <Search className="h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar por nombre, ubicación o descripción..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
          </div>
        </CardContent>
      </Card>

      {/* Routes List */}
      <Card>
        <CardHeader>
          <CardTitle>Lista de Rutas</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-gray-500">Cargando rutas...</div>
          ) : filteredRoutes.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Route className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No hay rutas registradas</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredRoutes.map((route) => (
                <div key={route.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-lg">{route.name}</h3>
                        <Badge 
                          variant={
                            route.status === 'active' ? 'default' : 
                            route.status === 'inactive' ? 'secondary' : 'destructive'
                          }
                        >
                          {route.status === 'active' ? 'Activa' : 
                           route.status === 'inactive' ? 'Inactiva' : 'Mantenimiento'}
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm text-gray-600">
                        {route.start_location && (
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-green-600" />
                            <span>Desde: {route.start_location}</span>
                          </div>
                        )}
                        
                        {route.end_location && (
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-red-600" />
                            <span>Hasta: {route.end_location}</span>
                          </div>
                        )}
                        
                        {route.distance_km && (
                          <div className="flex items-center gap-2">
                            <Navigation className="h-4 w-4" />
                            <span>{route.distance_km} KM</span>
                          </div>
                        )}
                        
                        {route.estimated_duration_minutes && (
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4" />
                            <span>
                              {Math.floor(route.estimated_duration_minutes / 60)}h{' '}
                              {route.estimated_duration_minutes % 60}m
                            </span>
                          </div>
                        )}
                      </div>
                      
                      {route.description && (
                        <p className="mt-2 text-sm text-gray-600">{route.description}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleEdit(route)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(route.id)}
                        className="text-red-600 hover:text-red-700"
                      >
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
    </div>
  );
};
