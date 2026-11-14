import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CHARSETS,
  MAX_BULK,
  buildCharacterGroups,
  generatePassphrase,
  generatePassword,
  generatePasswords,
  passphraseEntropyBits,
} from './passwords.js';
import { randomInt, getRandomBytes, shuffle } from './random.js';
import { WORDLIST } from './wordlist.js';

describe('random utilities', () => {
  it('produces the requested number of bytes', () => {
    expect(getRandomBytes(16)).toHaveLength(16);
    expect(getRandomBytes(1)).toHaveLength(1);
  });

  it('rejects invalid lengths', () => {
    expect(() => getRandomBytes(0)).toThrow();
    expect(() => getRandomBytes(-1)).toThrow();
    expect(() => getRandomBytes(1.5)).toThrow();
  });

  it('samples every bucket in a plausible distribution (no obvious modulo bias)', () => {
    const buckets = 7;
    const draws = 21_000;
    const counts = new Array(buckets).fill(0);
    for (let i = 0; i < draws; i += 1) counts[randomInt(buckets)] += 1;
    const expected = draws / buckets;
    counts.forEach((count) => {
      expect(count).toBeGreaterThan(expected * 0.8);
      expect(count).toBeLessThan(expected * 1.2);
    });
  });

  it('rejects invalid bounds', () => {
    expect(() => randomInt(0)).toThrow();
    expect(() => randomInt(-5)).toThrow();
    expect(() => randomInt(2 ** 32 + 1)).toThrow();
  });

  it('shuffles without losing or duplicating elements', () => {
    const source = Array.from({ length: 64 }, (_, index) => index);
    const result = shuffle([...source]);
    expect(result).toHaveLength(source.length);
    expect(new Set(result).size).toBe(source.length);
    expect([...result].sort((a, b) => a - b)).toEqual(source);
  });
});

describe('password generation', () => {
  it('respects the requested length across the full range', () => {
    for (const length of [8, 9, 12, 24, 64, 100, 128]) {
      const password = generatePassword({ length });
      expect(password).toHaveLength(length);
    }
  });

  it('only uses characters from enabled categories', () => {
    const password = generatePassword({
      length: 40,
      upper: false,
      lower: true,
      numbers: true,
      symbols: false,
    });
    for (const char of password) {
      expect(`${CHARSETS.lower}${CHARSETS.numbers}`).toContain(char);
    }
  });

  it('guarantees every enabled category is represented', () => {
    for (let i = 0; i < 200; i += 1) {
      const password = generatePassword({ length: 8 });
      expect(/[a-z]/.test(password)).toBe(true);
      expect(/[A-Z]/.test(password)).toBe(true);
      expect(/[0-9]/.test(password)).toBe(true);
      expect(/[!@#$%^&*()\-_=+[\]{};:,.?/~]/.test(password)).toBe(true);
    }
  });

  it('guarantees a custom-only category when standard categories are disabled', () => {
    const password = generatePassword({
      length: 12,
      lower: false,
      upper: false,
      numbers: false,
      symbols: false,
      custom: 'xyz',
    });
    expect(password).toHaveLength(12);
    expect(/^[xyz]+$/.test(password)).toBe(true);
  });

  it('never emits excluded characters', () => {
    const exclude = 'Il1O0o';
    for (let i = 0; i < 100; i += 1) {
      const password = generatePassword({ length: 48, exclude });
      for (const char of exclude) expect(password.includes(char)).toBe(false);
    }
  });

  it('adds custom characters to the pool', () => {
    const password = generatePassword({
      length: 64,
      upper: false,
      lower: false,
      numbers: false,
      symbols: false,
      custom: '§±',
    });
    expect(/^[§±]+$/.test(password)).toBe(true);
  });

  it('reports an error when an enabled category is fully excluded', () => {
    expect(() =>
      generatePassword({ length: 16, lower: true, numbers: false, symbols: false, exclude: CHARSETS.lower }),
    ).toThrow(/Lowercase/);
  });

  it('reports an error when nothing can be sampled', () => {
    expect(() =>
      generatePassword({ length: 16, lower: false, upper: false, numbers: false, symbols: false }),
    ).toThrow();
  });

  it('validates length and bulk bounds', () => {
    expect(() => generatePassword({ length: 7 })).toThrow();
    expect(() => generatePassword({ length: 129 })).toThrow();
    expect(() => generatePasswords({ length: 16, count: 0 })).toThrow();
    expect(() => generatePasswords({ length: 16, count: MAX_BULK + 1 })).toThrow();
  });

  it('bulk generates the requested number of values', () => {
    const list = generatePasswords({ length: 24, count: MAX_BULK });
    expect(list).toHaveLength(MAX_BULK);
    expect(new Set(list).size).toBe(MAX_BULK);
    list.forEach((value) => expect(value).toHaveLength(24));
  });

  it('produces different values on repeated calls', () => {
    const values = new Set(Array.from({ length: 30 }, () => generatePassword({ length: 20 })));
    expect(values.size).toBeGreaterThan(28);
  });

  it('reports a pool size that matches the enabled categories', () => {
    const { pool } = buildCharacterGroups({ lower: true, upper: false, numbers: true, symbols: false });
    expect(pool).toHaveLength(36);
  });
});

describe('passphrase generation', () => {
  it('uses the requested word count and separator', () => {
    const phrase = generatePassphrase({ wordCount: 6, separator: '-' });
    expect(phrase.split('-')).toHaveLength(6);
    phrase.split('-').forEach((word) => expect(WORDLIST).toContain(word));
  });

  it('supports empty separators, capitalisation and numeric suffixes', () => {
    const phrase = generatePassphrase({ wordCount: 5, separator: '', capitalize: true, includeNumber: true });
    expect(phrase).toMatch(/^([A-Z][a-z]+){5}\d{2}$/);
  });

  it('validates word count and separator length', () => {
    expect(() => generatePassphrase({ wordCount: 2 })).toThrow();
    expect(() => generatePassphrase({ wordCount: 13 })).toThrow();
    expect(() => generatePassphrase({ wordCount: 4, separator: '----' })).toThrow();
  });

  it('reports positive entropy consistent with list size', () => {
    expect(passphraseEntropyBits({ wordCount: 6 })).toBeGreaterThanOrEqual(48);
    expect(passphraseEntropyBits({ wordCount: 6, includeNumber: true })).toBeGreaterThan(
      passphraseEntropyBits({ wordCount: 6 }),
    );
  });

  it('has a reasonably sized bundled wordlist without duplicates', () => {
    expect(WORDLIST.length).toBeGreaterThan(300);
    expect(new Set(WORDLIST).size).toBe(WORDLIST.length);
  });
});

describe('randomness source', () => {
  it('never uses Math.random in security-sensitive modules', () => {
    for (const file of ['random.js', 'passwords.js', 'crypto.js', 'keys.js', 'vault.js', 'breach.js']) {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8');
      // Match actual calls, not documentation that says "never use Math.random".
      expect(source).not.toMatch(/Math\.random\s*\(/);
    }
  });
});
