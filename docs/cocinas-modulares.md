# Cocinas modulares

El planificador compone modelos publicados de la categoría **Cocina**. Cada módulo usa el mismo motor de geometría, despiece y precio que el configurador individual. El catálogo y las tarifas siguen siendo administrables en D1.

## Construir desde una plantilla

En `/cocinas`, elige **Lineal compacta**, **Lineal familiar**, **Frente de almacenaje**, **L compacta**, **L familiar** o **L con columnas**. Son seis composiciones distintas de partida, construidas con los modelos visibles del catálogo. Si el administrador oculta modelos necesarios, se adaptan a los disponibles o se omiten las composiciones que no pueden construirse.

Los botones **+** del visor indican espacios libres: abren un selector de muebles compatibles con el ancho, alto y fondo de esa posición. Puedes elegir un diseño, distribución de puertas, vidrio o aluminio cuando el modelo lo permite, y acabado comercial. Al añadirlo, se sustituye el espacio libre conservando el orden; si sobra ancho, queda reservado. Los huecos para refrigeradora, cocina y lavadero conservan su significado y no se rellenan automáticamente con muebles.

Los marcadores siguen la cámara en las vistas 3D, frente y planta. Admiten teclado y tienen una zona de pulsación de 46 px. Son controles de la interfaz: no alteran geometría, cotas, precios ni despieces. Los modelos colocados siguen editándose desde su ficha de parámetros. La cotización se valida en el servidor antes de guardar una versión o compartirla por WhatsApp.

## Ver qué cabe antes de añadir

**Vista de distribución** muestra cada pared con dos filas: **Alacenas** y **Muebles bajos y columnas**. Los bloques conservan su ancho proporcional; sus números corresponden a las fichas de debajo. El resumen distingue ancho ocupado, reserva de esquina, bloqueo por columnas o equipos altos, ancho libre y exceso. Las reservas de equipos también consumen ancho, aunque no sean muebles incluidos en la cotización.

**Libre** suma los intervalos aprovechables de la fila: incluye la parte rellenable de un espacio `space` y los tramos finales vacíos, pero descuenta muebles, esquina y obstrucciones en altura. Las columnas y equipos que alcanzan la zona de alacenas aparecen rayados en esa fila, sin convertirse en piezas reordenables de ella. Los obstáculos coincidentes se unen y no se cuenta dos veces el ancho ya ocupado por un mueble. La cifra puede repartirse entre varios intervalos; no es el ancho máximo de un módulo nuevo. Por ejemplo, con una alacena de 1040 mm y una refrigeradora que bloquea otros 900 mm en una pared de 4000 mm, quedan **2060 mm libres**, repartidos alrededor del equipo.

Selecciona la ficha de una pieza para abrir sus parámetros. Las flechas la mueven únicamente dentro de su pared y fila; bajos y columnas comparten esa secuencia. No se puede mover más allá del primero o el último. En pantallas pequeñas puedes desplazar horizontalmente el plano y utilizar las fichas y flechas mediante teclado. Los controles de las fichas tienen una zona mínima de 44 px.

**Distribución calculada** significa que el plano utiliza las posiciones devueltas por el servidor para la composición vigente. **Borrador: falta cálculo**, **Calculando distribución…** o **Necesita un ajuste** distinguen una composición pendiente o rechazada. El esquema del borrador sigue visible para corregir excesos y medidas incompletas; no sustituye el cálculo ni acredita fabricación. Una cotización anterior no se presenta como resultado de una distribución nueva.

El panel **Añadir a tu cocina** filtra modelos según la pared, fila y espacio disponibles. Seleccionar un modelo abre la misma revisión de medidas, distribución, puertas y acabado de los botones **+**. Las medidas se confirman con Enter o al salir del campo. Un campo incompleto o fuera de rango impide confirmar; Escape recupera su medida anterior.

Antes de incorporar un módulo o una reserva a una cocina con muebles, se comprueba la composición propuesta mediante `POST /api/kitchen-quote`. Si hay una colisión, exceso o fallo de conexión, la composición anterior se conserva y se muestra el motivo. Una cocina que todavía contiene solo reservas sigue siendo un borrador: necesita al menos un mueble para calcular y guardar.

### Huecos pequeños y reservas parciales

Los espacios de alineación `space` admiten anchos desde **10 mm**, en pasos de 10 mm, hasta 2000 mm por elemento. Los márgenes mayores pueden dividirse en varios elementos, siempre dentro del límite total de 16. Son holguras sin piezas ni precio; no cambian los 18 mm del tablero. Las reservas de refrigeradora, cocina y lavadero mantienen un ancho mínimo de 100 mm y su significado propio.

Una reserva superior puede estar parcialmente bloqueada por una columna o refrigeradora de la fila inferior. El selector ofrece únicamente los intervalos libres compatibles. Por ejemplo, si una refrigeradora ocupa los primeros 900 mm de una reserva superior de 1800 mm, se puede colocar una alacena en los 900 mm restantes, dejando intacta la zona situada sobre el equipo. Los obstáculos se consideran según su altura y fondo; las ofertas se ajustan hacia dentro a la cuadrícula de 10 mm.

Al insertar en parte de una reserva se conservan el margen anterior, el módulo nuevo y el sobrante posterior. No se estrechan, cambian de acabado ni redimensionan los muebles vecinos para hacer sitio. El servidor sigue comprobando la composición completa. Que aparezca una oferta de ancho libre no implica que cualquier módulo del catálogo quepa en ella.

## Composición

Un `KitchenPlan` contiene paredes A y B en milímetros, disposición lineal o en L, elevación de alacenas, altura disponible y hasta 16 elementos. `roomHeight` es opcional; su valor de cálculo es 2600 mm. No se inserta ese valor en snapshots que lo omiten.

Los elementos se colocan por orden en cada pared. Las filas `base` y `tall` comparten la secuencia inferior; `wall` tiene su propia secuencia. Un elemento `space` reserva longitud sin fabricar ni representar una pieza. Las reservas `fridge`, `cooker` y `sink-gap` se muestran como volúmenes translúcidos y cuestan cero. No incluyen equipos, lavadero, encimera, conexiones ni recortes.

En una composición en L, la pared B empieza después de la profundidad máxima de los muebles y reservas de equipos de A más **50 mm**; los elementos `space` no generan esa obstrucción. La reserva se aplica a ambas filas de B. Es una regla conservadora compartida con el servidor: puede dejar parte de una fila sin ofrecer aunque visualmente parezca aprovechable. El mapa utiliza los desplazamientos reales de una cotización vigente; para un borrador muestra esta reserva provisional. No se optimiza automáticamente un rincón ni se ofrecen muebles rinconeros fuera del motor.

El servidor rechaza módulos que exceden las paredes, sobrepasan el techo o se cruzan con otros muebles o reservas de equipos. Esto evita interferencias volumétricas; no sustituye la medición de obra ni la validación de apertura, ventilación y anclajes. Cambiar una profundidad en A puede desplazar la secuencia de B al recalcular la esquina; revisa de nuevo su holgura.

Los cuerpos continúan siendo de melamina de 18 mm. Las puertas especiales se procesan mediante el motor de frentes; los accesorios de vidrio y aluminio no se convierten en piezas ficticias de melamina.

## Precios y snapshots

Instalación y transporte se desactivan dentro de cada módulo. El precio de la cocina suma los precios comerciales de sus módulos y los servicios seleccionados una única vez. El redondeo de servicios conserva el paso de S/ 10 del motor.

`0003_kitchens.sql` añade una tabla independiente sin modificar diseños individuales ni reiniciar el catálogo. Cada cocina guardada conserva una copia de los productos, configuraciones, tarifas, resultados y geometría que se usaron al guardarla. Cambios posteriores del administrador no recalculan esa copia. El visitante puede crear otra composición a partir de ella para obtener precios actuales.

Cambiar solo el nombre en pantalla no vuelve a calcular la distribución ni cambia el enlace guardado. El panel distingue el nombre pendiente del de la versión conservada. Editar módulos, medidas, servicios o distribución genera una composición nueva y consulta los modelos y tarifas actuales; la copia compartida anterior permanece intacta.

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

## Incorporar un modelo procedente de SketchUp

El recorrido administrativo es **SketchUp → exportar medidas JSON → Catálogo → Desde un plano → editor parametrizable → borrador**. La [guía de planos y SketchUp](sketchup-import.md#del-borrador-al-planificador-de-cocinas) detalla cómo revisar y publicar ese módulo en la categoría **Cocina**.

El exportador aporta únicamente la envolvente exterior del componente. Una imagen sirve de referencia local. Ninguno de los dos reconstruye tableros, herrajes, mecanizados o familias constructivas a partir de un `.skp`. La estructura compatible, sus límites, acabados y tarifa se revisan en el editor con el motor compartido antes de ofrecer el modelo al cliente.

## Verificación

`tests/kitchen.test.ts` verifica composición, esquina en L, transformación de piezas, colisiones con columnas, reservas, límites y cobro único de servicios. Las pruebas de plantillas, colocación y marcadores verifican las seis propuestas con el catálogo completo, sustitución de espacios, compatibilidad dimensional, proyección y zonas bloqueadas.

`tests/kitchen-layout-view.test.ts` comprueba el orden y las dimensiones del mapa, filas compartidas, reservas de esquina, holguras de 10 y 50 mm, excesos, medidas incompletas, posiciones del servidor y rechazo de resultados antiguos. También comprueba el ancho libre real sobre equipos altos, reservas parcialmente rellenables, unión de bloqueos sin duplicar ancho y límites de intersección vertical. Las pruebas de intervalos, inserción parcial y opciones de añadir comprueban bloqueos superiores, márgenes conservados y compatibilidad sin modificar los vecinos.

`tests/kitchen-api.integration.mjs` se ejecuta exclusivamente en localhost y verifica doble factor, permisos por propietario, privacidad de tarifas, snapshots inmutables y eliminación con versión. Sus productos y cocinas temporales se limpian por identificadores exactos.
