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

type EmailDestination =
  | 'archive'
  | 'inbox';

interface MoveEmailRequestBody {
  id?: string;
  destination?: EmailDestination;
}

type AuthenticationResult =
  | {
      accountId: string;
    }
  | {
      response: NextResponse;
    };

interface GraphMovedMessage {
  id?: string;
  parentFolderId?: string;
}

function isEmailDestination(
  value: unknown,
): value is EmailDestination {
  return (
    value === 'archive' ||
    value === 'inbox'
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

  const canManageEmail =
    role === 'owner' ||
    role === 'admin' ||
    role === 'agent';

  if (!canManageEmail) {
    return {
      response: NextResponse.json(
        {
          error:
            'You do not have permission to move emails.',
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
 * POST /api/email/move
 *
 * Archive:
 * {
 *   "id": "MICROSOFT_MESSAGE_ID",
 *   "destination": "archive"
 * }
 *
 * Restore:
 * {
 *   "id": "MICROSOFT_MESSAGE_ID",
 *   "destination": "inbox"
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

    let requestBody: MoveEmailRequestBody;

    try {
      requestBody =
        (await request.json()) as
          MoveEmailRequestBody;
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

    if (!messageId) {
      return NextResponse.json(
        {
          error:
            'Select an email before moving it.',
        },
        {
          status: 400,
        },
      );
    }

    if (
      !isEmailDestination(
        requestBody.destination,
      )
    ) {
      return NextResponse.json(
        {
          error:
            'The destination folder is invalid.',
        },
        {
          status: 400,
        },
      );
    }

    const destination =
      requestBody.destination;

    const {
      accessToken,
    } = await getMicrosoftAccessToken(
      authentication.accountId,
    );

    const graphResponse =
      await fetch(
        `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(
          messageId,
        )}/move`,
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
            destinationId:
              destination,
          }),

          cache: 'no-store',
        },
      );

    if (
      !graphResponse.ok ||
      graphResponse.status !== 201
    ) {
      const graphError =
        await graphResponse.text();

      console.error(
        'Microsoft Graph message move failed:',
        graphResponse.status,
        graphError,
      );

      return NextResponse.json(
        {
          error:
            destination === 'archive'
              ? 'Microsoft could not archive the email.'
              : 'Microsoft could not restore the email.',
        },
        {
          status: 502,
        },
      );
    }

    const movedMessage =
      (await graphResponse.json()) as
        GraphMovedMessage;

    return NextResponse.json({
      success: true,

      destination,

      movedMessageId:
        movedMessage.id ?? null,

      message:
        destination === 'archive'
          ? 'Email archived successfully.'
          : 'Email restored to the Inbox.',
    });
  } catch (error) {
    console.error(
      'Email move API failed:',
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Could not move the email.',
      },
      {
        status: 500,
      },
    );
  }
}