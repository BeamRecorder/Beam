import type { ScreenshotState } from '@beam/engine/screenshot/screenshot-types';
import type { Clip } from '@beam/engine/shared/composition-types';
import type { EditorStateSnapshot, HistoryAction } from './editor-history-types';
import type { HistoryChange, HistoryItem, HistoryOperation, HistoryTarget } from './history-description-types';

const same = (before: unknown, after: unknown) => JSON.stringify(before) === JSON.stringify(after);

const clipItem = (clip: Clip): HistoryItem => {
  let target: HistoryTarget = clip.kind;
  let name: string | undefined;
  if (clip.kind === 'shape') {
    target = clip.family;
    name = clip.text?.content;
  } else if (clip.kind === 'blur') {
    target = clip.mode === 'highlight' ? 'highlight' : 'blur';
  } else if (clip.kind === 'caption') {
    target = clip.caption.type === 'keyboard' ? 'keyboardCaption' : 'caption';
    if (clip.caption.type === 'text')
      name = clip.caption.style.customText ?? clip.caption.sentences.map((sentence) => sentence.text).join(' ');
  } else if (clip.kind !== 'color') name = clip.name;
  return { id: clip.id, target, name, state: clip };
};

const settingsItem = (target: HistoryTarget, state: object): HistoryItem => ({
  id: `settings:${target}`,
  target,
  state,
});

const itemsFor = (snapshot: object): HistoryItem[] => {
  if ('image' in snapshot && 'canvas' in snapshot) {
    const state = snapshot as ScreenshotState;
    return [
      clipItem(state.image),
      ...state.shapes.map(clipItem),
      ...(state.effects ?? []).map(clipItem),
      ...(state.images ?? []).map(clipItem),
      ...(state.cursors ?? []).map((cursor): HistoryItem => ({
        id: cursor.id,
        target: 'cursor',
        state: cursor,
      })),
      settingsItem('canvas', state.canvas),
      settingsItem('background', {
        background: state.background,
        blur: state.blurPercent,
      }),
      settingsItem('layers', { composition: state.composition }),
      settingsItem('export', { format: state.format, quality: state.quality }),
    ];
  }
  if ('zoomElements' in snapshot && 'outputCanvas' in snapshot) {
    const state = snapshot as EditorStateSnapshot;
    return [
      ...state.composition.clips.map(clipItem),
      ...state.zoomElements.map((zoom, index): HistoryItem => ({
        id: zoom.id,
        target: 'zoom',
        name: String(index + 1),
        state: zoom,
      })),
      settingsItem('canvas', state.outputCanvas),
      settingsItem('background', {
        background: state.selectedBackground,
        blur: state.backgroundBlurPercent,
      }),
      settingsItem('zoom', {
        motionBlur: state.zoomMotionBlur,
        autoFollow: state.zoomAutoFollow,
      }),
    ];
  }
  return [settingsItem('changes', snapshot)];
};

const operationFor = (before: object, after: object): HistoryOperation => {
  const previous = before as Record<string, unknown>;
  const next = after as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(previous), ...Object.keys(next)])].filter(
    (key) => !same(previous[key], next[key]),
  );
  if (keys.every((key) => key === 'enabled')) return 'visibility';
  if (keys.every((key) => key === 'name')) return 'rename';
  if (keys.every((key) => key === 'order' || key === 'trackId')) return 'reorder';
  if (keys.every((key) => key === 'crop')) return 'crop';
  if (
    keys.every((key) =>
      [
        'timelineStartMs',
        'timelineDurationMs',
        'sourceInMs',
        'sourceDurationMs',
        'playbackRate',
        'startMs',
        'endMs',
      ].includes(key),
    )
  )
    return 'timing';
  if (keys.every((key) => key === 'position' || key === 'focus')) return 'move';
  if (keys.every((key) => key === 'size')) return 'resize';
  if (keys.length === 1 && keys[0] === 'transform') {
    const oldTransform = previous.transform as { width: number; height: number } | undefined;
    const newTransform = next.transform as { width: number; height: number } | undefined;
    if (!oldTransform || !newTransform) return 'edit';
    return oldTransform.width === newTransform.width && oldTransform.height === newTransform.height ? 'move' : 'resize';
  }
  if (keys.length === 1 && keys[0] === 'composition') {
    const oldLayers = previous.composition as Array<{ id: string }> | undefined;
    const newLayers = next.composition as Array<{ id: string }> | undefined;
    if (oldLayers && newLayers && same([...oldLayers].sort(byId), [...newLayers].sort(byId))) return 'reorder';
  }
  return 'edit';
};

const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);

/** Derive labels from saved snapshots too, without persisting translated UI text. */
export function describeHistoryAction(action: HistoryAction): HistoryChange | null {
  if (!action.snapshots) return null;
  const before = itemsFor(action.snapshots.before);
  const after = itemsFor(action.snapshots.after);
  const previous = new Map(before.map((item) => [item.id, item]));
  const next = new Map(after.map((item) => [item.id, item]));
  const changes: HistoryChange[] = [];
  for (const item of after) {
    const old = previous.get(item.id);
    if (!old) changes.push({ operation: 'add', target: item.target, name: item.name });
    else if (!same(old.state, item.state))
      changes.push({
        operation: operationFor(old.state, item.state),
        target: item.target,
        name: item.name,
      });
  }
  for (const item of before) {
    if (!next.has(item.id))
      changes.push({
        operation: 'remove',
        target: item.target,
        name: item.name,
      });
  }
  // Layer membership follows additions/deletions; keep genuine layer edits.
  const oldLayers = (previous.get('settings:layers')?.state as { composition?: Array<{ id: string }> } | undefined)
    ?.composition;
  const newLayers = (next.get('settings:layers')?.state as { composition?: Array<{ id: string }> } | undefined)
    ?.composition;
  const membershipOnly =
    oldLayers &&
    newLayers &&
    same(
      oldLayers.filter((layer) => newLayers.some((other) => other.id === layer.id)),
      newLayers.filter((layer) => oldLayers.some((other) => other.id === layer.id)),
    );
  const relevant = changes.filter((change) => change.target !== 'layers' || !membershipOnly || changes.length === 1);
  if (relevant.length === 1) return relevant[0]!;
  if (relevant.length > 1) {
    const operation = relevant.every((change) => change.operation === relevant[0]!.operation)
      ? relevant[0]!.operation
      : 'edit';
    return { operation, target: 'changes', count: relevant.length };
  }
  return { operation: 'edit', target: 'changes' };
}
