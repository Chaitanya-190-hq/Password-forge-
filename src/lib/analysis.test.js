import { describe, expect, it } from 'vitest';
import { analyzePassword, normalizeLeet } from './analysis.js';

describe('password analysis', () => {
  it('returns null for empty input', () => {
    expect(analyzePassword('')).toBeNull();
    expect(analyzePassword(null)).toBeNull();
  });

  it('measures length, uniqueness and categories', () => {
    const result = analyzePassword('aB3$xY9!qZ7');
    expect(result.length).toBe(11);
    expect(result.uniqueCount).toBe(11);
    expect(result.categories.lower).toBeGreaterThan(0);
    expect(result.categories.upper).toBeGreaterThan(0);
    expect(result.categories.numbers).toBeGreaterThan(0);
    expect(result.categories.symbols).toBeGreaterThan(0);
    expect(result.activeCategories).toHaveLength(4);
    expect(result.naiveEntropyBits).toBeGreaterThan(50);
  });

  it('flags a common password and caps its score', () => {
    const result = analyzePassword('password');
    expect(result.score).toBe(0);
    expect(result.findings.some((finding) => /common/i.test(finding.title))).toBe(true);
  });

  it('flags predictable leetspeak substitutions as dictionary-like', () => {
    const result = analyzePassword('P@ssw0rd!');
    const explained = result.findings.map((finding) => `${finding.title} ${finding.detail}`).join(' ');
    expect(explained).toMatch(/substitution|dictionary/i);
    expect(result.score).toBe(0);
    expect(normalizeLeet('P@ssw0rd')).toContain('password');
  });

  it('detects repeated characters and repeated blocks', () => {
    const repeatedChars = analyzePassword('aaaaaaaaaaaa');
    expect(repeatedChars.patterns.repeatedRuns.length).toBeGreaterThan(0);

    const repeatedBlock = analyzePassword('Xk9!Xk9!Xk9!Xk9!');
    expect(repeatedBlock.patterns.repeatedBlocks.length).toBeGreaterThan(0);
    expect(repeatedBlock.findings.some((finding) => /Repeated sequence/i.test(finding.title))).toBe(true);
  });

  it('detects sequential and keyboard patterns', () => {
    const sequential = analyzePassword('abcdefgh1234');
    expect(sequential.patterns.sequences.length).toBeGreaterThan(0);
    expect(sequential.findings.some((finding) => /Sequential/i.test(finding.title))).toBe(true);

    const keyboard = analyzePassword('qwertyuiopas');
    expect(keyboard.patterns.keyboard.length).toBeGreaterThan(0);
    expect(keyboard.findings.some((finding) => /Keyboard/i.test(finding.title))).toBe(true);
  });

  it('detects years and date fragments', () => {
    const result = analyzePassword('Nimbus-1998-Ridge');
    expect(result.patterns.years).toContain('1998');
    expect(result.findings.some((finding) => /year/i.test(finding.title))).toBe(true);
  });

  it('recommends more length for short passwords', () => {
    const result = analyzePassword('Xk9!');
    expect(result.findings.some((finding) => /short/i.test(finding.title))).toBe(true);
    expect(result.suggestions.some((suggestion) => /length|16/i.test(suggestion))).toBe(true);
    expect(result.score).toBeLessThan(3);
  });

  it('flags single-category passwords for low diversity', () => {
    const result = analyzePassword('lowercaseonlypassword');
    expect(result.findings.some((finding) => /category|diversity/i.test(finding.title))).toBe(true);
    expect(result.score).toBeLessThanOrEqual(2);
  });

  it('produces a bounded, explained estimate with a disclaimer', () => {
    const result = analyzePassword('vT7#qL2!wR9@zM4$xK8&');
    expect(result.adjustedEntropyBits).toBeLessThanOrEqual(result.naiveEntropyBits + 1);
    expect(result.adjustedEntropyBits).toBeGreaterThanOrEqual(0);
    expect(result.disclaimer).toMatch(/heuristic/i);
    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  it('always returns an actionable suggestion list', () => {
    const result = analyzePassword('correct-horse-battery-staple-91!');
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.suggestions.join(' ')).toMatch(/reuse|multi-factor|manager/i);
  });

  it('does not persist anything (pure function)', () => {
    const password = 'Temporary!Value9';
    const first = analyzePassword(password);
    const second = analyzePassword(password);
    expect(first.length).toBe(second.length);
    expect(typeof localStorage).toBe('undefined');
  });
});
