import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  Legend,
} from 'recharts';
import { Download, TrendingUp, Users, DollarSign, ShoppingCart, Scale } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { CATEGORY_META, type ClientCategory } from '@/utils/clientScoring';
import type { CRMClientRecord } from '@/hooks/useClientCRM';
import { CategoryBadge } from './ScoreBadge';

interface Props {
  records: CRMClientRecord[];
  onOpenClient: (clientId: string) => void;
}

const CATEGORY_COLORS: Record<ClientCategory, string> = {
  caliente: '#dc2626',
  tibio: '#d97706',
  frio: '#0284c7',
  nuevo: '#6b7280',
};

type SortKey = 'lifetimeValue' | 'totalBorrowed' | 'totalInterestPaid' | 'totalSales' | 'totalPawned' | 'score';

const shortName = (name: string, max = 18) => (name.length > max ? name.slice(0, max - 1) + '…' : name);

export const CRMStatistics: React.FC<Props> = ({ records, onOpenClient }) => {
  const [sortKey, setSortKey] = useState<SortKey>('lifetimeValue');

  const stats = useMemo(() => {
    const byCategory: Record<ClientCategory, { count: number; ltv: number; interest: number; balance: number }> = {
      caliente: { count: 0, ltv: 0, interest: 0, balance: 0 },
      tibio: { count: 0, ltv: 0, interest: 0, balance: 0 },
      frio: { count: 0, ltv: 0, interest: 0, balance: 0 },
      nuevo: { count: 0, ltv: 0, interest: 0, balance: 0 },
    };
    let totalLTV = 0;
    let totalInterest = 0;
    let totalSales = 0;
    let totalPawned = 0;
    let totalBorrowed = 0;
    for (const r of records) {
      const m = r.score.metrics;
      const c = byCategory[r.effectiveCategory];
      c.count++;
      c.ltv += m.lifetimeValue;
      c.interest += m.totalInterestPaid;
      c.balance += m.activeBalance;
      totalLTV += m.lifetimeValue;
      totalInterest += m.totalInterestPaid;
      totalSales += m.totalSales;
      totalPawned += m.totalPawned;
      totalBorrowed += m.totalBorrowed;
    }
    return { byCategory, totalLTV, totalInterest, totalSales, totalPawned, totalBorrowed };
  }, [records]);

  const pieData = (Object.keys(stats.byCategory) as ClientCategory[])
    .map(k => ({ name: CATEGORY_META[k].label, value: stats.byCategory[k].count, key: k }))
    .filter(d => d.value > 0);

  const categoryValueData = (Object.keys(stats.byCategory) as ClientCategory[]).map(k => ({
    name: CATEGORY_META[k].label,
    'Negocio generado': Math.round(stats.byCategory[k].ltv),
    'Intereses pagados': Math.round(stats.byCategory[k].interest),
    'Saldo activo': Math.round(stats.byCategory[k].balance),
    key: k,
  }));

  const topBy = (key: SortKey, n = 10) =>
    [...records]
      .filter(r => (key === 'score' ? true : r.score.metrics[key] > 0))
      .sort((a, b) => (key === 'score' ? b.score.score - a.score.score : b.score.metrics[key] - a.score.metrics[key]))
      .slice(0, n);

  const topLTV = topBy('lifetimeValue').map(r => ({
    name: shortName(r.client.full_name),
    value: Math.round(r.score.metrics.lifetimeValue),
    fill: CATEGORY_COLORS[r.effectiveCategory],
  }));
  const topInterest = topBy('totalInterestPaid').map(r => ({
    name: shortName(r.client.full_name),
    value: Math.round(r.score.metrics.totalInterestPaid),
    fill: CATEGORY_COLORS[r.effectiveCategory],
  }));

  const ranking = useMemo(
    () =>
      [...records].sort((a, b) =>
        sortKey === 'score' ? b.score.score - a.score.score : b.score.metrics[sortKey] - a.score.metrics[sortKey]
      ),
    [records, sortKey]
  );

  const exportCsv = () => {
    const header = [
      'Cliente', 'Cédula', 'Teléfono', 'Categoría', 'Score', 'Comportamiento', 'Riesgo',
      'Préstamos', 'Activos', 'Completados', 'Total prestado', 'Total pagado', 'Intereses pagados',
      'Saldo activo', 'Mora actual', 'Días atraso hoy', '% Puntualidad', 'Atraso prom. (días)',
      'Ventas POS', 'Empeños', 'Valor total negocio', 'Último pago',
    ];
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = ranking.map(r => {
      const m = r.score.metrics;
      return [
        r.client.full_name, r.client.dni, r.client.phone, CATEGORY_META[r.effectiveCategory].label, r.score.score,
        r.score.behavior, r.score.risk, m.totalLoans, m.activeLoans, m.completedLoans, m.totalBorrowed, m.totalPaid,
        m.totalInterestPaid, m.activeBalance, m.currentLateFee, m.currentMaxDaysOverdue,
        Math.round(m.onTimeRate * 100), m.avgDelayDaysWhenLate, m.totalSales, m.totalPawned, m.lifetimeValue,
        m.lastPaymentDate || '',
      ].map(esc).join(',');
    });
    const csv = '﻿' + [header.map(esc).join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `crm_clientes_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const KPI = ({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string; sub?: string }) => (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
          <Icon className="h-5 w-5 text-blue-600" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-gray-500">{label}</p>
          <p className="text-lg font-bold truncate">{value}</p>
          {sub && <p className="text-xs text-gray-500">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <KPI icon={Users} label="Clientes" value={String(records.length)} />
        <KPI icon={DollarSign} label="Total prestado" value={formatCurrency(stats.totalBorrowed)} />
        <KPI icon={TrendingUp} label="Intereses cobrados" value={formatCurrency(stats.totalInterest)} />
        <KPI icon={ShoppingCart} label="Ventas POS" value={formatCurrency(stats.totalSales)} />
        <KPI icon={Scale} label="Empeños" value={formatCurrency(stats.totalPawned)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Distribución de clientes por categoría</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-10">Sin datos</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={3} label={(e: any) => `${e.name}: ${e.value}`}>
                    {pieData.map(d => (
                      <Cell key={d.key} fill={CATEGORY_COLORS[d.key]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Valor por categoría</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={categoryValueData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Negocio generado" fill="#2563eb" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Intereses pagados" fill="#16a34a" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Saldo activo" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top 10 clientes por negocio generado</CardTitle>
            <p className="text-xs text-gray-500">Préstamos + ventas + empeños. Color según categoría.</p>
          </CardHeader>
          <CardContent>
            {topLTV.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-10">Sin datos</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(220, topLTV.length * 30)}>
                <BarChart data={topLTV} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="value" name="Negocio" radius={[0, 4, 4, 0]}>
                    {topLTV.map((d, i) => (
                      <Cell key={i} fill={d.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top 10 clientes por intereses pagados</CardTitle>
            <p className="text-xs text-gray-500">Los que más rentabilidad han dejado.</p>
          </CardHeader>
          <CardContent>
            {topInterest.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-10">Sin datos</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(220, topInterest.length * 30)}>
                <BarChart data={topInterest} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="value" name="Intereses" radius={[0, 4, 4, 0]}>
                    {topInterest.map((d, i) => (
                      <Cell key={i} fill={d.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Ranking de clientes</CardTitle>
            <p className="text-xs text-gray-500">Ventas y rentabilidad por cliente</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm"
              value={sortKey}
              onChange={e => setSortKey(e.target.value as SortKey)}
            >
              <option value="lifetimeValue">Ordenar: negocio total</option>
              <option value="totalInterestPaid">Ordenar: intereses pagados</option>
              <option value="totalBorrowed">Ordenar: total prestado</option>
              <option value="totalSales">Ordenar: ventas POS</option>
              <option value="totalPawned">Ordenar: empeños</option>
              <option value="score">Ordenar: score</option>
            </select>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download className="h-4 w-4 mr-1" /> CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2">#</th>
                <th className="text-left px-4 py-2">Cliente</th>
                <th className="text-left px-4 py-2">Categoría</th>
                <th className="text-right px-4 py-2">Score</th>
                <th className="text-right px-4 py-2">Préstamos</th>
                <th className="text-right px-4 py-2">Prestado</th>
                <th className="text-right px-4 py-2">Intereses</th>
                <th className="text-right px-4 py-2">Ventas</th>
                <th className="text-right px-4 py-2">Empeños</th>
                <th className="text-right px-4 py-2">Negocio total</th>
              </tr>
            </thead>
            <tbody>
              {ranking.slice(0, 50).map((r, i) => {
                const m = r.score.metrics;
                return (
                  <tr key={r.client.id} className="border-t hover:bg-blue-50/40 cursor-pointer" onClick={() => onOpenClient(r.client.id)}>
                    <td className="px-4 py-2 text-gray-500">{i + 1}</td>
                    <td className="px-4 py-2 font-medium">{r.client.full_name}</td>
                    <td className="px-4 py-2"><CategoryBadge category={r.effectiveCategory} manual={!!r.profile?.manual_category} /></td>
                    <td className="px-4 py-2 text-right font-semibold">{r.score.score}</td>
                    <td className="px-4 py-2 text-right">{m.totalLoans}</td>
                    <td className="px-4 py-2 text-right">{formatCurrency(m.totalBorrowed)}</td>
                    <td className="px-4 py-2 text-right text-green-700">{formatCurrency(m.totalInterestPaid)}</td>
                    <td className="px-4 py-2 text-right">{formatCurrency(m.totalSales)}</td>
                    <td className="px-4 py-2 text-right">{formatCurrency(m.totalPawned)}</td>
                    <td className="px-4 py-2 text-right font-semibold">{formatCurrency(m.lifetimeValue)}</td>
                  </tr>
                );
              })}
              {ranking.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-500">Sin clientes</td></tr>
              )}
            </tbody>
          </table>
          {ranking.length > 50 && (
            <p className="text-xs text-gray-500 px-4 py-2">Mostrando 50 de {ranking.length}. Exporta el CSV para ver todos.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
