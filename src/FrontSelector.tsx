import type { Config } from "../lib/furniture";
import "./front-selector.css";

type Front = NonNullable<Config["front"]>;
export const frontLabels: Record<Front, string> = {
  melamine: "Melamina",
  glass: "Vidrio",
  "aluminum-glass": "Aluminio + vidrio",
};

export function FrontIcon({ kind }: { kind: Front | Config["doors"] }) {
  const glass = kind === "glass" || kind === "aluminum-glass";
  return (
    <svg
      viewBox="0 0 64 64"
      width="46"
      height="46"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M13 9h38v46H13z" />
      {(kind === "none" || kind === "lower") && (
        <path d="M13 24h38M13 39h38M32 9v30" />
      )}
      {(kind === "full" || kind === "lower") && (
        <>
          <path d={kind === "lower" ? "M32 39v16" : "M32 9v46"} />
          <path
            d={kind === "lower" ? "M28 44v5M36 44v5" : "M28 29v6M36 29v6"}
          />
        </>
      )}
      {kind === "melamine" && (
        <>
          <path d="M19 14v36M24 14v36M29 14v36" opacity=".3" />
          <path d="M45 27v10" />
        </>
      )}
      {kind === "aluminum-glass" && (
        <path d="M17 13h30v38H17z" strokeWidth="2.5" />
      )}
      {glass && (
        <>
          <path d="m22 35 17-17m-11 28 14-14" opacity=".5" />
          <path d="M44 28v9" />
        </>
      )}
    </svg>
  );
}

export function FrontSelector({
  value = "melamine",
  options = ["melamine"],
  onChange,
  disabled = false,
}: {
  value?: Front;
  options?: Front[];
  onChange: (value: Front) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="visual-options" disabled={disabled}>
      <legend>Material de las puertas</legend>
      <div className="visual-option-grid">
        {options.map((front) => (
          <button
            type="button"
            key={front}
            aria-pressed={value === front}
            className={value === front ? "selected" : ""}
            onClick={() => onChange(front)}
          >
            <FrontIcon kind={front} />
            <span>{frontLabels[front]}</span>
          </button>
        ))}
      </div>
      {value !== "melamine" && (
        <p className="visual-option-note">
          Vidrio de 6 mm
          {value === "aluminum-glass" ? " con marco de aluminio" : ""}. Incluye
          jalador exterior; el taller confirma herrajes y especificación antes
          de fabricar.
        </p>
      )}
    </fieldset>
  );
}

export function DoorLayoutSelector({
  value,
  options,
  onChange,
}: {
  value: Config["doors"];
  options: Config["doors"][];
  onChange: (value: Config["doors"]) => void;
}) {
  const labels = {
    none: "Abierto",
    lower: "Puertas inferiores",
    full: "Puertas completas",
  };
  return (
    <fieldset className="visual-options">
      <legend>Distribución de puertas</legend>
      <div className="visual-option-grid">
        {options.map((option) => (
          <button
            type="button"
            key={option}
            aria-pressed={value === option}
            className={value === option ? "selected" : ""}
            onClick={() => onChange(option)}
          >
            <FrontIcon kind={option} />
            <span>{labels[option]}</span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
