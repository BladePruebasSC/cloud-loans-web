import React from 'react';
import { Badge } from '@/components/ui/badge';
import {
  CASE_STATUS_META, STAGE_META, INTIMATION_STATUS_META, PRIORITY_META, TASK_STATUS_META, PROMISE_STATUS_META,
  DEADLINE_CLASS, deadlineLevel, deadlineText, type LegalCaseStatus, type CollectionStage, type IntimationStatus,
} from '@/utils/legalWorkflow';

export const CaseStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const m = CASE_STATUS_META[status as LegalCaseStatus] || { label: status, className: 'bg-gray-100 text-gray-700' };
  return <Badge className={`${m.className} font-semibold`}>{m.label}</Badge>;
};

export const StageBadge: React.FC<{ stage?: string | null }> = ({ stage }) => {
  if (!stage) return <Badge className="bg-gray-100 text-gray-500">Sin etapa</Badge>;
  const m = STAGE_META[stage as CollectionStage] || { label: stage, className: 'bg-gray-100 text-gray-700' };
  return <Badge className={`${m.className} font-semibold`}>{m.label}</Badge>;
};

export const IntimationStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const m = INTIMATION_STATUS_META[status as IntimationStatus] || { label: status, className: 'bg-gray-100 text-gray-700' };
  return <Badge className={m.className}>{m.label}</Badge>;
};

export const PriorityBadge: React.FC<{ priority: string }> = ({ priority }) => {
  const m = PRIORITY_META[priority] || PRIORITY_META.medium;
  return <Badge variant="outline" className={`${m.className} border-0`}>{m.label}</Badge>;
};

export const TaskStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const m = TASK_STATUS_META[status] || { label: status, className: 'bg-gray-100 text-gray-700' };
  return <Badge className={m.className}>{m.label}</Badge>;
};

export const PromiseStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const m = PROMISE_STATUS_META[status] || { label: status, className: 'bg-gray-100 text-gray-700' };
  return <Badge className={m.className}>{m.label}</Badge>;
};

/** Semáforo de plazo: verde / amarillo / rojo */
export const DeadlineBadge: React.FC<{ deadlineIso?: string | null; todayIso: string; warningDays?: number }> = ({ deadlineIso, todayIso, warningDays = 3 }) => {
  const { level } = deadlineLevel(deadlineIso, todayIso, warningDays);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${DEADLINE_CLASS[level]}`}>
      <span className={`w-2 h-2 rounded-full ${level === 'red' ? 'bg-red-500' : level === 'yellow' ? 'bg-amber-500' : level === 'green' ? 'bg-green-500' : 'bg-gray-400'}`} />
      {deadlineText(deadlineIso, todayIso, warningDays)}
    </span>
  );
};

export const OverdueDays: React.FC<{ days: number }> = ({ days }) => (
  <span className={`font-semibold ${days > 60 ? 'text-red-700' : days > 30 ? 'text-red-600' : days > 0 ? 'text-amber-600' : 'text-green-700'}`}>
    {days > 0 ? `${days} d` : 'Al día'}
  </span>
);
