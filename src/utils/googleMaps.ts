// ============================================================================
// Carga del SDK de Google Maps
// ============================================================================
// La clave se lee de `VITE_GOOGLE_MAPS_API_KEY`. Es una clave de NAVEGADOR: acaba en el
// bundle sí o sí, no hay forma de ocultarla en una SPA. Protégela en la consola de Google
// restringiéndola por dominio (HTTP referrers) y a las APIs "Maps JavaScript" y
// "Geocoding" — no por secreto, que es imposible aquí.
//
// SIN CLAVE EL SISTEMA SIGUE FUNCIONANDO: el selector de ubicación cae en modo manual
// (GPS del dispositivo + coordenadas escritas a mano) y las rutas se abren en la app de
// Google Maps mediante enlaces, que no requieren clave. Es el mismo mecanismo que ya usaba
// `MapModule`. El mapa incrustado es una mejora, no un requisito.

export interface LatLng { lat: number; lng: number }

interface GMapsPosition { lat(): number; lng(): number }

export interface GMapsMarker {
  setPosition(p: LatLng): void;
  getPosition(): GMapsPosition | null;
  addListener(event: string, cb: () => void): void;
  setMap(map: GMapsMap | null): void;
}

export interface GMapsMap {
  setCenter(p: LatLng): void;
  getCenter(): GMapsPosition | null;
  setZoom(z: number): void;
  addListener(event: string, cb: (e: { latLng: GMapsPosition | null }) => void): void;
  fitBounds(bounds: GMapsBounds, padding?: number): void;
}

export interface GMapsBounds {
  extend(p: LatLng): void;
  isEmpty(): boolean;
}

export interface GMapsApi {
  Map: new (el: HTMLElement, opts: Record<string, unknown>) => GMapsMap;
  Marker: new (opts: Record<string, unknown>) => GMapsMarker;
  LatLngBounds: new () => GMapsBounds;
  Geocoder: new () => {
    geocode(
      req: { address: string },
      cb: (results: Array<{ geometry: { location: GMapsPosition } }> | null, status: string) => void,
    ): void;
  };
  DirectionsService: new () => {
    route(
      req: Record<string, unknown>,
      cb: (result: unknown, status: string) => void,
    ): void;
  };
  DirectionsRenderer: new (opts?: Record<string, unknown>) => {
    setMap(map: GMapsMap | null): void;
    setDirections(result: unknown): void;
  };
  TravelMode: { DRIVING: string };
  Animation: { DROP: number };
}

interface WindowWithMaps extends Window { google?: { maps?: GMapsApi } }

export const GOOGLE_MAPS_API_KEY: string =
  (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined) ?? '';

export const isGoogleMapsConfigured = (): boolean => GOOGLE_MAPS_API_KEY.trim().length > 0;

/** Centro aproximado de la República Dominicana, para abrir el mapa en algún sitio útil. */
export const DR_CENTER: LatLng = { lat: 18.7357, lng: -70.1627 };

let loaderPromise: Promise<GMapsApi> | null = null;

/**
 * Carga el SDK una sola vez por sesión y devuelve `google.maps`.
 * Rechaza si no hay clave o si el script no carga (dominio no autorizado, sin red…).
 */
export const loadGoogleMaps = (): Promise<GMapsApi> => {
  if (loaderPromise) return loaderPromise;

  loaderPromise = new Promise<GMapsApi>((resolve, reject) => {
    if (!isGoogleMapsConfigured()) {
      reject(new Error('Falta VITE_GOOGLE_MAPS_API_KEY'));
      return;
    }

    const w = window as WindowWithMaps;
    if (w.google?.maps) { resolve(w.google.maps); return; }

    const existing = document.getElementById('google-maps-sdk') as HTMLScriptElement | null;
    const onReady = () => {
      const maps = (window as WindowWithMaps).google?.maps;
      if (maps) resolve(maps);
      else reject(new Error('El SDK de Google Maps cargó sin inicializarse'));
    };

    if (existing) {
      existing.addEventListener('load', onReady);
      existing.addEventListener('error', () => reject(new Error('No se pudo cargar Google Maps')));
      return;
    }

    const script = document.createElement('script');
    script.id = 'google-maps-sdk';
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}&language=es&region=DO`;
    script.addEventListener('load', onReady);
    script.addEventListener('error', () => {
      // Que falle una vez no debe dejar el mapa muerto para siempre.
      loaderPromise = null;
      reject(new Error('No se pudo cargar Google Maps. Revisa la clave y los dominios autorizados.'));
    });
    document.head.appendChild(script);
  });

  return loaderPromise;
};

// ----------------------------------------------------------------------------
// Enlaces a Google Maps (no requieren clave)
// ----------------------------------------------------------------------------

export const mapsPointUrl = (lat: number, lng: number): string =>
  `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

/**
 * Enlace de navegación con paradas intermedias.
 *
 * Google Maps admite como mucho 9 waypoints además del destino: con más paradas el enlace
 * se corta y falla en silencio, así que aquí se recorta y se avisa al llamador de cuántas
 * paradas caben realmente.
 */
export const MAX_WAYPOINTS = 9;

export const mapsRouteUrl = (points: LatLng[], origin?: LatLng | null): {
  url: string; included: number; truncated: boolean;
} => {
  const stops = points.slice(0, MAX_WAYPOINTS + 1);
  if (stops.length === 0) return { url: '', included: 0, truncated: false };

  const destination = stops[stops.length - 1];
  const waypoints = stops.slice(0, -1);

  const params = new URLSearchParams({
    api: '1',
    destination: `${destination.lat},${destination.lng}`,
    travelmode: 'driving',
  });
  if (origin) params.set('origin', `${origin.lat},${origin.lng}`);
  if (waypoints.length) {
    params.set('waypoints', waypoints.map(p => `${p.lat},${p.lng}`).join('|'));
  }

  return {
    url: `https://www.google.com/maps/dir/?${params.toString()}`,
    included: stops.length,
    truncated: points.length > stops.length,
  };
};

/**
 * Lee unas coordenadas escritas o pegadas.
 *
 * Acepta "18.4861, -69.9312" y también una URL de Google Maps completa, que es lo que la
 * gente copia de verdad: `.../@18.48,-69.93,15z` o `...?q=18.48,-69.93`.
 * Devuelve `null` si no reconoce nada o si el punto cae fuera del planeta.
 */
export const parseCoordinates = (raw: string): LatLng | null => {
  const text = String(raw || '').trim();
  if (!text) return null;

  const fromUrl = text.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/)
    ?? text.match(/[?&](?:q|query|destination)=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  const pair = fromUrl ?? text.match(/^\s*(-?\d+\.?\d*)\s*[,;\s]\s*(-?\d+\.?\d*)\s*$/);
  if (!pair) return null;

  const lat = Number(pair[1]);
  const lng = Number(pair[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
};

/** Distancia en kilómetros entre dos puntos (fórmula del haversine). */
export const distanceKm = (a: LatLng, b: LatLng): number => {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 100) / 100;
};
