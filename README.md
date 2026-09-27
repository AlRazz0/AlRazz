# AlRazz

Plataforma en español para diseñar y cotizar muebles de **melamina de 18 mm**. Esta primera versión desarrolla una familia de almacenaje modular: estanterías, libreros, aparadores y muebles de TV. No incluye sofás.

## Qué funciona

- Catálogo conectado a una base de datos D1: crear, duplicar, editar, activar y ocultar modelos.
- Configurador 3D con giro y zoom, vistas frontal/lateral/superior, apertura de puertas, medidas, acabados, interior, repisas y módulos.
- Motor compartido de geometría, restricciones, despiece y precio. El servidor calcula la cotización; no acepta precios del navegador.
- Diseños persistentes con enlace para compartir, cantidades, duplicación y copia histórica de parámetros y precio.
- Resumen y despiece CSV; imagen PNG del mueble.
- WhatsApp comercial configurable. Cuando falta el número, ofrece descargar/copiar la solicitud sin inventar un destinatario.
- Panel privado: materiales, costos, margen, plazos orientativos y disponibilidad.
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

Abrir la dirección indicada por Vite (puerto 5173). El panel está en `/admin`. El comando de preparación genera credenciales aleatorias en el archivo local ignorado `.dev.vars` y muestra la clave de administración una sola vez. Si ya existe, conserva los datos; consultar el archivo local para recuperar la clave.

La base local persiste en `.wrangler/`. Subir el código a GitHub no sube esa base ni publica la web. No se usa `localStorage` como base de datos.

## Verificar

```sh
npm run check
npm test
npm run build
# Con npm run dev activo, exclusivamente contra la base local:
node --test tests/api.integration.mjs
```

Las pruebas del motor cubren medidas, colisiones, límites, geometría/despiece, precios y CSV. Las de API cubren autorización, persistencia, aislamiento de visitantes, versiones, costos privados y cambios simultáneos. GitHub Actions ejecuta tipos, pruebas del motor y build en cada PR. El PR inicial queda pendiente de revisión; no publica automáticamente.

## Publicar después de aprobar

El destino preparado es **Cloudflare Workers con D1**, que sirve la web y su API desde el mismo origen.

1. Iniciar sesión en Cloudflare: `npx wrangler login`.
2. Crear D1: `npx wrangler d1 create alrazz-db`. Sustituir el identificador local de ejemplo en `wrangler.jsonc` por el devuelto.
3. Configurar secretos de producción mediante `npx wrangler secret put ADMIN_PASSWORD` y `npx wrangler secret put SESSION_SECRET` (mínimos de 16 y 32 caracteres; usar valores aleatorios distintos de los locales).
4. Aplicar el esquema: `npm run db:remote`.
5. Compilar y publicar: `npm run build` y `npm run deploy`.
6. Entrar en el panel, configurar tarifas, materiales, WhatsApp y disponibilidad reales. Validar las piezas con el taller antes de aceptar pedidos.

No publicar el directorio completo `dist/` como archivos estáticos: la parte pública es `dist/client` y la API requiere su Worker. Nunca subir `.dev.vars`, cookies, secretos, `.wrangler/` ni `node_modules/`. No existe acceso administrativo predeterminado ni reclamación de propietario por el primer visitante.

## Alcance pendiente

- La importación CSV/JSON ya funciona; la sincronización automática de Google Sheets requiere una conexión posterior.
- Un GLB/SketchUp arbitrario no se convierte automáticamente en plantilla. El piloto genera geometría paramétrica de tableros.
- Cajones, correderas, puertas corredizas, cocinas y nuevas familias requieren sus reglas y pruebas.
- El CSV aún no está homologado para una versión concreta de CutMaster. No incluye optimización de corte.
- La disponibilidad es un ajuste orientativo, no una agenda de reservas ni una fecha comprometida.
- El MVP tiene una clave administrativa, sin cuentas de empleados ni recuperación por correo.
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
