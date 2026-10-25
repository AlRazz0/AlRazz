import { useLayoutEffect, useId, useRef, useState } from "react";
import { Slider } from "../components/ui/slider";

/** Keep incomplete typing local, so deleting one digit never requests a zero-sized kitchen. */
export function KitchenDimensionInput({ label, value, min, max, onCommit, onValidityChange, onPreview, slider = false, disabled = false, resetKey = 0 }: {
  label: string;
  value: number;
  min: number;
  max: number;
  onCommit: (value: number) => void;
  onValidityChange?: (valid: boolean) => void;
  /** Visual draft only. Null means incomplete/invalid; dirty never commits a plan. */
  onPreview?: (value: number | null, dirty: boolean) => void;
  slider?: boolean;
  disabled?: boolean;
  resetKey?: number;
}) {
  const [draft, setDraft] = useState(String(value));
  const [error, setError] = useState("");
  const id = useId();
  const reportValidity = useRef(onValidityChange);
  reportValidity.current = onValidityChange;
  const reportPreview = useRef(onPreview);
  reportPreview.current = onPreview;
  const previousInput = useRef({ value, min, max, resetKey });
  const lastValidValue = useRef(value);
  useLayoutEffect(() => {
    const previous = previousInput.current;
    const changed = !Object.is(previous.value, value) || previous.min !== min || previous.max !== max || previous.resetKey !== resetKey;
    previousInput.current = { value, min, max, resetKey };
    lastValidValue.current = value;
    setDraft(String(value));
    setError("");
    reportValidity.current?.(Number.isFinite(value) && value >= min && value <= max && value % 10 === 0);
    // Mounting another field must not clear a sibling's in-progress preview.
    // Inline callback identities also must not reset the user's typing.
    if (changed) reportPreview.current?.(value, false);
  }, [value, min, max, resetKey]);
  function reportDraft(text: string) {
    const next = Number(text);
    const valid = !!text.trim() && Number.isFinite(next) && next >= min && next <= max && next % 10 === 0;
    if (valid) lastValidValue.current = next;
    reportValidity.current?.(valid);
    reportPreview.current?.(valid ? next : null, !text.trim() || next !== value);
  }
  function commit(explicitValue?: number) {
    const text = explicitValue === undefined ? draft : String(explicitValue);
    const next = Number(text);
    if (!text.trim() || !Number.isFinite(next) || next < min || next > max || next % 10) {
      setError(`Entre ${min} y ${max} mm, en pasos de 10.`);
      reportDraft(text);
      return;
    }
    setDraft(String(next));
    lastValidValue.current = next;
    setError("");
    reportValidity.current?.(true);
    if (next !== value) onCommit(next);
    // Commit the parent value before removing its visual override. React batches
    // these updates, so the model never returns to the previous measure in between.
    reportPreview.current?.(next, false);
  }
  function reset() {
    setDraft(String(value)); setError("");
    lastValidValue.current = value;
    reportValidity.current?.(Number.isFinite(value) && value >= min && value <= max && value % 10 === 0);
    reportPreview.current?.(value, false);
  }
  const sliderValue = Math.min(max, Math.max(min, Number.isFinite(lastValidValue.current) ? lastValidValue.current : value));
  return <div className="kitchen-dimension-input" style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
    <label htmlFor={`${id}-input`}>{label} · mm</label>
    <input id={`${id}-input`} type="number" inputMode="numeric" step="10" min={min} max={max} disabled={disabled}
      value={draft} aria-invalid={!!error} aria-describedby={`${id}-hint`}
      onChange={event => {
        const text = event.target.value;
        setDraft(text); setError("");
        reportDraft(text);
      }}
      onBlur={() => commit()} onKeyDown={event => {
        if (event.key === "Enter") { event.preventDefault(); commit(); }
        if (event.key === "Escape") reset();
      }} />
    {slider && <Slider min={min} max={max} step={10} value={[sliderValue]} disabled={disabled}
      aria-label={`${label}, ajuste continuo en milímetros`} aria-valuetext={`${sliderValue} milímetros`}
      aria-describedby={`${id}-hint`} className="kitchen-dimension-slider" style={{ minHeight: 28 }}
      onValueChange={([next]) => {
        if (next === undefined) return;
        const text = String(next);
        setDraft(text); setError(""); reportDraft(text);
      }}
      onValueCommit={([next]) => { if (next !== undefined) commit(next); }}
      onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); reset(); }
      }} />}
    <small id={`${id}-hint`} role={error ? "alert" : undefined} className={error ? "kitchen-dimension-error" : ""}>
      {error || `${min}–${max} mm`}
    </small>
  </div>;
}
