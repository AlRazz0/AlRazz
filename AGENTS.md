# Reglas del proyecto AlRazz

- El producto se limita a muebles de melamina. El espesor de 18 mm es un invariante del motor.
- No codificar productos adicionales en componentes UI. El catálogo, acabados, tarifas y capacidad se administran por API y D1.
- Los datos iniciales solo se cargan una vez. No volver a activar modelos ocultos ni reemplazar información del administrador al arrancar.
- Mantener un único motor para geometría, piezas y precios. Toda escritura y cotización se valida en servidor.
- Los diseños guardados conservan su snapshot; no recalcularlos silenciosamente con nuevas tarifas.
- No aceptar expresiones ejecutables de CSV/JSON, no usar eval.
- Mantener base de datos, contraseñas, cookies y archivos de entorno fuera de Git.
- No introducir datos reales de clientes en fixtures. Los tests API solo operan localmente y limpian sus IDs exactos.
- El despiece permanece preliminar hasta una validación de fabricación explícita. No representar el piloto como un sistema de producción homologado.
- Revisar cambios mediante PR. No desplegar ni integrar el PR inicial antes de aprobación del propietario.
- Comprobaciones: npm run check, npm test, npm run build. Para API, npm run dev y node --test tests/api.integration.mjs.
