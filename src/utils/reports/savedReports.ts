// ============================================================================
// REPORTES GUARDADOS, FAVORITOS y RECIENTES
// ============================================================================
// · GUARDADOS y FAVORITOS viven en `saved_reports` (migración 20261009000000), uno por usuario.
//   Si esa tabla todavía no está aplicada, se guardan en el navegador y la pantalla lo avisa:
//   más vale que funcione en local que perder la configuración del usuario.
// · RECIENTES viven siempre en el navegador: son una comodidad del dispositivo y no justifican
//   una escritura en la base cada vez que se abre un reporte.

import type { ReportFilters } from './reportTypes';

export interface SavedReportConfig {
  /** Filtros con los que se guardó */
  filters: ReportFilters;
  /** Columnas que el usuario había ocultado */
  hiddenColumns?: string[];
  sort?: { key: string; dir: 'asc' | 'desc' };
}

export interface SavedReport {
  id: string;
  reportId: string;
  name: string;
  config: SavedReportConfig;
  createdAt: string;
  /** Guardado solo en este navegador (la tabla no estaba disponible) */
  local?: boolean;
}

type SupabaseLike = {
  from: (table: string) => any;
};

const TABLE = 'saved_reports';
const LS_PRESETS = 'reportes.guardados';
const LS_FAVORITES = 'reportes.favoritos';
const LS_RECENTS = 'reportes.recientes';
const MAX_RECENTS = 8;

// ---------------------------------------------------------------------------
// Navegador (respaldo y recientes)
// ---------------------------------------------------------------------------

const readLocal = <T,>(key: string, fallback: T): T => {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
};

const writeLocal = (key: string, value: unknown): void => {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* sin espacio o modo privado */ }
};

/** Los últimos reportes abiertos, el más reciente primero. */
export const recentReports = (): string[] => readLocal<string[]>(LS_RECENTS, []);

export const pushRecentReport = (reportId: string): string[] => {
  const lista = [reportId, ...recentReports().filter(id => id !== reportId)].slice(0, MAX_RECENTS);
  writeLocal(LS_RECENTS, lista);
  return lista;
};

// ---------------------------------------------------------------------------
// Favoritos
// ---------------------------------------------------------------------------

const localFavorites = (): string[] => readLocal<string[]>(LS_FAVORITES, []);

export interface FavoritesResult {
  ids: string[];
  /** No se pudo usar la base: se está trabajando solo con el navegador */
  localOnly: boolean;
}

export const loadFavorites = async (supabase: SupabaseLike, userId: string): Promise<FavoritesResult> => {
  try {
    const { data, error } = await supabase.from(TABLE)
      .select('report_type, filters')
      .eq('user_id', userId);
    if (error) throw error;
    const ids = (data || [])
      .filter((r: any) => r?.filters?.kind === 'favorite')
      .map((r: any) => String(r.report_type));
    return { ids, localOnly: false };
  } catch {
    return { ids: localFavorites(), localOnly: true };
  }
};

export const toggleFavorite = async (
  supabase: SupabaseLike, userId: string, reportId: string, reportName: string, isFavorite: boolean,
): Promise<{ ok: boolean; localOnly: boolean }> => {
  // El navegador se actualiza siempre: así la pantalla responde al instante y, si la base falla,
  // el favorito no se pierde.
  const locales = localFavorites();
  writeLocal(LS_FAVORITES, isFavorite
    ? [...new Set([...locales, reportId])]
    : locales.filter(id => id !== reportId));

  try {
    if (isFavorite) {
      const { error } = await supabase.from(TABLE).insert({
        user_id: userId,
        report_type: reportId,
        report_name: reportName,
        filters: { kind: 'favorite' },
      });
      if (error) throw error;
    } else {
      const { error } = await supabase.from(TABLE)
        .delete()
        .eq('user_id', userId)
        .eq('report_type', reportId)
        .contains('filters', { kind: 'favorite' });
      if (error) throw error;
    }
    return { ok: true, localOnly: false };
  } catch {
    return { ok: true, localOnly: true };
  }
};

// ---------------------------------------------------------------------------
// Configuraciones guardadas
// ---------------------------------------------------------------------------

const localPresets = (): SavedReport[] => readLocal<SavedReport[]>(LS_PRESETS, []);

export const loadSavedReports = async (
  supabase: SupabaseLike, userId: string,
): Promise<{ reports: SavedReport[]; localOnly: boolean }> => {
  try {
    const { data, error } = await supabase.from(TABLE)
      .select('id, report_type, report_name, filters, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    const reports = (data || [])
      .filter((r: any) => r?.filters?.kind !== 'favorite')
      .map((r: any) => ({
        id: String(r.id),
        reportId: String(r.report_type),
        name: String(r.report_name),
        config: {
          filters: r.filters?.filters || {},
          hiddenColumns: r.filters?.hiddenColumns || [],
          sort: r.filters?.sort,
        },
        createdAt: String(r.created_at || ''),
      })) as SavedReport[];
    return { reports, localOnly: false };
  } catch {
    return { reports: localPresets(), localOnly: true };
  }
};

export const saveReportConfig = async (
  supabase: SupabaseLike, userId: string, reportId: string, name: string, config: SavedReportConfig,
): Promise<{ saved: SavedReport; localOnly: boolean }> => {
  const payload = { kind: 'preset', ...config };
  try {
    const { data, error } = await supabase.from(TABLE)
      .insert({ user_id: userId, report_type: reportId, report_name: name, filters: payload })
      .select('id, created_at')
      .single();
    if (error) throw error;
    return {
      saved: { id: String(data.id), reportId, name, config, createdAt: String(data.created_at || '') },
      localOnly: false,
    };
  } catch {
    const saved: SavedReport = {
      id: `local-${Date.now()}`,
      reportId, name, config,
      createdAt: new Date().toISOString(),
      local: true,
    };
    writeLocal(LS_PRESETS, [saved, ...localPresets()].slice(0, 50));
    return { saved, localOnly: true };
  }
};

export const deleteSavedReport = async (
  supabase: SupabaseLike, userId: string, id: string,
): Promise<void> => {
  if (id.startsWith('local-')) {
    writeLocal(LS_PRESETS, localPresets().filter(r => r.id !== id));
    return;
  }
  try {
    await supabase.from(TABLE).delete().eq('id', id).eq('user_id', userId);
  } catch {
    writeLocal(LS_PRESETS, localPresets().filter(r => r.id !== id));
  }
};

/** El aviso que se enseña cuando se está trabajando solo contra el navegador. */
export const LOCAL_ONLY_NOTICE =
  'Los reportes guardados se están almacenando solo en este navegador: falta aplicar la migración '
  + '20261009000000_saved_reports.sql para que queden en la base y se vean desde cualquier equipo.';
