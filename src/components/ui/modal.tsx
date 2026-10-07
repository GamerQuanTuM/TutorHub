"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

/** Accessible modal (focus trap, Esc to close and aria labelling come from Radix). */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
            </Dialog.Overlay>
            <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center p-4">
              <Dialog.Content asChild forceMount>
                <motion.div
                  className="pointer-events-auto relative w-full max-w-md rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-lift"
                  initial={{ opacity: 0, y: 16, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.98 }}
                  transition={{ duration: 0.2 }}
                >
                  <Dialog.Title className="pr-8 font-heading text-2xl font-extrabold">{title}</Dialog.Title>
                  <Dialog.Description className={description ? "mt-1 text-sm text-muted-foreground" : "sr-only"}>
                    {description ?? title}
                  </Dialog.Description>
                  <div className="mt-4">{children}</div>
                  <Dialog.Close
                    aria-label="Close"
                    className="absolute right-3 top-3 grid size-9 place-items-center rounded-full hover:bg-muted"
                  >
                    <X className="size-5" aria-hidden />
                  </Dialog.Close>
                </motion.div>
              </Dialog.Content>
            </div>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
