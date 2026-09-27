import { useEffect, useRef, useState } from "react";
import { Box } from "lucide-react";
import Viewer from "./Viewer";
import type { PublicMaterial, PublicProduct } from "./types";

// A large viewport must not create one WebGL context for the entire catalog.
const activePreviews = new Set<() => void>();
const waitingPreviews = new Set<() => void>();
const MAX_ACTIVE_PREVIEWS = 8;

function requestPreview(start: () => void) {
  if (activePreviews.size < MAX_ACTIVE_PREVIEWS) {
    activePreviews.add(start);
    start();
  } else waitingPreviews.add(start);
  return () => {
    waitingPreviews.delete(start);
    if (!activePreviews.delete(start)) return;
    const next = waitingPreviews.values().next().value;
    if (next) {
      waitingPreviews.delete(next);
      activePreviews.add(next);
      next();
    }
  };
}

export function CardPreview({
  product,
  materials,
}: {
  product: PublicProduct;
  materials: PublicMaterial[];
}) {
  const container = useRef<HTMLDivElement>(null);
  const [nearby, setNearby] = useState(false);
  const [granted, setGranted] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [keyboardFocused, setKeyboardFocused] = useState(false);
  const hasDoors =
    product.preview?.geometry.some((panel) => panel.door) ?? false;

  useEffect(() => {
    const card = container.current?.closest("a");
    if (!card || !hasDoors) return;
    const hoverPointer = window.matchMedia(
      "(hover: hover) and (pointer: fine)",
    );
    const enter = (event: PointerEvent) => {
      if (event.pointerType === "mouse" && hoverPointer.matches)
        setHovered(true);
    };
    const leave = () => setHovered(false);
    const focus = () => setKeyboardFocused(card.matches(":focus-visible"));
    const blur = () => setKeyboardFocused(false);
    const pointerChanged = () => {
      if (!hoverPointer.matches) leave();
    };
    const hide = () => {
      if (document.hidden) leave();
    };
    card.addEventListener("pointerenter", enter);
    card.addEventListener("pointerleave", leave);
    card.addEventListener("pointercancel", leave);
    card.addEventListener("focus", focus);
    card.addEventListener("blur", blur);
    hoverPointer.addEventListener("change", pointerChanged);
    window.addEventListener("blur", leave);
    document.addEventListener("visibilitychange", hide);
    if (document.activeElement === card) focus();
    return () => {
      card.removeEventListener("pointerenter", enter);
      card.removeEventListener("pointerleave", leave);
      card.removeEventListener("pointercancel", leave);
      card.removeEventListener("focus", focus);
      card.removeEventListener("blur", blur);
      hoverPointer.removeEventListener("change", pointerChanged);
      window.removeEventListener("blur", leave);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [hasDoors]);

  useEffect(() => {
    const element = container.current;
    if (!element || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        setNearby(entry.isIntersecting);
        if (!entry.isIntersecting) setHovered(false);
      },
      { rootMargin: "60px 0px", threshold: 0 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!nearby || !product.preview) return;
    const release = requestPreview(() => setGranted(true));
    return () => {
      setGranted(false);
      release();
    };
  }, [nearby, product.preview]);

  return (
    <div className="card-preview" ref={container}>
      {nearby && granted && product.preview ? (
        <Viewer
          small
          panels={product.preview.geometry}
          materials={materials}
          {...product.defaults}
          open={hasDoors && (hovered || keyboardFocused)}
        />
      ) : (
        <div
          className="card-preview-placeholder"
          role="img"
          aria-label={`${product.name}. Abre el modelo para ver su diseño en 3D.`}
        >
          <Box size={38} strokeWidth={1} aria-hidden="true" />
          <span>Explora este modelo</span>
        </div>
      )}
    </div>
  );
}
