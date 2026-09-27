# Datos y conectividad de AlRazz

El catálogo, los materiales, las tarifas, la disponibilidad y los diseños se guardan en **Cloudflare D1**. El navegador consulta `/api/store` y `/api/quote`; no necesita cambios de código ni despliegues para publicar, editar o retirar un modelo de la familia paramétrica disponible.

`server/index.ts` es un Worker con un binding `DB` y un binding `ASSETS` para servir el frontend. Las migraciones contienen el esquema del catálogo y de autenticación. El motor geométrico y sus reglas de fabricación están en `lib/furniture.ts` y se reutilizan en el servidor. La geometría es código permanente; los modelos de catálogo y las decisiones comerciales son datos administrables.

## Arranque local

1. Instalar dependencias con `npm ci`.
2. Ejecutar `npm run setup:local -- --email administrador@example.com`. Genera o conserva credenciales privadas y migra la clave local anterior a un hash. No imprime secretos ni los sube a GitHub.
3. Ejecutar `npm run db:local` para aplicar la migración a D1 local.
4. Ejecutar `npm run dev` y abrir la dirección que indique Vite.
5. Consultar `.admin-credentials.txt`, vincular la aplicación autenticadora con `.admin-mfa.txt` y abrir el panel. Introducir correo, contraseña y código. Los archivos de aprovisionamiento son privados y deben retirarse después de guardarlos de forma segura.

Los datos locales de D1 se guardan bajo `.wrangler/` y no se comparten ni se publican al subir código. Las credenciales locales tampoco se convierten automáticamente en credenciales de producción.

Para producción se necesita una cuenta Cloudflare, una base D1 y su identificador en la configuración. La [guía de seguridad](admin-security.md) documenta los secretos de correo, hash de contraseña, TOTP, recuperación y sesión, además del servicio opcional de correo y el presupuesto CPU. Aplicar las migraciones remotas y publicar cuando se apruebe. No introducir secretos en variables `VITE_*`, archivos públicos ni commits. El servidor deniega toda administración si falta una credencial válida. No existe una función que permita al primer visitante hacerse propietario.

## API pública

Las respuestas JSON no se almacenan en caché. Los errores usan `{error,code?}` y un estado HTTP adecuado. Toda escritura exige JSON y el mismo origen cuando el navegador envía `Origin`.

| Petición                               | Entrada                                               | Resultado                                                                                                                                      |
| -------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/store?action=catalog`        | —                                                     | `{products,settings,connected:true}`. Productos activos con `publicPrice` y `preview` geométrico. Sin costos base, tarifas internas ni margen. |
| `POST /api/quote`                      | `{productId,config}`                                  | `{geometry,price}` calculados en el servidor. Sin despiece ni costos internos.                                                                 |
| `GET /api/store?action=designs`        | Cookie de visitante                                   | `{designs}` del navegador actual.                                                                                                              |
| `GET /api/store?action=design&id=UUID` | UUID no secuencial                                    | `{design}` de solo lectura para compartir.                                                                                                     |
| `POST /api/store`                      | `{op:'save-design',productId,config,name?,quantity?}` | `{design}` nuevo con ID aleatorio. Ignora precios enviados por el cliente.                                                                     |
| `POST /api/store`                      | `{op:'set-quantity',id,quantity,version}`             | `{design}` con cantidad de 1 a 20 y nueva versión.                                                                                             |
| `POST /api/store`                      | `{op:'remove-design',id,version}`                     | `{removed:true}`. Revoca también su enlace compartido.                                                                                         |

`settings` público solo incluye `whatsapp`, `whatsappSecondary`, disponibilidad, plazo y materiales activos con nombre/color/marca/código/tipo de tablero. Ambos teléfonos son editables desde administración. El cliente elige un destinatario para abrir WhatsApp con el mensaje preparado; no hay envío automático ni entrega duplicada a los dos números. Un número vacío no se muestra y los contactos idénticos se presentan una sola vez. Los registros antiguos sin `whatsappSecondary` reciben una cadena vacía al leerse.

Todos los resultados públicos —cotización, `preview` del catálogo, `result` y `preview` de diseños guardados— contienen únicamente `{geometry,price}`. Cada elemento de `geometry` cumple `VisualPanel`, definido en `lib/public-geometry.ts`: `{size:[x,y,z],position:[x,y,z],material,door?}`. La selección explícita de campos excluye identificadores y nombres de piezas, largo/ancho de corte, espesor como instrucción de fabricación, veta, bordes, superficies, accesorios y desglose económico. La geometría visible permite inferir dimensiones; esta separación protege la información de fabricación, no pretende impedir medir un modelo 3D.

Los precios del catálogo y del configurador son referenciales. Un diseño conserva en D1 una copia completa del producto, parámetros, materiales, reglas económicas y resultado utilizados al guardarlo. Las copias económicas y el despiece permanecen en el servidor y solo se entregan mediante la consulta administrativa protegida. Editar posteriormente las tarifas o el catálogo no recalcula ni cambia ese diseño.

Cada material tiene `brand`, `code` y `board` (`standard` o `rh`). Estándar y RH son variantes independientes: cada una conserva su ID, tarifa y activación. El espesor sigue fijo en 18 mm. Los registros antiguos reciben marca/código vacíos y tablero estándar al leerse; no se alteran sus IDs, precios, geometrías ni los resultados ya guardados. El despiece de diseños nuevos identifica marca, nombre comercial, código si existe y RH cuando corresponde.

Las instalaciones nuevas incluyen 23 referencias de Hispano, Vesto y Pelikano, priorizando Hispano. Las bases ya inicializadas no se reinician ni se reemplazan: el administrador puede añadir las referencias que faltan y guardarlas mediante la API con control de versión. Los HEX son aproximaciones para pantalla y `price:100` es un índice inicial de configuración, no una cotización del proveedor. `active` habilita la selección del material; no representa inventario sincronizado. Los nombres, variantes verificadas y límites de las fuentes se documentan en [material-sources.md](./material-sources.md).

Cada visitante recibe una cookie aleatoria `HttpOnly` que se guarda como hash en D1. El enlace de un diseño permite verlo, pero no modificarlo ni consultar otros diseños del propietario. No se solicita ni almacena información de contacto en esta primera versión. `name` es una etiqueta opcional para el proyecto. Al borrar las cookies se pierde la selección del navegador; un enlace guardado sigue permitiendo consultar su diseño mientras no se retire. La cookie no reemplaza una cuenta con recuperación de acceso.

## API administrativa

| Petición                      | Entrada                                  | Resultado                                                                                                                                                          |
| ----------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/store?action=admin` | —                                        | Sin sesión: `{admin:false,configured,challenge,emailAvailable,challengeExpiresAt?}`. Con sesión: `{admin:true,configured:true,products,settings,settingsVersion}`. |
| `POST /api/store`             | `{op:'login',email,password}`            | Desafío temporal de cinco minutos; todavía no autoriza administración.                                                                                             |
| `POST /api/store`             | `{op:'verify-login',method,code}`        | `method`: `totp`, `email` o `recovery`. Crea sesión opaca revocable de ocho horas tras consumir desafío y factor.                                                  |
| `POST /api/store`             | `{op:'request-email-code'}`              | Solicita correo solo tras el primer factor y con proveedor configurado; `{sent:true,retryAfter:60}`. No devuelve el código.                                        |
| `POST /api/store`             | `{op:'cancel-login'}`                    | Invalida el desafío actual y su cookie.                                                                                                                            |
| `POST /api/store`             | `{op:'logout'}`                          | Revoca la sesión y el desafío en D1, y borra sus cookies.                                                                                                          |
| `POST /api/store`             | `{op:'product',product,expectedVersion}` | `{product}`. Usar `0` al crear; al editar, la versión leída.                                                                                                       |
| `POST /api/store`             | `{op:'settings',settings,version}`       | `{settings,settingsVersion}`. Usar la versión leída.                                                                                                               |
| `POST /api/store`             | `{op:'import',products}`                 | `{imported,count}`. Hasta 200 modelos nuevos; inserción atómica.                                                                                                   |
| `POST /api/store`             | `{op:'cut-list',productId,config}`       | Despiece privado de un producto activo y configuración válida, calculado con las tarifas actuales.                                                                 |
| `POST /api/store`             | `{op:'cut-list',designId}`               | Despiece privado del snapshot de un diseño guardado que no se haya retirado.                                                                                       |

`cut-list` exige una sesión administrativa con ambos factores antes de validar el selector o consultar el diseño. Una petición anónima o con solo el primer factor devuelve `401`. Los dos formatos de entrada son excluyentes. La respuesta es `{source:'current'|'saved',design,product:{id,name},config,result}`; `result` contiene el resultado completo del motor, incluidas piezas, medidas de corte, materiales, veta, tapacantos, accesorios y desglose económico. Para un cálculo actual, `design` es `null`. Para un diseño guardado incluye `{id,name,quantity,version,created}`; el resultado sigue correspondiendo a una unidad, separado de la cantidad solicitada.

La consulta por `designId` devuelve exactamente el resultado histórico almacenado, aunque hayan cambiado precios o se haya ocultado el modelo. No recalcula el snapshot con el catálogo actual. Un diseño inexistente o retirado devuelve `404`. El enlace compartido del cliente continúa ofreciendo solo la representación pública.

Todos los productos nuevos e importados comienzan como borradores, aunque el archivo diga `active:true`. El administrador los revisa y publica después. Importar no sobrescribe códigos existentes. El CSV o JSON se interpreta y previsualiza en el panel; el servidor vuelve a validar los objetos, las medidas y los materiales. No interpreta fórmulas ni ejecuta código del archivo.

Las escrituras usan versiones y condiciones SQL para evitar perder cambios de otra sesión. Una versión obsoleta devuelve `409` y exige recargar. Los cambios de materiales también comprueban que no rompan modelos publicados. Las plantillas iniciales se cargan una sola vez mediante una marca permanente: retirar productos no los hace reaparecer al volver a entrar.

Los intentos se limitan en D1 por cuenta, dirección y desafío; acertar la contraseña no elimina los límites del segundo paso. Contraseñas, factores, sesiones y revocación se verifican en servidor. Las sesiones y desafíos se vinculan a las credenciales actuales; rotarlas invalida accesos anteriores. Cerrar sesión elimina el registro actual, por lo que una copia del token tampoco funciona. No hay cuentas de empleados, roles diferenciados ni restablecimiento automático de contraseña por correo. Los códigos de recuperación sustituyen únicamente el segundo paso.

## Verificación

Con la muestra local encendida, ejecutar:

```sh
npm run test:api
```

Opcionalmente indicar `API_TEST_URL` si el puerto cambió. La prueba rechaza cualquier servidor que no sea localhost y debe apuntar al servidor de este mismo checkout. Restaura las tarifas mediante control de versión y usa Wrangler local para retirar exclusivamente los UUID de productos y diseños creados por esa ejecución, también cuando falla una aserción. No elimina datos mediante búsquedas generales. Comprueba autorización, cookies, costos y despieces privados, validación en servidor, conflicto de ediciones simultáneas, aislamiento por visitante, enlaces compartidos, cantidades y conservación del resultado histórico. `npm run test:auth-api`, después del build, también verifica la separación entre geometría pública y despiece privado en un entorno aislado sin datos reales ni red externa.

La importación desde CSV/JSON permite trabajar con datos exportados de Google Sheets o Excel. **No hay sincronización automática con Google Sheets ni importación de GLB arbitrarios** en esta fase. Añadir esas integraciones requiere conectar una cuenta, definir permisos y ampliar el motor para las nuevas familias; subir un archivo 3D no proporciona automáticamente reglas de fabricación.
