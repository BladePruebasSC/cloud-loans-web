import React, { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CollectionTracking } from '@/components/loans/CollectionTracking';
import { useAuth } from '@/hooks/useAuth';
import { useLegalCases, type CollectionLoanRow, type LegalCaseRow } from '@/hooks/useLegalCases';
import { formatCurrency } from '@/lib/utils';
import { formatDateStringForSantoDomingo } from '@/utils/dateUtils';
import { CASE_STATUS_META, STAGE_META, PRIORITY_META, daysBetweenIso, isCaseOpen, type LegalCaseStatus } from '@/utils/legalWorkflow';
import { CaseStatusBadge, StageBadge, PriorityBadge, IntimationStatusBadge, DeadlineBadge, OverdueDays } from './LegalBadges';
import { OpenCaseDialog } from './OpenCaseDialog';
import { LegalCaseView } from './LegalCaseView';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import {
  Gavel, RefreshCw, Search, AlertTriangle, CalendarClock, FileText, BellRing, Users, DollarSign, TrendingUp, ClipboardList, Phone, Eye, Plus, MessageSquare,
} from 'lucide-react';

export const LegalModule: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { companyId, profile } = useAuth();
  const L = useLegalCases();
  const { loading, tablesAvailable, todayIso, settings, employees, employeeName, can, cases, intimations, approvals, tasks, collectionLoans, summary } = L;

  const caseMatch = location.pathname.match(/^\/cobranza\/casos\/([0-9a-f-]{36})/i);
  const activeCaseId = caseMatch ? caseMatch[1] : null;

  const [tab, setTab] = useState(() => new URLSearchParams(location.search).get('tab') || (location.pathname.startsWith('/cobranza/intimaciones') ? 'intimaciones' : location.pathname.startsWith('/cobranza/casos') ? 'casos' : 'dashboard'));
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>(new URLSearchParams(location.search).get('etapa') || 'all');
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<string>('deadline');
  const [openCaseFor, setOpenCaseFor] = useState<CollectionLoanRow | null>(null);
  const [trackingFor, setTrackingFor] = useState<{ loanId: string; clientName: string } | null>(null);

  const followup = settings?.followup_days ?? 3;
  const goCase = (id: string) => navigate(`/cobranza/casos/${id}`);

  // ---------------- listas ----------------
  const openCases = useMemo(() => cases.filter(c => isCaseOpen(c.status)), [cases]);

  const filteredCases = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = cases;
    if (statusFilter === 'open') list = list.filter(c => isCaseOpen(c.status));
    else if (statusFilter !== 'all') list = list.filter(c => c.status === statusFilter);
    if (ownerFilter === 'mine') list = list.filter(c => c.assigned_to === profile?.id || c.assigned_to === (profile as any)?.auth_user_id);
    else if (ownerFilter === 'none') list = list.filter(c => !c.assigned_to);
    else if (ownerFilter !== 'all') list = list.filter(c => c.assigned_to === ownerFilter);
    if (priorityFilter !== 'all') list = list.filter(c => c.priority === priorityFilter);
    if (q) list = list.filter(c => c.client?.full_name.toLowerCase().includes(q) || c.client?.dni?.toLowerCase().includes(q) || c.case_number.toLowerCase().includes(q) || c.loan_id.startsWith(q) || intimations.some(i => i.case_id === c.id && (i.intimation_number || '').toLowerCase().includes(q)));
    const daysOf = (c: LegalCaseRow) => c.loan ? Math.max(0, (daysBetweenIso(String(c.loan.next_payment_date).split('T')[0], todayIso) ?? 0) - Number(c.loan.grace_period_days || 0)) : 0;
    const deadlineOf = (c: LegalCaseRow) => c.next_action_at || intimations.find(i => i.case_id === c.id)?.deadline_date || '9999-12-31';
    const sorters: Record<string, (a: LegalCaseRow, b: LegalCaseRow) => number> = {
      amount: (a, b) => Number(b.pending_amount) - Number(a.pending_amount),
      overdue: (a, b) => daysOf(b) - daysOf(a),
      priority: (a, b) => (PRIORITY_META[b.priority]?.order ?? 0) - (PRIORITY_META[a.priority]?.order ?? 0),
      deadline: (a, b) => deadlineOf(a).localeCompare(deadlineOf(b)),
      oldest: (a, b) => a.opened_at.localeCompare(b.opened_at),
    };
    return [...list].sort(sorters[sortKey] || sorters.deadline);
  }, [cases, search, statusFilter, ownerFilter, priorityFilter, sortKey, intimations, todayIso, profile]);

  const queueLoans = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = collectionLoans.filter(l => l.daysOverdue > 0 || (l.collection_stage && l.collection_stage !== 'al_dia'));
    if (statusFilter !== 'all' && statusFilter !== 'open' && STAGE_META[statusFilter as keyof typeof STAGE_META]) list = list.filter(l => l.collection_stage === statusFilter);
    if (q) list = list.filter(l => l.client?.full_name.toLowerCase().includes(q) || l.client?.dni?.toLowerCase().includes(q) || l.id.startsWith(q));
    return list.sort((a, b) => b.daysOverdue - a.daysOverdue);
  }, [collectionLoans, search, statusFilter]);

  const intimationRows = useMemo(() => intimations.map(i => ({ ...i, case: cases.find(c => c.id === i.case_id) })).filter(r => !!r.case), [intimations, cases]);

  // Alertas
  const alerts = useMemo(() => {
    const deadlineSoon = intimationRows.filter(i => i.status === 'notified' && i.deadline_date && (daysBetweenIso(todayIso, i.deadline_date) ?? 99) >= 0 && (daysBetweenIso(todayIso, i.deadline_date) ?? 99) <= followup);
    const deadlineOver = intimationRows.filter(i => i.status === 'expired' || (i.status === 'notified' && i.deadline_date && (daysBetweenIso(todayIso, i.deadline_date) ?? 0) < 0));
    const tasksOver = tasks.filter(t => t.status === 'overdue' || (t.due_date && t.due_date < todayIso));
    const noFollow = openCases.filter(c => !c.last_action_at || (daysBetweenIso(c.last_action_at.split('T')[0], todayIso) ?? 0) > followup);
    const noOwner = openCases.filter(c => !c.assigned_to);
    const pendingApprovals = approvals.filter(a => a.status === 'requested' || a.status === 'reviewed');
    return { deadlineSoon, deadlineOver, tasksOver, noFollow, noOwner, pendingApprovals };
  }, [intimationRows, tasks, openCases, approvals, todayIso, followup]);

  const statusChart = useMemo(() => {
    const groups: Record<string, number> = { 'Pre-legal': 0, 'Intimación': 0, 'Notificación': 0, 'Plazo': 0, 'Pago/Promesa': 0, 'Escalado': 0, 'Resuelto': 0 };
    for (const c of cases) {
      const g = CASE_STATUS_META[c.status as LegalCaseStatus]?.group;
      const key = g === 'prelegal' ? 'Pre-legal' : g === 'intimation' ? 'Intimación' : g === 'notification' ? 'Notificación' : g === 'deadline' ? 'Plazo' : g === 'payment' ? 'Pago/Promesa' : g === 'escalated' ? 'Escalado' : g === 'resolved' ? 'Resuelto' : null;
      if (key) groups[key]++;
    }
    const colors = ['#dc2626', '#d97706', '#ea580c', '#2563eb', '#16a34a', '#7c3aed', '#6b7280'];
    return Object.entries(groups).map(([name, value], i) => ({ name, value, fill: colors[i] }));
  }, [cases]);

  // ---------------- vista de caso ----------------
  if (activeCaseId) {
    return (
      <div className="p-4 sm:p-6">
        <LegalCaseView caseId={activeCaseId} settings={settings} employees={employees} employeeName={employeeName} can={can} todayIso={todayIso} onBack={() => navigate('/cobranza?tab=casos')} onChanged={L.refresh} />
      </div>
    );
  }

  const KPI = ({ icon: Icon, label, value, color, onClick, sub }: { icon: any; label: string; value: React.ReactNode; color: string; onClick?: () => void; sub?: string }) => (
    <Card className={onClick ? 'cursor-pointer hover:shadow-md transition' : ''} onClick={onClick}>
      <CardContent className="p-3 flex items-center gap-3">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${color}`}><Icon className="h-4 w-4" /></div>
        <div className="min-w-0"><p className="text-xs text-gray-500 truncate">{label}</p><p className="text-lg font-bold leading-tight">{value}</p>{sub && <p className="text-[11px] text-gray-500">{sub}</p>}</div>
      </CardContent>
    </Card>
  );

  const CaseRow = ({ c }: { c: LegalCaseRow }) => {
    const days = c.loan ? Math.max(0, (daysBetweenIso(String(c.loan.next_payment_date).split('T')[0], todayIso) ?? 0) - Number(c.loan.grace_period_days || 0)) : 0;
    const intim = intimations.find(i => i.case_id === c.id);
    return (
      <tr className="border-t hover:bg-purple-50/40 cursor-pointer" onClick={() => goCase(c.id)}>
        <td className="px-3 py-2"><p className="font-medium">{c.client?.full_name}</p><p className="text-xs text-gray-500 font-mono">{c.case_number} · {c.client?.phone}</p></td>
        <td className="px-3 py-2"><CaseStatusBadge status={c.status} /></td>
        <td className="px-3 py-2"><PriorityBadge priority={c.priority} /></td>
        <td className="px-3 py-2">{employeeName(c.assigned_to)}{c.lawyer_name && <span className="block text-xs text-gray-500">{c.lawyer_name}</span>}</td>
        <td className="px-3 py-2 text-right"><OverdueDays days={days} /></td>
        <td className="px-3 py-2 text-right font-semibold">{formatCurrency(Number(c.pending_amount || 0))}</td>
        <td className="px-3 py-2">{c.next_action_at ? <DeadlineBadge deadlineIso={c.next_action_at} todayIso={todayIso} warningDays={followup} /> : <span className="text-xs text-gray-400">—</span>}{intim?.deadline_date && intim.status === 'notified' && <span className="block mt-1 text-[11px] text-gray-500">Plazo: {formatDateStringForSantoDomingo(intim.deadline_date)}</span>}</td>
        <td className="px-3 py-2 text-xs text-gray-600 max-w-[16rem] truncate">{c.next_action_note}</td>
      </tr>
    );
  };

  const CaseTableHead = () => (
    <thead className="bg-gray-50 text-xs uppercase text-gray-600"><tr>
      <th className="text-left px-3 py-2">Cliente / Expediente</th><th className="text-left px-3 py-2">Estado</th><th className="text-left px-3 py-2">Prioridad</th><th className="text-left px-3 py-2">Responsable</th>
      <th className="text-right px-3 py-2">Mora</th><th className="text-right px-3 py-2">Reclamado</th><th className="text-left px-3 py-2">Próx. acción</th><th className="text-left px-3 py-2">Nota</th>
    </tr></thead>
  );

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Gavel className="h-6 w-6 text-purple-600" /> Cobranza Legal</h1>
          <p className="text-sm text-gray-500">Del préstamo moroso a la intimación: etapas, gestiones, promesas, expediente, aprobación, emisión, notificación, plazo y cierre.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={L.runSweep} disabled={loading}><RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Actualizar etapas</Button>
        </div>
      </div>

      {!tablesAvailable && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 text-sm flex gap-2"><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>Las tablas del módulo no existen todavía. Aplica las migraciones <code>20260829000000_legal_collection_schema.sql</code> y <code>20260829000001_legal_collection_functions.sql</code>.</span></div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="bandeja">Bandeja de cobranza {summary.loansInCollection > 0 && <span className="ml-1 rounded-full bg-amber-500 text-white text-[10px] px-1.5">{summary.loansInCollection}</span>}</TabsTrigger>
          <TabsTrigger value="casos">Casos legales {summary.open > 0 && <span className="ml-1 rounded-full bg-purple-600 text-white text-[10px] px-1.5">{summary.open}</span>}</TabsTrigger>
          <TabsTrigger value="intimaciones">Intimaciones</TabsTrigger>
        </TabsList>

        {/* ---------------- DASHBOARD ---------------- */}
        <TabsContent value="dashboard" className="space-y-5">
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3">
            <KPI icon={Gavel} label="Casos abiertos" value={summary.open} sub={`${summary.total} en total`} color="bg-purple-100 text-purple-700" onClick={() => { setStatusFilter('open'); setTab('casos'); }} />
            <KPI icon={Plus} label="Nuevos (7 días)" value={summary.newCases} color="bg-blue-100 text-blue-700" />
            <KPI icon={ClipboardList} label="En pre-legal" value={summary.prelegal} color="bg-red-100 text-red-700" onClick={() => { setStatusFilter('pre_legal'); setTab('casos'); }} />
            <KPI icon={FileText} label="Intimaciones pendientes" value={summary.pendingApproval} sub="de aprobación" color="bg-amber-100 text-amber-700" onClick={() => { setStatusFilter('pending_legal_approval'); setTab('casos'); }} />
            <KPI icon={FileText} label="Emitidas sin notificar" value={summary.intimationsIssued} color="bg-orange-100 text-orange-700" onClick={() => setTab('intimaciones')} />
            <KPI icon={BellRing} label="Notificadas (en plazo)" value={summary.intimationsNotified} color="bg-sky-100 text-sky-700" onClick={() => setTab('intimaciones')} />
            <KPI icon={AlertTriangle} label="Plazos vencidos" value={summary.intimationsExpired} color="bg-red-100 text-red-700" onClick={() => setTab('intimaciones')} />
            <KPI icon={DollarSign} label="Con promesa de pago" value={summary.withPromise} color="bg-teal-100 text-teal-700" onClick={() => { setStatusFilter('payment_promise'); setTab('casos'); }} />
            <KPI icon={TrendingUp} label="Escalados" value={summary.escalated} color="bg-purple-100 text-purple-700" onClick={() => { setStatusFilter('escalated'); setTab('casos'); }} />
            <KPI icon={Users} label="Resueltos" value={summary.resolved} sub={`${summary.closed} cerrados`} color="bg-green-100 text-green-700" onClick={() => { setStatusFilter('resolved'); setTab('casos'); }} />
            <KPI icon={DollarSign} label="Monto en proceso" value={formatCurrency(summary.amountInProcess)} color="bg-red-100 text-red-700" />
            <KPI icon={DollarSign} label="Monto recuperado" value={formatCurrency(summary.amountRecovered)} color="bg-green-100 text-green-700" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-1">
              <CardHeader><CardTitle className="text-base">Distribución por etapa</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={statusChart} layout="vertical" margin={{ left: 10, right: 20 }}>
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 11 }} />
                    <Tooltip /><Bar dataKey="value" name="Casos" radius={[0, 4, 4, 0]}>{statusChart.map((d, i) => <Cell key={i} fill={d.fill} />)}</Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-600" /> Alertas</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <AlertList title="Intimaciones que vencen pronto" items={alerts.deadlineSoon.map(i => ({ id: i.case_id, label: `${i.case?.client?.full_name} · ${i.intimation_number} · vence ${formatDateStringForSantoDomingo(i.deadline_date!)}` }))} color="text-amber-700" onOpen={goCase} />
                <AlertList title="Intimaciones con plazo vencido" items={alerts.deadlineOver.map(i => ({ id: i.case_id, label: `${i.case?.client?.full_name} · ${i.intimation_number} · venció ${i.deadline_date ? formatDateStringForSantoDomingo(i.deadline_date) : ''}` }))} color="text-red-700" onOpen={goCase} />
                <AlertList title="Solicitudes pendientes de aprobación" items={alerts.pendingApprovals.map(a => ({ id: a.case_id, label: `${cases.find(c => c.id === a.case_id)?.client?.full_name || ''} · ${cases.find(c => c.id === a.case_id)?.case_number || ''} · ${a.status === 'reviewed' ? 'revisada, falta aprobar' : 'sin revisar'}` }))} color="text-amber-700" onOpen={goCase} />
                <AlertList title="Tareas vencidas" items={alerts.tasksOver.map(t => ({ id: t.case_id, label: `${t.title} · ${employeeName(t.assigned_to)} · ${t.due_date ? formatDateStringForSantoDomingo(t.due_date) : ''}` }))} color="text-red-700" onOpen={goCase} />
                <AlertList title={`Casos sin seguimiento (> ${followup} días)`} items={alerts.noFollow.map(c => ({ id: c.id, label: `${c.client?.full_name} · ${c.case_number} · última gestión ${c.last_action_at ? formatDateStringForSantoDomingo(c.last_action_at.split('T')[0]) : 'nunca'}` }))} color="text-orange-700" onOpen={goCase} />
                <AlertList title="Casos sin responsable" items={alerts.noOwner.map(c => ({ id: c.id, label: `${c.client?.full_name} · ${c.case_number}` }))} color="text-gray-700" onOpen={goCase} />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ---------------- BANDEJA (préstamos en cobranza, sin caso) ---------------- */}
        <TabsContent value="bandeja" className="space-y-3">
          <div className="flex flex-col lg:flex-row gap-2 lg:items-center">
            <div className="relative flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" /><Input className="pl-9" placeholder="Buscar cliente, cédula o préstamo…" value={search} onChange={e => setSearch(e.target.value)} /></div>
            <select className="h-10 rounded-md border border-gray-300 bg-white px-2 text-sm" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="all">Todas las etapas</option>
              {Object.entries(STAGE_META).filter(([k]) => k !== 'al_dia' && k !== 'legal').map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
            </select>
          </div>
          <p className="text-xs text-gray-500">Préstamos activos con atraso, ordenados por días de mora. La etapa se calcula con los umbrales de Mi Empresa → Cobranza legal (preventiva {settings?.preventive ?? 3} d · administrativa {settings?.administrative ?? 8} d · intensiva {settings?.intensive ?? 30} d · pre-legal {settings?.prelegal ?? 60} d).</p>
          <Card><CardContent className="p-0 overflow-x-auto">
            {loading ? <div className="py-12 text-center text-gray-500">Cargando…</div> : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-600"><tr><th className="text-left px-3 py-2">Cliente</th><th className="text-left px-3 py-2">Etapa</th><th className="text-right px-3 py-2">Mora</th><th className="text-right px-3 py-2">Saldo</th><th className="text-right px-3 py-2">Mora RD$</th><th className="text-left px-3 py-2">Próx. cuota</th><th className="text-left px-3 py-2">Caso</th><th></th></tr></thead>
                <tbody>
                  {queueLoans.map(l => (
                    <tr key={l.id} className="border-t hover:bg-amber-50/40">
                      <td className="px-3 py-2"><p className="font-medium">{l.client?.full_name}</p><p className="text-xs text-gray-500">{l.client?.dni} · {l.client?.phone}</p></td>
                      <td className="px-3 py-2"><StageBadge stage={l.collection_stage} />{l.collection_stage_since && <span className="block text-[11px] text-gray-500">desde {formatDateStringForSantoDomingo(l.collection_stage_since)}</span>}</td>
                      <td className="px-3 py-2 text-right"><OverdueDays days={l.daysOverdue} /></td>
                      <td className="px-3 py-2 text-right">{formatCurrency(Number(l.remaining_balance || 0))}</td>
                      <td className="px-3 py-2 text-right text-red-600">{formatCurrency(Number(l.current_late_fee || 0))}</td>
                      <td className="px-3 py-2">{formatDateStringForSantoDomingo(l.next_payment_date)}</td>
                      <td className="px-3 py-2">{l.activeCaseId ? <Button size="sm" variant="link" className="h-auto p-0" onClick={() => goCase(l.activeCaseId!)}>Ver caso</Button> : <span className="text-xs text-gray-400">—</span>}</td>
                      <td className="px-3 py-2"><div className="flex gap-1 justify-end">
                        <a href={`tel:${l.client?.phone}`}><Button size="sm" variant="outline" className="h-8" title="Llamar"><Phone className="h-3.5 w-3.5" /></Button></a>
                        <Button size="sm" variant="outline" className="h-8" title="Registrar gestión" onClick={() => setTrackingFor({ loanId: l.id, clientName: l.client?.full_name || '' })}><MessageSquare className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="outline" className="h-8" title="Registrar pago" onClick={() => navigate(`/prestamos?action=payment&loanId=${l.id}`)}><DollarSign className="h-3.5 w-3.5" /></Button>
                        {!l.activeCaseId && can('legal.open') && <Button size="sm" className="h-8 bg-purple-600 hover:bg-purple-700" title="Evaluar / abrir caso legal" onClick={() => setOpenCaseFor(l)}><Gavel className="h-3.5 w-3.5 mr-1" /> Evaluar</Button>}
                      </div></td>
                    </tr>
                  ))}
                  {queueLoans.length === 0 && <tr><td colSpan={8} className="px-3 py-10 text-center text-gray-500">No hay préstamos en cobranza con este filtro 👍</td></tr>}
                </tbody>
              </table>
            )}
          </CardContent></Card>
        </TabsContent>

        {/* ---------------- CASOS ---------------- */}
        <TabsContent value="casos" className="space-y-3">
          <div className="flex flex-col xl:flex-row gap-2 xl:items-center">
            <div className="relative flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" /><Input className="pl-9" placeholder="Cliente, cédula, expediente, intimación o préstamo…" value={search} onChange={e => setSearch(e.target.value)} /></div>
            <select className="h-10 rounded-md border border-gray-300 bg-white px-2 text-sm" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="open">Abiertos</option><option value="all">Todos</option>
              {Object.entries(CASE_STATUS_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
            </select>
            <select className="h-10 rounded-md border border-gray-300 bg-white px-2 text-sm" value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)}>
              <option value="all">Todos los responsables</option><option value="none">Sin responsable</option>
              {companyId && <option value={companyId}>Dueño</option>}
              {employees.map(e => <option key={e.auth_user_id} value={e.auth_user_id}>{e.full_name}</option>)}
            </select>
            <select className="h-10 rounded-md border border-gray-300 bg-white px-2 text-sm" value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}>
              <option value="all">Toda prioridad</option><option value="critical">Crítica</option><option value="high">Alta</option><option value="medium">Media</option><option value="low">Baja</option>
            </select>
            <select className="h-10 rounded-md border border-gray-300 bg-white px-2 text-sm" value={sortKey} onChange={e => setSortKey(e.target.value)}>
              <option value="deadline">Próxima fecha límite</option><option value="amount">Mayor monto</option><option value="overdue">Mayor mora</option><option value="priority">Mayor prioridad</option><option value="oldest">Más antiguos</option>
            </select>
          </div>
          <Card><CardContent className="p-0 overflow-x-auto">
            {loading ? <div className="py-12 text-center text-gray-500">Cargando…</div> : (
              <table className="w-full text-sm"><CaseTableHead /><tbody>
                {filteredCases.map(c => <CaseRow key={c.id} c={c} />)}
                {filteredCases.length === 0 && <tr><td colSpan={8} className="px-3 py-10 text-center text-gray-500">Sin casos con este filtro. Abre uno desde la Bandeja de cobranza.</td></tr>}
              </tbody></table>
            )}
          </CardContent></Card>
        </TabsContent>

        {/* ---------------- INTIMACIONES ---------------- */}
        <TabsContent value="intimaciones" className="space-y-3">
          <Card><CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-600"><tr><th className="text-left px-3 py-2">Número</th><th className="text-left px-3 py-2">Cliente / Expediente</th><th className="text-left px-3 py-2">Estado</th><th className="text-right px-3 py-2">Reclamado</th><th className="text-left px-3 py-2">Emitida</th><th className="text-left px-3 py-2">Notificada</th><th className="text-left px-3 py-2">Plazo</th><th></th></tr></thead>
              <tbody>
                {intimationRows.map(i => (
                  <tr key={i.id} className="border-t hover:bg-purple-50/40 cursor-pointer" onClick={() => navigate(`/cobranza/casos/${i.case_id}?tab=intimacion`)}>
                    <td className="px-3 py-2 font-mono">{i.intimation_number || <span className="text-gray-400">borrador</span>}</td>
                    <td className="px-3 py-2"><p className="font-medium">{i.case?.client?.full_name}</p><p className="text-xs text-gray-500 font-mono">{i.case?.case_number}</p></td>
                    <td className="px-3 py-2"><IntimationStatusBadge status={i.status} /></td>
                    <td className="px-3 py-2 text-right">{formatCurrency(Number(i.claimed_amount || 0))}</td>
                    <td className="px-3 py-2">{i.issued_at ? formatDateStringForSantoDomingo(i.issued_at.split('T')[0]) : '—'}</td>
                    <td className="px-3 py-2">{i.notified_at ? formatDateStringForSantoDomingo(i.notified_at.split('T')[0]) : '—'}</td>
                    <td className="px-3 py-2">{i.deadline_date ? <DeadlineBadge deadlineIso={i.deadline_date} todayIso={todayIso} warningDays={followup} /> : '—'}</td>
                    <td className="px-3 py-2"><Button size="sm" variant="outline" className="h-8"><Eye className="h-3.5 w-3.5" /></Button></td>
                  </tr>
                ))}
                {intimationRows.length === 0 && <tr><td colSpan={8} className="px-3 py-10 text-center text-gray-500">Sin intimaciones</td></tr>}
              </tbody>
            </table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      <OpenCaseDialog
        isOpen={!!openCaseFor} onClose={() => setOpenCaseFor(null)} loanId={openCaseFor?.id || null} clientName={openCaseFor?.client?.full_name || ''}
        employees={employees} companyId={companyId} canOverride={can('legal.override_duplicate')} evaluate={L.evaluateEligibility} onOpenCase={L.openCase} onOpened={goCase}
      />
      {trackingFor && <CollectionTracking loanId={trackingFor.loanId} clientName={trackingFor.clientName} isOpen={!!trackingFor} onClose={() => { setTrackingFor(null); L.refresh(); }} />}
    </div>
  );
};

const AlertList: React.FC<{ title: string; items: Array<{ id: string; label: string }>; color: string; onOpen: (id: string) => void }> = ({ title, items, color, onOpen }) => (
  <div>
    <p className={`font-semibold ${color}`}>{title} <span className="text-gray-400 font-normal">({items.length})</span></p>
    {items.length === 0 ? <p className="text-xs text-gray-400">Ninguna</p> : (
      <ul className="mt-1 space-y-0.5">{items.slice(0, 6).map((it, i) => <li key={i}><button className="text-left hover:underline text-gray-700" onClick={() => onOpen(it.id)}>• {it.label}</button></li>)}{items.length > 6 && <li className="text-xs text-gray-500">… y {items.length - 6} más</li>}</ul>
    )}
  </div>
);

export default LegalModule;
