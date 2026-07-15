import {
  NextRequest,
  NextResponse,
} from 'next/server';

import twilio from 'twilio';

import {
  createServiceRoleClient,
} from '@/lib/supabase/service-role';

import {
  getPublicTwilioUrl,
  validateTwilioWebhook,
} from '@/lib/twilio/webhook';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const E164_PHONE_REGEX =
  /^\+[1-9]\d{7,14}$/;

function xmlResponse(
  response: InstanceType<
    typeof twilio.twiml.VoiceResponse
  >,
) {
  return new NextResponse(
    response.toString(),
    {
      status: 200,
      headers: {
        'Content-Type':
          'text/xml; charset=utf-8',

        'Cache-Control': 'no-store',
      },
    },
  );
}

function getClientIdentity(
  params: Record<string, string>,
) {
  const caller =
    params.From ||
    params.Caller ||
    params.ClientIdentity ||
    '';

  if (!caller.startsWith('client:')) {
    return '';
  }

  return caller
    .slice('client:'.length)
    .trim();
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
    CallSid: callSid,
    To: rawToNumber,
  } = validation.params;

  const twiml =
    new twilio.twiml.VoiceResponse();

  const toNumber =
    rawToNumber?.trim() ?? '';

  /*
   * Solamente permitimos números internacionales
   * en formato E.164:
   *
   * +51987654321
   * +12025550123
   */
  if (
    !callSid ||
    !E164_PHONE_REGEX.test(toNumber)
  ) {
    twiml.say(
      {
        language: 'es-MX',
      },
      'El número ingresado no es válido.',
    );

    twiml.hangup();

    return xmlResponse(twiml);
  }

  const identity =
    getClientIdentity(validation.params);

  if (!identity) {
    twiml.say(
      {
        language: 'es-MX',
      },
      'No se pudo identificar al asesor.',
    );

    twiml.hangup();

    return xmlResponse(twiml);
  }

  const supabase =
    createServiceRoleClient();

  /*
   * Buscamos al asesor usando la misma identidad
   * incluida en su Access Token de Twilio.
   */
  const {
    data: agent,
    error: agentError,
  } = await supabase
    .from('twilio_agent_status')
    .select(`
      account_id,
      user_id,
      identity,
      status,
      last_seen_at
    `)
    .eq('identity', identity)
    .maybeSingle();

  if (agentError) {
    console.error(
      '[Twilio outgoing] Agent lookup error:',
      agentError,
    );
  }

  if (!agent) {
    twiml.say(
      {
        language: 'es-MX',
      },
      'El asesor no está registrado para realizar llamadas.',
    );

    twiml.hangup();

    return xmlResponse(twiml);
  }

  const lastSeenAt =
    agent.last_seen_at
      ? new Date(agent.last_seen_at).getTime()
      : 0;

  const isRecentlyConnected =
    Date.now() - lastSeenAt <
    90_000;

  if (
    agent.status !== 'available' ||
    !isRecentlyConnected
  ) {
    twiml.say(
      {
        language: 'es-MX',
      },
      'El softphone no se encuentra disponible.',
    );

    twiml.hangup();

    return xmlResponse(twiml);
  }

  /*
   * Obtenemos el número de salida configurado
   * para la cuenta del asesor.
   */
  const {
    data: voiceConfig,
    error: configError,
  } = await supabase
    .from('twilio_voice_config')
    .select(`
      account_id,
      enabled,
      phone_number
    `)
    .eq('account_id', agent.account_id)
    .eq('enabled', true)
    .maybeSingle();

  if (configError) {
    console.error(
      '[Twilio outgoing] Config error:',
      configError,
    );
  }

  if (
    !voiceConfig?.phone_number ||
    !E164_PHONE_REGEX.test(
      voiceConfig.phone_number,
    )
  ) {
    twiml.say(
      {
        language: 'es-MX',
      },
      'La telefonía saliente todavía no está configurada.',
    );

    twiml.hangup();

    return xmlResponse(twiml);
  }

  /*
   * Marcamos al asesor como ocupado.
   * La condición status=available evita iniciar
   * dos llamadas simultáneas desde el mismo asesor.
   */
  const {
    data: reservedAgent,
    error: reserveError,
  } = await supabase
    .from('twilio_agent_status')
    .update({
      status: 'busy',
      active_call_sid: callSid,
      last_seen_at:
        new Date().toISOString(),
      updated_at:
        new Date().toISOString(),
    })
    .eq('account_id', agent.account_id)
    .eq('user_id', agent.user_id)
    .eq('status', 'available')
    .select('user_id')
    .maybeSingle();

  if (reserveError) {
    console.error(
      '[Twilio outgoing] Reserve error:',
      reserveError,
    );
  }

  if (!reservedAgent) {
    twiml.say(
      {
        language: 'es-MX',
      },
      'No se pudo iniciar la llamada porque el asesor ya se encuentra ocupado.',
    );

    twiml.hangup();

    return xmlResponse(twiml);
  }

  /*
   * Intentamos relacionar el destino con
   * un contacto del CRM.
   */
  const {
    data: matchingContact,
  } = await supabase
    .from('contacts')
    .select('id')
    .eq('account_id', agent.account_id)
    .eq('phone', toNumber)
    .maybeSingle();

  const now =
    new Date().toISOString();

  const {
    error: callInsertError,
  } = await supabase
    .from('twilio_calls')
    .upsert(
      {
        account_id:
          agent.account_id,

        contact_id:
          matchingContact?.id ?? null,

        assigned_user_id:
          agent.user_id,

        twilio_call_sid:
          callSid,

        parent_call_sid:
          null,

        direction:
          'outgoing',

        from_number:
          voiceConfig.phone_number,

        to_number:
          toNumber,

        call_status:
          'initiated',

        started_at:
          now,

        answered_at:
          null,

        ended_at:
          null,
      },
      {
        onConflict:
          'twilio_call_sid',
      },
    );

  if (callInsertError) {
    console.error(
      '[Twilio outgoing] Call log error:',
      callInsertError,
    );

    await supabase.rpc(
      'release_twilio_agent',
      {
        p_account_id:
          agent.account_id,

        p_call_sid:
          callSid,

        p_next_status:
          'available',
      },
    );

    twiml.say(
      {
        language: 'es-MX',
      },
      'No se pudo registrar la llamada.',
    );

    twiml.hangup();

    return xmlResponse(twiml);
  }

  const statusCallbackUrl =
    getPublicTwilioUrl(
      request,
      '/api/twilio/voice/status',
    );

  /*
   * El navegador queda conectado al primer tramo.
   * Este Dial crea el segundo tramo hacia el
   * teléfono del cliente.
   */
  const dial = twiml.dial({
    callerId:
      voiceConfig.phone_number,

    answerOnBridge:
      true,

    timeout:
      30,
  });

  dial.number(
    {
      statusCallback:
        statusCallbackUrl,

      statusCallbackMethod:
        'POST',

      statusCallbackEvent: [
        'initiated',
        'ringing',
        'answered',
        'completed',
      ],
    },
    toNumber,
  );

  return xmlResponse(twiml);
}