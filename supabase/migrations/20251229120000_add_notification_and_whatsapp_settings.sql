-- Agregar campos de notificaciones y configuración de WhatsApp a company_settings

ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS notify_late_fees BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_rate_changes BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_payment_reminders BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_loan_approvals BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_loan_rejections BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS ask_whatsapp_before_send BOOLEAN DEFAULT true;

COMMENT ON COLUMN public.company_settings.notify_late_fees IS 'Notificar cuando hay moras en préstamos';
COMMENT ON COLUMN public.company_settings.notify_rate_changes IS 'Notificar cuando se cambian las tasas de interés';
COMMENT ON COLUMN public.company_settings.notify_payment_reminders IS 'Notificar recordatorios de pago';
COMMENT ON COLUMN public.company_settings.notify_loan_approvals IS 'Notificar cuando se aprueban préstamos';
COMMENT ON COLUMN public.company_settings.notify_loan_rejections IS 'Notificar cuando se rechazan préstamos';
COMMENT ON COLUMN public.company_settings.ask_whatsapp_before_send IS 'Si es false, envía directamente a WhatsApp sin preguntar después de imprimir';

