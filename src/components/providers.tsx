"use client";

import { MotionConfig } from "framer-motion";
import { ToastProvider } from "@/components/ui/toast";
import { ThemeProvider } from "@/components/theme";

/** App-wide client providers. reducedMotion="user" makes Framer Motion obey prefers-reduced-motion. */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <ThemeProvider>
        <ToastProvider>{children}</ToastProvider>
      </ThemeProvider>
    </MotionConfig>
  );
}
