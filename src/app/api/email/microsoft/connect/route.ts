import { randomBytes } from 'crypto';

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import { createClient } from '@/lib/supabase/server';
import {
  createMicrosoftClient,
  getMicrosoftRedirectUri,
  MICROSOFT_SCOPES,
} from '@/lib/email/microsoft-auth';

export const runtime = 'nodejs';

const STATE_COOKIE =
  'wacrm_email_microsoft_oauth_state';

function settingsErrorRedirect(
  request: NextRequest,
  errorCode: string,
) {
  const url = new URL('/settings', request.url);

  url.searchParams.set('tab', 'email');
  url.searchParams.set('email_error', errorCode);

  return NextResponse.redirect(url);
}

/**
 * GET /api/email/microsoft/connect
 *
 * Validates the CRM user, generates a protected OAuth state
 * and redirects the browser to Microsoft.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return settingsErrorRedirect(
        request,
        'unauthorized',
      );
    }

    const { data: profile, error: profileError } =
      await supabase
        .from('profiles')
        .select('account_id, account_role')
        .eq('user_id', user.id)
        .maybeSingle();

    if (
      profileError ||
      !profile?.account_id
    ) {
      return settingsErrorRedirect(
        request,
        'missing_account',
      );
    }

    const accountRole =
      profile.account_role as string | null;

    if (
      accountRole !== 'owner' &&
      accountRole !== 'admin'
    ) {
      return settingsErrorRedirect(
        request,
        'forbidden',
      );
    }

    const { data: connection, error: connectionError } =
      await supabase
        .from('email_connections')
        .select('id, mailbox_address')
        .eq('account_id', profile.account_id)
        .maybeSingle();

    if (
      connectionError ||
      !connection?.id ||
      !connection.mailbox_address
    ) {
      return settingsErrorRedirect(
        request,
        'save_mailbox_first',
      );
    }

    const state =
      randomBytes(32).toString('hex');

    const microsoftClient =
      createMicrosoftClient();

    const authorizationUrl =
      await microsoftClient.getAuthCodeUrl({
        scopes: MICROSOFT_SCOPES,
        redirectUri: getMicrosoftRedirectUri(),
        state,
        prompt: 'select_account',
        loginHint: connection.mailbox_address,
      });

    const response =
      NextResponse.redirect(authorizationUrl);

    response.cookies.set(
      STATE_COOKIE,
      state,
      {
        httpOnly: true,
        secure:
          process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/api/email/microsoft',
        maxAge: 10 * 60,
      },
    );

    return response;
  } catch (error) {
    console.error(
      'Microsoft connect route failed:',
      error,
    );

    return settingsErrorRedirect(
      request,
      'connect_failed',
    );
  }
}