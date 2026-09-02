// Generado a partir de las suites de la auditoria 2026-09-01.
// Prueban LOGICA FINANCIERA PURA: sin red, sin reloj, sin Supabase. Deterministas.
import { describe, it, expect } from 'vitest';

import {
  isValidCedula, formatCedula, formatGenericDocument, documentToStored, validateDocument,
  splitFullName, normalizeMaritalStatus, normalizeGender, supportsJceLookup, getDocumentTypeInfo,
  DOCUMENT_TYPES,
} from '@/utils/dominicanId';
import { resolveJceCity } from '@/data/dominicanRepublic';

/** Adapta el estilo `ok(nombre, condicion, detalle)` de las suites originales. */
const ok = (name: string, cond: unknown, detail = '') =>
  expect(cond, detail ? `${name} — ${detail}` : name).toBe(true);

describe("dominicanId + ciudades JCE", () => {


/** Calcula el digito verificador con el algoritmo de la JCE (para fabricar casos validos). */
const checkDigit = (first10) => {
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    let m = Number(first10[i]) * (i % 2 === 0 ? 1 : 2);
    if (m > 9) m -= 9;
    sum += m;
  }
  return (10 - (sum % 10)) % 10;
};
const makeCedula = (first10) => `${first10}${checkDigit(first10)}`;

  it("Digito verificador", () => {
  {
    // No se usan cedulas reales: se fabrican con el propio algoritmo y se comprueban
    // las PROPIEDADES que debe cumplir un digito de control.
    const bases = ['0011234567', '4021862900', '0010293847', '1234567890', '0000000000', '9999999999'];
    for (const b of bases) {
      const c = makeCedula(b);
      ok(`acepta ${c}`, isValidCedula(c) === true, c);
    }
  
    // Cambiar UN digito debe romper la validacion (propiedad basica de Luhn)
    let detected = 0, tried = 0;
    const base = makeCedula('0011234567');
    for (let pos = 0; pos < 11; pos++) {
      for (let d = 0; d <= 9; d++) {
        if (Number(base[pos]) === d) continue;
        tried++;
        const mutated = base.slice(0, pos) + d + base.slice(pos + 1);
        if (!isValidCedula(mutated)) detected++;
      }
    }
    ok('detecta el 100% de los errores de un solo digito', detected === tried, `${detected}/${tried}`);
  
    // Transponer dos digitos adyacentes distintos tambien debe detectarse
    let tDetected = 0, tTried = 0;
    for (let i = 0; i < 10; i++) {
      if (base[i] === base[i + 1]) continue;
      tTried++;
      const sw = base.slice(0, i) + base[i + 1] + base[i] + base.slice(i + 2);
      if (!isValidCedula(sw)) tDetected++;
    }
    ok('detecta transposiciones adyacentes', tDetected === tTried, `${tDetected}/${tTried}`);
  
    ok('rechaza menos de 11 digitos', !isValidCedula('0011234567'));
    ok('rechaza mas de 11 digitos', !isValidCedula('001123456789'));
    ok('rechaza vacio', !isValidCedula(''));
    ok('rechaza letras', !isValidCedula('ABCDEFGHIJK'));
    ok('ignora guiones', isValidCedula(`${base.slice(0, 3)}-${base.slice(3, 10)}-${base.slice(10)}`) === true);
    ok('ignora espacios', isValidCedula(` ${base} `) === true);
  }
  
  });

  it("Formato", () => {
  {
    // La cedula se escribe y se muestra SIN guiones: 11 digitos seguidos.
    ok('parcial 3', formatCedula('001') === '001');
    ok('parcial 7', formatCedula('0011234') === '0011234');
    ok('completa sin guiones', formatCedula('00112345678') === '00112345678');
    ok('recorta a 11', formatCedula('001123456789999') === '00112345678');
    ok('quita guiones pegados', formatCedula('001-1234567-8') === '00112345678');
    ok('ignora no digitos', formatCedula('001-abc-1234567-8') === '00112345678');
    ok('la cedula de prueba se mantiene', formatCedula('02800849057') === '02800849057');
  
    ok('generico en mayusculas', formatGenericDocument('a1234567') === 'A1234567');
    ok('generico sin simbolos', formatGenericDocument('A 123/456!') === 'A123456');
    ok('generico conserva guion', formatGenericDocument('AB-123') === 'AB-123');
  
    ok('cedula se guarda sin guiones', documentToStored('cedula', '001-1234567-8') === '00112345678');
    ok('pasaporte se guarda tal cual', documentToStored('pasaporte', 'a1234567') === 'A1234567');
  }
  
  });

  it("Validacion por tipo", () => {
  {
    const valida = makeCedula('0011234567');
    ok('cedula valida pasa', validateDocument('cedula', valida) === null);
    ok('cedula corta falla', /11 dígitos/.test(validateDocument('cedula', '00112345')));
    ok('cedula con digito malo falla',
      /dígito verificador/.test(validateDocument('cedula', valida.slice(0, 10) + ((Number(valida[10]) + 1) % 10))));
    ok('vacio es obligatorio', /obligatorio/.test(validateDocument('cedula', '')));
  
    ok('pasaporte valido', validateDocument('pasaporte', 'A1234567') === null);
    ok('pasaporte corto falla', validateDocument('pasaporte', 'A123') !== null);
    ok('pasaporte largo falla', validateDocument('pasaporte', 'A12345678901234') !== null);
    ok('pasaporte NO usa digito verificador', validateDocument('pasaporte', 'AB1234') === null);
  
    ok('dni valido', validateDocument('dni', '12345678X') === null);
    ok('dni corto falla', validateDocument('dni', '1234') !== null);
  
    ok('id valido', validateDocument('id', 'XYZ') === null);
    ok('id muy corto falla', validateDocument('id', 'X') !== null);
  }
  
  });

  it("Tipos de documento", () => {
  {
    ok('4 tipos', DOCUMENT_TYPES.length === 4, String(DOCUMENT_TYPES.length));
    ok('solo la cedula consulta la JCE',
      DOCUMENT_TYPES.filter(t => t.supportsJce).map(t => t.value).join() === 'cedula');
    ok('supportsJceLookup: cedula', supportsJceLookup('cedula') === true);
    ok('supportsJceLookup: pasaporte', supportsJceLookup('pasaporte') === false);
    ok('supportsJceLookup: dni', supportsJceLookup('dni') === false);
    ok('supportsJceLookup: id', supportsJceLookup('id') === false);
    ok('tipo desconocido cae en cedula', getDocumentTypeInfo('otro').value === 'cedula');
  }
  
  });

  it("Dividir el nombre completo de la JCE", () => {
  {
    let r = splitFullName('JUAN PEREZ GOMEZ');
    ok('3 palabras: 1 nombre + 2 apellidos', r.firstName === 'JUAN' && r.lastName === 'PEREZ GOMEZ', JSON.stringify(r));
  
    r = splitFullName('JUAN CARLOS PEREZ GOMEZ');
    ok('4 palabras: mitad y mitad', r.firstName === 'JUAN CARLOS' && r.lastName === 'PEREZ GOMEZ', JSON.stringify(r));
  
    r = splitFullName('MARIA PEREZ');
    ok('2 palabras', r.firstName === 'MARIA' && r.lastName === 'PEREZ', JSON.stringify(r));
  
    r = splitFullName('MADONNA');
    ok('1 palabra', r.firstName === 'MADONNA' && r.lastName === '', JSON.stringify(r));
  
    r = splitFullName('  JUAN   PEREZ  ');
    ok('espacios de sobra', r.firstName === 'JUAN' && r.lastName === 'PEREZ', JSON.stringify(r));
  
    r = splitFullName('');
    ok('vacio', r.firstName === '' && r.lastName === '');
  
    r = splitFullName('ANA MARIA DE LOS SANTOS PEREZ');
    ok('5 palabras parte 3/2', r.firstName === 'ANA MARIA DE' && r.lastName === 'LOS SANTOS PEREZ', JSON.stringify(r));
  }
  
  });

  it("Estado civil y sexo", () => {
  {
    ok('Soltero', normalizeMaritalStatus('Soltero') === 'Soltero(a)');
    ok('SOLTERA', normalizeMaritalStatus('SOLTERA') === 'Soltero(a)');
    ok('Casado', normalizeMaritalStatus('Casado') === 'Casado(a)');
    ok('Divorciada', normalizeMaritalStatus('Divorciada') === 'Divorciado(a)');
    ok('Viudo', normalizeMaritalStatus('Viudo') === 'Viudo(a)');
    ok('Union Libre', normalizeMaritalStatus('Unión Libre') === 'Unión libre');
    ok('desconocido devuelve null', normalizeMaritalStatus('Comprometido') === null);
    ok('vacio devuelve null', normalizeMaritalStatus('') === null && normalizeMaritalStatus(null) === null);
  
    ok('sexo M', normalizeGender('M') === 'MASCULINO');
    ok('sexo F', normalizeGender('F') === 'FEMENINO');
    ok('sexo MASCULINO', normalizeGender('MASCULINO') === 'MASCULINO');
    ok('sexo femenino minusculas', normalizeGender('femenino') === 'FEMENINO');
    ok('sexo desconocido', normalizeGender('X') === null && normalizeGender('') === null);
  }
  
  });

  it("Ciudad JCE -> provincia/municipio", () => {
  {
    let r = resolveJceCity('HIGUEY');
    ok('HIGUEY', r.province === 'La Altagracia' && r.municipality === 'Higüey', JSON.stringify(r));
  
    r = resolveJceCity('SANTIAGO');
    ok('SANTIAGO', r.province === 'Santiago' && r.municipality === 'Santiago', JSON.stringify(r));
  
    r = resolveJceCity('SANTO DOMINGO');
    ok('SANTO DOMINGO -> Distrito Nacional',
      r.province === 'Distrito Nacional' && r.municipality === 'Santo Domingo de Guzmán', JSON.stringify(r));
  
    r = resolveJceCity('SANTO DOMINGO ESTE');
    ok('SANTO DOMINGO ESTE -> provincia Santo Domingo',
      r.province === 'Santo Domingo' && r.municipality === 'Santo Domingo Este', JSON.stringify(r));
  
    r = resolveJceCity('NEYBA');
    ok('alias NEYBA -> Neiba', r.province === 'Bahoruco' && r.municipality === 'Neiba', JSON.stringify(r));
  
    r = resolveJceCity('EL SEYBO');
    ok('alias EL SEYBO -> El Seibo', r.province === 'El Seibo' && r.municipality === 'El Seibo', JSON.stringify(r));
  
    r = resolveJceCity('GUERRA');
    ok('alias GUERRA', r.municipality === 'San Antonio de Guerra', JSON.stringify(r));
  
    r = resolveJceCity('NAVARRETE');
    ok('alias NAVARRETE -> Bisonó', r.province === 'Santiago' && r.municipality === 'Bisonó', JSON.stringify(r));
  
    r = resolveJceCity('BANICA');
    ok('sin acentos BANICA -> Bánica', r.province === 'Elías Piña' && r.municipality === 'Bánica', JSON.stringify(r));
  
    r = resolveJceCity('JARABACOA');
    ok('JARABACOA', r.province === 'La Vega' && r.municipality === 'Jarabacoa', JSON.stringify(r));
  
    // No se inventa nada cuando no se reconoce
    r = resolveJceCity('CIUDAD INEXISTENTE');
    ok('desconocida no adivina', r.province === '' && r.municipality === '', JSON.stringify(r));
    r = resolveJceCity('');
    ok('vacia no adivina', r.province === '' && r.municipality === '');
    r = resolveJceCity(null);
    ok('null no revienta', r.province === '' && r.municipality === '');
  }
  
  
  });
});
