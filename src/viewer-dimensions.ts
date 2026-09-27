import * as THREE from "three";

type Dimension = {
  axis: "width" | "height" | "depth";
  text: string;
  start: THREE.Vector3;
  end: THREE.Vector3;
  anchors: [THREE.Vector3, THREE.Vector3];
};

const centimetres = new Intl.NumberFormat("es-PE", {
  maximumFractionDigits: 1,
});

/** Overall closed-product dimensions only; never manufacturing panel data. */
export function dimensionGeometry(
  width: number,
  height: number,
  depth: number,
  lookingFrom: THREE.Vector3,
): Dimension[] {
  if (![width, height, depth].every((n) => Number.isFinite(n) && n > 0))
    return [];
  const w = width / 1000,
    h = height / 1000,
    d = depth / 1000;
  const side = lookingFrom.x < 0 ? -1 : 1;
  const front = lookingFrom.z < 0 ? -1 : 1;
  const gap = Math.min(0.16, Math.max(0.055, Math.max(w, h, d) * 0.055));
  const x = side * (w / 2 + gap),
    z = front * (d / 2 + gap);
  const point = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  return [
    {
      axis: "width",
      text: `${centimetres.format(width / 10)} cm`,
      start: point(-w / 2, -gap, z),
      end: point(w / 2, -gap, z),
      anchors: [
        point(-w / 2, 0, (front * d) / 2),
        point(w / 2, 0, (front * d) / 2),
      ],
    },
    {
      axis: "height",
      text: `${centimetres.format(height / 10)} cm`,
      start: point(x, 0, (front * d) / 2),
      end: point(x, h, (front * d) / 2),
      anchors: [
        point((side * w) / 2, 0, (front * d) / 2),
        point((side * w) / 2, h, (front * d) / 2),
      ],
    },
    {
      axis: "depth",
      text: `${centimetres.format(depth / 10)} cm`,
      start: point(x, -gap, -d / 2),
      end: point(x, -gap, d / 2),
      anchors: [
        point((side * w) / 2, 0, -d / 2),
        point((side * w) / 2, 0, d / 2),
      ],
    },
  ];
}

/** Project to CSS pixels; omit edge-on axes instead of drawing ambiguous ticks. */
export function projectDimensions(
  dimensions: Dimension[],
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
) {
  const direction = camera.getWorldDirection(new THREE.Vector3());
  const project = (point: THREE.Vector3) => {
    const ndc = point.clone().project(camera);
    return {
      x: ((ndc.x + 1) * width) / 2,
      y: ((1 - ndc.y) * height) / 2,
      z: ndc.z,
    };
  };
  return dimensions.flatMap((dimension) => {
    const axis = dimension.end.clone().sub(dimension.start).normalize();
    if (Math.abs(axis.dot(direction)) > 0.96) return [];
    const start = project(dimension.start),
      end = project(dimension.end);
    if (
      ![start, end].every(
        (p) => Number.isFinite(p.x + p.y + p.z) && p.z >= -1 && p.z <= 1,
      )
    )
      return [];
    if (
      Math.hypot(end.x - start.x, end.y - start.y) < 0.001 ||
      Math.max(start.x, end.x) < 0 ||
      Math.min(start.x, end.x) > width ||
      Math.max(start.y, end.y) < 0 ||
      Math.min(start.y, end.y) > height
    )
      return [];
    return [
      { ...dimension, start, end, anchors: dimension.anchors.map(project) },
    ];
  });
}

type ScreenPoint = { x: number; y: number };

/** Short dimensions retain their line and place text outside it with a leader. */
export function dimensionLabelPosition(
  start: ScreenPoint,
  end: ScreenPoint,
  labelWidth: number,
  productCenter: ScreenPoint,
  viewport: { width: number; height: number },
) {
  const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  let { x, y } = midpoint;
  if (length < labelWidth + 16 && length > 0) {
    const nx = -(end.y - start.y) / length,
      ny = (end.x - start.x) / length;
    const side =
      (x - productCenter.x) * nx + (y - productCenter.y) * ny < 0 ? -1 : 1;
    const offset = (labelWidth / 2) * Math.abs(nx) + 11 * Math.abs(ny) + 10;
    x += nx * offset * side;
    y += ny * offset * side;
  }
  return {
    x: THREE.MathUtils.clamp(
      x,
      labelWidth / 2 + 8,
      viewport.width - labelWidth / 2 - 8,
    ),
    y: THREE.MathUtils.clamp(y, 15, viewport.height - 15),
  };
}

/** A separate projected canvas follows existing render events, never the model bounds. */
export function createDimensionOverlay(container: HTMLElement) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return null;
  canvas.setAttribute("aria-hidden", "true");
  canvas.className = "viewer-dimensions";
  Object.assign(canvas.style, {
    position: "absolute",
    inset: "0",
    pointerEvents: "none",
    display: "none",
  });
  canvas.hidden = true;
  container.appendChild(canvas);
  let measures: [number, number, number] = [0, 0, 0];
  let visible = false;
  return {
    update(width: number, height: number, depth: number, show: boolean) {
      measures = [width, height, depth];
      visible = show;
      canvas.hidden = !show;
      canvas.style.display = show ? "block" : "none";
    },
    draw(
      camera: THREE.PerspectiveCamera,
      source: HTMLCanvasElement,
      width: number,
      height: number,
    ) {
      if (!visible || !width || !height) return;
      if (canvas.width !== source.width || canvas.height !== source.height) {
        canvas.width = source.width;
        canvas.height = source.height;
      }
      context.setTransform(
        canvas.width / width,
        0,
        0,
        canvas.height / height,
        0,
        0,
      );
      context.clearRect(0, 0, width, height);
      const from = camera.getWorldDirection(new THREE.Vector3()).negate();
      const dimensions = projectDimensions(
        dimensionGeometry(...measures, from),
        camera,
        width,
        height,
      );
      const center = new THREE.Vector3(0, measures[1] / 2000, 0).project(
        camera,
      );
      const productCenter = {
        x: ((center.x + 1) * width) / 2,
        y: ((1 - center.y) * height) / 2,
      };
      context.font = '500 12px "DM Sans", Arial, sans-serif';
      context.textAlign = "center";
      context.textBaseline = "middle";
      const occupied: { x: number; y: number; width: number }[] = [];
      const line = (
        a: { x: number; y: number },
        b: { x: number; y: number },
      ) => {
        context.moveTo(a.x, a.y);
        context.lineTo(b.x, b.y);
      };
      for (const dimension of dimensions) {
        const { start, end, anchors, text } = dimension;
        context.beginPath();
        context.strokeStyle = "rgba(74, 66, 55, .36)";
        context.lineWidth = 1;
        line(anchors[0], start);
        line(anchors[1], end);
        context.stroke();
        const length = Math.hypot(end.x - start.x, end.y - start.y);
        const nx = -(end.y - start.y) / length,
          ny = (end.x - start.x) / length;
        context.beginPath();
        context.strokeStyle = "rgba(74, 66, 55, .72)";
        line(start, end);
        for (const p of [start, end])
          line(
            { x: p.x - nx * 4, y: p.y - ny * 4 },
            { x: p.x + nx * 4, y: p.y + ny * 4 },
          );
        context.stroke();
        const labelWidth = context.measureText(text).width + 16;
        const label = dimensionLabelPosition(
          start,
          end,
          labelWidth,
          productCenter,
          { width, height },
        );
        const x = label.x;
        let y = label.y;
        for (const other of occupied)
          if (
            Math.abs(x - other.x) < (labelWidth + other.width) / 2 + 4 &&
            Math.abs(y - other.y) < 25
          )
            y = THREE.MathUtils.clamp(other.y - 27, 15, height - 15);
        occupied.push({ x, y, width: labelWidth });
        const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
        if (Math.hypot(x - midpoint.x, y - midpoint.y) > 2) {
          context.beginPath();
          context.strokeStyle = "rgba(74, 66, 55, .5)";
          line(midpoint, {
            x: THREE.MathUtils.clamp(
              midpoint.x,
              x - labelWidth / 2,
              x + labelWidth / 2,
            ),
            y: THREE.MathUtils.clamp(midpoint.y, y - 11, y + 11),
          });
          context.stroke();
        }
        context.beginPath();
        context.roundRect(x - labelWidth / 2, y - 11, labelWidth, 22, 3);
        context.fillStyle = "rgba(250, 248, 242, .96)";
        context.fill();
        context.fillStyle = "#4a4237";
        context.fillText(text, x, y + 0.5);
      }
    },
    capture(source: HTMLCanvasElement) {
      if (!visible) return source.toDataURL("image/png");
      const output = document.createElement("canvas");
      output.width = source.width;
      output.height = source.height;
      const ctx = output.getContext("2d");
      if (!ctx) return source.toDataURL("image/png");
      ctx.drawImage(source, 0, 0);
      ctx.drawImage(canvas, 0, 0);
      return output.toDataURL("image/png");
    },
    dispose() {
      canvas.remove();
      canvas.width = canvas.height = 1;
    },
  };
}
