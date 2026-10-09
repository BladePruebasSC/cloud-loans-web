// ============================================================================
// La VISTA de un reporte
// ============================================================================
// Filtros → indicadores → gráficos → tabla, y una barra con lo que se hace con el reporte:
// exportar (CSV, Excel, PDF), imprimir, guardar la configuración y marcarlo como favorito.
// Todo lo que sale por esas cuatro salidas es EXACTAMENTE lo que se está viendo.

import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import {
  AlertCircle, ArrowLeft, Download, FileSpreadsheet, FileText, Info, Loader2, Printer, Save, Star,
} from 'lucide-react';
import { ReportFiltersBar, type FilterOption } from './ReportFiltersBar';
import { ReportKpiGrid } from './ReportKpiGrid';
import { ReportChart } from './ReportChart';
import { ReportTable } from './ReportTable';
import type { ReportData } from '@/utils/reports/reportDataset';
import type { ReportDefinition, ReportFilters, ReportResult } from '@/utils/reports/reportTypes';
import { describeFilters, hasActiveFilters } from '@/utils/reports/reportFilters';
import { describePeriod } from '@/utils/reports/reportPeriods';
import {
  exportReportCsv, exportReportExcel, exportReportPdf, kpiText, printReport,
  type ReportOutputMeta,
} from '@/utils/reports/reportExport';
import { formatCell } from '@/utils/reports/reportFormat';
import type { SavedReportConfig } from '@/utils/reports/savedReports';

interface Props {
  report: ReportDefinition<ReportData>;
  data: ReportData | null;
  loading: boolean;
  loadingExtras: boolean;
  error: string | null;
  filters: ReportFilters;
  onFiltersChange: (f: ReportFilters) => void;
  onBack: () => void;
  onOpenReport: (reportId: string) => void;
  onOpenLoan?: (loanId: string) => void;
  companyName: string;
  userName: string;
  users: Array<{ id: string; name: string }>;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onSaveConfig: (name: string, config: SavedReportConfig) => void;
  canExport: boolean;
  /** Para la auditoría: se avisa de lo que se hace con el reporte */
  onAudit: (action: 'report_viewed' | 'report_exported' | 'report_printed', extra?: { format?: string; rows?: number }) => void;
}

const uniqueOptions = (values: Array<string | null | undefined>): FilterOption[] =>
  [...new Set(values.map(v => String(v || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'es'))
    .map(v => ({ value: v, label: v }));

export const ReportView: React.FC<Props> = ({
  report, data, loading, loadingExtras, error, filters, onFiltersChange, onBack, onOpenReport,
  onOpenLoan, companyName, userName, users, isFavorite, onToggleFavorite, onSaveConfig,
  canExport, onAudit,
}) => {
  const [hidden, setHidden] = useState<Set<string>>(
    () => new Set(report.columns.filter(c => c.hiddenByDefault).map(c => c.key)),
  );
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(report.defaultSort || null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [guardando, setGuardando] = useState(false);
  const [nombreGuardado, setNombreGuardado] = useState('');

  // Al cambiar de reporte se vuelve a su configuración por defecto.
  useEffect(() => {
    setHidden(new Set(report.columns.filter(c => c.hiddenByDefault).map(c => c.key)));
    setSort(report.defaultSort || null);
    setSelected(new Set());
  }, [report.id]);

  const resultado: ReportResult = useMemo(() => {
    if (!data) return { rows: [] };
    try {
      return report.build({ data, filters, todayIso: data.todayIso });
    } catch (e) {
      console.error('[reportes] fallo construyendo el reporte', report.id, e);
      return { rows: [], notes: [`No se pudo construir el reporte: ${(e as Error).message}`] };
    }
  }, [report, data, filters]);

  const filtrosTexto = useMemo(() => {
    const nombres: Record<string, string> = {};
    for (const u of users) nombres[u.id] = u.name;
    for (const c of data?.clients || []) nombres[c.id] = c.full_name;
    return describeFilters(filters, nombres);
  }, [filters, users, data?.clients]);

  useEffect(() => {
    if (!loading && data) onAudit('report_viewed', { rows: resultado.rows.length });
    // Solo cuando cambia el reporte o los filtros de verdad.
  }, [report.id, filtrosTexto.join('|'), loading, data !== null]);

  const opciones = useMemo(() => ({
    clients: (data?.clients || [])
      .map(c => ({ value: c.id, label: c.full_name }))
      .sort((a, b) => a.label.localeCompare(b.label, 'es')),
    users: users.map(u => ({ value: u.id, label: u.name })),
    cities: uniqueOptions((data?.clients || []).map(c => (c as any).city)),
    neighborhoods: uniqueOptions((data?.clients || []).map(c => (c as any).neighborhood)),
    categories: uniqueOptions([
      ...(data?.expenses?.rows || []).map(e => e.category),
      ...(data?.inventory?.products || []).map(p => p.category),
    ]),
    statuses: uniqueOptions((data?.loans || []).map(l => l.status)),
    paymentMethods: [
      { value: 'cash', label: 'Efectivo' }, { value: 'transfer', label: 'Transferencia' },
      { value: 'card', label: 'Tarjeta' }, { value: 'check', label: 'Cheque' },
    ],
    loanTypes: [
      { value: 'simple', label: 'Simple' }, { value: 'german', label: 'Alemán' },
      { value: 'american', label: 'Americano' }, { value: 'indefinite', label: 'Indefinido' },
    ],
    frequencies: [
      { value: 'daily', label: 'Diario' }, { value: 'weekly', label: 'Semanal' },
      { value: 'biweekly', label: 'Quincenal' }, { value: 'monthly', label: 'Mensual' },
    ],
  }), [data, users]);

  const columnasVisibles = report.columns.filter(c => !hidden.has(c.key));
  const filasOrdenadas = useMemo(() => resultado.rows, [resultado.rows]);
  const filasParaSalida = useMemo(() => (
    selected.size > 0
      ? filasOrdenadas.filter((r, i) => selected.has(String(r._id ?? i)))
      : filasOrdenadas
  ), [filasOrdenadas, selected]);

  const meta: ReportOutputMeta = {
    companyName: companyName || 'Préstamos',
    reportName: report.name,
    description: report.description,
    periodLabel: describePeriod({ startDate: filters.startDate, endDate: filters.endDate }),
    filterLines: filtrosTexto,
    generatedBy: userName,
    generatedAt: new Date().toLocaleString('es-DO', { dateStyle: 'long', timeStyle: 'short' }),
    notes: resultado.notes,
    kpis: (resultado.kpis || []).map(k => kpiText(k.label, k.value, k.format)),
  };

  const salida = (accion: () => void, formato: string) => {
    if (!canExport) {
      toast.error('No tienes permiso para exportar reportes.');
      return;
    }
    try {
      accion();
      onAudit(formato === 'print' ? 'report_printed' : 'report_exported', {
        format: formato, rows: filasParaSalida.length,
      });
      toast.success(formato === 'print' ? 'Preparando la impresión…' : `Reporte exportado (${formato.toUpperCase()})`);
    } catch (e) {
      toast.error((e as Error).message || 'No se pudo generar el archivo');
    }
  };

  const limpiarFiltros = () => onFiltersChange({
    startDate: filters.startDate, endDate: filters.endDate, preset: filters.preset, compare: filters.compare,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="sm" className="mt-0.5" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Reportes
          </Button>
          <div>
            <h2 className="text-xl font-bold text-gray-900">{report.name}</h2>
            <p className="text-sm text-gray-500">{report.description}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <Button
            variant="outline" size="sm" className="h-9"
            onClick={onToggleFavorite}
            title={isFavorite ? 'Quitar de favoritos' : 'Marcar como favorito'}
          >
            <Star className={`h-4 w-4 ${isFavorite ? 'fill-amber-400 text-amber-400' : ''}`} />
          </Button>
          <Button variant="outline" size="sm" className="h-9" onClick={() => setGuardando(true)}>
            <Save className="h-4 w-4 mr-1" /> Guardar
          </Button>
          <Button
            variant="outline" size="sm" className="h-9"
            onClick={() => salida(() => printReport(meta, columnasVisibles, filasParaSalida, resultado.totals), 'print')}
          >
            <Printer className="h-4 w-4 mr-1" /> Imprimir
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="h-9">
                <Download className="h-4 w-4 mr-1" /> Exportar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => salida(() => exportReportCsv(meta, columnasVisibles, filasParaSalida), 'csv')}>
                <FileText className="h-4 w-4 mr-2" /> CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => salida(() => exportReportExcel(meta, columnasVisibles, filasParaSalida, resultado.totals), 'xlsx')}>
                <FileSpreadsheet className="h-4 w-4 mr-2" /> Excel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => salida(() => exportReportPdf(meta, columnasVisibles, filasParaSalida, resultado.totals), 'pdf')}>
                <FileText className="h-4 w-4 mr-2" /> PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800 print:hidden">
          Se exportarán e imprimirán solo las {selected.size} fila(s) seleccionadas.{' '}
          <button className="underline" onClick={() => setSelected(new Set())}>Quitar la selección</button>
        </div>
      )}

      <ReportFiltersBar
        filters={filters}
        onChange={onFiltersChange}
        available={report.filters || []}
        todayIso={data?.todayIso || filters.endDate}
        options={opciones}
      />

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {(loading || loadingExtras) && (
        <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          {loading ? 'Cargando la cartera…' : 'Cargando los datos de este reporte…'}
        </div>
      )}

      {resultado.kpis && resultado.kpis.length > 0 && (
        <ReportKpiGrid
          kpis={resultado.kpis}
          compare={filters.compare}
          onOpenReport={onOpenReport}
        />
      )}

      {resultado.notes && resultado.notes.length > 0 && (
        <div className="space-y-1">
          {resultado.notes.map(n => (
            <div key={n} className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {n}
            </div>
          ))}
        </div>
      )}

      {resultado.charts && resultado.charts.length > 0 && (
        <div className={`grid gap-4 ${resultado.charts.length > 1 ? 'lg:grid-cols-2' : ''}`}>
          {resultado.charts.map(spec => (
            <ReportChart key={spec.title} spec={spec} rows={resultado.rows} />
          ))}
        </div>
      )}

      <ReportTable
        columns={report.columns}
        rows={filasOrdenadas}
        hiddenColumns={hidden}
        onToggleColumn={key => setHidden(prev => {
          const next = new Set(prev);
          if (next.has(key)) next.delete(key); else next.add(key);
          return next;
        })}
        sort={sort}
        onSort={key => setSort(prev => (
          prev?.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }
        ))}
        totals={resultado.totals}
        onOpenLoan={onOpenLoan}
        selectable
        selected={selected}
        onSelectedChange={setSelected}
        emptyState={{
          filterLines: filtrosTexto,
          onClear: limpiarFiltros,
          hasFilters: hasActiveFilters(filters),
        }}
      />

      <Dialog open={guardando} onOpenChange={setGuardando}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Guardar esta configuración</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Se guarda el reporte con su período, sus filtros, el orden y las columnas que tienes
              puestas, para abrirlo luego sin volver a configurarlo.
            </p>
            <Input
              placeholder={`Ej.: ${report.name} de este mes`}
              value={nombreGuardado}
              onChange={e => setNombreGuardado(e.target.value)}
            />
            <div className="flex flex-wrap gap-1">
              {filtrosTexto.map(l => (
                <Badge key={l} variant="outline" className="font-normal text-xs">{l}</Badge>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGuardando(false)}>Cancelar</Button>
            <Button
              onClick={() => {
                const nombre = nombreGuardado.trim() || report.name;
                onSaveConfig(nombre, {
                  filters,
                  hiddenColumns: [...hidden],
                  sort: sort || undefined,
                });
                setNombreGuardado('');
                setGuardando(false);
              }}
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

/** Resumen de una fila para los avisos (se usa en la importación). */
export const describeRowValue = formatCell;
