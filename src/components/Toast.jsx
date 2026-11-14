import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { cx } from './ui.jsx';

const ToastContext = createContext(null);

const TONES = {
  success: { Icon: CheckCircle2, className: 'border-success/30 text-success' },
  danger: { Icon: AlertTriangle, className: 'border-danger/30 text-danger' },
  info: { Icon: Info, className: 'border-line text-muted' },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (message, tone = 'info') => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((current) => [...current.slice(-3), { id, message, tone }]);
      setTimeout(() => dismiss(id), 4200);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6">
        {toasts.map((toast) => {
          const { Icon, className } = TONES[toast.tone] || TONES.info;
          return (
            <div
              key={toast.id}
              role="status"
              className={cx(
                'animate-rise pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-lg border bg-surface/95 px-3.5 py-2.5 shadow-lift backdrop-blur',
                className,
              )}
            >
              <Icon size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
              <p className="flex-1 text-[12.5px] leading-relaxed text-parchment/90">{toast.message}</p>
              <button
                type="button"
                onClick={() => dismiss(toast.id)}
                className="rounded p-0.5 text-muted/70 transition-colors hover:text-parchment"
                aria-label="Dismiss notification"
              >
                <X size={13} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}
