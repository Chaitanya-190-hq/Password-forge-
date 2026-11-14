import { useEffect, useState } from 'react';

/**
 * Progressive web app plumbing: service worker registration and the browser
 * install prompt. Nothing here touches user data.
 */

let deferredPrompt = null;
let installedThisSession = false;
const listeners = new Set();

export function isStandalone() {
  if (typeof window === 'undefined') return false;
  const displayMode = window.matchMedia?.('(display-mode: standalone)').matches;
  return Boolean(displayMode || window.navigator.standalone);
}

export function installSnapshot() {
  const supported = typeof window !== 'undefined' && 'onbeforeinstallprompt' in window;
  return {
    canInstall: Boolean(deferredPrompt),
    installed: isStandalone() || installedThisSession,
    supported,
    serviceWorkerSupported: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
  };
}

function emit() {
  const snapshot = installSnapshot();
  listeners.forEach((listener) => listener(snapshot));
}

/** Register once from the app entry point (production builds only). */
export function initPwa() {
  if (typeof window === 'undefined') return;

  window.addEventListener('beforeinstallprompt', (event) => {
    // Keep the prompt for an explicit "Install" action instead of interrupting.
    event.preventDefault();
    deferredPrompt = event;
    emit();
  });

  window.addEventListener('appinstalled', () => {
    installedThisSession = true;
    deferredPrompt = null;
    emit();
  });

  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', emit);

  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      // Relative to the document, so the scope is /<repo>/ on GitHub Pages.
      const swUrl = new URL('sw.js', document.baseURI).href;
      navigator.serviceWorker.register(swUrl).catch(() => {
        /* Installation is an enhancement; the app works without it. */
      });
    });
  }
}

export function subscribeInstall(listener) {
  listeners.add(listener);
  listener(installSnapshot());
  return () => listeners.delete(listener);
}

/** Show the browser's install dialog. Returns 'accepted' | 'dismissed' | 'unavailable'. */
export async function promptInstall() {
  if (!deferredPrompt) return 'unavailable';
  const prompt = deferredPrompt;
  deferredPrompt = null;
  await prompt.prompt();
  const choice = await prompt.userChoice;
  emit();
  return choice?.outcome || 'dismissed';
}

export function useInstallPrompt() {
  const [state, setState] = useState(() => installSnapshot());
  useEffect(() => subscribeInstall(setState), []);
  return {
    ...state,
    install: promptInstall,
  };
}
