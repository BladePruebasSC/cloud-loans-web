// ============================================================================
// LA MORA DE LA SOLICITUD MANDA SOBRE LOS VALORES POR DEFECTO
// ============================================================================
// FALLO REPORTADO (2026-10-20): "cuando creas un préstamo desde solicitud no está tomando en
// cuenta los datos de mora: la solicitud dice 0 días de gracia y en el formulario sale el número
// por defecto".
//
// Eran dos cosas a la vez:
//   · la solicitud solo mandaba el sí/no de la mora al formulario, no la tasa, los días de
//     gracia, el máximo ni el tipo de cálculo;
//   · y el formulario rellenaba "los huecos" con los valores de la empresa tratando el 0 y el
//     false COMO SI FUERAN HUECOS. 0 días de gracia es un valor —"sin gracia"—, y una mora
//     deshabilitada es una decisión.
import { describe, it, expect } from 'vitest';

import { hasLateFeeConfig, hasLateFeeValue, mergeLateFeeConfig } from '../lateFeeConfig';

// Lo que tiene configurado la empresa.
const POR_DEFECTO = {
  late_fee_enabled: true,
  late_fee_rate: 5,
  grace_period_days: 2,
  max_late_fee: 0,
  late_fee_calculation_type: 'daily',
};

describe('mora de la solicitud contra la de la empresa', () => {

  it('El caso reportado: 0 días de gracia es 0, no "no dijo nada"', () => {
    const solicitud = {
      late_fee_enabled: true,
      late_fee_rate: 5,
      grace_period_days: 0,
      max_late_fee: 0,
      late_fee_calculation_type: 'daily',
    };

    const resultado = mergeLateFeeConfig(POR_DEFECTO, solicitud);

    expect(resultado.grace_period_days).toBe(0);     // antes salían los 2 de la empresa
    expect(resultado.late_fee_rate).toBe(5);
    expect(resultado.late_fee_enabled).toBe(true);
    expect(resultado.late_fee_calculation_type).toBe('daily');
  });

  it('Una solicitud con la mora APAGADA no se enciende sola', () => {
    const resultado = mergeLateFeeConfig(POR_DEFECTO, { late_fee_enabled: false });
    expect(resultado.late_fee_enabled).toBe(false);
    // Lo que la solicitud no dijo, lo pone la empresa.
    expect(resultado.late_fee_rate).toBe(5);
    expect(resultado.grace_period_days).toBe(2);
  });

  it('Lo que la solicitud no define lo pone la empresa', () => {
    const resultado = mergeLateFeeConfig(POR_DEFECTO, { grace_period_days: 7 });
    expect(resultado.grace_period_days).toBe(7);
    expect(resultado.late_fee_rate).toBe(5);
    expect(resultado.max_late_fee).toBe(0);
    expect(resultado.late_fee_calculation_type).toBe('daily');
  });

  it('Sin solicitud (préstamo en blanco), manda la empresa entera', () => {
    expect(mergeLateFeeConfig(POR_DEFECTO)).toEqual(POR_DEFECTO);
    expect(mergeLateFeeConfig(POR_DEFECTO, null)).toEqual(POR_DEFECTO);
    expect(mergeLateFeeConfig(POR_DEFECTO, {})).toEqual(POR_DEFECTO);
  });

  it('Un nulo tampoco pisa: solo lo definido manda', () => {
    const resultado = mergeLateFeeConfig(POR_DEFECTO, {
      grace_period_days: null,
      late_fee_rate: undefined,
      max_late_fee: 1500,
    });
    expect(resultado.grace_period_days).toBe(2);
    expect(resultado.late_fee_rate).toBe(5);
    expect(resultado.max_late_fee).toBe(1500);
  });

  it('No se inventa ningún campo que no exista', () => {
    expect(Object.keys(mergeLateFeeConfig(POR_DEFECTO, { grace_period_days: 0 })).sort())
      .toEqual(Object.keys(POR_DEFECTO).sort());
  });
});

describe('cuándo se considera que un origen trae su propia mora', () => {

  it('Un 0 y un false cuentan como configuración', () => {
    expect(hasLateFeeValue(0)).toBe(true);
    expect(hasLateFeeValue(false)).toBe(true);
    expect(hasLateFeeConfig({ grace_period_days: 0 })).toBe(true);
    expect(hasLateFeeConfig({ late_fee_enabled: false })).toBe(true);
  });

  it('Sin ningún campo, no hay configuración propia', () => {
    expect(hasLateFeeValue(null)).toBe(false);
    expect(hasLateFeeValue(undefined)).toBe(false);
    expect(hasLateFeeConfig(undefined)).toBe(false);
    expect(hasLateFeeConfig(null)).toBe(false);
    expect(hasLateFeeConfig({})).toBe(false);
    expect(hasLateFeeConfig({ grace_period_days: null, late_fee_rate: undefined })).toBe(false);
  });

  it('Los campos ajenos no la activan', () => {
    expect(hasLateFeeConfig({ amount: 10000, term_months: 12 } as any)).toBe(false);
  });
});

describe('lo que viaja de la solicitud al formulario', () => {

  /** Réplica de cómo se arman los parámetros de la URL al crear el préstamo. */
  const parametros = (request: Record<string, unknown>) => {
    const p = new URLSearchParams();
    const enviarSiExiste = (clave: string, valor: unknown) => {
      if (valor === null || valor === undefined || valor === '') return;
      p.set(clave, String(valor));
    };
    enviarSiExiste('late_fee_enabled', request.late_fee ?? request.late_fee_enabled);
    enviarSiExiste('late_fee_rate', request.late_fee_rate);
    enviarSiExiste('grace_period_days', request.grace_period_days);
    enviarSiExiste('max_late_fee', request.max_late_fee);
    enviarSiExiste('late_fee_calculation_type', request.late_fee_calculation_type);
    return p;
  };

  /** Réplica de cómo se leen al abrir el formulario. */
  const numeroDeUrl = (p: URLSearchParams, clave: string): number | undefined => {
    const valor = p.get(clave);
    if (valor === null || valor.trim() === '') return undefined;
    const n = Number(valor);
    return Number.isFinite(n) ? n : undefined;
  };

  it('Ida y vuelta del caso reportado: 0 días de gracia llegan como 0', () => {
    const p = parametros({
      late_fee: true, late_fee_rate: 5, grace_period_days: 0,
      max_late_fee: 0, late_fee_calculation_type: 'daily',
    });

    expect(p.get('grace_period_days')).toBe('0');
    expect(numeroDeUrl(p, 'grace_period_days')).toBe(0);
    expect(numeroDeUrl(p, 'max_late_fee')).toBe(0);
    expect(p.get('late_fee_enabled')).toBe('true');
    expect(p.get('late_fee_calculation_type')).toBe('daily');

    const resultado = mergeLateFeeConfig(POR_DEFECTO, {
      late_fee_enabled: p.get('late_fee_enabled') === 'true',
      late_fee_rate: numeroDeUrl(p, 'late_fee_rate'),
      grace_period_days: numeroDeUrl(p, 'grace_period_days'),
      max_late_fee: numeroDeUrl(p, 'max_late_fee'),
      late_fee_calculation_type: p.get('late_fee_calculation_type') || undefined,
    });
    expect(resultado.grace_period_days).toBe(0);
  });

  it('Lo que la solicitud no tiene, no viaja (y manda la empresa)', () => {
    const p = parametros({ late_fee: false, grace_period_days: null, late_fee_rate: undefined });

    expect(p.get('late_fee_enabled')).toBe('false');
    expect(p.get('grace_period_days')).toBeNull();
    expect(numeroDeUrl(p, 'grace_period_days')).toBeUndefined();

    const resultado = mergeLateFeeConfig(POR_DEFECTO, {
      late_fee_enabled: p.get('late_fee_enabled') === 'true',
      grace_period_days: numeroDeUrl(p, 'grace_period_days'),
    });
    expect(resultado.late_fee_enabled).toBe(false);
    expect(resultado.grace_period_days).toBe(2);
  });
});
