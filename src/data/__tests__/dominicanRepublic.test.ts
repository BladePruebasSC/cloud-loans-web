// Generado a partir de las suites de la auditoria 2026-09-01.
// Prueban LOGICA FINANCIERA PURA: sin red, sin reloj, sin Supabase. Deterministas.
import { describe, it, expect } from 'vitest';

import {
  DR_PROVINCES, PROVINCE_NAMES, MUNICIPAL_SEAT, sameName, findProvince, findMunicipality,
  getMunicipalities, getDistricts, inferProvinceFromMunicipality, normalizeStoredTerritory,
} from '@/data/dominicanRepublic';

/** Adapta el estilo `ok(nombre, condicion, detalle)` de las suites originales. */
const ok = (name: string, cond: unknown, detail = '') =>
  expect(cond, detail ? `${name} — ${detail}` : name).toBe(true);

describe("dominicanRepublic", () => {


  it("Integridad del catalogo", () => {
  {
    ok('32 provincias', DR_PROVINCES.length === 32, String(DR_PROVINCES.length));
    ok('sin provincias duplicadas', new Set(PROVINCE_NAMES).size === 32);
    ok('toda provincia tiene municipios', DR_PROVINCES.every(p => p.municipalities.length > 0),
      DR_PROVINCES.filter(p => !p.municipalities.length).map(p => p.name).join());
  
    // No se fija un numero exacto: la cifra oficial ronda los 158 y no puedo verificarla aqui
    // contra la ONE. Se comprueba que el catalogo sea sustancialmente completo y no se degrade.
    const totalMunicipios = DR_PROVINCES.reduce((s, p) => s + p.municipalities.length, 0);
    console.log(`   municipios cargados: ${totalMunicipios} (cifra oficial ~158: revisar contra la ONE)`);
    ok('catalogo de municipios sustancialmente completo', totalMunicipios >= 150, String(totalMunicipios));
  
    // Dentro de una provincia no puede repetirse un municipio
    for (const p of DR_PROVINCES) {
      const names = p.municipalities.map(x => x.name);
      ok(`${p.name}: municipios unicos`, new Set(names).size === names.length,
        names.filter((n, i) => names.indexOf(n) !== i).join());
    }
  
    // Dentro de un municipio no puede repetirse un distrito
    for (const p of DR_PROVINCES) {
      for (const mun of p.municipalities) {
        const d = mun.districts;
        if (new Set(d).size !== d.length) {
          ok(`${p.name}/${mun.name}: distritos unicos`, false, d.join());
        }
      }
    }
    ok('distritos sin duplicados dentro del municipio', true);
  
    // Ningun distrito puede llamarse igual que su municipio
    const selfNamed = [];
    for (const p of DR_PROVINCES) {
      for (const mun of p.municipalities) {
        if (mun.districts.some(d => sameName(d, mun.name))) selfNamed.push(`${p.name}/${mun.name}`);
      }
    }
    ok('ningun distrito repite el nombre de su municipio', selfNamed.length === 0, selfNamed.join());
  
    // Nada vacio ni con espacios de sobra
    const dirty = [];
    for (const p of DR_PROVINCES) {
      if (p.name !== p.name.trim() || !p.name) dirty.push(p.name);
      for (const mun of p.municipalities) {
        if (mun.name !== mun.name.trim() || !mun.name) dirty.push(mun.name);
        for (const d of mun.districts) if (d !== d.trim() || !d) dirty.push(d);
      }
    }
    ok('nombres sin espacios sobrantes ni vacios', dirty.length === 0, dirty.join());
  
    const totalDistritos = DR_PROVINCES.reduce((s, p) => s + p.municipalities.reduce((t, m) => t + m.districts.length, 0), 0);
    console.log(`   distritos municipales cargados: ${totalDistritos} (catalogo parcial, por diseno)`);
  }
  
  });

  it("Provincias conocidas", () => {
  {
    ok('Distrito Nacional existe', !!findProvince('Distrito Nacional'));
    ok('Santo Domingo existe', !!findProvince('Santo Domingo'));
    ok('DN y Santo Domingo son distintas', findProvince('Distrito Nacional') !== findProvince('Santo Domingo'));
    ok('Santiago existe', !!findProvince('Santiago'));
    ok('provincia inexistente', findProvince('Miami') === undefined);
  }
  
  });

  it("Comparacion tolerante de nombres", () => {
  {
    ok('ignora acentos', sameName('Peravia', 'Peravia') && sameName('Bánica', 'Banica'));
    ok('ignora mayusculas', sameName('SANTO DOMINGO ESTE', 'Santo Domingo Este'));
    ok('ignora espacios extra', sameName('  La   Vega ', 'La Vega'));
    ok('vacio nunca coincide', !sameName('', '') && !sameName(null, undefined));
    ok('distintos no coinciden', !sameName('Santiago', 'Santiago Rodríguez'));
  }
  
  });

  it("Cascada", () => {
  {
    const mun = getMunicipalities('Santo Domingo');
    ok('Santo Domingo tiene 7 municipios', mun.length === 7, String(mun.length));
    ok('incluye Santo Domingo Este', mun.includes('Santo Domingo Este'));
    ok('NO incluye el Distrito Nacional', !mun.includes('Santo Domingo de Guzmán'));
  
    ok('DN tiene 1 municipio', getMunicipalities('Distrito Nacional').length === 1);
    ok('provincia desconocida devuelve vacio', getMunicipalities('Narnia').length === 0);
    ok('sin provincia devuelve vacio', getMunicipalities('').length === 0 && getMunicipalities(null).length === 0);
  
    const dist = getDistricts('Santo Domingo', 'Los Alcarrizos');
    ok('Los Alcarrizos tiene distritos', dist.length === 2, dist.join());
    ok('incluye Pantoja', dist.includes('Pantoja'));
    ok('municipio sin distritos cargados', getDistricts('Santo Domingo', 'Santo Domingo Oeste').length === 0);
    ok('municipio de otra provincia no cruza', getDistricts('Santiago', 'Los Alcarrizos').length === 0);
    ok('municipio inexistente', getDistricts('Santiago', 'Boca Chica').length === 0);
  
    ok('findMunicipality respeta la provincia',
      !!findMunicipality('La Vega', 'Jarabacoa') && !findMunicipality('Santiago', 'Jarabacoa'));
  }
  
  });

  it("Deducir provincia desde el municipio (datos viejos)", () => {
  {
    ok('municipio unico', inferProvinceFromMunicipality('Jarabacoa') === 'La Vega');
    ok('tolera acentos y mayusculas', inferProvinceFromMunicipality('JARABACOA') === 'La Vega');
    ok('Bonao', inferProvinceFromMunicipality('Bonao') === 'Monseñor Nouel');
    ok('vacio devuelve null', inferProvinceFromMunicipality('') === null);
    ok('desconocido devuelve null', inferProvinceFromMunicipality('Caracas') === null);
  }
  
  });

  it("Normalizar lo guardado", () => {
  {
    // Grafia distinta -> se ajusta a la del catalogo
    let t = normalizeStoredTerritory({ province: 'santo domingo', municipality: 'SANTO DOMINGO ESTE', district: 'san luis' });
    ok('ajusta la grafia', t.province === 'Santo Domingo' && t.municipality === 'Santo Domingo Este' && t.district === 'San Luis',
      JSON.stringify(t));
  
    // Solo municipio (datos que iban en `city`) -> deduce la provincia
    t = normalizeStoredTerritory({ municipality: 'Jarabacoa' });
    ok('deduce la provincia', t.province === 'La Vega' && t.municipality === 'Jarabacoa', JSON.stringify(t));
  
    // Municipio que no pertenece a la provincia -> se descarta
    t = normalizeStoredTerritory({ province: 'Santiago', municipality: 'Boca Chica', district: 'La Caleta' });
    ok('descarta combinacion imposible', t.province === 'Santiago' && t.municipality === '' && t.district === '',
      JSON.stringify(t));
  
    // Distrito escrito a mano -> se conserva (el catalogo es parcial)
    t = normalizeStoredTerritory({ province: 'Santo Domingo', municipality: 'Santo Domingo Oeste', district: 'Zona Rural X' });
    ok('conserva un distrito fuera del catalogo', t.district === 'Zona Rural X', JSON.stringify(t));
  
    // Cabecera
    t = normalizeStoredTerritory({ province: 'La Vega', municipality: 'Constanza', district: MUNICIPAL_SEAT });
    ok('conserva la cabecera', t.district === MUNICIPAL_SEAT, JSON.stringify(t));
  
    // Provincia fuera del catalogo (texto libre antiguo) -> no se pierde nada
    t = normalizeStoredTerritory({ province: 'Provincia Vieja', municipality: 'Algo', district: 'Otro' });
    ok('respeta datos fuera del catalogo',
      t.province === 'Provincia Vieja' && t.municipality === 'Algo' && t.district === 'Otro', JSON.stringify(t));
  
    // Todo vacio
    t = normalizeStoredTerritory({});
    ok('vacio no revienta', t.province === '' && t.municipality === '' && t.district === '', JSON.stringify(t));
  
    // Municipio valido pero distrito de OTRO municipio -> se conserva como texto libre,
    // no se puede afirmar que sea falso porque el catalogo es parcial.
    t = normalizeStoredTerritory({ province: 'Santiago', municipality: 'Santiago', district: 'Pantoja' });
    ok('municipio correcto se mantiene', t.municipality === 'Santiago', JSON.stringify(t));
  }
  
  
  });
});
