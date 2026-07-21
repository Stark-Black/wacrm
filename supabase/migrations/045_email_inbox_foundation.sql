-- ============================================================
-- 045_email_inbox_foundation.sql
--
-- Base del módulo Email Inbox para WACRM.
--
-- Esta migración crea:
--   1. email_connections
--   2. email_templates
--   3. email_signatures
--
-- IMPORTANTE:
-- Todavía no se almacenan tokens de Microsoft, correos,
-- adjuntos ni mensajes completos.
-- ============================================================


-- ============================================================
-- EMAIL CONNECTIONS
--
-- Una sola configuración de correo por empresa/cuenta.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.email_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  account_id UUID NOT NULL UNIQUE
    REFERENCES public.accounts(id)
    ON DELETE CASCADE,

  created_by_user_id UUID
    REFERENCES auth.users(id)
    ON DELETE SET NULL,

  connected_by_user_id UUID
    REFERENCES auth.users(id)
    ON DELETE SET NULL,

  provider TEXT NOT NULL DEFAULT 'microsoft_365'
    CHECK (
      provider IN (
        'microsoft_365'
      )
    ),

  mailbox_address TEXT,

  sender_display_name TEXT,

  tenant_id TEXT,

  external_mailbox_id TEXT,

  mailbox_type TEXT NOT NULL DEFAULT 'shared'
    CHECK (
      mailbox_type IN (
        'shared',
        'user'
      )
    ),

  connection_status TEXT NOT NULL DEFAULT 'not_connected'
    CHECK (
      connection_status IN (
        'not_connected',
        'connecting',
        'connected',
        'expired',
        'error'
      )
    ),

  connected_at TIMESTAMPTZ,

  last_synced_at TIMESTAMPTZ,

  last_error TEXT,

  settings JSONB NOT NULL DEFAULT '{}'::JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.email_connections IS
  'Configuración compartida del buzón empresarial de cada cuenta de WACRM.';

COMMENT ON COLUMN public.email_connections.settings IS
  'Preferencias no sensibles del buzón. No debe almacenar access tokens ni refresh tokens.';


-- ============================================================
-- EMAIL TEMPLATES
--
-- Plantillas profesionales reutilizables por la empresa.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  account_id UUID NOT NULL
    REFERENCES public.accounts(id)
    ON DELETE CASCADE,

  created_by_user_id UUID
    REFERENCES auth.users(id)
    ON DELETE SET NULL,

  name TEXT NOT NULL
    CHECK (
      btrim(name) <> ''
    ),

  category TEXT NOT NULL DEFAULT 'general'
    CHECK (
      category IN (
        'general',
        'welcome',
        'documents',
        'appointment',
        'follow_up',
        'billing',
        'support',
        'other'
      )
    ),

  subject TEXT NOT NULL
    CHECK (
      btrim(subject) <> ''
    ),

  body_html TEXT,

  body_text TEXT,

  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (
    btrim(COALESCE(body_html, '')) <> ''
    OR
    btrim(COALESCE(body_text, '')) <> ''
  )
);

COMMENT ON TABLE public.email_templates IS
  'Plantillas reutilizables para responder correos desde el Email Inbox.';

CREATE INDEX IF NOT EXISTS idx_email_templates_account_active
  ON public.email_templates(account_id, is_active);

CREATE INDEX IF NOT EXISTS idx_email_templates_account_category
  ON public.email_templates(account_id, category);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_templates_account_name_ci
  ON public.email_templates(
    account_id,
    lower(name)
  );


-- ============================================================
-- EMAIL SIGNATURES
--
-- Firmas generales de la empresa o firmas de usuarios.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.email_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  account_id UUID NOT NULL
    REFERENCES public.accounts(id)
    ON DELETE CASCADE,

  created_by_user_id UUID
    REFERENCES auth.users(id)
    ON DELETE SET NULL,

  owner_user_id UUID
    REFERENCES auth.users(id)
    ON DELETE CASCADE,

  name TEXT NOT NULL
    CHECK (
      btrim(name) <> ''
    ),

  scope TEXT NOT NULL DEFAULT 'account'
    CHECK (
      scope IN (
        'account',
        'user'
      )
    ),

  html_content TEXT,

  text_content TEXT,

  is_default BOOLEAN NOT NULL DEFAULT FALSE,

  is_active BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CHECK (
    btrim(COALESCE(html_content, '')) <> ''
    OR
    btrim(COALESCE(text_content, '')) <> ''
  ),

  CHECK (
    (
      scope = 'account'
      AND owner_user_id IS NULL
    )
    OR
    (
      scope = 'user'
      AND owner_user_id IS NOT NULL
    )
  )
);

COMMENT ON TABLE public.email_signatures IS
  'Firmas de correo generales de la empresa o asignadas a usuarios específicos.';

CREATE INDEX IF NOT EXISTS idx_email_signatures_account_active
  ON public.email_signatures(account_id, is_active);

CREATE INDEX IF NOT EXISTS idx_email_signatures_owner
  ON public.email_signatures(account_id, owner_user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_signatures_account_name_ci
  ON public.email_signatures(
    account_id,
    lower(name)
  );

-- Solo una firma general puede estar marcada como predeterminada.
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_signatures_default_account
  ON public.email_signatures(account_id)
  WHERE
    is_default = TRUE
    AND scope = 'account';

-- Cada usuario solo puede tener una firma personal predeterminada.
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_signatures_default_user
  ON public.email_signatures(
    account_id,
    owner_user_id
  )
  WHERE
    is_default = TRUE
    AND scope = 'user';


-- ============================================================
-- UPDATED_AT TRIGGERS
-- ============================================================

DROP TRIGGER IF EXISTS email_connections_updated_at
  ON public.email_connections;

CREATE TRIGGER email_connections_updated_at
BEFORE UPDATE ON public.email_connections
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


DROP TRIGGER IF EXISTS email_templates_updated_at
  ON public.email_templates;

CREATE TRIGGER email_templates_updated_at
BEFORE UPDATE ON public.email_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


DROP TRIGGER IF EXISTS email_signatures_updated_at
  ON public.email_signatures;

CREATE TRIGGER email_signatures_updated_at
BEFORE UPDATE ON public.email_signatures
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================
-- ROW LEVEL SECURITY: EMAIL CONNECTIONS
-- ============================================================

ALTER TABLE public.email_connections
ENABLE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS email_connections_select
  ON public.email_connections;

CREATE POLICY email_connections_select
ON public.email_connections
FOR SELECT
USING (
  public.is_account_member(account_id)
);


DROP POLICY IF EXISTS email_connections_insert
  ON public.email_connections;

CREATE POLICY email_connections_insert
ON public.email_connections
FOR INSERT
WITH CHECK (
  public.is_account_member(account_id, 'admin')
);


DROP POLICY IF EXISTS email_connections_update
  ON public.email_connections;

CREATE POLICY email_connections_update
ON public.email_connections
FOR UPDATE
USING (
  public.is_account_member(account_id, 'admin')
)
WITH CHECK (
  public.is_account_member(account_id, 'admin')
);


DROP POLICY IF EXISTS email_connections_delete
  ON public.email_connections;

CREATE POLICY email_connections_delete
ON public.email_connections
FOR DELETE
USING (
  public.is_account_member(account_id, 'admin')
);


-- ============================================================
-- ROW LEVEL SECURITY: EMAIL TEMPLATES
-- ============================================================

ALTER TABLE public.email_templates
ENABLE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS email_templates_select
  ON public.email_templates;

CREATE POLICY email_templates_select
ON public.email_templates
FOR SELECT
USING (
  public.is_account_member(account_id, 'admin')
  OR (
    is_active = TRUE
    AND public.is_account_member(account_id)
  )
);


DROP POLICY IF EXISTS email_templates_insert
  ON public.email_templates;

CREATE POLICY email_templates_insert
ON public.email_templates
FOR INSERT
WITH CHECK (
  public.is_account_member(account_id, 'admin')
);


DROP POLICY IF EXISTS email_templates_update
  ON public.email_templates;

CREATE POLICY email_templates_update
ON public.email_templates
FOR UPDATE
USING (
  public.is_account_member(account_id, 'admin')
)
WITH CHECK (
  public.is_account_member(account_id, 'admin')
);


DROP POLICY IF EXISTS email_templates_delete
  ON public.email_templates;

CREATE POLICY email_templates_delete
ON public.email_templates
FOR DELETE
USING (
  public.is_account_member(account_id, 'admin')
);


-- ============================================================
-- ROW LEVEL SECURITY: EMAIL SIGNATURES
-- ============================================================

ALTER TABLE public.email_signatures
ENABLE ROW LEVEL SECURITY;


DROP POLICY IF EXISTS email_signatures_select
  ON public.email_signatures;

CREATE POLICY email_signatures_select
ON public.email_signatures
FOR SELECT
USING (
  public.is_account_member(account_id, 'admin')
  OR (
    is_active = TRUE
    AND public.is_account_member(account_id)
    AND (
      scope = 'account'
      OR owner_user_id = auth.uid()
    )
  )
);


DROP POLICY IF EXISTS email_signatures_insert
  ON public.email_signatures;

CREATE POLICY email_signatures_insert
ON public.email_signatures
FOR INSERT
WITH CHECK (
  public.is_account_member(account_id, 'admin')
  AND (
    scope = 'account'
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.user_id = owner_user_id
        AND profiles.account_id = email_signatures.account_id
    )
  )
);


DROP POLICY IF EXISTS email_signatures_update
  ON public.email_signatures;

CREATE POLICY email_signatures_update
ON public.email_signatures
FOR UPDATE
USING (
  public.is_account_member(account_id, 'admin')
)
WITH CHECK (
  public.is_account_member(account_id, 'admin')
  AND (
    scope = 'account'
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.user_id = owner_user_id
        AND profiles.account_id = email_signatures.account_id
    )
  )
);


DROP POLICY IF EXISTS email_signatures_delete
  ON public.email_signatures;

CREATE POLICY email_signatures_delete
ON public.email_signatures
FOR DELETE
USING (
  public.is_account_member(account_id, 'admin')
);


-- ============================================================
-- GRANTS
--
-- RLS seguirá determinando qué registros puede utilizar
-- cada usuario autenticado.
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.email_connections
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.email_templates
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.email_signatures
TO authenticated;