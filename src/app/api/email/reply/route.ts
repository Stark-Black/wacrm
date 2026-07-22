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

interface ReplyRequestBody {
  id?: string;
  comment?: string;
}

type AuthenticationResult =
  | {
      accountId: string;
    }
  | {
      response: NextResponse;
    };

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
 * POST /api/email/reply
 *
 * Body:
 * {
 *   "id": "MICROSOFT_MESSAGE_ID",
 *   "comment": "Reply content"
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

    let requestBody: ReplyRequestBody;

    try {
      requestBody =
        (await request.json()) as
          ReplyRequestBody;
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

    const messageId =
      requestBody.id?.trim();

    const comment =
      requestBody.comment?.trim();

    if (!messageId) {
      return NextResponse.json(
        {
          error:
            'The Microsoft message ID is required.',
        },
        {
          status: 400,
        },
      );
    }

    if (!comment) {
      return NextResponse.json(
        {
          error:
            'Write a message before sending the reply.',
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
            'The reply is too long.',
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

    const graphUrl =
      `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(
        messageId,
      )}/reply`;

    const graphResponse =
      await fetch(graphUrl, {
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
          comment,
        }),

        cache: 'no-store',
      });

    if (
      !graphResponse.ok ||
      graphResponse.status !== 202
    ) {
      const graphError =
        await graphResponse.text();

      console.error(
        'Microsoft Graph reply request failed:',
        graphResponse.status,
        graphError,
      );

      return NextResponse.json(
        {
          error:
            'Microsoft could not send the reply.',
        },
        {
          status: 502,
        },
      );
    }

    return NextResponse.json({
      success: true,
      message:
        'Reply accepted by Microsoft 365.',
    });
  } catch (error) {
    console.error(
      'Email reply API failed:',
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Could not send the reply.',
      },
      {
        status: 500,
      },
    );
  }
}