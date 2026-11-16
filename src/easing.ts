/** Easing maps normalized progress to interpolation progress. */
export type Easing = (progress: number) => number;

// Independently written elementary polynomial/trigonometric curves.
// The supported input domain is [0, 1]; custom curves may deliberately overshoot.
export const linear: Easing = (t) => t;
export const easeInQuad: Easing = (t) => t * t;
export const easeOutQuad: Easing = (t) => t * (2 - t);
export const easeInOutQuad: Easing = (t) =>
  t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);

export const easeInCubic: Easing = (t) => t * t * t;
export const easeOutCubic: Easing = (t) => 1 - (1 - t) ** 3;
export const easeInOutCubic: Easing = (t) =>
  t < 0.5 ? 4 * t ** 3 : 1 - 4 * (1 - t) ** 3;

export const easeInSine: Easing = (t) =>
  t === 0 || t === 1 ? t : 1 - Math.cos((Math.PI * t) / 2);
export const easeOutSine: Easing = (t) => Math.sin((Math.PI * t) / 2);
export const easeInOutSine: Easing = (t) => (1 - Math.cos(Math.PI * t)) / 2;
