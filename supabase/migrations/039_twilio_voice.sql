-- ============================================================
-- 039_twilio_voice.sql
-- Configuración de Twilio Voice por cuenta de WACRM.
--
-- Esta primera migración almacena únicamente la configuración.
-- El historial de llamadas y estados de agentes se añadirá
-- posteriormente en migraciones separadas.
--
-- IMPORTANTE:
-- auth_token y api_key_secret se guardarán cifrados desde
-- una ruta API del servidor. Nunca deben guardarse directamente
-- desde el navegador.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.twilio_voice_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Cada empresa/cuenta comparte una sola configuración de Twilio
  account_id UUID NOT NULL UNIQUE
    REFERENCES public.accounts(id)
    ON DELETE CASCADE,

  -- Usuario que guardó originalmente la configuración
  created_by UUID
    REFERENCES auth.users(id)
    ON DELETE SET NULL,

  -- Identificadores de Twilio
  account_sid TEXT NOT NULL,
  api_key_sid TEXT NOT NULL,
  twiml_app_sid TEXT NOT NULL,

  -- Credenciales sensibles cifradas por el servidor
  auth_token TEXT,
  api_key_secret TEXT NOT NULL,

  -- Se permite NULL porque compraremos el número más adelante
  phone_number TEXT,

  -- Estado de la conexión
  status TEXT NOT NULL DEFAULT 'not_configured'
    CHECK (
      status IN (
        'not_configured',
        'configured',
        'connected',
        'error'
      )
    ),

  last_tested_at TIMESTAMPTZ,
  last_error TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.twilio_voice_config IS
  'Configuración compartida de Twilio Voice para cada cuenta de WACRM.';

COMMENT ON COLUMN public.twilio_voice_config.auth_token IS
  'Auth Token cifrado mediante AES-256-GCM desde el servidor.';

COMMENT ON COLUMN public.twilio_voice_config.api_key_secret IS
  'API Key Secret cifrado mediante AES-256-GCM desde el servidor.';

COMMENT ON COLUMN public.twilio_voice_config.phone_number IS
  'Número Twilio en formato E.164. Puede permanecer vacío hasta comprarlo.';

-- ============================================================
-- Actualización automática de updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_twilio_voice_config_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS twilio_voice_config_updated_at
ON public.twilio_voice_config;

CREATE TRIGGER twilio_voice_config_updated_at
BEFORE UPDATE ON public.twilio_voice_config
FOR EACH ROW
EXECUTE FUNCTION public.update_twilio_voice_config_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.twilio_voice_config
ENABLE ROW LEVEL SECURITY;

-- Cualquier integrante de la empresa puede consultar si
-- la telefonía está configurada.
DROP POLICY IF EXISTS twilio_voice_config_select
ON public.twilio_voice_config;

CREATE POLICY twilio_voice_config_select
ON public.twilio_voice_config
FOR SELECT
USING (
  is_account_member(account_id)
);

-- Solo administradores y propietarios pueden configurarla.
DROP POLICY IF EXISTS twilio_voice_config_insert
ON public.twilio_voice_config;

CREATE POLICY twilio_voice_config_insert
ON public.twilio_voice_config
FOR INSERT
WITH CHECK (
  is_account_member(account_id, 'admin')
);

DROP POLICY IF EXISTS twilio_voice_config_update
ON public.twilio_voice_config;

CREATE POLICY twilio_voice_config_update
ON public.twilio_voice_config
FOR UPDATE
USING (
  is_account_member(account_id, 'admin')
)
WITH CHECK (
  is_account_member(account_id, 'admin')
);

DROP POLICY IF EXISTS twilio_voice_config_delete
ON public.twilio_voice_config;

CREATE POLICY twilio_voice_config_delete
ON public.twilio_voice_config
FOR DELETE
USING (
  is_account_member(account_id, 'admin')
);

-- Permisos para usuarios autenticados.
-- RLS continuará decidiendo qué filas puede utilizar cada persona.
GRANT SELECT, INSERT, UPDATE, DELETE
ON public.twilio_voice_config
TO authenticated;