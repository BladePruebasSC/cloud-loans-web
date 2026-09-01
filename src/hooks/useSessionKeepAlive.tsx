// ============================================================================
// MANTENER VIVA LA SESIÓN
// ============================================================================
// Evita que la sesión se caiga tras un rato de inactividad.
//
// El SDK de Supabase renueva el token con un `setInterval` cada 30 s. El navegador estrangula
// ese temporizador cuando la pestaña pasa a segundo plano y lo congela si el equipo se
// suspende, así que en una hora inactiva puede no correr ni una vez. Cuando el usuario
// vuelve, el token (que dura 3600 s) ya caducó.
//
// Este hook añade tres redes:
//   1. Renovación ANTICIPADA mientras la app se usa, con 10 minutos de margen.
//   2. Recomprobación en los momentos en que el navegador revive la pestaña: al hacerse
//      visible, al recuperar el foco de la ventana y al volver la conexión.
//   3. Reintentos con espera creciente si el refresco falla — el caso típico es volver de
//      suspender el equipo con la red aún sin levantar.
//
// No cierra la sesión por su cuenta: si tras todos los reintentos no hay sesión, avisa al
// que lo usa mediante `onSessionLost` y que decida.

import { useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  MAX_REFRESH_RETRIES, isExpired, nextCheckDelayMs, retryDelayMs, shouldRefreshSession,
} from '@/utils/sessionKeepAlive';

interface Options {
  /** Solo trabaja cuando hay alguien con sesión iniciada. */
  enabled: boolean;
  /** Se llama cuando la sesión se pierde de verdad, tras agotar los reintentos. */
  onSessionLost?: () => void;
}

export const useSessionKeepAlive = ({ enabled, onSessionLost }: Options) => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runningRef = useRef(false);
  const retriesRef = useRef(0);
  const onSessionLostRef = useRef(onSessionLost);

  useEffect(() => { onSessionLostRef.current = onSessionLost; }, [onSessionLost]);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  /**
   * Comprueba la sesión y la renueva si le queda poco.
   * Se reprograma siempre a sí misma, así que basta con llamarla una vez.
   */
  const check = useCallback(async (reason: string) => {
    // Sin `enabled` no hay nada que mantener; el `runningRef` evita que dos disparos
    // simultáneos (p. ej. visibilidad + foco, que llegan juntos) refresquen dos veces.
    if (!enabled || runningRef.current) return;
    runningRef.current = true;

    try {
      const { data, error } = await supabase.auth.getSession();
      const session = data?.session ?? null;

      if (error || !session) {
        // Sin sesión y sin error: el usuario cerró sesión. No hay nada que reintentar.
        if (!error) { retriesRef.current = 0; return; }
        throw error;
      }

      const now = Date.now();
      if (shouldRefreshSession(session.expires_at, now)) {
        const wasExpired = isExpired(session.expires_at, now);
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();

        if (refreshError || !refreshed?.session) {
          retriesRef.current += 1;
          console.warn(
            `Sesión: fallo al renovar (${reason}), intento ${retriesRef.current}/${MAX_REFRESH_RETRIES}`,
            refreshError?.message,
          );

          if (retriesRef.current >= MAX_REFRESH_RETRIES) {
            retriesRef.current = 0;
            onSessionLostRef.current?.();
            return;
          }

          clearTimer();
          timerRef.current = setTimeout(
            () => { void check('reintento'); },
            retryDelayMs(retriesRef.current - 1),
          );
          return;
        }

        retriesRef.current = 0;
        if (wasExpired) {
          console.log('Sesión: token caducado renovado al volver a la app');
        }
      } else {
        retriesRef.current = 0;
      }

      // Reprogramar la siguiente comprobación con la caducidad ya actualizada.
      const { data: latest } = await supabase.auth.getSession();
      clearTimer();
      timerRef.current = setTimeout(
        () => { void check('periódico'); },
        nextCheckDelayMs(latest?.session?.expires_at, Date.now()),
      );
    } catch (e) {
      console.warn('Sesión: error comprobando la sesión', e instanceof Error ? e.message : e);
      retriesRef.current += 1;
      if (retriesRef.current >= MAX_REFRESH_RETRIES) {
        retriesRef.current = 0;
        onSessionLostRef.current?.();
        return;
      }
      clearTimer();
      timerRef.current = setTimeout(
        () => { void check('reintento'); },
        retryDelayMs(retriesRef.current - 1),
      );
    } finally {
      runningRef.current = false;
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      clearTimer();
      return;
    }

    // Comprobación inicial y arranque del ciclo.
    void check('inicio');

    // Al volver a la pestaña: se rearma el refresco del SDK (que pudo quedar parado con la
    // pestaña oculta) y se comprueba de inmediato.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') {
        void supabase.auth.stopAutoRefresh();
        return;
      }
      void supabase.auth.startAutoRefresh();
      void check('pestaña visible');
    };

    const onFocus = () => { void check('foco'); };
    const onOnline = () => { retriesRef.current = 0; void check('conexión restablecida'); };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);

    return () => {
      clearTimer();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
    };
  }, [enabled, check]);
};

export default useSessionKeepAlive;
