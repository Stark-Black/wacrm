import { NextResponse } from 'next/server';
import twilio from 'twilio';

import {
  getCurrentAccount,
  toErrorResponse,
} from '@/lib/auth/account';

export const dynamic = 'force-dynamic';

const TOKEN_TTL_SECONDS = 60 * 60;

function getRequiredEnvironmentVariable(name: string) {
  return process.env[name]?.trim() ?? '';
}

function buildVoiceIdentity(
  accountId: string,
  userId: string,
) {
  const cleanAccountId = accountId.replace(
    /[^a-zA-Z0-9_]/g,
    '_',
  );

  const cleanUserId = userId.replace(
    /[^a-zA-Z0-9_]/g,
    '_',
  );

  return `account_${cleanAccountId}_user_${cleanUserId}`;
}

export async function GET() {
  try {
    const ctx = await getCurrentAccount();

    const accountSid = getRequiredEnvironmentVariable(
      'TWILIO_ACCOUNT_SID',
    );

    const apiKeySid = getRequiredEnvironmentVariable(
      'TWILIO_API_KEY_SID',
    );

    const apiKeySecret = getRequiredEnvironmentVariable(
      'TWILIO_API_KEY_SECRET',
    );

    const twimlAppSid = getRequiredEnvironmentVariable(
      'TWILIO_TWIML_APP_SID',
    );

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

    if (missingVariables.length > 0) {
      return NextResponse.json(
        {
          configured: false,
          error:
            'La telefonía Twilio todavía no está configurada.',
          missingVariables,
        },
        {
          status: 503,
          headers: {
            'Cache-Control': 'no-store',
          },
        },
      );
    }

    const identity = buildVoiceIdentity(
      ctx.accountId,
      ctx.userId,
    );

    const AccessToken = twilio.jwt.AccessToken;
    const VoiceGrant = AccessToken.VoiceGrant;

    const voiceGrant = new VoiceGrant({
      outgoingApplicationSid: twimlAppSid,
      incomingAllow: true,
    });

    const accessToken = new AccessToken(
      accountSid,
      apiKeySid,
      apiKeySecret,
      {
        identity,
        ttl: TOKEN_TTL_SECONDS,
      },
    );

    accessToken.addGrant(voiceGrant);

    return NextResponse.json(
      {
        configured: true,
        token: accessToken.toJwt(),
        identity,
        expiresIn: TOKEN_TTL_SECONDS,
      },
      {
        headers: {
          'Cache-Control':
            'no-store, no-cache, must-revalidate',
          Pragma: 'no-cache',
        },
      },
    );
  } catch (error) {
    return toErrorResponse(error);
  }
}