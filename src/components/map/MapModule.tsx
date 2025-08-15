
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { 
  MapPin, 
  Navigation, 
  Route, 
  Users,
  Search,
  Filter,
  Calendar,
  Phone,
  Mail,
  Clock
} from 'lucide-react';

interface Client {
  id: string;
  full_name: string;
  address: string | null;
  city: string | null;
  phone: string;
  email: string | null;
  dni: string;
  status: string;
  created_at: string;
}

interface RouteData {
  id: string;
  name: string;
  clients: Client[];
  total_distance: number;
  estimated_time: number;
  status: string;
  created_at: string;
}

const MapModule = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [routes, setRoutes] = useState<RouteData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCity, setSelectedCity] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('clientes');
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      fetchClients();
    }
  }, [user]);

  useEffect(() => {
    if (clients.length > 0) {
      generateRoutes();
    }
  }, [clients]);

  const fetchClients = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('status', 'active')
        .order('full_name');

      if (error) throw error;
      setClients(data || []);
    } catch (error) {
      console.error('Error fetching clients:', error);
      toast.error('Error al cargar clientes');
    } finally {
      setLoading(false);
    }
  };

  // Generate routes based on real client data
  const generateRoutes = () => {
    if (clients.length === 0) {
      setRoutes([]);
      return;
    }

    const clientsWithAddress = clients.filter(c => c.address && c.city);
    const citiesMap = new Map<string, Client[]>();
    
    // Group clients by city
    clientsWithAddress.forEach(client => {
      const city = client.city!;
      if (!citiesMap.has(city)) {
        citiesMap.set(city, []);
      }
      citiesMap.get(city)!.push(client);
    });
    
    // Create routes for each city with more than 2 clients
    const generatedRoutes: RouteData[] = [];
    let routeId = 1;
    
    citiesMap.forEach((cityClients, city) => {
      if (cityClients.length >= 2) {
        generatedRoutes.push({
          id: routeId.toString(),
          name: `Ruta ${city}`,
          clients: cityClients,
          total_distance: cityClients.length * 2.5, // Estimated 2.5km per client
          estimated_time: cityClients.length * 15, // Estimated 15 minutes per client
          status: 'pending',
          created_at: new Date().toISOString()
        });
        routeId++;
      }
    });
    
    setRoutes(generatedRoutes);
  };

  const filteredClients = clients.filter(client => {
    const matchesSearch = client.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         client.dni.includes(searchTerm) ||
                         (client.address && client.address.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCity = selectedCity === 'all' || client.city === selectedCity;
    return matchesSearch && matchesCity;
  });

  const cities = [...new Set(clients.map(c => c.city).filter(Boolean))];
  const clientsWithAddress = clients.filter(c => c.address && c.city);
  const activeRoutes = routes.filter(r => r.status === 'active');

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Mapa de Clientes</h1>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <Button variant="outline" className="w-full sm:w-auto">
            <Route className="h-4 w-4 mr-2" />
            Crear Ruta
          </Button>
          <Button className="w-full sm:w-auto">
            <Navigation className="h-4 w-4 mr-2" />
            Navegar
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Clientes con Dirección</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clientsWithAddress.length}</div>
            <p className="text-xs text-muted-foreground">De {clients.length} clientes totales</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Rutas Activas</CardTitle>
            <Route className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeRoutes.length}</div>
            <p className="text-xs text-muted-foreground">Rutas programadas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ubicaciones</CardTitle>
            <MapPin className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clientsWithAddress.length}</div>
            <p className="text-xs text-muted-foreground">Puntos en el mapa</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ciudades</CardTitle>
            <Navigation className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{cities.length}</div>
            <p className="text-xs text-muted-foreground">Ciudades cubiertas</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 gap-1 sm:gap-2">
          <TabsTrigger value="clientes" className="text-xs sm:text-sm">Clientes</TabsTrigger>
          <TabsTrigger value="rutas" className="text-xs sm:text-sm">Rutas</TabsTrigger>
          <TabsTrigger value="mapa" className="text-xs sm:text-sm">Mapa</TabsTrigger>
          <TabsTrigger value="planificacion" className="text-xs sm:text-sm">Planificación</TabsTrigger>
        </TabsList>

        <TabsContent value="clientes" className="space-y-6">
          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle>Filtros de Búsqueda</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <Input
                    placeholder="Buscar clientes por nombre, cédula o dirección..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <Select value={selectedCity} onValueChange={setSelectedCity}>
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue placeholder="Todas las ciudades" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas las ciudades</SelectItem>
                    {cities.map(city => (
                      <SelectItem key={city} value={city!}>{city}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Clients List */}
          <Card>
            <CardHeader>
              <CardTitle>Clientes en el Mapa ({filteredClients.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">Cargando clientes...</div>
              ) : filteredClients.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <MapPin className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No se encontraron clientes con esos criterios</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredClients.map((client) => (
                    <div key={client.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <MapPin className="h-5 w-5 text-blue-500" />
                            <h3 className="font-semibold text-lg">{client.full_name}</h3>
                            <Badge variant={client.status === 'active' ? 'default' : 'secondary'}>
                              {client.status === 'active' ? 'Activo' : 'Inactivo'}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
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
                            {client.address && (
                              <div className="flex items-center gap-2">
                                <MapPin className="h-4 w-4" />
                                <span>{client.address}, {client.city}</span>
                              </div>
                            )}
                          </div>
                          {!client.address && (
                            <div className="mt-2">
                              <Badge variant="destructive" className="text-xs">
                                Sin dirección registrada
                              </Badge>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm">
                            <Navigation className="h-4 w-4 mr-1" />
                            Navegar
                          </Button>
                          <Button variant="outline" size="sm">
                            <Route className="h-4 w-4 mr-1" />
                            Agregar a Ruta
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

        <TabsContent value="rutas" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Rutas Programadas</CardTitle>
            </CardHeader>
            <CardContent>
              {routes.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Route className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No hay rutas programadas</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {routes.map((route) => (
                    <div key={route.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <Route className="h-5 w-5 text-green-500" />
                            <h3 className="font-semibold text-lg">{route.name}</h3>
                            <Badge variant={route.status === 'active' ? 'default' : 'secondary'}>
                              {route.status === 'active' ? 'Activa' : 'Pendiente'}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm text-gray-600">
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4" />
                              <span>{route.clients.length} clientes</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Navigation className="h-4 w-4" />
                              <span>{route.total_distance} km</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4" />
                              <span>{route.estimated_time} min</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Calendar className="h-4 w-4" />
                              <span>{new Date(route.created_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm">
                            Ver Detalles
                          </Button>
                          <Button size="sm">
                            <Navigation className="h-4 w-4 mr-1" />
                            Iniciar Ruta
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

        <TabsContent value="mapa">
          <Card>
            <CardHeader>
              <CardTitle>Mapa Interactivo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-96 bg-gray-100 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-300">
                <div className="text-center">
                  <MapPin className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                  <h3 className="text-xl font-medium mb-2 text-gray-700">Mapa Interactivo</h3>
                  <p className="text-gray-600 mb-4">
                    Para mostrar el mapa necesitas configurar tu token de Mapbox
                  </p>
                  <div className="space-y-2 text-sm text-gray-500">
                    <p>El mapa mostrará:</p>
                    <ul className="list-disc list-inside space-y-1">
                      <li>Ubicación de todos los clientes</li>
                      <li>Rutas optimizadas</li>
                      <li>Navegación paso a paso</li>
                      <li>Tiempo estimado de viaje</li>
                    </ul>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="planificacion">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Planificador de Rutas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="route_name">Nombre de la Ruta</Label>
                    <Input id="route_name" placeholder="Ej: Ruta Centro Lunes" />
                  </div>
                  
                  <div>
                    <Label htmlFor="start_time">Hora de Inicio</Label>
                    <Input id="start_time" type="time" defaultValue="08:00" />
                  </div>
                  
                  <div>
                    <Label htmlFor="max_stops">Máximo de Paradas</Label>
                    <Input id="max_stops" type="number" defaultValue="10" />
                  </div>
                  
                  <div>
                    <Label>Criterio de Optimización</Label>
                    <Select defaultValue="distance">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="distance">Menor Distancia</SelectItem>
                        <SelectItem value="time">Menor Tiempo</SelectItem>
                        <SelectItem value="priority">Por Prioridad</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <Button className="w-full">
                    <Route className="h-4 w-4 mr-2" />
                    Generar Ruta Optimizada
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Estadísticas de Rutas</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span>Rutas completadas esta semana:</span>
                    <span className="font-semibold">12</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Distancia total recorrida:</span>
                    <span className="font-semibold">245 km</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Tiempo promedio por ruta:</span>
                    <span className="font-semibold">2.5 horas</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Eficiencia de rutas:</span>
                    <span className="font-semibold text-green-600">87%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Clientes visitados:</span>
                    <span className="font-semibold">89</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export { MapModule };
