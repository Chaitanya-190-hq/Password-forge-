import { Link } from 'react-router-dom';
import { Database, Globe, Lock, ShieldCheck, WifiOff } from 'lucide-react';
import { BREACH_ENDPOINT } from '../lib/breach.js';
import { Badge, Notice, PageHeader, Panel, SectionTitle, cx } from '../components/ui.jsx';

const LOCAL_DATA = [
  {
    label: 'Generated passwords and passphrases',
    where: 'React state (memory)',
    persisted: 'No',
  },
  { label: 'Inspector input and analysis', where: 'React state (memory)', persisted: 'No' },
  { label: 'Audit samples', where: 'React state (memory)', persisted: 'No' },
  { label: 'Plaintext and passphrases in the Labs', where: 'React state (memory)', persisted: 'No' },
  { label: 'Derived vault key', where: 'SubtleCrypto CryptoKey in memory', persisted: 'No' },
  { label: 'Vault records', where: 'IndexedDB, AES-256-GCM ciphertext', persisted: 'Encrypted only' },
  { label: 'Vault metadata (salt, iteration count, verifier)', where: 'IndexedDB', persisted: 'Non-secret' },
  { label: 'Preferences (KDF cost, auto-lock, clipboard)', where: 'localStorage', persisted: 'Non-secret' },
  { label: 'Sidebar collapsed state', where: 'localStorage', persisted: 'Non-secret' },
  { label: 'Generated keys and tokens', where: 'React state (memory)', persisted: 'No' },
];

export default function Privacy() {
  return (
    <div>
      <PageHeader
        index="Reference — Privacy & data flow"
        title="What stays local, and what does not"
        description="Password Forge is a static application. There is no backend, no account system, no analytics and no telemetry. This page states precisely which data is processed where, including the single optional external request."
        actions={<Badge tone="success"><ShieldCheck size={11} /> no telemetry</Badge>}
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Panel>
            <SectionTitle
              title="Stays on this device"
              hint="Never transmitted, never logged, never written to a URL."
              action={<Lock size={15} className="text-success/70" aria-hidden="true" />}
            />
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11.5px]">
                <thead>
                  <tr className="border-b border-line text-[10px] uppercase tracking-[0.12em] text-muted/70">
                    <th className="pb-2 pr-4 font-medium">Data</th>
                    <th className="pb-2 pr-4 font-medium">Location</th>
                    <th className="pb-2 font-medium">Persisted</th>
                  </tr>
                </thead>
                <tbody>
                  {LOCAL_DATA.map((row) => (
                    <tr key={row.label} className="border-b border-line/60 last:border-0">
                      <td className="py-2 pr-4 text-parchment/85">{row.label}</td>
                      <td className="py-2 pr-4 font-mono text-[10.5px] text-muted">{row.where}</td>
                      <td
                        className={cx(
                          'py-2 font-mono text-[10.5px]',
                          row.persisted === 'No' ? 'text-success/80' : 'text-muted',
                        )}
                      >
                        {row.persisted}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-muted/75">
              Cleared browser state removes the stored items. Memory-only values are dropped when the tab is
              closed or reloaded, but JavaScript memory clearing cannot be proven to erase data from the
              browser process, swap files or OS caches.
            </p>
          </Panel>

          <Panel>
            <SectionTitle
              title="The one optional external request"
              hint="Breach check in the Password Inspector. Off by default."
              action={<Globe size={15} className="text-warn/70" aria-hidden="true" />}
            />
            <ol className="space-y-3 text-[12px] leading-relaxed text-muted">
              <li className="flex gap-3">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-line font-mono text-[10px] text-muted">
                  1
                </span>
                <span>
                  You type a password into the Inspector. It stays in memory. Nothing is sent while typing.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-line font-mono text-[10px] text-muted">
                  2
                </span>
                <span>
                  You tick an explicit consent checkbox, then press “Check breach exposure”. Without both
                  actions no request is made.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-line font-mono text-[10px] text-muted">
                  3
                </span>
                <span>
                  A SHA-1 hash is computed locally. Only its first five hexadecimal characters (a hash prefix,
                  roughly 20 bits) are appended to{' '}
                  <span className="font-mono text-[11px] text-parchment/80">{BREACH_ENDPOINT}</span>. The
                  password and the full hash never leave the browser.
                </span>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-line font-mono text-[10px] text-muted">
                  4
                </span>
                <span>
                  The service returns a list of hash suffixes and counts (with{' '}
                  <span className="font-mono text-[11px]">Add-Padding: true</span>). Matching happens locally.
                  The service does learn the prefix, your IP address and the time of the request.
                </span>
              </li>
            </ol>
            <Notice tone="warn" className="mt-4" title="What this reveals">
              An observer — the service, your network, or anyone able to read that traffic — learns that someone
              on this connection checked a password beginning with that hash prefix. It does not learn the
              password. If that risk is unacceptable, leave the feature unused; everything else works offline.
            </Notice>
            <p className="mt-3 text-[11px] leading-relaxed text-muted/75">
              No other feature performs network requests. There are no fonts, scripts, images or analytics
              loaded from third-party servers. The content security policy restricts connections to this origin
              plus the breach endpoint above.
            </p>
          </Panel>

          <Panel>
            <SectionTitle title="Hosting and logs" action={<WifiOff size={15} className="text-muted/60" aria-hidden="true" />} />
            <p className="text-[12px] leading-relaxed text-muted">
              The app is served as static files from GitHub Pages. Like any web host, GitHub receives standard
              request data (IP address, user agent, requested file) when the page loads. That is unavoidable for
              any website and contains none of your inputs.
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-muted">
              There are no cookies, no service worker, no fingerprinting scripts and no third-party resources.
              Passwords are never placed in a URL, a hash fragment, a page title or browser history.
            </p>
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel>
            <SectionTitle title="Commitments" />
            <ul className="space-y-3 text-[12px] leading-relaxed text-muted">
              {[
                'No account, sign-in or email collection.',
                'No analytics, telemetry, session recording or ads.',
                'No server that receives plaintext, passphrases or keys.',
                'No dark-pattern retention: generated values are not auto-saved.',
                'No secret in environment variables or source control.',
              ].map((line) => (
                <li key={line} className="flex gap-2">
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-success/70" />
                  {line}
                </li>
              ))}
            </ul>
          </Panel>

          <Panel>
            <SectionTitle title="Practical limits" />
            <ul className="space-y-3 text-[11.5px] leading-relaxed text-muted">
              <li>
                <span className="text-parchment/85">Clipboard.</span> Copied secrets are visible to other
                applications and may persist in clipboard history. Auto-clear is best effort.
              </li>
              <li>
                <span className="text-parchment/85">Device compromise.</span> Malware, extensions and keyloggers
                see data before this app can protect it.
              </li>
              <li>
                <span className="text-parchment/85">Browser storage.</span> Clearing site data deletes the
                vault. Export encrypted backups.
              </li>
              <li>
                <span className="text-parchment/85">No recovery.</span> Passphrases are never stored, so they
                cannot be reset by anyone.
              </li>
            </ul>
          </Panel>

          <Panel>
            <SectionTitle title="Delete your data" />
            <p className="text-[11.5px] leading-relaxed text-muted">
              Remove the vault from Settings, then clear site data in your browser for a complete removal on this
              device.
            </p>
            <Link to="/settings" className="link-gold mt-3 inline-block text-[11.5px]">
              Open Settings →
            </Link>
            <div className="mt-4 flex items-center gap-2">
              <Database size={13} className="text-muted/60" aria-hidden="true" />
              <span className="font-mono text-[10.5px] text-muted/70">password-forge-vault · local only</span>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
