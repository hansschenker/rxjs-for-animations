import { Subject, switchMap, take } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import {
  animateElement$,
  type AnimateElementOptions,
} from '../src/adapters/web-animation.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;

  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

function nativeAnimation() {
  const finished = deferred<Animation>();
  const abort = new DOMException('Animation cancelled', 'AbortError');
  const cancel = vi.fn(() => finished.reject(abort));
  const animation = {
    finished: finished.promise,
    cancel,
  } as unknown as Animation;

  return {
    animation,
    cancel,
    abort,
    finish: () => finished.resolve(animation),
    fail: finished.reject,
  };
}

// Flush native Promise reactions, not an animation clock or browser timer.
const flushPromises = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('animateElement$', () => {
  it('is lazy and gives every connection its own native run', async () => {
    const first = nativeAnimation();
    const second = nativeAnimation();
    const animate = vi.fn()
      .mockReturnValueOnce(first.animation)
      .mockReturnValueOnce(second.animation);
    const keyframes = [{ opacity: 0 }, { opacity: 1 }];
    const source$ = animateElement$({ animate }, keyframes, { timing: 250 });

    expect(animate).not.toHaveBeenCalled();
    const a = source$.subscribe();
    const b = source$.subscribe();

    expect(animate).toHaveBeenCalledTimes(2);
    expect(animate).toHaveBeenNthCalledWith(1, keyframes, 250);
    a.unsubscribe();
    expect(first.cancel).toHaveBeenCalledTimes(1);
    expect(second.cancel).not.toHaveBeenCalled();
    b.unsubscribe();
    await flushPromises();
    expect(second.cancel).toHaveBeenCalledTimes(1);
  });

  it('emits once on natural finish, completes, and releases by default', async () => {
    const native = nativeAnimation();
    const values: Animation[] = [];
    const complete = vi.fn();
    const connection = animateElement$({ animate: () => native.animation }, [])
      .subscribe({ next: value => values.push(value), complete });

    expect(values).toEqual([]);
    native.finish();
    await flushPromises();

    expect(values).toEqual([native.animation]);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(connection.closed).toBe(true);
    expect(native.cancel).toHaveBeenCalledTimes(1);
  });

  it('retains native fill only when explicitly requested after success', async () => {
    const native = nativeAnimation();
    const animate = vi.fn<Element['animate']>(() => native.animation);
    const timing: KeyframeAnimationOptions = { duration: 200, fill: 'forwards' };
    const connection = animateElement$({ animate }, [{ opacity: 0 }, { opacity: 1 }], {
      timing,
      finish: 'retain',
    }).subscribe();

    native.finish();
    await flushPromises();
    expect(connection.closed).toBe(true);
    expect(animate.mock.calls[0]?.[1]).toBe(timing);
    expect(native.cancel).not.toHaveBeenCalled();
    connection.unsubscribe();
    expect(native.cancel).not.toHaveBeenCalled();
  });

  it('still cancels a retained run when its consumer closes early', async () => {
    const native = nativeAnimation();
    const next = vi.fn();
    const error = vi.fn();
    const complete = vi.fn();
    const connection = animateElement$({ animate: () => native.animation }, [], {
      finish: 'retain',
    }).subscribe({ next, error, complete });

    connection.unsubscribe();
    await flushPromises();

    expect(native.cancel).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });

  it('forwards external native cancellation as an observable error', async () => {
    const native = nativeAnimation();
    const error = vi.fn();
    const complete = vi.fn();
    const connection = animateElement$({ animate: () => native.animation }, [])
      .subscribe({ error, complete });

    native.cancel();
    await flushPromises();

    expect(error).toHaveBeenCalledExactlyOnceWith(native.abort);
    expect(complete).not.toHaveBeenCalled();
    expect(connection.closed).toBe(true);
  });

  it('forwards other native promise failures and releases the resource', async () => {
    const native = nativeAnimation();
    const failure = new Error('Native playback failed');
    const error = vi.fn();
    const connection = animateElement$({ animate: () => native.animation }, [])
      .subscribe({ error });

    native.fail(failure);
    await flushPromises();

    expect(error).toHaveBeenCalledExactlyOnceWith(failure);
    expect(connection.closed).toBe(true);
    expect(native.cancel).toHaveBeenCalledTimes(1);
  });

  it('reports synchronous animate errors through the connection', () => {
    const failure = new TypeError('Invalid keyframes');
    const error = vi.fn();
    const connection = animateElement$({ animate: () => { throw failure; } }, [])
      .subscribe({ error });

    expect(error).toHaveBeenCalledExactlyOnceWith(failure);
    expect(connection.closed).toBe(true);
  });

  it('releases a created native run if reading finished throws', () => {
    const failure = new Error('Cannot observe native finish');
    const cancel = vi.fn();
    const animation = {
      get finished(): Promise<Animation> { throw failure; },
      cancel,
    } as unknown as Animation;
    const error = vi.fn();

    animateElement$({ animate: () => animation }, []).subscribe({ error });

    expect(error).toHaveBeenCalledExactlyOnceWith(failure);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('treats take(1) during successful next as success for retain ownership', async () => {
    const native = nativeAnimation();
    const complete = vi.fn();
    animateElement$({ animate: () => native.animation }, [], { finish: 'retain' })
      .pipe(take(1))
      .subscribe({ complete });

    native.finish();
    await flushPromises();

    expect(complete).toHaveBeenCalledTimes(1);
    expect(native.cancel).not.toHaveBeenCalled();
  });

  it('lets switchMap cancel the old native run and deliver only the latest', async () => {
    const first = nativeAnimation();
    const second = nativeAnimation();
    const animate = vi.fn()
      .mockReturnValueOnce(first.animation)
      .mockReturnValueOnce(second.animation);
    const triggers = new Subject<number>();
    const values: Animation[] = [];
    const error = vi.fn();
    const connection = triggers.pipe(
      switchMap(duration => animateElement$({ animate }, [], { timing: duration })),
    ).subscribe({ next: value => values.push(value), error });

    triggers.next(200);
    triggers.next(300);
    expect(first.cancel).toHaveBeenCalledTimes(1);
    second.finish();
    await flushPromises();

    expect(values).toEqual([second.animation]);
    expect(error).not.toHaveBeenCalled();
    expect(second.cancel).toHaveBeenCalledTimes(1);
    connection.unsubscribe();
  });

  it('rejects an invalid finish policy before starting a native resource', () => {
    const animate = vi.fn();
    const error = vi.fn();
    const invalid = { finish: 'unknown' } as unknown as AnimateElementOptions;

    animateElement$({ animate }, [], invalid).subscribe({ error });

    expect(animate).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledOnce();
    expect(error.mock.calls[0]?.[0]).toBeInstanceOf(TypeError);
  });
});
