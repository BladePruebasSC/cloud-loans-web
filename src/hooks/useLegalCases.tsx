import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { getCurrentDateStringForSantoDomingo } from '@/utils/dateUtils';
import { daysBetweenIso, isCaseOpen, translateLegalError, type LegalCaseStatus } from '@/utils/legalWorkflow';

// ============================================================================
// Datos del módulo de Cobranza Legal
// ============================================================================
// Toda ESCRITURA va por RPC a las funciones legal_* (validan permiso, transición y
// estado en la base de datos). Este hook solo lee y llama.
// ============================================================================

export interface LegalSettings {
  preventive: number; administrative: number; intensive: number; prelegal: number;
  min_days_overdue: number; min_amount: number; min_broken_promises: number; min_contacts: number;
  deadline_days: number; followup_days: number; escalation_days: number;
  required_documents: string[]; require_notification_evidence: boolean;
  intimation_template?: string | null;
  company_name?: string | null; phone?: string | null; address?: string | null; logo_url?: string | null;
}

export interface LegalEmployee { auth_user_id: string; full_name: string; role: string | null; }

export interface LegalCaseRow {
  id: string; company_id: string; client_id: string; loan_id: string; case_number: string; case_type: string;
  status: LegalCaseStatus; previous_status: string | null; priority: string;
  claimed_amount: number; paid_amount: number; pending_amount: number; days_overdue_at_open: number | null;
  entered_stage_at: string; last_action_at: string | null; next_action_at: string | null; next_action_note: string | null;
  assigned_to: string | null; lawyer_id: string | null; lawyer_name: string | null; reason: string | null; notes: string | null;
  agreement_id: string | null; superseded_case_id: string | null; opened_by: string | null; opened_at: string;
  closed_at: string | null; closed_by: string | null; close_reason: string | null; close_notes: string | null;
  client?: { full_name: string; dni: string; phone: string; email?: string | null; address?: string | null; city?: string | null } | null;
  loan?: { amount: number; remaining_balance: number; current_late_fee: number | null; next_payment_date: string; grace_period_days: number | null; monthly_payment: number; status: string; start_date: string; interest_rate: number; payment_frequency: string | null; amortization_type: string | null } | null;
}

export interface CollectionLoanRow {
  id: string; client_id: string; amount: number; remaining_balance: number; current_late_fee: number | null;
  next_payment_date: string; grace_period_days: number | null; monthly_payment: number; status: string;
  collection_stage: string | null; collection_stage_since: string | null;
  client?: { full_name: string; dni: string; phone: string } | null;
  daysOverdue: number;
  activeCaseId?: string | null;
}

export interface LegalIntimationRow {
  id: string; case_id: string; approval_id: string | null; intimation_number: string | null; status: string;
  claimed_amount: number; breakdown: any; template_key: string; content: string | null; document_id: string | null;
  responsible_id: string | null; created_at: string; issued_at: string | null; notified_at: string | null;
  deadline_date: string | null; responded_at: string | null; response_notes: string | null; notes: string | null;
}

export interface LegalApprovalRow {
  id: string; case_id: string; intimation_id: string | null; approval_type: string; status: string;
  requested_by: string | null; requested_at: string; request_notes: string | null;
  reviewed_by: string | null; reviewed_at: string | null; review_notes: string | null;
  decided_by: string | null; decided_at: string | null; decision_notes: string | null;
}

export interface LegalTaskRow {
  id: string; case_id: string; title: string; description: string | null; task_type: string; assigned_to: string | null;
  due_date: string | null; priority: string; status: string; completed_at: string | null; created_at: string;
}

export interface PromiseRow {
  id: string; case_id: string | null; loan_id: string; client_id: string; tracking_id: string | null;
  amount: number; promised_date: string; actual_payment_date: string | null; status: string; notes: string | null; created_at: string;
}

export interface EligibilityResult {
  status: 'eligible' | 'not_eligible' | 'pending_review';
  eligible: boolean; reasons: string[]; blockers: string[]; review: string[]; active_case_id: string | null;
  metrics: Record<string, any>;
}

const computeDaysOverdue = (loan: { next_payment_date: string; grace_period_days: number | null; status: string }, todayIso: string) => {
  if (loan.status !== 'active' && loan.status !== 'overdue') return 0;
  const d = daysBetweenIso(String(loan.next_payment_date || '').split('T')[0], todayIso);
  if (d === null) return 0;
  return Math.max(0, d - Number(loan.grace_period_days || 0));
};

/** Ejecuta una RPC legal_* y traduce el error para el usuario. */
export async function legalRpc<T = any>(fn: string, params: Record<string, any>, successMessage?: string): Promise<{ ok: boolean; data: T | null }> {
  const { data, error } = await supabase.rpc(fn as any, params as any);
  if (error) {
    const t = translateLegalError(error);
    toast.error(t.title, { description: t.detail });
    return { ok: false, data: null };
  }
  if (successMessage) toast.success(successMessage);
  return { ok: true, data: data as T };
}

export const useLegalPermissions = () => {
  const { profile } = useAuth();
  const can = useCallback((key: string) => {
    if (!profile) return false;
    if (!profile.is_employee) return true;
    if (profile.role === 'admin') return true;
    return profile.permissions?.[key] === true;
  }, [profile]);
  return { can };
};

// ----------------------------------------------------------------------------
// Nivel módulo: listas, KPIs, bandeja
// ----------------------------------------------------------------------------
export const useLegalCases = () => {
  const { user, companyId } = useAuth();
  const { can } = useLegalPermissions();
  const todayIso = useMemo(() => getCurrentDateStringForSantoDomingo(), []);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<LegalSettings | null>(null);
  const [employees, setEmployees] = useState<LegalEmployee[]>([]);
  const [cases, setCases] = useState<LegalCaseRow[]>([]);
  const [intimations, setIntimations] = useState<LegalIntimationRow[]>([]);
  const [approvals, setApprovals] = useState<LegalApprovalRow[]>([]);
  const [tasks, setTasks] = useState<LegalTaskRow[]>([]);
  const [promises, setPromises] = useState<PromiseRow[]>([]);
  const [collectionLoans, setCollectionLoans] = useState<CollectionLoanRow[]>([]);
  const [tablesAvailable, setTablesAvailable] = useState(true);
  const sweptRef = useRef(false);

  const loadSettings = useCallback(async () => {
    if (!companyId) return null;
    const [{ data: s }, { data: cs }] = await Promise.all([
      supabase.rpc('legal_get_settings' as any, { p_company: companyId } as any),
      supabase.from('company_settings').select('legal_intimation_template, company_name, phone, address, logo_url').eq('user_id', companyId).maybeSingle(),
    ]);
    const merged: LegalSettings = {
      preventive: 3, administrative: 8, intensive: 30, prelegal: 60, min_days_overdue: 60, min_amount: 0,
      min_broken_promises: 1, min_contacts: 3, deadline_days: 10, followup_days: 3, escalation_days: 5,
      required_documents: ['contract', 'identification', 'contact_data', 'address', 'statement', 'collection_evidence'],
      require_notification_evidence: true,
      ...(s as any || {}),
      intimation_template: (cs as any)?.legal_intimation_template ?? null,
      company_name: (cs as any)?.company_name ?? null, phone: (cs as any)?.phone ?? null,
      address: (cs as any)?.address ?? null, logo_url: (cs as any)?.logo_url ?? null,
    };
    setSettings(merged);
    return merged;
  }, [companyId]);

  const load = useCallback(async () => {
    if (!user || !companyId) { setLoading(false); return; }
    setLoading(true);
    try {
      // Barrido idempotente una vez por sesión (etapas, promesas vencidas, plazos, tareas)
      if (!sweptRef.current && can('legal.view')) {
        sweptRef.current = true;
        const { error } = await supabase.rpc('legal_sweep' as any);
        if (error) {
          sweptRef.current = false;
          if (/does not exist|relation|function/i.test(error.message)) setTablesAvailable(false);
        }
      }

      const [casesRes, loansRes, intRes, appRes, taskRes, promRes, empRes] = await Promise.all([
        supabase.from('legal_cases')
          .select('*, client:client_id(full_name,dni,phone,email,address,city), loan:loan_id(amount,remaining_balance,current_late_fee,next_payment_date,grace_period_days,monthly_payment,status,start_date,interest_rate,payment_frequency,amortization_type)')
          .eq('company_id', companyId).order('opened_at', { ascending: false }),
        supabase.from('loans')
          .select('id, client_id, amount, remaining_balance, current_late_fee, next_payment_date, grace_period_days, monthly_payment, status, collection_stage, collection_stage_since, deleted_at, client:client_id(full_name,dni,phone)')
          .eq('loan_officer_id', companyId).in('status', ['active', 'overdue']),
        supabase.from('legal_intimations').select('*').eq('company_id', companyId).order('created_at', { ascending: false }),
        supabase.from('legal_approvals').select('*').eq('company_id', companyId).order('requested_at', { ascending: false }),
        supabase.from('legal_case_tasks').select('*').eq('company_id', companyId).in('status', ['pending', 'in_progress', 'overdue']).order('due_date', { ascending: true }),
        supabase.from('collection_promises').select('*').eq('company_id', companyId).order('promised_date', { ascending: true }),
        supabase.from('employees').select('auth_user_id, full_name, role').eq('company_owner_id', companyId).eq('status', 'active'),
      ]);

      if (casesRes.error) {
        if (/does not exist|relation/i.test(casesRes.error.message)) setTablesAvailable(false);
        throw casesRes.error;
      }
      setTablesAvailable(true);
      const caseRows = (casesRes.data || []) as any as LegalCaseRow[];
      setCases(caseRows);
      setIntimations((intRes.data || []) as any);
      setApprovals((appRes.data || []) as any);
      setTasks((taskRes.data || []) as any);
      setPromises((promRes.data || []) as any);
      setEmployees(((empRes.data || []) as any[]).filter(e => e.auth_user_id).map(e => ({ auth_user_id: e.auth_user_id, full_name: e.full_name, role: e.role })));

      const openCaseByLoan = new Map<string, string>();
      for (const c of caseRows) if (isCaseOpen(c.status)) openCaseByLoan.set(c.loan_id, c.id);
      const loans = ((loansRes.data || []) as any[])
        .filter(l => !l.deleted_at)
        .map(l => ({ ...l, daysOverdue: computeDaysOverdue(l, todayIso), activeCaseId: openCaseByLoan.get(l.id) || null })) as CollectionLoanRow[];
      setCollectionLoans(loans);

      await loadSettings();
    } catch (e: any) {
      console.error('Legal: error cargando', e);
      if (tablesAvailable) toast.error('Error al cargar Cobranza Legal', { description: e?.message });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, companyId, todayIso, loadSettings]);

  useEffect(() => { if (user && companyId) load(); }, [user, companyId, load]);

  const employeeName = useCallback((id?: string | null) => {
    if (!id) return '—';
    if (id === companyId) return 'Dueño';
    return employees.find(e => e.auth_user_id === id)?.full_name || 'Usuario';
  }, [employees, companyId]);

  const summary = useMemo(() => {
    const open = cases.filter(c => isCaseOpen(c.status));
    const byStatus: Record<string, number> = {};
    for (const c of open) byStatus[c.status] = (byStatus[c.status] || 0) + 1;
    const followup = settings?.followup_days ?? 3;
    const newCases = open.filter(c => (daysBetweenIso(c.opened_at.split('T')[0], todayIso) ?? 99) <= 7).length;
    const withoutFollowup = open.filter(c => !c.last_action_at || (daysBetweenIso(c.last_action_at.split('T')[0], todayIso) ?? 0) > followup).length;
    const withoutOwner = open.filter(c => !c.assigned_to).length;
    const intActive = intimations.filter(i => cases.find(c => c.id === i.case_id && isCaseOpen(c.status)));
    const deadlineSoon = intActive.filter(i => i.status === 'notified' && i.deadline_date && (daysBetweenIso(todayIso, i.deadline_date) ?? 99) >= 0 && (daysBetweenIso(todayIso, i.deadline_date) ?? 99) <= followup).length;
    const deadlineOverdue = intActive.filter(i => i.status === 'expired' || (i.status === 'notified' && i.deadline_date && (daysBetweenIso(todayIso, i.deadline_date) ?? 0) < 0)).length;
    return {
      total: cases.length,
      open: open.length,
      newCases,
      prelegal: byStatus.pre_legal || 0,
      pendingApproval: approvals.filter(a => a.status === 'requested' || a.status === 'reviewed').length,
      intimationsIssued: intActive.filter(i => ['issued', 'not_notified'].includes(i.status)).length,
      intimationsNotified: intActive.filter(i => i.status === 'notified').length,
      intimationsExpired: deadlineOverdue,
      deadlineSoon,
      withPromise: byStatus.payment_promise || 0,
      escalated: (byStatus.escalated || 0) + (byStatus.judicial || 0),
      resolved: cases.filter(c => c.status === 'resolved').length,
      closed: cases.filter(c => c.status === 'closed').length,
      amountInProcess: open.reduce((s, c) => s + Number(c.pending_amount || 0), 0),
      amountRecovered: cases.reduce((s, c) => s + Number(c.paid_amount || 0), 0),
      tasksOverdue: tasks.filter(t => t.status === 'overdue' || (t.due_date && t.due_date < todayIso && t.status !== 'completed')).length,
      withoutFollowup,
      withoutOwner,
      loansInCollection: collectionLoans.filter(l => l.daysOverdue > 0 && !l.activeCaseId).length,
      loansPrelegal: collectionLoans.filter(l => l.collection_stage === 'pre_legal' && !l.activeCaseId).length,
      byStatus,
    };
  }, [cases, intimations, approvals, tasks, collectionLoans, settings, todayIso]);

  // ---------------- acciones (RPC) ----------------
  const evaluateEligibility = async (loanId: string) => {
    const { data, error } = await supabase.rpc('legal_evaluate_eligibility' as any, { p_loan_id: loanId } as any);
    if (error) { const t = translateLegalError(error); toast.error(t.title, { description: t.detail }); return null; }
    return data as any as EligibilityResult;
  };
  const openCase = async (p: { loanId: string; reason: string; priority: string; assignedTo?: string | null; duplicateJustification?: string | null }) => {
    const r = await legalRpc<string>('legal_open_case', { p_loan_id: p.loanId, p_reason: p.reason, p_priority: p.priority, p_assigned_to: p.assignedTo || null, p_duplicate_justification: p.duplicateJustification || null }, 'Caso legal abierto');
    if (r.ok) await load();
    return r;
  };
  const saveSettings = async (patch: Partial<LegalSettings>) => {
    const r = await legalRpc('legal_save_settings', { p_settings: patch }, 'Configuración guardada');
    if (r.ok) await loadSettings();
    return r.ok;
  };
  const runSweep = async () => {
    const r = await legalRpc<any>('legal_sweep', {}, undefined);
    if (r.ok) { toast.success('Barrido ejecutado', { description: `Etapas: ${r.data?.stages_updated ?? 0} · Promesas incumplidas: ${r.data?.promises_broken ?? 0} · Plazos vencidos: ${r.data?.intimations_expired ?? 0}` }); await load(); }
    return r.ok;
  };

  return {
    loading, tablesAvailable, todayIso, settings, employees, employeeName, can,
    cases, intimations, approvals, tasks, promises, collectionLoans, summary,
    refresh: load, evaluateEligibility, openCase, saveSettings, runSweep,
  };
};

// ----------------------------------------------------------------------------
// Nivel caso: todo lo del expediente
// ----------------------------------------------------------------------------
export interface LegalEventRow {
  id: string; event_type: string; occurred_at: string; actor_name: string | null; description: string; result: string | null;
  old_status: string | null; new_status: string | null; data: any;
}
export interface ChecklistRow { item_key: string; required: boolean; satisfied: boolean; auto_detected: boolean; document_id: string | null; verified_at: string | null; notes: string | null; }
export interface NotificationAttemptRow { id: string; intimation_id: string; notified_at: string; method: string; notified_by: string | null; received_by: string | null; result: string; evidence_document_id: string | null; notes: string | null; }
export interface CaseDocumentRow { id: string; title: string; file_name: string; file_url: string; document_type: string; mime_type: string | null; created_at: string; legal_case_id: string | null; loan_id: string | null; }

export const useLegalCase = (caseId: string | null) => {
  const { companyId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [legalCase, setLegalCase] = useState<LegalCaseRow | null>(null);
  const [events, setEvents] = useState<LegalEventRow[]>([]);
  const [tracking, setTracking] = useState<any[]>([]);
  const [promises, setPromises] = useState<PromiseRow[]>([]);
  const [intimations, setIntimations] = useState<LegalIntimationRow[]>([]);
  const [notifications, setNotifications] = useState<NotificationAttemptRow[]>([]);
  const [approvals, setApprovals] = useState<LegalApprovalRow[]>([]);
  const [tasks, setTasks] = useState<LegalTaskRow[]>([]);
  const [checklist, setChecklist] = useState<ChecklistRow[]>([]);
  const [checklistState, setChecklistState] = useState<{ complete: boolean; missing: string[] } | null>(null);
  const [documents, setDocuments] = useState<CaseDocumentRow[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [overdueInstallments, setOverdueInstallments] = useState<{ count: number; amount: number; rows: any[] }>({ count: 0, amount: 0, rows: [] });

  const load = useCallback(async () => {
    if (!caseId || !companyId) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data: c, error } = await supabase.from('legal_cases')
        .select('*, client:client_id(full_name,dni,phone,email,address,city), loan:loan_id(amount,remaining_balance,current_late_fee,next_payment_date,grace_period_days,monthly_payment,status,start_date,interest_rate,payment_frequency,amortization_type)')
        .eq('id', caseId).single();
      if (error) throw error;
      const cs = c as any as LegalCaseRow;
      setLegalCase(cs);

      const [ev, tr, pr, ints, apps, tks, docs, pays, insts, chk] = await Promise.all([
        supabase.from('legal_case_events').select('*').eq('case_id', caseId).order('occurred_at', { ascending: false }),
        supabase.from('collection_tracking').select('*').eq('loan_id', cs.loan_id).order('contact_date', { ascending: false }).order('contact_time', { ascending: false }),
        supabase.from('collection_promises').select('*').eq('loan_id', cs.loan_id).order('created_at', { ascending: false }),
        supabase.from('legal_intimations').select('*').eq('case_id', caseId).order('created_at', { ascending: false }),
        supabase.from('legal_approvals').select('*').eq('case_id', caseId).order('requested_at', { ascending: false }),
        supabase.from('legal_case_tasks').select('*').eq('case_id', caseId).order('due_date', { ascending: true }),
        supabase.from('documents').select('id, title, file_name, file_url, document_type, mime_type, created_at, legal_case_id, loan_id')
          .or(`legal_case_id.eq.${caseId},loan_id.eq.${cs.loan_id}`).neq('status', 'deleted').order('created_at', { ascending: false }),
        supabase.from('payments').select('id, amount, payment_date, due_date, interest_amount, principal_amount').eq('loan_id', cs.loan_id).order('payment_date', { ascending: false }).limit(20),
        supabase.from('installments').select('installment_number, due_date, total_amount, principal_amount, interest_amount, is_paid').eq('loan_id', cs.loan_id).eq('is_paid', false).lt('due_date', getCurrentDateStringForSantoDomingo()).order('due_date'),
        supabase.rpc('legal_refresh_checklist' as any, { p_case_id: caseId } as any),
      ]);
      setEvents((ev.data || []) as any);
      setTracking(tr.data || []);
      setPromises((pr.data || []) as any);
      const intRows = (ints.data || []) as any as LegalIntimationRow[];
      setIntimations(intRows);
      setApprovals((apps.data || []) as any);
      setTasks((tks.data || []) as any);
      setDocuments((docs.data || []) as any);
      setPayments(pays.data || []);
      const instRows = insts.data || [];
      setOverdueInstallments({ count: instRows.length, amount: instRows.reduce((s: number, r: any) => s + Number(r.total_amount ?? (Number(r.principal_amount || 0) + Number(r.interest_amount || 0))), 0), rows: instRows });
      if (!chk.error && chk.data) setChecklistState({ complete: !!(chk.data as any).complete, missing: (chk.data as any).missing || [] });
      const { data: chkRows } = await supabase.from('legal_case_checklist').select('*').eq('case_id', caseId);
      setChecklist((chkRows || []) as any);
      if (intRows.length) {
        const { data: notifs } = await supabase.from('legal_intimation_notifications').select('*').in('intimation_id', intRows.map(i => i.id)).order('notified_at', { ascending: false });
        setNotifications((notifs || []) as any);
      } else setNotifications([]);
    } catch (e: any) {
      console.error('Legal: error cargando caso', e);
      const t = translateLegalError(e);
      toast.error(t.title, { description: t.detail });
      setLegalCase(null);
    } finally {
      setLoading(false);
    }
  }, [caseId, companyId]);

  useEffect(() => { load(); }, [load]);

  return {
    loading, legalCase, events, tracking, promises, intimations, notifications, approvals, tasks, checklist, checklistState,
    documents, payments, overdueInstallments, refresh: load,
  };
};

/** URL para ver un documento: firmada si está en el bucket privado, pública si es del bucket `documents`. */
export const getDocumentUrl = async (doc: { file_url: string; document_type?: string | null }): Promise<string | null> => {
  const path = doc.file_url || '';
  if (!path) return null;
  if (path.startsWith('http')) return path;
  if (path.startsWith('company-')) {
    const { data, error } = await supabase.storage.from('legal-evidence').createSignedUrl(path, 3600);
    if (error) { toast.error('No se pudo abrir el archivo', { description: error.message }); return null; }
    return data.signedUrl;
  }
  return supabase.storage.from('documents').getPublicUrl(path).data.publicUrl;
};

/** Sube un archivo al bucket privado y registra el documento en el caso (vía RPC). */
export const uploadCaseDocument = async (p: { companyId: string; caseId: string; file: File | Blob; fileName: string; title: string; documentType: string; description?: string }): Promise<string | null> => {
  const safeName = p.fileName.replace(/[^\w.-]+/g, '_');
  const path = `company-${p.companyId}/case-${p.caseId}/${Date.now()}-${safeName}`;
  const { error: upErr } = await supabase.storage.from('legal-evidence').upload(path, p.file, { upsert: false, contentType: (p.file as any).type || undefined });
  if (upErr) { toast.error('No se pudo subir el archivo', { description: upErr.message }); return null; }
  const r = await legalRpc<string>('legal_register_document', {
    p_case_id: p.caseId, p_title: p.title, p_document_type: p.documentType, p_file_name: safeName, p_file_path: path,
    p_mime_type: (p.file as any).type || null, p_file_size: (p.file as any).size || null, p_description: p.description || null,
  });
  return r.ok ? r.data : null;
};
