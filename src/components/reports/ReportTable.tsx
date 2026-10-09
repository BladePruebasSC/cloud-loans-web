// ============================================================================
// La TABLA del reporte
// ============================================================================
// Una sola tabla para los cuarenta y pico reportes: ordena, pagina, deja elegir columnas, suma
// los totales de lo que se está viendo y permite abrir el préstamo o el cliente de cada fila.
//
// Los totales son los de las filas FILTRADAS, no los de la página: si el usuario filtró por una
// ciudad, el total es el de esa ciudad aunque esté mirando la página 2.

import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Columns3, Eye, Inbox,
} from 'lucide-react';
import { alignOf, formatCell } from '@/utils/reports/reportFormat';
import { sortRows } from '@/utils/reports/reportFilters';
import type { ReportColumn, ReportRow } from '@/utils/reports/reportTypes';

interface Props {
  columns: ReportColumn[];
  rows: ReportRow[];
  hiddenColumns: Set<string>;
  onToggleColumn: (key: string) => void;
  sort: { key: string; dir: 'asc' | 'desc' } | null;
  onSort: (key: string) => void;
  totals?: Record<string, number>;
  /** Abrir la ficha del préstamo de una fila */
  onOpenLoan?: (loanId: string) => void;
  /** Estado vacío: qué filtros hay puestos y cómo quitarlos */
  emptyState?: { filterLines: string[]; onClear: () => void; hasFilters: boolean };
  /** Selección de filas (para exportar solo lo marcado) */
  selectable?: boolean;
  selected?: Set<string>;
  onSelectedChange?: (next: Set<string>) => void;
}

const PAGE_SIZES = [25, 50, 100, 250];

export const ReportTable: React.FC<Props> = ({
  columns, rows, hiddenColumns, onToggleColumn, sort, onSort, totals, onOpenLoan, emptyState,
  selectable, selected, onSelectedChange,
}) => {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);

  const visibles = useMemo(
    () => columns.filter(c => !hiddenColumns.has(c.key)),
    [columns, hiddenColumns],
  );

  const ordenadas = useMemo(
    () => (sort ? sortRows(rows, sort.key, sort.dir) : rows),
    [rows, sort],
  );

  const totalPages = Math.max(1, Math.ceil(ordenadas.length / pageSize));
  const paginaActual = Math.min(page, totalPages - 1);
  const pagina = useMemo(
    () => ordenadas.slice(paginaActual * pageSize, paginaActual * pageSize + pageSize),
    [ordenadas, paginaActual, pageSize],
  );

  const sumables = visibles.filter(c => c.total);
  const totalesVisibles = useMemo(() => {
    if (sumables.length === 0) return null;
    const out: Record<string, number> = {};
    for (const col of sumables) {
      out[col.key] = totals?.[col.key] ?? Math.round(
        ordenadas.reduce((s, r) => s + (Number(r[col.key]) || 0), 0) * 100,
      ) / 100;
    }
    return out;
  }, [sumables, totals, ordenadas]);

  const toggleFila = (id: string) => {
    if (!onSelectedChange) return;
    const next = new Set(selected || []);
    if (next.has(id)) next.delete(id); else next.add(id);
    onSelectedChange(next);
  };

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border bg-white p-10 text-center">
        <Inbox className="mx-auto h-10 w-10 text-gray-300" />
        <h3 className="mt-3 font-semibold text-gray-800">
          {emptyState?.hasFilters
            ? 'No encontramos nada con los filtros puestos'
            : 'No hay movimientos en este período'}
        </h3>
        <p className="mt-1 text-sm text-gray-500">
          {emptyState?.hasFilters
            ? 'Prueba a ampliar el período o a quitar algún filtro.'
            : 'Elige otro período arriba para ver otra temporada.'}
        </p>
        {emptyState?.filterLines?.length ? (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {emptyState.filterLines.map(l => (
              <Badge key={l} variant="outline" className="font-normal">{l}</Badge>
            ))}
          </div>
        ) : null}
        {emptyState?.hasFilters && (
          <Button className="mt-4" variant="outline" size="sm" onClick={emptyState.onClear}>
            Limpiar filtros
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 print:hidden">
        <div className="text-sm text-gray-600">
          <span className="font-semibold text-gray-900">{ordenadas.length.toLocaleString('es-DO')}</span>
          {' '}fila(s)
          {selectable && (selected?.size || 0) > 0 && (
            <span className="text-blue-600"> · {selected!.size} seleccionada(s)</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8">
                <Columns3 className="h-4 w-4 mr-1" /> Columnas
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-80 overflow-auto">
              <DropdownMenuLabel>Mostrar columnas</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {columns.map(col => (
                <DropdownMenuCheckboxItem
                  key={col.key}
                  checked={!hiddenColumns.has(col.key)}
                  onCheckedChange={() => onToggleColumn(col.key)}
                  onSelect={e => e.preventDefault()}
                >
                  {col.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <select
            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            value={pageSize}
            onChange={e => { setPageSize(Number(e.target.value)); setPage(0); }}
          >
            {PAGE_SIZES.map(n => <option key={n} value={n}>{n} por página</option>)}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              {selectable && <th className="w-10 p-2" />}
              {visibles.map(col => {
                const align = alignOf(col);
                const activo = sort?.key === col.key;
                return (
                  <th
                    key={col.key}
                    className={`whitespace-nowrap p-2 font-semibold text-gray-700 ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'} cursor-pointer select-none hover:bg-gray-100`}
                    onClick={() => onSort(col.key)}
                    title={col.help || 'Ordenar por esta columna'}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      {activo && (sort!.dir === 'asc'
                        ? <ArrowUp className="h-3 w-3" />
                        : <ArrowDown className="h-3 w-3" />)}
                    </span>
                  </th>
                );
              })}
              {onOpenLoan && <th className="w-10 p-2" />}
            </tr>
          </thead>
          <tbody>
            {pagina.map((row, i) => {
              const id = String(row._id ?? i);
              return (
                <tr key={id} className="border-b last:border-0 hover:bg-blue-50/40">
                  {selectable && (
                    <td className="p-2">
                      <Checkbox checked={selected?.has(id) || false} onCheckedChange={() => toggleFila(id)} />
                    </td>
                  )}
                  {visibles.map(col => {
                    const align = alignOf(col);
                    const value = formatCell(row[col.key], col.format);
                    return (
                      <td
                        key={col.key}
                        className={`p-2 ${align === 'right' ? 'text-right tabular-nums' : align === 'center' ? 'text-center' : 'text-left'} ${col.format === 'money' ? 'font-medium' : ''}`}
                      >
                        {col.format === 'badge'
                          ? <Badge variant="outline" className="font-normal">{value}</Badge>
                          : value}
                      </td>
                    );
                  })}
                  {onOpenLoan && (
                    <td className="p-2 text-right">
                      {row._loanId && (
                        <Button
                          size="sm" variant="ghost" className="h-7 px-2"
                          onClick={() => onOpenLoan(String(row._loanId))}
                          title="Ver el préstamo"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          {totalesVisibles && (
            <tfoot>
              <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                {selectable && <td className="p-2" />}
                {visibles.map((col, i) => (
                  <td
                    key={col.key}
                    className={`p-2 ${alignOf(col) === 'right' ? 'text-right tabular-nums' : ''}`}
                  >
                    {i === 0 ? 'TOTAL' : col.total ? formatCell(totalesVisibles[col.key], col.format) : ''}
                  </td>
                ))}
                {onOpenLoan && <td className="p-2" />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t px-4 py-2 text-sm print:hidden">
          <span className="text-gray-500">
            Página {paginaActual + 1} de {totalPages}
          </span>
          <div className="flex gap-1">
            <Button
              size="sm" variant="outline" className="h-8"
              disabled={paginaActual === 0} onClick={() => setPage(p => Math.max(0, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" /> Anterior
            </Button>
            <Button
              size="sm" variant="outline" className="h-8"
              disabled={paginaActual >= totalPages - 1} onClick={() => setPage(p => p + 1)}
            >
              Siguiente <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
