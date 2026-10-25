# Propuestas a partir de un espacio

`POST /api/store` acepta `{ op: "design-assistant", input }`. No guarda diseños ni solicitudes comerciales. El servidor consulta los modelos y acabados publicados y devuelve como máximo tres propuestas válidas para almacenaje, ropero, escritorio o una composición inicial de cocina.

`input` contiene `purpose`, `width`, `height` y `depth` en milímetros; opcionalmente `budget` en soles, `finish`, `install` y `transport`. Las medidas van en pasos de 10 mm: ancho 600–6000, alto 600–4000 y fondo 100–3000. Para cocina el ancho mínimo es 1000 y el alto mínimo 2000. `layout: "l"` requiere la medida explícita de `wallB` (1000–6000). Los servicios se excluyen por defecto y se propagan al motor cuando se seleccionan.

Cada opción incluye medidas y espacio restante, motivos de selección y configuración revisable. Una opción de mueble contiene `product` público, su vista previa y `config`; una opción de cocina contiene `plan`, la cotización pública `result` y `spaceSummary`. Todas pasan por los motores compartidos con melamina de 18 mm. No se acepta geometría externa ni se crean familias nuevas.

En cocina, `spaceSummary.walls` describe por separado las paredes A y B, su longitud real y la reserva de esquina. Cada pared tiene filas `base` (bajos y columnas) y `wall` (alacenas), con `occupied`, `blocked` y `free` en milímetros. Las filas no se suman para anunciar un ancho total: una alacena sobre un bajo ocupa su propia fila. La esquina se descuenta una sola vez al calcular la capacidad de B; por ejemplo, con pared B de 2400 mm, esquina de 650 mm y un bajo de 1000 mm quedan 750 mm disponibles. Un hueco libre sigue disponible; una reserva alta puede bloquear la fila de alacenas. `height` indica altura instalada, incluida la elevación de alacenas; `moduleDepth` es el fondo máximo de los muebles y excluye reservas de equipos. El campo histórico `fit` se conserva para compatibilidad y ordenación y no representa las dos paredes de una cocina en L.

`price` es el importe referencial calculado en servidor o `null` cuando el administrador oculta precios. `withinBudget` solo es verdadero o falso si existen presupuesto e importe público. `budgetState` distingue `within`, `over`, `quote-required` y `not-provided`; la respuesta añade `no-options` cuando ningún candidato encaja. Los costes internos y las tarifas ocultas no se publican ni justifican que una opción esté dentro del presupuesto.

La búsqueda es acotada, no una optimización exhaustiva: hasta 32 modelos de la familia, tres tamaños por mueble y 32 intentos constructivos por tamaño. En cocina se preseleccionan hasta dos bases compatibles y una alacena por composición, se evalúan como máximo seis composiciones y se detiene al obtener tres distintas válidas. Las cocinas son puntos de partida; se deben añadir las reservas de equipos, lavadero e instalaciones y revisar las medidas antes de solicitar la cotización final. Los snapshots guardados permanecen intactos.

Validación:

```powershell
npm run check
node --experimental-strip-types --test tests/design-assistant.test.ts
npm run build
node --experimental-strip-types --test tests/design-assistant-api.integration.mjs
```

Las pruebas API ejecutan el Worker compilado contra D1 en memoria, con catálogo sintético y red bloqueada; comprueban privacidad, validación, paridad del resumen con la cotización habitual y ausencia de escrituras. Las regresiones cubren L asimétricas, filas superpuestas, esquina, ajuste exacto en B, planes lineales y huecos sobre una refrigeradora. La prueba unitaria también registra tiempos con 56 modelos y 82 acabados del catálogo archivado. Una medición aislada en Node 24 obtuvo 23,68 ms en el primer cálculo de una cocina en L y, tras calentamiento, 8,22 ms de media y 13,11 ms de p95 en 50 muestras. Son tiempos transcurridos de esta PC; no miden el consumo de CPU ni garantizan un límite de Cloudflare Workers.
