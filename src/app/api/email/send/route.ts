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

type AuthenticationResult =
  | {
      accountId: string;
    }
  | {
      response: NextResponse;
    };

interface GraphDraftMessage {
  id?: string | null;
}

const EMAIL_PATTERN =
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/*
 * Microsoft Graph accepts direct file
 * attachments smaller than 3 MB.
 *
 * We use 2.9 MB as a safe limit.
 */
const MAX_FILES = 5;

const MAX_FILE_BYTES =
  2_900_000;

const MAX_TOTAL_FILE_BYTES =
  12_000_000;

function normalizeRecipients(
  values: unknown[],
): string[] {
  const addresses =
    values
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

function getTextField(
  formData: FormData,
  fieldName: string,
): string {
  const value =
    formData.get(fieldName);

  return typeof value === 'string'
    ? value.trim()
    : '';
}

function createSafeFilename(
  value: string,
): string {
  const safeName =
    value
      .replace(/[\r\n"]/g, '_')
      .replace(
        /[<>:"/\\|?*\u0000-\u001F]/g,
        '_',
      )
      .trim()
      .slice(0, 180);

  return safeName || 'attachment';
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

async function deleteIncompleteDraft(
  accessToken: string,
  draftId: string,
) {
  try {
    const response =
      await fetch(
        `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(
          draftId,
        )}`,
        {
          method: 'DELETE',

          headers: {
            Authorization:
              `Bearer ${accessToken}`,
          },

          cache: 'no-store',
        },
      );

    if (
      !response.ok &&
      response.status !== 404
    ) {
      const graphError =
        await response.text();

      console.error(
        'Could not delete incomplete Microsoft draft:',
        response.status,
        graphError,
      );
    }
  } catch (cleanupError) {
    console.error(
      'Microsoft draft cleanup failed:',
      cleanupError,
    );
  }
}

/**
 * POST /api/email/send
 *
 * Uses multipart/form-data:
 *
 * to: recipient@example.com
 * cc: optional@example.com
 * subject: Subject
 * body: Message
 * files: File
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

    let formData: FormData;

    try {
      formData =
        await request.formData();
    } catch {
      return NextResponse.json(
        {
          error:
            'Invalid email form data.',
        },
        {
          status: 400,
        },
      );
    }

    const toRecipients =
      normalizeRecipients(
        formData.getAll('to'),
      );

    const ccRecipients =
      normalizeRecipients(
        formData.getAll('cc'),
      );

    const subject =
      getTextField(
        formData,
        'subject',
      );

    const messageBody =
      getTextField(
        formData,
        'body',
      );

    const files =
      formData
        .getAll('files')
        .filter(
          (entry): entry is File =>
            typeof entry !== 'string' &&
            entry.size > 0,
        );

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

    if (
      messageBody.length >
      100_000
    ) {
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

    if (files.length > MAX_FILES) {
      return NextResponse.json(
        {
          error:
            `A maximum of ${MAX_FILES} files is allowed.`,
        },
        {
          status: 400,
        },
      );
    }

    const oversizedFile =
      files.find(
        (file) =>
          file.size >
          MAX_FILE_BYTES,
      );

    if (oversizedFile) {
      return NextResponse.json(
        {
          error:
            `${oversizedFile.name} is larger than 2.9 MB.`,
        },
        {
          status: 400,
        },
      );
    }

    const totalFileBytes =
      files.reduce(
        (total, file) =>
          total + file.size,
        0,
      );

    if (
      totalFileBytes >
      MAX_TOTAL_FILE_BYTES
    ) {
      return NextResponse.json(
        {
          error:
            'The combined attachment size cannot exceed 12 MB.',
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

    let draftId:
      | string
      | null = null;

    try {
      /*
       * 1. Create a temporary Microsoft 365 draft.
       */
      const draftResponse =
        await fetch(
          'https://graph.microsoft.com/v1.0/me/messages',
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
              subject,

              body: {
                contentType: 'Text',
                content:
                  messageBody,
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
            }),

            cache: 'no-store',
          },
        );

      if (
        !draftResponse.ok ||
        draftResponse.status !== 201
      ) {
        const graphError =
          await draftResponse.text();

        console.error(
          'Microsoft Graph draft creation failed:',
          draftResponse.status,
          graphError,
        );

        throw new Error(
          'Microsoft could not create the temporary email draft.',
        );
      }

      const draft =
        (await draftResponse.json()) as
          GraphDraftMessage;

      draftId =
        draft.id?.trim() ?? null;

      if (!draftId) {
        throw new Error(
          'Microsoft did not return a draft identifier.',
        );
      }

      /*
       * 2. Add each selected file to the draft.
       *
       * Files are converted to Base64 only in
       * server memory and are never inserted
       * into Supabase.
       */
      for (const file of files) {
        const fileBuffer =
          Buffer.from(
            await file.arrayBuffer(),
          );

        const attachmentResponse =
          await fetch(
            `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(
              draftId,
            )}/attachments`,
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
                '@odata.type':
                  '#microsoft.graph.fileAttachment',

                name:
                  createSafeFilename(
                    file.name,
                  ),

                contentType:
                  file.type ||
                  'application/octet-stream',

                contentBytes:
                  fileBuffer.toString(
                    'base64',
                  ),
              }),

              cache: 'no-store',
            },
          );

        if (
          !attachmentResponse.ok ||
          attachmentResponse.status !==
            201
        ) {
          const graphError =
            await attachmentResponse.text();

          console.error(
            'Microsoft Graph attachment upload failed:',
            file.name,
            attachmentResponse.status,
            graphError,
          );

          throw new Error(
            `Microsoft could not attach ${file.name}.`,
          );
        }
      }

      /*
       * 3. Send the completed Microsoft draft.
       */
      const sendResponse =
        await fetch(
          `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(
            draftId,
          )}/send`,
          {
            method: 'POST',

            headers: {
              Authorization:
                `Bearer ${accessToken}`,
            },

            cache: 'no-store',
          },
        );

      if (
        !sendResponse.ok ||
        sendResponse.status !== 202
      ) {
        const graphError =
          await sendResponse.text();

        console.error(
          'Microsoft Graph draft send failed:',
          sendResponse.status,
          graphError,
        );

        throw new Error(
          'Microsoft could not send the email.',
        );
      }

      /*
       * The draft was accepted for sending.
       * It must no longer be deleted.
       */
      draftId = null;

      return NextResponse.json({
        success: true,

        attachmentCount:
          files.length,

        message:
          files.length > 0
            ? 'Email and attachments accepted by Microsoft 365.'
            : 'Email accepted by Microsoft 365.',
      });
    } catch (graphOperationError) {
      /*
       * Remove an incomplete draft when file
       * upload or sending fails.
       */
      if (draftId) {
        await deleteIncompleteDraft(
          accessToken,
          draftId,
        );
      }

      throw graphOperationError;
    }
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