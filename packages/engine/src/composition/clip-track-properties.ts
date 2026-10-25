import {
  isCompositingClip,
  isVisualClip,
  type BlurClip,
  type Clip,
  type ClipComposition,
  type ColorClip,
  type ShapeClip,
  type VisualClip,
} from '../shared/composition-types';
import { validateComposition } from '../commands/clip-composition-validation';
import { selectionHasLocks } from './timeline-locks';
import { isSplitCameraLayout } from '../shared/camera-layout-types';
import { cameraScreenPartner } from './camera-screen-link';
import { linkedScreenTransform } from './camera-layout';

const mediaProperties = [
  'transform',
  'crop',
  'appearance',
  'isMirrored',
  'isMirroredY',
  'rotation',
  'cameraLayoutPreset',
  'cameraFramingPreset',
] as const satisfies readonly (keyof VisualClip)[];
const cameraProperties = [
  'cameraSplitRatio',
  'cameraSplitPadding',
  'reactToZoom',
] as const satisfies readonly (keyof VisualClip)[];
const blurProperties = [
  'transform',
  'shape',
  'mode',
  'strength',
  'feather',
  'cornerRadius',
  'tintOpacity',
  'color',
  'highlightColor',
] as const satisfies readonly (keyof BlurClip)[];
const colorProperties = [
  'transform',
  'fill',
  'opacityEnabled',
  'opacity',
  'cornerRadius',
  'shadowSize',
  'shadowBlur',
  'shadowMode',
  'shadowColor',
  'shadowDirection',
  'backdropBlurEnabled',
  'backdropBlur',
] as const satisfies readonly (keyof ColorClip)[];
const shapeProperties = [
  'transform',
  'fill',
  'fillEnabled',
  'fillColor',
  'borderColor',
  'borderWidth',
  'cornerRadius',
  'arrowThickness',
  'arrowHeadSize',
  'rotation',
  'opacityEnabled',
  'opacity',
  'backdropBlur',
  'shadowEnabled',
  'shadowColor',
  'shadowBlur',
  'shadowDirection',
] as const satisfies readonly (keyof ShapeClip)[];

/** Property scope follows the actual lane, independently of recording and asset identities. */
export function clipTrackPropertyTargets(composition: ClipComposition, sourceId: string): Clip[] {
  const source = composition.clips.find((clip) => clip.id === sourceId);
  if (!source || !isCompositingClip(source) || !source.trackId) return [];
  return composition.clips.filter((clip) => {
    if (clip.trackId !== source.trackId) return false;
    if (!isVisualClip(source)) return clip.kind === source.kind;
    if (!isVisualClip(clip) || (source.kind === 'webcam') !== (clip.kind === 'webcam')) return false;
    if (source.kind !== 'webcam' || clip.id === sourceId) return true;
    const sourceSplit = isSplitCameraLayout(source.cameraLayoutPreset ?? 'custom');
    if (!sourceSplit && !isSplitCameraLayout(clip.cameraLayoutPreset ?? 'custom')) return true;
    const partner = cameraScreenPartner(composition, clip, true);
    return partner ? !selectionHasLocks(composition, [], { clipIds: [partner.id], zoomIds: [] }) : !sourceSplit;
  });
}

function copyProperties<T extends Clip>(source: T, target: T, keys: readonly (keyof T)[]): T {
  const next = { ...target };
  for (const key of keys) {
    // Share immutable document values; never transfer timing, source media, identity or locks.
    if (source[key] === undefined) delete next[key];
    else next[key] = source[key];
  }
  return next;
}

function copyVisualProperties(source: Clip, target: Clip): Clip {
  if (isVisualClip(source) && isVisualClip(target)) {
    let next = copyProperties(source, target, mediaProperties);
    if (source.kind === 'webcam' && target.kind === 'webcam') next = copyProperties(source, next, cameraProperties);
    return next;
  }
  if (source.kind === 'blur' && target.kind === 'blur') return copyProperties(source, target, blurProperties);
  if (source.kind === 'color' && target.kind === 'color') return copyProperties(source, target, colorProperties);
  if (source.kind === 'shape' && target.kind === 'shape') {
    const next = copyProperties(source, target, shapeProperties);
    if (source.text && target.text) {
      next.text = {
        ...target.text,
        style: source.text.style,
        padding: source.text.padding,
        verticalAlign: source.text.verticalAlign,
      };
    }
    return next;
  }
  throw new TypeError('Incompatible visual clip properties.');
}

/** Copy one clip's visual settings atomically, preserving locked clips and their linked items. */
export function applyClipTrackProperties(composition: ClipComposition, sourceId: string): ClipComposition {
  const source = composition.clips.find((clip) => clip.id === sourceId);
  if (!source || selectionHasLocks(composition, [], { clipIds: [sourceId], zoomIds: [] })) return composition;
  const targets = new Set(clipTrackPropertyTargets(composition, sourceId).map((clip) => clip.id));
  const replacements = new Map<string, Clip>();
  for (const clip of composition.clips) {
    if (
      clip.id === sourceId ||
      !targets.has(clip.id) ||
      selectionHasLocks(composition, [], { clipIds: [clip.id], zoomIds: [] })
    )
      continue;
    replacements.set(clip.id, copyVisualProperties(source, clip));
    if (
      source.kind === 'webcam' &&
      clip.kind === 'webcam' &&
      (isSplitCameraLayout(source.cameraLayoutPreset ?? 'custom') ||
        isSplitCameraLayout(clip.cameraLayoutPreset ?? 'custom'))
    ) {
      const partner = cameraScreenPartner(composition, clip, true);
      if (partner)
        replacements.set(partner.id, {
          ...partner,
          transform: linkedScreenTransform(
            source.cameraLayoutPreset ?? 'custom',
            source.cameraSplitRatio ?? 0.5,
            source.cameraSplitPadding ?? 0,
          ),
        });
    }
  }
  let changed = false;
  const clips = composition.clips.map((clip) => {
    const next = replacements.get(clip.id);
    if (!next || JSON.stringify(next) === JSON.stringify(clip)) return clip;
    changed = true;
    return next;
  });
  if (!changed) return composition;
  const next = { ...composition, clips };
  validateComposition(next);
  return next;
}
