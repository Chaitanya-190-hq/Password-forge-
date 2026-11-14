/**
 * Clipboard helper with an optional best-effort clear.
 *
 * Clearing the clipboard is a courtesy, not a guarantee: other apps may have
 * already read the value and browser/OS clipboard history can retain it.
 */
export async function copyText(text, { clearAfterMs = 0 } = {}) {
  if (typeof text !== 'string' || text.length === 0) {
    throw new Error('Nothing to copy.');
  }

  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
  } else {
    // Legacy fallback for non-secure contexts (e.g. plain http on localhost LAN).
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    if (!ok) throw new Error('Clipboard access was denied by the browser.');
  }

  if (clearAfterMs > 0) {
    setTimeout(() => {
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText('').catch(() => {});
      }
    }, clearAfterMs);
  }
}
