import { expect, it } from 'vitest';
import { editorInsertMenu } from './editor-insert-menu';
import { editorInsertItems } from './editor-insert-items';
const t = (key: string) => key;
it('groups Video, Elements and Audio and retains every insertion exactly once', () => {
  const flat = editorInsertItems('video', t);
  const grouped = editorInsertMenu(flat, t);
  expect(grouped.map((item) => item.id)).toEqual(['video', 'insert-elements', 'insert-audio']);
  const leaves = grouped.flatMap((item) => item.children ?? [item]);
  expect(leaves.map((item) => item.id).sort()).toEqual(flat.map((item) => item.id).sort());
});
it('does not expose video or audio in screenshots and retains Cursor', () => {
  const grouped = editorInsertMenu(editorInsertItems('screenshot', t), t);
  expect(grouped.map((item) => item.id)).toEqual(['insert-elements', 'cursor']);
  expect(grouped[0]!.children?.map((item) => item.id)).toContain('image');
});
it('groups live canvas action ids and disables a group only when all children are disabled', () => {
  const grouped = editorInsertMenu(
    [
      { id: 'insert:shape', label: 'Shape', disabled: true },
      { id: 'insert:text', label: 'Text' },
      { id: 'insert:voiceover', label: 'Voice', disabled: true },
    ],
    t,
  );
  expect(grouped[0]!.disabled).toBe(false);
  expect(grouped[1]!.disabled).toBe(true);
  expect(grouped[0]!.children?.map((item) => item.id)).toEqual(['insert:shape', 'insert:text']);
  expect(editorInsertMenu([], t)).toEqual([]);
});
