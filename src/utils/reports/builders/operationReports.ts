// ============================================================================
// Reportes de GASTOS, VENTAS, INVENTARIO, CAJA/BANCOS y LEGAL
// ============================================================================
// Cada uno trabaja sobre su propio conjunto de datos, que solo se carga al abrir el reporte.
// Los precios se enseñan SIEMPRE con ITBIS (`itbis.ts`), como el resto del sistema.

import {
  DEFAULT_ITBIS_RATE, purchasePriceWithItbis, sellingPriceWithItbis,
  stockCostWithItbis, stockValueWithItbis,
} from '../../itbis';
import { saleAmounts, type SaleAmounts } from '../../saleAmounts';
import { getFrequencyLabel, toAnnualRate } from '../../frequencyUtils';
import {
  LOAN_STATUS_LABEL, PAYMENT_METHOD_LABEL, clientNameOf, dateOnly, labelFor, round2, userNameOf,
  type ReportData,
} from '../reportDataset';
import { inPeriod } from '../reportPeriods';
import { applyCommonFilters, groupRows } from '../reportFilters';
import type { ReportDefinition, ReportRow } from '../reportTypes';

const sinDato = (notes: string[], cargando: boolean, vacio: string) => {
  if (cargando) notes.push('Los datos de este reporte todavía se están cargando.');
  else notes.push(vacio);
  return notes;
};

// ---------------------------------------------------------------------------
// GASTOS
// ---------------------------------------------------------------------------

const expenseRows = (data: ReportData, filters: { startDate: string; endDate: string; category?: string; userId?: string }) =>
  (data.expenses?.rows || [])
    .filter(e => inPeriod(dateOnly(e.expense_date), filters))
    .filter(e => !filters.category || String(e.category || '') === filters.category)
    .filter(e => !filters.userId || String(e.created_by || '') === filters.userId);

export const expenseReports: ReportDefinition<ReportData>[] = [
  {
    id: 'expenses-detail',
    name: 'Gastos del período',
    category: 'gastos',
    description: 'Cada gasto registrado, con su categoría y quién lo registró.',
    permission: 'expenses.view',
    dataset: 'expenses',
    columns: [
      { key: 'fecha', label: 'Fecha', format: 'date' },
      { key: 'categoria', label: 'Categoría', align: 'left' },
      { key: 'descripcion', label: 'Descripción', align: 'left', width: 60 },
      { key: 'monto', label: 'Monto', format: 'money', total: true },
      { key: 'metodo', label: 'Método', align: 'left', hiddenByDefault: true },
      { key: 'usuario', label: 'Registró', align: 'left' },
      { key: 'estado', label: 'Estado', format: 'badge' },
    ],
    filters: ['search', 'category', 'userId', 'minAmount', 'maxAmount'],
    defaultSort: { key: 'fecha', dir: 'desc' },
    keywords: ['gastos', 'egresos', 'compras', 'salidas'],
    build: ctx => {
      const { data, filters } = ctx;
      const tieneMetodo = (data.expenses?.availableColumns || []).includes('payment_method');
      const rows = expenseRows(data, filters).map(e => ({
        _id: e.id,
        fecha: dateOnly(e.expense_date),
        categoria: String(e.category || 'Sin categoría'),
        descripcion: String(e.description || ''),
        monto: round2(e.amount),
        metodo: tieneMetodo ? labelFor(PAYMENT_METHOD_LABEL, e.payment_method || 'cash') : '—',
        usuario: userNameOf(data, e.created_by),
        estado: String(e.status || 'approved') === 'approved' ? 'Aprobado' : String(e.status),
      } as ReportRow));
      const filtradas = applyCommonFilters(rows, filters, 'monto');
      const notes: string[] = [];
      if (!tieneMetodo) {
        notes.push('La tabla de gastos de esta base no guarda el método de pago, así que esa '
          + 'columna sale vacía. Para tenerla habría que añadir la columna `payment_method`.');
      }
      if (!data.expenses) sinDato(notes, true, '');
      return {
        rows: filtradas,
        notes,
        kpis: [
          { key: 'cantidad', label: 'Gastos', value: filtradas.length, format: 'number' },
          {
            key: 'total', label: 'Total gastado', format: 'money',
            value: round2(filtradas.reduce((s, r) => s + (Number(r.monto) || 0), 0)),
          },
        ],
      };
    },
  },

  {
    id: 'expenses-by-category',
    name: 'Gastos por categoría',
    category: 'gastos',
    description: 'En qué se va el dinero, de mayor a menor.',
    permission: 'expenses.view',
    dataset: 'expenses',
    columns: [
      { key: 'categoria', label: 'Categoría', align: 'left' },
      { key: 'cantidad', label: 'Gastos', format: 'number', total: true },
      { key: 'monto', label: 'Total', format: 'money', total: true },
      { key: 'participacion', label: '% del total', format: 'percent' },
      { key: 'promedio', label: 'Promedio', format: 'money' },
    ],
    filters: ['search', 'userId'],
    defaultSort: { key: 'monto', dir: 'desc' },
    keywords: ['categoría', 'tipo de gasto', 'distribución'],
    build: ctx => {
      const { data, filters } = ctx;
      const lista = expenseRows(data, filters);
      const total = round2(lista.reduce((s, e) => s + (Number(e.amount) || 0), 0));
      const grupos = groupRows(lista, e => String(e.category || 'Sin categoría'));
      const rows: ReportRow[] = [...grupos.entries()].map(([categoria, items]) => {
        const monto = round2(items.reduce((s, e) => s + (Number(e.amount) || 0), 0));
        return {
          _id: categoria,
          categoria,
          cantidad: items.length,
          monto,
          participacion: total > 0 ? Math.round((monto / total) * 1000) / 10 : 0,
          promedio: items.length ? round2(monto / items.length) : 0,
        };
      });
      return {
        rows: applyCommonFilters(rows, filters, 'monto'),
        charts: [{
          kind: 'pie', title: 'Reparto del gasto', xKey: 'categoria',
          series: [{ key: 'monto', label: 'Total' }], money: true,
        }],
      };
    },
  },

  {
    id: 'expenses-evolution',
    name: 'Evolución de gastos',
    category: 'gastos',
    description: 'Cómo se mueve el gasto mes a mes.',
    permission: 'expenses.view',
    dataset: 'expenses',
    columns: [
      { key: 'mes', label: 'Mes', align: 'left' },
      { key: 'cantidad', label: 'Gastos', format: 'number', total: true },
      { key: 'monto', label: 'Total', format: 'money', total: true },
    ],
    filters: ['category'],
    defaultSort: { key: 'mes', dir: 'asc' },
    keywords: ['evolución', 'tendencia', 'mensual'],
    build: ctx => {
      const lista = expenseRows(ctx.data, ctx.filters);
      const grupos = groupRows(lista, e => dateOnly(e.expense_date).slice(0, 7));
      const rows: ReportRow[] = [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([mes, items]) => ({
        _id: mes,
        mes,
        cantidad: items.length,
        monto: round2(items.reduce((s, e) => s + (Number(e.amount) || 0), 0)),
      }));
      return {
        rows,
        charts: [{ kind: 'bar', title: 'Gasto mensual', xKey: 'mes', series: [{ key: 'monto', label: 'Gasto' }], money: true }],
      };
    },
  },
];

// ---------------------------------------------------------------------------
// VENTAS
// ---------------------------------------------------------------------------

const salesInPeriod = (data: ReportData, filters: { startDate: string; endDate: string; userId?: string; paymentMethod?: string }) =>
  (data.salesDetail?.sales || [])
    .filter(s => inPeriod(dateOnly(s.sale_date || s.created_at), filters))
    .filter(s => !filters.userId || String(s.user_id || '') === filters.userId)
    .filter(s => !filters.paymentMethod || String(s.payment_method || 'cash').toLowerCase() === filters.paymentMethod);

interface SaleLineLike {
  unit_price?: number | null;
  quantity?: number | null;
  total_price?: number | null;
  itbis_rate?: number | null;
  product_name?: string | null;
  product_id?: string | null;
  /** Precio de LISTA por unidad, con ITBIS, guardado con la venta. */
  list_unit_price?: number | null;
  /** Precio de venta de hoy del producto, para deducirlo en las ventas que no lo guardaron. */
  product_selling_price?: number | null;
}
interface SaleLike {
  total_amount?: number | null;
  total_price?: number | null;
  subtotal?: number | null;
  tax_amount?: number | null;
  discount_amount?: number | null;
  details?: SaleLineLike[];
}

const comoLinea = (d: SaleLineLike) => ({
  quantity: d?.quantity,
  unit_price: d?.unit_price,
  total_price: d?.total_price,
  itbis_rate: d?.itbis_rate,
  list_unit_price: d?.list_unit_price,
  product: (Number(d?.product_selling_price) || 0) > 0
    ? { selling_price: d?.product_selling_price, itbis_rate: d?.itbis_rate }
    : null,
});

/**
 * EL DESGLOSE DE UNA VENTA: precio de lista, descuento, base, ITBIS y total.
 *
 * FALLO REPORTADO (2026-11-18): "muchas de esas ventas fue con descuento pero no hay forma de
 * saberlo porque no lo indica". El descuento sale de comparar lo cobrado con el precio de lista
 * (`saleAmounts`); la cuenta es la misma que usan la factura y el módulo de inventario, así que
 * una venta no puede decir una cosa en el reporte y otra en su propio papel.
 */
export const saleBreakdown = (sale: SaleLike): SaleAmounts => {
  const detalle = saleAmounts((sale.details || []).map(comoLinea));
  const guardadoElItbis = sale.tax_amount !== null && sale.tax_amount !== undefined;

  if (detalle.total > 0.005) {
    // Si la base guardó el ITBIS, ese manda: es lo que se declaró.
    if (guardadoElItbis) {
      const tax = round2(sale.tax_amount);
      return { ...detalle, tax, base: round2(detalle.total - tax) };
    }
    return detalle;
  }

  // Sin líneas: lo que la venta guardó de sí misma.
  const total = typeof sale.total_amount === 'number' && sale.total_amount > 0
    ? round2(sale.total_amount)
    : round2(sale.total_price);
  // Sin líneas no se sabe la tasa de los productos: se usa la dominicana.
  const tax = guardadoElItbis ? round2(sale.tax_amount) : round2(total - total / (1 + DEFAULT_ITBIS_RATE / 100));
  const base = round2(total - tax);
  const discount = round2(Math.max(0, Number(sale.discount_amount) || 0));
  const listBase = round2(base + discount);
  const factor = base > 0.005 ? total / base : 1;
  const listTotal = round2(listBase * factor);
  return {
    items: 0,
    listBase, listTotal, base, tax, total,
    discount,
    discountWithTax: round2(Math.max(0, listTotal - total)),
    discountPercent: listTotal > 0.005 ? round2(((listTotal - total) / listTotal) * 100) : 0,
    discountSource: discount > 0.005 ? 'guardado' : 'ninguno',
    lines: [],
  };
};

/** Importe de una venta CON ITBIS, con las dos formas en que el sistema las ha guardado. */
export const saleTotalWithTax = (sale: SaleLike): number => saleBreakdown(sale).total;

/**
 * El ITBIS de una venta: el que se guardó y, si la base no lo guarda, el que llevan sus líneas.
 *
 * FALLO REPORTADO (2026-11-17): "el monto sale en el subtotal pero no sale nada en ITBIS ni en
 * descuento". Las ventas de ese esquema no tienen columna `tax_amount`, y el reporte la leía tal
 * cual: ITBIS 0 y un subtotal igual al total, como si nada llevara impuesto. El impuesto se
 * deduce de cada línea con la tasa de SU producto (un exento sigue sin ITBIS).
 */
export const saleTaxAmount = (sale: SaleLike): number => saleBreakdown(sale).tax;

/** Contado, financiada o a crédito. */
const tipoDeVenta = (sale: { payment_method?: string | null; sale_type?: string | null }): string => {
  if (String(sale.payment_method || '').toLowerCase() === 'financing') return 'Financiada';
  if (String(sale.sale_type || '').toLowerCase() === 'credit') return 'A crédito';
  return 'Contado';
};

/** La forma de pago, y su reparto cuando la venta se cobró con varias. */
const formasDePago = (sale: {
  payment_method?: string | null;
  payment_details?: Array<{ method?: string; label?: string; amount?: number }> | null;
}): string => {
  const partes = (sale.payment_details || []).filter(p => (Number(p?.amount) || 0) > 0.005);
  if (partes.length > 1) {
    return partes
      .map(p => `${labelFor(PAYMENT_METHOD_LABEL, p.method || 'cash')} ${round2(p.amount).toLocaleString('es-DO')}`)
      .join(' + ');
  }
  return labelFor(PAYMENT_METHOD_LABEL, sale.payment_method || 'cash');
};

/**
 * Aviso para el pie del reporte cuando el descuento no se guardó y hubo que deducirlo del precio
 * de venta de hoy: si al producto le cambiaron el precio después, la cifra es aproximada.
 */
const notaDeDescuentos = (deducido: boolean): string[] => deducido
  ? ['Las ventas anteriores al 18/11/2026 no guardaban el precio de lista: su descuento se deduce '
    + 'del precio de venta actual del producto, así que si a alguno le cambiaron el precio después, '
    + 'esa cifra es aproximada. Las ventas nuevas guardan el precio del día y ya no se deduce nada.']
  : [];

export const salesReports: ReportDefinition<ReportData>[] = [
  {
    id: 'sales-detail',
    name: 'Ventas del período',
    category: 'ventas',
    description: 'Cada venta con lo que de verdad pasó en ella: precio de lista, descuento, ITBIS, '
      + 'forma de pago y quién la hizo.',
    permission: 'reports.inventory',
    dataset: 'sales',
    columns: [
      { key: 'fecha', label: 'Fecha', format: 'date' },
      { key: 'numero', label: 'Venta', align: 'left' },
      { key: 'cliente', label: 'Cliente', align: 'left' },
      { key: 'articulos', label: 'Artículos', format: 'number', total: true },
      { key: 'precioLista', label: 'Precio de lista', format: 'money', total: true, help: 'Lo que valía sin descuento, sin ITBIS' },
      { key: 'descuento', label: 'Descuento', format: 'money', total: true, help: 'Lo rebajado, sin ITBIS' },
      { key: 'descuentoPct', label: '% Desc.', format: 'percent' },
      { key: 'subtotal', label: 'Subtotal', format: 'money', total: true, help: 'Precio de lista menos el descuento' },
      { key: 'itbis', label: 'ITBIS', format: 'money', total: true },
      { key: 'total', label: 'Total', format: 'money', total: true },
      { key: 'metodo', label: 'Método', align: 'left' },
      { key: 'tipo', label: 'Tipo', format: 'badge', hiddenByDefault: true, help: 'Contado, financiada o a crédito' },
      { key: 'reparto', label: 'Reparto del pago', align: 'left', width: 40, hiddenByDefault: true },
      { key: 'usuario', label: 'Vendió', align: 'left' },
    ],
    filters: ['search', 'userId', 'paymentMethod', 'minAmount', 'maxAmount'],
    defaultSort: { key: 'fecha', dir: 'desc' },
    keywords: ['ventas', 'punto de venta', 'facturas', 'recibos', 'pos', 'descuento'],
    build: ctx => {
      const { data, filters } = ctx;
      const ventas = salesInPeriod(data, filters);
      let deducido = false;
      const rows = ventas.map(s => {
        // Precio de lista, descuento, base, ITBIS y total: la misma cuenta que la factura.
        const v = saleBreakdown(s);
        if (v.discountSource === 'deducido') deducido = true;
        return {
          _id: s.id,
          _clientId: s.client_id || undefined,
          fecha: dateOnly(s.sale_date || s.created_at),
          numero: String(s.sale_number || s.id.slice(0, 8)),
          cliente: String(s.customer_name || 'Consumidor final'),
          articulos: (s.details || []).reduce((n, d) => n + (Number(d.quantity) || 0), 0),
          precioLista: v.listBase,
          descuento: v.discount,
          descuentoPct: v.discountPercent,
          subtotal: v.base,
          itbis: v.tax,
          total: v.total,
          metodo: labelFor(PAYMENT_METHOD_LABEL, s.payment_method || 'cash'),
          tipo: tipoDeVenta(s),
          reparto: formasDePago(s),
          usuario: userNameOf(data, s.user_id),
        } as ReportRow;
      });
      const filtradas = applyCommonFilters(rows, filters, 'total');
      const total = round2(filtradas.reduce((s, r) => s + (Number(r.total) || 0), 0));
      const descuento = round2(filtradas.reduce((s, r) => s + (Number(r.descuento) || 0), 0));
      const lista = round2(filtradas.reduce((s, r) => s + (Number(r.precioLista) || 0), 0));
      return {
        rows: filtradas,
        notes: [
          'Los importes van con ITBIS incluido, igual que en el punto de venta y en la factura. '
          + 'El "Precio de lista" y el "Descuento" van sin ITBIS, para que cuadren con el subtotal.',
          ...notaDeDescuentos(deducido),
        ],
        kpis: [
          { key: 'cantidad', label: 'Ventas', value: filtradas.length, format: 'number' },
          { key: 'total', label: 'Total vendido', value: total, format: 'money' },
          {
            key: 'ticket', label: 'Ticket promedio', format: 'money',
            value: filtradas.length ? round2(total / filtradas.length) : 0,
          },
          {
            key: 'descuento', label: 'Descontado', value: descuento, format: 'money',
            hint: lista > 0 ? `${round2((descuento / lista) * 100)}% del precio de lista` : undefined,
            linkTo: 'sales-discounts',
          },
        ],
      };
    },
  },

  {
    id: 'sales-by-product',
    name: 'Productos vendidos',
    category: 'ventas',
    description: 'Qué se vende y a qué precio: unidades, precio de lista, lo rebajado y lo cobrado.',
    permission: 'reports.inventory',
    dataset: 'sales',
    columns: [
      { key: 'producto', label: 'Producto', align: 'left' },
      { key: 'ventas', label: 'Ventas', format: 'number', total: true },
      { key: 'unidades', label: 'Unidades', format: 'number', total: true },
      { key: 'precioLista', label: 'Precio de lista', format: 'money', help: 'Por unidad, con ITBIS' },
      { key: 'precioPromedio', label: 'Precio real', format: 'money', help: 'Lo que se cobró por unidad, con ITBIS' },
      { key: 'descuento', label: 'Descontado', format: 'money', total: true },
      { key: 'descuentoPct', label: '% Desc.', format: 'percent' },
      { key: 'importe', label: 'Importe con ITBIS', format: 'money', total: true },
    ],
    filters: ['search', 'userId'],
    defaultSort: { key: 'importe', dir: 'desc' },
    keywords: ['productos', 'más vendidos', 'menos vendidos', 'artículos', 'descuento'],
    build: ctx => {
      const { data, filters } = ctx;
      const detalles = salesInPeriod(data, filters).flatMap(s => (s.details || []).map(d => ({
        sale: s, detail: d, linea: saleAmounts([comoLinea(d)]).lines[0],
      })));
      const grupos = groupRows(detalles, d => String(d.detail.product_name || d.detail.product_id || 'Producto'));
      let deducido = false;
      const rows: ReportRow[] = [...grupos.entries()].map(([producto, lista]) => {
        const unidades = lista.reduce((n, d) => n + d.linea.quantity, 0);
        const importe = round2(lista.reduce((s, d) => s + d.linea.total, 0));
        const porLista = round2(lista.reduce((s, d) => s + d.linea.listTotal, 0));
        const descuento = round2(lista.reduce((s, d) => s + d.linea.discountWithTax, 0));
        if (lista.some(d => d.linea.discountSource === 'deducido')) deducido = true;
        return {
          _id: producto,
          producto,
          ventas: new Set(lista.map(d => d.sale.id)).size,
          unidades,
          precioLista: unidades > 0 ? round2(porLista / unidades) : 0,
          precioPromedio: unidades > 0 ? round2(importe / unidades) : 0,
          descuento,
          descuentoPct: porLista > 0.005 ? round2((descuento / porLista) * 100) : 0,
          importe,
        };
      });
      return {
        rows: applyCommonFilters(rows, filters, 'importe'),
        notes: [
          'El "Precio real" es lo que de verdad se cobró por unidad: si un producto se vendió con '
          + 'descuento, no coincide con el de lista.',
          ...notaDeDescuentos(deducido),
        ],
        charts: [{
          kind: 'bar', title: 'Importe por producto', xKey: 'producto',
          series: [{ key: 'importe', label: 'Importe' }], money: true,
        }],
      };
    },
  },

  {
    id: 'sales-discounts',
    name: 'Descuentos aplicados',
    category: 'ventas',
    description: 'Qué se rebajó y en qué venta: el precio de lista, lo que se cobró y cuánto se dejó de cobrar.',
    permission: 'reports.inventory',
    dataset: 'sales',
    columns: [
      { key: 'fecha', label: 'Fecha', format: 'date' },
      { key: 'numero', label: 'Venta', align: 'left' },
      { key: 'cliente', label: 'Cliente', align: 'left' },
      { key: 'producto', label: 'Producto', align: 'left' },
      { key: 'cantidad', label: 'Cant.', format: 'number', total: true },
      { key: 'precioLista', label: 'Precio de lista', format: 'money' },
      { key: 'precioCobrado', label: 'Se cobró', format: 'money' },
      { key: 'descuentoPct', label: '% Desc.', format: 'percent' },
      { key: 'descuento', label: 'Descontado', format: 'money', total: true },
      { key: 'importe', label: 'Importe', format: 'money', total: true },
      { key: 'origen', label: 'Origen del dato', format: 'badge', hiddenByDefault: true },
      { key: 'usuario', label: 'Vendió', align: 'left' },
    ],
    filters: ['search', 'userId', 'paymentMethod', 'minAmount'],
    defaultSort: { key: 'descuento', dir: 'desc' },
    keywords: ['descuento', 'rebaja', 'promoción', 'precio especial'],
    build: ctx => {
      const { data, filters } = ctx;
      const ventas = salesInPeriod(data, filters);
      let deducido = false;
      const rows: ReportRow[] = [];
      let listaTotal = 0;
      for (const s of ventas) {
        (s.details || []).forEach(d => {
          const linea = saleAmounts([comoLinea(d)]).lines[0];
          listaTotal += linea.listTotal;
          if (linea.discountWithTax <= 0.005) return;
          if (linea.discountSource === 'deducido') deducido = true;
          rows.push({
            _id: `${s.id}-${d.id}`,
            _clientId: s.client_id || undefined,
            fecha: dateOnly(s.sale_date || s.created_at),
            numero: String(s.sale_number || s.id.slice(0, 8)),
            cliente: String(s.customer_name || 'Consumidor final'),
            producto: String(d.product_name || d.product_id || 'Producto'),
            cantidad: linea.quantity,
            precioLista: linea.unitList,
            precioCobrado: linea.unitCharged,
            descuentoPct: linea.discountPercent,
            descuento: linea.discountWithTax,
            importe: linea.total,
            origen: linea.discountSource === 'guardado' ? 'Guardado' : 'Deducido',
            usuario: userNameOf(data, s.user_id),
          });
        });
      }
      const filtradas = applyCommonFilters(rows, filters, 'descuento');
      const descontado = round2(filtradas.reduce((s, r) => s + (Number(r.descuento) || 0), 0));
      return {
        rows: filtradas,
        notes: [
          'Solo salen las líneas que se vendieron por debajo del precio de lista. Los importes van '
          + 'con ITBIS: un descuento también rebaja el impuesto.',
          ...notaDeDescuentos(deducido),
        ],
        kpis: [
          { key: 'lineas', label: 'Líneas con descuento', value: filtradas.length, format: 'number' },
          { key: 'descontado', label: 'Dejado de cobrar', value: descontado, format: 'money' },
          {
            key: 'peso', label: '% sobre el precio de lista', format: 'percent',
            value: listaTotal > 0.005 ? round2((descontado / round2(listaTotal)) * 100) : 0,
          },
        ],
      };
    },
  },

  {
    id: 'sales-by-payment',
    name: 'Ventas por forma de pago',
    category: 'ventas',
    description: 'Cómo entra el dinero de las ventas: efectivo, tarjeta, transferencia o financiamiento.',
    permission: 'reports.inventory',
    dataset: 'sales',
    columns: [
      { key: 'metodo', label: 'Forma de pago', align: 'left' },
      { key: 'ventas', label: 'Ventas', format: 'number', total: true },
      { key: 'total', label: 'Total', format: 'money', total: true },
      { key: 'participacion', label: '% del total', format: 'percent' },
      { key: 'ticket', label: 'Ticket promedio', format: 'money' },
      { key: 'descuento', label: 'Descontado', format: 'money', total: true },
    ],
    filters: ['userId'],
    defaultSort: { key: 'total', dir: 'desc' },
    keywords: ['método de pago', 'forma de pago', 'efectivo', 'tarjeta', 'transferencia', 'financiamiento'],
    build: ctx => {
      const lista = salesInPeriod(ctx.data, ctx.filters);
      const total = round2(lista.reduce((s, v) => s + saleTotalWithTax(v), 0));
      const grupos = groupRows(lista, s => labelFor(PAYMENT_METHOD_LABEL, s.payment_method || 'cash'));
      const rows: ReportRow[] = [...grupos.entries()].map(([metodo, items]) => {
        const suma = round2(items.reduce((s, v) => s + saleTotalWithTax(v), 0));
        return {
          _id: metodo,
          metodo,
          ventas: items.length,
          total: suma,
          participacion: total > 0 ? round2((suma / total) * 100) : 0,
          ticket: items.length ? round2(suma / items.length) : 0,
          descuento: round2(items.reduce((s, v) => s + saleBreakdown(v).discountWithTax, 0)),
        };
      });
      return {
        rows,
        notes: ['Una venta financiada aparece aquí como "Financiamiento": lo que se cobra después '
          + 'son las cuotas del préstamo, que van en los reportes de pagos.'],
        charts: [{
          kind: 'pie', title: 'Reparto por forma de pago', xKey: 'metodo',
          series: [{ key: 'total', label: 'Total' }], money: true,
        }],
      };
    },
  },

  {
    id: 'sales-by-day',
    name: 'Ventas por día',
    category: 'ventas',
    description: 'Cuánto se vende cada día y cuál es el ticket promedio.',
    permission: 'reports.inventory',
    dataset: 'sales',
    columns: [
      { key: 'fecha', label: 'Día', format: 'date' },
      { key: 'ventas', label: 'Ventas', format: 'number', total: true },
      { key: 'total', label: 'Total', format: 'money', total: true },
      { key: 'ticket', label: 'Ticket promedio', format: 'money' },
    ],
    filters: ['userId', 'paymentMethod'],
    defaultSort: { key: 'fecha', dir: 'asc' },
    keywords: ['diario', 'ventas por día'],
    build: ctx => {
      const lista = salesInPeriod(ctx.data, ctx.filters);
      const grupos = groupRows(lista, s => dateOnly(s.sale_date || s.created_at));
      const rows: ReportRow[] = [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([fecha, items]) => {
        const total = round2(items.reduce((s, v) => s + saleTotalWithTax(v), 0));
        return { _id: fecha, fecha, ventas: items.length, total, ticket: items.length ? round2(total / items.length) : 0 };
      });
      return {
        rows,
        charts: [{ kind: 'bar', title: 'Ventas por día', xKey: 'fecha', series: [{ key: 'total', label: 'Total' }], money: true }],
      };
    },
  },

  {
    id: 'sales-by-client',
    name: 'Ventas por cliente',
    category: 'ventas',
    description: 'A quién se le vende. Los mostradores sin cliente salen como "Consumidor final".',
    permission: 'reports.inventory',
    dataset: 'sales',
    columns: [
      { key: 'cliente', label: 'Cliente', align: 'left' },
      { key: 'ventas', label: 'Ventas', format: 'number', total: true },
      { key: 'articulos', label: 'Artículos', format: 'number', total: true },
      { key: 'total', label: 'Total', format: 'money', total: true },
      { key: 'ticket', label: 'Ticket promedio', format: 'money' },
      { key: 'ultima', label: 'Última compra', format: 'date' },
    ],
    filters: ['search', 'userId', 'minAmount'],
    defaultSort: { key: 'total', dir: 'desc' },
    keywords: ['cliente', 'compradores', 'ventas por cliente'],
    build: ctx => {
      const lista = salesInPeriod(ctx.data, ctx.filters);
      const grupos = groupRows(lista, s => String(s.customer_name || '').trim() || 'Consumidor final');
      const rows: ReportRow[] = [...grupos.entries()].map(([cliente, items]) => {
        const total = round2(items.reduce((s, v) => s + saleTotalWithTax(v), 0));
        return {
          _id: cliente,
          _clientId: items.find(i => i.client_id)?.client_id || undefined,
          cliente,
          ventas: items.length,
          articulos: items.reduce((n, v) => n + (v.details || []).reduce((q, d) => q + (Number(d.quantity) || 0), 0), 0),
          total,
          ticket: items.length ? round2(total / items.length) : 0,
          ultima: items.map(v => dateOnly(v.sale_date || v.created_at)).sort().slice(-1)[0] || '',
        };
      });
      return { rows: applyCommonFilters(rows, ctx.filters, 'total') };
    },
  },

  {
    id: 'sales-by-user',
    name: 'Ventas por usuario',
    category: 'ventas',
    description: 'Cuánto vendió cada quien.',
    permission: 'reports.inventory',
    dataset: 'sales',
    columns: [
      { key: 'usuario', label: 'Usuario', align: 'left' },
      { key: 'ventas', label: 'Ventas', format: 'number', total: true },
      { key: 'total', label: 'Total', format: 'money', total: true },
      { key: 'ticket', label: 'Ticket promedio', format: 'money' },
    ],
    filters: [],
    defaultSort: { key: 'total', dir: 'desc' },
    keywords: ['vendedor', 'usuario', 'empleado'],
    build: ctx => {
      const lista = salesInPeriod(ctx.data, ctx.filters);
      const grupos = groupRows(lista, s => String(s.user_id || ''));
      const rows: ReportRow[] = [...grupos.entries()].map(([userId, items]) => {
        const total = round2(items.reduce((s, v) => s + saleTotalWithTax(v), 0));
        return {
          _id: userId || 'sin-usuario',
          usuario: userNameOf(ctx.data, userId),
          ventas: items.length,
          total,
          ticket: items.length ? round2(total / items.length) : 0,
        };
      });
      return { rows };
    },
  },

  {
    id: 'sales-financed',
    name: 'Ventas financiadas',
    category: 'ventas',
    description: 'Las ventas que se cobran a plazo: qué se financió, a qué tasa, en cuántas cuotas y cómo va.',
    permission: 'reports.inventory',
    dataset: 'core',
    columns: [
      { key: 'fecha', label: 'Fecha', format: 'date' },
      { key: 'cliente', label: 'Cliente', align: 'left' },
      { key: 'productos', label: 'Qué se financió', align: 'left', width: 50 },
      { key: 'financiado', label: 'Financiado', format: 'money', total: true },
      { key: 'tasa', label: 'Tasa anual', format: 'percent', help: 'La tasa escrita en la venta, anual' },
      { key: 'plazo', label: 'Plazo', align: 'left' },
      { key: 'cuota', label: 'Cuota', format: 'money' },
      { key: 'total', label: 'Total a pagar', format: 'money', total: true },
      { key: 'interes', label: 'Interés', format: 'money', total: true },
      { key: 'balance', label: 'Por cobrar', format: 'money', total: true },
      { key: 'estado', label: 'Estado', format: 'badge' },
    ],
    filters: ['search', 'clientId', 'frequency', 'minAmount', 'maxAmount'],
    defaultSort: { key: 'fecha', dir: 'desc' },
    keywords: ['financiamiento', 'financiadas', 'a plazo', 'crédito', 'cuotas', 'pos'],
    build: ctx => {
      const { data, filters } = ctx;
      // El préstamo que nace de una venta se guarda con este propósito (ver `PointOfSaleModule`).
      const MARCA = 'Financiamiento de venta POS';
      const prestamos = (data.loans || []).filter(l => {
        const purpose = String((l as any).purpose || '');
        return purpose.startsWith(MARCA)
          && inPeriod(dateOnly(l.start_date || l.created_at), filters);
      });
      const rows: ReportRow[] = prestamos.map(l => {
        const capital = round2(l.amount);
        const total = round2(l.total_amount ?? 0) || capital;
        const periodos = Number((l as any).term_months) || 0;
        const balance = round2(data.balanceByLoan.get(l.id) ?? l.remaining_balance);
        return {
          _id: l.id,
          _loanId: l.id,
          _clientId: l.client_id,
          fecha: dateOnly(l.start_date || l.created_at),
          cliente: clientNameOf(l, data),
          productos: String((l as any).purpose || '').slice(MARCA.length).replace(/^\s*-\s*/, '') || '—',
          financiado: capital,
          // `loans.interest_rate` se guarda MENSUAL; en la venta se escribe ANUAL.
          tasa: toAnnualRate(l.interest_rate),
          plazo: periodos > 0 ? `${periodos} ${getFrequencyLabel(l.payment_frequency, periodos !== 1)}` : '—',
          cuota: round2(l.monthly_payment),
          total,
          interes: round2(Math.max(0, total - capital)),
          balance,
          estado: labelFor(LOAN_STATUS_LABEL, l.status || 'pending'),
        };
      });
      const filtradas = applyCommonFilters(rows, filters, 'financiado');
      const financiado = round2(filtradas.reduce((s, r) => s + (Number(r.financiado) || 0), 0));
      return {
        rows: filtradas,
        notes: [
          'Son los préstamos que creó el punto de venta al cobrar una venta a plazo. La tasa se '
          + 'enseña ANUAL, como se escribe en la venta y en el formulario de préstamo.',
          'Lo que se cobra de estas ventas son las cuotas del préstamo: van en los reportes de pagos.',
        ],
        kpis: [
          { key: 'cantidad', label: 'Ventas financiadas', value: filtradas.length, format: 'number' },
          { key: 'financiado', label: 'Capital financiado', value: financiado, format: 'money' },
          {
            key: 'balance', label: 'Por cobrar', format: 'money',
            value: round2(filtradas.reduce((s, r) => s + (Number(r.balance) || 0), 0)),
          },
        ],
      };
    },
  },
];

// ---------------------------------------------------------------------------
// INVENTARIO
// ---------------------------------------------------------------------------

export const inventoryReports: ReportDefinition<ReportData>[] = [
  {
    id: 'inventory-current',
    asOfToday: true,
    name: 'Inventario actual',
    category: 'inventario',
    description: 'Existencias y valor del inventario, con los precios con ITBIS.',
    permission: 'reports.inventory',
    dataset: 'inventory',
    columns: [
      { key: 'producto', label: 'Producto', align: 'left' },
      { key: 'sku', label: 'SKU', align: 'left', hiddenByDefault: true },
      { key: 'categoria', label: 'Categoría', align: 'left' },
      { key: 'existencia', label: 'Existencia', format: 'number', total: true },
      { key: 'minimo', label: 'Mínimo', format: 'number', hiddenByDefault: true },
      { key: 'costo', label: 'Costo unitario con ITBIS', format: 'money' },
      { key: 'precio', label: 'Precio de venta con ITBIS', format: 'money' },
      // Las DOS cifras del stock, cada una con su nombre (2026-11-17): lo que costó y lo que se
      // espera cobrar. Con una sola no se sabía cuál era.
      { key: 'valorCosto', label: 'Valor al costo', format: 'money', total: true },
      { key: 'valor', label: 'Valor a precio de venta', format: 'money', total: true },
      { key: 'estado', label: 'Estado', format: 'badge' },
    ],
    filters: ['search', 'category'],
    defaultSort: { key: 'valor', dir: 'desc' },
    keywords: ['inventario', 'existencias', 'stock', 'productos', 'valor'],
    build: ctx => {
      const { data, filters } = ctx;
      const productos = (data.inventory?.products || [])
        .filter(p => !filters.category || String(p.category || '') === filters.category);
      const rows = productos.map(p => {
        const existencia = Number(p.current_stock) || 0;
        const minimo = Number(p.min_stock) || 0;
        return {
          _id: p.id,
          producto: String(p.name || ''),
          sku: String(p.sku || ''),
          categoria: String(p.category || 'Sin categoría'),
          existencia,
          minimo,
          costo: purchasePriceWithItbis(p as any),
          precio: sellingPriceWithItbis(p as any),
          valorCosto: stockCostWithItbis(p as any),
          valor: stockValueWithItbis(p as any),
          estado: existencia <= 0 ? 'Agotado' : (minimo > 0 && existencia <= minimo) ? 'Stock bajo' : 'Disponible',
        } as ReportRow;
      });
      const filtradas = applyCommonFilters(rows, filters, 'valor');
      return {
        rows: filtradas,
        notes: [
          'Los precios se enseñan con ITBIS incluido (se guardan sin él).',
          'El sistema no tiene una tabla de movimientos de inventario: no se pueden listar entradas, '
          + 'salidas ni ajustes. Las salidas por venta están en el reporte "Productos vendidos".',
        ],
        kpis: [
          { key: 'productos', label: 'Productos', value: filtradas.length, format: 'number' },
          {
            key: 'unidades', label: 'Unidades', format: 'number',
            value: filtradas.reduce((s, r) => s + (Number(r.existencia) || 0), 0),
          },
          {
            key: 'valorCosto', label: 'Valor al costo', format: 'money',
            value: round2(filtradas.reduce((s, r) => s + (Number(r.valorCosto) || 0), 0)),
            hint: 'Lo que costó la mercancía que hay en existencia',
          },
          {
            key: 'valor', label: 'Valor a precio de venta', format: 'money',
            value: round2(filtradas.reduce((s, r) => s + (Number(r.valor) || 0), 0)),
            hint: 'Lo que se cobraría si se vendiera todo',
          },
          {
            key: 'agotados', label: 'Agotados', format: 'number',
            value: filtradas.filter(r => r.estado === 'Agotado').length, linkTo: 'inventory-low',
          },
        ],
      };
    },
  },

  {
    id: 'inventory-low',
    asOfToday: true,
    name: 'Stock bajo y agotados',
    category: 'inventario',
    description: 'Lo que hay que reponer: productos agotados o por debajo de su mínimo.',
    permission: 'reports.inventory',
    dataset: 'inventory',
    columns: [
      { key: 'producto', label: 'Producto', align: 'left' },
      { key: 'categoria', label: 'Categoría', align: 'left' },
      { key: 'existencia', label: 'Existencia', format: 'number', total: true },
      { key: 'minimo', label: 'Mínimo', format: 'number' },
      { key: 'faltante', label: 'Faltan', format: 'number', total: true },
      { key: 'costo', label: 'Costo con ITBIS', format: 'money' },
      { key: 'reposicion', label: 'Costo de reposición', format: 'money', total: true },
      { key: 'estado', label: 'Estado', format: 'badge' },
    ],
    filters: ['search', 'category'],
    defaultSort: { key: 'existencia', dir: 'asc' },
    keywords: ['stock bajo', 'agotados', 'reponer', 'faltantes'],
    build: ctx => {
      const { data, filters } = ctx;
      const rows = (data.inventory?.products || [])
        .filter(p => !filters.category || String(p.category || '') === filters.category)
        .map(p => {
          const existencia = Number(p.current_stock) || 0;
          const minimo = Number(p.min_stock) || 0;
          const faltante = Math.max(0, minimo - existencia);
          return {
            _id: p.id,
            producto: String(p.name || ''),
            categoria: String(p.category || 'Sin categoría'),
            existencia, minimo, faltante,
            costo: purchasePriceWithItbis(p as any),
            reposicion: round2(purchasePriceWithItbis(p as any) * faltante),
            estado: existencia <= 0 ? 'Agotado' : 'Stock bajo',
          } as ReportRow;
        })
        .filter(r => Number(r.existencia) <= 0 || Number(r.faltante) > 0);
      return {
        rows: applyCommonFilters(rows, filters),
        notes: ['Un producto sin mínimo configurado solo aparece si está agotado.'],
      };
    },
  },

  {
    id: 'inventory-by-category',
    asOfToday: true,
    name: 'Inventario por categoría',
    category: 'inventario',
    description: 'Dónde está metido el dinero del inventario.',
    permission: 'reports.inventory',
    dataset: 'inventory',
    columns: [
      { key: 'categoria', label: 'Categoría', align: 'left' },
      { key: 'productos', label: 'Productos', format: 'number', total: true },
      { key: 'unidades', label: 'Unidades', format: 'number', total: true },
      { key: 'valor', label: 'Valor con ITBIS', format: 'money', total: true },
      { key: 'participacion', label: '% del valor', format: 'percent' },
    ],
    filters: ['search'],
    defaultSort: { key: 'valor', dir: 'desc' },
    keywords: ['categoría', 'valor', 'inventario'],
    build: ctx => {
      const productos = ctx.data.inventory?.products || [];
      const total = round2(productos.reduce((s, p) => s + stockValueWithItbis(p as any), 0));
      const grupos = groupRows(productos, p => String(p.category || 'Sin categoría'));
      const rows: ReportRow[] = [...grupos.entries()].map(([categoria, lista]) => {
        const valor = round2(lista.reduce((s, p) => s + stockValueWithItbis(p as any), 0));
        return {
          _id: categoria,
          categoria,
          productos: lista.length,
          unidades: lista.reduce((n, p) => n + (Number(p.current_stock) || 0), 0),
          valor,
          participacion: total > 0 ? Math.round((valor / total) * 1000) / 10 : 0,
        };
      });
      return {
        rows: applyCommonFilters(rows, ctx.filters, 'valor'),
        charts: [{ kind: 'pie', title: 'Valor por categoría', xKey: 'categoria', series: [{ key: 'valor', label: 'Valor' }], money: true }],
      };
    },
  },
];

// ---------------------------------------------------------------------------
// CAJA Y BANCOS
// ---------------------------------------------------------------------------

export const bankReports: ReportDefinition<ReportData>[] = [
  {
    id: 'bank-accounts',
    name: 'Cuentas y saldos',
    category: 'caja',
    description: 'Las cuentas registradas, su saldo y cuándo se conciliaron por última vez.',
    permission: 'reports.financial',
    dataset: 'banks',
    columns: [
      { key: 'banco', label: 'Banco', align: 'left' },
      { key: 'tipo', label: 'Tipo', align: 'left' },
      { key: 'numero', label: 'Cuenta', align: 'left' },
      { key: 'saldo', label: 'Saldo', format: 'money', total: true },
      { key: 'movimientos', label: 'Movimientos', format: 'number', total: true },
      { key: 'entradas', label: 'Entradas', format: 'money', total: true },
      { key: 'salidas', label: 'Salidas', format: 'money', total: true },
      { key: 'ultimaConciliacion', label: 'Última conciliación', format: 'date' },
      { key: 'estado', label: 'Estado', format: 'badge' },
    ],
    filters: ['search'],
    defaultSort: { key: 'saldo', dir: 'desc' },
    keywords: ['bancos', 'cuentas', 'caja', 'saldos'],
    build: ctx => {
      const { data, filters } = ctx;
      const movimientos = (data.banks?.transactions || []).filter(t => inPeriod(dateOnly(t.transaction_date), filters));
      const rows = (data.banks?.accounts || []).map(a => {
        const suyos = movimientos.filter(t => t.account_id === a.id);
        return {
          _id: a.id,
          banco: String(a.bank_name || ''),
          tipo: String(a.account_type || ''),
          numero: String(a.account_number || ''),
          saldo: round2(a.balance),
          movimientos: suyos.length,
          entradas: round2(suyos.filter(t => t.type === 'income').reduce((s, t) => s + (Number(t.amount) || 0), 0)),
          salidas: round2(suyos.filter(t => t.type === 'expense').reduce((s, t) => s + (Number(t.amount) || 0), 0)),
          ultimaConciliacion: dateOnly(a.last_reconciled_date),
          estado: String(a.status || 'active') === 'active' ? 'Activa' : String(a.status),
        } as ReportRow;
      });
      return {
        rows: applyCommonFilters(rows, filters, 'saldo'),
        kpis: [
          { key: 'cuentas', label: 'Cuentas', value: rows.length, format: 'number' },
          {
            key: 'saldo', label: 'Saldo total', format: 'money',
            value: round2(rows.reduce((s, r) => s + (Number(r.saldo) || 0), 0)),
          },
        ],
      };
    },
  },

  {
    id: 'bank-transactions',
    name: 'Movimientos de caja y bancos',
    category: 'caja',
    description: 'Entradas, salidas y transferencias del período, con su referencia.',
    permission: 'reports.financial',
    dataset: 'banks',
    columns: [
      { key: 'fecha', label: 'Fecha', format: 'date' },
      { key: 'cuenta', label: 'Cuenta', align: 'left' },
      { key: 'tipo', label: 'Tipo', format: 'badge' },
      { key: 'descripcion', label: 'Descripción', align: 'left', width: 60 },
      { key: 'referencia', label: 'Referencia', align: 'left', hiddenByDefault: true },
      { key: 'entrada', label: 'Entrada', format: 'money', total: true },
      { key: 'salida', label: 'Salida', format: 'money', total: true },
      { key: 'conciliado', label: 'Conciliado', format: 'badge' },
    ],
    filters: ['search', 'minAmount', 'maxAmount'],
    defaultSort: { key: 'fecha', dir: 'desc' },
    keywords: ['movimientos', 'transacciones', 'depósitos', 'retiros', 'transferencias'],
    build: ctx => {
      const { data, filters } = ctx;
      const cuentas = new Map((data.banks?.accounts || []).map(a => [a.id, a]));
      const rows = (data.banks?.transactions || [])
        .filter(t => inPeriod(dateOnly(t.transaction_date), filters))
        .map(t => {
          const monto = round2(t.amount);
          const esEntrada = String(t.type) === 'income';
          return {
            _id: t.id,
            fecha: dateOnly(t.transaction_date),
            cuenta: String(cuentas.get(String(t.account_id))?.bank_name || 'Cuenta'),
            tipo: esEntrada ? 'Entrada' : String(t.type) === 'expense' ? 'Salida' : 'Transferencia',
            descripcion: String(t.description || ''),
            referencia: String(t.reference_number || ''),
            entrada: esEntrada ? monto : 0,
            salida: String(t.type) === 'expense' ? monto : 0,
            conciliado: t.is_reconciled ? 'Sí' : 'No',
          } as ReportRow;
        });
      const filtradas = applyCommonFilters(rows, filters, 'entrada');
      return {
        rows: filtradas,
        kpis: [
          {
            key: 'entradas', label: 'Entradas', format: 'money',
            value: round2(filtradas.reduce((s, r) => s + (Number(r.entrada) || 0), 0)),
          },
          {
            key: 'salidas', label: 'Salidas', format: 'money',
            value: round2(filtradas.reduce((s, r) => s + (Number(r.salida) || 0), 0)),
          },
          {
            key: 'pendientes', label: 'Sin conciliar', format: 'number',
            value: filtradas.filter(r => r.conciliado === 'No').length,
          },
        ],
      };
    },
  },
];

export const reconciliationReport: ReportDefinition<ReportData> = {
  id: 'bank-reconciliations',
  name: 'Conciliaciones de cuentas',
  category: 'caja',
  description: 'Cuadres hechos: lo que decía el sistema, lo que decía el banco y la diferencia.',
  permission: 'reports.financial',
  dataset: 'banks',
  columns: [
    { key: 'fecha', label: 'Fecha', format: 'date' },
    { key: 'cuenta', label: 'Cuenta', align: 'left' },
    { key: 'sistema', label: 'Saldo del sistema', format: 'money', total: true },
    { key: 'banco', label: 'Saldo del banco', format: 'money', total: true },
    { key: 'diferencia', label: 'Diferencia', format: 'money', total: true },
    { key: 'usuario', label: 'Concilió', align: 'left' },
    { key: 'notas', label: 'Notas', align: 'left', width: 60 },
  ],
  filters: ['search'],
  defaultSort: { key: 'fecha', dir: 'desc' },
  keywords: ['conciliación', 'cuadre', 'diferencia', 'arqueo'],
  build: ctx => {
    const { data, filters } = ctx;
    const cuentas = new Map((data.banks?.accounts || []).map(a => [a.id, a]));
    const rows = (data.banks?.reconciliations || [])
      .filter(r => inPeriod(dateOnly(r.reconciliation_date), filters))
      .map(r => ({
        _id: r.id,
        fecha: dateOnly(r.reconciliation_date),
        cuenta: String(cuentas.get(String(r.account_id))?.bank_name || 'Cuenta'),
        sistema: round2(r.system_balance),
        banco: round2(r.bank_balance),
        diferencia: round2(r.difference),
        usuario: userNameOf(data, r.created_by),
        notas: String(r.notes || ''),
      } as ReportRow));
    const filtradas = applyCommonFilters(rows, filters, 'diferencia');
    const conDiferencia = filtradas.filter(r => Math.abs(Number(r.diferencia) || 0) > 0.005);
    return {
      rows: filtradas,
      notes: conDiferencia.length > 0
        ? [`${conDiferencia.length} conciliación(es) cerraron con diferencia: conviene revisarlas.`]
        : [],
      kpis: [
        { key: 'cuadres', label: 'Conciliaciones', value: filtradas.length, format: 'number' },
        { key: 'conDiferencia', label: 'Con diferencia', value: conDiferencia.length, format: 'number' },
        {
          key: 'diferencia', label: 'Diferencia acumulada', format: 'money',
          value: round2(filtradas.reduce((s, r) => s + (Number(r.diferencia) || 0), 0)),
        },
      ],
    };
  },
};

// ---------------------------------------------------------------------------
// LEGAL
// ---------------------------------------------------------------------------

export const legalReports: ReportDefinition<ReportData>[] = [
  {
    id: 'legal-cases',
    name: 'Casos legales',
    category: 'legal',
    description: 'Expedientes abiertos y cerrados, con su etapa y el monto reclamado.',
    permission: 'legal.view',
    dataset: 'legal',
    columns: [
      { key: 'apertura', label: 'Apertura', format: 'date' },
      { key: 'cliente', label: 'Cliente', align: 'left' },
      { key: 'etapa', label: 'Etapa', format: 'badge' },
      { key: 'estado', label: 'Estado', format: 'badge' },
      { key: 'monto', label: 'Monto reclamado', format: 'money', total: true },
      { key: 'balance', label: 'Balance del préstamo', format: 'money', total: true },
      { key: 'cierre', label: 'Cierre', format: 'date' },
    ],
    filters: ['search', 'status', 'clientId'],
    defaultSort: { key: 'apertura', dir: 'desc' },
    keywords: ['legal', 'casos', 'expedientes', 'judicial', 'intimaciones'],
    build: ctx => {
      const { data, filters } = ctx;
      const loansById = new Map(data.loans.map(l => [l.id, l]));
      const clientsById = new Map(data.clients.map(c => [c.id, c]));
      const rows = (data.legal?.cases || [])
        .filter(c => inPeriod(dateOnly(c.opened_at), filters) || (c.closed_at && inPeriod(dateOnly(c.closed_at), filters)))
        .filter(c => !filters.status || String(c.status || '') === filters.status)
        .filter(c => !filters.clientId || String(c.client_id || '') === filters.clientId)
        .map(c => {
          const loan = c.loan_id ? loansById.get(c.loan_id) : undefined;
          const client = c.client_id ? clientsById.get(c.client_id) : undefined;
          return {
            _id: c.id,
            _loanId: c.loan_id || undefined,
            _clientId: c.client_id || undefined,
            apertura: dateOnly(c.opened_at),
            cliente: client?.full_name || loan?.client?.full_name || 'Cliente',
            etapa: String(c.stage || '').replace(/_/g, ' '),
            estado: String(c.status || '').replace(/_/g, ' '),
            monto: round2(c.amount_claimed),
            balance: round2(loan ? (data.balanceByLoan.get(loan.id) ?? loan.remaining_balance) : 0),
            cierre: dateOnly(c.closed_at),
          } as ReportRow;
        });
      const filtradas = applyCommonFilters(rows, filters, 'monto');
      return {
        rows: filtradas,
        kpis: [
          { key: 'casos', label: 'Casos', value: filtradas.length, format: 'number' },
          {
            key: 'abiertos', label: 'Abiertos', format: 'number',
            value: filtradas.filter(r => !r.cierre).length,
          },
          {
            key: 'monto', label: 'Monto reclamado', format: 'money',
            value: round2(filtradas.reduce((s, r) => s + (Number(r.monto) || 0), 0)),
          },
        ],
      };
    },
  },

  {
    id: 'legal-intimations',
    name: 'Intimaciones',
    category: 'legal',
    description: 'Intimaciones emitidas, notificadas y vencidas, con el monto reclamado y su plazo.',
    permission: 'legal.view',
    dataset: 'legal',
    columns: [
      { key: 'numero', label: 'Número', align: 'left' },
      { key: 'emitida', label: 'Emitida', format: 'date' },
      { key: 'notificada', label: 'Notificada', format: 'date' },
      { key: 'plazo', label: 'Vence el plazo', format: 'date' },
      { key: 'estado', label: 'Estado', format: 'badge' },
      { key: 'monto', label: 'Monto reclamado', format: 'money', total: true },
      { key: 'respuesta', label: 'Respondió', format: 'date' },
    ],
    filters: ['search', 'status'],
    defaultSort: { key: 'emitida', dir: 'desc' },
    keywords: ['intimación', 'intimaciones', 'carta', 'plazo', 'legal'],
    build: ctx => {
      const { data, filters } = ctx;
      const rows = (data.legal?.intimations || [])
        .filter((i: any) => inPeriod(dateOnly(i.issued_at || i.created_at), filters))
        .filter((i: any) => !filters.status || String(i.status || '') === filters.status)
        .map((i: any) => ({
          _id: String(i.id),
          numero: String(i.intimation_number || '—'),
          emitida: dateOnly(i.issued_at || i.created_at),
          notificada: dateOnly(i.notified_at),
          plazo: dateOnly(i.deadline_date),
          estado: String(i.status || '').replace(/_/g, ' '),
          monto: round2(i.claimed_amount),
          respuesta: dateOnly(i.responded_at),
        } as ReportRow));
      const filtradas = applyCommonFilters(rows, filters, 'monto');
      return {
        rows: filtradas,
        kpis: [
          { key: 'total', label: 'Intimaciones', value: filtradas.length, format: 'number' },
          {
            key: 'notificadas', label: 'Notificadas', format: 'number',
            value: filtradas.filter(r => r.notificada && r.notificada !== '—').length,
          },
          {
            key: 'monto', label: 'Monto reclamado', format: 'money',
            value: round2(filtradas.reduce((s, r) => s + (Number(r.monto) || 0), 0)),
          },
        ],
      };
    },
  },

  {
    id: 'legal-promises',
    name: 'Promesas de pago',
    category: 'legal',
    description: 'Compromisos de pago registrados y si se cumplieron.',
    permission: 'legal.view',
    dataset: 'legal',
    columns: [
      { key: 'fecha', label: 'Registrada', format: 'date' },
      { key: 'cliente', label: 'Cliente', align: 'left' },
      { key: 'prometido', label: 'Monto prometido', format: 'money', total: true },
      { key: 'fechaPromesa', label: 'Fecha prometida', format: 'date' },
      { key: 'estado', label: 'Estado', format: 'badge' },
    ],
    filters: ['search', 'status'],
    defaultSort: { key: 'fechaPromesa', dir: 'desc' },
    keywords: ['promesas', 'compromisos', 'acuerdos'],
    build: ctx => {
      const { data, filters } = ctx;
      const loansById = new Map(data.loans.map(l => [l.id, l]));
      const rows = (data.legal?.promises || [])
        .filter(p => inPeriod(dateOnly(String((p as any).created_at || (p as any).promised_date)), filters))
        .map(p => {
          const loan = loansById.get(String((p as any).loan_id || ''));
          return {
            _id: String((p as any).id),
            _loanId: (p as any).loan_id,
            fecha: dateOnly(String((p as any).created_at)),
            cliente: loan?.client?.full_name || 'Cliente',
            prometido: round2((p as any).amount),
            fechaPromesa: dateOnly(String((p as any).promised_date || (p as any).due_date)),
            estado: String((p as any).status || '').replace(/_/g, ' '),
          } as ReportRow;
        });
      return { rows: applyCommonFilters(rows, filters, 'prometido') };
    },
  },
];
