import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CollectionTracking } from '@/components/loans/CollectionTracking';
import { useAuth } from '@/hooks/useAuth';
import { usePortfolioData, type PendingItem, type ActivityItem } from '@/hooks/usePortfolioData';
import { getCurrentDateInSantoDomingo, formatDateStringForSantoDomingo } from '@/utils/dateUtils';
import { formatCurrency } from '@/lib/utils';
import {
  RefreshCw, DollarSign, CreditCard, UserPlus, Zap, Phone, MessageSquare, ArrowRight, AlertTriangle,
  Clock, CheckCircle2, TrendingUp, TrendingDown, Activity, Users, Gavel, Target, Briefcase, Package,
  ShoppingCart, Scale, FileText, BarChart3, MapPin, HandHeart, Building2, ChevronRight, CalendarDays,
  ArrowUpRight, Wallet, ShieldCheck,
} from 'lucide-react';

const MONTH_ABBR = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Mes abreviado de una fecha 'YYYY-MM-DD'. No depende de los datos de locale del navegador. */
const monthAbbr = (iso: string) => MONTH_ABBR[Number(iso.split('-')[1]) - 1] || '';

const greeting = () => {
  const h = getCurrentDateInSantoDomingo().getHours();
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
};

const relativeTime = (iso: string): string => {
  const d = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso);
  if (isNaN(d.getTime())) return '';
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'ahora';
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const days = Math.round(hrs / 24);
  if (days === 1) return 'ayer';
  if (days < 30) return `hace ${days} días`;
  return d.toLocaleDateString('es-DO', { day: 'numeric', month: 'short' });
};

const KIND_ICON: Record<PendingItem['kind'], any> = {
  overdue: AlertTriangle, due_today: Clock, follow_up: Phone,
  promise: HandHeart, legal_task: Gavel, legal_approval: Gavel,
};
const SEVERITY_STYLE: Record<PendingItem['severity'], { dot: string; badge: string }> = {
  danger: { dot: 'bg-red-500', badge: 'bg-red-50 text-red-700 border-red-200' },
  warning: { dot: 'bg-amber-500', badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  info: { dot: 'bg-blue-500', badge: 'bg-blue-50 text-blue-700 border-blue-200' },
};
const ACTIVITY_ICON: Record<ActivityItem['kind'], any> = {
  payment: DollarSign, loan: CreditCard, client: UserPlus, contact: MessageSquare,
};
const ACTIVITY_STYLE: Record<ActivityItem['kind'], string> = {
  payment: 'bg-green-100 text-green-700', loan: 'bg-blue-100 text-blue-700',
  client: 'bg-purple-100 text-purple-700', contact: 'bg-slate-100 text-slate-700',
};

export const HomeModule: React.FC = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const P = usePortfolioData();
  const { portfolio, cashflow, agenda, pending, activity, onboarding, clientStats, todayIso } = P;
  const [trackingFor, setTrackingFor] = useState<{ loanId: string; clientName: string } | null>(null);
  const [showAllPending, setShowAllPending] = useState(false);

  const firstName = (profile?.full_name || '').split(' ')[0];
  const visiblePending = showAllPending ? pending : pending.slice(0, 7);

  const quickActions = [
    { label: 'Registrar pago', icon: DollarSign, to: '/cobro-rapido', permission: 'loans.view', className: 'bg-emerald-600 hover:bg-emerald-700' },
    { label: 'Nuevo préstamo', icon: CreditCard, to: '/prestamos/nuevo', permission: 'loans.create', className: 'bg-blue-600 hover:bg-blue-700' },
    { label: 'Nuevo cliente', icon: UserPlus, to: '/clientes/nuevo', permission: 'clients.create', className: 'bg-violet-600 hover:bg-violet-700' },
    { label: 'Cobro rápido', icon: Zap, to: '/cobro-rapido', permission: 'loans.view', className: 'bg-amber-500 hover:bg-amber-600' },
  ].filter(a => P.can(a.permission));

  const modules = [
    { label: 'Clientes', icon: Users, to: '/clientes', permission: 'clients.view' },
    { label: 'Préstamos', icon: DollarSign, to: '/prestamos', permission: 'loans.view' },
    { label: 'CRM', icon: Target, to: '/crm', permission: 'crm.view' },
    { label: 'Cobranza Legal', icon: Gavel, to: '/cobranza', permission: 'legal.view' },
    { label: 'Carteras', icon: Briefcase, to: '/carteras', permission: 'portfolios.view' },
    { label: 'Inventario', icon: Package, to: '/inventario', permission: 'inventory.view' },
    { label: 'Punto de Venta', icon: ShoppingCart, to: '/punto-venta', permission: 'pos.view' },
    { label: 'Compra/Venta', icon: Scale, to: '/compra-venta', permission: 'pawnshop.view' },
    { label: 'Solicitudes', icon: FileText, to: '/solicitudes', permission: 'requests.view' },
    { label: 'Acuerdos', icon: HandHeart, to: '/acuerdos', permission: 'agreements.view' },
    { label: 'Mapa', icon: MapPin, to: '/mapa', permission: 'routes.view' },
    { label: 'Reportes', icon: BarChart3, to: '/reportes', permission: 'reports.view' },
  ].filter(m => P.can(m.permission));

  const alerts = useMemo(() => {
    const out: Array<{ id: string; text: string; tone: 'danger' | 'warning'; to: string }> = [];
    const critical = pending.filter(p => p.kind === 'overdue' && (p.daysOverdue ?? 0) > 30).length;
    if (critical > 0) out.push({ id: 'crit', tone: 'danger', text: `${critical} préstamo${critical === 1 ? '' : 's'} con más de 30 días de atraso`, to: '/cobranza?tab=bandeja' });
    const brokenPromises = pending.filter(p => p.kind === 'promise' && p.severity === 'danger').length;
    if (brokenPromises > 0) out.push({ id: 'prom', tone: 'danger', text: `${brokenPromises} promesa${brokenPromises === 1 ? '' : 's'} de pago vencida${brokenPromises === 1 ? '' : 's'}`, to: '/cobranza' });
    const approvals = pending.filter(p => p.kind === 'legal_approval').length;
    if (approvals > 0) out.push({ id: 'appr', tone: 'warning', text: `${approvals} intimación${approvals === 1 ? '' : 'es'} esperando aprobación`, to: '/cobranza?tab=casos' });
    const noContact = pending.filter(p => p.kind === 'overdue' && p.rank === 0).length;
    if (noContact > 0) out.push({ id: 'nocon', tone: 'warning', text: `${noContact} cliente${noContact === 1 ? '' : 's'} en mora sin gestión reciente`, to: '/cobranza?tab=bandeja' });
    return out;
  }, [pending]);

  const collectedTodayVsYesterday = cashflow.yesterday.collected > 0
    ? ((cashflow.today.collected - cashflow.yesterday.collected) / cashflow.yesterday.collected) * 100
    : null;

  // -------------------------------------------------------------------------
  const DayTile = ({ icon: Icon, label, value, sub, tone, onClick }: {
    icon: any; label: string; value: string; sub?: React.ReactNode; tone: string; onClick?: () => void;
  }) => (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`text-left rounded-xl border border-slate-200 bg-white p-4 transition ${onClick ? 'hover:border-slate-300 hover:shadow-sm cursor-pointer' : 'cursor-default'}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${tone}`}><Icon className="h-4 w-4" /></span>
        <span className="text-xs font-medium text-slate-500">{label}</span>
      </div>
      <p className="text-2xl font-bold text-slate-900 leading-none">{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1.5">{sub}</p>}
    </button>
  );

  return (
    <div className="min-h-full bg-slate-50">
      {/* ---------- Encabezado ---------- */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-20">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-widest text-slate-400">Centro de operaciones</p>
              <h1 className="text-2xl sm:text-3xl font-bold mt-1">
                {greeting()}{firstName ? `, ${firstName}` : ''}
              </h1>
              <p className="text-sm text-slate-300 mt-1">
                {P.companyName && <span className="font-medium text-slate-200">{P.companyName} · </span>}
                {getCurrentDateInSantoDomingo().toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={P.refresh} disabled={P.refreshing}
                className="bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white">
                <RefreshCw className={`h-4 w-4 mr-2 ${P.refreshing ? 'animate-spin' : ''}`} />
                {P.refreshing ? 'Actualizando…' : 'Actualizar'}
              </Button>
              <Button size="sm" onClick={() => navigate('/dashboard')} className="bg-white text-slate-900 hover:bg-slate-100">
                <BarChart3 className="h-4 w-4 mr-2" /> Dashboard
              </Button>
            </div>
          </div>

          {/* Acciones rápidas */}
          <div className="flex flex-wrap gap-2 mt-5">
            {quickActions.map(a => (
              <button key={a.label} onClick={() => navigate(a.to)}
                className={`${a.className} text-white rounded-lg px-4 py-2.5 text-sm font-medium inline-flex items-center gap-2 transition shadow-sm`}>
                <a.icon className="h-4 w-4" /> {a.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-14 pb-10 space-y-5">
        {/* ---------- Resumen del día ---------- */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <DayTile
            icon={Wallet} label="Cobrado hoy" tone="bg-emerald-100 text-emerald-700"
            value={formatCurrency(cashflow.today.collected)}
            sub={
              collectedTodayVsYesterday === null
                ? `${cashflow.today.count} pago${cashflow.today.count === 1 ? '' : 's'}`
                : (
                  <span className={`inline-flex items-center gap-1 ${collectedTodayVsYesterday >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {collectedTodayVsYesterday >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {Math.abs(collectedTodayVsYesterday).toFixed(0)}% vs ayer
                  </span>
                )
            }
          />
          <DayTile
            icon={CalendarDays} label="Esperado hoy" tone="bg-blue-100 text-blue-700"
            value={formatCurrency(agenda.expectedToday)}
            sub={`${agenda.dueToday.length} cuota${agenda.dueToday.length === 1 ? '' : 's'} vence${agenda.dueToday.length === 1 ? '' : 'n'} hoy`}
            onClick={() => navigate('/cobro-rapido')}
          />
          <DayTile
            icon={AlertTriangle} label="En mora" tone="bg-red-100 text-red-700"
            value={String(portfolio.overdueLoans)}
            sub={formatCurrency(portfolio.overdueBalance)}
            onClick={() => navigate('/cobranza?tab=bandeja')}
          />
          <DayTile
            icon={ShieldCheck} label="Cartera al día" tone="bg-violet-100 text-violet-700"
            value={`${portfolio.healthPct.toFixed(0)}%`}
            sub={`${formatCurrency(portfolio.currentBalance)} de ${formatCurrency(portfolio.activeBalance)}`}
            onClick={() => navigate('/dashboard')}
          />
        </div>

        {/* ---------- Onboarding (solo si falta configurar) ---------- */}
        {!onboarding.complete && (
          <Card className="border-blue-200 bg-blue-50/50">
            <CardContent className="p-4">
              <p className="font-semibold text-slate-900 mb-3">Termina de configurar tu sistema</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  { done: onboarding.companyConfigured, title: 'Configura tu empresa', to: '/mi-empresa' },
                  { done: onboarding.hasClients, title: 'Registra tu primer cliente', to: '/clientes/nuevo' },
                  { done: onboarding.hasLoans, title: 'Otorga un préstamo', to: '/prestamos/nuevo' },
                ].map(s => (
                  <button key={s.title} onClick={() => navigate(s.to)}
                    className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2.5 text-left text-sm hover:border-blue-300 transition">
                    {s.done
                      ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                      : <span className="h-4 w-4 rounded-full border-2 border-slate-300 shrink-0" />}
                    <span className={s.done ? 'text-slate-500 line-through' : 'font-medium text-slate-800'}>{s.title}</span>
                    {!s.done && <ChevronRight className="h-4 w-4 ml-auto text-slate-400" />}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ---------- Alertas ---------- */}
        {alerts.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2">
            {alerts.map(a => (
              <button key={a.id} onClick={() => navigate(a.to)}
                className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm text-left transition hover:shadow-sm ${
                  a.tone === 'danger' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-800'
                }`}>
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span className="flex-1 font-medium">{a.text}</span>
                <ArrowRight className="h-4 w-4 shrink-0 opacity-60" />
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          {/* ---------- Pendientes ---------- */}
          <div className="xl:col-span-2 space-y-5">
            <Card>
              <div className="flex items-center justify-between px-5 py-4 border-b">
                <div>
                  <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                    <Activity className="h-4 w-4 text-slate-500" /> Tu día
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {pending.length === 0 ? 'Sin pendientes' : `${pending.length} pendiente${pending.length === 1 ? '' : 's'}, ordenados por urgencia`}
                  </p>
                </div>
                {pending.length > 0 && (
                  <Badge variant="outline" className="bg-slate-50">{pending.filter(p => p.severity === 'danger').length} urgentes</Badge>
                )}
              </div>
              <CardContent className="p-0">
                {P.loading && pending.length === 0 ? (
                  <div className="py-14 text-center text-slate-400 text-sm">
                    <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" /> Cargando tu día…
                  </div>
                ) : pending.length === 0 ? (
                  <div className="py-14 text-center">
                    <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-3" />
                    <p className="font-medium text-slate-800">Todo al día</p>
                    <p className="text-sm text-slate-500 mt-1">No hay cobros vencidos ni gestiones pendientes.</p>
                  </div>
                ) : (
                  <ul className="divide-y">
                    {visiblePending.map(item => {
                      const Icon = KIND_ICON[item.kind];
                      const style = SEVERITY_STYLE[item.severity];
                      return (
                        <li key={item.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition">
                          <span className={`w-1.5 h-9 rounded-full shrink-0 ${style.dot}`} />
                          <Icon className="h-4 w-4 text-slate-400 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-slate-900 truncate">{item.title}</p>
                            <p className="text-xs text-slate-500 truncate">{item.subtitle}</p>
                          </div>
                          {item.amount != null && item.amount > 0 && (
                            <span className="text-sm font-semibold text-slate-900 shrink-0 hidden sm:block">
                              {formatCurrency(item.amount)}
                            </span>
                          )}
                          <div className="flex gap-1 shrink-0">
                            {item.phone && (
                              <a href={`tel:${item.phone}`} title="Llamar">
                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0"><Phone className="h-3.5 w-3.5" /></Button>
                              </a>
                            )}
                            {item.loanId && (
                              <>
                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Registrar gestión"
                                  onClick={() => setTrackingFor({ loanId: item.loanId!, clientName: item.title })}>
                                  <MessageSquare className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-emerald-700" title="Registrar pago"
                                  onClick={() => navigate(`/prestamos?action=payment&loanId=${item.loanId}`)}>
                                  <DollarSign className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                            {!item.loanId && item.caseId && (
                              <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Ver expediente"
                                onClick={() => navigate(`/cobranza/casos/${item.caseId}`)}>
                                <ArrowUpRight className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {pending.length > 7 && (
                  <button onClick={() => setShowAllPending(v => !v)}
                    className="w-full py-2.5 text-sm text-slate-600 hover:bg-slate-50 border-t transition">
                    {showAllPending ? 'Mostrar menos' : `Ver los ${pending.length} pendientes`}
                  </button>
                )}
              </CardContent>
            </Card>

            {/* ---------- Próximos vencimientos ---------- */}
            <Card>
              <div className="flex items-center justify-between px-5 py-4 border-b">
                <div>
                  <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-slate-500" /> Próximos vencimientos
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Próximos 7 días · {formatCurrency(agenda.expectedWeek)} esperado
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => navigate('/prestamos')}>Ver todos <ChevronRight className="h-4 w-4" /></Button>
              </div>
              <CardContent className="p-0">
                {agenda.dueThisWeek.length === 0 && agenda.upcoming.length === 0 ? (
                  <p className="py-10 text-center text-sm text-slate-500">Sin vencimientos programados.</p>
                ) : (
                  <ul className="divide-y">
                    {[...agenda.dueThisWeek, ...agenda.upcoming].slice(0, 6).map(e => (
                      <li key={e.loan.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition">
                        <div className="w-11 shrink-0 text-center">
                          <p className="text-[10px] uppercase text-slate-400 leading-none">{monthAbbr(e.dueDate)}</p>
                          <p className="text-lg font-bold text-slate-800 leading-tight">{e.dueDate.split('-')[2]}</p>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-slate-900 truncate">{e.loan.client?.full_name || 'Cliente'}</p>
                          <p className="text-xs text-slate-500">{formatDateStringForSantoDomingo(e.dueDate)}</p>
                        </div>
                        <span className="text-sm font-semibold text-slate-900">{formatCurrency(e.amount)}</span>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-emerald-700" title="Registrar pago"
                          onClick={() => navigate(`/prestamos?action=payment&loanId=${e.loan.id}`)}>
                          <DollarSign className="h-3.5 w-3.5" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ---------- Columna lateral ---------- */}
          <div className="space-y-5">
            {/* Actividad reciente */}
            <Card>
              <div className="px-5 py-4 border-b">
                <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                  <Activity className="h-4 w-4 text-slate-500" /> Actividad reciente
                </h2>
              </div>
              <CardContent className="p-0 max-h-[22rem] overflow-y-auto">
                {activity.length === 0 ? (
                  <p className="py-10 text-center text-sm text-slate-500">Sin actividad todavía.</p>
                ) : (
                  <ul className="divide-y">
                    {activity.map(a => {
                      const Icon = ACTIVITY_ICON[a.kind];
                      return (
                        <li key={a.id} className="flex gap-3 px-4 py-3">
                          <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${ACTIVITY_STYLE[a.kind]}`}>
                            <Icon className="h-4 w-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-slate-800 truncate">{a.title}</p>
                            <p className="text-xs text-slate-400">
                              {relativeTime(a.at)}{a.subtitle ? ` · ${a.subtitle}` : ''}
                            </p>
                          </div>
                          {a.amount ? <span className="text-sm font-semibold text-slate-900 shrink-0">{formatCurrency(a.amount)}</span> : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Cartera en un vistazo */}
            <Card>
              <div className="px-5 py-4 border-b">
                <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-slate-500" /> Cartera en un vistazo
                </h2>
              </div>
              <CardContent className="p-5 space-y-3 text-sm">
                {[
                  { label: 'Préstamos activos', value: String(portfolio.activeLoans) },
                  { label: 'Saldo por cobrar', value: formatCurrency(portfolio.activeBalance) },
                  { label: 'Mora acumulada', value: formatCurrency(portfolio.lateFeeTotal), cls: portfolio.lateFeeTotal > 0 ? 'text-red-600' : '' },
                  { label: 'Clientes con préstamo', value: `${clientStats.withLoan} de ${clientStats.total}` },
                  { label: 'Cobrado este mes', value: formatCurrency(cashflow.month.collected), cls: 'text-emerald-700' },
                ].map(r => (
                  <div key={r.label} className="flex items-center justify-between">
                    <span className="text-slate-500">{r.label}</span>
                    <span className={`font-semibold ${r.cls || 'text-slate-900'}`}>{r.value}</span>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="w-full mt-2" onClick={() => navigate('/dashboard')}>
                  Ver análisis completo <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </CardContent>
            </Card>

            {/* Accesos a módulos */}
            {modules.length > 0 && (
              <Card>
                <div className="px-5 py-4 border-b">
                  <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-slate-500" /> Módulos
                  </h2>
                </div>
                <CardContent className="p-3">
                  <div className="grid grid-cols-3 gap-1.5">
                    {modules.map(m => (
                      <button key={m.to} onClick={() => navigate(m.to)}
                        className="flex flex-col items-center gap-1.5 rounded-lg px-2 py-3 text-center hover:bg-slate-100 transition">
                        <m.icon className="h-5 w-5 text-slate-600" />
                        <span className="text-[11px] leading-tight text-slate-600">{m.label}</span>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {P.lastUpdated && (
          <p className="text-center text-xs text-slate-400">
            Actualizado {P.lastUpdated.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>

      {trackingFor && (
        <CollectionTracking
          loanId={trackingFor.loanId} clientName={trackingFor.clientName} isOpen={!!trackingFor}
          onClose={() => { setTrackingFor(null); P.refresh(); }}
        />
      )}
    </div>
  );
};

export default HomeModule;
