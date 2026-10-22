# Acceso administrativo

AlRazz tiene un único correo autorizado, configurado exclusivamente en el servidor. No hay registro público ni una ruta que permita reclamar la administración. El correo es un identificador autorizado; no se afirma haber verificado la propiedad del buzón mediante el alta local.

## Dos pasos obligatorios

1. Correo y contraseña correctos crean un desafío temporal. Todavía no permiten leer datos privados ni modificar el catálogo.
2. Una aplicación autenticadora genera el código TOTP de seis dígitos. También puede solicitarse un código por correo cuando el envío esté configurado. Un código de recuperación de un solo uso permite completar el segundo paso si no se dispone de los otros métodos.

Cada desafío caduca a los cinco minutos y admite intentos limitados. Los límites de cuenta y dirección permanecen entre desafíos. La API consume los códigos y el desafío antes de crear una sesión. Las sesiones duran ocho horas, tienen cookies HttpOnly y SameSite=Strict (Secure sobre HTTPS) y se pueden revocar en D1; cerrar sesión invalida también copias del token. Cambiar las credenciales del servidor invalida sesiones y desafíos anteriores. Las cookies del sistema anterior no dan acceso.

La contraseña se guarda como hash scrypt con sal aleatoria, N=32768, r=8 y p=3. Este perfil está recogido en [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html#scrypt). TOTP utiliza SHA-1, pasos de 30 segundos, seis dígitos y tolerancia de un paso, con protección contra reutilización según [RFC 6238](https://www.rfc-editor.org/rfc/rfc6238.html). El secreto TOTP y los hashes de recuperación son secretos del servidor; nunca se entregan desde una ruta de inicio de sesión.

## Preparación local

```sh
npm run setup:local -- --email administrador@example.com
npm run db:local
npm run dev
```

Usa tu correo autorizado en lugar del ejemplo. Sin `--email`, se conserva el existente o se usa el correo reservado `admin@alrazz.test`, exclusivamente como muestra. El script transforma la contraseña local anterior en un hash y conserva el catálogo. Los archivos `.dev.vars`, `.admin-credentials.txt` y `.admin-mfa.txt` están excluidos de Git. Nunca se imprimen contraseñas ni semillas en la terminal.

El archivo privado `.admin-credentials.txt` contiene la contraseña inicial local. `.admin-mfa.txt` contiene la clave para agregar una cuenta basada en tiempo a una aplicación autenticadora y ocho códigos de recuperación. Guarda la contraseña en un gestor, vincula la app, guarda los códigos por separado y retira esos archivos después. Ejecutar de nuevo la preparación conserva los secretos; `--reset-mfa` los rota explícitamente. `--password-stdin` permite establecer otra contraseña de 16 a 512 caracteres mediante entrada estándar, sin ponerla en argumentos del proceso ni en Git. Reinicia Vite tras cambiar secretos.

## Correo como segundo factor

El transporte se selecciona con `ADMIN_EMAIL_PROVIDER`. Para una cuenta Gmail sin dominio propio, `apps-script` utiliza un relay del propietario en Google Apps Script: requiere `ADMIN_EMAIL_RELAY_URL` y `ADMIN_EMAIL_RELAY_SECRET` en los secretos del servidor. La [guía de activación](correo-gmail.md) explica la autorización de envío, los límites y la prueba de recepción. MailApp solo necesita permiso para enviar; no se utiliza la contraseña de Gmail ni acceso de lectura al buzón.

La opción `resend` (predeterminada para instalaciones anteriores) utiliza [Resend Send Email](https://resend.com/docs/api-reference/emails/send-email). Requiere `RESEND_API_KEY` y `ADMIN_EMAIL_FROM`, con un [dominio remitente verificado](https://resend.com/docs/dashboard/domains/introduction). El dominio compartido `resend.dev` solo sirve para pruebas y no se presenta como remitente de producción.

Hasta configurar el proveedor, la interfaz indica que el envío está pendiente y no simula un mensaje entregado. El usuario debe solicitar cada envío expresamente después de la contraseña. Hay límites de envíos y reintentos; reenviar invalida el código anterior. Un fallo del proveedor no abre una sesión ni devuelve el código en JSON. La confirmación de la API de correo significa aceptación del envío, no entrega comprobada al buzón. Antes de publicar, realiza una prueba real de recepción y revisa las políticas de envío del dominio.

## Producción

Configura valores nuevos en los secretos de Cloudflare: `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `ADMIN_TOTP_SECRET`, `ADMIN_RECOVERY_HASHES` (array JSON de hashes) y `SESSION_SECRET`. Para correo, añade la configuración del transporte elegido indicada arriba. No reutilices los secretos de la muestra ni pongas valores en `VITE_*`, `wrangler.jsonc`, un PR o la conversación. La semilla del autenticador se entrega al propietario por un canal privado de aprovisionamiento, nunca como respuesta pública.

El verificador usa `node:crypto` con `nodejs_compat`, soportado por [Cloudflare Workers](https://developers.cloudflare.com/workers/runtime-apis/nodejs/crypto/). La comprobación scrypt se ejecuta exclusivamente en el Durable Object interno `AdminPasswordVerifier`, con backend SQLite compatible con Workers Free. Sus [límites específicos](https://developers.cloudflare.com/durable-objects/platform/limits/) contemplan 30 segundos de CPU por petición; así se mantiene el perfil criptográfico sin ejecutar ese cálculo en el Worker público, cuyo presupuesto gratuito es de 10 ms.

El Worker aplica primero los límites de intentos persistentes en D1 y después llama al objeto por su binding `ADMIN_PASSWORD_VERIFIER`. El objeto lee el hash desde los secretos del servidor, verifica la huella esperada y devuelve un booleano. No tiene una ruta pública ni persiste contraseñas. Si falta el binding o falla la llamada, el acceso se deniega temporalmente; no se sustituye por un hash más débil ni se omite el segundo factor.

Workers Free y Durable Objects Free tienen cuotas. Según los [precios oficiales](https://developers.cloudflare.com/durable-objects/platform/pricing/), agotar una cuota gratuita de Durable Objects provoca errores hasta su restablecimiento. La aplicación y el flujo de publicación no contratan ni cambian planes. Antes de publicar, comprobar que la cuenta usa Workers Free y medir el acceso completo en ese entorno: Miniflare verifica el comportamiento, pero no reproduce la aplicación de los límites de CPU del servicio. El resto del código del Worker también debe caber en el presupuesto gratuito. Ver [publicación en Cloudflare](deployment.md).

Aplica las migraciones pendientes con `npm run db:remote`. Comprueba HTTPS, acceso sin segundo factor denegado, códigos repetidos rechazados, recuperación de un solo uso y revocación al salir. No hay restablecimiento automático de contraseña por correo ni cuentas de empleados: una recuperación administrativa requiere intervención del propietario en los secretos del servidor. Conservar un código de recuperación no sustituye conocer la contraseña.

## Pruebas

`npm test` valida criptografía y motor. Después de `npm run build`, `npm run test:auth-api` verifica la autenticación contra un Worker y D1 aislados, con correo simulado y red externa bloqueada. No usa datos del propietario ni envía mensajes. Con la muestra local encendida, `npm run test:api` comprueba el catálogo real con fixtures temporales, autentica mediante TOTP y preserva sus datos; no consume códigos de recuperación personales.


## Llaves de acceso (WebAuthn)

El propietario único conserva la cuenta definida en `ADMIN_EMAIL`. No se crean cuentas de INOX ni se comparten llaves entre sitios. La pestaña **Llaves de acceso** permite registrar y revocar credenciales individuales: exige una sesión con ambos factores ya completados y confirmar la contraseña actual. Windows Hello puede verificar al propietario mediante el PIN o la biometría de esta PC, sin teléfono. Esos datos y la clave privada permanecen en el autenticador; el servidor almacena únicamente la clave pública y metadatos.

Una vez registrada una llave, el panel ofrece contraseña + llave como segundo paso principal. Se mantienen los métodos TOTP, correo solicitado y recuperación ya existentes. No se envían correos al abrir ni cancelar el diálogo de la llave. Algunas plataformas sincronizan llaves entre dispositivos: el nombre elegido es una etiqueta administrativa y no una garantía de vinculación física a un único equipo. La verificación local del usuario es obligatoria (`userVerification: required`).

El verificador es `@simplewebauthn/server` 14.0.0, con Web Crypto y algoritmos ES256/RS256. Los retos duran como máximo tres minutos, están vinculados a la sesión, propietario, huella de credenciales, origen y RP, y D1 los consume con una operación condicional de un solo uso antes de verificar la firma. Los intentos fallidos también consumen el reto. El registro exige coincidencia entre ID del navegador e ID atestado, presencia y verificación de usuario. La autenticación comprueba firma, contador, `userHandle` cuando existe y credenciales permitidas. No se admite contexto cruzado ni un RP derivado libremente del encabezado de la petición.

Revocar una llave la conserva como registro inactivo e invalida todas las sesiones creadas con esa credencial. Conserva las sesiones iniciadas con otras llaves o factores. La API vuelve a comprobar la revocación en cada petición protegida y antes de finalizar un reto. Cerrar la sesión que inició un registro impide finalizarlo; rotar las credenciales administrativas también invalida las sesiones y retos pendientes.

### Publicación y habilitación

Esta entrega no registra un dispositivo del propietario ni activa secretos. Antes de desplegar el código, aplicar la migración aditiva `0004_passkeys.sql` a la D1 correcta, después del respaldo y revisión habituales. Es necesaria incluso con la función apagada porque las consultas de sesión usan la nueva columna `passkey_id`. No recrear D1 ni ejecutar preparadores de acceso.

Las variables públicas de `wrangler.jsonc` preparan la habilitación en el próximo despliegue revisado; no reemplazan ningún secreto ni registran dispositivos. En el Worker de ALRAZZ se conservan todas las credenciales existentes:

- `ADMIN_PASSKEYS_ENABLED=1` para habilitar la función revisada en producción; usar `0` para desactivarla.
- `ADMIN_PASSKEY_RP_ID=alrazz.pages.dev`.
- `ADMIN_PASSKEY_ORIGIN=https://alrazz.pages.dev`.

Las llaves se registran y usan desde esa dirección HTTPS estable. El proxy de Pages conserva el origen original; una URL alternativa del Worker o una vista previa no ofrece las llaves de este RP. Cambiar de dominio exige un proceso deliberado de nueva vinculación usando los factores existentes. El ejemplo `.dev.vars.example` mantiene las llaves apagadas en local. Para una prueba local explícita, usar RP `localhost` y origen `http://localhost:<puerto>`; una llave local no sirve para producción. Desactivar el indicador impide registrar y usar llaves, oculta su listado e invalida temporalmente sus sesiones; conserva la vía de acceso anterior.

Después de publicar, el propietario entra por un factor existente, abre **Llaves de acceso**, asigna un nombre y confirma la contraseña; el navegador muestra la inscripción personal en Windows Hello o su gestor de llaves. Debe comprobar un nuevo acceso con la llave y mantener un método de recuperación antes de retirar cualquier factor anterior. La inscripción real, cuotas y CPU en Workers Free requieren comprobación en el entorno público; las pruebas locales no certifican esos límites.

`npm run test:auth-api` incluye firmas ES256/RS256 reales con autenticadores sintéticos, D1 aislada y red externa bloqueada; cubre reutilización, caducidad, vinculación de sesión, origen/RP, UV, revocación y carreras. No usa llaves, contraseñas ni correos del propietario. Referencia: [SimpleWebAuthn Server](https://simplewebauthn.dev/docs/packages/server).
