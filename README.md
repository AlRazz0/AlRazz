# El capo

Plataforma en español para diseñar y cotizar muebles de **melamina de 18 mm**: almacenaje modular, estanterías, escritorios, roperos y cocinas completas por módulos. El catálogo incluye libreros, aparadores, TV, veladores, zapateras, alacenas y vitrinas. No incluye sofás.

La identidad visible es **El capo**, con la firma **Muebles en melamina Marlon**. Los nombres técnicos del repositorio, alojamiento y autenticador se mantienen para conservar las conexiones existentes. Ver [identidad visual](docs/brand-identity.md) y [ampliación del catálogo](docs/catalog-expansion.md): cuatro propuestas adicionales importables y editables desde administración.

## Qué funciona

- Catálogo conectado a una base de datos D1: crear, duplicar, editar, activar y ocultar modelos.
- Colección adicional de [16 modelos de taller](docs/coleccion-taller.md), con tipo constructivo administrable, búsqueda por nombre/categoría y vistas de catálogo que se cargan al acercarse a pantalla para limitar contextos 3D.
- Ampliación de [12 modelos de almacenaje con puertas](docs/coleccion-taller-ampliada.md), importables y editables desde el panel. Las miniaturas abren las puertas al pasar el ratón o recibir foco de teclado y las cierran al salir, con encuadre estable y respeto al movimiento reducido.
- Configurador 3D con giro y zoom, vistas frontal/lateral/superior, apertura de puertas y cotas de ancho, alto y fondo sobre el modelo. Las cotas siguen la cámara y se incluyen en el PNG si están activadas.
- Selector con 82 referencias comerciales de Hispano, Vesto y Pelíkano, buscador y muestras oficiales alojadas en la propia web. El panel permite editar los acabados sin cambiar código; los colores y vetas del visor son orientativos y la disponibilidad local se confirma con el taller.
- Motor compartido de geometría, restricciones, despiece y precio. El servidor calcula la cotización; no acepta precios del navegador.
- [Planificador de cocinas completas](docs/cocinas-modulares.md) en `/cocinas`: seis plantillas lineales/en L, espacios con «+» para añadir módulos compatibles, alacenas, columnas y reservas para equipos. Color, puertas y medidas se editan por módulo; instalación y transporte se cobran una vez.
- [Doce propuestas adicionales de cocina, vitrinas y almacenaje](docs/coleccion-cocinas-vitrinas.md), administrables como los modelos anteriores. Frentes de melamina, vidrio de 6 mm o aluminio con vidrio, con animación y render ambientado por modelo.
- [Tarifas configurables](docs/frentes-y-tarifas.md) por unidad, metro lineal o cálculo de materiales; vidrio, perfiles y herrajes se administran por separado. Los costos privados y el despiece no se entregan al cliente.
- Diseños persistentes con enlace para compartir, cantidades, duplicación y copia histórica de parámetros y precio.
- Resumen de solicitud e imagen PNG para el cliente. Despiece preliminar y CSV exclusivos del administrador, con segundo factor verificado.
- Dos contactos de WhatsApp configurables desde el panel. El cliente elige el destinatario y envía su mensaje en WhatsApp; no hay envío automático ni simultáneo a ambos números.
- Entradas de sección, transiciones del catálogo y movimiento de cámara y puertas 3D, respetando la preferencia de movimiento reducido.
- Panel privado con correo, contraseña y segundo factor: autenticador, correo mediante [Gmail propio](docs/correo-gmail.md) o Resend, o recuperación de un solo uso. El envío requiere autorización y configuración; materiales, costos, margen, plazos y disponibilidad se administran desde el panel.
- CSV/JSON con vista previa y validación antes de importar borradores. Un CSV exportado de Google Sheets puede usarse directamente con la plantilla.

**Los modelos, precios y plazos iniciales son datos de muestra.** Los nombres y muestras comerciales tienen [fuentes oficiales documentadas](docs/material-sources.md), pero no confirman existencias en Cusco ni equivalencia colorimétrica de una pantalla. Todo importe es referencial y el despiece está marcado «no autorizado para producción».

## Conectividad sin cambiar páginas

| Permanente en el sistema                                     | Administrable desde el panel                               |
| ------------------------------------------------------------ | ---------------------------------------------------------- |
| Espesor de 18 mm, reglas constructivas y holguras del piloto | Modelos, nombres, categorías soportadas y descripciones    |
| Motor 3D y estructura de la web                              | Medidas iniciales, límites, distribución y orden           |
| Validación en el servidor y autorización                     | Materiales, colores, costos, margen y servicios            |
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
npm run test:kitchen-api
```

Las pruebas cubren motor, CSV, criptografía, autenticación, persistencia, aislamiento de visitantes, versiones y costos privados. GitHub Actions ejecuta tipos, pruebas unitarias, compilación y pruebas de seguridad contra Worker/D1 aislados con correo simulado, sin enviar mensajes reales. Integrar un PR no publica automáticamente la web.

## Publicación

La dirección principal es [alrazz.pages.dev](https://alrazz.pages.dev), con [administración](https://alrazz.pages.dev/admin) y [cocinas](https://alrazz.pages.dev/cocinas). La dirección anterior [alrazz.alrazz-cusco.workers.dev](https://alrazz.alrazz-cusco.workers.dev) sigue disponible. Se verificó **Workers Free ($0)** en el panel. La versión de cocinas requiere aplicar `0003_kitchens.sql` antes de publicar el Worker y conserva sus secretos administrativos. La selección de acabados puede ampliarse desde administración sin volver a sembrar la base.

La web y su API se sirven desde el mismo origen; el catálogo permanece en D1. La contraseña se verifica en un Durable Object interno SQLite, disponible en el plan gratuito, sin reducir la protección scrypt. Se mantiene el requisito de **costo cero**, dentro de las cuotas gratuitas, sin activar suscripciones de pago.

La primera publicación se realizó desde Wrangler con OAuth. El flujo manual de GitHub Actions está preparado, pero **falta un token API dedicado para habilitarlo**; no se ha copiado el OAuth de la sesión a GitHub. La [guía de publicación](docs/deployment.md) documenta ambas vías y la comprobación pública de solo lectura.

La [guía de Pages](docs/pages.md) documenta la dirección corta: sirve el frontend estático y conecta `/api/*` al mismo Worker mediante un binding fijo. Se conservan D1 y la autenticación. Cada entrega con cambios de interfaz debe publicar el Worker y la copia de Pages del mismo commit.

Antes de operar comercialmente, confirmar tarifas, materiales, contactos y disponibilidad reales, y validar las piezas con el taller. El acceso completo ya funcionó en Workers Free; no se han medido sus métricas exactas de CPU ni su capacidad bajo carga. El envío de códigos requiere [autorizar Gmail mediante Apps Script](docs/correo-gmail.md), sin comprar dominio, o configurar Resend con dominio propio, según la [guía de seguridad](docs/admin-security.md).

No publicar el directorio completo `dist/` como archivos estáticos: la parte pública es `dist/client` y la API requiere su Worker. Nunca subir `.dev.vars`, cookies, secretos, `.wrangler/` ni `node_modules/`. No existe acceso administrativo predeterminado ni reclamación de propietario por el primer visitante.

## Alcance pendiente

- La importación CSV/JSON ya funciona; la sincronización automática de Google Sheets requiere una conexión posterior.
- Un GLB/SketchUp arbitrario no se convierte automáticamente en plantilla. El piloto genera geometría paramétrica de tableros.
- Cajones, correderas, puertas corredizas, cocinas completas con instalaciones o mecanismos y otras familias requieren sus reglas y pruebas.
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

La identidad de El capo y la fotografía conceptual son propias. Tylko se utilizó como referencia de experiencia, sin copiar su marca, fotografías o código.
