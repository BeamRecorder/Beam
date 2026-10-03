import type { EditorSkeletonShape } from './editor-skeleton-types';

const targets =
  'button,input,textarea,[role="switch"],h3,h4,.title,.description,.option-label,.media-tile,.zoom-label,.time-display-container';
export function editorSkeletonShapes(source: HTMLElement): EditorSkeletonShape[] {
  const area = source.getBoundingClientRect();
  if (!area.width || !source.offsetWidth) return [];
  const scale = area.width / source.offsetWidth;
  const nodes = [...source.querySelectorAll<HTMLElement>(targets)];
  return nodes.flatMap((node, id) => {
    const rect = node.getBoundingClientRect();
    if (!rect.width || !rect.height || nodes.some((parent) => parent !== node && parent.contains(node))) return [];
    return [
      {
        id,
        left: (rect.left - area.left) / scale,
        top: (rect.top - area.top) / scale,
        width: rect.width / scale,
        height: rect.height / scale,
        radius: getComputedStyle(node).borderRadius,
      },
    ];
  });
}
