# Identidad de AlRazz y El capo

**AlRazz** identifica la plataforma técnica del taller. La marca visible del producto continúa siendo **El capo**, con la firma **Muebles en melamina Marlon**. Se conservan el logotipo, las cuentas, los accesos y la información administrativa existentes.

## Lenguaje visual

La referencia es un plano de taller: líneas finas, medidas legibles, numeración y superficies claras. La identidad se expresa con tinta `#172b36`, azul profundo `#154c75` y marfil `#f6f3ea`. La lima apagada `#c2cb93` se reserva para detalles discretos y estados; no es el color principal de lectura. Los grises azulados acompañan las separaciones y la información secundaria.

El archivo `src/alrazz-identity.css` define los tokens `--alrazz-*` y ajustes de presentación para portada, navegación, catálogo, estudio de diseño y administración. Las clases auxiliares `.alrazz-eyebrow`, `.alrazz-blueprint` y `.alrazz-measure-tag` permiten introducir notas y detalles de plano sin añadir imágenes externas.

El logotipo cromado y los botones de cotización plateados conservan su carácter. Las composiciones, textos y recursos deben ser propios del taller. Una imagen generada o renderizada se identifica como **render** o **visualización**; no se presenta como fotografía de un trabajo realizado sin una referencia real que lo acredite.

La portada utiliza una hoja de taller con la miniatura SVG de un producto real de la API, su nombre y sus medidas. La cuadrícula, las líneas y los marcos pertenecen a la interfaz; no añaden piezas ni cambian el producto. El bloque técnico y el texto se apilan en móvil para conservar la lectura. La portada no necesita una fotografía externa ni una recreación de la composición de otra marca.

## Interacción y contenido

Las medidas y los estados tienen prioridad sobre el adorno. Los controles deben conservar foco visible, uso por teclado, etiquetas claras y objetivos de pulsación de al menos 44 px. La interfaz distingue una vista preliminar, una cotización calculada y una versión guardada. El color acompaña esas diferencias, pero nunca es su única señal.

El catálogo, los acabados, las tarifas y los contactos proceden de la API. No se añaden muebles o importes de ejemplo a la interfaz pública para completar una composición. Los ajustes visuales no modifican el visor, el motor de geometría, los tableros de **18 mm**, los precios ni los snapshots.

## Gestión de solicitudes

El CRM administrativo organiza solicitudes **Recibidas**, **Contactadas**, **Cotizadas**, **Aceptadas** y **Perdidas**. Aceptada describe una decisión comercial registrada; no acredita un pago ni crea una venta. Los importes ausentes se muestran como **Por cotizar**, conservando la diferencia frente a un importe numérico de cero.

La ficha separa el seguimiento editable de la composición y los importes guardados. El historial registra cambios de seguimiento y permanece de solo lectura. Los datos de contacto y las notas son privados del panel con contraseña y segundo factor. No se guardan borradores de contacto en almacenamiento público del navegador ni se incorporan datos reales de clientes a fixtures, documentación o capturas de prueba.

Las métricas de cotizadas y aceptadas describen el estado actual de las solicitudes; no suman ingresos. El tiempo hasta el primer contacto se muestra únicamente cuando existe una transición registrada a **Contactada**. Es el tiempo de registro del seguimiento, no una medición de llamadas o mensajes enviados.

Responsable, fecha de seguimiento, notas y motivo de pérdida se guardan con control de versión. Ante un conflicto, la ficha conserva el borrador y permite cargar los valores actuales para compararlos antes de guardar. Cambiar de ficha con notas pendientes requiere decidir si se conservan o descartan. Si la sesión caduca, la interfaz retira los contactos y pide verificar el acceso de nuevo.
