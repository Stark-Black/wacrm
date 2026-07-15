export const TWILIO_DIAL_REQUEST_EVENT =
  'wacrm:twilio-dial-request';

export type TwilioDialRequestDetail = {
  phoneNumber: string;
};

/**
 * Convierte números estadounidenses a formato:
 * +12025550123
 */
export function normalizeUsPhoneNumber(
  phoneNumber: string,
) {
  const digits = phoneNumber.replace(/\D/g, '');

  // Ejemplo: 2025550123
  if (digits.length === 10) {
    return `+1${digits}`;
  }

  // Ejemplo: 12025550123
  if (
    digits.length === 11 &&
    digits.startsWith('1')
  ) {
    return `+${digits}`;
  }

  return phoneNumber.trim();
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