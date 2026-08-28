-- ============================================================================
-- CRM DE CLIENTES: perfil comercial y score de comportamiento de pago
-- ============================================================================
--
-- El score se CALCULA en el frontend (src/utils/clientScoring.ts) a partir de
-- préstamos, pagos, seguimientos de cobro, ventas y empeños, y se GUARDA aquí como
-- snapshot para que:
--   · otras pantallas puedan leerlo sin recalcular (y `clients.credit_score` se
--     sincroniza con él, así la pantalla de Clientes lo muestra sin cambios),
--   · el usuario pueda anular la categoría a mano, etiquetar y anotar al cliente,
--   · quede constancia de cuándo se calculó por última vez.
--
-- Las interacciones con el cliente NO se duplican aquí: el CRM usa la tabla
-- `collection_tracking` (módulo de Seguimiento de Cobro) como bitácora única.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.client_crm_profiles (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         UUID NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
  -- Dueño de la empresa (mismo valor que clients.user_id / loans.loan_officer_id)
  company_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Resultado del motor de score
  score             INTEGER NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 1000),
  category          TEXT NOT NULL DEFAULT 'nuevo'
                    CHECK (category IN ('caliente', 'tibio', 'frio', 'nuevo')),
  risk_level        TEXT NOT NULL DEFAULT 'bajo'
                    CHECK (risk_level IN ('bajo', 'medio', 'alto')),
  payment_behavior  TEXT NOT NULL DEFAULT 'sin_historial'
                    CHECK (payment_behavior IN ('puntual', 'ocasionalmente_tarde',
                                                'frecuentemente_tarde', 'moroso', 'sin_historial')),
  -- Desglose completo (componentes, métricas, banderas) para auditoría/reportes
  metrics           JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Campos editables por el usuario
  manual_category   TEXT CHECK (manual_category IN ('caliente', 'tibio', 'frio')),
  tags              TEXT[] NOT NULL DEFAULT '{}',
  crm_notes         TEXT,
  assigned_to       UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_crm_profiles_company   ON public.client_crm_profiles(company_id);
CREATE INDEX IF NOT EXISTS idx_client_crm_profiles_category  ON public.client_crm_profiles(company_id, category);
CREATE INDEX IF NOT EXISTS idx_client_crm_profiles_score     ON public.client_crm_profiles(company_id, score DESC);

-- updated_at automático
CREATE OR REPLACE FUNCTION public.update_client_crm_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_client_crm_profiles_updated_at ON public.client_crm_profiles;
CREATE TRIGGER trg_client_crm_profiles_updated_at
  BEFORE UPDATE ON public.client_crm_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_client_crm_profiles_updated_at();

-- ----------------------------------------------------------------------------
-- RLS: multi-empresa con el helper existente get_user_company_id()
-- (dueño → auth.uid(); empleado → company_owner_id de su fila en employees)
-- ----------------------------------------------------------------------------
ALTER TABLE public.client_crm_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "crm_profiles_select_company" ON public.client_crm_profiles;
DROP POLICY IF EXISTS "crm_profiles_insert_company" ON public.client_crm_profiles;
DROP POLICY IF EXISTS "crm_profiles_update_company" ON public.client_crm_profiles;
DROP POLICY IF EXISTS "crm_profiles_delete_company" ON public.client_crm_profiles;

CREATE POLICY "crm_profiles_select_company"
  ON public.client_crm_profiles FOR SELECT TO authenticated
  USING (company_id = get_user_company_id());

CREATE POLICY "crm_profiles_insert_company"
  ON public.client_crm_profiles FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id());

CREATE POLICY "crm_profiles_update_company"
  ON public.client_crm_profiles FOR UPDATE TO authenticated
  USING (company_id = get_user_company_id())
  WITH CHECK (company_id = get_user_company_id());

CREATE POLICY "crm_profiles_delete_company"
  ON public.client_crm_profiles FOR DELETE TO authenticated
  USING (company_id = get_user_company_id());

-- ----------------------------------------------------------------------------
-- Permisos de empleados (documentación; el JSONB se gestiona desde la app)
-- ----------------------------------------------------------------------------
COMMENT ON TABLE public.client_crm_profiles IS
'Perfil CRM por cliente: score 0-1000, categoría comercial (caliente/tibio/frio/nuevo), riesgo, comportamiento de pago y campos editables (categoría manual, etiquetas, notas). Permisos de empleado: crm.view (ver el CRM), crm.edit (anular categoría, etiquetar, anotar).';
