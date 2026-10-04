import type { ScreenshotState } from './screenshot-types';
import type { NormalizedTransform } from '../shared/composition-types';
import { screenshotLayers } from './screenshot-layers';
import { defaultLayerCompositing } from '../shared/layer-compositing';
export function expandScreenshotGroups(state: ScreenshotState, ids: readonly string[]): string[] {
  const selected = new Set(ids),
    groups = new Set(state.composition?.filter((r) => selected.has(r.id) && r.groupId).map((r) => r.groupId));
  for (const layer of state.composition ?? []) if (layer.groupId && groups.has(layer.groupId)) selected.add(layer.id);
  return [...selected];
}
export function groupScreenshotLayers(
  state: ScreenshotState,
  ids: readonly string[],
  groupId: string,
): ScreenshotState {
  if (!groupId.trim() || groupId.length > 200) throw new TypeError('Invalid screenshot group id.');
  const members = new Set(expandScreenshotGroups(state, ids));
  const layers = screenshotLayers(state).filter((r) => members.has(r.id));
  if (
    members.size < 2 ||
    layers.length !== members.size ||
    layers.some((r) => r.locked || ['background', 'watermark', 'zoom'].includes(r.kind))
  )
    throw new Error('Select at least two unlocked elements.');
  if (state.composition?.some((r) => r.groupId === groupId && !members.has(r.id)))
    throw new Error('Group identifier already exists.');
  const composition = state.composition ?? screenshotLayers(state).map(({ id }) => defaultLayerCompositing(id));
  return { ...state, composition: composition.map((r) => (members.has(r.id) ? { ...r, groupId } : r)) };
}
export function ungroupScreenshotLayers(state: ScreenshotState, ids: readonly string[]): ScreenshotState {
  const members = new Set(expandScreenshotGroups(state, ids));
  if (state.composition?.some((r) => members.has(r.id) && r.groupId && r.locked)) throw new Error('Group is locked.');
  return {
    ...state,
    ...(state.composition
      ? {
          composition: state.composition.map((r) => {
            if (!members.has(r.id) || !r.groupId) return r;
            const { groupId: _group, ...layer } = r;
            return layer;
          }),
        }
      : {}),
  };
}
/** Scale positions, dimensions and native typography around the shared selection bounds. */
export function transformScreenshotGroup(
  state: ScreenshotState,
  ids: readonly string[],
  from: NormalizedTransform,
  to: NormalizedTransform,
): ScreenshotState {
  if (
    ![from.x, from.y, from.width, from.height, to.x, to.y, to.width, to.height].every(Number.isFinite) ||
    from.width <= 0 ||
    from.height <= 0 ||
    to.width <= 0 ||
    to.height <= 0
  )
    throw new TypeError('Invalid group bounds.');
  const members = new Set(ids),
    layers = screenshotLayers(state).filter((r) => members.has(r.id));
  if (
    !members.size ||
    layers.length !== members.size ||
    layers.some((r) => r.locked || ['background', 'watermark', 'zoom'].includes(r.kind))
  )
    throw new Error('Invalid group selection.');
  const sx = to.width / from.width,
    sy = to.height / from.height,
    scale = Math.min(sx, sy);
  const point = (p: { x: number; y: number }) => ({ x: to.x + (p.x - from.x) * sx, y: to.y + (p.y - from.y) * sy });
  const transform = (t: NormalizedTransform) => ({ ...point(t), width: t.width * sx, height: t.height * sy });
  return {
    ...state,
    image: members.has(state.image.id) ? { ...state.image, transform: transform(state.image.transform) } : state.image,
    ...(state.images
      ? { images: state.images.map((r) => (members.has(r.id) ? { ...r, transform: transform(r.transform) } : r)) }
      : {}),
    ...(state.effects
      ? { effects: state.effects.map((r) => (members.has(r.id) ? { ...r, transform: transform(r.transform) } : r)) }
      : {}),
    shapes: state.shapes.map((r) =>
      members.has(r.id)
        ? {
            ...r,
            transform: transform(r.transform),
            ...(r.text
              ? {
                  text: {
                    ...r.text,
                    padding: Math.max(0, Math.min(40, r.text.padding * scale)),
                    style: {
                      ...r.text.style,
                      fontSize: Math.max(1, Math.min(256, r.text.style.fontSize * scale)),
                      letterSpacing: r.text.style.letterSpacing * scale,
                      outlineWidth: r.text.style.outlineWidth * scale,
                      shadowBlur: r.text.style.shadowBlur * scale,
                      extrusionDepth: r.text.style.extrusionDepth * scale,
                    },
                  },
                }
              : {}),
          }
        : r,
    ),
    ...(state.cursors
      ? {
          cursors: state.cursors.map((r) =>
            members.has(r.id)
              ? { ...r, position: point(r.position), size: Math.max(16, Math.min(384, r.size * scale)) }
              : r,
          ),
        }
      : {}),
    ...(state.composition
      ? {
          composition: state.composition.map((r) =>
            members.has(r.id) && r.rotation3d
              ? {
                  ...r,
                  rotation3d: {
                    ...r.rotation3d,
                    perspective: Math.max(200, Math.min(10000, r.rotation3d.perspective * scale)),
                  },
                }
              : r,
          ),
        }
      : {}),
  };
}
