import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  fetchLoanPenalties, penaltyTotalsByLoan, LOAN_PENALTIES_EVENT,
  type LoanPenalty, type PenaltyTotals,
} from '@/utils/loanPenalties';

/**
 * Penalidades de los préstamos indicados, con su total acumulado por préstamo.
 *
 * Se recarga sola cuando se registra una penalidad o cambia el préstamo (abono a capital, cargo),
 * que es cuando la tarjeta y Detalles tienen que enseñar el nuevo acumulado.
 */
export const useLoanPenalties = (loanIds: string[]) => {
  const key = useMemo(() => Array.from(new Set(loanIds.filter(Boolean))).sort().join(','), [loanIds]);
  const [rows, setRows] = useState<LoanPenalty[]>([]);
  const [loading, setLoading] = useState(false);
  const [fromHistory, setFromHistory] = useState(false);
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const ids = key ? key.split(',') : [];
    const request = ++requestRef.current;
    if (ids.length === 0) { setRows([]); return; }
    setLoading(true);
    try {
      const result = await fetchLoanPenalties(supabase as any, ids);
      if (request !== requestRef.current) return; // llegó una carga más nueva
      setRows(result.rows);
      setFromHistory(result.fromHistory);
    } catch (err) {
      console.error('[penalidades] error cargando:', err);
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [key]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const ids = new Set(key ? key.split(',') : []);
    const onChange = (event: Event) => {
      const loanId = (event as CustomEvent)?.detail?.loanId as string | undefined;
      if (!loanId || ids.has(loanId)) load();
    };
    const events = [LOAN_PENALTIES_EVENT, 'loanHistoryRefresh', 'installmentsUpdated'];
    events.forEach(e => window.addEventListener(e, onChange as EventListener));
    return () => events.forEach(e => window.removeEventListener(e, onChange as EventListener));
  }, [key, load]);

  const totals = useMemo<Map<string, PenaltyTotals>>(() => penaltyTotalsByLoan(rows), [rows]);

  return { rows, totals, loading, fromHistory, reload: load };
};
