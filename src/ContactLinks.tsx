import { useEffect, useId, useRef, useState } from "react";
import { ArrowUpRight, MessageCircle, X } from "lucide-react";
import type { PublicSettings } from "./types";
import "./contact.css";

type Props = {
  settings: Pick<PublicSettings, "whatsapp" | "whatsappSecondary">;
  message?: string;
  variant?: "inline" | "floating";
};

function phoneLabel(number: string) {
  return /^51\d{9}$/.test(number)
    ? `+51 ${number.slice(2, 5)} ${number.slice(5, 8)} ${number.slice(8)}`
    : `+${number}`;
}

export function ContactLinks({
  settings,
  message = "Hola, AlRazz. Me gustaría recibir asesoría para un mueble de melamina a medida.",
  variant = "inline",
}: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const numbers = [
    ...new Set([settings.whatsapp, settings.whatsappSecondary]),
  ].filter(
    (number): number is string =>
      Boolean(number) && /^[1-9][0-9]{7,14}$/.test(number),
  );

  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLAnchorElement>(".contact-option")?.focus();
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        setOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeEscape);
    };
  }, [open]);

  if (!numbers.length) return null;

  const links = numbers.map((number, index) => (
    <a
      className="contact-option"
      href={`https://wa.me/${number}?text=${encodeURIComponent(message)}`}
      target="_blank"
      rel="noopener noreferrer"
      key={number}
      aria-label={`Contactar por WhatsApp al ${phoneLabel(number)} (abre otra pestaña)`}
    >
      <MessageCircle size={20} aria-hidden="true" />
      <span>
        <small>WhatsApp {numbers.length > 1 ? index + 1 : "AlRazz"}</small>
        <strong>{phoneLabel(number)}</strong>
      </span>
      <ArrowUpRight size={20} aria-hidden="true" />
    </a>
  ));

  if (variant === "inline")
    return (
      <div className="contact-links">
        <p className="contact-hint">
          Elige un contacto para abrir WhatsApp con tu mensaje.
        </p>
        {links}
      </div>
    );

  return (
    <div className="contact-floating" ref={root}>
      {open && (
        <div className="contact-popover" id={panelId}>
          <p>Tu próximo mueble empieza aquí.</p>
          <span className="contact-hint">
            Elige con quién conversar por WhatsApp.
          </span>
          {links}
        </div>
      )}
      <button
        type="button"
        className="contact-trigger"
        ref={trigger}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={
          open ? "Cerrar contactos de WhatsApp" : "Abrir contactos de WhatsApp"
        }
        onClick={() => setOpen(!open)}
      >
        {open ? (
          <X size={22} aria-hidden="true" />
        ) : (
          <MessageCircle size={22} aria-hidden="true" />
        )}
        <span>Conversemos</span>
      </button>
    </div>
  );
}
