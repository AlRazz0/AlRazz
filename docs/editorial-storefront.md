# Recorrido editorial de la tienda

La entrada presenta la marca y tres ambientes de inspiración. El catálogo queda en `/coleccion`; cada modelo tiene una ficha en `/mueble?producto=ID`. Las medidas, distribución y opciones se abren al elegir **Personalizar este mueble**, en el configurador existente.

## Datos y representación

- La selección, las categorías, los materiales y los precios de referencia provienen de la API pública. No hay un catálogo paralelo en los componentes.
- La escena de cada producto usa su geometría de referencia y materiales reales del motor. El fondo es una imagen ilustrativa original; no representa una obra entregada ni una validación de fabricación.
- Las imágenes editoriales de sala, dormitorio y cocina son inspiración. Su procedencia, prompts y variantes están en [editorial-assets.md](editorial-assets.md).
- Las fichas de modelos no publicados o inexistentes muestran indisponibilidad. Un enlace explícito inválido tampoco selecciona silenciosamente otro producto en el configurador.
- La elección de un acabado activo se conserva entre inicio, colección, ficha y configurador. La escena de referencia se identifica como tal y la cotización se calcula en servidor después de personalizar.
- El portafolio sigue mostrando únicamente trabajos publicados por el administrador. Esta entrega no carga datos, modelos ni obras en producción.

## Carga y accesibilidad

El hero tiene dimensiones reservadas, prioridad alta y variantes WebP de 800 y 1600 píxeles. Las imágenes inferiores se cargan según su proximidad. El catálogo presenta 12 tarjetas por bloque; usa SVG del mismo motor, sin iniciar WebGL. Las texturas se activan cerca de la zona visible. El configurador 3D, el panel y las rutas secundarias conservan carga diferida.

La navegación incluye enlace para saltar al contenido, foco visible, menú móvil con cierre por Escape, controles con nombres accesibles y reducción de movimiento. Los filtros admiten búsqueda y categorías normalizadas, enlaces directos, estado vacío y reintento. Los acabados son botones con estado seleccionado accesible.

El presupuesto `npm run check:storefront` mide todo el JavaScript necesario para el inicio, incluido Home. No se usa una división artificial de la portada para ocultar su peso inicial. Las mediciones de conversión reconocen las rutas de colección y ficha sin incluir sus parámetros.

## Verificación local

La revisión visual usa 30 modelos sintéticos y una D1 efímera, sin cuentas ni clientes reales. Cubre entrada por ambientes, filtros, paginación 12/24/30, ficha, selección de acabado y apertura explícita del configurador. La revisión responsive de 390 píxeles se realiza en un viewport CSS local; no equivale a una medición de rendimiento de un teléfono físico.

Esta entrega conserva las reglas del motor de melamina de 18 mm, los snapshots y la validación de cotizaciones en servidor. El despiece y las verificaciones de fabricación siguen siendo preliminares.
