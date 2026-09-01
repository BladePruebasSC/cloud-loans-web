// ============================================================================
// Consulta de cédula contra la JCE — lado navegador
// ============================================================================
// Este hook NO habla con la JCE: llama a la Edge Function `jce-lookup`, que es donde vive la
// API key y toda la lógica de red. Aquí solo se envía el JWT de la sesión, el número y el
// consentimiento, y se traduce la respuesta a los campos del formulario.

import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { isValidCedula, normalizeGender, normalizeMaritalStatus } from '@/utils/dominicanId';
import { resolveJceCity } from '@/data/dominicanRepublic';

/** Lo que devuelve la Edge Function, ya traducido a los valores del formulario. */
export interface JceResult {
  firstName: string;
  lastName: string;
  birthDate: string | null;
  /** 'MASCULINO' | 'FEMENINO' | null */
  gender: string | null;
  nationality: string;
  /** Opción del selector de estado civil, o null si la JCE devolvió algo no reconocido */
  maritalStatus: string | null;
  /** Ciudad de registro tal como la devuelve la JCE */
  city: string | null;
  /** Provincia deducida de esa ciudad, para precargar la cascada */
  province: string;
  /** Municipio deducido de esa ciudad */
  municipality: string;
  /** URL firmada de corta duración (10 min) con la foto, o null */
  photoUrl: string | null;
  /** true si el dato salió de la caché y no de una consulta nueva */
  cached: boolean;
}

interface ApiPayload {
  data?: {
    nombre?: string; apellido?: string; fecha_nacimiento?: string | null;
    sexo?: string | null; nacionalidad?: string; estado_civil?: string | null;
    ciudad?: string | null; imagen_url?: string | null;
  };
  meta?: { fuente?: string; cached?: boolean };
  error?: { code?: string; message?: string };
}

export const useJceLookup = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lookup = useCallback(async (
    cedula: string,
    consent: boolean,
  ): Promise<JceResult | null> => {
    setError(null);

    // Se comprueba aquí para no gastar una llamada, pero el servidor lo vuelve a comprobar:
    // el front no es una barrera de seguridad.
    if (!consent) {
      setError('Marca la autorización del titular antes de consultar.');
      return null;
    }
    if (!isValidCedula(cedula)) {
      setError('Cédula inválida: el dígito verificador no coincide.');
      return null;
    }

    setLoading(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) {
        setError('Tu sesión expiró. Vuelve a iniciar sesión.');
        return null;
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(`${supabaseUrl}/functions/v1/jce-lookup`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cedula: cedula.replace(/\D/g, ''),
          consentimiento: true,
          incluir_imagen: true,
        }),
      });

      let payload: ApiPayload;
      try {
        payload = await res.json();
      } catch {
        setError('El servicio de verificación devolvió una respuesta ilegible.');
        return null;
      }

      if (!res.ok || !payload.data) {
        setError(payload.error?.message || 'No se pudo verificar la cédula.');
        return null;
      }

      const d = payload.data;
      // La JCE devuelve la ciudad del REGISTRO, no necesariamente donde vive hoy: se usa
      // solo para precargar la cascada, y el formulario deja cambiarla.
      const location = resolveJceCity(d.ciudad);

      return {
        firstName: (d.nombre || '').trim(),
        lastName: (d.apellido || '').trim(),
        birthDate: d.fecha_nacimiento || null,
        gender: normalizeGender(d.sexo),
        nationality: d.nacionalidad || 'Dominicana',
        maritalStatus: normalizeMaritalStatus(d.estado_civil),
        city: d.ciudad || null,
        province: location.province,
        municipality: location.municipality,
        photoUrl: d.imagen_url || null,
        cached: payload.meta?.cached === true,
      };
    } catch (e) {
      console.error('Error consultando la JCE', e);
      setError('No se pudo contactar el servicio de verificación.');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { lookup, loading, error, clearError: () => setError(null) };
};
