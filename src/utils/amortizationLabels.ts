// Nombre en español de los tipos de amortización.
//
// El valor que se guarda en `loans.amortization_type` es un identificador en inglés
// ('simple', 'french', 'german', 'american', 'indefinite'). Varias pantallas lo pintaban tal
// cual —la actividad reciente del inicio decía "INDEFINITE", el detalle del préstamo
// "SIMPLE | INDEFINITE", las solicitudes "Indefinite"—, así que el usuario veía en inglés algo
// que en el formulario de creación había elegido en español.
//
// Los identificadores NO se traducen en la base de datos: son la clave con la que decide todo
// el cálculo. Esto es solo para MOSTRARLOS.

const LABELS: Record<string, string> = {
  simple: 'Simple',
  french: 'Francés',
  german: 'Alemán',
  american: 'Americano',
  indefinite: 'Indefinido',
};

/**
 * Nombre en español del tipo de amortización.
 * Un valor desconocido se devuelve capitalizado en vez de perderse, para que un tipo nuevo se
 * vea legible aunque nadie haya pasado por aquí a añadirlo.
 */
export const getAmortizationLabel = (type?: string | null): string => {
  const key = String(type || '').toLowerCase().trim();
  if (!key) return '';
  return LABELS[key] || (key.charAt(0).toUpperCase() + key.slice(1));
};
