# Administrar El capo

El panel se abre en `/admin`. Introduce el correo autorizado y la contraseña; después completa el segundo paso con tu aplicación autenticadora, un código enviado al correo (si el servicio está activado) o un código de recuperación de un solo uso. Sin ese segundo paso no se abre el catálogo privado. No hay registro público. En desarrollo local, las credenciales y la vinculación están en archivos privados generados por `npm run setup:local`, nunca en la terminal ni en Git. Consulta la [guía de seguridad](admin-security.md).

El desafío caduca a los cinco minutos y admite intentos limitados. El código de correo se solicita expresamente y el panel indica cuándo se puede reenviar. Recargar permite continuar un desafío vigente. Cerrar sesión revoca el acceso también en el servidor. El catálogo se carga desde la API: no depende de `localStorage`.

## Acceso rápido

1. Abre [el panel de la web publicada](https://alrazz.pages.dev/admin), o pulsa seis veces seguidas el logotipo **El capo** del pie de página. Deja menos de cuatro segundos entre pulsaciones. Este gesto solo abre el acceso: siguen siendo obligatorios la contraseña y el segundo factor.
2. Introduce el correo autorizado y la contraseña de producción. Pulsa **Continuar**.
3. Abre la aplicación autenticadora vinculada, introduce su código vigente de seis dígitos y pulsa **Verificar y entrar**. El envío por correo solo funciona cuando está configurado; la interfaz indica si está disponible.
4. En **Catálogo**, pulsa el lápiz **Editar** del modelo. El editor reúne **General**, **Medidas y distribución**, **Acabados**, **Imagen y galería** y **Publicación**, junto a una vista 3D que muestra los cambios. Revisa la configuración y pulsa **Guardar cambios**.
5. Usa **Ajustes del taller** para acabados, costos y contactos, y termina con **Guardar ajustes**. Pulsa **Cerrar sesión** al terminar en un equipo compartido.

La contraseña de desarrollo local no abre el panel de producción. Las credenciales, el QR de vinculación y los códigos de recuperación se entregan por separado y nunca forman parte de esta guía pública.

## Añadir, editar o retirar un mueble

1. En **Catálogo**, selecciona **Nuevo mueble** o duplica uno existente.
2. Elige una estructura de partida. Completa un nombre y un identificador único, con letras minúsculas, números y guiones.
3. Ajusta la categoría, descripción, orden, mano de obra, plazo, medidas permitidas y configuración inicial.
4. Guarda el borrador. Revisa sus datos y pulsa su estado **Borrador** para publicarlo.
5. Para retirar un modelo, pulsa **Visible** y confirma. Sus datos se conservan y puede volver a activarse.

El identificador de un modelo existente es permanente. Todas las medidas están en milímetros, en pasos de 10 mm; el configurador valida luces, puertas y separaciones. El espesor de melamina de 18 mm y las reglas de fabricación permanecen en el motor compartido.

**Tipo de construcción** separa la estructura de la categoría comercial: almacenaje con trasera, estante sin trasera, escritorio abierto, escritorio con módulo lateral, ropero con maletero o base de cocina con zócalo. Al cambiar de tipo se propone una configuración compatible para revisar. En el escritorio con almacenaje puedes elegir lado y ancho exterior del módulo lateral; las repisas y puerta pertenecen a ese módulo. La categoría organiza la búsqueda, pero no cambia por sí sola la construcción. El cliente solo recibe controles aplicables al tipo elegido.

En un **ropero**, ajusta **Altura del altillo** (altura libre del maletero) y **Módulos para colgar**, contados desde la izquierda. Las repisas corresponden únicamente a las columnas restantes; si todas llevan barra, quedan en cero y se conserva el maletero. En una **base de cocina**, ajusta altura y retiro frontal del zócalo; su altura está incluida en el alto total. La tapa es de melamina de 18 mm. No se incluyen lavatorio, electrodomésticos ni cubierta de piedra. Las alacenas usan almacenaje con trasera y requieren resolver su fijación mural antes de fabricar.

La [colección de taller](coleccion-taller.md) añade 16 propuestas adaptadas de planos locales. El archivo JSON es una importación opcional; no reemplaza productos anteriores ni se carga de nuevo al iniciar. Las propuestas y su despiece requieren revisión de fabricación.

La [ampliación de almacenaje con puertas](coleccion-taller-ampliada.md) aporta otras 12 propuestas con el mismo editor. La animación de la miniatura sigue las puertas de la configuración inicial: también se aplica a un mueble que crees o edites después. No cambia medidas, precios ni despieces. En dispositivos táctiles, tocar la tarjeta abre directamente su configurador.

La [colección de cocinas y roperos](coleccion-cocinas-roperos.md) añade ocho propuestas con barras, maleteros, zócalos y alacenas. Cada registro se edita desde el mismo panel. Las familias constructivas, sus límites y las adaptaciones de los planos se detallan en esa guía.

La [colección de cocinas, vitrinas y repisas](coleccion-cocinas-vitrinas.md) añade doce modelos: seis módulos de cocina, dos vitrinas y cuatro piezas de almacenaje abierto o mixto. Sus nueve modelos con puertas permiten seleccionar melamina, vidrio o vidrio con marco de aluminio. Las referencias consultadas y las medidas propias de cada propuesta aparecen en esa guía.

## Frentes y tarifa de cada modelo

En **Catálogo → Editar → Acabados**, marca los materiales de puerta que el cliente puede elegir y selecciona el frente inicial. El vidrio requiere jalador exterior; cada hoja admite hasta 1500 mm de alto en el piloto. La estructura y las repisas permanecen en melamina de 18 mm. Puedes deshabilitar un frente para un modelo concreto.

En **Publicación**, abre **Forma de cotizar este modelo**:

- **Por materiales y herrajes:** calcula las piezas reales, tapacantos, herrajes y **Mano de obra base · S/** con el margen del taller.
- **Tarifa por unidad:** introduce **Precio base de venta · S/ por unidad**. Una unidad es un mueble completo, a cualquiera de sus medidas permitidas.
- **Tarifa por metro lineal de ancho:** introduce **Precio base de venta · S/ por metro lineal**. La cantidad es el ancho configurado en milímetros dividido entre 1000; alto y fondo no multiplican esta tarifa.

Las tarifas por unidad o metro sustituyen el cálculo base del mueble y ya incluyen material, mano de obra y herrajes comunes. Los frentes especiales se suman con el margen del taller; instalación y transporte se añaden aparte. El total se redondea hacia arriba a múltiplos de S/10. Pulsa **Guardar cambios** para aplicar la tarifa a nuevas cotizaciones.

En **Ajustes del taller → Costos adicionales de frentes especiales**, configura **Vidrio · forma de cobrar** por m² o por hoja, **Marco de aluminio · forma de cobrar** por metro de perímetro exterior o por marco completo, y **Herrajes para vidrio · costo S/ por puerta**. Son costos internos; el sistema aplica el margen antes de añadirlos a la venta. El juego de herrajes para vidrio sustituye los herrajes comunes de esa puerta. Pulsa **Guardar ajustes**. Consulta [Frentes y tarifas](frentes-y-tarifas.md) para ver el cálculo de áreas, perímetros y restricciones.

## Cocinas completas

La pestaña **Cocinas** muestra **Cocinas completas** y las últimas distribuciones guardadas. **Planificar cocina** abre [el planificador](https://alrazz.pages.dev/cocinas) en otra pestaña. Allí puedes elegir **Lineal** o **En L**, introducir las medidas del espacio y combinar módulos de la categoría **Cocina** con reservas para **Refrigeradora**, **Cocina / horno**, **Lavadero** o **Espacio libre**. Las flechas cambian el orden y cada módulo permite ajustar medidas, distribución, acabados y frentes habilitados.

Escribe **Nombre de tu cocina** y pulsa **Guardar mi cocina**. **Copiar enlace** permite compartir la versión guardada. Editar una versión consulta los modelos y tarifas actuales; **Guardar otra versión** crea una nueva sin modificar el presupuesto original. Las reservas de equipos no incluyen ni cobran esos equipos, lavadero o encimera. Instalación y transporte se seleccionan para la cocina completa y se cobran una sola vez.

Para revisar una cocina en el taller:

1. En la pestaña **Cocinas**, selecciona una entrada de **Últimas cocinas guardadas**, o pega su enlace en **Enlace o identificador de cocina** y pulsa **Consultar despiece**.
2. Abre cada módulo para ver sus piezas de melamina, vidrio, perfiles y accesorios. La consulta conserva los datos originales, aunque cambien las tarifas o se oculte un modelo después.
3. Usa **Ver distribución** para abrir la vista pública o **Despiece CSV** para descargar el detalle privado por módulo. **Actualizar** renueva la lista de cocinas guardadas.

El CSV distingue **MELAMINA**, **VIDRIO** y **ACCESORIO / RESUMEN**; el vidrio no figura como tablero de 18 mm. Los espacios reservados no generan piezas de fabricación. La tabla y la descarga requieren sesión administrativa con segundo factor y permanecen como despiece preliminar, pendiente de validación del taller.

## Imagen de cada modelo

En **Imagen y galería**, activa o desactiva la imagen ambientada, elige ambiente **Cálido**, **Claro** u **Oscuro** y añade una leyenda opcional. La imagen se genera a partir de la geometría, medidas y acabados de la configuración mostrada. Se identifica como render digital; no es una fotografía de un mueble fabricado. Cambiar el ambiente no cambia el precio ni el despiece. Los modelos anteriores sin estos ajustes muestran la galería cálida por defecto.

## Materiales, capacidad y costos

En **Ajustes del taller** se pueden cambiar los dos contactos de WhatsApp, disponibilidad, plazo general, acabados y reglas de cotización. Los cambios se aplican al pulsar **Guardar ajustes**. Los costos internos se muestran únicamente en administración.

- **WhatsApp comercial 1 y 2:** código de país y teléfono, sin signos ni espacios. Cada número vacío queda oculto; dejar ambos vacíos desactiva el contacto comercial. Si ambos contienen el mismo número, se muestra una sola opción. El cliente elige a cuál escribir y abre WhatsApp con un mensaje preparado. No se envía automáticamente el mismo mensaje a ambos destinatarios.
- **Facebook comercial:** enlace HTTPS de una página o perfil en Facebook. Dejarlo vacío oculta el enlace. Se guarda con los demás ajustes; no requiere editar componentes ni publicar código.
- **Acabados:** añadir marca, nombre comercial, código del fabricante (opcional), tablero estándar o RH, identificador, color e índice de costo. Un índice de 100 equivale a la tarifa base por m²; 110 representa un costo 10 % mayor. Activa los que el taller ofrece. El código interno no es un SKU del fabricante.
- **Identificadores de acabado:** conservarlos si ya se utilizan en modelos o configuraciones. La interfaz bloquea el cambio de los identificadores usados por el catálogo.
- **Costos:** material, tapacanto, herrajes, barra de colgado por metro, soporte de barra por unidad, instalación, transporte y margen. El precio se calcula en servidor. Cada barra usa dos soportes; los costos de estos accesorios siguen siendo privados. La mano de obra se configura para cada mueble.

**Añadir catálogo de marcas** incorpora las referencias faltantes de Hispano, Vesto y Pelikano como ocultas. Conserva precios, nombres y cambios de los IDs existentes. Revisa las referencias, establece tus costos, activa los acabados que ofreces y guarda. El filtro de marca facilita administrar la lista. Las fuentes están en [material-sources.md](material-sources.md); la selección no representa un ranking de ventas ni inventario confirmado en Cusco.

Cada variante RH tiene un identificador y costo propios. Para añadir una combinación que compras a tu proveedor, crea un acabado nuevo, elige **RH**, escribe su marca y nombre comercial y configura su índice. No conviertas un acabado estándar en RH si necesitas ofrecer ambos. RH significa resistente a la humedad, no impermeable. Ocultar una variante no elimina su historial ni modifica diseños ya guardados.

En el configurador, el cliente puede filtrar marca y tipo de tablero y elegir exterior e interior. El despiece y su identificación de materiales se consultan exclusivamente en administración. Los colores en pantalla son aproximados; confirma muestra física y disponibilidad antes de fabricar.

## Despiece privado del taller

La pestaña **Despiece** solo está disponible después de iniciar sesión y completar el segundo paso. El servidor exige esa misma autorización; ocultar el botón público no es el mecanismo de protección.

1. Selecciona **Modelo del catálogo** para consultar la configuración inicial de un modelo visible con las tarifas actuales.
2. Selecciona **Diseño guardado** y pega su enlace o identificador para consultar las medidas, materiales y resultado originales. Se conserva el snapshot aunque luego cambien los precios o se oculte el mueble.
3. Pulsa **Consultar despiece** para ver las piezas y medidas en milímetros. La cantidad solicitada del diseño se muestra por separado: la tabla y el CSV preliminar corresponden a una unidad del mueble.

La descarga CSV disponible permanece dentro del panel privado. El formato definitivo del taller queda pendiente de definición; no se da por validada la compatibilidad con CutMaster ni la fabricación. El despiece sigue siendo preliminar y requiere revisión del taller.

Las barras de colgado se muestran como accesorios metálicos y se cotizan por longitud y soportes. No se mezclan con las piezas de melamina de 18 mm de la tabla de corte.

El cliente recibe únicamente geometría para la vista 3D y precio. Las consultas públicas y los enlaces compartidos no entregan la tabla de corte, veta, tapacantos, accesorios ni costos internos. Las dimensiones visibles del mueble pueden inferirse de su representación; no se promete ocultarlas.

## Ambiente y escala

La vista 3D incluye un ambiente de estudio y una persona de referencia de **1,70 m**, activables por separado. La figura mantiene su altura al cambiar las dimensiones del mueble y comparte el mismo plano de suelo. Es una referencia espacial, no parte del producto, y no interviene en el precio ni el despiece. En pantallas estrechas, el encuadre se adapta para mostrar ambos. Los objetos de ambientación tampoco forman parte del mueble.

## Importar y exportar

**Exportar** descarga el catálogo actual en CSV, incluidos los borradores. **Descargar plantilla CSV** proporciona la estructura admitida. El importador también recibe JSON con una lista de productos o un objeto `{ "products": [...] }`.

El CSV conserva **Tipo constructivo**, lado y ancho del módulo lateral, alto libre del maletero, columnas para colgar, alto y retranqueo del zócalo, y habilitación, ambiente y texto de la galería. Los tipos admitidos son `cabinet`, `open-shelf`, `desk`, `desk-storage`, `wardrobe` y `kitchen-base`. Los CSV antiguos siguen funcionando sin las columnas nuevas. Un tipo desconocido o un parámetro colocado en otra estructura genera un error, sin transformarse silenciosamente en una carcasa.

También conserva **Frentes permitidos**, **Frente inicial**, **Base de cobro** y **Tarifa de venta S/**. Los frentes permitidos se separan con `|`, por ejemplo `melamine|glass|aluminum-glass`; las bases de cobro son `calculated`, `unit` y `linear-meter`. Una tarifa fija requiere base por unidad o metro; deja su importe vacío cuando uses cálculo por materiales. Los [doce modelos de cocina, vitrinas y repisas](../catalog/coleccion-cocinas-vitrinas.json) pueden importarse desde su JSON y permanecerán en borrador hasta que los publiques.

La importación muestra una vista previa antes de escribir. Todos los modelos se crean como borradores. Si hay errores de estructura, identificadores duplicados o identificadores que ya existen, se debe corregir el archivo antes de confirmar. Importar no sobrescribe los modelos existentes; para actualizarlos, usa el editor. Máximo de archivo y datos preparados en la interfaz: 1 MB; máximo de 200 muebles por importación.

## Errores y edición simultánea

Si una escritura falla, el formulario conserva los datos introducidos. Si otra persona modificó el mismo registro, el servidor rechaza una versión antigua para evitar sobrescribirla. Copia tus cambios, recarga los datos actuales y vuelve a aplicarlos. Una pérdida de conexión se muestra como error; no se anuncia un guardado hasta recibir respuesta del servidor.

Los ajustes pendientes bloquean el cierre de sesión para prevenir una pérdida accidental. El navegador solicita confirmación si se abandona la página con cambios pendientes. Cerrar un editor modificado también requiere confirmar el descarte.
