// ============================================================================
// UBICACIÓN GPS DE LA VIVIENDA DEL CLIENTE
// ============================================================================
// Sirve para que el cobrador llegue a la casa sin dar vueltas. Tres formas de fijarla:
//
//   1. MAPA: pinchar o arrastrar el marcador.
//   2. GPS DEL DISPOSITIVO: el botón "Usar mi ubicación" — lo natural cuando el empleado
//      está parado frente a la casa, y lo más exacto con diferencia.
//   3. A MANO: pegar unas coordenadas o un enlace de Google Maps.
//
// Fijado el punto, se geocodifica al revés para rellenar provincia, municipio, sector y
// calle: el mapa es el dato duro y lo demás se deduce de él, que es menos trabajo y menos
// errores que teclearlo aparte.
//
// SIN CLAVE DE GOOGLE el componente NO se rompe: desaparecen el mapa y el autorrelleno, y
// quedan el GPS y las coordenadas a mano, que no necesitan clave. Fijar la ubicación nunca
// depende de Google.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Crosshair, ExternalLink, Loader2, MapPin, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  DR_CENTER, MAPS_AUTH_ERROR, isGoogleMapsConfigured, loadGoogleMaps, mapsPointUrl,
  parseCoordinates, reverseGeocode, subscribeMapsAuthFailure,
  type GMapsMap, type GMapsMarker, type LatLng, type ResolvedPlace,
} from '@/utils/googleMaps';

interface Props {
  latitude: number | null;
  longitude: number | null;
  /** Radio de error en metros que informó el GPS, o null si se pegó a mano */
  accuracy?: number | null;
  /** Referencia escrita ("casa amarilla, portón negro") */
  note: string;
  onChange: (value: {
    latitude: number | null; longitude: number | null; accuracy: number | null; note: string;
  }) => void;
  /** Se llama cuando el punto se traduce a una dirección, para rellenar la cascada. */
  onPlaceResolved?: (place: ResolvedPlace) => void;
}

/** Siete decimales ≈ 1 cm. Es lo que admite la columna `NUMERIC(10,7)`. */
const round7 = (v: number) => Math.round(v * 1e7) / 1e7;

export const LocationPicker = ({
  latitude, longitude, accuracy, note, onChange, onPlaceResolved,
}: Props) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<GMapsMap | null>(null);
  const markerInstance = useRef<GMapsMarker | null>(null);

  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [manual, setManual] = useState('');

  const hasPoint = latitude !== null && longitude !== null;

  // Ambos callbacks cambian de identidad en cada render del padre; se guardan en refs para
  // que los listeners del mapa —que se registran UNA sola vez— usen siempre la última
  // versión y no una copia congelada con datos viejos del formulario.
  const onChangeRef = useRef(onChange);
  const onPlaceResolvedRef = useRef(onPlaceResolved);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onPlaceResolvedRef.current = onPlaceResolved; }, [onPlaceResolved]);

  const noteRef = useRef(note);
  useEffect(() => { noteRef.current = note; }, [note]);

  /** Traduce el punto a una dirección y se la pasa al formulario. */
  const resolveAddress = useCallback(async (p: LatLng) => {
    if (!isGoogleMapsConfigured() || !onPlaceResolvedRef.current) return;
    setResolving(true);
    try {
      const place = await reverseGeocode(p);
      if (place) onPlaceResolvedRef.current(place);
    } catch {
      // Que falle el autorrelleno no invalida el punto: es lo accesorio.
    } finally {
      setResolving(false);
    }
  }, []);

  const setPoint = useCallback((p: LatLng | null, acc: number | null = null) => {
    onChangeRef.current({
      latitude: p ? round7(p.lat) : null,
      longitude: p ? round7(p.lng) : null,
      accuracy: p ? acc : null,
      note: noteRef.current,
    });
    if (p) void resolveAddress(p);
  }, [resolveAddress]);

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
          map, position: center, draggable: true, visible: hasPoint,
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
      .catch((e: Error) => { if (!cancelled) setMapError(e.message); });

    // Si Google rechaza la clave el script carga igual y el mapa sale en gris sin lanzar
    // ningún error: este es el único aviso que llega.
    const unsubscribe = subscribeMapsAuthFailure(() => {
      if (!cancelled) setMapError(MAPS_AUTH_ERROR);
    });

    return () => { cancelled = true; unsubscribe(); };
    // Se monta una sola vez: las actualizaciones del punto van por el efecto de abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reflejar en el mapa los cambios que vengan de fuera (GPS, coordenadas pegadas)
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
        const acc = Math.round(pos.coords.accuracy);
        setPoint({ lat: pos.coords.latitude, lng: pos.coords.longitude }, acc);
        // Por encima de ~50 m el punto ya no distingue una casa de la de al lado: se avisa
        // en vez de darlo por bueno, porque el cobrador se fía de él.
        if (acc > 50) {
          toast.warning(`Ubicación tomada, pero con ~${acc} m de error. Repítela al aire libre.`);
        } else {
          toast.success(`Ubicación tomada (precisión ~${acc} m)`);
        }
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
          {resolving && (
            <span className="inline-flex items-center gap-1 text-xs text-gray-500">
              <Loader2 className="h-3 w-3 animate-spin" /> Leyendo la dirección…
            </span>
          )}
        </div>
        {hasPoint && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setPoint(null)}>
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Quitar
          </Button>
        )}
      </div>

      <p className="text-xs text-gray-500">
        Pincha en el mapa donde vive el cliente y se rellenan solos provincia, municipio y
        sector. Lo más exacto es tomarlo con <strong>Usar mi ubicación</strong> estando
        frente a la vivienda.
      </p>

      <Button type="button" variant="outline" size="sm" onClick={useDeviceLocation} disabled={locating}>
        {locating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Crosshair className="mr-2 h-4 w-4" />}
        {hasPoint ? 'Volver a tomar mi ubicación' : 'Usar mi ubicación'}
      </Button>

      {isGoogleMapsConfigured() && (
        <div className="relative overflow-hidden rounded-lg border">
          <div ref={mapRef} className="h-72 w-full bg-gray-100" />
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
          {mapReady && !mapError && (
            <div className="absolute bottom-2 left-2 rounded bg-white/90 px-2 py-1 text-[11px] text-gray-600 shadow">
              Pincha en el mapa o arrastra el marcador
            </div>
          )}
        </div>
      )}

      {hasPoint && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
          <div>
            <p className="font-mono text-sm font-medium text-green-900">
              {latitude!.toFixed(6)}, {longitude!.toFixed(6)}
            </p>
            <p className="text-[11px] text-green-800">
              {accuracy !== null && accuracy !== undefined
                ? `Tomada con el GPS · precisión ~${Math.round(accuracy)} m`
                : 'Fijada en el mapa'}
            </p>
          </div>
          <a
            href={mapsPointUrl(latitude!, longitude!)}
            target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline"
          >
            <ExternalLink className="h-3 w-3" /> Ver en Google Maps
          </a>
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
            Admite también un enlace largo de Google Maps. Los cortos
            (<code>maps.app.goo.gl</code>) no traen las coordenadas: ábrelos primero.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="loc-note" className="text-xs">Referencia para llegar</Label>
          <Input
            id="loc-note"
            value={note}
            onChange={(e) => onChangeRef.current({
              latitude, longitude, accuracy: accuracy ?? null, note: e.target.value,
            })}
            placeholder="Casa amarilla, portón negro, al lado del colmado"
          />
        </div>
      </div>
    </div>
  );
};

export default LocationPicker;
