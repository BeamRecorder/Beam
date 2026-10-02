import { enableAutoUnmount, mount } from '@vue/test-utils';
import { defineComponent, inject } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { timelineCanvasRegistryKey, useTimelineCanvasRegistry } from '../timeline-canvas-registry';
import type { TimelineCanvasRegistry } from '../timeline-canvas-types';

enableAutoUnmount(afterEach);
afterEach(() => vi.unstubAllGlobals());
function setup() {
  let registry!: TimelineCanvasRegistry, borrowed: TimelineCanvasRegistry | undefined;
  const Child = defineComponent({ setup() { borrowed = inject(timelineCanvasRegistryKey); return {}; }, template: '<span />' });
  const Component = defineComponent({ components: { Child }, setup() { registry = useTimelineCanvasRegistry(); return {}; }, template: '<div><Child /></div>' });
  const wrapper = mount(Component);
  return { wrapper, registry, borrowed };
}

describe('canvas timeline artwork registry ownership', () => {
  it('provides the same owner to semantic children and publishes a new map identity for each arrival', () => {
    const { registry, borrowed } = setup();
    expect(borrowed).toBe(registry);
    const initial = registry.artworks.value, first = { kind: 'image' as const, loading: true };
    registry.set('clip', first);
    const pending = registry.artworks.value;
    expect(pending).not.toBe(initial); expect(initial.size).toBe(0); expect(pending.get('clip')).toBe(first);
    const ready = { kind: 'image' as const, loading: false };
    registry.set('clip', ready);
    expect(registry.artworks.value).not.toBe(pending);
    expect(pending.get('clip')).toBe(first); expect(registry.artworks.value.get('clip')).toBe(ready);
  });
  it('preserves other clips on deletion and does not create a redundant publication for a missing ID', () => {
    const { registry } = setup();
    registry.set('a', { kind: 'image' }); registry.set('b', { kind: 'shape' });
    const before = registry.artworks.value;
    registry.delete('missing'); expect(registry.artworks.value).toBe(before);
    registry.delete('a'); expect(registry.artworks.value).not.toBe(before);
    expect([...registry.artworks.value.keys()]).toEqual(['b']); expect(before.has('a')).toBe(true);
  });
  it('disposes pending image pixels and clears the last published artwork map with its owning lane', async () => {
    const images: { src: string; onload: unknown; onerror: unknown }[] = [];
    vi.stubGlobal('Image', class { src = ''; onload = null; onerror = null; constructor() { images.push(this); } });
    const { wrapper, registry } = setup();
    registry.set('a', { kind: 'image', loading: true });
    const lease = registry.images.acquire('blob:pending');
    const rejected = expect(lease.ready).rejects.toThrow('disposed');
    wrapper.unmount(); await rejected;
    expect(registry.images.stats()).toEqual({ entries: 0, bytes: 0, active: 0 });
    expect(registry.artworks.value.size).toBe(0);
    expect(images[0]).toMatchObject({ src: '', onload: null, onerror: null });
    lease.release(); expect(() => registry.images.acquire('late')).toThrow('disposed');
  });
});
