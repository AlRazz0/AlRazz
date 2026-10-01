# Códigos de acceso por Gmail, sin dominio propio

El capo puede enviar el segundo código mediante un proyecto de Google Apps Script propiedad del administrador. La web y los datos siguen en Cloudflare. Esta conexión usa `MailApp`, que permite enviar mensajes sin leer el buzón, y no necesita la contraseña de Gmail.

Google publica una cuota de **100 destinatarios por día para cuentas personales**. El relay limita su propio uso a 90 envíos en 24 horas, cinco por quince minutos y un minuto entre envíos; otros scripts de la misma cuenta también consumen la cuota de Google. Alcanzar el límite genera un error y permite usar TOTP; no activa un servicio de pago. Estas cuotas pueden cambiar.

## Estado y consentimiento

Tener el código desplegado no significa que Gmail esté conectado. El propietario debe iniciar sesión, autorizar el permiso de envío del proyecto y desplegarlo. No anunciar el envío como operativo antes de recibir un código real y completar un acceso con él. La respuesta del servicio confirma aceptación, no garantiza la llegada a la bandeja de entrada.

## Preparar el proyecto de Google

1. Entra en [Google Apps Script](https://script.google.com/home) con la cuenta de administración. Crea un proyecto llamado **El capo · Códigos de acceso**.
2. Copia `integrations/admin-email/Code.gs` al editor del proyecto.
3. En **Configuración del proyecto**, muestra el manifiesto `appsscript.json` y sustituye su contenido por `integrations/admin-email/appsscript.json`. El único ámbito OAuth necesario es `https://www.googleapis.com/auth/script.send_mail`.
4. Genera una clave criptográfica aleatoria de 32 bytes, representada como 64 caracteres hexadecimales. En **Propiedades de la secuencia de comandos**, configura `ADMIN_EMAIL` con el correo autorizado y `ADMIN_EMAIL_RELAY_SECRET` con esa clave. No pongas la clave en el código, Git, un mensaje del chat ni una URL. Debe coincidir con el secreto del Worker; no reutilices `SESSION_SECRET` ni la semilla TOTP.
5. Ejecuta `authorizeEmail` y autoriza el envío cuando Google lo solicite. Esta función consulta la cuota; no manda correos. El consentimiento pertenece al propietario de la cuenta.
6. Selecciona **Implementar → Nueva implementación → Aplicación web**. Ejecutar como: **Yo**. Acceso: **Cualquier usuario**. Aunque Google expone un punto de entrada HTTP, el código exige una firma secreta válida para enviar; una visita o POST arbitrario no manda correo. Revisa y autoriza esta configuración antes de publicar.
7. Conserva la URL de implementación terminada en `/exec`. No uses `/dev` ni enlaces del editor. Si actualizas el código, publica una nueva versión de esa misma implementación.

Si Google bloquea la autorización o exige una comprobación adicional, el propietario debe completarla. No omitas la autorización ni amplíes los permisos para resolver un error.

## Conectar Cloudflare

En el Worker `alrazz`, guarda como secretos del servidor:

| Nombre | Valor |
| --- | --- |
| `ADMIN_EMAIL_PROVIDER` | `apps-script` |
| `ADMIN_EMAIL_RELAY_URL` | URL HTTPS de implementación `/exec` |
| `ADMIN_EMAIL_RELAY_SECRET` | La misma clave aleatoria que se guardó en Google |

Se conserva el `ADMIN_EMAIL` existente. No cambies el hash de contraseña, TOTP, recuperación ni sesiones al conectar correo. Puedes utilizar **Settings → Variables and Secrets** o `wrangler secret put` con entrada privada; nunca valores en argumentos, `VITE_*`, archivos públicos o variables versionadas. No hace falta modificar Pages: su API llega al mismo Worker.

El Worker solo acepta la URL `https://script.google.com/macros/s/…/exec` y el retorno de contenido de Google. Verifica la confirmación JSON y el identificador de envío; una página HTML de error con HTTP 200 no cuenta como éxito. Una configuración incompleta o un proveedor desconocido desactiva esta opción, sin recurrir silenciosamente a otro servicio.

## Comprobación real

1. Abre `/admin`, introduce correo y contraseña y pulsa **Continuar**.
2. Elige **Recibir un código por correo** y **Enviar código al correo autorizado**.
3. Comprueba que el mensaje de **El capo** llega al Gmail correcto. Revisa Spam. No compartas el código en el chat ni lo registres en logs.
4. Introduce el código en el panel y confirma que se abre la administración. Cierra sesión al finalizar.

El código queda vinculado al desafío de ese navegador y solo puede usarse una vez. Reenviar invalida el anterior. Un fallo de envío no concede acceso. Si alcanzas una cuota o revocas el permiso de Google, utiliza la app autenticadora mientras se restablece el correo.

## Controles del relay

La solicitud contiene versión, hora, identificador, destinatario, código y HMAC-SHA256. El script comprueba la firma y una ventana temporal de dos minutos. El destinatario y el texto del mensaje están fijados por el servidor; el endpoint no es un servicio de correo general. `ScriptProperties` y `LockService` protegen frente a envíos simultáneos y repetidos. Los registros temporales conservan identificadores, firmas de deduplicación y contadores, nunca los códigos ni los cuerpos de los mensajes.

La autorización de Google, los límites de Apps Script y su disponibilidad siguen siendo dependencias externas. Un endpoint público puede recibir tráfico inválido que consuma ejecuciones de Google, aunque no consiga enviar mensajes. TOTP permite ingresar si el transporte de correo está temporalmente indisponible.

## Referencias oficiales

- [MailApp: permiso de envío, sin lectura del buzón](https://developers.google.com/apps-script/reference/mail/mail-app).
- [Cuotas de Google Apps Script](https://developers.google.com/apps-script/guides/services/quotas).
- [Publicar aplicaciones web y ejecutar como propietario](https://developers.google.com/apps-script/guides/web).
- [Redirecciones del servicio de contenido](https://developers.google.com/apps-script/guides/content).
- [Limitación de `resend.dev` a pruebas](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).
