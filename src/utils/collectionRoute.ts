// ============================================================================
// RUTA DE COBRO — armado y ordenación de las paradas del día
// ============================================================================
// Funciones puras: reciben lo ya descargado y devuelven las paradas del cobrador. Sin acceso
// a datos, así que se pueden probar de verdad.
//
// Una PARADA es un cliente, no un préstamo: si alguien tiene tres préstamos, el cobrador va
// UNA vez a su casa y cobra los tres. Por eso se agrupa por cliente y se suman los importes.
//
// Lo pendiente por cuota se calcula con `computeInstallmentDues`, la misma función que usa el
// pago avanzado: si las dos vistas discreparan, el cobrador cobraría un importe distinto al
// que luego acepta el formulario de pago.

import { computeInstallmentDues, type RawInstallment, type RawPayment } from './installmentDues';
import { distanceKm, type LatLng } from './googleMaps';

const round2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;
const dateOnly = (v: unknown) => String(v ?? '').split('T')[0];

export interface RouteClient {
  id: string;
  full_name: string;
  phone?: string | null;
  address?: string | null;
  sector?: string | null;
  municipality?: string | null;
  province?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  location_note?: string | null;
  collection_route?: string | null;
}

export interface RouteLoan {
  id: string;
  client_id: string;
  status?: string | null;
  remaining_balance?: number | null;
  current_late_fee?: number | null;
}

/** Detalle de un préstamo dentro de una parada. */
export interface RouteLoanDetail {
  loanId: string;
  /** Pendiente de las cuotas que vencen justo el día de la ruta */
  dueToday: number;
  /** Pendiente de las cuotas ya vencidas antes de ese día */
  overdue: number;
  /** Días de atraso de la cuota vencida más antigua */
  maxDaysOverdue: number;
  /** Cuántas cuotas están vencidas */
  overdueCount: number;
  lateFee: number;
}

export interface RouteStop {
  client: RouteClient;
  loans: RouteLoanDetail[];
  /** Total a cobrar hoy (cuotas que vencen el día de la ruta) */
  dueToday: number;
  /** Total atrasado (cuotas vencidas de días anteriores) */
  overdue: number;
  /** Mora acumulada de los préstamos del cliente */
  lateFee: number;
  /** dueToday + overdue: lo que el cobrador debería pedir */
  totalToCollect: number;
  maxDaysOverdue: number;
  overdueCount: number;
  coords: LatLng | null;
  /** Distancia en km desde la parada anterior; null en la primera o sin coordenadas */
  legKm: number | null;
}

export interface RouteSummary {
  stops: RouteStop[];
  totalDueToday: number;
  totalOverdue: number;
  totalToCollect: number;
  /** Paradas sin ubicación GPS: no se pueden trazar en el mapa */
  withoutLocation: number;
  /** Kilómetros sumando los tramos con coordenadas */
  totalKm: number;
}

export interface BuildRouteInput {
  clients: RouteClient[];
  loans: RouteLoan[];
  installments: (RawInstallment & { loan_id: string })[];
  payments: (RawPayment & { loan_id: string })[];
  /** Día de la ruta, 'YYYY-MM-DD' */
  dateIso: string;
  /** Filtro por ruta asignada al cliente; 'all' no filtra */
  routeFilter?: string;
  /** Incluir clientes que solo tienen atraso (sin cuota que venza hoy) */
  includeOverdueOnly?: boolean;
}

const LOAN_ACTIVE = new Set(['active', 'overdue']);

/**
 * Arma las paradas del día: un cliente por parada, con lo que vence hoy y lo atrasado.
 * No incluye clientes sin nada que cobrar.
 */
export const buildRouteStops = (input: BuildRouteInput): RouteStop[] => {
  const { dateIso } = input;
  const routeFilter = input.routeFilter ?? 'all';
  const includeOverdueOnly = input.includeOverdueOnly !== false;

  const clientById = new Map(input.clients.map(c => [c.id, c]));

  // Cuotas y pagos agrupados por préstamo, para calcular el pendiente real de cada cuota.
  const installmentsByLoan = new Map<string, RawInstallment[]>();
  for (const inst of input.installments) {
    if (!installmentsByLoan.has(inst.loan_id)) installmentsByLoan.set(inst.loan_id, []);
    installmentsByLoan.get(inst.loan_id)!.push(inst);
  }
  const paymentsByLoan = new Map<string, RawPayment[]>();
  for (const p of input.payments) {
    if (!paymentsByLoan.has(p.loan_id)) paymentsByLoan.set(p.loan_id, []);
    paymentsByLoan.get(p.loan_id)!.push(p);
  }

  const byClient = new Map<string, RouteStop>();

  for (const loan of input.loans) {
    if (!LOAN_ACTIVE.has(String(loan.status || '').toLowerCase())) continue;

    const client = clientById.get(loan.client_id);
    if (!client) continue;
    if (routeFilter !== 'all' && (client.collection_route || '') !== routeFilter) continue;

    const dues = computeInstallmentDues(
      installmentsByLoan.get(loan.id) ?? [],
      paymentsByLoan.get(loan.id) ?? [],
    );

    let dueToday = 0;
    let overdue = 0;
    let maxDays = 0;
    let overdueCount = 0;

    for (const row of dues) {
      if (row.pending <= 0.005) continue;
      const due = dateOnly(row.dueDate);
      if (!due) continue;

      if (due === dateIso) {
        dueToday += row.pending;
      } else if (due < dateIso) {
        overdue += row.pending;
        overdueCount++;
        const days = daysBetween(due, dateIso);
        if (days > maxDays) maxDays = days;
      }
    }

    if (dueToday <= 0.005 && overdue <= 0.005) continue;
    if (dueToday <= 0.005 && !includeOverdueOnly) continue;

    const lateFee = round2(Number(loan.current_late_fee || 0));
    const detail: RouteLoanDetail = {
      loanId: loan.id,
      dueToday: round2(dueToday),
      overdue: round2(overdue),
      maxDaysOverdue: maxDays,
      overdueCount,
      lateFee,
    };

    const existing = byClient.get(client.id);
    if (existing) {
      existing.loans.push(detail);
      existing.dueToday = round2(existing.dueToday + detail.dueToday);
      existing.overdue = round2(existing.overdue + detail.overdue);
      existing.lateFee = round2(existing.lateFee + lateFee);
      existing.totalToCollect = round2(existing.dueToday + existing.overdue);
      existing.maxDaysOverdue = Math.max(existing.maxDaysOverdue, maxDays);
      existing.overdueCount += overdueCount;
    } else {
      byClient.set(client.id, {
        client,
        loans: [detail],
        dueToday: detail.dueToday,
        overdue: detail.overdue,
        lateFee,
        totalToCollect: round2(detail.dueToday + detail.overdue),
        maxDaysOverdue: maxDays,
        overdueCount,
        coords: parseCoords(client),
        legKm: null,
      });
    }
  }

  // Orden por defecto: primero lo más atrasado, luego el importe mayor. Es el orden que
  // interesa cuando NO hay coordenadas para optimizar el recorrido.
  return [...byClient.values()].sort(
    (a, b) => b.maxDaysOverdue - a.maxDaysOverdue
      || b.totalToCollect - a.totalToCollect
      || a.client.full_name.localeCompare(b.client.full_name),
  );
};

/** Coordenadas del cliente, o `null` si no tiene o son inválidas. */
export const parseCoords = (client: RouteClient): LatLng | null => {
  const lat = Number(client.latitude);
  const lng = Number(client.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null; // isla nula: dato basura, no una ubicación
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
};

/** Días naturales entre dos fechas 'YYYY-MM-DD'. */
const daysBetween = (from: string, to: string): number => {
  const a = new Date(`${from}T00:00:00`);
  const b = new Date(`${to}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
};

/**
 * Ordena las paradas por cercanía (vecino más próximo desde el origen).
 *
 * Es una heurística, no la ruta óptima: el problema del viajante no tiene solución rápida y
 * para 10-40 paradas el vecino más próximo da un recorrido razonable al instante. Las paradas
 * SIN coordenadas van al final, en su orden original: no se pueden situar, pero tampoco se
 * pueden perder — el cobrador tiene que visitarlas igual.
 */
export const orderByProximity = (stops: RouteStop[], origin: LatLng | null): RouteStop[] => {
  const located = stops.filter(s => s.coords);
  const unlocated = stops.filter(s => !s.coords);

  const ordered: RouteStop[] = [];
  const pending = [...located];
  let cursor = origin;

  while (pending.length > 0) {
    let bestIndex = 0;
    if (cursor) {
      let bestDistance = Infinity;
      pending.forEach((stop, i) => {
        const d = distanceKm(cursor!, stop.coords!);
        if (d < bestDistance) { bestDistance = d; bestIndex = i; }
      });
    }
    const [next] = pending.splice(bestIndex, 1);
    ordered.push({ ...next, legKm: cursor ? distanceKm(cursor, next.coords!) : null });
    cursor = next.coords!;
  }

  return [...ordered, ...unlocated.map(s => ({ ...s, legKm: null }))];
};

export const summarizeRoute = (stops: RouteStop[]): RouteSummary => ({
  stops,
  totalDueToday: round2(stops.reduce((s, x) => s + x.dueToday, 0)),
  totalOverdue: round2(stops.reduce((s, x) => s + x.overdue, 0)),
  totalToCollect: round2(stops.reduce((s, x) => s + x.totalToCollect, 0)),
  withoutLocation: stops.filter(s => !s.coords).length,
  totalKm: round2(stops.reduce((s, x) => s + (x.legKm ?? 0), 0)),
});

/** Dirección legible de una parada, para mostrarla y para buscarla en el mapa. */
export const stopAddress = (client: RouteClient): string =>
  [client.address, client.sector, client.municipality, client.province]
    .map(v => String(v ?? '').trim())
    .filter(Boolean)
    .join(', ');
