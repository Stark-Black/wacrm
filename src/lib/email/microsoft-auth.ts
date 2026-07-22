import 'server-only';

import {
  ConfidentialClientApplication,
  type Configuration,
} from '@azure/msal-node';

/**
 * Permisos solicitados a Microsoft.
 *
 * User.Read:
 *   Permite identificar la cuenta Microsoft conectada.
 *
 * Mail.ReadWrite:
 *   Permite leer y administrar el correo del usuario conectado.
 *
 * Mail.Send:
 *   Permite enviar correos como el usuario conectado.
 *
 * offline_access:
 *   Permite que MSAL mantenga la conexión mediante su caché.
 */
export const MICROSOFT_SCOPES: string[] = [
  'openid',
  'profile',
  'offline_access',
  'User.Read',
  'Mail.ReadWrite',
  'Mail.Send',
];

function requiredEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `${name} is not configured in .env.local.`,
    );
  }

  return value;
}

export function getMicrosoftClientId(): string {
  return requiredEnvironmentVariable(
    'MICROSOFT_CLIENT_ID',
  );
}

export function getMicrosoftTenantId(): string {
  return requiredEnvironmentVariable(
    'MICROSOFT_TENANT_ID',
  );
}

export function getMicrosoftClientSecret(): string {
  return requiredEnvironmentVariable(
    'MICROSOFT_CLIENT_SECRET',
  );
}

export function getMicrosoftRedirectUri(): string {
  return requiredEnvironmentVariable(
    'MICROSOFT_REDIRECT_URI',
  );
}

/**
 * Creates a Microsoft confidential client.
 *
 * Passing a serialized cache is optional. During the initial
 * connection the cache is empty. Later, the encrypted cache
 * will be loaded from Supabase, decrypted and passed here.
 */
export function createMicrosoftClient(
  serializedTokenCache?: string,
): ConfidentialClientApplication {
  const tenantId = getMicrosoftTenantId();

  const configuration: Configuration = {
    auth: {
      clientId: getMicrosoftClientId(),
      clientSecret: getMicrosoftClientSecret(),
      authority:
        `https://login.microsoftonline.com/${tenantId}`,
    },
  };

  const client =
    new ConfidentialClientApplication(configuration);

  if (serializedTokenCache) {
    client
      .getTokenCache()
      .deserialize(serializedTokenCache);
  }

  return client;
}