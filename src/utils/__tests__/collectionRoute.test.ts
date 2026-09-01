// Generado a partir de las suites de la auditoria 2026-09-01.
// Prueban LOGICA FINANCIERA PURA: sin red, sin reloj, sin Supabase. Deterministas.
import { describe, it, expect } from 'vitest';

import { buildRouteStops, orderByProximity, summarizeRoute, parseCoords, stopAddress } from '@/utils/collectionRoute';
import { mapsRouteUrl, distanceKm, MAX_WAYPOINTS, parseCoordinates } from '@/utils/googleMaps';

/** Adapta el estilo `ok(nombre, condicion, detalle)` de las suites originales. */
const ok = (name: string, cond: unknown, detail = '') =>
  expect(cond, detail ? `${name} — ${detail}` : name).toBe(true);

describe("collectionRoute + googleMaps", () => {

const HOY = '2026-09-02';

const cli = (id, o = {}) => ({
  id, full_name: `Cliente ${id}`, phone: '+18091112222', address: `Calle ${id}`,
  sector: 'Los Prados', municipality: 'Santiago', province: 'Santiago',
  latitude: null, longitude: null, collection_route: 'RUTA PRINCIPAL', ...o,
});
const prestamo = (id, clientId, o = {}) => ({ id, client_id: clientId, status: 'active', current_late_fee: 0, ...o });
const cuota = (loanId, n, due, cap, int, o = {}) => ({
  loan_id: loanId, id: `${loanId}-${n}`, installment_number: n, due_date: due,
  principal_amount: cap, interest_amount: int, total_amount: cap + int,
  is_paid: false, paid_amount: 0, ...o,
});

  it("Paradas del dia", () => {
  {
    const stops = buildRouteStops({
      clients: [cli('c1'), cli('c2'), cli('c3')],
      loans: [prestamo('L1', 'c1'), prestamo('L2', 'c2'), prestamo('L3', 'c3')],
      installments: [
        cuota('L1', 1, HOY, 800, 200),               // vence hoy
        cuota('L1', 2, '2026-10-02', 800, 200),      // futura: no cuenta
        cuota('L2', 1, '2026-08-02', 500, 100),      // vencida hace 31 dias
        cuota('L2', 2, HOY, 500, 100),               // + vence hoy
        cuota('L3', 1, '2026-12-01', 900, 100),      // solo futuras: NO es parada
      ],
      payments: [],
      dateIso: HOY,
    });
  
    ok('2 paradas (el de solo futuras queda fuera)', stops.length === 2, String(stops.length));
  
    const c2 = stops.find(s => s.client.id === 'c2');
    ok('c2 vence hoy 600', c2.dueToday === 600, String(c2.dueToday));
    ok('c2 atrasado 600', c2.overdue === 600, String(c2.overdue));
    ok('c2 total a cobrar 1200', c2.totalToCollect === 1200, String(c2.totalToCollect));
    ok('c2 dias de atraso 31', c2.maxDaysOverdue === 31, String(c2.maxDaysOverdue));
    ok('c2 una cuota vencida', c2.overdueCount === 1);
  
    const c1 = stops.find(s => s.client.id === 'c1');
    ok('c1 solo vence hoy', c1.dueToday === 1000 && c1.overdue === 0, JSON.stringify([c1.dueToday, c1.overdue]));
    ok('c1 sin atraso', c1.maxDaysOverdue === 0);
  
    ok('ordena el mas atrasado primero', stops[0].client.id === 'c2', stops[0].client.id);
  }
  
  });

  it("Un cliente con VARIOS prestamos = UNA parada", () => {
  {
    const stops = buildRouteStops({
      clients: [cli('c1')],
      loans: [prestamo('L1', 'c1', { current_late_fee: 50 }), prestamo('L2', 'c1', { current_late_fee: 30 })],
      installments: [cuota('L1', 1, HOY, 800, 200), cuota('L2', 1, HOY, 400, 100)],
      payments: [],
      dateIso: HOY,
    });
    ok('una sola parada', stops.length === 1);
    ok('suma los dos prestamos', stops[0].dueToday === 1500, String(stops[0].dueToday));
    ok('lista los 2 prestamos', stops[0].loans.length === 2);
    ok('suma la mora de ambos', stops[0].lateFee === 80, String(stops[0].lateFee));
  }
  
  });

  it("Pagos parciales descuentan", () => {
  {
    const stops = buildRouteStops({
      clients: [cli('c1')],
      loans: [prestamo('L1', 'c1')],
      installments: [cuota('L1', 1, HOY, 800, 200)],
      payments: [{ loan_id: 'L1', amount: 400, principal_amount: 320, interest_amount: 80, due_date: HOY }],
      dateIso: HOY,
    });
    ok('cobra solo lo que falta', stops[0].dueToday === 600, String(stops[0].dueToday));
  }
  
  });

  it("Cuota saldada no genera parada", () => {
  {
    const stops = buildRouteStops({
      clients: [cli('c1')],
      loans: [prestamo('L1', 'c1')],
      installments: [cuota('L1', 1, HOY, 800, 200, { is_paid: true })],
      payments: [],
      dateIso: HOY,
    });
    ok('sin paradas', stops.length === 0, String(stops.length));
  }
  
  });

  it("Prestamos cerrados se ignoran", () => {
  {
    const base = {
      clients: [cli('c1')],
      installments: [cuota('L1', 1, HOY, 800, 200)],
      payments: [],
      dateIso: HOY,
    };
    ok('pagado se ignora', buildRouteStops({ ...base, loans: [prestamo('L1', 'c1', { status: 'paid' })] }).length === 0);
    ok('eliminado se ignora', buildRouteStops({ ...base, loans: [prestamo('L1', 'c1', { status: 'deleted' })] }).length === 0);
    ok('pendiente se ignora', buildRouteStops({ ...base, loans: [prestamo('L1', 'c1', { status: 'pending' })] }).length === 0);
    ok('overdue SI cuenta', buildRouteStops({ ...base, loans: [prestamo('L1', 'c1', { status: 'overdue' })] }).length === 1);
  }
  
  });

  it("Filtro por ruta asignada", () => {
  {
    const base = {
      clients: [cli('c1', { collection_route: 'RUTA PRINCIPAL' }), cli('c2', { collection_route: 'RUTA SECUNDARIA' })],
      loans: [prestamo('L1', 'c1'), prestamo('L2', 'c2')],
      installments: [cuota('L1', 1, HOY, 800, 200), cuota('L2', 1, HOY, 500, 100)],
      payments: [],
      dateIso: HOY,
    };
    ok('sin filtro trae 2', buildRouteStops(base).length === 2);
    ok('filtra principal', buildRouteStops({ ...base, routeFilter: 'RUTA PRINCIPAL' }).map(s => s.client.id).join() === 'c1');
    ok('filtra secundaria', buildRouteStops({ ...base, routeFilter: 'RUTA SECUNDARIA' }).map(s => s.client.id).join() === 'c2');
  }
  
  });

  it("Solo atrasados (sin cuota hoy)", () => {
  {
    const base = {
      clients: [cli('c1')],
      loans: [prestamo('L1', 'c1')],
      installments: [cuota('L1', 1, '2026-08-01', 800, 200)],
      payments: [],
      dateIso: HOY,
    };
    ok('incluido por defecto', buildRouteStops(base).length === 1);
    ok('excluible', buildRouteStops({ ...base, includeOverdueOnly: false }).length === 0);
  }
  
  });

  it("Coordenadas", () => {
  {
    ok('validas', JSON.stringify(parseCoords(cli('x', { latitude: 19.45, longitude: -70.7 }))) === '{"lat":19.45,"lng":-70.7}');
    ok('texto numerico', parseCoords(cli('x', { latitude: '19.45', longitude: '-70.7' })).lat === 19.45);
    ok('nulas', parseCoords(cli('x')) === null);
    ok('isla nula 0,0 se descarta', parseCoords(cli('x', { latitude: 0, longitude: 0 })) === null);
    ok('fuera de rango', parseCoords(cli('x', { latitude: 200, longitude: -70 })) === null);
    ok('no numerico', parseCoords(cli('x', { latitude: 'abc', longitude: '-70' })) === null);
  }
  
  });

  it("Orden por cercania", () => {
  {
    const mk = (id, lat, lng) => ({
      client: cli(id, { latitude: lat, longitude: lng }), loans: [], dueToday: 100, overdue: 0,
      lateFee: 0, totalToCollect: 100, maxDaysOverdue: 0, overdueCount: 0,
      coords: lat === null ? null : { lat, lng }, legKm: null,
    });
    // Santiago (origen) -> los puntos estan a distancias crecientes hacia el este
    const origin = { lat: 19.45, lng: -70.70 };
    const stops = [mk('lejos', 19.45, -70.40), mk('cerca', 19.45, -70.68), mk('medio', 19.45, -70.55)];
  
    const ordered = orderByProximity(stops, origin);
    ok('vecino mas proximo', ordered.map(s => s.client.id).join() === 'cerca,medio,lejos', ordered.map(s => s.client.id).join());
    ok('primera parada con tramo medido', ordered[0].legKm > 0);
    ok('tramos crecientes por posicion', ordered.every(s => s.legKm !== null));
  
    // Sin coordenadas: al final, sin perderse
    const mixed = orderByProximity([mk('sin', null, null), mk('cerca', 19.45, -70.68)], origin);
    ok('las sin ubicacion van al final', mixed.map(s => s.client.id).join() === 'cerca,sin', mixed.map(s => s.client.id).join());
    ok('no se pierde ninguna', mixed.length === 2);
    ok('la sin ubicacion no tiene tramo', mixed[1].legKm === null);
  
    ok('sin origen no revienta', orderByProximity(stops, null).length === 3);
    ok('lista vacia', orderByProximity([], origin).length === 0);
  }
  
  });

  it("Resumen", () => {
  {
    const stops = buildRouteStops({
      clients: [cli('c1', { latitude: 19.45, longitude: -70.7 }), cli('c2')],
      loans: [prestamo('L1', 'c1'), prestamo('L2', 'c2')],
      installments: [cuota('L1', 1, HOY, 800, 200), cuota('L2', 1, '2026-08-01', 500, 100)],
      payments: [],
      dateIso: HOY,
    });
    const s = summarizeRoute(stops);
    ok('total hoy 1000', s.totalDueToday === 1000, String(s.totalDueToday));
    ok('total atrasado 600', s.totalOverdue === 600, String(s.totalOverdue));
    ok('total a cobrar 1600', s.totalToCollect === 1600, String(s.totalToCollect));
    ok('1 sin ubicacion', s.withoutLocation === 1, String(s.withoutLocation));
    ok('resumen vacio', summarizeRoute([]).totalToCollect === 0);
  }
  
  });

  it("Direccion legible", () => {
  {
    ok('completa', stopAddress(cli('c1')) === 'Calle c1, Los Prados, Santiago, Santiago');
    ok('omite vacios', stopAddress({ id: 'x', full_name: 'X', address: 'Calle 1', municipality: 'Mao' }) === 'Calle 1, Mao');
    ok('sin nada', stopAddress({ id: 'x', full_name: 'X' }) === '');
  }
  
  });

  it("Enlace de ruta en Google Maps", () => {
  {
    const p = (n) => Array.from({ length: n }, (_, i) => ({ lat: 19 + i * 0.01, lng: -70 - i * 0.01 }));
  
    let r = mapsRouteUrl(p(3), { lat: 19.45, lng: -70.7 });
    ok('incluye origen', r.url.includes('origin=19.45%2C-70.7'), r.url);
    ok('incluye destino', r.url.includes('destination='));
    ok('incluye 2 waypoints', (r.url.match(/%7C/g) || []).length === 1, r.url);
    ok('3 paradas incluidas', r.included === 3 && r.truncated === false);
  
    // Google Maps admite 9 waypoints + destino = 10 paradas; con mas hay que avisar
    r = mapsRouteUrl(p(15), null);
    ok('recorta a 10 paradas', r.included === MAX_WAYPOINTS + 1, String(r.included));
    ok('avisa que recorto', r.truncated === true);
    ok('sin origen no lo incluye', !r.url.includes('origin='));
  
    ok('lista vacia devuelve url vacia', mapsRouteUrl([], null).url === '');
  
    // Distancia: Santiago -> Santo Domingo son ~145 km en linea recta
    const d = distanceKm({ lat: 19.4517, lng: -70.6970 }, { lat: 18.4861, lng: -69.9312 });
    ok('distancia plausible Santiago-SD', d > 130 && d < 160, String(d));
    ok('misma coordenada = 0', distanceKm({ lat: 19, lng: -70 }, { lat: 19, lng: -70 }) === 0);
  }
  
  });

  it("Leer coordenadas escritas o pegadas", () => {
  {
    const eq = (r, lat, lng) => r && r.lat === lat && r.lng === lng;
  
    ok('par simple', eq(parseCoordinates('18.486058, -69.931212'), 18.486058, -69.931212));
    ok('sin espacio', eq(parseCoordinates('18.486058,-69.931212'), 18.486058, -69.931212));
    ok('separado por espacio', eq(parseCoordinates('18.486058 -69.931212'), 18.486058, -69.931212));
    ok('con espacios alrededor', eq(parseCoordinates('  19.45 , -70.70  '), 19.45, -70.7));
    ok('enteros', eq(parseCoordinates('19, -70'), 19, -70));
  
    // Lo que la gente pega de verdad: una URL de Google Maps
    ok('URL con @', eq(parseCoordinates('https://www.google.com/maps/@18.486058,-69.931212,15z'), 18.486058, -69.931212));
    ok('URL con ?q=', eq(parseCoordinates('https://maps.google.com/?q=18.486058,-69.931212'), 18.486058, -69.931212));
    ok('URL de direcciones', eq(parseCoordinates('https://www.google.com/maps/dir/?api=1&destination=19.45,-70.70'), 19.45, -70.7));
  
    ok('vacio', parseCoordinates('') === null);
    ok('texto suelto', parseCoordinates('mi casa') === null);
    ok('un solo numero', parseCoordinates('18.486058') === null);
    ok('latitud fuera de rango', parseCoordinates('200, -69') === null);
    ok('longitud fuera de rango', parseCoordinates('18, -500') === null);
    ok('null no revienta', parseCoordinates(null) === null);
  }
  
  
  });
});
