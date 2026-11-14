import { describe, expect, it } from 'vitest';
import {
  ALGORITHM,
  FORMAT_ID,
  ForgeError,
  MAX_ITERATIONS,
  MIN_ITERATIONS,
  decryptEnvelope,
  decryptToText,
  encryptBytes,
  encryptText,
  parseEnvelope,
} from './crypto.js';
import { fromBase64, toBase64, utf8Decode, utf8Encode } from './bytes.js';

const PASSPHRASE = 'correct horse battery staple 42';
const FAST = 100_000;

async function makeEnvelope(text = 'top secret', aad = '') {
  const json = await encryptText({ text, passphrase: PASSPHRASE, aad, iterations: FAST });
  return JSON.parse(json);
}

describe('encryption / decryption round trip', () => {
  it('encrypts and decrypts text', async () => {
    const { text } = await decryptToText(
      await encryptText({ text: 'Sensitive note ✦ ünïcode', passphrase: PASSPHRASE, iterations: FAST }),
      { passphrase: PASSPHRASE },
    );
    expect(text).toBe('Sensitive note ✦ ünïcode');
  });

  it('round trips binary files byte for byte', async () => {
    const bytes = getRandomBytes(4096);
    const envelope = await encryptBytes({
      plaintext: bytes,
      passphrase: PASSPHRASE,
      iterations: FAST,
      kind: 'file',
      filename: 'secret.bin',
      mime: 'application/octet-stream',
    });
    const parsed = parseEnvelope(JSON.parse(JSON.stringify(envelope)));
    expect(parsed.meta.filename).toBe('secret.bin');
    const { bytes: output } = await decryptEnvelope(parsed, { passphrase: PASSPHRASE });
    expect(output).toHaveLength(bytes.length);
    expect(Array.from(output)).toEqual(Array.from(bytes));
  });

  it('works with additional authenticated data', async () => {
    const envelope = await makeEnvelope('aad test', 'project-atlas');
    const { text } = await decryptToText(envelope, { passphrase: PASSPHRASE, aad: 'project-atlas' });
    expect(text).toBe('aad test');
  });

  it('requires AAD when the payload was encrypted with it', async () => {
    const envelope = await makeEnvelope('aad test', 'shared-context');
    await expect(decryptEnvelope(envelope, { passphrase: PASSPHRASE })).rejects.toMatchObject({
      code: 'AAD_REQUIRED',
    });
  });

  it('rejects the wrong AAD', async () => {
    const envelope = await makeEnvelope('aad test', 'right');
    await expect(
      decryptEnvelope(envelope, { passphrase: PASSPHRASE, aad: 'wrong' }),
    ).rejects.toMatchObject({ code: 'AUTH_FAILED' });
  });

  it('does not include the plaintext anywhere in the envelope', async () => {
    const json = await encryptText({ text: 'UNIQUE_PLAINTEXT_MARKER', passphrase: PASSPHRASE, iterations: FAST });
    expect(json.includes('UNIQUE_PLAINTEXT_MARKER')).toBe(false);
  });

  it('labels algorithm, KDF and version in the envelope', async () => {
    const envelope = await makeEnvelope();
    expect(envelope.format).toBe(FORMAT_ID);
    expect(envelope.version).toBe(1);
    expect(envelope.algorithm).toBe(ALGORITHM);
    expect(envelope.kdf.name).toBe('PBKDF2');
    expect(envelope.kdf.hash).toBe('SHA-256');
    expect(envelope.kdf.iterations).toBe(FAST);
    expect(fromBase64(envelope.iv)).toHaveLength(12);
    expect(fromBase64(envelope.kdf.salt)).toHaveLength(16);
  });
});

describe('failure handling', () => {
  it('rejects an incorrect passphrase', async () => {
    const envelope = await makeEnvelope();
    await expect(decryptEnvelope(envelope, { passphrase: 'wrong passphrase' })).rejects.toMatchObject({
      code: 'AUTH_FAILED',
    });
  });

  it('rejects modified ciphertext', async () => {
    const envelope = await makeEnvelope();
    const ciphertext = fromBase64(envelope.ciphertext);
    ciphertext[3] ^= 0x01;
    const tampered = { ...envelope, ciphertext: toBase64(ciphertext) };
    await expect(decryptEnvelope(tampered, { passphrase: PASSPHRASE })).rejects.toMatchObject({
      code: 'AUTH_FAILED',
    });
  });

  it('rejects a modified authentication tag', async () => {
    const envelope = await makeEnvelope();
    const ciphertext = fromBase64(envelope.ciphertext);
    ciphertext[ciphertext.length - 1] ^= 0xff;
    await expect(
      decryptEnvelope({ ...envelope, ciphertext: toBase64(ciphertext) }, { passphrase: PASSPHRASE }),
    ).rejects.toMatchObject({ code: 'AUTH_FAILED' });
  });

  it('rejects tampered header metadata even though the ciphertext is untouched', async () => {
    const envelope = await makeEnvelope();
    const tampered = { ...envelope, meta: { ...envelope.meta, createdAt: '1999-01-01T00:00:00.000Z' } };
    await expect(decryptEnvelope(tampered, { passphrase: PASSPHRASE })).rejects.toMatchObject({
      code: 'AUTH_FAILED',
    });
  });

  it('rejects a swapped salt or IV', async () => {
    const envelope = await makeEnvelope();
    const other = await makeEnvelope();
    await expect(
      decryptEnvelope({ ...envelope, iv: other.iv }, { passphrase: PASSPHRASE }),
    ).rejects.toMatchObject({ code: 'AUTH_FAILED' });
    await expect(
      decryptEnvelope(
        { ...envelope, kdf: { ...envelope.kdf, salt: other.kdf.salt } },
        { passphrase: PASSPHRASE },
      ),
    ).rejects.toMatchObject({ code: 'AUTH_FAILED' });
  });

  it('refuses an empty passphrase', async () => {
    const envelope = await makeEnvelope();
    await expect(decryptEnvelope(envelope, { passphrase: '' })).rejects.toMatchObject({
      code: 'PASSPHRASE_REQUIRED',
    });
  });
});

describe('salt and IV uniqueness', () => {
  it('uses a fresh salt and IV for every encryption', async () => {
    const salts = new Set();
    const ivs = new Set();
    for (let i = 0; i < 6; i += 1) {
      const envelope = await makeEnvelope(`message ${i}`);
      salts.add(envelope.kdf.salt);
      ivs.add(envelope.iv);
      expect(fromBase64(envelope.iv)).toHaveLength(12);
      expect(fromBase64(envelope.kdf.salt)).toHaveLength(16);
    }
    expect(salts.size).toBe(6);
    expect(ivs.size).toBe(6);
  });

  it('never produces identical ciphertext for identical plaintext', async () => {
    const first = await makeEnvelope('same text');
    const second = await makeEnvelope('same text');
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });
});

describe('imported metadata validation', () => {
  const expectCode = async (mutate, code) => {
    const envelope = await makeEnvelope();
    const broken = mutate(structuredClone(envelope));
    try {
      parseEnvelope(broken);
      throw new Error('expected parseEnvelope to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(ForgeError);
      expect(error.code).toBe(code);
    }
  };

  it('rejects invalid JSON', async () => {
    expect(() => parseEnvelope('{not json')).toThrow(/invalid JSON/i);
  });

  it('rejects an empty payload', async () => {
    expect(() => parseEnvelope('   ')).toThrow(/No encrypted payload/i);
  });

  it('rejects the wrong format identifier', async () => {
    await expectCode((envelope) => ({ ...envelope, format: 'something-else' }), 'FORMAT_INVALID');
  });

  it('rejects unsupported versions', async () => {
    await expectCode((envelope) => ({ ...envelope, version: 2 }), 'UNSUPPORTED_VERSION');
  });

  it('rejects unsupported algorithms', async () => {
    await expectCode((envelope) => ({ ...envelope, algorithm: 'AES-128-CBC' }), 'ALGORITHM_UNSUPPORTED');
  });

  it('rejects unsupported KDFs and hashes', async () => {
    await expectCode((envelope) => ({ ...envelope, kdf: { ...envelope.kdf, name: 'scrypt' } }), 'KDF_INVALID');
    await expectCode((envelope) => ({ ...envelope, kdf: { ...envelope.kdf, hash: 'SHA-1' } }), 'KDF_INVALID');
  });

  it('rejects out-of-range KDF parameters', async () => {
    await expectCode(
      (envelope) => ({ ...envelope, kdf: { ...envelope.kdf, iterations: MIN_ITERATIONS - 1 } }),
      'KDF_INVALID',
    );
    await expectCode(
      (envelope) => ({ ...envelope, kdf: { ...envelope.kdf, iterations: MAX_ITERATIONS + 1 } }),
      'KDF_INVALID',
    );
    await expectCode(
      (envelope) => ({ ...envelope, kdf: { ...envelope.kdf, iterations: 12345.6 } }),
      'KDF_INVALID',
    );
  });

  it('rejects a malformed salt', async () => {
    await expectCode((envelope) => ({ ...envelope, kdf: { ...envelope.kdf, salt: toBase64(utf8Encode('short')) } }), 'SALT_INVALID');
    await expectCode((envelope) => ({ ...envelope, kdf: { ...envelope.kdf, salt: '!!!!' } }), 'SALT_INVALID');
  });

  it('rejects an IV of the wrong length', async () => {
    await expectCode((envelope) => ({ ...envelope, iv: toBase64(new Uint8Array(16)) }), 'IV_INVALID');
    await expectCode((envelope) => ({ ...envelope, iv: '' }), 'IV_INVALID');
  });

  it('rejects a truncated ciphertext', async () => {
    await expectCode((envelope) => ({ ...envelope, ciphertext: toBase64(new Uint8Array(8)) }), 'CIPHERTEXT_INVALID');
  });

  it('rejects malformed metadata', async () => {
    await expectCode((envelope) => ({ ...envelope, meta: { ...envelope.meta, kind: 'archive' } }), 'METADATA_INVALID');
    await expectCode((envelope) => ({ ...envelope, meta: { ...envelope.meta, aad: 'yes' } }), 'METADATA_INVALID');
    await expectCode((envelope) => ({ ...envelope, meta: null }), 'METADATA_INVALID');
  });
});

// Local helper so the test file does not depend on the browser helper module.
function getRandomBytes(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

// Keep utf8Decode referenced for clarity of intent in file round-trip tests.
void utf8Decode;
