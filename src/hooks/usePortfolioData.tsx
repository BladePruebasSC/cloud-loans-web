import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { getCurrentDateStringForSantoDomingo } from '@/utils/dateUtils';
import { daysBetweenIso } from '@/utils/frequencyUtils';
import {
  buildMonthlySeries, computeCashflow, computePortfolioSnapshot, computeRecovery, computeTodayAgenda,
  topRiskLoans, addDaysIso, isActiveLoan, overdueFromDues,
  type LoanLike, type PaymentLike, type SaleLike, type OverdueFacts,
} from '@/utils/portfolioMetrics';
import { computeInstallmentDues } from '@/utils/installmentDues';

// ============================================================================
// Datos de cartera — fuente única para INICIO y DASHBOARD
// ============================================================================
// Una sola carga alimenta las dos pantallas, así no se duplican consultas ni pueden
// mostrar cifras distintas. Todas las derivaciones viven en `portfolioMetrics.ts`.
//
// CORRECCIÓN (2026-08-29): el panel anterior consultaba los pagos con
// `.eq('created_by', companyId)`. `created_by` es el USUARIO que registró el pago, no la
// empresa: todos los pagos registrados por un empleado quedaban fuera y los ingresos
// aparecían subestimados (o en cero) en empresas con más de un usuario. Ahora los pagos se
// piden por `loan_id` de los préstamos de la empresa, que es el vínculo real y no depende
// de qué columna de propiedad esté poblada.

const CHUNK = 120;
const chunk = <T,>(arr: T[], size = CHUNK): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

async function fetchInChunks<T>(
  build: (ids: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>,
  ids: string[],
  /** Nombre para el registro cuando algo falla. Sin él, un error deja la lista vacía en silencio. */
  label = 'consulta'
): Promise<T[]> {
  const rows: T[] = [];
  for (const part of chunk(ids)) {
    const { data, error } = await build(part);
    if (error) {
      // Se continúa a propósito —una tabla que falle no debe tumbar el panel entero—, pero
      // se DEJA CONSTANCIA. Antes se descartaba en silencio, así que una consulta rota se
      // veía igual que "no hay datos" y no había forma de distinguirlas.
      console.error(`[portfolio] fallo al leer ${label}:`, error);
      continue;
    }
    if (data) rows.push(...data);
  }
  return rows;
}

export interface ClientLike {
  id: string;
  full_name: string;
  dni: string;
  phone: string;
  status: string | null;
  created_at: string | null;
  credit_score: number | null;
}

export interface TrackingLike {
  id: string;
  loan_id: string;
  contact_type: string;
  contact_date: string;
  contact_time: string | null;
  client_response: string | null;
  next_contact_date: string | null;
  result?: string | null;
}

/** Cuota tal como la necesita `computeInstallmentDues`. */
export interface InstallmentLike {
  id: string;
  loan_id: string;
  installment_number: number;
  due_date: string;
  total_amount: number | null;
  principal_amount: number | null;
  interest_amount: number | null;
  paid_amount: number | null;
  is_paid: boolean | null;
}

/** Fila de `loan_history`: todo cambio hecho sobre un préstamo. */
export interface LoanHistoryLike {
  id: string;
  loan_id: string;
  change_type: string | null;
  description: string | null;
  notes: string | null;
  created_at: string | null;
}

export interface ActivityItem {
  id: string;
  kind: 'payment' | 'loan' | 'client' | 'contact' | 'loan_update' | 'deletion';
  at: string;          // ISO datetime o fecha
  title: string;
  subtitle?: string;
  amount?: number;
  loanId?: string;
  clientId?: string;
}

export type PendingKind =
  | 'overdue' | 'due_today' | 'follow_up' | 'promise' | 'legal_task' | 'legal_approval';

export interface PendingItem {
  id: string;
  kind: PendingKind;
  /** 0 = máxima urgencia */
  rank: number;
  severity: 'danger' | 'warning' | 'info';
  title: string;
  subtitle: string;
  amount?: number;
  daysOverdue?: number;
  loanId?: string;
  clientId?: string;
  caseId?: string;
  phone?: string | null;
}

export const usePortfolioData = () => {
  const { user, companyId, profile } = useAuth();
  const todayIso = useMemo(() => getCurrentDateStringForSantoDomingo(), []);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [loans, setLoans] = useState<LoanLike[]>([]);
  const [clients, setClients] = useState<ClientLike[]>([]);
  const [payments, setPayments] = useState<PaymentLike[]>([]);
  const [sales, setSales] = useState<SaleLike[]>([]);
  const [tracking, setTracking] = useState<TrackingLike[]>([]);
  const [installments, setInstallments] = useState<InstallmentLike[]>([]);
  const [loanHistory, setLoanHistory] = useState<LoanHistoryLike[]>([]);
  const [deletedLoans, setDeletedLoans] = useState<LoanLike[]>([]);
  const [promises, setPromises] = useState<any[]>([]);
  const [legalTasks, setLegalTasks] = useState<any[]>([]);
  const [legalApprovals, setLegalApprovals] = useState<any[]>([]);
  const [legalCases, setLegalCases] = useState<any[]>([]);
  const [companyName, setCompanyName] = useState('');
  const [companyConfigured, setCompanyConfigured] = useState(true);
  const inFlight = useRef(false);

  const can = useCallback((permission: string) => {
    if (!profile) return false;
    if (!profile.is_employee) return true;
    if (profile.role === 'admin') return true;
    return profile.permissions?.[permission] === true;
  }, [profile]);

  const load = useCallback(async (silent = false) => {
    if (!user || !companyId || inFlight.current) return;
    inFlight.current = true;
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const [settingsRes, clientsRes, loansRes, salesRes] = await Promise.all([
        supabase.from('company_settings').select('company_name, phone').eq('user_id', companyId).maybeSingle(),
        supabase.from('clients').select('id, full_name, dni, phone, status, created_at, credit_score').eq('user_id', companyId),
        // Se traen TAMBIÉN los borrados: las métricas los descartan un par de líneas más
        // abajo, pero la actividad reciente tiene que poder contar que se eliminaron y de
        // quién eran. Sin ellos, un préstamo borrado desaparecía sin dejar rastro visible.
        supabase.from('loans')
          .select('id, client_id, amount, remaining_balance, total_amount, monthly_payment, status, start_date, next_payment_date, grace_period_days, current_late_fee, interest_rate, amortization_type, payment_frequency, collection_stage, created_at, deleted_at, client:client_id(full_name, dni, phone)')
          .eq('loan_officer_id', companyId),
        supabase.from('sales').select('*').eq('user_id', companyId),
      ]);

      if (settingsRes.data) {
        setCompanyName(settingsRes.data.company_name || '');
        setCompanyConfigured(Boolean(settingsRes.data.company_name && settingsRes.data.phone));
      } else {
        setCompanyConfigured(false);
      }
      setClients((clientsRes.data || []) as ClientLike[]);
      setSales((salesRes.data || []) as SaleLike[]);

      const allLoanRows = ((loansRes.data || []) as any[]) as LoanLike[];
      // Las métricas (cartera, agenda, riesgo) SOLO ven los préstamos vivos.
      const loanRows = allLoanRows.filter(l => !(l as any).deleted_at && l.status !== 'deleted');
      setLoans(loanRows);
      setDeletedLoans(allLoanRows.filter(l => (l as any).deleted_at || l.status === 'deleted'));

      // OJO: los pagos se piden SOLO de los préstamos vivos. Incluir los de un préstamo
      // borrado los metería en el flujo de caja y en "cobrado este mes", que es dinero que la
      // empresa ya no reconoce. El historial sí se pide de todos, porque es justo donde consta
      // que ese préstamo se eliminó.
      const loanIds = loanRows.map(l => l.id);
      const allLoanIds = allLoanRows.map(l => l.id);

      // Cuotas SOLO de los préstamos vivos: son las que necesita el atraso y evita traerse
      // el historial entero de la cartera.
      const activeLoanIds = loanRows.filter(l => isActiveLoan(l.status)).map(l => l.id);

      // Pagos y seguimientos por préstamo (ver nota de arriba sobre `created_by`)
      const [paymentRows, trackingRows, installmentRows, historyRows] = await Promise.all([
        fetchInChunks<PaymentLike>(
          ids => supabase.from('payments')
            // `due_date` y `superseded_at` hacen falta para repartir los pagos entre cuotas
            // y saber qué se debe de verdad (`computeInstallmentDues`).
            .select('id, loan_id, amount, principal_amount, interest_amount, late_fee, payment_date, due_date, superseded_at, created_by')
            .in('loan_id', ids),
          loanIds, 'pagos'
        ),
        fetchInChunks<TrackingLike>(
          ids => supabase.from('collection_tracking')
            .select('id, loan_id, contact_type, contact_date, contact_time, client_response, next_contact_date, result')
            .in('loan_id', ids),
          loanIds, 'gestiones de cobro'
        ),
        fetchInChunks<InstallmentLike>(
          ids => supabase.from('installments')
            .select('id, loan_id, installment_number, due_date, total_amount, principal_amount, interest_amount, paid_amount, is_paid')
            .in('loan_id', ids),
          activeLoanIds, 'cuotas'
        ),
        // Cambios sobre los préstamos: extensiones, cargos, abonos a capital, ediciones,
        // eliminaciones y pagos borrados. Es la única fuente de esos hechos.
        fetchInChunks<LoanHistoryLike>(
          ids => supabase.from('loan_history')
            .select('id, loan_id, change_type, description, notes, created_at')
            .in('loan_id', ids)
            .order('created_at', { ascending: false })
            .limit(200),
          allLoanIds, 'historial de préstamos'
        ),
      ]);
      setPayments(paymentRows);
      setTracking(trackingRows);
      setInstallments(installmentRows);
      setLoanHistory(historyRows);

      // Módulo legal: opcional. Si las tablas no existen, el panel sigue funcionando.
      const soon = addDaysIso(todayIso, 3);
      const [promRes, taskRes, apprRes, caseRes] = await Promise.all([
        supabase.from('collection_promises').select('id, loan_id, client_id, case_id, amount, promised_date, status').eq('company_id', companyId).eq('status', 'pending'),
        supabase.from('legal_case_tasks').select('id, case_id, title, due_date, status, priority').eq('company_id', companyId).in('status', ['pending', 'in_progress', 'overdue']).lte('due_date', soon),
        supabase.from('legal_approvals').select('id, case_id, status, requested_at, approval_type').eq('company_id', companyId).in('status', ['requested', 'reviewed']),
        supabase.from('legal_cases').select('id, client_id, loan_id, case_number, status, priority, pending_amount, next_action_at, next_action_note, client:client_id(full_name, phone)').eq('company_id', companyId).not('status', 'in', '("resolved","closed")'),
      ]);
      setPromises(promRes.error ? [] : (promRes.data || []));
      setLegalTasks(taskRes.error ? [] : (taskRes.data || []));
      setLegalApprovals(apprRes.error ? [] : (apprRes.data || []));
      setLegalCases(caseRes.error ? [] : (caseRes.data || []));

      setLastUpdated(new Date());
    } catch (e) {
      console.error('usePortfolioData: error cargando', e);
    } finally {
      inFlight.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, companyId, todayIso]);

  useEffect(() => { if (user && companyId) load(false); }, [user, companyId, load]);

  // Refrescar al volver a la pestaña (sin parpadeo) y cada 3 minutos
  useEffect(() => {
    if (!user || !companyId) return;
    const onFocus = () => load(true);
    window.addEventListener('focus', onFocus);
    const t = setInterval(() => load(true), 3 * 60 * 1000);
    return () => { window.removeEventListener('focus', onFocus); clearInterval(t); };
  }, [user, companyId, load]);

  // ---------------- derivaciones ----------------
  /**
   * Atraso y saldo REALES de cada préstamo, calculados desde sus cuotas.
   *
   * Va PRIMERO porque de aquí salen las demás derivaciones: no se puede referenciar en las
   * dependencias de un `useMemo` anterior, porque ese array se evalúa en su propia línea.
   *
   * No se usa `next_payment_date` ni `remaining_balance`: los mantienen triggers y bastaba
   * con que uno no hubiera corrido para que el inicio mostrara días y montos viejos. Las
   * cuotas y los pagos son el dato de origen y no pueden quedarse desfasados.
   *
   * SALVO EN LOS PRÉSTAMOS INDEFINIDOS, donde las cuotas NO son el dato de origen: solo
   * existe UNA fila en `installments` (la que crea `generateOriginalInstallments` con
   * `installment_number = 1`) y los períodos siguientes se generan sobre la marcha, porque un
   * préstamo sin vencimiento no tiene un número de cuotas que escribir.
   *
   * Derivar el saldo de esa única fila daba el interés de un período —RD$3,150 en un préstamo
   * de 105,000— en vez del saldo real; y en cuanto esa fila se pagaba, el préstamo se quedaba
   * sin cuotas pendientes, desaparecía de la agenda y aportaba cero a la cartera. Por eso
   * estos préstamos "no se reconocían" en el inicio.
   *
   * Para ellos se cae al respaldo (`remaining_balance` / `next_payment_date`), que la función
   * SQL `calculate_loan_remaining_balance` sí calcula por períodos devengados. Es la misma
   * separación que hace `getLoanBalanceBreakdown`, que tiene una rama entera para indefinidos.
   */
  const overdueFactsByLoan = useMemo(() => {
    const facts = new Map<string, OverdueFacts>();
    if (installments.length === 0) return facts;

    const esIndefinido = (loan: LoanLike) =>
      String(loan.amortization_type || '').toLowerCase() === 'indefinite';

    const byLoan = new Map<string, InstallmentLike[]>();
    for (const inst of installments) {
      const list = byLoan.get(inst.loan_id);
      if (list) list.push(inst); else byLoan.set(inst.loan_id, [inst]);
    }
    const paymentsByLoan = new Map<string, PaymentLike[]>();
    for (const p of payments) {
      const list = paymentsByLoan.get(p.loan_id);
      if (list) list.push(p); else paymentsByLoan.set(p.loan_id, [p]);
    }

    for (const loan of loans) {
      if (esIndefinido(loan)) continue;   // sus cuotas no describen la deuda: ver nota arriba
      const rows = byLoan.get(loan.id);
      if (!rows) continue;
      const dues = computeInstallmentDues(rows as never, (paymentsByLoan.get(loan.id) || []) as never);
      facts.set(loan.id, overdueFromDues(dues, todayIso, Number(loan.grace_period_days) || 0));
    }
    return facts;
  }, [installments, payments, loans, todayIso]);

  const portfolio = useMemo(
    () => computePortfolioSnapshot(loans, todayIso, overdueFactsByLoan),
    [loans, todayIso, overdueFactsByLoan],
  );
  const cashflow = useMemo(() => computeCashflow(payments, sales, todayIso), [payments, sales, todayIso]);
  const recovery = useMemo(() => computeRecovery(loans, cashflow), [loans, cashflow]);

  const agenda = useMemo(
    () => computeTodayAgenda(loans, todayIso, overdueFactsByLoan),
    [loans, todayIso, overdueFactsByLoan],
  );
  const riskLoans = useMemo(() => topRiskLoans(loans, todayIso, 8), [loans, todayIso]);
  const series12 = useMemo(() => buildMonthlySeries(payments, sales, loans, todayIso, 12), [payments, sales, loans, todayIso]);
  const series6 = useMemo(() => series12.slice(-6), [series12]);

  const clientById = useMemo(() => new Map(clients.map(c => [c.id, c])), [clients]);
  const loanById = useMemo(() => new Map(loans.map(l => [l.id, l])), [loans]);

  /** Última gestión de cobro por préstamo (para saber a quién no se ha contactado). */
  const lastContactByLoan = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of tracking) {
      const d = String(t.contact_date || '').split('T')[0];
      if (!d) continue;
      const prev = m.get(t.loan_id);
      if (!prev || d > prev) m.set(t.loan_id, d);
    }
    return m;
  }, [tracking]);

  /** Bandeja unificada de pendientes, ya priorizada. */
  const pending = useMemo<PendingItem[]>(() => {
    const items: PendingItem[] = [];
    const name = (l?: LoanLike | null) => l?.client?.full_name || clientById.get(l?.client_id || '')?.full_name || 'Cliente';

    for (const e of agenda.dueToday) {
      items.push({
        id: `due-${e.loan.id}`, kind: 'due_today', rank: 1, severity: 'warning',
        title: name(e.loan), subtitle: 'Cuota vence hoy',
        amount: e.amount, loanId: e.loan.id, clientId: e.loan.client_id, phone: e.loan.client?.phone,
      });
    }
    for (const e of agenda.overdue) {
      const last = lastContactByLoan.get(e.loan.id);
      const sinceContact = last ? daysBetweenIso(last, todayIso) : null;
      const stale = sinceContact === null || sinceContact > 7;
      items.push({
        id: `late-${e.loan.id}`, kind: 'overdue',
        rank: stale ? 0 : 2,
        severity: e.daysOverdue > 30 ? 'danger' : 'warning',
        title: name(e.loan),
        subtitle: stale
          ? `${e.daysOverdue} días de atraso · ${last ? `sin contacto hace ${sinceContact} d` : 'sin gestiones'}`
          : `${e.daysOverdue} días de atraso · último contacto ${last}`,
        amount: Number(e.loan.remaining_balance) || 0,
        daysOverdue: e.daysOverdue, loanId: e.loan.id, clientId: e.loan.client_id, phone: e.loan.client?.phone,
      });
    }
    for (const t of tracking) {
      const next = String(t.next_contact_date || '').split('T')[0];
      if (!next || next > todayIso) continue;
      const loan = loanById.get(t.loan_id);
      if (!loan || (loan.status !== 'active' && loan.status !== 'overdue')) continue;
      items.push({
        id: `fu-${t.id}`, kind: 'follow_up', rank: next < todayIso ? 1 : 3, severity: next < todayIso ? 'warning' : 'info',
        title: name(loan),
        subtitle: next < todayIso ? `Seguimiento programado vencido (${next})` : 'Seguimiento programado para hoy',
        loanId: loan.id, clientId: loan.client_id, phone: loan.client?.phone,
      });
    }
    for (const p of promises) {
      const d = String(p.promised_date || '').split('T')[0];
      if (!d || d > todayIso) continue;
      const loan = loanById.get(p.loan_id);
      items.push({
        id: `pr-${p.id}`, kind: 'promise', rank: d < todayIso ? 0 : 2, severity: d < todayIso ? 'danger' : 'warning',
        title: name(loan), subtitle: d < todayIso ? `Promesa de pago vencida (${d})` : 'Promesa de pago vence hoy',
        amount: Number(p.amount) || 0, loanId: p.loan_id, clientId: p.client_id, caseId: p.case_id, phone: loan?.client?.phone,
      });
    }
    for (const t of legalTasks) {
      const d = String(t.due_date || '').split('T')[0];
      items.push({
        id: `lt-${t.id}`, kind: 'legal_task', rank: d && d < todayIso ? 1 : 3,
        severity: d && d < todayIso ? 'warning' : 'info',
        title: t.title || 'Tarea legal',
        subtitle: d ? (d < todayIso ? `Tarea vencida (${d})` : 'Tarea para hoy') : 'Tarea legal',
        caseId: t.case_id,
      });
    }
    for (const a of legalApprovals) {
      const c = legalCases.find((x: any) => x.id === a.case_id);
      items.push({
        id: `la-${a.id}`, kind: 'legal_approval', rank: 1, severity: 'warning',
        title: c?.client?.full_name || 'Expediente',
        subtitle: `Intimación pendiente de ${a.status === 'reviewed' ? 'aprobación' : 'revisión'}${c?.case_number ? ` · ${c.case_number}` : ''}`,
        caseId: a.case_id,
      });
    }

    return items.sort((a, b) =>
      a.rank - b.rank ||
      (b.daysOverdue ?? 0) - (a.daysOverdue ?? 0) ||
      (b.amount ?? 0) - (a.amount ?? 0)
    );
  }, [agenda, tracking, promises, legalTasks, legalApprovals, legalCases, loanById, clientById, lastContactByLoan, todayIso]);

  /** Actividad reciente combinada (pagos, préstamos, clientes, gestiones). */
  const activity = useMemo<ActivityItem[]>(() => {
    const items: ActivityItem[] = [];
    // Incluye los borrados: un cambio o un pago de un préstamo ya eliminado sigue teniendo
    // dueño, y sin esto la fila decía "Cliente" a secas.
    const anyLoanById = new Map<string, LoanLike>(
      [...loans, ...deletedLoans].map(l => [l.id, l])
    );
    const nameOfLoan = (loanId: string) => {
      const l = anyLoanById.get(loanId);
      return l?.client?.full_name || clientById.get(l?.client_id || '')?.full_name || 'Cliente';
    };
    for (const p of payments) {
      if (!p.payment_date) continue;
      items.push({
        id: `p-${p.id}`, kind: 'payment', at: String(p.payment_date),
        title: `Pago de ${nameOfLoan(p.loan_id)}`,
        subtitle: [
          Number(p.principal_amount) ? `capital ${Math.round(Number(p.principal_amount)).toLocaleString('es-DO')}` : '',
          Number(p.interest_amount) ? `interés ${Math.round(Number(p.interest_amount)).toLocaleString('es-DO')}` : '',
          Number(p.late_fee) ? `mora ${Math.round(Number(p.late_fee)).toLocaleString('es-DO')}` : '',
        ].filter(Boolean).join(' · ') || undefined,
        amount: Number(p.amount) || 0, loanId: p.loan_id,
      });
    }
    for (const l of loans) {
      const at = String(l.created_at || l.start_date || '');
      if (!at) continue;
      items.push({
        id: `l-${l.id}`, kind: 'loan', at,
        title: `Préstamo a ${l.client?.full_name || clientById.get(l.client_id)?.full_name || 'cliente'}`,
        subtitle: l.amortization_type ? String(l.amortization_type).toUpperCase() : undefined,
        amount: Number(l.amount) || 0, loanId: l.id, clientId: l.client_id,
      });
    }
    for (const c of clients) {
      if (!c.created_at) continue;
      items.push({ id: `c-${c.id}`, kind: 'client', at: String(c.created_at), title: `Cliente registrado: ${c.full_name}`, clientId: c.id });
    }
    for (const t of tracking) {
      if (!t.contact_date) continue;
      items.push({
        id: `t-${t.id}`, kind: 'contact', at: `${String(t.contact_date).split('T')[0]}T${(t.contact_time || '00:00').slice(0, 5)}`,
        title: `Gestión de cobro · ${nameOfLoan(t.loan_id)}`,
        subtitle: t.client_response || undefined, loanId: t.loan_id,
      });
    }

    // ---- Préstamos eliminados -------------------------------------------
    for (const l of deletedLoans) {
      const at = String((l as any).deleted_at || l.created_at || '');
      if (!at) continue;
      items.push({
        id: `ld-${l.id}`, kind: 'deletion', at,
        title: `Préstamo eliminado · ${l.client?.full_name || clientById.get(l.client_id)?.full_name || 'cliente'}`,
        amount: Number(l.amount) || 0, loanId: l.id, clientId: l.client_id,
      });
    }

    // ---- Cambios sobre préstamos ----------------------------------------
    // `loan_history.change_type` solo distingue siete categorías y varias operaciones muy
    // distintas comparten `balance_adjustment`, así que hay que mirar más fino.
    //
    // La descripción se guarda de DOS maneras según la operación: unas usan el identificador
    // interno (`term_extension: …`, `capital_payment: …`) y otras un título en español
    // (`Agregar Cargo: …`, `Eliminar Mora: …`). Además, `pay_charges` cambió de la primera
    // forma a la segunda hace dos días, así que las entradas viejas y las nuevas del MISMO
    // tipo no se parecen. Por eso se reconocen ambas grafías.
    //
    // Cuando existe, manda `notes.update_type`: es el dato explícito y no depende de cómo se
    // haya redactado el texto.
    const ETIQUETAS: Record<string, { label: string; borrado?: boolean }> = {
      term_extension:    { label: 'Extensión de plazo' },
      add_charge:        { label: 'Cargo agregado' },
      pay_charges:       { label: 'Cargo cobrado' },
      remove_late_fee:   { label: 'Mora eliminada' },
      delete_payment:    { label: 'Pago eliminado', borrado: true },
      capital_payment:   { label: 'Abono a capital' },
      edit_loan:         { label: 'Préstamo editado' },
      settle_loan:       { label: 'Préstamo saldado' },
      delete_loan:       { label: 'Préstamo eliminado', borrado: true },
      payment_agreement: { label: 'Acuerdo de pago' },
    };

    /** Los títulos en español que sustituyen al identificador en algunas descripciones. */
    const POR_TEXTO: Array<[RegExp, string]> = [
      [/^Agregar Cargo/i,   'add_charge'],
      [/^Pago de Cargos/i,  'pay_charges'],
      [/^Eliminar Mora/i,   'remove_late_fee'],
      [/^Pago eliminado/i,  'delete_payment'],
      [/^Abono a Capital/i, 'capital_payment'],
    ];

    for (const h of loanHistory) {
      const at = String(h.created_at || '');
      if (!at) continue;
      const desc = String(h.description || '');

      // 1) El tipo explícito de `notes`, cuando la entrada lo trae.
      let tipo: string | null = null;
      try {
        const parsed = JSON.parse(h.notes || '{}');
        if (parsed && typeof parsed.update_type === 'string') tipo = parsed.update_type;
      } catch { /* `notes` suele ser texto libre: no es un error que no sea JSON */ }

      // 2) El identificador al principio de la descripción (`term_extension: …`).
      if (!tipo) {
        const porId = desc.match(/^([a-z_]+)\s*:/);
        if (porId && ETIQUETAS[porId[1]]) tipo = porId[1];
      }

      // 3) El título en español.
      if (!tipo) tipo = POR_TEXTO.find(([re]) => re.test(desc))?.[1] ?? null;

      const match = tipo ? ETIQUETAS[tipo] : undefined;
      // Sin tipo reconocido no se inventa un título: se omite antes que llenar la lista de
      // "Ajuste de balance" genéricos que no dicen nada.
      if (!match) continue;

      // El detalle va tras el primer ":"; se recorta para que quepa en una línea.
      const detalle = desc.replace(/^[^:]*:\s*/, '').split('. Notas:')[0].trim();

      items.push({
        id: `h-${h.id}`,
        kind: match.borrado ? 'deletion' : 'loan_update',
        at,
        title: `${match.label} · ${nameOfLoan(h.loan_id)}`,
        subtitle: detalle && detalle !== desc ? detalle.slice(0, 90) : undefined,
        loanId: h.loan_id,
      });
    }

    return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 20);
  }, [payments, loans, clients, tracking, loanHistory, deletedLoans, loanById, clientById]);

  const onboarding = useMemo(() => ({
    companyConfigured,
    hasClients: clients.length > 0,
    hasLoans: loans.length > 0,
    complete: companyConfigured && clients.length > 0 && loans.length > 0,
  }), [companyConfigured, clients.length, loans.length]);

  const clientStats = useMemo(() => {
    const active = clients.filter(c => c.status === 'active').length;
    const withLoan = new Set(loans.filter(l => l.status === 'active' || l.status === 'overdue').map(l => l.client_id)).size;
    const newThisMonth = clients.filter(c => String(c.created_at || '').slice(0, 7) === todayIso.slice(0, 7)).length;
    return { total: clients.length, active, withLoan, newThisMonth };
  }, [clients, loans, todayIso]);

  return {
    loading, refreshing, lastUpdated, todayIso, companyName, can,
    loans, clients, payments, sales, tracking, legalCases,
    portfolio, cashflow, recovery, agenda, riskLoans, series6, series12,
    pending, activity, onboarding, clientStats,
    refresh: () => load(true),
  };
};
