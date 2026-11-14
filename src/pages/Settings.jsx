import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  Database,
  Download,
  Gauge,
  MonitorSmartphone,
  RefreshCw,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { ITERATION_OPTIONS, measureKdf } from '../lib/crypto.js';
import { AUTO_LOCK_OPTIONS } from '../lib/settings.js';
import { destroyVault, vaultInfo } from '../lib/vault.js';
import { useInstallPrompt } from '../lib/pwa.js';
import { useSettings } from '../components/SettingsContext.jsx';
import { useToast } from '../components/Toast.jsx';
import {
  Badge,
  Button,
  Field,
  KeyValue,
  Modal,
  Notice,
  PageHeader,
  Panel,
  SectionTitle,
  Select,
  Switch,
  TextInput,
  cx,
} from '../components/ui.jsx';

function SupportRow({ label, ok, detail }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line/60 py-2 last:border-0">
      <div>
        <p className="text-[12px] text-parchment/85">{label}</p>
        {detail && <p className="mt-0.5 font-mono text-[10.5px] text-muted/70">{detail}</p>}
      </div>
      <Badge tone={ok ? 'success' : 'danger'}>{ok ? 'available' : 'unavailable'}</Badge>
    </div>
  );
}

export default function Settings() {
  const { settings, update, reset } = useSettings();
  const { notify } = useToast();
  const [benchmark, setBenchmark] = useState({ busy: false, ms: null, iterations: null });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const install = useInstallPrompt();

  const support = {
    subtle: typeof crypto !== 'undefined' && Boolean(crypto.subtle),
    random: typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function',
    indexedDb: typeof indexedDB !== 'undefined',
    wasm: typeof WebAssembly === 'object',
    secureContext: typeof window !== 'undefined' ? window.isSecureContext : false,
    clipboard: typeof navigator !== 'undefined' && Boolean(navigator.clipboard),
  };

  async function runBenchmark() {
    setBenchmark({ busy: true, ms: null, iterations: settings.defaultIterations });
    try {
      const ms = await measureKdf(settings.defaultIterations);
      setBenchmark({ busy: false, ms: Math.round(ms), iterations: settings.defaultIterations });
    } catch {
      setBenchmark({ busy: false, ms: null, iterations: settings.defaultIterations });
      notify('Key-derivation benchmark failed in this browser.', 'danger');
    }
  }

  function recommendation() {
    if (benchmark.ms === null) return null;
    if (benchmark.ms < 200) {
      return { tone: 'warn', text: 'Very fast on this device. You could safely raise the iteration count for more resistance to offline guessing.' };
    }
    if (benchmark.ms < 1200) {
      return { tone: 'success', text: 'Comfortable for interactive use on this device. Keep 600,000 or higher.' };
    }
    return {
      tone: 'warn',
      text: 'Slow on this device. On mobile hardware this may take several seconds — a lower count may be more usable, but it reduces guessing resistance.',
    };
  }

  async function handleDeleteVault() {
    if (deleteConfirm !== 'DELETE') return;
    setBusy(true);
    try {
      await destroyVault();
      const info = await vaultInfo();
      notify(info.exists ? 'Vault deletion did not complete.' : 'Encrypted vault deleted.', info.exists ? 'danger' : 'info');
      setDeleteOpen(false);
      setDeleteConfirm('');
    } catch (caught) {
      notify(caught.message || 'Could not delete the vault.', 'danger');
    } finally {
      setBusy(false);
    }
  }

  async function handleInstall() {
    const outcome = await install.install();
    if (outcome === 'accepted') notify('Installation started. The app will open in its own window.', 'success');
    else if (outcome === 'dismissed') notify('Installation dismissed. You can install later from the browser menu.', 'info');
    else notify('Use your browser menu to install this app.', 'info');
  }

  const rec = recommendation();

  return (
    <div>
      <PageHeader
        index="Workspace 11 — Settings"
        title="Local preferences"
        description="Only non-sensitive preferences are stored here. No secret, passphrase, derived key or vault record is ever written to these settings."
        actions={
          <Badge tone="gold">
            <ShieldCheck size={11} /> local only
          </Badge>
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <Panel>
            <SectionTitle
              title="Cryptography defaults"
              hint="Applied to new encryptions and new vaults. Existing payloads keep their own stored parameters."
              action={<Gauge size={15} className="text-muted/60" aria-hidden="true" />}
            />
            <Field label="Default PBKDF2 iteration count">
              <Select
                value={settings.defaultIterations}
                onChange={(event) => update({ defaultIterations: Number(event.target.value) })}
                aria-label="Default PBKDF2 iteration count"
              >
                {ITERATION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="mt-4 rounded-lg border border-line bg-ink/40 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[12px] text-parchment/85">Measure on this device</p>
                  <p className="mt-0.5 text-[11px] text-muted">
                    Times one key derivation at {settings.defaultIterations.toLocaleString()} iterations.
                  </p>
                </div>
                <Button variant="secondary" size="sm" icon={Activity} onClick={runBenchmark} loading={benchmark.busy}>
                  Benchmark
                </Button>
              </div>
              {benchmark.ms !== null && (
                <div className="mt-3">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-[22px] text-gold">{benchmark.ms}</span>
                    <span className="text-[11.5px] text-muted">ms for {benchmark.iterations?.toLocaleString()} iterations</span>
                  </div>
                  {rec && (
                    <p
                      className={cx(
                        'mt-1.5 text-[11px] leading-relaxed',
                        rec.tone === 'success' ? 'text-success/90' : 'text-warn/90',
                      )}
                    >
                      {rec.text}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="mt-4">
              <Switch
                checked={settings.autoLockEnabled}
                onChange={(autoLockEnabled) => update({ autoLockEnabled })}
                label="Auto-lock the vault after inactivity"
                description="Drops the in-memory key and clears decrypted records."
              />
              {settings.autoLockEnabled && (
                <Field label="Idle timeout">
                  <Select
                    value={settings.autoLockMinutes}
                    onChange={(event) => update({ autoLockMinutes: Number(event.target.value) })}
                    aria-label="Auto-lock idle timeout"
                  >
                    {AUTO_LOCK_OPTIONS.map((minutes) => (
                      <option key={minutes} value={minutes}>
                        {minutes} minute{minutes === 1 ? '' : 's'}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
            </div>
          </Panel>

          <Panel>
            <SectionTitle title="Display and clipboard" action={<Settings2 size={15} className="text-muted/60" aria-hidden="true" />} />
            <Switch
              checked={settings.revealByDefault}
              onChange={(revealByDefault) => update({ revealByDefault })}
              label="Reveal new values by default"
              description="Applies to freshly generated passwords in Password Forge. Hidden values are the safer default."
            />
            <div className="hairline my-1" />
            <Switch
              checked={settings.clearClipboard}
              onChange={(clearClipboard) => update({ clearClipboard })}
              label="Try to clear the clipboard after copying"
              description="Best effort only: other apps may already have read it, and clipboard history can retain it."
            />
            {settings.clearClipboard && (
              <Field label="Clear after (seconds)" className="mt-2">
                <TextInput
                  type="number"
                  min={5}
                  max={120}
                  value={settings.clipboardClearSeconds}
                  onChange={(event) => {
                    const value = Math.min(120, Math.max(5, Number(event.target.value) || 20));
                    update({ clipboardClearSeconds: value });
                  }}
                  aria-label="Clipboard clear delay in seconds"
                />
              </Field>
            )}
          </Panel>

          <Panel>
            <SectionTitle title="Reset preferences" />
            <p className="text-[11.5px] leading-relaxed text-muted">
              Restores defaults for cost, auto-lock, clipboard and reveal behaviour. Vault data and encrypted
              backups are not affected.
            </p>
            <Button
              variant="ghost"
              size="sm"
              icon={RotateCcw}
              className="mt-3"
              onClick={() => {
                reset();
                notify('Preferences reset to defaults.', 'info');
              }}
            >
              Reset settings
            </Button>
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel>
            <SectionTitle
              title="Install as an app"
              hint="Adds Password Forge to your desktop or home screen and enables offline use."
              action={<MonitorSmartphone size={15} className="text-muted/60" aria-hidden="true" />}
            />
            {install.installed ? (
              <Notice tone="success" title="Running as an installed app">
                Password Forge is in standalone mode with the app shell cached. Reload while online to receive
                an update; your vault and settings are unaffected.
              </Notice>
            ) : (
              <>
                <p className="text-[12px] leading-relaxed text-muted">
                  Installing launches Password Forge in its own window and lets it run offline. It stays the same
                  local-only application: no account, no store listing, no server.
                </p>
                {install.canInstall ? (
                  <Button variant="primary" icon={Download} className="mt-4" onClick={handleInstall}>
                    Install Password Forge
                  </Button>
                ) : (
                  <div className="mt-4 space-y-2 rounded-lg border border-line bg-ink/40 px-3.5 py-3 text-[11.5px] leading-relaxed text-muted">
                    <p className="text-parchment/85">Install from your browser</p>
                    <p>Chrome / Edge: use the install icon in the address bar, or Menu → Apps → Install this site as an app.</p>
                    <p>Safari on macOS: File → Add to Dock. On iPhone or iPad: Share → Add to Home Screen.</p>
                    {!install.serviceWorkerSupported && (
                      <p className="text-warn/90">
                        This browser does not support service workers, so offline use is unavailable.
                      </p>
                    )}
                  </div>
                )}
              </>
            )}
          </Panel>

          <Panel>
            <SectionTitle title="Environment" hint="Capabilities checked in this tab, right now." />
            <div>
              <SupportRow label="Web Crypto (SubtleCrypto)" ok={support.subtle} detail="AES-GCM, PBKDF2, digests, HMAC" />
              <SupportRow label="Secure random (getRandomValues)" ok={support.random} detail="CSPRNG for all generators" />
              <SupportRow label="IndexedDB" ok={support.indexedDb} detail="'password-forge-vault'" />
              <SupportRow label="WebAssembly" ok={support.wasm} detail="Argon2id via hash-wasm" />
              <SupportRow label="Secure context (HTTPS)" ok={support.secureContext} detail="required for clipboard API" />
              <SupportRow label="Async clipboard" ok={support.clipboard} detail="navigator.clipboard" />
            </div>
            <Notice tone="info" compact className="mt-4">
              If Web Crypto is unavailable the encryption, hashing and key workspaces cannot operate. Some
              browsers restrict these APIs on plain HTTP origins — GitHub Pages serves HTTPS.
            </Notice>
          </Panel>

          <Panel>
            <SectionTitle title="Data stored on this device" action={<Database size={15} className="text-muted/60" aria-hidden="true" />} />
            <KeyValue
              items={[
                { label: 'Vault database', value: 'password-forge-vault' },
                { label: 'Preferences key', value: 'password-forge.settings.v1' },
                { label: 'Sidebar state', value: 'password-forge.sidebar.collapsed' },
                { label: 'Analytics', value: 'none' },
                { label: 'Cookies', value: 'none' },
                { label: 'Service worker', value: 'app-shell cache' },
              ]}
            />
            <p className="mt-3 text-[11px] leading-relaxed text-muted/80">
              Search, audit samples and decrypted vault records exist only in memory and are lost on reload.
            </p>
          </Panel>

          <Panel className="border-danger/20">
            <SectionTitle title="Delete local data" hint="Irreversible." />
            <div className="space-y-3">
              <div className="rounded-lg border border-line bg-ink/40 p-3.5">
                <p className="text-[12px] text-parchment/85">Encrypted vault</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
                  Removes the IndexedDB database, every ciphertext row and the vault verifier. Exported backups
                  stay valid elsewhere.
                </p>
                <Button
                  variant="danger"
                  size="sm"
                  icon={Trash2}
                  className="mt-3"
                  onClick={() => setDeleteOpen(true)}
                >
                  Delete vault data…
                </Button>
              </div>
              <div className="rounded-lg border border-line bg-ink/40 p-3.5">
                <p className="text-[12px] text-parchment/85">Everything in this browser</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
                  Also use your browser’s “clear site data” to remove local storage entries this app cannot
                  reach after the fact.
                </p>
              </div>
            </div>
          </Panel>

          <Panel>
            <SectionTitle title="About" />
            <KeyValue
              items={[
                { label: 'Application', value: 'Password Forge 1.0.0' },
                { label: 'Build', value: 'React + Vite + Tailwind' },
                { label: 'Routing', value: 'React Router (hash history)' },
                { label: 'Hosting', value: 'static files, no backend' },
              ]}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <Link to="/privacy" className="link-gold text-[11.5px]">
                Privacy &amp; data flow
              </Link>
              <span className="text-muted/30">·</span>
              <Link to="/academy" className="link-gold text-[11.5px]">
                Security Academy
              </Link>
            </div>
            <p className="mt-3 flex gap-2 text-[11px] leading-relaxed text-muted/70">
              <RefreshCw size={13} className="mt-0.5 shrink-0 text-gold/60" aria-hidden="true" />
              Built as static files so it can be served from GitHub Pages with no server-side component.
            </p>
          </Panel>
        </div>
      </div>

      <Modal
        open={deleteOpen}
        onClose={() => {
          setDeleteOpen(false);
          setDeleteConfirm('');
        }}
        title="Delete the encrypted vault?"
        description="All ciphertext and vault metadata will be removed from this browser."
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setDeleteOpen(false);
                setDeleteConfirm('');
              }}
            >
              Cancel
            </Button>
            <Button variant="danger" icon={Trash2} disabled={deleteConfirm !== 'DELETE' || busy} onClick={handleDeleteVault}>
              Delete permanently
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Notice tone="danger" title="No recovery without a backup">
            If you have not exported an encrypted backup, the records are gone. The passphrase cannot help once
            the ciphertext is deleted.
          </Notice>
          <Field label="Type DELETE to confirm">
            <TextInput
              value={deleteConfirm}
              onChange={(event) => setDeleteConfirm(event.target.value)}
              placeholder="DELETE"
              autoComplete="off"
              spellCheck={false}
              aria-label="Type DELETE to confirm"
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
