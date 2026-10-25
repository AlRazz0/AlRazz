# Vista 3D durante la edición

El configurador individual y el planificador de cocinas actualizan la vista mientras se ajustan medidas válidas, sin esperar la respuesta de cotización. La geometría local utiliza el **mismo motor compartido**, con el espesor invariable de **18 mm**; no hay un segundo generador de muebles.

## Borrador, confirmación y servidor

1. **Borrador visual:** arrastrar un deslizador o escribir una medida válida actualiza la vista local. Un valor incompleto, fuera de rango o incompatible conserva la última vista válida. El borrador no se guarda ni se presenta como cotización aceptada.
2. **Confirmación:** soltar el deslizador, pulsar Enter o salir del campo confirma la medida. Un arrastre produce un solo paso de deshacer; no añade historial ni solicita una cotización por cada movimiento. Escape recupera el valor confirmado. Cambiar de pestaña o restablecer descarta los borradores pendientes del configurador.
3. **Validación y cotización:** la configuración confirmada se envía al servidor. El importe permanece pendiente mientras la respuesta no corresponde al estado actual; guardar y cotizar requieren esa confirmación. Las respuestas canceladas o de una revisión anterior no reemplazan el estado vigente.

Una respuesta válida del servidor tiene prioridad sobre la geometría local. Al guardar, se adopta el resultado realmente guardado, también si la tarifa cambió durante la operación. En cocinas, los marcadores de colocación y la distribución aceptada siguen dependiendo del cálculo del servidor; una vista local no autoriza una inserción ni sustituye su comprobación de colisiones.

## Precios y diseños guardados

`src/live-furniture-preview.ts` recibe únicamente productos y materiales públicos. Utiliza entradas monetarias neutras para ejecutar el motor existente y devuelve solo datos visuales: **no devuelve precios, costos ni despieces**. Ningún importe estimado en el navegador se utiliza para guardar o cotizar.

Los diseños y cocinas guardados muestran su snapshot original sin recalcularlo silenciosamente. Solo una edición explícita inicia una nueva comprobación con los modelos y tarifas actuales. Si un guardado termina después de otra edición, su resultado no se aplica sobre esa revisión más reciente.

## Trabajo del visor

El visor conserva las mallas y reutiliza geometrías y materiales compatibles, ajustando sus transformaciones al cambiar las dimensiones. Las texturas y la ambientación de estudio se reutilizan en lugar de recrearse por cada movimiento. Los recursos retirados se liberan y los cuadros pendientes se cancelan al desmontar.

Las invalidaciones de render se agrupan mediante `requestAnimationFrame`. La cámara conserva el giro manual, el objetivo y el acercamiento cuando el mueble sigue dentro del encuadre; si crece hasta recortarse, se aleja sobre la misma dirección. Elegir otra vista sigue permitiendo reencuadrar expresamente.

## Comprobaciones

Desde la raíz, con Node 24:

```sh
npm run check
npm test
npm run build
npm run check:storefront
npm run test:auth-api
npm run test:kitchen-fit-api
```

La revisión actual reúne **329 pruebas unitarias**. Los casos nuevos de `tests/live-furniture-preview.test.ts` comprueban paridad de geometría con el motor, frentes, bisagras, cocinas, validaciones y ausencia de datos monetarios. `tests/viewer-model.test.ts` comprueba reutilización y liberación de recursos, texturas, orientación y conservación de cámara. La integración `test:kitchen-fit-api` usa Worker y D1 aislados en memoria, sin las bases conservadas ni correos reales.

Las mediciones incluidas en los tests describen tiempo de cálculo de geometría en Node; **no son una medición de GPU ni una garantía de cuadros por segundo**. La revisión visual debe comprobar arrastre continuo, teclado, Escape, un solo deshacer, cambio de pestaña con un campo incompleto, guardado y una respuesta de cotización lenta en escritorio y móvil.
