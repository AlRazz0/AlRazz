# Datos y conectividad de AlRazz

El catálogo, los materiales, las tarifas, la disponibilidad y los diseños se guardan en **Cloudflare D1**. El navegador consulta `/api/store` y `/api/quote`; no necesita cambios de código ni despliegues para publicar, editar o retirar un modelo de la familia paramétrica disponible.

`server/index.ts` es un Worker con un binding `DB` y un binding `ASSETS` para servir el frontend. `migrations/0001_catalog.sql` contiene el esquema. El motor geométrico y sus reglas de fabricación están en `lib/furniture.ts` y se reutilizan en el servidor. La geometría es código permanente; los modelos de catálogo y las decisiones comerciales son datos administrables.

## Arranque local

1. Instalar dependencias con `npm ci`.
2. Ejecutar `npm run setup:local`. Crea `.dev.vars` con credenciales aleatorias; no reemplaza un archivo existente y no sube secretos a GitHub.
3. Ejecutar `npm run db:local` para aplicar la migración a D1 local.
4. Ejecutar `npm run dev` y abrir la dirección que indique Vite.
5. Abrir el panel de administración e iniciar sesión con la contraseña local impresa por el paso 2. Si ya existía `.dev.vars`, consultar ese archivo localmente.

Los datos locales de D1 se guardan bajo `.wrangler/` y no se comparten ni se publican al subir código. Las credenciales locales tampoco se convierten automáticamente en credenciales de producción.

Para producción se necesita una cuenta Cloudflare, una base D1 y su identificador en la configuración. Configurar `ADMIN_PASSWORD` (16 caracteres o más) y `SESSION_SECRET` (32 caracteres o más) como secretos del Worker; aplicar las migraciones remotas y publicar cuando se apruebe. No introducir secretos en variables `VITE_*`, archivos públicos ni commits. El servidor deniega toda administración si falta una credencial válida. No existe una función que permita al primer visitante hacerse propietario.

## API pública

Las respuestas JSON no se almacenan en caché. Los errores usan `{error,code?}` y un estado HTTP adecuado. Toda escritura exige JSON y el mismo origen cuando el navegador envía `Origin`.

| Petición                               | Entrada                                               | Resultado                                                                                                                                      |
| -------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/store?action=catalog`        | —                                                     | `{products,settings,connected:true}`. Productos activos con `publicPrice` y `preview` geométrico. Sin costos base, tarifas internas ni margen. |
| `POST /api/quote`                      | `{productId,config}`                                  | `{panels,area,edges,doors,accessories,price}` calculados en el servidor.                                                                       |
| `GET /api/store?action=designs`        | Cookie de visitante                                   | `{designs}` del navegador actual.                                                                                                              |
| `GET /api/store?action=design&id=UUID` | UUID no secuencial                                    | `{design}` de solo lectura para compartir.                                                                                                     |
| `POST /api/store`                      | `{op:'save-design',productId,config,name?,quantity?}` | `{design}` nuevo con ID aleatorio. Ignora precios enviados por el cliente.                                                                     |
| `POST /api/store`                      | `{op:'set-quantity',id,quantity,version}`             | `{design}` con cantidad de 1 a 20 y nueva versión.                                                                                             |
| `POST /api/store`                      | `{op:'remove-design',id,version}`                     | `{removed:true}`. Revoca también su enlace compartido.                                                                                         |

`settings` público solo incluye WhatsApp, disponibilidad, plazo y materiales activos con nombre/color/marca/código/tipo de tablero. Los precios del catálogo y del configurador son referenciales. Un diseño conserva una copia del producto, parámetros, materiales, reglas económicas y resultado utilizados al guardarlo. Las copias económicas permanecen en el servidor. Editar posteriormente las tarifas o el catálogo no recalcula ni cambia ese diseño.

Cada material tiene `brand`, `code` y `board` (`standard` o `rh`). Estándar y RH son variantes independientes: cada una conserva su ID, tarifa y activación. El espesor sigue fijo en 18 mm. Los registros antiguos reciben marca/código vacíos y tablero estándar al leerse; no se alteran sus IDs, precios, geometrías ni los resultados ya guardados. El despiece de diseños nuevos identifica marca, nombre comercial, código si existe y RH cuando corresponde.

Las instalaciones nuevas incluyen 23 referencias de Hispano, Vesto y Pelikano, priorizando Hispano. Las bases ya inicializadas no se reinician ni se reemplazan: el administrador puede añadir las referencias que faltan y guardarlas mediante la API con control de versión. Los HEX son aproximaciones para pantalla y `price:100` es un índice inicial de configuración, no una cotización del proveedor. `active` habilita la selección del material; no representa inventario sincronizado. Los nombres, variantes verificadas y límites de las fuentes se documentan en [material-sources.md](./material-sources.md).

Cada visitante recibe una cookie aleatoria `HttpOnly` que se guarda como hash en D1. El enlace de un diseño permite verlo, pero no modificarlo ni consultar otros diseños del propietario. No se solicita ni almacena información de contacto en esta primera versión. `name` es una etiqueta opcional para el proyecto. Al borrar las cookies se pierde la selección del navegador; un enlace guardado sigue permitiendo consultar su diseño mientras no se retire. La cookie no reemplaza una cuenta con recuperación de acceso.

## API administrativa

| Petición                      | Entrada                                  | Resultado                                                                                                             |
| ----------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `GET /api/store?action=admin` | —                                        | Sin sesión: `{admin:false,configured}`. Con sesión: `{admin:true,configured:true,products,settings,settingsVersion}`. |
| `POST /api/store`             | `{op:'login',password}`                  | Cookie firmada `HttpOnly`, `SameSite=Lax`, duración de 8 horas, `Secure` con HTTPS.                                   |
| `POST /api/store`             | `{op:'logout'}`                          | Elimina la cookie del navegador.                                                                                      |
| `POST /api/store`             | `{op:'product',product,expectedVersion}` | `{product}`. Usar `0` al crear; al editar, la versión leída.                                                          |
| `POST /api/store`             | `{op:'settings',settings,version}`       | `{settings,settingsVersion}`. Usar la versión leída.                                                                  |
| `POST /api/store`             | `{op:'import',products}`                 | `{imported,count}`. Hasta 200 modelos nuevos; inserción atómica.                                                      |

Todos los productos nuevos e importados comienzan como borradores, aunque el archivo diga `active:true`. El administrador los revisa y publica después. Importar no sobrescribe códigos existentes. El CSV o JSON se interpreta y previsualiza en el panel; el servidor vuelve a validar los objetos, las medidas y los materiales. No interpreta fórmulas ni ejecuta código del archivo.

Las escrituras usan versiones y condiciones SQL para evitar perder cambios de otra sesión. Una versión obsoleta devuelve `409` y exige recargar. Los cambios de materiales también comprueban que no rompan modelos publicados. Las plantillas iniciales se cargan una sola vez mediante una marca permanente: retirar productos no los hace reaparecer al volver a entrar.

Los intentos de contraseña se limitan en D1: cinco intentos por dirección en quince minutos. La contraseña y la firma son secretos configurados por el propietario. Cambiar cualquiera de ambos invalida las sesiones existentes. Cerrar sesión elimina la cookie actual; no es un mecanismo global de revocación. No hay usuarios, roles diferenciados ni recuperación por correo en este MVP.

## Verificación

Con la muestra local encendida, ejecutar:

```sh
node --test tests/api.integration.mjs
```

Opcionalmente indicar `API_TEST_URL` si el puerto cambió. La prueba rechaza cualquier servidor que no sea localhost y debe apuntar al servidor de este mismo checkout. Restaura las tarifas mediante control de versión y usa Wrangler local para retirar exclusivamente los UUID de productos y diseños creados por esa ejecución, también cuando falla una aserción. No elimina datos mediante búsquedas generales. Comprueba autorización, cookies, costos privados, validación en servidor, conflicto de ediciones simultáneas, aislamiento por visitante, enlaces compartidos, cantidades y conservación del precio histórico.

La importación desde CSV/JSON permite trabajar con datos exportados de Google Sheets o Excel. **No hay sincronización automática con Google Sheets ni importación de GLB arbitrarios** en esta fase. Añadir esas integraciones requiere conectar una cuenta, definir permisos y ampliar el motor para las nuevas familias; subir un archivo 3D no proporciona automáticamente reglas de fabricación.
