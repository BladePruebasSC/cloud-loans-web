import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, XCircle, AlertTriangle, Gavel } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import type { EligibilityResult, LegalEmployee } from '@/hooks/useLegalCases';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  loanId: string | null;
  clientName: string;
  employees: LegalEmployee[];
  companyId: string | null;
  canOverride: boolean;
  evaluate: (loanId: string) => Promise<EligibilityResult | null>;
  onOpenCase: (p: { loanId: string; reason: string; priority: string; assignedTo?: string | null; duplicateJustification?: string | null }) => Promise<{ ok: boolean; data: string | null }>;
  onOpened?: (caseId: string) => void;
}

/** Evaluación de elegibilidad + apertura del caso (pre-legal). No inicia intimación. */
export const OpenCaseDialog: React.FC<Props> = ({ isOpen, onClose, loanId, clientName, employees, companyId, canOverride, evaluate, onOpenCase, onOpened }) => {
  const [evaluation, setEvaluation] = useState<EligibilityResult | null>(null);
  const [loadingEval, setLoadingEval] = useState(false);
  const [reason, setReason] = useState('');
  const [priority, setPriority] = useState('medium');
  const [assignedTo, setAssignedTo] = useState<string>('');
  const [justification, setJustification] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen && loanId) {
      setEvaluation(null); setReason(''); setJustification(''); setPriority('medium'); setAssignedTo('');
      setLoadingEval(true);
      evaluate(loanId).then(r => { setEvaluation(r); setLoadingEval(false); });
    }
  }, [isOpen, loanId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!loanId) return null;
  const hasActiveCase = !!evaluation?.active_case_id;
  const blockedByOther = (evaluation?.blockers || []).filter(b => !/caso legal activo/i.test(b));
  const canSubmit = !!evaluation && reason.trim().length >= 5 && (!hasActiveCase || (canOverride && justification.trim().length >= 10));

  const submit = async () => {
    setSaving(true);
    const r = await onOpenCase({ loanId, reason: reason.trim(), priority, assignedTo: assignedTo || null, duplicateJustification: hasActiveCase ? justification.trim() : null });
    setSaving(false);
    if (r.ok && r.data) { onClose(); onOpened?.(r.data); }
  };

  return (
    <Dialog open={isOpen} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Gavel className="h-5 w-5 text-purple-600" /> Abrir caso de cobranza legal — {clientName}</DialogTitle>
        </DialogHeader>

        {loadingEval && <p className="text-sm text-gray-500 py-6 text-center">Evaluando elegibilidad…</p>}

        {evaluation && (
          <div className="space-y-4">
            <div className={`rounded-lg border p-3 text-sm ${evaluation.status === 'eligible' ? 'bg-green-50 border-green-200' : evaluation.status === 'pending_review' ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}`}>
              <p className="font-semibold mb-1">
                {evaluation.status === 'eligible' ? '✅ ELEGIBLE para proceso legal' : evaluation.status === 'pending_review' ? '⚠️ PENDIENTE DE REVISIÓN' : '⛔ NO ELEGIBLE'}
              </p>
              <p className="text-xs text-gray-600">La evaluación usa los umbrales configurados en Mi Empresa → Cobranza legal. Abrir el caso NO emite ninguna intimación: inicia la etapa pre-legal.</p>
            </div>

            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <div className="space-y-1">
                <p className="font-semibold text-gray-700">Razones</p>
                {evaluation.reasons.length === 0 && <p className="text-gray-500">—</p>}
                {evaluation.reasons.map((r, i) => <p key={i} className="flex gap-1 text-green-800"><CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />{r}</p>)}
              </div>
              <div className="space-y-1">
                <p className="font-semibold text-gray-700">Bloqueos / pendientes</p>
                {blockedByOther.length === 0 && evaluation.review.length === 0 && !hasActiveCase && <p className="text-gray-500">Ninguno</p>}
                {blockedByOther.map((b, i) => <p key={`b${i}`} className="flex gap-1 text-red-700"><XCircle className="h-4 w-4 shrink-0 mt-0.5" />{b}</p>)}
                {evaluation.review.map((b, i) => <p key={`r${i}`} className="flex gap-1 text-amber-700"><AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />{b}</p>)}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-gray-50 rounded-lg p-3">
              <div><span className="text-gray-500">Días de mora</span><p className="font-semibold">{evaluation.metrics.days_overdue}</p></div>
              <div><span className="text-gray-500">Cuotas vencidas</span><p className="font-semibold">{evaluation.metrics.overdue_installments}</p></div>
              <div><span className="text-gray-500">Saldo</span><p className="font-semibold">{formatCurrency(Number(evaluation.metrics.remaining_balance || 0))}</p></div>
              <div><span className="text-gray-500">Mora</span><p className="font-semibold">{formatCurrency(Number(evaluation.metrics.late_fee || 0))}</p></div>
              <div><span className="text-gray-500">Gestiones</span><p className="font-semibold">{evaluation.metrics.contacts}</p></div>
              <div><span className="text-gray-500">Promesas rotas</span><p className="font-semibold">{evaluation.metrics.broken_promises}</p></div>
              <div><span className="text-gray-500">Garantías</span><p className="font-semibold">{evaluation.metrics.guarantees}</p></div>
              <div><span className="text-gray-500">Score CRM</span><p className="font-semibold">{evaluation.metrics.crm_score ?? '—'}</p></div>
            </div>

            {hasActiveCase && (
              <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm space-y-2">
                <p className="font-semibold text-red-800">Ya existe un caso legal activo para este préstamo.</p>
                {canOverride ? (
                  <>
                    <p className="text-red-700 text-xs">Tienes permiso para reemplazarlo. El caso anterior se cerrará como "error administrativo" y quedará enlazado al nuevo. Justifica el motivo (mín. 10 caracteres).</p>
                    <Textarea value={justification} onChange={e => setJustification(e.target.value)} rows={2} placeholder="Justificación del nuevo caso…" />
                  </>
                ) : (
                  <p className="text-red-700 text-xs">No puedes abrir otro. Trabaja sobre el caso existente o pide a un usuario con permiso "legal.override_duplicate".</p>
                )}
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Prioridad</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Baja</SelectItem><SelectItem value="medium">Media</SelectItem>
                    <SelectItem value="high">Alta</SelectItem><SelectItem value="critical">Crítica</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Responsable</Label>
                <Select value={assignedTo || 'me'} onValueChange={v => setAssignedTo(v === 'me' ? '' : v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="me">Yo (usuario actual)</SelectItem>
                    {companyId && <SelectItem value={companyId}>Dueño</SelectItem>}
                    {employees.map(e => <SelectItem key={e.auth_user_id} value={e.auth_user_id}>{e.full_name}{e.role ? ` (${e.role})` : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Motivo de apertura *</Label>
              <Textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="Ej.: 65 días de mora, 2 promesas incumplidas, sin respuesta a 4 gestiones…" />
            </div>

            {evaluation.status === 'not_eligible' && blockedByOther.length > 0 && (
              <p className="text-xs text-amber-700">Puedes abrir el caso aunque no cumpla los umbrales (queda registrado en la auditoría), pero no podrás solicitar la intimación hasta completar el expediente.</p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button onClick={submit} disabled={!canSubmit || saving}>{saving ? 'Abriendo…' : 'Abrir caso (pre-legal)'}</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
