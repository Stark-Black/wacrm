import 'server-only';

import { createMicrosoftClient } from '@/lib/email/microsoft-auth';
import {
  decrypt,
  encrypt,
} from '@/lib/whatsapp/encryption';
import {
  createServiceRoleClient,
} from '@/lib/supabase/service-role';

const MICROSOFT_GRAPH_SCOPES = [
  'User.Read',
  'Mail.ReadWrite',
  'Mail.Send',
];

interface StoredMicrosoftCredential {
  connection_id: string;
  msal_home_account_id: string;
  encrypted_token_cache: string;
}

interface MicrosoftAccessResult {
  accessToken: string;
  connectionId: string;
}

/**
 * Restores the encrypted MSAL cache and silently obtains
 * a valid Microsoft Graph access token.
 */
export async function getMicrosoftAccessToken(
  accountId: string,
): Promise<MicrosoftAccessResult> {
  const serviceRole =
    createServiceRoleClient();

  const {
    data,
    error,
  } = await serviceRole
    .from('email_oauth_credentials')
    .select(
      `
        connection_id,
        msal_home_account_id,
        encrypted_token_cache
      `,
    )
    .eq('account_id', accountId)
    .maybeSingle();

  if (error) {
    console.error(
      'Failed to load Microsoft credentials:',
      error,
    );

    throw new Error(
      'Could not load Microsoft credentials.',
    );
  }

  const credential =
    data as StoredMicrosoftCredential | null;

  if (!credential) {
    throw new Error(
      'Microsoft 365 is not connected.',
    );
  }

  let serializedTokenCache: string;

  try {
    serializedTokenCache = decrypt(
      credential.encrypted_token_cache,
    );
  } catch (error) {
    console.error(
      'Failed to decrypt Microsoft token cache:',
      error,
    );

    throw new Error(
      'Microsoft credentials could not be decrypted.',
    );
  }

  const microsoftClient =
    createMicrosoftClient(
      serializedTokenCache,
    );

  const tokenCache =
    microsoftClient.getTokenCache();

  const microsoftAccount =
    await tokenCache.getAccountByHomeId(
      credential.msal_home_account_id,
    );

  if (!microsoftAccount) {
    throw new Error(
      'The Microsoft account was not found in the saved token cache.',
    );
  }

  const tokenResult =
    await microsoftClient.acquireTokenSilent({
      account: microsoftAccount,
      scopes: MICROSOFT_GRAPH_SCOPES,
    });

  if (!tokenResult?.accessToken) {
    throw new Error(
      'Microsoft did not return a valid access token.',
    );
  }

  /*
   * acquireTokenSilent can refresh the access token.
   * Save the possibly updated cache again, encrypted.
   */
  const refreshedTokenCache =
    tokenCache.serialize();

  const {
    error: updateError,
  } = await serviceRole
    .from('email_oauth_credentials')
    .update({
      encrypted_token_cache:
        encrypt(refreshedTokenCache),

      granted_scopes:
        tokenResult.scopes,

      access_token_expires_at:
        tokenResult.expiresOn
          ? tokenResult.expiresOn.toISOString()
          : null,

      last_token_refresh_at:
        new Date().toISOString(),
    })
    .eq('account_id', accountId);

  if (updateError) {
    console.error(
      'Failed to persist refreshed Microsoft cache:',
      updateError,
    );

    throw new Error(
      'The refreshed Microsoft credentials could not be saved.',
    );
  }

  return {
    accessToken:
      tokenResult.accessToken,

    connectionId:
      credential.connection_id,
  };
}