# Trabajos realizados

La galería parte vacía. La migración aditiva `0007_completed_projects.sql` crea únicamente su tabla e índice; no carga casos, fotos ni productos. La sección pública se oculta mientras no existan trabajos publicados.

En administración, **Trabajos realizados** permite guardar borradores con título, descripción, medidas reales en milímetros, acabado y hasta seis fotografías por URL HTTPS pública. Cada imagen requiere una descripción alternativa. No existe una subida de archivos en este flujo; el navegador carga la foto externa sin enviar la página como referencia. El taller debe comprobar su contenido y confirmar que son fotografías de un trabajo realizado que puede publicarse. El sistema valida el enlace, pero no certifica la autoría o el contenido de una imagen remota. Evita datos personales de clientes en textos y fotos.

La publicación es explícita. Archivar retira el caso de la web y conserva su registro. Las escrituras requieren la sesión administrativa con segundo factor y una versión coincidente; una edición concurrente se rechaza sin reemplazar los cambios ajenos. No se modifica el catálogo ni los diseños guardados.

## Diseñar uno parecido

Relacionar un modelo es opcional. Si se relaciona uno al publicar, debe estar activo y tener una configuración revisada que conserve las medidas del trabajo. El administrador revisa columnas, repisas, puertas, frente, tirador y acabado; el servidor valida la configuración con el motor compartido de melamina de 18 mm y los materiales actuales. Una medida real que no admita ese modelo no se redondea silenciosamente: se revisa el caso o se publica sin enlace al configurador.

La lectura pública vuelve a comprobar modelo y configuración. El enlace `/configurar?proyecto=UUID` entrega un preset válido con estado `ready`; el configurador realiza una nueva cotización normal con las tarifas actuales. La ficha del proyecto no es una cotización histórica y no tiene precio. Si cambian límites, opciones o acabados, el estado pasa a `review-required`, sin preset aprobado, y se pide al visitante una elección explícita antes de empezar con los valores actuales. Si el modelo deja de estar publicado o resulta inválido, la fotografía y sus medidas permanecen y se retira el enlace. Ningún caso reactiva productos.

## Integración

- Público: `GET /api/store?action=completed-projects&limit=6` devuelve `{projects}`; `limit` admite 1–24. `action=completed-project&id=UUID` devuelve `{project}` publicado.
- Privado: `action=admin-completed-projects`; `op: save-completed-project` con `{project,expectedVersion}` (0 para crear); `op: remove-completed-project` con `{id,version}`. El archivado es lógico.
- `PublicCompletedProject.model` contiene `{id,name,url,preset,state,notice}` o `null`. Los datos privados de producto, ajustes, costes y confirmación administrativa no se publican.
- `CompletedProjects` se puede insertar en la portada y `AdminCompletedProjects` recibe `products`, `materials`, `active` y `onRequireLogin`.

Validación: `node --experimental-strip-types --test tests/completed-projects.test.ts tests/design-assistant-comparison.test.ts`; tras compilar el Worker, `node --experimental-strip-types --test tests/completed-projects-api.integration.mjs`. La integración utiliza solo catálogo y credenciales sintéticos, D1 en memoria y red bloqueada. No abre archivos de entorno ni bases reales.
