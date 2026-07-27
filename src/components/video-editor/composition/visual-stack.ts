import type {
  MediaCompositionLayer,
  ProjectComposition,
  VisualTrackId,
} from "./composition-types";
import { BASE_VIDEO_TRACK_ID, WEBCAM_TRACK_ID } from "./composition-types";
import { cameraLayers } from "./webcam/camera-composition";

export type VisualMediaLayer = MediaCompositionLayer & {
  kind: "video" | "image";
};

export type VisualTrack =
  | { id: typeof BASE_VIDEO_TRACK_ID; kind: "base-video" }
  | { id: typeof WEBCAM_TRACK_ID; kind: "webcam" }
  | {
      id: string;
      kind: "media";
      layer: VisualMediaLayer;
    };

const mediaVisualLayers = (composition: ProjectComposition) => {
  const cameraIds = new Set(cameraLayers(composition).map((layer) => layer.id));
  return composition.layers
    .filter(
      (layer): layer is VisualMediaLayer =>
        (layer.kind === "video" || layer.kind === "image") && !cameraIds.has(layer.id),
    )
    .sort((left, right) => left.order - right.order);
};

/** Returns every visual track in timeline order: foreground first. */
export const visualTracks = (composition: ProjectComposition): VisualTrack[] => {
  const camera = cameraLayers(composition);
  const byId = new Map(mediaVisualLayers(composition).map((layer) => [layer.id, layer]));
  const valid = new Set<VisualTrackId>([
    BASE_VIDEO_TRACK_ID,
    ...byId.keys(),
    ...(camera.length ? [WEBCAM_TRACK_ID] : []),
  ]);
  const fallback = [
    ...mediaVisualLayers(composition).map((layer) => layer.id),
    ...(camera.length ? [WEBCAM_TRACK_ID] : []),
    BASE_VIDEO_TRACK_ID,
  ];
  const order = composition.visualTrackOrder ?? fallback;
  const normalized = [...new Set(order.filter((id) => valid.has(id)))];
  for (const id of fallback) if (!normalized.includes(id)) normalized.push(id);
  return normalized.map((id) =>
    id === BASE_VIDEO_TRACK_ID
      ? { id, kind: "base-video" }
      : id === WEBCAM_TRACK_ID
        ? { id, kind: "webcam" }
        : { id, kind: "media", layer: byId.get(id)! },
  );
};

export const normalizedVisualTrackOrder = (composition: ProjectComposition) =>
  visualTracks({ ...composition, visualTrackOrder: composition.visualTrackOrder }).map(
    (track) => track.id,
  );

/** Active visual tracks in drawing order: background first, foreground last. */
export const activeVisualTracksAt = (composition: ProjectComposition, timeMs: number) => {
  const activeCamera = cameraLayers(composition).filter(
    (layer) => layer.enabled && layer.startMs <= timeMs && timeMs <= layer.endMs,
  );
  return visualTracks(composition)
    .filter((track) =>
      track.kind === "base-video" ||
      track.kind === "webcam"
        ? activeCamera.length > 0 || track.kind === "base-video"
        : Boolean(track.layer?.enabled && track.layer.startMs <= timeMs && timeMs <= track.layer.endMs),
    )
    .reverse();
};
