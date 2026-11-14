import { useRef, useState } from 'react';
import {
  ArrowLeftRight,
  CheckCircle2,
  Fingerprint,
  FlaskConical,
  Hash,
  ShieldAlert,
  ShieldCheck,
  Upload,
  XCircle,
} from 'lucide-react';
import {
  ARGON2_DEFAULTS,
  HASH_ALGORITHMS,
  MAX_HASH_FILE_BYTES,
  argon2idHash,
  argon2idVerify,
  compareHashes,
  hashBytes,
  hashText,
  hmacText,
  readFileBytes,
} from '../lib/hash.js';
import { formatBytes } from '../lib/bytes.js';
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
  Tabs,
  TextArea,
  TextInput,
  cx,
} from '../components/ui.jsx';

function SourceToggle({ value, onChange }) {
  return (
    <Segmented
      value={value}
      onChange={onChange}
      size="sm"
      options={[
        { id: 'text', label: 'Text' },
        { id: 'file', label: 'File' },
      ]}
    />
  );
}

function FilePicker({ file, onFile }) {
  const ref = useRef(null);
  return (
    <div className="rounded-lg border border-dashed border-line bg-ink/40 px-4 py-5 text-center">
      <input
        ref={ref}
        type="file"
        className="sr-only"
        onChange={(event) => {
          const next = event.target.files?.[0];
          if (next) onFile(next);
          event.target.value = '';
        }}
      />
      <Upload size={17} className="mx-auto mb-2 text-muted/60" aria-hidden="true" />
      <p className="text-[12px] text-parchment/85">{file ? file.name : 'No file selected'}</p>
      <p className="mt-1 font-mono text-[10.5px] text-muted">
        {file ? `${formatBytes(file.size)} · ${file.type || 'unknown'}` : `Limit ${formatBytes(MAX_HASH_FILE_BYTES)}`}
      </p>
      <Button variant="secondary" size="sm" className="mt-3" onClick={() => ref.current?.click()}>
        Choose file
      </Button>
    </div>
  );
}

function DigestPanel({ clearAfterMs }) {
  const [algorithm, setAlgorithm] = useState('SHA-256');
  const [source, setSource] = useState('text');
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function compute() {
    setBusy(true);
    setError('');
    setResult('');
    try {
      let hex;
      if (source === 'text') {
        hex = await hashText(algorithm, text);
      } else {
        const bytes = await readFileBytes(file);
        hex = await hashBytes(algorithm, bytes);
      }
      setResult(hex);
    } catch (caught) {
      setError(caught.message || 'Hashing failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel>
        <SectionTitle title="Input" hint="Hashing is one-way; the digest is not reversible." />
        <div className="space-y-4">
          <Field label="Algorithm">
            <Select value={algorithm} onChange={(event) => setAlgorithm(event.target.value)} aria-label="Hash algorithm">
              {HASH_ALGORITHMS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label} — {item.bits}-bit
                </option>
              ))}
            </Select>
          </Field>
          <SourceToggle value={source} onChange={(next) => { setSource(next); setResult(''); }} />
          {source === 'text' ? (
            <TextArea
              rows={6}
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                setResult('');
              }}
              placeholder="Text to hash…"
              aria-label="Text to hash"
            />
          ) : (
            <FilePicker file={file} onFile={(next) => { setFile(next); setResult(''); }} />
          )}
          {error && <Notice tone="danger">{error}</Notice>}
          <div className="flex items-center gap-2">
            <Button variant="primary" icon={Hash} onClick={compute} loading={busy} disabled={busy}>
              Compute digest
            </Button>
            {result && (
              <Badge tone="success">
                <CheckCircle2 size={11} /> computed
              </Badge>
            )}
          </div>
        </div>
      </Panel>

      <Panel>
        <SectionTitle
          title="Digest"
          hint={HASH_ALGORITHMS.find((item) => item.id === algorithm)?.note}
          action={<CopyButton value={result} label="Copy" variant="secondary" clearAfterMs={clearAfterMs} />}
        />
        {result ? (
          <>
            <pre className="overflow-auto whitespace-pre-wrap break-all rounded-lg border border-line bg-ink/60 p-3.5 font-mono text-[12.5px] leading-relaxed text-gold/90">
              {result}
            </pre>
            <KeyValue
              className="mt-4"
              items={[
                { label: 'Algorithm', value: algorithm },
                { label: 'Length', value: `${result.length} hex chars` },
                { label: 'Bits', value: `${result.length * 4}` },
                { label: 'Encoding', value: 'lowercase hex' },
              ]}
            />
          </>
        ) : (
          <div className="rounded-lg border border-dashed border-line px-5 py-14 text-center">
            <Hash size={20} className="mx-auto mb-2 text-muted/40" aria-hidden="true" />
            <p className="text-[12px] text-muted">The digest appears here.</p>
          </div>
        )}
        <Notice tone="warn" compact className="mt-4" title="Not for storing passwords">
          SHA-256/384/512 are fast general-purpose digests. Fast is exactly what you do not want for password
          storage — use Argon2id (or bcrypt/scrypt) with a per-user salt on the server.
        </Notice>
      </Panel>
    </div>
  );
}

function HmacPanel({ clearAfterMs }) {
  const [key, setKey] = useState('');
  const [message, setMessage] = useState('');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function compute() {
    setBusy(true);
    setError('');
    setResult('');
    try {
      setResult(await hmacText(key, message));
    } catch (caught) {
      setError(caught.message || 'HMAC failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel>
        <SectionTitle
          title="HMAC-SHA-256"
          hint="Keyed authentication: proves a message came from someone holding the key and was not altered."
        />
        <div className="space-y-4">
          <Field label="Shared key" hint="Use a high-entropy key, not a human-chosen password.">
            <TextInput
              type="password"
              value={key}
              onChange={(event) => {
                setKey(event.target.value);
                setResult('');
              }}
              placeholder="Secret key"
              autoComplete="off"
              spellCheck={false}
              aria-label="HMAC key"
            />
          </Field>
          <Field label="Message">
            <TextArea
              rows={6}
              value={message}
              onChange={(event) => {
                setMessage(event.target.value);
                setResult('');
              }}
              placeholder="Message to authenticate…"
              aria-label="HMAC message"
            />
          </Field>
          {error && <Notice tone="danger">{error}</Notice>}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" icon={ShieldCheck} onClick={compute} loading={busy} disabled={busy}>
              Compute HMAC
            </Button>
            <Badge>32-byte tag</Badge>
          </div>
        </div>
      </Panel>

      <Panel>
        <SectionTitle
          title="Authentication tag"
          action={<CopyButton value={result} label="Copy" variant="secondary" clearAfterMs={clearAfterMs} />}
        />
        {result ? (
          <>
            <pre className="overflow-auto whitespace-pre-wrap break-all rounded-lg border border-line bg-ink/60 p-3.5 font-mono text-[12.5px] leading-relaxed text-gold/90">
              {result}
            </pre>
            <Notice tone="info" compact className="mt-4">
              Anyone holding the key can produce the same tag. HMAC gives integrity and authenticity, not
              confidentiality — combine it with encryption if the message is sensitive.
            </Notice>
          </>
        ) : (
          <div className="rounded-lg border border-dashed border-line px-5 py-14 text-center">
            <Fingerprint size={20} className="mx-auto mb-2 text-muted/40" aria-hidden="true" />
            <p className="text-[12px] text-muted">The HMAC tag appears here.</p>
          </div>
        )}
      </Panel>
    </div>
  );
}

function VerifyPanel({ clearAfterMs }) {
  const [algorithm, setAlgorithm] = useState('SHA-256');
  const [source, setSource] = useState('text');
  const [text, setText] = useState('');
  const [file, setFile] = useState(null);
  const [expected, setExpected] = useState('');
  const [outcome, setOutcome] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [hashA, setHashA] = useState('');
  const [hashB, setHashB] = useState('');
  const comparison = compareHashes(hashA, hashB);

  async function verify() {
    setBusy(true);
    setError('');
    setOutcome(null);
    try {
      const computed =
        source === 'text' ? await hashText(algorithm, text) : await hashBytes(algorithm, await readFileBytes(file));
      const check = compareHashes(expected, computed);
      setOutcome({ ...check, computed });
    } catch (caught) {
      setError(caught.message || 'Verification failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel>
        <SectionTitle title="Verify a supplied hash" hint="Recompute locally and compare." />
        <div className="space-y-4">
          <Field label="Algorithm">
            <Select value={algorithm} onChange={(event) => setAlgorithm(event.target.value)} aria-label="Verification algorithm">
              {HASH_ALGORITHMS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>
          <SourceToggle value={source} onChange={(next) => { setSource(next); setOutcome(null); }} />
          {source === 'text' ? (
            <TextArea
              rows={4}
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                setOutcome(null);
              }}
              placeholder="Original text…"
              aria-label="Text to verify"
            />
          ) : (
            <FilePicker file={file} onFile={(next) => { setFile(next); setOutcome(null); }} />
          )}
          <Field label="Expected hash" hint="Hex, spaces/colons allowed. Case-insensitive.">
            <TextArea
              rows={3}
              value={expected}
              onChange={(event) => {
                setExpected(event.target.value);
                setOutcome(null);
              }}
              placeholder="Paste the published digest…"
              aria-label="Expected hash"
            />
          </Field>
          {error && <Notice tone="danger">{error}</Notice>}
          <Button variant="primary" icon={ShieldCheck} onClick={verify} loading={busy} disabled={busy}>
            Verify
          </Button>

          {outcome && (
            <div className="mt-1">
              {outcome.valid ? (
                <Notice
                  tone={outcome.ok ? 'success' : 'danger'}
                  title={outcome.ok ? 'Hashes match' : 'Hashes do not match'}
                >
                  {outcome.ok
                    ? 'The recomputed digest is identical to the supplied value.'
                    : outcome.reason}{' '}
                  A match only proves the bytes are the same — not that the source is trustworthy.
                </Notice>
              ) : (
                <Notice tone="warn" title="Cannot compare">
                  {outcome.reason}
                </Notice>
              )}
              {outcome.computed && (
                <div className="mt-3">
                  <p className="mb-1.5 text-[10.5px] uppercase tracking-[0.14em] text-muted">Computed digest</p>
                  <pre className="break-all rounded-lg border border-line bg-ink/60 p-3 font-mono text-[11.5px] leading-relaxed text-muted">
                    {outcome.computed}
                  </pre>
                  <CopyButton value={outcome.computed} label="Copy computed" clearAfterMs={clearAfterMs} className="mt-2" />
                </div>
              )}
            </div>
          )}
        </div>
      </Panel>

      <Panel>
        <SectionTitle title="Compare two hash values" hint="Quick equality check with constant-time comparison." />
        <div className="space-y-3">
          <Field label="Hash A">
            <TextArea rows={3} value={hashA} onChange={(event) => setHashA(event.target.value)} placeholder="First digest" aria-label="Hash A" />
          </Field>
          <Field label="Hash B">
            <TextArea rows={3} value={hashB} onChange={(event) => setHashB(event.target.value)} placeholder="Second digest" aria-label="Hash B" />
          </Field>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <ArrowLeftRight size={14} className="text-muted" aria-hidden="true" />
          {!hashA.trim() || !hashB.trim() ? (
            <span className="text-[12px] text-muted">Enter both values to compare.</span>
          ) : comparison.valid ? (
            comparison.ok ? (
              <Badge tone="success">
                <CheckCircle2 size={11} /> identical
              </Badge>
            ) : (
              <Badge tone="danger">
                <XCircle size={11} /> different
              </Badge>
            )
          ) : (
            <Badge tone="warn">
              <ShieldAlert size={11} /> not hexadecimal
            </Badge>
          )}
        </div>
        {!comparison.valid && hashA.trim() && hashB.trim() && (
          <p className="mt-2 text-[11.5px] leading-relaxed text-muted">{comparison.reason}</p>
        )}
        <div className="mt-4 rounded-lg border border-line bg-ink/40 p-3">
          <p className="text-[11px] leading-relaxed text-muted/80">
            Lengths: A {comparison.expected.length || 0} chars · B {comparison.actual.length || 0} chars. A
            digest comparison should happen where the expected value is trusted; this tool only checks
            equality of what you pasted.
          </p>
        </div>
      </Panel>
    </div>
  );
}

function Argon2Panel({ clearAfterMs }) {
  const [password, setPassword] = useState('');
  const [result, setResult] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [encodedToVerify, setEncodedToVerify] = useState('');
  const [verifyPassword, setVerifyPassword] = useState('');
  const [verifyResult, setVerifyResult] = useState(null);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyError, setVerifyError] = useState('');

  async function runHash() {
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const started = performance.now();
      const output = await argon2idHash(password);
      setElapsed(Math.round(performance.now() - started));
      setResult(output);
      setEncodedToVerify(output.encoded);
    } catch (caught) {
      setError(caught.message || 'Argon2id hashing failed.');
    } finally {
      setBusy(false);
    }
  }

  async function runVerify() {
    setVerifyBusy(true);
    setVerifyError('');
    setVerifyResult(null);
    try {
      setVerifyResult(await argon2idVerify(verifyPassword, encodedToVerify));
    } catch (caught) {
      setVerifyError(caught.message || 'Verification failed.');
    } finally {
      setVerifyBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Notice tone="warn" title="Demonstration only">
        This Argon2id implementation (hash-wasm, WebAssembly) runs locally. Hashing a password in the browser
        can demonstrate parameters, but it does not replace server-side authentication: a server must own the
        salts, enforce rate limits and protect the password hashes.
      </Notice>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel>
          <SectionTitle title="Hash with Argon2id" hint="OWASP-style baseline parameters: m=64 MiB, t=3, p=1." />
          <div className="space-y-4">
            <Field label="Password" hint="Never leaves this tab. Nothing is stored.">
              <TextInput
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password to hash"
                autoComplete="new-password"
                spellCheck={false}
                aria-label="Password to hash"
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Memory', value: `${ARGON2_DEFAULTS.memoryKiB / 1024} MiB` },
                { label: 'Iterations', value: '3' },
                { label: 'Parallelism', value: '1' },
                { label: 'Output', value: '32 bytes' },
                { label: 'Salt', value: '16 B random' },
                { label: 'Encoding', value: 'PHC string' },
              ].map((item) => (
                <div key={item.label} className="rounded-md border border-line bg-ink/40 px-2.5 py-1.5">
                  <p className="text-[9.5px] uppercase tracking-[0.14em] text-muted/70">{item.label}</p>
                  <p className="font-mono text-[11.5px] text-parchment/85">{item.value}</p>
                </div>
              ))}
            </div>
            {error && <Notice tone="danger">{error}</Notice>}
            <div className="flex items-center gap-2">
              <Button variant="primary" icon={FlaskConical} onClick={runHash} loading={busy} disabled={busy || !password}>
                {busy ? 'Hashing…' : 'Hash with Argon2id'}
              </Button>
              {elapsed > 0 && <Badge>{elapsed} ms</Badge>}
            </div>

            {result && (
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-[10.5px] uppercase tracking-[0.14em] text-muted">PHC string</p>
                  <CopyButton value={result.encoded} label="Copy" clearAfterMs={clearAfterMs} />
                </div>
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-line bg-ink/60 p-3 font-mono text-[11px] leading-relaxed text-gold/90">
                  {result.encoded}
                </pre>
                <p className="mt-2 text-[11px] leading-relaxed text-muted/80">
                  A new random salt is generated for every hash, which is why hashing the same password twice
                  yields different strings.
                </p>
              </div>
            )}
          </div>
        </Panel>

        <Panel>
          <SectionTitle title="Verify a PHC string" hint="Re-derives with the stored parameters and salt." />
          <div className="space-y-4">
            <Field label="Argon2id hash">
              <TextArea
                rows={4}
                value={encodedToVerify}
                onChange={(event) => {
                  setEncodedToVerify(event.target.value);
                  setVerifyResult(null);
                }}
                placeholder="$argon2id$v=19$m=65536,t=3,p=1$…$…"
                aria-label="Argon2id hash"
              />
            </Field>
            <Field label="Password to test">
              <TextInput
                type="password"
                value={verifyPassword}
                onChange={(event) => {
                  setVerifyPassword(event.target.value);
                  setVerifyResult(null);
                }}
                placeholder="Candidate password"
                autoComplete="off"
                spellCheck={false}
                aria-label="Password to verify"
              />
            </Field>
            {verifyError && <Notice tone="danger">{verifyError}</Notice>}
            <Button
              variant="secondary"
              icon={ShieldCheck}
              onClick={runVerify}
              loading={verifyBusy}
              disabled={verifyBusy || !encodedToVerify || !verifyPassword}
            >
              Verify match
            </Button>

            {verifyResult && (
              <Notice
                tone={verifyResult.ok ? 'success' : 'danger'}
                title={verifyResult.ok ? 'Password matches the hash' : 'Password does not match'}
              >
                {verifyResult.ok
                  ? `Re-derived with m=${verifyResult.params.memoryKiB} KiB, t=${verifyResult.params.iterations}, p=${verifyResult.params.parallelism}.`
                  : 'A mismatch can also mean the PHC string uses parameters this demonstration will not reproduce.'}
              </Notice>
            )}

            <div className="rounded-lg border border-line bg-ink/40 p-3">
              <p className="flex gap-2 text-[11px] leading-relaxed text-muted">
                <ShieldAlert size={13} className="mt-0.5 shrink-0 text-warn/80" aria-hidden="true" />
                Real authentication should compare hashes on the server, use a unique salt per user, and add
                rate limiting, MFA and breach monitoring. Never ship password hashes to the client.
              </p>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

export default function HashLaboratory() {
  const { settings } = useSettings();
  const { notify } = useToast();
  const [tab, setTab] = useState('digest');
  const clearAfterMs = settings.clearClipboard ? settings.clearClipboardSeconds * 1000 : 0;

  return (
    <div>
      <PageHeader
        index="Workspace 06 — Hash Laboratory"
        title="Digests, HMAC and password hashing"
        description="Compute SHA-2 digests over text or files, authenticate messages with HMAC-SHA-256, verify published hashes, and explore Argon2id parameters. All operations use Web Crypto or a maintained WASM implementation."
        actions={
          <Badge tone="gold">
            <ShieldCheck size={11} /> Web Crypto
          </Badge>
        }
      >
        <div className="mt-5">
          <Tabs
            value={tab}
            onChange={(next) => {
              setTab(next);
              notify(`Switched to ${next}`, 'info');
            }}
            tabs={[
              { id: 'digest', label: 'SHA-2 digest', icon: Hash },
              { id: 'hmac', label: 'HMAC-SHA-256', icon: Fingerprint },
              { id: 'verify', label: 'Verify & compare', icon: ShieldCheck },
              { id: 'argon2', label: 'Argon2id', icon: FlaskConical },
            ]}
          />
        </div>
      </PageHeader>

      <div className={cx('animate-fade')}>
        {tab === 'digest' && <DigestPanel clearAfterMs={clearAfterMs} />}
        {tab === 'hmac' && <HmacPanel clearAfterMs={clearAfterMs} />}
        {tab === 'verify' && <VerifyPanel clearAfterMs={clearAfterMs} />}
        {tab === 'argon2' && <Argon2Panel clearAfterMs={clearAfterMs} />}
      </div>
    </div>
  );
}
