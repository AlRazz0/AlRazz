import { useEffect, useId, useRef, useState } from "react";

/** Keep incomplete typing local, so deleting one digit never requests a zero-sized kitchen. */
export function KitchenDimensionInput({ label, value, min, max, onCommit, onValidityChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  onCommit: (value: number) => void;
  onValidityChange?: (valid: boolean) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState("");
  const id = useId();
  const reportValidity = useRef(onValidityChange);
  reportValidity.current = onValidityChange;
  useEffect(() => {
    setDraft(String(value));
    setError("");
    reportValidity.current?.(value >= min && value <= max && value % 10 === 0);
  }, [value, min, max]);
  function commit() {
    const next = Number(draft);
    if (!draft.trim() || !Number.isFinite(next) || next < min || next > max || next % 10) {
      setError(`Entre ${min} y ${max} mm, en pasos de 10.`);
      onValidityChange?.(false);
      return;
    }
    setError("");
    onValidityChange?.(true);
    if (next !== value) onCommit(next);
  }
  return <label className="kitchen-dimension-input">
    {label} · mm
    <input type="number" inputMode="numeric" step="10" min={min} max={max}
      value={draft} aria-invalid={!!error} aria-describedby={`${id}-hint`}
      onChange={event => {
        const text = event.target.value, next = Number(text);
        setDraft(text); setError("");
        onValidityChange?.(!!text.trim() && Number.isFinite(next) && next >= min && next <= max && next % 10 === 0);
      }}
      onBlur={commit} onKeyDown={event => {
        if (event.key === "Enter") { event.preventDefault(); commit(); }
        if (event.key === "Escape") { setDraft(String(value)); setError(""); onValidityChange?.(Number.isFinite(value) && value >= min && value <= max && value % 10 === 0); }
      }} />
    <small id={`${id}-hint`} role={error ? "alert" : undefined} className={error ? "kitchen-dimension-error" : ""}>
      {error || `${min}–${max} mm`}
    </small>
  </label>;
}
