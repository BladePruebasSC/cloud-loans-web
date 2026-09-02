// ============================================================================
// jce-lookup — verificación de cédula dominicana contra la JCE (persona_segura)
// ============================================================================
// Equivalente en este stack (React + Supabase, sin servidor de aplicación) del
// LookupController + PersonaSeguraService del diseño PHP de referencia.
//
// Toda la lógica de red vive AQUÍ. El navegador no habla con el proveedor: llama a esta
// función con su JWT de Supabase y recibe únicamente los datos normalizados. Esto no es solo
// por la clave —el proveedor actual no pide ninguna— sino porque la auditoría de la Ley
// 172-13, la caché y el hasheo de la cédula tienen que ocurrir en un sitio que el cliente no
// pueda saltarse.
//
// Privacidad (Ley 172-13 RD) — reglas que no se rompen:
//   · Consentimiento del titular obligatorio, revalidado en el servidor (no basta el front).
//   · Dígito verificador revalidado en el servidor.
//   · La cédula en claro NUNCA se persiste: se guarda `sha256(cedula)`; en la auditoría,
//     solo los 16 primeros caracteres de ese hash.
//   · La API key nunca sale de aquí ni se escribe en logs.
//   · Cada intento se audita: empresa, usuario, resultado, IP y user-agent.
//   · La foto se guarda en un bucket privado con el ID de la fila de caché como nombre y se
//     devuelve como URL firmada de corta duración: el path no deriva de la cédula.
//
// Diferencias deliberadas con el diseño PHP original:
//   · CSRF → JWT de Supabase. No hay cookies de sesión, así que un token de sesión válido
//     (y la comprobación de que el usuario existe) cumple la misma función.
//   · Caché de 2 niveles, no 3. El nivel "filesystem" del original no aplica: una Edge
//     Function no tiene disco persistente. Postgres cubre lo que hacían los niveles 1 y 2.
//   · Sin quitado de marca de agua: era GD de PHP y no hay equivalente en Deno. La foto se
//     guarda tal como la envía la API.
//   · No hay reintento «sin verificar SSL»: Deno no permite desactivar la verificación de
//     certificados por petición, y hacerlo abriría la puerta a un intermediario. Si el
//     certificado del proveedor falla, se devuelve un error de red claro.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Proveedor por defecto. Se pone aquí y no solo en un secreto porque el servicio NO pide
 * clave: sin este valor la función quedaría sin configurar por omisión y la verificación no
 * funcionaría hasta que alguien recordara registrar la variable.
 * `PERSONA_SEGURA_URL` lo sigue sobrescribiendo si algún día cambia el proveedor.
 */
const DEFAULT_ENDPOINT = 'https://psbi.me/persona.php';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const fail = (status: number, code: string, message: string) =>
  json({ error: { code, message } }, status);

// ---------------------------------------------------------------------------
// Validación
// ---------------------------------------------------------------------------

const onlyDigits = (v: string) => String(v ?? '').replace(/\D/g, '');

/** Dígito verificador de la cédula dominicana (Luhn con multiplicadores 1,2 alternos). */
function isValidCedula(value: string): boolean {
  const d = onlyDigits(value);
  if (d.length !== 11) return false;
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    let mult = Number(d[i]) * (i % 2 === 0 ? 1 : 2);
    if (mult > 9) mult -= 9;
    sum += mult;
  }
  return ((10 - (sum % 10)) % 10) === Number(d[10]);
}

async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ---------------------------------------------------------------------------
// Normalización de la respuesta de la API
// ---------------------------------------------------------------------------

function splitFullName(fullName: string): { nombre: string; apellido: string } {
  const parts = String(fullName ?? '').trim().split(/\s+/).filter(Boolean);
  const n = parts.length;
  if (n === 0) return { nombre: '', apellido: '' };
  if (n === 1) return { nombre: parts[0], apellido: '' };
  if (n === 2) return { nombre: parts[0], apellido: parts[1] };
  if (n === 3) return { nombre: parts[0], apellido: `${parts[1]} ${parts[2]}` };
  const mid = Math.ceil(n / 2);
  return { nombre: parts.slice(0, mid).join(' '), apellido: parts.slice(mid).join(' ') };
}

/** Cualquier fecha reconocible → YYYY-MM-DD. `null` si no se entiende. */
function normalizeDate(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // Formatos dd/mm/yyyy y dd-mm-yyyy, habituales en respuestas locales
  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const [, d, m, y] = dmy;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

interface NormalizedPerson {
  nombre: string;
  apellido: string;
  fecha_nacimiento: string | null;
  sexo: 'M' | 'F' | null;
  nacionalidad: string;
  estado_civil: string | null;
  ciudad: string | null;
}

function normalize(api: Record<string, unknown>): NormalizedPerson {
  const { nombre, apellido } = splitFullName(String(api.nombre_completo ?? ''));

  const sexoRaw = String(api.sexo ?? '').trim().toUpperCase();
  const sexo = sexoRaw.startsWith('M') ? 'M' : sexoRaw.startsWith('F') ? 'F' : null;

  // La API alterna entre `EstadoCivil` y `estado_civil` según la versión.
  const estadoCivil = api.EstadoCivil ?? api.estado_civil ?? null;

  return {
    nombre,
    apellido,
    fecha_nacimiento: normalizeDate(api.fecha_nacimiento),
    sexo,
    nacionalidad: String(api.nacionalidad ?? 'Dominicana'),
    estado_civil: estadoCivil ? String(estadoCivil) : null,
    ciudad: api.ciudad ? String(api.ciudad) : null,
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED', 'Método no permitido.');

  const admin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const userAgent = req.headers.get('user-agent')?.slice(0, 255) ?? null;

  /** Auditoría. Nunca recibe la cédula: solo el prefijo del hash. */
  const audit = async (
    hash: string, resultado: string, companyId: string | null, userId: string | null,
  ) => {
    const { error } = await admin.from('persona_lookups').insert({
      cedula_hash: hash.slice(0, 16),
      resultado,
      company_id: companyId,
      user_id: userId,
      ip,
      user_agent: userAgent,
    });
    if (error) console.error('jce-lookup: fallo al auditar', error.message);
  };

  try {
    // --- 1. Autenticación (sustituye al CSRF del diseño original) ---------
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) return fail(401, 'UNAUTHORIZED', 'Sesión no válida. Vuelve a iniciar sesión.');

    const { data: { user }, error: userError } = await admin.auth.getUser(token);
    if (userError || !user) {
      return fail(401, 'UNAUTHORIZED', 'Sesión no válida. Vuelve a iniciar sesión.');
    }

    // Empresa a la que pertenece quien consulta (dueño o empleado), solo para la auditoría.
    let companyId: string | null = user.id;
    const { data: employee } = await admin
      .from('employees').select('company_owner_id').eq('auth_user_id', user.id).maybeSingle();
    if (employee?.company_owner_id) companyId = employee.company_owner_id as string;

    // --- 2. Entrada -------------------------------------------------------
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return fail(400, 'BAD_REQUEST', 'Cuerpo de la petición inválido.');
    }

    const cedulaRaw = String(body.cedula ?? '');
    const consentimiento = body.consentimiento === true;
    const incluirImagen = body.incluir_imagen !== false;

    // El consentimiento se revalida AQUÍ: que el front tenga una casilla marcada no
    // demuestra nada, cualquiera puede llamar a este endpoint directamente.
    if (!consentimiento) {
      return fail(422, 'CONSENT_REQUIRED',
        'El titular debe autorizar la consulta de sus datos en bases externas (Ley 172-13).');
    }

    const cedula = onlyDigits(cedulaRaw);
    if (cedula.length !== 11) {
      return fail(422, 'VALIDATION_FAILED', 'La cédula debe tener 11 dígitos.');
    }
    if (!isValidCedula(cedula)) {
      return fail(422, 'VALIDATION_FAILED',
        'Cédula dominicana inválida: el dígito verificador no coincide.');
    }

    const hash = await sha256Hex(cedula);

    // --- 3. Nivel 1: caché en base de datos -------------------------------
    const ttlDays = Number(Deno.env.get('PERSONA_SEGURA_CACHE_DIAS') ?? '30') || 30;
    const { data: cached } = await admin
      .from('personas_cache').select('*').eq('cedula_hash', hash).maybeSingle();

    if (cached) {
      const ageMs = Date.now() - new Date(cached.creado_en as string).getTime();
      const fresh = ttlDays <= 0 || ageMs < ttlDays * 86_400_000;
      if (fresh) {
        await admin.from('personas_cache').update({
          consultas_count: (cached.consultas_count as number) + 1,
          ultima_consulta_en: new Date().toISOString(),
        }).eq('id', cached.id);

        await audit(hash, 'ok_cache_db', companyId, user.id);
        return json(await buildResponse(admin, cached, 'cache_db', true, incluirImagen));
      }
    }

    // --- 4. Nivel 2: la API real -----------------------------------------
    // El proveedor NO exige clave: `POST cedula=<11 dígitos>` basta y responde JSON.
    // Verificado contra el servicio real. La clave queda soportada por si algún día la
    // piden, pero su ausencia NO es motivo para no consultar.
    const endpoint = (Deno.env.get('PERSONA_SEGURA_URL') ?? '').trim() || DEFAULT_ENDPOINT;
    const apiKey = (Deno.env.get('PERSONA_SEGURA_KEY') ?? '').trim();

    const timeoutSec = Number(Deno.env.get('PERSONA_SEGURA_TIMEOUT') ?? '8') || 8;
    let apiResp: Record<string, unknown>;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutSec * 1000);
      const headers: Record<string, string> = {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'cloud-loans-web/1.0',
      };
      // Enviar `X-API-KEY` vacía haría que un proveedor estricto rechazara la petición.
      if (apiKey) headers['X-API-KEY'] = apiKey;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        // La cédula va SIN guiones: `onlyDigits` ya la dejó en 11 dígitos.
        body: new URLSearchParams({ cedula }).toString(),
        signal: controller.signal,
      }).finally(() => clearTimeout(timer));

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      apiResp = await res.json();
    } catch (e) {
      // El mensaje del error puede contener la URL, nunca la cédula ni la clave.
      console.error('jce-lookup: fallo de red', e instanceof Error ? e.message : 'desconocido');
      await audit(hash, 'error_red', companyId, user.id);
      return fail(502, 'NETWORK_ERROR',
        'No se pudo contactar el servicio de verificación. Inténtalo de nuevo en un momento.');
    }

    if (!apiResp || apiResp.ok !== true) {
      await audit(hash, 'no_encontrado', companyId, user.id);
      return fail(404, 'NOT_FOUND',
        String(apiResp?.error ?? 'Cédula no encontrada en la JCE.'));
    }

    // --- 5. Normalizar, guardar la foto y persistir -----------------------
    const person = normalize(apiResp);

    const { data: saved, error: saveError } = await admin
      .from('personas_cache')
      .upsert({
        cedula_hash: hash,
        ...person,
        fuente: 'persona_segura',
        consultas_count: 1,
        ultima_consulta_en: new Date().toISOString(),
        creado_en: new Date().toISOString(),
      }, { onConflict: 'cedula_hash' })
      .select()
      .single();

    if (saveError || !saved) {
      console.error('jce-lookup: no se pudo guardar la caché', saveError?.message);
      await audit(hash, 'error_cache', companyId, user.id);
      // La consulta salió bien: se devuelve el dato aunque la caché falle.
      return json({
        data: { ...person, provincia: null, imagen_url: null, persona_cache_id: null },
        meta: { fuente: 'persona_segura', cached: false },
      });
    }

    // La foto se nombra con el ID de la fila de caché, NO con el hash de la cédula:
    // así el path no deriva en absoluto del documento.
    let imagenPath: string | null = null;
    const base64 = typeof apiResp.imagen_base64 === 'string' ? apiResp.imagen_base64 : '';
    if (base64) {
      imagenPath = await storePhoto(admin, String(saved.id), base64);
      if (imagenPath) {
        await admin.from('personas_cache').update({ imagen_path: imagenPath }).eq('id', saved.id);
      }
    }

    await audit(hash, 'ok_api', companyId, user.id);
    return json(await buildResponse(
      admin, { ...saved, imagen_path: imagenPath }, 'persona_segura', false, incluirImagen,
    ));
  } catch (e) {
    console.error('jce-lookup: error inesperado', e instanceof Error ? e.message : 'desconocido');
    return fail(500, 'INTERNAL_ERROR', 'Error inesperado al verificar la cédula.');
  }
});

// ---------------------------------------------------------------------------
// Foto
// ---------------------------------------------------------------------------

/** Decodifica el base64 y lo guarda en el bucket privado. Devuelve el nombre del archivo. */
async function storePhoto(
  admin: ReturnType<typeof createClient>, cacheId: string, base64: string,
): Promise<string | null> {
  try {
    const payload = base64.includes(',') ? base64.slice(base64.indexOf(',') + 1) : base64;
    const binary = Uint8Array.from(atob(payload), c => c.charCodeAt(0));
    // Una respuesta con menos de 100 bytes no es una foto: probablemente un error codificado.
    if (binary.length < 100) return null;

    const fileName = `${cacheId}.jpg`;
    const { error } = await admin.storage
      .from('jce-photos')
      .upload(fileName, binary, { contentType: 'image/jpeg', upsert: true });
    if (error) {
      console.error('jce-lookup: no se pudo guardar la foto', error.message);
      return null;
    }
    return fileName;
  } catch (e) {
    console.error('jce-lookup: foto inválida', e instanceof Error ? e.message : 'desconocido');
    return null;
  }
}

/** Respuesta al navegador. La foto va como URL firmada de 10 minutos. */
async function buildResponse(
  admin: ReturnType<typeof createClient>,
  row: Record<string, unknown>,
  fuente: string,
  cached: boolean,
  incluirImagen: boolean,
) {
  let imagenUrl: string | null = null;
  if (incluirImagen && row.imagen_path) {
    const { data } = await admin.storage
      .from('jce-photos')
      .createSignedUrl(String(row.imagen_path), 600);
    imagenUrl = data?.signedUrl ?? null;
  }

  return {
    data: {
      nombre: row.nombre ?? '',
      apellido: row.apellido ?? '',
      fecha_nacimiento: row.fecha_nacimiento ?? null,
      sexo: row.sexo ?? null,
      nacionalidad: row.nacionalidad ?? 'Dominicana',
      estado_civil: row.estado_civil ?? null,
      ciudad: row.ciudad ?? null,
      imagen_url: imagenUrl,
      persona_cache_id: row.id ?? null,
    },
    meta: { fuente, cached },
  };
}
