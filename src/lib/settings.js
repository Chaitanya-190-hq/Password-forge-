import { DEFAULT_ITERATIONS } from './crypto.js';

/**
 * Non-sensitive preferences only. No secrets, vault data, generated passwords
 * or derived keys are ever stored here.
 */

const STORAGE_KEY = 'password-forge.settings.v1';

export const DEFAULT_SETTINGS = Object.freeze({
  defaultIterations: DEFAULT_ITERATIONS,
  autoLockEnabled: true,
  autoLockMinutes: 5,
  clearClipboard: true,
  clipboardClearSeconds: 20,
  revealByDefault: false,
});

export const AUTO_LOCK_OPTIONS = [1, 2, 5, 10, 15, 30];

export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return sanitizeSettings(parsed);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function sanitizeSettings(value) {
  const input = value && typeof value === 'object' ? value : {};
  const iterations = Number(input.defaultIterations);
  return {
    defaultIterations:
      Number.isInteger(iterations) && iterations >= 100_000 && iterations <= 3_000_000
        ? iterations
        : DEFAULT_SETTINGS.defaultIterations,
    autoLockEnabled:
      typeof input.autoLockEnabled === 'boolean' ? input.autoLockEnabled : DEFAULT_SETTINGS.autoLockEnabled,
    autoLockMinutes: AUTO_LOCK_OPTIONS.includes(Number(input.autoLockMinutes))
      ? Number(input.autoLockMinutes)
      : DEFAULT_SETTINGS.autoLockMinutes,
    clearClipboard:
      typeof input.clearClipboard === 'boolean' ? input.clearClipboard : DEFAULT_SETTINGS.clearClipboard,
    clipboardClearSeconds:
      Number.isInteger(Number(input.clipboardClearSeconds)) && Number(input.clipboardClearSeconds) >= 5
        ? Math.min(120, Number(input.clipboardClearSeconds))
        : DEFAULT_SETTINGS.clipboardClearSeconds,
    revealByDefault:
      typeof input.revealByDefault === 'boolean' ? input.revealByDefault : DEFAULT_SETTINGS.revealByDefault,
  };
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeSettings(settings)));
    return true;
  } catch {
    return false;
  }
}

export function clearSettings() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage may be unavailable — nothing to clear */
  }
}
