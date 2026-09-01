// ============================================================================
// MANTENER VIVA LA SESIÓN — decisiones de cuándo refrescar
// ============================================================================
// Funciones puras, sin acceso a Supabase ni al DOM, para poder probarlas.
//
// EL PROBLEMA QUE RESUELVEN
//
// El token de acceso de Supabase caduca a la hora (`JWT expiry`, 3600 s por defecto). El SDK
// lo renueva solo mediante un `setInterval` que se dispara cada 30 s... mientras el navegador
// deje correr ese temporizador.
//
// Y no lo deja: en una pestaña en segundo plano los temporizadores se estrangulan a uno por
// minuto, y si el equipo se suspende se congelan del todo. Una hora de inactividad —la
// pestaña detrás, o el portátil dormido— y el temporizador nunca corre. Al volver, el token
// ya caducó: la sesión se cae.
//
// La solución es no depender solo de ese temporizador:
//   · Refrescar de forma ANTICIPADA mientras la app se usa, con margen de sobra.
//   · Volver a comprobar en los momentos en que el navegador revive la pestaña: al hacerse
//     visible, al recuperar el foco y al volver la conexión.

/** Margen antes de la caducidad en el que ya conviene renovar. */
export const REFRESH_MARGIN_SECONDS = 600; // 10 minutos

/** Nunca se comprueba más seguido que esto, para no machacar. */
export const MIN_CHECK_MS = 15_000;

/**
 * Ni más espaciado que esto. Es deliberadamente corto (4 min): los navegadores estrangulan
 * los temporizadores de las pestañas en segundo plano a uno por minuto, así que un intervalo
 * largo se convierte en impredecible. Con 4 min, aunque se estire, sigue dentro del margen.
 */
export const MAX_CHECK_MS = 240_000;

/**
 * Segundos que faltan para que caduque el token.
 *
 * `expires_at` de Supabase viene en segundos UNIX (no milisegundos). Devuelve `null` cuando
 * no se sabe, que no es lo mismo que 0: sin dato NO hay que forzar un refresco.
 */
export const secondsUntilExpiry = (
  expiresAt: number | null | undefined,
  nowMs: number,
): number | null => {
  if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt) || expiresAt <= 0) return null;
  return Math.round(expiresAt - nowMs / 1000);
};

/**
 * ¿Toca renovar ya?
 *
 * Sí cuando falta menos que el margen, incluido el caso de que ya haya caducado (negativo).
 * Sin `expires_at` devuelve `false`: no se puede decidir a ciegas.
 */
export const shouldRefreshSession = (
  expiresAt: number | null | undefined,
  nowMs: number,
  marginSeconds: number = REFRESH_MARGIN_SECONDS,
): boolean => {
  const remaining = secondsUntilExpiry(expiresAt, nowMs);
  if (remaining === null) return false;
  return remaining <= marginSeconds;
};

/** El token ya caducó: cualquier petición fallaría con 401. */
export const isExpired = (expiresAt: number | null | undefined, nowMs: number): boolean => {
  const remaining = secondsUntilExpiry(expiresAt, nowMs);
  return remaining !== null && remaining <= 0;
};

/**
 * Cuánto esperar hasta la próxima comprobación.
 *
 * Se apunta al momento en que empieza el margen de renovación, pero acotado entre
 * `MIN_CHECK_MS` y `MAX_CHECK_MS`. Sin `expires_at` se usa el máximo.
 */
export const nextCheckDelayMs = (
  expiresAt: number | null | undefined,
  nowMs: number,
  marginSeconds: number = REFRESH_MARGIN_SECONDS,
): number => {
  const remaining = secondsUntilExpiry(expiresAt, nowMs);
  if (remaining === null) return MAX_CHECK_MS;
  const untilRefreshMs = (remaining - marginSeconds) * 1000;
  return Math.min(MAX_CHECK_MS, Math.max(MIN_CHECK_MS, untilRefreshMs));
};

/**
 * Espera antes de reintentar un refresco fallido: 1 s, 2 s, 4 s, 8 s… con tope de 30 s.
 *
 * El caso típico es volver de suspender el equipo: la red todavía no está lista y el primer
 * intento falla. Un par de reintentos separados lo resuelven sin molestar al usuario.
 */
export const retryDelayMs = (attempt: number): number => {
  const n = Math.max(0, Math.floor(attempt));
  return Math.min(30_000, 1000 * 2 ** n);
};

/** Cuántas veces reintentar antes de dar la sesión por perdida. */
export const MAX_REFRESH_RETRIES = 4;
