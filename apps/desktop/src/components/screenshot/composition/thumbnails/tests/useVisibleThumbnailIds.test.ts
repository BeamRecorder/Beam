import { effectScope, nextTick, shallowRef } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useVisibleThumbnailIds } from '../useVisibleThumbnailIds';

class Observer {
  static instances: Observer[] = [];
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  readonly callback: IntersectionObserverCallback;
  readonly options: IntersectionObserverInit;
  constructor(callback: IntersectionObserverCallback, options: IntersectionObserverInit) {
    this.callback = callback;
    this.options = options;
    Observer.instances.push(this);
  }
  visible(row: Element, isIntersecting = true) {
    this.callback(
      [{ target: row, isIntersecting } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}
class Mutation {
  static instances: Mutation[] = [];
  observe = vi.fn();
  disconnect = vi.fn();
  readonly callback: () => void;
  constructor(callback: () => void) {
    this.callback = callback;
    Mutation.instances.push(this);
  }
}
const scope = () => {
  const value = effectScope();
  scopes.push(value);
  return value;
};
const scopes: ReturnType<typeof effectScope>[] = [];
const root = (count = 500) => {
  const element = document.createElement('div');
  for (let i = 0; i < count; i++) {
    const row = document.createElement('div');
    row.dataset.layerId = String(i);
    element.append(row);
  }
  return element;
};
afterEach(() => {
  scopes.splice(0).forEach((s) => s.stop());
  Observer.instances = [];
  Mutation.instances = [];
  vi.unstubAllGlobals();
});
const install = () => {
  vi.stubGlobal('IntersectionObserver', Observer);
  vi.stubGlobal('MutationObserver', Mutation);
};
describe('composition thumbnail visibility', () => {
  it('requests only intersecting rows and reserves 192px overscan in a 500-layer panel', () => {
    install();
    const list = shallowRef<HTMLElement | null>(root());
    const ids = Array.from({ length: 500 }, (_, i) => String(i));
    const visible = scope().run(() => useVisibleThumbnailIds(list, () => ids))!;
    const observer = Observer.instances[0]!;
    expect(observer.options).toEqual({ root: list.value, rootMargin: '192px 0px', threshold: 0 });
    expect(observer.observe).toHaveBeenCalledTimes(500);
    expect(visible.value.size).toBe(0);
    observer.visible(list.value!.children[0]!);
    observer.visible(list.value!.children[1]!);
    expect([...visible.value]).toEqual(['0', '1']);
    const previous = visible.value;
    observer.visible(list.value!.children[1]!);
    expect(visible.value).toBe(previous);
    observer.visible(list.value!.children[0]!, false);
    expect([...visible.value]).toEqual(['1']);
  });
  it('ignores late entries after replacing the viewport or disposing observers', async () => {
    install();
    const list = shallowRef<HTMLElement | null>(root(2));
    const owned = scope();
    const visible = owned.run(() => useVisibleThumbnailIds(list, () => ['0', '1']))!;
    const old = Observer.instances[0]!,
      oldRow = list.value!.children[0]!;
    old.visible(oldRow);
    list.value = root(1);
    await nextTick();
    old.visible(oldRow);
    expect(visible.value.size).toBe(0);
    expect(old.disconnect).toHaveBeenCalledOnce();
    Observer.instances[1]!.visible(list.value.children[0]!);
    expect(visible.value.size).toBe(1);
    owned.stop();
    Observer.instances[1]!.visible(list.value.children[0]!);
    expect(visible.value.size).toBe(0);
  });
  it('observes inserted rows, releases deleted rows and reconciles document deletions', async () => {
    install();
    const list = shallowRef<HTMLElement | null>(null),
      ids = shallowRef(['0', '1']);
    const visible = scope().run(() => useVisibleThumbnailIds(list, () => ids.value))!;
    expect(Observer.instances).toHaveLength(0);
    list.value = root(2);
    await nextTick();
    const observer = Observer.instances[0]!;
    const removed = list.value.children[0]!;
    observer.visible(removed);
    removed.remove();
    ids.value = ['1'];
    await nextTick();
    expect(visible.value.size).toBe(0);
    expect(observer.unobserve).toHaveBeenCalledWith(removed);
    const extra = document.createElement('div');
    extra.dataset.layerId = '2';
    list.value.append(extra);
    ids.value = ['1', '2'];
    await nextTick();
    Mutation.instances[0]!.callback();
    expect(observer.observe).toHaveBeenCalledTimes(3);
    observer.visible(extra);
    expect([...visible.value]).toEqual(['2']);
    observer.visible(document.createElement('div'));
    expect([...visible.value]).toEqual(['2']);
    list.value = null;
    await nextTick();
    expect(visible.value.size).toBe(0);
  });
});
