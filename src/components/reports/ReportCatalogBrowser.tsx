// ============================================================================
// El CATÁLOGO: buscar y elegir un reporte
// ============================================================================
// Buscador arriba (encuentra por nombre, por lo que contesta el reporte o por palabras sueltas
// como "mora", "zona", "ticket"), y debajo las categorías. Favoritos y recientes primero,
// porque es lo que se abre todos los días.

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Clock, Search, Star } from 'lucide-react';
import { REPORT_CATEGORIES, type ReportDefinition } from '@/utils/reports/reportTypes';
import { groupByCategory, searchReports } from '@/utils/reports/reportCatalog';
import type { ReportData } from '@/utils/reports/reportDataset';

interface Props {
  reports: ReportDefinition<ReportData>[];
  query: string;
  onQueryChange: (q: string) => void;
  onOpen: (reportId: string) => void;
  favorites: string[];
  onToggleFavorite: (reportId: string) => void;
  recents: string[];
  /** Categoría seleccionada; null = todas */
  category: string | null;
  onCategoryChange: (category: string | null) => void;
}

const ReportCard: React.FC<{
  report: ReportDefinition<ReportData>;
  favorite: boolean;
  onOpen: () => void;
  onToggleFavorite: () => void;
}> = ({ report, favorite, onOpen, onToggleFavorite }) => (
  <div className="group relative rounded-lg border bg-white p-3 transition hover:border-blue-300 hover:shadow-sm">
    <button type="button" className="w-full text-left" onClick={onOpen}>
      <div className="pr-7 font-medium text-gray-900">{report.name}</div>
      <div className="mt-1 text-xs leading-snug text-gray-500">{report.description}</div>
    </button>
    <button
      type="button"
      className="absolute right-2 top-2 rounded p-1 text-gray-300 hover:text-amber-500"
      onClick={onToggleFavorite}
      title={favorite ? 'Quitar de favoritos' : 'Marcar como favorito'}
      aria-label={favorite ? 'Quitar de favoritos' : 'Marcar como favorito'}
    >
      <Star className={`h-4 w-4 ${favorite ? 'fill-amber-400 text-amber-400' : ''}`} />
    </button>
  </div>
);

export const ReportCatalogBrowser: React.FC<Props> = ({
  reports, query, onQueryChange, onOpen, favorites, onToggleFavorite, recents,
  category, onCategoryChange,
}) => {
  const encontrados = searchReports(reports, query);
  const visibles = category ? encontrados.filter(r => r.category === category) : encontrados;
  const porCategoria = groupByCategory(visibles);
  const favoritos = reports.filter(r => favorites.includes(r.id));
  const recientes = recents
    .map(id => reports.find(r => r.id === id))
    .filter((r): r is ReportDefinition<ReportData> => !!r)
    .slice(0, 6);

  const buscando = query.trim().length > 0;

  return (
    <div className="space-y-5">
      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
        <Input
          className="h-11 pl-9 text-base"
          placeholder="Buscar un reporte: mora, cobrado hoy, ventas, gastos por categoría…"
          value={query}
          onChange={e => onQueryChange(e.target.value)}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm" variant={category === null ? 'default' : 'outline'} className="h-8"
          onClick={() => onCategoryChange(null)}
        >
          Todas
        </Button>
        {REPORT_CATEGORIES.map(c => {
          const cuantos = encontrados.filter(r => r.category === c.id).length;
          if (cuantos === 0) return null;
          return (
            <Button
              key={c.id} size="sm" className="h-8"
              variant={category === c.id ? 'default' : 'outline'}
              onClick={() => onCategoryChange(category === c.id ? null : c.id)}
              title={c.description}
            >
              <span className="mr-1">{c.icon}</span>{c.label}
              <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">{cuantos}</Badge>
            </Button>
          );
        })}
      </div>

      {!buscando && !category && favoritos.length > 0 && (
        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Star className="h-4 w-4 fill-amber-400 text-amber-400" /> Favoritos
          </h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {favoritos.map(r => (
              <ReportCard
                key={r.id} report={r} favorite
                onOpen={() => onOpen(r.id)} onToggleFavorite={() => onToggleFavorite(r.id)}
              />
            ))}
          </div>
        </section>
      )}

      {!buscando && !category && recientes.length > 0 && (
        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Clock className="h-4 w-4 text-gray-400" /> Abiertos recientemente
          </h3>
          <div className="flex flex-wrap gap-2">
            {recientes.map(r => (
              <Button key={r.id} variant="outline" size="sm" className="h-8" onClick={() => onOpen(r.id)}>
                {r.name}
              </Button>
            ))}
          </div>
        </section>
      )}

      {visibles.length === 0 ? (
        <div className="rounded-xl border bg-white p-8 text-center">
          <Search className="mx-auto h-8 w-8 text-gray-300" />
          <p className="mt-2 font-medium text-gray-800">No hay ningún reporte que se llame así</p>
          <p className="mt-1 text-sm text-gray-500">
            Prueba con una palabra más corta: mora, cobrado, cliente, ventas, gastos, caja.
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => { onQueryChange(''); onCategoryChange(null); }}>
            Ver todos los reportes
          </Button>
        </div>
      ) : (
        REPORT_CATEGORIES.filter(c => porCategoria.has(c.id)).map(c => (
          <section key={c.id}>
            <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-gray-700">
              <span>{c.icon}</span> {c.label}
            </h3>
            <p className="mb-2 text-xs text-gray-500">{c.description}</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {porCategoria.get(c.id)!.map(r => (
                <ReportCard
                  key={r.id} report={r} favorite={favorites.includes(r.id)}
                  onOpen={() => onOpen(r.id)} onToggleFavorite={() => onToggleFavorite(r.id)}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
};
