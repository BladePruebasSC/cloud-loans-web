-- ============================================================================
-- REPORTES GUARDADOS Y FAVORITOS
-- ============================================================================
-- CAMBIO SOLICITADO (2026-10-09, módulo "Reportes y Análisis"): "permitir guardar
-- configuraciones de reportes… luego el usuario puede abrirlo nuevamente sin configurar todo
-- desde cero. También favoritos y recientes".
--
-- La tabla `saved_reports` ya estaba DECLARADA en la migración 20250710123723 y la función
-- `reset_company_data` ya la contempla, pero puede no estar aplicada en esta base (los tipos
-- generados no la traen). Esta migración la deja lista de forma idempotente: si ya existe no
-- toca nada, y si no, la crea con su RLS.
--
-- QUÉ GUARDA:
--   · report_type  → el id del reporte del catálogo ('arrears-portfolio', 'payments-received'…)
--   · report_name  → el nombre que le puso el usuario ("Cartera de Higüey mensual")
--   · filters      → JSON con todo lo necesario para reabrirlo igual: filtros, período, orden,
--                    columnas ocultas, y `kind` ('preset' o 'favorite').
--
-- Los "recientes" NO se guardan aquí: viven en el navegador de cada quien, porque son una
-- comodidad del dispositivo y no merecen una escritura en la base cada vez que se abre un
-- reporte.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.saved_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users NOT NULL,
  report_name TEXT NOT NULL,
  report_type TEXT NOT NULL,
  filters JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Por si la tabla existía de una versión anterior sin alguna columna.
ALTER TABLE public.saved_reports ADD COLUMN IF NOT EXISTS filters JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.saved_reports ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_saved_reports_user ON public.saved_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_reports_type ON public.saved_reports(report_type);

ALTER TABLE public.saved_reports ENABLE ROW LEVEL SECURITY;

-- Cada quien ve y gestiona SOLO lo suyo.
DROP POLICY IF EXISTS "Users can manage their saved reports" ON public.saved_reports;
CREATE POLICY "Users can manage their saved reports" ON public.saved_reports
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.saved_reports IS
  'Configuraciones de reportes guardadas y favoritos del módulo Reportes y Análisis. '
  '`filters.kind` distingue entre "preset" (configuración guardada) y "favorite" (marcado).';
