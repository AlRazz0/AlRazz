# El capo: export selected furniture envelopes for the administrative editor.
# This script writes dimensions only. It does not export geometry, prices,
# textures, accounts, file paths or manufacturing instructions.
require 'sketchup.rb'
require 'json'

module AlrazzPlanExport
  def self.export_selected
    model = Sketchup.active_model
    selected = model.selection.to_a.select do |entity|
      entity.is_a?(Sketchup::ComponentInstance) || entity.is_a?(Sketchup::Group)
    end
    if selected.empty? || selected.length > 100
      UI.messagebox('Selecciona entre 1 y 100 grupos o componentes completos, uno por mueble.')
      return
    end
    components = selected.each_with_index.map do |entity, index|
      bounds = entity.definition.bounds
      transformation = model.edit_transform * entity.transformation
      origin = Geom::Point3d.new(0, 0, 0).transform(transformation)
      axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]].map do |point|
        Geom::Point3d.new(point).transform(transformation) - origin
      end
      lengths = axes.map { |axis| axis.length.to_f }
      if lengths.any? { |length| !length.finite? || length <= 0 }
        raise ArgumentError, 'Hay un componente con escala vacia o no valida.'
      end
      normalized = axes.map(&:normalize)
      if normalized.combination(2).any? { |left, right| left.dot(right).abs > 0.00001 }
        raise ArgumentError, 'Hay un componente deformado. Usa grupos rectangulares con ejes perpendiculares.'
      end
      minimum = bounds.min
      maximum = bounds.max
      # SketchUp's internal length unit is inches. Preserve local component
      # axes: red=X=width, green=Y=depth, blue=Z=height. Include ancestor scaling.
      dimensions = [(maximum.x - minimum.x).to_f, (maximum.y - minimum.y).to_f, (maximum.z - minimum.z).to_f]
      millimeters = dimensions.each_with_index.map { |length, axis| (length * lengths[axis] * 25.4).round(3) }
      if millimeters.any? { |length| !length.finite? || length <= 0 || length > 30000 }
        raise ArgumentError, 'Hay un componente vacio o de mas de 30 metros. Divide el conjunto en muebles.'
      end
      name = entity.name.to_s.strip
      name = entity.definition.name.to_s.strip if name.empty?
      name = name.gsub(/[[:cntrl:]]/, ' ')[0, 70].strip
      name = "Mueble #{index + 1}" if name.length < 2
      { name: name, width: millimeters[0], height: millimeters[2], depth: millimeters[1] }
    end
    path = UI.savepanel('Guardar medidas para El capo', nil, 'medidas-el-capo.json')
    return unless path
    path += '.json' unless File.extname(path).downcase == '.json'
    document = { format: 'alrazz-plan-v1', source: 'sketchup', units: 'mm', components: components }
    File.write(path, JSON.pretty_generate(document), mode: 'w', encoding: 'UTF-8')
    UI.messagebox('Medidas exportadas. En El capo abre Catalogo > Desde un plano y revisa las medidas. No es un despiece de fabricacion.')
  rescue StandardError => error
    UI.messagebox("No se pudieron exportar las medidas. #{error.is_a?(ArgumentError) ? error.message : 'Revisa la seleccion y la carpeta de destino.'}")
  end

  unless file_loaded?(__FILE__)
    UI.menu('Plugins').add_item('Exportar medidas para El capo') { export_selected }
    file_loaded(__FILE__)
  end
end
