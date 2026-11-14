import { useEffect, useId, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  Info,
  Loader2,
  ShieldAlert,
  X,
} from 'lucide-react';
import { copyText } from '../lib/clipboard.js';

export function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

const BUTTON_BASE =
  'inline-flex select-none items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all duration-150 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50';

const BUTTON_VARIANTS = {
  primary:
    'bg-gold text-ink hover:bg-gold-soft active:bg-gold-deep shadow-[0_8px_24px_-14px_rgba(197,163,107,0.9)]',
  secondary: 'border border-line bg-elevated text-parchment hover:bg-elevated/70 active:bg-elevated',
  ghost: 'text-muted hover:bg-white/[0.04] hover:text-parchment',
  danger: 'border border-danger/40 bg-danger/10 text-danger hover:bg-danger/20',
  subtle: 'border border-line/70 text-parchment/80 hover:border-gold/40 hover:text-parchment',
};

const BUTTON_SIZES = {
  sm: 'h-8 px-3 text-[12.5px]',
  md: 'h-10 px-4',
  lg: 'h-11 px-5',
  icon: 'h-9 w-9',
  iconSm: 'h-8 w-8',
};

export function buttonClasses({ variant = 'secondary', size = 'md', className = '' } = {}) {
  return cx(BUTTON_BASE, BUTTON_VARIANTS[variant] || BUTTON_VARIANTS.secondary, BUTTON_SIZES[size] || BUTTON_SIZES.md, className);
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon: Icon,
  iconRight: IconRight,
  loading = false,
  className,
  children,
  type = 'button',
  ...rest
}) {
  return (
    <button
      type={type}
      className={buttonClasses({ variant, size, className })}
      disabled={rest.disabled || loading}
      {...rest}
    >
      {loading ? (
        <Loader2 size={15} className="animate-spin" aria-hidden="true" />
      ) : (
        Icon && <Icon size={15} aria-hidden="true" />
      )}
      {children}
      {IconRight && !loading && <IconRight size={15} aria-hidden="true" />}
    </button>
  );
}

export function Panel({ className = '', children, as: Comp = 'section', ...rest }) {
  return (
    <Comp className={cx('surface-card p-5 sm:p-6', className)} {...rest}>
      {children}
    </Comp>
  );
}

export function PageHeader({ index, title, description, actions, children }) {
  return (
    <header className="mb-7 animate-rise">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          {index && (
            <p className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.28em] text-gold/70">
              {index}
            </p>
          )}
          <h1 className="text-[26px] leading-tight sm:text-[32px]">{title}</h1>
          {description && (
            <p className="mt-2.5 text-[13.5px] leading-relaxed text-muted">{description}</p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
      <div className="hairline mt-6" />
    </header>
  );
}

export function SectionTitle({ title, hint, action, className = '' }) {
  return (
    <div className={cx('mb-4 flex items-start justify-between gap-3', className)}>
      <div>
        <h2 className="text-[15px] font-medium tracking-wide text-parchment/90">{title}</h2>
        {hint && <p className="mt-1 text-[12px] leading-relaxed text-muted/90">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

export function Field({ label, hint, error, htmlFor, children, className = '', corner }) {
  const id = htmlFor || undefined;
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        {label && (
          <label htmlFor={id} className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
            {label}
          </label>
        )}
        {corner}
      </div>
      {children}
      {hint && !error && <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted/80">{hint}</p>}
      {error && <p className="mt-1.5 text-[11.5px] text-danger">{error}</p>}
    </div>
  );
}

export function TextInput({ className = '', mono = false, ...rest }) {
  return <input className={cx(mono ? 'field-mono' : 'field', className)} {...rest} />;
}

export function TextArea({ className = '', mono = true, rows = 5, ...rest }) {
  return (
    <textarea
      rows={rows}
      className={cx(mono ? 'field-mono' : 'field', 'resize-y leading-relaxed', className)}
      spellCheck={false}
      autoComplete="off"
      {...rest}
    />
  );
}

export function Select({ className = '', children, ...rest }) {
  return (
    <div className="relative">
      <select className={cx('field appearance-none pr-9', className)} {...rest}>
        {children}
      </select>
      <ChevronDown
        size={15}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted"
        aria-hidden="true"
      />
    </div>
  );
}

export function Range({ value, min, max, step = 1, onChange, label, display, className = '' }) {
  const id = useId();
  return (
    <div className={className}>
      <div className="mb-3 flex items-baseline justify-between">
        <label htmlFor={id} className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
          {label}
        </label>
        <span className="font-mono text-[15px] text-gold">{display ?? value}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full cursor-pointer"
      />
      <div className="mt-1.5 flex justify-between font-mono text-[10px] text-muted/60">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

export function Switch({ checked, onChange, label, description, id }) {
  const generatedId = useId();
  const switchId = id || generatedId;
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <label htmlFor={switchId} className="cursor-pointer text-[13px] text-parchment/90">
          {label}
        </label>
        {description && <p className="mt-1 text-[11.5px] leading-relaxed text-muted">{description}</p>}
      </div>
      <button
        id={switchId}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative mt-0.5 h-[22px] w-[38px] shrink-0 rounded-full border transition-colors duration-200',
          checked ? 'border-gold/60 bg-gold/80' : 'border-line bg-elevated',
        )}
      >
        <span
          className={cx(
            'absolute top-1/2 h-[16px] w-[16px] -translate-y-1/2 rounded-full transition-all duration-200',
            checked ? 'left-[19px] bg-ink' : 'left-[3px] bg-muted',
          )}
        />
      </button>
    </div>
  );
}

export function Checkbox({ checked, onChange, label, hint, id }) {
  const generatedId = useId();
  const inputId = id || generatedId;
  return (
    <label
      htmlFor={inputId}
      className={cx(
        'flex cursor-pointer items-start gap-3 rounded-lg border px-3.5 py-3 transition-colors duration-150',
        checked ? 'border-gold/35 bg-gold/[0.06]' : 'border-line bg-ink/40 hover:border-line hover:bg-elevated/40',
      )}
    >
      <span
        className={cx(
          'mt-0.5 grid h-[17px] w-[17px] shrink-0 place-items-center rounded border transition-colors',
          checked ? 'border-gold bg-gold text-ink' : 'border-line bg-transparent text-transparent',
        )}
      >
        <Check size={11} strokeWidth={3} aria-hidden="true" />
      </span>
      <input
        id={inputId}
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="min-w-0">
        <span className="block text-[13px] text-parchment/90">{label}</span>
        {hint && <span className="mt-0.5 block text-[11px] leading-snug text-muted">{hint}</span>}
      </span>
    </label>
  );
}

export function CopyButton({
  value,
  label = 'Copy',
  copiedLabel = 'Copied',
  clearAfterMs = 0,
  variant = 'ghost',
  size = 'sm',
  className = '',
  disabled = false,
}) {
  const [state, setState] = useState('idle');

  useEffect(() => {
    if (state === 'idle') return undefined;
    const timer = setTimeout(() => setState('idle'), 1800);
    return () => clearTimeout(timer);
  }, [state]);

  async function handleCopy() {
    try {
      await copyText(value, { clearAfterMs });
      setState('copied');
    } catch {
      setState('error');
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={disabled || !value}
      className={buttonClasses({ variant, size, className })}
      aria-live="polite"
    >
      {state === 'copied' ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
      {label && <span>{state === 'copied' ? copiedLabel : state === 'error' ? 'Denied' : label}</span>}
    </button>
  );
}

export function SecretBox({
  value,
  label,
  mono = true,
  className = '',
  clearAfterMs = 0,
  placeholder = '—',
  rows = 0,
  defaultRevealed = false,
}) {
  const [revealed, setRevealed] = useState(defaultRevealed);

  return (
    <div className={cx('rounded-lg border border-line bg-ink/60', className)}>
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <span className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-muted">{label}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setRevealed((current) => !current)}
            className="inline-flex items-center gap-1.5 rounded px-1.5 py-1 text-[11px] text-muted transition-colors hover:text-parchment"
            aria-label={revealed ? 'Hide value' : 'Reveal value'}
          >
            {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
            {revealed ? 'Hide' : 'Reveal'}
          </button>
          <CopyButton value={value} clearAfterMs={clearAfterMs} label="" copiedLabel="" size="iconSm" />
        </div>
      </div>
      <div
        className={cx(
          'break-all px-3 py-3 text-[13px] leading-relaxed',
          mono && 'font-mono',
          rows > 0 && 'max-h-64 overflow-auto whitespace-pre-wrap',
        )}
      >
        {value ? (revealed ? value : '•'.repeat(Math.min(48, Math.max(12, value.length)))) : placeholder}
      </div>
    </div>
  );
}

const NOTICE_STYLES = {
  info: { wrap: 'border-line bg-elevated/40', icon: 'text-muted', Icon: Info },
  warn: { wrap: 'border-warn/30 bg-warn/[0.07]', icon: 'text-warn', Icon: AlertTriangle },
  danger: { wrap: 'border-danger/30 bg-danger/[0.07]', icon: 'text-danger', Icon: ShieldAlert },
  success: { wrap: 'border-success/30 bg-success/[0.07]', icon: 'text-success', Icon: CheckCircle2 },
};

export function Notice({ tone = 'info', title, children, className = '', compact = false }) {
  const style = NOTICE_STYLES[tone] || NOTICE_STYLES.info;
  const Icon = style.Icon;
  return (
    <div
      className={cx(
        'flex gap-3 rounded-lg border text-[12.5px] leading-relaxed',
        style.wrap,
        compact ? 'px-3 py-2.5' : 'px-4 py-3.5',
        className,
      )}
      role={tone === 'danger' ? 'alert' : undefined}
    >
      <Icon size={16} className={cx('mt-0.5 shrink-0', style.icon)} aria-hidden="true" />
      <div className="min-w-0">
        {title && <p className="mb-0.5 font-medium text-parchment/90">{title}</p>}
        <div className="text-muted">{children}</div>
      </div>
    </div>
  );
}

export function Badge({ children, tone = 'neutral', className = '' }) {
  const tones = {
    neutral: 'border-line bg-elevated/50 text-muted',
    gold: 'border-gold/30 bg-gold/10 text-gold',
    success: 'border-success/30 bg-success/10 text-success',
    danger: 'border-danger/30 bg-danger/10 text-danger',
    warn: 'border-warn/30 bg-warn/10 text-warn',
  };
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[10.5px] tracking-wide',
        tones[tone] || tones.neutral,
        className,
      )}
    >
      {children}
    </span>
  );
}

export function StrengthMeter({ score, label }) {
  const tones = ['bg-danger', 'bg-danger/80', 'bg-warn', 'bg-success/80', 'bg-success'];
  return (
    <div>
      <div className="flex gap-1.5">
        {[0, 1, 2, 3, 4].map((index) => (
          <span
            key={index}
            className={cx(
              'h-1.5 flex-1 rounded-full transition-colors duration-300',
              index <= score ? tones[score] : 'bg-elevated',
            )}
          />
        ))}
      </div>
      {label && <p className="mt-2 text-[12px] text-muted">{label}</p>}
    </div>
  );
}

export function Modal({ open, onClose, title, description, children, footer, size = 'md' }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(event) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
        className={cx(
          'animate-rise w-full overflow-hidden rounded-t-2xl border border-line bg-surface shadow-lift sm:rounded-xl2',
          size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-md',
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-[16px]">{title}</h2>
            {description && <p className="mt-1 text-[12px] leading-relaxed text-muted">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted transition-colors hover:bg-white/5 hover:text-parchment"
            aria-label="Close dialog"
          >
            <X size={16} />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}

export function Spinner({ label }) {
  return (
    <div className="flex items-center gap-2 text-[12px] text-muted">
      <Loader2 size={14} className="animate-spin" aria-hidden="true" />
      {label}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-line px-6 py-12 text-center">
      {Icon && (
        <span className="mb-3 grid h-11 w-11 place-items-center rounded-full border border-line bg-elevated/60 text-muted">
          <Icon size={18} aria-hidden="true" />
        </span>
      )}
      <p className="text-[13.5px] text-parchment/85">{title}</p>
      {children && <div className="mt-1.5 max-w-sm text-[12px] leading-relaxed text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function KeyValue({ items, className = '' }) {
  return (
    <dl className={cx('grid gap-x-6 gap-y-2.5 sm:grid-cols-2', className)}>
      {items.filter(Boolean).map((item) => (
        <div key={item.label} className="flex items-baseline justify-between gap-4 border-b border-line/60 pb-2">
          <dt className="text-[11.5px] uppercase tracking-wide text-muted/80">{item.label}</dt>
          <dd className="text-right font-mono text-[12px] text-parchment/85 break-all">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function InlineHint({ children }) {
  return <p className="text-[11.5px] leading-relaxed text-muted/80">{children}</p>;
}

export function Segmented({ options, value, onChange, className = '', size = 'md' }) {
  return (
    <div
      role="tablist"
      className={cx(
        'inline-flex w-full rounded-lg border border-line bg-ink/50 p-1 sm:w-auto',
        className,
      )}
    >
      {options.map((option) => {
        const Icon = option.icon;
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.id)}
            className={cx(
              'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 text-[12.5px] font-medium transition-colors duration-150 sm:flex-none',
              size === 'sm' ? 'h-7' : 'h-8',
              active ? 'bg-elevated text-parchment shadow-sm' : 'text-muted hover:text-parchment/80',
            )}
          >
            {Icon && <Icon size={13} aria-hidden="true" />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function Tabs({ tabs, value, onChange, className = '' }) {
  return (
    <div className={cx('flex flex-wrap gap-1 border-b border-line', className)} role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === value}
          onClick={() => onChange(tab.id)}
          className={cx(
            'relative -mb-px flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[12.5px] transition-colors',
            tab.id === value
              ? 'border-gold text-parchment'
              : 'border-transparent text-muted hover:text-parchment/80',
          )}
        >
          {tab.icon && <tab.icon size={13} aria-hidden="true" />}
          {tab.label}
        </button>
      ))}
    </div>
  );
}
