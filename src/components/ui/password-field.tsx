"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { TextField } from "@/components/ui/field";

/** Password input with a show/hide toggle. Same props as TextField. */
export function PasswordField(props: Omit<React.ComponentProps<typeof TextField>, "type">) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <TextField {...props} type={shown ? "text" : "password"} className="pr-12" />
      <button type="button" onClick={() => setShown((s) => !s)} aria-label={shown ? "Hide password" : "Show password"} aria-pressed={shown}
        className="absolute right-2 top-[2.1rem] grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
        {shown ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
      </button>
    </div>
  );
}
