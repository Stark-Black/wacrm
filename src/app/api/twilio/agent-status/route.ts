import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  getCurrentAccount,
  toErrorResponse,
} from '@/lib/auth/account';

import { buildVoiceIdentity } from '@/lib/twilio/identity';

export const dynamic = 'force-dynamic';

const VALID_STATUSES = [
  'offline',
  'available',
  'ringing',
  'busy',
] as const;

type AgentStatus =
  (typeof VALID_STATUSES)[number];

function isAgentStatus(
  value: unknown,
): value is AgentStatus {
  return (
    typeof value === 'string' &&
    VALID_STATUSES.includes(value as AgentStatus)
  );
}

/**
 * Devuelve el estado del usuario autenticado.
 */
export async function GET() {
  try {
    const ctx = await getCurrentAccount();

    const { data, error } = await ctx.supabase
      .from('twilio_agent_status')
      .select(`
        identity,
        status,
        active_call_sid,
        last_seen_at,
        updated_at
      `)
      .eq('account_id', ctx.accountId)
      .eq('user_id', ctx.userId)
      .maybeSingle();

    if (error) {
      console.error(
        '[GET /api/twilio/agent-status]',
        error,
      );

      return NextResponse.json(
        {
          error:
            'No se pudo consultar el estado del asesor.',
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      agent:
        data ?? {
          identity: buildVoiceIdentity(
            ctx.accountId,
            ctx.userId,
          ),
          status: 'offline',
          active_call_sid: null,
          last_seen_at: null,
          updated_at: null,
        },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * Crea o actualiza el estado del usuario autenticado.
 */
export async function POST(
  request: NextRequest,
) {
  try {
    const ctx = await getCurrentAccount();

    const body = await request
      .json()
      .catch(() => null);

    if (
      !body ||
      typeof body !== 'object' ||
      !isAgentStatus(body.status)
    ) {
      return NextResponse.json(
        {
          error:
            'El estado enviado no es válido.',
        },
        { status: 400 },
      );
    }

    const activeCallSid =
      typeof body.activeCallSid === 'string' &&
      body.activeCallSid.trim()
        ? body.activeCallSid.trim()
        : null;

    const identity = buildVoiceIdentity(
      ctx.accountId,
      ctx.userId,
    );

    const now = new Date().toISOString();

    const { data, error } = await ctx.supabase
      .from('twilio_agent_status')
      .upsert(
        {
          account_id: ctx.accountId,
          user_id: ctx.userId,
          identity,
          status: body.status,
          active_call_sid:
            body.status === 'offline' ||
            body.status === 'available'
              ? null
              : activeCallSid,
          last_seen_at: now,
          updated_at: now,
        },
        {
          onConflict: 'account_id,user_id',
        },
      )
      .select(`
        identity,
        status,
        active_call_sid,
        last_seen_at,
        updated_at
      `)
      .single();

    if (error) {
      console.error(
        '[POST /api/twilio/agent-status]',
        error,
      );

      return NextResponse.json(
        {
          error:
            'No se pudo actualizar el estado del asesor.',
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      agent: data,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}