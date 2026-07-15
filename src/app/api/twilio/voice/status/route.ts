import {
  NextRequest,
  NextResponse,
} from 'next/server';

import { createServiceRoleClient } from '@/lib/supabase/service-role';

import {
  validateTwilioWebhook,
} from '@/lib/twilio/webhook';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const FINAL_CALL_STATUSES = new Set([
  'completed',
  'busy',
  'failed',
  'no-answer',
  'canceled',
]);

function parseDuration(value?: string) {
  if (!value) return null;

  const duration = Number.parseInt(value, 10);

  return Number.isFinite(duration) &&
    duration >= 0
    ? duration
    : null;
}

export async function POST(
  request: NextRequest,
) {
  const validation =
    await validateTwilioWebhook(request);

  if (!validation.valid) {
    return NextResponse.json(
      {
        error: validation.error,
      },
      {
        status: validation.status,
      },
    );
  }

  const {
    CallSid: childCallSid,
    ParentCallSid: parentCallSid,
    CallStatus: callStatus,
    CallDuration: callDuration,
  } = validation.params;

  /*
   * El asesor se reservó usando el SID de la
   * llamada principal, no el SID del tramo Client.
   */
  const rootCallSid =
    parentCallSid || childCallSid;

  if (!rootCallSid || !callStatus) {
    return new NextResponse(null, {
      status: 204,
    });
  }

  const supabase =
    createServiceRoleClient();

  const {
    data: callRecord,
    error: callLookupError,
  } = await supabase
    .from('twilio_calls')
    .select(
      `
        id,
        account_id,
        answered_at,
        ended_at
      `,
    )
    .eq('twilio_call_sid', rootCallSid)
    .maybeSingle();

  if (callLookupError) {
    console.error(
      '[Twilio status] Lookup error:',
      callLookupError,
    );

    return new NextResponse(null, {
      status: 204,
    });
  }

  if (!callRecord) {
    /*
     * Respondemos correctamente para que Twilio
     * no reintente indefinidamente un evento que
     * ya no corresponde a un registro.
     */
    return new NextResponse(null, {
      status: 204,
    });
  }

  const now = new Date().toISOString();

  const finalStatus =
    FINAL_CALL_STATUSES.has(callStatus);

  const updateData: {
    call_status: string;
    parent_call_sid?: string | null;
    answered_at?: string;
    ended_at?: string;
    duration_seconds?: number | null;
    updated_at: string;
  } = {
    call_status: callStatus,
    updated_at: now,
  };

  if (childCallSid) {
    updateData.parent_call_sid =
      childCallSid;
  }

  if (
    callStatus === 'in-progress' &&
    !callRecord.answered_at
  ) {
    updateData.answered_at = now;
  }

  if (finalStatus) {
    updateData.ended_at = now;

    updateData.duration_seconds =
      parseDuration(callDuration);
  }

  const { error: updateError } =
    await supabase
      .from('twilio_calls')
      .update(updateData)
      .eq('id', callRecord.id);

  if (updateError) {
    console.error(
      '[Twilio status] Update error:',
      updateError,
    );
  }

  if (finalStatus) {
    const {
      error: releaseError,
    } = await supabase.rpc(
      'release_twilio_agent',
      {
        p_account_id:
          callRecord.account_id,

        p_call_sid: rootCallSid,

        p_next_status: 'available',
      },
    );

    if (releaseError) {
      console.error(
        '[Twilio status] Release error:',
        releaseError,
      );
    }
  }

  /*
   * Los callbacks de estado no necesitan devolver
   * instrucciones TwiML.
   */
  return new NextResponse(null, {
    status: 204,
  });
}