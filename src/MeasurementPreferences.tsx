import { useEffect, useState } from "react";
import { measurementAllowed, setMeasurementConsent } from "../lib/measurement-client";
export function MeasurementPreferences() {
  const [enabled,setEnabled]=useState(measurementAllowed);
  useEffect(()=>{const refresh=()=>setEnabled(measurementAllowed());window.addEventListener("alrazz-measurement-consent",refresh);return()=>window.removeEventListener("alrazz-measurement-consent",refresh);},[]);
  return <details className="measurement-preferences"><summary>Privacidad y medición de uso</summary>
    <p>Puedes ayudarnos a mejorar la velocidad y los pasos del diseño. Es opcional y no cambia el servicio.</p>
    <label><input type="checkbox" checked={enabled} onChange={event=>setMeasurementConsent(event.target.checked)}/> Permitir mediciones de esta web</label>
    <p>Registramos pasos generales y tiempos, sin nombres, contactos, medidas de muebles, direcciones IP ni URLs completas. Usamos un identificador temporal por pestaña, no compartido con terceros. Los pasos se conservan hasta 90 días y el rendimiento hasta 30. Puedes desactivarlo aquí; respetamos las señales de privacidad del navegador.</p>
  </details>;
}
