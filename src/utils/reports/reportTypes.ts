// ============================================================================
// REPORTES Y ANÁLISIS: los tipos que comparten el catálogo, los filtros y la tabla
// ============================================================================
// El módulo se arma sobre un CATÁLOGO: cada reporte se declara una vez (nombre, categoría,
// permiso, columnas y de dónde salen sus filas) y la pantalla —buscador, filtros, tabla,
// gráficos, exportación, impresión— es la misma para todos. Así añadir un reporte es añadir una
// entrada, no otra pestaña con su propia tabla.

export type ReportCategoryId =
  | 'resumen' | 'financiero' | 'prestamos' | 'pagos' | 'clientes' | 'mora' | 'cobranzas'
  | 'ventas' | 'inventario' | 'caja' | 'gastos' | 'legal';

export interface ReportCategory {
  id: ReportCategoryId;
  label: string;
  /** Emoji para la navegación (el mismo criterio visual del resto del sistema) */
  icon: string;
  description: string;
}

export const REPORT_CATEGORIES: ReportCategory[] = [
  { id: 'resumen', label: 'Resumen', icon: '📊', description: 'La foto del período y los indicadores clave' },
  { id: 'financiero', label: 'Financiero', icon: '💰', description: 'Ingresos, egresos, ganancia y flujo de efectivo' },
  { id: 'prestamos', label: 'Préstamos', icon: '💳', description: 'Colocación, cartera y estado de los préstamos' },
  { id: 'pagos', label: 'Pagos', icon: '💵', description: 'Lo cobrado: capital, interés, mora y cargos' },
  { id: 'clientes', label: 'Clientes', icon: '👥', description: 'Quiénes son, dónde están y cómo pagan' },
  { id: 'mora', label: 'Mora', icon: '⚠️', description: 'Cartera vencida, antigüedad y recuperación' },
  { id: 'cobranzas', label: 'Cobranzas', icon: '🧑‍💼', description: 'Gestión de cobro y cobranza por usuario' },
  { id: 'ventas', label: 'Ventas', icon: '🛒', description: 'Punto de venta, productos y recibos' },
  { id: 'inventario', label: 'Inventario', icon: '📦', description: 'Existencias, valor y faltantes' },
  { id: 'caja', label: 'Caja y bancos', icon: '🏦', description: 'Cuentas, movimientos y conciliación' },
  { id: 'gastos', label: 'Gastos', icon: '💸', description: 'En qué se va el dinero' },
  { id: 'legal', label: 'Legal', icon: '⚖️', description: 'Casos, intimaciones y recuperación' },
];

export const categoryById = (id: ReportCategoryId): ReportCategory =>
  REPORT_CATEGORIES.find(c => c.id === id) || REPORT_CATEGORIES[0];

// ---------------------------------------------------------------------------
// Columnas
// ---------------------------------------------------------------------------

export type ColumnFormat = 'text' | 'money' | 'number' | 'percent' | 'date' | 'badge';

export interface ReportColumn {
  key: string;
  label: string;
  format?: ColumnFormat;
  /** Alineación; por defecto, derecha para números y dinero */
  align?: 'left' | 'right' | 'center';
  /** Se suma en la fila de totales */
  total?: boolean;
  /** Arranca oculta (el usuario puede mostrarla) */
  hiddenByDefault?: boolean;
  /** Ancho sugerido en la impresión y el PDF */
  width?: number;
  /** Texto de ayuda para el encabezado */
  help?: string;
}

/** Una fila de reporte: valores sueltos + lo que haga falta para abrir el detalle. */
export interface ReportRow {
  [key: string]: unknown;
  /** Identificador estable de la fila (para selección) */
  _id?: string;
  /** Préstamo al que pertenece, si aplica: habilita "ver préstamo" */
  _loanId?: string;
  /** Cliente al que pertenece, si aplica */
  _clientId?: string;
}

// ---------------------------------------------------------------------------
// Filtros
// ---------------------------------------------------------------------------

export interface ReportFilters {
  /** Inicio del período (YYYY-MM-DD, hora de Santo Domingo) */
  startDate: string;
  /** Fin del período, inclusive */
  endDate: string;
  /** Etiqueta del preajuste elegido ('month', 'custom', …) */
  preset: string;
  /** Comparar con el período anterior equivalente */
  compare: boolean;
  /** Texto libre: busca en todas las columnas de texto */
  search?: string;
  /** Estado del préstamo / la venta / el caso, según el reporte */
  status?: string;
  clientId?: string;
  /** Usuario que registró el movimiento (`created_by`) */
  userId?: string;
  /** Ciudad del cliente (lo más parecido a "zona" que guarda el sistema) */
  city?: string;
  /** Sector / barrio del cliente */
  neighborhood?: string;
  paymentMethod?: string;
  /** Tipo de amortización del préstamo */
  loanType?: string;
  /** Frecuencia de pago */
  frequency?: string;
  /** Categoría (gastos, productos) */
  category?: string;
  /** Rango de monto */
  minAmount?: number | null;
  maxAmount?: number | null;
}

/** Qué filtros entiende un reporte (los demás no se enseñan). */
export type ReportFilterKey = Exclude<keyof ReportFilters, 'startDate' | 'endDate' | 'preset' | 'compare'>;

// ---------------------------------------------------------------------------
// Gráficos
// ---------------------------------------------------------------------------

export type ChartKind = 'bar' | 'line' | 'area' | 'pie' | 'stacked-bar';

export interface ReportChartSpec {
  kind: ChartKind;
  title: string;
  /** Clave del eje X / de la etiqueta */
  xKey: string;
  /** Series a dibujar */
  series: Array<{ key: string; label: string; color?: string }>;
  /** Los valores son dinero (cambia el formato de los ejes y el tooltip) */
  money?: boolean;
}

/** Un dato destacado del reporte. */
export interface ReportKpi {
  key: string;
  label: string;
  value: number;
  format?: ColumnFormat;
  /** Línea de apoyo bajo el número */
  hint?: string;
  /** Reporte que se abre al pulsarlo */
  linkTo?: string;
  /** Valor del período anterior, para la comparación */
  previous?: number;
}

// ---------------------------------------------------------------------------
// El resultado de un reporte
// ---------------------------------------------------------------------------

export interface ReportResult {
  rows: ReportRow[];
  kpis?: ReportKpi[];
  charts?: ReportChartSpec[];
  /** Totales por columna; si no se dan, la tabla los suma de las columnas con `total` */
  totals?: Record<string, number>;
  /**
   * Avisos honestos para el usuario: "este dato no se está guardando", "estas filas vienen de
   * otra fuente". Se enseñan en la pantalla y se imprimen con el reporte.
   */
  notes?: string[];
}

/** Lo que el constructor de un reporte recibe. */
export interface ReportBuildContext<D = unknown> {
  data: D;
  filters: ReportFilters;
  /** Hoy en Santo Domingo (YYYY-MM-DD) */
  todayIso: string;
}

export interface ReportDefinition<D = any> {
  id: string;
  name: string;
  category: ReportCategoryId;
  /** Una línea: qué contesta este reporte */
  description: string;
  /** Permiso que hace falta (de los que YA existen en el sistema) */
  permission?: string;
  /** Qué datos necesita: decide qué se carga (y qué no). El núcleo va siempre. */
  dataset: ReportDatasetId | ReportDatasetId[];
  columns: ReportColumn[];
  /** Filtros que tienen sentido en este reporte */
  filters?: ReportFilterKey[];
  /** Columna por la que se ordena al abrirlo */
  defaultSort?: { key: string; dir: 'asc' | 'desc' };
  /** Palabras por las que también se puede encontrar en el buscador */
  keywords?: string[];
  build: (ctx: ReportBuildContext<D>) => ReportResult;
}

/**
 * Conjuntos de datos. El `core` (cartera, pagos, cuotas, clientes) lo carga el hook central una
 * sola vez; los demás se piden SOLO cuando se abre un reporte que los necesita.
 */
export type ReportDatasetId =
  | 'core'        // préstamos, clientes, pagos, cuotas, abonos, penalidades, mora
  | 'expenses'    // gastos
  | 'sales'       // ventas del punto de venta con su detalle
  | 'inventory'   // productos
  | 'banks'       // cuentas, movimientos y conciliaciones
  | 'legal'       // casos, intimaciones y gestiones
  | 'pawn';       // compra-venta / empeño
