import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  getCurrentAccount,
  toErrorResponse,
} from '@/lib/auth/account';

function maskValue(
  value: string,
  visibleStart = 2,
  visibleEnd = 4,
) {
  if (!value) return null;

  if (value.length <= visibleStart + visibleEnd) {
    return '••••••••';
  }

  return (
    value.slice(0, visibleStart) +
    '••••••••' +
    value.slice(-visibleEnd)
  );
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getCurrentAccount();

    const { data: databaseConfig, error } =
      await ctx.supabase
        .from('twilio_voice_config')
        .select(
          `
            status,
            phone_number,
            last_tested_at,
            last_error
          `,
        )
        .eq('account_id', ctx.accountId)
        .maybeSingle();

    if (error) {
      console.error(
        '[GET /api/twilio/config] Database error:',
        error,
      );

      return NextResponse.json(
        {
          error:
            'No se pudo consultar la configuración de Twilio.',
        },
        { status: 500 },
      );
    }

    const accountSid =
      process.env.TWILIO_ACCOUNT_SID?.trim() ?? '';

    const apiKeySid =
      process.env.TWILIO_API_KEY_SID?.trim() ?? '';

    const apiKeySecret =
      process.env.TWILIO_API_KEY_SECRET?.trim() ?? '';

    const twimlAppSid =
      process.env.TWILIO_TWIML_APP_SID?.trim() ?? '';

    const environmentPhoneNumber =
      process.env.TWILIO_PHONE_NUMBER?.trim() ?? '';

    const missingVariables: string[] = [];

    if (!accountSid) {
      missingVariables.push('TWILIO_ACCOUNT_SID');
    }

    if (!apiKeySid) {
      missingVariables.push('TWILIO_API_KEY_SID');
    }

    if (!apiKeySecret) {
      missingVariables.push('TWILIO_API_KEY_SECRET');
    }

    if (!twimlAppSid) {
      missingVariables.push('TWILIO_TWIML_APP_SID');
    }

    const configured = missingVariables.length === 0;

    const origin = request.nextUrl.origin;

    return NextResponse.json({
      configured,

      status: configured
        ? databaseConfig?.status ?? 'configured'
        : 'not_configured',

      accountSid: maskValue(accountSid),
      apiKeySid: maskValue(apiKeySid),
      twimlAppSid: maskValue(twimlAppSid),

      phoneNumber:
        environmentPhoneNumber ||
        databaseConfig?.phone_number ||
        null,

      missingVariables,

      lastTestedAt:
        databaseConfig?.last_tested_at ?? null,

      lastError:
        databaseConfig?.last_error ?? null,

      webhooks: {
        incoming:
          `${origin}/api/twilio/voice/incoming`,

        outgoing:
          `${origin}/api/twilio/voice/outgoing`,

        status:
          `${origin}/api/twilio/voice/status`,
      },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}