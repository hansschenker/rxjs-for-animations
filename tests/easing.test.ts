import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  linear,
  easeInQuad,
  easeOutQuad,
  easeInOutQuad,
  easeInCubic,
  easeOutCubic,
  easeInOutCubic,
  easeInSine,
  easeOutSine,
  easeInOutSine,
} from '../src/easing.js';

const curves = [
  linear, easeInQuad, easeOutQuad, easeInOutQuad,
  easeInCubic, easeOutCubic, easeInOutCubic,
  easeInSine, easeOutSine, easeInOutSine,
];
const unitInterval = fc.double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true });

describe('elementary easing laws', () => {
  it('has exact endpoints for every supplied curve', () => {
    for (const curve of curves) {
      expect(curve(0)).toBe(0);
      expect(curve(1)).toBe(1);
    }
  });

  it('preserves order and stays bounded over the unit interval', () => {
    fc.assert(fc.property(unitInterval, unitInterval, (first, second) => {
      const lower = Math.min(first, second);
      const upper = Math.max(first, second);
      for (const curve of curves) {
        expect(curve(lower)).toBeGreaterThanOrEqual(-1e-12);
        expect(curve(upper)).toBeLessThanOrEqual(1 + 1e-12);
        expect(curve(lower)).toBeLessThanOrEqual(curve(upper) + 1e-12);
      }
    }), { numRuns: 200 });
  });

  it('has symmetric in-out curves and the expected quadratic midpoint shape', () => {
    fc.assert(fc.property(unitInterval, (progress) => {
      for (const curve of [easeInOutQuad, easeInOutCubic, easeInOutSine]) {
        expect(curve(progress) + curve(1 - progress)).toBeCloseTo(1, 12);
      }
    }), { numRuns: 100 });
    expect(easeInOutQuad(0.25)).toBe(0.125);
    expect(easeInOutQuad(0.75)).toBe(0.875);
    expect(easeInOutCubic(0.25)).toBe(0.0625);
  });
});
