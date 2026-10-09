// ============================================================================
// El ICONO de cada categoría de reportes
// ============================================================================
// CAMBIO SOLICITADO (2026-10-09): "en vez de emoji quiero logos personalizados que sigan el
// estilo de la página". Se usan los mismos iconos (lucide) y la misma forma de tarjeta con
// fondo de color que ya tienen el inicio, el panel y la ficha del préstamo, en vez de emojis
// —que además se dibujan distinto en cada sistema operativo y no se imprimen bien.

import React from 'react';
import {
  AlertTriangle, BarChart3, Banknote, CreditCard, Gavel, HandCoins, Landmark, Package,
  PiggyBank, Receipt, ShoppingCart, TrendingDown, Users,
} from 'lucide-react';
import type { ReportCategory, ReportCategoryIconKey } from '@/utils/reports/reportTypes';

const ICONS: Record<ReportCategoryIconKey, React.ComponentType<{ className?: string }>> = {
  resumen: BarChart3,
  financiero: PiggyBank,
  prestamos: CreditCard,
  pagos: Banknote,
  clientes: Users,
  mora: AlertTriangle,
  cobranzas: HandCoins,
  ventas: ShoppingCart,
  inventario: Package,
  caja: Landmark,
  gastos: TrendingDown,
  legal: Gavel,
};

interface Props {
  category: Pick<ReportCategory, 'icon' | 'tone'>;
  /** 'sm' para los botones de categoría, 'md' para los encabezados */
  size?: 'sm' | 'md';
  className?: string;
}

/** El icono dentro de su cuadrito de color, como el resto de las tarjetas del sistema. */
export const ReportCategoryIcon: React.FC<Props> = ({ category, size = 'sm', className = '' }) => {
  const Icon = ICONS[category.icon] || Receipt;
  const caja = size === 'md' ? 'h-8 w-8 rounded-lg' : 'h-6 w-6 rounded-md';
  const icono = size === 'md' ? 'h-4.5 w-4.5' : 'h-3.5 w-3.5';
  return (
    <span className={`inline-flex shrink-0 items-center justify-center ${caja} ${category.tone} ${className}`}>
      <Icon className={icono} />
    </span>
  );
};

/** El icono suelto, sin fondo (para líneas de texto). */
export const ReportCategoryGlyph: React.FC<{ icon: ReportCategoryIconKey; className?: string }> = ({
  icon, className = 'h-4 w-4',
}) => {
  const Icon = ICONS[icon] || Receipt;
  return <Icon className={className} />;
};
