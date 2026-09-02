// Traduccion de errores de Supabase a mensajes que se leen en pantalla.
//
// Motivo: guardar un cliente fallaba y solo salia "No se pudo guardar el cliente". La causa
// real —faltaba `clients.document_type`, de una migracion sin aplicar— estaba dentro del
// objeto de error, pero el patron `error instanceof Error ? ... : generico` la descartaba
// siempre: los errores de PostgREST son OBJETOS PLANOS, no instancias de Error.
//
// Los mensajes de aqui son literales de PostgREST y Postgres, copiados de errores reales.
import { describe, it, expect } from 'vitest';

import { describeSupabaseError, findMissingColumn } from '@/utils/supabaseErrors';

const ok = (name: string, cond: unknown, detail = '') =>
  expect(cond, detail ? `${name} — ${detail}` : name).toBe(true);

describe('errores de Supabase', () => {

  it('Detecta la columna que falta en las tres redacciones', () => {
    // PGRST204: PostgREST no la tiene en su cache de esquema. Es el que salio al guardar
    // un cliente sin aplicar la migracion de document_type.
    const pgrst = {
      code: 'PGRST204',
      message: "Could not find the 'document_type' column of 'clients' in the schema cache",
    };
    ok('PGRST204', findMissingColumn(pgrst) === 'document_type', String(findMissingColumn(pgrst)));

    // 42703 al escribir
    const alEscribir = {
      code: '42703',
      message: 'column "closing_costs_financed" of relation "loans" does not exist',
    };
    ok('42703 escribiendo', findMissingColumn(alEscribir) === 'closing_costs_financed',
      String(findMissingColumn(alEscribir)));

    // 42703 al leer, donde el nombre viene cualificado con la tabla
    const alLeer = { code: '42703', message: 'column clients.location_accuracy does not exist' };
    ok('42703 leyendo', findMissingColumn(alLeer) === 'location_accuracy',
      String(findMissingColumn(alLeer)));
  });

  it('El codigo basta aunque no se pueda extraer el nombre', () => {
    // Mejor decir "falta una columna y hay una migracion pendiente" que caer en el generico.
    ok('PGRST204 sin nombre', findMissingColumn({ code: 'PGRST204', message: 'sin detalles' }) === 'desconocida');
    ok('42703 sin nombre', findMissingColumn({ code: '42703' }) === 'desconocida');
  });

  it('No confunde otros errores con una columna faltante', () => {
    ok('unicidad', findMissingColumn({ code: '23505', message: 'duplicate key value' }) === null);
    ok('permiso', findMissingColumn({ code: '42501' }) === null);
    ok('null', findMissingColumn(null) === null);
    ok('undefined', findMissingColumn(undefined) === null);
    ok('texto suelto', findMissingColumn({ message: 'network error' }) === null);
    ok('un Error normal', findMissingColumn(new Error('algo fallo')) === null);
  });

  it('El mensaje de columna faltante dice que hay que hacer', () => {
    const msg = describeSupabaseError(
      { code: 'PGRST204', message: "Could not find the 'document_type' column of 'clients' in the schema cache" },
      'No se pudo guardar el cliente',
    );
    ok('nombra la columna', msg.includes('document_type'), msg);
    ok('dice que falta una migracion', msg.toLowerCase().includes('migración'), msg);
    ok('dice el archivo a ejecutar', msg.includes('APLICAR_MIGRACIONES_PENDIENTES.sql'), msg);
    ok('no cae en el generico', !msg.includes('No se pudo guardar'), msg);
  });

  it('Traduce los codigos que el usuario puede entender', () => {
    ok('unicidad',
      describeSupabaseError({ code: '23505', message: 'duplicate key value violates unique constraint' }, 'x')
        === 'Ya existe un registro con esos datos.');
    ok('RLS',
      describeSupabaseError({ code: '42501' }, 'x') === 'No tienes permiso sobre ese registro.');
  });

  it('Sin codigo conocido, prefiere el mensaje real al generico', () => {
    // El objetivo es no volver a esconder la causa: el generico es el ultimo recurso.
    ok('objeto plano con mensaje',
      describeSupabaseError({ message: 'JWT expired' }, 'generico') === 'JWT expired');
    ok('Error de verdad',
      describeSupabaseError(new Error('sin conexion'), 'generico') === 'sin conexion');
    ok('sin nada usa el generico', describeSupabaseError({}, 'generico') === 'generico');
    ok('null usa el generico', describeSupabaseError(null, 'generico') === 'generico');
    ok('mensaje vacio usa el generico', describeSupabaseError({ message: '' }, 'generico') === 'generico');
  });
});
