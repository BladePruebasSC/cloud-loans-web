// ============================================================================
// IMPORTAR DATOS
// ============================================================================
// Cuatro pasos, y el botón de importar solo aparece en el último: elegir qué y el archivo →
// revisar el mapeo de columnas → ver la validación fila por fila → importar y ver el resumen.
// Nada se escribe en la base hasta que el usuario lo confirma.

import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import {
  AlertTriangle, ArrowLeft, CheckCircle2, Download, FileUp, Loader2, Upload, XCircle,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { exportToCSV, importFromCSV, importFromExcel } from '@/utils/exportUtils';
import {
  IMPORT_ENTITIES, autoMapColumns, errorReportRows, rowsToInsert, validateImport,
  type ImportEntity, type ValidationSummary,
} from '@/utils/reports/reportImport';
import { recordReportAudit } from '@/utils/reports/reportAudit';

interface Props {
  onBack: () => void;
  can: (permission: string) => boolean;
}

const SIN_MAPEAR = '__none__';

export const ReportImport: React.FC<Props> = ({ onBack, can }) => {
  const { user, companyId } = useAuth();
  const [entity, setEntity] = useState<ImportEntity>(IMPORT_ENTITIES[0]);
  const [fileName, setFileName] = useState('');
  const [rawRows, setRawRows] = useState<Array<Record<string, unknown>>>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [existing, setExisting] = useState<Set<string>>(new Set());
  const [includeDuplicates, setIncludeDuplicates] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const [importando, setImportando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: number; fallos: number; detalles: string[] } | null>(null);

  const puede = can(entity.permission);

  const resumen: ValidationSummary | null = useMemo(() => {
    if (rawRows.length === 0) return null;
    return validateImport(entity, rawRows, mapping, existing);
  }, [entity, rawRows, mapping, existing]);

  const aInsertar = resumen ? rowsToInsert(resumen, { includeDuplicates }) : [];

  /** Las claves que ya están en la base, para avisar de duplicados ANTES de importar. */
  const cargarExistentes = async (ent: ImportEntity) => {
    try {
      const { data } = await supabase.from(ent.table).select(ent.dedupeKey).limit(5000);
      const set = new Set<string>();
      for (const row of data || []) {
        const v = String((row as any)[ent.dedupeKey] ?? '').toLowerCase().trim();
        if (v) set.add(v);
      }
      setExisting(set);
    } catch {
      setExisting(new Set());
    }
  };

  const elegirEntidad = async (id: string) => {
    const ent = IMPORT_ENTITIES.find(e => e.id === id) || IMPORT_ENTITIES[0];
    setEntity(ent);
    setRawRows([]); setHeaders([]); setMapping({}); setResultado(null); setFileName('');
    await cargarExistentes(ent);
  };

  const leerArchivo = async (file: File) => {
    setLeyendo(true);
    setResultado(null);
    try {
      const esExcel = /\.(xlsx|xls)$/i.test(file.name);
      const filas = esExcel ? await importFromExcel(file) : await importFromCSV(file);
      if (!filas || filas.length === 0) {
        toast.error('El archivo no tiene filas que importar.');
        return;
      }
      const cabeceras = Object.keys(filas[0] as Record<string, unknown>);
      setRawRows(filas as Array<Record<string, unknown>>);
      setHeaders(cabeceras);
      setMapping(autoMapColumns(entity, cabeceras));
      setFileName(file.name);
      if (existing.size === 0) await cargarExistentes(entity);
      toast.success(`${filas.length} fila(s) leídas de ${file.name}`);
    } catch (e) {
      toast.error(`No se pudo leer el archivo: ${(e as Error).message}`);
    } finally {
      setLeyendo(false);
    }
  };

  const importar = async () => {
    if (!puede) { toast.error('No tienes permiso para importar este tipo de dato.'); return; }
    if (aInsertar.length === 0) { toast.error('No hay filas válidas que importar.'); return; }

    setImportando(true);
    const detalles: string[] = [];
    let ok = 0; let fallos = 0;

    // De 50 en 50: si una tanda falla, se sabe cuál y el resto sigue.
    const tandas: typeof aInsertar[] = [];
    for (let i = 0; i < aInsertar.length; i += 50) tandas.push(aInsertar.slice(i, i + 50));

    for (const tanda of tandas) {
      const payload = tanda.map(r => ({
        ...r.values,
        ...(entity.id === 'clients' ? { user_id: companyId || user?.id } : {}),
        ...(entity.id === 'expenses' ? { created_by: user?.id || companyId, status: 'approved' } : {}),
        ...(entity.id === 'products' ? { user_id: companyId || user?.id, status: 'active' } : {}),
      }));
      const { error } = await supabase.from(entity.table).insert(payload as any);
      if (error) {
        fallos += tanda.length;
        detalles.push(`Filas ${tanda[0].line}–${tanda[tanda.length - 1].line}: ${error.message}`);
      } else {
        ok += tanda.length;
      }
    }

    await recordReportAudit(supabase as any, user?.id, {
      action: 'report_imported',
      reportId: `import:${entity.id}`,
      reportName: `Importación de ${entity.label}`,
      summary: { leidas: rawRows.length, importadas: ok, rechazadas: resumen?.invalid || 0, fallidas: fallos },
    });

    setResultado({ ok, fallos, detalles });
    setImportando(false);
    if (ok > 0) toast.success(`${ok} registro(s) importado(s)`);
    if (fallos > 0) toast.error(`${fallos} fila(s) no se pudieron guardar`);
  };

  const descargarErrores = () => {
    if (!resumen) return;
    const filas = errorReportRows(resumen);
    if (filas.length === 0) { toast.info('No hay errores que descargar.'); return; }
    exportToCSV(filas, `errores_importacion_${entity.id}`);
  };

  const descargarPlantilla = () => {
    const ejemplo: Record<string, string> = {};
    for (const f of entity.fields) ejemplo[f.label] = '';
    exportToCSV([ejemplo], `plantilla_${entity.id}`);
    toast.success('Plantilla descargada: llénala y vuelve a subirla.');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Reportes
        </Button>
        <div>
          <h2 className="text-xl font-bold text-gray-900">Importar datos</h2>
          <p className="text-sm text-gray-500">
            Desde CSV o Excel. Se revisa todo antes de guardar nada.
          </p>
        </div>
      </div>

      {/* Paso 1 */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="text-sm font-semibold text-gray-700">1. ¿Qué vas a importar?</div>
          <div className="grid gap-2 sm:grid-cols-3">
            {IMPORT_ENTITIES.map(e => (
              <button
                key={e.id}
                type="button"
                onClick={() => elegirEntidad(e.id)}
                className={`rounded-lg border p-3 text-left transition ${entity.id === e.id ? 'border-blue-500 bg-blue-50' : 'hover:border-gray-300'}`}
              >
                <div className="font-medium text-gray-900">{e.label}</div>
                <div className="mt-1 text-xs text-gray-500">{e.description}</div>
              </button>
            ))}
          </div>
          {!puede && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              No tienes permiso para crear {entity.label.toLowerCase()}. Puedes revisar el archivo,
              pero no importarlo.
            </div>
          )}
          <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
            Los <strong>préstamos y los pagos no se importan desde aquí</strong> a propósito: crear un
            préstamo genera sus cuotas, su balance y su mora, y meterlos sueltos descuadraría la
            cartera. Para mover un sistema completo usa Utilidades → Respaldo.
          </div>
        </CardContent>
      </Card>

      {/* Paso 2 */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-gray-700">2. El archivo</div>
            <Button variant="outline" size="sm" className="h-8" onClick={descargarPlantilla}>
              <Download className="h-4 w-4 mr-1" /> Descargar plantilla
            </Button>
          </div>
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center hover:border-blue-400">
            {leyendo
              ? <Loader2 className="h-7 w-7 animate-spin text-blue-500" />
              : <FileUp className="h-7 w-7 text-gray-400" />}
            <span className="mt-2 text-sm font-medium text-gray-700">
              {fileName || 'Elige un archivo CSV o Excel'}
            </span>
            <span className="mt-1 text-xs text-gray-500">
              La primera fila debe ser el encabezado con los nombres de las columnas
            </span>
            <input
              type="file" accept=".csv,.xlsx,.xls" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) void leerArchivo(f); e.target.value = ''; }}
            />
          </label>
        </CardContent>
      </Card>

      {/* Paso 3 */}
      {headers.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="text-sm font-semibold text-gray-700">3. Qué columna es cada cosa</div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {entity.fields.map(field => (
                <div key={field.key}>
                  <label className="text-xs font-medium text-gray-600">
                    {field.label}{field.required && <span className="text-red-500"> *</span>}
                  </label>
                  <Select
                    value={mapping[field.key] || SIN_MAPEAR}
                    onValueChange={v => setMapping(prev => {
                      const next = { ...prev };
                      if (v === SIN_MAPEAR) delete next[field.key]; else next[field.key] = v;
                      return next;
                    })}
                  >
                    <SelectTrigger className="h-9"><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SIN_MAPEAR}>— Sin asignar —</SelectItem>
                      {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Paso 4: validación */}
      {resumen && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="text-sm font-semibold text-gray-700">4. Revisión</div>

            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
                <CheckCircle2 className="h-4 w-4" /> {resumen.valid} válida(s)
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <AlertTriangle className="h-4 w-4" /> {resumen.warnings} con advertencia
              </div>
              <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                <XCircle className="h-4 w-4" /> {resumen.invalid} rechazada(s)
              </div>
              {resumen.duplicates > 0 && (
                <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
                  {resumen.duplicates} duplicado(s) por {entity.dedupeLabel}
                </div>
              )}
            </div>

            {resumen.duplicates > 0 && (
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <Checkbox
                  checked={includeDuplicates}
                  onCheckedChange={v => setIncludeDuplicates(Boolean(v))}
                />
                Importar también los duplicados (por defecto se saltan para no repetir registros)
              </label>
            )}

            <div className="max-h-72 overflow-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-50">
                  <tr>
                    <th className="p-2 text-left">Fila</th>
                    <th className="p-2 text-left">Estado</th>
                    {entity.fields.slice(0, 4).map(f => (
                      <th key={f.key} className="p-2 text-left">{f.label}</th>
                    ))}
                    <th className="p-2 text-left">Problemas</th>
                  </tr>
                </thead>
                <tbody>
                  {resumen.rows.slice(0, 200).map(row => (
                    <tr key={row.line} className="border-t">
                      <td className="p-2 text-gray-500">{row.line}</td>
                      <td className="p-2">
                        <Badge
                          variant="outline"
                          className={row.status === 'invalid' ? 'border-red-300 text-red-700'
                            : row.status === 'warning' ? 'border-amber-300 text-amber-700'
                              : 'border-green-300 text-green-700'}
                        >
                          {row.status === 'invalid' ? 'Rechazada' : row.status === 'warning' ? 'Aviso' : 'OK'}
                        </Badge>
                      </td>
                      {entity.fields.slice(0, 4).map(f => (
                        <td key={f.key} className="p-2">{String(row.values[f.key] ?? '—')}</td>
                      ))}
                      <td className="p-2 text-gray-600">{[...row.errors, ...row.warnings].join(' · ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {resumen.rows.length > 200 && (
                <div className="bg-gray-50 p-2 text-center text-xs text-gray-500">
                  Se muestran las primeras 200 de {resumen.rows.length} filas.
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={importar}
                disabled={!puede || importando || aInsertar.length === 0}
              >
                {importando
                  ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Importando…</>
                  : <><Upload className="h-4 w-4 mr-1" /> Importar {aInsertar.length} registro(s)</>}
              </Button>
              {(resumen.invalid > 0 || resumen.warnings > 0) && (
                <Button variant="outline" onClick={descargarErrores}>
                  <Download className="h-4 w-4 mr-1" /> Descargar los problemas
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {resultado && (
        <Card className="border-green-200">
          <CardContent className="p-4 space-y-2">
            <div className="text-sm font-semibold text-gray-700">Importación terminada</div>
            <div className="flex flex-wrap gap-3 text-sm">
              <span className="text-green-700">✓ {resultado.ok} importado(s)</span>
              {(resumen?.warnings || 0) > 0 && <span className="text-amber-700">⚠ {resumen?.warnings} con advertencia</span>}
              {(resumen?.invalid || 0) > 0 && <span className="text-red-700">✕ {resumen?.invalid} rechazada(s)</span>}
              {resultado.fallos > 0 && <span className="text-red-700">✕ {resultado.fallos} fallaron al guardar</span>}
            </div>
            {resultado.detalles.length > 0 && (
              <ul className="list-disc pl-5 text-xs text-red-700">
                {resultado.detalles.map(d => <li key={d}>{d}</li>)}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
