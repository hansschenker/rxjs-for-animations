import { EMPTY, Observable, Subject, of, take } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import {
  createTrail$,
  createTrailModel,
  projectTrail,
  updateTrail,
  type ParticleSeed,
  type ParticleView,
  type TrailFrame,
} from '../src/trail.js';

const seed = (overrides: Partial<ParticleSeed> = {}): ParticleSeed => ({
  id: 1, x: 200, y: 300, velocityX: 60, velocityY: -40, bornAt: 0,
  ...overrides,
});

describe('trail state', () => {
  it('uses independent birth times and expires exactly at the lifetime boundary', () => {
    let model = updateTrail(createTrailModel(), { type: 'spawn', particle: seed() });
    model = updateTrail(model, { type: 'spawn', particle: seed({ id: 2, bornAt: 400 }) });
    model = updateTrail(model, { type: 'frame', now: 500 });

    expect(projectTrail(model)).toEqual([
      { id: 1, x: 230, y: 280, opacity: 0.5, ageMs: 500 },
      { id: 2, x: 206, y: 296, opacity: 0.9, ageMs: 100 },
    ]);
    model = updateTrail(model, { type: 'frame', now: 1000 });
    expect(projectTrail(model).map((dot) => dot.id)).toEqual([2]);
    expect(projectTrail(updateTrail(model, { type: 'frame', now: 1400 }))).toEqual([]);
  });

  it.each([[500], [16, 32, 100, 250, 500], [8, 75, 450, 500]])(
    'arrives at the same position regardless of intermediate frame delivery: %j',
    (...times: number[]) => {
      let model = updateTrail(createTrailModel(), { type: 'spawn', particle: seed() });
      for (const now of times) model = updateTrail(model, { type: 'frame', now });
      expect(projectTrail(model)[0]).toEqual({
        id: 1, x: 230, y: 280, opacity: 0.5, ageMs: 500,
      });
    },
  );

  it('does not mutate frozen inputs or rewind on late frame timestamps', () => {
    const particle = Object.freeze(seed());
    const original = Object.freeze({ now: 0, particles: Object.freeze([]) });
    const spawned = updateTrail(original, Object.freeze({ type: 'spawn', particle }));
    const advanced = updateTrail(spawned, { type: 'frame', now: 500 });
    const late = updateTrail(advanced, { type: 'frame', now: 100 });

    expect(original).toEqual({ now: 0, particles: [] });
    expect(spawned.now).toBe(0);
    expect(late.now).toBe(500);
    expect(projectTrail(late)).toEqual(projectTrail(advanced));
  });

  it('replaces a reused identity and bounds records by an explicit limit', () => {
    const options = { maxParticles: 2 };
    let model = createTrailModel();
    for (const id of [1, 2, 3]) {
      model = updateTrail(model, { type: 'spawn', particle: seed({ id }) }, options);
    }
    expect(model.particles.map((dot) => dot.id)).toEqual([2, 3]);

    model = updateTrail(model, { type: 'spawn', particle: seed({ id: 2, x: 999 }) }, options);
    expect(model.particles.map((dot) => dot.id)).toEqual([3, 2]);
    expect(projectTrail(model).find((dot) => dot.id === 2)?.x).toBe(999);
  });

  it('never shows a zero-lifetime particle or resurrects a late expired birth', () => {
    expect(projectTrail(updateTrail(
      createTrailModel(), { type: 'spawn', particle: seed() }, { lifetimeMs: 0 },
    ))).toEqual([]);

    const advanced = updateTrail(createTrailModel(), { type: 'frame', now: 2000 });
    expect(projectTrail(updateTrail(advanced, { type: 'spawn', particle: seed() }))).toEqual([]);
  });
});

describe('createTrail$', () => {
  it('is lazy, gives each connection independent state, and releases both inputs', () => {
    const births = new Subject<ParticleSeed>();
    const frames = new Subject<TrailFrame>();
    const connectBirths = vi.fn();
    const closeBirths = vi.fn();
    const connectFrames = vi.fn();
    const closeFrames = vi.fn();
    const births$ = new Observable<ParticleSeed>((subscriber) => {
      connectBirths();
      const connection = births.subscribe(subscriber);
      return () => { connection.unsubscribe(); closeBirths(); };
    });
    const frames$ = new Observable<TrailFrame>((subscriber) => {
      connectFrames();
      const connection = frames.subscribe(subscriber);
      return () => { connection.unsubscribe(); closeFrames(); };
    });
    const trail$ = createTrail$(births$, frames$);
    expect(connectBirths).not.toHaveBeenCalled();
    const firstViews: (readonly ParticleView[])[] = [];
    const first = trail$.subscribe((view) => firstViews.push(view));
    births.next(seed());
    frames.next({ timestamp: 500 });
    const secondViews: (readonly ParticleView[])[] = [];
    const second = trail$.subscribe((view) => secondViews.push(view));
    expect(firstViews.at(-1)?.length).toBe(1);
    expect(secondViews).toEqual([[]]);
    expect(connectBirths).toHaveBeenCalledTimes(2);
    expect(connectFrames).toHaveBeenCalledTimes(2);

    const emissionsBeforeClose = firstViews.length;
    first.unsubscribe();
    expect(firstViews).toHaveLength(emissionsBeforeClose);
    expect(closeBirths).toHaveBeenCalledTimes(1);
    expect(closeFrames).toHaveBeenCalledTimes(1);
    births.next(seed({ id: 2, bornAt: 600 }));
    expect(firstViews).toHaveLength(emissionsBeforeClose);
    expect(secondViews.at(-1)?.map((dot) => dot.id)).toEqual([2]);
    second.unsubscribe();
    expect(closeBirths).toHaveBeenCalledTimes(2);
    expect(closeFrames).toHaveBeenCalledTimes(2);
  });

  it('does not connect inputs if the initial empty view satisfies take(1)', () => {
    const subscribed = vi.fn();
    const source$ = new Observable<ParticleSeed>(() => { subscribed(); });
    createTrail$(source$, EMPTY).pipe(take(1)).subscribe();
    expect(subscribed).not.toHaveBeenCalled();
  });

  it('waits for both sources to complete without fabricating an expiry frame', () => {
    const births = new Subject<ParticleSeed>();
    const frames = new Subject<TrailFrame>();
    const complete = vi.fn();
    const views: (readonly ParticleView[])[] = [];
    createTrail$(births, frames).subscribe({ next: (view) => views.push(view), complete });
    births.next(seed());
    births.complete();
    expect(complete).not.toHaveBeenCalled();
    frames.next({ timestamp: 250 });
    frames.complete();
    expect(complete).toHaveBeenCalledOnce();
    expect(views.at(-1)?.[0]?.ageMs).toBe(250);
  });

  it.each([
    { lifetimeMs: -1 }, { lifetimeMs: Infinity }, { lifetimeMs: NaN },
    { maxParticles: 0 }, { maxParticles: 1.5 }, { maxParticles: Infinity },
  ])('reports invalid configuration through the error channel: %j', (options) => {
    const error = vi.fn();
    createTrail$(EMPTY, EMPTY, options).subscribe({ error });
    expect(error).toHaveBeenCalledOnce();
    expect(error.mock.calls[0]?.[0]).toBeInstanceOf(RangeError);
  });

  it('rejects invalid motion input and releases the other input', () => {
    const births = new Subject<ParticleSeed>();
    const framesClosed = vi.fn();
    const frames$ = new Observable<TrailFrame>(() => framesClosed);
    const error = vi.fn();
    createTrail$(births, frames$).subscribe({ error });
    births.next(seed({ velocityX: NaN }));
    expect(error.mock.calls[0]?.[0]).toBeInstanceOf(RangeError);
    expect(framesClosed).toHaveBeenCalledOnce();
  });

  it('rejects a nonfinite frame timestamp', () => {
    const error = vi.fn();
    createTrail$(EMPTY, of({ timestamp: NaN })).subscribe({ error });
    expect(error.mock.calls[0]?.[0]).toBeInstanceOf(RangeError);
  });
});
