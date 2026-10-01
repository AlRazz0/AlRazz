import { useMemo } from "react";
import { Check } from "lucide-react";
import type { PublicProduct } from "./types";
import { getKitchenTemplates, type KitchenTemplate } from "./kitchen-templates";

function TemplateDiagram({ template }: { template: KitchenTemplate }) {
  const plan = template.plan;
  const scale = Math.min(144 / plan.walls.a, 74 / plan.walls.b);
  const cursors = { a: 0, b: 0 };
  const floor = plan.items.filter((item) => item.row !== "wall");
  const depthA = Math.max(
    0,
    ...floor
      .filter((item) => item.wall === "a")
      .map((item) =>
        item.kind === "furniture" ? item.config.depth : item.depth,
      ),
  );
  cursors.b = plan.layout === "l" ? depthA + 50 : 0;
  return (
    <svg viewBox="0 0 178 105" aria-hidden="true">
      <path
        d={plan.layout === "l" ? "M15 90V13h146v77" : "M15 66V25h146v41"}
        fill="none"
        stroke="currentColor"
        opacity=".16"
      />
      {floor.map((item) => {
        const width =
          item.kind === "furniture" ? item.config.width : item.width;
        const depth =
          item.kind === "furniture" ? item.config.depth : item.depth;
        const offset = cursors[item.wall];
        cursors[item.wall] += width;
        return (
          <rect
            key={item.id}
            x={
              item.wall === "a"
                ? 16 + offset * scale
                : 16 + plan.walls.a * scale - depth * scale
            }
            y={
              item.wall === "a"
                ? plan.layout === "l"
                  ? 15
                  : 31
                : 15 + offset * scale
            }
            width={Math.max(
              0.75,
              (item.wall === "a" ? width : depth) * scale - 2,
            )}
            height={Math.max(
              0.75,
              (item.wall === "a" ? depth : width) * scale - 2,
            )}
            rx="1.5"
            fill={item.kind === "furniture" ? "currentColor" : "none"}
            fillOpacity={item.row === "tall" ? ".8" : ".42"}
            stroke="currentColor"
            strokeOpacity=".55"
            strokeDasharray={item.kind === "space" ? "2 2" : undefined}
          />
        );
      })}
    </svg>
  );
}

export function KitchenTemplatePicker({
  products,
  selected,
  onSelect,
}: {
  products: PublicProduct[];
  selected?: string;
  onSelect: (template: KitchenTemplate) => void;
}) {
  const templates = useMemo(() => getKitchenTemplates(products), [products]);
  if (!templates.length) return null;
  return (
    <section className="kitchen-templates" aria-label="Plantillas de cocina">
      <div className="kitchen-section-heading">
        <div>
          <p className="eyebrow">ELIGE UN PUNTO DE PARTIDA</p>
          <h2>Tu cocina empieza aquí.</h2>
        </div>
        <p>
          Elige una distribución y toca los botones + para completar cada
          espacio a tu gusto.
        </p>
      </div>
      <div className="kitchen-template-grid">
        {templates.map((template, index) => (
          <button
            type="button"
            key={template.id}
            className={selected === template.id ? "selected" : ""}
            aria-pressed={selected === template.id}
            onClick={() => onSelect(template)}
          >
            <span className="kitchen-template-number">
              0{index + 1}
              {selected === template.id && <Check size={14} />}
            </span>
            <TemplateDiagram template={template} />
            <strong>{template.name}</strong>
            <small>{template.description}</small>
          </button>
        ))}
      </div>
    </section>
  );
}
