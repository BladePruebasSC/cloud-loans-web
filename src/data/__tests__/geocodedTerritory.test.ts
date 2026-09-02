// Traduccion de la geocodificacion inversa de Google al catalogo del pais.
//
// Google no escribe los nombres como el catalogo ni usa siempre el mismo nivel
// administrativo: la provincia llega como "La Altagracia Province" y el municipio unas veces
// en `locality` ("Salvaleon de Higuey") y otras en `administrative_area_level_2" ("Higuey").
// Si la traduccion falla, marcar el punto en el mapa no rellena nada y el empleado no
// entiende por que. Estas pruebas fijan las formas que devuelve Google de verdad.
import { describe, it, expect } from 'vitest';

import {
  resolveGeocodedTerritory, findProvince, getMunicipalities,
} from '@/data/dominicanRepublic';

const ok = (name: string, cond: unknown, detail = '') =>
  expect(cond, detail ? `${name} — ${detail}` : name).toBe(true);

describe('geocodificacion inversa -> catalogo', () => {

  it('Quita los adornos que Google pone en el nombre de la provincia', () => {
    // Las tres formas salen segun el idioma del navegador y la version de la API.
    for (const escrito of ['La Altagracia Province', 'Provincia La Altagracia',
                           'Provincia de La Altagracia', 'La Altagracia']) {
      const r = resolveGeocodedTerritory({ province: escrito });
      ok(`"${escrito}" -> La Altagracia`, r.province === 'La Altagracia', r.province);
    }

    // "Provincia de Azua" no puede quedarse en "de Azua" ni perder el nombre.
    const azua = resolveGeocodedTerritory({ province: 'Provincia de Azua' });
    ok('Azua', azua.province === 'Azua', azua.province);
  });

  it('Prueba los candidatos a municipio del mas especifico al mas general', () => {
    // Caso real de Higuey: `locality` trae el nombre largo, que no esta en el catalogo, y el
    // nivel 2 el corto, que si. Debe quedarse con el que encaja, no rendirse en el primero.
    const r = resolveGeocodedTerritory({
      province: 'La Altagracia Province',
      municipalityCandidates: ['Salvaleón de Higüey', 'Higüey'],
    });
    ok('provincia', r.province === 'La Altagracia', r.province);
    ok('municipio', r.municipality === 'Higüey', r.municipality);

    // Y el alias tambien resuelve el nombre largo por si solo.
    const soloLargo = resolveGeocodedTerritory({
      province: 'La Altagracia Province',
      municipalityCandidates: ['Salvaleón de Higüey'],
    });
    ok('el alias resuelve el nombre largo', soloLargo.municipality === 'Higüey',
      soloLargo.municipality);
  });

  it('La provincia conocida desambigua municipios repetidos', () => {
    // Sin provincia, un nombre que existe en varias provincias no se puede resolver: adivinar
    // pondria al cliente en la punta contraria del pais.
    const ambiguo = resolveGeocodedTerritory({ municipalityCandidates: ['Las Matas'] });
    ok('sin provincia no adivina', !ambiguo.municipality, ambiguo.municipality);

    // Santo Domingo Este existe una sola vez: se resuelve sin provincia.
    const claro = resolveGeocodedTerritory({ municipalityCandidates: ['Santo Domingo Este'] });
    ok('nombre inequivoco si resuelve', claro.municipality === 'Santo Domingo Este', claro.municipality);
    ok('y deduce su provincia', !!claro.province, claro.province);
  });

  it('Devuelve la provincia sola cuando el municipio no encaja', () => {
    // Es informacion buena: deja la cascada lista para que el empleado elija el municipio.
    // Vaciarla del todo seria perder un dato correcto.
    const r = resolveGeocodedTerritory({
      province: 'Santiago Province',
      municipalityCandidates: ['Un Sitio Que No Existe'],
    });
    ok('conserva la provincia', r.province === 'Santiago', r.province);
    ok('no inventa municipio', r.municipality === '', r.municipality);
    ok('y la provincia tiene municipios que ofrecer', getMunicipalities(r.province).length > 0);
  });

  it('Entradas vacias o basura no revientan ni inventan', () => {
    const vacio = resolveGeocodedTerritory({});
    ok('sin nada', vacio.province === '' && vacio.municipality === '');

    const nulos = resolveGeocodedTerritory({
      province: null, municipalityCandidates: [null, undefined, '', '   '],
    });
    ok('nulos', nulos.province === '' && nulos.municipality === '');

    const basura = resolveGeocodedTerritory({
      province: 'Florida', municipalityCandidates: ['Miami'],
    });
    ok('un punto fuera del pais no encaja', basura.province === '' && basura.municipality === '',
      JSON.stringify(basura));
  });

  it('El municipio devuelto pertenece de verdad a la provincia devuelta', () => {
    // Si no, la cascada mostraria un municipio que su propio selector no ofrece y el campo
    // se veria relleno pero vacio al desplegarlo.
    const casos = [
      { province: 'La Altagracia Province', municipalityCandidates: ['Higüey'] },
      { province: 'Santo Domingo Province', municipalityCandidates: ['Santo Domingo Este'] },
      { province: 'Santiago Province', municipalityCandidates: ['Santiago de los Caballeros'] },
      { province: 'Puerto Plata Province', municipalityCandidates: ['San Felipe de Puerto Plata'] },
    ];
    for (const caso of casos) {
      const r = resolveGeocodedTerritory(caso);
      if (!r.municipality) continue;
      ok(`${r.municipality} pertenece a ${r.province}`,
        getMunicipalities(r.province).includes(r.municipality),
        `${r.municipality} no esta en ${r.province}`);
      ok(`${r.province} existe en el catalogo`, !!findProvince(r.province));
    }
  });
});
