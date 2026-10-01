# Cocinas modulares

El planificador compone modelos publicados de la categoría **Cocina**. Cada módulo usa el mismo motor de geometría, despiece y precio que el configurador individual. El catálogo y las tarifas siguen siendo administrables en D1.

## Construir desde una plantilla

En `/cocinas`, elige **Lineal compacta**, **Lineal familiar**, **Frente de almacenaje**, **L compacta**, **L familiar** o **L con columnas**. Son seis composiciones distintas de partida, construidas con los modelos visibles del catálogo. Si el administrador oculta modelos necesarios, se adaptan a los disponibles o se omiten las composiciones que no pueden construirse.

Los botones **+** del visor indican espacios libres: abren un selector de muebles compatibles con el ancho, alto y fondo de esa posición. Puedes elegir un diseño, distribución de puertas, vidrio o aluminio cuando el modelo lo permite, y acabado comercial. Al añadirlo, se sustituye el espacio libre conservando el orden; si sobra ancho, queda reservado. Los huecos para refrigeradora, cocina y lavadero conservan su significado y no se rellenan automáticamente con muebles.

Los marcadores siguen la cámara en las vistas 3D, frente y planta. Admiten teclado y tienen una zona de pulsación de 46 px. Son controles de la interfaz: no alteran geometría, cotas, precios ni despieces. Los modelos colocados siguen editándose desde su ficha de parámetros. La cotización se valida en el servidor antes de guardar una versión o compartirla por WhatsApp.

## Composición

Un `KitchenPlan` contiene paredes A y B en milímetros, disposición lineal o en L, elevación de alacenas, altura disponible y hasta 16 elementos. `roomHeight` es opcional; su valor de cálculo es 2600 mm. No se inserta ese valor en snapshots que lo omiten.

Los elementos se colocan por orden en cada pared. Las filas `base` y `tall` comparten la secuencia inferior; `wall` tiene su propia secuencia. Un elemento `space` reserva longitud sin fabricar ni representar una pieza. Las reservas `fridge`, `cooker` y `sink-gap` se muestran como volúmenes translúcidos y cuestan cero. No incluyen equipos, lavadero, encimera, conexiones ni recortes.

En una composición en L, la pared B empieza después de la profundidad máxima de los muebles de A más 50 mm. El servidor rechaza módulos que exceden las paredes, sobrepasan el techo o se cruzan con otros muebles o reservas de equipos. Esto evita interferencias volumétricas; no sustituye la medición de obra ni la validación de apertura, ventilación y anclajes.

Los cuerpos continúan siendo de melamina de 18 mm. Las puertas especiales se procesan mediante el motor de frentes; los accesorios de vidrio y aluminio no se convierten en piezas ficticias de melamina.

## Precios y snapshots

Instalación y transporte se desactivan dentro de cada módulo. El precio de la cocina suma los precios comerciales de sus módulos y los servicios seleccionados una única vez. El redondeo de servicios conserva el paso de S/ 10 del motor.

`0003_kitchens.sql` añade una tabla independiente sin modificar diseños individuales ni reiniciar el catálogo. Cada cocina guardada conserva una copia de los productos, configuraciones, tarifas, resultados y geometría que se usaron al guardarla. Cambios posteriores del administrador no recalculan esa copia. El visitante puede crear otra composición a partir de ella para obtener precios actuales.

La cookie de propietario permite listar o retirar hasta 50 cocinas propias; compartir la URL con UUID solo concede lectura. No se guardan campos de contacto. El panel administrativo lista las últimas 100 composiciones guardadas para abrir su despiece preliminar por módulo.

## API

- `POST /api/kitchen-quote` con `{plan}` devuelve `KitchenQuote`.
- `POST /api/store` con `{op:"save-kitchen", plan, name}` guarda y devuelve `{kitchen: KitchenDesign}`.
- `GET /api/store?action=kitchen&id=UUID` lee una copia compartida.
- `GET /api/store?action=kitchens` lista únicamente las copias del visitante.
- `POST /api/store` con `{op:"remove-kitchen", id, version}` retira una copia propia con control de versión.
- `GET /api/store?action=admin-kitchens` exige sesión administrativa completa y devuelve identificadores, nombres y fechas.
- `POST /api/store` con `{op:"kitchen-cut-list", kitchenId}` o `{op:"kitchen-cut-list", plan}` exige contraseña y segundo factor. El resultado incluye el despiece privado de cada módulo.

La proyección pública contiene solo geometría visual, configuración, precios comerciales y materiales públicos. Las tarifas por unidad o metro lineal, costes de materiales, desglose interno y despiece permanecen en servidor. Las rutas nuevas usan las comprobaciones de origen, tipo de contenido y límite de 1 MB del resto de la API.

## Verificación

`tests/kitchen.test.ts` verifica composición, esquina en L, transformación de piezas, colisiones con columnas, reservas, límites y cobro único de servicios. Las pruebas de plantillas, colocación y marcadores verifican las seis propuestas con el catálogo completo, sustitución de espacios, compatibilidad dimensional, proyección y zonas bloqueadas. `tests/kitchen-api.integration.mjs` se ejecuta exclusivamente en localhost y verifica doble factor, permisos por propietario, privacidad de tarifas, snapshots inmutables y eliminación con versión. Sus productos y cocinas temporales se limpian por identificadores exactos.
