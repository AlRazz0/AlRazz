import { useLayoutEffect, useId, useRef, useState } from "react";
import { Slider } from "../components/ui/slider";

/** Pointer/keyboard previews stay visual until release, Enter or blur. */
export function StudioDimensionControl({ label, value, min, max, unit, resetKey, onPreview, onCommit }: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: "cm" | "mm";
  resetKey: number;
  onPreview: (value: number | null, dirty: boolean) => void;
  onCommit: (value: number) => void;
}) {
  const factor = unit === "cm" ? 10 : 1;
  const [draft, setDraft] = useState(String(value / factor));
  const [error, setError] = useState("");
  const id = useId();
  const callbacks = useRef({onPreview, onCommit});
  const previous = useRef({value, factor, resetKey});
  callbacks.current = {onPreview, onCommit};
  useLayoutEffect(() => {
    const changed = previous.current.value !== value || previous.current.factor !== factor || previous.current.resetKey !== resetKey;
    previous.current = {value, factor, resetKey};
    setDraft(String(value / factor));
    setError("");
    // Radix commits keyboard changes before its onValueChange notification.
    // Once the confirmed value arrives, that notification is no longer a draft.
    if (changed) callbacks.current.onPreview(value, false);
  }, [value, factor, resetKey]);
  const parse = (text: string) => {
    const next = Number(text) * factor;
    return text.trim() && Number.isFinite(next) && next >= min && next <= max && next % 10 === 0 ? next : null;
  };
  const next = parse(draft);
  const restore = () => {
    setDraft(String(value / factor)); setError("");
    callbacks.current.onPreview(value, false);
  };
  const commit = (candidate = parse(draft)) => {
    if (candidate === null) {
      setError(`Entre ${min / factor} y ${max / factor} ${unit}, en pasos de ${10 / factor}.`);
      return;
    }
    setError("");
    if (candidate !== value) callbacks.current.onCommit(candidate);
    callbacks.current.onPreview(candidate, false);
  };
  return <div className="dimension-field">
    <div>
      <label htmlFor={id}>{label}</label>
      <span><input id={id} aria-label={`${label} en ${unit === "cm" ? "centímetros" : "milímetros"}`}
        type="number" inputMode="decimal" min={min / factor} max={max / factor} step={10 / factor}
        value={draft} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined}
        onChange={event => {
          const text = event.target.value, candidate = parse(text);
          setDraft(text); setError(""); callbacks.current.onPreview(candidate, candidate !== value);
        }}
        onBlur={() => commit()} onKeyDown={event => {
          if (event.key === "Enter") {event.preventDefault(); commit();}
          if (event.key === "Escape") {event.preventDefault(); restore();}
        }} /> {unit}</span>
    </div>
    <Slider aria-label={label} aria-valuetext={`${(next ?? value) / 10} centímetros`}
      min={min} max={max} step={10} value={[next ?? value]}
      onValueChange={([candidate]) => {
        setDraft(String(candidate / factor)); setError("");
        callbacks.current.onPreview(candidate, candidate !== value);
      }}
      onValueCommit={([candidate]) => commit(candidate)}
      onKeyDown={event => { if (event.key === "Escape") {event.preventDefault(); restore();} }} />
    <div className="range-label"><span>{min / 10} cm</span><span>{max / 10} cm</span></div>
    {error && <p id={`${id}-error`} className="error-box" role="alert">{error}</p>}
  </div>;
}
