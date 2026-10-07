"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/** Accessible on/off switch that submits as a normal form field (value "on" when checked). */
export function Switch({
  name,
  label,
  description,
  defaultChecked = false,
}: {
  name: string;
  label: string;
  description?: string;
  defaultChecked?: boolean;
}) {
  const [on, setOn] = useState(defaultChecked);
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p id={`${name}-label`} className="font-semibold">{label}</p>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby={`${name}-label`}
        onClick={() => setOn(!on)}
        className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors", on ? "bg-primary" : "bg-border")}
      >
        <span className={cn("absolute top-1 size-5 rounded-full bg-white shadow transition-all", on ? "left-6" : "left-1")} />
        <span className="sr-only">{on ? "On" : "Off"}</span>
      </button>
      {on && <input type="hidden" name={name} value="on" />}
    </div>
  );
}
