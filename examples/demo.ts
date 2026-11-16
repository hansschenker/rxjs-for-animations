import {
  catchError,
  endWith,
  fromEvent,
  ignoreElements,
  map,
  merge,
  of,
  scan,
  share,
  startWith,
  switchMap,
  takeUntil,
} from 'rxjs';
import {
  animationPlan,
  createAnimationClock,
  createDotRenderer,
  createTrail$,
  easeInOutCubic,
  group,
  runAnimation$,
  sequence,
  shareAnimationClock,
  tween$,
  type ParticleSeed,
  type ParticleView,
} from '../src/index.js';

const element = <T extends HTMLElement>(selector: string): T => {
  const found = document.querySelector<T>(selector);
  if (!found) throw new Error(`Missing demo element: ${selector}`);
  return found;
};

const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

// A single explicitly shared browser frame source serves the active examples.
// Each tween still records its own start time; the trail records each birth.
const clock = shareAnimationClock(createAnimationClock());
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const destroy$ = fromEvent(window, 'pagehide').pipe(share());

// The small effect helpers below are called only by output renderers.
const setText = (target: HTMLElement, value: string): void => {
  if (target.textContent !== value) target.textContent = value;
};

// 1. A collection of particles, calculated as data.
const trailStage = element('#trail-stage');
const dotLayer = element('#dot-layer');
const trailToggle = element<HTMLButtonElement>('#trail-toggle');
const trailStatus = element('#trail-status');
const trailCount = element('#trail-count');
const dots = createDotRenderer(dotLayer);

type TrailView = Readonly<{
  enabled: boolean;
  particles: readonly ParticleView[];
  error?: string;
}>;

const emptyTrail: TrailView = { enabled: false, particles: [] };

// Input adapter: position, random velocity, and birth time are sampled here.
const births$ = fromEvent<PointerEvent>(trailStage, 'pointermove').pipe(
  map((event, id): ParticleSeed => {
    const rect = dotLayer.getBoundingClientRect();
    return {
      id,
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      velocityX: (Math.random() * 2 - 1) * 100,
      velocityY: (Math.random() * 2 - 1) * 100,
      bornAt: clock.now(),
    };
  }),
);

const enabled$ = fromEvent(trailToggle, 'click').pipe(
  scan((enabled) => !enabled, !reducedMotion),
  startWith(!reducedMotion),
);

const trailView$ = enabled$.pipe(
  switchMap((enabled) => enabled
    ? createTrail$(births$, clock.frames$, { lifetimeMs: 1000, maxParticles: 500 }).pipe(
        map((particles): TrailView => ({ enabled: true, particles })),
        catchError((error: unknown) => of<TrailView>({ ...emptyTrail, error: message(error) })),
      )
    : of(emptyTrail),
  ),
);

const renderTrail = (view: TrailView): void => {
  dots.render(view.particles);
  setText(trailToggle, view.error ? 'Reset trail' : view.enabled ? 'Stop trail' : 'Start trail');
  const pressed = String(view.enabled);
  if (trailToggle.getAttribute('aria-pressed') !== pressed) {
    trailToggle.setAttribute('aria-pressed', pressed);
  }
  setText(trailCount, String(view.particles.length));
  setText(trailStatus, view.error
    ? `${view.error} Reset, then start again.`
    : view.enabled ? 'Running · move your pointer' : 'Stopped · all dots cleared');
  const kind = view.error ? 'error' : 'ready';
  if (trailStatus.dataset.kind !== kind) trailStatus.dataset.kind = kind;
};

const trailConnection = trailView$.pipe(takeUntil(destroy$)).subscribe({
  next: renderTrail,
  error: (error: unknown) => renderTrail({ ...emptyTrail, error: message(error) }),
});
trailConnection.add(() => {
  renderTrail(emptyTrail);
  dots.dispose();
});

// 2. A number over time. Repeated presses replace the previous tween.
const tweenPlay = element<HTMLButtonElement>('#tween-play');
const tweenValue = element('#tween-value');
const tweenMarker = element('#tween-marker');
const tweenFill = element('#tween-fill');
const tweenStatus = element('#tween-status');

type TweenView = Readonly<{ value: number; status: string; error?: boolean }>;

const tweenView$ = fromEvent(tweenPlay, 'click').pipe(
  switchMap(() => tween$({
    from: 0,
    to: 100,
    durationMs: reducedMotion ? 0 : 900,
    easing: easeInOutCubic,
    clock,
  }).pipe(
    map((value): TweenView => ({ value, status: value === 100 ? 'Finished · exact endpoint' : 'Playing' })),
    catchError((error: unknown) => of<TweenView>({ value: 0, status: message(error), error: true })),
  )),
  startWith<TweenView>({ value: 0, status: 'Ready · click to play' }),
);

const renderTween = (view: TweenView): void => {
  setText(tweenValue, String(Math.round(view.value)));
  tweenMarker.style.left = `${view.value}%`;
  tweenFill.style.transform = `scaleX(${view.value / 100})`;
  setText(tweenStatus, view.status);
  tweenStatus.dataset.kind = view.error ? 'error' : 'ready';
};

const tweenConnection = tweenView$.pipe(takeUntil(destroy$)).subscribe({
  next: renderTween,
  error: (error: unknown) => renderTween({ value: 0, status: message(error), error: true }),
});
tweenConnection.add(() => renderTween({ value: 0, status: 'Stopped' }));

// 3. The same native plans, interpreted as serial or concurrent execution.
const nativeOrb = element('#native-orb');
const nativeSequence = element<HTMLButtonElement>('#native-sequence');
const nativeGroup = element<HTMLButtonElement>('#native-group');
const nativeStatus = element('#native-status');
const nativeSupported = typeof nativeOrb.animate === 'function';
const nativeDuration = reducedMotion ? 0 : 900;

const movePlan = animationPlan([
  { transform: 'translateX(0px) rotate(0deg)' },
  { transform: 'translateX(60px) rotate(90deg)' },
  { transform: 'translateX(0px) rotate(0deg)' },
], {
  timing: { duration: nativeDuration, easing: 'ease-in-out' },
  finish: 'release',
});

const fadePlan = animationPlan([
  { opacity: 1 },
  { opacity: 0.15 },
  { opacity: 1 },
], {
  timing: { duration: nativeDuration, easing: 'ease-in-out' },
  finish: 'release',
});

type NativeMode = 'sequence' | 'group';
type NativeView = Readonly<{ status: string; error?: boolean; unavailable?: boolean }>;

const nativeRequests$ = merge(
  fromEvent(nativeSequence, 'click').pipe(map((): NativeMode => 'sequence')),
  fromEvent(nativeGroup, 'click').pipe(map((): NativeMode => 'group')),
);

const nativeView$ = nativeSupported
  ? nativeRequests$.pipe(
      switchMap((mode) => runAnimation$(nativeOrb,
        mode === 'sequence' ? sequence([movePlan, fadePlan]) : group([movePlan, fadePlan]),
      ).pipe(
        ignoreElements(),
        endWith<NativeView>({ status: mode === 'sequence' ? 'Sequence finished' : 'Group finished' }),
        startWith<NativeView>({ status: mode === 'sequence' ? 'Moving, then fading' : 'Moving and fading together' }),
        catchError((error: unknown) => of<NativeView>({ status: message(error), error: true })),
      )),
      startWith<NativeView>({ status: 'Ready · choose a policy' }),
    )
  : of<NativeView>({ status: 'Web Animations API is unavailable in this browser.', unavailable: true });

const renderNative = (view: NativeView): void => {
  setText(nativeStatus, view.status);
  nativeStatus.dataset.kind = view.error ? 'error' : 'ready';
  nativeSequence.disabled = Boolean(view.unavailable);
  nativeGroup.disabled = Boolean(view.unavailable);
};

const nativeConnection = nativeView$.pipe(takeUntil(destroy$)).subscribe({
  next: renderNative,
  error: (error: unknown) => renderNative({ status: message(error), error: true }),
});
nativeConnection.add(() => {
  if (nativeSupported) renderNative({ status: 'Stopped' });
});
