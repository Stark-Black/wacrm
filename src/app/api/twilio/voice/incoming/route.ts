import { NextRequest, NextResponse } from 'next/server';
import twilio from 'twilio';

import { createServiceRoleClient } from '@/lib/supabase/service-role';

import {
  getPublicTwilioUrl,
  validateTwilioWebhook,
} from '@/lib/twilio/webhook';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function xmlResponse(
  response: InstanceType<
    typeof twilio.twiml.VoiceResponse
  >,
) {
  return new NextResponse(response.toString(), {
    status: 200,
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export async function POST(request: NextRequest) {
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
    CallSid: callSid,
    From: fromNumber,
    To: toNumber,
  } = validation.params;

  const twiml =
    new twilio.twiml.VoiceResponse();

  if (!callSid || !toNumber) {
    twiml.say(
      {
        language: 'es-MX',
      },
      'No se pudo procesar la llamada.',
    );

    twiml.hangup();

    return xmlResponse(twiml);
  }

  const supabase =
    createServiceRoleClient();

  /*
   * El número Twilio debe estar guardado en formato E.164:
   * +15551234567
   */
  const {
    data: voiceConfig,
    error: configError,
  } = await supabase
    .from('twilio_voice_config')
    .select('account_id, enabled, phone_number')
    .eq('phone_number', toNumber)
    .eq('enabled', true)
    .maybeSingle();

  if (configError) {
    console.error(
      '[Twilio incoming] Config error:',
      configError,
    );
  }

  if (!voiceConfig) {
    twiml.say(
      {
        language: 'es-MX',
      },
      'La telefonía de System Pass todavía no está disponible.',
    );

    twiml.hangup();

    return xmlResponse(twiml);
  }

  /*
   * Intentamos relacionar la llamada con un contacto.
   * Por ahora la coincidencia es exacta.
   */
  const {
    data: matchingContact,
  } = await supabase
    .from('contacts')
    .select('id')
    .eq('account_id', voiceConfig.account_id)
    .eq('phone', fromNumber ?? '')
    .maybeSingle();

  /*
   * La función de la migración 042 reserva un asesor
   * dentro de una transacción y evita que dos llamadas
   * tomen al mismo usuario.
   */
  const {
    data: claimedAgents,
    error: claimError,
  } = await supabase.rpc(
    'claim_available_twilio_agent',
    {
      p_account_id: voiceConfig.account_id,
      p_call_sid: callSid,
    },
  );

  if (claimError) {
    console.error(
      '[Twilio incoming] Agent claim error:',
      claimError,
    );
  }

  const claimedAgent =
    Array.isArray(claimedAgents)
      ? claimedAgents[0]
      : null;

  const now = new Date().toISOString();

  const {
    error: callInsertError,
  } = await supabase
    .from('twilio_calls')
    .upsert(
      {
        account_id: voiceConfig.account_id,
        contact_id:
          matchingContact?.id ?? null,

        assigned_user_id:
          claimedAgent?.user_id ?? null,

        twilio_call_sid: callSid,
        parent_call_sid: null,

        direction: 'incoming',

        from_number:
          fromNumber ?? null,

        to_number:
          toNumber ?? null,

        call_status: claimedAgent
          ? 'ringing'
          : 'no-agent-available',

        started_at: now,

        ended_at: claimedAgent
          ? null
          : now,
      },
      {
        onConflict: 'twilio_call_sid',
      },
    );

  if (callInsertError) {
    console.error(
      '[Twilio incoming] Call log error:',
      callInsertError,
    );

    if (claimedAgent) {
      await supabase.rpc(
        'release_twilio_agent',
        {
          p_account_id:
            voiceConfig.account_id,

          p_call_sid: callSid,

          p_next_status: 'available',
        },
      );
    }

    twiml.say(
      {
        language: 'es-MX',
      },
      'Ocurrió un problema al procesar la llamada.',
    );

    twiml.hangup();

    return xmlResponse(twiml);
  }

  if (!claimedAgent) {
    twiml.say(
      {
        language: 'es-MX',
      },
      'Todos nuestros asesores se encuentran ocupados. Por favor, inténtelo nuevamente en unos minutos.',
    );

    twiml.hangup();

    return xmlResponse(twiml);
  }

  const statusCallbackUrl =
    getPublicTwilioUrl(
      request,
      '/api/twilio/voice/status',
    );

  const dial = twiml.dial({
    answerOnBridge: true,
    timeout: 25,
  });

  dial.client(
  {
    statusCallback: statusCallbackUrl,

    statusCallbackMethod: 'POST',

    statusCallbackEvent: [
      'initiated',
      'ringing',
      'answered',
      'completed',
    ],
  },
  claimedAgent.identity,
);

  return xmlResponse(twiml);
}