# Crear un mueble desde un plano

Entra en **Administración → Catálogo → Desde un plano**. También está disponible en los accesos principales del panel.

1. Añade una imagen PNG, JPG o WebP de hasta 8 MB. El plano permanece en tu navegador y puede verse junto al formulario durante la edición. Puedes trabajar sin archivo si ya conoces las medidas.
2. Introduce nombre, estructura de partida, ancho, alto y fondo en milímetros. Si importas medidas de SketchUp, selecciona primero el componente. Las medidas que no avanzan de 10 en 10 mm se proponen redondeadas, mostrando la diferencia para que la revises.
3. Revisa columnas y repisas. Marca la confirmación de medidas y pulsa **Continuar en el editor**. Las reglas del motor compartido comprueban luces, puertas, construcción y acabados. Un dato incompatible se muestra antes de continuar.
4. Compara el plano con la vista 3D, termina puertas, acabados, límites y tarifas. **Crear borrador** guarda mediante la API habitual. El archivo original no se sube. El borrador comienza oculto y sin precio público; decide su publicación y su tarifa después de revisarlo.

El espesor del mueble generado siempre es **18 mm**. Un plano o modelo importado no acredita materiales, fabricación, uniones, seguridad estructural ni precisión del despiece. El resultado continúa siendo preliminar y requiere validación del taller.

## Desde SketchUp de escritorio

El panel incluye **¿Trabajas con SketchUp? → Descargar exportador SketchUp**. El archivo está en `public/tools/alrazz-sketchup-export.rb`. Es un pequeño exportador Ruby de código legible que se instala en la carpeta de extensiones `Plugins` de SketchUp de escritorio; requiere autorización de ejecución según la política de extensiones de tu instalación. No funciona en SketchUp Web. No cambies la política global de seguridad para instalarlo; si tu entorno solo admite extensiones firmadas, usa la entrada manual o el ejemplo JSON.

Después de instalarlo y reiniciar SketchUp:

1. Agrupa cada mueble completo y alinea sus ejes locales: rojo X = ancho, verde Y = fondo, azul Z = alto. Excluye personas, cotas, habitaciones y ambientación del grupo.
2. Selecciona entre 1 y 100 grupos o componentes. En **Extensiones → Exportar medidas para El capo**, guarda el archivo JSON. La etiqueta del menú puede aparecer como Plugins según la versión/idioma de SketchUp.
3. El exportador obtiene la envolvente de cada componente en sus ejes locales, aplica la escala de la instancia y del contexto de edición y convierte las pulgadas internas de SketchUp a milímetros. Rechaza escalas vacías, deformaciones con ejes no perpendiculares y componentes vacíos o mayores de 30 metros. No modifica el modelo ni exporta geometría, precios, texturas o datos de cuentas.
4. Abre el JSON en **Desde un plano**, elige un componente y revisa las medidas. El motor admite hasta 3000 mm por dimensión exterior; divide los conjuntos mayores en módulos antes de crear borradores.

La correspondencia de ejes y la envolvente deben comprobarse en el modelo de origen. El exportador no detecta automáticamente tableros de 18 mm ni la familia constructiva, ni reconstruye mecanizados. No se ha homologado con un conjunto de modelos reales de taller; confirma el resultado antes de fabricar.

## Formato de intercambio

El botón **Descargar ejemplo de medidas** genera este formato, que también puede prepararse manualmente:

```json
{
  "format": "alrazz-plan-v1",
  "source": "sketchup",
  "units": "mm",
  "components": [
    { "name": "Estante del estudio", "width": 1200, "height": 1800, "depth": 400 }
  ]
}
```

Máximo 1 MB y 100 componentes. Solo se aceptan nombres y dimensiones numéricas finitas; no se evalúan fórmulas, scripts ni campos adicionales. Opcionalmente puede declararse `thickness: 18` en el documento o componente; cualquier otro espesor se rechaza. La ausencia de ese campo no significa que el modelo original esté fabricado en melamina de 18 mm.

No se abre un `.skp` arbitrario directamente ni se convierte en una nueva familia constructiva. Para referencias PDF, exporta una página como imagen. Para una estructura no soportada, hace falta ampliar y validar el motor antes de ofrecerla; no se sustituyen sus reglas por la malla importada.

Referencias técnicas: [ComponentInstance y transformación](https://ruby.sketchup.com/Sketchup/ComponentInstance.html), [contexto de edición del modelo](https://ruby.sketchup.com/Sketchup/Model.html#edit_transform-instance_method), [transformaciones](https://ruby.sketchup.com/Geom/Transformation.html).
