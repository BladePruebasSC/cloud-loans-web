// ============================================================================
// Traducción de errores de Supabase a algo que se pueda leer en pantalla
// ============================================================================
// Los errores de PostgREST son OBJETOS PLANOS, no instancias de `Error`. El patrón
// `error instanceof Error ? error.message : 'mensaje genérico'` —que estaba repetido por
// todo el sistema— siempre caía en el genérico, así que la causa real solo se veía abriendo
// la consola del navegador.
//
// El caso más frecuente con diferencia es la DERIVA DE ESQUEMA: el código escribe una
// columna que la base de datos todavía no tiene porque falta aplicar una migración. Eso
// devuelve un 400 con el nombre de la columna dentro del mensaje, y merece un aviso propio
// que diga qué hacer en vez de "no se pudo guardar".

/** Forma de un error de PostgREST. Todos los campos pueden faltar. */
interface PostgrestLikeError {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

/**
 * Códigos que significan «esa columna no existe»:
 *   · PGRST204 — PostgREST no encontró la columna en su caché de esquema.
 *   · 42703    — `undefined_column` de Postgres.
 */
const MISSING_COLUMN_CODES = new Set(['PGRST204', '42703']);

/**
 * Nombre de la columna que falta, o `null` si el error no es de ese tipo.
 *
 * El mensaje cambia de forma según por dónde salte el error, así que se prueban las
 * redacciones conocidas en vez de fiarse de una sola.
 */
export const findMissingColumn = (error: unknown): string | null => {
  const e = (error ?? {}) as PostgrestLikeError;
  const texto = `${e.message ?? ''} ${e.details ?? ''}`;

  const patrones = [
    /Could not find the '([a-zA-Z0-9_]+)' column/i,   // PGRST204
    /column "([a-zA-Z0-9_]+)" of relation/i,          // 42703 al escribir
    /column ([a-zA-Z0-9_.]+) does not exist/i,        // 42703 al leer
  ];
  for (const patron of patrones) {
    const hit = texto.match(patron);
    if (hit) return hit[1].replace(/^.*\./, '');
  }

  // El código dice que falta una columna aunque no se pueda extraer cuál.
  return MISSING_COLUMN_CODES.has(String(e.code)) ? 'desconocida' : null;
};

/**
 * Mensaje listo para un toast.
 *
 * @param error    Lo que llegó al `catch`.
 * @param fallback Qué decir cuando el error no se reconoce (p. ej. 'No se pudo guardar el cliente').
 */
export const describeSupabaseError = (error: unknown, fallback: string): string => {
  const columna = findMissingColumn(error);
  if (columna) {
    return `La base de datos no tiene la columna "${columna}". Falta aplicar una migración ` +
      `pendiente en Supabase: ejecuta supabase/APLICAR_MIGRACIONES_PENDIENTES.sql.`;
  }

  const e = (error ?? {}) as PostgrestLikeError;

  // Violación de unicidad: el mensaje crudo de Postgres no dice nada útil al usuario.
  if (e.code === '23505') {
    return 'Ya existe un registro con esos datos.';
  }
  // Fila bloqueada por RLS: casi siempre es que el registro es de otra empresa.
  if (e.code === '42501' || e.code === 'PGRST301') {
    return 'No tienes permiso sobre ese registro.';
  }

  if (error instanceof Error && error.message) return error.message;
  if (e.message) return e.message;
  return fallback;
};
