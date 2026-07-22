import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  getMicrosoftAccessToken,
} from '@/lib/email/microsoft-token';

import {
  createClient,
} from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ForwardEmailRequestBody {
  id?: string;
  to?: string[];
  comment?: string;
}

type AuthenticationResult =
  | {
      accountId: string;
    }
  | {
      response: NextResponse;
    };

const EMAIL_PATTERN =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeRecipients(
  value: unknown,
): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const recipients =
    value
      .filter(
        (item): item is string =>
          typeof item === 'string',
      )
      .map((item) =>
        item.trim().toLowerCase(),
      )
      .filter(Boolean);

  return Array.from(
    new Set(recipients),
  );
}

async function getAuthenticatedAccount():
  Promise<AuthenticationResult> {
  const supabase =
    await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      response: NextResponse.json(
        {
          error: 'Unauthorized',
        },
        {
          status: 401,
        },
      ),
    };
  }

  const {
    data: profile,
    error: profileError,
  } = await supabase
    .from('profiles')
    .select(
      'account_id, account_role',
    )
    .eq('user_id', user.id)
    .maybeSingle();

  if (
    profileError ||
    !profile?.account_id
  ) {
    return {
      response: NextResponse.json(
        {
          error:
            'Your profile is not linked to an account.',
        },
        {
          status: 403,
        },
      ),
    };
  }

  const role =
    profile.account_role as
      | string
      | null;

  const canSend =
    role === 'owner' ||
    role === 'admin' ||
    role === 'agent';

  if (!canSend) {
    return {
      response: NextResponse.json(
        {
          error:
            'You do not have permission to forward emails.',
        },
        {
          status: 403,
        },
      ),
    };
  }

  return {
    accountId:
      profile.account_id as string,
  };
}

export async function POST(
  request: NextRequest,
) {
  try {
    const authentication =
      await getAuthenticatedAccount();

    if ('response' in authentication) {
      return authentication.response;
    }

    let requestBody:
      ForwardEmailRequestBody;

    try {
      requestBody =
        (await request.json()) as
          ForwardEmailRequestBody;
    } catch {
      return NextResponse.json(
        {
          error:
            'Invalid request body.',
        },
        {
          status: 400,
        },
      );
    }

    const messageId =
      requestBody.id?.trim();

    const recipients =
      normalizeRecipients(
        requestBody.to,
      );

    const comment =
      requestBody.comment?.trim() ??
      '';

    if (!messageId) {
      return NextResponse.json(
        {
          error:
            'Select an email before forwarding.',
        },
        {
          status: 400,
        },
      );
    }

    if (recipients.length === 0) {
      return NextResponse.json(
        {
          error:
            'Add at least one recipient.',
        },
        {
          status: 400,
        },
      );
    }

    const invalidAddress =
      recipients.find(
        (address) =>
          !EMAIL_PATTERN.test(address),
      );

    if (invalidAddress) {
      return NextResponse.json(
        {
          error:
            `Invalid email address: ${invalidAddress}`,
        },
        {
          status: 400,
        },
      );
    }

    if (recipients.length > 50) {
      return NextResponse.json(
        {
          error:
            'A maximum of 50 recipients is allowed.',
        },
        {
          status: 400,
        },
      );
    }

    if (comment.length > 50_000) {
      return NextResponse.json(
        {
          error:
            'The forwarding comment is too long.',
        },
        {
          status: 400,
        },
      );
    }

    const {
      accessToken,
    } = await getMicrosoftAccessToken(
      authentication.accountId,
    );

    const graphResponse =
      await fetch(
        `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(
          messageId,
        )}/forward`,
        {
          method: 'POST',

          headers: {
            Authorization:
              `Bearer ${accessToken}`,

            Accept:
              'application/json',

            'Content-Type':
              'application/json',
          },

          body: JSON.stringify({
            ...(comment
              ? {
                  comment,
                }
              : {}),

            toRecipients:
              recipients.map(
                (address) => ({
                  emailAddress: {
                    address,
                  },
                }),
              ),
          }),

          cache: 'no-store',
        },
      );

    if (
      !graphResponse.ok ||
      graphResponse.status !== 202
    ) {
      const graphError =
        await graphResponse.text();

      console.error(
        'Microsoft Graph forward failed:',
        graphResponse.status,
        graphError,
      );

      return NextResponse.json(
        {
          error:
            'Microsoft could not forward the email.',
        },
        {
          status: 502,
        },
      );
    }

    return NextResponse.json({
      success: true,
      message:
        'Email accepted for forwarding.',
    });
  } catch (error) {
    console.error(
      'Email forward API failed:',
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Could not forward the email.',
      },
      {
        status: 500,
      },
    );
  }
}