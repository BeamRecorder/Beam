import type { ProjectEditorData } from "../../../api/types/capture-api";
import type {
  CompositionLayer,
  ProjectComposition,
  SessionSidecarKey,
} from "./composition-types";
import { cameraLayers } from "./webcam/camera-composition";

export type SidecarLinkKind = "clip" | "system-audio" | "microphone";

export interface SidecarLinkDescriptor {
  id: string;
  key?: SessionSidecarKey;
  kind: SidecarLinkKind;
  name: string;
  enabled: boolean;
}

const BASE_VIDEO_ID = "base-video";
const isBaseVideo = (id: string | null) =>
  id === BASE_VIDEO_ID || id?.startsWith(`${BASE_VIDEO_ID}:`) === true;

const hasSessionTrack = (
  editorData: ProjectEditorData | null | undefined,
  kind: SessionSidecarKey,
) => editorData?.tracks.some((track) =>
  track.kind === kind && track.status !== "failed" && track.assets.some((asset) => asset.exists || Boolean(asset.src)),
) ?? false;

const sessionLinks = (
  composition: ProjectComposition,
  editorData: ProjectEditorData | null | undefined,
): SidecarLinkDescriptor[] => {
  const detached = new Set(composition.detachedSessionSidecars ?? []);
  const links: SidecarLinkDescriptor[] = [];
  if (!detached.has("camera")) {
    for (const layer of cameraLayers(composition)) {
      links.push({ id: layer.id, key: "camera", kind: "clip", name: layer.name, enabled: layer.enabled });
    }
  }
  if (!detached.has("system-audio") && hasSessionTrack(editorData, "system-audio")) {
    links.push({ id: "system-audio", key: "system-audio", kind: "system-audio", name: "System audio", enabled: true });
  }
  if (!detached.has("microphone") && hasSessionTrack(editorData, "microphone")) {
    links.push({ id: "microphone", key: "microphone", kind: "microphone", name: "Microphone", enabled: true });
  }
  return links;
};

export function resolveSidecarLinks(
  composition: ProjectComposition,
  editorData: ProjectEditorData | null | undefined,
  selectedId: string | null,
): SidecarLinkDescriptor[] {
  if (isBaseVideo(selectedId)) return sessionLinks(composition, editorData);
  const selected = composition.layers.find((layer) => layer.id === selectedId);
  if (!selected?.groupId) return [];
  return composition.layers
    .filter((layer): layer is Exclude<CompositionLayer, { kind: "caption" }> =>
      layer.id !== selected.id && layer.groupId === selected.groupId,
    )
    .map((layer) => ({ id: layer.id, kind: "clip", name: layer.name, enabled: layer.enabled }));
}

export function detachSidecarLink(
  composition: ProjectComposition,
  ownerId: string | null,
  sidecar: SidecarLinkDescriptor,
): ProjectComposition {
  if (isBaseVideo(ownerId) && sidecar.key) {
    const detached = new Set(composition.detachedSessionSidecars ?? []);
    detached.add(sidecar.key);
    return { ...composition, detachedSessionSidecars: [...detached] };
  }
  const owner = composition.layers.find((layer) => layer.id === ownerId);
  if (!owner?.groupId) return composition;
  const groupId = owner.groupId;
  return {
    ...composition,
    layers: composition.layers.map((layer) =>
      layer.groupId === groupId ? (() => { const { groupId: _groupId, ...unlinked } = layer; return unlinked; })() : layer,
    ),
  };
}
