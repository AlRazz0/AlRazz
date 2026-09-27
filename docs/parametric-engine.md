# Motor paramétrico AlRazz: familia de almacenaje

El piloto permite crear modelos de estanterías, libreros, aparadores y muebles de TV como variantes de una misma construcción. Cambiar el catálogo, los colores, precios y límites se hace mediante datos administrativos. Una familia constructiva diferente requiere una plantilla técnica nueva. No admite cajones, puertas corredizas, cocinas, subidas arbitrarias de SketchUp ni fórmulas ejecutables.

## Contrato y permanencias

- `THICKNESS = 18` es una constante del motor. Todos los paneles, incluida la trasera, tienen 18 mm. Los esquemas rechazan campos adicionales como `thickness` o `drawers`.
- `buildFurniture(product, configuration, settings)` valida y devuelve `Result`. Su lista de paneles es la fuente compartida para geometría 3D, metraje de material, tapacanto, herrajes y CSV.
- Cada panel es una instancia de cantidad 1, con identificador único, medidas enteras en milímetros, orientación, material, cuatro bordes, tamaño y posición. No se agrupan piezas con diferentes orientaciones o cantos.
- `validateProduct(product, settings?)` valida la plantilla inicial. Cuando se suministran ajustes, comprueba además que sus materiales estén activos. `buildFurniture` siempre verifica los materiales.
- `settingsSchema.parse(storedSettings)` completa ajustes antiguos con los colores iniciales cuando falta `materials`. Los ajustes administrativos nuevos contienen `materials: [{ id, name, color, price, active }]`. `same` está reservado para el interior; los códigos de materiales son estables y únicos.
- `finish` contiene un código de material; `interior` contiene otro código o `same`. No usar la lista estática `finishes` como catálogo vivo: solo constituye la semilla inicial. La interfaz debe utilizar los materiales activos de los ajustes guardados.
- El precio de cada material es una tarifa referencial por m². `materialRate / 100` es el factor general aplicado a todas las tarifas (100 conserva la tarifa del material).

## Construcción y dimensiones

Convención: X crece hacia la derecha, Y hacia arriba, Z hacia delante. El volumen exterior es `[-W/2,W/2] × [0,H] × [-D/2,D/2]`. Las puertas son interiores y quedan dentro de ese volumen.

Con `t = 18`, `W = ancho`, `H = alto`, `D = fondo`, `M = módulos`:

| Pieza               |     Cantidad | Largo/alto | Ancho de la pieza |
| ------------------- | -----------: | ---------: | ----------------: |
| Laterales           |            2 |          H |                 D |
| Techo y piso        |            2 |     W − 2t |                 D |
| Trasera interior    |            1 |     H − 2t |            W − 2t |
| Divisiones          |        M − 1 |     H − 2t |             D − t |
| Repisa de un módulo | N por módulo |      B − 2 |            D − 40 |

`B` es la luz de cada módulo. La suma libre es `W − (M + 1)t`. Se divide en milímetros enteros; los primeros módulos reciben el resto. Las luces difieren como máximo 1 mm y, al sumar todos los módulos y tableros, se obtiene exactamente W. Así el CSV no redondea dimensiones de corte distintas del modelo.

Las repisas tienen 1 mm de holgura lateral por lado, 2 mm respecto a la trasera y un retiro frontal de 20 mm: espesor de puerta de 18 mm más 2 mm de holgura. La repisa queda centrada en Z. Estas constantes pertenecen a la plantilla constructiva, no al formulario del cliente.

En la distribución `lower`, la zona inferior es `round((H − 36) × 0.38)` mm. Encima se añade un separador de 18 mm por módulo. Las repisas elegidas se distribuyen solo en la zona superior. En `full` y `none`, ocupan la altura interior completa.

Para una zona de altura U con N repisas, la luz vertical es `(U − N·18) / (N + 1)`. Las posiciones incorporan el espesor de cada repisa. La cantidad de repisas del configurador significa **repisas por módulo**, sin contar los separadores inferiores.

Una puerta tiene 2 mm de separación en cada borde: ancho `B − 4`, alto `zona − 4`. Hay una puerta por módulo. Los herrajes son cantidades referenciales: dos bisagras por puerta de hasta 1500 mm; tres por puerta más alta. El cálculo usa la altura de la puerta, no la altura total del mueble. La corrección técnica de herrajes según peso, marca y uso sigue pendiente de taller.

## Orientación física del tapacanto

Cada panel conserva `lengthAxis` y `widthAxis`. En su rectángulo de fabricación:

- `top` es el extremo positivo del eje largo/alto; `bottom`, el negativo. Ambos miden el ancho de la pieza.
- `right` es el extremo positivo del eje ancho; `left`, el negativo. Ambos miden el largo/alto de la pieza.
- En laterales, divisiones, techo, piso y repisas, el eje ancho es Z: el frente +Z corresponde a `right`. Solo ese borde lleva canto grueso.
- En puertas: el largo es Y y el ancho X; los cuatro bordes llevan canto grueso.
- La trasera queda encajada y no recibe tapacanto en esta plantilla.

Por ello `top` no significa necesariamente el techo del mueble: los nombres identifican el rectángulo de cada pieza. Esta relación evita cobrar y exportar el canto equivocado. La veta es preliminar y sigue el eje largo de la pieza: vertical cuando ese eje es Y, horizontal en techo, piso y repisas.

## Validaciones

Las medidas son finitas, enteras, de 100 a 3000 mm y múltiplos de 10, además de cumplir los límites particulares del modelo. Módulos: 1–6. Repisas: 0–7 por módulo. Cada módulo tiene entre 180 y 750 mm libres; con puertas, como máximo 600 mm. Las puertas necesitan 120 mm de alto y las repisas 100 mm de luz vertical. Los límites dimensionales por sí solos no garantizan todas las combinaciones: una configuración rechazada debe explicar el ajuste necesario, sin cambiar silenciosamente las elecciones del cliente.

Los ajustes exigen materiales activos, códigos únicos, colores hexadecimales de seis dígitos, importes finitos no negativos y margen inferior a 1. El servidor debe repetir estas validaciones al guardar, cotizar o publicar.

## Precio y exportación

Área por material: `Σ(largo × ancho) / 1 000 000`. Tapacanto: suma de la longitud física de cada borde que lo lleva, dividida entre 1000. Mano de obra base, materiales, cantos y lote de herrajes por puerta forman el costo. Precio: `costo / (1 − margen) + instalación + transporte`, redondeado hacia arriba a S/ 10. Instalación y transporte solo se incluyen cuando se seleccionan. El precio y la capacidad de producción son referenciales.

`cutCSV(result)` mantiene los nombres de los materiales utilizados, incluidas altas administrativas. Emite BOM UTF-8, punto y coma, campos entre comillas y comillas interiores escapadas. Su encabezado siempre declara **Despiece preliminar — no autorizado para producción**.

Las medidas exportadas son las dimensiones nominales de los paneles del modelo. Este piloto no calcula descuentos por espesor del canto, perforaciones de bisagra, mecanizados, fijaciones estructurales, resistencia/carga, aprovechamiento real de planchas ni optimización de corte. El taller debe definirlos y validar la plantilla antes de crear un flujo de aprobación de producción. El exportador no afirma compatibilidad validada con una versión concreta de CutMaster.

## Catálogo CSV y Google Sheets

`catalogCSVTemplate()` genera una fila de ejemplo con todos los encabezados. `exportCatalogCSV(products, ';' | ',')` exporta el catálogo. `importCatalogCSV(text, settings?)` devuelve `{ products, errors: [{ row, message }] }`: es una vista previa, no realiza ninguna escritura. Todos los productos importados quedan en borrador aunque el CSV diga Activo. El llamador debe impedir una importación parcial involuntaria cuando hay errores y confirmar la revisión antes de guardar.

Código y Nombre son obligatorios; las demás columnas pueden omitirse o quedar vacías. Categoría determina los valores iniciales de la familia; si falta, usa Estanterías. Se aceptan los encabezados de la plantilla y los nombres técnicos equivalentes. Se rechazan columnas desconocidas, repetidas y códigos repetidos. `Color exterior` y `Color interior` guardan códigos estables, no nombres visuales. Para el interior `same` conserva el exterior.

Puertas admite `Sin puertas`, `Inferiores`, `Completas` o `none`, `lower`, `full`. Instalación y transporte admiten Sí/No. Los números no deben incluir símbolos monetarios ni separadores de miles. Se admite coma decimal si el campo está correctamente delimitado. El estado siempre se convierte a borrador; la versión es metadato del archivo y el servidor resuelve la versión efectiva durante el guardado.

El lector detecta coma/punto y coma, respeta texto multilínea y comillas dobles escapadas, acepta LF/CRLF y conserva los números de línea físicos para errores. Límite: 1000 productos y 2 millones de caracteres. Una comilla sin cerrar invalida el archivo completo porque ya no se pueden identificar filas con seguridad.

Para Google Sheets: abrir la plantilla, editar los datos, descargar CSV y revisar/importar en AlRazz. Es un conector por archivo; no hay sincronización OAuth, conexión de cuenta ni actualizaciones automáticas. Los exportadores neutralizan textos que podrían convertirse en fórmulas al abrirlos en una hoja de cálculo, añadiendo un apóstrofo antes de `=`, `+`, `-`, `@` o prefijos de control. Ese apóstrofo puede conservarse al volver a importar textos especialmente escapados.

## Verificación

Ejecutar desde el checkout:

```powershell
node --experimental-strip-types --test tests/furniture.test.ts
```

Las pruebas cubren configuraciones límite, ausencia de intersecciones entre paneles, volumen exterior, piezas enteras y espesor constante, sumas exactas de módulos, holguras, cantos físicos, precios, cantidades de herrajes, materiales administrables y migración de ajustes. También verifican CSV con comas, punto y coma, comillas, saltos de línea, filas inválidas y neutralización de fórmulas. Los ensayos geométricos no sustituyen una validación física de carpintería.
