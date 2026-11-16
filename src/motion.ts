import { defer, map, type Observable } from 'rxjs';
import { elapsed$, type ClockOptions } from './time.js';

export type VelocityOptions = ClockOptions & Readonly<{
  /** Units per second. */
  velocity: number;
  initialValue?: number;
}>;

export type AccelerationOptions = ClockOptions & Readonly<{
  /** Units per second squared. */
  acceleration: number;
  /** Units per second; defaults to zero. */
  initialVelocity?: number;
  initialValue?: number;
}>;

export type MotionState = Readonly<{
  elapsedMs: number;
  value: number;
  velocity: number;
}>;

function requireFinite(values: readonly number[]): void {
  if (values.some((value) => !Number.isFinite(value))) {
    throw new RangeError('Motion parameters must be finite');
  }
}

/** Constant-velocity positions; naturally unbounded until the source ends/closes. */
export function velocity$(options: VelocityOptions): Observable<number> {
  return defer(() => {
    const { velocity, initialValue = 0, clock } = options;
    requireFinite([velocity, initialValue]);

    return elapsed$({ clock }).pipe(
      map((elapsedMs) => initialValue + velocity * (elapsedMs / 1000)),
    );
  });
}

/**
 * Constant-acceleration motion, evaluated analytically from absolute elapsed time:
 * x = x0 + v0*t + a*t*t/2, v = v0 + a*t. The result is independent of the
 * number/spacing of intermediate frames; previous records are never mutated.
 */
export function accelerate$(
  options: AccelerationOptions,
): Observable<MotionState> {
  return defer(() => {
    const {
      acceleration,
      initialVelocity = 0,
      initialValue = 0,
      clock,
    } = options;
    requireFinite([acceleration, initialVelocity, initialValue]);

    return elapsed$({ clock }).pipe(
      map((elapsedMs): MotionState => {
        const seconds = elapsedMs / 1000;
        return {
          elapsedMs,
          value: initialValue + initialVelocity * seconds
            + acceleration * seconds * seconds / 2,
          velocity: initialVelocity + acceleration * seconds,
        };
      }),
    );
  });
}
