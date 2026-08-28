import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PasswordVerificationDialog } from '@/components/common/PasswordVerificationDialog';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils';
import { formatDateStringForSantoDomingo } from '@/utils/dateUtils';
import {
  NOTIFICATION_METHOD_LABEL, NOTIFICATION_RESULT_LABEL, findUnresolvedPlaceholders, INTIMATION_PLACEHOLDERS,
} from '@/utils/legalWorkflow';
import { renderIntimation, generateIntimationPdf, type IntimationContext } from '@/utils/intimationDocument';
import { legalRpc, uploadCaseDocument, getDocumentUrl, type LegalCaseRow, type LegalIntimationRow, type LegalApprovalRow, type NotificationAttemptRow, type LegalSettings, type CaseDocumentRow } from '@/hooks/useLegalCases';
import { IntimationStatusBadge, DeadlineBadge } from './LegalBadges';
import { FileText, Send, CheckCircle2, XCircle, Eye, Download, BellRing, Upload, Printer } from 'lucide-react';

interface Props {
  legalCase: LegalCaseRow;
  intimations: LegalIntimationRow[];
  approvals: LegalApprovalRow[];
  notifications: NotificationAttemptRow[];
  documents: CaseDocumentRow[];
  settings: LegalSettings | null;
  todayIso: string;
  companyId: string;
  representativeName: string;
  daysOverdue: number;
  overdueInstallments: Array<{ installment_number: number; due_date: string; total_amount: number }>;
  checklistComplete: boolean | null;
  can: (k: string) => boolean;
  employeeName: (id?: string | null) => string;
  onChanged: () => void;
}

export const IntimationPanel: React.FC<Props> = ({
  legalCase, intimations, approvals, notifications, documents, settings, todayIso, companyId, representativeName,
  daysOverdue, overdueInstallments, checklistComplete, can, employeeName, onChanged,
}) => {
  const current = intimations[0] || null;
  const currentApproval = current ? approvals.find(a => a.id === current.approval_id) : null;
  const isOpen = legalCase.status !== 'resolved' && legalCase.status !== 'closed';

  const [requestNotes, setRequestNotes] = useState('');
  const [decisionNotes, setDecisionNotes] = useState('');
  const [content, setContent] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [confirmIssue, setConfirmIssue] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [showNotify, setShowNotify] = useState(false);
  const [notifForm, setNotifForm] = useState({ date: todayIso, time: '09:00', method: 'physical', result: 'delivered', notified_by: '', received_by: '', notes: '', file: null as File | null });
  const [responseNotes, setResponseNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const ctx: IntimationContext | null = useMemo(() => {
    if (!legalCase.client || !legalCase.loan) return null;
    return {
      company: { name: settings?.company_name, phone: settings?.phone, address: settings?.address, logo_url: settings?.logo_url },
      representativeName,
      client: legalCase.client,
      loan: { id: legalCase.loan_id, amount: legalCase.loan.amount, remaining_balance: legalCase.loan.remaining_balance, current_late_fee: legalCase.loan.current_late_fee },
      caseNumber: legalCase.case_number,
      daysOverdue,
      overdueInstallments,
      deadlineDays: settings?.deadline_days ?? 10,
      claimedAmount: Number(current?.claimed_amount || legalCase.pending_amount || 0),
    };
  }, [legalCase, settings, representativeName, daysOverdue, overdueInstallments, current]);

  const draftContent = useMemo(() => {
    if (content !== null) return content;
    if (current?.content) return current.content;
    return ctx ? renderIntimation(settings?.intimation_template, ctx) : '';
  }, [content, current, ctx, settings]);

  const breakdown = useMemo(() => ({
    capital_interest: Number(legalCase.loan?.remaining_balance || 0),
    late_fee: Number(legalCase.loan?.current_late_fee || 0),
    overdue_installments: overdueInstallments.map(i => ({ n: i.installment_number, due: i.due_date, amount: i.total_amount })),
    days_overdue: daysOverdue,
    claimed_amount: Number(legalCase.loan?.remaining_balance || 0) + Number(legalCase.loan?.current_late_fee || 0),
  }), [legalCase, overdueInstallments, daysOverdue]);

  // ---------------- acciones ----------------
  const requestIntimation = async () => {
    setBusy(true);
    const r = await legalRpc('legal_request_intimation', { p_case_id: legalCase.id, p_notes: requestNotes || null }, 'Solicitud de intimación enviada a aprobación');
    setBusy(false);
    if (r.ok) { setRequestNotes(''); onChanged(); }
  };
  const review = async () => {
    if (!currentApproval) return;
    setBusy(true);
    const r = await legalRpc('legal_review_approval', { p_approval_id: currentApproval.id, p_notes: decisionNotes || null }, 'Solicitud revisada');
    setBusy(false);
    if (r.ok) { setDecisionNotes(''); onChanged(); }
  };
  const decide = async (approve: boolean) => {
    if (!currentApproval) return;
    if (!approve && decisionNotes.trim().length < 5) { toast.error('Indica el motivo del rechazo'); return; }
    setBusy(true);
    const r = await legalRpc('legal_decide_approval', { p_approval_id: currentApproval.id, p_approve: approve, p_notes: decisionNotes || null }, approve ? 'Intimación aprobada' : 'Intimación rechazada');
    setBusy(false);
    if (r.ok) { setDecisionNotes(''); onChanged(); }
  };
  const issue = async () => {
    if (!current || !ctx) return;
    const unresolved = findUnresolvedPlaceholders(draftContent);
    if (unresolved.length) { toast.error('Hay placeholders sin resolver', { description: unresolved.join(', ') }); return; }
    setIssuing(true);
    try {
      const pdf = await generateIntimationPdf(draftContent, settings?.logo_url, `Expediente ${legalCase.case_number} · Generado ${formatDateStringForSantoDomingo(todayIso)}`);
      const docId = await uploadCaseDocument({ companyId, caseId: legalCase.id, file: pdf, fileName: `intimacion-${legalCase.case_number}.pdf`, title: `Intimación ${legalCase.case_number}`, documentType: 'legal_intimation', description: 'Carta de intimación emitida' });
      const r = await legalRpc<string>('legal_issue_intimation', { p_intimation_id: current.id, p_content: draftContent, p_breakdown: breakdown, p_claimed_amount: breakdown.claimed_amount, p_document_id: docId }, undefined);
      if (r.ok) { toast.success(`Intimación ${r.data} emitida`); setContent(null); onChanged(); }
    } catch (e: any) {
      toast.error('No se pudo emitir', { description: e?.message });
    } finally { setIssuing(false); }
  };
  const registerNotification = async () => {
    if (!current) return;
    setBusy(true);
    try {
      let evidenceId: string | null = null;
      if (notifForm.file) {
        evidenceId = await uploadCaseDocument({ companyId, caseId: legalCase.id, file: notifForm.file, fileName: notifForm.file.name, title: `Evidencia de notificación ${current.intimation_number || ''}`, documentType: 'legal_notification_proof' });
        if (!evidenceId) { setBusy(false); return; }
      }
      const r = await legalRpc('legal_register_notification', {
        p_intimation_id: current.id, p_notified_at: `${notifForm.date}T${notifForm.time}:00`, p_method: notifForm.method, p_result: notifForm.result,
        p_notified_by: notifForm.notified_by || null, p_received_by: notifForm.received_by || null, p_evidence_document_id: evidenceId, p_notes: notifForm.notes || null,
      }, 'Notificación registrada');
      if (r.ok) { setShowNotify(false); setNotifForm(f => ({ ...f, notified_by: '', received_by: '', notes: '', file: null })); onChanged(); }
    } finally { setBusy(false); }
  };
  const recordResponse = async () => {
    if (!current || responseNotes.trim().length < 3) return;
    setBusy(true);
    const r = await legalRpc('legal_record_intimation_response', { p_intimation_id: current.id, p_notes: responseNotes }, 'Respuesta registrada');
    setBusy(false);
    if (r.ok) { setResponseNotes(''); onChanged(); }
  };
  const openDocument = async (docId: string | null) => {
    const d = documents.find(x => x.id === docId);
    if (!d) { toast.error('Documento no encontrado'); return; }
    const url = await getDocumentUrl(d);
    if (url) window.open(url, '_blank');
  };
  const printPreview = async () => {
    const pdf = await generateIntimationPdf(draftContent, settings?.logo_url, `BORRADOR · Expediente ${legalCase.case_number}`);
    window.open(URL.createObjectURL(pdf), '_blank');
  };

  const notifsForCurrent = current ? notifications.filter(n => n.intimation_id === current.id) : [];

  return (
    <div className="space-y-4">
      {/* Estado / flujo */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4" /> Intimación</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {!current && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">Aún no hay solicitud de intimación para este caso. Para solicitarla el expediente debe estar completo y necesitas el permiso <code>legal.request_intimation</code>. La solicitud pasa por revisión (supervisor) y aprobación (legal) antes de poder emitirse.</p>
              {checklistComplete === false && <p className="text-sm text-amber-700 font-medium">⚠️ Expediente incompleto: revisa la pestaña Expediente.</p>}
              {isOpen && can('legal.request_intimation') && (
                <div className="space-y-2">
                  <Textarea value={requestNotes} onChange={e => setRequestNotes(e.target.value)} rows={2} placeholder="Notas para quien revisa/aprueba (opcional)" />
                  <Button onClick={requestIntimation} disabled={busy || checklistComplete === false}><Send className="h-4 w-4 mr-1" /> Solicitar intimación</Button>
                </div>
              )}
            </div>
          )}

          {current && (
            <>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <IntimationStatusBadge status={current.status} />
                {current.intimation_number && <span className="font-mono font-semibold">{current.intimation_number}</span>}
                <span>Reclamado: <b>{formatCurrency(Number(current.claimed_amount || 0))}</b></span>
                {current.issued_at && <span>Emitida: {formatDateStringForSantoDomingo(current.issued_at.split('T')[0])}</span>}
                {current.notified_at && <span>Notificada: {formatDateStringForSantoDomingo(current.notified_at.split('T')[0])}</span>}
                {current.deadline_date && <DeadlineBadge deadlineIso={current.deadline_date} todayIso={todayIso} warningDays={settings?.followup_days ?? 3} />}
                {current.document_id && <Button size="sm" variant="outline" onClick={() => openDocument(current.document_id)}><Download className="h-3.5 w-3.5 mr-1" /> PDF</Button>}
              </div>

              {/* Aprobación */}
              {currentApproval && (
                <div className="rounded-lg border bg-gray-50 p-3 text-sm space-y-1">
                  <p className="font-semibold">Aprobación · <span className="capitalize">{currentApproval.status}</span></p>
                  <p>Solicitada por <b>{employeeName(currentApproval.requested_by)}</b> el {new Date(currentApproval.requested_at).toLocaleString('es-DO')}{currentApproval.request_notes && ` — ${currentApproval.request_notes}`}</p>
                  {currentApproval.reviewed_at && <p>Revisada por <b>{employeeName(currentApproval.reviewed_by)}</b> el {new Date(currentApproval.reviewed_at).toLocaleString('es-DO')}{currentApproval.review_notes && ` — ${currentApproval.review_notes}`}</p>}
                  {currentApproval.decided_at && <p className={currentApproval.status === 'approved' ? 'text-green-700' : 'text-red-700'}>{currentApproval.status === 'approved' ? 'Aprobada' : 'Rechazada'} por <b>{employeeName(currentApproval.decided_by)}</b> el {new Date(currentApproval.decided_at).toLocaleString('es-DO')}{currentApproval.decision_notes && ` — ${currentApproval.decision_notes}`}</p>}

                  {isOpen && (currentApproval.status === 'requested' || currentApproval.status === 'reviewed') && (can('legal.review') || can('legal.approve')) && (
                    <div className="pt-2 space-y-2">
                      <Textarea value={decisionNotes} onChange={e => setDecisionNotes(e.target.value)} rows={2} placeholder="Observaciones (obligatorias si rechazas)" />
                      <div className="flex flex-wrap gap-2">
                        {currentApproval.status === 'requested' && can('legal.review') && <Button size="sm" variant="outline" onClick={review} disabled={busy}><Eye className="h-3.5 w-3.5 mr-1" /> Marcar como revisada</Button>}
                        {can('legal.approve') && <Button size="sm" onClick={() => decide(true)} disabled={busy}><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Aprobar</Button>}
                        {can('legal.approve') && <Button size="sm" variant="destructive" onClick={() => decide(false)} disabled={busy}><XCircle className="h-3.5 w-3.5 mr-1" /> Rechazar</Button>}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Redacción y emisión */}
              {isOpen && current.status === 'approved' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Contenido de la carta</Label>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setShowPreview(true)}>Placeholders</Button>
                      <Button size="sm" variant="outline" onClick={() => setContent(ctx ? renderIntimation(settings?.intimation_template, ctx) : '')}>Regenerar desde plantilla</Button>
                      <Button size="sm" variant="outline" onClick={printPreview}><Printer className="h-3.5 w-3.5 mr-1" /> Vista previa PDF</Button>
                    </div>
                  </div>
                  <Textarea value={draftContent} onChange={e => setContent(e.target.value)} rows={16} className="font-mono text-xs" />
                  <p className="text-xs text-amber-700">El texto proviene de la plantilla configurada por la empresa y debe estar revisado por el asesor legal. Al emitir, el contenido y el desglose quedan congelados y se genera el PDF.</p>
                  {can('legal.issue') && <Button onClick={() => setConfirmIssue(true)} disabled={issuing}><FileText className="h-4 w-4 mr-1" /> {issuing ? 'Emitiendo…' : 'Emitir intimación'}</Button>}
                </div>
              )}

              {current.content && current.status !== 'approved' && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-gray-700 font-medium">Ver contenido emitido</summary>
                  <pre className="whitespace-pre-wrap font-mono text-xs bg-gray-50 border rounded p-3 mt-2">{current.content}</pre>
                </details>
              )}

              {/* Notificación */}
              {['issued', 'not_notified', 'notified', 'expired'].includes(current.status) && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-sm flex items-center gap-1"><BellRing className="h-4 w-4" /> Notificaciones ({notifsForCurrent.length})</p>
                    {isOpen && can('legal.manage') && ['issued', 'not_notified'].includes(current.status) && <Button size="sm" onClick={() => setShowNotify(true)}>Registrar notificación</Button>}
                  </div>
                  {notifsForCurrent.length === 0 && <p className="text-xs text-gray-500">Sin intentos registrados.</p>}
                  {notifsForCurrent.map(n => (
                    <div key={n.id} className="border rounded-lg p-2 text-sm flex flex-wrap justify-between gap-2">
                      <div>
                        <p><b>{NOTIFICATION_METHOD_LABEL[n.method] || n.method}</b> · {new Date(n.notified_at).toLocaleString('es-DO')} · <span className={n.result === 'delivered' ? 'text-green-700' : 'text-amber-700'}>{NOTIFICATION_RESULT_LABEL[n.result] || n.result}</span></p>
                        <p className="text-xs text-gray-600">{n.notified_by && `Notificó: ${n.notified_by}. `}{n.received_by && `Recibió: ${n.received_by}. `}{n.notes}</p>
                      </div>
                      {n.evidence_document_id && <Button size="sm" variant="outline" onClick={() => openDocument(n.evidence_document_id)}><Eye className="h-3.5 w-3.5 mr-1" /> Evidencia</Button>}
                    </div>
                  ))}
                  {isOpen && can('legal.manage') && ['notified', 'expired'].includes(current.status) && (
                    <div className="flex gap-2 items-start pt-1">
                      <Textarea value={responseNotes} onChange={e => setResponseNotes(e.target.value)} rows={2} placeholder="Respuesta del cliente a la intimación (si la hubo)" className="flex-1" />
                      <Button variant="outline" onClick={recordResponse} disabled={busy}>Registrar respuesta</Button>
                    </div>
                  )}
                </div>
              )}
              {current.response_notes && <p className="text-sm bg-teal-50 border border-teal-200 rounded p-2"><b>Respuesta del cliente:</b> {current.response_notes}</p>}
            </>
          )}

          {intimations.length > 1 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-gray-600">Intimaciones anteriores ({intimations.length - 1})</summary>
              <ul className="mt-2 space-y-1">{intimations.slice(1).map(i => <li key={i.id} className="flex gap-2 items-center"><IntimationStatusBadge status={i.status} /> {i.intimation_number || 'sin número'} · {new Date(i.created_at).toLocaleDateString('es-DO')}</li>)}</ul>
            </details>
          )}
        </CardContent>
      </Card>

      {/* Placeholders */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Placeholders disponibles</DialogTitle></DialogHeader>
          <ul className="text-sm space-y-1 max-h-96 overflow-y-auto">
            {INTIMATION_PLACEHOLDERS.map(p => <li key={p.key}><code className="bg-gray-100 px-1 rounded">{p.key}</code> — {p.description}</li>)}
          </ul>
        </DialogContent>
      </Dialog>

      {/* Registrar notificación */}
      <Dialog open={showNotify} onOpenChange={setShowNotify}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Registrar notificación de la intimación</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Fecha</Label><Input type="date" value={notifForm.date} onChange={e => setNotifForm({ ...notifForm, date: e.target.value })} /></div>
              <div className="space-y-1"><Label>Hora</Label><Input type="time" value={notifForm.time} onChange={e => setNotifForm({ ...notifForm, time: e.target.value })} /></div>
              <div className="space-y-1"><Label>Medio</Label>
                <Select value={notifForm.method} onValueChange={v => setNotifForm({ ...notifForm, method: v })}><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(NOTIFICATION_METHOD_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1"><Label>Resultado</Label>
                <Select value={notifForm.result} onValueChange={v => setNotifForm({ ...notifForm, result: v })}><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(NOTIFICATION_RESULT_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1"><Label>Persona que notifica</Label><Input value={notifForm.notified_by} onChange={e => setNotifForm({ ...notifForm, notified_by: e.target.value })} /></div>
              <div className="space-y-1"><Label>Persona que recibe</Label><Input value={notifForm.received_by} onChange={e => setNotifForm({ ...notifForm, received_by: e.target.value })} /></div>
            </div>
            <div className="space-y-1"><Label>Observaciones</Label><Textarea rows={2} value={notifForm.notes} onChange={e => setNotifForm({ ...notifForm, notes: e.target.value })} /></div>
            <div className="space-y-1">
              <Label className="flex items-center gap-1"><Upload className="h-3.5 w-3.5" /> Evidencia (foto, acuse, PDF) {settings?.require_notification_evidence && notifForm.result === 'delivered' && <span className="text-red-600">* obligatoria</span>}</Label>
              <Input type="file" accept="image/*,application/pdf" onChange={e => setNotifForm({ ...notifForm, file: e.target.files?.[0] || null })} />
            </div>
            <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setShowNotify(false)}>Cancelar</Button><Button onClick={registerNotification} disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <PasswordVerificationDialog
        isOpen={confirmIssue}
        onClose={() => setConfirmIssue(false)}
        onVerify={() => { setConfirmIssue(false); issue(); }}
        title="Emitir intimación"
        description="Esta acción congela el contenido de la carta, le asigna número y genera el PDF. Confirma con tu contraseña."
        entityName="intimación"
      />
    </div>
  );
};
