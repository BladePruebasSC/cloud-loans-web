// ============================================================================
// RUTA DE COBRO — el día del cobrador
// ============================================================================
// Responde tres preguntas, en este orden:
//   1. ¿A quién tengo que cobrarle hoy y cuánto?  (cuotas que vencen + lo atrasado)
//   2. ¿En qué orden me conviene ir?              (vecino más próximo desde donde estoy)
//   3. ¿Cómo llego?                               (mapa trazado + navegación paso a paso)
//
// Los importes salen de `buildRouteStops`, que usa el mismo cálculo de pendiente por cuota
// que el formulario de pago: lo que el cobrador ve es exactamente lo que el sistema acepta.
//
// Sin clave de Google Maps el módulo sigue sirviendo: la lista, los totales y el orden por
// cercanía funcionan igual, y la navegación se abre por enlace en la app de Google Maps.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertTriangle, Crosshair, DollarSign, ExternalLink, Loader2, MapPin, MessageCircle,
  Navigation, Phone, RefreshCw, Route as RouteIcon, Users,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { getCurrentDateStringForSantoDomingo, formatDateStringForSantoDomingo } from '@/utils/dateUtils';
import {
  buildRouteStops, orderByProximity, summarizeRoute, stopAddress,
  type RouteClient, type RouteLoan, type RouteStop,
} from '@/utils/collectionRoute';
import {
  DR_CENTER, isGoogleMapsConfigured, loadGoogleMaps, mapsPointUrl, mapsRouteUrl,
  subscribeMapsAuthFailure, MAPS_AUTH_ERROR,
  type GMapsMap, type LatLng,
} from '@/utils/googleMaps';
import type { RawInstallment, RawPayment } from '@/utils/installmentDues';

const CLIENT_FIELDS =
  'id, full_name, phone, address, sector, municipality, province, latitude, longitude, location_note, collection_route';

export const CollectionRouteModule = () => {
  const { companyId, profile } = useAuth();
  const navigate = useNavigate();
  const today = useMemo(() => getCurrentDateStringForSantoDomingo(), []);

  const [dateIso, setDateIso] = useState(today);
  const [routeFilter, setRouteFilter] = useState('all');
  const [includeOverdue, setIncludeOverdue] = useState(true);
  const [loading, setLoading] = useState(true);
  const [origin, setOrigin] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [optimized, setOptimized] = useState(false);

  const [clients, setClients] = useState<RouteClient[]>([]);
  const [loans, setLoans] = useState<RouteLoan[]>([]);
  const [installments, setInstallments] = useState<(RawInstallment & { loan_id: string })[]>([]);
  const [payments, setPayments] = useState<(RawPayment & { loan_id: string })[]>([]);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<GMapsMap | null>(null);
  const overlays = useRef<{ setMap: (m: GMapsMap | null) => void }[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);

  const can = useCallback((key: string) => {
    if (!profile) return false;
    if (!profile.is_employee) return true;
    if (profile.role === 'admin') return true;
    return profile.permissions?.[key] === true;
  }, [profile]);

  // -------------------------------------------------------------------------
  // Datos
  // -------------------------------------------------------------------------
  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [{ data: clientRows }, { data: loanRows }] = await Promise.all([
        supabase.from('clients').select(CLIENT_FIELDS).eq('user_id', companyId),
        supabase.from('loans')
          .select('id, client_id, status, remaining_balance, current_late_fee')
          .eq('loan_officer_id', companyId)
          .in('status', ['active', 'overdue']),
      ]);

      const loanList = (loanRows ?? []) as RouteLoan[];
      const loanIds = loanList.map(l => l.id);

      // Cuotas y pagos SIEMPRE por `loan_id`. Pedirlos por una columna de propiedad deja
      // fuera lo que registró un empleado — el mismo error que ya se corrigió en el panel.
      let instRows: (RawInstallment & { loan_id: string })[] = [];
      let payRows: (RawPayment & { loan_id: string })[] = [];

      if (loanIds.length > 0) {
        // Supabase limita el tamaño de un `in(...)`; se trocea para carteras grandes.
        const chunks: string[][] = [];
        for (let i = 0; i < loanIds.length; i += 200) chunks.push(loanIds.slice(i, i + 200));

        const results = await Promise.all(chunks.map(chunk => Promise.all([
          supabase.from('installments')
            .select('id, loan_id, installment_number, due_date, total_amount, principal_amount, interest_amount, paid_amount, is_paid')
            .in('loan_id', chunk),
          supabase.from('payments')
            .select('loan_id, amount, principal_amount, interest_amount, due_date, superseded_at')
            .in('loan_id', chunk),
        ])));

        for (const [inst, pay] of results) {
          instRows = instRows.concat((inst.data ?? []) as (RawInstallment & { loan_id: string })[]);
          payRows = payRows.concat((pay.data ?? []) as (RawPayment & { loan_id: string })[]);
        }
      }

      setClients((clientRows ?? []) as RouteClient[]);
      setLoans(loanList);
      setInstallments(instRows);
      setPayments(payRows);
    } catch (error) {
      console.error('Error cargando la ruta de cobro', error);
      toast.error('No se pudo cargar la ruta de cobro');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  // Recalcular cuando se registra un pago desde otra pantalla
  useEffect(() => {
    const handler = () => load();
    window.addEventListener('installmentsUpdated', handler);
    return () => window.removeEventListener('installmentsUpdated', handler);
  }, [load]);

  // -------------------------------------------------------------------------
  // Paradas
  // -------------------------------------------------------------------------
  const baseStops = useMemo(() => buildRouteStops({
    clients, loans, installments, payments, dateIso,
    routeFilter, includeOverdueOnly: includeOverdue,
  }), [clients, loans, installments, payments, dateIso, routeFilter, includeOverdue]);

  const stops = useMemo(
    () => (optimized ? orderByProximity(baseStops, origin) : baseStops),
    [baseStops, optimized, origin],
  );

  const summary = useMemo(() => summarizeRoute(stops), [stops]);

  const routeLink = useMemo(() => {
    const points = stops.map(s => s.coords).filter((p): p is LatLng => p !== null);
    return mapsRouteUrl(points, origin);
  }, [stops, origin]);

  // -------------------------------------------------------------------------
  // Ubicación del cobrador
  // -------------------------------------------------------------------------
  const locateMe = () => {
    if (!navigator.geolocation) {
      toast.error('Este dispositivo no permite obtener la ubicación');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setOptimized(true);
        toast.success('Ruta ordenada desde tu ubicación');
      },
      () => {
        setLocating(false);
        toast.error('No se pudo obtener tu ubicación. Activa el permiso en el navegador.');
      },
      { enableHighAccuracy: true, timeout: 12000 },
    );
  };

  // -------------------------------------------------------------------------
  // Mapa
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!isGoogleMapsConfigured() || !mapRef.current || mapInstance.current) return;
    let cancelled = false;

    loadGoogleMaps()
      .then(maps => {
        if (cancelled || !mapRef.current) return;
        mapInstance.current = new maps.Map(mapRef.current, {
          center: DR_CENTER, zoom: 8,
          mapTypeControl: false, streetViewControl: false, gestureHandling: 'greedy',
        });
        setMapReady(true);
      })
      .catch((e: Error) => { if (!cancelled) setMapError(e.message); });

    // Si Google rechaza la clave, el script carga igual y el mapa sale en gris: este es el
    // único aviso que llega, y sin él no habría forma de saber por qué.
    const unsubscribe = subscribeMapsAuthFailure(() => {
      if (!cancelled) setMapError(MAPS_AUTH_ERROR);
    });

    return () => { cancelled = true; unsubscribe(); };
  }, []);

  // Dibujar las paradas cada vez que cambian
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !mapReady) return;

    let cancelled = false;
    loadGoogleMaps().then(maps => {
      if (cancelled) return;

      overlays.current.forEach(o => o.setMap(null));
      overlays.current = [];

      const bounds = new maps.LatLngBounds();
      let any = false;

      if (origin) {
        const marker = new maps.Marker({
          map, position: origin, title: 'Tú estás aquí',
          label: { text: '★', color: '#fff', fontSize: '14px' },
        });
        overlays.current.push(marker);
        bounds.extend(origin);
        any = true;
      }

      stops.forEach((stop, i) => {
        if (!stop.coords) return;
        const marker = new maps.Marker({
          map,
          position: stop.coords,
          title: `${i + 1}. ${stop.client.full_name} — ${formatCurrency(stop.totalToCollect)}`,
          label: { text: String(i + 1), color: '#fff', fontSize: '12px', fontWeight: 'bold' },
        });
        overlays.current.push(marker);
        bounds.extend(stop.coords);
        any = true;
      });

      if (any && !bounds.isEmpty()) map.fitBounds(bounds, 48);
    }).catch(() => { /* el error ya se muestra en el estado del mapa */ });

    return () => { cancelled = true; };
  }, [stops, origin, mapReady]);

  // -------------------------------------------------------------------------
  // Acciones por parada
  // -------------------------------------------------------------------------
  const callClient = (phone?: string | null) => {
    const digits = String(phone ?? '').replace(/\D/g, '');
    if (!digits) { toast.error('El cliente no tiene teléfono registrado'); return; }
    window.location.href = `tel:+${digits.length === 10 ? '1' + digits : digits}`;
  };

  const whatsappClient = (stop: RouteStop) => {
    const digits = String(stop.client.phone ?? '').replace(/\D/g, '');
    if (!digits) { toast.error('El cliente no tiene teléfono registrado'); return; }
    const phone = digits.length === 10 ? `1${digits}` : digits;
    const text = encodeURIComponent(
      `Saludos ${stop.client.full_name}, le escribo de parte de la empresa por su pago pendiente de ` +
      `${formatCurrency(stop.totalToCollect)}. ¿Le queda bien que pase hoy?`
    );
    window.open(`https://wa.me/${phone}?text=${text}`, '_blank', 'noopener,noreferrer');
  };

  const navigateTo = (stop: RouteStop) => {
    if (stop.coords) {
      window.open(mapsPointUrl(stop.coords.lat, stop.coords.lng), '_blank', 'noopener,noreferrer');
      return;
    }
    const address = stopAddress(stop.client);
    if (!address) { toast.error('Este cliente no tiene ubicación ni dirección'); return; }
    window.open(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address + ', República Dominicana')}`,
      '_blank', 'noopener,noreferrer',
    );
  };

  const collect = (stop: RouteStop) => {
    const loanId = stop.loans[0]?.loanId;
    if (!loanId) return;
    navigate(`/prestamos?action=payment&loanId=${loanId}`);
  };

  const openFullRoute = () => {
    if (!routeLink.url) {
      toast.error('Ninguna parada tiene ubicación GPS guardada todavía');
      return;
    }
    window.open(routeLink.url, '_blank', 'noopener,noreferrer');
    if (routeLink.truncated) {
      toast.warning(
        `Google Maps admite 10 paradas por ruta: se abrieron las ${routeLink.included} primeras. ` +
        'Vuelve a abrir la ruta al terminarlas.'
      );
    }
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  const routesInUse = useMemo(() => {
    const set = new Set(clients.map(c => (c.collection_route || '').trim()).filter(Boolean));
    return [...set].sort();
  }, [clients]);

  return (
    <div className="w-full space-y-5 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Cobranza</p>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900 sm:text-3xl">
            <RouteIcon className="h-7 w-7 text-blue-600" />
            Ruta de cobro
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {dateIso === today ? 'Lo que hay que cobrar hoy' : formatDateStringForSantoDomingo(dateIso)}
          </p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Actualizar
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="route-date" className="text-xs">Día</Label>
            <Input id="route-date" type="date" value={dateIso}
              onChange={(e) => setDateIso(e.target.value || today)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Ruta asignada</Label>
            <Select value={routeFilter} onValueChange={setRouteFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las rutas</SelectItem>
                {routesInUse.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
              <Checkbox checked={includeOverdue}
                onCheckedChange={(c) => setIncludeOverdue(c === true)} />
              Incluir clientes solo atrasados
            </label>
          </div>
          <div className="flex items-end">
            <Button variant="outline" className="w-full" onClick={locateMe} disabled={locating}>
              {locating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Crosshair className="mr-2 h-4 w-4" />}
              Ordenar desde donde estoy
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Totales */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card><CardContent className="p-4">
          <p className="flex items-center gap-1.5 text-xs uppercase text-gray-500">
            <Users className="h-3.5 w-3.5" /> Paradas
          </p>
          <p className="text-2xl font-bold">{summary.stops.length}</p>
          {summary.withoutLocation > 0 && (
            <p className="text-xs text-amber-700">{summary.withoutLocation} sin ubicación GPS</p>
          )}
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs uppercase text-gray-500">Vence hoy</p>
          <p className="text-2xl font-bold text-blue-700">{formatCurrency(summary.totalDueToday)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs uppercase text-gray-500">Atrasado</p>
          <p className="text-2xl font-bold text-red-600">{formatCurrency(summary.totalOverdue)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs uppercase text-gray-500">Total a cobrar</p>
          <p className="text-2xl font-bold text-green-700">{formatCurrency(summary.totalToCollect)}</p>
          {optimized && summary.totalKm > 0 && (
            <p className="text-xs text-gray-500">≈ {summary.totalKm} km de recorrido</p>
          )}
        </CardContent></Card>
      </div>

      {/* Mapa */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-base">Recorrido</CardTitle>
          <Button size="sm" onClick={openFullRoute} disabled={!routeLink.url}>
            <Navigation className="mr-2 h-4 w-4" />
            Abrir ruta en Google Maps
          </Button>
        </CardHeader>
        <CardContent>
          {isGoogleMapsConfigured() ? (
            <div className="relative overflow-hidden rounded-lg border">
              <div ref={mapRef} className="h-80 w-full bg-gray-100" />
              {!mapReady && !mapError && (
                <div className="absolute inset-0 flex items-center justify-center gap-2 bg-gray-50/80 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" /> Cargando el mapa…
                </div>
              )}
              {mapError && (
                <div className="absolute inset-0 flex items-center justify-center bg-amber-50/95 p-4 text-center text-sm text-amber-900">
                  {mapError}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">
              <p className="font-medium text-gray-800">Mapa incrustado no disponible</p>
              <p className="mt-1 text-xs">
                No hay clave de Google Maps configurada. La ruta se abre igual en la app de
                Google Maps con el botón de arriba, y el orden por cercanía funciona.
              </p>
            </div>
          )}

          {summary.withoutLocation > 0 && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <strong>{summary.withoutLocation}</strong> {summary.withoutLocation === 1 ? 'cliente no tiene' : 'clientes no tienen'} ubicación
                GPS guardada, así que no {summary.withoutLocation === 1 ? 'aparece' : 'aparecen'} en el mapa ni en el trazado.
                Van al final de la lista. Guárdala desde la ficha del cliente, en <em>Ubicación</em>.
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Paradas */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Paradas {optimized && <span className="text-xs font-normal text-gray-500">(ordenadas por cercanía)</span>}
            {!optimized && <span className="text-xs font-normal text-gray-500"> (las más atrasadas primero)</span>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Calculando la ruta…
            </div>
          ) : stops.length === 0 ? (
            <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-center">
              <p className="font-semibold text-green-800">No hay nada que cobrar este día.</p>
              <p className="mt-1 text-sm text-green-700">
                Ninguna cuota vence {dateIso === today ? 'hoy' : 'ese día'}
                {includeOverdue ? ' y no hay atrasos pendientes' : ''} con los filtros actuales.
              </p>
            </div>
          ) : stops.map((stop, i) => (
            <div key={stop.client.id}
              className="rounded-lg border p-3 transition hover:border-blue-300 hover:bg-blue-50/40">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-semibold text-gray-900">
                      {stop.client.full_name}
                      {stop.maxDaysOverdue > 0 && (
                        <Badge variant="destructive" className="text-[10px]">
                          {stop.maxDaysOverdue} {stop.maxDaysOverdue === 1 ? 'día' : 'días'} de atraso
                        </Badge>
                      )}
                      {!stop.coords && (
                        <Badge variant="outline" className="border-amber-300 text-[10px] text-amber-700">
                          sin GPS
                        </Badge>
                      )}
                      {stop.legKm !== null && (
                        <span className="text-[11px] font-normal text-gray-500">a {stop.legKm} km</span>
                      )}
                    </p>
                    <p className="truncate text-xs text-gray-500">
                      {stopAddress(stop.client) || 'Sin dirección registrada'}
                    </p>
                    {stop.client.location_note && (
                      <p className="truncate text-xs text-gray-500">
                        <MapPin className="mr-1 inline h-3 w-3" />{stop.client.location_note}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-gray-600">
                      {stop.loans.length === 1
                        ? '1 préstamo'
                        : `${stop.loans.length} préstamos`}
                      {stop.overdueCount > 0 && ` · ${stop.overdueCount} ${stop.overdueCount === 1 ? 'cuota vencida' : 'cuotas vencidas'}`}
                      {stop.lateFee > 0 && ` · mora ${formatCurrency(stop.lateFee)}`}
                    </p>
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-lg font-bold text-green-700">{formatCurrency(stop.totalToCollect)}</p>
                  <p className="text-xs text-gray-500">
                    {stop.dueToday > 0 && <>hoy {formatCurrency(stop.dueToday)}</>}
                    {stop.dueToday > 0 && stop.overdue > 0 && ' · '}
                    {stop.overdue > 0 && <span className="text-red-600">atrasado {formatCurrency(stop.overdue)}</span>}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
                <Button size="sm" variant="outline" onClick={() => callClient(stop.client.phone)}>
                  <Phone className="mr-1.5 h-3.5 w-3.5" /> Llamar
                </Button>
                <Button size="sm" variant="outline" onClick={() => whatsappClient(stop)}>
                  <MessageCircle className="mr-1.5 h-3.5 w-3.5" /> WhatsApp
                </Button>
                <Button size="sm" variant="outline" onClick={() => navigateTo(stop)}>
                  <Navigation className="mr-1.5 h-3.5 w-3.5" /> Cómo llegar
                </Button>
                {can('pagos.crear') && (
                  <Button size="sm" onClick={() => collect(stop)}>
                    <DollarSign className="mr-1.5 h-3.5 w-3.5" /> Cobrar
                  </Button>
                )}
                <Button size="sm" variant="ghost"
                  onClick={() => navigate(`/clientes/editar/${stop.client.id}`)}>
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Ficha
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};

export default CollectionRouteModule;
