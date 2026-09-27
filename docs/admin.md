# Administrar El capo

El panel se abre en `/admin`. Introduce el correo autorizado y la contraseña; después completa el segundo paso con tu aplicación autenticadora, un código enviado al correo (si el servicio está activado) o un código de recuperación de un solo uso. Sin ese segundo paso no se abre el catálogo privado. No hay registro público. En desarrollo local, las credenciales y la vinculación están en archivos privados generados por `npm run setup:local`, nunca en la terminal ni en Git. Consulta la [guía de seguridad](admin-security.md).

El desafío caduca a los cinco minutos y admite intentos limitados. El código de correo se solicita expresamente y el panel indica cuándo se puede reenviar. Recargar permite continuar un desafío vigente. Cerrar sesión revoca el acceso también en el servidor. El catálogo se carga desde la API: no depende de `localStorage`.

## Acceso rápido

1. Abre [el panel de la web publicada](https://alrazz.pages.dev/admin), o pulsa **Administración** al final de la página.
2. Introduce el correo autorizado y la contraseña de producción. Pulsa **Continuar**.
3. Abre la aplicación autenticadora vinculada, introduce su código vigente de seis dígitos y pulsa **Verificar y entrar**. El envío por correo solo funciona cuando está configurado; la interfaz indica si está disponible.
4. En **Catálogo**, pulsa el lápiz **Editar** del modelo. Revisa **Medidas y límites** y **Configuración inicial**, y pulsa **Guardar cambios**.
5. Usa **Ajustes del taller** para acabados, costos y contactos, y termina con **Guardar ajustes**. Pulsa **Cerrar sesión** al terminar en un equipo compartido.

La contraseña de desarrollo local no abre el panel de producción. Las credenciales, el QR de vinculación y los códigos de recuperación se entregan por separado y nunca forman parte de esta guía pública.

## Añadir, editar o retirar un mueble

1. En **Catálogo**, selecciona **Nuevo mueble** o duplica uno existente.
2. Elige una estructura de partida. Completa un nombre y un identificador único, con letras minúsculas, números y guiones.
3. Ajusta la categoría, descripción, orden, mano de obra, plazo, medidas permitidas y configuración inicial.
4. Guarda el borrador. Revisa sus datos y pulsa su estado **Borrador** para publicarlo.
5. Para retirar un modelo, pulsa **Visible** y confirma. Sus datos se conservan y puede volver a activarse.

El identificador de un modelo existente es permanente. Todas las medidas están en milímetros, en pasos de 10 mm; el configurador valida luces, puertas y separaciones. El espesor de melamina de 18 mm y las reglas de fabricación permanecen en el motor compartido.

**Tipo de construcción** separa la estructura de la categoría comercial: almacenaje con trasera, estante sin trasera, escritorio abierto o escritorio con módulo lateral. Al cambiar de tipo se propone una configuración compatible para revisar. En el escritorio con almacenaje puedes elegir lado y ancho exterior del módulo lateral; las repisas y puerta pertenecen a ese módulo. La categoría organiza la búsqueda, pero no cambia por sí sola la construcción. El cliente solo recibe controles aplicables al tipo elegido.

La [colección de taller](coleccion-taller.md) añade 16 propuestas adaptadas de planos locales. El archivo JSON es una importación opcional; no reemplaza productos anteriores ni se carga de nuevo al iniciar. Las propuestas y su despiece requieren revisión de fabricación.

La [ampliación de almacenaje con puertas](coleccion-taller-ampliada.md) aporta otras 12 propuestas con el mismo editor. La animación de la miniatura sigue las puertas de la configuración inicial: también se aplica a un mueble que crees o edites después. No cambia medidas, precios ni despieces. En dispositivos táctiles, tocar la tarjeta abre directamente su configurador.

## Materiales, capacidad y costos

En **Ajustes del taller** se pueden cambiar los dos contactos de WhatsApp, disponibilidad, plazo general, acabados y reglas de cotización. Los cambios se aplican al pulsar **Guardar ajustes**. Los costos internos se muestran únicamente en administración.

- **WhatsApp comercial 1 y 2:** código de país y teléfono, sin signos ni espacios. Cada número vacío queda oculto; dejar ambos vacíos desactiva el contacto comercial. Si ambos contienen el mismo número, se muestra una sola opción. El cliente elige a cuál escribir y abre WhatsApp con un mensaje preparado. No se envía automáticamente el mismo mensaje a ambos destinatarios.
- **Acabados:** añadir marca, nombre comercial, código del fabricante (opcional), tablero estándar o RH, identificador, color e índice de costo. Un índice de 100 equivale a la tarifa base por m²; 110 representa un costo 10 % mayor. Activa los que el taller ofrece. El código interno no es un SKU del fabricante.
- **Identificadores de acabado:** conservarlos si ya se utilizan en modelos o configuraciones. La interfaz bloquea el cambio de los identificadores usados por el catálogo.
- **Costos:** material, tapacanto, herrajes, instalación, transporte y margen. El precio se calcula en servidor. La mano de obra se configura para cada mueble.

**Añadir catálogo de marcas** incorpora las referencias faltantes de Hispano, Vesto y Pelikano como ocultas. Conserva precios, nombres y cambios de los IDs existentes. Revisa las referencias, establece tus costos, activa los acabados que ofreces y guarda. El filtro de marca facilita administrar la lista. Las fuentes están en [material-sources.md](material-sources.md); la selección no representa un ranking de ventas ni inventario confirmado en Cusco.

Cada variante RH tiene un identificador y costo propios. Para añadir una combinación que compras a tu proveedor, crea un acabado nuevo, elige **RH**, escribe su marca y nombre comercial y configura su índice. No conviertas un acabado estándar en RH si necesitas ofrecer ambos. RH significa resistente a la humedad, no impermeable. Ocultar una variante no elimina su historial ni modifica diseños ya guardados.

En el configurador, el cliente puede filtrar marca y tipo de tablero y elegir exterior e interior. El despiece y su identificación de materiales se consultan exclusivamente en administración. Los colores en pantalla son aproximados; confirma muestra física y disponibilidad antes de fabricar.

## Despiece privado del taller

La pestaña **Despiece** solo está disponible después de iniciar sesión y completar el segundo paso. El servidor exige esa misma autorización; ocultar el botón público no es el mecanismo de protección.

1. Selecciona **Modelo del catálogo** para consultar la configuración inicial de un modelo visible con las tarifas actuales.
2. Selecciona **Diseño guardado** y pega su enlace o identificador para consultar las medidas, materiales y resultado originales. Se conserva el snapshot aunque luego cambien los precios o se oculte el mueble.
3. Pulsa **Consultar despiece** para ver las piezas y medidas en milímetros. La cantidad solicitada del diseño se muestra por separado: la tabla y el CSV preliminar corresponden a una unidad del mueble.

La descarga CSV disponible permanece dentro del panel privado. El formato definitivo del taller queda pendiente de definición; no se da por validada la compatibilidad con CutMaster ni la fabricación. El despiece sigue siendo preliminar y requiere revisión del taller.

El cliente recibe únicamente geometría para la vista 3D y precio. Las consultas públicas y los enlaces compartidos no entregan la tabla de corte, veta, tapacantos, accesorios ni costos internos. Las dimensiones visibles del mueble pueden inferirse de su representación; no se promete ocultarlas.

## Ambiente y escala

La vista 3D incluye un ambiente de estudio y una persona de referencia de **1,70 m**, activables por separado. La figura mantiene su altura al cambiar las dimensiones del mueble y comparte el mismo plano de suelo. Es una referencia espacial, no parte del producto, y no interviene en el precio ni el despiece. En pantallas estrechas, el encuadre se adapta para mostrar ambos. Los objetos de ambientación tampoco forman parte del mueble.

## Importar y exportar

**Exportar** descarga el catálogo actual en CSV, incluidos los borradores. **Descargar plantilla CSV** proporciona la estructura admitida. El importador también recibe JSON con una lista de productos o un objeto `{ "products": [...] }`.

Las columnas **Tipo constructivo**, **Lado del módulo lateral** y **Ancho del módulo lateral mm** conservan las nuevas estructuras al exportar/importar. Los CSV antiguos siguen funcionando sin esas columnas; para nuevos escritorios especifica `desk` o `desk-storage`. Un tipo desconocido o un parámetro lateral colocado en otra estructura genera un error, sin transformarse silenciosamente en una carcasa.

La importación muestra una vista previa antes de escribir. Todos los modelos se crean como borradores. Si hay errores de estructura, identificadores duplicados o identificadores que ya existen, se debe corregir el archivo antes de confirmar. Importar no sobrescribe los modelos existentes; para actualizarlos, usa el editor. Máximo de archivo y datos preparados en la interfaz: 1 MB; máximo de 200 muebles por importación.

## Errores y edición simultánea

Si una escritura falla, el formulario conserva los datos introducidos. Si otra persona modificó el mismo registro, el servidor rechaza una versión antigua para evitar sobrescribirla. Copia tus cambios, recarga los datos actuales y vuelve a aplicarlos. Una pérdida de conexión se muestra como error; no se anuncia un guardado hasta recibir respuesta del servidor.

Los ajustes pendientes bloquean el cierre de sesión para prevenir una pérdida accidental. El navegador solicita confirmación si se abandona la página con cambios pendientes. Cerrar un editor modificado también requiere confirmar el descarte.
