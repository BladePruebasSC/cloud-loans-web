// ============================================================================
// Los datos de REPORTES Y ANÁLISIS
// ============================================================================
// DOS REGLAS:
//
//  1. El NÚCLEO (cartera, clientes, pagos, cuotas, abonos, penalidades, atraso y balance) es el
//     mismo que alimenta el inicio y el panel: se reutiliza `usePortfolioData` en vez de volver a
//     consultarlo. Por eso un reporte no puede decir una cifra distinta a la de la pantalla de
//     la que sale.
//
//  2. Lo demás se carga SOLO cuando se abre un reporte que lo necesita, y queda en caché cinco
//     minutos (React Query, ya configurado en `main.tsx` y hasta ahora sin usar). El módulo
//     anterior pedía diez consultas sin límite cada vez que se tocaba una fecha.

import { useEffect, useMemo } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { usePortfolioData } from '@/hooks/usePortfolioData';
import type {
  BanksDataset, ExpensesDataset, InventoryDataset, LegalDataset, PawnDataset, ReportData,
  SalesDataset, SaleRow,
} from '@/utils/reports/reportDataset';
import type { ReportDatasetId } from '@/utils/reports/reportTypes';

const FIVE_MINUTES = 5 * 60 * 1000;

/** Los usuarios de la empresa (dueño + empleados) para no enseñar UUIDs en los reportes. */
const fetchUserNames = async (companyId: string, ownerFallback: string): Promise<Map<string, string>> => {
  const map = new Map<string, string>();
  const [{ data: employees }, { data: profile }] = await Promise.all([
    supabase.from('employees').select('id, full_name, auth_user_id, status').eq('company_owner_id', companyId),
    supabase.from('profiles').select('full_name').eq('id', companyId).maybeSingle(),
  ]);
  map.set(companyId, (profile as any)?.full_name || ownerFallback || 'Dueño');
  for (const e of employees || []) {
    const id = (e as any).auth_user_id || (e as any).id;
    if (id) map.set(String(id), (e as any).full_name || 'Empleado');
  }
  return map;
};

/**
 * GASTOS. La tabla ha tenido dos formas en la historia del proyecto (una con `user_id` y
 * `payment_method`, otra sin ellas), así que se pide `*` y se mira qué columnas trajo: un
 * reporte no debe romperse —ni inventarse un dato— por una columna que esta base no tiene.
 *
 * ALCANCE: los gastos se guardan con `created_by` = el usuario que los registró, NO la empresa.
 * El módulo viejo filtraba por `created_by = companyId` y se perdía todos los de los empleados.
 */
const fetchExpenses = async (userIds: string[]): Promise<ExpensesDataset> => {
  const { data, error } = await supabase.from('expenses').select('*').order('expense_date', { ascending: false });
  if (error) throw error;
  const rows = (data || []) as any[];
  const permitidos = new Set(userIds.filter(Boolean));
  const propios = permitidos.size > 0
    ? rows.filter(r => !r.created_by || permitidos.has(String(r.created_by)))
    : rows;
  return {
    rows: propios,
    availableColumns: rows.length > 0 ? Object.keys(rows[0]) : [],
  };
};

/** VENTAS con su detalle de productos, en dos consultas (no una por venta). */
const fetchSales = async (userIds: string[]): Promise<SalesDataset> => {
  let query = supabase.from('sales').select('*').order('created_at', { ascending: false });
  if (userIds.length > 0) query = query.in('user_id', userIds);
  const { data: sales, error } = await query;
  if (error) throw error;
  const ids = (sales || []).map((s: any) => s.id);

  let detailsBySale = new Map<string, any[]>();
  if (ids.length > 0) {
    const { data: details } = await supabase
      .from('sale_details')
      .select('*, products(id, name, itbis_rate)')
      .in('sale_id', ids);
    for (const d of details || []) {
      const list = detailsBySale.get((d as any).sale_id) || [];
      list.push(d);
      detailsBySale.set((d as any).sale_id, list);
    }
  }

  const rows: SaleRow[] = (sales || []).map((s: any) => ({
    id: s.id,
    sale_date: s.sale_date ?? null,
    created_at: s.created_at ?? null,
    total_amount: s.total_amount ?? null,
    total_price: s.total_price ?? null,
    subtotal: s.subtotal ?? null,
    tax_amount: s.tax_amount ?? s.itbis_amount ?? null,
    discount_amount: s.discount_amount ?? null,
    payment_method: s.payment_method ?? null,
    status: s.status ?? null,
    customer_name: s.customer_name ?? null,
    client_id: s.client_id ?? null,
    user_id: s.user_id ?? null,
    sale_number: s.sale_number ?? s.invoice_number ?? null,
    details: (detailsBySale.get(s.id) || []).map((d: any) => ({
      id: d.id,
      sale_id: d.sale_id,
      product_id: d.product_id ?? null,
      product_name: d.products?.name ?? d.product_name ?? null,
      quantity: d.quantity ?? null,
      unit_price: d.unit_price ?? null,
      total_price: d.total_price ?? null,
      itbis_rate: d.products?.itbis_rate ?? d.itbis_rate ?? null,
    })),
  }));
  return { sales: rows };
};

const fetchInventory = async (): Promise<InventoryDataset> => {
  const { data, error } = await supabase.from('products').select('*').order('name');
  if (error) throw error;
  const rows = (data || []) as any[];
  return { products: rows, availableColumns: rows.length > 0 ? Object.keys(rows[0]) : [] };
};

const fetchBanks = async (companyId: string): Promise<BanksDataset> => {
  const [{ data: accounts }, { data: transactions }, conciliaciones] = await Promise.all([
    supabase.from('bank_accounts').select('*').eq('company_owner_id', companyId),
    supabase.from('bank_transactions').select('*').eq('company_owner_id', companyId)
      .order('transaction_date', { ascending: false }),
    // Las conciliaciones llegaron en una migración posterior: si no está aplicada, el resto del
    // módulo de bancos sigue funcionando.
    supabase.from('bank_reconciliations').select('*').eq('company_owner_id', companyId)
      .order('reconciliation_date', { ascending: false })
      .then(r => r, () => ({ data: [] as any[] })),
  ]);
  return {
    accounts: (accounts || []) as any[],
    transactions: (transactions || []) as any[],
    reconciliations: ((conciliaciones as any)?.data || []) as any[],
  };
};

/** LEGAL: las tablas son opcionales (el módulo puede no estar desplegado). */
const fetchLegal = async (loanIds: string[]): Promise<LegalDataset> => {
  const safe = async <T,>(run: () => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> => {
    try {
      const { data, error } = await run();
      if (error) return [];
      return (data || []) as T[];
    } catch { return []; }
  };
  const ids = loanIds.slice(0, 500); // tope defensivo para no armar un `in` enorme
  const [cases, intimations, promises] = await Promise.all([
    safe<any>(() => supabase.from('legal_cases').select('*')),
    safe<any>(() => supabase.from('legal_intimations').select('*')),
    safe<any>(() => (ids.length
      ? supabase.from('collection_promises').select('*').in('loan_id', ids)
      : supabase.from('collection_promises').select('*').limit(0))),
  ]);
  return { cases, intimations, promises };
};

const fetchPawn = async (): Promise<PawnDataset> => {
  const [{ data: transactions }, { data: payments }] = await Promise.all([
    supabase.from('pawn_transactions').select('*, clients(id, full_name, phone)'),
    supabase.from('pawn_payments').select('*'),
  ]);
  return { transactions: (transactions || []) as any[], payments: (payments || []) as any[] };
};

export interface UseReportsDataResult {
  data: ReportData | null;
  /** El núcleo todavía está cargando */
  loading: boolean;
  /** Algún conjunto pedido todavía está cargando */
  loadingExtras: boolean;
  error: string | null;
  refresh: () => void;
  can: (permission: string) => boolean;
  todayIso: string;
  companyName: string;
  /** Usuarios de la empresa, para el filtro "Registró" */
  users: Array<{ id: string; name: string }>;
}

/**
 * Arma los datos del reporte abierto. `datasets` son los conjuntos EXTRA que pide ese reporte;
 * el núcleo va siempre.
 */
export const useReportsData = (datasets: ReportDatasetId[]): UseReportsDataResult => {
  const P = usePortfolioData();
  const { companyId, user, profile } = useAuth();

  const namesQuery = useQuery({
    queryKey: ['reports', 'userNames', companyId],
    enabled: !!companyId,
    staleTime: FIVE_MINUTES,
    queryFn: () => fetchUserNames(
      String(companyId),
      profile?.full_name || user?.email?.split('@')[0] || 'Dueño',
    ),
  });

  const userIds = useMemo(
    () => [...(namesQuery.data?.keys() || [])],
    [namesQuery.data],
  );

  const pedidos = useMemo(() => [...new Set(datasets.filter(d => d !== 'core'))], [datasets.join('|')]);
  const loanIds = useMemo(() => P.loans.map(l => l.id), [P.loans]);

  const extras = useQueries({
    queries: pedidos.map(id => ({
      queryKey: ['reports', 'dataset', id, companyId, id === 'expenses' || id === 'sales' ? userIds.length : 0],
      enabled: !!companyId && (id !== 'expenses' && id !== 'sales' ? true : userIds.length > 0),
      staleTime: FIVE_MINUTES,
      queryFn: async () => {
        switch (id) {
          case 'expenses': return await fetchExpenses(userIds);
          case 'sales': return await fetchSales(userIds);
          case 'inventory': return await fetchInventory();
          case 'banks': return await fetchBanks(String(companyId));
          case 'legal': return await fetchLegal(loanIds);
          case 'pawn': return await fetchPawn();
          default: return null;
        }
      },
    })),
  });

  const extrasByI = pedidos.reduce<Record<string, unknown>>((acc, id, i) => {
    acc[id] = extras[i]?.data;
    return acc;
  }, {});

  const loadingExtras = extras.some(q => q.isLoading);
  const extraError = extras.find(q => q.error)?.error as Error | undefined;

  // Un reporte que necesita datos frescos no debe quedarse con la caché de hace un rato cuando
  // el usuario pulsa "Actualizar": `refresh` recarga el núcleo y vuelve a pedir los extras.
  useEffect(() => { /* los extras se refrescan solos al invalidar sus claves */ }, []);

  const data: ReportData | null = useMemo(() => {
    if (P.loading) return null;
    return {
      todayIso: P.todayIso,
      loans: P.loans as any,
      clients: P.clients as any,
      payments: P.payments as any,
      installments: (P as any).installments || [],
      capitalPayments: P.capitalPayments as any,
      penalties: P.penalties as any,
      loanHistory: (P as any).loanHistory || [],
      tracking: P.tracking as any,
      sales: P.sales as any,
      deletedLoans: (P as any).deletedLoans || [],
      awaitingApprovalCount: (P as any).awaitingApprovalCount || 0,
      overdueByLoan: (P as any).overdueFactsByLoan || new Map(),
      balanceByLoan: (P as any).balanceByLoan || new Map(),
      lateFeeByLoan: P.lateFeeByLoan as any,
      portfolio: P.portfolio as any,
      cashflow: P.cashflow as any,
      recovery: P.recovery as any,
      userNames: namesQuery.data || new Map(),
      expenses: extrasByI.expenses as ExpensesDataset | undefined,
      salesDetail: extrasByI.sales as SalesDataset | undefined,
      inventory: extrasByI.inventory as InventoryDataset | undefined,
      banks: extrasByI.banks as BanksDataset | undefined,
      legal: extrasByI.legal as LegalDataset | undefined,
      pawn: extrasByI.pawn as PawnDataset | undefined,
    };
  }, [P.loading, P.loans, P.clients, P.payments, P.capitalPayments, P.penalties, P.tracking,
      P.sales, P.lateFeeByLoan, P.portfolio, P.cashflow, P.recovery, P.todayIso,
      namesQuery.data, extrasByI.expenses, extrasByI.sales, extrasByI.inventory,
      extrasByI.banks, extrasByI.legal, extrasByI.pawn]);

  const users = useMemo(
    () => [...(namesQuery.data?.entries() || [])].map(([id, name]) => ({ id, name })),
    [namesQuery.data],
  );

  return {
    data,
    loading: P.loading,
    loadingExtras,
    error: extraError ? `No se pudieron cargar algunos datos: ${extraError.message}` : null,
    refresh: () => {
      P.refresh();
      extras.forEach(q => q.refetch());
    },
    can: P.can,
    todayIso: P.todayIso,
    companyName: P.companyName,
    users,
  };
};
