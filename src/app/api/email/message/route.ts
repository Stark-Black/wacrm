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

import sanitizeHtml from 'sanitize-html';

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


interface GraphAttachment {
  id: string;
  name?: string | null;
  contentType?: string | null;
  contentId?: string | null;
  size?: number | null;
  isInline?: boolean | null;
  '@odata.type'?: string;
}

type EmailAttachmentType =
  | 'file'
  | 'item'
  | 'reference'
  | 'unknown';

interface EmailAttachmentData {
  id: string;
  name: string;
  contentType: string;
  contentId: string;
  size: number;
  isInline: boolean;
  attachmentType: EmailAttachmentType;
  downloadable: boolean;
}

interface GraphAttachmentsResponse {
  value?: GraphAttachment[];
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




const SAFE_EMAIL_CSS_VALUE =
  /^(?!.*(?:url\s*\(|expression\s*\(|javascript:|data:))[^{}]*$/i;

function mapGraphAttachment(
  attachment: GraphAttachment,
): EmailAttachmentData {
  const graphType =
    attachment['@odata.type'] ?? '';

  const attachmentType:
    EmailAttachmentType =
    graphType.includes(
      'fileAttachment',
    )
      ? 'file'
      : graphType.includes(
            'itemAttachment',
          )
        ? 'item'
        : graphType.includes(
              'referenceAttachment',
            )
          ? 'reference'
          : 'unknown';

  return {
    id:
      attachment.id,

    name:
      attachment.name?.trim() ||
      'Attachment',

    contentType:
      attachment.contentType?.trim() ||
      'application/octet-stream',

    contentId:
      attachment.contentId?.trim() ||
      '',

    size:
      typeof attachment.size ===
      'number'
        ? attachment.size
        : 0,

    isInline:
      Boolean(
        attachment.isInline,
      ),

    attachmentType,

    downloadable:
      attachmentType === 'file' ||
      attachmentType === 'item',
  };
}

function normalizeContentId(
  value: string,
): string {
  let decodedValue = value;

  try {
    decodedValue =
      decodeURIComponent(value);
  } catch {
    // Keep the original content ID.
  }

  return decodedValue
    .trim()
    .replace(/^<|>$/g, '')
    .toLowerCase();
}

function createInlineImageUrl(
  messageId: string,
  attachmentId: string,
): string {
  const parameters =
    new URLSearchParams({
      messageId,
      attachmentId,
      inline: 'true',
    });

  return `/api/email/attachment?${parameters.toString()}`;
}

function convertHtmlToText(
  html: string,
): string {
  const htmlWithLineBreaks =
    html
      .replace(
        /<br\s*\/?>/gi,
        '\n',
      )
      .replace(
        /<\/(?:p|div|section|article|h[1-6]|li)>/gi,
        '\n',
      )
      .replace(
        /<\/td>/gi,
        '\t',
      )
      .replace(
        /<\/tr>/gi,
        '\n',
      );

  return sanitizeHtml(
    htmlWithLineBreaks,
    {
      allowedTags: [],
      allowedAttributes: {},
    },
  )
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function sanitizeEmailBodyHtml(
  rawHtml: string,
  messageId: string,
  inlineAttachments:
    EmailAttachmentData[],
  allowExternalImages: boolean,
): {
  html: string;
  hasBlockedExternalImages: boolean;
} {
  const inlineImages =
    new Map<string, string>();

  inlineAttachments.forEach(
    (attachment) => {
      if (
        !attachment.contentId ||
        attachment.attachmentType !==
          'file'
      ) {
        return;
      }

      inlineImages.set(
        normalizeContentId(
          attachment.contentId,
        ),
        createInlineImageUrl(
          messageId,
          attachment.id,
        ),
      );
    },
  );

  let hasBlockedExternalImages =
    false;

  const html =
    sanitizeHtml(
      rawHtml,
      {
        allowedTags: [
          'a',
          'address',
          'article',
          'aside',
          'b',
          'blockquote',
          'br',
          'center',
          'code',
          'div',
          'em',
          'font',
          'h1',
          'h2',
          'h3',
          'h4',
          'h5',
          'h6',
          'hr',
          'i',
          'img',
          'li',
          'ol',
          'p',
          'pre',
          'section',
          'small',
          'span',
          'strong',
          'sub',
          'sup',
          'table',
          'tbody',
          'td',
          'tfoot',
          'th',
          'thead',
          'tr',
          'u',
          'ul',
        ],

        allowedAttributes: {
          '*': [
            'align',
            'dir',
            'lang',
            'style',
            'title',
          ],

          a: [
            'href',
            'rel',
            'target',
            'title',
          ],

          img: [
            'alt',
            'data-blocked-external-image',
            'height',
            'src',
            'title',
            'width',
          ],

          table: [
            'align',
            'border',
            'cellpadding',
            'cellspacing',
            'height',
            'role',
            'width',
          ],

          td: [
            'align',
            'bgcolor',
            'colspan',
            'height',
            'rowspan',
            'valign',
            'width',
          ],

          th: [
            'align',
            'bgcolor',
            'colspan',
            'height',
            'rowspan',
            'valign',
            'width',
          ],

          font: [
            'face',
            'size',
          ],
        },

        allowedSchemes: [
          'http',
          'https',
          'mailto',
        ],

        allowedSchemesByTag: {
          img: [
            'http',
            'https',
          ],
        },

        allowProtocolRelative:
          false,

        allowedStyles: {
          '*': {

            'font-family': [
              SAFE_EMAIL_CSS_VALUE,
            ],

            'font-size': [
              SAFE_EMAIL_CSS_VALUE,
            ],

            'font-style': [
              SAFE_EMAIL_CSS_VALUE,
            ],

            'font-weight': [
              SAFE_EMAIL_CSS_VALUE,
            ],

            'text-align': [
              SAFE_EMAIL_CSS_VALUE,
            ],

            'text-decoration': [
              SAFE_EMAIL_CSS_VALUE,
            ],

            'line-height': [
              SAFE_EMAIL_CSS_VALUE,
            ],

            'letter-spacing': [
              SAFE_EMAIL_CSS_VALUE,
            ],

            width: [
              SAFE_EMAIL_CSS_VALUE,
            ],

            'min-width': [
              SAFE_EMAIL_CSS_VALUE,
            ],

            'max-width': [
              SAFE_EMAIL_CSS_VALUE,
            ],

            height: [
              SAFE_EMAIL_CSS_VALUE,
            ],

            'min-height': [
              SAFE_EMAIL_CSS_VALUE,
            ],

            'max-height': [
              SAFE_EMAIL_CSS_VALUE,
            ],

            margin: [
              SAFE_EMAIL_CSS_VALUE,
            ],

            'margin-top': [
              SAFE_EMAIL_CSS_VALUE,
            ],

            'margin-right': [
              SAFE_EMAIL_CSS_VALUE,
            ],

            'margin-bottom': [
              SAFE_EMAIL_CSS_VALUE,
            ],

            'margin-left': [
              SAFE_EMAIL_CSS_VALUE,
            ],

            padding: [
              SAFE_EMAIL_CSS_VALUE,
            ],

            'padding-top': [
              SAFE_EMAIL_CSS_VALUE,
            ],

            'padding-right': [
              SAFE_EMAIL_CSS_VALUE,
            ],

            'padding-bottom': [
              SAFE_EMAIL_CSS_VALUE,
            ],

            'padding-left': [
              SAFE_EMAIL_CSS_VALUE,
            ],

            border: [
              SAFE_EMAIL_CSS_VALUE,
            ],

            'border-top': [
              SAFE_EMAIL_CSS_VALUE,
            ],

            'border-right': [
              SAFE_EMAIL_CSS_VALUE,
            ],

            'border-bottom': [
              SAFE_EMAIL_CSS_VALUE,
            ],

            'border-left': [
              SAFE_EMAIL_CSS_VALUE,
            ],

            'border-collapse': [
              SAFE_EMAIL_CSS_VALUE,
            ],

            'border-spacing': [
              SAFE_EMAIL_CSS_VALUE,
            ],

            'border-radius': [
              SAFE_EMAIL_CSS_VALUE,
            ],

            display: [
              SAFE_EMAIL_CSS_VALUE,
            ],

            'vertical-align': [
              SAFE_EMAIL_CSS_VALUE,
            ],

            'white-space': [
              SAFE_EMAIL_CSS_VALUE,
            ],

            'word-break': [
              SAFE_EMAIL_CSS_VALUE,
            ],

            'overflow-wrap': [
              SAFE_EMAIL_CSS_VALUE,
            ],
          },
        },

        transformTags: {
          a: (
            tagName,
            attributes,
          ) => ({
            tagName,

            attribs: {
              ...attributes,
              target: '_blank',
              rel:
                'noopener noreferrer nofollow',
            },
          }),

          img: (
            tagName,
            attributes,
          ) => {
            const nextAttributes = {
              ...attributes,
            };

            const source =
              attributes.src?.trim() ||
              '';

            if (
              source
                .toLowerCase()
                .startsWith('cid:')
            ) {
              const contentId =
                normalizeContentId(
                  source.slice(4),
                );

              const internalUrl =
                inlineImages.get(
                  contentId,
                );

              if (internalUrl) {
                nextAttributes.src =
                  internalUrl;
              } else {
                delete nextAttributes.src;
              }

              return {
                tagName,
                attribs:
                  nextAttributes,
              };
            }

            if (
              /^https?:\/\//i.test(
                source,
              )
            ) {
              if (
                !allowExternalImages
              ) {
                hasBlockedExternalImages =
                  true;

                delete nextAttributes.src;

                nextAttributes[
                  'data-blocked-external-image'
                ] = 'true';
              }

              return {
                tagName,
                attribs:
                  nextAttributes,
              };
            }

            /*
             * Reject data:, javascript:,
             * protocol-relative and unknown sources.
             */
            delete nextAttributes.src;

            return {
              tagName,
              attribs:
                nextAttributes,
            };
          },
        },
      },
    );

  return {
    html,
    hasBlockedExternalImages,
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
            'outlook.body-content-type="html"',
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

const rawBody =
  graphMessage.body?.content?.trim() ||
  '';

const bodyContentType:
  | 'html'
  | 'text' =
  graphMessage.body?.contentType
    ?.toLowerCase() === 'html'
    ? 'html'
    : 'text';

/*
 * Microsoft does not count inline-only
 * images in hasAttachments, so CID
 * references must also be detected.
 */
const bodyContainsInlineImages =
  bodyContentType === 'html' &&
  /<img\b[^>]*\bsrc\s*=\s*["']?cid:/i.test(
    rawBody,
  );

let mappedAttachments:
  EmailAttachmentData[] = [];

if (
  graphMessage.hasAttachments ||
  bodyContainsInlineImages
) {
  const attachmentsUrl =
    new URL(
      `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(
        messageId,
      )}/attachments`,
    );

  attachmentsUrl.searchParams.set(
    '$select',
    [
      'id',
      'name',
      'contentType',
      'size',
      'isInline',
    ].join(','),
  );

  const attachmentsResponse =
    await fetch(
      attachmentsUrl,
      {
        method: 'GET',

        headers: {
          Authorization:
            `Bearer ${accessToken}`,

          Accept:
            'application/json',
        },

        cache: 'no-store',
      },
    );

  if (attachmentsResponse.ok) {
    const attachmentsData =
      (await attachmentsResponse.json()) as
        GraphAttachmentsResponse;

    mappedAttachments =
      (
        attachmentsData.value ??
        []
      ).map(
        mapGraphAttachment,
      );
  } else {
    const attachmentsError =
      await attachmentsResponse.text();

    console.error(
      'Microsoft Graph attachments request failed:',
      attachmentsResponse.status,
      attachmentsError,
    );
  }
}

const inlineAttachments =
  mappedAttachments.filter(
    (attachment) =>
      attachment.isInline &&
      attachment.attachmentType ===
        'file' &&
      Boolean(
        attachment.contentId,
      ),
  );

const attachments =
  mappedAttachments.filter(
    (attachment) =>
      !attachment.isInline,
  );

let bodyText =
  rawBody;

let bodyHtml = '';

let bodyHtmlWithExternalImages =
  '';

let hasBlockedExternalImages =
  false;

if (
  bodyContentType === 'html'
) {
  bodyText =
    convertHtmlToText(rawBody);

  const blockedResult =
    sanitizeEmailBodyHtml(
      rawBody,
      messageId,
      inlineAttachments,
      false,
    );

  const externalImagesResult =
    sanitizeEmailBodyHtml(
      rawBody,
      messageId,
      inlineAttachments,
      true,
    );

  bodyHtml =
    blockedResult.html;

  bodyHtmlWithExternalImages =
    externalImagesResult.html;

  hasBlockedExternalImages =
    blockedResult
      .hasBlockedExternalImages;
}


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
          attachments.length > 0,

        body:
          bodyText,

        bodyContentType,

        bodyHtml,

        bodyHtmlWithExternalImages,

        hasBlockedExternalImages,

        inlineImageCount:
          inlineAttachments.length,

        attachments,
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