import { describe, expect, it } from 'vitest';
import {
  argon2idHash,
  argon2idVerify,
  compareHashes,
  hashBytes,
  hashText,
  hmacText,
  normalizeHashInput,
  parseArgon2Encoded,
} from './hash.js';
import { utf8Encode } from './bytes.js';

describe('SHA-2 digests', () => {
  it('matches the published SHA-256 test vector for "abc"', async () => {
    expect(await hashText('SHA-256', 'abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('matches the published SHA-384 test vector for "abc"', async () => {
    expect(await hashText('SHA-384', 'abc')).toBe(
      'cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7',
    );
  });

  it('matches the published SHA-512 test vector for "abc"', async () => {
    expect(await hashText('SHA-512', 'abc')).toBe(
      'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f',
    );
  });

  it('hashes bytes and text identically for the same content', async () => {
    const fromText = await hashText('SHA-256', 'password forge');
    const fromBytes = await hashBytes('SHA-256', utf8Encode('password forge'));
    expect(fromBytes).toBe(fromText);
    expect(fromBytes).toHaveLength(64);
  });

  it('refuses unsupported algorithms and empty input', async () => {
    await expect(hashBytes('MD5', utf8Encode('x'))).rejects.toThrow();
    await expect(hashText('SHA-256', '')).rejects.toThrow();
  });
});

describe('HMAC-SHA-256', () => {
  it('matches RFC 4231 test case 2', async () => {
    expect(await hmacText('Jefe', 'what do ya want for nothing?')).toBe(
      '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
    );
  });

  it('changes when the key or message changes', async () => {
    const baseline = await hmacText('key-one', 'message');
    expect(await hmacText('key-two', 'message')).not.toBe(baseline);
    expect(await hmacText('key-one', 'message-two')).not.toBe(baseline);
  });

  it('requires a key and a message', async () => {
    await expect(hmacText('', 'message')).rejects.toThrow();
    await expect(hmacText('key', '')).rejects.toThrow();
  });
});

describe('hash verification and comparison', () => {
  it('matches case-insensitively and ignores separators', async () => {
    const digest = await hashText('SHA-256', 'verify me');
    expect(compareHashes(digest.toUpperCase(), digest).ok).toBe(true);
    const spaced = digest.replace(/(.{8})/g, '$1 ').trim();
    expect(compareHashes(spaced, digest).ok).toBe(true);
    expect(normalizeHashInput('0x' + digest)).toBe(digest);
  });

  it('detects a mismatch', async () => {
    const digest = await hashText('SHA-256', 'verify me');
    const other = await hashText('SHA-256', 'verify me too');
    const result = compareHashes(other, digest);
    expect(result.ok).toBe(false);
    expect(result.valid).toBe(true);
  });

  it('reports invalid hexadecimal input instead of guessing', () => {
    const result = compareHashes('zzzz', 'abcd');
    expect(result.valid).toBe(false);
    expect(result.ok).toBe(false);
  });

  it('reports different lengths clearly', () => {
    const result = compareHashes('ab', 'abcd');
    expect(result.valid).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/different lengths/i);
  });
});

describe('Argon2id', () => {
  it('produces a valid PHC string and verifies the correct password', async () => {
    const result = await argon2idHash('correct horse', { memoryKiB: 8192, iterations: 1, parallelism: 1 });
    expect(result.encoded).toMatch(/^\$argon2id\$v=19\$m=8192,t=1,p=1\$[\w+/]+\$[\w+/]+$/);

    const parsed = parseArgon2Encoded(result.encoded);
    expect(parsed.params.memoryKiB).toBe(8192);
    expect(parsed.params.iterations).toBe(1);
    expect(parsed.salt).toHaveLength(16);

    expect((await argon2idVerify('correct horse', result.encoded)).ok).toBe(true);
    expect((await argon2idVerify('wrong horse', result.encoded)).ok).toBe(false);
  });

  it('uses a random salt per hash', async () => {
    const first = await argon2idHash('same password', { memoryKiB: 8192, iterations: 1 });
    const second = await argon2idHash('same password', { memoryKiB: 8192, iterations: 1 });
    expect(first.encoded).not.toBe(second.encoded);
    expect(first.hex).not.toBe(second.hex);
  });

  it('rejects malformed PHC strings', () => {
    expect(() => parseArgon2Encoded('not-a-hash')).toThrow(/PHC/);
    expect(() => parseArgon2Encoded('$argon2i$v=19$m=8192,t=1,p=1$abc$def')).toThrow();
  });
});
