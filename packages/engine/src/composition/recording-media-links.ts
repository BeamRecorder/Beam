import {
  clipEndMs,
  type AudioClip,
  type Clip,
  type ClipComposition,
  type VisualClip,
} from '@beam/engine/shared/composition-types';
import type { RecordingClipLink, RecordingMediaLinkIndex, RecordingScreenScope } from './recording-media-link-types';
import { recordingLinkComponents } from './recording-link-components';

const recordedSidecar = (clip: Clip): clip is VisualClip | AudioClip =>
  clip.recordingClipId !== null &&
  (clip.kind === 'webcam' || (clip.kind === 'audio' && ['microphone', 'system'].includes(clip.role)));

const screenScope = (): RecordingScreenScope => ({ screens: [], groups: new Map() });
const addScreen = (scope: RecordingScreenScope, screen: VisualClip) => {
  scope.screens.push(screen);
  if (screen.groupId && !scope.groups.has(screen.groupId)) scope.groups.set(screen.groupId, screen);
};

/** One immutable document's ownership lookups, shared by all visible timeline items. */
export function createRecordingMediaLinkIndex(composition: ClipComposition): RecordingMediaLinkIndex {
  const clips = composition.clips;
  const assets = new Map(composition.assets.map((asset) => [asset.id, asset]));
  const screens = new Map<string, VisualClip>();
  const sessions = new Map<string, RecordingScreenScope>();
  const all = screenScope();
  for (const clip of clips) {
    if (clip.kind !== 'screen') continue;
    screens.set(clip.id, clip);
    addScreen(all, clip);
    const session = assets.get(clip.assetId)?.sessionId;
    if (!session) continue;
    let scope = sessions.get(session);
    if (!scope) sessions.set(session, (scope = screenScope()));
    addScreen(scope, clip);
  }
  const owner = (clip: Clip): VisualClip | null => {
    if (!recordedSidecar(clip)) return null;
    const asset = assets.get(clip.assetId);
    const session = asset?.sessionId;
    const projectWebcam = clip.kind === 'webcam' && asset?.origin === 'project' && Boolean(clip.recordingClipId);
    const scope = projectWebcam ? all : session ? sessions.get(session) : undefined;
    if (!scope) return null;
    if (clip.recordingClipId) {
      const candidate = screens.get(clip.recordingClipId);
      const explicit =
        candidate && (projectWebcam || assets.get(candidate.assetId)?.sessionId === session) ? candidate : null;
      if (explicit && (!clip.groupId || explicit.groupId === clip.groupId)) return explicit;
      // Older splits kept the left screen ID on right-hand sidecars.
      return (clip.groupId ? scope.groups.get(clip.groupId) : null) ?? explicit ?? null;
    }
    const midpoint = (clip.timelineStartMs + clipEndMs(clip)) / 2;
    return (
      scope.screens.find((screen) => midpoint >= screen.timelineStartMs && midpoint < clipEndMs(screen)) ??
      (scope.screens.length === 1 ? scope.screens[0]! : null)
    );
  };
  let links: RecordingClipLink[] | undefined;
  const recordingLinks = () => (links ??= clips.map((clip) => ({ clip, owner: owner(clip) })));
  let components: ReturnType<typeof recordingLinkComponents> | undefined;
  const linkedIds = (selectedIds: readonly string[]): string[] => {
    const links = recordingLinks();
    const ids = new Set(selectedIds);
    let changed = true;
    while (changed) {
      const size = ids.size;
      const groups = new Set(clips.filter((clip) => ids.has(clip.id) && clip.groupId).map((clip) => clip.groupId));
      for (const { clip, owner } of links) {
        if (clip.groupId && groups.has(clip.groupId)) ids.add(clip.id);
        if (owner && (ids.has(owner.id) || ids.has(clip.id))) {
          ids.add(owner.id);
          ids.add(clip.id);
        }
      }
      changed = ids.size !== size;
    }
    return [...ids];
  };
  const linkedClips = (clipId: string): readonly Clip[] => {
    components ??= recordingLinkComponents(clips, recordingLinks());
    return components.get(clipId) ?? [];
  };
  return { owner, linkedIds, linkedClips };
}

export function recordingMediaOwner(composition: ClipComposition, clip: Clip): VisualClip | null {
  if (!recordedSidecar(clip)) return null;
  return createRecordingMediaLinkIndex(composition).owner(clip);
}

export function recordingLinkedClipIds(composition: ClipComposition, selectedIds: readonly string[]): string[] {
  return createRecordingMediaLinkIndex(composition).linkedIds(selectedIds);
}
