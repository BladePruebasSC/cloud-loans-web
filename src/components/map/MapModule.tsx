
import React, { useState, useEffect, useMemo } from 'react';
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
  neighborhood: string | null;
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

interface LoanAddressEntry {
  loanId: string;
  amount: number;
  remaining_balance: number;
  next_payment_date: string;
  status: string;
  loan_type: string | null;
  interest_rate: number;
  client: Client;
}

const MapModule = () => {
  const [clients, setClients] = useState<Client[]>([]);
  const [routes, setRoutes] = useState<RouteData[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [loanAddresses, setLoanAddresses] = useState<LoanAddressEntry[]>([]);
  const [loanLoading, setLoanLoading] = useState(true);
  const [selectedCity, setSelectedCity] = useState('all');
  const [selectedNeighborhood, setSelectedNeighborhood] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'overdue' | 'pending'>('all');
  const [loanTypeFilter, setLoanTypeFilter] = useState('all');
  const [activeTab, setActiveTab] = useState('clientes');
  const [selectedAddress, setSelectedAddress] = useState<LoanAddressEntry | null>(null);
  const { user, profile, companyId } = useAuth();

  useEffect(() => {
    if (user && companyId) {
      fetchClients();
      fetchLoanAddresses();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, companyId]);

  useEffect(() => {
    if (clients.length > 0) {
      generateRoutes();
    }
  }, [clients]);

  const fetchClients = async () => {
    try {
      setClientsLoading(true);
      if (!companyId) {
        setClients([]);
        return;
      }
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('status', 'active')
        .eq('user_id', companyId)
        .order('full_name');

      if (error) throw error;
      setClients(data || []);
    } catch (error) {
      console.error('Error fetching clients:', error);
      toast.error('Error al cargar clientes');
    } finally {
      setClientsLoading(false);
    }
  };

  const fetchLoanAddresses = async () => {
    try {
      if (!user) return;
      setLoanLoading(true);

      let query = supabase
        .from('loans')
        .select(`
          id,
          amount,
          remaining_balance,
          next_payment_date,
          status,
          loan_type,
          interest_rate,
          client:client_id (
            id,
            full_name,
            address,
            city,
            neighborhood,
            phone,
            email,
            dni,
            status
          )
        `)
        .in('status', ['active', 'overdue', 'pending']);

      if (profile?.is_employee && profile?.company_owner_id) {
        query = query.eq('loan_officer_id', profile.company_owner_id);
      } else {
        query = query.eq('loan_officer_id', user.id);
      }

      const { data, error } = await query;
      if (error) throw error;

      const entries = (data || [])
        .map((loan) => {
          const client = loan.client as Client | null;
          if (!client || (!client.address && !client.neighborhood && !client.city)) return null;

          return {
            loanId: loan.id,
            amount: loan.amount,
            remaining_balance: loan.remaining_balance,
            next_payment_date: loan.next_payment_date,
            status: loan.status || 'active',
            loan_type: loan.loan_type || 'general',
            interest_rate: loan.interest_rate,
            client,
          } as LoanAddressEntry;
        })
        .filter(Boolean) as LoanAddressEntry[];

      setLoanAddresses(entries);
    } catch (error) {
      console.error('Error fetching loans for map:', error);
      toast.error('No se pudieron cargar las direcciones de préstamos activos');
    } finally {
      setLoanLoading(false);
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
    const normalized = searchTerm.toLowerCase();
    const matchesSearch = client.full_name.toLowerCase().includes(normalized) ||
                         client.dni.includes(searchTerm) ||
                         (client.address && client.address.toLowerCase().includes(normalized)) ||
                         (client.city && client.city.toLowerCase().includes(normalized)) ||
                         (client.neighborhood && client.neighborhood.toLowerCase().includes(normalized));
    const matchesCity = selectedCity === 'all' || client.city === selectedCity;
    const matchesNeighborhood = selectedNeighborhood === 'all' || client.neighborhood === selectedNeighborhood;
    return matchesSearch && matchesCity && matchesNeighborhood;
  });

  const cities = useMemo(() => {
    const fromClients = clients.map(c => c.city).filter(Boolean) as string[];
    const fromAddresses = loanAddresses.map(entry => entry.client.city).filter(Boolean) as string[];
    return [...new Set([...fromClients, ...fromAddresses])];
  }, [clients, loanAddresses]);

  const neighborhoods = useMemo(() => {
    const fromClients = clients.map(c => c.neighborhood).filter(Boolean) as string[];
    const fromAddresses = loanAddresses.map(entry => entry.client.neighborhood).filter(Boolean) as string[];
    return [...new Set([...fromClients, ...fromAddresses])];
  }, [clients, loanAddresses]);

  const neighborhoodsByCity = useMemo(() => {
    const map = new Map<string, Set<string>>();
    const register = (city?: string | null, neighborhood?: string | null) => {
      if (!neighborhood) return;
      const key = city || '__sin_ciudad__';
      if (!map.has(key)) {
        map.set(key, new Set());
      }
      map.get(key)!.add(neighborhood);
    };
    clients.forEach(client => register(client.city, client.neighborhood));
    loanAddresses.forEach(entry => register(entry.client.city, entry.client.neighborhood));
    return map;
  }, [clients, loanAddresses]);

  const neighborhoodOptions = useMemo(() => {
    if (selectedCity === 'all') {
      return neighborhoods;
    }
    const key = selectedCity || '__sin_ciudad__';
    const set = neighborhoodsByCity.get(key);
    return set ? [...set] : [];
  }, [selectedCity, neighborhoods, neighborhoodsByCity]);

  useEffect(() => {
    setSelectedNeighborhood('all');
  }, [selectedCity]);

  const clientsWithAddress = clients.filter(c => c.address && (c.city || c.neighborhood));
  const activeRoutes = routes.filter(r => r.status === 'active');
  const loanTypes = useMemo(() => {
    return [...new Set(loanAddresses.map(entry => entry.loan_type).filter(Boolean))] as string[];
  }, [loanAddresses]);

  const filteredAddresses = useMemo(() => {
    const normalized = searchTerm.toLowerCase();
    return loanAddresses.filter(entry => {
      const matchesSearch = normalized.length === 0 ||
        entry.client.full_name.toLowerCase().includes(normalized) ||
        entry.client.dni.toLowerCase().includes(normalized) ||
        (entry.client.address?.toLowerCase().includes(normalized)) ||
        (entry.client.city?.toLowerCase().includes(normalized)) ||
        (entry.client.neighborhood?.toLowerCase().includes(normalized));
      const matchesCity = selectedCity === 'all' || entry.client.city === selectedCity;
      const matchesNeighborhood = selectedNeighborhood === 'all' || entry.client.neighborhood === selectedNeighborhood;
      const matchesStatus = statusFilter === 'all' || entry.status === statusFilter;
      const matchesLoanType = loanTypeFilter === 'all' || entry.loan_type === loanTypeFilter;
      return matchesSearch && matchesCity && matchesNeighborhood && matchesStatus && matchesLoanType;
    });
  }, [loanAddresses, searchTerm, selectedCity, selectedNeighborhood, statusFilter, loanTypeFilter]);

  useEffect(() => {
    if (filteredAddresses.length === 0) {
      setSelectedAddress(null);
      return;
    }

    if (!selectedAddress || !filteredAddresses.some(entry => entry.loanId === selectedAddress.loanId)) {
      setSelectedAddress(filteredAddresses[0]);
    }
  }, [filteredAddresses, selectedAddress]);

  const searchSuggestions = useMemo(() => {
    const normalized = searchTerm.trim().toLowerCase();
    if (normalized.length < 2) return [];
    return filteredAddresses.slice(0, 6);
  }, [filteredAddresses, searchTerm]);

  const handleSelectAddress = (entry: LoanAddressEntry) => {
    setSelectedAddress(entry);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return { variant: 'default' as const, label: 'Activo' };
      case 'overdue':
        return { variant: 'destructive' as const, label: 'Mora' };
      case 'pending':
        return { variant: 'secondary' as const, label: 'Pendiente' };
      case 'paid':
        return { variant: 'outline' as const, label: 'Pagado' };
      default:
        return { variant: 'outline' as const, label: status };
    }
  };

  const buildAddressLabel = (
    address?: string | null,
    neighborhood?: string | null,
    city?: string | null
  ) => {
    if (!address && !neighborhood && !city) return '';
    const pieces = [address, neighborhood, city].filter(Boolean);
    return pieces.join(', ');
  };

  const openAddressInMaps = (
    address?: string | null,
    neighborhood?: string | null,
    city?: string | null
  ) => {
    if (!address && !neighborhood && !city) {
      toast.error('Este cliente no tiene dirección registrada.');
      return;
    }

    if (typeof window === 'undefined') {
      toast.error('No se puede abrir la navegación fuera del navegador.');
      return;
    }

    const query = encodeURIComponent(buildAddressLabel(address, neighborhood, city));
    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank', 'noopener,noreferrer');
  };

  const handleNavigateSelectedAddress = () => {
    if (!selectedAddress) {
      toast.error('Selecciona una dirección activa para navegar.');
      return;
    }
    openAddressInMaps(
      selectedAddress.client.address,
      selectedAddress.client.neighborhood,
      selectedAddress.client.city
    );
  };

  const handleNavigateLoanEntry = (entry: LoanAddressEntry) => {
    openAddressInMaps(entry.client.address, entry.client.neighborhood, entry.client.city);
    setSelectedAddress(entry);
  };

  const handleNavigateClientCard = (client: Client) => {
    openAddressInMaps(client.address, client.neighborhood, client.city);
  };

  const handleCopyClientToRoute = async (client: Client) => {
    if (!client.address && !client.neighborhood && !client.city) {
      toast.error('Este cliente no tiene datos de dirección.');
      return;
    }

    const summary = `${client.full_name} - ${buildAddressLabel(client.address, client.neighborhood, client.city)} (Tel: ${client.phone})`;
    try {
      await navigator?.clipboard?.writeText(summary);
      toast.success('Cliente agregado a tu portapapeles para la ruta.');
    } catch (error) {
      console.error('Error copying client to clipboard:', error);
      toast.error('No se pudo copiar la referencia. Intenta manualmente.');
    }
  };

  const handleCreateRoutePlan = async () => {
    if (filteredAddresses.length === 0) {
      toast.error('No hay direcciones activas para generar una ruta.');
      return;
    }

    const addresses = filteredAddresses
      .map(entry => buildAddressLabel(entry.client.address, entry.client.neighborhood, entry.client.city))
      .filter(Boolean);

    if (addresses.length === 0) {
      toast.error('Las direcciones seleccionadas no son válidas.');
      return;
    }

    const destination = addresses[0];
    const waypointParam = addresses.slice(1, 10).map(addr => encodeURIComponent(addr)).join('|');
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}${
      waypointParam ? `&waypoints=${waypointParam}` : ''
    }`;

    if (typeof window !== 'undefined') {
      window.open(mapsUrl, '_blank', 'noopener,noreferrer');
    }

    const routeSummary = filteredAddresses
      .map((entry, index) => `${index + 1}. ${entry.client.full_name} - ${buildAddressLabel(entry.client.address, entry.client.neighborhood, entry.client.city)} (Tel: ${entry.client.phone})`)
      .join('\n');

    try {
      await navigator?.clipboard?.writeText(routeSummary);
      toast.success('Ruta abierta en Google Maps y copiada al portapapeles.');
    } catch (error) {
      console.error('Error copying route summary:', error);
      toast.warning('Ruta abierta en Google Maps. Copia manualmente si la necesitas en texto.');
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Mapa de Clientes</h1>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <Button variant="outline" className="w-full sm:w-auto" onClick={handleCreateRoutePlan}>
            <Route className="h-4 w-4 mr-2" />
            Crear Ruta
          </Button>
          <Button className="w-full sm:w-auto" onClick={handleNavigateSelectedAddress}>
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
            <div className="text-2xl font-bold">{loanAddresses.length}</div>
            <p className="text-xs text-muted-foreground">Préstamos activos en el mapa</p>
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
                <Select value={selectedNeighborhood} onValueChange={setSelectedNeighborhood}>
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue placeholder="Todos los barrios" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los barrios</SelectItem>
                    {neighborhoodOptions.map(neighborhood => (
                      <SelectItem key={neighborhood} value={neighborhood}>{neighborhood}</SelectItem>
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
              {clientsLoading ? (
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
                          <Button variant="outline" size="sm" onClick={() => handleNavigateClientCard(client)}>
                            <Navigation className="h-4 w-4 mr-1" />
                            Navegar
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleCopyClientToRoute(client)}>
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
          <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-6">
            <Card className="relative">
            <CardHeader>
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <CardTitle>Direcciones activas</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      Se muestran únicamente clientes con préstamos activos, en mora o pendientes.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">Total: {loanAddresses.length}</Badge>
                    <Badge variant="outline">Filtradas: {filteredAddresses.length}</Badge>
                  </div>
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-5 gap-4 mt-4">
                  <div className="xl:col-span-2 relative">
                    <Input
                      placeholder="Buscar por nombre, dirección, cédula o barrio..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pr-10"
                    />
                    <Search className="h-4 w-4 absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    {searchSuggestions.length > 0 && (
                      <div className="absolute z-20 mt-1 w-full rounded-md border bg-white shadow-lg max-h-64 overflow-y-auto">
                        {searchSuggestions.map((entry) => (
                          <button
                            key={entry.loanId}
                            className="w-full text-left px-3 py-2 hover:bg-muted focus:outline-none"
                            onClick={() => handleSelectAddress(entry)}
                          >
                            <p className="font-medium text-sm">{entry.client.full_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {buildAddressLabel(entry.client.address, entry.client.neighborhood, entry.client.city)}
                            </p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <Select value={selectedCity} onValueChange={setSelectedCity}>
                    <SelectTrigger>
                      <SelectValue placeholder="Ciudad" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas las ciudades</SelectItem>
                      {cities.map(city => (
                        <SelectItem key={city} value={city!}>{city}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={selectedNeighborhood} onValueChange={setSelectedNeighborhood}>
                    <SelectTrigger>
                      <SelectValue placeholder="Barrio / Sector" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los barrios</SelectItem>
                      {neighborhoodOptions.map(neighborhood => (
                        <SelectItem key={neighborhood} value={neighborhood}>{neighborhood}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as 'all' | 'active' | 'overdue' | 'pending')}>
                    <SelectTrigger>
                      <SelectValue placeholder="Estado" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los estados</SelectItem>
                      <SelectItem value="active">Activos</SelectItem>
                      <SelectItem value="overdue">En Mora</SelectItem>
                      <SelectItem value="pending">Pendientes</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={loanTypeFilter} onValueChange={setLoanTypeFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Tipo de préstamo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los tipos</SelectItem>
                      {loanTypes.map(type => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {loanLoading ? (
                  <div className="h-[400px] flex items-center justify-center text-muted-foreground">
                    Cargando direcciones...
                  </div>
                ) : filteredAddresses.length === 0 ? (
                  <div className="h-[400px] flex flex-col items-center justify-center text-muted-foreground text-center">
                    <MapPin className="h-12 w-12 mb-4" />
                    <p>No hay direcciones para los filtros actuales.</p>
                    <p className="text-xs mt-1">Asegúrate de que el cliente tenga dirección y préstamo activo.</p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                    {filteredAddresses.map(entry => (
                      <button
                        key={entry.loanId}
                        className={`w-full text-left border rounded-lg p-3 transition hover:border-blue-500 ${selectedAddress?.loanId === entry.loanId ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}
                        onClick={() => handleSelectAddress(entry)}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold">{entry.client.full_name}</p>
                            {entry.client.address && (
                              <p className="text-sm text-muted-foreground">{entry.client.address}</p>
                            )}
                            {entry.client.neighborhood && (
                              <p className="text-xs text-muted-foreground">Barrio: {entry.client.neighborhood}</p>
                            )}
                            {entry.client.city && (
                              <p className="text-xs text-muted-foreground">Ciudad: {entry.client.city}</p>
                            )}
                          </div>
                          <Badge variant={getStatusBadge(entry.status).variant}>
                            {getStatusBadge(entry.status).label}
                          </Badge>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                          <span>Balance: ${entry.remaining_balance.toLocaleString()}</span>
                          <span>Próximo pago: {new Date(entry.next_payment_date).toLocaleDateString()}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Detalle del préstamo seleccionado</CardTitle>
              </CardHeader>
              <CardContent>
                {!selectedAddress ? (
                  <div className="text-center text-sm text-muted-foreground py-12">
                    Selecciona una dirección de la lista para ver el detalle del préstamo.
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <p className="text-lg font-semibold">{selectedAddress.client.full_name}</p>
                      <p className="text-sm text-muted-foreground">{selectedAddress.client.dni}</p>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-blue-500" />
                        <span>{selectedAddress.client.address}</span>
                      </div>
                      {selectedAddress.client.neighborhood && (
                        <div className="text-muted-foreground text-sm">
                          Barrio/Sector: <span className="font-medium text-foreground">{selectedAddress.client.neighborhood}</span>
                        </div>
                      )}
                      {selectedAddress.client.city && (
                        <div className="text-muted-foreground text-sm">
                          Ciudad: <span className="font-medium text-foreground">{selectedAddress.client.city}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4" />
                        <span>{selectedAddress.client.phone}</span>
                      </div>
                      {selectedAddress.client.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4" />
                          <span>{selectedAddress.client.email}</span>
                        </div>
                      )}
                    </div>
                    <div className="border rounded-lg p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Estado</span>
                        <Badge variant={getStatusBadge(selectedAddress.status).variant}>
                          {getStatusBadge(selectedAddress.status).label}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Monto original</span>
                        <span className="font-semibold">${selectedAddress.amount.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Balance pendiente</span>
                        <span className="font-semibold text-blue-600">${selectedAddress.remaining_balance.toLocaleString()}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Próximo pago</span>
                        <span>{new Date(selectedAddress.next_payment_date).toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Interés mensual</span>
                        <span>{selectedAddress.interest_rate}%</span>
                  </div>
                </div>
              </div>
                )}
            </CardContent>
          </Card>
          </div>
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
