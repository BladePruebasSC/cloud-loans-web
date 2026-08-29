-- ============================================================================
-- FIX: legal_evaluate_eligibility fallaba con "malformed array literal"
-- ============================================================================
-- Causa: `mi_array_text || 'literal'` con un literal SIN tipo hace que Postgres
-- elija la sobrecarga array||array e intente parsear el texto como array
-- (fallaba en 'Falta el contrato en Documentos'). Se reemplazan todos los
-- appends por array_append(), que es inequívoco.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.legal_evaluate_eligibility(p_loan_id UUID)
RETURNS JSONB AS $$
DECLARE
  l RECORD; cl RECORD; s JSONB; v_company UUID;
  v_days INT; v_overdue_count INT; v_overdue_amount NUMERIC; v_contacts INT; v_broken INT; v_pending_promises INT;
  v_agreements INT; v_guarantees INT; v_has_contract BOOL; v_has_id BOOL; v_score INT; v_case UUID;
  reasons TEXT[] := '{}'; blockers TEXT[] := '{}'; review TEXT[] := '{}'; v_status TEXT;
BEGIN
  v_company := get_user_company_id();
  SELECT * INTO l FROM public.loans WHERE id = p_loan_id AND loan_officer_id = v_company;
  IF NOT FOUND THEN RAISE EXCEPTION 'LEGAL_LOAN_NOT_FOUND: el préstamo no existe o no pertenece a su empresa'; END IF;
  SELECT * INTO cl FROM public.clients WHERE id = l.client_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'LEGAL_CLIENT_NOT_FOUND: el cliente del préstamo no existe'; END IF;
  s := public.legal_get_settings(v_company);

  v_days := public.legal_days_overdue(p_loan_id);
  SELECT count(*), COALESCE(SUM(COALESCE(total_amount, principal_amount + interest_amount)),0)
    INTO v_overdue_count, v_overdue_amount
    FROM public.installments WHERE loan_id = p_loan_id AND COALESCE(is_paid,false) = false AND due_date < CURRENT_DATE;
  SELECT count(*) INTO v_contacts FROM public.collection_tracking WHERE loan_id = p_loan_id;
  SELECT count(*) FILTER (WHERE status='broken'), count(*) FILTER (WHERE status='pending')
    INTO v_broken, v_pending_promises FROM public.collection_promises WHERE loan_id = p_loan_id;
  SELECT count(*) INTO v_agreements FROM public.payment_agreements WHERE loan_id = p_loan_id;
  SELECT count(*) INTO v_guarantees FROM public.guarantees WHERE loan_id = p_loan_id;
  SELECT EXISTS (SELECT 1 FROM public.documents WHERE loan_id = p_loan_id AND document_type IN ('contract','legal_contract')) INTO v_has_contract;
  SELECT EXISTS (SELECT 1 FROM public.documents WHERE (client_id = l.client_id OR loan_id = p_loan_id) AND document_type IN ('identification','legal_identification')) INTO v_has_id;
  SELECT score INTO v_score FROM public.client_crm_profiles WHERE client_id = l.client_id;
  SELECT id INTO v_case FROM public.legal_cases WHERE loan_id = p_loan_id AND status NOT IN ('resolved','closed') LIMIT 1;

  -- Bloqueos
  IF l.status NOT IN ('active','overdue') THEN blockers := array_append(blockers, format('El préstamo está en estado "%s"', l.status)); END IF;
  IF v_case IS NOT NULL THEN blockers := array_append(blockers, 'Ya existe un caso legal activo para este préstamo'); END IF;
  IF v_days < (s->>'min_days_overdue')::int THEN
    blockers := array_append(blockers, format('%s días de mora (mínimo configurado: %s)', v_days, s->>'min_days_overdue'));
  ELSE reasons := array_append(reasons, format('%s días de mora', v_days)); END IF;
  IF l.remaining_balance < (s->>'min_amount')::numeric THEN
    blockers := array_append(blockers, format('Saldo RD$%s por debajo del mínimo configurado (RD$%s)', l.remaining_balance, s->>'min_amount'));
  ELSE reasons := array_append(reasons, format('Saldo pendiente RD$%s', l.remaining_balance)); END IF;
  IF v_contacts < (s->>'min_contacts')::int THEN
    blockers := array_append(blockers, format('%s gestiones de cobro registradas (mínimo: %s)', v_contacts, s->>'min_contacts'));
  ELSE reasons := array_append(reasons, format('%s gestiones de cobro registradas', v_contacts)); END IF;
  IF v_broken < (s->>'min_broken_promises')::int THEN
    blockers := array_append(blockers, format('%s promesas incumplidas (mínimo: %s)', v_broken, s->>'min_broken_promises'));
  ELSE IF v_broken > 0 THEN reasons := array_append(reasons, format('%s promesas de pago incumplidas', v_broken)); END IF; END IF;
  IF v_pending_promises > 0 THEN review := array_append(review, format('Hay %s promesa(s) de pago vigente(s)', v_pending_promises)); END IF;

  -- Contexto (no bloquea)
  IF v_overdue_count > 0 THEN reasons := array_append(reasons, format('%s cuotas vencidas por RD$%s', v_overdue_count, round(v_overdue_amount,2))); END IF;
  IF v_agreements > 0 THEN reasons := array_append(reasons, format('%s acuerdo(s) de pago anteriores', v_agreements)); END IF;
  IF v_guarantees > 0 THEN reasons := array_append(reasons, format('%s garantía(s) registrada(s)', v_guarantees)); END IF;
  IF COALESCE(l.current_late_fee,0) > 0 THEN reasons := array_append(reasons, format('Mora acumulada RD$%s', l.current_late_fee)); END IF;
  IF v_score IS NOT NULL THEN reasons := array_append(reasons, format('Score CRM %s', v_score)); END IF;

  -- Documentación / datos (pendiente de revisión, no bloqueo duro)
  IF (s->'required_documents') ? 'contract' AND NOT v_has_contract THEN review := array_append(review, 'Falta el contrato en Documentos');
  ELSIF v_has_contract THEN reasons := array_append(reasons, 'Contrato disponible'); END IF;
  IF (s->'required_documents') ? 'identification' AND NOT v_has_id THEN review := array_append(review, 'Falta la identificación del cliente'); END IF;
  IF (s->'required_documents') ? 'contact_data' AND COALESCE(cl.phone,'') = '' THEN review := array_append(review, 'El cliente no tiene teléfono registrado'); END IF;
  IF (s->'required_documents') ? 'address' AND COALESCE(cl.address,'') = '' THEN review := array_append(review, 'El cliente no tiene dirección registrada'); END IF;

  v_status := CASE WHEN array_length(blockers,1) > 0 THEN 'not_eligible'
                   WHEN array_length(review,1) > 0 THEN 'pending_review'
                   ELSE 'eligible' END;

  RETURN jsonb_build_object(
    'status', v_status, 'eligible', v_status = 'eligible',
    'reasons', to_jsonb(reasons), 'blockers', to_jsonb(blockers), 'review', to_jsonb(review),
    'active_case_id', v_case,
    'metrics', jsonb_build_object(
      'days_overdue', v_days, 'overdue_installments', v_overdue_count, 'overdue_amount', round(v_overdue_amount,2),
      'remaining_balance', l.remaining_balance, 'late_fee', COALESCE(l.current_late_fee,0),
      'contacts', v_contacts, 'broken_promises', v_broken, 'pending_promises', v_pending_promises,
      'agreements', v_agreements, 'guarantees', v_guarantees, 'has_contract', v_has_contract, 'has_identification', v_has_id,
      'has_phone', COALESCE(cl.phone,'') <> '', 'has_address', COALESCE(cl.address,'') <> '', 'crm_score', v_score,
      'collection_stage', public.legal_compute_collection_stage(p_loan_id)
    )
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;
