import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Download,
  Eye,
  EyeOff,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Wand2,
} from 'lucide-react';
import {
  AMBIGUOUS_CHARS,
  CHARSETS,
  MAX_BULK,
  MAX_LENGTH,
  MAX_SEPARATOR_LENGTH,
  MAX_WORDS,
  MIN_LENGTH,
  MIN_WORDS,
  buildCharacterGroups,
  generatePassphrase,
  generatePasswords,
  passphraseEntropyBits,
} from '../lib/passwords.js';
import { WORDLIST } from '../lib/wordlist.js';
import { copyText } from '../lib/clipboard.js';
import { download, safeFilename } from '../lib/bytes.js';
import { useSettings } from '../components/SettingsContext.jsx';
import { useToast } from '../components/Toast.jsx';
import {
  Badge,
  Button,
  Checkbox,
  CopyButton,
  Field,
  KeyValue,
  Modal,
  Notice,
  PageHeader,
  Panel,
  Range,
  SectionTitle,
  Segmented,
  Switch,
  TextInput,
  cx,
} from '../components/ui.jsx';

const PASSWORD_DEFAULTS = {
  length: 24,
  lower: true,
  upper: true,
  numbers: true,
  symbols: true,
  exclude: '',
  custom: '',
  guaranteeCategories: true,
};

export default function PasswordForge() {
  const { settings } = useSettings();
  const { notify } = useToast();
  const [mode, setMode] = useState('password');
  const [options, setOptions] = useState(PASSWORD_DEFAULTS);
  const [count, setCount] = useState(1);
  const [results, setResults] = useState([]);
  const [passOptions, setPassOptions] = useState({
    wordCount: 6,
    separator: '-',
    capitalize: false,
    includeNumber: false,
  });
  const [error, setError] = useState('');
  const [revealAll, setRevealAll] = useState(Boolean(settings.revealByDefault));
  const [exportOpen, setExportOpen] = useState(false);
  const clearAfterMs = settings.clearClipboard ? settings.clipboardClearSeconds * 1000 : 0;

  const groups = useMemo(
    () => buildCharacterGroups(options),
    [options.lower, options.upper, options.numbers, options.symbols, options.exclude, options.custom],
  );

  const theoreticalBits = useMemo(() => {
    if (mode === 'passphrase') return passphraseEntropyBits(passOptions);
    if (groups.pool.length < 2) return 0;
    return Math.round(options.length * Math.log2(groups.pool.length));
  }, [mode, groups.pool.length, options.length, passOptions]);

  const generate = useCallback(() => {
    setError('');
    try {
      if (mode === 'passphrase') {
        const next = [];
        for (let i = 0; i < count; i += 1) next.push(generatePassphrase(passOptions));
        setResults(next);
      } else {
        setResults(generatePasswords({ ...options, count }));
      }
    } catch (caught) {
      setError(caught.message || 'Could not generate with the current settings.');
      setResults([]);
    }
  }, [mode, count, options, passOptions]);

  useEffect(() => {
    generate();
    // Generate once on mount; subsequent runs are explicit user actions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateOption(patch) {
    setOptions((current) => ({ ...current, ...patch }));
  }

  function updatePass(patch) {
    setPassOptions((current) => ({ ...current, ...patch }));
  }

  async function handleCopyAll() {
    try {
      await copyText(results.join('\n'), { clearAfterMs });
      notify(`${results.length} value${results.length === 1 ? '' : 's'} copied.`, 'success');
    } catch (caught) {
      notify(caught.message, 'danger');
    }
  }

  function buildExport() {
    const lines = [
      'PASSWORD FORGE — GENERATED SECRETS',
      `Generated: ${new Date().toISOString()}`,
      `Mode: ${mode === 'passphrase' ? 'Passphrase' : 'Random password'}`,
      '',
      'This file is PLAINTEXT. Anyone who reads it can use these secrets.',
      'Delete it after importing into a password manager.',
      '---',
      ...(mode === 'passphrase'
        ? [
            `Words: ${passOptions.wordCount} · Separator: ${JSON.stringify(passOptions.separator)} · Capitalized: ${passOptions.capitalize} · Numeric suffix: ${passOptions.includeNumber}`,
          ]
        : [
            `Length: ${options.length} · Categories: ${groups.groups.map((g) => g.label).join(', ') || 'none'}${options.custom ? ' + custom set' : ''}`,
          ]),
      `Theoretical entropy: ~${theoreticalBits} bits per value`,
      '---',
      ...results.map((value, index) => `${index + 1}. ${value}`),
      '',
    ];
    return lines.join('\n');
  }

  function handleExport() {
    download(
      safeFilename(`password-forge-${new Date().toISOString().slice(0, 10)}.txt`),
      buildExport(),
      'text/plain',
    );
    setExportOpen(false);
    notify('Plaintext export downloaded.', 'info');
  }

  function handleClear() {
    setResults([]);
    setError('');
    notify('Generated values cleared from this tab.', 'info');
  }

  const canGenerate = groups.pool.length > 0 || mode === 'passphrase';

  return (
    <div>
      <PageHeader
        index="Workspace 02 — Password Forge"
        title="Forge passwords and passphrases"
        description="Uniform random generation from crypto.getRandomValues with rejection sampling. Enabled character categories are guaranteed to appear, and nothing is saved automatically."
        actions={
          <Segmented
            value={mode}
            onChange={(next) => {
              setMode(next);
              setResults([]);
              setError('');
            }}
            options={[
              { id: 'password', label: 'Password', icon: KeyRound },
              { id: 'passphrase', label: 'Passphrase', icon: Wand2 },
            ]}
          />
        }
      />

      <div className="grid gap-5 lg:grid-cols-[380px_1fr]">
        <div className="space-y-5">
          {mode === 'password' ? (
            <Panel>
              <SectionTitle title="Character set" hint="Pick what the generator may use." />
              <Range
                label="Length"
                value={options.length}
                min={MIN_LENGTH}
                max={MAX_LENGTH}
                onChange={(length) => updateOption({ length })}
                display={`${options.length} chars`}
              />

              <div className="mt-5 grid grid-cols-2 gap-2">
                {[
                  { id: 'upper', label: 'Uppercase', hint: 'A–Z' },
                  { id: 'lower', label: 'Lowercase', hint: 'a–z' },
                  { id: 'numbers', label: 'Numbers', hint: '0–9' },
                  { id: 'symbols', label: 'Symbols', hint: CHARSETS.symbols.slice(0, 10) },
                ].map((category) => (
                  <Checkbox
                    key={category.id}
                    checked={options[category.id]}
                    onChange={(checked) => updateOption({ [category.id]: checked })}
                    label={category.label}
                    hint={category.hint}
                  />
                ))}
              </div>

              <div className="mt-4">
                <Switch
                  checked={options.guaranteeCategories}
                  onChange={(guaranteeCategories) => updateOption({ guaranteeCategories })}
                  label="Guarantee every enabled category"
                  description="Reserves at least one character from each enabled set, then shuffles."
                />
              </div>

              <div className="mt-3 space-y-3">
                <Field
                  label="Excluded characters"
                  hint={`Removed from every category. Common ambiguous set: ${AMBIGUOUS_CHARS}`}
                  corner={
                    <button
                      type="button"
                      onClick={() => updateOption({ exclude: AMBIGUOUS_CHARS })}
                      className="text-[10.5px] text-gold/80 transition-colors hover:text-gold"
                    >
                      use ambiguous set
                    </button>
                  }
                >
                  <TextInput
                    mono
                    value={options.exclude}
                    onChange={(event) => updateOption({ exclude: event.target.value })}
                    placeholder="Il1O0o"
                    maxLength={64}
                    autoComplete="off"
                    spellCheck={false}
                    aria-label="Excluded characters"
                  />
                </Field>
                <Field label="Custom characters" hint="Extra characters added to the pool. Deduplicated.">
                  <TextInput
                    mono
                    value={options.custom}
                    onChange={(event) => updateOption({ custom: event.target.value })}
                    placeholder="§±£€"
                    maxLength={64}
                    autoComplete="off"
                    spellCheck={false}
                    aria-label="Custom characters"
                  />
                </Field>
              </div>

              <div className="mt-4 rounded-lg border border-line bg-ink/40 px-3.5 py-3">
                <div className="flex items-center justify-between text-[11.5px]">
                  <span className="text-muted">Sampling pool</span>
                  <span className="font-mono text-parchment/85">{groups.pool.length} chars</span>
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[11.5px]">
                  <span className="text-muted">Theoretical entropy</span>
                  <span className="font-mono text-gold">~{theoreticalBits} bits</span>
                </div>
                {groups.groups.some((group) => group.chars.length === 0) && (
                  <p className="mt-2 text-[11px] leading-relaxed text-warn">
                    An enabled category has no characters left after exclusions. Generation will report an
                    error unless the guarantee is disabled.
                  </p>
                )}
              </div>
            </Panel>
          ) : (
            <Panel>
              <SectionTitle
                title="Passphrase"
                hint={`Words from a bundled offline list of ${WORDLIST.length} entries.`}
              />
              <Range
                label="Words"
                value={passOptions.wordCount}
                min={MIN_WORDS}
                max={MAX_WORDS}
                onChange={(wordCount) => updatePass({ wordCount })}
                display={`${passOptions.wordCount} words`}
              />
              <div className="mt-5 space-y-1">
                <Field label="Separator" hint={`Up to ${MAX_SEPARATOR_LENGTH} characters. Empty joins words directly.`}>
                  <TextInput
                    mono
                    value={passOptions.separator}
                    onChange={(event) =>
                      updatePass({ separator: event.target.value.slice(0, MAX_SEPARATOR_LENGTH) })
                    }
                    placeholder="-"
                    maxLength={MAX_SEPARATOR_LENGTH}
                    aria-label="Word separator"
                  />
                </Field>
                <Switch
                  checked={passOptions.capitalize}
                  onChange={(capitalize) => updatePass({ capitalize })}
                  label="Capitalize each word"
                  description="Improves readability; adds no meaningful entropy."
                />
                <Switch
                  checked={passOptions.includeNumber}
                  onChange={(includeNumber) => updatePass({ includeNumber })}
                  label="Append a two-digit number"
                  description="Adds roughly 6.6 bits from 100 possibilities."
                />
              </div>
              <div className="mt-3 rounded-lg border border-line bg-ink/40 px-3.5 py-3 text-[11.5px]">
                <div className="flex items-center justify-between">
                  <span className="text-muted">Theoretical entropy</span>
                  <span className="font-mono text-gold">~{theoreticalBits} bits</span>
                </div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-muted/80">
                  Passphrases trade character complexity for length. Six words from this list is stronger than
                  most eight-character passwords.
                </p>
              </div>
            </Panel>
          )}

          <Panel>
            <Range
              label="How many"
              value={count}
              min={1}
              max={MAX_BULK}
              onChange={setCount}
              display={`${count} value${count === 1 ? '' : 's'}`}
            />
            <Button
              variant="primary"
              size="lg"
              icon={RefreshCw}
              onClick={generate}
              disabled={!canGenerate}
              className="mt-5 w-full"
            >
              Generate {count === 1 ? '' : `${count} `}
              {mode === 'passphrase' ? 'passphrase' : 'password'}
              {count === 1 ? '' : 's'}
            </Button>
            {error && (
              <Notice tone="danger" className="mt-3">
                {error}
              </Notice>
            )}
          </Panel>

          <Notice tone="info" title="Nothing is stored">
            Generated values exist only in this tab’s memory. They are never written to IndexedDB,
            localStorage, the URL, or console logs. Reloading the page discards them.
          </Notice>
        </div>

        <Panel className="flex min-h-[420px] flex-col">
          <SectionTitle
            title="Output"
            hint={results.length ? `${results.length} value${results.length === 1 ? '' : 's'} in memory` : 'No values generated yet'}
            action={
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setRevealAll((current) => !current)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1.5 text-[11px] text-muted transition-colors hover:text-parchment"
                >
                  {revealAll ? <EyeOff size={13} /> : <Eye size={13} />}
                  {revealAll ? 'Hide all' : 'Reveal all'}
                </button>
                <CopyButton
                  value={results.join('\n')}
                  label="Copy all"
                  variant="secondary"
                  clearAfterMs={clearAfterMs}
                />
              </div>
            }
          />

          {results.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-line px-6 py-16 text-center">
              <KeyRound size={22} className="mb-3 text-muted/50" aria-hidden="true" />
              <p className="text-[13px] text-parchment/80">Generate to see values here</p>
              <p className="mt-1 max-w-xs text-[11.5px] leading-relaxed text-muted">
                Values are produced locally and disappear when this workspace is cleared or the page reloads.
              </p>
            </div>
          ) : (
            <ul className={cx('space-y-2 overflow-y-auto pr-1', results.length > 8 ? 'max-h-[46vh]' : '')}>
              {results.map((value, index) => (
                <li
                  key={`${index}-${value.slice(0, 4)}`}
                  className="group flex items-center gap-2 rounded-lg border border-line bg-ink/45 px-3 py-2.5"
                >
                  <span className="w-6 shrink-0 font-mono text-[10px] text-muted/50">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <code
                    className={cx(
                      'min-w-0 flex-1 break-all font-mono text-[13px] leading-relaxed',
                      revealAll ? 'text-parchment' : 'text-muted/70 select-none',
                    )}
                  >
                    {revealAll ? value : '•'.repeat(Math.min(32, Math.max(10, value.length)))}
                  </code>
                  <span className="shrink-0 rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-muted/60">
                    {value.length}
                  </span>
                  <CopyButton value={value} label="" copiedLabel="" size="iconSm" clearAfterMs={clearAfterMs} />
                </li>
              ))}
            </ul>
          )}

          <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <Button
              variant="secondary"
              size="sm"
              icon={Download}
              onClick={() => setExportOpen(true)}
              disabled={results.length === 0}
            >
              Export plaintext…
            </Button>
            <Button variant="ghost" size="sm" onClick={handleCopyAll} disabled={results.length === 0}>
              Copy all
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={Trash2}
              onClick={handleClear}
              disabled={results.length === 0}
              className="ml-auto text-muted hover:text-danger"
            >
              Clear
            </Button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Badge tone="gold">
              <ShieldCheck size={11} /> CSPRNG
            </Badge>
            <Badge>rejection sampling</Badge>
            <Badge>no Math.random</Badge>
            <Badge tone={theoreticalBits >= 80 ? 'success' : theoreticalBits >= 60 ? 'warn' : 'danger'}>
              ~{theoreticalBits} bits
            </Badge>
          </div>
        </Panel>
      </div>

      <Modal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        title="Export generated values"
        description="This writes the secrets to a plaintext file on your device."
        footer={
          <>
            <Button variant="ghost" onClick={() => setExportOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" icon={Download} onClick={handleExport}>
              Download plaintext
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Notice tone="warn" title="Plaintext export">
            The downloaded .txt file contains every value currently shown. It is not encrypted. Move the values
            into a password manager and delete the file afterwards.
          </Notice>
          <KeyValue
            items={[
              { label: 'File', value: 'password-forge-<date>.txt' },
              { label: 'Values', value: String(results.length) },
              { label: 'Mode', value: mode === 'passphrase' ? 'Passphrase' : 'Password' },
              { label: 'Entropy', value: `~${theoreticalBits} bits each` },
            ]}
          />
        </div>
      </Modal>
    </div>
  );
}
