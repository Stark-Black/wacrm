export const TWILIO_DIAL_REQUEST_EVENT =
  'wacrm:twilio-dial-request';

export type TwilioDialRequestDetail = {
  phoneNumber: string;
};

/**
 * Convierte números estadounidenses a formato:
 * +12025550123
 */
export function normalizeInternationalPhoneNumber(
  phoneNumber: string,
) {
  const trimmed = phoneNumber.trim();

  if (!trimmed) {
    return '';
  }

  const compact = trimmed.replace(
    /[^\d+]/g,
    '',
  );

  if (compact.startsWith('+')) {
    return `+${compact
      .slice(1)
      .replace(/\D/g, '')}`;
  }

  if (compact.startsWith('00')) {
    return `+${compact
      .slice(2)
      .replace(/\D/g, '')}`;
  }

  return compact.replace(/\D/g, '');
}

/**
 * Envía un número desde cualquier componente
 * hacia el softphone global.
 */
export function requestTwilioDial(
  phoneNumber: string,
) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<TwilioDialRequestDetail>(
      TWILIO_DIAL_REQUEST_EVENT,
      {
        detail: {
          phoneNumber,
        },
      },
    ),
  );
}