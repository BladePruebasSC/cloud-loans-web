-- ============================================================================
-- MÓDULO DE COBRANZA LEGAL — FUNCIONES ("backend")
-- ============================================================================
-- Todas las escrituras del módulo pasan por aquí. Cada función:
--   · resuelve la empresa con get_user_company_id() (dueño o empleado),
--   · valida el permiso del actor con legal_has_permission(),
--   · valida IDs, pertenencia a la empresa y estado del caso,
--   · registra el evento en legal_case_events (auditoría).
-- Los errores usan el prefijo LEGAL_<CODIGO>: para que el frontend los traduzca.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helpers
-- ----------------------------------------------------------------------------

-- ¿El usuario actual tiene el permiso? Dueño y rol admin: todo. Empleado: permissions JSONB.
CREATE OR REPLACE FUNCTION public.legal_has_permission(p_key TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_emp RECORD;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  SELECT role, permissions INTO v_emp
  FROM public.employees
  WHERE auth_user_id = auth.uid() AND COALESCE(status,'active') = 'active'
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN true; -- dueño de empresa
  END IF;
  IF v_emp.role = 'admin' THEN RETURN true; END IF;
  RETURN COALESCE((v_emp.permissions ->> p_key) = 'true', false);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.legal_assert_permission(p_key TEXT)
RETURNS VOID AS $$
BEGIN
  IF NOT public.legal_has_permission(p_key) THEN
    RAISE EXCEPTION 'LEGAL_PERMISSION_DENIED: se requiere el permiso %', p_key;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- Nombre del actor para la auditoría
CREATE OR REPLACE FUNCTION public.legal_actor_name()
RETURNS TEXT AS $$
DECLARE v TEXT;
BEGIN
  SELECT full_name INTO v FROM public.employees WHERE auth_user_id = auth.uid() LIMIT 1;
  IF v IS NULL THEN
    SELECT company_name INTO v FROM public.company_settings WHERE user_id = auth.uid() LIMIT 1;
  END IF;
  RETURN COALESCE(v, 'Usuario');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- Configuración de cobranza de la empresa, con valores por defecto si no hay fila
CREATE OR REPLACE FUNCTION public.legal_get_settings(p_company UUID)
RETURNS JSONB AS $$
DECLARE s RECORD; r JSONB;
BEGIN
  SELECT * INTO s FROM public.company_settings WHERE user_id = p_company LIMIT 1;
  r := jsonb_build_object(
    'preventive',        COALESCE(s.collection_days_preventive, 3),
    'administrative',    COALESCE(s.collection_days_administrative, 8),
    'intensive',         COALESCE(s.collection_days_intensive, 30),
    'prelegal',          COALESCE(s.collection_days_prelegal, 60),
    'min_days_overdue',  COALESCE(s.legal_min_days_overdue, 60),
    'min_amount',        COALESCE(s.legal_min_amount, 0),
    'min_broken_promises', COALESCE(s.legal_min_broken_promises, 1),
    'min_contacts',      COALESCE(s.legal_min_contacts, 3),
    'deadline_days',     COALESCE(s.legal_intimation_deadline_days, 10),
    'followup_days',     COALESCE(s.legal_followup_days, 3),
    'escalation_days',   COALESCE(s.legal_escalation_days, 5),
    'required_documents', COALESCE(s.legal_required_documents,
        '["contract","identification","contact_data","address","statement","collection_evidence"]'::jsonb),
    'require_notification_evidence', COALESCE(s.legal_require_notification_evidence, true)
  );
  RETURN r;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- Días de atraso HOY de un préstamo (descontada la gracia)
CREATE OR REPLACE FUNCTION public.legal_days_overdue(p_loan_id UUID)
RETURNS INTEGER AS $$
DECLARE l RECORD;
BEGIN
  SELECT next_payment_date, grace_period_days, status INTO l FROM public.loans WHERE id = p_loan_id;
  IF NOT FOUND OR l.status NOT IN ('active','overdue') OR l.next_payment_date IS NULL THEN RETURN 0; END IF;
  RETURN GREATEST(0, (CURRENT_DATE - l.next_payment_date::date) - COALESCE(l.grace_period_days, 0));
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- Etapa de cobranza según días de atraso y configuración
CREATE OR REPLACE FUNCTION public.legal_compute_collection_stage(p_loan_id UUID)
RETURNS TEXT AS $$
DECLARE l RECORD; s JSONB; raw_days INTEGER; overdue INTEGER;
BEGIN
  SELECT * INTO l FROM public.loans WHERE id = p_loan_id;
  IF NOT FOUND OR l.status NOT IN ('active','overdue') THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.legal_cases WHERE loan_id = p_loan_id AND status NOT IN ('resolved','closed')) THEN
    RETURN 'legal';
  END IF;
  s := public.legal_get_settings(l.loan_officer_id);
  raw_days := CURRENT_DATE - l.next_payment_date::date;
  IF raw_days <= 0 THEN RETURN 'al_dia'; END IF;
  IF raw_days <= COALESCE(l.grace_period_days, 0) THEN RETURN 'cuota_vencida'; END IF;
  overdue := raw_days - COALESCE(l.grace_period_days, 0);
  IF overdue >= (s->>'prelegal')::int       THEN RETURN 'pre_legal'; END IF;
  IF overdue >= (s->>'intensive')::int      THEN RETURN 'cobranza_intensiva'; END IF;
  IF overdue >= (s->>'administrative')::int THEN RETURN 'cobranza_administrativa'; END IF;
  IF overdue >= (s->>'preventive')::int     THEN RETURN 'cobranza_preventiva'; END IF;
  RETURN 'mora';
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- Numeración por empresa/prefijo/año
CREATE OR REPLACE FUNCTION public.legal_next_number(p_company UUID, p_prefix TEXT)
RETURNS TEXT AS $$
DECLARE v_year INTEGER := EXTRACT(YEAR FROM CURRENT_DATE)::int; v_next INTEGER;
BEGIN
  INSERT INTO public.legal_sequences (company_id, prefix, year, last_value)
  VALUES (p_company, p_prefix, v_year, 1)
  ON CONFLICT (company_id, prefix, year)
  DO UPDATE SET last_value = public.legal_sequences.last_value + 1
  RETURNING last_value INTO v_next;
  RETURN format('%s-%s-%s', p_prefix, v_year, lpad(v_next::text, 4, '0'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Registrar evento (interno)
CREATE OR REPLACE FUNCTION public.legal_add_event(
  p_case_id UUID, p_type TEXT, p_description TEXT,
  p_old_status TEXT DEFAULT NULL, p_new_status TEXT DEFAULT NULL,
  p_data JSONB DEFAULT '{}'::jsonb, p_result TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE v_company UUID; v_id UUID;
BEGIN
  SELECT company_id INTO v_company FROM public.legal_cases WHERE id = p_case_id;
  INSERT INTO public.legal_case_events (case_id, company_id, event_type, actor_id, actor_name, description, result, old_status, new_status, data)
  VALUES (p_case_id, v_company, p_type, auth.uid(), public.legal_actor_name(), p_description, p_result, p_old_status, p_new_status, COALESCE(p_data,'{}'::jsonb))
  RETURNING id INTO v_id;
  UPDATE public.legal_cases SET last_action_at = now() WHERE id = p_case_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;
REVOKE EXECUTE ON FUNCTION public.legal_add_event(UUID,TEXT,TEXT,TEXT,TEXT,JSONB,TEXT) FROM PUBLIC, anon, authenticated;

-- Obtener caso validando empresa y (opcional) que no esté cerrado
CREATE OR REPLACE FUNCTION public.legal_get_case(p_case_id UUID, p_must_be_open BOOLEAN DEFAULT true)
RETURNS public.legal_cases AS $$
DECLARE c public.legal_cases;
BEGIN
  SELECT * INTO c FROM public.legal_cases WHERE id = p_case_id AND company_id = get_user_company_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'LEGAL_CASE_NOT_FOUND: el caso no existe o no pertenece a su empresa'; END IF;
  IF p_must_be_open AND c.status IN ('resolved','closed') THEN
    RAISE EXCEPTION 'LEGAL_CASE_CLOSED: el caso % está cerrado', c.case_number;
  END IF;
  RETURN c;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- ----------------------------------------------------------------------------
-- Checklist del expediente
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.legal_refresh_checklist(p_case_id UUID)
RETURNS JSONB AS $$
DECLARE
  c public.legal_cases; s JSONB; cl RECORD; req JSONB; k TEXT;
  v_contacts INT; v_broken INT; v_has_contract BOOL; v_has_id BOOL; v_has_payments BOOL;
  v_missing TEXT[] := '{}'; v_complete BOOL := true; v_auto BOOL; v_required BOOL;
BEGIN
  c := public.legal_get_case(p_case_id, false);
  s := public.legal_get_settings(c.company_id);
  req := s->'required_documents';
  SELECT * INTO cl FROM public.clients WHERE id = c.client_id;

  SELECT count(*) INTO v_contacts FROM public.collection_tracking WHERE loan_id = c.loan_id;
  SELECT count(*) INTO v_broken FROM public.collection_promises WHERE loan_id = c.loan_id AND status = 'broken';
  SELECT EXISTS (SELECT 1 FROM public.documents d WHERE d.status IS DISTINCT FROM 'deleted'
                 AND d.document_type IN ('contract','legal_contract')
                 AND (d.loan_id = c.loan_id OR d.legal_case_id = c.id)) INTO v_has_contract;
  SELECT EXISTS (SELECT 1 FROM public.documents d WHERE d.status IS DISTINCT FROM 'deleted'
                 AND d.document_type IN ('identification','legal_identification')
                 AND (d.client_id = c.client_id OR d.loan_id = c.loan_id OR d.legal_case_id = c.id)) INTO v_has_id;
  SELECT EXISTS (SELECT 1 FROM public.payments WHERE loan_id = c.loan_id)
      OR EXISTS (SELECT 1 FROM public.installments WHERE loan_id = c.loan_id) INTO v_has_payments;

  FOREACH k IN ARRAY ARRAY['contract','identification','contact_data','address','payment_history','statement','collection_evidence','broken_promises'] LOOP
    v_required := req ? k;
    v_auto := CASE k
      WHEN 'contract'            THEN v_has_contract
      WHEN 'identification'      THEN v_has_id
      WHEN 'contact_data'        THEN COALESCE(cl.phone,'') <> ''
      WHEN 'address'             THEN COALESCE(cl.address,'') <> ''
      WHEN 'payment_history'     THEN v_has_payments
      WHEN 'statement'           THEN true  -- el sistema lo genera (estado de cuenta)
      WHEN 'collection_evidence' THEN v_contacts >= (s->>'min_contacts')::int
      WHEN 'broken_promises'     THEN v_broken >= 1
      ELSE false END;

    INSERT INTO public.legal_case_checklist (company_id, case_id, item_key, required, satisfied, auto_detected)
    VALUES (c.company_id, c.id, k, v_required, v_auto, true)
    ON CONFLICT (case_id, item_key) DO UPDATE
      SET required = EXCLUDED.required,
          -- lo detectado automáticamente nunca desmarca una verificación manual
          satisfied = public.legal_case_checklist.satisfied OR EXCLUDED.satisfied,
          auto_detected = EXCLUDED.satisfied;

    IF v_required THEN
      SELECT satisfied INTO v_auto FROM public.legal_case_checklist WHERE case_id = c.id AND item_key = k;
      IF NOT v_auto THEN v_missing := v_missing || k; v_complete := false; END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('complete', v_complete, 'missing', to_jsonb(v_missing));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.legal_checklist_set(p_case_id UUID, p_item TEXT, p_satisfied BOOLEAN, p_document_id UUID DEFAULT NULL, p_notes TEXT DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE c public.legal_cases;
BEGIN
  PERFORM public.legal_assert_permission('legal.manage');
  c := public.legal_get_case(p_case_id, true);
  INSERT INTO public.legal_case_checklist (company_id, case_id, item_key, required, satisfied, document_id, verified_by, verified_at, notes)
  VALUES (c.company_id, c.id, p_item, true, p_satisfied, p_document_id, auth.uid(), now(), p_notes)
  ON CONFLICT (case_id, item_key) DO UPDATE
    SET satisfied = EXCLUDED.satisfied, document_id = COALESCE(EXCLUDED.document_id, public.legal_case_checklist.document_id),
        verified_by = auth.uid(), verified_at = now(), notes = COALESCE(EXCLUDED.notes, public.legal_case_checklist.notes);
  PERFORM public.legal_add_event(c.id, 'checklist_updated',
    format('Expediente: "%s" marcado como %s', p_item, CASE WHEN p_satisfied THEN 'cumplido' ELSE 'pendiente' END),
    NULL, NULL, jsonb_build_object('item', p_item, 'satisfied', p_satisfied, 'document_id', p_document_id));
  RETURN public.legal_refresh_checklist(c.id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ----------------------------------------------------------------------------
-- Elegibilidad (NO inicia nada)
-- ----------------------------------------------------------------------------
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
  -- Nota: SIEMPRE array_append(), nunca `array || 'literal'`: con un literal sin tipo Postgres
  -- elige la sobrecarga array||array e intenta parsear el texto como array ("malformed array literal").
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

-- ----------------------------------------------------------------------------
-- Apertura del caso
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.legal_open_case(
  p_loan_id UUID, p_reason TEXT, p_priority TEXT DEFAULT 'medium',
  p_assigned_to UUID DEFAULT NULL, p_duplicate_justification TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  l RECORD; v_company UUID; v_existing UUID; v_id UUID; v_number TEXT; v_days INT; v_pending NUMERIC;
BEGIN
  PERFORM public.legal_assert_permission('legal.open');
  v_company := get_user_company_id();
  SELECT * INTO l FROM public.loans WHERE id = p_loan_id AND loan_officer_id = v_company;
  IF NOT FOUND THEN RAISE EXCEPTION 'LEGAL_LOAN_NOT_FOUND: el préstamo no existe o no pertenece a su empresa'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clients WHERE id = l.client_id) THEN
    RAISE EXCEPTION 'LEGAL_CLIENT_NOT_FOUND: el cliente del préstamo no existe';
  END IF;
  IF COALESCE(p_reason,'') = '' THEN RAISE EXCEPTION 'LEGAL_REASON_REQUIRED: indique el motivo de apertura del caso'; END IF;

  SELECT id INTO v_existing FROM public.legal_cases WHERE loan_id = p_loan_id AND status NOT IN ('resolved','closed') LIMIT 1;
  IF v_existing IS NOT NULL THEN
    IF COALESCE(p_duplicate_justification,'') = '' OR NOT public.legal_has_permission('legal.override_duplicate') THEN
      RAISE EXCEPTION 'LEGAL_DUPLICATE_CASE: ya existe un caso legal activo para este préstamo (%)', v_existing;
    END IF;
    -- Override autorizado: el caso anterior se cierra por error administrativo y queda enlazado
    UPDATE public.legal_cases SET status = 'closed', closed_at = now(), closed_by = auth.uid(),
      close_reason = 'administrative_error', close_notes = 'Reemplazado por nuevo caso: ' || p_duplicate_justification
      WHERE id = v_existing;
    PERFORM public.legal_add_event(v_existing, 'case_closed', 'Caso cerrado por apertura de uno nuevo (override de duplicado)', NULL, 'closed',
      jsonb_build_object('justification', p_duplicate_justification));
  END IF;

  v_days := public.legal_days_overdue(p_loan_id);
  v_pending := COALESCE(l.remaining_balance,0) + COALESCE(l.current_late_fee,0);
  v_number := public.legal_next_number(v_company, 'EXP');

  INSERT INTO public.legal_cases (company_id, client_id, loan_id, case_number, status, priority, claimed_amount, pending_amount,
    days_overdue_at_open, assigned_to, reason, opened_by, superseded_case_id, duplicate_justification, next_action_at, next_action_note)
  VALUES (v_company, l.client_id, p_loan_id, v_number, 'pre_legal', COALESCE(p_priority,'medium'), v_pending, v_pending,
    v_days, COALESCE(p_assigned_to, auth.uid()), p_reason, auth.uid(), v_existing, p_duplicate_justification,
    CURRENT_DATE + ((public.legal_get_settings(v_company)->>'followup_days')::int), 'Revisar expediente y completar documentación')
  RETURNING id INTO v_id;

  PERFORM public.legal_add_event(v_id, 'case_opened', format('Caso %s abierto en etapa PRE-LEGAL. Motivo: %s', v_number, p_reason), NULL, 'pre_legal',
    jsonb_build_object('days_overdue', v_days, 'claimed_amount', v_pending, 'superseded_case_id', v_existing));
  PERFORM public.legal_refresh_checklist(v_id);

  UPDATE public.loans SET collection_stage = 'legal', collection_stage_since = CURRENT_DATE WHERE id = p_loan_id;
  INSERT INTO public.loan_history (loan_id, change_type, old_value, new_value, description, created_by)
  VALUES (p_loan_id, 'status_change', 'cobranza', 'legal', format('Apertura de caso legal %s: %s', v_number, p_reason), auth.uid());

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ----------------------------------------------------------------------------
-- Transiciones de estado (única puerta de cambio)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.legal_case_set_status(
  p_case_id UUID, p_new_status TEXT, p_reason TEXT, p_data JSONB, p_system BOOLEAN
) RETURNS VOID AS $$
DECLARE c public.legal_cases; t RECORD; chk JSONB;
BEGIN
  c := public.legal_get_case(p_case_id, true);
  IF c.status = p_new_status THEN RETURN; END IF;

  -- Suspender / cerrar / resolver se permiten desde cualquier estado activo
  IF p_new_status IN ('suspended','closed','resolved') THEN
    IF NOT p_system THEN
      PERFORM public.legal_assert_permission('legal.close');
      IF COALESCE(p_reason,'') = '' THEN RAISE EXCEPTION 'LEGAL_REASON_REQUIRED: indique el motivo'; END IF;
    END IF;
  ELSE
    -- Buscar la transición configurada (la de la empresa tiene prioridad sobre la global)
    SELECT * INTO t FROM public.legal_stage_transitions
      WHERE from_status = c.status AND to_status = p_new_status AND enabled
        AND (company_id = c.company_id OR company_id IS NULL)
      ORDER BY company_id NULLS LAST LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'LEGAL_TRANSITION_NOT_ALLOWED: no está permitido pasar de "%" a "%"', c.status, p_new_status;
    END IF;
    IF NOT p_system THEN
      IF t.required_permission IS NULL THEN
        RAISE EXCEPTION 'LEGAL_TRANSITION_NOT_ALLOWED: la transición "%" → "%" la realiza el sistema automáticamente', c.status, p_new_status;
      END IF;
      PERFORM public.legal_assert_permission(t.required_permission);
      IF t.requires_reason AND COALESCE(p_reason,'') = '' THEN
        RAISE EXCEPTION 'LEGAL_REASON_REQUIRED: esta transición requiere indicar un motivo';
      END IF;
    END IF;
    IF t.requires_complete_file THEN
      chk := public.legal_refresh_checklist(c.id);
      IF NOT (chk->>'complete')::boolean THEN
        RAISE EXCEPTION 'LEGAL_FILE_INCOMPLETE: expediente incompleto. Faltan: %', chk->>'missing';
      END IF;
    END IF;
  END IF;

  UPDATE public.legal_cases
    SET previous_status = status, status = p_new_status, entered_stage_at = now(),
        closed_at = CASE WHEN p_new_status IN ('closed','resolved') THEN now() ELSE closed_at END,
        closed_by = CASE WHEN p_new_status IN ('closed','resolved') THEN auth.uid() ELSE closed_by END
    WHERE id = c.id;

  PERFORM public.legal_add_event(c.id, 'status_changed',
    format('Estado: %s → %s%s', c.status, p_new_status, CASE WHEN COALESCE(p_reason,'')<>'' THEN '. ' || p_reason ELSE '' END),
    c.status, p_new_status, COALESCE(p_data,'{}'::jsonb) || jsonb_build_object('system', p_system, 'reason', p_reason));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;
REVOKE EXECUTE ON FUNCTION public.legal_case_set_status(UUID,TEXT,TEXT,JSONB,BOOLEAN) FROM PUBLIC, anon, authenticated;

-- Versión pública (siempre como usuario, nunca como sistema)
CREATE OR REPLACE FUNCTION public.legal_case_transition(p_case_id UUID, p_new_status TEXT, p_reason TEXT DEFAULT NULL, p_data JSONB DEFAULT '{}'::jsonb)
RETURNS VOID AS $$
BEGIN
  PERFORM public.legal_case_set_status(p_case_id, p_new_status, p_reason, p_data, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ----------------------------------------------------------------------------
-- Asignación, próxima acción, prioridad
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.legal_assign_case(p_case_id UUID, p_assigned_to UUID, p_lawyer_id UUID DEFAULT NULL, p_lawyer_name TEXT DEFAULT NULL)
RETURNS VOID AS $$
DECLARE c public.legal_cases;
BEGIN
  PERFORM public.legal_assert_permission('legal.assign');
  c := public.legal_get_case(p_case_id, true);
  UPDATE public.legal_cases SET assigned_to = p_assigned_to, lawyer_id = p_lawyer_id, lawyer_name = COALESCE(p_lawyer_name, lawyer_name) WHERE id = c.id;
  PERFORM public.legal_add_event(c.id, 'case_assigned', 'Responsable/abogado actualizado', NULL, NULL,
    jsonb_build_object('assigned_to', p_assigned_to, 'lawyer_id', p_lawyer_id, 'lawyer_name', p_lawyer_name, 'previous_assigned_to', c.assigned_to));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.legal_update_case(p_case_id UUID, p_priority TEXT DEFAULT NULL, p_next_action_at DATE DEFAULT NULL, p_next_action_note TEXT DEFAULT NULL, p_notes TEXT DEFAULT NULL)
RETURNS VOID AS $$
DECLARE c public.legal_cases;
BEGIN
  PERFORM public.legal_assert_permission('legal.manage');
  c := public.legal_get_case(p_case_id, true);
  UPDATE public.legal_cases SET
    priority = COALESCE(p_priority, priority),
    next_action_at = COALESCE(p_next_action_at, next_action_at),
    next_action_note = COALESCE(p_next_action_note, next_action_note),
    notes = COALESCE(p_notes, notes)
  WHERE id = c.id;
  PERFORM public.legal_add_event(c.id, 'case_updated', 'Datos del caso actualizados', NULL, NULL,
    jsonb_build_object('priority', p_priority, 'next_action_at', p_next_action_at, 'next_action_note', p_next_action_note));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ----------------------------------------------------------------------------
-- Promesas de pago
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.legal_register_promise(p_loan_id UUID, p_amount NUMERIC, p_promised_date DATE, p_notes TEXT DEFAULT NULL, p_tracking_id UUID DEFAULT NULL)
RETURNS UUID AS $$
DECLARE l RECORD; v_company UUID; v_case UUID; v_id UUID;
BEGIN
  PERFORM public.legal_assert_permission('legal.manage');
  v_company := get_user_company_id();
  SELECT * INTO l FROM public.loans WHERE id = p_loan_id AND loan_officer_id = v_company;
  IF NOT FOUND THEN RAISE EXCEPTION 'LEGAL_LOAN_NOT_FOUND: el préstamo no existe o no pertenece a su empresa'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'LEGAL_INVALID_AMOUNT: el monto prometido debe ser mayor que cero'; END IF;
  IF p_promised_date IS NULL OR p_promised_date < CURRENT_DATE THEN RAISE EXCEPTION 'LEGAL_INVALID_DATE: la fecha prometida no puede ser anterior a hoy'; END IF;
  SELECT id INTO v_case FROM public.legal_cases WHERE loan_id = p_loan_id AND status NOT IN ('resolved','closed') LIMIT 1;

  INSERT INTO public.collection_promises (company_id, case_id, loan_id, client_id, tracking_id, amount, promised_date, notes, created_by)
  VALUES (v_company, v_case, p_loan_id, l.client_id, p_tracking_id, p_amount, p_promised_date, p_notes, auth.uid())
  RETURNING id INTO v_id;

  IF v_case IS NOT NULL THEN
    PERFORM public.legal_add_event(v_case, 'promise_created', format('Promesa de pago: RD$%s para el %s', p_amount, p_promised_date), NULL, NULL,
      jsonb_build_object('promise_id', v_id, 'amount', p_amount, 'promised_date', p_promised_date));
    BEGIN
      PERFORM public.legal_case_set_status(v_case, 'payment_promise', 'Promesa de pago registrada', jsonb_build_object('promise_id', v_id), true);
    EXCEPTION WHEN OTHERS THEN NULL; -- si la transición no aplica en este estado, no bloquear la promesa
    END;
    UPDATE public.legal_cases SET next_action_at = p_promised_date, next_action_note = 'Verificar cumplimiento de la promesa de pago' WHERE id = v_case;
  END IF;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.legal_cancel_promise(p_promise_id UUID, p_reason TEXT)
RETURNS VOID AS $$
DECLARE p RECORD;
BEGIN
  PERFORM public.legal_assert_permission('legal.manage');
  SELECT * INTO p FROM public.collection_promises WHERE id = p_promise_id AND company_id = get_user_company_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'LEGAL_NOT_FOUND: promesa no encontrada'; END IF;
  IF p.status <> 'pending' THEN RAISE EXCEPTION 'LEGAL_INVALID_STATE: la promesa ya está %', p.status; END IF;
  UPDATE public.collection_promises SET status = 'cancelled', resolved_at = now(), notes = COALESCE(notes,'') || ' | Cancelada: ' || COALESCE(p_reason,'') WHERE id = p.id;
  IF p.case_id IS NOT NULL THEN
    PERFORM public.legal_add_event(p.case_id, 'promise_cancelled', 'Promesa de pago cancelada: ' || COALESCE(p_reason,''), NULL, NULL, jsonb_build_object('promise_id', p.id));
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ----------------------------------------------------------------------------
-- Intimación: solicitud → revisión → decisión → emisión → notificación
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.legal_request_intimation(p_case_id UUID, p_notes TEXT DEFAULT NULL)
RETURNS UUID AS $$
DECLARE c public.legal_cases; v_int UUID; v_app UUID; chk JSONB;
BEGIN
  PERFORM public.legal_assert_permission('legal.request_intimation');
  c := public.legal_get_case(p_case_id, true);
  chk := public.legal_refresh_checklist(c.id);
  IF NOT (chk->>'complete')::boolean THEN
    RAISE EXCEPTION 'LEGAL_FILE_INCOMPLETE: expediente incompleto. Faltan: %', chk->>'missing';
  END IF;
  IF EXISTS (SELECT 1 FROM public.legal_approvals WHERE case_id = c.id AND approval_type='intimation' AND status IN ('requested','reviewed')) THEN
    RAISE EXCEPTION 'LEGAL_ALREADY_REQUESTED: ya hay una solicitud de intimación pendiente';
  END IF;

  INSERT INTO public.legal_intimations (company_id, case_id, status, claimed_amount, created_by, responsible_id)
  VALUES (c.company_id, c.id, 'pending_approval', c.pending_amount, auth.uid(), c.assigned_to)
  RETURNING id INTO v_int;
  INSERT INTO public.legal_approvals (company_id, case_id, intimation_id, approval_type, status, requested_by, request_notes)
  VALUES (c.company_id, c.id, v_int, 'intimation', 'requested', auth.uid(), p_notes)
  RETURNING id INTO v_app;
  UPDATE public.legal_intimations SET approval_id = v_app WHERE id = v_int;

  PERFORM public.legal_add_event(c.id, 'intimation_requested', 'Solicitud de intimación enviada a aprobación' || COALESCE('. ' || p_notes,''), NULL, NULL,
    jsonb_build_object('intimation_id', v_int, 'approval_id', v_app));
  PERFORM public.legal_case_set_status(c.id, 'pending_legal_approval', 'Solicitud de intimación', jsonb_build_object('approval_id', v_app), true);
  UPDATE public.legal_cases SET next_action_note = 'Pendiente de revisión y aprobación de la intimación' WHERE id = c.id;
  RETURN v_app;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.legal_review_approval(p_approval_id UUID, p_notes TEXT DEFAULT NULL)
RETURNS VOID AS $$
DECLARE a RECORD;
BEGIN
  PERFORM public.legal_assert_permission('legal.review');
  SELECT * INTO a FROM public.legal_approvals WHERE id = p_approval_id AND company_id = get_user_company_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'LEGAL_NOT_FOUND: solicitud no encontrada'; END IF;
  IF a.status <> 'requested' THEN RAISE EXCEPTION 'LEGAL_INVALID_STATE: la solicitud ya está %', a.status; END IF;
  UPDATE public.legal_approvals SET status = 'reviewed', reviewed_by = auth.uid(), reviewed_at = now(), review_notes = p_notes WHERE id = a.id;
  PERFORM public.legal_add_event(a.case_id, 'approval_reviewed', 'Solicitud revisada por supervisión' || COALESCE('. ' || p_notes,''), NULL, NULL, jsonb_build_object('approval_id', a.id));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.legal_decide_approval(p_approval_id UUID, p_approve BOOLEAN, p_notes TEXT DEFAULT NULL)
RETURNS VOID AS $$
DECLARE a RECORD; c public.legal_cases;
BEGIN
  PERFORM public.legal_assert_permission('legal.approve');
  SELECT * INTO a FROM public.legal_approvals WHERE id = p_approval_id AND company_id = get_user_company_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'LEGAL_NOT_FOUND: solicitud no encontrada'; END IF;
  IF a.status NOT IN ('requested','reviewed') THEN RAISE EXCEPTION 'LEGAL_INVALID_STATE: la solicitud ya está %', a.status; END IF;
  IF NOT p_approve AND COALESCE(p_notes,'') = '' THEN RAISE EXCEPTION 'LEGAL_REASON_REQUIRED: indique el motivo del rechazo'; END IF;
  c := public.legal_get_case(a.case_id, true);

  UPDATE public.legal_approvals SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
    decided_by = auth.uid(), decided_at = now(), decision_notes = p_notes WHERE id = a.id;

  IF a.approval_type = 'intimation' THEN
    IF p_approve THEN
      UPDATE public.legal_intimations SET status = 'approved' WHERE id = a.intimation_id;
      PERFORM public.legal_add_event(c.id, 'intimation_approved', 'Intimación APROBADA' || COALESCE('. ' || p_notes,''), NULL, NULL, jsonb_build_object('approval_id', a.id, 'intimation_id', a.intimation_id));
      PERFORM public.legal_case_set_status(c.id, 'intimation_preparing', 'Intimación aprobada', jsonb_build_object('approval_id', a.id), true);
      UPDATE public.legal_cases SET next_action_note = 'Preparar y emitir la carta de intimación' WHERE id = c.id;
    ELSE
      UPDATE public.legal_intimations SET status = 'closed', notes = COALESCE(notes,'') || ' | Rechazada: ' || p_notes WHERE id = a.intimation_id;
      PERFORM public.legal_add_event(c.id, 'intimation_rejected', 'Intimación RECHAZADA: ' || p_notes, NULL, NULL, jsonb_build_object('approval_id', a.id, 'intimation_id', a.intimation_id));
      PERFORM public.legal_case_set_status(c.id, 'pre_legal', 'Solicitud rechazada: ' || p_notes, jsonb_build_object('approval_id', a.id), true);
      UPDATE public.legal_cases SET next_action_note = 'Atender observaciones del rechazo: ' || p_notes WHERE id = c.id;
    END IF;
  ELSIF a.approval_type = 'escalation' AND p_approve THEN
    PERFORM public.legal_case_set_status(c.id, 'escalated', 'Escalamiento aprobado', jsonb_build_object('approval_id', a.id), true);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.legal_issue_intimation(p_intimation_id UUID, p_content TEXT, p_breakdown JSONB DEFAULT '{}'::jsonb, p_claimed_amount NUMERIC DEFAULT NULL, p_document_id UUID DEFAULT NULL)
RETURNS TEXT AS $$
DECLARE i RECORD; c public.legal_cases; v_number TEXT;
BEGIN
  PERFORM public.legal_assert_permission('legal.issue');
  SELECT * INTO i FROM public.legal_intimations WHERE id = p_intimation_id AND company_id = get_user_company_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'LEGAL_NOT_FOUND: intimación no encontrada'; END IF;
  IF i.status <> 'approved' THEN RAISE EXCEPTION 'LEGAL_NOT_APPROVED: la intimación debe estar aprobada antes de emitirse (estado actual: %)', i.status; END IF;
  IF COALESCE(p_content,'') = '' THEN RAISE EXCEPTION 'LEGAL_CONTENT_REQUIRED: el contenido de la intimación está vacío'; END IF;
  c := public.legal_get_case(i.case_id, true);

  v_number := public.legal_next_number(c.company_id, 'INT');
  UPDATE public.legal_intimations SET status = 'issued', intimation_number = v_number, content = p_content, breakdown = COALESCE(p_breakdown,'{}'::jsonb),
    claimed_amount = COALESCE(p_claimed_amount, claimed_amount), document_id = COALESCE(p_document_id, document_id), issued_at = now(), issued_by = auth.uid()
    WHERE id = i.id;

  PERFORM public.legal_add_event(c.id, 'intimation_issued', format('Intimación %s emitida por RD$%s', v_number, COALESCE(p_claimed_amount, i.claimed_amount)), NULL, NULL,
    jsonb_build_object('intimation_id', i.id, 'intimation_number', v_number, 'document_id', p_document_id));
  PERFORM public.legal_case_set_status(c.id, 'intimation_issued', 'Intimación emitida', jsonb_build_object('intimation_id', i.id), true);
  UPDATE public.legal_cases SET next_action_note = 'Notificar la intimación al cliente y registrar la evidencia', next_action_at = CURRENT_DATE WHERE id = c.id;
  RETURN v_number;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.legal_register_notification(
  p_intimation_id UUID, p_notified_at TIMESTAMPTZ, p_method TEXT, p_result TEXT,
  p_notified_by TEXT DEFAULT NULL, p_received_by TEXT DEFAULT NULL, p_evidence_document_id UUID DEFAULT NULL, p_notes TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE i RECORD; c public.legal_cases; s JSONB; v_id UUID; v_deadline DATE;
BEGIN
  PERFORM public.legal_assert_permission('legal.manage');
  SELECT * INTO i FROM public.legal_intimations WHERE id = p_intimation_id AND company_id = get_user_company_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'LEGAL_NOT_FOUND: intimación no encontrada'; END IF;
  IF i.status NOT IN ('issued','not_notified','notified') THEN RAISE EXCEPTION 'LEGAL_INVALID_STATE: la intimación debe estar emitida (estado: %)', i.status; END IF;
  c := public.legal_get_case(i.case_id, true);
  s := public.legal_get_settings(c.company_id);
  IF p_result = 'delivered' AND (s->>'require_notification_evidence')::boolean AND p_evidence_document_id IS NULL THEN
    RAISE EXCEPTION 'LEGAL_EVIDENCE_REQUIRED: la configuración exige adjuntar evidencia de la notificación entregada';
  END IF;

  INSERT INTO public.legal_intimation_notifications (company_id, intimation_id, notified_at, method, notified_by, received_by, result, evidence_document_id, notes, created_by)
  VALUES (c.company_id, i.id, p_notified_at, p_method, p_notified_by, p_received_by, p_result, p_evidence_document_id, p_notes, auth.uid())
  RETURNING id INTO v_id;

  IF p_result = 'delivered' THEN
    v_deadline := p_notified_at::date + (s->>'deadline_days')::int;
    UPDATE public.legal_intimations SET status = 'notified', notified_at = p_notified_at, deadline_date = v_deadline WHERE id = i.id;
    PERFORM public.legal_add_event(c.id, 'intimation_notified', format('Intimación %s notificada (%s). Plazo hasta %s', i.intimation_number, p_method, v_deadline), NULL, NULL,
      jsonb_build_object('intimation_id', i.id, 'notification_id', v_id, 'deadline_date', v_deadline, 'evidence_document_id', p_evidence_document_id), p_result);
    PERFORM public.legal_case_set_status(c.id, 'intimation_notified', 'Intimación notificada', jsonb_build_object('notification_id', v_id), true);
    PERFORM public.legal_case_set_status(c.id, 'in_deadline_period', 'Inicia período de plazo', jsonb_build_object('deadline_date', v_deadline), true);
    UPDATE public.legal_cases SET next_action_at = v_deadline, next_action_note = format('Vence el plazo de la intimación (%s). Verificar pago o escalar', v_deadline) WHERE id = c.id;
  ELSE
    UPDATE public.legal_intimations SET status = 'not_notified' WHERE id = i.id AND status <> 'notified';
    PERFORM public.legal_add_event(c.id, 'intimation_notification_attempt', format('Intento de notificación (%s): %s', p_method, p_result), NULL, NULL,
      jsonb_build_object('intimation_id', i.id, 'notification_id', v_id), p_result);
    UPDATE public.legal_cases SET next_action_at = CURRENT_DATE + 1, next_action_note = 'Reintentar la notificación de la intimación' WHERE id = c.id;
  END IF;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.legal_record_intimation_response(p_intimation_id UUID, p_notes TEXT)
RETURNS VOID AS $$
DECLARE i RECORD;
BEGIN
  PERFORM public.legal_assert_permission('legal.manage');
  SELECT * INTO i FROM public.legal_intimations WHERE id = p_intimation_id AND company_id = get_user_company_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'LEGAL_NOT_FOUND: intimación no encontrada'; END IF;
  UPDATE public.legal_intimations SET status = 'responded', responded_at = now(), response_notes = p_notes WHERE id = i.id;
  PERFORM public.legal_add_event(i.case_id, 'intimation_responded', 'Respuesta del cliente a la intimación: ' || COALESCE(p_notes,''), NULL, NULL, jsonb_build_object('intimation_id', i.id));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ----------------------------------------------------------------------------
-- Escalamiento y cierre
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.legal_escalate_case(p_case_id UUID, p_reason TEXT, p_to_judicial BOOLEAN DEFAULT false)
RETURNS VOID AS $$
DECLARE c public.legal_cases;
BEGIN
  PERFORM public.legal_assert_permission('legal.escalate');
  c := public.legal_get_case(p_case_id, true);
  IF COALESCE(p_reason,'') = '' THEN RAISE EXCEPTION 'LEGAL_REASON_REQUIRED: indique el motivo del escalamiento'; END IF;
  IF p_to_judicial THEN
    PERFORM public.legal_case_set_status(c.id, 'judicial', p_reason, '{}'::jsonb, false);
    UPDATE public.legal_cases SET next_action_note = 'Proceso judicial en curso: dar seguimiento con el abogado' WHERE id = c.id;
  ELSE
    PERFORM public.legal_case_set_status(c.id, 'escalated', p_reason, '{}'::jsonb, false);
    UPDATE public.legal_cases SET next_action_at = CURRENT_DATE + (public.legal_get_settings(c.company_id)->>'followup_days')::int,
      next_action_note = 'Remitir expediente al abogado / iniciar proceso legal' WHERE id = c.id;
  END IF;
  PERFORM public.legal_add_event(c.id, 'case_escalated', 'Caso escalado: ' || p_reason, NULL, NULL, jsonb_build_object('judicial', p_to_judicial));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.legal_close_case(p_case_id UUID, p_close_reason TEXT, p_notes TEXT DEFAULT NULL, p_agreement_id UUID DEFAULT NULL)
RETURNS VOID AS $$
DECLARE c public.legal_cases; v_final TEXT;
BEGIN
  PERFORM public.legal_assert_permission('legal.close');
  c := public.legal_get_case(p_case_id, true);
  IF COALESCE(p_close_reason,'') = '' THEN RAISE EXCEPTION 'LEGAL_REASON_REQUIRED: indique el motivo de cierre'; END IF;
  IF p_close_reason NOT IN ('full_payment','payment_agreement','restructuring','cancellation','administrative_error','judicial_escalation','other') THEN
    RAISE EXCEPTION 'LEGAL_INVALID_REASON: motivo de cierre no válido';
  END IF;
  v_final := CASE WHEN p_close_reason IN ('full_payment','payment_agreement','restructuring') THEN 'resolved' ELSE 'closed' END;
  UPDATE public.legal_cases SET close_reason = p_close_reason, close_notes = p_notes, agreement_id = COALESCE(p_agreement_id, agreement_id) WHERE id = c.id;
  PERFORM public.legal_case_set_status(c.id, v_final, p_close_reason || COALESCE(': ' || p_notes,''), jsonb_build_object('close_reason', p_close_reason, 'agreement_id', p_agreement_id), false);
  UPDATE public.legal_intimations SET status = 'closed' WHERE case_id = c.id AND status NOT IN ('closed','responded');
  UPDATE public.legal_case_tasks SET status = 'cancelled' WHERE case_id = c.id AND status IN ('pending','in_progress','overdue');
  PERFORM public.legal_add_event(c.id, 'case_closed', format('Caso cerrado (%s)%s', p_close_reason, COALESCE(': ' || p_notes,'')), NULL, v_final, jsonb_build_object('close_reason', p_close_reason));
  -- La etapa del préstamo vuelve a calcularse por días de atraso
  UPDATE public.loans SET collection_stage = public.legal_compute_collection_stage(c.loan_id), collection_stage_since = CURRENT_DATE WHERE id = c.loan_id;
  INSERT INTO public.loan_history (loan_id, change_type, old_value, new_value, description, created_by)
  VALUES (c.loan_id, 'status_change', 'legal', v_final, format('Cierre de caso legal %s: %s', c.case_number, p_close_reason), auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ----------------------------------------------------------------------------
-- Tareas
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.legal_add_task(p_case_id UUID, p_title TEXT, p_task_type TEXT DEFAULT 'follow_up', p_description TEXT DEFAULT NULL, p_assigned_to UUID DEFAULT NULL, p_due_date DATE DEFAULT NULL, p_priority TEXT DEFAULT 'medium')
RETURNS UUID AS $$
DECLARE c public.legal_cases; v_id UUID;
BEGIN
  PERFORM public.legal_assert_permission('legal.manage');
  c := public.legal_get_case(p_case_id, true);
  IF COALESCE(p_title,'') = '' THEN RAISE EXCEPTION 'LEGAL_TITLE_REQUIRED: la tarea necesita un título'; END IF;
  INSERT INTO public.legal_case_tasks (company_id, case_id, title, description, task_type, assigned_to, due_date, priority, created_by)
  VALUES (c.company_id, c.id, p_title, p_description, COALESCE(p_task_type,'follow_up'), COALESCE(p_assigned_to, c.assigned_to), p_due_date, COALESCE(p_priority,'medium'), auth.uid())
  RETURNING id INTO v_id;
  PERFORM public.legal_add_event(c.id, 'task_created', 'Tarea creada: ' || p_title, NULL, NULL, jsonb_build_object('task_id', v_id, 'due_date', p_due_date, 'assigned_to', p_assigned_to));
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.legal_update_task(p_task_id UUID, p_status TEXT, p_notes TEXT DEFAULT NULL)
RETURNS VOID AS $$
DECLARE t RECORD;
BEGIN
  PERFORM public.legal_assert_permission('legal.manage');
  SELECT * INTO t FROM public.legal_case_tasks WHERE id = p_task_id AND company_id = get_user_company_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'LEGAL_NOT_FOUND: tarea no encontrada'; END IF;
  IF p_status NOT IN ('pending','in_progress','completed','cancelled') THEN RAISE EXCEPTION 'LEGAL_INVALID_STATE: estado de tarea no válido'; END IF;
  UPDATE public.legal_case_tasks SET status = p_status,
    completed_at = CASE WHEN p_status = 'completed' THEN now() ELSE NULL END,
    completed_by = CASE WHEN p_status = 'completed' THEN auth.uid() ELSE NULL END,
    description = CASE WHEN p_notes IS NOT NULL THEN COALESCE(description,'') || E'\n' || p_notes ELSE description END
    WHERE id = t.id;
  PERFORM public.legal_add_event(t.case_id, 'task_updated', format('Tarea "%s": %s', t.title, p_status), NULL, NULL, jsonb_build_object('task_id', t.id, 'status', p_status));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ----------------------------------------------------------------------------
-- Documentos del caso (metadatos; el archivo va al bucket legal-evidence)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.legal_register_document(p_case_id UUID, p_title TEXT, p_document_type TEXT, p_file_name TEXT, p_file_path TEXT, p_mime_type TEXT DEFAULT NULL, p_file_size BIGINT DEFAULT NULL, p_description TEXT DEFAULT NULL)
RETURNS UUID AS $$
DECLARE c public.legal_cases; v_id UUID;
BEGIN
  PERFORM public.legal_assert_permission('legal.manage');
  c := public.legal_get_case(p_case_id, false);
  INSERT INTO public.documents (user_id, loan_id, client_id, legal_case_id, title, file_name, file_url, description, document_type, mime_type, file_size, status)
  VALUES (c.company_id, c.loan_id, c.client_id, c.id, p_title, p_file_name, p_file_path, p_description, COALESCE(p_document_type,'legal_evidence'), p_mime_type, p_file_size, 'active')
  RETURNING id INTO v_id;
  PERFORM public.legal_add_event(c.id, 'document_added', format('Documento agregado: %s (%s)', p_title, COALESCE(p_document_type,'legal_evidence')), NULL, NULL, jsonb_build_object('document_id', v_id, 'document_type', p_document_type));
  PERFORM public.legal_refresh_checklist(c.id);
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ----------------------------------------------------------------------------
-- Configuración (solo legal.config)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.legal_save_settings(p_settings JSONB)
RETURNS VOID AS $$
DECLARE v_company UUID;
BEGIN
  PERFORM public.legal_assert_permission('legal.config');
  v_company := get_user_company_id();
  UPDATE public.company_settings SET
    collection_days_preventive     = COALESCE((p_settings->>'preventive')::int, collection_days_preventive),
    collection_days_administrative = COALESCE((p_settings->>'administrative')::int, collection_days_administrative),
    collection_days_intensive      = COALESCE((p_settings->>'intensive')::int, collection_days_intensive),
    collection_days_prelegal       = COALESCE((p_settings->>'prelegal')::int, collection_days_prelegal),
    legal_min_days_overdue         = COALESCE((p_settings->>'min_days_overdue')::int, legal_min_days_overdue),
    legal_min_amount               = COALESCE((p_settings->>'min_amount')::numeric, legal_min_amount),
    legal_min_broken_promises      = COALESCE((p_settings->>'min_broken_promises')::int, legal_min_broken_promises),
    legal_min_contacts             = COALESCE((p_settings->>'min_contacts')::int, legal_min_contacts),
    legal_intimation_deadline_days = COALESCE((p_settings->>'deadline_days')::int, legal_intimation_deadline_days),
    legal_followup_days            = COALESCE((p_settings->>'followup_days')::int, legal_followup_days),
    legal_escalation_days          = COALESCE((p_settings->>'escalation_days')::int, legal_escalation_days),
    legal_required_documents       = COALESCE(p_settings->'required_documents', legal_required_documents),
    legal_require_notification_evidence = COALESCE((p_settings->>'require_notification_evidence')::boolean, legal_require_notification_evidence),
    legal_intimation_template      = COALESCE(p_settings->>'intimation_template', legal_intimation_template)
  WHERE user_id = v_company;
  IF NOT FOUND THEN RAISE EXCEPTION 'LEGAL_SETTINGS_NOT_FOUND: la empresa no tiene configuración creada (Mi Empresa)'; END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.legal_set_transition(p_from TEXT, p_to TEXT, p_enabled BOOLEAN, p_required_permission TEXT DEFAULT NULL, p_requires_complete_file BOOLEAN DEFAULT NULL, p_requires_reason BOOLEAN DEFAULT NULL)
RETURNS VOID AS $$
DECLARE v_company UUID; g RECORD;
BEGIN
  PERFORM public.legal_assert_permission('legal.config');
  v_company := get_user_company_id();
  SELECT * INTO g FROM public.legal_stage_transitions WHERE company_id IS NULL AND from_status = p_from AND to_status = p_to;
  INSERT INTO public.legal_stage_transitions (company_id, from_status, to_status, required_permission, requires_complete_file, requires_reason, enabled, label)
  VALUES (v_company, p_from, p_to, COALESCE(p_required_permission, g.required_permission, 'legal.manage'),
          COALESCE(p_requires_complete_file, g.requires_complete_file, false), COALESCE(p_requires_reason, g.requires_reason, false), p_enabled, g.label)
  ON CONFLICT (company_id, from_status, to_status) DO UPDATE SET
    enabled = EXCLUDED.enabled,
    required_permission = COALESCE(p_required_permission, public.legal_stage_transitions.required_permission),
    requires_complete_file = COALESCE(p_requires_complete_file, public.legal_stage_transitions.requires_complete_file),
    requires_reason = COALESCE(p_requires_reason, public.legal_stage_transitions.requires_reason);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ----------------------------------------------------------------------------
-- Barrido diario (idempotente; se invoca al abrir el módulo)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.legal_sweep()
RETURNS JSONB AS $$
DECLARE
  v_company UUID; s JSONB; r RECORD; v_stage TEXT;
  n_stages INT := 0; n_promises INT := 0; n_tasks INT := 0; n_intimations INT := 0; n_escalations INT := 0;
BEGIN
  PERFORM public.legal_assert_permission('legal.view');
  v_company := get_user_company_id();
  s := public.legal_get_settings(v_company);

  -- 1) Etapa de cobranza de cada préstamo activo
  FOR r IN SELECT id, collection_stage FROM public.loans WHERE loan_officer_id = v_company AND status IN ('active','overdue') AND deleted_at IS NULL LOOP
    v_stage := public.legal_compute_collection_stage(r.id);
    IF v_stage IS DISTINCT FROM r.collection_stage THEN
      UPDATE public.loans SET collection_stage = v_stage, collection_stage_since = CURRENT_DATE WHERE id = r.id;
      n_stages := n_stages + 1;
    END IF;
  END LOOP;

  -- 2) Promesas vencidas → incumplidas (y el caso vuelve a su etapa anterior)
  FOR r IN SELECT * FROM public.collection_promises WHERE company_id = v_company AND status = 'pending' AND promised_date < CURRENT_DATE LOOP
    UPDATE public.collection_promises SET status = 'broken', resolved_at = now() WHERE id = r.id;
    n_promises := n_promises + 1;
    IF r.case_id IS NOT NULL THEN
      PERFORM public.legal_add_event(r.case_id, 'promise_broken', format('Promesa de pago INCUMPLIDA: RD$%s prometidos para el %s', r.amount, r.promised_date), NULL, NULL, jsonb_build_object('promise_id', r.id), 'broken');
      BEGIN
        PERFORM public.legal_case_set_status(r.case_id,
          (SELECT CASE WHEN previous_status IN ('in_deadline_period','intimation_notified') THEN 'in_deadline_period' ELSE 'pre_legal' END FROM public.legal_cases WHERE id = r.case_id),
          'Promesa incumplida', jsonb_build_object('promise_id', r.id), true);
      EXCEPTION WHEN OTHERS THEN NULL; END;
      UPDATE public.legal_cases SET next_action_at = CURRENT_DATE, next_action_note = 'Promesa incumplida: contactar al cliente o solicitar intimación' WHERE id = r.case_id AND status NOT IN ('resolved','closed');
    END IF;
  END LOOP;

  -- 3) Tareas vencidas
  UPDATE public.legal_case_tasks SET status = 'overdue' WHERE company_id = v_company AND status IN ('pending','in_progress') AND due_date < CURRENT_DATE;
  GET DIAGNOSTICS n_tasks = ROW_COUNT;

  -- 4) Intimaciones con plazo vencido → sugerir escalamiento
  FOR r IN SELECT i.*, c.status AS case_status FROM public.legal_intimations i JOIN public.legal_cases c ON c.id = i.case_id
           WHERE i.company_id = v_company AND i.status = 'notified' AND i.deadline_date < CURRENT_DATE LOOP
    UPDATE public.legal_intimations SET status = 'expired' WHERE id = r.id;
    n_intimations := n_intimations + 1;
    PERFORM public.legal_add_event(r.case_id, 'intimation_expired', format('Plazo de la intimación %s vencido el %s sin pago', r.intimation_number, r.deadline_date), NULL, NULL, jsonb_build_object('intimation_id', r.id), 'expired');
    IF r.case_status IN ('in_deadline_period','intimation_notified') THEN
      UPDATE public.legal_cases SET next_action_at = CURRENT_DATE, next_action_note = 'Plazo de intimación vencido: evaluar escalamiento a proceso legal' WHERE id = r.case_id;
      n_escalations := n_escalations + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('stages_updated', n_stages, 'promises_broken', n_promises, 'tasks_overdue', n_tasks, 'intimations_expired', n_intimations, 'escalations_suggested', n_escalations, 'ran_at', now());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ----------------------------------------------------------------------------
-- Triggers de integración con pagos y gestiones existentes
-- ----------------------------------------------------------------------------

-- Pago recibido → actualizar caso, cumplir promesas, cambiar estado
CREATE OR REPLACE FUNCTION public.legal_on_payment_insert()
RETURNS TRIGGER AS $$
DECLARE c RECORD; l RECORD; p RECORD; v_balance NUMERIC;
BEGIN
  SELECT * INTO c FROM public.legal_cases WHERE loan_id = NEW.loan_id AND status NOT IN ('resolved','closed') LIMIT 1;

  -- Promesas pendientes del préstamo (con o sin caso)
  FOR p IN SELECT * FROM public.collection_promises WHERE loan_id = NEW.loan_id AND status = 'pending' ORDER BY promised_date LOOP
    IF NEW.amount >= p.amount - 0.01 THEN
      UPDATE public.collection_promises SET status = 'fulfilled', actual_payment_date = NEW.payment_date::date, resolved_at = now() WHERE id = p.id;
      IF c.id IS NOT NULL THEN
        PERFORM public.legal_add_event(c.id, 'promise_fulfilled', format('Promesa de pago CUMPLIDA: RD$%s', p.amount), NULL, NULL, jsonb_build_object('promise_id', p.id, 'payment_id', NEW.id), 'fulfilled');
      END IF;
      EXIT;
    END IF;
  END LOOP;

  IF c.id IS NULL THEN RETURN NEW; END IF;

  SELECT remaining_balance, current_late_fee INTO l FROM public.loans WHERE id = NEW.loan_id;
  v_balance := COALESCE(l.remaining_balance,0) + COALESCE(l.current_late_fee,0);
  UPDATE public.legal_cases SET paid_amount = paid_amount + COALESCE(NEW.amount,0), pending_amount = GREATEST(0, v_balance) WHERE id = c.id;
  PERFORM public.legal_add_event(c.id, 'payment_received', format('Pago recibido: RD$%s (saldo pendiente RD$%s)', NEW.amount, GREATEST(0, v_balance)), NULL, NULL,
    jsonb_build_object('payment_id', NEW.id, 'amount', NEW.amount, 'pending_amount', GREATEST(0, v_balance)));

  BEGIN
    IF v_balance <= 0.01 THEN
      PERFORM public.legal_case_set_status(c.id, 'paid', 'Saldo pagado en su totalidad', jsonb_build_object('payment_id', NEW.id), true);
      UPDATE public.legal_cases SET next_action_at = CURRENT_DATE, next_action_note = 'Préstamo pagado: cerrar el caso como resuelto' WHERE id = c.id;
    ELSIF c.status IN ('pre_legal','intimation_issued','in_deadline_period','payment_promise') THEN
      PERFORM public.legal_case_set_status(c.id, 'partial_payment', 'Pago parcial recibido', jsonb_build_object('payment_id', NEW.id), true);
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_legal_on_payment_insert ON public.payments;
CREATE TRIGGER trg_legal_on_payment_insert AFTER INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.legal_on_payment_insert();

-- Gestión registrada → vincular al caso, evento, promesa si aplica
CREATE OR REPLACE FUNCTION public.legal_on_tracking_before_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.legal_case_id IS NULL THEN
    SELECT id INTO NEW.legal_case_id FROM public.legal_cases WHERE loan_id = NEW.loan_id AND status NOT IN ('resolved','closed') LIMIT 1;
  END IF;
  IF NEW.contacted IS NULL AND NEW.result IS NOT NULL THEN
    NEW.contacted := NEW.result IN ('contacted','payment_promise','refuses','requests_negotiation','payment_made','agreement');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

CREATE OR REPLACE FUNCTION public.legal_on_tracking_after_insert()
RETURNS TRIGGER AS $$
DECLARE c RECORD; l RECORD; v_promise UUID;
BEGIN
  IF NEW.legal_case_id IS NOT NULL THEN
    SELECT * INTO c FROM public.legal_cases WHERE id = NEW.legal_case_id;
    PERFORM public.legal_add_event(c.id, 'collection_contact',
      format('Gestión de cobro (%s)%s%s', NEW.contact_type,
        CASE WHEN NEW.result IS NOT NULL THEN ': ' || NEW.result ELSE '' END,
        CASE WHEN COALESCE(NEW.client_response,'') <> '' THEN '. ' || NEW.client_response ELSE '' END),
      NULL, NULL, jsonb_build_object('tracking_id', NEW.id, 'contact_type', NEW.contact_type, 'contacted', NEW.contacted, 'contacted_person', NEW.contacted_person), NEW.result);
    IF NEW.next_contact_date IS NOT NULL THEN
      UPDATE public.legal_cases SET next_action_at = NEW.next_contact_date, next_action_note = 'Próximo contacto programado' WHERE id = c.id AND status NOT IN ('resolved','closed');
    END IF;
  END IF;

  -- Promesa de pago capturada en la gestión
  IF NEW.result = 'payment_promise' AND NEW.promise_amount IS NOT NULL AND NEW.promise_amount > 0 AND NEW.promise_date IS NOT NULL THEN
    SELECT * INTO l FROM public.loans WHERE id = NEW.loan_id;
    INSERT INTO public.collection_promises (company_id, case_id, loan_id, client_id, tracking_id, amount, promised_date, notes, created_by)
    VALUES (l.loan_officer_id, NEW.legal_case_id, NEW.loan_id, l.client_id, NEW.id, NEW.promise_amount, NEW.promise_date, NEW.client_response, NEW.created_by)
    RETURNING id INTO v_promise;
    IF NEW.legal_case_id IS NOT NULL THEN
      PERFORM public.legal_add_event(NEW.legal_case_id, 'promise_created', format('Promesa de pago: RD$%s para el %s', NEW.promise_amount, NEW.promise_date), NULL, NULL, jsonb_build_object('promise_id', v_promise, 'tracking_id', NEW.id));
      BEGIN
        PERFORM public.legal_case_set_status(NEW.legal_case_id, 'payment_promise', 'Promesa de pago registrada en gestión', jsonb_build_object('promise_id', v_promise), true);
      EXCEPTION WHEN OTHERS THEN NULL; END;
      UPDATE public.legal_cases SET next_action_at = NEW.promise_date, next_action_note = 'Verificar cumplimiento de la promesa de pago' WHERE id = NEW.legal_case_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_legal_on_tracking_before_insert ON public.collection_tracking;
CREATE TRIGGER trg_legal_on_tracking_before_insert BEFORE INSERT ON public.collection_tracking
  FOR EACH ROW EXECUTE FUNCTION public.legal_on_tracking_before_insert();
DROP TRIGGER IF EXISTS trg_legal_on_tracking_after_insert ON public.collection_tracking;
CREATE TRIGGER trg_legal_on_tracking_after_insert AFTER INSERT ON public.collection_tracking
  FOR EACH ROW EXECUTE FUNCTION public.legal_on_tracking_after_insert();

-- Etapa inicial de todos los préstamos activos (una vez)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.loans WHERE status IN ('active','overdue') AND deleted_at IS NULL LOOP
    UPDATE public.loans SET collection_stage = public.legal_compute_collection_stage(r.id), collection_stage_since = COALESCE(collection_stage_since, CURRENT_DATE) WHERE id = r.id;
  END LOOP;
END $$;
