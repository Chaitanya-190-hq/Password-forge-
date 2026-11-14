import { WORDLIST } from './wordlist.js';
import { CHARSETS } from './passwords.js';

/**
 * Local, heuristic password analysis.
 *
 * These are pattern checks, not a security guarantee. A high score means "no
 * obvious weakness was detected by these rules", never "this password is safe".
 * Passwords analysed here are never persisted or logged.
 */

const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', 'passw0rd', 'p@ssw0rd', 'p@ssword', 'letmein',
  'letmein1', 'welcome', 'welcome1', 'welcome123', 'admin', 'admin123', 'administrator',
  'qwerty', 'qwerty123', 'qwertyuiop', 'asdfgh', 'asdfghjkl', 'zxcvbn', 'zxcvbnm',
  'iloveyou', 'monkey', 'dragon', 'football', 'baseball', 'basketball', 'superman',
  'batman', 'master', 'sunshine', 'princess', 'shadow', 'michael', 'jennifer',
  'trustno1', 'secret', 'abc123', '123456', '1234567', '12345678', '123456789',
  '1234567890', '111111', '000000', '654321', '121212', '1q2w3e4r', '1qaz2wsx',
  'qazwsx', 'zaq12wsx', 'login', 'starwars', 'whatever', 'freedom', 'changeme',
  'default', 'root', 'toor', 'guest', 'temp', 'test', 'test123', 'demo',
]);

const LEET_DIGITS = {
  '0': 'o',
  '1': 'l',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '8': 'b',
  '9': 'g',
};

const LEET_SYMBOLS = {
  '@': 'a',
  '$': 's',
  '!': 'i',
  '+': 't',
  '|': 'l',
  '(': 'c',
  '*': 'a',
  '#': 'h',
};

const KEYBOARD_ROWS = [
  'qwertyuiop',
  'asdfghjkl',
  'zxcvbnm',
  '1234567890',
  '!@#$%^&*()',
  'QWERTYUIOP',
  'ASDFGHJKL',
  'ZXCVBNM',
];

const DICTIONARY = new Set(WORDLIST.filter((word) => word.length >= 5));

export const STRENGTH_LABELS = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'];

export const STRENGTH_TONE = ['danger', 'danger', 'warn', 'success', 'success'];

export function normalizeLeet(value) {
  return Array.from(value.toLowerCase())
    .map((char) => LEET_DIGITS[char] || LEET_SYMBOLS[char] || char)
    .join('');
}

export function characterCategories(password) {
  const chars = Array.from(password);
  return {
    lower: chars.filter((c) => CHARSETS.lower.includes(c)).length,
    upper: chars.filter((c) => CHARSETS.upper.includes(c)).length,
    numbers: chars.filter((c) => CHARSETS.numbers.includes(c)).length,
    symbols: chars.filter((c) => CHARSETS.symbols.includes(c)).length,
    other: chars.filter(
      (c) =>
        !CHARSETS.lower.includes(c) &&
        !CHARSETS.upper.includes(c) &&
        !CHARSETS.numbers.includes(c) &&
        !CHARSETS.symbols.includes(c),
    ).length,
  };
}

export function poolSize(categories) {
  let size = 0;
  if (categories.lower) size += 26;
  if (categories.upper) size += 26;
  if (categories.numbers) size += 10;
  if (categories.symbols) size += CHARSETS.symbols.length;
  if (categories.other) size += 40; // approximate for non-ASCII characters
  return size;
}

/** Runs of the same character, e.g. "aaaa". */
function repeatedCharacterRuns(password) {
  const runs = [];
  const chars = Array.from(password);
  let start = 0;
  for (let i = 1; i <= chars.length; i += 1) {
    if (i === chars.length || chars[i] !== chars[start]) {
      const length = i - start;
      if (length >= 3) runs.push({ char: chars[start], length, index: start });
      start = i;
    }
  }
  return runs;
}

/** Immediately repeated blocks, e.g. "abcabc" or "12ab12ab". */
function repeatedBlocks(password) {
  const matches = [];
  const chars = Array.from(password);
  for (let block = 2; block <= Math.min(8, Math.floor(chars.length / 2)); block += 1) {
    for (let i = 0; i + block * 2 <= chars.length; i += 1) {
      const unit = chars.slice(i, i + block).join('');
      let repeats = 1;
      let cursor = i + block;
      while (chars.slice(cursor, cursor + block).join('') === unit) {
        repeats += 1;
        cursor += block;
      }
      if (repeats >= 2) {
        matches.push({ unit, repeats, index: i });
        i = cursor - 1;
      }
    }
  }
  return matches;
}

/** Ascending or descending runs of 4+ characters, e.g. "abcd", "9876". */
function characterSequences(password) {
  const chars = Array.from(password);
  const runs = [];
  let start = 0;

  while (start < chars.length - 3) {
    const direction = Math.sign(chars[start + 1].codePointAt(0) - chars[start].codePointAt(0));
    let end = start + 1;
    if (direction !== 0) {
      while (
        end + 1 < chars.length &&
        Math.sign(chars[end + 1].codePointAt(0) - chars[end].codePointAt(0)) === direction
      ) {
        end += 1;
      }
    }
    if (end - start + 1 >= 4) runs.push(chars.slice(start, end + 1).join(''));
    start = Math.max(end, start + 1);
  }

  return runs;
}

/** Adjacent keys on the same keyboard row, e.g. "qwer" or "hjkl". */
function keyboardRuns(password) {
  const runs = [];
  for (const row of KEYBOARD_ROWS) {
    for (let i = 0; i + 3 < password.length; i += 1) {
      const slice = password.slice(i, i + 4);
      if (row.includes(slice)) runs.push(slice);
      const reversed = Array.from(slice).reverse().join('');
      if (row.includes(reversed)) runs.push(reversed);
    }
  }
  return Array.from(new Set(runs));
}

/**
 * Normalise visible substitutions for dictionary comparison. Symbols at the very
 * start or end are treated as punctuation ("P@ssw0rd!" → "password") rather than
 * letter substitutes, which is how people actually decorate passwords.
 */
function normalizeForDictionary(value) {
  const chars = Array.from(value.toLowerCase());
  return chars
    .map((char, index) => {
      const atBoundary = index === 0 || index === chars.length - 1;
      if (atBoundary && LEET_SYMBOLS[char]) return '';
      return LEET_DIGITS[char] || LEET_SYMBOLS[char] || char;
    })
    .join('');
}

function dictionaryMatches(password) {
  const base = password.toLowerCase();
  const withoutTrailingDigits = base.replace(/\d+$/, '');
  const candidates = new Set([
    base,
    normalizeLeet(password),
    normalizeForDictionary(password),
    withoutTrailingDigits,
    normalizeForDictionary(withoutTrailingDigits),
  ]);

  const matches = new Set();

  for (const candidate of candidates) {
    const compact = candidate.replace(/[^a-z]/g, '');
    if (COMMON_PASSWORDS.has(candidate)) matches.add(candidate);
    if (compact && COMMON_PASSWORDS.has(compact)) matches.add(compact);
    if (compact.length >= 5 && DICTIONARY.has(compact)) matches.add(compact);
  }

  const primary = normalizeForDictionary(withoutTrailingDigits).replace(/[^a-z]/g, '');
  for (const word of DICTIONARY) {
    if (word.length < 5) continue;
    if (primary !== word && primary.includes(word)) matches.add(word);
    if (matches.size >= 6) break;
  }

  return Array.from(matches);
}

function findYears(password) {
  return password.match(/(?:19|20)\d{2}/g) || [];
}

/**
 * Analyse a password. Returns metrics plus human-readable findings and advice.
 */
export function analyzePassword(password) {
  if (typeof password !== 'string' || password.length === 0) {
    return null;
  }

  const chars = Array.from(password);
  const length = chars.length;
  const uniqueCount = new Set(chars).size;
  const categories = characterCategories(password);
  const activeCategories = ['lower', 'upper', 'numbers', 'symbols'].filter((key) => categories[key] > 0);
  const size = poolSize(categories);
  const naiveEntropyBits = size > 1 ? Math.round(length * Math.log2(size)) : 0;

  const repeatRuns = repeatedCharacterRuns(password);
  const blocks = repeatedBlocks(password);
  const sequences = characterSequences(password);
  const keyboard = keyboardRuns(password);
  const dictionary = dictionaryMatches(password);
  const years = findYears(password);

  const findings = [];
  const suggestions = [];
  let penalty = 0;

  const isCommon = dictionary.some((word) => COMMON_PASSWORDS.has(word));
  const longestRepeat = repeatRuns.reduce((max, run) => Math.max(max, run.length), 0);
  const hadSubstitutions = normalizeForDictionary(password) !== password.toLowerCase();

  if (isCommon) {
    findings.push({
      severity: 'high',
      title: 'Known or common password pattern',
      detail: `This resembles a widely used password${dictionary.length ? ` ("${dictionary[0]}")` : ''}.${
        hadSubstitutions
          ? ' Predictable character substitutions (@ for a, 0 for o, ! for i …) were normalised before matching, and they do not make a common password uncommon.'
          : ''
      } Common passwords are the first candidates in any guessing attack.`,
    });
    penalty += 40;
  }

  if (length < 8) {
    findings.push({
      severity: 'high',
      title: 'Very short password',
      detail: `${length} characters can be exhausted quickly, even with a mixed character set.`,
    });
    penalty += 20;
  } else if (length < 12) {
    findings.push({
      severity: 'medium',
      title: 'Short password',
      detail: `${length} characters is below the 12–16 character range recommended for passwords used with modern hashing.`,
    });
    penalty += 10;
  } else if (length < 16) {
    findings.push({
      severity: 'low',
      title: 'Moderate length',
      detail: '12–15 characters is acceptable for many services; 16 or more gives a wider safety margin.',
    });
    penalty += 2;
  }

  if (activeCategories.length <= 1) {
    findings.push({
      severity: 'high',
      title: 'Single character category',
      detail: 'Only one character type is used, which shrinks the search space substantially.',
    });
    penalty += 12;
  } else if (activeCategories.length === 2) {
    findings.push({
      severity: 'medium',
      title: 'Limited character diversity',
      detail: `Only ${activeCategories.length} character categories are present (${activeCategories.join(', ')}).`,
    });
    penalty += 6;
  }

  if (longestRepeat >= 3) {
    findings.push({
      severity: 'medium',
      title: 'Repeated character run',
      detail: `A character repeats ${longestRepeat} times in a row. Repetition adds length without adding real uncertainty.`,
    });
    penalty += 8;
  }

  if (blocks.length > 0) {
    const block = blocks.sort((a, b) => b.repeats * b.unit.length - a.repeats * a.unit.length)[0];
    findings.push({
      severity: 'high',
      title: 'Repeated sequence',
      detail: `The pattern "${block.unit}" appears ${block.repeats} times consecutively. Attackers test repeated blocks early.`,
    });
    penalty += 14;
  }

  if (sequences.length > 0) {
    findings.push({
      severity: 'medium',
      title: 'Sequential characters',
      detail: `Sequences such as "${sequences[0]}" are easy to guess and are included in every cracking dictionary.`,
    });
    penalty += 10;
  }

  if (keyboard.length > 0) {
    findings.push({
      severity: 'medium',
      title: 'Keyboard pattern',
      detail: `Adjacent keys like "${keyboard[0]}" follow the physical keyboard layout and are heavily represented in attack wordlists.`,
    });
    penalty += 10;
  }

  if (dictionary.length > 0 && !isCommon) {
    findings.push({
      severity: 'low',
      title: 'Dictionary-like word or predictable substitution',
      detail: `After normalising visible substitutions (0→o, @→a, $→s, !→i …), this contains "${dictionary[0]}". Substituting characters for letters is a well-known pattern, not real complexity.`,
    });
    penalty += 12;
  }

  if (years.length > 0) {
    findings.push({
      severity: 'low',
      title: 'Year or date fragment',
      detail: `"${years[0]}" looks like a year. Dates and years are among the first suffixes guessed.`,
    });
    penalty += 5;
  }

  if (uniqueCount > 0 && uniqueCount <= Math.max(3, Math.ceil(length / 4))) {
    findings.push({
      severity: 'medium',
      title: 'Low character variety',
      detail: `Only ${uniqueCount} distinct characters make up ${length} positions.`,
    });
    penalty += 8;
  }

  // Suggestions
  if (length < 16) suggestions.push('Increase the length to at least 16 characters — length helps more than exotic symbols.');
  if (activeCategories.length < 4) suggestions.push('Use a mix of upper case, lower case, numbers and symbols.');
  if (sequences.length > 0) suggestions.push('Remove sequential runs (abc, 123, qwerty) and randomise instead.');
  if (blocks.length > 0 || longestRepeat >= 3) suggestions.push('Avoid repeating characters or blocks; each position should be independently random.');
  if (dictionary.length > 0) suggestions.push('Avoid words and predictable substitutions — a generator with a real word list plus random separators is stronger.');
  if (years.length > 0) suggestions.push('Do not append years, birthdays or anniversaries.');
  if (uniqueCount < 10 && length >= 12) suggestions.push('Use more distinct characters across the whole password.');
  if (suggestions.length === 0) suggestions.push('Store this in a password manager and give every account a unique value.');
  suggestions.push('Never reuse this password on another service, and enable multi-factor authentication where offered.');

  // Adjusted entropy: naive entropy is an upper bound; pattern penalties reduce it.
  let adjustedBits = Math.max(0, naiveEntropyBits - penalty);
  if (isCommon) adjustedBits = Math.min(adjustedBits, 8);
  if (blocks.length > 0) adjustedBits = Math.min(adjustedBits, Math.round(naiveEntropyBits * 0.6));

  let score;
  if (isCommon || length < 8) score = 0;
  else if (adjustedBits < 32) score = 1;
  else if (adjustedBits < 50) score = 2;
  else if (adjustedBits < 70) score = 3;
  else score = 4;

  if (activeCategories.length <= 1 && score > 2) score = 2;

  return {
    length,
    uniqueCount,
    categories,
    activeCategories,
    poolSize: size,
    naiveEntropyBits,
    adjustedEntropyBits: Math.round(adjustedBits),
    score,
    label: STRENGTH_LABELS[score],
    findings,
    suggestions,
    patterns: {
      repeatedRuns: repeatRuns,
      repeatedBlocks: blocks,
      sequences,
      keyboard,
      dictionary,
      years,
    },
    disclaimer:
      'Estimated entropy is a heuristic upper bound derived from length and character pool, adjusted for detected patterns. It cannot prove how resistant a password is to guessing, credential stuffing or targeted attacks.',
  };
}

export function comparePasswords(a, b) {
  return typeof a === 'string' && typeof b === 'string' && a === b;
}
