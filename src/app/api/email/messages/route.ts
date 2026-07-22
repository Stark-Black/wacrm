import { NextResponse } from 'next/server';

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

interface GraphEmailAddress {
  name?: string | null;
  address?: string | null;
}

interface GraphMessage {
  id: string;
  subject?: string | null;

  from?: {
    emailAddress?: GraphEmailAddress | null;
  } | null;

  receivedDateTime?: string | null;
  isRead?: boolean;
  hasAttachments?: boolean;
  bodyPreview?: string | null;
}

interface GraphMessagesResponse {
  value?: GraphMessage[];
  '@odata.nextLink'?: string;
}

export async function GET() {
  try {
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

    const graphUrl = new URL(
      'https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages',
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
        'receivedDateTime',
        'isRead',
        'hasAttachments',
        'bodyPreview',
      ].join(','),
    );

    graphUrl.searchParams.set(
      '$orderby',
      'receivedDateTime desc',
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
        'Microsoft Graph inbox request failed:',
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
            'Could not load the Microsoft Inbox.',
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
          const emailAddress =
            message.from?.emailAddress;

          return {
            id: message.id,

            subject:
              message.subject?.trim() ||
              '(No subject)',

            fromName:
              emailAddress?.name?.trim() ||
              emailAddress?.address?.trim() ||
              'Unknown sender',

            fromAddress:
              emailAddress?.address?.trim() ||
              '',

            receivedDateTime:
              message.receivedDateTime ??
              null,

            isRead:
              Boolean(message.isRead),

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
        connection_status: 'connected',
        last_synced_at: synchronizedAt,
        last_error: null,
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
      messages,
      count: messages.length,
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