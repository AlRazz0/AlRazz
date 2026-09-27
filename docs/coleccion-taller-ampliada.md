# Ampliación de la colección del taller

[coleccion-taller-ampliada.json](../catalog/coleccion-taller-ampliada.json) añade 12 propuestas de almacenaje con puertas a los 24 modelos anteriores. Incluye despensas, archivadores, alacenas, aparadores, una zapatera cerrada y un velador mixto. Todos usan el motor `cabinet` existente y tableros de melamina de 18 mm.

El paquete contiene datos editables, no modificaciones del motor. Cada registro empieza con `active: false`, versión 1, un ID nuevo y un orden del 25 al 36. Se importa como borrador y se publica desde el panel cuando el taller haya revisado sus parámetros.

## Modelos y distribución

Las dimensiones siguientes son **ancho × alto × fondo, en mm**. Corresponden a las propuestas configurables; no certifican las medidas exteriores de los muebles originales.

| Modelo e identificador | Medidas propuestas | Distribución inicial |
| --- | --- | --- |
| Despensa Profunda 124 · `despensa-profunda-124` | 1240 × 1360 × 600 | Dos puertas completas, dos columnas y tres repisas por columna |
| Archivo Triple 178 · `archivo-triple-178` | 1780 × 1250 × 400 | Tres puertas completas, tres columnas y dos repisas por columna |
| Despensa Torre 29 · `despensa-torre-29` | 290 × 2250 × 350 | Una puerta completa y siete repisas interiores |
| Despensa Mixta 124 · `despensa-mixta-124` | 1240 × 1830 × 520 | Dos puertas inferiores y tres repisas por columna en la zona abierta |
| Aparador Dormitorio 120 · `aparador-dormitorio-120` | 1200 × 780 × 600 | Dos puertas completas y dos repisas por columna |
| Alacena Panorámica 192 · `alacena-panoramica-192` | 1920 × 880 × 330 | Cuatro puertas completas y una repisa por columna |
| Aparador Comedor 239 · `aparador-comedor-239` | 2390 × 1050 × 550 | Cuatro puertas completas y dos repisas por columna |
| Zapatera Cerrada 148 · `zapatera-cerrada-148` | 1480 × 1830 × 300 | Tres puertas completas y cinco repisas por columna |
| Archivador Dúo 124 · `archivador-duo-124` | 1240 × 1040 × 450 | Dos puertas completas y una repisa por columna |
| Gabinete Oficina 195 · `gabinete-oficina-195` | 1950 × 500 × 500 | Cuatro compartimentos con puertas, sin repisas interiores |
| Alacena Compacta 55 · `alacena-compacta-55` | 550 × 640 × 300 | Una puerta completa y dos repisas interiores |
| Velador Mixto 45 · `velador-mixto-45` | 450 × 400 × 400 | Una puerta inferior y un nicho superior abierto |

Las doce combinaciones de columnas, repisas y puertas son diferentes entre sí, incluso al ignorar dimensiones y acabados. La zapatera cerrada añade una tercera columna, puertas y trasera respecto a la alternativa abierta anterior. Los modelos mixtos reservan un espacio cerrado abajo y dejan acceso directo a las repisas superiores.

## Adaptaciones a partir de las referencias

Se revisaron dibujos y listas de corte de muebles facilitados por el taller. Los originales, imágenes, nombres, contactos, rutas locales y cotizaciones permanecen privados. Las propuestas públicas usan nombres genéricos y distinguen las cotas observadas de las inferencias y cambios de diseño.

- **Despensa Profunda 124:** se toma el cuerpo inferior de un conjunto apilado, rotulado con 1362 de alto, 1240 de ancho y fondo general de 600. La lista de corte incluye piezas horizontales de 1250, por lo que hay una diferencia de anchura entre las fuentes. Se propone 1240 × 1360 × 600, se elimina el cuerpo superior y se añaden puertas y cuatro niveles uniformes.
- **Archivo Triple 178:** parte de un cuerpo superior acotado con altura de 1254, fondo de 400, ancho exterior de 1780 y travesaño de 1744. Se independiza de la base original, se redondea el alto a 1250 y se conservan tres columnas con tres niveles, ahora cerradas por puertas.
- **Despensa Torre 29:** la columna de referencia mide 286 × 2247 × 352 y tiene una zona superior más estrecha. Se propone 290 × 2250 × 350, se elimina el escalón y se sustituyen los numerosos nichos de alturas distintas por ocho niveles y una puerta completa. No se simulan puertas apiladas.
- **Despensa Mixta 124:** la fuente muestra tapa de 1234, base de 1233, altura de 1829 y fondo de 520, con anchos interiores desiguales y una zona de cajas. Se propone 1240 × 1830 × 520, dos columnas iguales y puertas inferiores. La separación entre espacio abierto y cerrado sigue la proporción del motor, no una cota histórica de ese conjunto.
- **Aparador Dormitorio 120:** se deriva únicamente de la zona baja de un conjunto de 1200 de ancho y 600 de fondo. Un vano de 746 más tapa y base de 18 sugiere 782 de alto; se propone 780. Los cajones originales se sustituyen por puertas y repisas. Se excluye toda la parte superior de colgado.
- **Alacena Panorámica 192:** la composición de referencia muestra tramos de 850 y 1065, alturas de 325 y 559 y fondo de 330. Las sumas 1915 y 884 no son cotas generales certificadas porque puede haber tableros compartidos. Se propone una nueva envolvente rectangular de 1920 × 880 × 330, con cuatro puertas y dos niveles interiores, sin escalones ni huecos especiales.
- **Aparador Comedor 239:** la referencia incluye un bastidor de 2390 × 548 y una carcasa de 1030 de alto y 550 de fondo, con vanos de distintas anchuras y cajas. La altura propuesta de 1050 procede de sumar una tapa de 18 a 1030 y redondear. Se eliminan rebajes, bastidores y cajas; cuatro columnas iguales mantienen un ancho admisible para las puertas.
- **Zapatera Cerrada 148:** se reutiliza la referencia de almacenaje de 1475 × 1829 × 300, pero se diseña una alternativa de uso cerrada. Se redondea a 1480 × 1830 × 300, se pasa de dos a tres columnas y se incorporan trasera y puertas. Las puertas son parte de esta adaptación, no una característica confirmada de aquella vista.
- **Archivador Dúo 124:** se toma otro cuerpo superior, de 1036 de alto y 450 de fondo, con ancho general de 1240, travesaño de 1204 y dos vanos de 593. Se propone altura de 1040, se añade una puerta por columna y se conserva una repisa. Se excluye el cuerpo inferior del conjunto.
- **Gabinete Oficina 195:** la referencia general tiene 1950 de ancho, fondo de 500 y una franja superior de 466, dividida en dos vanos grandes. Se propone una carcasa independiente de 500 de alto, aproximadamente 466 más tapa y base, redondeado. Cuatro compartimentos sustituyen a los dos originales para respetar el ancho de las puertas. Se omiten las zonas inferiores y sus cajones.
- **Alacena Compacta 55:** se aísla el extremo de una composición de cocina que muestra un vano de 509 y altura de 635. Los cortes de 509 × 300 y 635 × 300 respaldan el fondo de 300. El ancho propuesto de 550 procede de 509 más dos laterales de 18, redondeado; el alto pasa a 640. Una puerta cierra tres niveles interiores en lugar de los dos originales.
- **Velador Mixto 45:** una variante de velador tiene piezas de 450 × 400, laterales de 364 × 400 y frentes de cajón. Se infiere una envolvente de 450 × 400 × 400 al sumar los horizontales de 18 a los laterales. El modelo propuesto sustituye cajones por una puerta inferior y un nicho abierto. La miniatura relacionada solo orienta sobre la familia; las medidas de esta variante proceden de la lista de corte.

Estas adaptaciones no reproducen cajones, roperos completos, espejos, barras, esquinas ni cocinas instaladas. Todos los despieces se recalculan con la geometría actual de 18 mm, incluida la trasera. Las uniones, cargas, herrajes y fijaciones se revisan antes de fabricar; las puertas altas y los muebles estrechos requieren esa revisión de montaje. Despensa Torre 29 requiere revisar estabilidad y anclaje por su altura y estrechez. No se incluyen sistemas de apilado o suspensión mural calculados.

## Parámetros que se editan en el panel

El administrador puede cambiar nombre, categoría, descripción, acabado, límites dimensionales, medidas iniciales, divisiones, repisas, puertas, precio base, plazo y estado de publicación. El tipo constructivo de estos registros es `cabinet`; no es necesario crear o alterar componentes de código para añadirlos, ocultarlos o ajustar sus parámetros.

Los acabados iniciales pertenecen al catálogo Hispano existente: Blanco 100, Gris Suave, Almendra 02, Roble Catania, Chiavenna y Gris Grafito 02. El paquete no activa acabados ni modifica su disponibilidad; esos IDs deben estar activos en el catálogo de destino.

Se mantiene `basePrice: 140` para los modelos de almacenaje y `basePrice: 180` para la zapatera. Todos usan `weeks: 3`. Son valores referenciales editables, no cotizaciones históricas, precios finales ni plazos confirmados. El precio mostrado se calcula con las tarifas vigentes del taller.

Los límites se eligieron para conservar una distribución útil. Cada configuración sigue las reglas del motor: pasos de 10 mm, vanos admisibles para puertas y separación mínima entre repisas. Cambiar simultáneamente ancho, columnas y puertas puede requerir ajustar la distribución. En las variantes mixtas, la altura de la puerta inferior se calcula proporcionalmente; no se edita como una cota independiente.

## Importación y conservación de los datos

1. Importar [coleccion-taller-ampliada.json](../catalog/coleccion-taller-ampliada.json) desde el panel administrativo.
2. Revisar los doce borradores, sus parámetros comerciales, acabados activos y distribución.
3. Activar los modelos elegidos. Para cambios posteriores, editar esos registros desde el panel en lugar de reimportar sus IDs.

El lote no reemplaza las colecciones anteriores. La importación transaccional rechaza IDs duplicados y las ediciones conservan el control de versión. Los diseños guardados mantienen sus snapshots históricos, aunque se cambien o desactiven estos productos.

`tests/workshop-expansion.test.ts` comprueba que los doce IDs y formas no colisionan con los modelos anteriores, las piezas sean de 18 mm y permanezcan dentro de la envolvente, el CSV conserve los parámetros editables y los extremos dimensionales permitan una distribución válida.
