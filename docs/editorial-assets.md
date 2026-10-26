# Imágenes editoriales del showroom AlRazz

Estas imágenes son **ilustraciones editoriales sintéticas originales**, generadas el 26 de octubre de 2026 con la herramienta integrada `image_gen`. No son fotografías de obras, clientes o instalaciones reales, ni representan modelos exactos del catálogo. No se usaron imágenes de Horizon, referencias visuales de terceros, CLI, API externa ni servicios contratados.

Los ambientes sirven para presentar la intención de diseño de la portada. El catálogo y el configurador conservan como fuente del modelo su geometría pública del servidor; una imagen editorial no valida medidas, piezas, precio, equipamiento ni fabricación.

## Archivos públicos

Todos los WebP mantienen el encuadre completo. No se recortaron, retocaron, recompusieron ni ampliaron artificialmente.

| Ambiente | Uso | Versión 1600 × 900 | Peso | Versión 800 × 450 | Peso |
| --- | --- | --- | ---: | --- | ---: |
| Sala | Hero editorial; mueble nogal, ventana izquierda | `/images/editorial/living-1600.webp` | 234 110 B | `/images/editorial/living-800.webp` | 63 138 B |
| Cocina | Ambiente editorial nogal y blanco roto | `/images/editorial/kitchen-1600.webp` | 157 906 B | `/images/editorial/kitchen-800.webp` | 44 746 B |
| Dormitorio | Ambiente editorial arena y oliva, ropero cerrado | `/images/editorial/bedroom-1600.webp` | 151 936 B | `/images/editorial/bedroom-800.webp` | 41 628 B |
| Fondo vacío | Composición con la vista exacta de un modelo | `/images/editorial/room-1600.webp` | 136 086 B | `/images/editorial/room-800.webp` | 33 766 B |

Los originales son PNG de 1672 × 941. No se creó `living-2400.webp` porque excedería la resolución nativa; el hero dispone de 1600 píxeles útiles sin escalado artificial. Las conversiones usan Sharp, Lanczos3, WebP calidad 85 para 1600 y 82 para 800, esfuerzo 6, sin cambios de contenido o color.

Las cuatro conversiones finales se inspeccionaron visualmente: puertas cerradas y alineadas, luz desde la izquierda, sin personas, marcas o texto superpuesto. El fondo `room` mantiene pared y piso despejados en el centro, planta en el extremo izquierdo y una franja de sillón al extremo derecho. La unión pared/piso está aproximadamente al 62 % de altura: la composición debe apoyar el modelo en la franja de piso, sin deformar su geometría para adaptarla al fondo.

## Conservación y trazabilidad

Los originales de trabajo están en `.openai/editorial-assets/{living,kitchen,room,bedroom}-original.png`. Esa carpeta está ignorada por Git. Allí se conservan también `prompts.json` con los textos exactos y `manifest.json` con dimensiones, pesos y origen de cada conversión. Los PNG originales de la herramienta permanecen en su destino predeterminado de `generated_images`; no se borraron.

El uso editorial debe identificarse como visualización o imagen ambiental sintética cuando pudiera confundirse con un proyecto entregado. No incorporarlas al portafolio de obras reales ni tratarlas como una fotografía del producto seleccionado.

## Prompts utilizados

Los siguientes cuatro prompts se enviaron como generaciones independientes a la herramienta integrada, con fondo opaco. No se utilizaron imágenes de referencia.

### living

```text
Use case: photorealistic-natural.
Asset type: wide editorial homepage hero for an original premium melamine furniture showroom in Peru.
Primary request: an exceptionally composed, warm and inviting contemporary living room, with a rectilinear modular walnut-look melamine storage cabinet as the central furniture subject. Clearly plausible construction from thin 18 mm melamine boards, aligned flat closed doors, subtle equal gaps, square edges, grounded proportions and a discreet low plinth. Furniture should look refined and achievable, not a sculptural solid-wood object.
Scene: a huge floor-to-ceiling window along the LEFT side, warm limewash plaster walls, light natural stone floor and tactile linen upholstery. Quiet, generous architecture, an upholstered seat at the edge of the composition, restrained objects with no lettering.
Composition: panoramic landscape 16:9, ideally high resolution at least 2400 pixels across if available. Architectural editorial photography, comfortable human eye height, gently oblique view, straight verticals, cabinet in the middle-right with generous breathing room. The left window admits the morning light. Furniture is the emotional focus; avoid a product-on-white catalog shot.
Lighting: warm natural morning sunlight from the LEFT, soft believable shadows, detailed highlights, rich but muted walnut grain, off-white limestone and linen. Warm, calm and premium, realistic material texture, subtle filmic tonality without excessive orange.
Constraints: original composition, no reference or imitation of a specific website or designer. No people, no logos, no text, no typography, no watermarks, no visible brand names. No impossible joints, warped cabinetry, floating panels, rounded sculptural cabinet doors or shiny plastic.
```

### kitchen

```text
Use case: photorealistic-natural.
Asset type: wide editorial interior image for an original premium melamine furniture showroom.
Primary request: a beautiful warm contemporary kitchen with flat closed rectilinear cabinet doors, walnut-look melamine lower units and warm off-white melamine upper cabinetry. Construction is plausible from thin 18 mm melamine boards, consistent reveals, coherent module widths, neat flush toe-kick and credible worktop height. A restrained L-shaped layout, convincingly fitted to the room, with functional counter space.
Scene: warm limewash plaster, light stone backsplash and countertop, a large lateral window on the LEFT, understated linen curtain if present. Appliances only if integrated believably and without logos. The kitchen cabinetry is the subject, kept visually quiet.
Composition: wide landscape 16:9, high-resolution editorial architectural photograph, mild three-quarter viewpoint and straight verticals. Show the closed cabinetry and its fit clearly, no foreground obstruction hiding the main modules.
Lighting and palette: natural morning light enters from the LEFT, gentle shadows, warm walnut grain, ivory and stone, realistic restrained textures, tactile and welcoming rather than glossy.
Constraints: original scene, no copied reference composition. No people, no text, no labels, no logos, no watermarks. No open doors, no excessive handles, no warped countertop, no impossible cabinet corners, no speculative luxury sculptural geometry.
```

### room

```text
Use case: photorealistic-natural.
Asset type: empty interior photography-style backdrop to place a separate accurate furniture model in front later.
Primary request: a premium, warm, deliberately EMPTY showroom vignette. The CENTER and LOWER CENTER must be completely clear: only an uninterrupted warm plaster back wall and empty light stone floor. Do NOT place any cabinet, shelving, table, credenza, island or decorative object in the central placement zone.
Scene: a large window on the LEFT side admits morning light. One quiet indoor plant sits far at the LEFT edge. Only a small partial edge of a sand-colored linen armchair/sofa is visible at the far RIGHT edge. Warm limewash/plaster walls, pale stone floor, subtle natural texture.
Composition: landscape 16:9, high resolution if available, a gentle three-quarter architectural view compatible with an isometric catalog furniture model (about 25 degrees horizontal obliqueness, slight elevated view, not dramatic). Horizon/wall-floor junction around the middle of the frame, ample empty floor in the lower half. Reserve about the central 60 percent of the image width and entire lower-center area for the separate model. No rug or other shape across that placement zone. The back wall and floor should feel spacious but correctly scaled.
Lighting: soft morning window light from the LEFT, believable soft shadows towards the right, evenly readable neutral wall and floor in the central placement zone.
Constraints: original synthetic room. NO furniture in the center, NO cabinet, NO central table, NO shelf, NO pedestal, NO central lamp. No people, no text, no logos, no watermark. No dramatic perspective or overhead camera. Keep the plant and partial upholstered seat strictly at the edges.
```

### bedroom

```text
Use case: photorealistic-natural.
Asset type: wide editorial interior image for an original premium melamine furniture showroom.
Primary request: a calm warm bedroom with a beautifully proportioned, rectilinear closed wardrobe made of 18 mm sand and muted olive melamine boards. Flat aligned closed doors, modest thin board edges and consistent gaps, plausible wardrobe proportions, clean contact with the floor and wall. Refined achievable cabinetmaking, not curved solid-wood sculpture.
Scene: warm plaster walls, tactile linen bed dressing in sand tones and a restrained olive accent. A large LEFT-side window with soft morning light, natural stone or pale wood floor. The wardrobe is clearly visible as the leading furniture subject, with only part of the bed at the edge for atmosphere.
Composition: wide landscape 16:9, high-resolution editorial architectural photograph, mild three-quarter view at comfortable eye height, straight vertical lines, uncluttered negative space, quiet premium art direction.
Lighting and palette: natural morning light from the LEFT, soft grounded shadows, warm ivory, sand, muted olive and subtle walnut accents, realistic material grain and matte surfaces.
Constraints: original scene; no people, no text, no brand marks, no logos, no watermarks. Doors remain closed. No warped perspective, floating panels or implausible board thickness. Avoid hotel clichés, excessive decoration and glossy plastic surfaces.
```
