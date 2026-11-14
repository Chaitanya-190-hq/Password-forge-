import { bytesToHex, constantTimeEqual, fromBase64, hexToBytes, toBase64, utf8Encode } from './bytes.js';
import { getRandomBytes } from './random.js';

/**
 * Hashing helpers built on Web Crypto. Argon2id is loaded lazily from hash-wasm
 * (a maintained, audited WASM implementation) — no home-made password hashing.
 */

export const MAX_HASH_FILE_BYTES = 25 * 1024 * 1024;

export const HASH_ALGORITHMS = Object.freeze([
  { id: 'SHA-256', label: 'SHA-256', bits: 256, hexLength: 64, note: 'Fast general-purpose digest. 256-bit output.' },
  { id: 'SHA-384', label: 'SHA-384', bits: 384, hexLength: 96, note: 'Truncated SHA-512 variant. 384-bit output.' },
  { id: 'SHA-512', label: 'SHA-512', bits: 512, hexLength: 128, note: '512-bit output, efficient on 64-bit CPUs.' },
]);

const ALLOWED_DIGESTS = new Set(HASH_ALGORITHMS.map((algorithm) => algorithm.id));

export function assertDigestAlgorithm(algorithm) {
  if (!ALLOWED_DIGESTS.has(algorithm)) {
    throw new Error(`Unsupported digest algorithm: ${String(algorithm)}`);
  }
}

export async function hashBytes(algorithm, bytes) {
  assertDigestAlgorithm(algorithm);
  if (!(bytes instanceof Uint8Array)) throw new Error('Input must be raw bytes.');
  const digest = await crypto.subtle.digest(algorithm, bytes);
  return bytesToHex(new Uint8Array(digest));
}

export async function hashText(algorithm, text) {
  if (typeof text !== 'string' || text.length === 0) {
    throw new Error('Enter text to hash.');
  }
  return hashBytes(algorithm, utf8Encode(text));
}

export async function hmacBytes(keyBytes, bytes) {
  if (!(keyBytes instanceof Uint8Array) || keyBytes.length === 0) {
    throw new Error('An HMAC key is required.');
  }
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, bytes);
  return bytesToHex(new Uint8Array(signature));
}

export async function hmacText(keyText, text) {
  if (typeof keyText !== 'string' || keyText.length === 0) {
    throw new Error('An HMAC key is required.');
  }
  if (typeof text !== 'string' || text.length === 0) {
    throw new Error('Enter text to authenticate.');
  }
  return hmacBytes(utf8Encode(keyText), utf8Encode(text));
}

export function isHex(value) {
  return typeof value === 'string' && value.length > 0 && /^[0-9a-fA-F]+$/.test(value) && value.length % 2 === 0;
}

export function normalizeHashInput(value) {
  return String(value || '')
    .trim()
    .replace(/^0x/i, '')
    .replace(/[\s:-]/g, '')
    .toLowerCase();
}

/**
 * Compare a supplied digest against a computed one.
 * Comparison is constant-time with respect to the digests themselves.
 */
export function compareHashes(expected, actual) {
  const left = normalizeHashInput(expected);
  const right = normalizeHashInput(actual);

  if (!isHex(left) || !isHex(right)) {
    return {
      ok: false,
      valid: false,
      reason: 'Both values must be hexadecimal (ignoring spaces, colons and dashes).',
      expected: left,
      actual: right,
    };
  }
  if (left.length !== right.length) {
    return {
      ok: false,
      valid: true,
      reason: 'The hashes have different lengths, so they cannot match.',
      expected: left,
      actual: right,
    };
  }
  return {
    ok: constantTimeEqual(left, right),
    valid: true,
    reason: constantTimeEqual(left, right) ? 'The values match.' : 'The values are different.',
    expected: left,
    actual: right,
  };
}

export async function readFileBytes(file, maxBytes = MAX_HASH_FILE_BYTES) {
  if (!file) throw new Error('No file selected.');
  if (file.size > maxBytes) {
    throw new Error(`File is too large. Limit is ${(maxBytes / (1024 * 1024)).toFixed(0)} MB.`);
  }
  return new Uint8Array(await file.arrayBuffer());
}

export const ARGON2_DEFAULTS = Object.freeze({
  memoryKiB: 65536,
  iterations: 3,
  parallelism: 1,
  hashLength: 32,
});

function padBase64(value) {
  const remainder = value.length % 4;
  return remainder === 0 ? value : value + '='.repeat(4 - remainder);
}

function encodeArgon2(params, salt, digest) {
  const saltB64 = toBase64(salt).replace(/=+$/g, '');
  const hashB64 = toBase64(digest).replace(/=+$/g, '');
  return `$argon2id$v=19$m=${params.memoryKiB},t=${params.iterations},p=${params.parallelism}$${saltB64}$${hashB64}`;
}

/**
 * Argon2id demonstration using hash-wasm. Parameters follow the OWASP minimum
 * (m=64 MiB, t=3, p=1) and are stored inside the PHC string for verification.
 *
 * This is an educational demonstration. Client-side hashing never substitutes
 * for server-side authentication, rate limiting and breach monitoring.
 */
export async function argon2idHash(password, options = {}) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('Enter a password to hash.');
  }
  const params = { ...ARGON2_DEFAULTS, ...options };
  const salt = options.salt ? new Uint8Array(options.salt) : getRandomBytes(16);
  const { argon2id } = await import('hash-wasm');

  const hex = await argon2id({
    password,
    salt,
    memorySize: params.memoryKiB,
    iterations: params.iterations,
    parallelism: params.parallelism,
    hashLength: params.hashLength,
    outputType: 'hex',
  });

  const digest = hexToBytes(hex);
  return {
    encoded: encodeArgon2(params, salt, digest),
    hex,
    salt,
    params,
    memoryMiB: Math.round((params.memoryKiB / 1024) * 10) / 10,
  };
}

const ARGON2_PATTERN = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

export function parseArgon2Encoded(encoded) {
  const match = ARGON2_PATTERN.exec(String(encoded || '').trim());
  if (!match) {
    throw new Error('This is not a valid Argon2id PHC string (expected $argon2id$v=19$m=…,t=…,p=…$salt$hash).');
  }
  const [, memory, iterations, parallelism, saltB64, hashB64] = match;
  const salt = fromBase64(padBase64(saltB64));
  const hash = fromBase64(padBase64(hashB64));
  if (!salt || !hash) throw new Error('Argon2id salt or digest is not valid base64.');
  return {
    params: {
      memoryKiB: Number(memory),
      iterations: Number(iterations),
      parallelism: Number(parallelism),
      hashLength: hash.length,
    },
    salt,
    hash,
  };
}

export async function argon2idVerify(password, encoded) {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('Enter the password to verify.');
  }
  const parsed = parseArgon2Encoded(encoded);
  const { argon2id } = await import('hash-wasm');
  const hex = await argon2id({
    password,
    salt: parsed.salt,
    memorySize: parsed.params.memoryKiB,
    iterations: parsed.params.iterations,
    parallelism: parsed.params.parallelism,
    hashLength: parsed.params.hashLength,
    outputType: 'hex',
  });
  return {
    ok: constantTimeEqual(hex.toLowerCase(), bytesToHex(parsed.hash)),
    params: parsed.params,
  };
}
