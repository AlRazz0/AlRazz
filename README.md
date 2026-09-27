# AlRazz

Plataforma en español para diseñar y cotizar muebles de **melamina de 18 mm**. Esta primera versión desarrolla una familia de almacenaje modular: estanterías, libreros, aparadores y muebles de TV. No incluye sofás.

## Qué funciona

- Catálogo conectado a una base de datos D1: crear, duplicar, editar, activar y ocultar modelos.
- Configurador 3D con giro y zoom, vistas frontal/lateral/superior, apertura de puertas, medidas, acabados, interior, repisas y módulos.
- Motor compartido de geometría, restricciones, despiece y precio. El servidor calcula la cotización; no acepta precios del navegador.
- Diseños persistentes con enlace para compartir, cantidades, duplicación y copia histórica de parámetros y precio.
- Resumen de solicitud e imagen PNG para el cliente. Despiece preliminar y CSV exclusivos del administrador, con segundo factor verificado.
- Dos contactos de WhatsApp configurables desde el panel. El cliente elige el destinatario y envía su mensaje en WhatsApp; no hay envío automático ni simultáneo a ambos números.
- Entradas de sección, transiciones del catálogo y movimiento de cámara y puertas 3D, respetando la preferencia de movimiento reducido.
- Panel privado con correo, contraseña y segundo factor: autenticador, correo opcional o recuperación de un solo uso. Materiales, costos, margen, plazos orientativos y disponibilidad.
- CSV/JSON con vista previa y validación antes de importar borradores. Un CSV exportado de Google Sheets puede usarse directamente con la plantilla.

**Los modelos, precios, colores y plazos iniciales son datos de muestra.** Deben ajustarse con AlRazz antes de operar comercialmente. Todo importe es referencial y el despiece está marcado «no autorizado para producción».

## Conectividad sin cambiar páginas

| Permanente en el sistema                                     | Administrable desde el panel                            |
| ------------------------------------------------------------ | ------------------------------------------------------- |
| Espesor de 18 mm, reglas constructivas y holguras del piloto | Modelos, nombres, categorías soportadas y descripciones |
| Motor 3D y estructura de la web                              | Medidas iniciales, límites, distribución y orden        |
| Validación en el servidor y autorización                     | Materiales, colores, costos, margen y servicios         |
| Contrato de API y formato de piezas                          | Contactos de WhatsApp, plazos y disponibilidad orientativa |

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

## Publicación

La web está disponible por HTTPS en [alrazz.alrazz-cusco.workers.dev](https://alrazz.alrazz-cusco.workers.dev). Se verificó **Workers Free ($0)** en el panel, D1 tiene ambas migraciones aplicadas y el Worker dispone de cinco secretos nuevos de producción. Pasaron la comprobación pública y un acceso real con contraseña, TOTP, consulta del panel privado y cierre de sesión. La portada muestra el catálogo en español con cuatro modelos y 23 acabados.

La web y su API se sirven desde el mismo origen; el catálogo permanece en D1. La contraseña se verifica en un Durable Object interno SQLite, disponible en el plan gratuito, sin reducir la protección scrypt. Se mantiene el requisito de **costo cero**, dentro de las cuotas gratuitas, sin activar suscripciones de pago.

La primera publicación se realizó desde Wrangler con OAuth. El flujo manual de GitHub Actions está preparado, pero **falta un token API dedicado para habilitarlo**; no se ha copiado el OAuth de la sesión a GitHub. La [guía de publicación](docs/deployment.md) documenta ambas vías y la comprobación pública de solo lectura.

Antes de operar comercialmente, confirmar tarifas, materiales, contactos y disponibilidad reales, y validar las piezas con el taller. El acceso completo ya funcionó en Workers Free; no se han medido sus métricas exactas de CPU ni su capacidad bajo carga. El envío de códigos por correo requiere configurar un remitente y proveedor, según la [guía de seguridad](docs/admin-security.md).

No publicar el directorio completo `dist/` como archivos estáticos: la parte pública es `dist/client` y la API requiere su Worker. Nunca subir `.dev.vars`, cookies, secretos, `.wrangler/` ni `node_modules/`. No existe acceso administrativo predeterminado ni reclamación de propietario por el primer visitante.

## Alcance pendiente

- La importación CSV/JSON ya funciona; la sincronización automática de Google Sheets requiere una conexión posterior.
- Un GLB/SketchUp arbitrario no se convierte automáticamente en plantilla. El piloto genera geometría paramétrica de tableros.
- Cajones, correderas, puertas corredizas, cocinas y nuevas familias requieren sus reglas y pruebas.
- El CSV aún no está homologado para una versión concreta de CutMaster. No incluye optimización de corte.
- La disponibilidad es un ajuste orientativo, no una agenda de reservas ni una fecha comprometida.
- Hay un correo administrativo autorizado con verificación en dos pasos; las cuentas de empleados y el restablecimiento automático de contraseña quedan pendientes. El envío de códigos por correo requiere activar un proveedor y verificar la recepción real.
- Los enlaces de diseños se guardan en D1; la selección del visitante se vincula a una cookie. Guardar el enlace permite volver desde otro dispositivo.
- La portada y el acceso administrativo están comprobados en producción. La revisión comercial del catálogo y la validación de fabricación quedan a cargo del propietario.

## Código

`src/`: experiencia de cliente y administración.
`lib/furniture.ts`: motor paramétrico y validaciones.
`lib/catalog-csv.ts`: intercambio de catálogo con hojas de cálculo.
`server/index.ts`: API, autenticación y acceso a D1.
`migrations/`: esquema persistente.
`tests/`: pruebas del dominio y de la API.

Guías: [administración](docs/admin.md), [datos y API](docs/backend.md), [motor y fabricación](docs/parametric-engine.md).

La identidad y la fotografía conceptual de AlRazz son propias. Tylko se utilizó como referencia de experiencia, sin copiar su marca, fotografías o código.
