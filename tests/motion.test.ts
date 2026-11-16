import fc from 'fast-check';
import { of, Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { accelerate$, velocity$, type MotionState } from '../src/motion.js';
import type { AnimationClock, AnimationFrame } from '../src/time.js';

const clockFor = (times: readonly number[]): AnimationClock => ({
  now: () => 0,
  frames$: of(...times.map((timestamp) => ({ timestamp }))),
});

describe('constant motion', () => {
  it('uses units per second for constant velocity', () => {
    const values: number[] = [];
    velocity$({ initialValue: 10, velocity: 60, clock: clockFor([500, 1000]) })
      .subscribe((value) => values.push(value));
    expect(values).toEqual([10, 40, 70]);
  });

  it('uses absolute elapsed time for acceleration and never mutates older states', () => {
    const values: MotionState[] = [];
    accelerate$({
      initialValue: 10, initialVelocity: 3, acceleration: 4,
      clock: clockFor([500, 1000]),
    }).subscribe((value) => {
      values.push(Object.freeze(value));
    });
    expect(values).toEqual([
      { elapsedMs: 0, value: 10, velocity: 3 },
      { elapsedMs: 500, value: 12, velocity: 5 },
      { elapsedMs: 1000, value: 15, velocity: 7 },
    ]);
    expect(values[0]).not.toBe(values[1]);
  });

  it('has the same final physical state regardless of intermediate frame partition', () => {
    fc.assert(fc.property(
      fc.array(fc.integer({ min: 1, max: 1999 }), { maxLength: 40 }),
      fc.integer({ min: -100, max: 100 }),
      fc.integer({ min: -100, max: 100 }),
      (intermediate, acceleration, initialVelocity) => {
        const times = [...new Set(intermediate)].sort((a, b) => a - b);
        let sparse: MotionState | undefined;
        let dense: MotionState | undefined;
        const options = { acceleration, initialVelocity, initialValue: 17 };
        accelerate$({ ...options, clock: clockFor([2000]) }).subscribe((v) => { sparse = v; });
        accelerate$({ ...options, clock: clockFor([...times, 2000]) }).subscribe((v) => { dense = v; });
        expect(dense).toEqual(sparse);
      },
    ), { numRuns: 150 });
  });

  it('establishes independent origins for each connection and releases on cancel', () => {
    let now = 0;
    const frames = new Subject<AnimationFrame>();
    const source$ = accelerate$({ acceleration: 2, clock: { now: () => now, frames$: frames } });
    const first: MotionState[] = [];
    const second: MotionState[] = [];
    const a = source$.subscribe((state) => first.push(state));
    now = 1000;
    const b = source$.subscribe((state) => second.push(state));
    frames.next({ timestamp: 2000 });
    expect(first[first.length - 1]).toEqual({ elapsedMs: 2000, value: 4, velocity: 4 });
    expect(second[second.length - 1]).toEqual({ elapsedMs: 1000, value: 1, velocity: 2 });
    a.unsubscribe();
    b.unsubscribe();
    expect(frames.observed).toBe(false);
  });

  it('defaults initial velocity to zero and rejects invalid parameters', () => {
    const values: MotionState[] = [];
    accelerate$({ acceleration: 2, clock: clockFor([1000]) }).subscribe((v) => values.push(v));
    expect(values[values.length - 1]).toEqual({ elapsedMs: 1000, value: 1, velocity: 2 });
    const report = vi.fn();
    velocity$({ velocity: NaN }).subscribe({ error: report });
    expect(report).toHaveBeenCalledWith(expect.any(RangeError));
  });
});
