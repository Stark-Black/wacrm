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

interface GraphAttachment {
  id: string;
  name?: string | null;
  contentType?: string | null;
  size?: number | null;
  isInline?: boolean | null;
  '@odata.type'?: string;
}

async function getAuthenticatedAccountId():
  Promise<
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

function createSafeFilename(
  value: string | null | undefined,
): string {
  const filename =
    value?.trim() || 'attachment';

  return filename
    .replace(/[\r\n"]/g, '_')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .slice(0, 200);
}

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
      request.nextUrl.searchParams
        .get('messageId')
        ?.trim();

    const attachmentId =
      request.nextUrl.searchParams
        .get('attachmentId')
        ?.trim();

    if (!messageId || !attachmentId) {
      return NextResponse.json(
        {
          error:
            'Message ID and attachment ID are required.',
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

    const encodedMessageId =
      encodeURIComponent(messageId);

    const encodedAttachmentId =
      encodeURIComponent(attachmentId);

    /*
     * Read the attachment metadata first so the
     * server can return the correct filename and
     * reject unsupported reference attachments.
     */
    const metadataUrl =
      `https://graph.microsoft.com/v1.0/me/messages/${encodedMessageId}/attachments/${encodedAttachmentId}`;

    const metadataResponse =
      await fetch(metadataUrl, {
        method: 'GET',

        headers: {
          Authorization:
            `Bearer ${accessToken}`,

          Accept:
            'application/json',
        },

        cache: 'no-store',
      });

    if (!metadataResponse.ok) {
      const metadataError =
        await metadataResponse.text();

      console.error(
        'Microsoft Graph attachment metadata request failed:',
        metadataResponse.status,
        metadataError,
      );

      return NextResponse.json(
        {
          error:
            'Could not load the attachment information.',
        },
        {
          status: 502,
        },
      );
    }

    const metadata =
      (await metadataResponse.json()) as
        GraphAttachment;

    const graphType =
      metadata['@odata.type'] ?? '';

    if (
      graphType.includes(
        'referenceAttachment',
      )
    ) {
      return NextResponse.json(
        {
          error:
            'Reference attachments cannot be downloaded directly.',
        },
        {
          status: 400,
        },
      );
    }

    const downloadUrl =
      `${metadataUrl}/$value`;

    const downloadResponse =
      await fetch(downloadUrl, {
        method: 'GET',

        headers: {
          Authorization:
            `Bearer ${accessToken}`,
        },

        cache: 'no-store',
      });

    if (!downloadResponse.ok) {
      const downloadError =
        await downloadResponse.text();

      console.error(
        'Microsoft Graph attachment download failed:',
        downloadResponse.status,
        downloadError,
      );

      return NextResponse.json(
        {
          error:
            'Microsoft could not download the attachment.',
        },
        {
          status: 502,
        },
      );
    }

    if (!downloadResponse.body) {
      return NextResponse.json(
        {
          error:
            'The attachment did not contain downloadable data.',
        },
        {
          status: 502,
        },
      );
    }

    const filename =
      createSafeFilename(
        metadata.name,
      );

    const encodedFilename =
      encodeURIComponent(filename);

    const contentType =
      metadata.contentType?.trim() ||
      downloadResponse.headers.get(
        'content-type',
      ) ||
      'application/octet-stream';

    const headers =
      new Headers();

    headers.set(
      'Content-Type',
      contentType,
    );

    headers.set(
      'Content-Disposition',
      `attachment; filename="${filename}"; filename*=UTF-8''${encodedFilename}`,
    );

    headers.set(
      'Cache-Control',
      'private, no-store, max-age=0',
    );

    const contentLength =
      downloadResponse.headers.get(
        'content-length',
      );

    if (contentLength) {
      headers.set(
        'Content-Length',
        contentLength,
      );
    }

    return new NextResponse(
      downloadResponse.body,
      {
        status: 200,
        headers,
      },
    );
  } catch (error) {
    console.error(
      'Email attachment download API failed:',
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Could not download the attachment.',
      },
      {
        status: 500,
      },
    );
  }
}