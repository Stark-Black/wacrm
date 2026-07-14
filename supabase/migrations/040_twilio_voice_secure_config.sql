-- ============================================================
-- 040_twilio_voice_secure_config.sql
--
-- Adapta Twilio Voice a un modelo híbrido:
-- - Los secretos se almacenan como variables del servidor.
-- - Supabase conserva únicamente información operativa.
-- ============================================================

-- Permitirá activar o desactivar el módulo de telefonía.
ALTER TABLE public.twilio_voice_config
ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- Los identificadores no serán obligatorios hasta configurar Twilio.
ALTER TABLE public.twilio_voice_config
ALTER COLUMN account_sid DROP NOT NULL;

ALTER TABLE public.twilio_voice_config
ALTER COLUMN api_key_sid DROP NOT NULL;

ALTER TABLE public.twilio_voice_config
ALTER COLUMN twiml_app_sid DROP NOT NULL;

-- Los secretos ya no se almacenarán en la base de datos.
ALTER TABLE public.twilio_voice_config
DROP COLUMN IF EXISTS auth_token;

ALTER TABLE public.twilio_voice_config
DROP COLUMN IF EXISTS api_key_secret;

COMMENT ON COLUMN public.twilio_voice_config.account_sid IS
  'Identificador público de la cuenta Twilio. La credencial real se toma del servidor.';

COMMENT ON COLUMN public.twilio_voice_config.api_key_sid IS
  'Identificador de la API Key. El API Key Secret nunca se guarda aquí.';

COMMENT ON COLUMN public.twilio_voice_config.twiml_app_sid IS
  'Identificador de la TwiML App asociada al softphone.';

COMMENT ON COLUMN public.twilio_voice_config.enabled IS
  'Indica si el módulo de telefonía está habilitado para la cuenta.';