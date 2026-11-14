import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Database,
  Download,
  Eye,
  EyeOff,
  FileUp,
  Lock,
  LockOpen,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Unlock,
  Wand2,
} from 'lucide-react';
import { ForgeError } from '../lib/crypto.js';
import { formatBytes, download } from '../lib/bytes.js';
import {
  createVault,
  deleteRecord,
  destroyVault,
  exportVaultBackup,
  importVaultBackup,
  loadRecords,
  saveRecord,
  unlockVault,
  vaultInfo,
} from '../lib/vault.js';
import { generatePassword } from '../lib/passwords.js';
import { copyText } from '../lib/clipboard.js';
import { useSettings } from '../components/SettingsContext.jsx';
import { useToast } from '../components/Toast.jsx';
import {
  Badge,
  Button,
  CopyButton,
  Field,
  KeyValue,
  Modal,
  Notice,
  PageHeader,
  Panel,
  SectionTitle,
  Spinner,
  StrengthMeter,
  Switch,
  TextArea,
  TextInput,
  cx,
} from '../components/ui.jsx';

const EMPTY_FORM = { title: '', username: '', password: '', url: '', notes: '' };

function formatCountdown(seconds) {
  const safe = Math.max(0, seconds);
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function EncryptedVault() {
  const { settings } = useSettings();
  const { notify } = useToast();
  const clearAfterMs = settings.clearClipboard ? settings.clearClipboardSeconds * 1000 : 0;

  const [status, setStatus] = useState('loading');
  const [info, setInfo] = useState({ exists: false, recordCount: 0 });
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);

  const keyRef = useRef(null);
  const [records, setRecords] = useState([]);
  const [corrupted, setCorrupted] = useState(0);
  const [search, setSearch] = useState('');
  const [revealed, setRevealed] = useState(() => new Set());
  const [remaining, setRemaining] = useState(settings.autoLockMinutes * 60);
  const lastActivityRef = useRef(Date.now());

  const [editor, setEditor] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [backupExportOpen, setBackupExportOpen] = useState(false);
  const [backupPassphrase, setBackupPassphrase] = useState('');
  const [backupError, setBackupError] = useState('');
  const [backupBusy, setBackupBusy] = useState(false);
  const [importPayload, setImportPayload] = useState('');
  const [importName, setImportName] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [importPassphrase, setImportPassphrase] = useState('');
  const [importError, setImportError] = useState('');
  const [clearOpen, setClearOpen] = useState(false);
  const [clearConfirm, setClearConfirm] = useState('');

  const importFileRef = useRef(null);

  const refreshInfo = useCallback(async () => {
    const next = await vaultInfo();
    setInfo(next);
    return next;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = await refreshInfo();
      if (cancelled) return;
      setStatus(next.exists ? 'locked' : 'empty');
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshInfo]);

  const lock = useCallback(
    (reason = 'Vault locked.') => {
      keyRef.current = null;
      setRecords([]);
      setRevealed(new Set());
      setSearch('');
      setPassphrase('');
      setConfirm('');
      setEditor(null);
      setForm(EMPTY_FORM);
      setDeleteTarget(null);
      setBackupExportOpen(false);
      setBackupPassphrase('');
      setImportOpen(false);
      setImportPayload('');
      setImportPassphrase('');
      setStatus('locked');
      setRemaining(settings.autoLockMinutes * 60);
      notify(reason, 'info');
    },
    [notify, settings.autoLockMinutes],
  );

  // Auto-lock on inactivity. Activity resets the idle clock; the key is dropped
  // and decrypted records are removed from React state.
  useEffect(() => {
    if (status !== 'unlocked' || !settings.autoLockEnabled) return undefined;

    lastActivityRef.current = Date.now();
    setRemaining(settings.autoLockMinutes * 60);

    const bump = () => {
      lastActivityRef.current = Date.now();
    };
    window.addEventListener('pointerdown', bump);
    window.addEventListener('keydown', bump);
    window.addEventListener('touchstart', bump, { passive: true });

    const interval = setInterval(() => {
      const idleMs = Date.now() - lastActivityRef.current;
      const limitMs = settings.autoLockMinutes * 60_000;
      if (idleMs >= limitMs) {
        lock('Vault auto-locked after inactivity.');
      } else {
        setRemaining(Math.ceil((limitMs - idleMs) / 1000));
      }
    }, 1000);

    return () => {
      window.removeEventListener('pointerdown', bump);
      window.removeEventListener('keydown', bump);
      window.removeEventListener('touchstart', bump);
      clearInterval(interval);
    };
  }, [status, settings.autoLockEnabled, settings.autoLockMinutes, lock]);

  async function handleCreate() {
    setError('');
    if (passphrase.length < 10) {
      setError('Use a master passphrase of at least 10 characters. Longer is better.');
      return;
    }
    if (passphrase !== confirm) {
      setError('The two passphrases do not match.');
      return;
    }
    if (!acknowledged) {
      setError('Please confirm you understand that a lost passphrase cannot be recovered.');
      return;
    }
    setBusy(true);
    try {
      const key = await createVault(passphrase, settings.defaultIterations);
      keyRef.current = key;
      setPassphrase('');
      setConfirm('');
      setRecords([]);
      await refreshInfo();
      setStatus('unlocked');
      notify('Encrypted vault created. Keep the passphrase safe — there is no recovery.', 'success');
    } catch (caught) {
      setError(caught.message || 'Could not create the vault.');
    } finally {
      setBusy(false);
    }
  }

  async function handleUnlock() {
    setError('');
    if (!passphrase) {
      setError('Enter your master passphrase.');
      return;
    }
    setBusy(true);
    try {
      const key = await unlockVault(passphrase);
      keyRef.current = key;
      const { records: loaded, corrupted: broken } = await loadRecords(key);
      setRecords(loaded);
      setCorrupted(broken.length);
      setPassphrase('');
      setStatus('unlocked');
      await refreshInfo();
      notify('Vault unlocked. Auto-lock is active.', 'success');
    } catch (caught) {
      setError(
        caught instanceof ForgeError
          ? caught.message
          : 'Could not unlock the vault. The passphrase is incorrect or the vault data is damaged.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function reloadRecords() {
    if (!keyRef.current) return;
    const { records: loaded, corrupted: broken } = await loadRecords(keyRef.current);
    setRecords(loaded);
    setCorrupted(broken.length);
    await refreshInfo();
  }

  function openEditor(record) {
    setEditor(record ? { mode: 'edit', id: record.id } : { mode: 'create' });
    setForm(
      record
        ? {
            title: record.title,
            username: record.username,
            password: record.password,
            url: record.url,
            notes: record.notes,
          }
        : EMPTY_FORM,
    );
    setFormError('');
  }

  async function handleSaveRecord() {
    if (!keyRef.current) {
      setFormError('The vault is locked.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      await saveRecord(keyRef.current, { ...form, id: editor.mode === 'edit' ? editor.id : undefined });
      await reloadRecords();
      setEditor(null);
      setForm(EMPTY_FORM);
      notify(editor.mode === 'edit' ? 'Record updated (re-encrypted).' : 'Record added and encrypted.', 'success');
    } catch (caught) {
      setFormError(caught.message || 'Could not save the record.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteRecord(deleteTarget.id);
      await reloadRecords();
      setDeleteTarget(null);
      notify('Record deleted from the local vault.', 'info');
    } catch (caught) {
      notify(caught.message || 'Could not delete the record.', 'danger');
    }
  }

  async function handleExportBackup() {
    if (!keyRef.current) return;
    setBackupError('');
    if (backupPassphrase.length < 10) {
      setBackupError('Use a backup passphrase of at least 10 characters.');
      return;
    }
    setBackupBusy(true);
    try {
      const payload = await exportVaultBackup(keyRef.current, backupPassphrase);
      download(
        `password-forge-vault-backup-${new Date().toISOString().slice(0, 10)}.pforge`,
        payload,
        'application/json',
      );
      setBackupExportOpen(false);
      setBackupPassphrase('');
      notify('Encrypted backup downloaded. Keep the backup passphrase separately.', 'success');
    } catch (caught) {
      setBackupError(caught.message || 'Could not create the encrypted backup.');
    } finally {
      setBackupBusy(false);
    }
  }

  async function handleImportFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 24 * 1024 * 1024) {
      notify('Backup file is too large.', 'danger');
      return;
    }
    try {
      setImportPayload(await file.text());
      setImportName(file.name);
      setImportError('');
      setImportPassphrase('');
      setImportOpen(true);
    } catch {
      notify('Could not read that backup file.', 'danger');
    } finally {
      if (importFileRef.current) importFileRef.current.value = '';
    }
  }

  async function handleImport() {
    if (!keyRef.current) return;
    setImportError('');
    if (!importPassphrase) {
      setImportError('Enter the passphrase used for this backup.');
      return;
    }
    setBackupBusy(true);
    try {
      const result = await importVaultBackup(keyRef.current, importPayload, importPassphrase);
      await reloadRecords();
      setImportOpen(false);
      setImportPayload('');
      setImportPassphrase('');
      setImportName('');
      notify(
        `Imported ${result.imported} record${result.imported === 1 ? '' : 's'}${result.skipped ? `, skipped ${result.skipped}` : ''}.`,
        'success',
      );
    } catch (caught) {
      setImportError(caught.message || 'Import failed. The passphrase is wrong or the file is not a vault backup.');
    } finally {
      setBackupBusy(false);
    }
  }

  async function handleDestroy() {
    if (clearConfirm !== 'DELETE') return;
    try {
      await destroyVault();
      keyRef.current = null;
      setRecords([]);
      setClearOpen(false);
      setClearConfirm('');
      await refreshInfo();
      setStatus('empty');
      notify('All local vault data deleted.', 'info');
    } catch (caught) {
      notify(caught.message || 'Could not delete the vault database.', 'danger');
    }
  }

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return records;
    return records.filter((record) =>
      [record.title, record.username, record.url, record.notes].some((field) =>
        (field || '').toLowerCase().includes(query),
      ),
    );
  }, [records, search]);

  function toggleReveal(id) {
    setRevealed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const passphraseQuality = passphrase.length >= 16 ? 'success' : passphrase.length >= 12 ? 'warn' : 'danger';

  return (
    <div>
      <PageHeader
        index="Workspace 09 — Encrypted Vault"
        title="A local, encrypted credential store"
        description="Records are encrypted with AES-256-GCM before they touch IndexedDB. The key is derived from your master passphrase and exists only in this tab’s memory while unlocked."
        actions={
          status === 'unlocked' ? (
            <>
              <Badge tone="success">
                <LockOpen size={11} /> unlocked
              </Badge>
              <Button variant="secondary" size="sm" icon={Lock} onClick={() => lock('Vault locked manually.')}>
                Lock now
              </Button>
            </>
          ) : null
        }
      />

      {status === 'loading' && (
        <Panel className="py-14 text-center">
          <Spinner label="Opening local vault database…" />
        </Panel>
      )}

      {status === 'empty' && (
        <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <Panel>
            <SectionTitle
              title="Create your vault"
              hint="One vault per browser profile. It cannot be shared or reset without its passphrase."
            />
            <div className="space-y-4">
              <Field
                label="Master passphrase"
                hint="At least 10 characters. Four or more random words is a strong choice. This is never stored."
              >
                <TextInput
                  type="password"
                  value={passphrase}
                  onChange={(event) => setPassphrase(event.target.value)}
                  placeholder="Choose a long master passphrase"
                  autoComplete="new-password"
                  spellCheck={false}
                  aria-label="Master passphrase"
                />
              </Field>
              {passphrase && (
                <div>
                  <StrengthMeter score={passphraseQuality === 'success' ? 3 : passphraseQuality === 'warn' ? 2 : 1} />
                  <p className="mt-1.5 text-[11px] text-muted">
                    {passphrase.length} characters.{' '}
                    {passphraseAccuracy(passphrase)}
                  </p>
                </div>
              )}
              <Field
                label="Confirm passphrase"
                error={confirm && confirm !== passphrase ? 'Passphrases do not match.' : undefined}
              >
                <TextInput
                  type="password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  placeholder="Repeat the master passphrase"
                  autoComplete="new-password"
                  spellCheck={false}
                  aria-label="Confirm master passphrase"
                />
              </Field>

              <Switch
                checked={acknowledged}
                onChange={setAcknowledged}
                label="I understand there is no recovery"
                description="If you forget this passphrase, the vault contents cannot be decrypted by anyone — including me."
              />

              <Notice tone="warn" title="Before you start">
                Vault data is tied to this browser profile and device. Clearing site data deletes it. Export an
                encrypted backup once you have added records.
              </Notice>

              {error && <Notice tone="danger">{error}</Notice>}

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="primary" icon={Lock} onClick={handleCreate} loading={busy} disabled={busy}>
                  {busy ? 'Deriving key…' : 'Create encrypted vault'}
                </Button>
                <span className="font-mono text-[10.5px] text-muted/60">
                  PBKDF2 · {settings.defaultIterations.toLocaleString()} iters
                </span>
              </div>
            </div>
          </Panel>

          <VaultSecurityPanel />
        </div>
      )}

      {status === 'locked' && (
        <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
          <Panel>
            <SectionTitle title="Unlock vault" hint="The passphrase derives the decryption key locally." />
            <div className="space-y-4">
              <Field label="Master passphrase">
                <TextInput
                  type="password"
                  value={passphrase}
                  onChange={(event) => setPassphrase(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') handleUnlock();
                  }}
                  placeholder="Enter your master passphrase"
                  autoComplete="off"
                  spellCheck={false}
                  aria-label="Master passphrase"
                />
              </Field>
              {error && <Notice tone="danger">{error}</Notice>}
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="primary" icon={Unlock} onClick={handleUnlock} loading={busy} disabled={busy}>
                  {busy ? 'Verifying…' : 'Unlock'}
                </Button>
                <span className="font-mono text-[10.5px] text-muted/60">
                  {info.iterations ? `${info.iterations.toLocaleString()} PBKDF2 iterations` : ''}
                </span>
              </div>
            </div>

            {info.exists && (
              <KeyValue
                className="mt-6"
                items={[
                  { label: 'Created', value: info.createdAt ? new Date(info.createdAt).toLocaleString() : '—' },
                  { label: 'Encrypted records', value: String(info.recordCount) },
                  { label: 'KDF', value: 'PBKDF2-SHA-256' },
                  { label: 'Cipher', value: 'AES-256-GCM' },
                ]}
              />
            )}

            <p className="mt-5 text-[11px] leading-relaxed text-muted/75">
              Nothing is decrypted until verification succeeds. A wrong passphrase and a corrupted vault produce
              the same safe failure, and no partial records are shown.
            </p>
          </Panel>

          <div className="space-y-5">
            <VaultSecurityPanel />
            <Panel>
              <SectionTitle title="Reset options" className="mb-2" />
              <p className="text-[11.5px] leading-relaxed text-muted">
                If the passphrase is lost, the only remaining action is deleting the encrypted vault. The
                ciphertext cannot be recovered.
              </p>
              <Button
                variant="danger"
                size="sm"
                icon={Trash2}
                className="mt-3"
                onClick={() => setClearOpen(true)}
              >
                Delete vault data
              </Button>
            </Panel>
          </div>
        </div>
      )}

      {status === 'unlocked' && (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-line bg-surface px-4 py-3">
              <p className="text-[10.5px] uppercase tracking-[0.14em] text-muted/80">Records</p>
              <p className="mt-1 font-mono text-[19px] text-parchment">{records.length}</p>
            </div>
            <div className="rounded-lg border border-line bg-surface px-4 py-3">
              <p className="text-[10.5px] uppercase tracking-[0.14em] text-muted/80">Auto-lock</p>
              <p className="mt-1 font-mono text-[19px] text-parchment">
                {settings.autoLockEnabled ? formatCountdown(remaining) : 'off'}
              </p>
            </div>
            <div className="rounded-lg border border-line bg-surface px-4 py-3">
              <p className="text-[10.5px] uppercase tracking-[0.14em] text-muted/80">At-rest format</p>
              <p className="mt-1 font-mono text-[13px] text-parchment">AES-256-GCM</p>
            </div>
          </div>

          {corrupted > 0 && (
            <Notice tone="warn" title={`${corrupted} record${corrupted === 1 ? '' : 's'} could not be decrypted`}>
              Those rows failed authentication and were not displayed. This can happen if storage was modified
              outside the app. Re-import a backup if needed.
            </Notice>
          )}

          <Panel>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative w-full sm:max-w-sm">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted/60" aria-hidden="true" />
                <TextInput
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search decrypted metadata…"
                  className="pl-9"
                  aria-label="Search vault records"
                  autoComplete="off"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={importFileRef}
                  type="file"
                  accept=".pforge,.json,application/json"
                  className="sr-only"
                  onChange={handleImportFile}
                />
                <Button variant="secondary" size="sm" icon={FileUp} onClick={() => importFileRef.current?.click()}>
                  Import backup
                </Button>
                <Button variant="secondary" size="sm" icon={Download} onClick={() => setBackupExportOpen(true)}>
                  Export backup
                </Button>
                <Button variant="primary" size="sm" icon={Plus} onClick={() => openEditor(null)}>
                  New record
                </Button>
              </div>
            </div>

            <div className="mt-4">
              {records.length === 0 ? (
                <div className="rounded-lg border border-dashed border-line px-6 py-12 text-center">
                  <Database size={22} className="mx-auto mb-3 text-muted/40" aria-hidden="true" />
                  <p className="text-[12.5px] text-parchment/85">No records yet</p>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
                    Add a login and it will be encrypted before storage.
                  </p>
                  <Button variant="secondary" size="sm" className="mt-4" onClick={() => openEditor(null)}>
                    Add first record
                  </Button>
                </div>
              ) : filtered.length === 0 ? (
                <p className="py-10 text-center text-[12px] text-muted">
                  No record matches “{search}”. Search runs over decrypted metadata held in memory.
                </p>
              ) : (
                <ul className="space-y-2">
                  {filtered.map((record) => {
                    const isRevealed = revealed.has(record.id);
                    return (
                      <li
                        key={record.id}
                        className="rounded-lg border border-line bg-ink/35 px-3.5 py-3 transition-colors hover:border-line/80"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-[13px] text-parchment/90">{record.title}</p>
                              <Badge>{record.username || 'no username'}</Badge>
                            </div>
                            {record.url && (
                              <p className="mt-0.5 truncate font-mono text-[10.5px] text-muted/70">{record.url}</p>
                            )}
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <code
                                className={cx(
                                  'rounded border border-line bg-ink/70 px-2 py-1 font-mono text-[12px]',
                                  isRevealed ? 'text-gold/90' : 'select-none text-muted/60',
                                )}
                              >
                                {isRevealed
                                  ? record.password || '—'
                                  : record.password
                                    ? '•'.repeat(Math.min(24, Math.max(8, record.password.length)))
                                    : '—'}
                              </code>
                              <button
                                type="button"
                                onClick={() => toggleReveal(record.id)}
                                className="rounded p-1 text-muted transition-colors hover:text-parchment"
                                aria-label={isRevealed ? 'Hide password' : 'Reveal password'}
                              >
                                {isRevealed ? <EyeOff size={13} /> : <Eye size={13} />}
                              </button>
                              <CopyButton
                                value={record.password}
                                label="Copy"
                                clearAfterMs={clearAfterMs}
                                disabled={!record.password}
                              />
                            </div>
                            {record.notes && (
                              <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-[11px] leading-relaxed text-muted/80">
                                {record.notes}
                              </p>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEditor(record)}
                              className="rounded-md border border-line p-1.5 text-muted transition-colors hover:border-gold/30 hover:text-parchment"
                              aria-label={`Edit ${record.title}`}
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(record)}
                              className="rounded-md border border-danger/25 p-1.5 text-danger/80 transition-colors hover:bg-danger/10 hover:text-danger"
                              aria-label={`Delete ${record.title}`}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </Panel>

          <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
            <Panel>
              <SectionTitle title="Vault details" hint="Anything shown here is non-secret." />
              <KeyValue
                items={[
                  { label: 'Created', value: info.createdAt ? new Date(info.createdAt).toLocaleString() : '—' },
                  { label: 'Records', value: String(records.length) },
                  { label: 'KDF', value: `PBKDF2-SHA-256 · ${info.iterations?.toLocaleString() ?? '—'} iters` },
                  { label: 'Cipher', value: 'AES-256-GCM · fresh IV per record' },
                  { label: 'Storage', value: 'IndexedDB (ciphertext only)' },
                  { label: 'Key', value: 'in memory, non-extractable' },
                ]}
              />
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Badge tone="gold">
                  <ShieldCheck size={11} /> encrypted at rest
                </Badge>
                <Badge>auto-lock {settings.autoLockEnabled ? `${settings.autoLockMinutes} min` : 'off'}</Badge>
                <Badge>{formatBytes(JSON.stringify(records).length)} in memory</Badge>
              </div>
              <Button
                variant="ghost"
                size="sm"
                icon={RefreshCw}
                className="mt-4"
                onClick={() => {
                  reloadRecords();
                  notify('Records reloaded from encrypted storage.', 'info');
                }}
              >
                Reload from IndexedDB
              </Button>
            </Panel>

            <VaultSecurityPanel />
          </div>

          <Panel className="border-danger/20">
            <SectionTitle title="Danger zone" hint="Deleting is irreversible and removes the ciphertext itself." />
            <Button variant="danger" size="sm" icon={Trash2} onClick={() => setClearOpen(true)}>
              Delete all vault data
            </Button>
          </Panel>
        </div>
      )}

      {/* Record editor */}
      <Modal
        open={Boolean(editor)}
        onClose={() => setEditor(null)}
        title={editor?.mode === 'edit' ? 'Edit record' : 'New record'}
        description="Saved values are encrypted with your vault key before being written to IndexedDB."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditor(null)}>
              Cancel
            </Button>
            <Button variant="primary" icon={Lock} onClick={handleSaveRecord} loading={saving} disabled={saving}>
              {saving ? 'Encrypting…' : editor?.mode === 'edit' ? 'Save & re-encrypt' : 'Encrypt & save'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Title" hint="Required. Stored encrypted like every other field.">
            <TextInput
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
              placeholder="e.g. Personal email"
              maxLength={120}
              autoComplete="off"
              aria-label="Record title"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Username or email">
              <TextInput
                value={form.username}
                onChange={(event) => setForm({ ...form, username: event.target.value })}
                placeholder="name@example.com"
                maxLength={200}
                autoComplete="off"
                aria-label="Username"
              />
            </Field>
            <Field label="Website / app">
              <TextInput
                value={form.url}
                onChange={(event) => setForm({ ...form, url: event.target.value })}
                placeholder="example.com"
                maxLength={500}
                autoComplete="off"
                aria-label="Website"
              />
            </Field>
          </div>
          <Field
            label="Password"
            hint="Use the generator for a strong, unique value."
            corner={
              <button
                type="button"
                onClick={() =>
                  setForm({
                    ...form,
                    password: generatePassword({
                      length: 24,
                      lower: true,
                      upper: true,
                      numbers: true,
                      symbols: true,
                    }),
                  })
                }
                className="inline-flex items-center gap-1 text-[10.5px] text-gold/80 transition-colors hover:text-gold"
              >
                <Wand2 size={11} /> generate
              </button>
            }
          >
            <TextInput
              type="text"
              mono
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              placeholder="Password"
              maxLength={400}
              autoComplete="off"
              spellCheck={false}
              aria-label="Password"
            />
          </Field>
          <Field label="Notes" hint="Recovery codes, security answers, context. Stored encrypted.">
            <TextArea
              rows={4}
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
              placeholder="Optional notes…"
              maxLength={4000}
              aria-label="Notes"
            />
          </Field>
          {formError && <Notice tone="danger">{formError}</Notice>}
          <Notice tone="info" compact>
            Each save generates a fresh IV. The record id is bound into the authentication tag, so ciphertext
            cannot be swapped between records without detection.
          </Notice>
        </div>
      </Modal>

      {/* Delete record */}
      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete this record?"
        description="The encrypted row is removed from IndexedDB immediately."
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="danger" icon={Trash2} onClick={handleDelete}>
              Delete record
            </Button>
          </>
        }
      >
        <p className="text-[12.5px] leading-relaxed text-muted">
          “{deleteTarget?.title}” will be permanently removed from this device. Exported backups are not
          affected.
        </p>
      </Modal>

      {/* Export backup */}
      <Modal
        open={backupExportOpen}
        onClose={() => setBackupExportOpen(false)}
        title="Export encrypted backup"
        description="The backup is encrypted with a passphrase you choose now."
        footer={
          <>
            <Button variant="ghost" onClick={() => setBackupExportOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" icon={Download} onClick={handleExportBackup} loading={backupBusy} disabled={backupBusy}>
              Download .pforge
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field
            label="Backup passphrase"
            hint="You may reuse the master passphrase, or choose a separate one for backups. It is not stored."
          >
            <TextInput
              type="password"
              value={backupPassphrase}
              onChange={(event) => setBackupPassphrase(event.target.value)}
              placeholder="At least 10 characters"
              autoComplete="new-password"
              aria-label="Backup passphrase"
            />
          </Field>
          {backupError && <Notice tone="danger">{backupError}</Notice>}
          <Notice tone="info" compact>
            Records are decrypted in memory, serialised, then re-encrypted with the backup passphrase using
            AES-256-GCM and a fresh salt/IV. The file contains {records.length} record
            {records.length === 1 ? '' : 's'} and no plaintext.
          </Notice>
        </div>
      </Modal>

      {/* Import backup */}
      <Modal
        open={importOpen}
        onClose={() => {
          setImportOpen(false);
          setImportPayload('');
          setImportPassphrase('');
        }}
        title="Import encrypted backup"
        description="Records are decrypted with the backup passphrase, then re-encrypted with this vault’s key."
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setImportOpen(false);
                setImportPayload('');
                setImportPassphrase('');
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" icon={FileUp} onClick={handleImport} loading={backupBusy} disabled={backupBusy}>
              Import records
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {importName && (
            <div className="flex items-center gap-2">
              <Badge>{importName}</Badge>
              <span className="font-mono text-[10.5px] text-muted/60">{formatBytes(importPayload.length)}</span>
            </div>
          )}
          <Field label="Backup passphrase">
            <TextInput
              type="password"
              value={importPassphrase}
              onChange={(event) => setImportPassphrase(event.target.value)}
              placeholder="Passphrase used when the backup was created"
              autoComplete="off"
              aria-label="Backup passphrase"
            />
          </Field>
          {importError && <Notice tone="danger">{importError}</Notice>}
          <Notice tone="warn" compact title="Imported as new records">
            Existing records are not overwritten. Imported entries are appended with new ids; duplicates are
            not merged automatically.
          </Notice>
        </div>
      </Modal>

      {/* Destroy vault */}
      <Modal
        open={clearOpen}
        onClose={() => {
          setClearOpen(false);
          setClearConfirm('');
        }}
        title="Delete all local vault data?"
        description="This removes the encrypted database from this browser."
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setClearOpen(false);
                setClearConfirm('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              icon={Trash2}
              disabled={clearConfirm !== 'DELETE'}
              onClick={handleDestroy}
            >
              Delete permanently
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Notice tone="danger" title="Irreversible">
            The vault, every encrypted record and its verifier will be deleted. Backups you exported earlier
            remain valid files elsewhere. Without the passphrase, nothing can be recovered.
          </Notice>
          <Field label="Type DELETE to confirm">
            <TextInput
              value={clearConfirm}
              onChange={(event) => setClearConfirm(event.target.value)}
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

function passphraseAccuracy(passphrase) {
  const classes =
    (/[a-z]/.test(passphrase) ? 1 : 0) +
    (/[A-Z]/.test(passphrase) ? 1 : 0) +
    (/[0-9]/.test(passphrase) ? 1 : 0) +
    (/[^A-Za-z0-9]/.test(passphrase) ? 1 : 0);
  if (passphrase.length < 12) return 'Aim for 16+ characters or several random words.';
  if (classes < 2) return 'Add variety, or use a multi-word passphrase.';
  return 'Length is the dominant factor — make sure it is unique.';
}

function VaultSecurityPanel() {
  return (
    <Panel>
      <SectionTitle title="Security boundaries" hint="What this design can and cannot promise." />
      <ul className="space-y-3 text-[11.5px] leading-relaxed text-muted">
        <li className="flex gap-2">
          <ShieldCheck size={13} className="mt-0.5 shrink-0 text-success/80" aria-hidden="true" />
          Records are AES-256-GCM ciphertext in IndexedDB. The derived key is non-extractable and dropped on lock.
        </li>
        <li className="flex gap-2">
          <ShieldAlert size={13} className="mt-0.5 shrink-0 text-warn/80" aria-hidden="true" />
          While unlocked, decrypted values live in JavaScript memory. Clearing state cannot be proven to erase
          them from the browser process, swap or OS caches.
        </li>
        <li className="flex gap-2">
          <ShieldAlert size={13} className="mt-0.5 shrink-0 text-warn/80" aria-hidden="true" />
          Copies you place on the clipboard are visible to other applications and may be kept in clipboard
          history, even with auto-clear enabled.
        </li>
        <li className="flex gap-2">
          <ShieldAlert size={13} className="mt-0.5 shrink-0 text-danger/80" aria-hidden="true" />
          A compromised device, malicious browser extension or keylogger captures secrets before encryption.
          No browser app can prevent that.
        </li>
        <li className="flex gap-2">
          <ShieldAlert size={13} className="mt-0.5 shrink-0 text-danger/80" aria-hidden="true" />
          There is no passphrase recovery. Losing it means losing the vault; export backups routinely.
        </li>
      </ul>
    </Panel>
  );
}
