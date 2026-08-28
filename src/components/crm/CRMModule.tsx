import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CollectionTracking } from '@/components/loans/CollectionTracking';
import { useClientCRM, type CRMClientRecord } from '@/hooks/useClientCRM';
import { CATEGORY_META, type ClientCategory } from '@/utils/clientScoring';
import { formatCurrency } from '@/lib/utils';
import { formatDateStringForSantoDomingo } from '@/utils/dateUtils';
import { CategoryBadge, BehaviorBadge, ScoreMeter } from './ScoreBadge';
import { ClientCRMDetail } from './ClientCRMDetail';
import { CRMStatistics } from './CRMStatistics';
import {
  Search, RefreshCw, Users, Flame, CloudSun, Snowflake, Sparkles, AlertTriangle, CalendarClock,
  TrendingUp, Phone, MessageSquare, DollarSign, Eye, Target,
} from 'lucide-react';

type SortKey = 'score_desc' | 'score_asc' | 'name' | 'overdue' | 'ltv' | 'last_payment';

export const CRMModule: React.FC = () => {
  const {
    records, summary, loading, persisting, lastComputedAt, profilesTableAvailable, canEdit, todayIso, refresh, updateProfile,
  } = useClientCRM();
  const navigate = useNavigate();
  const location = useLocation();

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<ClientCategory | 'all'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('score_desc');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [tab, setTab] = useState('clientes');
  const [trackingFor, setTrackingFor] = useState<{ loanId: string; clientName: string } | null>(null);

  // Enlace profundo: /crm?client=<id> abre la ficha
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('client');
    if (id && !loading && records.some(r => r.client.id === id)) {
      setDetailId(id);
      window.history.replaceState({}, '', '/crm');
    }
  }, [location.search, loading, records]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = records;
    if (categoryFilter !== 'all') list = list.filter(r => r.effectiveCategory === categoryFilter);
    if (q) {
      list = list.filter(r =>
        r.client.full_name.toLowerCase().includes(q) ||
        String(r.client.dni || '').toLowerCase().includes(q) ||
        String(r.client.phone || '').toLowerCase().includes(q) ||
        (r.profile?.tags || []).some(t => t.toLowerCase().includes(q))
      );
    }
    const sorters: Record<SortKey, (a: CRMClientRecord, b: CRMClientRecord) => number> = {
      score_desc: (a, b) => b.score.score - a.score.score,
      score_asc: (a, b) => a.score.score - b.score.score,
      name: (a, b) => a.client.full_name.localeCompare(b.client.full_name),
      overdue: (a, b) => b.score.metrics.currentMaxDaysOverdue - a.score.metrics.currentMaxDaysOverdue,
      ltv: (a, b) => b.score.metrics.lifetimeValue - a.score.metrics.lifetimeValue,
      last_payment: (a, b) => (b.score.metrics.daysSinceLastPayment ?? 1e9) - (a.score.metrics.daysSinceLastPayment ?? 1e9),
    };
    return [...list].sort(sorters[sortKey]);
  }, [records, search, categoryFilter, sortKey]);

  const detailRecord = records.find(r => r.client.id === detailId) || null;

  // Listas de la pestaña Seguimiento
  const needContact = records.filter(r => r.score.flags.some(f => f.code === 'overdue_no_recent_contact'))
    .sort((a, b) => b.score.metrics.currentMaxDaysOverdue - a.score.metrics.currentMaxDaysOverdue);
  const scheduled = records.filter(r => r.score.flags.some(f => f.code === 'next_contact_due'))
    .sort((a, b) => String(a.score.metrics.nextContactDate).localeCompare(String(b.score.metrics.nextContactDate)));
  const opportunities = records.filter(r => r.score.flags.some(f => f.code === 'renewal_opportunity' || f.code === 'inactive_reactivation'))
    .sort((a, b) => b.score.score - a.score.score);

  const overdueLoanOf = (r: CRMClientRecord) =>
    r.score.flags.find(f => f.loanId)?.loanId ||
    r.loans.find(l => l.status === 'active' || l.status === 'overdue')?.id ||
    null;

  const CategoryChip = ({ cat, icon: Icon }: { cat: ClientCategory | 'all'; icon: any }) => {
    const active = categoryFilter === cat;
    const count = cat === 'all' ? summary.total : summary.byCategory[cat];
    const label = cat === 'all' ? 'Todos' : CATEGORY_META[cat].label;
    return (
      <button
        onClick={() => setCategoryFilter(cat)}
        className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition ${
          active ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
        }`}
      >
        <Icon className="h-3.5 w-3.5" /> {label} <span className={`text-xs ${active ? 'text-slate-300' : 'text-gray-500'}`}>({count})</span>
      </button>
    );
  };

  const KPI = ({ icon: Icon, label, value, color, onClick }: { icon: any; label: string; value: string | number; color: string; onClick?: () => void }) => (
    <Card className={onClick ? 'cursor-pointer hover:shadow-md transition' : ''} onClick={onClick}>
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs text-gray-500">{label}</p>
          <p className="text-xl font-bold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );

  const ClientRow = ({ r, extra }: { r: CRMClientRecord; extra?: React.ReactNode }) => {
    const m = r.score.metrics;
    return (
      <tr className="border-t hover:bg-blue-50/40">
        <td className="px-4 py-3">
          <button className="text-left" onClick={() => setDetailId(r.client.id)}>
            <p className="font-medium text-gray-900 hover:underline">{r.client.full_name}</p>
            <p className="text-xs text-gray-500">{r.client.dni} · {r.client.phone}</p>
          </button>
        </td>
        <td className="px-4 py-3"><CategoryBadge category={r.effectiveCategory} manual={!!r.profile?.manual_category} /></td>
        <td className="px-4 py-3 w-36"><ScoreMeter score={r.score.score} /></td>
        <td className="px-4 py-3"><BehaviorBadge behavior={r.score.behavior} /></td>
        <td className="px-4 py-3 text-right">{m.activeLoans}<span className="text-gray-400"> / {m.totalLoans}</span></td>
        <td className="px-4 py-3 text-right">{formatCurrency(m.activeBalance)}</td>
        <td className={`px-4 py-3 text-right font-medium ${m.currentMaxDaysOverdue > 0 ? 'text-red-600' : 'text-green-700'}`}>
          {m.activeLoans === 0 ? '—' : m.currentMaxDaysOverdue > 0 ? `${m.currentMaxDaysOverdue} d` : 'Al día'}
        </td>
        <td className="px-4 py-3 text-right">{formatCurrency(m.lifetimeValue)}</td>
        <td className="px-4 py-3">
          <div className="flex gap-1 justify-end">
            {extra}
            <Button size="sm" variant="outline" className="h-8" title="Ficha" onClick={() => setDetailId(r.client.id)}><Eye className="h-3.5 w-3.5" /></Button>
          </div>
        </td>
      </tr>
    );
  };

  const TableHead = () => (
    <thead className="bg-gray-50 text-xs uppercase text-gray-600">
      <tr>
        <th className="text-left px-4 py-2">Cliente</th>
        <th className="text-left px-4 py-2">Categoría</th>
        <th className="text-left px-4 py-2">Score</th>
        <th className="text-left px-4 py-2">Pago</th>
        <th className="text-right px-4 py-2">Activos</th>
        <th className="text-right px-4 py-2">Saldo</th>
        <th className="text-right px-4 py-2">Atraso</th>
        <th className="text-right px-4 py-2">Negocio</th>
        <th className="px-4 py-2"></th>
      </tr>
    </thead>
  );

  const ActionButtons = ({ r }: { r: CRMClientRecord }) => {
    const loanId = overdueLoanOf(r);
    return (
      <>
        <a href={`tel:${r.client.phone}`}><Button size="sm" variant="outline" className="h-8" title="Llamar"><Phone className="h-3.5 w-3.5" /></Button></a>
        {loanId && (
          <>
            <Button size="sm" variant="outline" className="h-8" title="Registrar seguimiento" onClick={() => setTrackingFor({ loanId, clientName: r.client.full_name })}>
              <MessageSquare className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="outline" className="h-8" title="Registrar pago" onClick={() => navigate(`/prestamos?action=payment&loanId=${loanId}`)}>
              <DollarSign className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
      </>
    );
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Target className="h-6 w-6 text-blue-600" /> CRM de Clientes</h1>
          <p className="text-sm text-gray-500">
            Calificación por comportamiento de pago, cantidad y frecuencia de préstamos y negocio generado.
            {lastComputedAt && <> Calculado {lastComputedAt.toLocaleTimeString('es-DO')}.</>}
            {persisting && <> Guardando…</>}
          </p>
        </div>
        <Button variant="outline" onClick={refresh} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Recalcular
        </Button>
      </div>

      {!profilesTableAvailable && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 text-sm flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            La tabla <code>client_crm_profiles</code> no está disponible: el CRM funciona en memoria, pero no se guardarán
            categorías manuales, etiquetas ni notas. Aplica la migración <code>20260828100000_create_client_crm_profiles.sql</code>.
          </span>
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <KPI icon={Users} label="Clientes" value={summary.total} color="bg-gray-100 text-gray-700" onClick={() => { setCategoryFilter('all'); setTab('clientes'); }} />
        <KPI icon={Flame} label="Calientes" value={summary.byCategory.caliente} color="bg-red-100 text-red-700" onClick={() => { setCategoryFilter('caliente'); setTab('clientes'); }} />
        <KPI icon={CloudSun} label="Tibios" value={summary.byCategory.tibio} color="bg-amber-100 text-amber-700" onClick={() => { setCategoryFilter('tibio'); setTab('clientes'); }} />
        <KPI icon={Snowflake} label="Fríos" value={summary.byCategory.frio} color="bg-sky-100 text-sky-700" onClick={() => { setCategoryFilter('frio'); setTab('clientes'); }} />
        <KPI icon={Sparkles} label="Nuevos" value={summary.byCategory.nuevo} color="bg-gray-100 text-gray-600" onClick={() => { setCategoryFilter('nuevo'); setTab('clientes'); }} />
        <KPI icon={TrendingUp} label="Score promedio" value={summary.avgScore} color="bg-blue-100 text-blue-700" />
        <KPI icon={AlertTriangle} label="Requieren contacto" value={summary.needContact} color="bg-red-100 text-red-700" onClick={() => setTab('seguimiento')} />
        <KPI icon={CalendarClock} label="Contactos hoy" value={summary.contactsDueToday} color="bg-amber-100 text-amber-700" onClick={() => setTab('seguimiento')} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="clientes">Clientes</TabsTrigger>
          <TabsTrigger value="seguimiento">Seguimiento {summary.needContact + summary.contactsDueToday > 0 && <span className="ml-1 rounded-full bg-red-500 text-white text-[10px] px-1.5">{summary.needContact + summary.contactsDueToday}</span>}</TabsTrigger>
          <TabsTrigger value="estadisticas">Estadísticas</TabsTrigger>
        </TabsList>

        {/* ---------------- CLIENTES ---------------- */}
        <TabsContent value="clientes" className="space-y-4">
          <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <Input className="pl-9" placeholder="Buscar por nombre, cédula, teléfono o etiqueta…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-2">
              <CategoryChip cat="all" icon={Users} />
              <CategoryChip cat="caliente" icon={Flame} />
              <CategoryChip cat="tibio" icon={CloudSun} />
              <CategoryChip cat="frio" icon={Snowflake} />
              <CategoryChip cat="nuevo" icon={Sparkles} />
            </div>
            <select className="h-10 rounded-md border border-gray-300 bg-white px-2 text-sm" value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)}>
              <option value="score_desc">Mayor score</option>
              <option value="score_asc">Menor score</option>
              <option value="overdue">Más atrasados</option>
              <option value="ltv">Más negocio</option>
              <option value="last_payment">Más tiempo sin pagar</option>
              <option value="name">Nombre</option>
            </select>
          </div>

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              {loading ? (
                <div className="py-16 text-center text-gray-500">
                  <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-3 text-blue-500" />
                  Calculando calificaciones…
                </div>
              ) : (
                <table className="w-full text-sm">
                  <TableHead />
                  <tbody>
                    {filtered.map(r => <ClientRow key={r.client.id} r={r} extra={<ActionButtons r={r} />} />)}
                    {filtered.length === 0 && (
                      <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-500">No hay clientes que coincidan</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
          <p className="text-xs text-gray-500">
            🔥 Caliente ≥ 700 · 🌤️ Tibio 450–699 · 🧊 Frío &lt; 450 · ✨ Nuevo sin historial. El score también se guarda en la ficha del cliente.
          </p>
        </TabsContent>

        {/* ---------------- SEGUIMIENTO ---------------- */}
        <TabsContent value="seguimiento" className="space-y-6">
          <Section
            title="Requieren contacto"
            subtitle="Atrasados sin ningún seguimiento registrado en los últimos 7 días"
            icon={AlertTriangle}
            color="text-red-600"
            count={needContact.length}
          >
            <table className="w-full text-sm">
              <TableHead />
              <tbody>
                {needContact.map(r => <ClientRow key={r.client.id} r={r} extra={<ActionButtons r={r} />} />)}
                {needContact.length === 0 && <tr><td colSpan={9} className="px-4 py-6 text-center text-gray-500">Todos los clientes atrasados tienen seguimiento reciente 👍</td></tr>}
              </tbody>
            </table>
          </Section>

          <Section
            title="Contactos programados"
            subtitle="Seguimientos con fecha de próximo contacto hoy o vencida"
            icon={CalendarClock}
            color="text-amber-600"
            count={scheduled.length}
          >
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-600">
                <tr>
                  <th className="text-left px-4 py-2">Cliente</th>
                  <th className="text-left px-4 py-2">Categoría</th>
                  <th className="text-left px-4 py-2">Programado</th>
                  <th className="text-left px-4 py-2">Último contacto</th>
                  <th className="text-right px-4 py-2">Atraso</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {scheduled.map(r => {
                  const m = r.score.metrics;
                  const overdueSched = m.nextContactDate && m.nextContactDate < todayIso;
                  return (
                    <tr key={r.client.id} className="border-t hover:bg-blue-50/40">
                      <td className="px-4 py-3">
                        <button className="text-left" onClick={() => setDetailId(r.client.id)}>
                          <p className="font-medium hover:underline">{r.client.full_name}</p>
                          <p className="text-xs text-gray-500">{r.client.phone}</p>
                        </button>
                      </td>
                      <td className="px-4 py-3"><CategoryBadge category={r.effectiveCategory} manual={!!r.profile?.manual_category} /></td>
                      <td className={`px-4 py-3 font-medium ${overdueSched ? 'text-red-600' : 'text-amber-700'}`}>
                        {m.nextContactDate ? formatDateStringForSantoDomingo(m.nextContactDate) : '—'} {overdueSched && '(vencido)'}
                      </td>
                      <td className="px-4 py-3">{m.lastContactDate ? formatDateStringForSantoDomingo(m.lastContactDate) : '—'}</td>
                      <td className={`px-4 py-3 text-right ${m.currentMaxDaysOverdue > 0 ? 'text-red-600 font-medium' : 'text-green-700'}`}>{m.currentMaxDaysOverdue > 0 ? `${m.currentMaxDaysOverdue} d` : 'Al día'}</td>
                      <td className="px-4 py-3"><div className="flex gap-1 justify-end"><ActionButtons r={r} /><Button size="sm" variant="outline" className="h-8" onClick={() => setDetailId(r.client.id)}><Eye className="h-3.5 w-3.5" /></Button></div></td>
                    </tr>
                  );
                })}
                {scheduled.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-500">Sin contactos pendientes</td></tr>}
              </tbody>
            </table>
          </Section>

          <Section
            title="Oportunidades comerciales"
            subtitle="Buenos clientes con préstamo casi terminado (renovación) o inactivos (reactivación)"
            icon={TrendingUp}
            color="text-green-600"
            count={opportunities.length}
          >
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-600">
                <tr>
                  <th className="text-left px-4 py-2">Cliente</th>
                  <th className="text-left px-4 py-2">Categoría</th>
                  <th className="text-left px-4 py-2">Score</th>
                  <th className="text-left px-4 py-2">Oportunidad</th>
                  <th className="text-right px-4 py-2">Negocio</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {opportunities.map(r => {
                  const f = r.score.flags.find(x => x.code === 'renewal_opportunity' || x.code === 'inactive_reactivation');
                  return (
                    <tr key={r.client.id} className="border-t hover:bg-blue-50/40">
                      <td className="px-4 py-3">
                        <button className="text-left" onClick={() => setDetailId(r.client.id)}>
                          <p className="font-medium hover:underline">{r.client.full_name}</p>
                          <p className="text-xs text-gray-500">{r.client.phone}</p>
                        </button>
                      </td>
                      <td className="px-4 py-3"><CategoryBadge category={r.effectiveCategory} manual={!!r.profile?.manual_category} /></td>
                      <td className="px-4 py-3 w-36"><ScoreMeter score={r.score.score} /></td>
                      <td className="px-4 py-3 text-blue-800">{f?.label}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(r.score.metrics.lifetimeValue)}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 justify-end">
                          <a href={`tel:${r.client.phone}`}><Button size="sm" variant="outline" className="h-8"><Phone className="h-3.5 w-3.5" /></Button></a>
                          <Button size="sm" variant="outline" className="h-8" title="Nuevo préstamo" onClick={() => navigate('/prestamos/nuevo')}><DollarSign className="h-3.5 w-3.5" /></Button>
                          <Button size="sm" variant="outline" className="h-8" onClick={() => setDetailId(r.client.id)}><Eye className="h-3.5 w-3.5" /></Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {opportunities.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-500">Sin oportunidades detectadas por ahora</td></tr>}
              </tbody>
            </table>
          </Section>
        </TabsContent>

        {/* ---------------- ESTADÍSTICAS ---------------- */}
        <TabsContent value="estadisticas">
          {loading ? (
            <div className="py-16 text-center text-gray-500">Cargando…</div>
          ) : (
            <CRMStatistics records={records} onOpenClient={id => setDetailId(id)} />
          )}
        </TabsContent>
      </Tabs>

      {/* Ficha del cliente */}
      <ClientCRMDetail
        record={detailRecord}
        isOpen={!!detailRecord}
        onClose={() => setDetailId(null)}
        canEdit={canEdit}
        todayIso={todayIso}
        onUpdateProfile={updateProfile}
        onTrackingChanged={refresh}
      />

      {/* Seguimiento rápido desde la lista */}
      {trackingFor && (
        <CollectionTracking
          loanId={trackingFor.loanId}
          clientName={trackingFor.clientName}
          isOpen={!!trackingFor}
          onClose={() => { setTrackingFor(null); refresh(); }}
        />
      )}
    </div>
  );
};

const Section: React.FC<{ title: string; subtitle: string; icon: any; color: string; count: number; children: React.ReactNode }> = ({
  title, subtitle, icon: Icon, color, count, children,
}) => (
  <Card>
    <div className="px-4 py-3 border-b flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className={`h-5 w-5 ${color}`} />
        <div>
          <h3 className="font-semibold text-gray-900">{title} <span className="text-gray-400 font-normal">({count})</span></h3>
          <p className="text-xs text-gray-500">{subtitle}</p>
        </div>
      </div>
    </div>
    <CardContent className="p-0 overflow-x-auto">{children}</CardContent>
  </Card>
);

export default CRMModule;
