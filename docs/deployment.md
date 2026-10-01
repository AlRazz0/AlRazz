# Publicación con GitHub y Cloudflare

GitHub conserva el código y valida cada cambio. Cloudflare ejecuta el Worker, sirve `dist/client` y conserva el catálogo y los diseños en D1. Publicar únicamente archivos en GitHub Pages no ejecutaría esta API ni permitiría que el panel guardase cambios compartidos entre visitantes.

La condición del proyecto es **cero costo**. Este repositorio no compra dominios, activa suscripciones ni cambia planes. La dirección asignada es [alrazz.alrazz-cusco.workers.dev](https://alrazz.alrazz-cusco.workers.dev). Workers Free y D1 tienen límites; al alcanzarlos puede dejar de funcionar parte de la web. No se ofrece capacidad ilimitada.

## Autenticación compatible con la modalidad gratuita

La contraseña conserva el mismo hash scrypt y el segundo paso obligatorio. El cálculo costoso se ejecuta en `AdminPasswordVerifier`, un Durable Object privado basado en SQLite. Los Durable Objects SQLite están disponibles en Workers Free y cuentan con un presupuesto de CPU diferente del Worker público. No hay una ruta HTTP pública para ese verificador ni un fallback que ejecute scrypt en el Worker de 10 ms.

La comprobación previa exige la vinculación `ADMIN_PASSWORD_VERIFIER` y la migración `v1-admin-password-verifier` con `new_sqlite_classes: ["AdminPasswordVerifier"]`, tanto en la configuración fuente como en la generada por el build. Si falta el servicio, el acceso falla cerrado. El acceso completo ya se comprobó en Workers Free; sus métricas exactas de CPU y su capacidad bajo carga no se han medido. Los límites gratuitos de solicitudes, duración y almacenamiento siguen siendo aplicables; no se activa automáticamente un plan de pago al alcanzarlos.

## Aprovisionamiento inicial y siguientes versiones

La cuenta está conectada y su panel confirmó **Workers Free, $0**. La base `alrazz-db` está creada y `wrangler.jsonc` contiene su UUID real. El aprovisionamiento inicial aplicó las dos primeras migraciones y configuró los cinco secretos administrativos. Los controles siguen rechazando identificadores D1 de ejemplo; no deben desactivarse.

La primera publicación (`6e8ce787-7d51-4694-984e-0f654c6f8187`) pasó la comprobación HTTPS de portada, catálogo y acceso administrativo con contraseña y TOTP. Las versiones siguientes amplían ese catálogo; no vuelven a sembrarlo ni reemplazan credenciales. La dirección principal actual es **alrazz.pages.dev**, conectada al mismo Worker por un binding de servicio.

La entrega de cocinas añade `0003_kitchens.sql`, una tabla independiente de snapshots. Aplicar esta migración antes de desplegar las rutas nuevas. Publicar Worker y Pages del mismo commit y después importar los doce borradores de `catalog/coleccion-cocinas-vitrinas.json` por la API administrativa; activar únicamente esos IDs tras validarlos. No reemplazar registros anteriores ni ajustes del taller. Si ya existen IDs de la colección, revisar el estado antes de continuar en lugar de repetir la importación.

El flujo manual de GitHub Actions está preparado, pero falta su token API dedicado. La publicación inicial utilizó OAuth local de Wrangler; ese token temporal no se copia a GitHub.

## Publicación desde el equipo autorizado

Con los cambios revisados, las pruebas de la sección **Verificar** del README aprobadas y la cuenta todavía en Workers Free:

```sh
npx wrangler login
node scripts/check-deployment.mjs config
npm run build
npm run db:remote -- --config wrangler.jsonc
npm run deploy
```

Conservar la vinculación y migración SQLite del verificador. Los secretos permanecen en Cloudflare: `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `ADMIN_TOTP_SECRET`, `ADMIN_RECOVERY_HASHES` y `SESSION_SECRET`. El Durable Object hereda los secretos del mismo Worker. No recrear la base ni sobrescribir credenciales en cada publicación; para una rotación explícita, seguir la [guía de seguridad](admin-security.md). Nunca usar `VITE_*` ni guardar valores privados en Git.

Después del despliegue, ejecutar en PowerShell la comprobación pública de solo lectura:

```powershell
$env:ALRAZZ_PUBLIC_URL = 'https://alrazz.alrazz-cusco.workers.dev'
node scripts/check-deployment.mjs smoke
```

No iniciar la batería `test:api` contra producción: sus fixtures están limitados a la base local. La comprobación pública no inicia sesión, crea diseños ni envía correos.

## Habilitar la publicación desde GitHub

Configurar el entorno `production` en GitHub Actions con los secretos `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID`, y la variable `ALRAZZ_PUBLIC_URL` con el origen HTTPS anterior. El token API debe ser dedicado a esta integración y limitarse a la cuenta con Workers Scripts: Edit y D1: Edit. No reutilizar el OAuth local. No se solicita permiso de facturación ni se llama a APIs que cambien suscripciones.

El listado de secretos de Cloudflare permite comprobar sus nombres, no sus valores. La prueba final comprueba que la aplicación reconoce una configuración administrativa válida. El aprovisionamiento inicial del Worker y sus secretos se realiza antes del primer flujo; un Worker inexistente o sin secretos hace fallar la comprobación previa y no se publica a medias.

Los códigos enviados por correo admiten dos transportes: [Google Apps Script con Gmail propio](correo-gmail.md), sin comprar dominio, o Resend con remitente de dominio verificado. El primero usa `ADMIN_EMAIL_PROVIDER=apps-script`, `ADMIN_EMAIL_RELAY_URL` y `ADMIN_EMAIL_RELAY_SECRET`; el segundo conserva `RESEND_API_KEY` y `ADMIN_EMAIL_FROM`. La publicación de código no concede permisos de Google ni activa el correo por sí sola. Configura y autoriza el transporte, comprueba recepción real y acceso con ese código. El flujo de CI no envía pruebas ni activa planes de pago.

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
