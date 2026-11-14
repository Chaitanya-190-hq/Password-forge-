import { useState } from 'react';
import {
  Binary,
  Braces,
  Download,
  Fingerprint,
  KeyRound,
  Link2,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import {
  KEY_TYPES,
  entropyBitsForBytes,
  generateAesKeyMaterial,
  generateSigningKeyPair,
  randomBase64Token,
  randomHexString,
  randomRawBytes,
  randomUrlSafeToken,
  validateByteLength,
} from '../lib/keys.js';
import { hashBytes } from '../lib/hash.js';
import { bytesToHex, download, formatBytes, safeFilename } from '../lib/bytes.js';
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
  Range,
  SectionTitle,
  TextInput,
  cx,
} from '../components/ui.jsx';

const TYPE_ICONS = {
  hex: Braces,
  base64: Binary,
  urlsafe: Link2,
  bytes: Binary,
  aes: KeyRound,
  ecdsa: Fingerprint,
};

export default function KeyForge() {
  const { settings } = useSettings();
  const { notify } = useToast();
  const [type, setType] = useState('hex');
  const [byteLength, setByteLength] = useState(32);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [warningOpen, setWarningOpen] = useState(false);
  const [understood, setUnderstood] = useState(false);

  const clearAfterMs = settings.clearClipboard ? settings.clearClipboardSeconds * 1000 : 0;
  const requiresLength = !['aes', 'ecdsa'].includes(type);

  async function generate() {
    setError('');
    setBusy(true);
    setResult(null);
    try {
      if (type === 'hex') {
        setResult({ kind: 'text', value: randomHexString(validateByteLength(byteLength)), bytes: byteLength });
      } else if (type === 'base64') {
        setResult({ kind: 'text', value: randomBase64Token(validateByteLength(byteLength)), bytes: byteLength });
      } else if (type === 'urlsafe') {
        setResult({ kind: 'text', value: randomUrlSafeToken(validateByteLength(byteLength)), bytes: byteLength });
      } else if (type === 'bytes') {
        const raw = randomRawBytes(validateByteLength(byteLength));
        const fingerprint = await hashBytes('SHA-256', raw);
        setResult({
          kind: 'bytes',
          bytes: raw,
          size: raw.length,
          fingerprint,
          preview: bytesToHex(raw.subarray(0, 16)),
        });
      } else if (type === 'aes') {
        const material = await generateAesKeyMaterial(256);
        setResult({ kind: 'aes', material });
      } else if (type === 'ecdsa') {
        const pair = await generateSigningKeyPair();
        setResult({ kind: 'ecdsa', pair });
      }
    } catch (caught) {
      setError(caught.message || 'Generation failed.');
    } finally {
      setBusy(false);
    }
  }

  function downloadText(name, value) {
    download(safeFilename(name), value, 'text/plain');
    notify('Material downloaded.', 'info');
  }

  function confirmPrivateExport() {
    if (!understood) return;
    if (type === 'aes' && result?.kind === 'aes') {
      download(safeFilename('password-forge-aes-256-key.txt'), `AES-256-GCM key (base64)\n${result.material.base64}\n`, 'text/plain');
    }
    if (type === 'ecdsa' && result?.kind === 'ecdsa') {
      download(
        safeFilename('password-forge-ecdsa-p256-private.jwk.json'),
        JSON.stringify(result.pair.privateJwk, null, 2),
        'application/json',
      );
    }
    setWarningOpen(false);
    setUnderstood(false);
    notify('Private key material downloaded. Store it offline.', 'danger');
  }

  const selected = KEY_TYPES.find((item) => item.id === type);

  return (
    <div>
      <PageHeader
        index="Workspace 07 — Key Forge"
        title="Generate random keys and tokens"
        description="Cryptographically secure material from crypto.getRandomValues and SubtleCrypto key generation. Enough entropy to be a real key, not a decorative string."
        actions={<Badge tone="gold">crypto.getRandomValues</Badge>}
      />

      <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
        <div className="space-y-5">
          <Panel>
            <SectionTitle title="Material type" hint="Only one type is generated per action." />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
              {KEY_TYPES.map((item) => {
                const Icon = TYPE_ICONS[item.id] || KeyRound;
                const active = item.id === type;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setType(item.id);
                      setResult(null);
                      setError('');
                      if (item.id !== 'aes' && item.id !== 'ecdsa') setByteLength(item.defaultBytes);
                    }}
                    className={cx(
                      'flex items-start gap-3 rounded-lg border px-3.5 py-3 text-left transition-colors',
                      active
                        ? 'border-gold/40 bg-gold/[0.06]'
                        : 'border-line bg-ink/35 hover:border-line hover:bg-elevated/40',
                    )}
                  >
                    <Icon size={16} className={cx('mt-0.5 shrink-0', active ? 'text-gold' : 'text-muted/70')} aria-hidden="true" />
                    <span>
                      <span className="block text-[12.5px] text-parchment/90">{item.label}</span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-muted">{item.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {requiresLength && (
              <div className="mt-5">
                <Range
                  label="Random bytes"
                  min={8}
                  max={128}
                  value={byteLength}
                  onChange={setByteLength}
                  display={`${byteLength} B · ${entropyBitsForBytes(byteLength)} bits`}
                />
              </div>
            )}

            <Button variant="primary" size="lg" icon={Sparkles} className="mt-5 w-full" onClick={generate} loading={busy} disabled={busy}>
              {busy ? 'Generating…' : `Generate ${selected?.label.toLowerCase()}`}
            </Button>
            {error && (
              <Notice tone="danger" className="mt-3">
                {error}
              </Notice>
            )}
          </Panel>

          <Notice tone="info" title="Nothing is saved">
            Generated material lives in this tab only. It is never stored in IndexedDB, localStorage or a URL.
            Export it deliberately and keep a private key offline.
          </Notice>
        </div>

        <div className="space-y-5">
          <Panel className="flex min-h-[380px] flex-col">
            <SectionTitle
              title="Generated material"
              hint={result ? 'Ready for explicit export.' : 'Generate to produce material.'}
              action={
                result?.kind === 'text' ? (
                  <div className="flex items-center gap-1.5">
                    <CopyButton value={result.value} label="Copy" variant="secondary" clearAfterMs={clearAfterMs} />
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={Download}
                      onClick={() => downloadText(`password-forge-${type}.txt`, result.value)}
                    >
                      Download
                    </Button>
                  </div>
                ) : null
              }
            />

            {!result ? (
              <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-line px-6 py-16 text-center">
                <KeyRound size={22} className="mb-3 text-muted/40" aria-hidden="true" />
                <p className="text-[12.5px] text-parchment/80">No material generated</p>
                <p className="mt-1 max-w-xs text-[11.5px] leading-relaxed text-muted">
                  Choose a type and press generate. Values appear only in this tab.
                </p>
              </div>
            ) : result.kind === 'text' ? (
              <>
                <pre className="max-h-[40vh] overflow-auto whitespace-pre-wrap break-all rounded-lg border border-line bg-ink/60 p-4 font-mono text-[13px] leading-relaxed text-gold/90">
                  {result.value}
                </pre>
                <KeyValue
                  className="mt-4"
                  items={[
                    { label: 'Type', value: selected?.label },
                    { label: 'Bytes', value: `${result.bytes}` },
                    { label: 'Entropy', value: `${entropyBitsForBytes(result.bytes)} bits` },
                    { label: 'Encoding length', value: `${result.value.length} chars` },
                  ]}
                />
              </>
            ) : result.kind === 'bytes' ? (
              <>
                <div className="rounded-lg border border-line bg-ink/60 p-4">
                  <p className="text-[12.5px] text-parchment/85">Binary entropy generated</p>
                  <p className="mt-1 font-mono text-[11px] text-muted">
                    {formatBytes(result.size)} · {generatedBits(result.size)} bits
                  </p>
                  <pre className="mt-3 break-all rounded border border-line/60 bg-ink/40 p-2.5 font-mono text-[10.5px] text-muted/80">
                    {result.preview}…
                  </pre>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={Download}
                    className="mt-3"
                    onClick={() => {
                      download('password-forge-random.bin', result.bytes, 'application/octet-stream');
                      notify('Random bytes downloaded.', 'info');
                    }}
                  >
                    Download .bin
                  </Button>
                </div>
                <KeyValue
                  className="mt-4"
                  items={[
                    { label: 'Size', value: formatBytes(result.size) },
                    { label: 'Entropy', value: `${generatedBits(result.size)} bits` },
                    { label: 'SHA-256 fingerprint', value: result.fingerprint.slice(0, 32) + '…' },
                  ]}
                />
                <p className="mt-3 text-[11px] leading-relaxed text-muted/75">
                  The fingerprint is computed locally so you can confirm a downloaded copy later. It reveals
                  nothing about the bytes.
                </p>
              </>
            ) : result.kind === 'aes' ? (
              <>
                <Notice tone="warn" compact className="mb-4" title="Symmetric key — treat as private">
                  Anyone holding these bytes can decrypt anything encrypted with this key.
                </Notice>
                <div className="space-y-3">
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <p className="text-[10.5px] uppercase tracking-[0.14em] text-muted">Base64</p>
                      <CopyButton value={result.material.base64} clearAfterMs={clearAfterMs} />
                    </div>
                    <pre className="break-all rounded-lg border border-line bg-ink/60 p-3 font-mono text-[12px] leading-relaxed text-gold/90">
                      {result.material.base64}
                    </pre>
                  </div>
                  <div>
                    <p className="mb-1.5 text-[10.5px] uppercase tracking-[0.14em] text-muted">Hex</p>
                    <pre className="break-all rounded-lg border border-line bg-ink/60 p-3 font-mono text-[11.5px] leading-relaxed text-muted">
                      {result.material.hex}
                    </pre>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" icon={Download} onClick={() => setWarningOpen(true)}>
                    Export key material…
                  </Button>
                </div>
                <KeyValue
                  className="mt-4"
                  items={[
                    { label: 'Type', value: result.material.type },
                    { label: 'Length', value: `${result.material.bits} bits` },
                    { label: 'Entropy', value: `${generatedBits(32)} bits` },
                    { label: 'Storage', value: 'memory only' },
                  ]}
                />
              </>
            ) : (
              <>
                <Notice tone="warn" compact className="mb-4" title="Asymmetric signing key pair">
                  The public key is safe to share. The private key is the credential — export it only into
                  protected storage.
                </Notice>
                <div className="space-y-3">
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <p className="text-[10.5px] uppercase tracking-[0.14em] text-muted">Public key (PEM)</p>
                      <CopyButton value={result.pair.publicPem} clearAfterMs={clearAfterMs} />
                    </div>
                    <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-line bg-ink/60 p-3 font-mono text-[11px] leading-relaxed text-gold/90">
                      {result.pair.publicPem}
                    </pre>
                  </div>
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <p className="text-[10.5px] uppercase tracking-[0.14em] text-muted">Public JWK</p>
                      <CopyButton value={JSON.stringify(result.pair.publicJwk, null, 2)} clearAfterMs={clearAfterMs} />
                    </div>
                    <pre className="max-h-44 overflow-auto rounded-lg border border-line bg-ink/60 p-3 font-mono text-[10.5px] leading-relaxed text-muted">
                      {JSON.stringify(result.pair.publicJwk, null, 2)}
                    </pre>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={Download}
                    onClick={() =>
                      download(
                        'password-forge-public-key.pem',
                        result.pair.publicPem,
                        'application/x-pem-file',
                      )
                    }
                  >
                    Download public key
                  </Button>
                  <Button variant="danger" size="sm" icon={ShieldAlert} onClick={() => setWarningOpen(true)}>
                    Export private key…
                  </Button>
                </div>
                <p className="mt-3 flex gap-2 text-[11px] leading-relaxed text-muted/75">
                  <TriangleAlert size={13} className="mt-0.5 shrink-0 text-warn/80" aria-hidden="true" />
                  This demonstration exports the raw JWK. In production, private keys belong in a hardware
                  token or OS keystore, not a downloaded file.
                </p>
              </>
            )}
          </Panel>

          <Panel>
            <SectionTitle title="Why not Math.random?" />
            <p className="text-[12px] leading-relaxed text-muted">
              <span className="font-mono text-[11.5px] text-parchment/80">Math.random()</span> is a predictable
              PRNG. Its output can be reconstructed from a small number of samples, which would let an attacker
              regenerate keys and tokens. Every generator on this page uses the operating system CSPRNG through
              the Web Crypto API.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge tone="gold">CSPRNG</Badge>
              <Badge>ECDSA P-256</Badge>
              <Badge>AES-256</Badge>
              <Badge>no storage</Badge>
            </div>
          </Panel>
        </div>
      </div>

      <Modal
        open={warningOpen}
        onClose={() => {
          setWarningOpen(false);
          setUnderstood(false);
        }}
        title="Export private key material?"
        description="This writes a secret to a file on your device."
        footer={
          <>
            <Button variant="ghost" onClick={() => { setWarningOpen(false); setUnderstood(false); }}>
              Cancel
            </Button>
            <Button variant="danger" disabled={!understood} onClick={confirmPrivateExport}>
              Download private material
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Notice tone="danger" title="No recovery, no protection">
            The file is unencrypted. Anything that can read your Downloads folder — malware, a synced backup, a
            shared computer — can read this key.
          </Notice>
          <label className="flex items-start gap-2.5 text-[12px] leading-relaxed text-muted">
            <input
              type="checkbox"
              checked={understood}
              onChange={(event) => setUnderstood(event.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 accent-[#C5A36B]"
            />
            I understand this key material will be written to disk in plaintext and must be stored securely.
          </label>
        </div>
      </Modal>
    </div>
  );
}

function generatedBits(bytes) {
  return entropyBitsForBytes(bytes);
}
