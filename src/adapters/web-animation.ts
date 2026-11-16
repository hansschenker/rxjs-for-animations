import { Observable } from 'rxjs';

/** Native animation settings and ownership of its successful final effect. */
export type AnimateElementOptions = Readonly<{
  /** Forwarded unchanged to Element.animate(). */
  timing?: number | KeyframeAnimationOptions;
  /**
   * `release` (default): cancel the finished native animation during teardown.
   * `retain`: preserve its successful native fill behavior. For a lasting final
   * appearance, also request `timing.fill: 'forwards'` or `'both'`. The caller
   * then owns the returned Animation and must eventually cancel it.
   * Early unsubscription always cancels, regardless of this setting.
   */
  finish?: 'release' | 'retain';
}>;

/**
 * Connect one native Web Animations API run to an RxJS connection.
 *
 * Nothing starts until subscription. Every subscription calls `animate()`
 * separately. Natural finish emits that Animation once and then completes;
 * it is not a per-frame stream. Unsubscription cancels the owned run without
 * emitting a completion or error notification. External native cancellation
 * rejects `finished` and becomes an observable error while connected.
 *
 * This is an effect adapter. The renderer-independent animation core does not
 * need it. A source connection owns exactly the captured `finished` promise;
 * replaying the native Animation object is outside this one-run contract.
 */
export function animateElement$(
  target: Pick<Element, 'animate'>,
  keyframes: Keyframe[] | PropertyIndexedKeyframes | null,
  options: AnimateElementOptions = {},
): Observable<Animation> {
  return new Observable<Animation>((subscriber) => {
    const finishPolicy = options.finish ?? 'release';

    if (finishPolicy !== 'release' && finishPolicy !== 'retain') {
      throw new TypeError('finish must be "release" or "retain"');
    }

    // RxJS turns synchronous setup failures into observable errors.
    const animation = target.animate(keyframes, options.timing);
    let finishedNaturally = false;

    // Register ownership before reading the native promise: even a failing
    // custom/native adapter getter cannot leave the created run unowned.
    subscriber.add(() => {
      if (!finishedNaturally || finishPolicy === 'release') {
        animation.cancel();
      }
    });

    // Install both handlers immediately. cancel() rejects a pending finished
    // promise; the rejection is consumed even after our connection is closed.
    void animation.finished.then(
      () => {
        if (subscriber.closed) return;

        // Set before next(): a downstream take(1) can close us during next.
        finishedNaturally = true;
        subscriber.next(animation);
        subscriber.complete();
      },
      (error: unknown) => {
        if (!subscriber.closed) subscriber.error(error);
      },
    );
  });
}
