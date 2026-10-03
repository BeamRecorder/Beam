import type { Clip } from '@beam/engine/shared/composition-types';
import type { SceneGraph } from '@beam/engine/scene/scene-types';
import type { Canvas2DContext } from '../canvas-types';

// Sibling groups reuse one surface; only simultaneously nested isolations need separate buffers.
const surfaces = new WeakMap<Canvas2DContext, Map<number, OffscreenCanvas>>();

/** Group alpha is applied to the completed group image, including overlapping children. */
export function drawSceneStack<T extends Clip>(
  context: Canvas2DContext,
  clips: readonly T[],
  graph: SceneGraph | undefined,
  bounds: { x?: number; y?: number; width: number; height: number },
  draw: (context: Canvas2DContext, clips: readonly T[]) => void,
) {
  if (!graph) return draw(context, clips);
  const groups = new Map(graph.groups.map((group) => [group.id, group]));
  const visible = new Map(clips.map((clip) => [clip.id, clip]));
  const parents = new Map(graph.groups.flatMap((group) => group.children.map((child) => [child, group.id] as const)));
  const active = new Set(visible.keys());
  for (const clip of clips) {
    let parent = parents.get(clip.id);
    while (parent) {
      active.add(parent);
      parent = parents.get(parent);
    }
  }
  const members = new Set(graph.groups.flatMap((group) => group.children));
  const declaredRoots = new Set(graph.roots);
  const roots = [
    ...graph.roots,
    ...clips.filter((clip) => !members.has(clip.id) && !declaredRoots.has(clip.id)).map((clip) => clip.id),
  ];
  let buffers = surfaces.get(context);
  if (!buffers) {
    buffers = new Map();
    surfaces.set(context, buffers);
  }
  const visit = (target: Canvas2DContext, id: string, depth = 0) => {
    if (!active.has(id)) return;
    const group = groups.get(id);
    if (!group) {
      const clip = visible.get(id);
      if (clip) draw(target, [clip]);
      return;
    }
    if (group.opacity === 0) return;
    target.save();
    try {
      const { transform } = group;
      const cx = (bounds.x ?? 0) + bounds.width / 2,
        cy = (bounds.y ?? 0) + bounds.height / 2;
      target.translate(cx + transform.x * bounds.width, cy + transform.y * bounds.height);
      target.rotate((transform.rotation * Math.PI) / 180);
      target.scale(transform.scaleX, transform.scaleY);
      target.translate(-cx, -cy);
      let layer = target;
      const isolated = group.opacity !== 1 || group.blendMode !== 'source-over';
      let buffer: OffscreenCanvas | undefined;
      if (isolated) {
        buffer = buffers!.get(depth);
        if (!buffer) {
          buffer = new OffscreenCanvas(target.canvas.width, target.canvas.height);
          buffers!.set(depth, buffer);
        }
        if (buffer.width !== target.canvas.width) buffer.width = target.canvas.width;
        if (buffer.height !== target.canvas.height) buffer.height = target.canvas.height;
        const ctx = buffer.getContext('2d');
        if (!ctx) throw new Error('Scene group canvas is unavailable.');
        ctx.resetTransform();
        ctx.clearRect(0, 0, buffer.width, buffer.height);
        ctx.setTransform(target.getTransform());
        layer = ctx;
      }
      layer.save();
      try {
        if (group.mask) {
          const mask = group.mask;
          const x = (bounds.x ?? 0) + mask.x * bounds.width,
            y = (bounds.y ?? 0) + mask.y * bounds.height;
          const width = mask.width * bounds.width,
            height = mask.height * bounds.height;
          layer.beginPath();
          if (mask.shape === 'ellipse')
            layer.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
          else layer.rect(x, y, width, height);
          layer.clip();
        }
        for (const child of group.children) visit(layer, child, depth + (isolated ? 1 : 0));
      } finally {
        layer.restore();
      }
      if (buffer) {
        target.resetTransform();
        target.globalAlpha *= group.opacity;
        target.globalCompositeOperation = group.blendMode;
        target.drawImage(buffer, 0, 0);
      }
    } finally {
      target.restore();
    }
  };
  for (const root of roots) visit(context, root);
  if (!groups.size) {
    for (const surface of buffers.values()) surface.width = surface.height = 0;
    buffers.clear();
  }
}

export function disposeSceneStack(context: Canvas2DContext) {
  const buffers = surfaces.get(context);
  if (buffers) for (const surface of buffers.values()) surface.width = surface.height = 0;
  surfaces.delete(context);
}
