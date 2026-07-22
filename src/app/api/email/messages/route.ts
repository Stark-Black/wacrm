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

import {
  createServiceRoleClient,
} from '@/lib/supabase/service-role';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type EmailFolder = 'inbox' | 'sent';

interface GraphEmailAddress {
  name?: string | null;
  address?: string | null;
}

interface GraphRecipient {
  emailAddress?: GraphEmailAddress | null;
}

interface GraphMessage {
  id: string;
  subject?: string | null;

  from?: GraphRecipient | null;

  toRecipients?: GraphRecipient[];

  receivedDateTime?: string | null;
  sentDateTime?: string | null;

  isRead?: boolean;
  hasAttachments?: boolean;
  bodyPreview?: string | null;
}

interface GraphMessagesResponse {
  value?: GraphMessage[];
  '@odata.nextLink'?: string;
}

export async function GET(
  request: NextRequest,
) {
  try {
    const requestedFolder =
      request.nextUrl.searchParams
        .get('folder')
        ?.trim()
        .toLowerCase() ??
      'inbox';

    if (
      requestedFolder !== 'inbox' &&
      requestedFolder !== 'sent'
    ) {
      return NextResponse.json(
        {
          error:
            'The requested email folder is not supported.',
        },
        {
          status: 400,
        },
      );
    }

    const folder =
      requestedFolder as EmailFolder;

    const supabase =
      await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        {
          error: 'Unauthorized',
        },
        {
          status: 401,
        },
      );
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
      return NextResponse.json(
        {
          error:
            'Your profile is not linked to an account.',
        },
        {
          status: 403,
        },
      );
    }

    const accountId =
      profile.account_id as string;

    const {
      accessToken,
      connectionId,
    } = await getMicrosoftAccessToken(
      accountId,
    );

    const microsoftFolder =
      folder === 'sent'
        ? 'sentitems'
        : 'inbox';

    const orderByField =
      folder === 'sent'
        ? 'sentDateTime'
        : 'receivedDateTime';

    const graphUrl = new URL(
      `https://graph.microsoft.com/v1.0/me/mailFolders/${microsoftFolder}/messages`,
    );

    graphUrl.searchParams.set(
      '$top',
      '25',
    );

    graphUrl.searchParams.set(
      '$select',
      [
        'id',
        'subject',
        'from',
        'toRecipients',
        'receivedDateTime',
        'sentDateTime',
        'isRead',
        'hasAttachments',
        'bodyPreview',
      ].join(','),
    );

    graphUrl.searchParams.set(
      '$orderby',
      `${orderByField} desc`,
    );

    const graphResponse =
      await fetch(graphUrl, {
        method: 'GET',

        headers: {
          Authorization:
            `Bearer ${accessToken}`,

          Accept:
            'application/json',
        },

        cache: 'no-store',
      });

    if (!graphResponse.ok) {
      const graphError =
        await graphResponse.text();

      console.error(
        `Microsoft Graph ${folder} request failed:`,
        graphResponse.status,
        graphError,
      );

      const serviceRole =
        createServiceRoleClient();

      await serviceRole
        .from('email_connections')
        .update({
          connection_status:
            graphResponse.status === 401
              ? 'expired'
              : 'error',

          last_error:
            `Microsoft Graph returned HTTP ${graphResponse.status}.`,
        })
        .eq('id', connectionId)
        .eq('account_id', accountId);

      return NextResponse.json(
        {
          error:
            folder === 'sent'
              ? 'Could not load Microsoft Sent Items.'
              : 'Could not load the Microsoft Inbox.',
        },
        {
          status: 502,
        },
      );
    }

    const graphData =
      (await graphResponse.json()) as
        GraphMessagesResponse;

    const messages =
      (graphData.value ?? []).map(
        (message) => {
          const senderAddress =
            message.from?.emailAddress;

          const firstRecipient =
            message.toRecipients?.[0]
              ?.emailAddress;

          /*
           * Inbox:
           * Show the person who sent the email.
           *
           * Sent:
           * Show the first person who received it.
           */
          const displayAddress =
            folder === 'sent'
              ? firstRecipient
              : senderAddress;

          const displayDate =
            folder === 'sent'
              ? message.sentDateTime
              : message.receivedDateTime;

          return {
            id:
              message.id,

            folder,

            subject:
              message.subject?.trim() ||
              '(No subject)',

            fromName:
              displayAddress?.name?.trim() ||
              displayAddress?.address?.trim() ||
              (
                folder === 'sent'
                  ? 'Unknown recipient'
                  : 'Unknown sender'
              ),

            fromAddress:
              displayAddress?.address?.trim() ||
              '',

            receivedDateTime:
              displayDate ??
              null,

            /*
             * The read indicator is relevant to Inbox.
             * Sent messages are displayed as read.
             */
            isRead:
              folder === 'sent'
                ? true
                : Boolean(
                    message.isRead,
                  ),

            hasAttachments:
              Boolean(
                message.hasAttachments,
              ),

            preview:
              message.bodyPreview?.trim() ||
              '',
          };
        },
      );

    const serviceRole =
      createServiceRoleClient();

    const synchronizedAt =
      new Date().toISOString();

    const {
      error: syncUpdateError,
    } = await serviceRole
      .from('email_connections')
      .update({
        connection_status:
          'connected',

        last_synced_at:
          synchronizedAt,

        last_error:
          null,
      })
      .eq('id', connectionId)
      .eq('account_id', accountId);

    if (syncUpdateError) {
      console.error(
        'Failed to update email synchronization date:',
        syncUpdateError,
      );
    }

    return NextResponse.json({
      folder,
      messages,
      count:
        messages.length,
      synchronizedAt,
      hasMore:
        Boolean(
          graphData['@odata.nextLink'],
        ),
    });
  } catch (error) {
    console.error(
      'Email messages API failed:',
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Could not load emails.',
      },
      {
        status: 500,
      },
    );
  }
}