import type { ParticleId, ParticleView } from '../trail.js';

export type DotRendererOptions = Readonly<{
  /** CSS supplies sizing, positioning, color, and pointer-event behavior. */
  className?: string;
}>;

export type DotRenderer = Readonly<{
  render: (dots: readonly ParticleView[]) => void;
  /** Terminal and idempotent. Removes only elements owned by this renderer. */
  dispose: () => void;
}>;

/**
 * Explicit effect boundary. The supplied layer owns the coordinate system:
 * use client coordinates for a fixed viewport layer, or matching local
 * coordinates for a positioned container. This adapter never reads a clock.
 */
export const createDotRenderer = (
  layer: HTMLElement,
  options: DotRendererOptions = {},
): DotRenderer => {
  const elements = new Map<ParticleId, HTMLDivElement>();
  const className = options.className ?? 'dot';
  let disposed = false;

  const render = (dots: readonly ParticleView[]): void => {
    if (disposed) return;

    const liveIds = new Set(dots.map((dot) => dot.id));

    for (const [id, element] of elements) {
      if (!liveIds.has(id)) {
        element.remove();
        elements.delete(id);
      }
    }

    for (const dot of dots) {
      let element = elements.get(dot.id);

      if (!element) {
        // ownerDocument supports layers in other documents, including iframes.
        element = layer.ownerDocument.createElement('div');
        element.className = className;
        element.setAttribute('aria-hidden', 'true');
        layer.append(element);
        elements.set(dot.id, element);
      }

      element.style.transform =
        `translate3d(${dot.x}px, ${dot.y}px, 0) translate(-50%, -50%)`;
      element.style.opacity = String(dot.opacity);
    }
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    for (const element of elements.values()) element.remove();
    elements.clear();
  };

  return { render, dispose };
};
