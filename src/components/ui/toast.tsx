"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastKind = "success" | "error" | "warning" | "info";
type ToastItem = { id: number; kind: ToastKind; title: string; description?: string };

const ToastContext = createContext<{ toast: (t: Omit<ToastItem, "id">) => void }>({ toast: () => {} });
export const useToast = () => useContext(ToastContext);

const icons = { success: CheckCircle2, error: XCircle, warning: AlertTriangle, info: Info };
const colours = { success: "text-success", error: "text-danger", warning: "text-warning", info: "text-link" };

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback((t: Omit<ToastItem, "id">) => {
    const id = nextId++;
    setItems((cur) => [...cur, { ...t, id }]);
    setTimeout(() => setItems((cur) => cur.filter((i) => i.id !== id)), 5000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* aria-live so screen readers announce toasts; errors use role=alert */}
      <div
        className="pointer-events-none fixed right-4 top-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
        aria-live="polite"
      >
        <AnimatePresence>
          {items.map((t) => {
            const Icon = icons[t.kind];
            return (
              <motion.div
                key={t.id}
                role={t.kind === "error" ? "alert" : "status"}
                layout
                initial={{ opacity: 0, x: 48 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 48 }}
                transition={{ duration: 0.25 }}
                className="pointer-events-auto flex gap-3 rounded-xl border border-border bg-card p-4 shadow-lift"
              >
                <Icon className={cn("mt-0.5 size-5 shrink-0", colours[t.kind])} aria-hidden />
                <div>
                  <p className="font-semibold">{t.title}</p>
                  {t.description && <p className="text-sm text-muted-foreground">{t.description}</p>}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
