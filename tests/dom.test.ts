import { describe, expect, it, vi } from 'vitest';
import { createDotRenderer } from '../src/adapters/dom.js';
import type { ParticleView } from '../src/trail.js';

type FakeElement = {
  className: string;
  style: { transform: string; opacity: string };
  setAttribute: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
};

const createLayer = () => {
  const children = new Set<FakeElement | object>();
  const createElement = vi.fn(() => {
    const element: FakeElement = {
      className: '',
      style: { transform: '', opacity: '' },
      setAttribute: vi.fn(),
      remove: vi.fn(() => { children.delete(element); }),
    };
    return element;
  });
  const layer = {
    ownerDocument: { createElement },
    append: (element: FakeElement) => { children.add(element); },
  } as unknown as HTMLElement;
  return { layer, children, createElement };
};

const view = (overrides: Partial<ParticleView> = {}): ParticleView => ({
  id: 1, x: 10, y: 20, opacity: 0.75, ageMs: 250, ...overrides,
});

describe('createDotRenderer', () => {
  it('uses the layer document and retains keyed elements across frames', () => {
    const { layer, children, createElement } = createLayer();
    const sink = createDotRenderer(layer, { className: 'particle' });
    sink.render([view()]);
    const element = createElement.mock.results[0]?.value as FakeElement;
    expect(element.className).toBe('particle');
    expect(element.setAttribute).toHaveBeenCalledWith('aria-hidden', 'true');
    sink.render([view({ x: 50, opacity: 0.5 })]);
    expect(createElement).toHaveBeenCalledTimes(1);
    expect(children.has(element)).toBe(true);
    expect(element.style.transform).toBe('translate3d(50px, 20px, 0) translate(-50%, -50%)');
    expect(element.style.opacity).toBe('0.5');
  });

  it('removes absent identities without removing unrelated layer content', () => {
    const { layer, children, createElement } = createLayer();
    const unrelated = {};
    children.add(unrelated);
    const sink = createDotRenderer(layer);
    sink.render([view({ id: 'a' }), view({ id: 'b' })]);
    const first = createElement.mock.results[0]?.value as FakeElement;
    const second = createElement.mock.results[1]?.value as FakeElement;
    sink.render([view({ id: 'b' })]);
    expect(first.remove).toHaveBeenCalledOnce();
    expect(second.remove).not.toHaveBeenCalled();
    expect(children.has(unrelated)).toBe(true);
    sink.dispose();
    expect(children).toEqual(new Set([unrelated]));
  });

  it('treats disposal as terminal and idempotent', () => {
    const { layer, children, createElement } = createLayer();
    const sink = createDotRenderer(layer);
    sink.render([view()]);
    const element = createElement.mock.results[0]?.value as FakeElement;
    sink.dispose();
    sink.dispose();
    sink.render([view({ id: 2 })]);
    expect(element.remove).toHaveBeenCalledOnce();
    expect(createElement).toHaveBeenCalledTimes(1);
    expect(children.size).toBe(0);
  });
});
