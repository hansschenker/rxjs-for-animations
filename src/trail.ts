import { defer, map, merge, scan, startWith, type Observable } from 'rxjs';

export type ParticleId = string | number;

/** Birth time and frame timestamps must use the same nonnegative millisecond clock. */
export type ParticleSeed = Readonly<{
  id: ParticleId;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  bornAt: number;
}>;

export type TrailParticle = ParticleSeed & Readonly<{ lifetimeMs: number }>;

export type ParticleView = Readonly<{
  id: ParticleId;
  x: number;
  y: number;
  opacity: number;
  ageMs: number;
}>;

export type TrailFrame = Readonly<{ timestamp: number }>;

export type TrailAction =
  | Readonly<{ type: 'spawn'; particle: ParticleSeed }>
  | Readonly<{ type: 'frame'; now: number }>;

export type TrailModel = Readonly<{
  now: number;
  particles: readonly TrailParticle[];
}>;

export type TrailOptions = Readonly<{
  /** Default: 1000. Zero-lifetime particles never become visible. */
  lifetimeMs?: number;
  /** Optional positive safe integer. Overflow drops the oldest received records. */
  maxParticles?: number;
}>;

type ResolvedTrailOptions = Readonly<{
  lifetimeMs: number;
  maxParticles: number;
}>;

const finite = (value: number, label: string): number => {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`);
  return value;
};

const time = (value: number, label: string): number => {
  finite(value, label);
  if (value < 0) throw new RangeError(`${label} must be nonnegative`);
  return value;
};

const resolveOptions = (options: TrailOptions): ResolvedTrailOptions => {
  const lifetimeMs = time(options.lifetimeMs ?? 1000, 'lifetimeMs');
  const maxParticles = options.maxParticles;

  if (maxParticles !== undefined &&
      (!Number.isSafeInteger(maxParticles) || maxParticles < 1)) {
    throw new RangeError('maxParticles must be a positive safe integer');
  }

  return { lifetimeMs, maxParticles: maxParticles ?? Infinity };
};

const validateSeed = (seed: ParticleSeed): void => {
  if (typeof seed.id !== 'string' &&
      !(typeof seed.id === 'number' && Number.isFinite(seed.id))) {
    throw new TypeError('particle.id must be a string or finite number');
  }

  finite(seed.x, 'particle.x');
  finite(seed.y, 'particle.y');
  finite(seed.velocityX, 'particle.velocityX');
  finite(seed.velocityY, 'particle.velocityY');
  time(seed.bornAt, 'particle.bornAt');
};

export const createTrailModel = (): TrailModel => ({ now: 0, particles: [] });

const updateWithOptions = (
  model: TrailModel,
  action: TrailAction,
  options: ResolvedTrailOptions,
): TrailModel => {
  if (action.type === 'spawn') validateSeed(action.particle);

  const actionTime = action.type === 'spawn'
    ? action.particle.bornAt
    : time(action.now, 'frame timestamp');

  // A late action cannot rewind existing particles.
  const now = Math.max(model.now, actionTime);
  const candidates = action.type === 'spawn'
    ? [
        ...model.particles.filter((particle) => particle.id !== action.particle.id),
        { ...action.particle, lifetimeMs: options.lifetimeMs },
      ]
    : model.particles;

  const living = candidates.filter(
    (particle) => now - particle.bornAt < particle.lifetimeMs,
  );

  return {
    now,
    particles: living.length > options.maxParticles
      ? living.slice(-options.maxParticles)
      : living,
  };
};

/** Pure transition. Reusing an ID replaces that particle; time never rewinds. */
export const updateTrail = (
  model: TrailModel,
  action: TrailAction,
  options: TrailOptions = {},
): TrailModel => updateWithOptions(model, action, resolveOptions(options));

/** Pure projection. Position is derived from absolute age, not frame count. */
export const projectTrail = (model: TrailModel): readonly ParticleView[] =>
  model.particles.map((particle) => {
    const ageMs = Math.max(0, model.now - particle.bornAt);
    const seconds = ageMs / 1000;

    return {
      id: particle.id,
      x: particle.x + particle.velocityX * seconds,
      y: particle.y + particle.velocityY * seconds,
      opacity: Math.max(0, 1 - ageMs / particle.lifetimeMs),
      ageMs,
    };
  });

/**
 * Cold, data-only trail. Each connection owns its model and connects once to
 * each supplied source. No implicit sharing, clock read, random sample, or DOM
 * effect occurs here. Supply births and frames from one common clock.
 *
 * Every action may emit a view, including births between animation frames.
 * Completes when BOTH inputs complete. Closing a connection emits no final
 * empty view; a rendering adapter must own its disposal separately.
 */
export const createTrail$ = (
  births$: Observable<ParticleSeed>,
  frames$: Observable<TrailFrame>,
  options: TrailOptions = {},
): Observable<readonly ParticleView[]> => defer(() => {
  const resolved = resolveOptions(options);
  const actions$ = merge(
    births$.pipe(map((particle): TrailAction => ({ type: 'spawn', particle }))),
    frames$.pipe(map(({ timestamp }): TrailAction => ({ type: 'frame', now: timestamp }))),
  );
  const initialView: readonly ParticleView[] = [];

  return actions$.pipe(
    scan((model, action) => updateWithOptions(model, action, resolved), createTrailModel()),
    map(projectTrail),
    startWith(initialView),
  );
});
