// Importación de datos: nada entra sin validarse.
import { describe, it, expect } from 'vitest';
import {
  autoMapColumns, errorReportRows, importEntityById, parseDate, parseNumber, rowsToInsert,
  validateImport,
} from '../reportImport';

const CLIENTES = importEntityById('clients');
const GASTOS = importEntityById('expenses');

describe('Lectura tolerante de números', () => {
  it('Aguanta el formato dominicano y los símbolos', () => {
    expect(parseNumber('1,250.50')).toBe(1250.5);
    expect(parseNumber('RD$ 10,000')).toBe(10000);
    expect(parseNumber('1.250,50')).toBe(1250.5);
    expect(parseNumber('500')).toBe(500);
    expect(parseNumber(1234.56)).toBe(1234.56);
  });

  it('Lo que no es un número da null, no NaN', () => {
    expect(parseNumber('abc')).toBeNull();
    expect(parseNumber('')).toBeNull();
    expect(parseNumber(null)).toBeNull();
  });
});

describe('Lectura tolerante de fechas', () => {
  it('ISO, día/mes/año y el número de Excel', () => {
    expect(parseDate('2026-10-09')).toBe('2026-10-09');
    expect(parseDate('09/10/2026')).toBe('2026-10-09');
    expect(parseDate('9-10-26')).toBe('2026-10-09');
    expect(parseDate(46290)).toMatch(/^\d{4}-\d{2}-\d{2}$/); // serie de Excel
  });

  it('Una fecha imposible se rechaza', () => {
    expect(parseDate('35/13/2026')).toBeNull();
    expect(parseDate('hola')).toBeNull();
    expect(parseDate('')).toBeNull();
  });
});

describe('Mapeo automático de columnas', () => {
  it('Reconoce los encabezados en español, con o sin tildes', () => {
    const mapa = autoMapColumns(CLIENTES, ['Nombre Completo', 'Cédula', 'Telefono', 'Ciudad']);
    expect(mapa.full_name).toBe('Nombre Completo');
    expect(mapa.dni).toBe('Cédula');
    expect(mapa.phone).toBe('Telefono');
    expect(mapa.city).toBe('Ciudad');
  });

  it('Una columna que no reconoce se queda sin mapear (la pone el usuario)', () => {
    const mapa = autoMapColumns(CLIENTES, ['Nombre Completo', 'Columna rara']);
    expect(mapa.dni).toBeUndefined();
  });
});

describe('Validación de clientes', () => {
  const mapping = { full_name: 'nombre', dni: 'cedula', phone: 'telefono' };

  it('Una fila completa y correcta pasa limpia', () => {
    const r = validateImport(CLIENTES, [
      { nombre: 'Juan Pérez', cedula: '402-1234567-8', telefono: '8095551234' },
    ], mapping);
    expect(r.valid).toBe(1);
    expect(r.invalid).toBe(0);
    expect(r.rows[0].values.dni).toBe('40212345678'); // sin guiones
  });

  it('Sin nombre o sin cédula se RECHAZA', () => {
    const r = validateImport(CLIENTES, [
      { nombre: '', cedula: '40212345678', telefono: '8095551234' },
      { nombre: 'Ana', cedula: '', telefono: '8095551234' },
    ], mapping);
    expect(r.invalid).toBe(2);
    expect(r.rows[0].errors[0]).toContain('nombre');
  });

  it('Una cédula que no pasa la JCE avisa pero no rechaza', () => {
    // 402-1234567-8 es válida; cambiando el dígito verificador deja de serlo.
    const r = validateImport(CLIENTES, [
      { nombre: 'Juan', cedula: '40212345679', telefono: '8095551234' },
      { nombre: 'Pedro', cedula: '12345', telefono: '8095551234' },
    ], mapping);
    expect(r.rows[0].status).toBe('warning');
    expect(r.rows[0].warnings.join(' ')).toContain('JCE');
    expect(r.rows[1].warnings.join(' ')).toContain('11 dígitos');
    expect(r.invalid).toBe(0); // avisa, pero no rechaza: el dato puede ser correcto
  });

  it('DUPLICADOS: contra la base y dentro del mismo archivo', () => {
    const existentes = new Set(['40200000001']);
    const r = validateImport(CLIENTES, [
      { nombre: 'Ya existe', cedula: '402-0000000-1', telefono: '8095551234' },
      { nombre: 'Nuevo', cedula: '40212345678', telefono: '8095551234' },
      { nombre: 'Repetido', cedula: '40212345678', telefono: '8095551234' },
    ], mapping, existentes);

    expect(r.duplicates).toBe(2);
    expect(r.rows[0].duplicate).toBe(true);
    expect(r.rows[2].duplicate).toBe(true);
    expect(r.rows[1].duplicate).toBeFalsy();

    // Por defecto los duplicados NO se insertan.
    expect(rowsToInsert(r, { includeDuplicates: false })).toHaveLength(1);
    expect(rowsToInsert(r, { includeDuplicates: true })).toHaveLength(3);
  });
});

describe('Validación de gastos', () => {
  const mapping = { category: 'cat', description: 'desc', amount: 'monto', expense_date: 'fecha' };

  it('Convierte monto y fecha, y rechaza lo que no se puede leer', () => {
    const r = validateImport(GASTOS, [
      { cat: 'Combustible', desc: 'Gasolina', monto: 'RD$2,500.00', fecha: '05/10/2026' },
      { cat: 'Oficina', desc: 'Papel', monto: 'mucho', fecha: '05/10/2026' },
      { cat: '', desc: 'Sin categoría', monto: '100', fecha: '05/10/2026' },
    ], mapping);

    expect(r.rows[0].values.amount).toBe(2500);
    expect(r.rows[0].values.expense_date).toBe('2026-10-05');
    expect(r.rows[1].status).toBe('invalid');
    expect(r.rows[2].status).toBe('invalid');
    expect(r.valid).toBe(1);
  });

  it('El archivo de errores lista fila, estado y problema', () => {
    const r = validateImport(GASTOS, [
      { cat: 'Oficina', desc: 'Papel', monto: 'mucho', fecha: '05/10/2026' },
    ], mapping);
    const errores = errorReportRows(r);
    expect(errores).toHaveLength(1);
    expect(errores[0].Fila).toBe('1');
    expect(errores[0].Estado).toBe('Rechazada');
    expect(errores[0].Problemas).toContain('no es un número');
  });
});
