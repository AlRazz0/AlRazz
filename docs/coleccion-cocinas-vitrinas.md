# Colección de cocinas, vitrinas y repisas

`catalog/coleccion-cocinas-vitrinas.json` contiene doce modelos nuevos, en borrador, con órdenes 45–56. La importación no modifica los 44 modelos anteriores. Sus medidas, distribución, colores, frentes y base de cobro siguen administrándose desde el panel.

| Modelo                      | Ancho × alto × fondo inicial, mm | Distribución inicial                      |
| --------------------------- | -------------------------------- | ----------------------------------------- |
| Base de Cocina Dúo 80       | 800 × 850 × 600                  | Dos puertas y una repisa por columna      |
| Base de Cocina Familiar 120 | 1200 × 850 × 600                 | Dos puertas y dos repisas por columna     |
| Alacena Cristal 60          | 600 × 700 × 350                  | Una puerta de vidrio y dos repisas        |
| Alacena Aluminio 120        | 1200 × 700 × 350                 | Dos puertas de vidrio con aluminio        |
| Alacena Horizontal 90       | 900 × 400 × 350                  | Dos frentes bajos de vidrio con aluminio  |
| Despensa Compacta 60        | 600 × 1500 × 550                 | Una puerta y cinco niveles                |
| Vitrina Aluminio 80         | 800 × 1450 × 350                 | Dos puertas con marco y ocho espacios     |
| Vitrina Cristal 120         | 1200 × 1100 × 400                | Dos puertas de vidrio y seis espacios     |
| Estante Cubos 112           | 1120 × 1120 × 350                | Nueve compartimentos sin trasera          |
| Biblioteca Lineal 60        | 600 × 2000 × 300                 | Seis niveles abiertos con trasera         |
| Repisa Horizontal 120       | 1200 × 360 × 250                 | Tres nichos sin trasera                   |
| Auxiliar Café 90            | 900 × 900 × 450                  | Dos puertas inferiores y repisas abiertas |

Los nueve modelos inicialmente cerrados permiten cambiar entre melamina, vidrio y vidrio con marco de aluminio. Las tres piezas abiertas mantienen su geometría de repisas. Los vidrios pertenecen al frente; las repisas y la estructura continúan siendo de melamina de 18 mm. Los módulos de cocina pueden combinarse en el planificador con espacios reservados para los electrodomésticos y el lavadero.

Las dimensiones son adaptaciones propias para el motor del taller. Todas las puertas de vidrio habilitadas quedan dentro del límite preliminar de 1500 mm; sus herrajes, vidrio y montaje deben validarse para fabricación. No se incorporan cajones, correderas, fregaderos, electrodomésticos ni encimeras de piedra mediante una descripción que el modelo no represente.

Se conserva `pricing: { "basis": "calculated" }`. `basePrice` reutiliza los importes internos de las familias existentes: 140 para auxiliares y almacenaje cerrado, 150 para libreros y 180 para estanterías abiertas. Los totales se calculan con las tarifas actuales del taller. Estos datos no copian precios de las páginas de referencia; el administrador puede introducir su tarifa de venta por unidad o metro lineal cuando la defina.

Referencias consultadas el 1 de octubre de 2026:

- [IKEA METOD, armario de pared con baldas y puertas de vidrio](https://www.ikea.com/es/es/p/metod-armario-pared-baldas-puertas-vidrio-blanco-stensund-blanco-s29467875/): referencia de la tipología de alacena acristalada. El modelo del taller utiliza sus propias medidas, estructura y repisas de melamina.
- [Estanterías y librerías de IKEA](https://www.ikea.com/es/es/cat/estanterias-librerias-st002/): patrones de nichos repetidos, columnas de libros y almacenaje modular abierto.
- [Muebles altos de cocina en melamina, Sodimac Perú](https://www.sodimac.com.pe/sodimac-pe/b/muebles-altos-de-cocina-en-melamina): contexto local de alacenas de distintas anchuras, frentes acristalados y muebles bajos. Las referencias con cajones o puertas corredizas no se trasladan como tales al motor actual.

Las imágenes, nombres comerciales de muebles y archivos de los proveedores no se incorporan al catálogo. Las vistas se generan con la geometría propia y los acabados ya disponibles.
