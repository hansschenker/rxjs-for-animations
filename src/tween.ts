import { defer, map, type Observable } from 'rxjs';
import { linear, type Easing } from './easing.js';
import { progress$, type ClockOptions } from './time.js';

export type InterpolationOptions<T> = ClockOptions & Readonly<{
  durationMs: number;
  project: (progress: number) => T;
  easing?: Easing;
}>;

export type TweenOptions = ClockOptions & Readonly<{
  from: number;
  to: number;
  durationMs: number;
  easing?: Easing;
}>;

function easedProgress(progress: number, easing: Easing): number {
  // Exact endpoints are part of the interpolation contract, even for a custom
  // curve whose numerical value at 0 or 1 would be different.
  if (progress === 0 || progress === 1) return progress;
  const eased = easing(progress);
  if (!Number.isFinite(eased)) {
    throw new RangeError('Easing must produce a finite number');
  }
  return eased;
}

/**
 * Project progress to any value: a point, transform, color model, or domain state.
 * No rendering occurs. A projection/curve exception follows the error channel.
 */
export function interpolate$<T>(
  options: InterpolationOptions<T>,
): Observable<T> {
  return defer(() => {
    const { durationMs, project, easing = linear, clock } = options;
    if (typeof project !== 'function' || typeof easing !== 'function') {
      throw new TypeError('project and easing must be functions');
    }

    return progress$(durationMs, { clock }).pipe(
      map((progress) => project(easedProgress(progress, easing))),
    );
  });
}

/** A lazy numeric tween with exact start/end values and duration in milliseconds. */
export function tween$(options: TweenOptions): Observable<number> {
  return defer(() => {
    const { from, to, durationMs, easing, clock } = options;
    if (!Number.isFinite(from) || !Number.isFinite(to)) {
      throw new RangeError('Tween endpoints must be finite');
    }

    return interpolate$({
      durationMs,
      easing,
      clock,
      project: (progress) => {
        if (progress === 0) return from;
        if (progress === 1) return to;
        // Weighted interpolation avoids overflowing to-from for large
        // finite endpoints of opposite sign.
        return (1 - progress) * from + progress * to;
      },
    });
  });
}
