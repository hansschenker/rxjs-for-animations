import { of, Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { easeInQuad } from '../src/easing.js';
import { interpolate$, tween$ } from '../src/tween.js';
import type { AnimationClock, AnimationFrame } from '../src/time.js';

const clockFor = (times: readonly number[]): AnimationClock => ({
  now: () => 0,
  frames$: of(...times.map((timestamp) => ({ timestamp }))),
});

describe('value interpolation', () => {
  it('interpolates ascending and descending values with exact endpoints', () => {
    for (const [from, to, expected] of [
      [10, 30, [10, 15, 25, 30]],
      [30, 10, [30, 25, 15, 10]],
    ] as const) {
      const values: number[] = [];
      tween$({ from, to, durationMs: 1000, clock: clockFor([0, 250, 750, 1200]) })
        .subscribe((n) => values.push(n));
      expect(values).toEqual(expected);
    }
  });

  it('applies easing to progress and supports arbitrary projected values', () => {
    const positions: Array<Readonly<{ x: number; opacity: number }>> = [];
    interpolate$({
      durationMs: 1000,
      clock: clockFor([500, 1000]),
      easing: easeInQuad,
      project: (p) => ({ x: 200 * p, opacity: 1 - p }),
    }).subscribe((value) => positions.push(value));

    expect(positions).toEqual([
      { x: 0, opacity: 1 },
      { x: 50, opacity: 0.75 },
      { x: 200, opacity: 0 },
    ]);
  });

  it('preserves exact endpoints while allowing an interior curve to overshoot', () => {
    const values: number[] = [];
    tween$({
      from: 10, to: 20, durationMs: 1000,
      easing: () => 2,
      clock: clockFor([500, 1000]),
    }).subscribe((value) => values.push(value));
    expect(values).toEqual([10, 30, 20]);
  });

  it('emits only the destination for a zero-duration tween', () => {
    const values: number[] = [];
    tween$({ from: 10, to: 20, durationMs: 0 }).subscribe((value) => values.push(value));
    expect(values).toEqual([20]);
  });

  it('does not invent a destination when its clock ends early', () => {
    const values: number[] = [];
    tween$({ from: 0, to: 100, durationMs: 1000, clock: clockFor([250]) })
      .subscribe((n) => values.push(n));
    expect(values).toEqual([0, 25]);
  });

  it('cancels the source when projection or easing fails', () => {
    const frames = new Subject<AnimationFrame>();
    const error = new Error('projection failed');
    const report = vi.fn();
    interpolate$({
      durationMs: 1000,
      clock: { now: () => 0, frames$: frames },
      project: (progress) => {
        if (progress > 0) throw error;
        return progress;
      },
    }).subscribe({ error: report });
    frames.next({ timestamp: 100 });
    expect(report).toHaveBeenCalledWith(error);
    expect(frames.observed).toBe(false);

    const badEasing = vi.fn();
    tween$({
      from: 0, to: 1, durationMs: 1000,
      clock: clockFor([500]), easing: () => NaN,
    }).subscribe({ error: badEasing });
    expect(badEasing).toHaveBeenCalledWith(expect.any(RangeError));
  });

  it('validates endpoints lazily and avoids overflowing the endpoint difference', () => {
    const report = vi.fn();
    tween$({ from: Infinity, to: 1, durationMs: 1000 }).subscribe({ error: report });
    expect(report).toHaveBeenCalledWith(expect.any(RangeError));

    const values: number[] = [];
    tween$({ from: -1e308, to: 1e308, durationMs: 1000, clock: clockFor([500, 1000]) })
      .subscribe((n) => values.push(n));
    expect(values).toEqual([-1e308, 0, 1e308]);
  });
});
