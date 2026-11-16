import { describe, expect, it, vi } from 'vitest';
import { Observable, Subject, of, throwError } from 'rxjs';
import {
  animationPlan,
  group,
  runAnimation$,
  sequence,
  type AnimationDescription,
  type AnimationDriver,
  type AnimationTarget,
} from '../src/plans.js';

const target: AnimationTarget = { animate: () => { throw new Error('unused native boundary'); } };
const a = animationPlan([{ opacity: 0 }, { opacity: 1 }], { timing: 100 });
const b = animationPlan([{ transform: 'none' }], { timing: 200 });
const result = {} as Animation;

describe('animation descriptions and composition', () => {
  it('snapshots keyframes, indexed keyframe arrays, timing, and child lists', () => {
    const frames = [{ opacity: 0 }];
    const timing = { duration: 100 };
    const description = animationPlan(frames, { timing });
    frames[0].opacity = 1;
    timing.duration = 999;
    expect(description.keyframes).toEqual([{ opacity: 0 }]);
    expect(description.options.timing).toEqual({ duration: 100 });
    const indexed = { opacity: [0, 1] };
    const indexedPlan = animationPlan(indexed);
    indexed.opacity[0] = 9;
    expect(indexedPlan.keyframes).toEqual({ opacity: [0, 1] });
    const children: AnimationDescription[] = [a];
    const serial = sequence(children);
    const concurrent = group(children);
    children.push(b);
    expect(serial.steps).toHaveLength(1);
    expect(concurrent.steps).toHaveLength(1);
  });

  it('is lazy and every connection invokes a fresh driver', () => {
    const driver = vi.fn(() => of(result));
    const source$ = runAnimation$(target, a, driver);
    expect(driver).not.toHaveBeenCalled();
    source$.subscribe();
    source$.subscribe();
    expect(driver).toHaveBeenCalledTimes(2);
  });

  it('advances a sequence on completion, never on next alone', () => {
    const first$ = new Subject<Animation>();
    const second$ = new Subject<Animation>();
    const driver = vi.fn<AnimationDriver>((_target, plan) => plan === a ? first$ : second$);
    const complete = vi.fn();
    const values: Animation[] = [];
    runAnimation$(target, sequence([a, b]), driver).subscribe({ next: v => values.push(v), complete });
    first$.next(result);
    expect(driver).toHaveBeenCalledTimes(1);
    expect(complete).not.toHaveBeenCalled();
    first$.complete();
    expect(driver).toHaveBeenCalledTimes(2);
    second$.next(result);
    second$.complete();
    expect(values).toHaveLength(2);
    expect(complete).toHaveBeenCalledOnce();
  });

  it('connects a group concurrently and waits for every child', () => {
    const first$ = new Subject<Animation>();
    const second$ = new Subject<Animation>();
    const driver = vi.fn<AnimationDriver>((_target, plan) => plan === a ? first$ : second$);
    const complete = vi.fn();
    runAnimation$(target, group([a, b]), driver).subscribe({ complete });
    expect(driver).toHaveBeenCalledTimes(2);
    second$.complete();
    expect(complete).not.toHaveBeenCalled();
    first$.complete();
    expect(complete).toHaveBeenCalledOnce();
  });

  it('preserves group nesting inside a sequence', () => {
    const first$ = new Subject<Animation>();
    const second$ = new Subject<Animation>();
    const third$ = new Subject<Animation>();
    const c = animationPlan(null, { timing: 300 });
    const driver = vi.fn<AnimationDriver>((_target, plan) =>
      plan === a ? first$ : plan === b ? second$ : third$);
    const complete = vi.fn();
    runAnimation$(target, sequence([group([a, b]), c]), driver).subscribe({ complete });
    expect(driver).toHaveBeenCalledTimes(2);
    first$.complete();
    expect(driver).toHaveBeenCalledTimes(2);
    second$.complete();
    expect(driver).toHaveBeenCalledTimes(3);
    third$.complete();
    expect(complete).toHaveBeenCalledOnce();
  });

  it('closing a sequence closes its active child without starting later work', () => {
    const dispose = vi.fn();
    const driver = vi.fn(() => new Observable<Animation>(() => dispose));
    const complete = vi.fn();
    const connection = runAnimation$(target, sequence([a, b]), driver).subscribe({ complete });
    connection.unsubscribe();
    expect(dispose).toHaveBeenCalledOnce();
    expect(driver).toHaveBeenCalledTimes(1);
    expect(complete).not.toHaveBeenCalled();
  });

  it('an error in a group closes an active sibling and stops an outer sequence', () => {
    const dispose = vi.fn();
    const failure = new Error('native cancellation');
    const error = vi.fn();
    const driver = vi.fn<AnimationDriver>((_target, plan) =>
      plan === a ? new Observable(() => dispose) : throwError(() => failure));
    runAnimation$(target, sequence([group([a, b]), a]), driver).subscribe({ error });
    expect(error).toHaveBeenCalledWith(failure);
    expect(dispose).toHaveBeenCalledOnce();
    expect(driver).toHaveBeenCalledTimes(2);
  });

  it('closing a group closes each active child once', () => {
    const dispose = vi.fn();
    const driver = () => new Observable<Animation>(() => dispose);
    const connection = runAnimation$(target, group([a, b]), driver).subscribe();
    connection.unsubscribe();
    connection.unsubscribe();
    expect(dispose).toHaveBeenCalledTimes(2);
  });

  it('empty compositions complete without invoking any driver', () => {
    const driver = vi.fn(() => of(result));
    const complete = vi.fn();
    runAnimation$(target, sequence([]), driver).subscribe({ complete });
    runAnimation$(target, group([]), driver).subscribe({ complete });
    expect(complete).toHaveBeenCalledTimes(2);
    expect(driver).not.toHaveBeenCalled();
  });

  it('reports setup errors through the observable error channel', () => {
    const failure = new Error('driver setup');
    const error = vi.fn();
    const source$ = runAnimation$(target, a, () => { throw failure; });
    source$.subscribe({ error });
    expect(error).toHaveBeenCalledWith(failure);
  });
});
