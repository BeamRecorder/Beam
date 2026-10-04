import { expect, it, vi } from 'vitest';
import { screenshotLayerDropTarget } from './screenshot-layer-drop-target';
const fixture = () => {
  const list = document.createElement('div');
  list.innerHTML =
    '<div data-layer-id="e"></div><div data-composition-group="pair"><div data-group-drop="pair"></div><div data-layer-id="b"></div><div data-layer-id="a"></div></div><div data-layer-id="root"></div>';
  const rect = (node: Element, left: number, top: number, height: number) =>
    vi
      .spyOn(node, 'getBoundingClientRect')
      .mockReturnValue({ left, right: 260, top, bottom: top + height, height } as DOMRect);
  rect(list, 0, 0, 300);
  rect(list.querySelector('[data-layer-id="e"]')!, 0, 0, 44);
  rect(list.querySelector('[data-composition-group]')!, 0, 48, 134);
  rect(list.querySelector('[data-group-drop]')!, 0, 48, 36);
  rect(list.querySelector('[data-layer-id="b"]')!, 24, 88, 44);
  rect(list.querySelector('[data-layer-id="a"]')!, 24, 136, 44);
  rect(list.querySelector('[data-layer-id="root"]')!, 0, 184, 44);
  const drop = (x: number, y: number, id = 'e', ids = ['e', 'b', 'a', 'root']) =>
    screenshotLayerDropTarget(list, ids, id, x, y);
  return { list, rect, drop };
};
it('inserts a standalone layer precisely between group members, or on a collapsed header', () => {
  const f = fixture();
  expect(f.drop(60, 130)).toMatchObject({
    groupId: 'pair',
    frontIndex: 1,
    anchorId: 'b',
    side: 'after',
    header: false,
  });
  expect(f.drop(60, 137)).toMatchObject({ groupId: 'pair', frontIndex: 1, anchorId: 'a', side: 'before' });
  f.rect(f.list.querySelector('[data-layer-id="a"]')!, 24, 136, 0);
  f.rect(f.list.querySelector('[data-layer-id="b"]')!, 24, 88, 0);
  expect(f.drop(60, 60)).toMatchObject({ groupId: 'pair', frontIndex: 0, header: true });
});
it('detaches into the unindented root strip before or after a group, without selecting a nested slot', () => {
  const f = fixture();
  expect(f.drop(10, 100, 'e')).toMatchObject({ groupId: null, anchorId: 'b', side: 'before', frontIndex: 0 });
  expect(f.drop(10, 170, 'b')).toMatchObject({ groupId: null, anchorId: 'a', side: 'after', frontIndex: 2 });
  expect(f.drop(60, 195, 'a')).toMatchObject({ groupId: null, anchorId: 'root', side: 'before', frontIndex: 2 });
  expect(f.drop(60, 260, 'a')).toMatchObject({ groupId: null, anchorId: 'root', side: 'after', frontIndex: 3 });
});
it('ignores invalid positions, absent members and empty or invisible drop rows', () => {
  const f = fixture();
  for (const [x, y] of [
    [-1, 60],
    [261, 60],
    [50, -1],
    [50, 301],
    [NaN, 60],
    [50, Infinity],
  ])
    expect(f.drop(x!, y!)).toBeNull();
  expect(f.drop(50, 60, 'missing')).toBeNull();
  expect(f.drop(50, 60, 'b', ['b', 'root'])).toBeNull();
  expect(f.drop(50, 100, 'e', ['e'])).toBeNull();
  f.list.replaceChildren();
  expect(f.drop(50, 100)).toBeNull();
});
it('keeps the very top and the gap between two groups in the root list', () => {
  const f = fixture();
  const first = f.list.querySelector<HTMLElement>('[data-composition-group]')!;
  first.dataset.compositionBlock = 'group:pair';
  const next = document.createElement('div');
  next.dataset.compositionGroup = 'next';
  next.dataset.compositionBlock = 'group:next';
  next.innerHTML = '<div data-group-drop="next"></div><div data-layer-id="n2"></div><div data-layer-id="n1"></div>';
  f.list.append(next);
  f.rect(first, 0, 48, 132);
  f.rect(next, 0, 188, 100);
  f.rect(next.querySelector('[data-group-drop]')!, 0, 188, 36);
  f.rect(next.querySelector('[data-layer-id="n2"]')!, 24, 228, 28);
  f.rect(next.querySelector('[data-layer-id="n1"]')!, 24, 260, 28);
  const ids = ['e', 'b', 'n2', 'a', 'n1', 'root'];
  expect(f.drop(60, 49, 'e', ids)).toMatchObject({ groupId: null, frontIndex: 0, blockKey: 'group:pair' });
  expect(f.drop(60, 184, 'e', ids)).toMatchObject({ groupId: null, frontIndex: 1, blockKey: 'group:next' });
  expect(f.drop(60, 192, 'e', ids)).toMatchObject({ groupId: null, frontIndex: 1, blockKey: 'group:next' });
  expect(f.drop(60, 208, 'e', ids)).toMatchObject({ groupId: 'next', header: true });
  expect(f.drop(60, 290, 'e', ids)).toMatchObject({
    groupId: null,
    side: 'after',
    frontIndex: 5,
    blockKey: 'group:next',
  });
});
it('does not turn a drag beside collapsed or self-only blocks into an invalid group insertion', () => {
  const f = fixture();
  const group = f.list.querySelector<HTMLElement>('[data-composition-group]')!;
  group.dataset.compositionBlock = 'group:pair';
  f.rect(group, 0, 48, 0);
  f.rect(f.list.querySelector('[data-group-drop]')!, 0, 48, 0);
  expect(f.drop(60, 50)).toMatchObject({ groupId: 'pair', header: false });
  f.rect(group, 0, 48, 134);
  expect(f.drop(60, 49, 'b', ['b'])).toBeNull();
});
