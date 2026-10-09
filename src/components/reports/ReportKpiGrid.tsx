// ============================================================================
// Los INDICADORES (KPIs)
// ============================================================================
// Cada uno enseña el número, y cuando hay comparación, también el valor anterior y la variación
// EN TEXTO (+12.4%), no solo con un color: el color no se lee en una impresión en blanco y
// negro ni lo distingue todo el mundo.

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';
import { compareValues, describeVariation } from '@/utils/reports/reportPeriods';
import { formatCell } from '@/utils/reports/reportFormat';
import type { ColumnFormat } from '@/utils/reports/reportTypes';

export interface KpiItem {
  key: string;
  label: string;
  value: number;
  format?: ColumnFormat;
  hint?: string;
  previous?: number;
  linkTo?: string;
  asOfToday?: boolean;
}

interface Props {
  kpis: KpiItem[];
  compare?: boolean;
  onOpenReport?: (reportId: string) => void;
  /** Cuántas columnas como máximo (por defecto se adapta) */
  columns?: number;
}

export const ReportKpiGrid: React.FC<Props> = ({ kpis, compare, onOpenReport, columns }) => {
  if (!kpis || kpis.length === 0) return null;
  const cols = columns || Math.min(4, Math.max(2, kpis.length));

  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${cols > 3 ? 190 : 220}px, 1fr))` }}
    >
      {kpis.map(kpi => {
        const clickable = !!(kpi.linkTo && onOpenReport);
        const v = compare && typeof kpi.previous === 'number'
          ? compareValues(kpi.value, kpi.previous)
          : null;
        const Icon = v?.direction === 'up' ? ArrowUpRight : v?.direction === 'down' ? ArrowDownRight : ArrowRight;

        return (
          <Card
            key={kpi.key}
            className={`border ${clickable ? 'cursor-pointer transition hover:border-blue-300 hover:shadow-sm' : ''}`}
            onClick={clickable ? () => onOpenReport!(kpi.linkTo!) : undefined}
            role={clickable ? 'button' : undefined}
            tabIndex={clickable ? 0 : undefined}
            onKeyDown={clickable ? e => { if (e.key === 'Enter') onOpenReport!(kpi.linkTo!); } : undefined}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-gray-500">{kpi.label}</span>
                {kpi.asOfToday && <span className="text-[10px] text-gray-400 whitespace-nowrap">a hoy</span>}
              </div>
              <div className="mt-1 text-2xl font-bold text-gray-900">
                {formatCell(kpi.value, kpi.format || 'number')}
              </div>
              {v && (
                <div className="mt-1 flex items-center gap-1 text-xs text-gray-600">
                  <Icon className="h-3.5 w-3.5" />
                  <span className="font-semibold">{describeVariation(v)}</span>
                  <span className="text-gray-400">
                    · antes {formatCell(kpi.previous, kpi.format || 'number')}
                  </span>
                </div>
              )}
              {kpi.hint && <div className="mt-1 text-xs text-gray-500">{kpi.hint}</div>}
              {clickable && <div className="mt-2 text-xs font-medium text-blue-600">Ver detalle →</div>}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
