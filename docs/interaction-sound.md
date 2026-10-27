# Sonido opcional de interfaz

La interfaz parte silenciada. El control **Sonido** permite activar o desactivar una preferencia local opcional (`alrazz.interactionSound`). Una preferencia retenida no abre por sí sola un dispositivo ni reproduce audio. Sólo un clic real de ratón, toque o activación nativa por teclado puede abrir/reanudar `AudioContext` y generar un sonido.

No se descargan archivos, no se llama a servicios y no se incorporan dependencias. Los tres timbres originales son síntesis breve de osciladores con envolvente amortiguada y filtro suave: `tap`, `select` y `confirm`. Duran aproximadamente 90, 120 y 160 ms y usan ganancia baja. No reemplazan las señales visuales ni significan que una operación de servidor haya terminado.

## Integración

En el efecto de la aplicación:

```tsx
import { installInteractionSounds } from "./interaction-sound";
useEffect(() => installInteractionSounds(), []);
```

El instalador devuelve limpieza, admite el ciclo de montaje de StrictMode y nunca crea un contexto de audio al instalarse.

En un encabezado público:

```tsx
import { SoundToggle } from "./SoundToggle";
<SoundToggle compact />
```

El botón tiene un objetivo mínimo de 44 × 44 px, etiqueta accesible y `aria-pressed`. Sin `compact` muestra también el estado textual. Si el navegador no ofrece audio o falla su inicialización, la interfaz sigue funcionando y el control queda deshabilitado con una explicación.

Sólo los controles declarados participan:

```tsx
<button data-ui-sound={selected ? undefined : "select"}>Elegir acabado</button>
<button data-ui-sound="tap">Abrir detalle</button>
```

Los valores válidos son `tap`, `select` y `confirm`. No marcar el control del sonido, sliders ni selecciones que no van a cambiar. `data-ui-sound-disabled` en el control o un ancestro lo excluye; `data-ui-sound-drag` identifica un control arrastrable personalizado.

El listener toma el marcador en captura, antes de que React actualice el atributo. Abre/reanuda el contexto dentro del gesto y comprueba `defaultPrevented` antes de sintetizar. Ignora eventos programáticos, botones secundarios, elementos ocultos, `disabled`, `aria-disabled`, `inert`, estados inactivos y selecciones ya activas. No escucha hover ni reproduce al mover el puntero.

Los sliders nativos, `role=slider`, `data-slot=slider` y controles de drag optativos se excluyen. Durante su arrastre se silencian también otros clics; el clic derivado de soltar el arrastre no produce audio. Hay un límite de repetición de 160 ms.

## Cancelación y privacidad

No se reproduce en `/admin` ni sus subrutas. Silenciar, ocultar la pestaña, perder el foco, abandonar la página o desmontar la instalación cancela las fuentes, desconecta los nodos y cierra el contexto. La preferencia puede conservarse; no se reactiva audio hasta otro gesto.

Las reanudaciones asíncronas verifican preferencia, generación, ruta pública y visibilidad antes de crear voces. Una reanudación que tarda más de 180 ms se descarta; no se entrega un clic atrasado. Cambiar filtros de la misma página no cuenta como navegar a otra ruta. Las voces liberan sus nodos al terminar. La opción no registra interacciones ni transmite datos.

Referencias de Web Audio: [AudioContext.resume](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/resume), [AudioScheduledSourceNode.stop](https://developer.mozilla.org/en-US/docs/Web/API/AudioScheduledSourceNode/stop) y [AudioParam.cancelScheduledValues](https://developer.mozilla.org/en-US/docs/Web/API/AudioParam/cancelScheduledValues).

## Verificación

`node --experimental-strip-types --test tests/interaction-sound.test.ts` prueba con AudioContext simulado: silencio inicial y ausencia de autoplay, preferencia retenida, gestos reales, duraciones/ganancia acotadas, límite de repetición, limpieza, mute, cancelación de reanudaciones por ruta/visibilidad/latencia, fallos de API o storage, captura antes de React, sliders e interfaz administrativa. La percepción del timbre y volumen se revisa además mediante un gesto explícito en el navegador.
