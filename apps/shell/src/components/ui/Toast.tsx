import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type React from "react";

type ToastVariant = "success" | "error" | "info";

type ToastItem = {
  id: string;
  message: string;
  variant: ToastVariant;
};

type ToastOptions = {
  variant?: ToastVariant;
  duration?: number;
};

type ToastContextValue = {
  push: (message: string, options?: ToastOptions) => void;
  success: (message: string, options?: Omit<ToastOptions, "variant">) => void;
  error: (message: string, options?: Omit<ToastOptions, "variant">) => void;
  info: (message: string, options?: Omit<ToastOptions, "variant">) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  error: "border-red-200 bg-red-50 text-red-900",
  info: "border-slate-200 bg-white text-slate-900",
};

const DEFAULT_DURATION = 3000;

function createToastId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, number>>(new Map());

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (message: string, options?: ToastOptions) => {
      const id = createToastId();
      const variant = options?.variant ?? "info";
      const duration = options?.duration ?? DEFAULT_DURATION;

      setToasts((prev) => [...prev, { id, message, variant }]);

      const timer = window.setTimeout(() => remove(id), duration);
      timersRef.current.set(id, timer);
    },
    [remove]
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      push,
      success: (message, options) => push(message, { ...options, variant: "success" }),
      error: (message, options) => push(message, { ...options, variant: "error" }),
      info: (message, options) => push(message, { ...options, variant: "info" }),
    }),
    [push]
  );

  useEffect(() => () => timersRef.current.forEach((timer) => window.clearTimeout(timer)), []);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed right-4 top-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={`pointer-events-auto w-[320px] rounded-lg border px-3 py-2 shadow-lg animate-[toast-in_200ms_ease-out] ${VARIANT_STYLES[toast.variant]}`}
          >
            <div className="flex items-start gap-2">
              <div className="text-sm font-semibold">
                {toast.variant === "success" && "成功"}
                {toast.variant === "error" && "错误"}
                {toast.variant === "info" && "提示"}
              </div>
              <div className="text-sm leading-5">{toast.message}</div>
              <button
                type="button"
                className="ml-auto text-xs text-slate-500 hover:text-slate-700"
                onClick={() => remove(toast.id)}
                aria-label="关闭提示"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}
