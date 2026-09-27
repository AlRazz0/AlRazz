# Colección del taller

[coleccion-taller.json](../catalog/coleccion-taller.json) incorpora 16 propuestas de muebles en melamina de 18 mm. Amplía el catálogo con mesas de estudio, escritorios con pedestal, un velador, zapateras, estantes abiertos y auxiliares. Es un paquete opcional de datos: no sustituye modelos existentes ni cambia los diseños guardados.

Todos los registros tienen `active: false`, versión 1, identificadores nuevos y órdenes del 9 al 24. La importación los deja como borradores para revisar acabados, costos, plazos y configuración antes de activarlos desde el panel.

## Modelos propuestos

Las medidas son **ancho × alto × fondo, en mm**. Son las dimensiones de estas adaptaciones configurables, no una transcripción de despieces originales.

| Modelo | Medidas propuestas | Construcción | Distribución inicial |
| --- | --- | --- | --- |
| Mesa de Estudio 120 · `mesa-estudio-120` | 1200 × 750 × 600 | `desk` | Superficie abierta, laterales y faldón posterior |
| Escritorio Pedestal 120 · `escritorio-pedestal-120` | 1200 × 750 × 600 | `desk-storage` | Pedestal derecho de 450, puerta y una repisa |
| Escritorio Lateral 150 · `escritorio-lateral-150` | 1500 × 800 × 600 | `desk-storage` | Pedestal izquierdo de 500 y dos repisas abiertas |
| Escritorio Estudio 150 · `escritorio-estudio-150` | 1500 × 770 × 600 | `desk-storage` | Pedestal derecho de 500, puerta y dos repisas |
| Velador Puerta 50 · `velador-puerta-50` | 500 × 500 × 400 | `cabinet` | Puerta completa y una repisa |
| Zapatera Baja 78 · `zapatera-baja-78` | 780 × 760 × 300 | `open-shelf` | Una columna y cuatro niveles |
| Zapatera Vertical 148 · `zapatera-vertical-148` | 1480 × 1830 × 300 | `open-shelf` | Dos columnas y seis niveles |
| Estante Cuadrícula 141 · `estante-cuadricula-141` | 1410 × 1810 × 330 | `open-shelf` | Cuatro columnas y cinco niveles |
| Columna Abierta 35 · `columna-abierta-35` | 350 × 1860 × 300 | `open-shelf` | Una columna y cinco niveles |
| Consola Abierta 236 · `consola-abierta-236` | 2360 × 740 × 250 | `open-shelf` | Cuatro columnas y dos niveles |
| Biblioteca Compacta 90 · `biblioteca-compacta-90` | 900 × 1100 × 300 | `open-shelf` | Dos columnas y cuatro niveles |
| Auxiliar de Cocina 60 · `auxiliar-cocina-60` | 600 × 830 × 560 | `cabinet` | Puerta, repisa y tapa completa |
| Módulo de Cocina 85 · `modulo-cocina-85` | 850 × 330 × 330 | `cabinet` | Dos compartimentos con puertas |
| Aparador Abierto 143 · `aparador-abierto-143` | 1430 × 700 × 480 | `cabinet` | Dos columnas y dos niveles |
| Recibidor Abierto 205 · `recibidor-abierto-205` | 2050 × 840 × 300 | `cabinet` | Tres columnas y dos niveles |
| Repisa Doble 106 · `repisa-doble-106` | 1060 × 200 × 340 | `open-shelf` | Dos compartimentos sin repisas interiores |

`open-shelf` elimina la trasera y usa frentes abiertos. `cabinet` conserva la carcasa y trasera de 18 mm del motor. Los escritorios dejan el vano de piernas libre; las repisas y puertas de `desk-storage` pertenecen al pedestal. La propuesta no incorpora cajones funcionales, retornos en L, colgadores de ropa, espejos, iluminación, canalizaciones, fregaderos ni conjuntos completos de cocina.

## Relación con los planos del taller

La selección procede de dibujos de muebles y listas de corte locales. Los originales, imágenes, nombres de clientes, contactos y rutas de trabajo permanecen fuera del repositorio público. La revisión conserva por separado cotas literales, inferencias de montaje, contradicciones y medidas propuestas.

- **Mesa y escritorio de 120:** la referencia tiene tapa de 1200 × 600 y laterales de 732 mm. La altura de 750 se infiere al añadir 18 mm de tapa. La mesa abierta elimina el almacenamiento; la versión con pedestal cambia cajones por puerta y repisa. El pedestal exterior de 450 es una decisión de esta adaptación.
- **Escritorio Lateral 150:** la referencia incluye tapa de 1700 × 600, laterales de 782 y un retorno. Se propone altura de 800, se reduce el ancho a 1500 y se conserva un solo pedestal de 500, con repisas. Se elimina el retorno.
- **Escritorio Estudio 150:** una lista de corte confirma tapa de 2000 × 600 y laterales de 752. El dibujo presenta varias cotas multiplicadas por diez; no se usan directamente. Se propone 1500 de ancho y 770 de alto, con un pedestal cerrado que sustituye la cajonera.
- **Velador Puerta 50:** las piezas de 500 × 400 y laterales de 464 × 400 sustentan una envolvente inferida de 500 × 500 × 400 con tableros de 18. Se reemplaza el cajón por una puerta completa; el fondo y las holguras se recalculan con el motor.
- **Zapatera Baja 78:** la miniatura permite leer 744 de ancho y 760 de alto, pero no distingue inequívocamente ancho interior y exterior. Se proponen 780 exteriores para un vano de 744; el fondo de 300 es una propuesta, no una cota comprobada. Los niveles pasan a ser uniformes. La adecuación depende de la altura del calzado que se quiera guardar.
- **Zapatera Vertical 148:** la referencia de almacenaje tiene cotas de 1475 × 1829 × 300. Se redondea a 1480 × 1830 × 300 y se sustituyen los nichos desiguales por dos columnas con seis niveles abiertos.
- **Estante Cuadrícula 141:** el dibujo rotula 1374 de ancho, 1808 de alto, fondo de 330 y vanos de 330; el corte usa fondo de 280. Se propone ancho de 1410 para cuatro vanos de 330 y cinco tableros de 18, altura de 1810 y fondo de 330. Esa elección resuelve la propuesta de catálogo, no acredita que las fuentes coincidan.
- **Columna Abierta 35:** ancho de 350 y fondo de 300 están anotados. Los laterales de 1828 y horizontales de 350 sustentan una altura inferida de 1864 al sumar tapa y base; se propone 1860. Se eliminan los canales de fondo y de iluminación, y se igualan las repisas.
- **Consola Abierta 236:** el dibujo muestra 2364 en la horizontal superior, 740 de alto y 250 de fondo, con tres vanos de 776. Se propone ancho de 2360 y se pasa a cuatro columnas para respetar la luz máxima de 750 del motor. La cota superior original puede corresponder a una pieza, no a la envolvente completa.
- **Biblioteca Compacta 90:** se conservan altura de 1100 y fondo de 300. El ancho propuesto de 900 resulta de dos vanos de 423 más tres tableros de 18; no se inventa una lectura de la cota superior parcialmente tapada. Los nichos asimétricos se sustituyen por una cuadrícula uniforme.
- **Auxiliar de Cocina 60:** parte de una carcasa anotada de 600 × 812 × 560. Se propone alto de 830 con tapa completa, puerta y repisa, sin zócalo externo ni huecos de fontanería. Es un auxiliar de almacenaje, no una base preparada para instalar un lavatorio.
- **Módulo de Cocina 85:** deriva de una sección superior de un conjunto, con cotas de 832 en el travesaño, 325 de altura y 330 de fondo, sobre un tramo de 850. Se propone una pieza independiente de 850 × 330 × 330 con techo, base y dos puertas; no se afirma que existiera una carcasa separada de esas medidas.
- **Aparador Abierto 143:** la referencia acota una carcasa de 1426 × 679 × 475 y un zócalo separado de 80. Se propone 1430 × 700 × 480, se omite el zócalo y se incorpora tapa continua. Las repisas quedan a igual altura.
- **Recibidor Abierto 205:** el dibujo y el corte coinciden en tapa de 2050 × 300 y laterales de 821 × 295. Se propone altura de 840 a partir de 821 + 18, redondeada, y fondo uniforme de 300. Se excluye el marco superior del conjunto original y cualquier espejo.
- **Repisa Doble 106:** la referencia incluye ancho de 1060, dos vanos de 503 y fondo de 340, corroborados por la lista de corte. Una carcasa de 176 más tapa de 18 daría 194; se propone altura de 200. La variante usa melamina de 18 en toda la estructura, techo completo y ninguna trasera.

Las carcasas configurables recalculan sus propias piezas. Ninguna cota interna original se importa como un despiece aprobado. El taller debe revisar el montaje, las cargas, los herrajes y las fijaciones necesarias antes de fabricar; las variantes abiertas y las piezas altas requieren resolver su arriostramiento y fijación. Ningún modelo incluye un sistema de suspensión mural calculado.

## Configuración y precios

Los cuatro escritorios tienen `basePrice: 200`, como valor referencial de la nueva familia. Estantes y zapateras usan 180; velador, auxiliares, módulos de cocina y aparador usan 140. Todos parten de `weeks: 3`. Son parámetros iniciales del catálogo, no precios finales, cotizaciones históricas ni plazos confirmados. El administrador puede editarlos sin cambiar código.

Los acabados iniciales usan materiales Hispano ya existentes: Roble Catania, Blanco 100, Chiavenna, Almendra 02, Gris Suave y Gris Grafito 02. El paquete no activa materiales ni cambia su disponibilidad. La importación necesita que los IDs correspondientes estén activos en el catálogo de destino.

Los límites dimensionales son rangos de configuración y no garantizan todas las combinaciones de divisiones, repisas y puertas. Cada variante sigue las restricciones de su construcción. Por ejemplo, Aparador Abierto 143 necesita reducir el ancho o aumentar las columnas antes de usar puertas, porque sus dos vanos iniciales superan 600 mm. Los escritorios con pedestal mantienen un vano de piernas de 600 a 1000 mm y un pedestal fijo por modelo; sus rangos de anchura se ajustan a esa relación.

## Importación

1. Instalar la versión del motor que admite `construction`, las nuevas categorías y los cuatro tipos usados por este paquete.
2. Importar [coleccion-taller.json](../catalog/coleccion-taller.json) desde el panel administrativo y revisar sus 16 borradores.
3. Revisar cada propuesta, sus materiales activos, dimensiones, precio base y plazo. Activar los modelos elegidos desde el panel.
4. Editar posteriormente los registros existentes; no reimportar los mismos IDs para sobrescribirlos.

La importación transaccional rechaza IDs duplicados y no reemplaza los modelos de la colección anterior. Las ediciones conservan el control de versión. Los diseños guardados mantienen sus snapshots históricos, sin recalcularse al importar o publicar estos nuevos productos.
