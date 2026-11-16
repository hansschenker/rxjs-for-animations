import {
  animationFrames,
  defer,
  distinctUntilChanged,
  map,
  of,
  scan,
  share,
  startWith,
  takeWhile,
  type Observable,
  type TimestampProvider,
} from 'rxjs';

/** A timestamp in milliseconds in the same time domain as AnimationClock.now. */
export type AnimationFrame = Readonly<{ timestamp: number }>;

/** Time is an input. A clock does not imply sharing its frame connection. */
export type AnimationClock = Readonly<{
  now: () => number;
  frames$: Observable<AnimationFrame>;
}>;

export type ClockOptions = Readonly<{ clock?: AnimationClock }>;

const browserTime: TimestampProvider = {
  now: () => globalThis.performance.now(),
};

/**
 * Create a lazy browser clock. Constructing/importing it does not read time or
 * request a frame. Every frames$ connection has its own browser frame loop.
 */
export function createAnimationClock(
  timestampProvider: TimestampProvider = browserTime,
): AnimationClock {
  return {
    now: () => timestampProvider.now(),
    frames$: animationFrames(timestampProvider),
  };
}

/**
 * Explicitly share one frame loop between active consumers. The last close
 * releases that loop; completion/error/zero consumers reset the shared source.
 * Each progress$/elapsed$ connection still establishes its own time origin.
 */
export function shareAnimationClock(clock: AnimationClock): AnimationClock {
  return {
    now: () => clock.now(),
    frames$: clock.frames$.pipe(share()),
  };
}

const defaultClock = createAnimationClock();

function requireFinite(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be finite`);
  }
}

/**
 * Elapsed milliseconds since this connection, beginning synchronously at zero.
 * Older/out-of-order frame timestamps cannot move elapsed time backwards.
 * Source completion/error and cancellation propagate without a fabricated tick.
 */
export function elapsed$(options: ClockOptions = {}): Observable<number> {
  return defer(() => {
    const clock = options.clock ?? defaultClock;
    const origin = clock.now();
    requireFinite(origin, 'Clock origin');

    return clock.frames$.pipe(
      map(({ timestamp }) => {
        requireFinite(timestamp, 'Frame timestamp');
        return Math.max(0, timestamp - origin);
      }),
      scan((previous, elapsed) => Math.max(previous, elapsed), 0),
      startWith(0),
      distinctUntilChanged(),
    );
  });
}

/**
 * Normalized progress: initial 0, then values through an exact terminal 1.
 * A zero duration emits only 1 and does not connect to/read the clock.
 * Early source completion or cancellation does not manufacture the endpoint.
 * Invalid durations are reported through the Observable's error channel.
 */
export function progress$(
  durationMs: number,
  options: ClockOptions = {},
): Observable<number> {
  return defer(() => {
    requireFinite(durationMs, 'durationMs');
    if (durationMs < 0) {
      throw new RangeError('durationMs must be non-negative');
    }
    if (durationMs === 0) return of(1);

    return elapsed$(options).pipe(
      map((elapsed) => Math.min(1, elapsed / durationMs)),
      distinctUntilChanged(),
      takeWhile((progress) => progress < 1, true),
    );
  });
}
