"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { InputGroupInput } from "@/components/ui/input-group";

type Props = {
  value: number;
  onChange: (value: number) => void;
  label: string;
  className?: string;
  min?: number;
  step?: number;
  id?: string;
  /** How the value shows when not being edited, e.g. "+10". */
  format?: (value: number) => string;
  /** Render as the input of a shadcn InputGroup (for a unit addon like "ms"). */
  grouped?: boolean;
};

/**
 * Number input that lets you clear and retype without the value snapping to 0
 * mid-edit. Commits every valid number, and restores the last valid one on blur.
 */
export function NumberField({ value, onChange, label, className, min = 0, step, id, format, grouped }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const Component = grouped ? InputGroupInput : Input;

  return (
    <Component
      id={id}
      type={format ? "text" : "number"}
      inputMode={min < 0 ? "text" : "decimal"}
      aria-label={label}
      min={min}
      step={step ?? "any"}
      className={className}
      value={draft ?? (format ? format(value) : String(value))}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => {
        const text = e.target.value;
        setDraft(text);
        const n = Number(text.replace(/^\+/, "").replace("−", "-"));
        if (text.trim() !== "" && Number.isFinite(n) && n >= min) onChange(n);
      }}
      onBlur={() => setDraft(null)}
    />
  );
}
