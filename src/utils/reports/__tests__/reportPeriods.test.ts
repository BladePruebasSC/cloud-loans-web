// Períodos de los reportes: zona horaria, comparación y validación.
//
// El módulo anterior armaba los rangos con `new Date().toISOString()` (UTC): en República
// Dominicana, a partir de las 8:00 p.m. el "hoy" del reporte ya era el día siguiente.
import { describe, it, expect } from 'vitest';
import {
  addDays, compareValues, daysBetween, describePeriod, describeVariation, endOfMonth, inPeriod,
  previousPeriod, resolvePreset, startOfWeek, validatePeriod,
} from '../reportPeriods';

const HOY = '2026-10-09'; // viernes

describe('Preajustes de período', () => {
  it('Hoy, ayer y esta semana', () => {
    expect(resolvePreset('today', HOY)).toEqual({ startDate: HOY, endDate: HOY });
    expect(resolvePreset('yesterday', HOY)).toEqual({ startDate: '2026-10-08', endDate: '2026-10-08' });
    // El 9 de octubre de 2026 es viernes: la semana empieza el lunes 5.
    expect(resolvePreset('week', HOY)).toEqual({ startDate: '2026-10-05', endDate: HOY });
  });

  it('Este mes va del día 1 a hoy, no al fin de mes', () => {
    expect(resolvePreset('month', HOY)).toEqual({ startDate: '2026-10-01', endDate: HOY });
  });

  it('El mes pasado es el mes natural completo', () => {
    expect(resolvePreset('lastMonth', HOY)).toEqual({ startDate: '2026-09-01', endDate: '2026-09-30' });
    // En enero retrocede de año
    expect(resolvePreset('lastMonth', '2026-01-15')).toEqual({ startDate: '2025-12-01', endDate: '2025-12-31' });
  });

  it('Trimestre y año', () => {
    expect(resolvePreset('quarter', HOY)).toEqual({ startDate: '2026-10-01', endDate: HOY });
    expect(resolvePreset('quarter', '2026-08-20')).toEqual({ startDate: '2026-07-01', endDate: '2026-08-20' });
    expect(resolvePreset('year', HOY)).toEqual({ startDate: '2026-01-01', endDate: HOY });
  });

  it('Personalizado lo escribe el usuario', () => {
    expect(resolvePreset('custom', HOY)).toBeNull();
  });
});

describe('Aritmética de fechas sin zonas horarias', () => {
  it('Sumar y restar días cruza meses y años', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29'); // bisiesto
  });

  it('Fin de mes y lunes de la semana', () => {
    expect(endOfMonth('2026-02-10')).toBe('2026-02-28');
    expect(endOfMonth('2024-02-10')).toBe('2024-02-29');
    expect(startOfWeek('2026-10-11')).toBe('2026-10-05'); // domingo → lunes anterior
    expect(startOfWeek('2026-10-05')).toBe('2026-10-05'); // lunes
  });

  it('Días entre fechas', () => {
    expect(daysBetween('2026-10-01', '2026-10-09')).toBe(8);
    expect(daysBetween('2026-10-09', '2026-10-09')).toBe(0);
  });
});

describe('Período anterior para comparar', () => {
  it('Un mes natural se compara con el mes natural anterior', () => {
    expect(previousPeriod({ startDate: '2026-09-01', endDate: '2026-09-30' }))
      .toEqual({ startDate: '2026-08-01', endDate: '2026-08-31' });
  });

  it('Cualquier otro rango, con los mismos días justo antes', () => {
    // Del 1 al 9 de octubre (9 días) → del 22 al 30 de septiembre
    expect(previousPeriod({ startDate: '2026-10-01', endDate: '2026-10-09' }))
      .toEqual({ startDate: '2026-09-22', endDate: '2026-09-30' });
  });

  it('Un solo día se compara con el día anterior', () => {
    expect(previousPeriod({ startDate: HOY, endDate: HOY }))
      .toEqual({ startDate: '2026-10-08', endDate: '2026-10-08' });
  });
});

describe('Validación', () => {
  it('La fecha inicial no puede ser mayor que la final', () => {
    const p = validatePeriod({ startDate: '2026-10-10', endDate: '2026-10-01' }, HOY);
    expect(p?.blocking).toBe(true);
  });

  it('Un período futuro avisa pero no bloquea', () => {
    const p = validatePeriod({ startDate: '2026-11-01', endDate: '2026-11-30' }, HOY);
    expect(p?.blocking).toBe(false);
    expect(p?.message).toContain('futuro');
  });

  it('Un período válido no da problema', () => {
    expect(validatePeriod({ startDate: '2026-10-01', endDate: HOY }, HOY)).toBeNull();
  });

  it('Una fecha mal escrita se rechaza', () => {
    expect(validatePeriod({ startDate: '01/10/2026', endDate: HOY }, HOY)?.blocking).toBe(true);
  });
});

describe('Pertenencia al período', () => {
  const periodo = { startDate: '2026-10-01', endDate: '2026-10-09' };
  it('Incluye los dos extremos', () => {
    expect(inPeriod('2026-10-01', periodo)).toBe(true);
    expect(inPeriod('2026-10-09', periodo)).toBe(true);
    expect(inPeriod('2026-09-30', periodo)).toBe(false);
    expect(inPeriod('2026-10-10', periodo)).toBe(false);
  });

  it('Aguanta fechas con hora (no se va al día anterior)', () => {
    expect(inPeriod('2026-10-09T23:30:00Z', periodo)).toBe(true);
    expect(inPeriod(null, periodo)).toBe(false);
  });
});

describe('Comparación de valores', () => {
  it('El ejemplo del pedido: 850,000 con +12.4%', () => {
    const v = compareValues(850000, 756000);
    expect(v.delta).toBe(94000);
    expect(v.percent).toBe(12.4);
    expect(describeVariation(v)).toBe('+12.4%');
  });

  it('Una bajada se dice con su signo, no solo con un color', () => {
    const v = compareValues(80, 100);
    expect(v.direction).toBe('down');
    expect(describeVariation(v)).toBe('−20%');
  });

  it('Sin período anterior no se inventa un porcentaje', () => {
    const v = compareValues(500, 0);
    expect(v.percent).toBeNull();
    expect(describeVariation(v)).toBe('nuevo');
    expect(describeVariation(compareValues(0, 0))).toBe('sin cambio');
  });
});

describe('Texto del período', () => {
  it('Se lee como lo escribiría una persona', () => {
    expect(describePeriod({ startDate: '2026-10-01', endDate: '2026-10-31' })).toBe('Del 1 al 31 de octubre de 2026');
    expect(describePeriod({ startDate: HOY, endDate: HOY })).toBe('9 de octubre de 2026');
    expect(describePeriod({ startDate: '2026-09-15', endDate: '2026-10-09' }))
      .toBe('Del 15 de septiembre al 9 de octubre de 2026');
    expect(describePeriod({ startDate: '2025-12-20', endDate: '2026-01-05' }))
      .toBe('Del 20 de diciembre de 2025 al 5 de enero de 2026');
  });
});
