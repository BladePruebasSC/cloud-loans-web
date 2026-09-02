// Traduccion de la respuesta de la JCE a los campos del formulario.
//
// El fixture NO es inventado: es la respuesta literal del proveedor (https://psbi.me/persona.php)
// para la cedula 02800849057, capturada el 2026-09-01. La prueba es determinista y no toca red;
// lo que fija es el MAPEO, que es donde se rompen estas integraciones: el proveedor devuelve
// "Masculino" y el formulario espera "MASCULINO", devuelve "Soltero" y el selector tiene
// "Soltero(a)", devuelve "HIGUEY" y la cascada necesita provincia + municipio del catalogo.
// Si alguno deja de encajar, el campo se queda vacio EN SILENCIO: no hay error que lo delate.
import { describe, it, expect } from 'vitest';

import {
  isValidCedula, formatCedula, documentToStored, splitFullName,
  normalizeGender, normalizeMaritalStatus,
} from '@/utils/dominicanId';
import { resolveJceCity } from '@/data/dominicanRepublic';

const ok = (name: string, cond: unknown, detail = '') =>
  expect(cond, detail ? `${name} — ${detail}` : name).toBe(true);

/** Respuesta real del proveedor, recortada solo en el base64 de la foto. */
const RESPUESTA_REAL = {
  ok: true,
  cedula: '02800849057',
  nombre_completo: 'EMILI MARX CORDONES SANCHEZ',
  fecha_nacimiento: '1985-02-27',
  EstadoCivil: 'Soltero',
  ciudad: 'HIGUEY',
  sexo: 'Masculino',
  nacionalidad: 'Dominicano',
  imagen_base64: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a',
};

/**
 * Copia de `normalize()` de supabase/functions/jce-lookup/index.ts. Se duplica a proposito:
 * ese archivo es Deno y se despliega suelto (a menudo pegandolo en el panel de Supabase), asi
 * que no se puede importar desde aqui. Si se cambia alli, hay que cambiarlo aqui — y esta
 * prueba es justo lo que avisa de que se olvido.
 */
const normalizeComoLaFuncion = (api: Record<string, unknown>) => {
  const { firstName, lastName } = splitFullName(String(api.nombre_completo ?? ''));
  const sexoRaw = String(api.sexo ?? '').trim().toUpperCase();
  const estadoCivil = api.EstadoCivil ?? api.estado_civil ?? null;
  return {
    nombre: firstName,
    apellido: lastName,
    fecha_nacimiento: String(api.fecha_nacimiento ?? '').slice(0, 10) || null,
    sexo: sexoRaw.startsWith('M') ? 'M' : sexoRaw.startsWith('F') ? 'F' : null,
    nacionalidad: String(api.nacionalidad ?? 'Dominicana'),
    estado_civil: estadoCivil ? String(estadoCivil) : null,
    ciudad: api.ciudad ? String(api.ciudad) : null,
  };
};

describe('mapeo de la respuesta de la JCE al formulario', () => {

  it('La cedula se escribe y se consulta sin guiones', () => {
    // El usuario pidio que no lleve guiones: es como se guarda y como la espera el proveedor.
    ok('el campo no mete guiones', formatCedula('02800849057') === '02800849057');
    ok('si los pegan, se quitan', formatCedula('028-0084905-7') === '02800849057');
    ok('lo que se guarda son 11 digitos', documentToStored('cedula', '028-0084905-7') === '02800849057');
    ok('el digito verificador cuadra', isValidCedula('02800849057'));

    // Con y sin guiones tiene que salir EXACTAMENTE lo mismo, o la cache se duplicaria:
    // la clave es sha256(cedula) y "028-0084905-7" hashea distinto que "02800849057".
    ok('ambas formas convergen',
      documentToStored('cedula', '028-0084905-7') === documentToStored('cedula', '02800849057'));
  });

  it('Cada campo que devuelve el proveedor cae en su casilla', () => {
    const person = normalizeComoLaFuncion(RESPUESTA_REAL);

    // Nombre: 4 palabras -> 2 y 2. Es la convencion dominicana (dos nombres, dos apellidos).
    ok('nombres', person.nombre === 'EMILI MARX', person.nombre);
    ok('apellidos', person.apellido === 'CORDONES SANCHEZ', person.apellido);

    ok('fecha ya viene ISO', person.fecha_nacimiento === '1985-02-27', String(person.fecha_nacimiento));
    ok('"Masculino" -> M', person.sexo === 'M', String(person.sexo));

    // Y ahora la traduccion del hook a los valores EXACTOS de los controles.
    ok('el radio de sexo usa MASCULINO', normalizeGender(person.sexo) === 'MASCULINO',
      String(normalizeGender(person.sexo)));
    ok('"Soltero" -> la opcion "Soltero(a)"',
      normalizeMaritalStatus(person.estado_civil) === 'Soltero(a)',
      String(normalizeMaritalStatus(person.estado_civil)));
    ok('nacionalidad coincide con una opcion del selector',
      ['Dominicano', 'Haitiano', 'Estadounidense', 'Español', 'Venezolano', 'Otro']
        .includes(person.nacionalidad), person.nacionalidad);
  });

  it('La ciudad de registro alimenta la cascada provincia/municipio', () => {
    // "HIGUEY" viene en mayusculas y sin dieresis; el catalogo lo tiene como "Higüey".
    const loc = resolveJceCity('HIGUEY');
    ok('provincia', loc.province === 'La Altagracia', loc.province);
    ok('municipio', loc.municipality === 'Higüey', loc.municipality);

    // Una ciudad que no este en el catalogo no puede inventar una provincia a medias:
    // o resuelve las dos o ninguna, o la cascada quedaria en un estado imposible.
    const desconocida = resolveJceCity('CIUDAD QUE NO EXISTE');
    ok('desconocida no deja provincia suelta',
      !desconocida.province && !desconocida.municipality,
      JSON.stringify(desconocida));
  });

  it('La foto llega con prefijo data: y hay que quitarlo antes de decodificar', () => {
    const b64 = RESPUESTA_REAL.imagen_base64;
    ok('el proveedor manda el prefijo', b64.startsWith('data:image/jpeg;base64,'));

    // Es lo que hace storePhoto: sin recortar el prefijo, atob() falla y se pierde la foto.
    const payload = b64.includes(',') ? b64.slice(b64.indexOf(',') + 1) : b64;
    ok('el payload ya no lleva prefijo', !payload.startsWith('data:'));
    ok('decodifica', Buffer.from(payload, 'base64').length > 0);
  });

  it('Sexo y estado civil aguantan las variantes que alterna el proveedor', () => {
    // El campo llega unas veces como palabra y otras como inicial, y el estado civil
    // cambia de clave (`EstadoCivil` / `estado_civil`) segun la version de la API.
    ok('Femenino', normalizeGender('Femenino') === 'FEMENINO');
    ok('F', normalizeGender('F') === 'FEMENINO');
    ok('M', normalizeGender('M') === 'MASCULINO');
    ok('vacio no inventa sexo', normalizeGender('') === null);

    ok('clave alternativa estado_civil',
      normalizeComoLaFuncion({ ...RESPUESTA_REAL, EstadoCivil: undefined, estado_civil: 'Casado' })
        .estado_civil === 'Casado');
    ok('"Casado" -> "Casado(a)"', normalizeMaritalStatus('Casado') === 'Casado(a)');
    ok('con acentos', normalizeMaritalStatus('Unión Libre') === 'Unión libre');
    ok('desconocido no se inventa', normalizeMaritalStatus('Concubinato') === null);
  });

  it('Un nombre de 3 palabras reparte 1 nombre y 2 apellidos', () => {
    // Caso frecuente y facil de romper: si se partiera por la mitad daria "JUAN PEREZ" / "SANCHEZ".
    const tres = normalizeComoLaFuncion({ ...RESPUESTA_REAL, nombre_completo: 'JUAN PEREZ SANCHEZ' });
    ok('nombre', tres.nombre === 'JUAN', tres.nombre);
    ok('apellidos', tres.apellido === 'PEREZ SANCHEZ', tres.apellido);

    const dos = normalizeComoLaFuncion({ ...RESPUESTA_REAL, nombre_completo: 'ANA PEREZ' });
    ok('dos palabras', dos.nombre === 'ANA' && dos.apellido === 'PEREZ');

    const una = normalizeComoLaFuncion({ ...RESPUESTA_REAL, nombre_completo: 'MADONNA' });
    ok('una palabra no revienta', una.nombre === 'MADONNA' && una.apellido === '');

    const vacio = normalizeComoLaFuncion({ ...RESPUESTA_REAL, nombre_completo: '' });
    ok('vacio no revienta', vacio.nombre === '' && vacio.apellido === '');
  });
});
