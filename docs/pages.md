# Dirección corta con Cloudflare Pages

Pages sirve una copia del frontend compilado y envía únicamente `/api/*` al
Worker existente `alrazz` mediante el Service binding `ALRAZZ`. El Worker conserva
D1, el verificador de contraseñas, las credenciales y la dirección `workers.dev`.
No se crea otra base de datos ni se duplican los secretos del administrador.

La configuración de Pages está en `hosting/pages/wrangler.jsonc`. La configuración
principal `wrangler.jsonc` sigue perteneciendo al Worker. **Wrangler 4.92 no admite
`--config` personalizado para `pages deploy`**: el comando debe usar
`--cwd hosting/pages` para descubrir el archivo de Pages sin modificar el principal.

## Preparar y publicar

Ejecutar desde la raíz del repositorio, con el Worker `alrazz` ya publicado en la
misma cuenta de Cloudflare:

```sh
npm run build
node scripts/prepare-pages.mjs
node --test tests/pages.test.mjs
```

Crear el proyecto una sola vez, si aún no existe:

```sh
npx wrangler pages project create alrazz --production-branch main --cwd hosting/pages
```

Publicar el frontend y el proxy:

```sh
npx wrangler pages deploy --cwd hosting/pages --project-name alrazz --branch main
```

Cloudflare confirma la dirección asignada al crear el proyecto. `alrazz.pages.dev`
depende de disponibilidad; puede recibir un sufijo si ya está ocupado. Direct
Upload también permite publicar desde GitHub Actions, aunque el proyecto no puede
cambiar después a la integración Git nativa de Pages.

El despliegue utiliza `dist/pages`, generado exclusivamente desde `dist/client`.
El preparador omite archivos ocultos, variables de entorno, mapas de código y
archivos de servidor; rechaza enlaces simbólicos. Añade solo `_worker.js` y
`_routes.json` desde `hosting/pages`. Nunca se debe publicar la raíz `dist`, el
repositorio completo ni `dist/alrazz`.

Cuando una entrega cambia frontend y backend, publicar primero el Worker y luego
repetir la preparación y publicación de Pages del mismo commit. Actualizar solo el
Worker no actualiza la copia estática que sirve Pages.

## Publicar desde el Dashboard

Si la sesión de Wrangler no tiene permiso para Pages, se puede utilizar la sesión
ya iniciada en el Dashboard sin crear tokens nuevos. En Workers & Pages, crear
un proyecto Pages por Direct Upload y cargar un ZIP que contenga **el contenido
de `dist/pages` en su raíz**, incluyendo `_worker.js` y `_routes.json`.

La carga desde Dashboard no aplica `hosting/pages/wrangler.jsonc`. Antes de dar
la publicación por terminada, configurar en Settings → Bindings, entorno
Production, el Service binding **`ALRAZZ` → Worker `alrazz`**, y publicar otra vez
el mismo ZIP para que el despliegue reciba el binding. Sin ese binding la API
responde 503, de forma intencional. No copiar secretos ni crear otra D1.

## Rutas, autenticación y comprobaciones

`_routes.json` limita la ejecución de Functions a `/api/*`. HTML, JavaScript,
CSS e imágenes se sirven como estáticos. Al no incluir un `404.html` raíz, Pages
utiliza su fallback SPA para `/admin`, `/configurar` y las demás rutas del cliente.

El proxy entrega el `Request` original al binding fijo: no sustituye URL, `Origin`,
cookies ni cuerpo y no acepta destinos externos indicados por el visitante. Las
comprobaciones de mismo origen y MFA continúan en el backend. Las respuestas y
sus cabeceras `Set-Cookie` vuelven sin modificarse.

Después de publicar, comprobar portada, rutas profundas, carga de muestras,
catálogo y cotización; un POST del mismo origen debe funcionar y un origen ajeno
debe seguir recibiendo 403. El despiece debe seguir devolviendo 401 sin MFA.
Verificar también acceso administrativo completo y permanencia de la URL larga.
Las cookies y el almacenamiento del navegador son independientes entre ambos
dominios: se inicia sesión nuevamente al visitar la dirección corta.

Pages Functions participa de la cuota diaria compartida de Workers Free; los
archivos estáticos que no invocan Functions son gratuitos e ilimitados. Esta
configuración no requiere contratar otro plan. Los límites de D1 y Durable
Objects del backend siguen aplicándose.

Fuentes oficiales:

- [Service bindings de Pages](https://developers.cloudflare.com/pages/functions/bindings/#service-bindings)
- [Advanced mode](https://developers.cloudflare.com/pages/functions/advanced-mode/)
- [Rutas de Functions](https://developers.cloudflare.com/pages/functions/routing/)
- [Fallback SPA de Pages](https://developers.cloudflare.com/pages/configuration/serving-pages/#single-page-application-spa-rendering)
- [Precios de Pages Functions](https://developers.cloudflare.com/pages/functions/pricing/)
- [Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/)
