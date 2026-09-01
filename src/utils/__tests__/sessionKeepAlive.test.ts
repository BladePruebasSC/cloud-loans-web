// Generado a partir de las suites de la auditoria 2026-09-01.
// Prueban LOGICA FINANCIERA PURA: sin red, sin reloj, sin Supabase. Deterministas.
import { describe, it, expect } from 'vitest';

import {
  secondsUntilExpiry, shouldRefreshSession, isExpired, nextCheckDelayMs, retryDelayMs,
  REFRESH_MARGIN_SECONDS, MIN_CHECK_MS, MAX_CHECK_MS, MAX_REFRESH_RETRIES,
} from '@/utils/sessionKeepAlive';

/** Adapta el estilo `ok(nombre, condicion, detalle)` de las suites originales. */
const ok = (name: string, cond: unknown, detail = '') =>
  expect(cond, detail ? `${name} — ${detail}` : name).toBe(true);

describe("sessionKeepAlive", () => {


const NOW_MS = 1_800_000_000_000;          // instante fijo
const NOW_S = Math.floor(NOW_MS / 1000);
const inSeconds = (s) => NOW_S + s;

  it("Segundos hasta la caducidad", () => {
  {
    ok('una hora por delante', secondsUntilExpiry(inSeconds(3600), NOW_MS) === 3600);
    ok('justo ahora', secondsUntilExpiry(inSeconds(0), NOW_MS) === 0);
    ok('ya caducado', secondsUntilExpiry(inSeconds(-120), NOW_MS) === -120);
  
    // Sin dato NO es lo mismo que caducado: no se puede decidir a ciegas.
    ok('undefined da null', secondsUntilExpiry(undefined, NOW_MS) === null);
    ok('null da null', secondsUntilExpiry(null, NOW_MS) === null);
    ok('cero da null', secondsUntilExpiry(0, NOW_MS) === null);
    ok('negativo absoluto da null', secondsUntilExpiry(-5, NOW_MS) === null);
    ok('NaN da null', secondsUntilExpiry(NaN, NOW_MS) === null);
    // El tipo declarado no admite texto, pero `expires_at` llega de la red y podría venir
    // como cadena: se comprueba que la función tampoco se fía.
    ok('texto da null', secondsUntilExpiry('3600' as unknown as number, NOW_MS) === null);
  }
  
  });

  it("Cuando toca renovar", () => {
  {
    // El margen es de 10 minutos sobre un token que dura una hora.
    ok('margen de 10 min', REFRESH_MARGIN_SECONDS === 600);
  
    ok('token recien emitido: no', shouldRefreshSession(inSeconds(3600), NOW_MS) === false);
    ok('faltan 11 min: no', shouldRefreshSession(inSeconds(660), NOW_MS) === false);
    ok('faltan 10 min justos: SI', shouldRefreshSession(inSeconds(600), NOW_MS) === true);
    ok('faltan 9 min: SI', shouldRefreshSession(inSeconds(540), NOW_MS) === true);
    ok('faltan 30 s: SI', shouldRefreshSession(inSeconds(30), NOW_MS) === true);
  
    // EL CASO DEL PROBLEMA: la pestana paso una hora en segundo plano.
    ok('caducado hace una hora: SI', shouldRefreshSession(inSeconds(-3600), NOW_MS) === true);
  
    ok('sin expires_at no fuerza nada', shouldRefreshSession(undefined, NOW_MS) === false);
    ok('margen a medida', shouldRefreshSession(inSeconds(120), NOW_MS, 60) === false);
    ok('margen a medida (dentro)', shouldRefreshSession(inSeconds(30), NOW_MS, 60) === true);
  }
  
  });

  it("Deteccion de caducado", () => {
  {
    ok('vivo', isExpired(inSeconds(10), NOW_MS) === false);
    ok('justo en el limite cuenta como caducado', isExpired(inSeconds(0), NOW_MS) === true);
    ok('caducado', isExpired(inSeconds(-1), NOW_MS) === true);
    ok('sin dato no se declara caducado', isExpired(undefined, NOW_MS) === false);
  }
  
  });

  it("Cuando volver a comprobar", () => {
  {
    ok('cotas coherentes', MIN_CHECK_MS === 15_000 && MAX_CHECK_MS === 240_000);
  
    // Token recien emitido: faltan 50 min para el margen, pero se acota a 4 min. El tope corto
    // es deliberado: el navegador estrangula los temporizadores en segundo plano.
    ok('token fresco usa el tope', nextCheckDelayMs(inSeconds(3600), NOW_MS) === MAX_CHECK_MS,
      String(nextCheckDelayMs(inSeconds(3600), NOW_MS)));
  
    // Faltan 12 min: el margen empieza en 2 min -> se comprueba entonces
    ok('apunta al inicio del margen', nextCheckDelayMs(inSeconds(720), NOW_MS) === 120_000,
      String(nextCheckDelayMs(inSeconds(720), NOW_MS)));
  
    // Faltan 10 min y 10 s: quedan 10 s hasta el margen, pero el suelo son 15 s
    ok('respeta el suelo', nextCheckDelayMs(inSeconds(610), NOW_MS) === MIN_CHECK_MS,
      String(nextCheckDelayMs(inSeconds(610), NOW_MS)));
  
    ok('dentro del margen: suelo', nextCheckDelayMs(inSeconds(300), NOW_MS) === MIN_CHECK_MS);
    ok('caducado: suelo, no negativo', nextCheckDelayMs(inSeconds(-9999), NOW_MS) === MIN_CHECK_MS);
    ok('sin dato: tope', nextCheckDelayMs(undefined, NOW_MS) === MAX_CHECK_MS);
  
    // Nunca puede devolver algo inutil
    for (const s of [-10000, -1, 0, 1, 60, 599, 600, 601, 3600, 86400]) {
      const d = nextCheckDelayMs(inSeconds(s), NOW_MS);
      if (d < MIN_CHECK_MS || d > MAX_CHECK_MS) {
        ok(`delay en rango para ${s}s`, false, String(d));
      }
    }
    ok('todos los delays dentro del rango', true);
  }
  
  });

  it("Reintentos con espera creciente", () => {
  {
    ok('1er reintento a 1 s', retryDelayMs(0) === 1000);
    ok('2o a 2 s', retryDelayMs(1) === 2000);
    ok('3o a 4 s', retryDelayMs(2) === 4000);
    ok('4o a 8 s', retryDelayMs(3) === 8000);
    ok('tope de 30 s', retryDelayMs(10) === 30_000);
    ok('negativo se trata como el primero', retryDelayMs(-3) === 1000);
    ok('creciente', retryDelayMs(0) < retryDelayMs(1) && retryDelayMs(1) < retryDelayMs(2));
  
    // 4 reintentos cubren ~15 s: suficiente para que la red vuelva tras despertar el equipo,
    // sin dejar al usuario esperando eternamente.
    const total = Array.from({ length: MAX_REFRESH_RETRIES }, (_, i) => retryDelayMs(i))
      .reduce((a, b) => a + b, 0);
    ok('los reintentos suman 15 s', total === 15_000, String(total));
  }
  
  });

  it("El escenario reportado: una hora inactivo", () => {
  {
    // Token emitido ahora, que dura una hora
    const expiresAt = inSeconds(3600);
  
    // A los 55 min el usuario vuelve: el token esta dentro del margen -> se renueva antes
    // de que caduque y la sesion NO se pierde.
    const at55min = NOW_MS + 55 * 60 * 1000;
    ok('a los 55 min ya toca renovar', shouldRefreshSession(expiresAt, at55min) === true);
    ok('a los 55 min todavia NO caduco', isExpired(expiresAt, at55min) === false);
  
    // Aunque el temporizador no corriera y el token caducara, al volver se detecta y se renueva
    const at70min = NOW_MS + 70 * 60 * 1000;
    ok('a los 70 min esta caducado', isExpired(expiresAt, at70min) === true);
    ok('y aun asi se pide renovar', shouldRefreshSession(expiresAt, at70min) === true);
  }
  
  
  });
});
