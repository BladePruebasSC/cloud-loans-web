
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Route, Plus, Edit, Trash2, Clock, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { PasswordVerificationDialog } from '@/components/common/PasswordVerificationDialog';

interface RouteData {
  id: string;
  name: string;
  description: string;
  start_location: string;
  end_location: string;
  estimated_duration_minutes: number;
  distance_km: number;
  status: string;
}

export const RoutesModule = () => {
  const [routes, setRoutes] = useState<RouteData[]>([
    {
      id: '1',
      name: 'Ruta Centro',
      description: 'Cobranza en el centro de la ciudad',
      start_location: 'Oficina Principal',
      end_location: 'Zona Colonial',
      estimated_duration_minutes: 120,
      distance_km: 15.5,
      status: 'active'
    },
    {
      id: '2',
      name: 'Ruta Norte',
      description: 'Cobranza en la zona norte',
      start_location: 'Oficina Principal',
      end_location: 'Villa Mella',
      estimated_duration_minutes: 180,
      distance_km: 25.3,
      status: 'active'
    },
    {
      id: '3',
      name: 'Ruta Este',
      description: 'Cobranza en la zona este',
      start_location: 'Oficina Principal',
      end_location: 'Boca Chica',
      estimated_duration_minutes: 150,
      distance_km: 35.2,
      status: 'inactive'
    }
  ]);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState<RouteData | null>(null);
  const [showPasswordVerification, setShowPasswordVerification] = useState(false);
  const [routeToDelete, setRouteToDelete] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    start_location: '',
    end_location: '',
    estimated_duration_minutes: 0,
    distance_km: 0,
    status: 'active'
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingRoute) {
      setRoutes(prev => prev.map(route => 
        route.id === editingRoute.id 
          ? { ...route, ...formData }
          : route
      ));
      toast.success('Ruta actualizada exitosamente');
    } else {
      const newRoute = {
        ...formData,
        id: Date.now().toString(),
      };
      setRoutes(prev => [...prev, newRoute]);
      toast.success('Ruta agregada exitosamente');
    }

    setIsDialogOpen(false);
    setEditingRoute(null);
    setFormData({
      name: '',
      description: '',
      start_location: '',
      end_location: '',
      estimated_duration_minutes: 0,
      distance_km: 0,
      status: 'active'
    });
  };

  const handleEdit = (route: RouteData) => {
    setEditingRoute(route);
    setFormData({
      name: route.name,
      description: route.description,
      start_location: route.start_location,
      end_location: route.end_location,
      estimated_duration_minutes: route.estimated_duration_minutes,
      distance_km: route.distance_km,
      status: route.status
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    setRouteToDelete(id);
    setShowPasswordVerification(true);
  };

  const confirmDelete = () => {
    if (!routeToDelete) return;
    setRoutes(prev => prev.filter(route => route.id !== routeToDelete));
      toast.success('Ruta eliminada exitosamente');
    setRouteToDelete(null);
  };

  const activeRoutes = routes.filter(r => r.status === 'active').length;
  const totalDistance = routes.reduce((sum, r) => sum + r.distance_km, 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Rutas de Cobranza</h1>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => {
              setEditingRoute(null);
              setFormData({
                name: '',
                description: '',
                start_location: '',
                end_location: '',
                estimated_duration_minutes: 0,
                distance_km: 0,
                status: 'active'
              });
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
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Nombre de la Ruta</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Ej: Ruta Centro"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="status">Estado</Label>
                  <Select value={formData.status} onValueChange={(value) => setFormData(prev => ({ ...prev, status: value }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Activa</SelectItem>
                      <SelectItem value="inactive">Inactiva</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="start_location">Ubicación de Inicio</Label>
                  <Input
                    id="start_location"
                    value={formData.start_location}
                    onChange={(e) => setFormData(prev => ({ ...prev, start_location: e.target.value }))}
                    placeholder="Ej: Oficina Principal"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="end_location">Ubicación Final</Label>
                  <Input
                    id="end_location"
                    value={formData.end_location}
                    onChange={(e) => setFormData(prev => ({ ...prev, end_location: e.target.value }))}
                    placeholder="Ej: Zona Colonial"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="estimated_duration_minutes">Duración Estimada (minutos)</Label>
                  <Input
                    id="estimated_duration_minutes"
                    type="number"
                    value={formData.estimated_duration_minutes}
                    onChange={(e) => setFormData(prev => ({ ...prev, estimated_duration_minutes: parseInt(e.target.value) || 0 }))}
                    placeholder="120"
                    min="0"
                  />
                </div>

                <div>
                  <Label htmlFor="distance_km">Distancia (km)</Label>
                  <Input
                    id="distance_km"
                    type="number"
                    step="0.1"
                    value={formData.distance_km}
                    onChange={(e) => setFormData(prev => ({ ...prev, distance_km: parseFloat(e.target.value) || 0 }))}
                    placeholder="15.5"
                    min="0"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="description">Descripción</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Descripción de la ruta"
                />
              </div>

              <div className="flex gap-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button type="submit">
                  {editingRoute ? 'Actualizar' : 'Crear'}
                </Button>
              </div>
            </form>
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
            <p className="text-xs text-muted-foreground">
              {activeRoutes} activas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rutas Activas</CardTitle>
            <MapPin className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{activeRoutes}</div>
            <p className="text-xs text-muted-foreground">
              {routes.length - activeRoutes} inactivas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Distancia Total</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalDistance.toFixed(1)} km</div>
            <p className="text-xs text-muted-foreground">Todas las rutas</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Rutas</CardTitle>
        </CardHeader>
        <CardContent>
          {routes.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Route className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No hay rutas registradas</p>
            </div>
          ) : (
            <div className="space-y-4">
              {routes.map((route) => (
                <div key={route.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-lg">{route.name}</h3>
                        <span className={`text-xs px-2 py-1 rounded ${
                          route.status === 'active' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {route.status === 'active' ? 'Activa' : 'Inactiva'}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
                        <div>
                          <p><strong>Desde:</strong> {route.start_location}</p>
                          <p><strong>Hasta:</strong> {route.end_location}</p>
                        </div>
                        <div>
                          <p><strong>Distancia:</strong> {route.distance_km} km</p>
                          <p><strong>Duración:</strong> {route.estimated_duration_minutes} min</p>
                        </div>
                        {route.description && (
                          <div className="md:col-span-2">
                            <p><strong>Descripción:</strong> {route.description}</p>
                          </div>
                        )}
                      </div>
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

      {/* Diálogo de Verificación de Contraseña */}
      <PasswordVerificationDialog
        isOpen={showPasswordVerification}
        onClose={() => {
          setShowPasswordVerification(false);
          setRouteToDelete(null);
        }}
        onVerify={() => {
          setShowPasswordVerification(false);
          confirmDelete();
        }}
        title="Verificar Contraseña"
        description="Por seguridad, ingresa tu contraseña para confirmar la eliminación de la ruta."
        entityName="ruta"
      />
    </div>
  );
};
