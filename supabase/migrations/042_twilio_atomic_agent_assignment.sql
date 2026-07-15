-- ============================================================
-- 042_twilio_atomic_agent_assignment.sql
--
-- Reserva un asesor disponible de manera atómica.
-- Evita que dos llamadas simultáneas sean asignadas
-- al mismo usuario.
-- ============================================================

CREATE OR REPLACE FUNCTION public.claim_available_twilio_agent(
  p_account_id UUID,
  p_call_sid TEXT
)
RETURNS TABLE (
  user_id UUID,
  identity TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent_id UUID;
BEGIN
  -- Selecciona y bloquea solamente un asesor.
  -- SKIP LOCKED evita que otra llamada tome la misma fila.
  SELECT agent.id
  INTO v_agent_id
  FROM public.twilio_agent_status AS agent
  WHERE agent.account_id = p_account_id
    AND agent.status = 'available'
    AND agent.last_seen_at >= NOW() - INTERVAL '90 seconds'
  ORDER BY agent.last_seen_at DESC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  -- Ningún asesor disponible.
  IF v_agent_id IS NULL THEN
    RETURN;
  END IF;

  -- Reserva el asesor para esta llamada.
  RETURN QUERY
  UPDATE public.twilio_agent_status AS agent
  SET
    status = 'ringing',
    active_call_sid = p_call_sid,
    last_seen_at = NOW(),
    updated_at = NOW()
  WHERE agent.id = v_agent_id
  RETURNING
    agent.user_id,
    agent.identity;
END;
$$;

COMMENT ON FUNCTION public.claim_available_twilio_agent(UUID, TEXT)
IS
  'Reserva atómicamente un asesor disponible para una llamada de Twilio.';

-- Solo el servidor podrá asignar llamadas.
REVOKE ALL
ON FUNCTION public.claim_available_twilio_agent(UUID, TEXT)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.claim_available_twilio_agent(UUID, TEXT)
FROM authenticated;

GRANT EXECUTE
ON FUNCTION public.claim_available_twilio_agent(UUID, TEXT)
TO service_role;


-- ============================================================
-- LIBERAR ASESOR
-- ============================================================

CREATE OR REPLACE FUNCTION public.release_twilio_agent(
  p_account_id UUID,
  p_call_sid TEXT,
  p_next_status TEXT DEFAULT 'available'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  IF p_next_status NOT IN ('available', 'offline') THEN
    RAISE EXCEPTION 'Estado final no permitido: %', p_next_status;
  END IF;

  UPDATE public.twilio_agent_status
  SET
    status = p_next_status,
    active_call_sid = NULL,
    last_seen_at = NOW(),
    updated_at = NOW()
  WHERE account_id = p_account_id
    AND active_call_sid = p_call_sid;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  RETURN v_updated_count > 0;
END;
$$;

COMMENT ON FUNCTION public.release_twilio_agent(UUID, TEXT, TEXT)
IS
  'Libera el asesor reservado cuando una llamada termina o falla.';

REVOKE ALL
ON FUNCTION public.release_twilio_agent(UUID, TEXT, TEXT)
FROM PUBLIC;

REVOKE ALL
ON FUNCTION public.release_twilio_agent(UUID, TEXT, TEXT)
FROM authenticated;

GRANT EXECUTE
ON FUNCTION public.release_twilio_agent(UUID, TEXT, TEXT)
TO service_role;