/**
 * Optional, explicitly opt-in breach check using the Pwned Passwords range API.
 *
 * Privacy properties of this request:
 *  - Only the first 5 hex characters of the SHA-1 hash are sent.
 *  - The password and the full hash never leave the browser.
 *  - The response is a list of hash suffixes with counts; the comparison
 *    happens locally.
 *  - The request is only made when the user presses the button.
 *
 * The external service still learns that someone using this client checked a
 * password starting with that prefix, together with the requester's IP address.
 */

export const BREACH_ENDPOINT = 'https://api.pwnedpasswords.com/range/';

export class BreachError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'BreachError';
    this.code = code;
  }
}

export async function sha1Hex(text) {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

export async function checkBreach(password, { signal, fetchImpl } = {}) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new BreachError('EMPTY', 'Enter a password before checking.');
  }
  if (password.length > 1000) {
    throw new BreachError('TOO_LONG', 'Password is too long to check.');
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new BreachError('OFFLINE', 'You appear to be offline. The breach check is optional and requires a network request.');
  }

  const hash = await sha1Hex(password);
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  const fetcher = fetchImpl || fetch;

  let response;
  try {
    response = await fetcher(`${BREACH_ENDPOINT}${prefix}`, {
      method: 'GET',
      headers: { 'Add-Padding': 'true' },
      signal,
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    });
  } catch (error) {
    if (error && error.name === 'AbortError') throw error;
    throw new BreachError('NETWORK', 'The breach-check service could not be reached. Check your connection and try again.');
  }

  if (!response.ok) {
    throw new BreachError(
      'HTTP',
      `The breach-check service returned an unexpected status (${response.status}). Try again later.`,
    );
  }

  const body = await response.text();
  const lines = body.split(/\r?\n/);
  let count = 0;
  for (const line of lines) {
    const [lineSuffix, lineCount] = line.split(':');
    if (!lineSuffix) continue;
    if (lineSuffix.trim().toUpperCase() === suffix) {
      count = Number.parseInt(lineCount, 10) || 0;
      break;
    }
  }

  return { count, prefix, checkedSuffixes: lines.length };
}
