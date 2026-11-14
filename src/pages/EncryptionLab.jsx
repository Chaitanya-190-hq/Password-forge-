import { useMemo, useRef, useState } from 'react';
import {
  FileLock2,
  FileText,
  Lock,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
  Download,
} from 'lucide-react';
import {
  DEFAULT_ITERATIONS,
  ITERATION_OPTIONS,
  MAX_FILE_BYTES,
  MAX_ITERATIONS,
  MAX_TEXT_BYTES,
  MIN_ITERATIONS,
  encryptBytes,
  encryptText,
  serializeEnvelope,
} from '../lib/crypto.js';
import { formatBytes, download, safeFilename } from '../lib/bytes.js';
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
  Segmented,
  Select,
  TextArea,
  TextInput,
  cx,
} from '../components/ui.jsx';

function passphraseGuidance(value) {
  if (!value) return null;
  if (value.length < 8) return { tone: 'danger', text: 'Too short. Use at least 12 characters, ideally a multi-word passphrase.' };
  if (value.length < 12) return { tone: 'warn', text: 'Short. A longer passphrase (four or more random words) is materially stronger.' };
  return { tone: 'success', text: 'Reasonable length. Strength also depends on unpredictability, not just length.' };
}

export default function EncryptionLab() {
  const { settings } = useSettings();
  const { notify } = useToast();
  const [mode, setMode] = useState('text');
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [aad, setAad] = useState('');
  const [iterations, setIterations] = useState(settings.defaultIterations);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [output, setOutput] = useState(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef(null);
  const clearAfterMs = settings.clearClipboard ? settings.clearClipboardSeconds * 1000 : 0;

  const guidance = passphraseGuidance(passphrase);
  const confirmMismatch = confirm.length > 0 && confirm !== passphrase;
  const textBytes = useMemo(() => new TextEncoder().encode(text).length, [text]);

  function selectFile(nextFile) {
    if (!nextFile) return;
    if (nextFile.size > MAX_FILE_BYTES) {
      setError(`File is ${formatBytes(nextFile.size)}. The limit is ${formatBytes(MAX_FILE_BYTES)}.`);
      setFile(null);
      return;
    }
    setError('');
    setFile(nextFile);
  }

  function validate() {
    if (passphrase.length < 8) return 'Use a passphrase of at least 8 characters (12 or more strongly recommended).';
    if (passphrase !== confirm) return 'The two passphrases do not match.';
    if (mode === 'text') {
      if (!text) return 'Enter some text to encrypt.';
      if (textBytes > MAX_TEXT_BYTES) return `Text exceeds the ${formatBytes(MAX_TEXT_BYTES)} limit.`;
    } else if (!file) {
      return 'Choose a file to encrypt.';
    }
    return '';
  }

  async function handleEncrypt() {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError('');
    setBusy(true);
    setOutput(null);
    try {
      if (mode === 'text') {
        const json = await encryptText({ text, passphrase, aad, iterations });
        setOutput({
          json,
          envelope: JSON.parse(json),
          filename: `password-forge-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.pforge`,
          plaintextSize: textBytes,
          isText: true,
        });
      } else {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const envelope = await encryptBytes({
          plaintext: bytes,
          passphrase,
          aad,
          iterations,
          kind: 'file',
          filename: file.name,
          mime: file.type || 'application/octet-stream',
        });
        const json = serializeEnvelope(envelope);
        setOutput({
          json,
          envelope,
          filename: `${safeFilename(file.name, 'file')}.pforge`,
          plaintextSize: file.size,
          isText: false,
        });
      }
      notify('Encryption complete. Authentication tag generated locally.', 'success');
    } catch (caught) {
      setError(caught.message || 'Encryption failed.');
    } finally {
      setBusy(false);
    }
  }

  function handleDownload() {
    if (!output) return;
    download(output.filename, output.json, 'application/json');
    notify('Encrypted payload downloaded.', 'info');
  }

  function handleClear() {
    setText('');
    setFile(null);
    setPassphrase('');
    setConfirm('');
    setAad('');
    setOutput(null);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    notify('Inputs and output cleared from this tab.', 'info');
  }

  const envelope = output?.envelope;

  return (
    <div>
      <PageHeader
        index="Workspace 04 — Encryption Lab"
        title="Encrypt text or files locally"
        description="AES-256-GCM with a fresh 96-bit IV per operation and a password-derived key (PBKDF2-HMAC-SHA-256). The algorithm, KDF parameters, salt and IV travel with the payload in a versioned envelope."
        actions={
          <Segmented
            value={mode}
            onChange={(next) => {
              setMode(next);
              setError('');
            }}
            options={[
              { id: 'text', label: 'Text', icon: FileText },
              { id: 'file', label: 'File', icon: FileLock2 },
            ]}
          />
        }
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-5">
          <Panel>
            <SectionTitle
              title={mode === 'text' ? 'Plaintext' : 'File to encrypt'}
              hint={
                mode === 'text'
                  ? `Up to ${formatBytes(MAX_TEXT_BYTES)} of UTF-8 text.`
                  : `Any file up to ${formatBytes(MAX_FILE_BYTES)}. Nothing is uploaded.`
              }
              action={mode === 'text' ? <Badge>{formatBytes(textBytes)}</Badge> : null}
            />

            {mode === 'text' ? (
              <TextArea
                rows={9}
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Secret notes, recovery codes, configuration…"
                className="min-h-[200px] text-[12.5px]"
                aria-label="Text to encrypt"
              />
            ) : (
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  selectFile(event.dataTransfer.files?.[0]);
                }}
                className={cx(
                  'rounded-lg border border-dashed px-5 py-8 text-center transition-colors',
                  dragging ? 'border-gold/60 bg-gold/[0.05]' : 'border-line bg-ink/40',
                )}
              >
                <Upload size={20} className="mx-auto mb-2 text-muted/60" aria-hidden="true" />
                <p className="text-[12.5px] text-parchment/85">
                  {file ? file.name : 'Drop a file here, or choose one'}
                </p>
                {file && (
                  <p className="mt-1 font-mono text-[11px] text-muted">
                    {formatBytes(file.size)} · {file.type || 'unknown type'}
                  </p>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  className="sr-only"
                  id="encrypt-file"
                  onChange={(event) => selectFile(event.target.files?.[0])}
                />
                <div className="mt-3 flex justify-center gap-2">
                  <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
                    Choose file
                  </Button>
                  {file && (
                    <Button variant="ghost" size="sm" onClick={() => setFile(null)}>
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            )}

            <div className="mt-5 space-y-4">
              <Field label="Master passphrase" hint={guidance?.text} error={passphrase ? null : undefined}>
                <TextInput
                  type="password"
                  value={passphrase}
                  onChange={(event) => setPassphrase(event.target.value)}
                  placeholder="Long, unique, memorable"
                  autoComplete="new-password"
                  spellCheck={false}
                  aria-label="Master passphrase"
                />
              </Field>
              <Field
                label="Confirm passphrase"
                error={confirmMismatch ? 'Passphrases do not match.' : undefined}
              >
                <TextInput
                  type="password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                  placeholder="Repeat the passphrase"
                  autoComplete="new-password"
                  spellCheck={false}
                  aria-label="Confirm passphrase"
                />
              </Field>
              <Field
                label="Additional authenticated data (optional)"
                hint="Not secret and not encrypted. If set, decryption requires the exact same value."
              >
                <TextInput
                  mono
                  value={aad}
                  onChange={(event) => setAad(event.target.value)}
                  placeholder="e.g. project-atlas/2026"
                  autoComplete="off"
                  spellCheck={false}
                  aria-label="Additional authenticated data"
                />
              </Field>
            </div>

            {guidance && (
              <Notice
                tone={guidance.tone}
                compact
                className="mt-4"
                title={guidance.tone === 'danger' ? 'Passphrase too short' : guidance.tone === 'warn' ? 'Passphrase on the short side' : 'Passphrase length noted'}
              >
                {guidance.text} There is no recovery mechanism if you forget it.
              </Notice>
            )}

            {error && (
              <Notice tone="danger" className="mt-4">
                {error}
              </Notice>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Button variant="primary" icon={Lock} onClick={handleEncrypt} loading={busy} disabled={busy}>
                {busy ? 'Deriving key…' : 'Encrypt'}
              </Button>
              <Button variant="ghost" icon={Trash2} onClick={handleClear}>
                Clear all
              </Button>
              <span className="ml-auto font-mono text-[10.5px] text-muted/60">
                PBKDF2 · {iterations.toLocaleString()} iters
              </span>
            </div>
          </Panel>

          <Panel>
            <SectionTitle title="Key derivation" hint="Applies to this encryption only." />
            <Field label="PBKDF2 iteration count">
              <Select
                value={iterations}
                onChange={(event) => setIterations(Number(event.target.value))}
                aria-label="PBKDF2 iteration count"
              >
                {ITERATION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
                {!ITERATION_OPTIONS.some((option) => option.value === iterations) && (
                  <option value={iterations}>{iterations.toLocaleString()}</option>
                )}
              </Select>
            </Field>
            <p className="mt-2 text-[11px] leading-relaxed text-muted/80">
              Higher cost slows both you and an attacker. On a low-end phone, 600,000 iterations can take
              several seconds — measure it in Settings before choosing a higher value. Imported payloads always
              use the parameters stored in their own header ({MIN_ITERATIONS.toLocaleString()}–
              {MAX_ITERATIONS.toLocaleString()} accepted).
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge tone="gold">AES-256-GCM</Badge>
              <Badge>96-bit IV</Badge>
              <Badge>128-bit tag</Badge>
              <Badge>16-byte salt</Badge>
              <Badge>format v1</Badge>
            </div>
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel className="flex min-h-[300px] flex-col">
            <SectionTitle
              title="Encrypted payload"
              hint={output ? 'Portable JSON envelope. Authenticated header included.' : 'Output appears after encryption.'}
              action={
                output && (
                  <div className="flex items-center gap-1.5">
                    <CopyButton value={output.json} label="Copy" clearAfterMs={clearAfterMs} variant="secondary" />
                    <Button variant="primary" size="sm" icon={Download} onClick={handleDownload}>
                      Download
                    </Button>
                  </div>
                )
              }
            />

            {!output ? (
              <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-line px-6 py-14 text-center">
                <ShieldCheck size={22} className="mb-3 text-muted/40" aria-hidden="true" />
                <p className="text-[12.5px] text-parchment/80">Nothing encrypted yet</p>
                <p className="mt-1 max-w-xs text-[11.5px] leading-relaxed text-muted">
                  The result contains your ciphertext plus the non-secret parameters required to decrypt it.
                </p>
              </div>
            ) : (
              <>
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <Badge tone="success">
                    <ShieldCheck size={11} /> authenticated
                  </Badge>
                  <Badge>{formatBytes(output.plaintextSize)} plaintext</Badge>
                  <Badge>{formatBytes(new Blob([output.json]).size)} payload</Badge>
                </div>

                <KeyValue
                  items={[
                    { label: 'Format', value: `${envelope.format} v${envelope.version}` },
                    { label: 'Algorithm', value: envelope.algorithm },
                    { label: 'KDF', value: `${envelope.kdf.name} · ${envelope.kdf.hash}` },
                    { label: 'Iterations', value: envelope.kdf.iterations.toLocaleString() },
                    { label: 'Salt (b64)', value: envelope.kdf.salt },
                    { label: 'IV (b64)', value: envelope.iv },
                    { label: 'AAD required', value: envelope.meta.aad ? 'yes' : 'no' },
                    ...(envelope.meta.kind === 'file'
                      ? [
                          { label: 'Filename', value: envelope.meta.filename },
                          { label: 'MIME', value: envelope.meta.mime || '—' },
                        ]
                      : []),
                    { label: 'Created', value: envelope.meta.createdAt },
                    { label: 'Ciphertext', value: formatBytes(Math.ceil((envelope.ciphertext.length * 3) / 4)) },
                  ]}
                />

                <details className="mt-4">
                  <summary className="cursor-pointer text-[11.5px] text-muted transition-colors hover:text-parchment">
                    View envelope preview
                  </summary>
                  <pre className="mt-2 max-h-52 overflow-auto rounded-lg border border-line bg-ink/60 p-3 font-mono text-[10.5px] leading-relaxed text-muted">
{output.isText
  ? output.json.slice(0, 1400) + (output.json.length > 1400 ? '\n…' : '')
  : `${output.json.slice(0, 900)}\n… (${formatBytes(output.json.length)} total)`}
                  </pre>
                </details>

                <p className="mt-4 text-[11px] leading-relaxed text-muted/70">
                  Save the payload somewhere safe. It is useless without the passphrase, and unrecoverable if the
                  passphrase is lost. Additional authenticated data is not stored — keep it separately.
                </p>
              </>
            )}
          </Panel>

          <Panel>
            <SectionTitle title="What this does and does not protect" />
            <ul className="space-y-2.5 text-[12px] leading-relaxed text-muted">
              <li className="flex gap-2">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-success/70" />
                Protects the payload at rest and in transit, and detects any modification to header or ciphertext.
              </li>
              <li className="flex gap-2">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-warn/70" />
                Does not hide the fact that you encrypted something, the approximate size, or the timestamp.
              </li>
              <li className="flex gap-2">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-danger/70" />
                Does not protect against a compromised browser, malicious extensions, or a passphrase recorded by
                a keylogger.
              </li>
            </ul>
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-line bg-ink/40 px-3 py-2.5">
              <RefreshCw size={13} className="mt-0.5 shrink-0 text-gold/70" aria-hidden="true" />
              <p className="text-[11px] leading-relaxed text-muted">
                Default cost: {DEFAULT_ITERATIONS.toLocaleString()} PBKDF2 iterations. Every operation generates
                a new random salt and IV, so no IV is ever reused with the same key.
              </p>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
