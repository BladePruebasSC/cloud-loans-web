// ============================================================================
// El DATASET de los reportes
// ============================================================================
// REGLA DEL MÓDULO: un reporte no vuelve a consultar ni a recalcular lo que el sistema ya sabe.
// El bloque `core` —cartera, clientes, pagos, cuotas, abonos, penalidades, atraso y balance por
// préstamo— es exactamente el que alimenta el INICIO y el panel (`usePortfolioData`), así que un
// reporte y la pantalla de la que sale no pueden decir cifras distintas.
//
// Lo demás (gastos, ventas con su detalle, inventario, bancos, legal, empeño) se carga SOLO
// cuando se abre un reporte que lo necesita.

import type {
  LoanLike, PaymentLike, SaleLike, OverdueFacts, PortfolioSnapshot, CashflowSummary, RecoveryMetrics,
} from '../portfolioMetrics';
import type {
  ClientLike, InstallmentLike, CapitalPaymentRow, LoanHistoryLike, TrackingLike,
} from '@/hooks/usePortfolioData';
import type { LoanPenalty } from '../loanPenalties';

export interface CoreDataset {
  todayIso: string;
  /** Préstamos aprobados y vivos, con el balance de la ficha en `remaining_balance` */
  loans: LoanLike[];
  clients: ClientLike[];
  payments: PaymentLike[];
  installments: InstallmentLike[];
  capitalPayments: CapitalPaymentRow[];
  penalties: LoanPenalty[];
  loanHistory: LoanHistoryLike[];
  tracking: TrackingLike[];
  sales: SaleLike[];
  deletedLoans: LoanLike[];
  awaitingApprovalCount: number;
  /** Atraso real por préstamo (días, monto vencido, pendiente) */
  overdueByLoan: Map<string, OverdueFacts>;
  /** Balance pendiente por préstamo, el de la ficha */
  balanceByLoan: Map<string, number>;
  /** Mora de hoy por préstamo, calculada desde las cuotas */
  lateFeeByLoan: Map<string, number>;
  portfolio: PortfolioSnapshot & { pendingLoans?: number };
  cashflow: CashflowSummary;
  recovery: RecoveryMetrics;
  /** Nombre de cada usuario de la empresa (dueño y empleados), para no enseñar UUIDs */
  userNames: Map<string, string>;
}

export interface ExpenseRow {
  id: string;
  category: string | null;
  description: string | null;
  amount: number | null;
  expense_date: string | null;
  created_by: string | null;
  status: string | null;
  /** Puede no existir en la base: se detecta en tiempo de ejecución */
  payment_method?: string | null;
}

export interface ExpensesDataset {
  rows: ExpenseRow[];
  /** Columnas que la base SÍ tiene (para no enseñar un reporte vacío de algo que no se guarda) */
  availableColumns: string[];
}

export interface SaleDetailRow {
  id: string;
  sale_id: string;
  product_id: string | null;
  product_name: string | null;
  quantity: number | null;
  unit_price: number | null;
  total_price: number | null;
  itbis_rate: number | null;
}

export interface SaleRow {
  id: string;
  sale_date: string | null;
  created_at: string | null;
  total_amount: number | null;
  total_price: number | null;
  subtotal: number | null;
  tax_amount: number | null;
  discount_amount: number | null;
  payment_method: string | null;
  status: string | null;
  customer_name: string | null;
  client_id: string | null;
  user_id: string | null;
  sale_number?: string | null;
  details: SaleDetailRow[];
}

export interface SalesDataset {
  sales: SaleRow[];
}

export interface ProductRow {
  id: string;
  name: string | null;
  sku: string | null;
  brand: string | null;
  category: string | null;
  status: string | null;
  current_stock: number | null;
  min_stock: number | null;
  purchase_price: number | null;
  selling_price: number | null;
  itbis_rate: number | null;
  created_at: string | null;
}

export interface InventoryDataset {
  products: ProductRow[];
  availableColumns: string[];
}

export interface BankAccountRow {
  id: string;
  bank_name: string | null;
  account_type: string | null;
  account_number: string | null;
  balance: number | null;
  status: string | null;
  last_reconciled_date: string | null;
  last_reconciled_balance: number | null;
}

export interface BankTransactionRow {
  id: string;
  account_id: string | null;
  type: string | null;
  amount: number | null;
  description: string | null;
  reference_number: string | null;
  transaction_date: string | null;
  is_reconciled: boolean | null;
  created_by: string | null;
}

export interface BankReconciliationRow {
  id: string;
  account_id: string | null;
  reconciliation_date: string | null;
  system_balance: number | null;
  bank_balance: number | null;
  difference: number | null;
  notes: string | null;
  created_by: string | null;
}

export interface BanksDataset {
  accounts: BankAccountRow[];
  transactions: BankTransactionRow[];
  reconciliations: BankReconciliationRow[];
}

export interface LegalCaseRow {
  id: string;
  loan_id: string | null;
  client_id: string | null;
  stage: string | null;
  status: string | null;
  opened_at: string | null;
  closed_at: string | null;
  amount_claimed: number | null;
  assigned_to: string | null;
  lawyer: string | null;
  notes: string | null;
}

export interface LegalDataset {
  cases: LegalCaseRow[];
  intimations: Array<Record<string, unknown>>;
  promises: Array<Record<string, unknown>>;
}

export interface PawnDataset {
  transactions: Array<Record<string, unknown>>;
  payments: Array<Record<string, unknown>>;
}

/**
 * Lo que recibe el constructor de un reporte: SIEMPRE el núcleo, y además los conjuntos que ese
 * reporte haya pedido. Los opcionales llegan sin definir mientras se están cargando, así que un
 * constructor que los use debe tolerarlo (y la pantalla enseña su estado de carga).
 */
export interface ReportData extends CoreDataset {
  expenses?: ExpensesDataset;
  /** Ventas con su detalle de productos (el `sales` del núcleo es la versión simple) */
  salesDetail?: SalesDataset;
  inventory?: InventoryDataset;
  banks?: BanksDataset;
  legal?: LegalDataset;
  pawn?: PawnDataset;
}

// ---------------------------------------------------------------------------
// Ayudas que usan casi todos los constructores
// ---------------------------------------------------------------------------

export const round2 = (v: unknown): number => Math.round((Number(v) || 0) * 100) / 100;
export const dateOnly = (v: unknown): string => String(v ?? '').split('T')[0];

/** Nombre del cliente de un préstamo, mirando primero lo que ya trae el préstamo. */
export const clientNameOf = (loan: LoanLike | undefined, core: CoreDataset): string => {
  if (!loan) return 'Cliente';
  const embedded = loan.client?.full_name;
  if (embedded) return embedded;
  const client = core.clients.find(c => c.id === loan.client_id);
  return client?.full_name || 'Cliente';
};

/** Índice de clientes por id (los reportes lo piden mucho). */
export const indexClients = (core: CoreDataset): Map<string, ClientLike> => {
  const map = new Map<string, ClientLike>();
  for (const c of core.clients) map.set(c.id, c);
  return map;
};

/** Índice de préstamos por id. */
export const indexLoans = (core: CoreDataset): Map<string, LoanLike> => {
  const map = new Map<string, LoanLike>();
  for (const l of core.loans) map.set(l.id, l);
  return map;
};

/** Nombre de un usuario de la empresa (o "—" si no se conoce). */
export const userNameOf = (core: CoreDataset, userId: string | null | undefined): string => {
  if (!userId) return 'Sin usuario';
  return core.userNames.get(userId) || 'Usuario';
};

export const AMORTIZATION_LABEL: Record<string, string> = {
  simple: 'Simple', german: 'Alemán', american: 'Americano', indefinite: 'Indefinido',
};

export const FREQUENCY_LABEL: Record<string, string> = {
  daily: 'Diario', weekly: 'Semanal', biweekly: 'Quincenal',
  monthly: 'Mensual', quarterly: 'Trimestral', yearly: 'Anual',
};

export const LOAN_STATUS_LABEL: Record<string, string> = {
  active: 'Activo', overdue: 'Vencido', paid: 'Pagado', pending: 'Por aprobar',
  rejected: 'Rechazado', cancelled: 'Cancelado', defaulted: 'Incobrable',
};

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia',
  check: 'Cheque', financing: 'Financiamiento', deposit: 'Depósito',
};

export const labelFor = (dict: Record<string, string>, value: unknown, fallback = '—'): string => {
  const key = String(value ?? '').toLowerCase();
  return dict[key] || (key ? key : fallback);
};
