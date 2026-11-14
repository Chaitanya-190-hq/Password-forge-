import { randomInt, shuffle } from './random.js';
import { WORDLIST, WORD_ENTROPY_BITS } from './wordlist.js';

/**
 * Password generation. Every random decision goes through crypto.getRandomValues
 * with rejection sampling (see lib/random.js) — no Math.random, no modulo bias.
 */

export const CHARSETS = Object.freeze({
  lower: 'abcdefghijklmnopqrstuvwxyz',
  upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  numbers: '0123456789',
  symbols: '!@#$%^&*()-_=+[]{};:,.?/~',
});

export const AMBIGUOUS_CHARS = 'Il1O0o';

export const MIN_LENGTH = 8;
export const MAX_LENGTH = 128;
export const MAX_BULK = 50;

export const CATEGORY_LABELS = Object.freeze({
  lower: 'Lowercase',
  upper: 'Uppercase',
  numbers: 'Numbers',
  symbols: 'Symbols',
});

function uniqChars(value) {
  return Array.from(new Set(Array.from(value)));
}

/**
 * Build the character groups and the combined sampling pool.
 * Excluded characters are removed from every group, not just the pool, so the
 * "category is represented" guarantee stays truthful.
 */
export function buildCharacterGroups({ lower, upper, numbers, symbols, exclude = '', custom = '' }) {
  const excluded = new Set(Array.from(exclude));
  const requested = { lower, upper, numbers, symbols };

  const groups = Object.entries(CHARSETS)
    .filter(([id]) => requested[id])
    .map(([id, chars]) => ({
      id,
      label: CATEGORY_LABELS[id],
      chars: uniqChars(chars).filter((char) => !excluded.has(char)),
    }));

  const customChars = uniqChars(custom).filter((char) => !excluded.has(char));

  const pool = uniqChars([...groups.flatMap((group) => group.chars), ...customChars].join(''));

  return { groups, pool, customChars };
}

export function validateOptions(options) {
  const { length, count } = options;
  if (!Number.isInteger(length) || length < MIN_LENGTH || length > MAX_LENGTH) {
    throw new Error(`Length must be between ${MIN_LENGTH} and ${MAX_LENGTH} characters.`);
  }
  if (!Number.isInteger(count) || count < 1 || count > MAX_BULK) {
    throw new Error(`Generate between 1 and ${MAX_BULK} passwords at a time.`);
  }
}

/**
 * Generate one password. Enabled categories are guaranteed to appear when the
 * requested length is at least the number of enabled categories.
 */
export function generatePassword(options) {
  const {
    length = 24,
    lower = true,
    upper = true,
    numbers = true,
    symbols = true,
    exclude = '',
    custom = '',
    guaranteeCategories = true,
  } = options;

  if (!Number.isInteger(length) || length < MIN_LENGTH || length > MAX_LENGTH) {
    throw new Error(`Length must be between ${MIN_LENGTH} and ${MAX_LENGTH} characters.`);
  }

  const { groups, pool } = buildCharacterGroups({ lower, upper, numbers, symbols, exclude, custom });

  if (pool.length === 0) {
    throw new Error('No characters available. Enable a character category or supply a custom set.');
  }

  const emptyGroups = groups.filter((group) => group.chars.length === 0);
  if (guaranteeCategories && emptyGroups.length > 0) {
    throw new Error(
      `${emptyGroups.map((g) => g.label).join(', ')} cannot be guaranteed — every character in that set is excluded.`,
    );
  }

  const required = guaranteeCategories ? groups : [];
  if (required.length > length) {
    throw new Error('Length is too short to include every enabled category.');
  }

  const output = required.map((group) => group.chars[randomInt(group.chars.length)]);
  while (output.length < length) {
    output.push(pool[randomInt(pool.length)]);
  }

  return shuffle(output).join('');
}

/**
 * Bulk generation. Returns distinct passwords where possible; duplicates are
 * re-drawn up to a bounded number of attempts (never an infinite loop).
 */
export function generatePasswords(options) {
  validateOptions({ length: options.length ?? 24, count: options.count ?? 1 });
  const count = options.count;
  const results = [];
  const seen = new Set();
  let attempts = 0;
  const attemptLimit = count * 20;

  while (results.length < count) {
    const candidate = generatePassword(options);
    attempts += 1;
    const poolIsSmall = Math.pow(options.length >= 8 ? 36 : 10, 8) < count;
    if (poolIsSmall || !seen.has(candidate) || attempts > attemptLimit) {
      seen.add(candidate);
      results.push(candidate);
    }
  }
  return results;
}

export function passwordEntropyBits(password, options) {
  const { pool } = buildCharacterGroups(options);
  if (!password || pool.length < 2) return 0;
  return Math.round(password.length * Math.log2(pool.length));
}

export const PASSPHRASE_DEFAULTS = Object.freeze({
  wordCount: 6,
  separator: '-',
  capitalize: false,
  includeNumber: false,
});

export const MIN_WORDS = 3;
export const MAX_WORDS = 12;
export const MAX_SEPARATOR_LENGTH = 3;

export function generatePassphrase({
  wordCount = PASSPHRASE_DEFAULTS.wordCount,
  separator = '-',
  capitalize = false,
  includeNumber = false,
} = {}) {
  if (!Number.isInteger(wordCount) || wordCount < MIN_WORDS || wordCount > MAX_WORDS) {
    throw new Error(`Word count must be between ${MIN_WORDS} and ${MAX_WORDS}.`);
  }
  if (typeof separator !== 'string' || separator.length > MAX_SEPARATOR_LENGTH) {
    throw new Error('Separator must be 0–3 characters.');
  }

  const words = [];
  for (let i = 0; i < wordCount; i += 1) {
    const word = WORDLIST[randomInt(WORDLIST.length)];
    words.push(capitalize ? word.charAt(0).toUpperCase() + word.slice(1) : word);
  }

  let phrase = words.join(separator);
  if (includeNumber) {
    const number = String(randomInt(100)).padStart(2, '0');
    phrase += `${separator || ''}${number}`;
  }
  return phrase;
}

export function passphraseEntropyBits({ wordCount = 6, includeNumber = false } = {}) {
  const numeric = includeNumber ? Math.log2(100) : 0;
  return Math.round(wordCount * WORD_ENTROPY_BITS + numeric);
}
