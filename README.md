# AlRazz

Plataforma en español para diseñar y cotizar muebles de **melamina de 18 mm**. Esta primera versión desarrolla una familia de almacenaje modular: estanterías, libreros, aparadores y muebles de TV. No incluye sofás.

## Qué funciona

- Catálogo conectado a una base de datos D1: crear, duplicar, editar, activar y ocultar modelos.
- Configurador 3D con giro y zoom, vistas frontal/lateral/superior, apertura de puertas, medidas, acabados, interior, repisas y módulos.
- Motor compartido de geometría, restricciones, despiece y precio. El servidor calcula la cotización; no acepta precios del navegador.
- Diseños persistentes con enlace para compartir, cantidades, duplicación y copia histórica de parámetros y precio.
- Resumen y despiece CSV; imagen PNG del mueble.
- WhatsApp comercial configurable. Cuando falta el número, ofrece descargar/copiar la solicitud sin inventar un destinatario.
- Panel privado con correo, contraseña y segundo factor: autenticador, correo opcional o recuperación de un solo uso. Materiales, costos, margen, plazos orientativos y disponibilidad.
- CSV/JSON con vista previa y validación antes de importar borradores. Un CSV exportado de Google Sheets puede usarse directamente con la plantilla.

**Los modelos, precios, colores y plazos iniciales son datos de muestra.** Deben ajustarse con AlRazz antes de operar comercialmente. Todo importe es referencial y el despiece está marcado «no autorizado para producción».

## Conectividad sin cambiar páginas

| Permanente en el sistema                                     | Administrable desde el panel                            |
| ------------------------------------------------------------ | ------------------------------------------------------- |
| Espesor de 18 mm, reglas constructivas y holguras del piloto | Modelos, nombres, categorías soportadas y descripciones |
| Motor 3D y estructura de la web                              | Medidas iniciales, límites, distribución y orden        |
| Validación en el servidor y autorización                     | Materiales, colores, costos, margen y servicios         |
| Contrato de API y formato de piezas                          | WhatsApp, plazos y disponibilidad orientativa           |

El catálogo vive en D1 y se consulta por API. Los cambios administrativos se ven al cargar el catálogo, sin reconstruir ni publicar código. Desactivar conserva el modelo y no altera diseños ya guardados. Una familia constructiva nueva —por ejemplo, cocinas con mecanismos especiales— sí necesita una plantilla de fabricación validada.

## Ejecutar la muestra

Requisitos: Node.js 24 y npm. No hace falta una cuenta Cloudflare para la base local.

```sh
npm ci
npm run setup:local
npm run db:local
npm run dev
```

Abrir la dirección indicada por Vite (puerto 5173). El panel está en `/admin`. La preparación guarda un hash de contraseña y secretos en `.dev.vars`; la contraseña inicial queda en `.admin-credentials.txt` y la vinculación del autenticador y códigos de recuperación en `.admin-mfa.txt`. Estos archivos están excluidos de Git y bloqueados por el servidor de desarrollo. Ningún secreto se imprime en la terminal. Añadir `-- --email correo@example.com` al comando de preparación permite elegir el correo autorizado; sin él, se usa `admin@alrazz.test` solo para la muestra o se conserva el configurado. El script es repetible y conserva la base de datos. Ver [seguridad administrativa](docs/admin-security.md).

La base local persiste en `.wrangler/`. Subir el código a GitHub no sube esa base ni publica la web. No se usa `localStorage` como base de datos.

## Verificar

```sh
npm run check
npm test
npm run build
npm run test:auth-api
# Con npm run dev activo, exclusivamente contra la base local:
npm run test:api
```

Las pruebas cubren motor, CSV, criptografía, autenticación, persistencia, aislamiento de visitantes, versiones y costos privados. GitHub Actions ejecuta tipos, pruebas unitarias, compilación y pruebas de seguridad contra Worker/D1 aislados con correo simulado, sin enviar mensajes reales. Integrar un PR no publica automáticamente la web.

## Publicar después de aprobar

El destino preparado es **Cloudflare Workers con D1**, que sirve la web y su API desde el mismo origen. Se mantiene el requisito de **costo cero usando Workers Free**, dentro de sus cuotas. La verificación de contraseña se ejecuta en un Durable Object interno con backend SQLite, disponible en el plan gratuito, sin reducir la protección scrypt. El despliegue no activa suscripciones de pago.

1. Iniciar sesión en Cloudflare: `npx wrangler login`. Comprobar que la cuenta utiliza Workers Free.
2. Crear D1: `npx wrangler d1 create alrazz-db`. Sustituir el identificador local de ejemplo en `wrangler.jsonc` por el devuelto.
3. Aprovisionar un correo autorizado, hash scrypt de contraseña, semilla TOTP, hashes de recuperación y secreto de sesión nuevos. Configurarlos mediante `wrangler secret put` como `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `ADMIN_TOTP_SECRET`, `ADMIN_RECOVERY_HASHES` y `SESSION_SECRET`. Para códigos por correo, configurar también `RESEND_API_KEY` y `ADMIN_EMAIL_FROM` con remitente verificado. Seguir la [guía de seguridad](docs/admin-security.md); no reutilizar credenciales locales.
4. Configurar el entorno `production` de GitHub con el token de Cloudflare, el identificador de cuenta y la URL pública, siguiendo la [guía de publicación](docs/deployment.md).
5. Ejecutar `Publicar AlRazz en Cloudflare` desde GitHub Actions sobre `main`. El flujo valida, aplica migraciones pendientes, publica y comprueba la respuesta pública.
6. Validar el acceso completo y su consumo de CPU en Cloudflare Free. Entrar en el panel, configurar tarifas, materiales, WhatsApp y disponibilidad reales. Validar las piezas con el taller antes de aceptar pedidos.

La [guía de publicación](docs/deployment.md) describe la conexión con GitHub y las comprobaciones previas. Antes de operar, verificar el flujo completo en el plan gratuito real; las pruebas locales no demuestran su presupuesto de CPU. No publicar el directorio completo `dist/` como archivos estáticos: la parte pública es `dist/client` y la API requiere su Worker. Nunca subir `.dev.vars`, cookies, secretos, `.wrangler/` ni `node_modules/`. No existe acceso administrativo predeterminado ni reclamación de propietario por el primer visitante.

## Alcance pendiente

- La importación CSV/JSON ya funciona; la sincronización automática de Google Sheets requiere una conexión posterior.
- Un GLB/SketchUp arbitrario no se convierte automáticamente en plantilla. El piloto genera geometría paramétrica de tableros.
- Cajones, correderas, puertas corredizas, cocinas y nuevas familias requieren sus reglas y pruebas.
- El CSV aún no está homologado para una versión concreta de CutMaster. No incluye optimización de corte.
- La disponibilidad es un ajuste orientativo, no una agenda de reservas ni una fecha comprometida.
- Hay un correo administrativo autorizado con verificación en dos pasos; las cuentas de empleados y el restablecimiento automático de contraseña quedan pendientes. El envío de códigos por correo requiere activar un proveedor y verificar la recepción real.
- Los enlaces de diseños se guardan en D1; la selección del visitante se vincula a una cookie. Guardar el enlace permite volver desde otro dispositivo.
- No se ha publicado en producción. La prueba visual manual queda a revisión del propietario.

## Código

`src/`: experiencia de cliente y administración.
`lib/furniture.ts`: motor paramétrico y validaciones.
`lib/catalog-csv.ts`: intercambio de catálogo con hojas de cálculo.
`server/index.ts`: API, autenticación y acceso a D1.
`migrations/`: esquema persistente.
`tests/`: pruebas del dominio y de la API.

Guías: [administración](docs/admin.md), [datos y API](docs/backend.md), [motor y fabricación](docs/parametric-engine.md).

La identidad y la fotografía conceptual de AlRazz son propias. Tylko se utilizó como referencia de experiencia, sin copiar su marca, fotografías o código.
