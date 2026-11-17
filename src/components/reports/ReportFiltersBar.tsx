// ============================================================================
// La barra de FILTROS
// ============================================================================
// CAMBIO SOLICITADO (2026-11-17): "los módulos se ven desorganizados y mucha información en
// pantalla; divídela bien, que sea entendible y fácil de usar".
//
// Antes se enseñaba TODO a la vez: nueve botones de período, las dos fechas, el texto del
// período, el buscador y hasta seis selectores, siempre abiertos. Entre el título del reporte y
// su primera cifra había cinco filas de controles que casi nunca se tocan.
//
// Ahora es UNA fila que dice en qué estado está —el período y cuántos filtros hay puestos— y dos
// paneles que se abren solo cuando se quieren cambiar. Lo que está puesto se ve siempre; lo que
// se usa de vez en cuando, cuando hace falta.

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarDays, ChevronDown, Filter, Search, X } from 'lucide-react';
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

/** Los períodos que se usan todos los días: el resto vive dentro del panel. */
const PRESETS_RAPIDOS: PeriodPresetId[] = ['today', 'month', 'all'];

export const ReportFiltersBar: React.FC<ReportFiltersBarProps> = ({
  filters, onChange, available, todayIso, options, hidePeriod,
}) => {
  const [abierto, setAbierto] = useState<'periodo' | 'filtros' | null>(null);
  const set = (patch: Partial<ReportFilters>) => onChange({ ...filters, ...patch });

  const aplicarPreset = (id: PeriodPresetId) => {
    if (id === 'custom') { set({ preset: 'custom' }); return; }
    const periodo = resolvePreset(id, todayIso);
    if (periodo) set({ ...periodo, preset: id });
  };

  const problema = validatePeriod({ startDate: filters.startDate, endDate: filters.endDate }, todayIso);
  const activos = activeFilterKeys(filters);
  const anterior = previousPeriod({ startDate: filters.startDate, endDate: filters.endDate });
  const textoPeriodo = describePeriod({ startDate: filters.startDate, endDate: filters.endDate });
  const tieneFiltros = available.filter(k => k !== 'minAmount' && k !== 'maxAmount').length > 0
    || available.includes('minAmount') || available.includes('maxAmount');

  const limpiar = () => {
    onChange({
      startDate: filters.startDate, endDate: filters.endDate, preset: filters.preset, compare: filters.compare,
    });
  };

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

  const chevron = (panel: 'periodo' | 'filtros') => (
    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${abierto === panel ? 'rotate-180' : ''}`} />
  );

  // Un reporte "a hoy" y sin filtros no tiene nada que ofrecer: la barra no se dibuja.
  if (hidePeriod && !tieneFiltros) return null;

  return (
    <div className="rounded-xl border bg-white print:hidden">
      {/* ── La fila que SIEMPRE se ve: en qué estado está el reporte ── */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        {!hidePeriod && (
          <>
            <Button
              size="sm" variant="outline" className="h-8 gap-1.5"
              onClick={() => setAbierto(abierto === 'periodo' ? null : 'periodo')}
            >
              <CalendarDays className="h-4 w-4 text-gray-500" />
              <span className="font-medium">{textoPeriodo}</span>
              {chevron('periodo')}
            </Button>
            {/* Los tres períodos de todos los días, a un clic. */}
            <div className="hidden sm:flex items-center gap-1">
              {PERIOD_PRESETS.filter(p => PRESETS_RAPIDOS.includes(p.id)).map(p => (
                <Button
                  key={p.id} size="sm" className="h-8 px-2.5 text-xs"
                  variant={filters.preset === p.id ? 'default' : 'ghost'}
                  onClick={() => aplicarPreset(p.id)}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </>
        )}

        {tieneFiltros && (
          <Button
            size="sm" variant={activos.length > 0 ? 'default' : 'outline'} className="h-8 gap-1.5"
            onClick={() => setAbierto(abierto === 'filtros' ? null : 'filtros')}
          >
            <Filter className="h-3.5 w-3.5" />
            Filtros
            {activos.length > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{activos.length}</Badge>
            )}
            {chevron('filtros')}
          </Button>
        )}

        {activos.length > 0 && (
          <Button size="sm" variant="ghost" className="h-8 text-xs text-gray-500" onClick={limpiar}>
            <X className="h-3 w-3 mr-1" /> Limpiar
          </Button>
        )}

        {!hidePeriod && (
          <Button
            size="sm" variant={filters.compare ? 'default' : 'ghost'}
            className="h-8 ml-auto text-xs"
            onClick={() => set({ compare: !filters.compare })}
            title={`Comparar con ${describePeriod(anterior)}`}
          >
            Comparar período
          </Button>
        )}
      </div>

      {problema && (
        <div className={`mx-3 mb-2 rounded-lg px-3 py-2 text-sm ${problema.blocking ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-800'}`}>
          {problema.message}
        </div>
      )}

      {/* ── Panel del PERÍODO ── */}
      {!hidePeriod && abierto === 'periodo' && (
        <div className="border-t px-3 py-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
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
            <div className="pb-2 text-sm text-gray-600">
              {textoPeriodo}
              {filters.compare && (
                <span className="text-gray-400"> · comparado con {describePeriod(anterior)}</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Panel de FILTROS ── */}
      {tieneFiltros && abierto === 'filtros' && (
        <div className="border-t px-3 py-3">
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
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
              <span className="text-xs text-gray-500">{activos.length} filtro(s) puesto(s)</span>
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
