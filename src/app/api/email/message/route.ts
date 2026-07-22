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

interface GraphEmailAddress {
  name?: string | null;
  address?: string | null;
}

interface GraphRecipient {
  emailAddress?: GraphEmailAddress | null;
}

interface GraphMessageBody {
  contentType?: 'text' | 'html' | null;
  content?: string | null;
}

interface GraphMessage {
  id: string;
  subject?: string | null;

  from?: GraphRecipient | null;

  toRecipients?: GraphRecipient[];
  ccRecipients?: GraphRecipient[];

  receivedDateTime?: string | null;
  sentDateTime?: string | null;

  isRead?: boolean;
  hasAttachments?: boolean;

  body?: GraphMessageBody | null;
}

interface UpdateMessageBody {
  id?: string;
  isRead?: boolean;
}

async function getAuthenticatedAccountId(): Promise<
  | {
      accountId: string;
    }
  | {
      response: NextResponse;
    }
> {
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
    .select('account_id')
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

  return {
    accountId:
      profile.account_id as string,
  };
}

function mapRecipient(
  recipient: GraphRecipient,
) {
  return {
    name:
      recipient.emailAddress?.name?.trim() ||
      recipient.emailAddress?.address?.trim() ||
      '',

    address:
      recipient.emailAddress?.address?.trim() ||
      '',
  };
}

/**
 * GET /api/email/message?id=MICROSOFT_MESSAGE_ID
 *
 * Returns the complete message body as plain text.
 */
export async function GET(
  request: NextRequest,
) {
  try {
    const authentication =
      await getAuthenticatedAccountId();

    if ('response' in authentication) {
      return authentication.response;
    }

    const messageId =
      request.nextUrl.searchParams.get('id');

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

    const {
      accessToken,
    } = await getMicrosoftAccessToken(
      authentication.accountId,
    );

    const graphUrl = new URL(
      `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(
        messageId,
      )}`,
    );

    graphUrl.searchParams.set(
      '$select',
      [
        'id',
        'subject',
        'from',
        'toRecipients',
        'ccRecipients',
        'receivedDateTime',
        'sentDateTime',
        'isRead',
        'hasAttachments',
        'body',
      ].join(','),
    );

    const graphResponse =
      await fetch(graphUrl, {
        method: 'GET',

        headers: {
          Authorization:
            `Bearer ${accessToken}`,

          Accept:
            'application/json',

          Prefer:
            'outlook.body-content-type="text"',
        },

        cache: 'no-store',
      });

    if (!graphResponse.ok) {
      const graphError =
        await graphResponse.text();

      console.error(
        'Microsoft Graph message request failed:',
        graphResponse.status,
        graphError,
      );

      return NextResponse.json(
        {
          error:
            'Could not load the selected email.',
        },
        {
          status: 502,
        },
      );
    }

    const graphMessage =
      (await graphResponse.json()) as
        GraphMessage;

    const sender =
      graphMessage.from?.emailAddress;

    return NextResponse.json({
      message: {
        id:
          graphMessage.id,

        subject:
          graphMessage.subject?.trim() ||
          '(No subject)',

        fromName:
          sender?.name?.trim() ||
          sender?.address?.trim() ||
          'Unknown sender',

        fromAddress:
          sender?.address?.trim() ||
          '',

        toRecipients:
          (graphMessage.toRecipients ?? [])
            .map(mapRecipient)
            .filter(
              (recipient) =>
                recipient.address ||
                recipient.name,
            ),

        ccRecipients:
          (graphMessage.ccRecipients ?? [])
            .map(mapRecipient)
            .filter(
              (recipient) =>
                recipient.address ||
                recipient.name,
            ),

        receivedDateTime:
          graphMessage.receivedDateTime ??
          null,

        sentDateTime:
          graphMessage.sentDateTime ??
          null,

        isRead:
          Boolean(graphMessage.isRead),

        hasAttachments:
          Boolean(
            graphMessage.hasAttachments,
          ),

        body:
          graphMessage.body?.content?.trim() ||
          '',
      },
    });
  } catch (error) {
    console.error(
      'Email message detail API failed:',
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Could not load the email.',
      },
      {
        status: 500,
      },
    );
  }
}

/**
 * PATCH /api/email/message
 *
 * Body:
 * {
 *   "id": "MICROSOFT_MESSAGE_ID",
 *   "isRead": true
 * }
 */
export async function PATCH(
  request: NextRequest,
) {
  try {
    const authentication =
      await getAuthenticatedAccountId();

    if ('response' in authentication) {
      return authentication.response;
    }

    let requestBody: UpdateMessageBody;

    try {
      requestBody =
        (await request.json()) as
          UpdateMessageBody;
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

    if (
      !messageId ||
      typeof requestBody.isRead !==
        'boolean'
    ) {
      return NextResponse.json(
        {
          error:
            'Message ID and read status are required.',
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
      )}`;

    const graphResponse =
      await fetch(graphUrl, {
        method: 'PATCH',

        headers: {
          Authorization:
            `Bearer ${accessToken}`,

          Accept:
            'application/json',

          'Content-Type':
            'application/json',
        },

        body: JSON.stringify({
          isRead:
            requestBody.isRead,
        }),

        cache: 'no-store',
      });

    if (!graphResponse.ok) {
      const graphError =
        await graphResponse.text();

      console.error(
        'Microsoft Graph read-status update failed:',
        graphResponse.status,
        graphError,
      );

      return NextResponse.json(
        {
          error:
            'Could not update the email read status.',
        },
        {
          status: 502,
        },
      );
    }

    const updatedMessage =
      (await graphResponse.json()) as
        GraphMessage;

    return NextResponse.json({
      success: true,

      isRead:
        Boolean(
          updatedMessage.isRead,
        ),
    });
  } catch (error) {
    console.error(
      'Email read-status API failed:',
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Could not update the email.',
      },
      {
        status: 500,
      },
    );
  }
}