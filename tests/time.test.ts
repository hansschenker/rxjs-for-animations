import { Observable, Subject, take } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createAnimationClock,
  elapsed$,
  progress$,
  shareAnimationClock,
  type AnimationClock,
  type AnimationFrame,
} from '../src/time.js';

function manualClock(initialTime = 0) {
  let now = initialTime;
  const frames = new Subject<AnimationFrame>();
  const clock: AnimationClock = { now: () => now, frames$: frames };
  return {
    clock,
    frames,
    setTime: (time: number) => { now = time; },
    tick: (time: number) => {
      now = time;
      frames.next({ timestamp: time });
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('animation clocks and progress', () => {
  it('creates a lazy clock and cancels its pending browser frame on close', () => {
    const requested = vi.fn(() => 42);
    const canceled = vi.fn();
    const now = vi.fn(() => 100);
    vi.stubGlobal('requestAnimationFrame', requested);
    vi.stubGlobal('cancelAnimationFrame', canceled);

    const clock = createAnimationClock({ now });
    expect(now).not.toHaveBeenCalled();
    expect(requested).not.toHaveBeenCalled();

    const connection = clock.frames$.subscribe();
    expect(requested).toHaveBeenCalledTimes(1);
    connection.unsubscribe();
    expect(canceled).toHaveBeenCalledWith(42);
  });

  it('starts at zero, emits an exact endpoint once, and closes its input', () => {
    const { clock, frames, tick } = manualClock(100);
    const values: number[] = [];
    const complete = vi.fn();
    const connection = progress$(1000, { clock }).subscribe({
      next: (value) => values.push(value), complete,
    });

    tick(100);
    tick(350);
    tick(850);
    tick(1200);
    tick(1500);

    expect(values).toEqual([0, 0.25, 0.75, 1]);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(connection.closed).toBe(true);
    expect(frames.observed).toBe(false);
  });

  it('gives late consumers independent origins even with a shared frame clock', () => {
    const test = manualClock();
    const clock = shareAnimationClock(test.clock);
    const first: number[] = [];
    const second: number[] = [];
    const a = progress$(1000, { clock }).subscribe((n) => first.push(n));
    test.tick(250);
    const b = progress$(1000, { clock }).subscribe((n) => second.push(n));
    test.tick(500);

    expect(first).toEqual([0, 0.25, 0.5]);
    expect(second).toEqual([0, 0.25]);
    expect(test.frames.observers).toHaveLength(1);
    a.unsubscribe();
    b.unsubscribe();
    expect(test.frames.observed).toBe(false);
  });

  it('shares only when requested and reconnects after the last close', () => {
    let opens = 0;
    let closes = 0;
    const clock = shareAnimationClock({
      now: () => 0,
      frames$: new Observable<AnimationFrame>(() => {
        opens += 1;
        return () => { closes += 1; };
      }),
    });
    const a = clock.frames$.subscribe();
    const b = clock.frames$.subscribe();
    expect(opens).toBe(1);
    a.unsubscribe();
    expect(closes).toBe(0);
    b.unsubscribe();
    expect(closes).toBe(1);
    clock.frames$.subscribe().unsubscribe();
    expect(opens).toBe(2);
    expect(closes).toBe(2);
  });

  it('does not read or connect to a clock for a zero-duration animation', () => {
    const now = vi.fn(() => { throw new Error('must not read'); });
    const subscribe = vi.fn(() => { throw new Error('must not connect'); });
    const values: number[] = [];
    progress$(0, { clock: { now, frames$: new Observable(subscribe) } })
      .subscribe((n) => values.push(n));
    expect(values).toEqual([1]);
    expect(now).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('does not connect frames when an initial-value consumer immediately closes', () => {
    const subscribe = vi.fn();
    progress$(1000, {
      clock: { now: () => 0, frames$: new Observable(subscribe) },
    }).pipe(take(1)).subscribe();
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('does not invent the endpoint on early completion or cancellation', () => {
    const early = manualClock();
    const earlyValues: number[] = [];
    progress$(1000, { clock: early.clock }).subscribe((n) => earlyValues.push(n));
    early.tick(400);
    early.frames.complete();
    expect(earlyValues).toEqual([0, 0.4]);

    const canceled = manualClock();
    const values: number[] = [];
    const complete = vi.fn();
    const connection = progress$(1000, { clock: canceled.clock }).subscribe({
      next: (n) => values.push(n), complete,
    });
    canceled.tick(400);
    connection.unsubscribe();
    canceled.tick(1200);
    expect(values).toEqual([0, 0.4]);
    expect(complete).not.toHaveBeenCalled();
  });

  it('forwards frame errors and rejects invalid durations via the error channel', () => {
    const test = manualClock();
    const error = new Error('frame source failed');
    const report = vi.fn();
    progress$(1000, { clock: test.clock }).subscribe({ error: report });
    test.frames.error(error);
    expect(report).toHaveBeenCalledWith(error);

    for (const duration of [-1, Infinity, -Infinity, NaN]) {
      const invalid = vi.fn();
      expect(() => progress$(duration)).not.toThrow();
      progress$(duration).subscribe({ error: invalid });
      expect(invalid).toHaveBeenCalledWith(expect.any(RangeError));
    }
  });

  it('keeps elapsed time monotone across duplicate or older timestamps', () => {
    const test = manualClock(100);
    const values: number[] = [];
    const connection = elapsed$({ clock: test.clock }).subscribe((n) => values.push(n));
    test.tick(90);
    test.tick(300);
    test.tick(200);
    test.tick(300);
    test.tick(500);
    expect(values).toEqual([0, 200, 400]);
    connection.unsubscribe();
  });

  it('reports non-finite clock inputs without leaving the frame source connected', () => {
    const test = manualClock();
    const report = vi.fn();
    elapsed$({ clock: test.clock }).subscribe({ error: report });
    test.tick(NaN);
    expect(report).toHaveBeenCalledWith(expect.any(RangeError));
    expect(test.frames.observed).toBe(false);

    test.setTime(Infinity);
    const invalidOrigin = vi.fn();
    elapsed$({ clock: test.clock }).subscribe({ error: invalidOrigin });
    expect(invalidOrigin).toHaveBeenCalledWith(expect.any(RangeError));
  });
});
