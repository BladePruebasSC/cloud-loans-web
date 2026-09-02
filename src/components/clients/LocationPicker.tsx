// ============================================================================
// UBICACIÓN GPS DE LA VIVIENDA DEL CLIENTE
// ============================================================================
// Sirve para que el cobrador llegue a la casa sin dar vueltas. Se fija de dos formas:
//
//   1. GPS DEL DISPOSITIVO: el botón "Usar mi ubicación" — lo natural cuando el empleado
//      está parado frente a la casa del cliente, y lo más exacto con diferencia.
//   2. A MANO: pegar unas coordenadas o un enlace de Google Maps copiado.
//
// NO CARGA EL SDK DE GOOGLE MAPS a propósito. Lo único que hace falta guardar es un par de
// números, y el `navigator.geolocation` del navegador ya los da: montar un mapa incrustado
// para eso añadía una dependencia, una clave y una espera de carga a cambio de nada. Ver el
// punto en un mapa se resuelve con un enlace, que tampoco necesita clave.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Crosshair, ExternalLink, Loader2, MapPin, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { mapsPointUrl, parseCoordinates, type LatLng } from '@/utils/googleMaps';

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
}

/** Siete decimales ≈ 1 cm. Es lo que admite la columna `NUMERIC(10,7)`. */
const round7 = (v: number) => Math.round(v * 1e7) / 1e7;

export const LocationPicker = ({ latitude, longitude, accuracy, note, onChange }: Props) => {
  const [locating, setLocating] = useState(false);
  const [manual, setManual] = useState('');

  const hasPoint = latitude !== null && longitude !== null;

  // `onChange` cambia de identidad en cada render del padre; se guarda en una ref para que
  // los callbacks asíncronos (el del GPS) usen siempre la versión actual.
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const setPoint = useCallback((p: LatLng | null, acc: number | null = null) => {
    onChangeRef.current({
      latitude: p ? round7(p.lat) : null,
      longitude: p ? round7(p.lng) : null,
      accuracy: p ? acc : null,
      note,
    });
  }, [note]);

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
        </div>
        {hasPoint && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setPoint(null)}>
            <Trash2 className="mr-1 h-3.5 w-3.5" /> Quitar
          </Button>
        )}
      </div>

      <p className="text-xs text-gray-500">
        El cobrador usará este punto para llegar a la casa. Lo más exacto es tomarlo con el
        botón <strong>Usar mi ubicación</strong> estando frente a la vivienda.
      </p>

      <Button type="button" variant="outline" size="sm" onClick={useDeviceLocation} disabled={locating}>
        {locating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Crosshair className="mr-2 h-4 w-4" />}
        {hasPoint ? 'Volver a tomar mi ubicación' : 'Usar mi ubicación'}
      </Button>

      {hasPoint && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
          <div>
            <p className="font-mono text-sm font-medium text-green-900">
              {latitude!.toFixed(6)}, {longitude!.toFixed(6)}
            </p>
            <p className="text-[11px] text-green-800">
              {accuracy !== null && accuracy !== undefined
                ? `Tomada con el GPS · precisión ~${Math.round(accuracy)} m`
                : 'Fijada a mano'}
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
