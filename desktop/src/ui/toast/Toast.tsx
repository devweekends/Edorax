import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

export type ToastTone = 'error' | 'success' | 'info';
type ToastOptions = { description?: string; action?: { label: string; onClick: () => void } };
type ToastInput = ToastOptions & { title: string; tone?: ToastTone };
type ToastItem = ToastInput & { id: number; tone: ToastTone };

type ToastApi = {
  show: (input: ToastInput) => number;
  error: (title: string, options?: ToastOptions) => number;
  success: (title: string, options?: ToastOptions) => number;
  info: (title: string, options?: ToastOptions) => number;
};

const DURATION: Record<ToastTone, number> = { error: 9000, success: 4000, info: 5000 };
const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((items) => items.filter((item) => item.id !== id));
  }, []);

  const show = useCallback(
    (input: ToastInput) => {
      const id = nextId.current++;
      const tone = input.tone ?? 'info';
      // Keep the newest few on screen so a burst of sync errors cannot cover the lesson.
      setToasts((items) => [...items.slice(-3), { ...input, tone, id }]);
      window.setTimeout(() => dismiss(id), DURATION[tone]);
      return id;
    },
    [dismiss],
  );

  // Background sync reports its results here, so the learner hears about them without a page change.
  useEffect(() => {
    return window.buildment.offline.onStatus((status) => {
      if (status.synced > 0 && status.pending === 0 && status.dropped.length === 0) {
        show({
          tone: 'success',
          title: 'Offline changes synced',
          description: `${status.synced} ${status.synced === 1 ? 'change was' : 'changes were'} saved.`,
        });
      }
      for (const message of status.dropped) {
        show({ tone: 'error', title: 'A saved change could not sync', description: message });
      }
    });
  }, [show]);

  const api = useMemo<ToastApi>(
    () => ({
      show,
      error: (title, options) => show({ ...options, title, tone: 'error' }),
      success: (title, options) => show({ ...options, title, tone: 'success' }),
      info: (title, options) => show({ ...options, title, tone: 'info' }),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-3"
      >
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const Icon = toast.tone === 'error' ? AlertCircle : toast.tone === 'success' ? CheckCircle2 : Info;
  const action = toast.action;
  return (
    <div
      role={toast.tone === 'error' ? 'alert' : 'status'}
      className={`pointer-events-auto flex items-start gap-3 rounded-xl border bg-card p-4 shadow-lg ${
        toast.tone === 'error' ? 'border-destructive/40' : toast.tone === 'success' ? 'border-primary/40' : 'border-border'
      }`}
    >
      <Icon size={18} className={`mt-0.5 shrink-0 ${toast.tone === 'error' ? 'text-destructive' : 'text-primary'}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{toast.title}</p>
        {toast.description && <p className="mt-0.5 text-sm text-muted-foreground">{toast.description}</p>}
        {action && (
          <button
            type="button"
            onClick={() => {
              action.onClick();
              onDismiss();
            }}
            className="mt-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            {action.label}
          </button>
        )}
      </div>
      <button type="button" aria-label="Dismiss" onClick={onDismiss} className="shrink-0 text-muted-foreground hover:text-foreground">
        <X size={16} />
      </button>
    </div>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside ToastProvider');
  return api;
}
