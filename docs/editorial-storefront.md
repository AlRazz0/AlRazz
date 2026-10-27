# Recorrido editorial de la tienda

La entrada presenta la marca y tres ambientes de inspiración. El catálogo queda en `/coleccion`; cada modelo tiene una ficha en `/mueble?producto=ID`. Las medidas, distribución y opciones se abren al elegir **Personalizar este mueble**, en el configurador existente.

## Datos y representación

- La selección, las categorías, los materiales y los precios de referencia provienen de la API pública. No hay un catálogo paralelo en los componentes.
- La presentación de cada producto usa su geometría pública de referencia, frentes, herrajes y acabados del catálogo. Los retratos y el recorrido interactivo comparten la escena física de `src/showroom-scene.ts` y el modelo del visor; no existe otro motor de medidas, despiece o precios.
- La ambientación arquitectónica es original y se genera con geometría ligera, separada del grupo del mueble. Sus láminas, cerámica y acentos no entran en sus medidas, piezas o cotización. Los módulos de cocina reciben sólo un tratamiento de pared: la ficha individual no inventa una altura de instalación.
- Los ambientes, la luz y las imágenes renderizadas son ilustrativos. No representan una obra entregada, una fotografía del producto fabricado ni una validación de fabricación.
- Las imágenes editoriales de sala, dormitorio y cocina son inspiración. Su procedencia, prompts y variantes están en [editorial-assets.md](editorial-assets.md).
- Las fichas de modelos no publicados o inexistentes muestran indisponibilidad. Un enlace explícito inválido tampoco selecciona silenciosamente otro producto en el configurador.
- La elección de un acabado activo se conserva en los enlaces entre inicio, colección, ficha y configurador mediante `acabado`. Las tarjetas y la galería mantienen el acabado de referencia del modelo y lo indican; elegir una muestra no afirma que ya se haya aplicado a ese render. La cotización se calcula en servidor después de personalizar.
- El portafolio sigue mostrando únicamente trabajos publicados por el administrador. Esta entrega no carga datos, modelos ni obras en producción.

## Presentación progresiva y carga

El inicio y su hero forman parte de la entrada inicial. El hero tiene dimensiones reservadas, prioridad alta y variantes WebP de 800 y 1600 píxeles. Las imágenes inferiores usan carga diferida. La selección de producto y el portafolio del inicio se montan al aproximarse a la zona visible; el ancla estática `#trabajos` también permite la entrada directa por enlace.

`ProductRoom` muestra primero la geometría SVG real con un fondo ilustrativo y reserva el espacio de la presentación. Cerca de la zona visible importa `furniture-portraits` de forma dinámica: genera una imagen del modelo con la escena física compartida y sustituye el SVG cuando está lista. Las tarjetas comparten una cola y un único contexto WebGL temporal para esos retratos, con una caché de imágenes acotada; no mantienen un visor interactivo por tarjeta. Al quedar sin trabajo, el generador libera el renderer. Si WebGL, la importación o la generación fallan, la vista SVG sigue disponible.

La colección presenta inicialmente 12 modelos y permite añadir 12 por acción, con el recuento visible. El código de Three y de la escena física queda fuera del grafo estático de la portada, pero los retratos sí pueden iniciar WebGL después al acercarse a los productos: no se promete una colección completamente libre de WebGL. El configurador, el panel y las rutas secundarias conservan carga diferida.

En la ficha, **En ambiente** muestra el retrato de referencia. **Explorar en 3D** carga por primera vez `ImmersiveFurniture`: permite recorrer perspectivas, acercar, restablecer y abrir las puertas disponibles, sin editar ni guardar el diseño. **Ampliar** abre un diálogo que conserva el modo elegido. Mientras está ampliado, la ficha deja de montar su visor interactivo inferior para evitar dos copias simultáneas. El modo 3D ofrece un mensaje de indisponibilidad cuando el navegador no puede crearlo.

El visor se dibuja ante cambios o durante una transición; no mantiene un bucle de animación en reposo. Girar o acercar la cámara reutiliza el mapa de sombras de 2048 px. La apertura de puertas y la llegada de materiales lo invalidan para conservar sombras acordes a la escena. Los retratos que superan el plazo de carga de texturas conservan el SVG y reintentan una vez cuando terminan; no guardan una imagen incompleta en caché.

## Biblioteca, teclado y sonido

**Explorar todos los acabados** importa la biblioteca sólo al abrirla. Muestra todos los acabados activos de la API, muestras locales, búsqueda por sus datos reales y filtros de marca y tipo de tablero disponibles. La elección del inicio aparece primero incluso en catálogos pequeños. La ficha del acabado conserva nombre, marca, código y descripción cuando existen, recuerda los 18 mm del mueble y permite continuar a `/coleccion?acabado=ID`. No muestra tarifas ni disponibilidad inventadas; una muestra digital no sustituye la confirmación física del acabado.

La biblioteca y la galería ampliada usan el diálogo modal existente, con título, cierre por Escape, foco contenido y bloqueo del desplazamiento exterior. La biblioteca devuelve el foco a su botón de apertura y vuelve a la lista al cerrar para que el buscador esté visible al reabrir en móvil. En pantallas pequeñas, sus dos vistas permiten alternar entre muestras y detalle sin recorrer toda la lista.

La navegación incluye salto al contenido, foco visible, menú móvil con cierre por Escape y controles con nombres y estados accesibles. Los filtros de colección admiten búsqueda, categorías normalizadas y enlaces directos, además de estados vacío, carga y reintento. La reducción de movimiento elimina las transiciones decorativas y hace inmediatos los cambios guiados de cámara y puertas.

El sonido de interfaz es opcional y comienza desactivado si no existe una preferencia previa. El control **Sonido** permite activarlo y silenciarlo; la preferencia se guarda localmente cuando el navegador lo permite. No hay música, sonido al pasar el cursor ni reproducción por cargar una página: los tonos breves responden a gestos reales en controles marcados y se omiten en el panel, controles deshabilitados, selecciones ya activas y arrastre de deslizadores. Ocultar o abandonar la página silencia las voces pendientes. La falta de soporte de audio no impide navegar.

## Verificación

El presupuesto `npm run check:storefront` recorre las importaciones estáticas del cliente construido y mide todo el JavaScript inicial, incluido Home. Debe ejecutarse después de un build actualizado; una separación dinámica por sí sola no demuestra fluidez ni velocidad de renderizado. Las mediciones de conversión reconocen colección y ficha sin registrar sus parámetros.

La comprobación local debe usar catálogo sintético y una D1 efímera, sin cuentas ni clientes reales. Debe cubrir filtros, paginación, enlaces de modelos ausentes u ocultos, acabado activo/inactivo, SVG de respaldo, retratos, selección y ampliación 3D, biblioteca por teclado y reapertura móvil, Escape y retorno de foco, movimiento reducido y audio desactivado/activado. Un viewport CSS de 390 píxeles no equivale a medir un teléfono físico. Esta guía describe el contrato y los casos que revisar; no certifica que se hayan ejecutado en cada cambio.

Evidencia del cierre local del 26/10/2026: se registraron 385 pruebas unitarias aprobadas. La captura de QA `.openai/premium-material-library.png`, revisada localmente, muestra la búsqueda de un acabado, su selección, la muestra ampliada y el enlace para continuar a la colección. La captura verifica esa composición de escritorio; no acredita por sí sola el teclado, la reapertura móvil ni el rendimiento en un dispositivo físico. Estos resultados corresponden al entorno local y no implican publicación ni despliegue.

Esta entrega conserva las reglas del motor de melamina de 18 mm, los snapshots y la validación de cotizaciones en servidor. El despiece y las verificaciones de fabricación siguen siendo preliminares.

La revisión manual de esta entrega también comprobó, con datos sintéticos: apertura opuesta de puertas; conservación de la apertura al ampliar y cerrar; un único canvas en el diálogo de escritorio; cierre por Escape y retorno del foco a Ampliar. En un viewport CSS de 390 px se revisaron el recorrido, su diálogo y los controles. En la biblioteca móvil se buscó Catania, se eligió su muestra, se abrió el detalle, se cerró por Escape y se reabrió con el buscador visible y enfocado; el enlace conservó el ID del acabado. Se inspeccionaron los retratos de librero, aparador y escritorio, el asistente móvil y el estado vacío de Mis diseños. El control de sonido se activó y silenció, con sus dos instancias sincronizadas; no se atribuye a esta prueba una evaluación acústica subjetiva ni rendimiento de un teléfono físico.
