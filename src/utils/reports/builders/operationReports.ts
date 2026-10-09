// ============================================================================
// Reportes de GASTOS, VENTAS, INVENTARIO, CAJA/BANCOS y LEGAL
// ============================================================================
// Cada uno trabaja sobre su propio conjunto de datos, que solo se carga al abrir el reporte.
// Los precios se enseñan SIEMPRE con ITBIS (`itbis.ts`), como el resto del sistema.

import {
  itbisRateOf, purchasePriceWithItbis, sellingPriceWithItbis, stockValueWithItbis, withItbis,
} from '../../itbis';
import {
  PAYMENT_METHOD_LABEL, dateOnly, labelFor, round2, userNameOf, type ReportData,
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

/** Importe de una venta CON ITBIS, con las dos formas en que el sistema las ha guardado. */
export const saleTotalWithTax = (sale: { total_amount?: number | null; total_price?: number | null; details?: Array<{ unit_price?: number | null; quantity?: number | null; total_price?: number | null; itbis_rate?: number | null }> }): number => {
  const detalles = sale.details || [];
  if (detalles.length > 0) {
    const porUnitario = detalles.reduce((s, d) => s + (Number(d.unit_price) || 0) * (Number(d.quantity) || 0), 0);
    if (porUnitario > 0.005) return round2(porUnitario);
    const porTotal = detalles.reduce((s, d) => s + withItbis(d.total_price, itbisRateOf({ itbis_rate: d.itbis_rate })), 0);
    if (porTotal > 0.005) return round2(porTotal);
  }
  if (typeof sale.total_amount === 'number' && sale.total_amount > 0) return round2(sale.total_amount);
  return round2(sale.total_price);
};

export const salesReports: ReportDefinition<ReportData>[] = [
  {
    id: 'sales-detail',
    name: 'Ventas del período',
    category: 'ventas',
    description: 'Cada venta del punto de venta, con su cliente, método de pago y total con ITBIS.',
    permission: 'reports.inventory',
    dataset: 'sales',
    columns: [
      { key: 'fecha', label: 'Fecha', format: 'date' },
      { key: 'numero', label: 'Venta', align: 'left' },
      { key: 'cliente', label: 'Cliente', align: 'left' },
      { key: 'articulos', label: 'Artículos', format: 'number', total: true },
      { key: 'subtotal', label: 'Subtotal', format: 'money', total: true },
      { key: 'itbis', label: 'ITBIS', format: 'money', total: true },
      { key: 'descuento', label: 'Descuento', format: 'money', total: true },
      { key: 'total', label: 'Total', format: 'money', total: true },
      { key: 'metodo', label: 'Método', align: 'left' },
      { key: 'usuario', label: 'Vendió', align: 'left' },
    ],
    filters: ['search', 'userId', 'paymentMethod', 'minAmount', 'maxAmount'],
    defaultSort: { key: 'fecha', dir: 'desc' },
    keywords: ['ventas', 'punto de venta', 'facturas', 'recibos', 'pos'],
    build: ctx => {
      const { data, filters } = ctx;
      const rows = salesInPeriod(data, filters).map(s => {
        const total = saleTotalWithTax(s);
        const itbis = round2(s.tax_amount);
        return {
          _id: s.id,
          fecha: dateOnly(s.sale_date || s.created_at),
          numero: String(s.sale_number || s.id.slice(0, 8)),
          cliente: String(s.customer_name || 'Consumidor final'),
          articulos: (s.details || []).reduce((n, d) => n + (Number(d.quantity) || 0), 0),
          subtotal: round2(s.subtotal ?? (total - itbis)),
          itbis,
          descuento: round2(s.discount_amount),
          total,
          metodo: labelFor(PAYMENT_METHOD_LABEL, s.payment_method || 'cash'),
          usuario: userNameOf(data, s.user_id),
        } as ReportRow;
      });
      const filtradas = applyCommonFilters(rows, filters, 'total');
      const total = round2(filtradas.reduce((s, r) => s + (Number(r.total) || 0), 0));
      return {
        rows: filtradas,
        notes: ['Los importes van con ITBIS incluido, igual que en el punto de venta y en la factura.'],
        kpis: [
          { key: 'cantidad', label: 'Ventas', value: filtradas.length, format: 'number' },
          { key: 'total', label: 'Total vendido', value: total, format: 'money' },
          {
            key: 'ticket', label: 'Ticket promedio', format: 'money',
            value: filtradas.length ? round2(total / filtradas.length) : 0,
          },
        ],
      };
    },
  },

  {
    id: 'sales-by-product',
    name: 'Productos vendidos',
    category: 'ventas',
    description: 'Qué se vende y qué no: unidades e importe por producto.',
    permission: 'reports.inventory',
    dataset: 'sales',
    columns: [
      { key: 'producto', label: 'Producto', align: 'left' },
      { key: 'ventas', label: 'Ventas', format: 'number', total: true },
      { key: 'unidades', label: 'Unidades', format: 'number', total: true },
      { key: 'importe', label: 'Importe con ITBIS', format: 'money', total: true },
      { key: 'precioPromedio', label: 'Precio promedio', format: 'money' },
    ],
    filters: ['search', 'userId'],
    defaultSort: { key: 'importe', dir: 'desc' },
    keywords: ['productos', 'más vendidos', 'menos vendidos', 'artículos'],
    build: ctx => {
      const { data, filters } = ctx;
      const detalles = salesInPeriod(data, filters).flatMap(s => (s.details || []).map(d => ({ sale: s, detail: d })));
      const grupos = groupRows(detalles, d => String(d.detail.product_name || d.detail.product_id || 'Producto'));
      const rows: ReportRow[] = [...grupos.entries()].map(([producto, lista]) => {
        const unidades = lista.reduce((n, d) => n + (Number(d.detail.quantity) || 0), 0);
        const importe = round2(lista.reduce((s, d) => {
          const porUnitario = (Number(d.detail.unit_price) || 0) * (Number(d.detail.quantity) || 0);
          return s + (porUnitario > 0.005
            ? porUnitario
            : withItbis(d.detail.total_price, itbisRateOf({ itbis_rate: d.detail.itbis_rate })));
        }, 0));
        return {
          _id: producto,
          producto,
          ventas: new Set(lista.map(d => d.sale.id)).size,
          unidades,
          importe,
          precioPromedio: unidades > 0 ? round2(importe / unidades) : 0,
        };
      });
      return {
        rows: applyCommonFilters(rows, filters, 'importe'),
        charts: [{
          kind: 'bar', title: 'Importe por producto', xKey: 'producto',
          series: [{ key: 'importe', label: 'Importe' }], money: true,
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
];

// ---------------------------------------------------------------------------
// INVENTARIO
// ---------------------------------------------------------------------------

export const inventoryReports: ReportDefinition<ReportData>[] = [
  {
    id: 'inventory-current',
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
      { key: 'costo', label: 'Costo con ITBIS', format: 'money' },
      { key: 'precio', label: 'Precio con ITBIS', format: 'money' },
      { key: 'valor', label: 'Valor en existencia', format: 'money', total: true },
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
            key: 'valor', label: 'Valor del inventario', format: 'money',
            value: round2(filtradas.reduce((s, r) => s + (Number(r.valor) || 0), 0)),
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
