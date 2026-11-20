// ============================================================================
// LAS VENTAS, AGRUPADAS POR TICKET
// ============================================================================
// PEDIDO (2026-11-20): "al dashboard inicial agrégale que salgan las ventas o empeños".
//
// Hace falta agrupar porque hay bases donde una venta NO tiene una fila propia: cada fila de
// `sales` es una LÍNEA (un producto), así que una venta de tres productos son tres filas. Sin
// agrupar, el inicio contaría tres ventas donde hubo una, y la actividad reciente se llenaría de
// la misma venta repetida.

import { getSaleAmount, type SaleLike } from './portfolioMetrics';

/**
 * Las ventas agrupadas por TICKET.
 *
 * En el esquema simple cada fila de `sales` es una LÍNEA, no una venta: una venta de tres
 * productos son tres filas. Se agrupan por su número de venta o, si no lo tiene, por cliente e
 * instante —las líneas de una misma venta se insertan a la vez—, para que el inicio no cuente
 * tres ventas donde hubo una (2026-11-20).
 */
export interface SaleTicket {
  key: string;
  at: string;
  day: string;
  total: number;
  cliente: string;
  lineas: number;
}

export const groupSaleTickets = (rows: SaleLike[]): SaleTicket[] => {
  const porTicket = new Map<string, SaleTicket>();
  for (const v of (rows || []) as any[]) {
    const at = String(v.created_at || v.sale_date || '');
    if (!at) continue;
    const cliente = String(v.customer_name || v.client_name || '').trim() || 'Consumidor final';
    const key = String(v.sale_number || `${cliente}|${at}`);
    const importe = getSaleAmount(v);
    const previo = porTicket.get(key);
    if (previo) {
      previo.total = Math.round((previo.total + importe) * 100) / 100;
      previo.lineas += 1;
    } else {
      porTicket.set(key, {
        key, at, day: String(v.sale_date || at).split('T')[0],
        total: Math.round(importe * 100) / 100, cliente, lineas: 1,
      });
    }
  }
  return [...porTicket.values()];
};
