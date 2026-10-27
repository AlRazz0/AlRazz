import { useSyncExternalStore } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { getInteractionSoundState, getServerInteractionSoundState, setInteractionSoundEnabled, subscribeInteractionSound } from "./interaction-sound";
import "./sound-toggle.css";

export function SoundToggle({ compact = false, className = "" }: { compact?: boolean; className?: string }) {
  const { enabled, available } = useSyncExternalStore(subscribeInteractionSound, getInteractionSoundState, getServerInteractionSoundState);
  const label = !available ? "Sonidos no disponibles en este navegador" : enabled ? "Desactivar sonidos de interfaz" : "Activar sonidos de interfaz";
  return <button type="button" data-ui-sound-toggle className={`sound-toggle${compact ? " sound-toggle--compact" : ""} ${className}`.trim()}
    aria-label={label} title={label} aria-pressed={enabled} disabled={!available}
    onClick={event => { if (event.nativeEvent.isTrusted) setInteractionSoundEnabled(!enabled, true); }}>
    {enabled ? <Volume2 size={18} strokeWidth={1.6} aria-hidden="true" /> : <VolumeX size={18} strokeWidth={1.6} aria-hidden="true" />}
    <span>Sonido <small>{available ? enabled ? "Activado" : "Desactivado" : "No disponible"}</small></span>
  </button>;
}
export default SoundToggle;
