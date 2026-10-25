# Asistente y seguimiento de cotizaciones

El asistente público está en `/asistente`. Usa medidas, uso, acabado, presupuesto opcional y servicios para proponer hasta tres opciones compatibles del catálogo vigente. Cada propuesta se comprueba con el mismo motor de muebles o cocinas de melamina de 18 mm. No se crean modelos nuevos ni se modifica el catálogo al buscar. Véase [el contrato del asistente](design-assistant.md).

## Del diseño a una solicitud

1. El cliente compara las propuestas y elige personalizar o solicitar cotización. Continuar guarda una versión mediante la API habitual; su importe se comprueba de nuevo y cualquier diferencia respecto a la propuesta se muestra.
2. En un diseño, cocina o selección de **Mis diseños**, puede abrir **Solicitar cotización al taller**. Se adjuntan identificadores y versiones; el navegador no envía precios aceptados como ciertos.
3. El formulario pide nombre, al menos un teléfono o correo, zona y un mensaje opcional. Requiere autorización expresa para responder y dar seguimiento a esa solicitud. Los datos no se incorporan a los enlaces públicos de los diseños.
4. La API comprueba la propiedad, versión, disponibilidad y cantidades y conserva un snapshot comercial de lo enviado, con precios históricos y materiales públicos. No recalcula las tarifas de los diseños guardados ni copia el despiece o los costos internos al CRM.
5. El cliente recibe una referencia. Un reintento exacto conserva esa misma solicitud. Registrar una solicitud no confirma un pedido, un pago, un envío de WhatsApp ni un correo automático.

Un enlace compartido puede consultarse sin ser propietario. Para solicitarlo, los editores comprueban su pertenencia al navegador actual; cuando es ajeno, ofrecen guardar una copia propia con las tarifas vigentes antes de adjuntarla al CRM. La versión compartida y sus importes históricos se conservan.

En **Mis diseños** las casillas determinan la selección que se solicita, suma, copia, descarga o comparte. Se admiten hasta 20 diseños por solicitud. Las cocinas conservan los servicios y los importes que se guardaron para la composición completa.

## Panel como CRM

Entra con el acceso y segundo factor existentes y abre **Cotizaciones · CRM**, o usa `/admin?tab=crm`.

- Etapas: **Recibida**, **Contactada**, **Cotizada**, **Aceptada** y **Perdida**. Marcar una solicitud como aceptada expresa una aceptación comercial manual; no acredita pago ni convierte el panel en contabilidad.
- La ficha reúne contacto, mensaje del cliente, fuentes y versiones guardadas, importes, responsable, próxima gestión, notas y motivo de pérdida.
- **Responsable** es una etiqueta organizativa; escribir un nombre no crea una cuenta ni concede acceso.
- Los cambios quedan en un historial por versión. Si otro navegador modifica la misma solicitud, se informa el conflicto y se conserva el borrador para compararlo con la versión actual.
- La búsqueda, etapas y vencimientos se filtran en servidor. La lista se pagina por cursor; los indicadores globales cuentan solicitudes y no ventas cobradas.
- Cambiar de pestaña administrativa conserva la ficha en edición. La sesión expirada impide consultar o cambiar datos y limpia la información privada visible.

### Próxima acción y agenda

Cada gestión puede tener un tipo (llamar, presentar cotización, visitar, revisar cambios o dar seguimiento), responsable y fecha. El tipo asignado necesita responsable y fecha antes de guardarse. **Completar acción** exige un resultado, lo registra en el historial y retira únicamente esa gestión pendiente. Sus reintentos exactos no crean otra finalización ni borran una nueva gestión posterior.

La agenda consulta el servidor por período UTC y responsable, incluye opcionalmente pendientes anteriores y pagina por fecha e identificador. Las solicitudes cerradas no aparecen como gestiones pendientes. Los registros históricos que tenían fecha pero no tipo se muestran como seguimiento.

### Cotización comercial por versión

La ficha permite preparar conceptos, cantidades, precios unitarios en PEN, instalación/transporte incluidos o excluidos, condiciones y vigencia. El servidor valida importes con precisión de céntimos y calcula el total; nunca recalcula el motor ni cambia los importes del diseño solicitado. La vigencia debe ser futura y de hasta 180 días.

**Emitir versión** congela el documento comercial y una copia del snapshot de origen, y registra su emisión. Una nueva emisión sustituye la versión anterior, conservando su documento e historial. Una versión aceptada por el cliente no se reemplaza mediante otra emisión silenciosa.

Las nuevas solicitudes conservan una vista pública de la geometría y materiales obtenida del resultado guardado. La vista del cliente muestra esa geometría mediante SVG, configuración exacta, módulos por pared A/B y servicios de esta versión. Las solicitudes históricas sin vista siguen mostrando su ficha y módulos disponibles; no se reconstruyen con productos o tarifas actuales. No se publican despiece, costes internos, contacto ni notas del CRM.

El panel ofrece **Copiar enlace**, sin enviar correos o WhatsApp. El enlace usa `/cotizacion#TOKEN`; el fragmento no se envía como URL al servidor. La página transmite el token por POST y establece `noindex` y política de referente. El acceso es por posesión del enlace: debe compartirse personalmente sólo con el destinatario previsto.

El token se obtiene con HMAC y un nonce aleatorio de 256 bits. D1 guarda el hash del token y el nonce, nunca el token o enlace en claro. Sólo una sesión administrativa con MFA puede recuperar el enlace derivándolo con `SESSION_SECRET`. Cambiar esa clave invalida los enlaces anteriores; los documentos y decisiones ya registrados se conservan.

El cliente debe revisar y aceptar expresamente la versión e importe mostrados, o describir los cambios que solicita. El servidor exige token válido, identificador y número exactos, vigencia y versión actual, además de consentimiento expreso para aceptar. Una versión sustituida o vencida no admite nuevas aceptaciones. La respuesta queda registrada atómicamente con el evento y el estado del CRM; los reintentos exactos conservan la decisión inicial. Pedir cambios registra la revisión pendiente sin enviar mensajes ni inventar responsables o fechas. Si ya había una gestión asignada y fechada, pasa a revisión de cambios; en caso contrario, la ficha pide al equipo asignarla antes de incorporarla a la agenda.

### Métricas por período

Las consultas abarcan fechas UTC inclusivas y un máximo de 366 días. Se separan solicitudes recibidas/contactadas, versiones comerciales emitidas, solicitudes con emisión, aceptaciones explícitas del cliente, solicitudes de cambios, acciones completadas y aceptaciones manuales.

La conversión de cohorte cuenta qué solicitudes recibidas en el período tuvieron aceptación explícita antes de su cierre; divide por esas mismas solicitudes para evitar mezclar clientes antiguos con captación nueva. El importe aceptado suma documentos aceptados por clientes en el período. **No es dinero cobrado**: no se registran pagos y cambiar manualmente una etapa a «Aceptada» no crea una aceptación del cliente ni una venta cobrada.

No se envían mensajes automáticamente. Los enlaces de teléfono o correo abren la aplicación elegida por el administrador; el envío sigue siendo una acción personal.

## Datos y API

La migración `0005_quote_requests.sql` añade tablas e índices independientes para solicitudes y eventos. No reemplaza productos, ajustes, diseños, cocinas ni datos de acceso. No se aplica al abrir la carpeta. La publicación requiere revisar y aprobar esa migración, obtener respaldo de producción y comprobar la conservación de los datos existentes.

`0006_commercial_quotes.sql` es aditiva: añade el tipo de próxima acción y versiones comerciales independientes. No se ha ejecutado sobre datos reales. Las operaciones comerciales no escriben sobre snapshots de diseños, cocinas ni solicitudes existentes.

- Público: `POST /api/store` con `op: "design-assistant"` o `op: "create-quote-request"`.
- Privado: `GET /api/store?action=quote-requests` y `action=quote-request&id=UUID`; `POST` con `op: "update-quote-request"`. Todas estas operaciones del CRM administrativo exigen sesión con segundo factor.
- Privado adicional: `action=commercial-quotes&id=UUID`, `action=crm-metrics&from=YYYY-MM-DD&to=YYYY-MM-DD` y `action=crm-agenda`; POST `issue-commercial-quote` y `complete-quote-action`. Emisión y finalización usan versiones y UUID de idempotencia.
- Enlace del cliente: POST `view-commercial-quote` y `respond-commercial-quote`, con token de enlace. La respuesta exige el identificador y número exactos de la versión; no existe consulta comercial pública por UUID.
- La lista acepta `status`, `q`, `overdue` y `cursor`. Los filtros se vinculan al cursor; el servidor rechaza cursores inválidos o reutilizados con otros filtros.
- Contactos, notas, snapshots y métricas administrativas no aparecen en los recibos públicos. Las escrituras usan parámetros SQL y validación estricta. Hay límites atómicos de solicitudes por propietario y por dirección de origen seudonimizada.

Los formularios no almacenan contactos en `localStorage`. Los datos de una solicitud se guardan en D1 para su gestión por el taller; este flujo no inscribe a nadie en campañas de marketing.

## Verificación

`npm run check`, `npm test`, `npm run build`, `npm run check:storefront`, `npm run test:auth-api`, `npm run test:kitchen-fit-api`, `npm run test:crm-api` y `npm run test:assistant-api`.

Las suites nuevas usan Worker compilado y D1 efímera con red bloqueada y datos sintéticos. Comprueban propiedad, segundo factor, privacidad, precio histórico, concurrencia, idempotencia, cuotas, filtros, paginación y propuestas del asistente. No cargan las bases ni los archivos de entorno conservados.
