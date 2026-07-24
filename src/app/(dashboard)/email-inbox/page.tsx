'use client';

import Link from 'next/link';
import {
  type ChangeEvent,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Archive,
  Cloud,
  Download,
  ExternalLink,
  FileText,
  Forward,
  Inbox,
  Loader2,
  Mail,
  MailOpen,
  Paperclip,
  Plus,
  RefreshCw,
  Reply,
  Search,
  Send,
  SendHorizontal,
  Settings,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useCan } from '@/hooks/use-can';


type EmailFolder =
  | 'inbox'
  | 'sent'
  | 'drafts'
  | 'archived';


interface EmailMessage {
  id: string;
  folder: EmailFolder;
  subject: string;
  fromName: string;
  fromAddress: string;
  receivedDateTime: string | null;
  isRead: boolean;
  hasAttachments: boolean;
  preview: string;
}

interface EmailMessagesResponse {
  folder: EmailFolder;
  messages: EmailMessage[];
  count: number;
  synchronizedAt: string;
  hasMore: boolean;
  error?: string;
}
interface EmailRecipient {
  name: string;
  address: string;
}

interface EmailAttachment {
  id: string;
  name: string;
  contentType: string;
  size: number;
  isInline: boolean;

  attachmentType:
    | 'file'
    | 'item'
    | 'reference'
    | 'unknown';

  downloadable: boolean;
}


interface EmailCloudLink {
  name: string;
  url: string;
}

interface EmailExternalLink {
  label: string;
  url: string;
  hostname: string;
}

interface EmailMessageDetail
  extends EmailMessage {
  toRecipients: EmailRecipient[];
  ccRecipients: EmailRecipient[];
  sentDateTime: string | null;

  body: string;

  bodyContentType:
    | 'text'
    | 'html';

  bodyHtml: string;

  bodyHtmlWithExternalImages:
    string;

  hasBlockedExternalImages:
    boolean;

  inlineImageCount: number;

  attachments: EmailAttachment[];
}

interface EmailMessageDetailResponse {
  message?: EmailMessageDetail;
  error?: string;
}

function formatEmailDate(
  value: string | null,
): string {
  if (!value) {
    return '';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const today = new Date();

  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();

  if (sameDay) {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  }

  const sameYear =
    date.getFullYear() === today.getFullYear();

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear
      ? {}
      : {
          year: 'numeric',
        }),
  }).format(date);
}

function formatFullDate(
  value: string | null,
): string {
  if (!value) {
    return '';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}
function formatRecipients(
  recipients: EmailRecipient[],
): string {
  return recipients
    .map((recipient) => {
      if (
        recipient.name &&
        recipient.address &&
        recipient.name !==
          recipient.address
      ) {
        return `${recipient.name} <${recipient.address}>`;
      }

      return (
        recipient.address ||
        recipient.name
      );
    })
    .filter(Boolean)
    .join(', ');
}
function splitEmailAddresses(
  value: string,
): string[] {
  return value
    .split(/[;,]/)
    .map((address) =>
      address.trim(),
    )
    .filter(Boolean);
}
function formatFileSize(
  bytes: number,
): string {
  if (
    !Number.isFinite(bytes) ||
    bytes <= 0
  ) {
    return 'Unknown size';
  }

  const units = [
    'B',
    'KB',
    'MB',
    'GB',
  ];

  const unitIndex =
    Math.min(
      Math.floor(
        Math.log(bytes) /
          Math.log(1024),
      ),
      units.length - 1,
    );

  const value =
    bytes /
    1024 ** unitIndex;

  return `${value.toFixed(
    unitIndex === 0 ||
      value >= 10
      ? 0
      : 1,
  )} ${units[unitIndex]}`;
}


function createEmailHtmlDocument(
  bodyHtml: string,
  allowExternalImages: boolean,
): string {
  const imagePolicy =
    allowExternalImages
      ? "img-src 'self' data: https: http:;"
      : "img-src 'self' data:;";

  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />

        <meta
          name="viewport"
          content="width=device-width, initial-scale=1"
        />

        <meta
          name="referrer"
          content="no-referrer"
        />

        <meta
          http-equiv="Content-Security-Policy"
          content="
            default-src 'none';
            ${imagePolicy}
            style-src 'unsafe-inline';
            font-src 'none';
            media-src 'none';
            object-src 'none';
            frame-src 'none';
            connect-src 'none';
            form-action 'none';
                       font-src 'none';
            media-src 'none';
            object base-uri 'none';
          "
        />

        <style>
          html {
            color-scheme: light;
            background: #ffffff;
          }

          body {
            margin: 0;
            padding: 18px;
            background: #ffffff;
            color: #111827;
            font-family:
              Arial,
              Helvetica,
              sans-serif;
            font-size: 14px;
            line-height: 1.6;
            overflow-wrap: anywhere;
          }

          img {
            max-width: 100%;
            height: auto;
          }

          table {
            max-width: 100%;
          }

          a {
            color: #2563eb;
          }

          pre {
            white-space: pre-wrap;
            overflow-wrap: anywhere;
          }
        </style>
      </head>

      <body>
        ${bodyHtml}
      </body>
    </html>
  `;
}


function isMicrosoftCloudFileUrl(
  value: string,
): boolean {
  try {
    const url = new URL(value);

    if (url.protocol !== 'https:') {
      return false;
    }

    const hostname =
      url.hostname.toLowerCase();

    return (
      hostname === '1drv.ms' ||
      hostname === 'onedrive.live.com' ||
      hostname.endsWith(
        '.sharepoint.com',
      )
    );
  } catch {
    return false;
  }
}

function isSafeHttpUrl(
  value: string,
): boolean {
  try {
    const url = new URL(value);

    return (
      url.protocol === 'https:' ||
      url.protocol === 'http:'
    );
  } catch {
    return false;
  }
}

function getLinkHostname(
  value: string,
): string {
  try {
    return new URL(value)
      .hostname
      .replace(/^www\./i, '');
  } catch {
    return '';
  }
}

function formatExternalLinkLabel(
  value: string,
  url: string,
): string {
  const cleanedLabel =
    value
      .replace(/[\[\]]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

  const knownLabels:
    Record<string, string> = {
      facebook: 'Facebook',
      youtube: 'YouTube',
      tiktok: 'TikTok',
      instagram: 'Instagram',
      website: 'Website',
    };

  if (cleanedLabel) {
    return (
      knownLabels[
        cleanedLabel.toLowerCase()
      ] ?? cleanedLabel
    );
  }

  return (
    getLinkHostname(url) ||
    'Open link'
  );
}


 

function extractMessageContent(
  value: string,
): {
  cleanBody: string;
  cloudLinks: EmailCloudLink[];
  externalLinks: EmailExternalLink[];
} {
  const cloudLinks:
    EmailCloudLink[] = [];

  const externalLinks:
    EmailExternalLink[] = [];

  const registeredCloudUrls =
    new Set<string>();

  const registeredExternalUrls =
    new Set<string>();

  function registerCloudLink(
    name: string,
    url: string,
  ) {
    const normalizedUrl =
      url.trim();

    if (
      !isMicrosoftCloudFileUrl(
        normalizedUrl,
      ) ||
      registeredCloudUrls.has(
        normalizedUrl,
      )
    ) {
      return;
    }

    registeredCloudUrls.add(
      normalizedUrl,
    );

    cloudLinks.push({
      name:
        name
          .replace(/\s+/g, ' ')
          .trim() ||
        'Shared file',

      url:
        normalizedUrl,
    });
  }

  function registerExternalLink(
    label: string,
    url: string,
  ) {
    const normalizedUrl =
      url.trim();

    if (
      !isSafeHttpUrl(
        normalizedUrl,
      ) ||
      isMicrosoftCloudFileUrl(
        normalizedUrl,
      ) ||
      registeredExternalUrls.has(
        normalizedUrl,
      )
    ) {
      return;
    }

    registeredExternalUrls.add(
      normalizedUrl,
    );

    externalLinks.push({
      label:
        formatExternalLinkLabel(
          label,
          normalizedUrl,
        ),

      url:
        normalizedUrl,

      hostname:
        getLinkHostname(
          normalizedUrl,
        ),
    });
  }

  /*
   * Formato de archivos compartidos:
   *
   * [URL_ICONO]archivo.pdf<URL_ONEDRIVE>
   */
  const outlookCloudPattern =
    /\[(?:https?:\/\/[^\]\r\n]+)\]([^<\r\n]{1,240})<(https?:\/\/[^>\r\n]+)>/gi;

  let cleanBody =
    value.replace(
      outlookCloudPattern,
      (
        completeMatch,
        name: string,
        url: string,
      ) => {
        if (
          !isMicrosoftCloudFileUrl(
            url.trim(),
          )
        ) {
          return completeMatch;
        }

        registerCloudLink(
          name,
          url,
        );

        return '';
      },
    );

  /*
   * archivo.pdf<URL_ONEDRIVE>
   */
  const plainCloudPattern =
    /^\s*([^<\r\n]{1,240}?)\s*<(https?:\/\/[^>\r\n]+)>\s*$/gim;

  cleanBody =
    cleanBody.replace(
      plainCloudPattern,
      (
        completeMatch,
        name: string,
        url: string,
      ) => {
        if (
          !isMicrosoftCloudFileUrl(
            url.trim(),
          )
        ) {
          return completeMatch;
        }

        registerCloudLink(
          name,
          url,
        );

        return '';
      },
    );

  /*
   * [archivo.pdf](URL_ONEDRIVE)
   */
  const markdownCloudPattern =
    /\[([^\]\r\n]{1,240})\]\((https?:\/\/[^)\r\n]+)\)/gi;

  cleanBody =
    cleanBody.replace(
      markdownCloudPattern,
      (
        completeMatch,
        name: string,
        url: string,
      ) => {
        if (
          !isMicrosoftCloudFileUrl(
            url.trim(),
          )
        ) {
          return completeMatch;
        }

        registerCloudLink(
          name,
          url,
        );

        return '';
      },
    );

  /*
   * Enlaces sociales:
   *
   * [facebook]<URL>
   * [youtube]<URL>
   */
  const labeledExternalPattern =
    /\[([^\]\r\n]{1,80})\]\s*<(https?:\/\/[^>\r\n]+)>/gi;

  cleanBody =
    cleanBody.replace(
      labeledExternalPattern,
      (
        completeMatch,
        label: string,
        url: string,
      ) => {
        if (
          !isSafeHttpUrl(
            url.trim(),
          )
        ) {
          return completeMatch;
        }

        registerExternalLink(
          label,
          url,
        );

        return '';
      },
    );

  /*
   * Enlaces con texto:
   *
   * www.systempass.us <URL>
   */
  const namedExternalPattern =
    /(^|\n)\s*([^\n<\[\]]{1,120}?)\s*<(https?:\/\/[^>\r\n]+)>\s*(?=\n|$)/gi;

  cleanBody =
    cleanBody.replace(
      namedExternalPattern,
      (
        completeMatch,
        lineStart: string,
        label: string,
        url: string,
      ) => {
        if (
          !isSafeHttpUrl(
            url.trim(),
          )
        ) {
          return completeMatch;
        }

        registerExternalLink(
          label,
          url,
        );

        return lineStart;
      },
    );

  /*
   * Elimina etiquetas vacías generadas
   * por las imágenes de la firma.
   *
   * El teléfono y la dirección que aparecen
   * después de [mobile] y [map] se conservan.
   */
  cleanBody =
    cleanBody.replace(
      /^\s*\[(?:image|mobile|map|facebook|youtube|tiktok|instagram|website)\]\s*$/gim,
      '',
    );

  cleanBody =
    cleanBody
      .replace(
        /[ \t]+\r?\n/g,
        '\n',
      )
      .replace(
        /\n{3,}/g,
        '\n\n',
      )
      .trim();

  return {
    cleanBody,
    cloudLinks,
    externalLinks,
  };
}

  /*
   * Detecta el formato que devuelve Outlook:
   *
   * [URL_DEL_ICONO]archivo.pdf<URL_ONEDRIVE>
   */

const COMPOSE_MAX_FILES = 5;

const COMPOSE_MAX_FILE_BYTES =
  2_900_000;

const COMPOSE_MAX_TOTAL_BYTES =
  12_000_000;



export default function EmailInboxPage() {

  const canSendMessages =
  useCan('send-messages');
  const [
  activeFolder,
  setActiveFolder,
  ] = useState<EmailFolder>('inbox');


  const [messages, setMessages] =
    useState<EmailMessage[]>([]);

  const [selectedMessageId, setSelectedMessageId] =
    useState<string | null>(null);


  const [
  selectedMessageDetail,
  setSelectedMessageDetail,
] =
  useState<EmailMessageDetail | null>(
    null,
  );

  const [
  showExternalImages,
  setShowExternalImages,
] = useState(false);




const [
  loadingMessage,
  setLoadingMessage,
] = useState(false);


const [
  allowExternalEmailImages,
  setAllowExternalEmailImages,
] = useState(false);


const [
  emailFrameHeight,
  setEmailFrameHeight,
] = useState(560);

const emailFrameObserverRef =
  useRef<ResizeObserver | null>(
    null,
  );


const [
  messageError,
  setMessageError,
] =
  useState<string | null>(null);

  const [
  replyOpen,
  setReplyOpen,
] = useState(false);

const [
  replyText,
  setReplyText,
] = useState('');

const [
  sendingReply,
  setSendingReply,
] = useState(false);

const [
  forwardOpen,
  setForwardOpen,
] = useState(false);

const [
  forwardTo,
  setForwardTo,
] = useState('');

const [
  forwardComment,
  setForwardComment,
] = useState('');

const [
  forwardingMessage,
  setForwardingMessage,
] = useState(false);

const [
  movingMessage,
  setMovingMessage,
] = useState(false);


const [
  composeOpen,
  setComposeOpen,
] = useState(false);

const [
  composeTo,
  setComposeTo,
] = useState('');

const [
  composeCc,
  setComposeCc,
] = useState('');

const [
  composeSubject,
  setComposeSubject,
] = useState('');

const [
  composeBody,
  setComposeBody,
] = useState('');


const [
  composeFiles,
  setComposeFiles,
] = useState<File[]>([]);




const [
  sendingMessage,
  setSendingMessage,
] = useState(false);

  

  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] =
    useState(false);

  const [error, setError] =
    useState<string | null>(null);

  const [synchronizedAt, setSynchronizedAt] =
    useState<string | null>(null);

  const [hasMore, setHasMore] =
    useState(false);

  const loadMessages = useCallback(
  async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError(null);

    try {
      const response = await fetch(
        `/api/email/messages?folder=${activeFolder}`,
        {
          method: 'GET',
          cache: 'no-store',
        },
      );

      const payload =
        (await response.json()) as
          EmailMessagesResponse;

      if (!response.ok) {
        throw new Error(
          payload.error ||
          (
            activeFolder === 'sent'
              ? 'Could not load Microsoft Sent Items.'
              : activeFolder === 'drafts'
                ? 'Could not load Microsoft Drafts.'
                : activeFolder === 'archived'
                  ? 'Could not load Microsoft Archive.'
                  : 'Could not load the Microsoft Inbox.'
          ),
        );
      }

      const nextMessages =
        Array.isArray(payload.messages)
          ? payload.messages
          : [];

      setMessages(nextMessages);

      setSynchronizedAt(
        payload.synchronizedAt ?? null,
      );

      setHasMore(
        Boolean(payload.hasMore),
      );

      setSelectedMessageId(
        (currentId) => {
          const currentStillExists =
            nextMessages.some(
              (message) =>
                message.id === currentId,
            );

          if (currentStillExists) {
            return currentId;
          }

          return null;
        },
      );
    } catch (loadError) {
      console.error(
        `Failed to load ${activeFolder} emails:`,
        loadError,
      );

      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Could not load emails.',
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  },
  [activeFolder],
);

  useEffect(() => {
    setSearch('');
    setSelectedMessageId(null);
    setSelectedMessageDetail(null);
    setMessageError(null);

    setReplyOpen(false);
    setReplyText('');

    setForwardOpen(false);
    setForwardTo('');
    setForwardComment('');
  }, [activeFolder]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);


  useEffect(() => {
  if (!selectedMessageId) {
    setSelectedMessageDetail(null);
    setMessageError(null);
    return;
  }

  const controller =
    new AbortController();

  async function loadMessageDetail() {
    setLoadingMessage(true);
    setMessageError(null);
    setSelectedMessageDetail(null);

    try {
      const response = await fetch(
        `/api/email/message?id=${encodeURIComponent(
          selectedMessageId!,
        )}`,
        {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal,
        },
      );

      const payload =
        (await response.json()) as
          EmailMessageDetailResponse;

      if (!response.ok || !payload.message) {
        throw new Error(
          payload.error ||
            'Could not load the selected email.',
        );
      }

      setSelectedMessageDetail(
        payload.message,
      );

      if (activeFolder === 'inbox' &&!payload.message.isRead) {
        const readResponse =
          await fetch(
            '/api/email/message',
            {
              method: 'PATCH',

              headers: {
                'Content-Type':
                  'application/json',
              },

              body: JSON.stringify({
                id:
                  payload.message.id,

                isRead: true,
              }),

              signal:
                controller.signal,
            },
          );

        if (readResponse.ok) {
          setMessages(
            (currentMessages) =>
              currentMessages.map(
                (message) =>
                  message.id ===
                  payload.message?.id
                    ? {
                        ...message,
                        isRead: true,
                      }
                    : message,
              ),
          );

          setSelectedMessageDetail(
            (currentMessage) =>
              currentMessage
                ? {
                    ...currentMessage,
                    isRead: true,
                  }
                : currentMessage,
          );
        } else {
          console.error(
            'The email was loaded but could not be marked as read.',
          );
        }
      }
    } catch (detailError) {
      if (
        detailError instanceof Error &&
        detailError.name ===
          'AbortError'
      ) {
        return;
      }

      console.error(
        'Failed to load the selected email:',
        detailError,
      );

      setMessageError(
        detailError instanceof Error
          ? detailError.message
          : 'Could not load the selected email.',
      );
    } finally {
      if (!controller.signal.aborted) {
        setLoadingMessage(false);
      }
    }
  }

  void loadMessageDetail();

  return () => {
    controller.abort();
  };
}, [selectedMessageId, activeFolder]);



useEffect(() => {
  setReplyOpen(false);
  setReplyText('');

  setForwardOpen(false);
  setForwardTo('');
  setForwardComment('');

  setAllowExternalEmailImages(false);
  setEmailFrameHeight(560);

  emailFrameObserverRef.current
    ?.disconnect();

  emailFrameObserverRef.current =
    null;

  return () => {
    emailFrameObserverRef.current
      ?.disconnect();

    emailFrameObserverRef.current =
      null;
  };
}, [selectedMessageId]);







  const filteredMessages =
    useMemo(() => {
      const normalizedSearch =
        search.trim().toLowerCase();

      if (!normalizedSearch) {
        return messages;
      }

      return messages.filter(
        (message) => {
          const searchableText = [
            message.subject,
            message.fromName,
            message.fromAddress,
            message.preview,
          ]
            .join(' ')
            .toLowerCase();

          return searchableText.includes(
            normalizedSearch,
          );
        },
      );
    }, [messages, search]);

  const selectedMessage =
    messages.find(
      (message) =>
        message.id === selectedMessageId,
    ) ?? null;






  const selectedMessageBody =
  selectedMessageDetail?.body ||
  selectedMessage?.preview ||
  '';

  const displayedMessageContent =
  useMemo(
    () =>
      extractMessageContent(
        selectedMessageBody,
      ),
    [selectedMessageBody],
  );



  const emailHtmlDocument =
  useMemo(() => {
    if (
      selectedMessageDetail
        ?.bodyContentType !== 'html'
    ) {
      return '';
    }

    const selectedHtml =
      allowExternalEmailImages
        ? selectedMessageDetail
            .bodyHtmlWithExternalImages
        : selectedMessageDetail
            .bodyHtml;

    if (!selectedHtml?.trim()) {
      return '';
    }

    return createEmailHtmlDocument(
      selectedHtml,
      allowExternalEmailImages,
    );
  }, [
    selectedMessageDetail,
    allowExternalEmailImages,
  ]);




  function handleEmailFrameLoad(
  event:
    SyntheticEvent<HTMLIFrameElement>,
) {
  const iframe =
    event.currentTarget;

  emailFrameObserverRef.current
    ?.disconnect();

  const frameDocument =
    iframe.contentDocument;

  if (!frameDocument) {
    return;
  }

  /*
   * Guardamos referencias no nulas para
   * utilizarlas dentro de la función interna.
   */
  const documentElement =
    frameDocument.documentElement;

  const frameBody =
    frameDocument.body;

  function updateFrameHeight() {
    const documentHeight =
      Math.max(
        documentElement.scrollHeight,

        frameBody?.scrollHeight ??
          0,

        documentElement.offsetHeight,

        frameBody?.offsetHeight ??
          0,
      );

    const nextHeight =
      Math.min(
        7000,
        Math.max(
          360,
          Math.ceil(
            documentHeight,
          ) + 4,
        ),
      );

    setEmailFrameHeight(
      nextHeight,
    );
  }

  updateFrameHeight();

  if (
    typeof ResizeObserver !==
    'undefined'
  ) {
    const observer =
      new ResizeObserver(() => {
        updateFrameHeight();
      });

    observer.observe(
      documentElement,
    );

    if (frameBody) {
      observer.observe(
        frameBody,
      );
    }

    emailFrameObserverRef.current =
      observer;
  }

  Array.from(
    frameDocument.images,
  ).forEach((image) => {
    if (image.complete) {
      return;
    }

    image.addEventListener(
      'load',
      updateFrameHeight,
      {
        once: true,
      },
    );

    image.addEventListener(
      'error',
      updateFrameHeight,
      {
        once: true,
      },
    );
  });
}



  



  const hasHtmlMessageBody =
  selectedMessageDetail
    ?.bodyContentType === 'html' &&
  Boolean(
    selectedMessageDetail.bodyHtml,
  );

  const selectedMessageHtml =
  showExternalImages
    ? selectedMessageDetail
        ?.bodyHtmlWithExternalImages ||
      selectedMessageDetail
        ?.bodyHtml ||
      ''
    : selectedMessageDetail
        ?.bodyHtml ||
      '';


async function handleSendReply() {
  if (activeFolder !== 'inbox') {
  toast.error(
    'Replies can only be sent from the Inbox.',
  );return;}


  if (!canSendMessages) {
    toast.error(
      'You do not have permission to send emails.',
    );

    return;
  }

  if (
    !selectedMessageId ||
    !selectedMessageDetail
  ) {
    toast.error(
      'Select an email before replying.',
    );

    return;
  }

  const normalizedReply =
    replyText.trim();

  if (!normalizedReply) {
    toast.error(
      'Write a message before sending.',
    );

    return;
  }

  setSendingReply(true);

  try {
    const response =
      await fetch(
        '/api/email/reply',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',
          },

          body: JSON.stringify({
            id:
              selectedMessageId,

            comment:
              normalizedReply,
          }),
        },
      );

    const payload =
      (await response.json()) as {
        success?: boolean;
        error?: string;
      };

    if (
      !response.ok ||
      !payload.success
    ) {
      throw new Error(
        payload.error ||
          'Could not send the reply.',
      );
    }

    setReplyText('');
    setReplyOpen(false);

    toast.success(
      'Reply sent successfully.',
    );
  } catch (replyError) {
    console.error(
      'Failed to send email reply:',
      replyError,
    );

    toast.error(
      replyError instanceof Error
        ? replyError.message
        : 'Could not send the reply.',
    );
  } finally {
    setSendingReply(false);
  }
}

function closeForward() {
  if (forwardingMessage) {
    return;
  }

  setForwardOpen(false);
  setForwardTo('');
  setForwardComment('');
}

async function handleForwardMessage() {
  if (!canSendMessages) {
    toast.error(
      'You do not have permission to forward emails.',
    );

    return;
  }

  if (
    !selectedMessageId ||
    !selectedMessageDetail
  ) {
    toast.error(
      'Select an email before forwarding.',
    );

    return;
  }

  const recipients =
    splitEmailAddresses(
      forwardTo,
    );

  if (recipients.length === 0) {
    toast.error(
      'Add at least one recipient.',
    );

    return;
  }

  setForwardingMessage(true);

  try {
    const response =
      await fetch(
        '/api/email/forward',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',
          },

          body: JSON.stringify({
            id:
              selectedMessageId,

            to:
              recipients,

            comment:
              forwardComment.trim(),
          }),
        },
      );

    const payload =
      (await response.json()) as {
        success?: boolean;
        error?: string;
      };

    if (
      !response.ok ||
      !payload.success
    ) {
      throw new Error(
        payload.error ||
          'Could not forward the email.',
      );
    }

    setForwardOpen(false);
    setForwardTo('');
    setForwardComment('');

    toast.success(
      'Email forwarded successfully.',
    );

    if (activeFolder === 'sent') {
      await loadMessages(true);
    }
  } catch (forwardError) {
    console.error(
      'Failed to forward email:',
      forwardError,
    );

    toast.error(
      forwardError instanceof Error
        ? forwardError.message
        : 'Could not forward the email.',
    );
  } finally {
    setForwardingMessage(false);
  }
}


async function handleMoveSelectedMessage() {
  if (
    !selectedMessageId ||
    !selectedMessageDetail
  ) {
    toast.error(
      'Select an email before moving it.',
    );

    return;
  }

  if (
    activeFolder !== 'inbox' &&
    activeFolder !== 'archived'
  ) {
    return;
  }

  const destination:
    | 'archive'
    | 'inbox' =
    activeFolder === 'inbox'
      ? 'archive'
      : 'inbox';

  setMovingMessage(true);

  try {
    const response =
      await fetch(
        '/api/email/move',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',
          },

          body: JSON.stringify({
            id:
              selectedMessageId,

            destination,
          }),
        },
      );

    const payload =
      (await response.json()) as {
        success?: boolean;
        message?: string;
        error?: string;
      };

    if (
      !response.ok ||
      !payload.success
    ) {
      throw new Error(
        payload.error ||
          (
            destination === 'archive'
              ? 'Could not archive the email.'
              : 'Could not restore the email.'
          ),
      );
    }

    setReplyOpen(false);
    setReplyText('');

    setForwardOpen(false);
    setForwardTo('');
    setForwardComment('');

    setSelectedMessageId(null);
    setSelectedMessageDetail(null);
    setMessageError(null);

    toast.success(
      payload.message ||
        (
          destination === 'archive'
            ? 'Email archived successfully.'
            : 'Email restored to the Inbox.'
        ),
    );

    await loadMessages(true);
  } catch (moveError) {
    console.error(
      'Failed to move email:',
      moveError,
    );

    toast.error(
      moveError instanceof Error
        ? moveError.message
        : 'Could not move the email.',
    );
  } finally {
    setMovingMessage(false);
  }
}




function resetComposeForm() {
  setComposeTo('');
  setComposeCc('');
  setComposeSubject('');
  setComposeBody('');
  setComposeFiles([]);
}

function closeCompose() {
  if (sendingMessage) {
    return;
  }

  setComposeOpen(false);
  resetComposeForm();
}






function handleComposeFilesSelected(
  event: ChangeEvent<HTMLInputElement>,
) {
  const incomingFiles =
    Array.from(
      event.target.files ?? [],
    );

  /*
   * Permite seleccionar nuevamente el mismo
   * archivo después de quitarlo.
   */
  event.target.value = '';

  if (incomingFiles.length === 0) {
    return;
  }

  const oversizedFile =
    incomingFiles.find(
      (file) =>
        file.size >
        COMPOSE_MAX_FILE_BYTES,
    );

  if (oversizedFile) {
    toast.error(
      `${oversizedFile.name} is larger than 2.9 MB.`,
    );

    return;
  }

  const existingFiles =
    new Set(
      composeFiles.map(
        (file) =>
          `${file.name}:${file.size}:${file.lastModified}`,
      ),
    );

  const uniqueNewFiles =
    incomingFiles.filter(
      (file) => {
        const fileKey =
          `${file.name}:${file.size}:${file.lastModified}`;

        if (existingFiles.has(fileKey)) {
          return false;
        }

        existingFiles.add(fileKey);
        return true;
      },
    );

  const nextFiles = [
    ...composeFiles,
    ...uniqueNewFiles,
  ];

  if (
    nextFiles.length >
    COMPOSE_MAX_FILES
  ) {
    toast.error(
      `A maximum of ${COMPOSE_MAX_FILES} files is allowed.`,
    );

    return;
  }

  const totalBytes =
    nextFiles.reduce(
      (total, file) =>
        total + file.size,
      0,
    );

  if (
    totalBytes >
    COMPOSE_MAX_TOTAL_BYTES
  ) {
    toast.error(
      'The combined attachment size cannot exceed 12 MB.',
    );

    return;
  }

  setComposeFiles(nextFiles);
}

function removeComposeFile(
  fileIndex: number,
) {
  if (sendingMessage) {
    return;
  }

  setComposeFiles(
    (currentFiles) =>
      currentFiles.filter(
        (_, index) =>
          index !== fileIndex,
      ),
  );
}




async function handleSendMessage() {
  if (!canSendMessages) {
    toast.error(
      'You do not have permission to send emails.',
    );

    return;
  }

  const toRecipients =
    splitEmailAddresses(composeTo);

  const ccRecipients =
    splitEmailAddresses(composeCc);

  if (toRecipients.length === 0) {
    toast.error(
      'Add at least one recipient.',
    );

    return;
  }

  if (!composeSubject.trim()) {
    toast.error(
      'Write a subject before sending.',
    );

    return;
  }

  if (!composeBody.trim()) {
    toast.error(
      'Write a message before sending.',
    );

    return;
  }

  setSendingMessage(true);

  try {
    const formData =
      new FormData();

    toRecipients.forEach(
      (address) => {
        formData.append(
          'to',
          address,
        );
      },
    );

    ccRecipients.forEach(
      (address) => {
        formData.append(
          'cc',
          address,
        );
      },
    );

    formData.append(
      'subject',
      composeSubject.trim(),
    );

    formData.append(
      'body',
      composeBody.trim(),
    );

    composeFiles.forEach(
      (file) => {
        formData.append(
          'files',
          file,
          file.name,
        );
      },
    );

    const response =
      await fetch(
        '/api/email/send',
        {
          method: 'POST',
          body: formData,
        },
      );
        

    const payload =
    (await response.json()) as {
      success?: boolean;
      attachmentCount?: number;
      error?: string;
    };

    if (
      !response.ok ||
      !payload.success
    ) {
      throw new Error(
        payload.error ||
          'Could not send the email.',
      );
    }

    setComposeOpen(false);
    resetComposeForm();

    toast.success(
      'Email sent successfully.',
    );

    if (activeFolder === 'sent') {
      await loadMessages(true);
    }
  } catch (sendError) {
    console.error(
      'Failed to send new email:',
      sendError,
    );

    toast.error(
      sendError instanceof Error
        ? sendError.message
        : 'Could not send the email.',
    );
  } finally {
    setSendingMessage(false);
  }
}





  

  const unreadCount =
  activeFolder === 'inbox'
    ? messages.filter(
        (message) => !message.isRead,
      ).length
    : 0;

  const folders = [
  {
    id: 'inbox',
    name: 'Inbox',
    icon: Inbox,
    count: unreadCount,
    enabled: true,
  },
  {
    id: 'sent',
    name: 'Sent',
    icon: Send,
    count: 0,
    enabled: true,
  },
  {
    id: 'drafts',
    name: 'Drafts',
    icon: FileText,
    count: 0,
    enabled: true,
  },
  {
    id: 'archived',
    name: 'Archived',
    icon: Archive,
    count: 0,
    enabled: true,
  },
] as const;

  return (
    <div className="flex min-h-[calc(100vh-8rem)] flex-col gap-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Mail className="size-6 text-primary" />

            <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {activeFolder === 'inbox'
            ? 'Email Inbox'
            : activeFolder === 'sent'
              ? 'Sent Emails'
              : activeFolder === 'drafts'
                ? 'Email Drafts'
                : 'Archived Emails'}
          </h1>
          </div>

          <p className="mt-1 text-sm text-muted-foreground">
          {activeFolder === 'inbox'
            ? 'View and reply to messages received in the company mailbox.'
            : activeFolder === 'sent'
              ? 'View messages sent from the company Microsoft 365 mailbox.'
              : 'View archived messages and restore them to the Inbox.'}
        </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              setComposeOpen(
                (current) => !current,
              )
            }
            disabled={!canSendMessages}
            className="
              inline-flex h-9 items-center
              justify-center gap-2
              rounded-md bg-primary
              px-4 text-sm font-medium
              text-primary-foreground
              transition-colors
              hover:bg-primary/90
              disabled:cursor-not-allowed
              disabled:opacity-50
            "
          >
            <Plus className="size-4" />
            Compose
          </button>
          <button
            type="button"
            onClick={() =>
              void loadMessages(true)
            }
            disabled={refreshing}
            className="
              inline-flex h-9 items-center justify-center gap-2
              rounded-md border border-border
              bg-background px-4
              text-sm font-medium text-foreground
              transition-colors
              hover:bg-muted
              disabled:cursor-not-allowed
              disabled:opacity-50
            "
          >
            {refreshing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}

            Refresh
          </button>

          <Link
            href="/settings?tab=email"
            className="
              inline-flex h-9 items-center justify-center gap-2
              rounded-md border border-border
              bg-background px-4
              text-sm font-medium text-foreground
              transition-colors
              hover:bg-muted
            "
          >
            <Settings className="size-4" />
            Email Settings
          </Link>
        </div>
      </div>

      {composeOpen ? (
  <section
    className="
      rounded-xl border
      border-primary/30
      bg-card p-5
      shadow-sm
    "
  >
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-lg font-semibold text-foreground">
          New email
        </h2>

        <p className="mt-1 text-sm text-muted-foreground">
          Send a new message from the connected
          Microsoft 365 mailbox.
        </p>
      </div>

      <button
        type="button"
        onClick={closeCompose}
        disabled={sendingMessage}
        className="
          inline-flex size-8
          items-center justify-center
          rounded-md text-muted-foreground
          transition-colors
          hover:bg-muted
          hover:text-foreground
          disabled:opacity-50
        "
        aria-label="Close compose"
      >
        <X className="size-4" />
      </button>
    </div>

    <div className="mt-5 grid gap-4">
      <div className="grid gap-2">
        <label
          htmlFor="compose-to"
          className="text-sm font-medium text-foreground"
        >
          To
        </label>

        <input
          id="compose-to"
          type="text"
          value={composeTo}
          onChange={(event) =>
            setComposeTo(
              event.target.value,
            )
          }
          placeholder="customer@example.com"
          disabled={sendingMessage}
          className="
            h-10 w-full rounded-md
            border border-border
            bg-background px-3
            text-sm text-foreground
            outline-none
            placeholder:text-muted-foreground
            focus:border-primary
            focus:ring-2
            focus:ring-primary/20
            disabled:opacity-60
          "
        />

        <p className="text-xs text-muted-foreground">
          Separate multiple addresses with commas
          or semicolons.
        </p>
      </div>

      <div className="grid gap-2">
        <label
          htmlFor="compose-cc"
          className="text-sm font-medium text-foreground"
        >
          Cc
        </label>

        <input
          id="compose-cc"
          type="text"
          value={composeCc}
          onChange={(event) =>
            setComposeCc(
              event.target.value,
            )
          }
          placeholder="Optional"
          disabled={sendingMessage}
          className="
            h-10 w-full rounded-md
            border border-border
            bg-background px-3
            text-sm text-foreground
            outline-none
            placeholder:text-muted-foreground
            focus:border-primary
            focus:ring-2
            focus:ring-primary/20
            disabled:opacity-60
          "
        />
      </div>

      <div className="grid gap-2">
        <label
          htmlFor="compose-subject"
          className="text-sm font-medium text-foreground"
        >
          Subject
        </label>

        <input
          id="compose-subject"
          type="text"
          value={composeSubject}
          onChange={(event) =>
            setComposeSubject(
              event.target.value,
            )
          }
          placeholder="Email subject"
          maxLength={500}
          disabled={sendingMessage}
          className="
            h-10 w-full rounded-md
            border border-border
            bg-background px-3
            text-sm text-foreground
            outline-none
            placeholder:text-muted-foreground
            focus:border-primary
            focus:ring-2
            focus:ring-primary/20
            disabled:opacity-60
          "
        />
      </div>

      <div className="grid gap-2">
        <label
          htmlFor="compose-body"
          className="text-sm font-medium text-foreground"
        >
          Message
        </label>

        <textarea
          id="compose-body"
          value={composeBody}
          onChange={(event) =>
            setComposeBody(
              event.target.value,
            )
          }
          placeholder="Write your email..."
          maxLength={100_000}
          disabled={sendingMessage}
          className="
            min-h-48 w-full resize-y
            rounded-md border
            border-border bg-background
            p-3 text-sm leading-6
            text-foreground outline-none
            placeholder:text-muted-foreground
            focus:border-primary
            focus:ring-2
            focus:ring-primary/20
            disabled:opacity-60
          "
        />
      </div>
    </div>







          <div className="grid gap-2">
        <span className="text-sm font-medium text-foreground">
          Attachments
        </span>

        <div className="flex flex-wrap items-center gap-3">
          <label
            htmlFor="compose-files"
            className="
              inline-flex h-9 cursor-pointer
              items-center justify-center
              gap-2 rounded-md border
              border-border bg-background
              px-4 text-sm font-medium
              text-foreground
              transition-colors
              hover:bg-muted
            "
          >
            <Paperclip className="size-4" />
            Attach files
          </label>

          <input
            id="compose-files"
            type="file"
            multiple
            onChange={
              handleComposeFilesSelected
            }
            disabled={sendingMessage}
            className="sr-only"
          />

          <p className="text-xs text-muted-foreground">
            Up to 5 files, 2.9 MB each.
          </p>
        </div>

        {composeFiles.length > 0 ? (
          <div className="mt-2 grid gap-2">
            {composeFiles.map(
              (file, index) => (
                <div
                  key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
                  className="
                    flex items-center
                    justify-between gap-3
                    rounded-lg border
                    border-border
                    bg-muted/20 p-3
                  "
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className="
                        flex size-9 shrink-0
                        items-center justify-center
                        rounded-md bg-primary/10
                        text-primary
                      "
                    >
                      <Paperclip className="size-4" />
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {file.name}
                      </p>

                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatFileSize(
                          file.size,
                        )}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      removeComposeFile(
                        index,
                      )
                    }
                    disabled={sendingMessage}
                    className="
                      inline-flex size-8
                      shrink-0 items-center
                      justify-center
                      rounded-md
                      text-muted-foreground
                      transition-colors
                      hover:bg-muted
                      hover:text-foreground
                      disabled:opacity-50
                    "
                    aria-label={`Remove ${file.name}`}
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ),
            )}
          </div>
        ) : null}
      </div>


    <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-muted-foreground">
        {composeBody.length.toLocaleString()}
        {' / '}
        100,000 characters
      </p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={closeCompose}
          disabled={sendingMessage}
          className="
            inline-flex h-9
            items-center justify-center
            rounded-md border
            border-border bg-background
            px-4 text-sm font-medium
            text-foreground
            transition-colors
            hover:bg-muted
            disabled:opacity-50
          "
        >
          Cancel
        </button>

        <button
          type="button"
          onClick={() =>
            void handleSendMessage()
          }
          disabled={
            sendingMessage ||
            !composeTo.trim() ||
            !composeSubject.trim() ||
            !composeBody.trim()
          }
          className="
            inline-flex h-9
            items-center justify-center
            gap-2 rounded-md bg-primary
            px-4 text-sm font-medium
            text-primary-foreground
            transition-colors
            hover:bg-primary/90
            disabled:cursor-not-allowed
            disabled:opacity-50
          "
        >
          {sendingMessage ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <SendHorizontal className="size-4" />
          )}

          {sendingMessage
            ? 'Sending...'
            : 'Send email'}
        </button>
      </div>
    </div>
  </section>
) : null}

      <div
        className="
        grid min-h-[650px] flex-1 overflow-hidden
        rounded-xl border border-border bg-card

        lg:h-[calc(100vh-9rem)]
        lg:min-h-0
        lg:flex-none
        lg:grid-cols-[210px_360px_minmax(0,1fr)]
        "
      >
        <aside className="border-b border-border p-3 lg:border-r lg:border-b-0">
          <p className="px-3 pb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Mailbox
          </p>

          <nav className="space-y-1">
            {folders.map((folder) => {
                const Icon = folder.icon;

                const selected =
                  folder.id === activeFolder;

                return (
                <button
                  key={folder.name}
                  type="button"
                  disabled={!folder.enabled}
                  onClick={() => {
                    if (
                      folder.id === 'inbox' ||
                      folder.id === 'sent' ||
                      folder.id === 'drafts' ||
                      folder.id === 'archived'
                    ) {
                      setActiveFolder(folder.id);
                    }
                    }}
                  className={`
                  flex w-full items-center gap-3
                  rounded-lg px-3 py-2
                  text-left text-sm font-medium
                  transition-colors
                  ${
                    selected
                      ? 'bg-primary/10 text-primary'
                      : folder.enabled
                        ? 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        : 'cursor-not-allowed text-muted-foreground opacity-60'
                  }
                `}
                >
                  <Icon className="size-4 shrink-0" />

                  <span className="flex-1">
                    {folder.name}
                  </span>

                  {folder.count > 0 ? (
                    <span
                      className="
                        min-w-5 rounded-full
                        bg-primary px-1.5 py-0.5
                        text-center text-[10px]
                        font-semibold text-primary-foreground
                      "
                    >
                      {folder.count}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>

          <div className="mt-6 rounded-lg border border-border bg-muted/20 p-3">
            <p className="text-sm font-medium text-foreground">
              Microsoft 365 connected
            </p>

            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {synchronizedAt
                ? `Last synchronized ${formatFullDate(
                    synchronizedAt,
                  )}.`
                : 'Waiting for synchronization.'}
            </p>
          </div>
        </aside>

        <section className="min-w-0 border-b border-border lg:border-r lg:border-b-0">
          <div className="border-b border-border p-3">
            <div className="relative">
              <Search
                className="
                  pointer-events-none
                  absolute top-1/2 left-3
                  size-4 -translate-y-1/2
                  text-muted-foreground
                "
              />

              <input
                type="search"
                placeholder={
                  activeFolder === 'inbox'
                    ? 'Search Inbox...'
                    : activeFolder === 'sent'
                      ? 'Search Sent emails...'
                      : activeFolder === 'drafts'
                        ? 'Search Drafts...'
                        : 'Search Archived emails...'
                }
                value={search}
                onChange={(event) =>
                  setSearch(event.target.value)
                }
                className="
                  h-9 w-full rounded-md
                  border border-border
                  bg-background
                  pr-3 pl-9
                  text-sm text-foreground
                  outline-none
                  placeholder:text-muted-foreground
                  focus:border-primary
                  focus:ring-2
                  focus:ring-primary/20
                "
              />
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {filteredMessages.length}{' '}
                {filteredMessages.length === 1
                  ? 'email'
                  : 'emails'}
              </p>

              {hasMore ? (
                <p className="text-xs text-muted-foreground">
                  Showing the latest 25
                </p>
              ) : null}
            </div>
          </div>

          <div className="max-h-[590px] overflow-y-auto">
            {loading ? (
              <div className="flex min-h-[400px] items-center justify-center">
                <div className="text-center">
                  <Loader2 className="mx-auto size-6 animate-spin text-primary" />

                  <p className="mt-3 text-sm text-muted-foreground">
                    {activeFolder === 'inbox'
                    ? 'Loading Microsoft Inbox...'
                    : activeFolder === 'sent'
                      ? 'Loading Microsoft Sent Items...'
                      : activeFolder === 'drafts'
                        ? 'Loading Microsoft Drafts...'
                        : 'Loading Microsoft Archive...'}
                  </p>
                </div>
              </div>
            ) : error ? (
              <div className="flex min-h-[400px] items-center justify-center p-6">
                <div className="max-w-xs text-center">
                  <Mail className="mx-auto size-8 text-muted-foreground" />

                  <p className="mt-3 text-sm font-medium text-foreground">
                    Could not load emails
                  </p>

                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {error}
                  </p>

                  <button
                    type="button"
                    onClick={() =>
                      void loadMessages()
                    }
                    className="
                      mt-4 inline-flex h-9 items-center
                      justify-center gap-2 rounded-md
                      bg-primary px-4 text-sm
                      font-medium text-primary-foreground
                      hover:bg-primary/90
                    "
                  >
                    <RefreshCw className="size-4" />
                    Try again
                  </button>
                </div>
              </div>
            ) : filteredMessages.length === 0 ? (
              <div className="flex min-h-[400px] items-center justify-center p-6">
                <div className="max-w-[260px] text-center">
                  <Inbox className="mx-auto size-8 text-muted-foreground" />

                  <h2 className="mt-4 text-sm font-semibold text-foreground">
                    No emails found
                  </h2>

                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Try another search or refresh the
                    Microsoft Inbox.
                  </p>
                </div>
              </div>
            ) : (
              filteredMessages.map(
                (message) => {
                  const selected =
                    message.id ===
                    selectedMessageId;

                  return (
                    <button
                      key={message.id}
                      type="button"
                      onClick={() =>
                        setSelectedMessageId(
                          message.id,
                        )
                      }
                      className={`
                        block w-full border-b
                        border-border p-4 text-left
                        transition-colors
                        ${
                          selected
                            ? 'bg-primary/10'
                            : 'hover:bg-muted/40'
                        }
                      `}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`
                            mt-0.5 flex size-8 shrink-0
                            items-center justify-center
                            rounded-full
                            ${
                              message.isRead
                                ? 'bg-muted text-muted-foreground'
                                : 'bg-primary/10 text-primary'
                            }
                          `}
                        >
                          {message.isRead ? (
                            <MailOpen className="size-4" />
                          ) : (
                            <Mail className="size-4" />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p
                              className={`
                                truncate text-sm
                                ${
                                  message.isRead
                                    ? 'font-medium text-foreground'
                                    : 'font-bold text-foreground'
                                }
                              `}
                            >
                              {activeFolder === 'sent' ||
                                activeFolder === 'drafts'
                                  ? `To: ${message.fromName}`
                                  : message.fromName}
                            </p>

                            <span className="shrink-0 text-[11px] text-muted-foreground">
                              {formatEmailDate(
                                message.receivedDateTime,
                              )}
                            </span>
                          </div>

                          <div className="mt-1 flex items-center gap-2">
                            <p
                              className={`
                                min-w-0 flex-1 truncate text-sm
                                ${
                                  message.isRead
                                    ? 'text-muted-foreground'
                                    : 'font-semibold text-foreground'
                                }
                              `}
                            >
                              {message.subject}
                            </p>

                            {message.hasAttachments ? (
                              <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
                            ) : null}
                          </div>

                          <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                            {message.preview ||
                              'No preview available.'}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                },
              )
            )}
          </div>
        </section>

        <section
  className="
    hidden min-h-0 min-w-0
    overflow-hidden
    lg:flex lg:flex-col
  "
>
    {selectedMessage ? (
      <>
        <div className="border-b border-border p-6">
          <div className="flex items-start gap-4">
            <div
              className="
                flex size-10 shrink-0
                items-center justify-center
                rounded-full bg-primary/10
                text-primary
              "
            >
              <Mail className="size-5" />
            </div>

            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold text-foreground">
                {selectedMessage.subject}
              </h2>

              <div className="mt-3 flex flex-col gap-1 text-sm">
                <p className="font-medium text-foreground">
                  {selectedMessage.fromName}
                </p>

                <p className="text-muted-foreground">
                  {selectedMessage.fromAddress}
                </p>

                <p className="text-xs text-muted-foreground">
                  {formatFullDate(
                    selectedMessage.receivedDateTime,
                  )}
                </p>
              </div>
            </div>

          <div className="flex shrink-0 items-center gap-2">
  {selectedMessage.hasAttachments ? (
    <div
      className="
        inline-flex items-center gap-1.5
        rounded-md border border-border
        px-2.5 py-1 text-xs
        text-muted-foreground
      "
    >
      <Paperclip className="size-3.5" />
      Attachment
    </div>
  ) : null}




  {activeFolder === 'inbox' ||
    activeFolder === 'archived' ? (
      <button
        type="button"
        onClick={() =>
          void handleMoveSelectedMessage()
        }
        disabled={
          movingMessage ||
          loadingMessage ||
          !selectedMessageDetail
        }
        className="
          inline-flex h-9 items-center
          justify-center gap-2 rounded-md
          border border-border
          bg-background px-3
          text-sm font-medium text-foreground
          transition-colors
          hover:bg-muted
          disabled:cursor-not-allowed
          disabled:opacity-50
        "
      >
        {movingMessage ? (
          <Loader2 className="size-4 animate-spin" />
        ) : activeFolder === 'inbox' ? (
          <Archive className="size-4" />
        ) : (
          <Inbox className="size-4" />
        )}

        {movingMessage
          ? activeFolder === 'inbox'
            ? 'Archiving...'
            : 'Restoring...'
          : activeFolder === 'inbox'
            ? 'Archive'
            : 'Move to Inbox'}
      </button>
    ) : null}

  {activeFolder !== 'drafts' ? (
  <button
    type="button"
    onClick={() => {
      setReplyOpen(false);
      setReplyText('');

      setForwardOpen(true);
    }}
    disabled={
      !canSendMessages ||
      loadingMessage ||
      !selectedMessageDetail
    }
    className="
      inline-flex h-9 items-center
      justify-center gap-2 rounded-md
      border border-border
      bg-background px-3
      text-sm font-medium text-foreground
      transition-colors
      hover:bg-muted
      disabled:cursor-not-allowed
      disabled:opacity-50
    "
  >
    <Forward className="size-4" />
    Forward
  </button>
    ) : null}

  {activeFolder === 'inbox' ? (
  <button
    type="button"
    onClick={() => {
      setForwardOpen(false);
      setForwardTo('');
      setForwardComment('');

      setReplyOpen(true);
    }}
    disabled={
      !canSendMessages ||
      loadingMessage ||
      !selectedMessageDetail
    }
    className="
      inline-flex h-9 items-center
      justify-center gap-2 rounded-md
      border border-border
      bg-background px-3
      text-sm font-medium text-foreground
      transition-colors
      hover:bg-muted
      disabled:cursor-not-allowed
      disabled:opacity-50
    "
  >
    <Reply className="size-4" />
    Reply
  </button>
) : null}
</div>
        </div>
      </div>

      <div
        className="
          min-h-0 flex-1
          overflow-y-auto
          overscroll-contain
          p-6
        "
        >
        {loadingMessage ? (
          <div className="flex min-h-[300px] items-center justify-center">
            <div className="text-center">
              <Loader2 className="mx-auto size-6 animate-spin text-primary" />

              <p className="mt-3 text-sm text-muted-foreground">
                Loading complete email...
              </p>
            </div>
          </div>
        ) : messageError ? (
          <div className="flex min-h-[300px] items-center justify-center">
            <div className="max-w-sm text-center">
              <Mail className="mx-auto size-8 text-muted-foreground" />

              <p className="mt-3 text-sm font-medium text-foreground">
                Could not load this email
              </p>

              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {messageError}
              </p>

              <button
                type="button"
                onClick={() => {
                  const currentId =
                    selectedMessageId;

                  setSelectedMessageId(null);

                  window.setTimeout(() => {
                    setSelectedMessageId(
                      currentId,
                    );
                  }, 0);
                }}
                className="
                  mt-4 inline-flex h-9
                  items-center justify-center
                  gap-2 rounded-md bg-primary
                  px-4 text-sm font-medium
                  text-primary-foreground
                  hover:bg-primary/90
                "
              >
                <RefreshCw className="size-4" />
                Try again
              </button>
            </div>
          </div>
        ) : selectedMessageDetail ? (
          <div className="max-w-4xl">
            <div className="mb-6 space-y-2 rounded-lg border border-border bg-muted/20 p-4">
              <div className="grid gap-1 text-sm sm:grid-cols-[50px_minmax(0,1fr)]">
                <span className="font-medium text-muted-foreground">
                  To:
                </span>

                <span className="break-words text-foreground">
                  {formatRecipients(
                    selectedMessageDetail.toRecipients,
                  ) || 'No recipient information'}
                </span>
              </div>

              {selectedMessageDetail
                .ccRecipients.length > 0 ? (
                <div className="grid gap-1 text-sm sm:grid-cols-[50px_minmax(0,1fr)]">
                  <span className="font-medium text-muted-foreground">
                    Cc:
                  </span>

                  <span className="break-words text-foreground">
                    {formatRecipients(
                      selectedMessageDetail.ccRecipients,
                    )}
                  </span>
                </div>
              ) : null}
            </div>

            {selectedMessageDetail
  .attachments.length > 0 ? (
  <div className="mb-6">
    <div className="mb-3 flex items-center gap-2">
      <Paperclip className="size-4 text-muted-foreground" />

      <h3 className="text-sm font-semibold text-foreground">
        Attachments
      </h3>

      <span className="text-xs text-muted-foreground">
        (
        {
          selectedMessageDetail
            .attachments.length
        }
        )
      </span>
    </div>

    <div className="grid gap-2">
      {selectedMessageDetail
        .attachments.map(
          (attachment) => (
            <div
              key={attachment.id}
              className="
                flex flex-wrap items-center
                justify-between gap-3
                rounded-lg border
                border-border
                bg-muted/20 p-3
              "
            >
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className="
                    flex size-9 shrink-0
                    items-center justify-center
                    rounded-md bg-primary/10
                    text-primary
                  "
                >
                  <Paperclip className="size-4" />
                </div>

                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {attachment.name}
                  </p>

                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatFileSize(
                      attachment.size,
                    )}

                    {attachment.contentType
                      ? ` · ${attachment.contentType}`
                      : ''}
                  </p>
                </div>
              </div>

              {attachment.downloadable ? (
                <a
                  href={`/api/email/attachment?messageId=${encodeURIComponent(
                    selectedMessageDetail.id,
                  )}&attachmentId=${encodeURIComponent(
                    attachment.id,
                  )}`}
                  download={attachment.name}
                  className="
                    inline-flex h-9
                    shrink-0 items-center
                    justify-center gap-2
                    rounded-md border
                    border-border
                    bg-background px-3
                    text-sm font-medium
                    text-foreground
                    transition-colors
                    hover:bg-muted
                  "
                >
                  <Download className="size-4" />
                  Download
                </a>
              ) : (
                <span
                  className="
                    rounded-md border
                    border-border px-3
                    py-2 text-xs
                    text-muted-foreground
                  "
                >
                  Download unavailable
                </span>
              )}
            </div>
          ),
        )}
    </div>
  </div>
) : selectedMessageDetail
    .hasAttachments ? (
  <div
    className="
      mb-6 rounded-lg
      border border-border
      bg-muted/20 p-4
      text-sm text-muted-foreground
    "
  >
    This email contains attachments, but no
    downloadable files were found.
  </div>
) : null}


{forwardOpen ? (
  <div
    className="
      mb-6 rounded-lg
      border border-primary/30
      bg-primary/5 p-4
    "
  >
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-semibold text-foreground">
          Forward email
        </p>

        <p className="mt-1 text-xs text-muted-foreground">
          {selectedMessageDetail.subject}
        </p>
      </div>

      <button
        type="button"
        onClick={closeForward}
        disabled={forwardingMessage}
        className="
          inline-flex size-8
          items-center justify-center
          rounded-md text-muted-foreground
          transition-colors
          hover:bg-muted
          hover:text-foreground
          disabled:opacity-50
        "
        aria-label="Close forward"
      >
        <X className="size-4" />
      </button>
    </div>

    <div className="mt-4 grid gap-2">
      <label
        htmlFor="forward-to"
        className="text-sm font-medium text-foreground"
      >
        To
      </label>

      <input
        id="forward-to"
        type="text"
        value={forwardTo}
        onChange={(event) =>
          setForwardTo(
            event.target.value,
          )
        }
        placeholder="recipient@example.com"
        disabled={forwardingMessage}
        className="
          h-10 w-full rounded-md
          border border-border
          bg-background px-3
          text-sm text-foreground
          outline-none
          placeholder:text-muted-foreground
          focus:border-primary
          focus:ring-2
          focus:ring-primary/20
          disabled:opacity-60
        "
      />

      <p className="text-xs text-muted-foreground">
        Separate multiple addresses with commas
        or semicolons.
      </p>
    </div>

    <div className="mt-4 grid gap-2">
      <label
        htmlFor="forward-comment"
        className="text-sm font-medium text-foreground"
      >
        Comment
      </label>

      <textarea
        id="forward-comment"
        value={forwardComment}
        onChange={(event) =>
          setForwardComment(
            event.target.value,
          )
        }
        placeholder="Optional message..."
        maxLength={50_000}
        disabled={forwardingMessage}
        className="
          min-h-28 w-full resize-y
          rounded-md border
          border-border bg-background
          p-3 text-sm leading-6
          text-foreground outline-none
          placeholder:text-muted-foreground
          focus:border-primary
          focus:ring-2
          focus:ring-primary/20
          disabled:opacity-60
        "
      />
    </div>

    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-muted-foreground">
        {forwardComment.length.toLocaleString()}
        {' / '}
        50,000 characters
      </p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={closeForward}
          disabled={forwardingMessage}
          className="
            inline-flex h-9 items-center
            justify-center rounded-md
            border border-border
            bg-background px-4
            text-sm font-medium
            text-foreground
            transition-colors
            hover:bg-muted
            disabled:opacity-50
          "
        >
          Cancel
        </button>

        <button
          type="button"
          onClick={() =>
            void handleForwardMessage()
          }
          disabled={
            forwardingMessage ||
            !forwardTo.trim()
          }
          className="
            inline-flex h-9 items-center
            justify-center gap-2
            rounded-md bg-primary
            px-4 text-sm font-medium
            text-primary-foreground
            transition-colors
            hover:bg-primary/90
            disabled:cursor-not-allowed
            disabled:opacity-50
          "
        >
          {forwardingMessage ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Forward className="size-4" />
          )}

          {forwardingMessage
            ? 'Forwarding...'
            : 'Forward email'}
        </button>
      </div>
    </div>
  </div>
) : null}


















{activeFolder === 'inbox' && replyOpen ? (
  <div
    className="
      mb-6 rounded-lg
      border border-primary/30
      bg-primary/5 p-4
    "
  >
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-semibold text-foreground">
          Reply to{' '}
          {selectedMessageDetail.fromName}
        </p>

        <p className="mt-1 text-xs text-muted-foreground">
          {selectedMessageDetail.fromAddress}
        </p>
      </div>

      <button
        type="button"
        onClick={() => {
          setReplyOpen(false);
          setReplyText('');
        }}
        disabled={sendingReply}
        className="
          inline-flex size-8
          items-center justify-center
          rounded-md text-muted-foreground
          transition-colors
          hover:bg-muted
          hover:text-foreground
          disabled:opacity-50
        "
        aria-label="Close reply"
      >
        <X className="size-4" />
      </button>
    </div>

    <textarea
      value={replyText}
      onChange={(event) =>
        setReplyText(
          event.target.value,
        )
      }
      placeholder="Write your reply..."
      maxLength={50_000}
      disabled={sendingReply}
      className="
        mt-4 min-h-36 w-full
        resize-y rounded-md
        border border-border
        bg-background p-3
        text-sm leading-6
        text-foreground outline-none
        placeholder:text-muted-foreground
        focus:border-primary
        focus:ring-2
        focus:ring-primary/20
        disabled:cursor-not-allowed
        disabled:opacity-60
      "
    />

    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-muted-foreground">
        {replyText.length.toLocaleString()}
        {' / '}
        50,000 characters
      </p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setReplyOpen(false);
            setReplyText('');
          }}
          disabled={sendingReply}
          className="
            inline-flex h-9 items-center
            justify-center rounded-md
            border border-border
            bg-background px-4
            text-sm font-medium
            text-foreground
            transition-colors
            hover:bg-muted
            disabled:opacity-50
          "
        >
          Cancel
        </button>

        <button
          type="button"
          onClick={() =>
            void handleSendReply()
          }
          disabled={
            sendingReply ||
            !replyText.trim()
          }
          className="
            inline-flex h-9 items-center
            justify-center gap-2
            rounded-md bg-primary
            px-4 text-sm font-medium
            text-primary-foreground
            transition-colors
            hover:bg-primary/90
            disabled:cursor-not-allowed
            disabled:opacity-50
          "
        >
          {sendingReply ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <SendHorizontal className="size-4" />
          )}

          {sendingReply
            ? 'Sending...'
            : 'Send reply'}
        </button>
      </div>
    </div>
  </div>
) : null}

{!hasHtmlMessageBody &&
displayedMessageContent
  .cloudLinks.length > 0 ? (
  <div className="mb-6">
    <div className="mb-3 flex items-center gap-2">
      <Cloud className="size-4 text-muted-foreground" />

      <h3 className="text-sm font-semibold text-foreground">
        Shared files
      </h3>

      <span className="text-xs text-muted-foreground">
        (
        {
          displayedMessageContent
            .cloudLinks.length
        }
        )
      </span>
    </div>

    <div className="grid gap-2">
      {displayedMessageContent
        .cloudLinks.map(
          (cloudLink) => (
            <div
              key={cloudLink.url}
              className="
                flex flex-wrap items-center
                justify-between gap-3
                rounded-lg border
                border-border
                bg-muted/20 p-3
              "
            >
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className="
                    flex size-9 shrink-0
                    items-center justify-center
                    rounded-md bg-primary/10
                    text-primary
                  "
                >
                  <Cloud className="size-4" />
                </div>

                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {cloudLink.name}
                  </p>

                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Shared through OneDrive or
                    SharePoint
                  </p>
                </div>
              </div>

              <a
                href={cloudLink.url}
                target="_blank"
                rel="noopener noreferrer"
                className="
                  inline-flex h-9
                  shrink-0 items-center
                  justify-center gap-2
                  rounded-md border
                  border-border
                  bg-background px-3
                  text-sm font-medium
                  text-foreground
                  transition-colors
                  hover:bg-muted
                "
              >
                <ExternalLink className="size-4" />
                Open shared file
              </a>
            </div>
          ),
        )}
    </div>

    <p className="mt-2 text-xs text-muted-foreground">
      Access depends on the permissions
      configured by the file owner.
    </p>
  </div>
) : null}

{!hasHtmlMessageBody &&
  displayedMessageContent
    .externalLinks.length > 0 ? (
  <div className="mb-6">
    <div className="mb-3 flex items-center gap-2">
      <ExternalLink className="size-4 text-muted-foreground" />

      <h3 className="text-sm font-semibold text-foreground">
        Links
      </h3>

      <span className="text-xs text-muted-foreground">
        (
        {
          displayedMessageContent
            .externalLinks.length
        }
        )
      </span>
    </div>

    <div className="flex flex-wrap gap-2">
      {displayedMessageContent
        .externalLinks.map(
          (link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="
                inline-flex min-w-36
                items-center justify-between
                gap-3 rounded-lg
                border border-border
                bg-muted/20 px-3 py-2
                text-sm text-foreground
                transition-colors
                hover:bg-muted
              "
            >
              <span className="min-w-0">
                <span className="block font-medium">
                  {link.label}
                </span>

                {link.hostname ? (
                  <span className="block max-w-48 truncate text-xs text-muted-foreground">
                    {link.hostname}
                  </span>
                ) : null}
              </span>

              <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
            </a>
          ),
        )}
    </div>
  </div>
) : null}



{hasHtmlMessageBody ? (
  <div className="grid gap-4">
    {selectedMessageDetail
      ?.hasBlockedExternalImages &&
    !showExternalImages ? (
      <div
        className="
          flex flex-col gap-3
          rounded-lg border
          border-amber-500/30
          bg-amber-500/10 p-4
          sm:flex-row
          sm:items-center
          sm:justify-between
        "
      >
        <div>
          <p className="text-sm font-medium text-foreground">
            External images were blocked
          </p>

          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Loading them may notify the sender that you opened this email.
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            setShowExternalImages(
              true,
            )
          }
          className="
            inline-flex h-9
            shrink-0 items-center
            justify-center gap-2
            rounded-md border
            border-border
            bg-background px-4
            text-sm font-medium
            text-foreground
            transition-colors
            hover:bg-muted
          "
        >
          <ExternalLink className="size-4" />
          Load images
        </button>
      </div>
    ) : null}

    <div
  className="
    max-w-full overflow-x-auto
    rounded-lg border
    border-border
    bg-card
  "
>
      <div
      className="
      min-w-0 p-4
      text-foreground

      [&_*]:text-inherit

      [&_a]:!text-foreground
      dark:[&_a]:!text-white
      [&_a]:break-words
      [&_a]:underline-offset-4
      hover:[&_a]:underline

      [&_img]:h-auto
      [&_img]:max-w-full

      [&_table]:max-w-full
      [&_table]:text-inherit

      [&_td]:border-border
      [&_th]:border-border
      [&_hr]:border-border
      "
      dangerouslySetInnerHTML={{
        __html: selectedMessageHtml,
      }}
    />
    </div>
  </div>
) : emailHtmlDocument ? (
  <div className="space-y-3">
    {selectedMessageDetail
      ?.hasBlockedExternalImages ? (
      <div
        className="
          flex flex-col gap-3
          rounded-lg border
          border-amber-300
          bg-amber-50 p-3
          text-sm text-amber-950
          sm:flex-row
          sm:items-center
          sm:justify-between
        "
      >
        <div>
          <p className="font-medium">
            External images are blocked
          </p>

          <p className="mt-0.5 text-xs leading-relaxed">
            Loading them may notify the
            sender that you opened this
            email.
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            setAllowExternalEmailImages(
              (current) => !current,
            )
          }
          className="
            inline-flex h-9 shrink-0
            items-center justify-center
            rounded-md border
            border-amber-400
            bg-white px-3
            text-sm font-medium
            text-amber-950
            transition-colors
            hover:bg-amber-100
          "
        >
          {allowExternalEmailImages
            ? 'Hide external images'
            : 'Load external images'}
        </button>
      </div>
    ) : null}

    <iframe
      key={`${selectedMessageId}-${allowExternalEmailImages}`}
      title={
        selectedMessageDetail?.subject
          ? `Email: ${selectedMessageDetail.subject}`
          : 'Email content'
      }
      srcDoc={emailHtmlDocument}
      sandbox="
        allow-same-origin
        allow-popups
        allow-popups-to-escape-sandbox
      "
      referrerPolicy="no-referrer"
      onLoad={handleEmailFrameLoad}
      style={{
        height:
          `${emailFrameHeight}px`,
      }}
      className="
        w-full rounded-lg
        border border-border
        bg-white
        transition-[height]
        duration-200
      "
    />
  </div>
) : displayedMessageContent
    .cleanBody ? (
  <div
    className="
      whitespace-pre-wrap
      break-words
      text-sm leading-7
      text-foreground
    "
  >
    {
      displayedMessageContent
        .cleanBody
    }
  </div>
) : displayedMessageContent
      .cloudLinks.length === 0 &&
    displayedMessageContent
      .externalLinks.length === 0 ? (
  <div className="text-sm text-muted-foreground">
    No message content is available.
  </div>
) : null}
          </div>
        ) : null}
      </div>
    </>
  ) : (
    <div className="flex flex-1 items-center justify-center">
      <div className="max-w-sm px-8 text-center">
        <Mail className="mx-auto size-8 text-muted-foreground" />

        <h2 className="mt-4 text-base font-semibold text-foreground">
          Select an email
        </h2>

        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {activeFolder === 'inbox'
            ? 'Choose a message from the Inbox to read its complete content.'
            : activeFolder === 'sent'
              ? 'Choose a sent message to read its complete content.'
              : activeFolder === 'drafts'
                ? 'Choose a draft to review its saved content.'
                : 'Choose an archived message to read its complete content.'}
        </p>
      </div>
    </div>
  )}
</section>
      </div>
    </div>
  );
}