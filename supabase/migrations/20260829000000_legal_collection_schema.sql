-- ============================================================================
-- MÓDULO DE COBRANZA LEGAL E INTIMACIÓN — ESQUEMA
-- ============================================================================
-- Ver diseño completo en LEGAL_COBRANZA_PLAN.md.
--
-- Principios:
--  · `loans.status` NO cambia de significado. La etapa de cobranza vive en
--    `loans.collection_stage` (etapas previas al caso) y en `legal_cases.status`.
--  · Todas las escrituras sensibles pasan por funciones SQL (migración siguiente).
--    Las tablas de caso/intimación/aprobación/eventos solo permiten SELECT por RLS.
--  · `legal_case_events` es append-only: no hay políticas UPDATE/DELETE y un trigger
--    lo impide incluso para el dueño de la tabla.
--  · Nada jurídico hardcodeado: umbrales, plazos, checklist y plantilla son
--    configuración por empresa con valores iniciales OPERATIVOS que el
--    administrador debe revisar con su asesor legal.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Cambios aditivos en tablas existentes
-- ----------------------------------------------------------------------------

-- Etapa de cobranza del préstamo (automática, la recalcula legal_sweep)
ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS collection_stage TEXT
    CHECK (collection_stage IN ('al_dia','cuota_vencida','mora','cobranza_preventiva',
                                'cobranza_administrativa','cobranza_intensiva','pre_legal','legal')),
  ADD COLUMN IF NOT EXISTS collection_stage_since DATE;

CREATE INDEX IF NOT EXISTS idx_loans_collection_stage ON public.loans(loan_officer_id, collection_stage);

-- Gestiones de cobro: campos que faltaban para cobranza/legal (todos nullable →
-- el módulo de Seguimiento existente sigue funcionando sin cambios)
ALTER TABLE public.collection_tracking
  ADD COLUMN IF NOT EXISTS legal_case_id UUID,
  ADD COLUMN IF NOT EXISTS result TEXT
    CHECK (result IS NULL OR result IN ('contacted','no_answer','wrong_number','not_located',
           'payment_promise','refuses','requests_negotiation','payment_made','agreement','escalate','other')),
  ADD COLUMN IF NOT EXISTS contacted BOOLEAN,
  ADD COLUMN IF NOT EXISTS contacted_person TEXT,
  ADD COLUMN IF NOT EXISTS promise_amount NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS promise_date DATE;

-- Ampliar tipos de contacto (whatsapp, reunión, notificación formal)
ALTER TABLE public.collection_tracking DROP CONSTRAINT IF EXISTS collection_tracking_contact_type_check;
ALTER TABLE public.collection_tracking
  ADD CONSTRAINT collection_tracking_contact_type_check
  CHECK (contact_type IN ('phone','email','sms','visit','letter','other','whatsapp','meeting','notification'));

CREATE INDEX IF NOT EXISTS idx_collection_tracking_case ON public.collection_tracking(legal_case_id);

-- Documentos: vínculo al caso legal
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS legal_case_id UUID;
CREATE INDEX IF NOT EXISTS idx_documents_legal_case ON public.documents(legal_case_id);

-- Configuración de cobranza por empresa (valores iniciales OPERATIVOS, no jurídicos)
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS collection_days_preventive     INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS collection_days_administrative INTEGER NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS collection_days_intensive      INTEGER NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS collection_days_prelegal       INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS legal_min_days_overdue         INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS legal_min_amount               NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS legal_min_broken_promises      INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS legal_min_contacts             INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS legal_intimation_deadline_days INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS legal_followup_days            INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS legal_escalation_days          INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS legal_required_documents       JSONB NOT NULL DEFAULT
      '["contract","identification","contact_data","address","statement","collection_evidence"]'::jsonb,
  ADD COLUMN IF NOT EXISTS legal_require_notification_evidence BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS legal_intimation_template      TEXT;

COMMENT ON COLUMN public.company_settings.legal_intimation_template IS
'Plantilla de la carta de intimación con placeholders ({cliente_nombre}, {saldo_pendiente}, {fecha_limite_intimacion}, ...). Debe ser revisada por el asesor legal de la empresa; el sistema no aporta lenguaje jurídico.';

-- ----------------------------------------------------------------------------
-- 2) Tablas nuevas
-- ----------------------------------------------------------------------------

-- Secuencias por empresa/prefijo/año para EXP-2026-0001, INT-2026-0001
CREATE TABLE IF NOT EXISTS public.legal_sequences (
  company_id UUID NOT NULL,
  prefix     TEXT NOT NULL,
  year       INTEGER NOT NULL,
  last_value INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, prefix, year)
);

-- Expediente / caso
CREATE TABLE IF NOT EXISTS public.legal_cases (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id         UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  loan_id           UUID NOT NULL REFERENCES public.loans(id) ON DELETE RESTRICT,
  case_number       TEXT NOT NULL,
  case_type         TEXT NOT NULL DEFAULT 'collection' CHECK (case_type IN ('collection','legal')),
  status            TEXT NOT NULL DEFAULT 'pre_legal' CHECK (status IN (
                      'pre_legal','pending_legal_approval','intimation_preparing','intimation_issued',
                      'intimation_notified','in_deadline_period','payment_promise','payment_agreement',
                      'partial_payment','paid','resolved','escalated','judicial','suspended','closed')),
  previous_status   TEXT,
  priority          TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
  claimed_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid_amount       NUMERIC(14,2) NOT NULL DEFAULT 0,
  pending_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
  days_overdue_at_open INTEGER,
  entered_stage_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_action_at    TIMESTAMPTZ,
  next_action_at    DATE,
  next_action_note  TEXT,
  assigned_to       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  lawyer_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  lawyer_name       TEXT,
  reason            TEXT,
  notes             TEXT,
  agreement_id      UUID REFERENCES public.payment_agreements(id) ON DELETE SET NULL,
  superseded_case_id UUID REFERENCES public.legal_cases(id) ON DELETE SET NULL,
  duplicate_justification TEXT,
  opened_by         UUID REFERENCES auth.users(id),
  opened_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at         TIMESTAMPTZ,
  closed_by         UUID REFERENCES auth.users(id),
  close_reason      TEXT CHECK (close_reason IS NULL OR close_reason IN ('full_payment','payment_agreement',
                      'restructuring','cancellation','administrative_error','judicial_escalation','other')),
  close_notes       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, case_number)
);

-- Anti-duplicados: un solo caso abierto por préstamo (override solo por función con justificación)
CREATE UNIQUE INDEX IF NOT EXISTS uq_legal_cases_open_per_loan
  ON public.legal_cases(loan_id) WHERE status NOT IN ('resolved','closed');
CREATE INDEX IF NOT EXISTS idx_legal_cases_company_status ON public.legal_cases(company_id, status);
CREATE INDEX IF NOT EXISTS idx_legal_cases_assigned ON public.legal_cases(assigned_to);
CREATE INDEX IF NOT EXISTS idx_legal_cases_next_action ON public.legal_cases(company_id, next_action_at);

ALTER TABLE public.collection_tracking
  DROP CONSTRAINT IF EXISTS collection_tracking_legal_case_id_fkey;
ALTER TABLE public.collection_tracking
  ADD CONSTRAINT collection_tracking_legal_case_id_fkey
  FOREIGN KEY (legal_case_id) REFERENCES public.legal_cases(id) ON DELETE SET NULL;
ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_legal_case_id_fkey;
ALTER TABLE public.documents
  ADD CONSTRAINT documents_legal_case_id_fkey
  FOREIGN KEY (legal_case_id) REFERENCES public.legal_cases(id) ON DELETE SET NULL;

-- Timeline + auditoría (append-only)
CREATE TABLE IF NOT EXISTS public.legal_case_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id       UUID NOT NULL REFERENCES public.legal_cases(id) ON DELETE CASCADE,
  company_id    UUID NOT NULL,
  event_type    TEXT NOT NULL,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor_id      UUID,
  actor_name    TEXT,
  description   TEXT NOT NULL,
  result        TEXT,
  old_status    TEXT,
  new_status    TEXT,
  data          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_legal_case_events_case ON public.legal_case_events(case_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_legal_case_events_company ON public.legal_case_events(company_id, occurred_at DESC);

-- Promesas de pago (informales; los acuerdos formales siguen en payment_agreements)
CREATE TABLE IF NOT EXISTS public.collection_promises (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL,
  case_id         UUID REFERENCES public.legal_cases(id) ON DELETE SET NULL,
  loan_id         UUID NOT NULL REFERENCES public.loans(id) ON DELETE CASCADE,
  client_id       UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  tracking_id     UUID REFERENCES public.collection_tracking(id) ON DELETE SET NULL,
  amount          NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  promised_date   DATE NOT NULL,
  actual_payment_date DATE,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','fulfilled','broken','cancelled')),
  notes           TEXT,
  created_by      UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_collection_promises_loan ON public.collection_promises(loan_id, status);
CREATE INDEX IF NOT EXISTS idx_collection_promises_company ON public.collection_promises(company_id, status, promised_date);

-- Aprobaciones (solicitud → revisión → decisión)
CREATE TABLE IF NOT EXISTS public.legal_approvals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL,
  case_id         UUID NOT NULL REFERENCES public.legal_cases(id) ON DELETE CASCADE,
  intimation_id   UUID,
  approval_type   TEXT NOT NULL DEFAULT 'intimation' CHECK (approval_type IN ('intimation','escalation','closure')),
  status          TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','reviewed','approved','rejected','cancelled')),
  requested_by    UUID REFERENCES auth.users(id),
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  request_notes   TEXT,
  reviewed_by     UUID REFERENCES auth.users(id),
  reviewed_at     TIMESTAMPTZ,
  review_notes    TEXT,
  decided_by      UUID REFERENCES auth.users(id),
  decided_at      TIMESTAMPTZ,
  decision_notes  TEXT
);
CREATE INDEX IF NOT EXISTS idx_legal_approvals_case ON public.legal_approvals(case_id, status);
CREATE INDEX IF NOT EXISTS idx_legal_approvals_company_status ON public.legal_approvals(company_id, status);

-- Intimaciones
CREATE TABLE IF NOT EXISTS public.legal_intimations (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID NOT NULL,
  case_id            UUID NOT NULL REFERENCES public.legal_cases(id) ON DELETE CASCADE,
  approval_id        UUID REFERENCES public.legal_approvals(id) ON DELETE SET NULL,
  intimation_number  TEXT,
  status             TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_approval','approved','issued',
                        'notified','not_notified','expired','responded','closed')),
  claimed_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
  breakdown          JSONB NOT NULL DEFAULT '{}'::jsonb,
  template_key       TEXT NOT NULL DEFAULT 'intimacion',
  content            TEXT,
  document_id        UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  responsible_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by         UUID REFERENCES auth.users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  issued_at          TIMESTAMPTZ,
  issued_by          UUID REFERENCES auth.users(id),
  notified_at        TIMESTAMPTZ,
  deadline_date      DATE,
  responded_at       TIMESTAMPTZ,
  response_notes     TEXT,
  notes              TEXT,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, intimation_number)
);
CREATE INDEX IF NOT EXISTS idx_legal_intimations_case ON public.legal_intimations(case_id);
CREATE INDEX IF NOT EXISTS idx_legal_intimations_deadline ON public.legal_intimations(company_id, status, deadline_date);

ALTER TABLE public.legal_approvals DROP CONSTRAINT IF EXISTS legal_approvals_intimation_id_fkey;
ALTER TABLE public.legal_approvals
  ADD CONSTRAINT legal_approvals_intimation_id_fkey
  FOREIGN KEY (intimation_id) REFERENCES public.legal_intimations(id) ON DELETE SET NULL;

-- Intentos de notificación de la intimación
CREATE TABLE IF NOT EXISTS public.legal_intimation_notifications (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL,
  intimation_id         UUID NOT NULL REFERENCES public.legal_intimations(id) ON DELETE CASCADE,
  notified_at           TIMESTAMPTZ NOT NULL,
  method                TEXT NOT NULL CHECK (method IN ('physical','courier','certified_mail','notary','email','whatsapp','other')),
  notified_by           TEXT,
  received_by           TEXT,
  result                TEXT NOT NULL CHECK (result IN ('delivered','refused','absent','wrong_address','other')),
  evidence_document_id  UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  notes                 TEXT,
  created_by            UUID REFERENCES auth.users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_legal_intimation_notifications_intimation ON public.legal_intimation_notifications(intimation_id);

-- Tareas del caso
CREATE TABLE IF NOT EXISTS public.legal_case_tasks (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL,
  case_id       UUID NOT NULL REFERENCES public.legal_cases(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT,
  task_type     TEXT NOT NULL DEFAULT 'follow_up' CHECK (task_type IN ('call','send_document','verify_payment',
                  'request_document','review_file','send_to_lawyer','verify_notification','follow_up','escalate','other')),
  assigned_to   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  due_date      DATE,
  priority      TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','cancelled','overdue')),
  completed_at  TIMESTAMPTZ,
  completed_by  UUID REFERENCES auth.users(id),
  created_by    UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_legal_case_tasks_case ON public.legal_case_tasks(case_id, status);
CREATE INDEX IF NOT EXISTS idx_legal_case_tasks_assigned ON public.legal_case_tasks(assigned_to, status, due_date);

-- Checklist del expediente (pre-legal)
CREATE TABLE IF NOT EXISTS public.legal_case_checklist (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL,
  case_id       UUID NOT NULL REFERENCES public.legal_cases(id) ON DELETE CASCADE,
  item_key      TEXT NOT NULL CHECK (item_key IN ('contract','identification','contact_data','address',
                  'payment_history','statement','collection_evidence','broken_promises','other')),
  required      BOOLEAN NOT NULL DEFAULT true,
  satisfied     BOOLEAN NOT NULL DEFAULT false,
  auto_detected BOOLEAN NOT NULL DEFAULT false,
  document_id   UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  verified_by   UUID REFERENCES auth.users(id),
  verified_at   TIMESTAMPTZ,
  notes         TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (case_id, item_key)
);

-- Workflow configurable: transiciones permitidas (company_id NULL = plantilla global)
CREATE TABLE IF NOT EXISTS public.legal_stage_transitions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID,
  from_status           TEXT NOT NULL,
  to_status             TEXT NOT NULL,
  required_permission   TEXT,            -- NULL = solo el sistema (triggers/barrido)
  requires_complete_file BOOLEAN NOT NULL DEFAULT false,
  requires_reason       BOOLEAN NOT NULL DEFAULT false,
  enabled               BOOLEAN NOT NULL DEFAULT true,
  label                 TEXT,
  UNIQUE (company_id, from_status, to_status)
);

-- Flujo base (plantilla global). El admin puede copiarlo a su empresa y ajustarlo.
INSERT INTO public.legal_stage_transitions (company_id, from_status, to_status, required_permission, requires_complete_file, requires_reason, label) VALUES
  (NULL,'pre_legal','pending_legal_approval','legal.request_intimation',true,false,'Solicitar intimación'),
  (NULL,'pre_legal','payment_promise','legal.manage',false,false,'Registrar promesa de pago'),
  (NULL,'pre_legal','payment_agreement','legal.manage',false,false,'Acuerdo de pago'),
  (NULL,'pending_legal_approval','intimation_preparing','legal.approve',false,false,'Aprobar intimación'),
  (NULL,'pending_legal_approval','pre_legal','legal.approve',false,true,'Rechazar solicitud'),
  (NULL,'intimation_preparing','intimation_issued','legal.issue',false,false,'Emitir intimación'),
  (NULL,'intimation_issued','intimation_notified','legal.manage',false,false,'Registrar notificación'),
  (NULL,'intimation_notified','in_deadline_period',NULL,false,false,'Inicia plazo'),
  (NULL,'in_deadline_period','payment_promise','legal.manage',false,false,'Promesa de pago'),
  (NULL,'in_deadline_period','payment_agreement','legal.manage',false,false,'Acuerdo de pago'),
  (NULL,'in_deadline_period','partial_payment',NULL,false,false,'Pago parcial recibido'),
  (NULL,'in_deadline_period','paid',NULL,false,false,'Pago total recibido'),
  (NULL,'in_deadline_period','escalated','legal.escalate',false,true,'Escalar a proceso legal'),
  (NULL,'intimation_issued','partial_payment',NULL,false,false,'Pago parcial recibido'),
  (NULL,'intimation_issued','paid',NULL,false,false,'Pago total recibido'),
  (NULL,'pre_legal','partial_payment',NULL,false,false,'Pago parcial recibido'),
  (NULL,'pre_legal','paid',NULL,false,false,'Pago total recibido'),
  (NULL,'payment_promise','pre_legal',NULL,false,false,'Promesa incumplida'),
  (NULL,'payment_promise','in_deadline_period',NULL,false,false,'Promesa incumplida (con plazo vigente)'),
  (NULL,'payment_promise','partial_payment',NULL,false,false,'Pago parcial recibido'),
  (NULL,'payment_promise','paid',NULL,false,false,'Pago total recibido'),
  (NULL,'payment_promise','escalated','legal.escalate',false,true,'Escalar a proceso legal'),
  (NULL,'partial_payment','pre_legal','legal.manage',false,false,'Continuar cobranza'),
  (NULL,'partial_payment','in_deadline_period','legal.manage',false,false,'Continuar plazo'),
  (NULL,'partial_payment','payment_promise','legal.manage',false,false,'Promesa de pago'),
  (NULL,'partial_payment','paid',NULL,false,false,'Pago total recibido'),
  (NULL,'partial_payment','escalated','legal.escalate',false,true,'Escalar a proceso legal'),
  (NULL,'paid','resolved','legal.close',false,false,'Cerrar como resuelto'),
  (NULL,'payment_agreement','resolved','legal.close',false,false,'Cerrar como resuelto'),
  (NULL,'payment_agreement','pre_legal','legal.manage',false,true,'Acuerdo incumplido'),
  (NULL,'escalated','judicial','legal.escalate',false,false,'Proceso judicial iniciado'),
  (NULL,'escalated','resolved','legal.close',false,true,'Resuelto'),
  (NULL,'judicial','resolved','legal.close',false,true,'Resuelto'),
  (NULL,'suspended','pre_legal','legal.manage',false,true,'Reanudar'),
  (NULL,'suspended','in_deadline_period','legal.manage',false,true,'Reanudar plazo')
ON CONFLICT DO NOTHING;

-- Suspender y cerrar se permiten desde cualquier estado activo (se validan en la función)

-- ----------------------------------------------------------------------------
-- 3) updated_at automático
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.legal_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_legal_cases_updated ON public.legal_cases;
CREATE TRIGGER trg_legal_cases_updated BEFORE UPDATE ON public.legal_cases
  FOR EACH ROW EXECUTE FUNCTION public.legal_touch_updated_at();
DROP TRIGGER IF EXISTS trg_legal_intimations_updated ON public.legal_intimations;
CREATE TRIGGER trg_legal_intimations_updated BEFORE UPDATE ON public.legal_intimations
  FOR EACH ROW EXECUTE FUNCTION public.legal_touch_updated_at();
DROP TRIGGER IF EXISTS trg_legal_case_tasks_updated ON public.legal_case_tasks;
CREATE TRIGGER trg_legal_case_tasks_updated BEFORE UPDATE ON public.legal_case_tasks
  FOR EACH ROW EXECUTE FUNCTION public.legal_touch_updated_at();
DROP TRIGGER IF EXISTS trg_legal_case_checklist_updated ON public.legal_case_checklist;
CREATE TRIGGER trg_legal_case_checklist_updated BEFORE UPDATE ON public.legal_case_checklist
  FOR EACH ROW EXECUTE FUNCTION public.legal_touch_updated_at();

-- Auditoría inmutable: ni UPDATE ni DELETE, ni siquiera para el dueño de la tabla
CREATE OR REPLACE FUNCTION public.legal_events_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'LEGAL_AUDIT_IMMUTABLE: los eventos del caso no se pueden modificar ni eliminar';
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_legal_events_immutable ON public.legal_case_events;
CREATE TRIGGER trg_legal_events_immutable BEFORE UPDATE OR DELETE ON public.legal_case_events
  FOR EACH ROW EXECUTE FUNCTION public.legal_events_immutable();

-- Contenido de la intimación congelado tras la emisión
CREATE OR REPLACE FUNCTION public.legal_intimation_freeze()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IN ('issued','notified','not_notified','expired','responded','closed') THEN
    IF NEW.content IS DISTINCT FROM OLD.content
       OR NEW.breakdown IS DISTINCT FROM OLD.breakdown
       OR NEW.claimed_amount IS DISTINCT FROM OLD.claimed_amount
       OR NEW.intimation_number IS DISTINCT FROM OLD.intimation_number
       OR NEW.issued_at IS DISTINCT FROM OLD.issued_at THEN
      RAISE EXCEPTION 'LEGAL_INTIMATION_FROZEN: una intimación emitida no puede modificarse';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_legal_intimation_freeze ON public.legal_intimations;
CREATE TRIGGER trg_legal_intimation_freeze BEFORE UPDATE ON public.legal_intimations
  FOR EACH ROW EXECUTE FUNCTION public.legal_intimation_freeze();

-- ----------------------------------------------------------------------------
-- 4) RLS: lectura por empresa; escritura SOLO vía funciones SECURITY DEFINER
-- ----------------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['legal_cases','legal_case_events','collection_promises','legal_approvals',
                           'legal_intimations','legal_intimation_notifications','legal_case_tasks',
                           'legal_case_checklist','legal_sequences'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select_company', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (company_id = get_user_company_id())',
                   t || '_select_company', t);
  END LOOP;
END $$;

-- Transiciones: lectura de la plantilla global + las propias; edición solo con legal.config (vía función)
ALTER TABLE public.legal_stage_transitions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS legal_stage_transitions_select ON public.legal_stage_transitions;
CREATE POLICY legal_stage_transitions_select ON public.legal_stage_transitions
  FOR SELECT TO authenticated USING (company_id IS NULL OR company_id = get_user_company_id());

-- ----------------------------------------------------------------------------
-- 5) Bucket PRIVADO para evidencia legal (el bucket `documents` es público)
--    Ruta: company-{companyId}/case-{caseId}/archivo. Acceso por empresa, no por
--    usuario, así los empleados también pueden subir (a diferencia de `documents`).
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('legal-evidence', 'legal-evidence', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='legal_evidence_select_company') THEN
    CREATE POLICY legal_evidence_select_company ON storage.objects FOR SELECT TO authenticated
      USING (bucket_id = 'legal-evidence' AND (storage.foldername(name))[1] = 'company-' || get_user_company_id()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='legal_evidence_insert_company') THEN
    CREATE POLICY legal_evidence_insert_company ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'legal-evidence' AND (storage.foldername(name))[1] = 'company-' || get_user_company_id()::text);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='legal_evidence_delete_company') THEN
    CREATE POLICY legal_evidence_delete_company ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'legal-evidence' AND (storage.foldername(name))[1] = 'company-' || get_user_company_id()::text);
  END IF;
END $$;

COMMENT ON TABLE public.legal_cases IS 'Expediente de cobranza legal. Escritura exclusivamente vía funciones legal_* (SECURITY DEFINER) que validan permisos y transiciones.';
COMMENT ON TABLE public.legal_case_events IS 'Timeline y auditoría del caso. Append-only (trigger impide UPDATE/DELETE).';
COMMENT ON TABLE public.legal_stage_transitions IS 'Workflow configurable: transiciones permitidas entre estados del caso, permiso requerido y precondiciones. company_id NULL = plantilla global.';
