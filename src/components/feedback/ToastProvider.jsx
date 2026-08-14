import { useMemo, useState } from "react";
import { ToastContext } from "./ToastContext.js";

export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const value = useMemo(
    () => ({
      pushToast(message) {
        const id = crypto.randomUUID();
        setToasts((current) => [...current, { id, message }]);
        window.setTimeout(() => {
          setToasts((current) => current.filter((toast) => toast.id !== id));
        }, 2600);
      },
    }),
    [],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-label="Application notifications">
        {toasts.map((toast) => (
          <div className="toast-chip" key={toast.id}>
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
