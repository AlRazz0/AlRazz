import { useEffect, useRef, type RefObject } from "react";

/** Content is visible by default; motion only decorates an observed entrance. */
export function useRevealMotion(
  container: RefObject<HTMLElement | null>,
  revision: string,
) {
  const revealed = useRef(new WeakMap<Element, string>());
  useEffect(() => {
    const element = container.current;
    if (!element || !("IntersectionObserver" in window)) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const animations = new Set<Animation>();
    const finishAnimations = () => {
      if (!preference.matches) return;
      animations.forEach((animation) => animation.cancel());
      animations.clear();
    };
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const target = entry.target as HTMLElement;
          observer.unobserve(target);
          const key = target.dataset.revealKey || "once";
          if (revealed.current.get(target) === key) continue;
          revealed.current.set(target, key);
          if (preference.matches || typeof target.animate !== "function")
            continue;
          const animation = target.animate(
            [
              { opacity: 0, transform: "translateY(20px)" },
              { opacity: 1, transform: "translateY(0)" },
            ],
            {
              duration: 680,
              delay: Math.min(Number(target.dataset.revealDelay) || 0, 240),
              easing: "cubic-bezier(0.22, 1, 0.36, 1)",
              fill: "backwards",
            },
          );
          animations.add(animation);
          animation.onfinish = () => animations.delete(animation);
          animation.oncancel = () => animations.delete(animation);
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -24px 0px" },
    );
    element.querySelectorAll<HTMLElement>("[data-reveal]").forEach((target) => {
      if (
        revealed.current.get(target) !== (target.dataset.revealKey || "once")
      ) {
        observer.observe(target);
      }
    });
    preference.addEventListener("change", finishAnimations);
    return () => {
      observer.disconnect();
      preference.removeEventListener("change", finishAnimations);
      animations.forEach((animation) => animation.cancel());
    };
  }, [container, revision]);
}
