// ============================================================================
// REPORTES Y ANÁLISIS
// ============================================================================
// El módulo entero se arma sobre el CATÁLOGO (`utils/reports/reportCatalog.ts`): esta pantalla
// solo decide qué se enseña —la portada, un reporte o la importación— y pasa los datos. Por eso
// un reporte nuevo es una entrada en el catálogo y no otra pestaña con su propia tabla.
//
// Sustituye al módulo anterior (`ReportsModuleImproved.tsx`, 2.500 líneas con once pestañas,
// diez consultas sin límite en cada cambio de fecha y CSV como única salida). Aquel archivo se
// deja en el repositorio, sin enrutar, hasta que esta versión lleve un tiempo en la calle.

import React, { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  BarChart3, FileSpreadsheet, Loader2, RefreshCw, Star, Trash2, Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useReportsData } from '@/hooks/useReportsData';
import { LoanDetailsView } from '@/components/loans/LoanDetailsView';
import { ReportCatalogBrowser } from './ReportCatalogBrowser';
import { ReportView } from './ReportView';
import { ReportImport } from './ReportImport';
import { ReportKpiGrid } from './ReportKpiGrid';
import { ReportChart } from './ReportChart';
import { ReportFiltersBar } from './ReportFiltersBar';
import { datasetsFor, reportById, visibleReports } from '@/utils/reports/reportCatalog';
import { buildDashboard, dashboardSeries } from '@/utils/reports/reportDashboard';
import { emptyFilters, describeFilters } from '@/utils/reports/reportFilters';
import { resolvePreset, todayInSantoDomingo } from '@/utils/reports/reportPeriods';
import {
  LOCAL_ONLY_NOTICE, deleteSavedReport, loadFavorites, loadSavedReports, pushRecentReport,
  recentReports, saveReportConfig, toggleFavorite, type SavedReport, type SavedReportConfig,
} from '@/utils/reports/savedReports';
import { makeViewRecorder, recordReportAudit } from '@/utils/reports/reportAudit';
import type { ReportDatasetId, ReportFilters } from '@/utils/reports/reportTypes';

type Vista = 'home' | 'report' | 'import';

export const ReportsModule: React.FC = () => {
  const { user, profile } = useAuth();
  const hoy = todayInSantoDomingo();

  const [vista, setVista] = useState<Vista>('home');
  const [reportId, setReportId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [categoria, setCategoria] = useState<string | null>(null);
  const [filters, setFilters] = useState<ReportFilters>(
    () => emptyFilters(resolvePreset('month', hoy)!, 'month'),
  );
  const [favoritos, setFavoritos] = useState<string[]>([]);
  const [guardados, setGuardados] = useState<SavedReport[]>([]);
  const [soloLocal, setSoloLocal] = useState(false);
  const [recientes, setRecientes] = useState<string[]>(() => recentReports());
  const [loanId, setLoanId] = useState<string | null>(null);

  const can = (permission: string) => {
    if (!profile?.is_employee) return true;
    if (profile?.role === 'admin') return true;
    return profile?.permissions?.[permission] === true;
  };

  const puedeVer = can('reports.view');
  const puedeExportar = can('reports.export');

  const catalogo = useMemo(() => visibleReports(can), [profile]);
  const reporte = reportId ? reportById(reportId) : undefined;

  // La portada necesita gastos y ventas para sus indicadores; un reporte, lo que declare.
  const datasets: ReportDatasetId[] = useMemo(() => {
    if (vista === 'report' && reporte) return datasetsFor(reporte);
    if (vista === 'home') return ['expenses', 'sales'];
    return [];
  }, [vista, reporte?.id]);

  const R = useReportsData(datasets);
  const registrarVista = useMemo(
    () => makeViewRecorder(supabase as any, user?.id),
    [user?.id],
  );

  useEffect(() => {
    if (!user?.id) return;
    void (async () => {
      const [fav, sav] = await Promise.all([
        loadFavorites(supabase as any, user.id),
        loadSavedReports(supabase as any, user.id),
      ]);
      setFavoritos(fav.ids);
      setGuardados(sav.reports);
      setSoloLocal(fav.localOnly || sav.localOnly);
    })();
  }, [user?.id]);

  const abrirReporte = (id: string) => {
    const def = reportById(id);
    if (!def) { toast.error('Ese reporte ya no existe.'); return; }
    if (def.permission && !can(def.permission)) {
      toast.error('No tienes permiso para ver ese reporte.');
      return;
    }
    setReportId(id);
    setVista('report');
    setRecientes(pushRecentReport(id));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const volver = () => { setVista('home'); setReportId(null); };

  const cambiarFavorito = async (id: string) => {
    if (!user?.id) return;
    const esFavorito = !favoritos.includes(id);
    setFavoritos(prev => (esFavorito ? [...prev, id] : prev.filter(x => x !== id)));
    const { localOnly } = await toggleFavorite(
      supabase as any, user.id, id, reportById(id)?.name || id, esFavorito,
    );
    if (localOnly) setSoloLocal(true);
  };

  const guardarConfiguracion = async (nombre: string, config: SavedReportConfig) => {
    if (!user?.id || !reportId) return;
    const { saved, localOnly } = await saveReportConfig(supabase as any, user.id, reportId, nombre, config);
    setGuardados(prev => [saved, ...prev]);
    if (localOnly) setSoloLocal(true);
    void recordReportAudit(supabase as any, user.id, {
      action: 'report_saved', reportId, reportName: nombre,
    });
    toast.success(localOnly
      ? 'Guardado en este navegador (falta aplicar la migración de reportes guardados)'
      : 'Configuración guardada');
  };

  const abrirGuardado = (saved: SavedReport) => {
    const def = reportById(saved.reportId);
    if (!def) { toast.error('El reporte guardado ya no existe.'); return; }
    setFilters({ ...emptyFilters(resolvePreset('month', hoy)!), ...saved.config.filters });
    abrirReporte(saved.reportId);
  };

  const borrarGuardado = async (saved: SavedReport) => {
    if (!user?.id) return;
    await deleteSavedReport(supabase as any, user.id, saved.id);
    setGuardados(prev => prev.filter(g => g.id !== saved.id));
    toast.success('Configuración eliminada');
  };

  if (!puedeVer) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-10 text-center">
            <BarChart3 className="mx-auto h-10 w-10 text-gray-300" />
            <h3 className="mt-3 text-lg font-semibold text-gray-900">Acceso restringido</h3>
            <p className="mt-1 text-sm text-gray-600">
              No tienes el permiso "Ver Reportes". Pídeselo a tu supervisor.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---------------------------------------------------------------------
  // Portada
  // ---------------------------------------------------------------------
  const secciones = R.data ? buildDashboard(R.data, filters, can) : [];
  const series = R.data ? dashboardSeries(R.data, filters) : [];
  const filtrosTexto = describeFilters(filters);

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <BarChart3 className="h-6 w-6 text-blue-600" /> Reportes y Análisis
          </h1>
          <p className="text-sm text-gray-500">
            {catalogo.length} reportes sobre los datos reales del sistema
            {R.companyName ? ` · ${R.companyName}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <Button variant="outline" size="sm" className="h-9" onClick={() => setVista('import')}>
            <Upload className="h-4 w-4 mr-1" /> Importar datos
          </Button>
          <Button
            variant="outline" size="sm" className="h-9" onClick={R.refresh}
            disabled={R.loading}
            title="Volver a leer los datos"
          >
            {R.loading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {soloLocal && (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">{LOCAL_ONLY_NOTICE}</div>
      )}

      {vista === 'import' && <ReportImport onBack={volver} can={can} />}

      {vista === 'report' && reporte && (
        <ReportView
          report={reporte}
          data={R.data}
          loading={R.loading}
          loadingExtras={R.loadingExtras}
          error={R.error}
          filters={filters}
          onFiltersChange={setFilters}
          onBack={volver}
          onOpenReport={abrirReporte}
          onOpenLoan={id => setLoanId(id)}
          companyName={R.companyName}
          userName={profile?.full_name || user?.email || 'Usuario'}
          users={R.users}
          isFavorite={favoritos.includes(reporte.id)}
          onToggleFavorite={() => cambiarFavorito(reporte.id)}
          onSaveConfig={guardarConfiguracion}
          canExport={puedeExportar}
          onAudit={(action, extra) => {
            const entry = {
              action, reportId: reporte.id, reportName: reporte.name,
              filters: describeFilters(filters), ...extra,
            };
            if (action === 'report_viewed') registrarVista(entry);
            else void recordReportAudit(supabase as any, user?.id, entry);
          }}
        />
      )}

      {vista === 'home' && (
        <>
          <ReportFiltersBar
            filters={filters}
            onChange={setFilters}
            available={[]}
            todayIso={R.todayIso || hoy}
            options={{}}
          />

          {R.loading ? (
            <div className="flex items-center justify-center gap-2 rounded-xl border bg-white p-10 text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin" /> Cargando la cartera…
            </div>
          ) : (
            <>
              {secciones.map(seccion => (
                <section key={seccion.title} className="space-y-2">
                  <div>
                    <h2 className="text-sm font-semibold text-gray-800">{seccion.title}</h2>
                    <p className="text-xs text-gray-500">{seccion.subtitle}</p>
                  </div>
                  <ReportKpiGrid
                    kpis={seccion.kpis}
                    compare={filters.compare && seccion.title === 'Del período'}
                    onOpenReport={abrirReporte}
                  />
                </section>
              ))}

              {/* Los gráficos también respetan los permisos: el de gastos e interés es
                  información financiera. */}
              {series.length > 1 && (can('reports.loans') || can('reports.financial')) && (
                <div className="grid gap-4 lg:grid-cols-2">
                  {can('reports.loans') && (
                    <ReportChart
                      spec={{
                        kind: 'bar', title: 'Cobrado y prestado en el período', xKey: 'periodo',
                        series: [
                          { key: 'cobrado', label: 'Cobrado' },
                          { key: 'prestado', label: 'Prestado' },
                        ],
                        money: true,
                      }}
                      rows={series as any}
                    />
                  )}
                  {can('reports.financial') && (
                    <ReportChart
                      spec={{
                        kind: 'line', title: 'Interés cobrado y gastos', xKey: 'periodo',
                        series: [
                          { key: 'interes', label: 'Interés' },
                          { key: 'gastos', label: 'Gastos' },
                        ],
                        money: true,
                      }}
                      rows={series as any}
                    />
                  )}
                </div>
              )}

              {R.loadingExtras && (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando gastos y ventas del período…
                </div>
              )}
            </>
          )}

          {guardados.length > 0 && (
            <section className="space-y-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                <FileSpreadsheet className="h-4 w-4 text-gray-400" /> Mis reportes guardados
              </h2>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {guardados.map(g => (
                  <div key={g.id} className="group flex items-start justify-between gap-2 rounded-lg border bg-white p-3">
                    <button type="button" className="text-left" onClick={() => abrirGuardado(g)}>
                      <div className="font-medium text-gray-900">{g.name}</div>
                      <div className="mt-0.5 text-xs text-gray-500">
                        {reportById(g.reportId)?.name || g.reportId}
                        {g.local && <Badge variant="outline" className="ml-2 text-[10px]">solo aquí</Badge>}
                      </div>
                    </button>
                    <button
                      type="button"
                      className="rounded p-1 text-gray-300 hover:text-red-500"
                      onClick={() => borrarGuardado(g)}
                      title="Eliminar esta configuración"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-gray-800">Todos los reportes</h2>
            <ReportCatalogBrowser
              reports={catalogo}
              query={query}
              onQueryChange={setQuery}
              onOpen={abrirReporte}
              favorites={favoritos}
              onToggleFavorite={cambiarFavorito}
              recents={recientes}
              category={categoria}
              onCategoryChange={setCategoria}
            />
          </section>

          {filtrosTexto.length > 0 && (
            <p className="text-xs text-gray-400">
              Los indicadores de arriba usan {filtrosTexto[0].toLowerCase()}.
            </p>
          )}
        </>
      )}

      {loanId && (
        <LoanDetailsView
          loanId={loanId}
          isOpen={!!loanId}
          onClose={() => setLoanId(null)}
        />
      )}
    </div>
  );
};

export default ReportsModule;
