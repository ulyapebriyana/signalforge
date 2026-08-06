import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Check, Info, TriangleAlert, X } from "lucide-react";

const ICONS = { success: Check, error: TriangleAlert, warning: Bell, info: Info };

export function useToasts() {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id) => setToasts((current) => current.filter((toast) => toast.id !== id)), []);

  const push = useCallback((message, tone = "info", options = {}) => {
    nextId.current += 1;
    const id = nextId.current;
    setToasts((current) => [...current.slice(-3), { id, message, tone, ...options }]);
    return id;
  }, []);

  return { toasts, push, dismiss };
}

export function ToastStack({ toasts, onDismiss }) {
  return (
    <div className="fx-toasts" role="region" aria-label="Pemberitahuan">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function Toast({ toast, onDismiss }) {
  const Icon = ICONS[toast.tone] || Info;

  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(toast.id), toast.duration ?? 5000);
    return () => window.clearTimeout(timer);
  }, [onDismiss, toast.duration, toast.id]);

  return (
    <div className={`fx-toast fx-toast--${toast.tone}`} role="status">
      <Icon />
      <div>
        {toast.title ? <strong>{toast.title}</strong> : null}
        <span>{toast.message}</span>
      </div>
      {toast.action ? (
        <button type="button" className="fx-toast-action" onClick={toast.action.onClick}>
          {toast.action.label}
        </button>
      ) : null}
      <button type="button" className="fx-toast-close" onClick={() => onDismiss(toast.id)} aria-label="Tutup">
        <X />
      </button>
    </div>
  );
}
