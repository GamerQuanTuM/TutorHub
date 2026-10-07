"use client";

import { useEffect, useState } from "react";
import { SelectField } from "@/components/ui/field";
import { browserZone, COMMON_ZONES } from "@/lib/time";

/** Time zone dropdown. New accounts (UTC) are switched to the browser's zone after mount. */
export function TimezoneSelect({
  defaultValue,
  name = "timezone",
  error,
  label = "Your time zone",
}: {
  defaultValue: string;
  name?: string;
  error?: string;
  label?: string;
}) {
  const [zone, setZone] = useState(defaultValue);
  const [zones, setZones] = useState<string[]>(COMMON_ZONES);

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        setZones(Intl.supportedValuesOf("timeZone"));
      } catch {}
      if (defaultValue === "UTC") setZone(browserZone());
    }, 0);
    return () => clearTimeout(t);
  }, [defaultValue]);

  const list = zones.includes(zone) ? zones : [zone, ...zones];
  return (
    <SelectField
      label={label}
      name={name}
      value={zone}
      onChange={(e) => setZone(e.target.value)}
      options={list.map((z) => ({ value: z, label: z.replace(/_/g, " ") }))}
      error={error}
      hint="Lesson times are shown in this zone."
    />
  );
}
