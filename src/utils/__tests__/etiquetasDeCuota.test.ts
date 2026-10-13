// La cuota y el plazo se dicen con la frecuencia del préstamo.
//
// CAMBIO SOLICITADO (2026-10-12): "en donde dice cuota debe decir la frecuencia, si es mensual,
// semanal, quincenal, etc." y "en donde dice cuotas, por ejemplo cuotas 17, debe decir la
// frecuencia". Antes había media docena de sitios con el mismo `frequency === 'biweekly' ? …`
// escrito a mano, y todos caían en "Mensual" para lo que no estuviera en la lista: un préstamo
// DIARIO de 30 cuotas salía como "Cuota Mensual" y "Plazo: 30 meses".
import { describe, it, expect } from 'vitest';
import { getFrequencyLabel, getInstallmentLabel, getInstallmentsLabel } from '../frequencyUtils';

describe('Etiqueta de UNA cuota', () => {
  it('Cada frecuencia con su adjetivo', () => {
    expect(getInstallmentLabel('daily')).toBe('Cuota Diaria');
    expect(getInstallmentLabel('weekly')).toBe('Cuota Semanal');
    expect(getInstallmentLabel('biweekly')).toBe('Cuota Quincenal');
    expect(getInstallmentLabel('monthly')).toBe('Cuota Mensual');
    expect(getInstallmentLabel('quarterly')).toBe('Cuota Trimestral');
    expect(getInstallmentLabel('yearly')).toBe('Cuota Anual');
  });

  it('Con dos puntos para las fichas de datos', () => {
    expect(getInstallmentLabel('daily', true)).toBe('Cuota Diaria:');
  });

  it('Sin frecuencia se asume mensual, que es el valor por defecto del sistema', () => {
    expect(getInstallmentLabel(undefined)).toBe('Cuota Mensual');
    expect(getInstallmentLabel('')).toBe('Cuota Mensual');
    expect(getInstallmentLabel('lunar')).toBe('Cuota Mensual');
  });
});

describe('Etiqueta de VARIAS cuotas', () => {
  it('El plural concuerda', () => {
    expect(getInstallmentsLabel('daily')).toBe('Cuotas Diarias');
    expect(getInstallmentsLabel('weekly')).toBe('Cuotas Semanales');
    expect(getInstallmentsLabel('biweekly')).toBe('Cuotas Quincenales');
    expect(getInstallmentsLabel('monthly')).toBe('Cuotas Mensuales');
    expect(getInstallmentsLabel('quarterly')).toBe('Cuotas Trimestrales');
    expect(getInstallmentsLabel('yearly')).toBe('Cuotas Anuales');
  });
});

describe('El plazo va en PERÍODOS, no en meses', () => {
  it('Un préstamo diario de 30 cuotas dura 30 días', () => {
    expect(`30 ${getFrequencyLabel('daily', true)}`).toBe('30 días');
    expect(`17 ${getFrequencyLabel('daily', true)}`).toBe('17 días');
    expect(`1 ${getFrequencyLabel('daily', false)}`).toBe('1 día');
  });

  it('Y uno quincenal, en quincenas', () => {
    expect(`12 ${getFrequencyLabel('biweekly', true)}`).toBe('12 quincenas');
    expect(`6 ${getFrequencyLabel('monthly', true)}`).toBe('6 meses');
  });
});
