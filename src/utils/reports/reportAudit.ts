// ============================================================================
// AUDITORÍA del módulo de reportes
// ============================================================================
// Se deja constancia de lo que importa: qué reporte se generó, exportó o imprimió, con qué
// filtros, quién y cuándo. Nada más: no se guardan las filas del reporte —serían datos de
// clientes duplicados en otra tabla— ni se registra cada tecleo del buscador.
//
// Va a `audit_logs`, la tabla que el sistema ya tiene (`action`, `table_name`, `record_id`,
// `new_values`, `user_id`). Si falla, NO se interrumpe nada: la auditoría no puede impedirle a
// nadie ver o exportar su reporte; solo se avisa por consola.

export type ReportAuditAction =
  | 'report_viewed'
  | 'report_exported'
  | 'report_printed'
  | 'report_imported'
  | 'report_saved';

type SupabaseLike = { from: (table: string) => any };

export interface ReportAuditEntry {
  action: ReportAuditAction;
  reportId: string;
  reportName: string;
  /** Resumen de los filtros, ya en texto (nunca datos de clientes) */
  filters?: string[];
  /** Formato en el caso de una exportación */
  format?: string;
  /** Cuántas filas tenía el reporte */
  rows?: number;
  /** Resultado de una importación */
  summary?: Record<string, number>;
}

/** Escribe la entrada de auditoría. Nunca lanza. */
export const recordReportAudit = async (
  supabase: SupabaseLike,
  userId: string | null | undefined,
  entry: ReportAuditEntry,
): Promise<boolean> => {
  try {
    const { error } = await supabase.from('audit_logs').insert({
      user_id: userId || null,
      action: entry.action,
      table_name: 'reports',
      record_id: null,
      new_values: {
        reporte: entry.reportId,
        nombre: entry.reportName,
        filtros: entry.filters || [],
        ...(entry.format ? { formato: entry.format } : {}),
        ...(typeof entry.rows === 'number' ? { filas: entry.rows } : {}),
        ...(entry.summary ? { resumen: entry.summary } : {}),
      },
    });
    if (error) throw error;
    return true;
  } catch (error) {
    console.warn('[reportes] no se pudo registrar la auditoría:', error);
    return false;
  }
};

/**
 * Registra que se VIO un reporte, pero no en cada tecla: solo una vez por reporte y filtros
 * dentro de la misma sesión de pantalla.
 */
export const makeViewRecorder = (
  supabase: SupabaseLike,
  userId: string | null | undefined,
) => {
  const vistos = new Set<string>();
  return (entry: ReportAuditEntry): void => {
    const clave = `${entry.reportId}|${(entry.filters || []).join('|')}`;
    if (vistos.has(clave)) return;
    vistos.add(clave);
    void recordReportAudit(supabase, userId, entry);
  };
};
