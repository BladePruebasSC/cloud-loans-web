import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, Cell,
  AreaChart, Area, PieChart, Pie, LineChart, Line,
} from 'recharts';
import { usePortfolioData } from '@/hooks/usePortfolioData';
import { formatCurrency } from '@/lib/utils';
import { formatDateStringForSantoDomingo } from '@/utils/dateUtils';
import {
  AGING_BUCKETS, AGING_COLOR, AGING_LABEL, loanDaysOverdue, type AgingBucket,
} from '@/utils/portfolioMetrics';
import {
  RefreshCw, TrendingUp, TrendingDown, Wallet, CreditCard, AlertTriangle, Users, PiggyBank,
  ArrowLeft, Percent, Target, ShieldCheck, Download, Activity,
} from 'lucide-react';

const compact = (v: number) =>
  Math.abs(v) >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M`
    : Math.abs(v) >= 1_000 ? `${Math.round(v / 1_000)}k`
    : String(Math.round(v));

const TYPE_LABEL: Record<string, string> = {
  simple: 'Simple', french: 'Francés', german: 'Alemán', american: 'Americano', indefinite: 'Indefinido',
};
const FREQ_LABEL: Record<string, string> = {
  daily: 'Diario', weekly: 'Semanal', biweekly: 'Quincenal', monthly: 'Mensual', quarterly: 'Trimestral', yearly: 'Anual',
};
const PALETTE = ['#2563eb', '#16a34a', '#f59e0b', '#7c3aed', '#dc2626', '#0891b2'];

export const AnalyticsDashboard: React.FC = () => {
  const navigate = useNavigate();
  const P = usePortfolioData();
  const { portfolio, cashflow, recovery, series6, series12, riskLoans, clientStats, loans, todayIso } = P;
  const [tab, setTab] = useState('resumen');
  const [range, setRange] = useState<6 | 12>(6);
  const series = range === 6 ? series6 : series12;

  // ------------------------------ distribuciones ------------------------------
  const agingData = useMemo(
    () => AGING_BUCKETS.map(b => ({
      key: b, name: AGING_LABEL[b], value: portfolio.buckets[b].balance,
      count: portfolio.buckets[b].count, fill: AGING_COLOR[b],
    })),
    [portfolio]
  );

  const byType = useMemo(() => {
    const m = new Map<string, { count: number; balance: number }>();
    for (const l of loans) {
      if (l.status !== 'active' && l.status !== 'overdue') continue;
      const k = String(l.amortization_type || 'simple').toLowerCase();
      const e = m.get(k) || { count: 0, balance: 0 };
      e.count++; e.balance += Number(l.remaining_balance) || 0;
      m.set(k, e);
    }
    return Array.from(m.entries()).map(([k, v], i) => ({
      name: TYPE_LABEL[k] || k, value: Math.round(v.balance), count: v.count, fill: PALETTE[i % PALETTE.length],
    })).sort((a, b) => b.value - a.value);
  }, [loans]);

  const byFreq = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of loans) {
      if (l.status !== 'active' && l.status !== 'overdue') continue;
      const k = String(l.payment_frequency || 'monthly').toLowerCase();
      m.set(k, (m.get(k) || 0) + 1);
    }
    return Array.from(m.entries()).map(([k, v], i) => ({
      name: FREQ_LABEL[k] || k, value: v, fill: PALETTE[i % PALETTE.length],
    })).sort((a, b) => b.value - a.value);
  }, [loans]);

  const topClients = useMemo(() => {
    const m = new Map<string, { name: string; balance: number; loans: number; overdue: number }>();
    for (const l of loans) {
      if (l.status !== 'active' && l.status !== 'overdue') continue;
      const key = l.client_id;
      const e = m.get(key) || { name: l.client?.full_name || 'Cliente', balance: 0, loans: 0, overdue: 0 };
      e.balance += Number(l.remaining_balance) || 0;
      e.loans++;
      if (loanDaysOverdue(l, todayIso) > 0) e.overdue++;
      m.set(key, e);
    }
    return Array.from(m.entries()).map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.balance - a.balance).slice(0, 8);
  }, [loans, todayIso]);

  const exportCsv = () => {
    const rows = [
      ['Métrica', 'Valor'],
      ['Capital colocado (histórico)', recovery.capitalLent],
      ['Capital recuperado', recovery.capitalRecovered],
      ['% recuperación de capital', recovery.recoveryPct],
      ['Interés cobrado', recovery.interestEarned],
      ['Mora cobrada', recovery.lateFeeEarned],
      ['Ingresos POS', recovery.posIncome],
      ['Ingreso total', recovery.totalIncome],
      ['Saldo activo', portfolio.activeBalance],
      ['Saldo al día', portfolio.currentBalance],
      ['Saldo en mora', portfolio.overdueBalance],
      ['% cartera al día', portfolio.healthPct],
      ['PAR-30', portfolio.par30],
      ['PAR-60', portfolio.par60],
      ['PAR-90', portfolio.par90],
      ['Préstamos activos', portfolio.activeLoans],
      ['Préstamos en mora', portfolio.overdueLoans],
      ['Mora acumulada por cobrar', portfolio.lateFeeTotal],
      [],
      ['Mes', 'Capital', 'Interés', 'Mora', 'POS', 'Cobrado', 'Ingreso', 'Colocado', 'Préstamos'],
      ...series12.map(s => [s.label, s.capital, s.interes, s.mora, s.pos, s.cobrado, s.ingreso, s.colocado, s.prestamos]),
    ];
    const csv = '﻿' + rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url; a.download = `dashboard_${todayIso}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // ------------------------------ UI helpers ------------------------------
  const Kpi = ({ icon: Icon, label, value, sub, tone, trend }: {
    icon: any; label: string; value: string; sub?: string; tone: string; trend?: number | null;
  }) => (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <span className={`w-9 h-9 rounded-lg flex items-center justify-center ${tone}`}><Icon className="h-4 w-4" /></span>
          {trend != null && (
            <span className={`inline-flex items-center gap-1 text-xs font-medium ${trend >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {trend >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {Math.abs(trend).toFixed(0)}%
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 mt-3">{label}</p>
        <p className="text-2xl font-bold text-slate-900 leading-tight mt-0.5">{value}</p>
        {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );

  const Panel = ({ title, subtitle, children, action }: {
    title: string; subtitle?: string; children: React.ReactNode; action?: React.ReactNode;
  }) => (
    <Card>
      <div className="flex items-start justify-between px-5 py-4 border-b">
        <div>
          <h3 className="font-semibold text-slate-900">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      <CardContent className="p-5">{children}</CardContent>
    </Card>
  );

  const money = (v: number) => formatCurrency(v);

  return (
    <div className="min-h-full bg-slate-50">
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 space-y-5">
        {/* Encabezado */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <button onClick={() => navigate('/')} className="text-xs text-slate-500 hover:text-slate-800 inline-flex items-center gap-1 mb-1">
              <ArrowLeft className="h-3 w-3" /> Volver a Inicio
            </button>
            <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
            <p className="text-sm text-slate-500">
              Análisis de cartera, cobranza y rendimiento{P.companyName ? ` · ${P.companyName}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border bg-white p-0.5">
              {[6, 12].map(n => (
                <button key={n} onClick={() => setRange(n as 6 | 12)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${range === n ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                  {n} meses
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={exportCsv}><Download className="h-4 w-4 mr-1" /> CSV</Button>
            <Button variant="outline" size="sm" onClick={P.refresh} disabled={P.refreshing}>
              <RefreshCw className={`h-4 w-4 ${P.refreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi icon={CreditCard} label="Cartera activa" tone="bg-blue-100 text-blue-700"
            value={money(portfolio.activeBalance)} sub={`${portfolio.activeLoans} préstamos · ticket ${money(portfolio.avgTicket)}`} />
          <Kpi icon={PiggyBank} label="Ingresos del mes" tone="bg-emerald-100 text-emerald-700"
            value={money(cashflow.month.income)} trend={cashflow.incomeMoMPct}
            sub={`Interés ${money(cashflow.month.interest)} · POS ${money(cashflow.month.pos)}`} />
          <Kpi icon={AlertTriangle} label="Cartera en riesgo (PAR-30)" tone="bg-red-100 text-red-700"
            value={`${portfolio.par30.toFixed(1)}%`} sub={`${money(portfolio.overdueBalance)} en mora · ${portfolio.overdueLoans} préstamos`} />
          <Kpi icon={ShieldCheck} label="Cartera al día" tone="bg-violet-100 text-violet-700"
            value={`${portfolio.healthPct.toFixed(1)}%`} sub={`${money(portfolio.currentBalance)} sin atraso`} />
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex flex-wrap h-auto">
            <TabsTrigger value="resumen">Resumen financiero</TabsTrigger>
            <TabsTrigger value="cartera">Cartera</TabsTrigger>
            <TabsTrigger value="cobranza">Cobranza y morosidad</TabsTrigger>
            <TabsTrigger value="clientes">Clientes</TabsTrigger>
          </TabsList>

          {/* ---------------- RESUMEN FINANCIERO ---------------- */}
          <TabsContent value="resumen" className="space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <Panel title="Cobros por mes" subtitle="Capital recuperado, interés y mora efectivamente recibidos"
                action={<Badge variant="outline" className="bg-slate-50">{range} meses</Badge>}>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={compact} />
                    <Tooltip formatter={(v: number, n) => [money(v), n]} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="capital" name="Capital" stackId="a" fill="#2563eb" />
                    <Bar dataKey="interes" name="Interés" stackId="a" fill="#16a34a" />
                    <Bar dataKey="mora" name="Mora" stackId="a" fill="#dc2626" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Panel>

              <Panel title="Rentabilidad" subtitle="Origen del ingreso del negocio">
                <div className="space-y-4">
                  {[
                    { label: 'Interés cobrado', value: recovery.interestEarned, color: 'bg-green-500' },
                    { label: 'Mora cobrada', value: recovery.lateFeeEarned, color: 'bg-red-500' },
                    { label: 'Ventas POS', value: recovery.posIncome, color: 'bg-amber-500' },
                  ].map(r => {
                    const p = recovery.totalIncome > 0 ? (r.value / recovery.totalIncome) * 100 : 0;
                    return (
                      <div key={r.label}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-slate-600">{r.label}</span>
                          <span className="font-semibold text-slate-900">{money(r.value)}</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                          <div className={`h-full ${r.color} rounded-full`} style={{ width: `${p}%` }} />
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5">{p.toFixed(1)}% del ingreso</p>
                      </div>
                    );
                  })}
                  <div className="pt-3 border-t space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-slate-500">Ingreso total</span><span className="font-bold text-slate-900">{money(recovery.totalIncome)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Rendimiento sobre capital</span><span className="font-semibold text-emerald-700">{recovery.yieldPct.toFixed(1)}%</span></div>
                  </div>
                </div>
              </Panel>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <Panel title="Colocación vs. recuperación" subtitle="Capital prestado frente a capital cobrado, por mes">
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={series}>
                    <defs>
                      <linearGradient id="gColoc" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.3} /><stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gRec" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} /><stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={compact} />
                    <Tooltip formatter={(v: number, n) => [money(v), n]} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area type="monotone" dataKey="colocado" name="Colocado" stroke="#7c3aed" fill="url(#gColoc)" strokeWidth={2} />
                    <Area type="monotone" dataKey="capital" name="Capital recuperado" stroke="#2563eb" fill="url(#gRec)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </Panel>

              <Panel title="Recuperación de capital" subtitle="Sobre el total histórico colocado">
                <div className="flex flex-col items-center justify-center h-[260px]">
                  <div className="relative w-44 h-44">
                    <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                      <circle cx="50" cy="50" r="42" fill="none" stroke="#e2e8f0" strokeWidth="12" />
                      <circle cx="50" cy="50" r="42" fill="none" stroke="#2563eb" strokeWidth="12" strokeLinecap="round"
                        strokeDasharray={`${(recovery.recoveryPct / 100) * 264} 264`} />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-3xl font-bold text-slate-900">{recovery.recoveryPct.toFixed(1)}%</span>
                      <span className="text-xs text-slate-500">recuperado</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-6 mt-5 text-center text-sm">
                    <div><p className="text-slate-500 text-xs">Colocado</p><p className="font-bold text-slate-900">{money(recovery.capitalLent)}</p></div>
                    <div><p className="text-slate-500 text-xs">Recuperado</p><p className="font-bold text-blue-700">{money(recovery.capitalRecovered)}</p></div>
                  </div>
                </div>
              </Panel>
            </div>

            <Panel title="Comparativo mensual" subtitle="Cobros y actividad de los últimos meses">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs uppercase text-slate-500 border-b">
                    <tr>
                      <th className="text-left py-2">Mes</th><th className="text-right py-2">Capital</th>
                      <th className="text-right py-2">Interés</th><th className="text-right py-2">Mora</th>
                      <th className="text-right py-2">POS</th><th className="text-right py-2">Cobrado</th>
                      <th className="text-right py-2">Ingreso</th><th className="text-right py-2">Colocado</th>
                      <th className="text-right py-2">Préstamos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...series].reverse().map(s => (
                      <tr key={s.key} className="border-b last:border-0 hover:bg-slate-50">
                        <td className="py-2 font-medium capitalize">{s.label}</td>
                        <td className="py-2 text-right">{money(s.capital)}</td>
                        <td className="py-2 text-right text-green-700">{money(s.interes)}</td>
                        <td className="py-2 text-right text-red-600">{money(s.mora)}</td>
                        <td className="py-2 text-right">{money(s.pos)}</td>
                        <td className="py-2 text-right font-semibold">{money(s.cobrado)}</td>
                        <td className="py-2 text-right font-semibold text-emerald-700">{money(s.ingreso)}</td>
                        <td className="py-2 text-right text-violet-700">{money(s.colocado)}</td>
                        <td className="py-2 text-right">{s.prestamos}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </TabsContent>

          {/* ---------------- CARTERA ---------------- */}
          <TabsContent value="cartera" className="space-y-5">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Kpi icon={Wallet} label="Capital colocado" tone="bg-violet-100 text-violet-700" value={money(recovery.capitalLent)} sub={`${portfolio.totalLoans} préstamos en total`} />
              <Kpi icon={CreditCard} label="Saldo por cobrar" tone="bg-blue-100 text-blue-700" value={money(portfolio.activeBalance)} sub={`${portfolio.activeLoans} activos`} />
              <Kpi icon={Target} label="Préstamos pagados" tone="bg-emerald-100 text-emerald-700" value={String(portfolio.paidLoans)} sub={`${portfolio.pendingLoans} pendientes de iniciar`} />
              <Kpi icon={Percent} label="Ticket promedio" tone="bg-amber-100 text-amber-700" value={money(portfolio.avgTicket)} sub="Saldo medio por préstamo activo" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <Panel title="Composición por tipo de amortización" subtitle="Saldo activo por producto">
                {byType.length === 0 ? <p className="text-sm text-slate-500 py-10 text-center">Sin préstamos activos</p> : (
                  <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                      <Pie data={byType} dataKey="value" nameKey="name" innerRadius={60} outerRadius={100} paddingAngle={3}
                        label={(e: any) => `${e.name} (${e.count})`}>
                        {byType.map((d, i) => <Cell key={i} fill={d.fill} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => money(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </Panel>

              <Panel title="Préstamos por frecuencia de pago" subtitle="Cantidad de préstamos activos">
                {byFreq.length === 0 ? <p className="text-sm text-slate-500 py-10 text-center">Sin préstamos activos</p> : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={byFreq} layout="vertical" margin={{ left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip />
                      <Bar dataKey="value" name="Préstamos" radius={[0, 4, 4, 0]}>
                        {byFreq.map((d, i) => <Cell key={i} fill={d.fill} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </Panel>
            </div>

            <Panel title="Clientes con mayor exposición" subtitle="Saldo concentrado por cliente">
              {topClients.length === 0 ? <p className="text-sm text-slate-500 py-8 text-center">Sin datos</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase text-slate-500 border-b">
                      <tr><th className="text-left py-2">Cliente</th><th className="text-right py-2">Préstamos</th>
                        <th className="text-right py-2">En mora</th><th className="text-right py-2">Saldo</th>
                        <th className="text-right py-2">% de cartera</th></tr>
                    </thead>
                    <tbody>
                      {topClients.map(c => (
                        <tr key={c.id} className="border-b last:border-0 hover:bg-slate-50 cursor-pointer"
                          onClick={() => navigate(`/crm?client=${c.id}`)}>
                          <td className="py-2 font-medium">{c.name}</td>
                          <td className="py-2 text-right">{c.loans}</td>
                          <td className={`py-2 text-right ${c.overdue > 0 ? 'text-red-600 font-semibold' : 'text-slate-400'}`}>{c.overdue || '—'}</td>
                          <td className="py-2 text-right font-semibold">{money(c.balance)}</td>
                          <td className="py-2 text-right text-slate-500">
                            {portfolio.activeBalance > 0 ? ((c.balance / portfolio.activeBalance) * 100).toFixed(1) : '0.0'}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </TabsContent>

          {/* ---------------- COBRANZA Y MOROSIDAD ---------------- */}
          <TabsContent value="cobranza" className="space-y-5">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Kpi icon={AlertTriangle} label="PAR-30" tone="bg-red-100 text-red-700" value={`${portfolio.par30.toFixed(1)}%`} sub="Saldo con +30 días de atraso" />
              <Kpi icon={AlertTriangle} label="PAR-60" tone="bg-red-100 text-red-700" value={`${portfolio.par60.toFixed(1)}%`} sub="Saldo con +60 días" />
              <Kpi icon={AlertTriangle} label="PAR-90" tone="bg-red-100 text-red-700" value={`${portfolio.par90.toFixed(1)}%`} sub="Saldo con +90 días" />
              <Kpi icon={Activity} label="Mora por cobrar" tone="bg-orange-100 text-orange-700" value={money(portfolio.lateFeeTotal)} sub={`Peor atraso: ${portfolio.maxDaysOverdue} días`} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <Panel title="Antigüedad de la cartera" subtitle="Saldo activo distribuido por días de atraso">
                <ResponsiveContainer width="100%" height={270}>
                  <BarChart data={agingData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={compact} />
                    <Tooltip formatter={(v: number, _n, p: any) => [`${money(v)} · ${p.payload.count} préstamos`, 'Saldo']} />
                    <Bar dataKey="value" name="Saldo" radius={[4, 4, 0, 0]}>
                      {agingData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-3">
                  {agingData.map(d => (
                    <div key={d.key} className="text-center">
                      <span className="inline-block w-2 h-2 rounded-full mb-1" style={{ background: d.fill }} />
                      <p className="text-[11px] text-slate-500">{d.name}</p>
                      <p className="text-sm font-semibold text-slate-900">{d.count}</p>
                    </div>
                  ))}
                </div>
              </Panel>

              <Panel title="Mora cobrada por mes" subtitle="Recargos efectivamente recuperados">
                <ResponsiveContainer width="100%" height={270}>
                  <LineChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={compact} />
                    <Tooltip formatter={(v: number) => money(v)} />
                    <Line type="monotone" dataKey="mora" name="Mora cobrada" stroke="#dc2626" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </Panel>
            </div>

            <Panel title="Préstamos de mayor riesgo" subtitle="Ordenados por días de atraso y saldo expuesto"
              action={<Button size="sm" variant="outline" onClick={() => navigate('/cobranza?tab=bandeja')}>Ir a cobranza</Button>}>
              {riskLoans.length === 0 ? (
                <p className="text-sm text-slate-500 py-8 text-center">No hay préstamos en mora 🎉</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase text-slate-500 border-b">
                      <tr><th className="text-left py-2">Cliente</th><th className="text-left py-2">Vencía</th>
                        <th className="text-right py-2">Días</th><th className="text-right py-2">Saldo</th>
                        <th className="text-right py-2">Mora</th><th></th></tr>
                    </thead>
                    <tbody>
                      {riskLoans.map(r => (
                        <tr key={r.loan.id} className="border-b last:border-0 hover:bg-slate-50">
                          <td className="py-2 font-medium">{r.loan.client?.full_name || 'Cliente'}</td>
                          <td className="py-2">{formatDateStringForSantoDomingo(r.dueDate)}</td>
                          <td className={`py-2 text-right font-semibold ${r.daysOverdue > 60 ? 'text-red-700' : r.daysOverdue > 30 ? 'text-red-600' : 'text-amber-600'}`}>{r.daysOverdue}</td>
                          <td className="py-2 text-right font-semibold">{money(r.amount)}</td>
                          <td className="py-2 text-right text-red-600">{money(Number(r.loan.current_late_fee) || 0)}</td>
                          <td className="py-2 text-right">
                            <Button size="sm" variant="ghost" className="h-8"
                              onClick={() => navigate(`/prestamos?action=payment&loanId=${r.loan.id}`)}>Cobrar</Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Panel>
          </TabsContent>

          {/* ---------------- CLIENTES ---------------- */}
          <TabsContent value="clientes" className="space-y-5">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Kpi icon={Users} label="Clientes" tone="bg-blue-100 text-blue-700" value={String(clientStats.total)} sub={`${clientStats.active} activos`} />
              <Kpi icon={CreditCard} label="Con préstamo vigente" tone="bg-emerald-100 text-emerald-700" value={String(clientStats.withLoan)}
                sub={clientStats.total > 0 ? `${((clientStats.withLoan / clientStats.total) * 100).toFixed(0)}% de la base` : '—'} />
              <Kpi icon={TrendingUp} label="Nuevos este mes" tone="bg-violet-100 text-violet-700" value={String(clientStats.newThisMonth)} sub="Clientes registrados" />
              <Kpi icon={Target} label="Préstamos por cliente" tone="bg-amber-100 text-amber-700"
                value={clientStats.withLoan > 0 ? (portfolio.activeLoans / clientStats.withLoan).toFixed(1) : '0'} sub="Promedio de préstamos activos" />
            </div>

            <Panel title="Análisis de clientes" subtitle="El CRM calcula la calificación de cada cliente (puntualidad, historial y volumen)"
              action={<Button size="sm" onClick={() => navigate('/crm')}>Abrir CRM</Button>}>
              <div className="grid gap-3 sm:grid-cols-3 text-sm">
                <div className="rounded-lg border p-4">
                  <p className="text-slate-500 text-xs mb-1">Concentración</p>
                  <p className="text-xl font-bold text-slate-900">
                    {portfolio.activeBalance > 0 && topClients.length > 0
                      ? `${((topClients.slice(0, 3).reduce((s, c) => s + c.balance, 0) / portfolio.activeBalance) * 100).toFixed(0)}%`
                      : '0%'}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">del saldo en los 3 mayores clientes</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-slate-500 text-xs mb-1">Clientes con mora</p>
                  <p className="text-xl font-bold text-red-600">{topClients.filter(c => c.overdue > 0).length}</p>
                  <p className="text-xs text-slate-500 mt-1">entre los de mayor exposición</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-slate-500 text-xs mb-1">Sin préstamo activo</p>
                  <p className="text-xl font-bold text-slate-900">{Math.max(0, clientStats.total - clientStats.withLoan)}</p>
                  <p className="text-xs text-slate-500 mt-1">oportunidades de recolocación</p>
                </div>
              </div>
            </Panel>
          </TabsContent>
        </Tabs>

        {P.lastUpdated && (
          <p className="text-center text-xs text-slate-400">
            Actualizado {P.lastUpdated.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}
            {' · '}Los importes provienen de pagos y préstamos registrados; no incluyen proyecciones.
          </p>
        )}
      </div>
    </div>
  );
};

export default AnalyticsDashboard;
