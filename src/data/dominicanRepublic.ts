// ============================================================================
// DIVISIÓN TERRITORIAL DE LA REPÚBLICA DOMINICANA
// ============================================================================
// Provincia → Municipio → Distrito Municipal, para los selectores en cascada del
// formulario de clientes.
//
// ALCANCE DE LOS DATOS — léase antes de confiar en ellos:
//
//   · PROVINCIAS: las 32. Completas y estables.
//
//   · MUNICIPIOS: 156 cargados. La cifra oficial ronda los 158, así que **pueden faltar uno
//     o dos**. No se han inventado nombres para cuadrar el número: es preferible una lista
//     corta y correcta a una completa e inventada. Conviene contrastarla con la ONE y añadir
//     lo que falte.
//
//   · DISTRITOS MUNICIPALES: **catálogo PARCIAL** (213 de unos 235). Están los de las
//     provincias con más población y actividad crediticia. Un municipio con `districts: []`
//     no significa "no tiene", sino "no están cargados aquí".
//
// Por eso el formulario NUNCA obliga a elegir un distrito de la lista: siempre ofrece
// "Cabecera / zona urbana" y una opción "Otro" para escribirlo a mano. Provincia y municipio
// sí son selectores cerrados — ahí la lista es fiable y la escritura libre era justamente el
// problema que se quería resolver.
//
// Para completar el catálogo basta con añadir cadenas al array correspondiente; nada más
// depende de su tamaño.

export interface Municipality {
  name: string;
  /** Distritos municipales conocidos. Vacío = no cargados (no implica que no existan). */
  districts: string[];
}

export interface Province {
  name: string;
  municipalities: Municipality[];
}

/** Opción que representa la zona urbana del municipio (no es un distrito municipal). */
export const MUNICIPAL_SEAT = 'Cabecera / zona urbana';

const m = (name: string, districts: string[] = []): Municipality => ({ name, districts });

export const DR_PROVINCES: Province[] = [
  {
    name: 'Distrito Nacional',
    municipalities: [m('Santo Domingo de Guzmán')],
  },
  {
    name: 'Azua',
    municipalities: [
      m('Azua de Compostela', ['Barro Arriba', 'Clavellina', 'Las Barías', 'Los Jovillos', 'Puerto Viejo']),
      m('Estebanía'),
      m('Guayabal'),
      m('Las Charcas', ['Hatillo', 'Palmar de Ocoa']),
      m('Las Yayas de Viajama', ['Villarpando']),
      m('Padre Las Casas', ['Las Lagunas', 'Los Fríos', 'Monte Bonito']),
      m('Peralta'),
      m('Pueblo Viejo', ['El Rosario']),
      m('Sabana Yegua', ['Ganadero', 'Proyecto 4']),
      m('Tábara Arriba', ['Amiama Gómez', 'Los Toros', 'Tábara Abajo']),
    ],
  },
  {
    name: 'Bahoruco',
    municipalities: [
      m('Neiba', ['El Palmar']),
      m('Galván', ['El Salado']),
      m('Los Ríos', ['Las Clavellinas']),
      m('Tamayo', ['Cabeza de Toro', 'Mena', 'Monserrat', 'Santana', 'Uvilla']),
      m('Villa Jaragua'),
    ],
  },
  {
    name: 'Barahona',
    municipalities: [
      m('Barahona', ['El Cachón', 'La Guázara', 'Villa Central']),
      m('Cabral'),
      m('El Peñón'),
      m('Enriquillo', ['Arroyo Dulce']),
      m('Fundación', ['Pescadería']),
      m('Jaquimeyes', ['Palo Alto']),
      m('La Ciénaga', ['Bahoruco']),
      m('Las Salinas'),
      m('Paraíso', ['Los Patos']),
      m('Polo'),
      m('Vicente Noble', ['Canoa', 'Fondo Negro', 'Quita Coraza']),
    ],
  },
  {
    name: 'Dajabón',
    municipalities: [
      m('Dajabón', ['Cañongo']),
      m('El Pino', ['Manuel Bueno']),
      m('Loma de Cabrera', ['Capotillo', 'Santiago de la Cruz']),
      m('Partido'),
      m('Restauración'),
    ],
  },
  {
    name: 'Duarte',
    municipalities: [
      m('San Francisco de Macorís', ['Cenoví', 'Jaya', 'La Peña', 'Presidente Don Antonio Guzmán Fernández']),
      m('Arenoso', ['Las Coles']),
      m('Castillo'),
      m('Eugenio María de Hostos', ['Sabana Grande']),
      m('Las Guáranas'),
      m('Pimentel'),
      m('Villa Riva', ['Agua Santa del Yuna', 'Barraquito', 'Cristo Rey de Guaraguao', 'Las Táranas']),
    ],
  },
  {
    name: 'Elías Piña',
    municipalities: [
      m('Comendador', ['Guayabo', 'Sabana Larga']),
      m('Bánica', ['Sabana Cruz', 'Sabana Higüero']),
      m('El Llano', ['Guanito']),
      m('Hondo Valle', ['Rancho de la Guardia']),
      m('Juan Santiago'),
      m('Pedro Santana', ['Río Limpio']),
    ],
  },
  {
    name: 'El Seibo',
    municipalities: [
      m('El Seibo', ['Pedro Sánchez', 'San Francisco-Vicentillo', 'Santa Lucía']),
      m('Miches', ['El Cedro', 'La Gina']),
    ],
  },
  {
    name: 'Espaillat',
    municipalities: [
      m('Moca', ['El Higüerito', 'José Contreras', 'Juan López', 'Las Lagunas', 'Monte de la Jagua', 'San Víctor']),
      m('Cayetano Germosén'),
      m('Gaspar Hernández', ['Joba Arriba', 'Veragua', 'Villa Magante']),
      m('Jamao al Norte'),
    ],
  },
  {
    name: 'Hato Mayor',
    municipalities: [
      m('Hato Mayor del Rey', ['Guayabo Dulce', 'Mata Palacio', 'Yerba Buena']),
      m('El Valle'),
      m('Sabana de la Mar', ['Elupina Cordero de Las Cañitas']),
    ],
  },
  {
    name: 'Hermanas Mirabal',
    municipalities: [
      m('Salcedo', ['Jamao Afuera']),
      m('Tenares', ['Blanco']),
      m('Villa Tapia'),
    ],
  },
  {
    name: 'Independencia',
    municipalities: [
      m('Jimaní', ['El Limón', 'Boca de Cachón']),
      m('Cristóbal', ['Batey 8']),
      m('Duvergé', ['Vengan a Ver']),
      m('La Descubierta'),
      m('Mella', ['La Colonia']),
      m('Postrer Río', ['Guayabal']),
    ],
  },
  {
    name: 'La Altagracia',
    municipalities: [
      m('Higüey', ['La Otra Banda', 'Las Lagunas de Nisibón', 'Verón Punta Cana']),
      m('San Rafael del Yuma', ['Bayahíbe', 'Boca de Yuma']),
    ],
  },
  {
    name: 'La Romana',
    municipalities: [
      m('La Romana', ['Caleta']),
      m('Guaymate'),
      m('Villa Hermosa', ['Cumayasa']),
    ],
  },
  {
    name: 'La Vega',
    municipalities: [
      m('La Vega', ['El Ranchito', 'Río Verde Arriba', 'Tavera']),
      m('Constanza', ['La Sabina', 'Tireo']),
      m('Jarabacoa', ['Buena Vista', 'Manabao']),
      m('Jima Abajo', ['Rincón']),
    ],
  },
  {
    name: 'María Trinidad Sánchez',
    municipalities: [
      m('Nagua', ['Arroyo al Medio', 'Las Gordas', 'San José de Matanzas']),
      m('Cabrera', ['Arroyo Salado', 'La Entrada']),
      m('El Factor', ['El Pozo']),
      m('Río San Juan'),
    ],
  },
  {
    name: 'Monseñor Nouel',
    municipalities: [
      m('Bonao', ['Arroyo Toro-Masipedro', 'Jayaco', 'Juma Bejucal', 'La Salvia-Los Quemados', 'Sabana del Puerto']),
      m('Maimón'),
      m('Piedra Blanca', ['Juan Adrián', 'Sonador']),
    ],
  },
  {
    name: 'Monte Cristi',
    municipalities: [
      m('Monte Cristi'),
      m('Castañuelas', ['Palo Verde']),
      m('Guayubín', ['Cana Chapetón', 'Hatillo Palma', 'Villa Elisa']),
      m('Las Matas de Santa Cruz'),
      m('Pepillo Salcedo'),
      m('Villa Vásquez'),
    ],
  },
  {
    name: 'Monte Plata',
    municipalities: [
      m('Monte Plata', ['Boyá', 'Chirino', 'Don Juan']),
      m('Bayaguana'),
      m('Peralvillo'),
      m('Sabana Grande de Boyá', ['Gonzalo', 'Majagual']),
      m('Yamasá', ['Los Botados', 'Mamá Tingó']),
    ],
  },
  {
    name: 'Pedernales',
    municipalities: [
      m('Pedernales', ['José Francisco Peña Gómez']),
      m('Oviedo', ['Juancho']),
    ],
  },
  {
    name: 'Peravia',
    municipalities: [
      m('Baní', ['Catalina', 'El Carretón', 'El Limonal', 'Las Barías-La Estancia', 'Paya', 'Sabana Buey', 'Villa Fundación']),
      m('Nizao', ['Pizarrete', 'Santana']),
      m('Matanzas'),
    ],
  },
  {
    name: 'Puerto Plata',
    municipalities: [
      m('Puerto Plata', ['Yásica Arriba']),
      m('Altamira', ['Río Grande']),
      m('Guananico'),
      m('Imbert'),
      m('Los Hidalgos', ['Navas']),
      m('Luperón', ['Belloso', 'La Isabela']),
      m('Sosúa', ['Cabarete', 'Sabaneta de Yásica']),
      m('Villa Isabela', ['Estero Hondo', 'Gualete', 'La Jaiba']),
      m('Villa Montellano'),
    ],
  },
  {
    name: 'Samaná',
    municipalities: [
      m('Samaná', ['Arroyo Barril', 'El Limón', 'Las Galeras']),
      m('Las Terrenas'),
      m('Sánchez'),
    ],
  },
  {
    name: 'Sánchez Ramírez',
    municipalities: [
      m('Cotuí', ['Caballero', 'Comedero Arriba', 'Platanal', 'Quita Sueño']),
      m('Cevicos', ['La Cueva']),
      m('Fantino'),
      m('La Mata', ['Angelina', 'La Bija']),
    ],
  },
  {
    name: 'San Cristóbal',
    municipalities: [
      m('San Cristóbal', ['Hato Damas']),
      m('Bajos de Haina', ['El Carril']),
      m('Cambita Garabitos', ['Cambita El Pueblecito']),
      m('Los Cacaos'),
      m('Sabana Grande de Palenque'),
      m('San Gregorio de Nigua'),
      m('Villa Altagracia', ['Medina', 'San José del Puerto']),
      m('Yaguate', ['Doña Ana']),
    ],
  },
  {
    name: 'San José de Ocoa',
    municipalities: [
      m('San José de Ocoa', ['El Pinar', 'La Ciénaga']),
      m('Rancho Arriba'),
      m('Sabana Larga', ['Nizao-Las Auyamas']),
    ],
  },
  {
    name: 'San Juan',
    municipalities: [
      m('San Juan de la Maguana', ['El Rosario', 'Guanito', 'Hato del Padre', 'La Jagua', 'Las Charcas de María Nova', 'Las Maguanas-Hato Nuevo', 'Pedro Corto', 'Sabana Alta', 'Sabaneta']),
      m('Bohechío', ['Arroyo Cano', 'Yaque']),
      m('El Cercado', ['Derrumbadero']),
      m('Juan de Herrera', ['Jínova']),
      m('Las Matas de Farfán', ['Carrera de Yeguas', 'Matayaya']),
      m('Vallejuelo', ['Jorjillo']),
    ],
  },
  {
    name: 'San Pedro de Macorís',
    municipalities: [
      m('San Pedro de Macorís'),
      m('Consuelo'),
      m('Guayacanes', ['El Puerto']),
      m('Los Llanos', ['El Puerto', 'Gautier']),
      m('Quisqueya'),
      m('Ramón Santana'),
    ],
  },
  {
    name: 'Santiago',
    municipalities: [
      m('Santiago', ['Baitoa', 'Hato del Yaque', 'La Canela', 'Pedro García', 'San Francisco de Jacagua']),
      m('Bisonó'),
      m('Jánico', ['El Caimito', 'Juncalito']),
      m('Licey al Medio', ['Las Palomas']),
      m('Puñal', ['Canabacoa', 'Guayabal']),
      m('Sabana Iglesia'),
      m('San José de las Matas', ['El Rubio', 'La Cuesta', 'Las Placetas']),
      m('Tamboril', ['Canca La Reina']),
      m('Villa González', ['El Limón', 'Palmar Arriba']),
    ],
  },
  {
    name: 'Santiago Rodríguez',
    municipalities: [
      m('San Ignacio de Sabaneta'),
      m('Los Almácigos'),
      m('Monción'),
    ],
  },
  {
    name: 'Santo Domingo',
    municipalities: [
      m('Santo Domingo Este', ['San Luis']),
      m('Santo Domingo Norte', ['La Victoria']),
      m('Santo Domingo Oeste'),
      m('Boca Chica', ['La Caleta']),
      m('Los Alcarrizos', ['Palmarejo-Villa Linda', 'Pantoja']),
      m('Pedro Brand', ['La Cuaba', 'La Guáyiga']),
      m('San Antonio de Guerra', ['Hato Viejo']),
    ],
  },
  {
    name: 'Valverde',
    municipalities: [
      m('Mao', ['Amina', 'Guatapanal', 'Jicomé']),
      m('Esperanza', ['Boca de Mao', 'Jaibón', 'Maizal']),
      m('Laguna Salada', ['Cruce de Guayacanes', 'La Caya']),
    ],
  },
];

// ----------------------------------------------------------------------------
// Consultas
// ----------------------------------------------------------------------------

/** Compara nombres ignorando mayúsculas, acentos y espacios sobrantes. */
export const sameName = (a?: string | null, b?: string | null): boolean =>
  normalizeName(a) === normalizeName(b) && normalizeName(a) !== '';

/** Marcas diacríticas combinantes (tras `normalize('NFD')`): hace que "Peña" === "Pena". */
const COMBINING_MARKS = /[̀-ͯ]/g;

const normalizeName = (v?: string | null): string =>
  String(v ?? '')
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

export const PROVINCE_NAMES: string[] = DR_PROVINCES.map(p => p.name);

export const findProvince = (province?: string | null): Province | undefined =>
  DR_PROVINCES.find(p => sameName(p.name, province));

export const findMunicipality = (
  province?: string | null,
  municipality?: string | null,
): Municipality | undefined =>
  findProvince(province)?.municipalities.find(x => sameName(x.name, municipality));

/** Municipios de una provincia. Vacío si la provincia no está en el catálogo. */
export const getMunicipalities = (province?: string | null): string[] =>
  findProvince(province)?.municipalities.map(x => x.name) ?? [];

/** Distritos municipales conocidos de un municipio. */
export const getDistricts = (
  province?: string | null,
  municipality?: string | null,
): string[] => findMunicipality(province, municipality)?.districts ?? [];

/**
 * La provincia a la que pertenece un municipio, si el nombre es inequívoco.
 *
 * Sirve para recuperar datos viejos: muchos clientes se guardaron solo con `city`, sin
 * provincia. Devuelve `null` cuando el nombre existe en más de una provincia (p. ej. hay
 * varios "El Limón"), porque adivinar ahí sería peor que dejarlo vacío.
 */
export const inferProvinceFromMunicipality = (municipality?: string | null): string | null => {
  if (!normalizeName(municipality)) return null;
  const hits = DR_PROVINCES.filter(p => p.municipalities.some(x => sameName(x.name, municipality)));
  return hits.length === 1 ? hits[0].name : null;
};

// ----------------------------------------------------------------------------
// Ciudad que devuelve la JCE → municipio del catálogo
// ----------------------------------------------------------------------------
// La JCE devuelve la ciudad en mayúsculas y sin acentos ("HIGUEY", "BANICA"). Eso ya lo
// resuelve `sameName`. Aquí solo están los nombres que NO coinciden con ningún municipio:
// grafías alternativas y nombres cortos de uso oficial.
const JCE_CITY_ALIASES: Record<string, string> = {
  'santo domingo': 'Santo Domingo de Guzmán',
  'distrito nacional': 'Santo Domingo de Guzmán',
  'guerra': 'San Antonio de Guerra',
  'neyba': 'Neiba',
  'el seybo': 'El Seibo',
  'seybo': 'El Seibo',
  'elias pina': 'Comendador',
  'salvaleon de higuey': 'Higüey',
  'higuey': 'Higüey',
  'san felipe de puerto plata': 'Puerto Plata',
  'santiago de los caballeros': 'Santiago',
  'concepcion de la vega': 'La Vega',
  'san fernando de monte cristi': 'Monte Cristi',
  'montecristi': 'Monte Cristi',
  'santa barbara de samana': 'Samaná',
  'salcedo': 'Salcedo',
  'sabaneta': 'San Ignacio de Sabaneta',
  'navarrete': 'Bisonó',
  'villa bisono': 'Bisonó',
  'valverde': 'Mao',
  'valverde mao': 'Mao',
  'azua de compostela': 'Azua de Compostela',
  'bani': 'Baní',
  'san juan': 'San Juan de la Maguana',
  'hato mayor': 'Hato Mayor del Rey',
  'nagua': 'Nagua',
  'bonao': 'Bonao',
  'cotui': 'Cotuí',
};

export interface JceLocation {
  /** Municipio del catálogo, o '' si no se reconoció */
  municipality: string;
  /** Provincia del catálogo, o '' si no se pudo determinar */
  province: string;
}

/**
 * Traduce la ciudad que devuelve la JCE a (provincia, municipio) del catálogo, para
 * precargar los selectores en cascada.
 *
 * OJO con el significado: la JCE devuelve la ciudad del REGISTRO de la persona, que no tiene
 * por qué ser donde vive hoy. Por eso el formulario la usa solo como valor inicial y deja
 * cambiar provincia y municipio libremente: lo que se guarda es el domicilio ACTUAL.
 *
 * Devuelve campos vacíos cuando el nombre no se reconoce o es ambiguo, en vez de adivinar.
 */
export const resolveJceCity = (city?: string | null): JceLocation => {
  const raw = normalizeName(city);
  if (!raw) return { municipality: '', province: '' };

  const aliased = JCE_CITY_ALIASES[raw];
  const candidate = aliased ?? String(city ?? '').trim();

  const province = inferProvinceFromMunicipality(candidate);
  if (!province) return { municipality: '', province: '' };

  const municipality = findMunicipality(province, candidate)?.name ?? '';
  return { municipality, province: municipality ? province : '' };
};

// ----------------------------------------------------------------------------
// Geocodificación inversa de Google → catálogo propio
// ----------------------------------------------------------------------------

/**
 * Google adorna el nombre de la provincia según el idioma del navegador: devuelve
 * "La Altagracia Province", "Provincia de Azua" o "Provincia La Altagracia" para lo que en
 * el catálogo es "La Altagracia". Sin quitar el adorno, `findProvince` no encuentra nada.
 */
const stripProvinceWords = (v?: string | null): string =>
  String(v ?? '')
    .replace(/\bprovince\b/gi, '')
    .replace(/^\s*provincia\s+(?:de\s+|del\s+)?/i, '')
    .trim();

/**
 * Traduce lo que devuelve la geocodificación inversa de Google a (provincia, municipio) del
 * catálogo, para rellenar la cascada al mover el punto en el mapa.
 *
 * Google no usa los mismos nombres ni el mismo nivel administrativo según la zona: el
 * municipio puede venir en `locality` ("Salvaleón de Higüey") o en
 * `administrative_area_level_2` ("Higüey"). Por eso se reciben VARIOS candidatos y se prueba
 * cada uno contra el catálogo, del más específico al más general, en vez de fiarse del
 * literal de un campo concreto.
 *
 * Si la provincia se reconoce pero ningún candidato encaja como municipio, se devuelve la
 * provincia sola: es información buena y deja la cascada lista para que el empleado elija.
 * Nunca se inventa un municipio ambiguo.
 */
export const resolveGeocodedTerritory = (parts: {
  province?: string | null;
  /** Candidatos a municipio, del más específico al más general */
  municipalityCandidates?: Array<string | null | undefined>;
}): JceLocation => {
  const provinceName = findProvince(stripProvinceWords(parts.province))?.name ?? '';

  for (const raw of parts.municipalityCandidates ?? []) {
    const name = String(raw ?? '').trim();
    if (!name) continue;

    // Las mismas grafías alternativas que ya hacían falta para la JCE sirven aquí.
    const candidate = JCE_CITY_ALIASES[normalizeName(name)] ?? name;

    // Con la provincia ya conocida basta con que el municipio pertenezca a ella: eso
    // desambigua nombres repetidos entre provincias.
    if (provinceName) {
      const hit = findMunicipality(provinceName, candidate);
      if (hit) return { province: provinceName, municipality: hit.name };
    }

    // Sin provincia, solo vale si el nombre es inequívoco en todo el país.
    const byName = resolveJceCity(candidate);
    if (byName.municipality) return byName;
  }

  return { province: provinceName, municipality: '' };
};

export interface TerritorySelection {
  province: string;
  municipality: string;
  district: string;
}

/**
 * Normaliza lo que ya está guardado en la base de datos para poder mostrarlo en los
 * selectores. Se usa SOLO al cargar un cliente existente — al cambiar un nivel en el
 * formulario, el componente limpia los inferiores de forma explícita, que es más predecible
 * que deducirlo aquí.
 *
 * Qué hace:
 *  - Ajusta la grafía a la del catálogo ("santo domingo este" → "Santo Domingo Este").
 *  - Deduce la provincia cuando solo se guardó el municipio (datos viejos que iban en `city`).
 *  - Si el municipio no pertenece a la provincia guardada, lo descarta en vez de mostrar una
 *    combinación imposible.
 *  - Conserva un distrito escrito a mano: el catálogo de distritos es parcial y no puede
 *    desmentir al usuario.
 */
export const normalizeStoredTerritory = (sel: Partial<TerritorySelection>): TerritorySelection => {
  const rawProvince = String(sel.province ?? '').trim();
  const rawMunicipality = String(sel.municipality ?? '').trim();
  const rawDistrict = String(sel.district ?? '').trim();

  const province = findProvince(rawProvince)?.name
    ?? (rawProvince ? rawProvince : (inferProvinceFromMunicipality(rawMunicipality) ?? ''));

  // Provincia fuera del catálogo (texto libre antiguo): no hay nada que validar contra ella.
  if (!findProvince(province)) {
    return { province, municipality: rawMunicipality, district: rawDistrict };
  }

  const municipality = findMunicipality(province, rawMunicipality)?.name ?? '';
  if (!municipality) return { province, municipality: '', district: '' };

  const known = getDistricts(province, municipality);
  const district = known.find(d => sameName(d, rawDistrict)) ?? rawDistrict;

  return { province, municipality, district };
};
