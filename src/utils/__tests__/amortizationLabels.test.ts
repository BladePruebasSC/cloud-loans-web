// El identificador de amortización se guarda en INGLÉS en `loans.amortization_type`, pero varias
// pantallas lo pintaban tal cual: la actividad reciente del inicio decía "INDEFINITE", el detalle
// del préstamo "SIMPLE | INDEFINITE" y las solicitudes "Indefinite". El usuario lo eligió en
// español al crear el préstamo, así que en español debe verlo.
import { describe, it, expect } from 'vitest';
import { getAmortizationLabel } from '../amortizationLabels';

describe('getAmortizationLabel', () => {
  it('Traduce los cinco tipos que ofrece el formulario', () => {
    expect(getAmortizationLabel('simple')).toBe('Simple');
    expect(getAmortizationLabel('french')).toBe('Francés');
    expect(getAmortizationLabel('german')).toBe('Alemán');
    expect(getAmortizationLabel('american')).toBe('Americano');
    expect(getAmortizationLabel('indefinite')).toBe('Indefinido');
  });

  it('El caso reportado: "INDEFINITE" en la actividad reciente', () => {
    // La BD lo devuelve en minúscula, pero la pantalla lo pasaba por `toUpperCase()`.
    expect(getAmortizationLabel('INDEFINITE')).toBe('Indefinido');
    expect(getAmortizationLabel(' Indefinite ')).toBe('Indefinido');
  });

  it('Sin valor no inventa nada: devuelve cadena vacía para que el llamador la omita', () => {
    expect(getAmortizationLabel(null)).toBe('');
    expect(getAmortizationLabel(undefined)).toBe('');
    expect(getAmortizationLabel('')).toBe('');
    expect(getAmortizationLabel('   ')).toBe('');
  });

  it('Un tipo nuevo se ve legible en vez de perderse', () => {
    // Si mañana se agrega un tipo y nadie pasa por aquí, mejor "Bullet" que una fila en blanco.
    expect(getAmortizationLabel('bullet')).toBe('Bullet');
  });
});
