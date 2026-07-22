import { timingSafeEqual } from 'crypto';

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  createMicrosoftClient,
  getMicrosoftRedirectUri,
  getMicrosoftTenantId,
  MICROSOFT_SCOPES,
} from '@/lib/email/microsoft-auth';

import { encrypt } from '@/lib/whatsapp/encryption';
import { createClient } from '@/lib/supabase/server';
import {
  createServiceRoleClient,
} from '@/lib/supabase/service-role';

export const runtime = 'nodejs';

const STATE_COOKIE =
  'wacrm_email_microsoft_oauth_state';

interface MicrosoftGraphUser {
  id: string;
  displayName: string | null;
  mail: string | null;
  userPrincipalName: string | null;
}

function secureStringComparison(
  firstValue: string,
  secondValue: string,
): boolean {
  const firstBuffer =
    Buffer.from(firstValue, 'utf8');

  const secondBuffer =
    Buffer.from(secondValue, 'utf8');

  if (
    firstBuffer.length !==
    secondBuffer.length
  ) {
    return false;
  }

  return timingSafeEqual(
    firstBuffer,
    secondBuffer,
  );
}

function settingsRedirect(
  request: NextRequest,
  parameters: Record<string, string>,
) {
  const url = new URL('/settings', request.url);

  url.searchParams.set('tab', 'email');

  Object.entries(parameters).forEach(
    ([key, value]) => {
      url.searchParams.set(key, value);
    },
  );

  const response =
    NextResponse.redirect(url);

  response.cookies.set(
    STATE_COOKIE,
    '',
    {
      httpOnly: true,
      secure:
        process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/email/microsoft',
      maxAge: 0,
    },
  );

  return response;
}

/**
 * GET /api/email/microsoft/callback
 *
 * Receives the authorization code from Microsoft,
 * exchanges it for tokens, validates the mailbox,
 * encrypts the MSAL cache and stores it securely.
 */
export async function GET(request: NextRequest) {
  const searchParameters =
    request.nextUrl.searchParams;

  const microsoftError =
    searchParameters.get('error');

  if (microsoftError) {
    console.error(
      'Microsoft returned an OAuth error:',
      microsoftError,
    );

    return settingsRedirect(
      request,
      {
        email_error: 'oauth_denied',
      },
    );
  }

  const authorizationCode =
    searchParameters.get('code');

  const returnedState =
    searchParameters.get('state');

  const savedState =
    request.cookies.get(
      STATE_COOKIE,
    )?.value;

  if (
    !authorizationCode ||
    !returnedState ||
    !savedState ||
    !secureStringComparison(
      returnedState,
      savedState,
    )
  ) {
    return settingsRedirect(
      request,
      {
        email_error: 'invalid_state',
      },
    );
  }

  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return settingsRedirect(
        request,
        {
          email_error: 'unauthorized',
        },
      );
    }

    const {
      data: profile,
      error: profileError,
    } = await supabase
      .from('profiles')
      .select('account_id, account_role')
      .eq('user_id', user.id)
      .maybeSingle();

    if (
      profileError ||
      !profile?.account_id
    ) {
      return settingsRedirect(
        request,
        {
          email_error: 'missing_account',
        },
      );
    }

    const accountRole =
      profile.account_role as string | null;

    if (
      accountRole !== 'owner' &&
      accountRole !== 'admin'
    ) {
      return settingsRedirect(
        request,
        {
          email_error: 'forbidden',
        },
      );
    }

    const {
      data: connection,
      error: connectionError,
    } = await supabase
      .from('email_connections')
      .select(
        `
          id,
          mailbox_address,
          sender_display_name
        `,
      )
      .eq(
        'account_id',
        profile.account_id,
      )
      .maybeSingle();

    if (
      connectionError ||
      !connection?.id ||
      !connection.mailbox_address
    ) {
      return settingsRedirect(
        request,
        {
          email_error: 'save_mailbox_first',
        },
      );
    }

    const microsoftClient =
      createMicrosoftClient();

    const tokenResult =
      await microsoftClient.acquireTokenByCode({
        code: authorizationCode,
        scopes: MICROSOFT_SCOPES,
        redirectUri:
          getMicrosoftRedirectUri(),
      });

    if (
      !tokenResult?.accessToken ||
      !tokenResult.account
    ) {
      return settingsRedirect(
        request,
        {
          email_error:
            'token_exchange_failed',
        },
      );
    }

    const graphResponse = await fetch(
      'https://graph.microsoft.com/v1.0/me' +
        '?$select=id,displayName,mail,userPrincipalName',
      {
        method: 'GET',
        headers: {
          Authorization:
            `Bearer ${tokenResult.accessToken}`,
          Accept: 'application/json',
        },
        cache: 'no-store',
      },
    );

    if (!graphResponse.ok) {
      console.error(
        'Microsoft Graph /me failed:',
        graphResponse.status,
      );

      return settingsRedirect(
        request,
        {
          email_error: 'graph_failed',
        },
      );
    }

    const graphUser =
      (await graphResponse.json()) as
        MicrosoftGraphUser;

    const microsoftMailbox =
      (
        graphUser.mail ??
        graphUser.userPrincipalName ??
        ''
      )
        .trim()
        .toLowerCase();

    const configuredMailbox =
      connection.mailbox_address
        .trim()
        .toLowerCase();

    if (
      !microsoftMailbox ||
      microsoftMailbox !== configuredMailbox
    ) {
      console.error(
        'Connected Microsoft account does not match the configured mailbox.',
      );

      return settingsRedirect(
        request,
        {
          email_error: 'mailbox_mismatch',
        },
      );
    }

    const serializedTokenCache =
      microsoftClient
        .getTokenCache()
        .serialize();

    const encryptedTokenCache =
      encrypt(serializedTokenCache);

    const now =
      new Date().toISOString();

    const serviceRole =
      createServiceRoleClient();

    const {
      error: credentialsError,
    } = await serviceRole
      .from('email_oauth_credentials')
      .upsert(
        {
          account_id:
            profile.account_id,

          connection_id:
            connection.id,

          connected_by_user_id:
            user.id,

          msal_home_account_id:
            tokenResult.account.homeAccountId,

          encrypted_token_cache:
            encryptedTokenCache,

          granted_scopes:
            tokenResult.scopes,

          access_token_expires_at:
            tokenResult.expiresOn
              ? tokenResult.expiresOn.toISOString()
              : null,

          last_token_refresh_at:
            now,
        },
        {
          onConflict: 'account_id',
        },
      );

    if (credentialsError) {
      console.error(
        'Failed to save encrypted Microsoft credentials:',
        credentialsError,
      );

      return settingsRedirect(
        request,
        {
          email_error: 'database_failed',
        },
      );
    }

    const {
      error: connectionUpdateError,
    } = await serviceRole
      .from('email_connections')
      .update({
        connected_by_user_id:
          user.id,

        tenant_id:
          getMicrosoftTenantId(),

        external_mailbox_id:
          graphUser.id,

        mailbox_address:
          microsoftMailbox,

        sender_display_name:
          connection.sender_display_name ||
          graphUser.displayName ||
          microsoftMailbox,

        connection_status:
          'connected',

        connected_at:
          now,

        last_error:
          null,
      })
      .eq(
        'id',
        connection.id,
      )
      .eq(
        'account_id',
        profile.account_id,
      );

    if (connectionUpdateError) {
      console.error(
        'Failed to update email connection:',
        connectionUpdateError,
      );

      return settingsRedirect(
        request,
        {
          email_error: 'database_failed',
        },
      );
    }

    return settingsRedirect(
      request,
      {
        email_connected: '1',
      },
    );
  } catch (error) {
    console.error(
      'Microsoft OAuth callback failed:',
      error,
    );

    return settingsRedirect(
      request,
      {
        email_error: 'callback_failed',
      },
    );
  }
}