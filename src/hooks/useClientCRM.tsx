import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { getCurrentDateStringForSantoDomingo } from '@/utils/dateUtils';
import {
  scoreClient,
  type ClientScore,
  type ClientCategory,
  type ScoringLoan,
  type ScoringPayment,
  type ScoringTracking,
  type ScoringSale,
  type ScoringPawn,
} from '@/utils/clientScoring';

// ============================================================================
// Hook de datos del CRM
// ============================================================================
// Carga TODO lo necesario para calificar a los clientes de la empresa en pocas
// consultas (agrupadas por lotes de IDs para no exceder el límite de la URL), calcula
// el score de cada uno con el motor puro y persiste el resultado:
//   · snapshot en `client_crm_profiles` (upsert por client_id)
//   · `clients.credit_score` sincronizado, para que la pantalla de Clientes lo muestre
//
// La persistencia es "best effort": si la tabla aún no existe (migración sin aplicar)
// el CRM sigue funcionando en memoria y avisa una sola vez.
// ============================================================================

export interface CRMClient {
  id: string;
  full_name: string;
  dni: string;
  phone: string;
  email: string | null;
  address: string | null;
  city: string | null;
  status: string | null;
  credit_score: number | null;
  created_at: string | null;
}

export interface CRMProfile {
  client_id: string;
  score: number;
  category: ClientCategory;
  risk_level: string;
  payment_behavior: string;
  metrics: any;
  computed_at: string;
  manual_category: 'caliente' | 'tibio' | 'frio' | null;
  tags: string[];
  crm_notes: string | null;
  assigned_to: string | null;
}

export interface CRMLoan extends ScoringLoan {
  client?: { full_name: string } | null;
}

export interface CRMClientRecord {
  client: CRMClient;
  score: ClientScore;
  profile: CRMProfile | null;
  /** Categoría que se muestra: la manual si existe, si no la calculada */
  effectiveCategory: ClientCategory;
  loans: CRMLoan[];
  payments: ScoringPayment[];
  tracking: ScoringTracking[];
  sales: ScoringSale[];
  pawns: ScoringPawn[];
}

const CHUNK = 150;
const chunk = <T,>(arr: T[], size = CHUNK): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

/** Ejecuta una consulta `.in()` por lotes y concatena. Tolera errores por lote. */
async function fetchInChunks<T>(
  build: (ids: string[]) => PromiseLike<{ data: T[] | null; error: any }>,
  ids: string[]
): Promise<{ rows: T[]; error: any | null }> {
  const rows: T[] = [];
  let firstError: any = null;
  for (const part of chunk(ids)) {
    const { data, error } = await build(part);
    if (error) {
      firstError = firstError || error;
      continue;
    }
    if (data) rows.push(...data);
  }
  return { rows, error: firstError };
}

export const useClientCRM = () => {
  const { user, companyId, profile } = useAuth();
  const [records, setRecords] = useState<CRMClientRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [persisting, setPersisting] = useState(false);
  const [lastComputedAt, setLastComputedAt] = useState<Date | null>(null);
  const [profilesTableAvailable, setProfilesTableAvailable] = useState(true);
  const warnedRef = useRef(false);
  const todayIso = useMemo(() => getCurrentDateStringForSantoDomingo(), []);

  const canEdit = !profile?.is_employee || profile?.permissions?.['crm.edit'] === true;

  const load = useCallback(async () => {
    if (!user || !companyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // 1) Clientes y préstamos de la empresa (dos consultas independientes)
      const [clientsRes, loansRes] = await Promise.all([
        supabase
          .from('clients')
          .select('id, full_name, dni, phone, email, address, city, status, credit_score, created_at')
          .eq('user_id', companyId)
          .order('full_name'),
        supabase
          .from('loans')
          .select(
            'id, client_id, amount, total_amount, remaining_balance, monthly_payment, status, start_date, next_payment_date, end_date, term_months, payment_frequency, amortization_type, grace_period_days, current_late_fee, total_late_fee_paid, created_at, deleted_at'
          )
          .eq('loan_officer_id', companyId),
      ]);
      if (clientsRes.error) throw clientsRes.error;
      if (loansRes.error) throw loansRes.error;

      const clients = (clientsRes.data || []) as CRMClient[];
      const loans = ((loansRes.data || []) as any[]).filter(l => !l.deleted_at) as CRMLoan[];
      const clientIds = clients.map(c => c.id);
      const loanIds = loans.map(l => l.id);

      // 2) Detalle por lotes: pagos, seguimientos, ventas, empeños, perfiles CRM
      const [paymentsRes, trackingRes, salesRes, pawnsRes, profilesRes] = await Promise.all([
        fetchInChunks<ScoringPayment>(
          ids =>
            supabase
              .from('payments')
              .select('id, loan_id, amount, due_date, payment_date, interest_amount, principal_amount, late_fee, status')
              .in('loan_id', ids),
          loanIds
        ),
        fetchInChunks<ScoringTracking>(
          ids =>
            supabase
              .from('collection_tracking')
              .select('id, loan_id, contact_type, contact_date, next_contact_date, client_response')
              .in('loan_id', ids),
          loanIds
        ),
        fetchInChunks<ScoringSale>(
          ids =>
            supabase
              .from('sales')
              .select('id, client_id, total_amount, sale_date, status')
              .in('client_id', ids) as any,
          clientIds
        ),
        fetchInChunks<ScoringPawn>(
          ids =>
            supabase
              .from('pawn_transactions')
              .select('id, client_id, loan_amount, status, start_date, deleted_at')
              .in('client_id', ids),
          clientIds
        ),
        supabase.from('client_crm_profiles').select('*').eq('company_id', companyId),
      ]);

      if (paymentsRes.error) console.warn('CRM: error parcial cargando pagos', paymentsRes.error);
      if (trackingRes.error) console.warn('CRM: error parcial cargando seguimientos', trackingRes.error);
      // Ventas y empeños son opcionales (RLS de `sales` es por usuario, no por empresa)
      if (salesRes.error) console.warn('CRM: ventas no disponibles', salesRes.error?.message);
      if (pawnsRes.error) console.warn('CRM: empeños no disponibles', pawnsRes.error?.message);

      let profilesByClient = new Map<string, CRMProfile>();
      if (profilesRes.error) {
        setProfilesTableAvailable(false);
        if (!warnedRef.current) {
          warnedRef.current = true;
          console.warn('CRM: tabla client_crm_profiles no disponible. Aplica la migración 20260828100000.', profilesRes.error);
        }
      } else {
        setProfilesTableAvailable(true);
        profilesByClient = new Map(
          ((profilesRes.data || []) as any[]).map(p => [p.client_id, { ...p, tags: p.tags || [] } as CRMProfile])
        );
      }

      // 3) Calcular el score de cada cliente
      const loansByClient = new Map<string, CRMLoan[]>();
      for (const l of loans) {
        const arr = loansByClient.get(l.client_id) || [];
        arr.push(l);
        loansByClient.set(l.client_id, arr);
      }
      const paymentsByLoan = new Map<string, ScoringPayment[]>();
      for (const p of paymentsRes.rows) {
        const arr = paymentsByLoan.get(p.loan_id) || [];
        arr.push(p);
        paymentsByLoan.set(p.loan_id, arr);
      }
      const trackingByLoan = new Map<string, ScoringTracking[]>();
      for (const t of trackingRes.rows) {
        const arr = trackingByLoan.get(t.loan_id) || [];
        arr.push(t);
        trackingByLoan.set(t.loan_id, arr);
      }
      const salesByClient = new Map<string, ScoringSale[]>();
      for (const s of salesRes.rows) {
        if (!s.client_id) continue;
        const arr = salesByClient.get(s.client_id) || [];
        arr.push(s);
        salesByClient.set(s.client_id, arr);
      }
      const pawnsByClient = new Map<string, ScoringPawn[]>();
      for (const p of pawnsRes.rows) {
        if (!p.client_id) continue;
        const arr = pawnsByClient.get(p.client_id) || [];
        arr.push(p);
        pawnsByClient.set(p.client_id, arr);
      }

      const computed: CRMClientRecord[] = clients.map(client => {
        const cLoans = loansByClient.get(client.id) || [];
        const cPayments = cLoans.flatMap(l => paymentsByLoan.get(l.id) || []);
        const cTracking = cLoans.flatMap(l => trackingByLoan.get(l.id) || []);
        const cSales = salesByClient.get(client.id) || [];
        const cPawns = pawnsByClient.get(client.id) || [];
        const score = scoreClient({
          clientId: client.id,
          loans: cLoans,
          payments: cPayments,
          tracking: cTracking,
          sales: cSales,
          pawns: cPawns,
          todayIso,
        });
        const prof = profilesByClient.get(client.id) || null;
        return {
          client,
          score,
          profile: prof,
          effectiveCategory: prof?.manual_category || score.category,
          loans: cLoans,
          payments: cPayments,
          tracking: cTracking,
          sales: cSales,
          pawns: cPawns,
        };
      });

      setRecords(computed);
      setLastComputedAt(new Date());

      // 4) Persistir en segundo plano (no bloquea la UI)
      void persistScores(computed, profilesByClient, companyId);
    } catch (error: any) {
      console.error('CRM: error cargando datos', error);
      toast.error('Error al cargar el CRM: ' + (error?.message || 'desconocido'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, companyId, todayIso]);

  const persistScores = async (
    computed: CRMClientRecord[],
    existing: Map<string, CRMProfile>,
    company: string
  ) => {
    setPersisting(true);
    try {
      // a) Snapshot en client_crm_profiles: solo los que cambiaron de score/categoría o no existen
      const rows = computed
        .filter(r => {
          const e = existing.get(r.client.id);
          return (
            !e ||
            e.score !== r.score.score ||
            e.category !== r.score.category ||
            e.risk_level !== r.score.risk ||
            e.payment_behavior !== r.score.behavior
          );
        })
        .map(r => ({
          client_id: r.client.id,
          company_id: company,
          score: r.score.score,
          category: r.score.category,
          risk_level: r.score.risk,
          payment_behavior: r.score.behavior,
          metrics: { components: r.score.components, metrics: r.score.metrics, flags: r.score.flags },
          computed_at: new Date().toISOString(),
        }));

      if (rows.length > 0) {
        for (const part of chunk(rows, 200)) {
          const { error } = await supabase
            .from('client_crm_profiles')
            .upsert(part as any, { onConflict: 'client_id', ignoreDuplicates: false });
          if (error) {
            // Tabla ausente o RLS: no insistir en cada lote
            if (!warnedRef.current) {
              warnedRef.current = true;
              console.warn('CRM: no se pudo guardar el snapshot de scores', error.message);
            }
            break;
          }
        }
      }

      // b) Sincronizar clients.credit_score (solo cuando cambia; escala 0–1000)
      const toSync = computed.filter(r => Number(r.client.credit_score ?? -1) !== r.score.score);
      for (const part of chunk(toSync, 10)) {
        await Promise.all(
          part.map(r =>
            supabase.from('clients').update({ credit_score: r.score.score }).eq('id', r.client.id)
          )
        );
      }
    } catch (e) {
      console.warn('CRM: error persistiendo scores', e);
    } finally {
      setPersisting(false);
    }
  };

  /** Actualiza campos editables del perfil (categoría manual, etiquetas, notas). */
  const updateProfile = async (
    clientId: string,
    patch: Partial<Pick<CRMProfile, 'manual_category' | 'tags' | 'crm_notes' | 'assigned_to'>>
  ): Promise<boolean> => {
    if (!companyId) return false;
    if (!canEdit) {
      toast.error('No tienes permiso para editar el CRM (crm.edit)');
      return false;
    }
    const rec = records.find(r => r.client.id === clientId);
    if (!rec) return false;

    const payload = {
      client_id: clientId,
      company_id: companyId,
      score: rec.score.score,
      category: rec.score.category,
      risk_level: rec.score.risk,
      payment_behavior: rec.score.behavior,
      metrics: rec.profile?.metrics || { components: rec.score.components, metrics: rec.score.metrics, flags: rec.score.flags },
      ...patch,
    };
    const { data, error } = await supabase
      .from('client_crm_profiles')
      .upsert(payload as any, { onConflict: 'client_id' })
      .select()
      .single();
    if (error) {
      toast.error('No se pudo guardar: ' + error.message);
      return false;
    }
    const saved = { ...(data as any), tags: (data as any).tags || [] } as CRMProfile;
    setRecords(prev =>
      prev.map(r =>
        r.client.id === clientId
          ? { ...r, profile: saved, effectiveCategory: saved.manual_category || r.score.category }
          : r
      )
    );
    return true;
  };

  useEffect(() => {
    if (user && companyId) load();
  }, [user, companyId, load]);

  // Resumen agregado para KPIs
  const summary = useMemo(() => {
    const byCategory: Record<ClientCategory, number> = { caliente: 0, tibio: 0, frio: 0, nuevo: 0 };
    let scoreSum = 0;
    let scored = 0;
    let overdue = 0;
    let needContact = 0;
    let contactsDueToday = 0;
    let renewals = 0;
    for (const r of records) {
      byCategory[r.effectiveCategory]++;
      if (r.score.category !== 'nuevo') {
        scoreSum += r.score.score;
        scored++;
      }
      if (r.score.metrics.currentMaxDaysOverdue > 0) overdue++;
      if (r.score.flags.some(f => f.code === 'overdue_no_recent_contact')) needContact++;
      if (r.score.flags.some(f => f.code === 'next_contact_due')) contactsDueToday++;
      if (r.score.flags.some(f => f.code === 'renewal_opportunity')) renewals++;
    }
    return {
      total: records.length,
      byCategory,
      avgScore: scored > 0 ? Math.round(scoreSum / scored) : 0,
      overdue,
      needContact,
      contactsDueToday,
      renewals,
    };
  }, [records]);

  return {
    records,
    summary,
    loading,
    persisting,
    lastComputedAt,
    profilesTableAvailable,
    canEdit,
    todayIso,
    refresh: load,
    updateProfile,
  };
};
