// ============================================================================
// La barra de FILTROS
// ============================================================================
// Arriba, el período (lo que más se cambia) y la comparación. Debajo, solo los filtros que ese
// reporte entiende: una pantalla no debe ofrecer "método de pago" en un reporte de inventario.

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarDays, Filter, RotateCcw, Search, X } from 'lucide-react';
import {
  PERIOD_PRESETS, describePeriod, previousPeriod, resolvePreset, validatePeriod,
  type PeriodPresetId,
} from '@/utils/reports/reportPeriods';
import { activeFilterKeys } from '@/utils/reports/reportFilters';
import type { ReportFilterKey, ReportFilters } from '@/utils/reports/reportTypes';

export interface FilterOption { value: string; label: string }

export interface ReportFiltersBarProps {
  filters: ReportFilters;
  onChange: (filters: ReportFilters) => void;
  /** Qué filtros específicos enseñar */
  available: ReportFilterKey[];
  todayIso: string;
  options: {
    clients?: FilterOption[];
    users?: FilterOption[];
    cities?: FilterOption[];
    neighborhoods?: FilterOption[];
    categories?: FilterOption[];
    statuses?: FilterOption[];
    paymentMethods?: FilterOption[];
    loanTypes?: FilterOption[];
    frequencies?: FilterOption[];
  };
  /** Ocultar el selector de período (reportes que son "a hoy") */
  hidePeriod?: boolean;
}

const TODOS = '__all__';

export const ReportFiltersBar: React.FC<ReportFiltersBarProps> = ({
  filters, onChange, available, todayIso, options, hidePeriod,
}) => {
  const set = (patch: Partial<ReportFilters>) => onChange({ ...filters, ...patch });

  const aplicarPreset = (id: PeriodPresetId) => {
    if (id === 'custom') { set({ preset: 'custom' }); return; }
    const periodo = resolvePreset(id, todayIso);
    if (periodo) set({ ...periodo, preset: id });
  };

  const problema = validatePeriod({ startDate: filters.startDate, endDate: filters.endDate }, todayIso);
  const activos = activeFilterKeys(filters);
  const anterior = previousPeriod({ startDate: filters.startDate, endDate: filters.endDate });

  const limpiar = () => onChange({
    startDate: filters.startDate, endDate: filters.endDate, preset: filters.preset, compare: filters.compare,
  });

  const selector = (
    key: ReportFilterKey, label: string, items: FilterOption[] | undefined,
  ) => {
    if (!available.includes(key) || !items || items.length === 0) return null;
    const value = String((filters as unknown as Record<string, unknown>)[key] ?? '') || TODOS;
    return (
      <div key={key} className="min-w-[160px] flex-1">
        <label className="text-xs font-medium text-gray-500">{label}</label>
        <Select
          value={value}
          onValueChange={v => set({ [key]: v === TODOS ? undefined : v } as Partial<ReportFilters>)}
        >
          <SelectTrigger className="h-9"><SelectValue placeholder={`Todos`} /></SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value={TODOS}>Todos</SelectItem>
            {items.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    );
  };

  return (
    <div className="rounded-xl border bg-white p-4 space-y-4 print:hidden">
      {!hidePeriod && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <CalendarDays className="h-4 w-4 text-gray-400" />
            {PERIOD_PRESETS.map(p => (
              <Button
                key={p.id}
                size="sm"
                variant={filters.preset === p.id ? 'default' : 'outline'}
                className="h-8"
                onClick={() => aplicarPreset(p.id)}
              >
                {p.label}
              </Button>
            ))}
            <Button
              size="sm"
              variant={filters.compare ? 'default' : 'outline'}
              className="h-8 ml-auto"
              onClick={() => set({ compare: !filters.compare })}
              title={`Comparar con ${describePeriod(anterior)}`}
            >
              Comparar período
            </Button>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500">Desde</label>
              <Input
                type="date" className="h-9 w-[160px]" value={filters.startDate}
                onChange={e => set({ startDate: e.target.value, preset: 'custom' })}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500">Hasta</label>
              <Input
                type="date" className="h-9 w-[160px]" value={filters.endDate}
                onChange={e => set({ endDate: e.target.value, preset: 'custom' })}
              />
            </div>
            <div className="text-sm text-gray-600 pb-2">
              {describePeriod({ startDate: filters.startDate, endDate: filters.endDate })}
              {filters.compare && (
                <span className="text-gray-400"> · comparado con {describePeriod(anterior)}</span>
              )}
            </div>
          </div>

          {problema && (
            <div className={`text-sm rounded-lg px-3 py-2 ${problema.blocking ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}>
              {problema.message}
            </div>
          )}
        </div>
      )}

      {(available.length > 0) && (
        <div className="border-t pt-3">
          <div className="flex flex-wrap items-end gap-3">
            {available.includes('search') && (
              <div className="min-w-[200px] flex-1">
                <label className="text-xs font-medium text-gray-500">Buscar en el reporte</label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
                  <Input
                    className="h-9 pl-8" placeholder="Nombre, cédula, descripción…"
                    value={filters.search || ''}
                    onChange={e => set({ search: e.target.value })}
                  />
                </div>
              </div>
            )}
            {selector('clientId', 'Cliente', options.clients)}
            {selector('userId', 'Usuario', options.users)}
            {selector('status', 'Estado', options.statuses)}
            {selector('city', 'Ciudad', options.cities)}
            {selector('neighborhood', 'Sector', options.neighborhoods)}
            {selector('paymentMethod', 'Método de pago', options.paymentMethods)}
            {selector('loanType', 'Tipo de préstamo', options.loanTypes)}
            {selector('frequency', 'Frecuencia', options.frequencies)}
            {selector('category', 'Categoría', options.categories)}

            {(available.includes('minAmount') || available.includes('maxAmount')) && (
              <div className="flex items-end gap-2">
                <div>
                  <label className="text-xs font-medium text-gray-500">Monto desde</label>
                  <Input
                    type="number" className="h-9 w-[120px]" placeholder="0.00"
                    value={filters.minAmount ?? ''}
                    onChange={e => set({ minAmount: e.target.value === '' ? null : Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Hasta</label>
                  <Input
                    type="number" className="h-9 w-[120px]" placeholder="Sin límite"
                    value={filters.maxAmount ?? ''}
                    onChange={e => set({ maxAmount: e.target.value === '' ? null : Number(e.target.value) })}
                  />
                </div>
              </div>
            )}
          </div>

          {activos.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <Filter className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-xs text-gray-500">{activos.length} filtro(s) activo(s)</span>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={limpiar}>
                <X className="h-3 w-3 mr-1" /> Limpiar filtros
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/** Chip con el período y los filtros puestos, para la cabecera del reporte. */
export const ActiveFiltersSummary: React.FC<{ lines: string[]; onClear?: () => void }> = ({ lines, onClear }) => (
  <div className="flex flex-wrap items-center gap-2">
    {lines.map(l => <Badge key={l} variant="outline" className="font-normal">{l}</Badge>)}
    {onClear && lines.length > 1 && (
      <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={onClear}>
        <RotateCcw className="h-3 w-3 mr-1" /> Quitar filtros
      </Button>
    )}
  </div>
);
