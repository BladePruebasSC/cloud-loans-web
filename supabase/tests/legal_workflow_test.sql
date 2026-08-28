-- ============================================================================
-- PRUEBAS DEL WORKFLOW DE COBRANZA LEGAL (ejecutar en un proyecto de PRUEBA)
-- ============================================================================
-- Requisitos: migraciones 20260829000000 y 20260829000001 aplicadas.
-- Cómo: SQL Editor de Supabase o `psql "$DATABASE_URL" -f supabase/tests/legal_workflow_test.sql`
-- Todo corre dentro de una transacción que se REVIERTE al final (no deja datos).
--
-- Simula tres usuarios de una misma empresa con distintos permisos:
--   · dueño   (todo)
--   · cobrador (legal.view, legal.manage, legal.open, legal.request_intimation)
--   · legal    (+ legal.review, legal.approve, legal.issue, legal.escalate, legal.close)
-- y un usuario de OTRA empresa que no debe ver nada.
-- ============================================================================
BEGIN;

CREATE TEMP TABLE t_ids (k TEXT PRIMARY KEY, v UUID);
INSERT INTO t_ids VALUES ('owner', gen_random_uuid()), ('collector', gen_random_uuid()), ('legal', gen_random_uuid()), ('other', gen_random_uuid());

-- Usuarios auth (solo lo mínimo)
INSERT INTO auth.users (id, email, instance_id, aud, role, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
SELECT v, k || '@test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'x', now(), now(), now(), '{}'::jsonb, '{}'::jsonb FROM t_ids;

-- Empresa del dueño
INSERT INTO public.company_settings (user_id, company_name, legal_min_days_overdue, legal_min_contacts, legal_min_broken_promises, legal_intimation_deadline_days, legal_required_documents, legal_require_notification_evidence)
SELECT v, 'Empresa Test', 30, 1, 0, 10, '["contact_data"]'::jsonb, false FROM t_ids WHERE k='owner';
INSERT INTO public.company_settings (user_id, company_name) SELECT v, 'Otra Empresa' FROM t_ids WHERE k='other';

-- Empleados con permisos
INSERT INTO public.employees (company_owner_id, auth_user_id, full_name, email, role, status, permissions)
SELECT (SELECT v FROM t_ids WHERE k='owner'), v, 'Cobrador', 'collector@test.local', 'collector', 'active',
  '{"legal.view":true,"legal.manage":true,"legal.open":true,"legal.request_intimation":true}'::jsonb FROM t_ids WHERE k='collector';
INSERT INTO public.employees (company_owner_id, auth_user_id, full_name, email, role, status, permissions)
SELECT (SELECT v FROM t_ids WHERE k='owner'), v, 'Abogado', 'legal@test.local', 'manager', 'active',
  '{"legal.view":true,"legal.manage":true,"legal.open":true,"legal.request_intimation":true,"legal.review":true,"legal.approve":true,"legal.issue":true,"legal.escalate":true,"legal.close":true,"legal.assign":true}'::jsonb FROM t_ids WHERE k='legal';

-- Cliente y préstamo con 45 días de atraso
INSERT INTO public.clients (id, user_id, company_id, full_name, dni, phone, address, status)
VALUES ('11111111-1111-1111-1111-111111111111', (SELECT v FROM t_ids WHERE k='owner'), (SELECT v FROM t_ids WHERE k='owner'), 'Cliente Prueba', '001-0000000-1', '809-000-0000', 'Calle 1', 'active');
INSERT INTO public.loans (id, client_id, loan_officer_id, amount, interest_rate, term_months, monthly_payment, total_amount, remaining_balance, start_date, end_date, next_payment_date, first_payment_date, status, amortization_type, payment_frequency, grace_period_days, current_late_fee)
VALUES ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', (SELECT v FROM t_ids WHERE k='owner'), 10000, 5, 12, 1333.33, 16000, 12000,
        CURRENT_DATE - 120, CURRENT_DATE + 240, CURRENT_DATE - 45, CURRENT_DATE - 120, 'active', 'simple', 'monthly', 0, 500);

-- Helper para simular al usuario autenticado (RLS + auth.uid())
CREATE OR REPLACE FUNCTION pg_temp.as_user(p_key TEXT) RETURNS VOID AS $$
DECLARE uid UUID;
BEGIN
  SELECT v INTO uid FROM t_ids WHERE k = p_key;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', uid::text, true);
  PERFORM set_config('role', 'authenticated', true);
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.expect_error(p_sql TEXT, p_code TEXT, p_label TEXT) RETURNS VOID AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
    RAISE EXCEPTION 'FALLO %: se esperaba error % y no ocurrió', p_label, p_code;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE p_code || '%' THEN RAISE NOTICE 'OK %: %', p_label, split_part(SQLERRM, E'\n', 1);
    ELSE RAISE EXCEPTION 'FALLO %: error inesperado: %', p_label, SQLERRM; END IF;
  END;
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.expect(p_cond BOOLEAN, p_label TEXT) RETURNS VOID AS $$
BEGIN
  IF p_cond THEN RAISE NOTICE 'OK %', p_label; ELSE RAISE EXCEPTION 'FALLO %', p_label; END IF;
END $$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 1) Elegibilidad: sin gestiones → no elegible; con gestión → elegible
-- ----------------------------------------------------------------------------
SELECT pg_temp.as_user('collector');
SELECT pg_temp.expect((public.legal_evaluate_eligibility('22222222-2222-2222-2222-222222222222')->>'status') = 'not_eligible', '1a elegibilidad: no elegible sin gestiones');

INSERT INTO public.collection_tracking (loan_id, contact_type, contact_date, contact_time, client_response, created_by, result)
VALUES ('22222222-2222-2222-2222-222222222222', 'phone', CURRENT_DATE - 5, '10:00', 'No puede pagar aún', (SELECT v FROM t_ids WHERE k='collector'), 'contacted');
SELECT pg_temp.expect((public.legal_evaluate_eligibility('22222222-2222-2222-2222-222222222222')->>'status') = 'eligible', '1b elegibilidad: elegible con 45 días y 1 gestión');

-- ----------------------------------------------------------------------------
-- 2) Abrir caso: motivo obligatorio; duplicado bloqueado; etapa del préstamo = legal
-- ----------------------------------------------------------------------------
SELECT pg_temp.expect_error($$SELECT public.legal_open_case('22222222-2222-2222-2222-222222222222', '', 'high')$$, 'LEGAL_REASON_REQUIRED', '2a apertura sin motivo');
SELECT public.legal_open_case('22222222-2222-2222-2222-222222222222', '45 días de mora', 'high') AS case_id \gset
INSERT INTO t_ids VALUES ('case', :'case_id');
SELECT pg_temp.expect((SELECT status FROM public.legal_cases WHERE id = :'case_id') = 'pre_legal', '2b caso en pre_legal');
SELECT pg_temp.expect((SELECT case_number FROM public.legal_cases WHERE id = :'case_id') ~ '^EXP-\d{4}-0001$', '2c número de expediente');
SELECT pg_temp.expect((SELECT collection_stage FROM public.loans WHERE id='22222222-2222-2222-2222-222222222222') = 'legal', '2d loans.collection_stage = legal');
SELECT pg_temp.expect_error($$SELECT public.legal_open_case('22222222-2222-2222-2222-222222222222', 'otro', 'high')$$, 'LEGAL_DUPLICATE_CASE', '2e duplicado bloqueado');
SELECT pg_temp.expect_error($$SELECT public.legal_open_case('22222222-2222-2222-2222-222222222222', 'otro', 'high', NULL, 'justificación larga')$$, 'LEGAL_PERMISSION_DENIED', '2f override requiere permiso');

-- ----------------------------------------------------------------------------
-- 3) Transiciones no permitidas y por sistema
-- ----------------------------------------------------------------------------
SELECT pg_temp.expect_error(format($$SELECT public.legal_case_transition('%s', 'intimation_issued')$$, :'case_id'), 'LEGAL_TRANSITION_NOT_ALLOWED', '3a pre_legal → emitida directo');
SELECT pg_temp.expect_error(format($$SELECT public.legal_case_transition('%s', 'paid')$$, :'case_id'), 'LEGAL_TRANSITION_NOT_ALLOWED', '3b transición de sistema desde usuario');

-- ----------------------------------------------------------------------------
-- 4) Promesa vía gestión → promesa creada → estado payment_promise → barrido la incumple
-- ----------------------------------------------------------------------------
INSERT INTO public.collection_tracking (loan_id, contact_type, contact_date, contact_time, client_response, created_by, result, promise_amount, promise_date)
VALUES ('22222222-2222-2222-2222-222222222222', 'whatsapp', CURRENT_DATE, '11:00', 'Pagará el viernes', (SELECT v FROM t_ids WHERE k='collector'), 'payment_promise', 2000, CURRENT_DATE + 2);
SELECT pg_temp.expect((SELECT count(*) FROM public.collection_promises WHERE loan_id='22222222-2222-2222-2222-222222222222' AND status='pending') = 1, '4a promesa creada desde gestión');
SELECT pg_temp.expect((SELECT status FROM public.legal_cases WHERE id = :'case_id') = 'payment_promise', '4b caso en payment_promise');
UPDATE public.collection_promises SET promised_date = CURRENT_DATE - 1 WHERE loan_id='22222222-2222-2222-2222-222222222222'; -- simular que pasó la fecha
SELECT public.legal_sweep();
SELECT pg_temp.expect((SELECT status FROM public.collection_promises WHERE loan_id='22222222-2222-2222-2222-222222222222' LIMIT 1) = 'broken', '4c barrido marca promesa incumplida');
SELECT pg_temp.expect((SELECT status FROM public.legal_cases WHERE id = :'case_id') = 'pre_legal', '4d caso vuelve a pre_legal');
SELECT pg_temp.expect(EXISTS (SELECT 1 FROM public.legal_case_events WHERE case_id = :'case_id' AND event_type='promise_broken'), '4e evento promise_broken');

-- ----------------------------------------------------------------------------
-- 5) Solicitud → revisión → aprobación → emisión → notificación → plazo
-- ----------------------------------------------------------------------------
SELECT public.legal_request_intimation(:'case_id', 'Cliente no responde') AS approval_id \gset
SELECT pg_temp.expect((SELECT status FROM public.legal_cases WHERE id = :'case_id') = 'pending_legal_approval', '5a pendiente de aprobación');
SELECT pg_temp.expect_error(format($$SELECT public.legal_request_intimation('%s')$$, :'case_id'), 'LEGAL_ALREADY_REQUESTED', '5b doble solicitud');
SELECT pg_temp.expect_error(format($$SELECT public.legal_decide_approval('%s', true)$$, :'approval_id'), 'LEGAL_PERMISSION_DENIED', '5c cobrador no puede aprobar');

SELECT pg_temp.as_user('legal');
SELECT public.legal_review_approval(:'approval_id', 'Revisado');
SELECT pg_temp.expect_error(format($$SELECT public.legal_decide_approval('%s', false)$$, :'approval_id'), 'LEGAL_REASON_REQUIRED', '5d rechazo sin motivo');
SELECT public.legal_decide_approval(:'approval_id', true, 'Procede');
SELECT pg_temp.expect((SELECT status FROM public.legal_cases WHERE id = :'case_id') = 'intimation_preparing', '5e aprobada → en preparación');
SELECT id AS intimation_id FROM public.legal_intimations WHERE case_id = :'case_id' \gset
SELECT pg_temp.expect((SELECT status FROM public.legal_intimations WHERE id = :'intimation_id') = 'approved', '5f intimación aprobada');

SELECT pg_temp.expect_error(format($$SELECT public.legal_issue_intimation('%s', '')$$, :'intimation_id'), 'LEGAL_CONTENT_REQUIRED', '5g emitir sin contenido');
SELECT public.legal_issue_intimation(:'intimation_id', 'Texto de la carta', '{"claimed_amount":12500}'::jsonb, 12500) AS int_number \gset
SELECT pg_temp.expect(:'int_number' ~ '^INT-\d{4}-0001$', '5h número de intimación');
SELECT pg_temp.expect((SELECT status FROM public.legal_cases WHERE id = :'case_id') = 'intimation_issued', '5i caso en intimation_issued');
SELECT pg_temp.expect_error(format($$UPDATE public.legal_intimations SET content = 'hack' WHERE id='%s'$$, :'intimation_id'), 'LEGAL_INTIMATION_FROZEN', '5j contenido congelado');
SELECT pg_temp.expect_error(format($$SELECT public.legal_issue_intimation('%s', 'otra vez')$$, :'intimation_id'), 'LEGAL_NOT_APPROVED', '5k no se emite dos veces');

-- Notificación: intento fallido no inicia plazo; entregada sí
SELECT public.legal_register_notification(:'intimation_id', now(), 'physical', 'absent', 'Mensajero', NULL, NULL, 'No estaba');
SELECT pg_temp.expect((SELECT status FROM public.legal_intimations WHERE id = :'intimation_id') = 'not_notified', '5l intento fallido → not_notified');
SELECT public.legal_register_notification(:'intimation_id', now(), 'physical', 'delivered', 'Mensajero', 'Cliente', NULL, 'Recibió');
SELECT pg_temp.expect((SELECT status FROM public.legal_intimations WHERE id = :'intimation_id') = 'notified', '5m entregada → notified');
SELECT pg_temp.expect((SELECT deadline_date FROM public.legal_intimations WHERE id = :'intimation_id') = CURRENT_DATE + 10, '5n plazo = notificación + 10 días configurados');
SELECT pg_temp.expect((SELECT status FROM public.legal_cases WHERE id = :'case_id') = 'in_deadline_period', '5o caso en período de plazo');

-- Evidencia obligatoria cuando la configuración lo exige
UPDATE public.company_settings SET legal_require_notification_evidence = true WHERE user_id = (SELECT v FROM t_ids WHERE k='owner');
UPDATE public.legal_intimations SET status = 'issued' WHERE id = :'intimation_id'; -- solo para probar la validación
SELECT pg_temp.expect_error(format($$SELECT public.legal_register_notification('%s', now(), 'courier', 'delivered')$$, :'intimation_id'), 'LEGAL_EVIDENCE_REQUIRED', '5p evidencia obligatoria');
UPDATE public.legal_intimations SET status = 'notified' WHERE id = :'intimation_id';

-- ----------------------------------------------------------------------------
-- 6) Plazo vencido → barrido marca expired; pago parcial → partial_payment; pago total → paid
-- ----------------------------------------------------------------------------
UPDATE public.legal_intimations SET deadline_date = CURRENT_DATE - 1 WHERE id = :'intimation_id';
SELECT public.legal_sweep();
SELECT pg_temp.expect((SELECT status FROM public.legal_intimations WHERE id = :'intimation_id') = 'expired', '6a intimación expirada por barrido');

INSERT INTO public.payments (loan_id, company_id, amount, principal_amount, interest_amount, due_date, payment_date, payment_method, status, created_by)
VALUES ('22222222-2222-2222-2222-222222222222', (SELECT v FROM t_ids WHERE k='owner'), 3000, 2500, 500, CURRENT_DATE - 45, CURRENT_DATE, 'cash', 'completed', (SELECT v FROM t_ids WHERE k='legal'));
SELECT pg_temp.expect((SELECT status FROM public.legal_cases WHERE id = :'case_id') = 'partial_payment', '6b pago parcial → partial_payment');
SELECT pg_temp.expect((SELECT paid_amount FROM public.legal_cases WHERE id = :'case_id') = 3000, '6c paid_amount acumulado');
SELECT pg_temp.expect(EXISTS (SELECT 1 FROM public.legal_case_events WHERE case_id = :'case_id' AND event_type='payment_received'), '6d evento payment_received');

-- ----------------------------------------------------------------------------
-- 7) Auditoría inmutable, cierre con motivo, caso cerrado no admite acciones
-- ----------------------------------------------------------------------------
SELECT pg_temp.expect_error(format($$DELETE FROM public.legal_case_events WHERE case_id='%s'$$, :'case_id'), 'LEGAL_AUDIT_IMMUTABLE', '7a no se borra la auditoría');
SELECT pg_temp.expect_error(format($$SELECT public.legal_close_case('%s', '')$$, :'case_id'), 'LEGAL_REASON_REQUIRED', '7b cierre sin motivo');
SELECT public.legal_close_case(:'case_id', 'payment_agreement', 'Acordado');
SELECT pg_temp.expect((SELECT status FROM public.legal_cases WHERE id = :'case_id') = 'resolved', '7c cierre por acuerdo → resolved');
SELECT pg_temp.expect((SELECT collection_stage FROM public.loans WHERE id='22222222-2222-2222-2222-222222222222') <> 'legal', '7d etapa del préstamo recalculada');
SELECT pg_temp.expect_error(format($$SELECT public.legal_add_task('%s', 'Tarea')$$, :'case_id'), 'LEGAL_CASE_CLOSED', '7e caso cerrado no admite tareas');
SELECT pg_temp.expect(EXISTS (SELECT 1 FROM public.loan_history WHERE loan_id='22222222-2222-2222-2222-222222222222' AND change_type='status_change' AND new_value='resolved'), '7f loan_history refleja el cierre');

-- Reapertura tras cierre: el índice parcial ya no bloquea
SELECT public.legal_open_case('22222222-2222-2222-2222-222222222222', 'Acuerdo incumplido', 'critical') AS case2 \gset
SELECT pg_temp.expect((SELECT case_number FROM public.legal_cases WHERE id = :'case2') ~ '0002$', '7g segundo expediente numerado');

-- ----------------------------------------------------------------------------
-- 8) Aislamiento entre empresas (RLS + funciones)
-- ----------------------------------------------------------------------------
SELECT pg_temp.as_user('other');
SELECT pg_temp.expect((SELECT count(*) FROM public.legal_cases) = 0, '8a otra empresa no ve casos');
SELECT pg_temp.expect((SELECT count(*) FROM public.legal_case_events) = 0, '8b otra empresa no ve eventos');
SELECT pg_temp.expect_error(format($$SELECT public.legal_add_task('%s', 'x')$$, :'case2'), 'LEGAL_CASE_NOT_FOUND', '8c otra empresa no opera el caso');
SELECT pg_temp.expect_error($$SELECT public.legal_evaluate_eligibility('22222222-2222-2222-2222-222222222222')$$, 'LEGAL_LOAN_NOT_FOUND', '8d otra empresa no evalúa el préstamo');

-- Usuario sin permiso de configuración
SELECT pg_temp.as_user('collector');
SELECT pg_temp.expect_error($$SELECT public.legal_save_settings('{"deadline_days": 5}'::jsonb)$$, 'LEGAL_PERMISSION_DENIED', '8e cobrador no configura');

RAISE NOTICE '=== TODAS LAS PRUEBAS PASARON (se revierte la transacción) ===';
ROLLBACK;
