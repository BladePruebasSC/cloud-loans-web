import React from 'react';
import { Badge } from '@/components/ui/badge';
import {
  CATEGORY_META,
  BEHAVIOR_META,
  RISK_META,
  SCORE_MAX,
  type ClientCategory,
  type PaymentBehavior,
  type RiskLevel,
} from '@/utils/clientScoring';

export const scoreColorClass = (score: number) =>
  score >= 700 ? 'text-green-700' : score >= 450 ? 'text-amber-600' : 'text-red-600';

export const scoreBarClass = (score: number) =>
  score >= 700 ? 'bg-green-500' : score >= 450 ? 'bg-amber-500' : 'bg-red-500';

export const CategoryBadge: React.FC<{ category: ClientCategory; manual?: boolean; className?: string }> = ({
  category,
  manual,
  className = '',
}) => {
  const meta = CATEGORY_META[category];
  return (
    <Badge
      variant="outline"
      className={`${meta.className} border font-semibold gap-1 ${className}`}
      title={manual ? 'Categoría asignada manualmente' : meta.description}
    >
      <span aria-hidden>{meta.emoji}</span>
      {meta.label}
      {manual && <span className="text-[10px] opacity-70">(manual)</span>}
    </Badge>
  );
};

export const BehaviorBadge: React.FC<{ behavior: PaymentBehavior; className?: string }> = ({ behavior, className = '' }) => (
  <Badge variant="secondary" className={`${BEHAVIOR_META[behavior].className} ${className}`}>
    {BEHAVIOR_META[behavior].label}
  </Badge>
);

export const RiskLabel: React.FC<{ risk: RiskLevel }> = ({ risk }) => (
  <span className={`text-xs font-medium ${RISK_META[risk].className}`}>{RISK_META[risk].label}</span>
);

/** Número de score + barra de progreso proporcional. */
export const ScoreMeter: React.FC<{ score: number; size?: 'sm' | 'lg' }> = ({ score, size = 'sm' }) => {
  const pct = Math.max(0, Math.min(100, (score / SCORE_MAX) * 100));
  return (
    <div className={size === 'lg' ? 'space-y-2' : 'space-y-1'}>
      <div className="flex items-baseline gap-1">
        <span className={`font-bold ${size === 'lg' ? 'text-4xl' : 'text-lg'} ${scoreColorClass(score)}`}>{score}</span>
        <span className="text-xs text-gray-500">/ {SCORE_MAX}</span>
      </div>
      <div className={`w-full bg-gray-200 rounded-full ${size === 'lg' ? 'h-3' : 'h-1.5'}`}>
        <div className={`${scoreBarClass(score)} rounded-full h-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};
