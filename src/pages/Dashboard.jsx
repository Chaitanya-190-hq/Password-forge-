import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Database,
  KeyRound,
  Lock,
  ShieldCheck,
  Timer,
  TriangleAlert,
} from 'lucide-react';
import { WORKSPACES } from '../navigation.js';
import { vaultInfo } from '../lib/vault.js';
import { useSettings } from '../components/SettingsContext.jsx';
import { Badge, Notice, Panel, PageHeader, SectionTitle, buttonClasses, cx } from '../components/ui.jsx';

function StatusTile({ icon: Icon, label, value, detail, tone = 'neutral' }) {
  return (
    <div className="rounded-lg border border-line bg-ink/35 px-4 py-3.5">
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] uppercase tracking-[0.16em] text-muted/80">{label}</span>
        <Icon size={14} className={tone === 'gold' ? 'text-gold/80' : 'text-muted/60'} aria-hidden="true" />
      </div>
      <p className="mt-2 font-mono text-[14px] text-parchment/90">{value}</p>
      {detail && <p className="mt-1 text-[11px] leading-relaxed text-muted">{detail}</p>}
    </div>
  );
}

export default function Dashboard() {
  const { settings } = useSettings();
  const [vault, setVault] = useState({ exists: false, recordCount: 0 });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    vaultInfo()
      .then((info) => {
        if (!cancelled) setVault(info);
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const workspaces = WORKSPACES.filter((workspace) => workspace.id !== 'dashboard');

  return (
    <div>
      <PageHeader
        index="Workspace 01 — Overview"
        title="Client-side cryptography workstation"
        description="Eleven independent workspaces for generating, inspecting, encrypting, hashing and storing secrets. Every operation runs in this tab; the only optional network request is an explicitly opt-in breach check."
        actions={
          <>
            <Link to="/forge" className={buttonClasses({ variant: 'primary', size: 'md' })}>
              <KeyRound size={15} aria-hidden="true" />
              Forge a password
            </Link>
            <Link to="/vault" className={buttonClasses({ variant: 'secondary', size: 'md' })}>
              <Lock size={15} aria-hidden="true" />
              Encrypted vault
            </Link>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatusTile
          icon={ShieldCheck}
          label="Crypto engine"
          value="Web Crypto API"
          detail="AES-256-GCM · PBKDF2-SHA-256"
          tone="gold"
        />
        <StatusTile
          icon={Timer}
          label="KDF cost"
          value={`${settings.defaultIterations.toLocaleString()} iter`}
          detail="Default for new encryptions"
        />
        <StatusTile
          icon={Database}
          label="Local vault"
          value={loaded ? (vault.exists ? `${vault.recordCount} record${vault.recordCount === 1 ? '' : 's'}` : 'Not created') : 'Checking…'}
          detail={vault.exists ? 'Encrypted records in IndexedDB' : 'Create one from the vault workspace'}
        />
        <StatusTile
          icon={Lock}
          label="Auto-lock"
          value={settings.autoLockEnabled ? `${settings.autoLockMinutes} min idle` : 'Disabled'}
          detail="Configurable in Settings"
        />
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-[1fr_320px]">
        <div>
          <SectionTitle
            title="Workspaces"
            hint="Each workspace is independently functional. Nothing is simulated."
          />
          <div className="grid gap-3 sm:grid-cols-2">
            {workspaces.map((workspace) => {
              const Icon = workspace.icon;
              return (
                <Link
                  key={workspace.id}
                  to={workspace.path}
                  className="group rounded-xl2 border border-line bg-surface/70 p-4 transition-all duration-200 hover:border-gold/30 hover:bg-surface hover:shadow-panel"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-elevated/70 text-gold/80 transition-colors group-hover:border-gold/30">
                      <Icon size={17} aria-hidden="true" />
                    </span>
                    <ArrowRight
                      size={15}
                      className="mt-1 text-muted/40 transition-all group-hover:translate-x-0.5 group-hover:text-gold"
                      aria-hidden="true"
                    />
                  </div>
                  <h3 className="mt-3 text-[14px] text-parchment/90">{workspace.name}</h3>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-muted">{workspace.description}</p>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="space-y-5">
          <Panel className="p-5">
            <SectionTitle title="Operating principles" className="mb-3" />
            <ul className="space-y-3 text-[12px] leading-relaxed text-muted">
              {[
                'No backend, no accounts, no cloud database. The app is static files.',
                'Randomness comes from crypto.getRandomValues with rejection sampling — never Math.random.',
                'Generated and inspected passwords are never written to storage or console.',
                'Encrypted payloads carry their algorithm, KDF parameters, salt and IV, and are validated before use.',
                'Vault records are encrypted before they touch IndexedDB; the key lives in memory only.',
              ].map((line) => (
                <li key={line} className="flex gap-2">
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-gold/70" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel className="p-5">
            <SectionTitle title="Start here" className="mb-3" />
            <ol className="space-y-3">
              {[
                { to: '/forge', label: 'Generate a unique password or passphrase' },
                { to: '/inspector', label: 'Analyse a password you already use' },
                { to: '/encrypt', label: 'Encrypt a note or file with a passphrase' },
                { to: '/vault', label: 'Create an encrypted local vault' },
              ].map((step, index) => (
                <li key={step.to}>
                  <Link
                    to={step.to}
                    className="flex items-center gap-3 text-[12.5px] text-parchment/80 transition-colors hover:text-gold"
                  >
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-line font-mono text-[10.5px] text-muted">
                      {index + 1}
                    </span>
                    {step.label}
                  </Link>
                </li>
              ))}
            </ol>
          </Panel>

          <Notice tone="warn" title="Threat model, stated plainly">
            Browser cryptography protects data at rest and in transit from casual access. It cannot defend a
            compromised device, malicious extensions, a keylogger, or someone who knows your passphrase.
          </Notice>

          <div className={cx('flex flex-wrap gap-2')}>
            <Badge tone="gold">AES-256-GCM</Badge>
            <Badge>PBKDF2-SHA-256</Badge>
            <Badge>Argon2id demo</Badge>
            <Badge>IndexedDB</Badge>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <Notice tone="info" title="What leaves this device">
          Nothing, unless you press “Check breach exposure” in the Inspector. That optional request sends only
          the first five characters of a SHA-1 hash to api.pwnedpasswords.com. Details are on the{' '}
          <Link to="/privacy" className="link-gold">
            privacy page
          </Link>
          .
        </Notice>
      </div>

      <div className="mt-6 flex items-start gap-2 text-[11px] leading-relaxed text-muted/60">
        <TriangleAlert size={13} className="mt-0.5 shrink-0" aria-hidden="true" />
        <p>
          Passwords generated here are only as safe as where you put them. Use a password manager, enable
          multi-factor authentication, and keep encrypted backups of anything you cannot afford to lose.
        </p>
      </div>
    </div>
  );
}
