import { concatBytes, fromBase64, toBase64, utf8Decode, utf8Encode } from './bytes.js';
import { getRandomBytes } from './random.js';

/**
 * Versioned, portable encrypted envelope for Password Forge.
 *
 * Envelope (JSON):
 * {
 *   "format": "password-forge-encrypted",
 *   "version": 1,
 *   "algorithm": "AES-256-GCM",
 *   "kdf": { "name": "PBKDF2", "hash": "SHA-256", "iterations": 600000, "salt": "<b64>" },
 *   "iv": "<b64, 12 bytes>",
 *   "meta": { "kind": "text" | "file" | "vault-backup", "filename", "mime", "createdAt", "aad": bool },
 *   "ciphertext": "<b64, includes 128-bit GCM tag>"
 * }
 *
 * The canonical header string (format, version, algorithm, KDF parameters, salt,
 * IV and non-secret metadata) is always fed to AES-GCM as additional
 * authenticated data, together with any user-supplied AAD. Editing the header
 * therefore breaks authentication instead of silently changing how the
 * ciphertext is interpreted.
 */

export const FORMAT_ID = 'password-forge-encrypted';
export const FORMAT_VERSION = 1;
export const ALGORITHM = 'AES-256-GCM';
export const KDF_NAME = 'PBKDF2';
export const KDF_HASH = 'SHA-256';

export const DEFAULT_ITERATIONS = 600_000;
export const MIN_ITERATIONS = 100_000;
export const MAX_ITERATIONS = 3_000_000;
export const SALT_BYTES = 16;
export const IV_BYTES = 12;
export const TAG_BITS = 128;

export const MAX_TEXT_BYTES = 2 * 1024 * 1024; // 2 MiB of plaintext text
export const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MiB per file
export const MAX_ENVELOPE_CHARS = 24 * 1024 * 1024; // guard before JSON.parse

export const ITERATION_OPTIONS = [
  { value: 100_000, label: '100,000 — fastest, older guidance' },
  { value: 210_000, label: '210,000 — OWASP 2023 baseline' },
  { value: 600_000, label: '600,000 — recommended default' },
  { value: 1_000_000, label: '1,000,000 — hardened' },
];

export class ForgeError extends Error {
  constructor(code, message, detail) {
    super(message);
    this.name = 'ForgeError';
    this.code = code;
    this.detail = detail || '';
  }
}

const encoder = new TextEncoder();

export function randomSalt() {
  return getRandomBytes(SALT_BYTES);
}

export function randomIv() {
  return getRandomBytes(IV_BYTES);
}

/**
 * Derive a non-extractable AES-256-GCM key with PBKDF2-HMAC-SHA-256.
 * The passphrase and derived key never leave this function's scope for longer
 * than the caller needs them; nothing is written to storage here.
 */
export async function deriveAesKey(passphrase, salt, iterations = DEFAULT_ITERATIONS) {
  if (typeof passphrase !== 'string' || passphrase.length === 0) {
    throw new ForgeError('PASSPHRASE_REQUIRED', 'A passphrase is required.');
  }
  assertIterations(iterations);

  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: KDF_HASH,
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export function assertIterations(iterations) {
  if (
    !Number.isInteger(iterations) ||
    iterations < MIN_ITERATIONS ||
    iterations > MAX_ITERATIONS
  ) {
    throw new ForgeError(
      'KDF_INVALID',
      `Unsupported key-derivation cost. Expected an integer between ${MIN_ITERATIONS.toLocaleString()} and ${MAX_ITERATIONS.toLocaleString()} iterations.`,
    );
  }
}

function canonicalHeader(envelope) {
  return JSON.stringify({
    format: envelope.format,
    version: envelope.version,
    algorithm: envelope.algorithm,
    kdf: {
      name: envelope.kdf.name,
      hash: envelope.kdf.hash,
      iterations: envelope.kdf.iterations,
      salt: envelope.kdf.salt,
    },
    iv: envelope.iv,
    meta: {
      kind: envelope.meta.kind,
      filename: envelope.meta.filename,
      mime: envelope.meta.mime,
      createdAt: envelope.meta.createdAt,
      aad: envelope.meta.aad,
    },
  });
}

/**
 * Serialise the envelope from the exact header object that was authenticated.
 * Timestamps and flags must not be regenerated here, otherwise the header used
 * for decryption would differ from the one fed to AES-GCM.
 */
function buildEnvelope({ salt, iv, iterations, meta, ciphertext }) {
  return {
    format: FORMAT_ID,
    version: FORMAT_VERSION,
    algorithm: ALGORITHM,
    kdf: {
      name: KDF_NAME,
      hash: KDF_HASH,
      iterations,
      salt: toBase64(salt),
    },
    iv: toBase64(iv),
    meta: {
      kind: meta.kind,
      filename: meta.filename || '',
      mime: meta.mime || '',
      createdAt: meta.createdAt || new Date().toISOString(),
      aad: Boolean(meta.aad),
    },
    ciphertext: toBase64(ciphertext),
  };
}

/**
 * Encrypt bytes. A fresh random salt and a fresh random 96-bit IV are generated
 * on every call, so an IV is never reused with the same key.
 */
export async function encryptBytes({
  plaintext,
  passphrase,
  aad = '',
  iterations = DEFAULT_ITERATIONS,
  kind = 'text',
  filename = '',
  mime = '',
}) {
  if (!(plaintext instanceof Uint8Array)) {
    throw new ForgeError('INPUT_INVALID', 'Plaintext must be raw bytes.');
  }
  if (plaintext.length === 0) {
    throw new ForgeError('INPUT_EMPTY', 'There is nothing to encrypt.');
  }
  if (kind === 'text' && plaintext.length > MAX_TEXT_BYTES) {
    throw new ForgeError('TOO_LARGE', 'Text input exceeds the 2 MiB limit.');
  }
  if (plaintext.length > MAX_FILE_BYTES) {
    throw new ForgeError('TOO_LARGE', 'Input exceeds the 10 MiB limit.');
  }

  const salt = randomSalt();
  const iv = randomIv();
  const key = await deriveAesKey(passphrase, salt, iterations);

  const header = {
    format: FORMAT_ID,
    version: FORMAT_VERSION,
    algorithm: ALGORITHM,
    kdf: { name: KDF_NAME, hash: KDF_HASH, iterations, salt: toBase64(salt) },
    iv: toBase64(iv),
    meta: {
      kind,
      filename: filename || '',
      mime: mime || '',
      createdAt: new Date().toISOString(),
      aad: Boolean(aad),
    },
  };

  const additionalData = concatBytes(utf8Encode(canonicalHeader(header)), utf8Encode(aad));

  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, additionalData, tagLength: TAG_BITS },
      key,
      plaintext,
    ),
  );

  return buildEnvelope({ salt, iv, iterations, meta: header.meta, ciphertext });
}

export async function encryptText({
  text,
  passphrase,
  aad = '',
  iterations = DEFAULT_ITERATIONS,
}) {
  if (typeof text !== 'string' || text.length === 0) {
    throw new ForgeError('INPUT_EMPTY', 'Enter some text to encrypt.');
  }
  const envelope = await encryptBytes({
    plaintext: utf8Encode(text),
    passphrase,
    aad,
    iterations,
    kind: 'text',
  });
  return JSON.stringify(envelope, null, 2);
}

export function serializeEnvelope(envelope) {
  return JSON.stringify(envelope, null, 2);
}

function coerceBytes(value) {
  if (value instanceof Uint8Array) return value;
  return fromBase64(value);
}

/**
 * Strict validation of untrusted envelopes. Every field is checked before it is
 * used, and unknown versions/algorithms are refused rather than guessed at.
 * Accepts a JSON string, a raw envelope object, or an already-parsed envelope
 * (whose binary fields are Uint8Array), so validation is idempotent.
 */
export function parseEnvelope(input) {
  let raw = input;

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) throw new ForgeError('FORMAT_EMPTY', 'No encrypted payload was provided.');
    if (trimmed.length > MAX_ENVELOPE_CHARS) {
      throw new ForgeError('TOO_LARGE', 'Encrypted payload is larger than the 24 MB safety limit.');
    }
    try {
      raw = JSON.parse(trimmed);
    } catch {
      throw new ForgeError('FORMAT_INVALID', 'This does not look like a Password Forge payload (invalid JSON).');
    }
  }

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ForgeError('FORMAT_INVALID', 'Encrypted payload must be a JSON object.');
  }

  if (raw.format !== FORMAT_ID) {
    throw new ForgeError('FORMAT_INVALID', 'Unrecognised payload. Missing or unexpected "format" identifier.');
  }
  if (raw.version !== FORMAT_VERSION) {
    throw new ForgeError(
      'UNSUPPORTED_VERSION',
      `Unsupported format version ${JSON.stringify(raw.version)}. This build supports version ${FORMAT_VERSION}.`,
    );
  }
  if (raw.algorithm !== ALGORITHM) {
    throw new ForgeError('ALGORITHM_UNSUPPORTED', `Unsupported algorithm. Expected ${ALGORITHM}.`);
  }

  const kdf = raw.kdf;
  if (!kdf || typeof kdf !== 'object') {
    throw new ForgeError('KDF_INVALID', 'Missing key-derivation metadata.');
  }
  if (kdf.name !== KDF_NAME) {
    throw new ForgeError('KDF_INVALID', `Unsupported key-derivation function. Expected ${KDF_NAME}.`);
  }
  if (kdf.hash !== KDF_HASH) {
    throw new ForgeError('KDF_INVALID', `Unsupported KDF hash. Expected ${KDF_HASH}.`);
  }
  assertIterations(kdf.iterations);

  const salt = coerceBytes(kdf.salt);
  if (!salt || salt.length < 16 || salt.length > 64) {
    throw new ForgeError('SALT_INVALID', 'Salt is missing or malformed (expected 16–64 bytes, base64).');
  }

  const iv = coerceBytes(raw.iv);
  if (!iv || iv.length !== IV_BYTES) {
    throw new ForgeError('IV_INVALID', 'IV is missing or malformed (expected exactly 12 bytes, base64).');
  }

  const ciphertext = coerceBytes(raw.ciphertext);
  if (!ciphertext || ciphertext.length < 17) {
    throw new ForgeError('CIPHERTEXT_INVALID', 'Ciphertext is missing, malformed, or too short to contain an authentication tag.');
  }
  if (ciphertext.length > MAX_FILE_BYTES + 1024) {
    throw new ForgeError('TOO_LARGE', 'Ciphertext exceeds the 10 MiB limit.');
  }

  const meta = raw.meta;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    throw new ForgeError('METADATA_INVALID', 'Encrypted metadata block is missing.');
  }
  if (!['text', 'file', 'vault-backup'].includes(meta.kind)) {
    throw new ForgeError('METADATA_INVALID', 'Unknown payload kind in metadata.');
  }
  if (typeof meta.filename !== 'string' || meta.filename.length > 200) {
    throw new ForgeError('METADATA_INVALID', 'Filename metadata is invalid.');
  }
  if (typeof meta.mime !== 'string' || meta.mime.length > 120) {
    throw new ForgeError('METADATA_INVALID', 'MIME metadata is invalid.');
  }
  if (typeof meta.createdAt !== 'string' || meta.createdAt.length > 40) {
    throw new ForgeError('METADATA_INVALID', 'Creation timestamp metadata is invalid.');
  }
  if (typeof meta.aad !== 'boolean') {
    throw new ForgeError('METADATA_INVALID', 'AAD flag metadata is invalid.');
  }

  return {
    format: raw.format,
    version: raw.version,
    algorithm: raw.algorithm,
    kdf: { name: kdf.name, hash: kdf.hash, iterations: kdf.iterations, salt },
    iv,
    meta: {
      kind: meta.kind,
      filename: meta.filename,
      mime: meta.mime,
      createdAt: meta.createdAt,
      aad: meta.aad,
    },
    ciphertext,
  };
}

/**
 * Authenticate and decrypt. AES-GCM verifies the tag before returning any
 * plaintext, so callers never receive partial or unauthenticated content.
 */
export async function decryptEnvelope(input, { passphrase, aad = '' } = {}) {
  if (typeof passphrase !== 'string' || passphrase.length === 0) {
    throw new ForgeError('PASSPHRASE_REQUIRED', 'Enter the passphrase used to encrypt this payload.');
  }

  const envelope = parseEnvelope(input);

  if (envelope.meta.aad && !aad) {
    throw new ForgeError(
      'AAD_REQUIRED',
      'This payload was encrypted with additional authenticated data. Enter the exact same value.',
    );
  }

  const key = await deriveAesKey(passphrase, envelope.kdf.salt, envelope.kdf.iterations);

  const headerString = canonicalHeader({
    ...envelope,
    kdf: { ...envelope.kdf, salt: toBase64(envelope.kdf.salt) },
    iv: toBase64(envelope.iv),
  });
  const additionalData = concatBytes(utf8Encode(headerString), utf8Encode(aad));

  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: envelope.iv, additionalData, tagLength: TAG_BITS },
      key,
      envelope.ciphertext,
    );
    return { bytes: new Uint8Array(plaintext), envelope };
  } catch {
    throw new ForgeError(
      'AUTH_FAILED',
      'Authentication failed. The passphrase is incorrect, the additional authenticated data does not match, or the payload was modified.',
    );
  }
}

export async function decryptToText(input, options) {
  const { bytes, envelope } = await decryptEnvelope(input, options);
  let text;
  try {
    text = utf8Decode(bytes);
  } catch {
    throw new ForgeError('DECODE_FAILED', 'Decryption succeeded but the payload is not valid UTF-8 text.');
  }
  return { text, envelope, bytes };
}

/** Measure PBKDF2 cost locally so users can tune it for their hardware. */
export async function measureKdf(iterations = DEFAULT_ITERATIONS) {
  const salt = randomSalt();
  const started = performance.now();
  await deriveAesKey('password-forge-benchmark', salt, iterations);
  return performance.now() - started;
}
