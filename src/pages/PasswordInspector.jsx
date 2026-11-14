import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  Globe,
  RotateCcw,
  ScanSearch,
  ShieldQuestion,
} from 'lucide-react';
import { analyzePassword, STRENGTH_LABELS } from '../lib/analysis.js';
import { checkBreach, BreachError } from '../lib/breach.js';
import {
  Badge,
  Button,
  Field,
  KeyValue,
  Notice,
  PageHeader,
  Panel,
  SectionTitle,
  StrengthMeter,
  TextInput,
} from '../components/ui.jsx';

const SEVERITY_TONES = { high: 'danger', medium: 'warn', low: 'neutral' };

const CATEGORY_LABELS = {
  lower: 'Lowercase',
  upper: 'Uppercase',
  numbers: 'Numbers',
  symbols: 'Symbols',
  other: 'Other',
};

export default function PasswordInspector() {
  const [password, setPassword] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [breachOptIn, setBreachOptIn] = useState(false);
  const [breach, setBreach] = useState({ status: 'idle', count: 0, error: '', prefix: '' });
  const abortRef = useRef(null);

  const analysis = useMemo(() => analyzePassword(password), [password]);

  useEffect(() => {
    setBreach({ status: 'idle', count: 0, error: '', prefix: '' });
    setBreachOptIn(false);
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, [password]);

  useEffect(
    () => () => {
      if (abortRef.current) abortRef.current.abort();
    },
    [],
  );

  async function handleBreachCheck() {
    if (!password) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBreach({ status: 'loading', count: 0, error: '', prefix: '' });

    try {
      const result = await checkBreach(password, { signal: controller.signal });
      setBreach({ status: 'done', count: result.count, error: '', prefix: result.prefix });
    } catch (error) {
      if (error.name === 'AbortError') return;
      setBreach({
        status: 'error',
        count: 0,
        prefix: '',
        error: error instanceof BreachError ? error.message : 'The breach check failed unexpectedly.',
      });
    }
  }

  function clearAll() {
    setPassword('');
    setRevealed(false);
    setBreach({ status: 'idle', count: 0, error: '', prefix: '' });
    setBreachOptIn(false);
  }

  return (
    <div>
      <PageHeader
        index="Workspace 03 — Password Inspector"
        title="Inspect a password locally"
        description="Heuristic analysis of length, diversity, repetition, keyboard paths, dictionary words and predictable substitutions. Everything is computed in this tab; the value is never stored or logged."
        actions={
          <Button variant="ghost" icon={RotateCcw} onClick={clearAll} disabled={!password}>
            Clear &amp; reset
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <Panel>
            <Field
              label="Password to inspect"
              hint="Type or paste. Use a value you actually use — nothing here is transmitted or persisted."
            >
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <TextInput
                    mono
                    type={revealed ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter a password…"
                    autoComplete="off"
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                    aria-label="Password to inspect"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setRevealed((current) => !current)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted transition-colors hover:text-parchment"
                    aria-label={revealed ? 'Hide password' : 'Reveal password'}
                  >
                    {revealed ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                <Button variant="secondary" icon={RotateCcw} onClick={clearAll} disabled={!password} className="shrink-0">
                  Clear
                </Button>
              </div>
            </Field>

            {analysis && (
              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] uppercase tracking-[0.14em] text-muted">Heuristic strength</span>
                  <span className="text-[12.5px] text-parchment/85">
                    {STRENGTH_LABELS[analysis.score]}
                    <span className="ml-2 font-mono text-[11px] text-muted">{analysis.score}/4</span>
                  </span>
                </div>
                <StrengthMeter score={analysis.score} />
                <p className="mt-2 text-[11px] leading-relaxed text-muted/80">{analysis.disclaimer}</p>
              </div>
            )}
          </Panel>

          {!analysis ? (
            <Panel className="flex min-h-[280px] flex-col items-center justify-center text-center">
              <ScanSearch size={24} className="mb-3 text-muted/40" aria-hidden="true" />
              <p className="text-[13px] text-parchment/80">Awaiting input</p>
              <p className="mt-1 max-w-sm text-[11.5px] leading-relaxed text-muted">
                Analysis appears as you type. Nothing is sent anywhere and nothing is kept after you leave.
              </p>
            </Panel>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { label: 'Length', value: analysis.length, detail: analysis.length >= 16 ? 'comfortable' : analysis.length >= 12 ? 'moderate' : 'short' },
                  { label: 'Unique characters', value: analysis.uniqueCount, detail: `${analysis.activeCategories.length} categories` },
                  { label: 'Theoretical entropy', value: `${analysis.naiveEntropyBits} b`, detail: `pool of ${analysis.poolSize}` },
                  { label: 'Adjusted estimate', value: `${analysis.adjustedEntropyBits} b`, detail: 'after pattern penalties' },
                ].map((metric) => (
                  <div key={metric.label} className="rounded-lg border border-line bg-surface px-4 py-3.5">
                    <p className="text-[10.5px] uppercase tracking-[0.14em] text-muted/80">{metric.label}</p>
                    <p className="mt-1.5 font-mono text-[19px] text-parchment">{metric.value}</p>
                    <p className="mt-0.5 text-[10.5px] text-muted/70">{metric.detail}</p>
                  </div>
                ))}
              </div>

              <Panel>
                <SectionTitle
                  title="Composition"
                  hint="Character categories present in the value."
                  action={<Badge>{analysis.uniqueCount} distinct / {analysis.length} positions</Badge>}
                />
                <div className="space-y-2.5">
                  {Object.entries(analysis.categories).map(([key, value]) => {
                    const percentage = analysis.length ? Math.round((value / analysis.length) * 100) : 0;
                    return (
                      <div key={key} className="flex items-center gap-3">
                        <span className="w-20 shrink-0 text-[11.5px] text-muted">{CATEGORY_LABELS[key]}</span>
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-elevated">
                          <div
                            className="h-full rounded-full bg-gold/70 transition-[width] duration-300"
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        <span className="w-16 shrink-0 text-right font-mono text-[11px] text-muted/80">
                          {value} · {percentage}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </Panel>

              <Panel>
                <SectionTitle
                  title="Findings"
                  hint={`${analysis.findings.length} observation${analysis.findings.length === 1 ? '' : 's'} from local pattern checks.`}
                />
                {analysis.findings.length === 0 ? (
                  <div className="flex items-start gap-2.5 rounded-lg border border-success/25 bg-success/[0.06] px-3.5 py-3">
                    <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
                    <p className="text-[12.5px] leading-relaxed text-muted">
                      No weakness was detected by these rules. That is not proof of strength — undetected
                      patterns, reuse and breach exposure can still make this password unsafe.
                    </p>
                  </div>
                ) : (
                  <ul className="space-y-2.5">
                    {analysis.findings.map((finding) => (
                      <li
                        key={finding.title}
                        className="rounded-lg border border-line bg-ink/35 px-3.5 py-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-[12.5px] font-medium text-parchment/90">{finding.title}</p>
                          <Badge tone={SEVERITY_TONES[finding.severity] || 'neutral'}>{finding.severity}</Badge>
                        </div>
                        <p className="mt-1 text-[11.5px] leading-relaxed text-muted">{finding.detail}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </>
          )}
        </div>

        <div className="space-y-5">
          <Panel>
            <SectionTitle title="How to improve" hint="Ordered by impact." />
            {analysis ? (
              <ul className="space-y-2.5">
                {analysis.suggestions.map((suggestion) => (
                  <li key={suggestion} className="flex gap-2.5 text-[12px] leading-relaxed text-muted">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-gold/70" />
                    <span>{suggestion}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12px] leading-relaxed text-muted">
                Suggestions appear once a password is entered.
              </p>
            )}
          </Panel>

          <Panel>
            <SectionTitle
              title="Breach exposure"
              hint="Optional. Requires a network request."
              action={<Globe size={14} className="text-muted/60" aria-hidden="true" />}
            />
            <Notice tone="info" compact className="mb-4">
              Pressing the button sends <span className="font-mono text-parchment/80">only the first 5 hex characters</span>{' '}
              of a SHA-1 hash to <span className="font-mono text-parchment/80">api.pwnedpasswords.com</span>. Your
              password and the full hash stay in this tab. The service sees the prefix, your IP address and the
              time of the request.
            </Notice>

            <label className="mb-3 flex items-start gap-2.5 text-[11.5px] leading-relaxed text-muted">
              <input
                type="checkbox"
                checked={breachOptIn}
                onChange={(event) => setBreachOptIn(event.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 accent-[#C5A36B]"
                disabled={!password}
              />
              I understand this makes an external request and I want to check this password.
            </label>

            <Button
              variant="secondary"
              className="w-full"
              icon={ShieldQuestion}
              onClick={handleBreachCheck}
              disabled={!password || !breachOptIn || breach.status === 'loading'}
              loading={breach.status === 'loading'}
            >
              {breach.status === 'loading' ? 'Checking…' : 'Check breach exposure'}
            </Button>

            {breach.status === 'done' && (
              <div className="mt-3">
                {breach.count > 0 ? (
                  <Notice tone="danger" title={`Seen ${breach.count.toLocaleString()} times in known breaches`}>
                    This password appears in public breach corpora. Change it everywhere it is used and never
                    reuse it. The check used prefix <span className="font-mono">{breach.prefix}</span>.
                  </Notice>
                ) : (
                  <Notice tone="success" title="No match in the Pwned Passwords corpus">
                    This exact password was not found. Absence from that dataset does not mean the password is
                    safe, and new breaches are not instantly included.
                  </Notice>
                )}
              </div>
            )}

            {breach.status === 'error' && (
              <Notice tone="warn" className="mt-3" title="Breach check unavailable">
                {breach.error} You can continue using the rest of the Inspector — this feature is entirely
                optional.
              </Notice>
            )}
          </Panel>

          <Panel>
            <SectionTitle title="Privacy" />
            <KeyValue
              items={[
                { label: 'Stored', value: 'nothing' },
                { label: 'Logged', value: 'nothing' },
                { label: 'Network', value: breach.status === 'done' ? 'prefix only' : 'none' },
              ]}
            />
            <p className="mt-3 flex gap-2 text-[11px] leading-relaxed text-muted/75">
              <AlertTriangle size={13} className="mt-0.5 shrink-0 text-warn/80" aria-hidden="true" />
              Client-side analysis cannot see whether a password was reused, phished or exposed in a breach
              that is not in a public corpus.
            </p>
          </Panel>
        </div>
      </div>
    </div>
  );
}
