# Colección El Capo: cuatro adaptaciones de almacenaje

[coleccion-el-capo.json](../catalog/coleccion-el-capo.json) contiene cuatro modelos importables desde el panel administrativo. Es un paquete opcional de datos, no una semilla de arranque ni una migración automática. Todos tienen `active: false`, versión 1 e identificadores nuevos y estables. Usa las categorías y el motor existentes.

## Referencias y simplificaciones

La revisión se hizo sobre planos locales facilitados por el taller. Las referencias siguientes están anonimizadas; no se incorporan a Git archivos de clientes, nombres, rutas originales, imágenes de sus planos ni cotizaciones privadas. Son adaptaciones propuestas, no reproducciones exactas ni diseños homologados para fabricar.

Todas las medidas siguientes son **ancho × alto × fondo, en mm**. El motor conserva tableros de 18 mm, incluida la trasera, y admite medidas exteriores en pasos de 10 mm.

| Modelo e identificador                  | Medidas propuestas | Adaptación respecto a la referencia local                                                                                                                                                                                                                                                                                            |
| --------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Auxiliar Compacto · `auxiliar-compacto` | 700 × 640 × 300    | Referencia de 701 mm de ancho y 637 mm de alto, fondo inferior de 300 mm y superior de 250 mm. Se redondea ancho/alto, se elimina el rebaje para mantener fondo uniforme de 300 mm y se añaden dos columnas con una repisa por columna.                                                                                              |
| Organizador Dúo · `organizador-duo`     | 1270 × 440 × 300   | Referencia de 1267 × 438 mm, con profundidad superior de 250 mm, rebaje y huecos de alturas desiguales; el fondo inferior de 300 mm se infiere del despiece lateral. Se redondea ancho/alto, se propone fondo uniforme de 300 mm y se igualan las alturas de sus cuatro espacios.                                                    |
| TV Abierto 175 · `tv-abierto-175`       | 1750 × 590 × 350   | Referencia de carcasa de 1750 × 593 × 350 mm, con bastidores superiores, alturas interiores desiguales y zócalo separado. Se propone un alto exterior simplificado de 590 mm, sin zócalo, con techo completo, tres columnas y una repisa por columna. No equivale al alto final del conjunto original, que no está acreditado.       |
| TV Bajo 200 · `tv-bajo-200`             | 2000 × 300 × 300   | Referencia de carcasa de 2000 × 282 × 274 mm, con bastidores y vanos de distintas anchuras; el despiece incluye una pieza de 2000 × 300 mm. Alto y fondo exteriores de 300 mm son propuestas de esta adaptación, no cotas finales confirmadas. Se añaden techo completo y cuatro compartimentos de anchura equivalente, sin repisas. |

Las cotas interiores originales no se importan como piezas de corte: el motor recalcula vanos y holguras con 18 mm. Por ejemplo, los dos vanos de Organizador Dúo resultan de 608 mm; la anotación de 625 mm por vano en la referencia no cierra con su ancho general y ese espesor.

Las cuatro propuestas son abiertas, sin puertas. El configurador puede cambiar su distribución dentro de las reglas actuales. No incorporan cajones, huecos de escritorio, cortes especiales, soporte de televisión ni anclaje a pared. El taller debe validar uniones, herrajes, carga, fijaciones y despiece antes de fabricar.

## Parámetros editables

Los acabados iniciales son Hispano Roble Catania, Gris Suave, Chiavenna y Almendra 02, respectivamente, usando sus IDs del catálogo oficial existente. La importación exige que esos materiales estén activos en los ajustes de destino; no los activa ni sustituye automáticamente.

Los valores `basePrice` (180 para estanterías y 120 para muebles de TV) y `weeks: 3` se toman de los parámetros referenciales de las familias iniciales. No proceden de cotizaciones de clientes o proveedores ni representan un precio final o plazo confirmado. El precio visible se calcula con las tarifas actuales del taller; revisar costo base y plazo antes de publicar.

Los límites dimensionales son márgenes de configuración, no una garantía de cualquier combinación de módulos, puertas y repisas. Por ejemplo, Organizador Dúo a 1800 mm necesita al menos tres columnas y TV Abierto 175 a 2400 mm necesita al menos cuatro para respetar la luz máxima de 750 mm. Una puerta reduce la anchura admisible del vano a 600 mm, y cada espacio entre repisas mantiene al menos 100 mm.

## Importación y conservación del catálogo

1. En `/admin`, importar el JSON y revisar las cuatro filas, los acabados y las medidas.
2. Confirmar la importación: `POST /api/store` con `{ "op": "import", "products": [...] }` crea el lote como borradores. IDs duplicados o errores impiden sobrescribir modelos anteriores; una colisión durante la escritura revierte el lote.
3. Revisar cada modelo y sus parámetros comerciales antes de activarlo. La publicación existente usa `op: "product"` y `expectedVersion` para detectar cambios concurrentes.
4. Para modificaciones posteriores, editar el registro desde el panel; no volver a importar el mismo ID, reemplazar seeds ni reactivar modelos al arrancar.

Los diseños guardados mantienen sus snapshots de producto, configuración, materiales, tarifas y resultado. Importar o editar estos modelos no recalcula esos diseños. El paquete no introduce escrituras sobre diseños ni ajustes existentes.

La prueba `tests/catalog-expansion.test.ts` valida el JSON con el esquema real, sus cuatro configuraciones iniciales, el contrato CSV del administrador y extremos dimensionales con las restricciones de soporte y separación de repisas. Las pruebas de API existentes verifican importación transaccional, borradores, conflictos de versión y conservación de snapshots; solo se ejecutan contra la base local.
