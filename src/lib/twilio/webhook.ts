import 'server-only';

import type { NextRequest } from 'next/server';
import twilio from 'twilio';

type ValidTwilioRequest = {
  valid: true;
  params: Record<string, string>;
  webhookUrl: string;
};

type InvalidTwilioRequest = {
  valid: false;
  status: number;
  error: string;
};

export type TwilioWebhookResult =
  | ValidTwilioRequest
  | InvalidTwilioRequest;

function getPublicBaseUrl(request: NextRequest) {
  const configuredUrl =
    process.env.NEXT_PUBLIC_SITE_URL
      ?.trim()
      .replace(/\/$/, '');

  if (configuredUrl) {
    return configuredUrl;
  }

  return request.nextUrl.origin.replace(/\/$/, '');
}

export function getPublicTwilioUrl(
  request: NextRequest,
  pathname: string,
) {
  return `${getPublicBaseUrl(request)}${pathname}`;
}

export async function validateTwilioWebhook(
  request: NextRequest,
): Promise<TwilioWebhookResult> {
  const authToken =
    process.env.TWILIO_AUTH_TOKEN?.trim();

  if (!authToken) {
    return {
      valid: false,
      status: 503,
      error:
        'TWILIO_AUTH_TOKEN is not configured.',
    };
  }

  const signature =
    request.headers.get('x-twilio-signature');

  if (!signature) {
    return {
      valid: false,
      status: 403,
      error: 'Missing Twilio signature.',
    };
  }

  const formData = await request.formData();

  const params: Record<string, string> = {};

  formData.forEach((value, key) => {
    if (typeof value === 'string') {
      params[key] = value;
    }
  });

  /*
   * La URL usada aquí debe ser exactamente la misma
   * que se haya configurado en la consola de Twilio.
   */
  const publicBaseUrl = getPublicBaseUrl(request);

  const webhookUrl =
    `${publicBaseUrl}` +
    `${request.nextUrl.pathname}` +
    `${request.nextUrl.search}`;

  const valid = twilio.validateRequest(
    authToken,
    signature,
    webhookUrl,
    params,
  );

  if (!valid) {
    return {
      valid: false,
      status: 403,
      error: 'Invalid Twilio signature.',
    };
  }

  return {
    valid: true,
    params,
    webhookUrl,
  };
}