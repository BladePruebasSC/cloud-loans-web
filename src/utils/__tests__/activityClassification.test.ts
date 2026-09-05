// Clasificacion de las entradas de `loan_history` para la actividad reciente del inicio.
//
// FALLO REPORTADO (2026-09-05): tras anadir los cambios de prestamo a la actividad reciente,
// seguian sin aparecer.
//
// CAUSA: la descripcion se guarda de DOS formas segun la operacion. Unas usan el
// identificador interno (`term_extension: ...`, `capital_payment: ...`) y otras un titulo en
// espanol (`Agregar Cargo: ...`, `Eliminar Mora: ...`). Ademas `pay_charges` CAMBIO de la
// primera forma a la segunda el 2026-09-03, asi que las entradas viejas y las nuevas del
// mismo tipo no se parecen entre si. La primera version solo reconocia una grafia de cada
// una, y las que no encajaban se descartaban en silencio.
import { describe, it, expect } from 'vitest';

const ok = (name: string, cond: unknown, detail = '') =>
  expect(cond, detail ? `${name} — ${detail}` : name).toBe(true);

const ETIQUETAS: Record<string, { label: string; borrado?: boolean }> = {
  term_extension:    { label: 'Extensión de plazo' },
  add_charge:        { label: 'Cargo agregado' },
  pay_charges:       { label: 'Cargo cobrado' },
  remove_late_fee:   { label: 'Mora eliminada' },
  delete_payment:    { label: 'Pago eliminado', borrado: true },
  capital_payment:   { label: 'Abono a capital' },
  edit_loan:         { label: 'Préstamo editado' },
  settle_loan:       { label: 'Préstamo saldado' },
  delete_loan:       { label: 'Préstamo eliminado', borrado: true },
  payment_agreement: { label: 'Acuerdo de pago' },
};

const POR_TEXTO: Array<[RegExp, string]> = [
  [/^Agregar Cargo/i,   'add_charge'],
  [/^Pago de Cargos/i,  'pay_charges'],
  [/^Eliminar Mora/i,   'remove_late_fee'],
  [/^Pago eliminado/i,  'delete_payment'],
  [/^Abono a Capital/i, 'capital_payment'],
];

/** Replica del clasificador de `usePortfolioData`. */
const clasificar = (description: string, notes?: string | null): string | null => {
  let tipo: string | null = null;
  try {
    const parsed = JSON.parse(notes || '{}');
    if (parsed && typeof parsed.update_type === 'string') tipo = parsed.update_type;
  } catch { /* notes suele ser texto libre */ }

  if (!tipo) {
    const porId = String(description).match(/^([a-z_]+)\s*:/);
    if (porId && ETIQUETAS[porId[1]]) tipo = porId[1];
  }
  if (!tipo) tipo = POR_TEXTO.find(([re]) => re.test(description))?.[1] ?? null;

  return tipo && ETIQUETAS[tipo] ? ETIQUETAS[tipo].label : null;
};

describe('clasificacion de la actividad reciente', () => {

  it('El caso reportado: una entrada vieja de "pay_charges"', () => {
    // Antes del 2026-09-03 la descripcion era el identificador interno. Esa es la entrada
    // que el usuario tenia y la que no aparecia.
    ok('vieja', clasificar('pay_charges: Cargo por atraso') === 'Cargo cobrado',
      String(clasificar('pay_charges: Cargo por atraso')));
    // Y desde entonces es un titulo en espanol.
    ok('nueva', clasificar('Pago de Cargos: Cargo por atraso. Monto: RD$3,000.00') === 'Cargo cobrado');
    // Las dos tienen que dar lo MISMO, o el historial se ve partido en dos epocas.
    ok('ambas coinciden',
      clasificar('pay_charges: x') === clasificar('Pago de Cargos: x'));
  });

  it('Reconoce las dos grafias de cada operacion', () => {
    const pares: Array<[string, string, string]> = [
      ['add_charge: motivo',      'Agregar Cargo: motivo',   'Cargo agregado'],
      ['remove_late_fee: motivo', 'Eliminar Mora: motivo',   'Mora eliminada'],
      ['capital_payment: motivo', 'Abono a Capital: motivo', 'Abono a capital'],
    ];
    for (const [id, texto, label] of pares) {
      ok(`${label} por identificador`, clasificar(id) === label, String(clasificar(id)));
      ok(`${label} por titulo`, clasificar(texto) === label, String(clasificar(texto)));
    }
  });

  it('`notes.update_type` manda sobre el texto', () => {
    // Es el dato explicito: no depende de como se haya redactado la descripcion.
    const notes = JSON.stringify({ payment_ids: ['abc'], update_type: 'pay_charges' });
    ok('con descripcion generica', clasificar('Ajuste de balance', notes) === 'Cargo cobrado');
    ok('con descripcion vacia', clasificar('', notes) === 'Cargo cobrado');

    // Y `notes` que NO es JSON no rompe nada: en muchas entradas es texto libre.
    ok('notes en texto libre', clasificar('term_extension: x', 'nota del usuario') === 'Extensión de plazo');
    ok('notes nulo', clasificar('term_extension: x', null) === 'Extensión de plazo');
  });

  it('Las operaciones que solo usan el identificador se reconocen', () => {
    ok('extension', clasificar('term_extension: 2 cuotas') === 'Extensión de plazo');
    ok('editar', clasificar('edit_loan: correccion de tasa') === 'Préstamo editado');
    ok('saldar', clasificar('settle_loan: negociacion') === 'Préstamo saldado');
    ok('eliminar', clasificar('delete_loan: duplicado') === 'Préstamo eliminado');
    ok('acuerdo', clasificar('payment_agreement: acuerdo') === 'Acuerdo de pago');
  });

  it('Lo eliminado se marca como tal, para pintarlo aparte', () => {
    const esBorrado = (d: string) => {
      const label = clasificar(d);
      return Object.values(ETIQUETAS).find(e => e.label === label)?.borrado === true;
    };
    ok('prestamo eliminado', esBorrado('delete_loan: x'));
    ok('pago eliminado', esBorrado('Pago eliminado: RD$3,000.00 del 2026-09-04'));
    ok('una extension NO es borrado', !esBorrado('term_extension: x'));
  });

  it('Lo que no se reconoce se omite, no se inventa un titulo', () => {
    ok('descripcion generica', clasificar('Ajuste de balance') === null);
    ok('vacia', clasificar('') === null);
    ok('identificador desconocido', clasificar('cosa_rara: x') === null);
    // Un identificador que existe pero con mayusculas no cuela por la via del prefijo;
    // igualmente cae al titulo en espanol si lo tuviera.
    ok('no confunde texto suelto', clasificar('El cliente pidio algo') === null);
  });
});
