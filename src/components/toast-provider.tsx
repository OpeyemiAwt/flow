"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ToastVariant = "success" | "error" | "info" | "warning";

export interface ToastOptions {
  readonly id?: string;
  readonly title: string;
  readonly description?: string;
  readonly variant?: ToastVariant;
  readonly durationMs?: number;
}

interface ToastItem extends ToastOptions {
  readonly id: string;
  readonly variant: ToastVariant;
}

interface ToastContextValue {
  readonly pushToast: (opts: ToastOptions) => void;
  readonly dismissToast: (id: string) => void;
}

const NOOP_CONTEXT: ToastContextValue = {
  pushToast: () => {},
  dismissToast: () => {},
};

const ToastContext = createContext<ToastContextValue>(NOOP_CONTEXT);

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const seenIdsRef = useRef<Set<string>>(new Set());

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const pushToast = useCallback(
    (opts: ToastOptions) => {
      const dedupeId = opts.id;
      if (dedupeId && seenIdsRef.current.has(dedupeId)) {
        return;
      }
      const id =
        dedupeId ||
        `toast_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      if (dedupeId) {
        seenIdsRef.current.add(dedupeId);
      }

      const item: ToastItem = {
        ...opts,
        id,
        variant: opts.variant ?? "info",
      };

      setToasts((prev) => [...prev.slice(-4), item]);

      const duration = opts.durationMs ?? 5000;
      if (duration > 0) {
        setTimeout(() => {
          dismissToast(id);
        }, duration);
      }
    },
    [dismissToast],
  );

  // Clean up dedupe set periodically if it grows large
  useEffect(() => {
    if (seenIdsRef.current.size > 200) {
      seenIdsRef.current.clear();
    }
  }, [toasts.length]);

  return (
    <ToastContext.Provider value={{ pushToast, dismissToast }}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed bottom-4 right-4 z-[9999] flex w-full max-w-sm flex-col gap-2.5 px-4 sm:bottom-6 sm:right-6 sm:px-0"
      >
        {toasts.map((toast) => {
          const borderTone =
            toast.variant === "success"
              ? "border-emerald-200 dark:border-emerald-800/70 bg-white/95 dark:bg-[#141414]/95"
              : toast.variant === "error"
                ? "border-red-200 dark:border-red-900/70 bg-white/95 dark:bg-[#141414]/95"
                : toast.variant === "warning"
                  ? "border-amber-200 dark:border-amber-800/70 bg-white/95 dark:bg-[#141414]/95"
                  : "border-neutral-200 dark:border-white/[0.12] bg-white/95 dark:bg-[#141414]/95";

          return (
            <div
              key={toast.id}
              role="status"
              className={`flow-anim-fade-up pointer-events-auto flex items-start gap-3 rounded-2xl border p-3.5 shadow-xl backdrop-blur-md transition-all ${borderTone}`}
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-neutral-950 dark:text-white">
                  {toast.title}
                </p>
                {toast.description && (
                  <p className="mt-0.5 text-[11px] leading-relaxed text-neutral-600 dark:text-neutral-300 break-words">
                    {toast.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                aria-label="Dismiss notification"
                className="shrink-0 rounded-full p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-200 cursor-pointer"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
