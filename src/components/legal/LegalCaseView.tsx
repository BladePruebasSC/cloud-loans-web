import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PasswordVerificationDialog } from '@/components/common/PasswordVerificationDialog';
import { CollectionTracking } from '@/components/loans/CollectionTracking';
import { useAuth } from '@/hooks/useAuth';
import { useLegalCase, legalRpc, uploadCaseDocument, getDocumentUrl, type LegalSettings, type LegalEmployee } from '@/hooks/useLegalCases';
import { formatCurrency } from '@/lib/utils';
import { formatDateStringForSantoDomingo } from '@/utils/dateUtils';
import {
  CHECKLIST_LABEL, CLOSE_REASON_LABEL, CONTACT_RESULT_LABEL, CONTACT_TYPE_LABEL, EVENT_TYPE_LABEL, TASK_TYPE_LABEL,
  daysBetweenIso, isCaseOpen, suggestNextAction, DEADLINE_CLASS,
} from '@/utils/legalWorkflow';
import { CaseStatusBadge, PriorityBadge, TaskStatusBadge, PromiseStatusBadge, OverdueDays, DeadlineBadge } from './LegalBadges';
import { IntimationPanel } from './IntimationPanel';
import {
  ArrowLeft, User, Phone, Mail, MapPin, DollarSign, Clock, CheckCircle2, XCircle, Plus, Upload, Eye, Gavel, Ban, ShieldCheck, UserCog, ArrowUpRight,
} from 'lucide-react';

interface Props {
  caseId: string;
  settings: LegalSettings | null;
  employees: LegalEmployee[];
  employeeName: (id?: string | null) => string;
  can: (k: string) => boolean;
  todayIso: string;
  onBack: () => void;
  onChanged: () => void;
}

export const LegalCaseView: React.FC<Props> = ({ caseId, settings, employees, employeeName, can, todayIso, onBack, onChanged }) => {
  const navigate = useNavigate();
  const { companyId, profile } = useAuth();
  const { loading, legalCase, events, tracking, promises, intimations, notifications, approvals, tasks, checklist, checklistState, documents, payments, overdueInstallments, refresh } = useLegalCase(caseId);
  const [tab, setTab] = useState('gestiones');
  const [showTracking, setShowTracking] = useState(false);
  const [showPromise, setShowPromise] = useState(false);
  const [promiseForm, setPromiseForm] = useState({ amount: '', date: todayIso, notes: '' });
  const [showTask, setShowTask] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: '', task_type: 'follow_up', description: '', assigned_to: '', due_date: '', priority: 'medium' });
  const [showAssign, setShowAssign] = useState(false);
  const [assignForm, setAssignForm] = useState({ assigned_to: '', lawyer_name: '' });
  const [showClose, setShowClose] = useState(false);
  const [closeForm, setCloseForm] = useState({ reason: 'full_payment', notes: '' });
  const [confirmClose, setConfirmClose] = useState(false);
  const [showEscalate, setShowEscalate] = useState(false);
  const [escalateForm, setEscalateForm] = useState({ reason: '', judicial: false });
  const [showSuspend, setShowSuspend] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');
  const [showUpload, setShowUpload] = useState(false);
  const [uploadForm, setUploadForm] = useState({ title: '', document_type: 'legal_evidence', file: null as File | null });
  const [nextAction, setNextAction] = useState({ date: '', note: '' });
  const [busy, setBusy] = useState(false);

  const refreshAll = () => { refresh(); onChanged(); };

  const daysOverdue = useMemo(() => {
    if (!legalCase?.loan) return 0;
    const d = daysBetweenIso(String(legalCase.loan.next_payment_date || '').split('T')[0], todayIso);
    return d === null ? 0 : Math.max(0, d - Number(legalCase.loan.grace_period_days || 0));
  }, [legalCase, todayIso]);

  const currentIntimation = intimations[0] || null;
  const pendingPromise = promises.find(p => p.status === 'pending') || null;
  const lastPayment = payments[0] || null;

  const next = useMemo(() => legalCase ? suggestNextAction({
    status: legalCase.status, nextActionAt: legalCase.next_action_at, nextActionNote: legalCase.next_action_note,
    checklistComplete: checklistState?.complete ?? null, intimationStatus: (currentIntimation?.status as any) || null,
    intimationDeadline: currentIntimation?.deadline_date || null, pendingPromiseDate: pendingPromise?.promised_date || null,
    lastActionAt: legalCase.last_action_at ? legalCase.last_action_at.split('T')[0] : null, todayIso, followupDays: settings?.followup_days ?? 3,
  }) : null, [legalCase, checklistState, currentIntimation, pendingPromise, todayIso, settings]);

  if (loading) return <div className="p-8 text-center text-gray-500">Cargando expediente…</div>;
  if (!legalCase) return <div className="p-8 text-center text-gray-500"><Button variant="outline" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" /> Volver</Button><p className="mt-4">Caso no encontrado o sin acceso.</p></div>;

  const open = isCaseOpen(legalCase.status);
  const c = legalCase;

  // -------- acciones --------
  const savePromise = async () => {
    const amount = Number(promiseForm.amount);
    if (!amount || !promiseForm.date) { return; }
    setBusy(true);
    const r = await legalRpc('legal_register_promise', { p_loan_id: c.loan_id, p_amount: amount, p_promised_date: promiseForm.date, p_notes: promiseForm.notes || null }, 'Promesa registrada');
    setBusy(false);
    if (r.ok) { setShowPromise(false); setPromiseForm({ amount: '', date: todayIso, notes: '' }); refreshAll(); }
  };
  const cancelPromise = async (id: string) => {
    const reason = window.prompt('Motivo de cancelación de la promesa:');
    if (!reason) return;
    const r = await legalRpc('legal_cancel_promise', { p_promise_id: id, p_reason: reason }, 'Promesa cancelada');
    if (r.ok) refreshAll();
  };
  const saveTask = async () => {
    if (!taskForm.title.trim()) return;
    setBusy(true);
    const r = await legalRpc('legal_add_task', { p_case_id: c.id, p_title: taskForm.title, p_task_type: taskForm.task_type, p_description: taskForm.description || null, p_assigned_to: taskForm.assigned_to || null, p_due_date: taskForm.due_date || null, p_priority: taskForm.priority }, 'Tarea creada');
    setBusy(false);
    if (r.ok) { setShowTask(false); setTaskForm({ title: '', task_type: 'follow_up', description: '', assigned_to: '', due_date: '', priority: 'medium' }); refreshAll(); }
  };
  const setTaskStatus = async (id: string, status: string) => {
    const r = await legalRpc('legal_update_task', { p_task_id: id, p_status: status }, undefined);
    if (r.ok) refreshAll();
  };
  const saveAssign = async () => {
    setBusy(true);
    const r = await legalRpc('legal_assign_case', { p_case_id: c.id, p_assigned_to: assignForm.assigned_to || null, p_lawyer_id: null, p_lawyer_name: assignForm.lawyer_name || null }, 'Asignación actualizada');
    setBusy(false);
    if (r.ok) { setShowAssign(false); refreshAll(); }
  };
  const saveNextAction = async () => {
    const r = await legalRpc('legal_update_case', { p_case_id: c.id, p_next_action_at: nextAction.date || null, p_next_action_note: nextAction.note || null }, 'Próxima acción guardada');
    if (r.ok) { setNextAction({ date: '', note: '' }); refreshAll(); }
  };
  const setPriority = async (p: string) => {
    const r = await legalRpc('legal_update_case', { p_case_id: c.id, p_priority: p }, 'Prioridad actualizada');
    if (r.ok) refreshAll();
  };
  const doClose = async () => {
    setBusy(true);
    const r = await legalRpc('legal_close_case', { p_case_id: c.id, p_close_reason: closeForm.reason, p_notes: closeForm.notes || null }, 'Caso cerrado');
    setBusy(false);
    if (r.ok) { setShowClose(false); refreshAll(); }
  };
  const doEscalate = async () => {
    if (escalateForm.reason.trim().length < 5) return;
    setBusy(true);
    const r = await legalRpc('legal_escalate_case', { p_case_id: c.id, p_reason: escalateForm.reason, p_to_judicial: escalateForm.judicial }, 'Caso escalado');
    setBusy(false);
    if (r.ok) { setShowEscalate(false); refreshAll(); }
  };
  const doSuspend = async () => {
    if (suspendReason.trim().length < 5) return;
    const r = await legalRpc('legal_case_transition', { p_case_id: c.id, p_new_status: 'suspended', p_reason: suspendReason }, 'Caso suspendido');
    if (r.ok) { setShowSuspend(false); setSuspendReason(''); refreshAll(); }
  };
  const doResume = async () => {
    const target = c.previous_status === 'in_deadline_period' ? 'in_deadline_period' : 'pre_legal';
    const r = await legalRpc('legal_case_transition', { p_case_id: c.id, p_new_status: target, p_reason: 'Reanudado' }, 'Caso reanudado');
    if (r.ok) refreshAll();
  };
  const toggleChecklist = async (item: string, satisfied: boolean) => {
    const r = await legalRpc('legal_checklist_set', { p_case_id: c.id, p_item: item, p_satisfied: satisfied }, undefined);
    if (r.ok) refreshAll();
  };
  const doUpload = async () => {
    if (!uploadForm.file || !companyId) return;
    setBusy(true);
    const id = await uploadCaseDocument({ companyId, caseId: c.id, file: uploadForm.file, fileName: uploadForm.file.name, title: uploadForm.title || uploadForm.file.name, documentType: uploadForm.document_type });
    setBusy(false);
    if (id) { setShowUpload(false); setUploadForm({ title: '', document_type: 'legal_evidence', file: null }); refreshAll(); }
  };
  const openDoc = async (d: any) => { const url = await getDocumentUrl(d); if (url) window.open(url, '_blank'); };

  const stat = (label: string, value: React.ReactNode, cls = '') => (
    <div><p className="text-xs text-gray-500">{label}</p><p className={`font-semibold ${cls}`}>{value}</p></div>
  );

  return (
    <div className="space-y-4">
      {/* Cabecera */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" /> Bandeja</Button>
        <Button variant="ghost" size="sm" onClick={() => navigate('/prestamos')}>Ver préstamo <ArrowUpRight className="h-3.5 w-3.5 ml-1" /></Button>
        <Button variant="ghost" size="sm" onClick={() => navigate(`/crm?client=${c.client_id}`)}>Ficha CRM <ArrowUpRight className="h-3.5 w-3.5 ml-1" /></Button>
      </div>

      <Card className="border-l-4 border-l-purple-500">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold">{c.client?.full_name}</h2>
                <span className="font-mono text-sm bg-gray-100 rounded px-2 py-0.5">{c.case_number}</span>
                <CaseStatusBadge status={c.status} />
                <PriorityBadge priority={c.priority} />
              </div>
              <div className="flex flex-wrap gap-3 mt-1 text-sm text-gray-600">
                <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" /> {c.client?.dni}</span>
                <a className="flex items-center gap-1 hover:underline" href={`tel:${c.client?.phone}`}><Phone className="h-3.5 w-3.5" /> {c.client?.phone}</a>
                {c.client?.email && <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> {c.client.email}</span>}
                {(c.client?.address || c.client?.city) && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {[c.client?.address, c.client?.city].filter(Boolean).join(', ')}</span>}
              </div>
              <div className="flex flex-wrap gap-4 mt-2 text-sm">
                <span>Responsable: <b>{employeeName(c.assigned_to)}</b></span>
                {c.lawyer_name && <span>Abogado: <b>{c.lawyer_name}</b></span>}
                <span>Días de mora: <OverdueDays days={daysOverdue} /></span>
                <span>Abierto: {formatDateStringForSantoDomingo(c.opened_at.split('T')[0])} por {employeeName(c.opened_by)}</span>
                {c.closed_at && <span className="text-gray-700">Cerrado: {formatDateStringForSantoDomingo(c.closed_at.split('T')[0])} ({CLOSE_REASON_LABEL[c.close_reason || ''] || c.close_reason})</span>}
              </div>
            </div>
            {open && (
              <div className="flex flex-wrap gap-2 shrink-0">
                {can('legal.manage') && <Button size="sm" onClick={() => setShowTracking(true)}><Phone className="h-3.5 w-3.5 mr-1" /> Gestión</Button>}
                {can('legal.manage') && <Button size="sm" variant="outline" onClick={() => setShowPromise(true)}><DollarSign className="h-3.5 w-3.5 mr-1" /> Promesa</Button>}
                {can('legal.assign') && <Button size="sm" variant="outline" onClick={() => { setAssignForm({ assigned_to: c.assigned_to || '', lawyer_name: c.lawyer_name || '' }); setShowAssign(true); }}><UserCog className="h-3.5 w-3.5 mr-1" /> Asignar</Button>}
                {can('legal.escalate') && ['in_deadline_period', 'payment_promise', 'partial_payment', 'escalated'].includes(c.status) && <Button size="sm" variant="outline" className="text-purple-700" onClick={() => setShowEscalate(true)}><Gavel className="h-3.5 w-3.5 mr-1" /> Escalar</Button>}
                {can('legal.close') && c.status !== 'suspended' && <Button size="sm" variant="outline" onClick={() => setShowSuspend(true)}><Ban className="h-3.5 w-3.5 mr-1" /> Suspender</Button>}
                {can('legal.manage') && c.status === 'suspended' && <Button size="sm" variant="outline" onClick={doResume}>Reanudar</Button>}
                {can('legal.close') && <Button size="sm" variant="destructive" onClick={() => setShowClose(true)}><ShieldCheck className="h-3.5 w-3.5 mr-1" /> Cerrar caso</Button>}
              </div>
            )}
          </div>
          {open && can('legal.manage') && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-500">Prioridad:</span>
              <Select value={c.priority} onValueChange={setPriority}><SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="low">Baja</SelectItem><SelectItem value="medium">Media</SelectItem><SelectItem value="high">Alta</SelectItem><SelectItem value="critical">Crítica</SelectItem></SelectContent></Select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Resumen financiero + próxima acción */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Resumen financiero</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            {stat('Préstamo', `${formatCurrency(Number(c.loan?.amount || 0))} · ${c.loan?.start_date ? formatDateStringForSantoDomingo(c.loan.start_date) : ''}`)}
            {stat('Saldo pendiente', formatCurrency(Number(c.loan?.remaining_balance || 0)))}
            {stat('Mora acumulada', formatCurrency(Number(c.loan?.current_late_fee || 0)), 'text-red-600')}
            {stat('Total reclamado', formatCurrency(Number(c.pending_amount || 0)), 'text-red-700')}
            {stat('Cuotas vencidas', `${overdueInstallments.count} (${formatCurrency(overdueInstallments.amount)})`)}
            {stat('Cuota', formatCurrency(Number(c.loan?.monthly_payment || 0)))}
            {stat('Próxima cuota', c.loan?.next_payment_date ? formatDateStringForSantoDomingo(c.loan.next_payment_date) : '—')}
            {stat('Último pago', lastPayment ? `${formatDateStringForSantoDomingo(lastPayment.payment_date)} · ${formatCurrency(Number(lastPayment.amount))}` : 'Sin pagos')}
            {stat('Reclamado al abrir', formatCurrency(Number(c.claimed_amount || 0)))}
            {stat('Pagado desde apertura', formatCurrency(Number(c.paid_amount || 0)), 'text-green-700')}
            {stat('Interés / tipo', `${c.loan?.interest_rate ?? '—'}% · ${c.loan?.amortization_type || ''}`)}
            {stat('Mora al abrir', `${c.days_overdue_at_open ?? '—'} días`)}
          </CardContent>
        </Card>

        <Card className={`border ${next ? DEADLINE_CLASS[next.level] : ''}`}>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4" /> Próxima acción</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="font-medium">{next?.text}</p>
            {c.next_action_at && <p>Programada: <b>{formatDateStringForSantoDomingo(c.next_action_at)}</b> <DeadlineBadge deadlineIso={c.next_action_at} todayIso={todayIso} warningDays={settings?.followup_days ?? 3} /></p>}
            {c.next_action_note && <p className="text-gray-700">{c.next_action_note}</p>}
            {currentIntimation?.deadline_date && <p>Plazo intimación: <DeadlineBadge deadlineIso={currentIntimation.deadline_date} todayIso={todayIso} warningDays={settings?.followup_days ?? 3} /></p>}
            {pendingPromise && <p>Promesa vigente: {formatCurrency(Number(pendingPromise.amount))} el {formatDateStringForSantoDomingo(pendingPromise.promised_date)}</p>}
            {open && can('legal.manage') && (
              <div className="pt-2 border-t space-y-2">
                <div className="flex gap-2"><Input type="date" value={nextAction.date} onChange={e => setNextAction({ ...nextAction, date: e.target.value })} className="h-8" /><Button size="sm" variant="outline" onClick={saveNextAction} disabled={!nextAction.date && !nextAction.note}>Guardar</Button></div>
                <Input placeholder="Nota de próxima acción" value={nextAction.note} onChange={e => setNextAction({ ...nextAction, note: e.target.value })} className="h-8" />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Timeline + pestañas */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle className="text-base">Timeline del caso ({events.length})</CardTitle></CardHeader>
          <CardContent className="max-h-[36rem] overflow-y-auto">
            <ol className="relative border-l border-gray-200 ml-2 space-y-4">
              {events.map(ev => (
                <li key={ev.id} className="ml-4">
                  <span className={`absolute -left-1.5 mt-1.5 w-3 h-3 rounded-full border border-white ${ev.event_type.includes('broken') || ev.event_type.includes('expired') || ev.event_type.includes('rejected') ? 'bg-red-500' : ev.event_type.includes('paid') || ev.event_type.includes('fulfilled') || ev.event_type.includes('approved') ? 'bg-green-500' : 'bg-blue-500'}`} />
                  <p className="text-xs text-gray-500">{new Date(ev.occurred_at).toLocaleString('es-DO')} · {ev.actor_name || 'Sistema'}</p>
                  <p className="text-sm font-medium">{EVENT_TYPE_LABEL[ev.event_type] || ev.event_type}</p>
                  <p className="text-sm text-gray-700">{ev.description}</p>
                </li>
              ))}
              {events.length === 0 && <li className="ml-4 text-sm text-gray-500">Sin eventos</li>}
            </ol>
          </CardContent>
        </Card>

        <div className="lg:col-span-2">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="flex flex-wrap h-auto">
              <TabsTrigger value="gestiones">Gestiones ({tracking.length})</TabsTrigger>
              <TabsTrigger value="promesas">Promesas ({promises.length})</TabsTrigger>
              <TabsTrigger value="expediente">Expediente {checklistState && (checklistState.complete ? '✅' : '⚠️')}</TabsTrigger>
              <TabsTrigger value="intimacion">Intimación</TabsTrigger>
              <TabsTrigger value="documentos">Documentos ({documents.length})</TabsTrigger>
              <TabsTrigger value="tareas">Tareas ({tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled').length})</TabsTrigger>
            </TabsList>

            <TabsContent value="gestiones">
              <Card><CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-600"><tr><th className="text-left px-3 py-2">Fecha</th><th className="text-left px-3 py-2">Tipo</th><th className="text-left px-3 py-2">Resultado</th><th className="text-left px-3 py-2">Detalle</th><th className="text-left px-3 py-2">Próximo</th></tr></thead>
                  <tbody>
                    {tracking.map(t => (
                      <tr key={t.id} className="border-t align-top">
                        <td className="px-3 py-2 whitespace-nowrap">{formatDateStringForSantoDomingo(t.contact_date)} {String(t.contact_time || '').slice(0, 5)}</td>
                        <td className="px-3 py-2">{CONTACT_TYPE_LABEL[t.contact_type] || t.contact_type}</td>
                        <td className="px-3 py-2">{t.result ? CONTACT_RESULT_LABEL[t.result] || t.result : '—'}{t.contacted_person && <span className="block text-xs text-gray-500">{t.contacted_person}</span>}</td>
                        <td className="px-3 py-2 text-gray-700">{t.client_response}{t.additional_notes && <span className="block text-xs text-gray-500">{t.additional_notes}</span>}{t.promise_amount && <span className="block text-xs text-amber-700">Promesa {formatCurrency(Number(t.promise_amount))} el {t.promise_date ? formatDateStringForSantoDomingo(t.promise_date) : ''}</span>}</td>
                        <td className="px-3 py-2">{t.next_contact_date ? formatDateStringForSantoDomingo(t.next_contact_date) : '—'}</td>
                      </tr>
                    ))}
                    {tracking.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-500">Sin gestiones registradas</td></tr>}
                  </tbody>
                </table>
              </CardContent></Card>
            </TabsContent>

            <TabsContent value="promesas">
              <Card><CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-600"><tr><th className="text-left px-3 py-2">Creada</th><th className="text-right px-3 py-2">Monto</th><th className="text-left px-3 py-2">Prometida</th><th className="text-left px-3 py-2">Estado</th><th className="text-left px-3 py-2">Notas</th><th></th></tr></thead>
                  <tbody>
                    {promises.map(p => (
                      <tr key={p.id} className="border-t">
                        <td className="px-3 py-2">{formatDateStringForSantoDomingo(p.created_at.split('T')[0])}</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(Number(p.amount))}</td>
                        <td className="px-3 py-2">{formatDateStringForSantoDomingo(p.promised_date)}{p.actual_payment_date && <span className="block text-xs text-green-700">Pagó {formatDateStringForSantoDomingo(p.actual_payment_date)}</span>}</td>
                        <td className="px-3 py-2"><PromiseStatusBadge status={p.status} /></td>
                        <td className="px-3 py-2 text-gray-700">{p.notes}</td>
                        <td className="px-3 py-2">{open && p.status === 'pending' && can('legal.manage') && <Button size="sm" variant="ghost" onClick={() => cancelPromise(p.id)}><XCircle className="h-3.5 w-3.5" /></Button>}</td>
                      </tr>
                    ))}
                    {promises.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-500">Sin promesas</td></tr>}
                  </tbody>
                </table>
              </CardContent></Card>
            </TabsContent>

            <TabsContent value="expediente">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center justify-between">
                    <span>Checklist pre-legal</span>
                    {checklistState && <span className={`text-sm font-bold ${checklistState.complete ? 'text-green-700' : 'text-red-700'}`}>{checklistState.complete ? 'EXPEDIENTE COMPLETO' : `EXPEDIENTE INCOMPLETO (${checklistState.missing.length})`}</span>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {checklist.sort((a, b) => Number(b.required) - Number(a.required)).map(item => (
                    <div key={item.item_key} className={`flex items-center justify-between rounded-lg border p-2 text-sm ${item.satisfied ? 'bg-green-50 border-green-200' : item.required ? 'bg-red-50 border-red-200' : 'bg-gray-50'}`}>
                      <div className="flex items-center gap-2">
                        {item.satisfied ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-red-500" />}
                        <span>{CHECKLIST_LABEL[item.item_key] || item.item_key}{!item.required && <span className="text-xs text-gray-500"> (opcional)</span>}</span>
                        {item.auto_detected && <span className="text-[10px] bg-blue-100 text-blue-800 rounded px-1">auto</span>}
                        {item.verified_at && !item.auto_detected && <span className="text-[10px] text-gray-500">verificado manualmente</span>}
                      </div>
                      {open && can('legal.manage') && (
                        <Button size="sm" variant="ghost" onClick={() => toggleChecklist(item.item_key, !item.satisfied)}>{item.satisfied ? 'Desmarcar' : 'Marcar cumplido'}</Button>
                      )}
                    </div>
                  ))}
                  <p className="text-xs text-gray-500">Los ítems "auto" se detectan desde Documentos, Clientes y Seguimiento. Puedes verificar manualmente cualquiera; queda registrado quién lo marcó. Los ítems requeridos se configuran en Mi Empresa → Cobranza legal.</p>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="intimacion">
              {companyId && (
                <IntimationPanel
                  legalCase={c} intimations={intimations} approvals={approvals} notifications={notifications} documents={documents}
                  settings={settings} todayIso={todayIso} companyId={companyId} representativeName={profile?.full_name || ''}
                  daysOverdue={daysOverdue} overdueInstallments={overdueInstallments.rows} checklistComplete={checklistState?.complete ?? null}
                  can={can} employeeName={employeeName} onChanged={refreshAll}
                />
              )}
            </TabsContent>

            <TabsContent value="documentos">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-base">Documentos del caso y del préstamo</CardTitle>{open && can('legal.manage') && <Button size="sm" onClick={() => setShowUpload(true)}><Upload className="h-3.5 w-3.5 mr-1" /> Subir</Button>}</CardHeader>
                <CardContent className="p-0">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs uppercase text-gray-600"><tr><th className="text-left px-3 py-2">Título</th><th className="text-left px-3 py-2">Tipo</th><th className="text-left px-3 py-2">Origen</th><th className="text-left px-3 py-2">Fecha</th><th></th></tr></thead>
                    <tbody>
                      {documents.map(d => (
                        <tr key={d.id} className="border-t">
                          <td className="px-3 py-2">{d.title}<span className="block text-xs text-gray-500">{d.file_name}</span></td>
                          <td className="px-3 py-2">{d.document_type}</td>
                          <td className="px-3 py-2">{d.legal_case_id ? 'Caso (privado)' : 'Préstamo'}</td>
                          <td className="px-3 py-2">{new Date(d.created_at).toLocaleDateString('es-DO')}</td>
                          <td className="px-3 py-2"><Button size="sm" variant="outline" onClick={() => openDoc(d)}><Eye className="h-3.5 w-3.5" /></Button></td>
                        </tr>
                      ))}
                      {documents.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-gray-500">Sin documentos</td></tr>}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="tareas">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between"><CardTitle className="text-base">Tareas</CardTitle>{open && can('legal.manage') && <Button size="sm" onClick={() => setShowTask(true)}><Plus className="h-3.5 w-3.5 mr-1" /> Nueva</Button>}</CardHeader>
                <CardContent className="p-0">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs uppercase text-gray-600"><tr><th className="text-left px-3 py-2">Tarea</th><th className="text-left px-3 py-2">Responsable</th><th className="text-left px-3 py-2">Vence</th><th className="text-left px-3 py-2">Prioridad</th><th className="text-left px-3 py-2">Estado</th><th></th></tr></thead>
                    <tbody>
                      {tasks.map(t => (
                        <tr key={t.id} className="border-t">
                          <td className="px-3 py-2"><b>{t.title}</b><span className="block text-xs text-gray-500">{TASK_TYPE_LABEL[t.task_type] || t.task_type}{t.description && ` · ${t.description}`}</span></td>
                          <td className="px-3 py-2">{employeeName(t.assigned_to)}</td>
                          <td className="px-3 py-2">{t.due_date ? <DeadlineBadge deadlineIso={t.due_date} todayIso={todayIso} warningDays={1} /> : '—'}</td>
                          <td className="px-3 py-2"><PriorityBadge priority={t.priority} /></td>
                          <td className="px-3 py-2"><TaskStatusBadge status={t.status} /></td>
                          <td className="px-3 py-2">{open && can('legal.manage') && !['completed', 'cancelled'].includes(t.status) && (
                            <div className="flex gap-1">
                              {t.status !== 'in_progress' && <Button size="sm" variant="ghost" title="En progreso" onClick={() => setTaskStatus(t.id, 'in_progress')}>▶</Button>}
                              <Button size="sm" variant="ghost" title="Completar" onClick={() => setTaskStatus(t.id, 'completed')}><CheckCircle2 className="h-3.5 w-3.5 text-green-600" /></Button>
                              <Button size="sm" variant="ghost" title="Cancelar" onClick={() => setTaskStatus(t.id, 'cancelled')}><XCircle className="h-3.5 w-3.5 text-gray-500" /></Button>
                            </div>
                          )}</td>
                        </tr>
                      ))}
                      {tasks.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-500">Sin tareas</td></tr>}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* ---- Diálogos ---- */}
      {showTracking && <CollectionTracking loanId={c.loan_id} clientName={c.client?.full_name || ''} isOpen={showTracking} onClose={() => { setShowTracking(false); refreshAll(); }} />}

      <Dialog open={showPromise} onOpenChange={setShowPromise}><DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Registrar promesa de pago</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Monto prometido</Label><Input type="number" min="1" value={promiseForm.amount} onChange={e => setPromiseForm({ ...promiseForm, amount: e.target.value })} /></div>
          <div className="space-y-1"><Label>Fecha prometida</Label><Input type="date" min={todayIso} value={promiseForm.date} onChange={e => setPromiseForm({ ...promiseForm, date: e.target.value })} /></div>
          <div className="space-y-1"><Label>Notas</Label><Textarea rows={2} value={promiseForm.notes} onChange={e => setPromiseForm({ ...promiseForm, notes: e.target.value })} /></div>
          <p className="text-xs text-gray-500">Si pasa la fecha sin un pago igual o mayor al monto, el sistema la marcará como incumplida y lo dejará en el timeline.</p>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setShowPromise(false)}>Cancelar</Button><Button onClick={savePromise} disabled={busy}>Guardar</Button></div>
        </div>
      </DialogContent></Dialog>

      <Dialog open={showTask} onOpenChange={setShowTask}><DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Nueva tarea</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Tipo</Label><Select value={taskForm.task_type} onValueChange={v => setTaskForm({ ...taskForm, task_type: v, title: taskForm.title || TASK_TYPE_LABEL[v] })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(TASK_TYPE_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label>Título *</Label><Input value={taskForm.title} onChange={e => setTaskForm({ ...taskForm, title: e.target.value })} /></div>
          <div className="space-y-1"><Label>Descripción</Label><Textarea rows={2} value={taskForm.description} onChange={e => setTaskForm({ ...taskForm, description: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Vence</Label><Input type="date" value={taskForm.due_date} onChange={e => setTaskForm({ ...taskForm, due_date: e.target.value })} /></div>
            <div className="space-y-1"><Label>Prioridad</Label><Select value={taskForm.priority} onValueChange={v => setTaskForm({ ...taskForm, priority: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Baja</SelectItem><SelectItem value="medium">Media</SelectItem><SelectItem value="high">Alta</SelectItem><SelectItem value="critical">Crítica</SelectItem></SelectContent></Select></div>
          </div>
          <div className="space-y-1"><Label>Responsable</Label><Select value={taskForm.assigned_to || 'case'} onValueChange={v => setTaskForm({ ...taskForm, assigned_to: v === 'case' ? '' : v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="case">Responsable del caso</SelectItem>{companyId && <SelectItem value={companyId}>Dueño</SelectItem>}{employees.map(e => <SelectItem key={e.auth_user_id} value={e.auth_user_id}>{e.full_name}</SelectItem>)}</SelectContent></Select></div>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setShowTask(false)}>Cancelar</Button><Button onClick={saveTask} disabled={busy || !taskForm.title.trim()}>Crear</Button></div>
        </div>
      </DialogContent></Dialog>

      <Dialog open={showAssign} onOpenChange={setShowAssign}><DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Asignar responsable / abogado</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Responsable interno</Label><Select value={assignForm.assigned_to || 'none'} onValueChange={v => setAssignForm({ ...assignForm, assigned_to: v === 'none' ? '' : v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sin asignar</SelectItem>{companyId && <SelectItem value={companyId}>Dueño</SelectItem>}{employees.map(e => <SelectItem key={e.auth_user_id} value={e.auth_user_id}>{e.full_name}{e.role ? ` (${e.role})` : ''}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label>Abogado / gestor legal (nombre)</Label><Input value={assignForm.lawyer_name} onChange={e => setAssignForm({ ...assignForm, lawyer_name: e.target.value })} placeholder="Lic. …" /></div>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setShowAssign(false)}>Cancelar</Button><Button onClick={saveAssign} disabled={busy}>Guardar</Button></div>
        </div>
      </DialogContent></Dialog>

      <Dialog open={showEscalate} onOpenChange={setShowEscalate}><DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Escalar caso</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Select value={escalateForm.judicial ? 'judicial' : 'escalated'} onValueChange={v => setEscalateForm({ ...escalateForm, judicial: v === 'judicial' })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="escalated">Escalar a proceso legal (remitir al abogado)</SelectItem><SelectItem value="judicial">Proceso judicial iniciado</SelectItem></SelectContent></Select>
          <Textarea rows={3} value={escalateForm.reason} onChange={e => setEscalateForm({ ...escalateForm, reason: e.target.value })} placeholder="Motivo del escalamiento *" />
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setShowEscalate(false)}>Cancelar</Button><Button onClick={doEscalate} disabled={busy || escalateForm.reason.trim().length < 5}>Escalar</Button></div>
        </div>
      </DialogContent></Dialog>

      <Dialog open={showSuspend} onOpenChange={setShowSuspend}><DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Suspender caso</DialogTitle></DialogHeader>
        <Textarea rows={3} value={suspendReason} onChange={e => setSuspendReason(e.target.value)} placeholder="Motivo de la suspensión *" />
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setShowSuspend(false)}>Cancelar</Button><Button onClick={doSuspend} disabled={suspendReason.trim().length < 5}>Suspender</Button></div>
      </DialogContent></Dialog>

      <Dialog open={showClose} onOpenChange={setShowClose}><DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Cerrar caso {c.case_number}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Motivo de cierre *</Label><Select value={closeForm.reason} onValueChange={v => setCloseForm({ ...closeForm, reason: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(CLOSE_REASON_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1"><Label>Observaciones</Label><Textarea rows={3} value={closeForm.notes} onChange={e => setCloseForm({ ...closeForm, notes: e.target.value })} /></div>
          <p className="text-xs text-gray-500">El caso quedará como histórico (resuelto o cerrado según el motivo). Las tareas pendientes se cancelan y la etapa del préstamo vuelve a calcularse por días de atraso.</p>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setShowClose(false)}>Cancelar</Button><Button variant="destructive" onClick={() => setConfirmClose(true)} disabled={busy}>Cerrar caso</Button></div>
        </div>
      </DialogContent></Dialog>
      <PasswordVerificationDialog isOpen={confirmClose} onClose={() => setConfirmClose(false)} onVerify={() => { setConfirmClose(false); doClose(); }} title="Confirmar cierre del caso" description="El cierre queda registrado en la auditoría con tu usuario. Confirma con tu contraseña." entityName="caso legal" />

      <Dialog open={showUpload} onOpenChange={setShowUpload}><DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Subir documento al expediente</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Título</Label><Input value={uploadForm.title} onChange={e => setUploadForm({ ...uploadForm, title: e.target.value })} /></div>
          <div className="space-y-1"><Label>Tipo</Label><Select value={uploadForm.document_type} onValueChange={v => setUploadForm({ ...uploadForm, document_type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>
            <SelectItem value="legal_contract">Contrato</SelectItem><SelectItem value="legal_identification">Identificación</SelectItem><SelectItem value="legal_statement">Estado de cuenta</SelectItem>
            <SelectItem value="legal_evidence">Evidencia</SelectItem><SelectItem value="legal_notification_proof">Acuse de notificación</SelectItem><SelectItem value="legal_other">Otro</SelectItem></SelectContent></Select></div>
          <div className="space-y-1"><Label>Archivo</Label><Input type="file" onChange={e => setUploadForm({ ...uploadForm, file: e.target.files?.[0] || null })} /></div>
          <p className="text-xs text-gray-500">Se guarda en el bucket privado <code>legal-evidence</code>; solo usuarios de tu empresa pueden verlo (URL firmada).</p>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setShowUpload(false)}>Cancelar</Button><Button onClick={doUpload} disabled={busy || !uploadForm.file}>Subir</Button></div>
        </div>
      </DialogContent></Dialog>
    </div>
  );
};
