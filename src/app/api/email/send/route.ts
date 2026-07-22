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

interface SendEmailRequestBody {
  to?: string[];
  cc?: string[];
  subject?: string;
  body?: string;
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

  const addresses = value
    .filter(
      (item): item is string =>
        typeof item === 'string',
    )
    .map((item) =>
      item.trim().toLowerCase(),
    )
    .filter(Boolean);

  return Array.from(
    new Set(addresses),
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
    .select('account_id, account_role')
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
    profile.account_role as string | null;

  const canSend =
    role === 'owner' ||
    role === 'admin' ||
    role === 'agent';

  if (!canSend) {
    return {
      response: NextResponse.json(
        {
          error:
            'You do not have permission to send emails.',
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

/**
 * POST /api/email/send
 *
 * Body:
 * {
 *   "to": ["customer@example.com"],
 *   "cc": [],
 *   "subject": "Subject",
 *   "body": "Message content"
 * }
 */
export async function POST(
  request: NextRequest,
) {
  try {
    const authentication =
      await getAuthenticatedAccount();

    if ('response' in authentication) {
      return authentication.response;
    }

    let requestBody: SendEmailRequestBody;

    try {
      requestBody =
        (await request.json()) as
          SendEmailRequestBody;
    } catch {
      return NextResponse.json(
        {
          error: 'Invalid request body.',
        },
        {
          status: 400,
        },
      );
    }

    const toRecipients =
      normalizeRecipients(
        requestBody.to,
      );

    const ccRecipients =
      normalizeRecipients(
        requestBody.cc,
      );

    const subject =
      requestBody.subject?.trim() ?? '';

    const messageBody =
      requestBody.body?.trim() ?? '';

    if (toRecipients.length === 0) {
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

    const allRecipients = [
      ...toRecipients,
      ...ccRecipients,
    ];

    const invalidAddress =
      allRecipients.find(
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

    if (allRecipients.length > 50) {
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

    if (!subject) {
      return NextResponse.json(
        {
          error:
            'Write a subject before sending.',
        },
        {
          status: 400,
        },
      );
    }

    if (subject.length > 500) {
      return NextResponse.json(
        {
          error:
            'The subject is too long.',
        },
        {
          status: 400,
        },
      );
    }

    if (!messageBody) {
      return NextResponse.json(
        {
          error:
            'Write a message before sending.',
        },
        {
          status: 400,
        },
      );
    }

    if (messageBody.length > 100_000) {
      return NextResponse.json(
        {
          error:
            'The email message is too long.',
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
        'https://graph.microsoft.com/v1.0/me/sendMail',
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
            message: {
              subject,

              body: {
                contentType: 'Text',
                content: messageBody,
              },

              toRecipients:
                toRecipients.map(
                  (address) => ({
                    emailAddress: {
                      address,
                    },
                  }),
                ),

              ccRecipients:
                ccRecipients.map(
                  (address) => ({
                    emailAddress: {
                      address,
                    },
                  }),
                ),
            },

            saveToSentItems: true,
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
        'Microsoft Graph sendMail failed:',
        graphResponse.status,
        graphError,
      );

      return NextResponse.json(
        {
          error:
            'Microsoft could not send the email.',
        },
        {
          status: 502,
        },
      );
    }

    return NextResponse.json({
      success: true,
      message:
        'Email accepted by Microsoft 365.',
    });
  } catch (error) {
    console.error(
      'Email send API failed:',
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Could not send the email.',
      },
      {
        status: 500,
      },
    );
  }
}