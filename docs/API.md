# API contracts

All exports use RxJS **7.8.2**. Functions and type aliases are re-exported from `rxjs-for-animations`. Browser adapters are additionally available from `rxjs-for-animations/dom` and `rxjs-for-animations/web-animation`.

## Time and progress

```ts
type AnimationFrame = Readonly<{ timestamp: number }>;
type AnimationClock = Readonly<{
  now: () => number;
  frames$: Observable<AnimationFrame>;
}>;
type ClockOptions = Readonly<{ clock?: AnimationClock }>;

createAnimationClock(provider?: TimestampProvider): AnimationClock
shareAnimationClock(clock: AnimationClock): AnimationClock
elapsed$(options?: ClockOptions): Observable<number>
progress$(durationMs: number, options?: ClockOptions): Observable<number>
```

`createAnimationClock` uses `performance.now()` through RxJS `animationFrames()` by default. Constructing/importing it reads no clock and starts no loop. Each frame connection is independent. Providers must use finite millisecond timestamps and a nonthrowing `now()` function.

`shareAnimationClock` explicitly shares one active frame-source connection. Completion, error, or the last consumer disconnecting resets the sharing state. It does not replay an old frame. Each elapsed/progress consumer still records its own connection origin.

`elapsed$` emits initial `0` synchronously and then nondecreasing elapsed milliseconds. Duplicate elapsed values are suppressed. It forwards source completion/errors; unsubscription does not emit another value.

`progress$` validates duration on connection. Finite positive durations emit initial `0`, bounded progress, and terminal `1` exactly once on reaching the duration. Duration `0` emits only `1` without connecting or reading a clock. Negative or nonfinite durations error. Early source completion never fabricates `1`.

## Interpolation and easing

```ts
tween$({ from, to, durationMs, easing?, clock? }): Observable<number>
interpolate$<T>({ durationMs, project, easing?, clock? }): Observable<T>
type Easing = (progress: number) => number;
```

Numeric endpoints must be finite. `project` and `easing` must be functions. Errors are reported on connection or through the source's error channel when a calculation fails. Default easing is `linear`.

Exact endpoint progress bypasses the easing curve: project receives `0` at the start of a positive-duration animation and `1` at its successful end. A zero-duration animation projects only `1`. Numeric tween returns exact `from`/`to`; interior values use weighted interpolation. Custom easing can overshoot but must return finite values at evaluated interior points.

Independent pure easing functions:

| Family | Exports |
| --- | --- |
| Linear | `linear` |
| Quadratic | `easeInQuad`, `easeOutQuad`, `easeInOutQuad` |
| Cubic | `easeInCubic`, `easeOutCubic`, `easeInOutCubic` |
| Sine | `easeInSine`, `easeOutSine`, `easeInOutSine` |

The built-in curves are intended for `[0,1]`. Bounce, elastic, and spring dynamics are not included.

## Analytic motion

```ts
velocity$({ velocity, initialValue?, clock? }): Observable<number>
accelerate$({ acceleration, initialVelocity?, initialValue?, clock? }):
  Observable<MotionState>

type MotionState = Readonly<{
  elapsedMs: number;
  value: number;
  velocity: number;
}>;
```

Velocity is units/second; acceleration is units/second². Default initial position/velocity is zero. Parameters must be finite. Position derives from absolute elapsed time, so intermediate frame spacing does not change a later result. Streams continue until their clock ends/errors or the consumer closes them. They have no implicit duration or terminal position.

## Particle state

```ts
type ParticleId = string | number;
type ParticleSeed = Readonly<{
  id: ParticleId;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  bornAt: number;
}>;
type ParticleView = Readonly<{
  id: ParticleId;
  x: number;
  y: number;
  opacity: number;
  ageMs: number;
}>;

createTrailModel(): TrailModel
updateTrail(model: TrailModel, action: TrailAction, options?: TrailOptions): TrailModel
projectTrail(model: TrailModel): readonly ParticleView[]
createTrail$(births$, frames$, options?): Observable<readonly ParticleView[]>
```

`TrailAction` is `{ type:'spawn', particle:ParticleSeed }` or `{ type:'frame', now:number }`. `TrailModel` contains `now` and readonly `particles`. Stored `TrailParticle` records add their lifetime at birth. Frames supply `{ timestamp:number }`.

Options are `{ lifetimeMs?:number, maxParticles?:number }`. Lifetime defaults to 1000 ms and must be finite/nonnegative. A zero lifetime is never visible. Capacity is unlimited unless an explicitly supplied positive safe integer bounds it; overflow drops oldest received records. Reusing an ID replaces the previous record. Numeric IDs must be finite. Positions/velocities must be finite, and timestamps must be finite/nonnegative. The model clock never rewinds.

Each connection starts with an empty view and independent state. No implicit sharing, input listener, random sampling, or clock creation occurs here. The supplied input streams own those choices. Both inputs must complete before the result completes. Source errors close both inputs. Consumer cancellation emits no final empty view.

`updateTrail` and `projectTrail` are pure for valid model inputs. `projectTrail` expects a model produced by the constructor/updater, rather than arbitrary expired or malformed records assembled by a caller.

## DOM sink

```ts
createDotRenderer(layer: HTMLElement, options?: { className?: string }): {
  render(dots: readonly ParticleView[]): void;
  dispose(): void;
}
```

Default class is `dot`. CSS owns size, color, positioning, and pointer-event policy. Coordinates must match the layer: viewport `clientX/clientY` for a fixed overlay, or local coordinates for a positioned container.

`render` creates missing IDs, updates present ones, and removes absent ones. It creates nodes through the layer's own document. `render([])` clears without destroying the renderer. `dispose()` removes only its own elements and permanently makes later renders no-ops. It is idempotent. Attach it to the rendering connection with `connection.add(renderer.dispose)`.

DOM exceptions occur at the output boundary. Exceptions thrown by a `subscribe` next handler are not automatically transformed into source error notifications. Application-specific render-failure handling belongs to that boundary.

## Native Web Animations API adapter

```ts
type AnimateElementOptions = Readonly<{
  timing?: number | KeyframeAnimationOptions;
  finish?: 'release' | 'retain';
}>;

animateElement$(
  target: Pick<Element, 'animate'>,
  frames: Keyframe[] | PropertyIndexedKeyframes | null,
  options?: AnimateElementOptions,
): Observable<Animation>
```

One subscription invokes `target.animate()` once. Setup exceptions error the Observable. The captured `finished` promise resolving emits its Animation once and completes. A rejected promise, including external native cancellation, errors the still-connected Observable. Unsubscription cancels the run silently. Promise rejection is observed even after cancellation.

`finish:'release'` is the default: teardown calls `cancel()` even after a successful finish. `finish:'retain'` preserves a successfully finished effect. Persistent final appearance also requires a suitable native fill mode; retain does not choose it. The caller owns the resulting retained Animation and its eventual cancellation. Early unsubscription always cancels regardless of finish policy. Replaying a retained Animation creates another native finished-promise cycle outside this one-run adapter's contract.

The native adapter is deliberately an effect boundary, not a pure per-frame value source. It needs browser animation support only when connected.

## Pure plans and interpretation

```ts
animationPlan(frames: AnimationKeyframes, options?: AnimateElementOptions): AnimationPlan
sequence(steps: readonly AnimationDescription[]): AnimationSequence
group(steps: readonly AnimationDescription[]): AnimationGroup
runAnimation$(target, description, driver?): Observable<Animation>
```

Descriptions are readonly discriminated unions with `kind:'plan' | 'sequence' | 'group'`. Constructors snapshot supplied frame objects, indexed frame arrays, timing objects, and child arrays; readonly typing does not enforce deep runtime freezing.

The optional driver has type `(target:AnimationTarget, plan:AnimationPlan) => Observable<Animation>`. It supports testing or alternative native execution policies. By default, the runner delegates to `animateElement$`.

The interpreter is lazy and preserves nesting. Sequence connects the next child only after completion. Group connects all children and waits for every completion. Each child result is forwarded. Empty sequences/groups complete immediately. Errors close current siblings and stop subsequent serial work. Unsubscription closes active children without a final result. Explicitly retained effects from already-completed children remain caller-owned.
