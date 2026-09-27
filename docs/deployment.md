# Publicación con GitHub y Cloudflare

GitHub conserva el código y valida cada cambio. Cloudflare ejecuta el Worker, sirve `dist/client` y conserva el catálogo y los diseños en D1. Publicar únicamente archivos en GitHub Pages no ejecutaría esta API ni permitiría que el panel guardase cambios compartidos entre visitantes.

La condición del proyecto es **cero costo**. Este repositorio no compra dominios, activa suscripciones ni cambia planes. La dirección inicial puede ser `https://alrazz.<subdominio-de-la-cuenta>.workers.dev`. Workers Free y D1 tienen límites; al alcanzarlos puede dejar de funcionar parte de la web. No se ofrece capacidad ilimitada.

## Autenticación compatible con la modalidad gratuita

La contraseña conserva el mismo hash scrypt y el segundo paso obligatorio. El cálculo costoso se ejecuta en `AdminPasswordVerifier`, un Durable Object privado basado en SQLite. Los Durable Objects SQLite están disponibles en Workers Free y cuentan con un presupuesto de CPU diferente del Worker público. No hay una ruta HTTP pública para ese verificador ni un fallback que ejecute scrypt en el Worker de 10 ms.

La comprobación previa exige la vinculación `ADMIN_PASSWORD_VERIFIER` y la migración `v1-admin-password-verifier` con `new_sqlite_classes: ["AdminPasswordVerifier"]`, tanto en la configuración fuente como en la generada por el build. Si falta el servicio, el acceso falla cerrado. Hay que comprobar una autenticación real y sus métricas de CPU en el entorno alojado antes de dar por validada la producción. Los límites gratuitos de solicitudes, duración y almacenamiento siguen siendo aplicables; no se activa automáticamente un plan de pago al alcanzarlos.

El flujo manual de GitHub Actions está preparado, pero aún faltan una cuenta conectada, D1 real y secretos nuevos de producción. El identificador D1 incluido en `wrangler.jsonc` es un ejemplo y se rechaza antes de consultar Cloudflare. Configurar el flujo no significa que la web ya esté en línea.

## Aprovisionamiento pendiente

1. Iniciar sesión en una cuenta de Cloudflare del propietario y comprobar en el panel que Workers está en **Free**, sin activar pagos. Los tokens OAuth de Wrangler y los tokens API deben permanecer privados.
2. Crear credenciales nuevas de producción; no copiar las de la demostración local. Conservar la vinculación y migración del verificador SQLite en `wrangler.jsonc`.
3. Crear una base D1 llamada `alrazz-db` en esa cuenta. Sustituir únicamente `database_id` de la vinculación `DB` en `wrangler.jsonc`. El UUID de la base es configuración, no una contraseña. Confirmar este cambio mediante PR.
4. Aprovisionar los secretos de producción mediante Cloudflare o `wrangler secret put`: `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `ADMIN_TOTP_SECRET`, `ADMIN_RECOVERY_HASHES` y `SESSION_SECRET`. El Durable Object hereda los secretos del mismo Worker; no necesita un token público adicional. Nunca usar `VITE_*` ni guardar valores en Git.
5. Crear el entorno `production` en GitHub Actions. Añadir los secretos `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`, y la variable `ALRAZZ_PUBLIC_URL` con el origen HTTPS completo, sin rutas. El token debe limitarse a esta cuenta con Workers Scripts: Edit y D1: Edit. No se solicita permiso de facturación ni se llama a APIs que cambien suscripciones. La primera provisión del subdominio `workers.dev` puede requerir intervención del propietario en el panel.

El listado de secretos de Cloudflare permite comprobar sus nombres, no sus valores. La prueba final comprueba que la aplicación reconoce una configuración administrativa válida. El aprovisionamiento inicial del Worker y sus secretos se realiza antes del primer flujo; un Worker inexistente o sin secretos hace fallar la comprobación previa y no se publica a medias.

Los códigos enviados por correo son opcionales y requieren `RESEND_API_KEY` y `ADMIN_EMAIL_FROM`, con remitente verificado. El flujo no configura un proveedor de correo, no envía pruebas automáticamente y no activa planes de pago. Hasta resolver el envío gratuito, la interfaz debe mostrar su disponibilidad real.

## Cómo funciona el flujo

`Publicar AlRazz en Cloudflare` se ejecuta desde **Actions → Run workflow**, exclusivamente en `main`. Los cambios enviados a GitHub siguen ejecutando las validaciones habituales; un push no publica por sí solo. El flujo tiene permisos de GitHub de solo lectura y serializa los despliegues sin cancelar uno que esté aplicando migraciones.

Secuencia:

1. Instalar las dependencias fijadas y ejecutar TypeScript, pruebas, build y pruebas aisladas de autenticación.
2. Comprobar el verificador SQLite, configuración D1 real, URL, build, existencia de la base y nombres de secretos. Los accesos de esta fase son de lectura. El plan Free se verifica en el panel durante el aprovisionamiento; el flujo no consulta facturación ni puede certificar el plan contratado.
3. Aplicar solo las migraciones pendientes a D1 y publicar el Worker y los archivos web.
4. Consultar portada, catálogo y estado anónimo del administrador. No iniciar sesión, enviar correo, modificar productos ni crear diseños de prueba.

La primera consulta al catálogo puede cargar los datos iniciales mediante el mecanismo de inicialización de la aplicación. Si D1 ya está inicializada, no reemplaza sus datos, no reactiva muebles ocultos y no modifica precios del administrador.

Si falla una comprobación anterior al despliegue, no se ejecutan migraciones ni publicación. Si falla la comprobación final, el despliegue ya ocurrió: el flujo queda en rojo y requiere diagnóstico. No revierte automáticamente D1 ni borra datos. Antes de añadir futuras migraciones incompatibles hay que preparar un plan de recuperación; volver a un Worker anterior no deshace una migración.

Para revisar la configuración sin red: `node scripts/check-deployment.mjs config`. Para comprobar una publicación existente: definir `ALRAZZ_PUBLIC_URL` y ejecutar `node scripts/check-deployment.mjs smoke`. El segundo comando consulta exclusivamente la URL proporcionada y no necesita contraseñas ni tokens de Cloudflare.

## Referencias

- [Límites de Workers Free](https://developers.cloudflare.com/workers/platform/limits/)
- [Durable Objects en el plan gratuito](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [Límites de Durable Objects](https://developers.cloudflare.com/durable-objects/platform/limits/)
- [Precios y cuotas de D1](https://developers.cloudflare.com/d1/platform/pricing/)
- [Direcciones workers.dev](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)
- [Permisos de tokens API](https://developers.cloudflare.com/fundamentals/api/reference/permissions/)
- [Secretos de Workers](https://developers.cloudflare.com/workers/configuration/secrets/)
