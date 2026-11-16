import { concat, defer, merge, type Observable } from 'rxjs';
import { animateElement$, type AnimateElementOptions } from './adapters/web-animation.js';

export type AnimationTarget = Pick<Element, 'animate'>;
export type AnimationKeyframes = readonly Keyframe[] | PropertyIndexedKeyframes | null;

export type AnimationPlan = Readonly<{
  kind: 'plan';
  keyframes: AnimationKeyframes;
  options: AnimateElementOptions;
}>;

export type AnimationSequence = Readonly<{
  kind: 'sequence';
  steps: readonly AnimationDescription[];
}>;

export type AnimationGroup = Readonly<{
  kind: 'group';
  steps: readonly AnimationDescription[];
}>;

export type AnimationDescription = AnimationPlan | AnimationSequence | AnimationGroup;

/** An injected effect boundary, also useful for deterministic composition tests. */
export type AnimationDriver = (
  target: AnimationTarget,
  plan: AnimationPlan,
) => Observable<Animation>;

const copyFrames = (
  frames: AnimationKeyframes,
): Keyframe[] | PropertyIndexedKeyframes | null => {
  if (frames === null) return null;
  if (Array.isArray(frames)) return frames.map((frame: Keyframe) => ({ ...frame }));

  return Object.fromEntries(
    Object.entries(frames).map(([property, value]) => [
      property,
      Array.isArray(value) ? [...value] : value,
    ]),
  ) as PropertyIndexedKeyframes;
};

const copyOptions = (options: AnimateElementOptions): AnimateElementOptions => ({
  ...options,
  ...(typeof options.timing === 'object'
    ? { timing: { ...options.timing } }
    : {}),
});

/** Pure browser-animation description. Snapshots keyframe/timing input values. */
export const animationPlan = (
  frames: AnimationKeyframes,
  options: AnimateElementOptions = {},
): AnimationPlan => ({
  kind: 'plan',
  keyframes: copyFrames(frames),
  options: copyOptions(options),
});

/** Connect each step only after the previous step completes. */
export const sequence = (steps: readonly AnimationDescription[]): AnimationSequence => ({
  kind: 'sequence',
  steps: [...steps],
});

/** Connect children concurrently; finish only after all children finish. */
export const group = (steps: readonly AnimationDescription[]): AnimationGroup => ({
  kind: 'group',
  steps: [...steps],
});

const browserDriver: AnimationDriver = (target, plan) =>
  animateElement$(target, copyFrames(plan.keyframes), copyOptions(plan.options));

/**
 * Lazy interpreter preserving sequence/group nesting. Emits each child's
 * successful Animation value. Completion means every required child completed.
 * Empty compositions complete immediately. Errors stop the composition and
 * close active siblings; explicit unsubscription closes only active children.
 * Native effects retained by explicit finish:'retain' remain caller-owned.
 */
export const runAnimation$ = (
  target: AnimationTarget,
  description: AnimationDescription,
  driver: AnimationDriver = browserDriver,
): Observable<Animation> => defer(() => {
  switch (description.kind) {
    case 'plan':
      return driver(target, description);
    case 'sequence':
      return concat(...description.steps.map((step) => runAnimation$(target, step, driver)));
    case 'group':
      return merge(...description.steps.map((step) => runAnimation$(target, step, driver)));
    default:
      throw new TypeError('Unknown animation description');
  }
});
