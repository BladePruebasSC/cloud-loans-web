// ============================================================================
// UBICACIÓN GPS DE LA VIVIENDA DEL CLIENTE
// ============================================================================
// Sirve para que el cobrador llegue a la casa sin dar vueltas. Tres formas de fijarla, de
// más a menos cómoda:
//
//   1. MAPA: pinchar o arrastrar el marcador (necesita VITE_GOOGLE_MAPS_API_KEY).
//   2. GPS DEL DISPOSITIVO: el botón "Usar mi ubicación" — lo natural cuando el empleado
//      está parado frente a la casa del cliente.
//   3. A MANO: pegar unas coordenadas copiadas de Google Maps.
//
// Sin clave de Google el componente NO se rompe: desaparece el mapa y quedan las otras dos,
// más el enlace para abrir el punto en Google Maps (los enlaces no requieren clave).

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Crosshair, ExternalLink, Loader2, MapPin, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  DR_CENTER, isGoogleMapsConfigured, loadGoogleMaps, mapsPointUrl, parseCoordinates,
  type GMapsMap, type GMapsMarker, type LatLng,
} from '@/utils/googleMaps';

interface Props {
  latitude: number | null;
  longitude: number | null;
  /** Referencia escrita ("casa amarilla, portón negro") */
  note: string;
  onChange: (value: { latitude: number | null; longitude: number | null; note: string }) => void;
  /** Dirección escrita en el formulario, para buscarla en el mapa */
  addressHint?: string;
}

const round7 = (v: number) => Math.round(v * 1e7) / 1e7;

export const LocationPicker =({ latitude, longitude, note, onChange, addressHint }: Props) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<GMapsMap | null>(null);
  const markerInstance = useRef<GMapsMarker | null>(null);

  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [searching, setSearching] = useState(false);
  const [manual, setManual] = useState('');

  const hasPoint = latitude !== null && longitude !== null;

  // `onChange` cambia de identidad en cada render del padre; se guarda en una ref para que
  // los listeners del mapa (que se registran una sola vez) usen siempre la versión actual.
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const setPoint = useCallback((p: LatLng | null) => {
    onChangeRef.current({
      latitude: p ? round7(p.lat) : null,
      longitude: p ? round7(p.lng) : null,
      note,
    });
  }, [note]);

  // ---- Mapa ----------------------------------------------------------------
  useEffect(() => {
    if (!isGoogleMapsConfigured() || !mapRef.current || mapInstance.current) return;

    let cancelled = false;
    loadGoogleMaps()
      .then(maps => {
        if (cancelled || !mapRef.current) return;

        const center = hasPoint ? { lat: latitude!, lng: longitude! } : DR_CENTER;
        const map = new maps.Map(mapRef.current, {
          center,
          zoom: hasPoint ? 17 : 8,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          gestureHandling: 'greedy',
        });

        const marker = new maps.Marker({
          map,
          position: center,
          draggable: true,
          visible: hasPoint,
        });

        map.addListener('click', (e) => {
          const pos = e.latLng;
          if (!pos) return;
          const p = { lat: pos.lat(), lng: pos.lng() };
          marker.setPosition(p);
          setPoint(p);
        });

        marker.addListener('dragend', () => {
          const pos = marker.getPosition();
          if (pos) setPoint({ lat: pos.lat(), lng: pos.lng() });
        });

        mapInstance.current = map;
        markerInstance.current = marker;
        setMapReady(true);
      })
      .catch((e: Error) => {
        if (!cancelled) setMapError(e.message);
      });

    return () => { cancelled = true; };
    // Se monta una sola vez: las actualizaciones del punto van por el efecto de abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reflejar en el mapa los cambios que vengan de fuera (GPS, coordenadas pegadas, búsqueda)
  useEffect(() => {
    const map = mapInstance.current;
    const marker = markerInstance.current;
    if (!map || !marker) return;

    if (hasPoint) {
      const p = { lat: latitude!, lng: longitude! };
      marker.setPosition(p);
      marker.setMap(map);
      map.setCenter(p);
      map.setZoom(17);
    } else {
      marker.setMap(null);
    }
  }, [latitude, longitude, hasPoint]);

  // ---- GPS del dispositivo -------------------------------------------------
  const useDeviceLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Este dispositivo no permite obtener la ubicación');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setPoint({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        toast.success(`Ubicación tomada (precisión ~${Math.round(pos.coords.accuracy)} m)`);
      },
      (err) => {
        setLocating(false);
        toast.error(
          err.code === err.PERMISSION_DENIED
            ? 'Permiso de ubicación denegado. Actívalo en el navegador.'
            : 'No se pudo obtener la ubicación del dispositivo.'
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  };

  // ---- Buscar la dirección escrita ----------------------------------------
  const searchAddress = async () => {
    const query = String(addressHint || '').trim();
    if (!query) {
      toast.error('Escribe primero la dirección del cliente');
      return;
    }
    if (!isGoogleMapsConfigured()) {
      toast.error('La búsqueda en el mapa necesita la clave de Google Maps');
      return;
    }
    setSearching(true);
    try {
      const maps = await loadGoogleMaps();
      const geocoder = new maps.Geocoder();
      geocoder.geocode({ address: `${query}, República Dominicana` }, (results, status) => {
        setSearching(false);
        if (status !== 'OK' || !results || results.length === 0) {
          toast.error('No se encontró esa dirección. Marca el punto en el mapa a mano.');
          return;
        }
        const loc = results[0].geometry.location;
        setPoint({ lat: loc.lat(), lng: loc.lng() });
        toast.success('Punto aproximado colocado. Ajústalo arrastrando el marcador.');
      });
    } catch {
      setSearching(false);
      toast.error('No se pudo usar la búsqueda de direcciones.');
    }
  };

  const applyManual = () => {
    const p = parseCoordinates(manual);
    if (!p) {
      toast.error('Coordenadas no reconocidas. Ejemplo: 18.486058, -69.931212');
      return;
    }
    setPoint(p);
    setManual('');
    toast.success('Ubicación fijada');
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-gray-500" />
          <span className="text-sm font-medium">Ubicación de la vivienda</span>
          {hasPoint
            ? <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Fijada</Badge>
            : <Badge variant="outline">Sin fijar</Badge>}
        </div>
        {hasPoint && (
          <div className="flex items-center gap-2">
            <a
              href={mapsPointUrl(latitude!, longitude!)}
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
            >
              <ExternalLink className="h-3 w-3" /> Ver en Google Maps
            </a>
            <Button type="button" variant="ghost" size="sm" onClick={() => setPoint(null)}>
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Quitar
            </Button>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-500">
        El cobrador usará este punto para llegar a la casa. Lo más exacto es tomarlo con el
        botón <strong>Usar mi ubicación</strong> estando frente a la vivienda.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={useDeviceLocation} disabled={locating}>
          {locating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Crosshair className="mr-2 h-4 w-4" />}
          Usar mi ubicación
        </Button>
        {isGoogleMapsConfigured() && (
          <Button type="button" variant="outline" size="sm" onClick={searchAddress} disabled={searching}>
            {searching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
            Buscar la dirección escrita
          </Button>
        )}
      </div>

      {isGoogleMapsConfigured() ? (
        <div className="relative overflow-hidden rounded-lg border">
          <div ref={mapRef} className="h-64 w-full bg-gray-100" />
          {!mapReady && !mapError && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 bg-gray-50/80 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando el mapa…
            </div>
          )}
          {mapError && (
            <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-amber-800">
              {mapError}
            </div>
          )}
          {mapReady && (
            <div className="absolute bottom-2 left-2 rounded bg-white/90 px-2 py-1 text-[11px] text-gray-600 shadow">
              Pincha en el mapa o arrastra el marcador
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3 text-xs text-gray-600">
          <p className="font-medium text-gray-800">Mapa no disponible</p>
          <p className="mt-1">
            Falta la clave <code>VITE_GOOGLE_MAPS_API_KEY</code>. Puedes fijar la ubicación con
            el botón de arriba o pegando las coordenadas; el punto se abrirá igual en Google Maps.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="loc-manual" className="text-xs">Pegar coordenadas</Label>
          <div className="flex gap-2">
            <Input
              id="loc-manual"
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyManual(); } }}
              placeholder="18.486058, -69.931212"
            />
            <Button type="button" variant="outline" onClick={applyManual}>Fijar</Button>
          </div>
          <p className="text-xs text-gray-500">
            Admite también un enlace de Google Maps copiado.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="loc-note" className="text-xs">Referencia para llegar</Label>
          <Input
            id="loc-note"
            value={note}
            onChange={(e) => onChangeRef.current({ latitude, longitude, note: e.target.value })}
            placeholder="Casa amarilla, portón negro, al lado del colmado"
          />
          {hasPoint && (
            <p className="font-mono text-[11px] text-gray-500">
              {latitude!.toFixed(6)}, {longitude!.toFixed(6)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default LocationPicker;
