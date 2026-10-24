# Catálogo y estudio de diseño

La portada usa una composición editorial, navegación móvil con teclado y filtros sobre el catálogo de la API. La identidad de El capo se conserva. Tylko se consultó como referencia de navegación y personalización; no se incorporan sus fotografías, productos ni código.

El catálogo proyecta a SVG la geometría pública que ya entrega el servidor. No calcula piezas, precios ni nuevas familias constructivas. Three y WebGL se cargan al abrir el configurador, las cocinas o el editor, donde sigue funcionando el visor interactivo. Las tarjetas muestran los frentes cerrados.

El estudio permite introducir medidas en centímetros o milímetros; el contrato de API, el motor y los diseños guardados siguen usando milímetros. Los controles deslizantes tienen nombre y valor con unidad para lectores de pantalla. Los acabados de portada abren el configurador con ese acabado cuando sigue activo en la API.

## Medición del build local

Comparación con el build conservado antes de esta mejora:

| Recurso | Anterior | Actual |
| --- | ---: | ---: |
| Entrada JavaScript de portada | 977.296 bytes | 261.497 bytes |
| Entrada comprimida con gzip local | aproximadamente 261.920 bytes | 80.998 bytes |
| Imagen principal | PNG de 2.004.015 bytes | WebP de 77.428 bytes |
| Imagen para pantallas pequeñas | mismo PNG | WebP de 27.168 bytes |

La reducción del JavaScript inicial es del 73 %. Es una medición de transferencia del artefacto compilado, no una puntuación Lighthouse ni una promesa de tiempo de carga. La red, el dispositivo y la respuesta del catálogo siguen influyendo. El módulo del visor continúa siendo grande, pero queda fuera de la carga inicial de portada.

`npm run check:storefront` revisa el grafo de importaciones estáticas del cliente compilado y exige como máximo 350 KB de JavaScript inicial. Requiere `npm run build`; ignora los imports dinámicos de rutas y visor. Si se añade una función pesada, debe mantenerse fuera de ese grafo hasta que se use.

La revisión visual se hizo en escritorio y en un viewport de 390 píxeles con datos aislados. El asistente de [planos y SketchUp](sketchup-import.md) también se probó creando y guardando un borrador por la API de prueba, sin usar datos o accesos reales.
