# Fuentes de acabados comerciales

Revisión: 26 de septiembre de 2026. La selección prioriza Tableros Hispanos, según AlRazz, y agrega VESTO y Pelíkano. Incluye **82 referencias: 31 Hispano, 23 Vesto estándar más 2 RH, y 25 Pelíkano estándar más 1 RH**. Son 79 diseños comerciales y tres variantes RH previamente documentadas; no es el catálogo completo de los fabricantes ni un inventario de Cusco.

La procedencia individual, imágenes originales, hashes y tratamiento para web constan en [material-assets.json](material-assets.json). Las muestras se guardan localmente y se publican como WebP (máximo 768 px, proporciones conservadas, sin recolorear ni generar vetas). Así el cliente no depende de servidores de terceros para verlas. El HEX se calcula como referencia visual aproximada; no es un valor colorimétrico oficial.

Las muestras rotuladas de Pelíkano conservan sus marcas en el selector; en el mueble 3D se usa su color aproximado para evitar representar los rótulos sobre las piezas. Las muestras planas limpias de Hispano y Vesto se usan también como textura orientativa. Ni la escala de la veta ni el brillo son una simulación física certificada.

La incorporación a una base existente conserva IDs, precios, visibilidad y nombres editados, y completa únicamente metadatos ausentes cuando coincide la identidad comercial. No modifica snapshots. Los acabados nuevos solo se activan por una acción explícita de administración/configuración; el arranque nunca vuelve a sembrar una base existente.

## Tableros Hispanos — marca principal

Las tablas siguientes documentan las 23 referencias iniciales y sus variantes RH. El registro completo de la ampliación a 82 referencias está en `material-assets.json` y `lib/material-presets.ts`.

La empresa identificada es **Tableros Hispanos**, fabricante de tableros en Nadela, Lugo, España. El sitio oficial identifica esa empresa y dirección: [fabricante](https://tableroshispanos.es/).

| Nombre comercial actual | Fuente oficial                                                                  |
| ----------------------- | ------------------------------------------------------------------------------- |
| Blanco 100              | [Producto](https://tableroshispanos.es/productos/blanco-100/)                   |
| Almendra 02             | [Producto](https://tableroshispanos.es/productos/almendra-02/)                  |
| Gris Suave              | [Producto](https://tableroshispanos.es/productos/gris-suave/)                   |
| Gris Grafito 02         | [Producto](https://tableroshispanos.es/productos/gris-grafito-02/)              |
| Negro                   | [Producto](https://tableroshispanos.es/productos/negro/)                        |
| Chiavenna               | [Producto](https://tableroshispanos.es/productos/chiavenna/)                    |
| Roble Catania           | [Producto](https://tableroshispanos.es/productos/roble-catania/)                |
| Roble Canyon            | [Catálogo de maderas](https://tableroshispanos.es/catalogo/categorias-maderas/) |

Los cinco unicolores también aparecen juntos en el [catálogo oficial de unicolores](https://tableroshispanos.es/catalogo/categorias-unicolores/). La [tabla oficial de paquetería](https://tableroshispanos.es/wp-content/uploads/2023/10/PAQUETERIA-1.pdf), enlazada desde las fichas de producto, incluye melamina de **18 mm**. La tabla es general: no certifica la combinación específica de diseño, formato y sustrato que tenga el distribuidor peruano. Mantener esa combinación por confirmar.

El fabricante ofrece MDP estándar P2 para interiores secos y MDP hidrófugo P3 para interiores húmedos: [aglomerados](https://tableroshispanos.es/aglomerados/) y [ficha P3](https://tableroshispanos.es/wp-content/uploads/2023/11/ficha-aglomerados-hidrofugos.pdf). No se encontró una matriz oficial que vincule cada acabado de esta selección con su variante RH disponible en Perú; **no convertir todos los acabados Hispano en RH automáticamente**.

## VESTO — Arauco Perú

Selección inicial: **Blanco, Almendra, Negro, Wengue, Roble Cava y Caramel**. Estos nombres figuran en el [catálogo oficial VESTO Perú](https://arauco.com/peru/marcas/vesto/), que incluye el espesor de 18 mm. La ampliación conserva esas referencias y agrega 17 diseños verificados en ese catálogo.

El [folleto oficial VESTO RH](https://arauco.com/peru/wp-content/uploads/sites/22/2020/11/3777_PERU_FLYER_MELAMINA_VESTO_RH_13Nov_20_E01.pdf), fechado noviembre de 2020 y aún enlazado desde la página de la marca consultada, especifica **MDP RH de 2150 × 2440 × 18 mm** e incluye los seis diseños anteriores. Respalda las variantes de catálogo **Blanco RH** y **Roble Cava RH** como referencias iniciales. No demuestra que un proveedor local mantenga stock hoy.

El folleto limita RH a uso interior, explica que reduce el hinchamiento por humedad y desaconseja uso o almacenamiento exterior.

## Pelíkano

Cada ficha siguiente enumera 18 mm, sustratos MDP y MDP-RH, y Perú entre sus mercados. Son opciones del fabricante, no un inventario por ciudad ni una garantía de todas las combinaciones de textura y sustrato en cada tienda.

| Nombre comercial | Fuente oficial                                              | Textura principal indicada |
| ---------------- | ----------------------------------------------------------- | -------------------------- |
| Blanco           | [Producto](https://www.pelikano.com/catalogo/p/agave-72whj) | Fantasía                   |
| Negro            | [Producto](https://www.pelikano.com/catalogo/p/negro)       | Fantasía                   |
| Gris             | [Producto](https://www.pelikano.com/catalogo/p/gris)        | Fantasía                   |
| Nevado           | [Producto](https://www.pelikano.com/catalogo/p/nevado)      | Fantasía                   |
| Capri            | [Producto](https://www.pelikano.com/catalogo/p/capri)       | Mate                       |
| Rovere           | [Producto](https://www.pelikano.com/catalogo/p/rovere)      | Mate                       |

**Capri RH** puede incorporarse como referencia inicial de catálogo, con disponibilidad por confirmar. La marca mantiene [fichas técnicas separadas para Pelíkano y Pelíkano RH](https://www.pelikano.com/descargables). El [documento técnico estándar](https://www.pelikano.com/s/Pelikano.pdf) requiere uso interior y canteado de todos los bordes.

## Criterios de integración

- RH significa **resistente a la humedad**. En inglés corresponde a **moisture-resistant**. No usar “waterproof” ni prometer impermeabilidad.
- Identificar cada opción por marca + nombre comercial + sustrato + espesor. Un acabado estándar y su variante RH son materiales distintos y pueden tener tarifas diferentes.
- El espesor de AlRazz permanece fijo en 18 mm. No importar otros espesores de las fichas del fabricante.
- Los nombres son comerciales; los IDs internos no son códigos oficiales de fabricante. No inventar códigos SKU, equivalencias entre marcas, precios ni certificaciones.
- Los colores HEX y la representación de las muestras en el visor son aproximaciones visuales; validar el tono y la textura con una muestra física. No son mediciones colorimétricas del fabricante.
- Los datos iniciales deben entrar como **por confirmar**. Publicar una referencia de catálogo no equivale a confirmar stock. Activación, estado y precio son datos del panel, sin editar componentes.
- Conservar intactos los materiales ya administrados y los snapshots de diseños existentes. La importación de esta selección debe agregar referencias, sin sobrescribir datos por nombre parecido.
