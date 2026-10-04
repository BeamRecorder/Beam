import type { ShapeClip } from './composition-types';
import type { ArrowPreset, ShapeVector } from './shape-vector-types';
import { shapeDefinition, isShapeKind } from './shape-catalog';
import { vectorFromSvg } from './shape-vector-svg';
import { drawingToVector } from './shape-vector-drawing';
import { arrowDefinition } from './arrow-catalog';

export function solidArrowPath(thickness: number, headSize: number): string {
  const shaft = 0.06 + (thickness / 80) * 0.22,
    head = 0.82 - (headSize / 70) * 0.32;
  return `M0 ${0.5 - shaft}H${head}V.08L1 .5L${head} .92V${0.5 + shaft}H0Z`;
}

export function arrowVector(preset: ArrowPreset): ShapeVector {
  const definition = arrowDefinition(preset);
  return {
    ...vectorFromSvg(preset === 'solid' ? solidArrowPath(12, 18) : definition.path),
    arrowPreset: preset,
    startMarker: definition.start ?? 'none',
    endMarker: definition.end ?? 'triangle',
  };
}

export function vectorForShape(clip: ShapeClip, canvas: { width: number; height: number }): ShapeVector {
  if (clip.family === 'text') throw new TypeError('Text does not have editable vector nodes.');
  if (clip.vector) return clip.vector;
  if (clip.drawing)
    return drawingToVector(clip.drawing, clip.transform.width * canvas.width, clip.transform.height * canvas.height);
  if (clip.family === 'arrow') return vectorFromSvg(solidArrowPath(clip.arrowThickness, clip.arrowHeadSize));
  const native: Record<string, string> = {
    rectangle: 'M0 0H1V1H0Z',
    'rounded-rectangle': `M${clip.cornerRadius / 100} 0H${1 - clip.cornerRadius / 100}Q1 0 1 ${clip.cornerRadius / 100}V${1 - clip.cornerRadius / 100}Q1 1 ${1 - clip.cornerRadius / 100} 1H${clip.cornerRadius / 100}Q0 1 0 ${1 - clip.cornerRadius / 100}V${clip.cornerRadius / 100}Q0 0 ${clip.cornerRadius / 100} 0Z`,
    ellipse: 'M.5 0A.5 .5 0 1 1 .5 1A.5 .5 0 1 1 .5 0Z',
    triangle: 'M.5 0L1 1H0Z',
    star:
      Array.from({ length: 10 }, (_, i) => {
        const angle = -Math.PI / 2 + (i * Math.PI) / 5,
          radius = i % 2 === 0 ? 0.5 : 0.22;
        return `${i ? 'L' : 'M'}${0.5 + Math.cos(angle) * radius} ${0.5 + Math.sin(angle) * radius}`;
      }).join('') + 'Z',
    diamond: 'M.5 0L1 .5L.5 1L0 .5Z',
  };
  if (native[clip.preset]) return vectorFromSvg(native[clip.preset]!);
  if (!isShapeKind(clip.preset)) throw new TypeError('Only geometric shapes have editable vector nodes.');
  const definition = shapeDefinition(clip.preset);
  return vectorFromSvg(definition.path, definition.width, definition.height, definition.fillRule);
}
