// ============================================================================
// Consulta de cédula contra la JCE — lado navegador
// ============================================================================
// Este hook NO habla con la JCE: llama a la Edge Function `jce-lookup`, que es donde vive la
// API key y toda la lógica de red. Aquí solo se envía el JWT de la sesión, el número y el
// consentimiento, y se traduce la respuesta a los campos del formulario.

import { useCallback, useState } from 'react';
import { supabase, SUPABASE_FUNCTIONS_URL } from '@/integrations/supabase/client';
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
  /** Detalle técnico de en qué etapa falló. Se muestra bajo el error para poder diagnosticar. */
  const [diagnostic, setDiagnostic] = useState<string | null>(null);

  const lookup = useCallback(async (
    cedula: string,
    consent: boolean,
  ): Promise<JceResult | null> => {
    setError(null);
    setDiagnostic(null);

    // Traza por etapas. NUNCA se registra la cédula ni el token: solo dónde falla y por qué.
    const t0 = performance.now();
    const trace = (stage: string, detail?: unknown) => {
      const ms = Math.round(performance.now() - t0);
      if (detail === undefined) console.log(`[JCE ${ms}ms] ${stage}`);
      else console.log(`[JCE ${ms}ms] ${stage}`, detail);
    };
    const fail = (stage: string, message: string, hint: string, detail?: unknown) => {
      console.error(`[JCE] FALLO en ${stage}: ${hint}`, detail ?? '');
      setError(message);
      setDiagnostic(`${stage} — ${hint}`);
      return null;
    };

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
      // ── 1. Configuración ──────────────────────────────────────────────────
      // La URL del proyecto está escrita a mano en `client.ts`, así que
      // `VITE_SUPABASE_URL` puede no existir en el entorno de despliegue. Sin este respaldo
      // la petición se iba a `undefined/functions/v1/...`, que en Netlify devuelve el
      // index.html de la propia aplicación.
      const envUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
      const baseUrl = envUrl ? `${envUrl}/functions/v1` : SUPABASE_FUNCTIONS_URL;
      const endpoint = `${baseUrl}/jce-lookup`;
      trace('1/5 configuración', {
        origen: envUrl ? 'VITE_SUPABASE_URL' : 'client.ts (respaldo)',
        endpoint,
      });
      if (!envUrl) {
        console.warn(
          '[JCE] VITE_SUPABASE_URL no está definida en este despliegue. Se usa la URL de ' +
          'client.ts. Conviene configurarla en las variables de entorno del hosting.'
        );
      }

      // ── 2. Sesión ─────────────────────────────────────────────────────────
      const { data: session, error: sessionError } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      trace('2/5 sesión', { hayToken: !!token, error: sessionError?.message ?? null });
      if (!token) {
        return fail(
          'sesión',
          'Tu sesión expiró. Vuelve a iniciar sesión.',
          sessionError?.message ?? 'no hay token de acceso',
        );
      }

      // ── 3. Red ────────────────────────────────────────────────────────────
      let res: Response;
      try {
        res = await fetch(endpoint, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cedula: cedula.replace(/\D/g, ''),
            consentimiento: true,
            incluir_imagen: true,
          }),
        });
      } catch (networkError) {
        // `fetch` lanza por tres motivos muy distintos y el navegador NO los distingue en el
        // mensaje ("Failed to fetch" para todos). Se separa con una sonda: una petición
        // `no-cors` no dispara preflight y su promesa solo se rechaza si el servidor no
        // respondió NADA. Si resuelve, el servidor sí contestó y lo que falló fue CORS —que
        // en la práctica significa que la Edge Function no está desplegada, porque el gateway
        // de Supabase devuelve el 404 sin cabeceras CORS.
        let servidorRespondio = false;
        try {
          await fetch(endpoint, { method: 'POST', mode: 'no-cors', body: '{}' });
          servidorRespondio = true;
        } catch { /* el servidor tampoco respondió a la sonda */ }

        console.error('[JCE] sonda no-cors:', servidorRespondio ? 'el servidor respondió' : 'sin respuesta');
        return fail(
          'red',
          'No se pudo contactar el servicio de verificación.',
          servidorRespondio
            ? 'el servidor respondió pero el navegador bloqueó la respuesta por CORS. ' +
              'Casi siempre significa que la Edge Function `jce-lookup` NO está desplegada: ' +
              'ejecuta `supabase functions deploy jce-lookup`.'
            : `no hubo respuesta de ${endpoint}. Revisa la conexión y que la URL del ` +
              'proyecto Supabase sea la correcta.',
          networkError,
        );
      }

      trace('3/5 respuesta HTTP', {
        status: res.status,
        contentType: res.headers.get('content-type'),
      });

      // ── 4. Cuerpo ─────────────────────────────────────────────────────────
      const raw = await res.text();
      let payload: ApiPayload;
      try {
        payload = JSON.parse(raw);
      } catch {
        const looksLikeHtml = raw.trimStart().startsWith('<');
        return fail(
          'respuesta',
          'El servicio de verificación devolvió una respuesta ilegible.',
          looksLikeHtml
            ? `HTTP ${res.status} devolvió HTML, no JSON. La petición no llegó a la Edge ` +
              'Function: revisa que la URL del proyecto Supabase sea correcta.'
            : `HTTP ${res.status} con un cuerpo que no es JSON: ${raw.slice(0, 200)}`,
        );
      }

      trace('4/5 cuerpo', { ok: res.ok, codigo: payload.error?.code ?? null, meta: payload.meta });

      // ── 5. Resultado ──────────────────────────────────────────────────────
      if (!res.ok || !payload.data) {
        const code = payload.error?.code ?? `HTTP_${res.status}`;
        const hints: Record<string, string> = {
          NOT_CONFIGURED:
            'la función está desplegada pero PERSONA_SEGURA_URL apunta a un sitio vacío. ' +
            'El proveedor por defecto no necesita clave: basta con borrar ese secreto.',
          NETWORK_ERROR:
            'la Edge Function no pudo contactar al proveedor de la JCE (psbi.me). ' +
            'Puede ser una caída pasajera del proveedor o que se agotara el tiempo de espera.',
          UNAUTHORIZED: 'la Edge Function rechazó el token de sesión.',
          NOT_FOUND: 'el proveedor no tiene datos para esa cédula.',
          CONSENT_REQUIRED: 'falta el consentimiento del titular.',
          VALIDATION_FAILED: 'la cédula no pasó la validación del servidor.',
          INTERNAL_ERROR:
            'la función falló por dentro. Mira sus registros en el panel de Supabase ' +
            '(Edge Functions → jce-lookup → Logs).',
          HTTP_404:
            'la Edge Function `jce-lookup` no existe en el proyecto. Despliégala con ' +
            '`supabase functions deploy jce-lookup`.',
        };
        return fail(
          'servicio',
          payload.error?.message || 'No se pudo verificar la cédula.',
          hints[code] ?? `el servicio respondió ${code}.`,
        );
      }

      trace('5/5 verificada', { desdeCache: payload.meta?.cached === true });

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
      return fail(
        'inesperado',
        'No se pudo verificar la cédula.',
        e instanceof Error ? `${e.name}: ${e.message}` : 'error desconocido',
        e,
      );
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    lookup,
    loading,
    error,
    /** Detalle técnico de la etapa que falló, para diagnosticar sin abrir la consola. */
    diagnostic,
    clearError: () => { setError(null); setDiagnostic(null); },
  };
};
