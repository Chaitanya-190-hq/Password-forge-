import { bytesToHex, toBase64 } from './bytes.js';

/**
 * All randomness in Password Forge comes from the platform CSPRNG
 * (crypto.getRandomValues). Math.random is never used for security material.
 */

const UINT32_CEILING = 0x100000000;

export function getRandomBytes(length) {
  if (!Number.isInteger(length) || length <= 0 || length > 1024 * 1024) {
    throw new RangeError('Invalid byte length requested');
  }
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

/**
 * Uniform integer in [0, max). Uses rejection sampling so every value has the
 * same probability — no modulo bias.
 */
export function randomInt(max) {
  if (!Number.isInteger(max) || max <= 0 || max > UINT32_CEILING) {
    throw new RangeError('Invalid upper bound for randomInt');
  }
  const limit = Math.floor(UINT32_CEILING / max) * max;
  const buffer = new Uint32Array(1);
  do {
    crypto.getRandomValues(buffer);
  } while (buffer[0] >= limit);
  return buffer[0] % max;
}

/** Uniformly pick one element. */
export function randomChoice(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new RangeError('randomChoice requires a non-empty array');
  }
  return items[randomInt(items.length)];
}

/** In-place unbiased Fisher–Yates shuffle. */
export function shuffle(items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    const tmp = items[i];
    items[i] = items[j];
    items[j] = tmp;
  }
  return items;
}

export function randomHex(byteLength) {
  return bytesToHex(getRandomBytes(byteLength));
}

export function randomBase64(byteLength) {
  return toBase64(getRandomBytes(byteLength));
}

export function randomUrlSafe(byteLength) {
  return toBase64(getRandomBytes(byteLength))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function randomPassword(length = 32, alphabet) {
  const chars = Array.from(new Set(alphabet || 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'));
  if (chars.length < 2) throw new RangeError('Alphabet too small');
  let out = '';
  for (let i = 0; i < length; i += 1) out += chars[randomInt(chars.length)];
  return out;
}
