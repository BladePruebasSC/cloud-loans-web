import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useLegalPermissions, useLegalCases } from '@/hooks/useLegalCases';
import { getCurrentDateStringForSantoDomingo, formatDateStringForSantoDomingo } from '@/utils/dateUtils';
import { daysBetweenIso, isCaseOpen, CONTACT_TYPE_LABEL, CONTACT_RESULT_LABEL } from '@/utils/legalWorkflow';
import { formatCurrency } from '@/lib/utils';
import { StageBadge, CaseStatusBadge, OverdueDays, PromiseStatusBadge, DeadlineBadge } from './LegalBadges';
import { OpenCaseDialog } from './OpenCaseDialog';
import { Gavel, ArrowUpRight } from 'lucide-react';

interface Props {
  loan: { id: string; client_id: string; next_payment_date: string; grace_period_days?: number | null; status?: string | null; collection_stage?: string | null; collection_stage_since?: string | null };
  clientName: string;
}

/**
 * Tarjeta "Cobranza / Legal" para el detalle del préstamo: etapa, mora, caso activo,
 * última gestión, promesa vigente, próxima acción y accesos al módulo legal.
 */
export const LoanCollectionCard: React.FC<Props> = ({ loan, clientName }) => {
  const navigate = useNavigate();
  const { companyId } = useAuth();
  const { can } = useLegalPermissions();
  const [legalCase, setLegalCase] = useState<any | null>(null);
  const [lastTracking, setLastTracking] = useState<any | null>(null);
  const [promise, setPromise] = useState<any | null>(null);
  const [intimation, setIntimation] = useState<any | null>(null);
  const [showOpen, setShowOpen] = useState(false);
  const [available, setAvailable] = useState(true);
  const todayIso = getCurrentDateStringForSantoDomingo();

  const load = async () => {
    const [{ data: cs, error }, { data: tr }, { data: pr }] = await Promise.all([
      supabase.from('legal_cases').select('*').eq('loan_id', loan.id).order('opened_at', { ascending: false }).limit(1),
      supabase.from('collection_tracking').select('contact_type, contact_date, result, client_response, next_contact_date').eq('loan_id', loan.id).order('contact_date', { ascending: false }).limit(1),
      supabase.from('collection_promises').select('*').eq('loan_id', loan.id).eq('status', 'pending').order('promised_date').limit(1),
    ]);
    if (error) { setAvailable(false); return; }
    const c = cs?.[0] || null;
    setLegalCase(c);
    setLastTracking(tr?.[0] || null);
    setPromise(pr?.[0] || null);
    if (c) {
      const { data: i } = await supabase.from('legal_intimations').select('intimation_number, status, deadline_date').eq('case_id', c.id).order('created_at', { ascending: false }).limit(1);
      setIntimation(i?.[0] || null);
    } else setIntimation(null);
  };
  useEffect(() => { load(); }, [loan.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!available || !can('legal.view')) return null;
  const isActive = loan.status === 'active' || loan.status === 'overdue';
  const rawDays = daysBetweenIso(String(loan.next_payment_date || '').split('T')[0], todayIso);
  const daysOverdue = isActive && rawDays !== null ? Math.max(0, rawDays - Number(loan.grace_period_days || 0)) : 0;
  const openCase = legalCase && isCaseOpen(legalCase.status) ? legalCase : null;

  return (
    <Card className="border-l-4 border-l-purple-400">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><Gavel className="h-5 w-5 text-purple-600" /> COBRANZA / LEGAL</CardTitle>
        <div className="flex gap-2">
          {openCase && <Button size="sm" onClick={() => navigate(`/cobranza/casos/${openCase.id}`)}>Ver caso <ArrowUpRight className="h-3.5 w-3.5 ml-1" /></Button>}
          {!openCase && isActive && daysOverdue > 0 && can('legal.open') && <Button size="sm" variant="outline" className="text-purple-700" onClick={() => setShowOpen(true)}><Gavel className="h-3.5 w-3.5 mr-1" /> Evaluar caso legal</Button>}
          <Button size="sm" variant="ghost" onClick={() => navigate('/cobranza?tab=bandeja')}>Módulo</Button>
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div><p className="text-gray-500 text-xs">Etapa de cobranza</p><div className="mt-1"><StageBadge stage={loan.collection_stage} />{loan.collection_stage_since && <span className="block text-[11px] text-gray-500">desde {formatDateStringForSantoDomingo(loan.collection_stage_since)}</span>}</div></div>
        <div><p className="text-gray-500 text-xs">Días de mora</p><p className="text-lg"><OverdueDays days={daysOverdue} /></p></div>
        <div><p className="text-gray-500 text-xs">Caso legal</p>{legalCase ? <div className="mt-1"><CaseStatusBadge status={legalCase.status} /><span className="block text-xs font-mono text-gray-600">{legalCase.case_number}</span></div> : <p className="text-gray-400">Sin caso</p>}</div>
        <div><p className="text-gray-500 text-xs">Intimación</p>{intimation ? <div className="mt-1 text-xs"><span className="font-mono">{intimation.intimation_number || 'borrador'}</span> · {intimation.status}{intimation.deadline_date && <div className="mt-1"><DeadlineBadge deadlineIso={intimation.deadline_date} todayIso={todayIso} /></div>}</div> : <p className="text-gray-400">—</p>}</div>
        <div className="col-span-2"><p className="text-gray-500 text-xs">Última gestión</p>{lastTracking ? <p>{formatDateStringForSantoDomingo(lastTracking.contact_date)} · {CONTACT_TYPE_LABEL[lastTracking.contact_type] || lastTracking.contact_type}{lastTracking.result && ` · ${CONTACT_RESULT_LABEL[lastTracking.result] || lastTracking.result}`}{lastTracking.client_response && <span className="block text-xs text-gray-600 truncate">{lastTracking.client_response}</span>}</p> : <p className="text-gray-400">Sin gestiones</p>}</div>
        <div><p className="text-gray-500 text-xs">Promesa vigente</p>{promise ? <p>{formatCurrency(Number(promise.amount))} el {formatDateStringForSantoDomingo(promise.promised_date)} <PromiseStatusBadge status={promise.status} /></p> : <p className="text-gray-400">—</p>}</div>
        <div><p className="text-gray-500 text-xs">Próxima acción</p>{openCase?.next_action_note ? <p className="text-xs">{openCase.next_action_note}{openCase.next_action_at && <span className="block"><DeadlineBadge deadlineIso={openCase.next_action_at} todayIso={todayIso} /></span>}</p> : lastTracking?.next_contact_date ? <p className="text-xs">Contacto {formatDateStringForSantoDomingo(lastTracking.next_contact_date)}</p> : <p className="text-gray-400">—</p>}</div>
      </CardContent>

      {showOpen && (
        <OpenCaseLauncher
          loanId={loan.id} clientName={clientName} companyId={companyId} canOverride={can('legal.override_duplicate')}
          onClose={() => setShowOpen(false)} onOpened={id => navigate(`/cobranza/casos/${id}`)}
        />
      )}
    </Card>
  );
};

/**
 * Componente hijo que se monta SOLO mientras el diálogo está abierto: así el hook completo del
 * módulo legal (que carga casos, empleados y ejecuta el barrido) no corre en cada detalle de
 * préstamo, y se respetan las reglas de hooks (nunca se llama condicionalmente).
 */
const OpenCaseLauncher: React.FC<{ loanId: string; clientName: string; companyId: string | null; canOverride: boolean; onClose: () => void; onOpened: (id: string) => void }> = ({
  loanId, clientName, companyId, canOverride, onClose, onOpened,
}) => {
  const legal = useLegalCases();
  return (
    <OpenCaseDialog
      isOpen loanId={loanId} clientName={clientName} employees={legal.employees} companyId={companyId} canOverride={canOverride}
      evaluate={legal.evaluateEligibility} onOpenCase={legal.openCase} onClose={onClose} onOpened={onOpened}
    />
  );
};
