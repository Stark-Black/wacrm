-- ============================================================
-- 046_email_oauth_credentials.sql
--
-- Credenciales privadas de Microsoft 365 para Email Inbox.
--
-- La tabla almacena la caché de MSAL cifrada mediante
-- ENCRYPTION_KEY desde las rutas privadas del servidor.
--
-- IMPORTANTE:
-- - Los usuarios del navegador no pueden leer esta tabla.
-- - No se conceden permisos a authenticated ni anon.
-- - Solamente service_role puede utilizarla.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.email_oauth_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Una sola conexión Microsoft por empresa/cuenta.
  account_id UUID NOT NULL UNIQUE
    REFERENCES public.accounts(id)
    ON DELETE CASCADE,

  -- Configuración pública asociada.
  connection_id UUID NOT NULL UNIQUE
    REFERENCES public.email_connections(id)
    ON DELETE CASCADE,

  -- Usuario del CRM que realizó la autorización.
  connected_by_user_id UUID
    REFERENCES auth.users(id)
    ON DELETE SET NULL,

  -- Identificador interno que MSAL usa para encontrar
  -- la cuenta correcta dentro de su caché.
  msal_home_account_id TEXT NOT NULL
    CHECK (btrim(msal_home_account_id) <> ''),

  -- Caché completa de MSAL cifrada con AES-256-GCM.
  -- Contiene la información necesaria para renovar
  -- tokens sin pedir inicio de sesión constantemente.
  encrypted_token_cache TEXT NOT NULL
    CHECK (btrim(encrypted_token_cache) <> ''),

  -- Permisos concedidos por Microsoft.
  granted_scopes TEXT[] NOT NULL
    DEFAULT ARRAY[]::TEXT[],

  -- Fecha de vencimiento del access token actual.
  -- MSAL podrá obtener otro utilizando su caché.
  access_token_expires_at TIMESTAMPTZ,

  last_token_refresh_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.email_oauth_credentials IS
  'Caché cifrada de MSAL para la conexión Microsoft 365 de cada cuenta. Solo puede utilizarla el servidor.';

COMMENT ON COLUMN public.email_oauth_credentials.encrypted_token_cache IS
  'Caché serializada de MSAL cifrada con ENCRYPTION_KEY. Nunca debe enviarse al navegador.';

COMMENT ON COLUMN public.email_oauth_credentials.msal_home_account_id IS
  'Identificador de la cuenta Microsoft dentro de la caché de MSAL.';


-- ============================================================
-- ÍNDICES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_email_oauth_credentials_connection
  ON public.email_oauth_credentials(connection_id);

CREATE INDEX IF NOT EXISTS idx_email_oauth_credentials_account
  ON public.email_oauth_credentials(account_id);


-- ============================================================
-- UPDATED_AT
-- ============================================================

DROP TRIGGER IF EXISTS email_oauth_credentials_updated_at
  ON public.email_oauth_credentials;

CREATE TRIGGER email_oauth_credentials_updated_at
BEFORE UPDATE ON public.email_oauth_credentials
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================
-- SEGURIDAD
--
-- No se crean políticas para authenticated.
-- La tabla solamente será utilizada por rutas del servidor
-- que hayan autenticado y autorizado previamente al usuario.
-- ============================================================

ALTER TABLE public.email_oauth_credentials
ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES
ON TABLE public.email_oauth_credentials
FROM anon;

REVOKE ALL PRIVILEGES
ON TABLE public.email_oauth_credentials
FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.email_oauth_credentials
TO service_role;