import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ClipboardList,
  Copy,
  Eye,
  EyeOff,
  Plus,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { analyzePassword, STRENGTH_LABELS } from '../lib/analysis.js';
import { copyText } from '../lib/clipboard.js';
import { useSettings } from '../components/SettingsContext.jsx';
import { useToast } from '../components/Toast.jsx';
import {
  Badge,
  Button,
  Field,
  Modal,
  Notice,
  PageHeader,
  Panel,
  SectionTitle,
  StrengthMeter,
  TextInput,
  cx,
} from '../components/ui.jsx';

function maskValue(value) {
  return '•'.repeat(Math.min(40, Math.max(8, value.length)));
}

export default function SecurityAudit() {
  const { settings } = useSettings();
  const { notify } = useToast();
  const [draft, setDraft] = useState('');
  const [revealDraft, setRevealDraft] = useState(false);
  const [entries, setEntries] = useState([]);
  const [revealed, setRevealed] = useState(() => new Set());
  const [error, setError] = useState('');
  const [clearOpen, setClearOpen] = useState(false);
  const clearAfterMs = settings.clearClipboard ? settings.clearClipboardSeconds * 1000 : 0;

  const stats = useMemo(() => {
    const counts = new Map();
    entries.forEach((entry) => counts.set(entry.value, (counts.get(entry.value) || 0) + 1));

    const duplicates = entries.filter((entry) => (counts.get(entry.value) || 0) > 1);
    const weak = entries.filter((entry) => entry.analysis.score <= 1);
    const short = entries.filter((entry) => entry.analysis.length < 12);
    const lowDiversity = entries.filter((entry) => entry.analysis.activeCategories.length < 3);
    const reuseCount = Array.from(counts.values()).reduce(
      (sum, count) => sum + (count > 1 ? count - 1 : 0),
      0,
    );

    return {
      total: entries.length,
      duplicateGroups: Array.from(counts.values()).filter((count) => count > 1).length,
      duplicates: duplicates.length,
      reuseCount,
      weak: weak.length,
      short: short.length,
      lowDiversity: lowDiversity.length,
    };
  }, [entries]);

  function addEntry() {
    if (!draft) {
      setError('Enter a sample password to analyse.');
      return;
    }
    const analysis = analyzePassword(draft);
    if (!analysis) {
      setError('That value could not be analysed.');
      return;
    }
    setEntries((current) => [
      ...current,
      { id: `${Date.now()}-${current.length}`, value: draft, analysis, addedAt: new Date() },
    ]);
    setDraft('');
    setError('');
    notify('Added to this audit session. Nothing was saved.', 'success');
  }

  function toggleReveal(id) {
    setRevealed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSession() {
    setEntries([]);
    setRevealed(new Set());
    setDraft('');
    setError('');
    setClearOpen(false);
    notify('Audit session cleared from memory.', 'info');
  }

  const duplicateValues = useMemo(() => {
    const counts = new Map();
    entries.forEach((entry) => counts.set(entry.value, (counts.get(entry.value) || 0) + 1));
    return new Set(Array.from(counts.entries()).filter(([, count]) => count > 1).map(([value]) => value));
  }, [entries]);

  return (
    <div>
      <PageHeader
        index="Workspace 08 — Security Audit"
        title="Audit a set of passwords"
        description="Add sample passwords you actually use to see reuse, weak patterns, insufficient length and missing diversity across the set. Analysis stays in this tab; entries disappear when you clear the session or close the page."
        actions={
          <Button variant="ghost" icon={Trash2} onClick={() => setClearOpen(true)} disabled={entries.length === 0}>
            Clear session
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Panel>
            <SectionTitle
              title="Add a sample"
              hint="Deliberately manual: Password Forge never reads browser credential stores or autofill data."
            />
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <TextInput
                  mono
                  type={revealDraft ? 'text' : 'password'}
                  value={draft}
                  onChange={(event) => {
                    setDraft(event.target.value);
                    setError('');
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      addEntry();
                    }
                  }}
                  placeholder="Password used on one of your accounts"
                  autoComplete="off"
                  spellCheck={false}
                  aria-label="Sample password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setRevealDraft((current) => !current)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-parchment"
                  aria-label={revealDraft ? 'Hide value' : 'Reveal value'}
                >
                  {revealDraft ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <Button variant="primary" icon={Plus} onClick={addEntry} className="shrink-0">
                Analyse &amp; add
              </Button>
            </div>
            {error && (
              <p className="mt-2 text-[11.5px] text-danger" role="alert">
                {error}
              </p>
            )}
            <p className="mt-3 text-[11px] leading-relaxed text-muted/80">
              Add one password per account you want to compare. Press Enter to add quickly. Values are held in
              React state only — never in IndexedDB, localStorage, URLs or logs.
            </p>
          </Panel>

          {entries.length === 0 ? (
            <Panel className="flex min-h-[260px] flex-col items-center justify-center text-center">
              <ClipboardList size={24} className="mb-3 text-muted/40" aria-hidden="true" />
              <p className="text-[13px] text-parchment/80">No samples in this session</p>
              <p className="mt-1 max-w-sm text-[11.5px] leading-relaxed text-muted">
                Add a few passwords to see cross-password reuse. A single password cannot show reuse on its own.
              </p>
            </Panel>
          ) : (
            <Panel>
              <SectionTitle
                title="Session findings"
                hint={`${entries.length} sample${entries.length === 1 ? '' : 's'} analysed locally.`}
                action={
                  <Badge tone={stats.weak + stats.duplicates > 0 ? 'danger' : 'success'}>
                    {stats.weak + stats.duplicates > 0 ? 'attention needed' : 'no critical findings'}
                  </Badge>
                }
              />
              <ul className="space-y-2.5">
                {entries.map((entry) => {
                  const isDuplicate = duplicateValues.has(entry.value);
                  const occurrences = entries.filter((item) => item.value === entry.value).length;
                  const topFindings = entry.analysis.findings.slice(0, 3);
                  return (
                    <li key={entry.id} className="rounded-lg border border-line bg-ink/35 p-3.5">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <code className="truncate font-mono text-[12.5px] text-parchment/85">
                              {revealed.has(entry.id) ? entry.value : maskValue(entry.value)}
                            </code>
                            <button
                              type="button"
                              onClick={() => toggleReveal(entry.id)}
                              className="rounded p-0.5 text-muted transition-colors hover:text-parchment"
                              aria-label={revealed.has(entry.id) ? 'Hide value' : 'Reveal value'}
                            >
                              {revealed.has(entry.id) ? <EyeOff size={13} /> : <Eye size={13} />}
                            </button>
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await copyText(entry.value, { clearAfterMs });
                                  notify('Copied. Clear it when you are done.', 'info');
                                } catch (caught) {
                                  notify(caught.message, 'danger');
                                }
                              }}
                              className="rounded p-0.5 text-muted transition-colors hover:text-parchment"
                              aria-label="Copy value"
                            >
                              <Copy size={13} />
                            </button>
                          </div>
                          <p className="mt-1 font-mono text-[10.5px] text-muted/60">
                            {entry.analysis.length} chars · {entry.analysis.activeCategories.length} categories ·{' '}
                            ~{entry.analysis.adjustedEntropyBits} bits adjusted
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {isDuplicate && (
                            <Badge tone="danger">
                              <Copy size={10} /> reused ×{occurrences}
                            </Badge>
                          )}
                          <Badge
                            tone={
                              entry.analysis.score >= 3
                                ? 'success'
                                : entry.analysis.score === 2
                                  ? 'warn'
                                  : 'danger'
                            }
                          >
                            {STRENGTH_LABELS[entry.analysis.score]}
                          </Badge>
                        </div>
                      </div>

                      <div className="mt-3">
                        <StrengthMeter score={entry.analysis.score} />
                      </div>

                      {topFindings.length > 0 ? (
                        <ul className="mt-3 space-y-1.5">
                          {topFindings.map((finding) => (
                            <li key={finding.title} className="flex gap-2 text-[11.5px] leading-relaxed text-muted">
                              <span
                                className={cx(
                                  'mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full',
                                  finding.severity === 'high'
                                    ? 'bg-danger'
                                    : finding.severity === 'medium'
                                      ? 'bg-warn'
                                      : 'bg-muted/60',
                                )}
                              />
                              {finding.title}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-[11.5px] text-muted">No local pattern findings.</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Panel>
          )}

          <Notice tone="warn" title="Limits of a session audit">
            This workspace compares only what you type here, in this tab. It cannot detect a password reused
            elsewhere, a password that leaked without appearing in a public corpus, a phished password, or a
            compromised account. Absence of findings is not a clean bill of health.
          </Notice>
        </div>

        <div className="space-y-5">
          <Panel>
            <SectionTitle title="Summary" />
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Samples', value: stats.total, tone: 'neutral' },
                { label: 'Reused', value: stats.duplicates, tone: stats.duplicates ? 'danger' : 'neutral' },
                { label: 'Weak', value: stats.weak, tone: stats.weak ? 'danger' : 'neutral' },
                { label: 'Under 12 chars', value: stats.short, tone: stats.short ? 'warn' : 'neutral' },
                { label: 'Low diversity', value: stats.lowDiversity, tone: stats.lowDiversity ? 'warn' : 'neutral' },
                { label: 'Duplicate groups', value: stats.duplicateGroups, tone: 'neutral' },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border border-line bg-ink/35 px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-muted/70">{item.label}</p>
                  <p
                    className={cx(
                      'mt-1 font-mono text-[18px]',
                      item.tone === 'danger' && item.value > 0
                        ? 'text-danger'
                        : item.tone === 'warn' && item.value > 0
                          ? 'text-warn'
                          : 'text-parchment',
                    )}
                  >
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-muted/75">
              {stats.reuseCount > 0
                ? `${stats.reuseCount} extra use${stats.reuseCount === 1 ? '' : 's'} of an already-seen password. Each reuse links the accounts: one breach compromises all of them.`
                : 'No reuse detected among the samples you entered.'}
            </p>
          </Panel>

          <Panel>
            <SectionTitle title="Remediation guidance" />
            <ul className="space-y-3 text-[12px] leading-relaxed text-muted">
              {[
                'Give every account a unique, generated password. Reuse is the single most damaging habit.',
                'Aim for 16+ characters for generated passwords, or four to six random words for passphrases.',
                'Store them in a password manager rather than memory or a notes file.',
                'Enable multi-factor authentication, preferring an authenticator app or hardware key over SMS.',
                'Change any password you have entered here after auditing, if it was reused or weak.',
                'Check important accounts for breach exposure in the Password Inspector — explicitly opt-in.',
              ].map((line) => (
                <li key={line} className="flex gap-2">
                  <ShieldCheck size={13} className="mt-0.5 shrink-0 text-gold/70" aria-hidden="true" />
                  {line}
                </li>
              ))}
            </ul>
          </Panel>

          <Panel className="border-danger/20">
            <SectionTitle title="If you suspect compromise" />
            <ul className="space-y-2 text-[11.5px] leading-relaxed text-muted">
              <li className="flex gap-2">
                <AlertTriangle size={13} className="mt-0.5 shrink-0 text-danger/80" aria-hidden="true" />
                Change the password from a trusted device, then revoke active sessions and app passwords.
              </li>
              <li className="flex gap-2">
                <AlertTriangle size={13} className="mt-0.5 shrink-0 text-danger/80" aria-hidden="true" />
                Check recovery email and phone settings for changes you did not make.
              </li>
              <li className="flex gap-2">
                <AlertTriangle size={13} className="mt-0.5 shrink-0 text-danger/80" aria-hidden="true" />
                If malware is possible, assume every secret on the device is exposed.
              </li>
            </ul>
          </Panel>
        </div>
      </div>

      <Modal
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        title="Clear this audit session?"
        description="All samples and findings will be dropped from memory."
        footer={
          <>
            <Button variant="ghost" onClick={() => setClearOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" icon={Trash2} onClick={clearSession}>
              Clear session
            </Button>
          </>
        }
      >
        <p className="text-[12.5px] leading-relaxed text-muted">
          {entries.length} sample{entries.length === 1 ? '' : 's'} will be removed from this tab. Nothing was
          written to storage, so there is no other copy to delete. Clearing JavaScript memory cannot be proven
          to erase values from the browser process or operating system caches.
        </p>
      </Modal>
    </div>
  );
}
