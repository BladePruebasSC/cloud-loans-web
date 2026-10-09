// ============================================================================
// Los GRÁFICOS del reporte
// ============================================================================
// Se dibuja lo que el reporte declaró en su `ReportChartSpec`, con los datos YA filtrados: si el
// usuario cambia un filtro, el gráfico cambia con la tabla.
//
// Un gráfico solo aparece cuando aporta algo. Con una sola fila no se dibuja nada: una barra
// sola no dice más que el número.

import React from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatMoney, formatNumber } from '@/utils/reports/reportFormat';
import type { ReportChartSpec, ReportRow } from '@/utils/reports/reportTypes';

/** Paleta estable: el mismo concepto sale del mismo color en todos los reportes. */
const COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#7c3aed', '#0891b2', '#db2777', '#65a30d'];

const shortLabel = (v: unknown): string => {
  const s = String(v ?? '');
  return s.length > 18 ? `${s.slice(0, 17)}…` : s;
};

interface Props {
  spec: ReportChartSpec;
  rows: ReportRow[];
}

export const ReportChart: React.FC<Props> = ({ spec, rows }) => {
  if (!rows || rows.length < 2) return null;

  // En un gráfico circular, cien porciones no se leen: se dejan las ocho mayores y el resto se
  // agrupa en "Otros", sin perder el total.
  const data = spec.kind === 'pie'
    ? (() => {
      const key = spec.series[0].key;
      const ordenado = [...rows].sort((a, b) => (Number(b[key]) || 0) - (Number(a[key]) || 0));
      if (ordenado.length <= 8) return ordenado;
      const top = ordenado.slice(0, 7);
      const resto = ordenado.slice(7).reduce((s, r) => s + (Number(r[key]) || 0), 0);
      return [...top, { [spec.xKey]: 'Otros', [key]: Math.round(resto * 100) / 100 } as ReportRow];
    })()
    : rows;

  const fmt = (v: unknown) => (spec.money ? formatMoney(v) : formatNumber(v));
  const tickFmt = (v: number) => (spec.money
    ? `RD$${(v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}`
    : formatNumber(v));

  const tooltip = (
    <Tooltip
      formatter={(value: number, name: string) => [fmt(value), name]}
      labelFormatter={(l: string) => String(l)}
      contentStyle={{ fontSize: 12, borderRadius: 8 }}
    />
  );

  const render = () => {
    switch (spec.kind) {
      case 'pie':
        return (
          <PieChart>
            <Pie
              data={data} dataKey={spec.series[0].key} nameKey={spec.xKey}
              cx="50%" cy="50%" outerRadius={95} label={(e: any) => shortLabel(e[spec.xKey])}
            >
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            {tooltip}
          </PieChart>
        );
      case 'line':
        return (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
            <XAxis dataKey={spec.xKey} tick={{ fontSize: 11 }} tickFormatter={shortLabel} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={tickFmt} />
            {tooltip}
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {spec.series.map((s, i) => (
              <Line key={s.key} type="monotone" dataKey={s.key} name={s.label}
                stroke={s.color || COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        );
      case 'area':
        return (
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
            <XAxis dataKey={spec.xKey} tick={{ fontSize: 11 }} tickFormatter={shortLabel} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={tickFmt} />
            {tooltip}
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {spec.series.map((s, i) => (
              <Area key={s.key} type="monotone" dataKey={s.key} name={s.label}
                stroke={s.color || COLORS[i % COLORS.length]}
                fill={s.color || COLORS[i % COLORS.length]} fillOpacity={0.18} />
            ))}
          </AreaChart>
        );
      default:
        return (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
            <XAxis dataKey={spec.xKey} tick={{ fontSize: 11 }} tickFormatter={shortLabel} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={tickFmt} />
            {tooltip}
            {spec.series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
            {spec.series.map((s, i) => (
              <Bar key={s.key} dataKey={s.key} name={s.label}
                fill={s.color || COLORS[i % COLORS.length]}
                stackId={spec.kind === 'stacked-bar' ? 'a' : undefined}
                radius={[3, 3, 0, 0]} />
            ))}
          </BarChart>
        );
    }
  };

  return (
    <Card className="print:hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-gray-700">{spec.title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div style={{ width: '100%', height: 260 }}>
          <ResponsiveContainer>{render()}</ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};
