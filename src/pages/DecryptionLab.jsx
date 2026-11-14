import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Download,
  Eye,
  EyeOff,
  FileLock2,
  FolderOpen,
  KeyRound,
  LockOpen,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import {
  MAX_ENVELOPE_CHARS,
  MAX_FILE_BYTES,
  decryptEnvelope,
  parseEnvelope,
} from '../lib/crypto.js';
import { formatBytes, download, safeFilename, utf8Decode } from '../lib/bytes.js';
import { useSettings } from '../components/SettingsContext.jsx';
import { useToast } from '../components/Toast.jsx';
import {
  Badge,
  Button,
  CopyButton,
  Field,
  KeyValue,
  Notice,
  PageHeader,
  Panel,
  SectionTitle,
  TextArea,
  TextInput,
  cx,
} from '../components/ui.jsx';

export default function DecryptionLab() {
  const { settings } = useSettings();
  const { notify } = useToast();
  const [payload, setPayload] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [aad, setAad] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [revealed, setRevealed] = useState(true);
  const fileRef = useRef(null);
  const clearAfterMs = settings.clearClipboard ? settings.clearClipboardSeconds * 1000 : 0;

  const parsed = useMemo(() => {
    if (!payload.trim()) return { envelope: null, error: '' };
    try {
      return { envelope: parseEnvelope(payload), error: '' };
    } catch (caught) {
      return { envelope: null, error: caught.message || 'Invalid payload.' };
    }
  }, [payload]);

  useEffect(() => {
    setResult(null);
    setError('');
  }, [payload, passphrase, aad]);

  async function handleFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > Math.min(MAX_ENVELOPE_CHARS, MAX_FILE_BYTES + 4096)) {
      setError(`Encrypted file is too large (${formatBytes(file.size)}).`);
      return;
    }
    try {
      const contents = await file.text();
      setPayload(contents);
      setSourceName(file.name);
      setError('');
    } catch {
      setError('Could not read that file as text.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleDecrypt() {
    if (!parsed.envelope) {
      setError(parsed.error || 'Provide an encrypted payload first.');
      return;
    }
    if (!passphrase) {
      setError('Enter the passphrase used during encryption.');
      return;
    }
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const { bytes, envelope } = await decryptEnvelope(payload, { passphrase, aad });
      if (envelope.meta.kind === 'file') {
        setResult({
          kind: 'file',
          bytes,
          filename: envelope.meta.filename || 'decrypted-file',
          mime: envelope.meta.mime || 'application/octet-stream',
          meta: envelope.meta,
        });
      } else {
        const text = utf8Decode(bytes);
        setResult({ kind: 'text', text, meta: envelope.meta });
        setRevealed(true);
      }
      notify('Payload authenticated and decrypted locally.', 'success');
    } catch (caught) {
      setError(caught.message || 'Decryption failed.');
    } finally {
      setBusy(false);
    }
  }

  function handleClear() {
    setPayload('');
    setSourceName('');
    setPassphrase('');
    setAad('');
    setResult(null);
    setError('');
    if (fileRef.current) fileRef.current.value = '';
    notify('Sensitive inputs and output cleared.', 'info');
  }

  function handleDownload() {
    if (!result) return;
    if (result.kind === 'file') {
      download(safeFilename(result.filename, 'decrypted-file'), new Blob([result.bytes], { type: result.mime }));
    } else {
      download('password-forge-decrypted.txt', result.text, 'text/plain');
    }
    notify('Decrypted content downloaded as plaintext.', 'info');
  }

  const envelope = parsed.envelope;

  return (
    <div>
      <PageHeader
        index="Workspace 05 — Decryption Lab"
        title="Authenticate and decrypt"
        description="Paste an encrypted payload or import a .pforge file. The envelope is validated first, then AES-GCM authenticates it. Plaintext is only ever shown after the tag verifies — never partially."
        actions={
          <Button variant="ghost" icon={Trash2} onClick={handleClear}>
            Clear sensitive data
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <Panel>
            <SectionTitle
              title="Encrypted payload"
              hint="Portable JSON produced by the Encryption Lab or Vault backup."
              action={
                <Button variant="secondary" size="sm" icon={FolderOpen} onClick={() => fileRef.current?.click()}>
                  Import file
                </Button>
              }
            />
            <input ref={fileRef} type="file" accept=".pforge,.json,application/json,text/plain" className="sr-only" onChange={handleFile} />
            <TextArea
              rows={8}
              value={payload}
              onChange={(event) => {
                setPayload(event.target.value);
                setSourceName('');
              }}
              placeholder='{ "format": "password-forge-encrypted", "version": 1, … }'
              className="min-h-[170px] text-[11.5px]"
              aria-label="Encrypted payload"
            />

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {sourceName && (
                <Badge>
                  <FileLock2 size={11} /> {sourceName}
                </Badge>
              )}
              {payload.trim() && (
                <>
                  {envelope ? (
                    <Badge tone="success">
                      <ShieldCheck size={11} /> metadata valid
                    </Badge>
                  ) : (
                    <Badge tone="danger">
                      <AlertTriangle size={11} /> metadata rejected
                    </Badge>
                  )}
                  <span className="font-mono text-[10.5px] text-muted/60">{formatBytes(new Blob([payload]).size)}</span>
                </>
              )}
            </div>

            {payload.trim() && parsed.error && (
              <Notice tone="danger" className="mt-3" title="This payload cannot be used">
                {parsed.error} No decryption was attempted.
              </Notice>
            )}

            {envelope && (
              <div className="mt-4 rounded-lg border border-line bg-ink/35 p-3.5">
                <p className="mb-2.5 text-[10.5px] uppercase tracking-[0.16em] text-muted/80">Payload metadata</p>
                <KeyValue
                  items={[
                    { label: 'Version', value: `${envelope.format} v${envelope.version}` },
                    { label: 'Algorithm', value: envelope.algorithm },
                    { label: 'KDF', value: `${envelope.kdf.name} · ${envelope.kdf.hash}` },
                    { label: 'Iterations', value: envelope.kdf.iterations.toLocaleString() },
                    { label: 'Kind', value: envelope.meta.kind },
                    ...(envelope.meta.filename ? [{ label: 'Filename', value: envelope.meta.filename }] : []),
                    { label: 'AAD required', value: envelope.meta.aad ? 'yes' : 'no' },
                    { label: 'Created', value: envelope.meta.createdAt },
                  ]}
                />
              </div>
            )}

            <div className="mt-5 space-y-4">
              <Field label="Passphrase" hint="Never stored — held only for this operation.">
                <TextInput
                  type="password"
                  value={passphrase}
                  onChange={(event) => setPassphrase(event.target.value)}
                  placeholder="Passphrase used to encrypt"
                  autoComplete="off"
                  spellCheck={false}
                  aria-label="Passphrase"
                />
              </Field>
              <Field
                label="Additional authenticated data"
                hint={
                  envelope?.meta.aad
                    ? 'Required for this payload — it was encrypted with AAD.'
                    : 'Only needed if AAD was supplied during encryption.'
                }
              >
                <TextInput
                  mono
                  value={aad}
                  onChange={(event) => setAad(event.target.value)}
                  placeholder="Exact AAD value, if any"
                  autoComplete="off"
                  spellCheck={false}
                  aria-label="Additional authenticated data"
                />
              </Field>
            </div>

            {error && (
              <Notice tone="danger" className="mt-4" title="Decryption failed">
                {error}
              </Notice>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                icon={LockOpen}
                onClick={handleDecrypt}
                loading={busy}
                disabled={busy || !envelope}
              >
                {busy ? 'Authenticating…' : 'Decrypt'}
              </Button>
              <Button variant="ghost" icon={KeyRound} onClick={handleClear}>
                Clear
              </Button>
            </div>
          </Panel>

          <Notice tone="warn" title="Wrong passphrase or modified data">
            AES-GCM cannot tell you which of the two happened, and it refuses to output anything in both cases.
            A tampered header (algorithm, KDF parameters, salt, IV, metadata) fails exactly like a wrong
            passphrase — that is the point.
          </Notice>
        </div>

        <div className="space-y-5">
          <Panel className="flex min-h-[360px] flex-col">
            <SectionTitle
              title="Plaintext"
              hint={result ? 'Authenticated output for this session only.' : 'Nothing is decrypted until authentication succeeds.'}
              action={
                result && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setRevealed((current) => !current)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1.5 text-[11px] text-muted transition-colors hover:text-parchment"
                    >
                      {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
                      {revealed ? 'Hide' : 'Reveal'}
                    </button>
                    <CopyButton
                      value={result.kind === 'text' ? result.text : ''}
                      label="Copy"
                      clearAfterMs={clearAfterMs}
                      variant="secondary"
                      disabled={result.kind !== 'text'}
                    />
                    <Button variant="primary" size="sm" icon={Download} onClick={handleDownload}>
                      Download
                    </Button>
                  </div>
                )
              }
            />

            {!result ? (
              <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-line px-6 py-16 text-center">
                <LockOpen size={22} className="mb-3 text-muted/40" aria-hidden="true" />
                <p className="text-[12.5px] text-parchment/80">No authenticated output</p>
                <p className="mt-1 max-w-xs text-[11.5px] leading-relaxed text-muted">
                  If authentication fails, nothing is returned — not even partial bytes.
                </p>
              </div>
            ) : (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Badge tone="success">
                    <ShieldCheck size={11} /> authentication passed
                  </Badge>
                  <Badge>{result.kind === 'file' ? 'file' : 'text'}</Badge>
                  {result.kind === 'file' ? (
                    <>
                      <Badge>{result.filename}</Badge>
                      <Badge>{formatBytes(result.bytes.length)}</Badge>
                    </>
                  ) : (
                    <Badge>{result.text.length} chars</Badge>
                  )}
                </div>

                {result.kind === 'text' ? (
                  <pre
                    className={cx(
                      'max-h-[46vh] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-ink/60 p-3.5 font-mono text-[12px] leading-relaxed',
                      revealed ? 'text-parchment/90' : 'select-none text-muted/50',
                    )}
                  >
                    {revealed ? result.text : '••••••••••••••••••••\n(plaintext hidden)'}
                  </pre>
                ) : (
                  <div className="rounded-lg border border-line bg-ink/60 p-4">
                    <p className="text-[12.5px] text-parchment/85">File authenticated successfully.</p>
                    <p className="mt-1 font-mono text-[11px] text-muted">
                      {result.filename} · {formatBytes(result.bytes.length)} · {result.mime}
                    </p>
                    <p className="mt-3 text-[11px] leading-relaxed text-muted/80">
                      Downloading writes the decrypted file to your device. Delete it when you are done.
                    </p>
                  </div>
                )}

                <p className="mt-4 text-[11px] leading-relaxed text-muted/70">
                  This plaintext lives in React state until you clear it, lock the tab or navigate away. Closing
                  a tab cannot be proven to erase memory, and the OS may cache or swap it.
                </p>
              </>
            )}
          </Panel>

          <Panel>
            <SectionTitle title="Handling imported files safely" />
            <ul className="space-y-2 text-[12px] leading-relaxed text-muted">
              <li className="flex gap-2">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-gold/70" />
                The file format, version, algorithm, KDF name, iteration range, salt length, IV length and
                ciphertext size are all validated before any key is derived.
              </li>
              <li className="flex gap-2">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-gold/70" />
                Unknown versions and algorithms are rejected instead of guessed, and oversized payloads are
                refused before parsing.
              </li>
              <li className="flex gap-2">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-gold/70" />
                The whole non-secret header is bound into the authentication tag, so editing it breaks
                decryption.
              </li>
            </ul>
          </Panel>
        </div>
      </div>
    </div>
  );
}
