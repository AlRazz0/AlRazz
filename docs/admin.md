# Administrar AlRazz

El panel se abre en `/admin`. Usa la clave privada configurada en el servidor. En desarrollo local, consulta la terminal que inicia el proyecto; no se incluyen contraseñas fijas en el navegador ni en este documento. Una sesión se mantiene mediante una cookie del servidor. El catálogo se carga desde la API: no depende de `localStorage`.

## Añadir, editar o retirar un mueble

1. En **Catálogo**, selecciona **Nuevo mueble** o duplica uno existente.
2. Elige una estructura de partida. Completa un nombre y un identificador único, con letras minúsculas, números y guiones.
3. Ajusta la categoría, descripción, orden, mano de obra, plazo, medidas permitidas y configuración inicial.
4. Guarda el borrador. Revisa sus datos y pulsa su estado **Borrador** para publicarlo.
5. Para retirar un modelo, pulsa **Visible** y confirma. Sus datos se conservan y puede volver a activarse.

El identificador de un modelo existente es permanente. Todas las medidas están en milímetros, en pasos de 10 mm; el configurador valida luces, puertas y separaciones. El espesor de melamina de 18 mm y las reglas de fabricación permanecen en el motor compartido.

## Materiales, capacidad y costos

En **Ajustes del taller** se puede cambiar WhatsApp, disponibilidad, plazo general, acabados y reglas de cotización. Los cambios se aplican al pulsar **Guardar ajustes**. Los costos internos se muestran únicamente en administración.

- **WhatsApp:** código de país y teléfono, sin signos ni espacios. Dejarlo vacío desactiva el contacto comercial.
- **Acabados:** añadir un nombre, identificador, color e índice de costo. Un índice de 100 equivale a la tarifa base por m²; 110 representa un costo 10 % mayor. Activa los que el taller ofrece.
- **Identificadores de acabado:** conservarlos si ya se utilizan en modelos o configuraciones. La interfaz bloquea el cambio de los identificadores usados por el catálogo.
- **Costos:** material, tapacanto, herrajes, instalación, transporte y margen. El precio se calcula en servidor. La mano de obra se configura para cada mueble.

## Importar y exportar

**Exportar** descarga el catálogo actual en CSV, incluidos los borradores. **Descargar plantilla CSV** proporciona la estructura admitida. El importador también recibe JSON con una lista de productos o un objeto `{ "products": [...] }`.

La importación muestra una vista previa antes de escribir. Todos los modelos se crean como borradores. Si hay errores de estructura, identificadores duplicados o identificadores que ya existen, se debe corregir el archivo antes de confirmar. Importar no sobrescribe los modelos existentes; para actualizarlos, usa el editor. Máximo de archivo y datos preparados en la interfaz: 1 MB; máximo de 200 muebles por importación.

## Errores y edición simultánea

Si una escritura falla, el formulario conserva los datos introducidos. Si otra persona modificó el mismo registro, el servidor rechaza una versión antigua para evitar sobrescribirla. Copia tus cambios, recarga los datos actuales y vuelve a aplicarlos. Una pérdida de conexión se muestra como error; no se anuncia un guardado hasta recibir respuesta del servidor.

Los ajustes pendientes bloquean el cierre de sesión para prevenir una pérdida accidental. El navegador solicita confirmación si se abandona la página con cambios pendientes. Cerrar un editor modificado también requiere confirmar el descarte.
