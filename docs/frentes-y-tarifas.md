# Frentes y tarifas del catálogo

Cada producto puede habilitar `frontOptions`: `melamine`, `glass` y `aluminum-glass`. La configuración guarda la selección en `front`. Si estos campos faltan, se conserva la construcción y el precio anterior de melamina. No se modifica el catálogo al iniciar la aplicación.

El administrador elige el modo de cobro en `pricing`:

| Base                         | Tarifa                             | Cálculo de venta base                                              |
| ---------------------------- | ---------------------------------- | ------------------------------------------------------------------ |
| `calculated` o campo ausente | Tarifas del taller                 | Materiales reales, tapacantos, herrajes y mano de obra, con margen |
| `unit`                       | `amount`, soles por mueble         | Tarifa × 1                                                         |
| `linear-meter`               | `amount`, soles por metro de ancho | Tarifa × ancho configurado en mm / 1000                            |

La tarifa de venta por unidad o metro incluye el mueble y sus herrajes ordinarios; sustituye el cálculo base completo. Los frentes especiales añaden su costo de vidrio, marco y herrajes específicos con el margen del taller. Instalación y transporte se añaden una sola vez, sin margen. Se mantiene el redondeo final hacia arriba a múltiplos de S/10. La base por metro se refiere al ancho horizontal de ese mueble, no al área ni al perímetro.

En `settings.frontRates`, el administrador puede cambiar:

| Campo      | Bases admitidas                            | Valor referencial si falta           |
| ---------- | ------------------------------------------ | ------------------------------------ |
| `glass`    | `square-meter` o `unit`                    | S/180 por m² de vidrio               |
| `aluminum` | `linear-meter` o `unit`                    | S/45 por metro de perímetro exterior |
| `hardware` | Soles por puerta de vidrio, juego completo | S/65 por juego                       |

Los importes referenciales son parámetros del piloto, no precios comprobados de un proveedor. `amount` es el importe en los objetos de vidrio y aluminio. Un juego de herrajes incluye la solución de bisagras y el jalador exterior, para evitar facturarlos también como herrajes de melamina. Las opciones por unidad se multiplican por la cantidad de puertas que realmente las usan.

El motor mantiene la estructura de melamina de 18 mm. Una puerta de vidrio se representa como un accesorio independiente de 6 mm; el frente con aluminio tiene un marco de 20 mm de ancho y profundidad, con vidrio interior de 6 mm. En esa opción, el área de vidrio descuenta 40 mm al ancho y al alto de la puerta. El aluminio usa el perímetro exterior. Ambos frentes se sitúan al ras del plano frontal y se abren como una sola puerta en la vista.

Estos accesorios no se incluyen en el CSV de corte de melamina ni en sus metros cuadrados o tapacantos. Los frentes especiales requieren un jalador exterior, puertas habilitadas y un alto máximo de puerta de 1500 mm en este piloto. Escritorios abiertos y estantes sin trasera no admiten esta opción. La selección abierta elimina el frente especial. La fabricación debe confirmar tipo de vidrio, herrajes, uniones, holguras y descuentos del perfil; esta vista no es un plano homologado para producción.

El CSV de catálogo añade `Frentes permitidos` (valores separados por `|`), `Frente inicial`, `Base de cobro` y `Tarifa de venta S/`. Las celdas vacías conservan la ausencia de los campos. Una tarifa requiere una base por unidad o metro; una base calculada no admite un importe fijo. Las importaciones siguen creando borradores.

Las tasas y la tarifa de venta se conservan en los snapshots privados y no se publican con el modelo; solo se publica el tipo de base de cobro. Las cotizaciones públicas muestran el total. Cambiar las tarifas no recalcula silenciosamente diseños guardados.
