-- ============================================================
-- 041_twilio_calls_and_agents.sql
--
-- Registra:
-- 1. Estado de disponibilidad de cada asesor.
-- 2. Historial de llamadas entrantes y salientes.
-- ============================================================

-- ============================================================
-- ESTADO DE LOS ASESORES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.twilio_agent_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  account_id UUID NOT NULL
    REFERENCES public.accounts(id)
    ON DELETE CASCADE,

  user_id UUID NOT NULL
    REFERENCES auth.users(id)
    ON DELETE CASCADE,

  -- Identidad utilizada por Twilio Voice SDK
  identity TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'offline'
    CHECK (
      status IN (
        'offline',
        'available',
        'ringing',
        'busy'
      )
    ),

  -- SID de la llamada que está atendiendo
  active_call_sid TEXT,

  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT twilio_agent_status_account_user_unique
    UNIQUE (account_id, user_id),

  CONSTRAINT twilio_agent_status_account_identity_unique
    UNIQUE (account_id, identity)
);

CREATE INDEX IF NOT EXISTS
  idx_twilio_agent_status_account_status
ON public.twilio_agent_status(account_id, status);

CREATE INDEX IF NOT EXISTS
  idx_twilio_agent_status_last_seen
ON public.twilio_agent_status(last_seen_at);

DROP TRIGGER IF EXISTS
  set_twilio_agent_status_updated_at
ON public.twilio_agent_status;

CREATE TRIGGER set_twilio_agent_status_updated_at
BEFORE UPDATE ON public.twilio_agent_status
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- HISTORIAL DE LLAMADAS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.twilio_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  account_id UUID NOT NULL
    REFERENCES public.accounts(id)
    ON DELETE CASCADE,

  contact_id UUID
    REFERENCES public.contacts(id)
    ON DELETE SET NULL,

  assigned_user_id UUID
    REFERENCES auth.users(id)
    ON DELETE SET NULL,

  -- Identificadores enviados por Twilio
  twilio_call_sid TEXT UNIQUE,
  parent_call_sid TEXT,

  direction TEXT NOT NULL
    CHECK (
      direction IN (
        'incoming',
        'outgoing'
      )
    ),

  from_number TEXT,
  to_number TEXT,

  -- Se deja como TEXT para admitir todos los estados de Twilio
  call_status TEXT NOT NULL DEFAULT 'queued',

  duration_seconds INTEGER
    CHECK (
      duration_seconds IS NULL
      OR duration_seconds >= 0
    ),

  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  answered_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,

  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS
  idx_twilio_calls_account_created
ON public.twilio_calls(account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS
  idx_twilio_calls_contact
ON public.twilio_calls(contact_id);

CREATE INDEX IF NOT EXISTS
  idx_twilio_calls_assigned_user
ON public.twilio_calls(assigned_user_id);

CREATE INDEX IF NOT EXISTS
  idx_twilio_calls_status
ON public.twilio_calls(account_id, call_status);

DROP TRIGGER IF EXISTS
  set_twilio_calls_updated_at
ON public.twilio_calls;

CREATE TRIGGER set_twilio_calls_updated_at
BEFORE UPDATE ON public.twilio_calls
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- RLS: ESTADO DE ASESORES
-- ============================================================

ALTER TABLE public.twilio_agent_status
ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS
  twilio_agent_status_select
ON public.twilio_agent_status;

CREATE POLICY twilio_agent_status_select
ON public.twilio_agent_status
FOR SELECT
USING (
  is_account_member(account_id)
);

DROP POLICY IF EXISTS
  twilio_agent_status_insert
ON public.twilio_agent_status;

CREATE POLICY twilio_agent_status_insert
ON public.twilio_agent_status
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND is_account_member(account_id)
);

DROP POLICY IF EXISTS
  twilio_agent_status_update
ON public.twilio_agent_status;

CREATE POLICY twilio_agent_status_update
ON public.twilio_agent_status
FOR UPDATE
USING (
  is_account_member(account_id)
  AND (
    auth.uid() = user_id
    OR is_account_member(account_id, 'admin')
  )
)
WITH CHECK (
  is_account_member(account_id)
  AND (
    auth.uid() = user_id
    OR is_account_member(account_id, 'admin')
  )
);

DROP POLICY IF EXISTS
  twilio_agent_status_delete
ON public.twilio_agent_status;

CREATE POLICY twilio_agent_status_delete
ON public.twilio_agent_status
FOR DELETE
USING (
  auth.uid() = user_id
  OR is_account_member(account_id, 'admin')
);

-- ============================================================
-- RLS: HISTORIAL DE LLAMADAS
-- ============================================================

ALTER TABLE public.twilio_calls
ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS
  twilio_calls_select
ON public.twilio_calls;

CREATE POLICY twilio_calls_select
ON public.twilio_calls
FOR SELECT
USING (
  is_account_member(account_id)
);

DROP POLICY IF EXISTS
  twilio_calls_update
ON public.twilio_calls;

CREATE POLICY twilio_calls_update
ON public.twilio_calls
FOR UPDATE
USING (
  is_account_member(account_id, 'agent')
)
WITH CHECK (
  is_account_member(account_id, 'agent')
);

-- Los webhooks del servidor crearán los registros utilizando
-- service_role. Los usuarios normales no insertan llamadas
-- directamente desde el navegador.

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.twilio_agent_status
TO authenticated;

GRANT SELECT, UPDATE
ON public.twilio_calls
TO authenticated;