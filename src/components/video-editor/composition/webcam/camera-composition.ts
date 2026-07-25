import type { ProjectEditorData } from "../../../../api/types/capture-api";
import type {
  MediaCompositionLayer,
  NormalizedTransform,
  ProjectComposition,
  WebcamAppearance,
} from "../composition-types";

const CAMERA_TRANSFORM = { x: 0.72, y: 0.72, width: 0.24, height: 0.24 };

const id = () => crypto.randomUUID();
const milliseconds = (nanoseconds: number | null | undefined) =>
  Math.max(0, Math.round((nanoseconds ?? 0) / 1_000_000));
const appearanceFor = (format: Record<string, unknown>): WebcamAppearance | undefined => {
  const appearance = format.appearance
  if (!appearance || typeof appearance !== 'object') return undefined
  const value = appearance as { shadowSize?: unknown; cornerRadius?: unknown }
  return ['none', 'sm', 'md', 'lg'].includes(String(value.shadowSize)) && ['none', 'sm', 'md', 'lg', 'full'].includes(String(value.cornerRadius)) ? { shadowSize: value.shadowSize as WebcamAppearance['shadowSize'], cornerRadius: value.cornerRadius as WebcamAppearance['cornerRadius'] } : undefined
}

const placementFor = (format: Record<string, unknown>): NormalizedTransform | undefined => {
  const placement = format.placement
  if (!placement || typeof placement !== 'object') return undefined
  const value = placement as Record<string, unknown>
  if (!['x', 'y', 'width', 'height'].every((key) => typeof value[key] === 'number' && Number.isFinite(value[key])) || Number(value.width) <= 0 || Number(value.height) <= 0) return undefined
  const width = Math.min(1, Math.max(.001, Number(value.width)))
  const height = Math.min(1, Math.max(.001, Number(value.height)))
  return {
    x: Math.min(1 - width, Math.max(0, Number(value.x))),
    y: Math.min(1 - height, Math.max(0, Number(value.y))),
    width,
    height,
  }
}

export function addCameraSegments(
  composition: ProjectComposition,
  editorData: ProjectEditorData | null | undefined,
): ProjectComposition {
  if (!editorData) return composition;
  const camera = editorData.tracks.find(
    (track) => track.kind === "camera" && track.status !== "failed",
  );
  if (!camera) return composition;
  const next = structuredClone(composition) as ProjectComposition;
  for (const segment of camera.assets) {
    if (
      !segment.complete ||
      !segment.exists ||
      !segment.src ||
      !segment.endNs ||
      segment.endNs <= segment.startNs
    )
      continue;
    const known = next.media.find(
      (asset) =>
        asset.origin === "session" &&
        asset.sessionId === editorData.sessionId &&
        asset.sessionPath === segment.path,
    );
    const asset = known ?? {
      id: id(),
      kind: "video" as const,
      name: "Webcam",
      fileName: null,
      durationMs: milliseconds(segment.endNs - segment.startNs),
      width:
        typeof camera.format.width === "number" ? camera.format.width : null,
      height:
        typeof camera.format.height === "number" ? camera.format.height : null,
      src: segment.src,
      origin: "session" as const,
      sessionId: editorData.sessionId,
      sessionPath: segment.path,
    };
    if (!known) next.media.push(asset);
    if (
      next.layers.some(
        (layer) => layer.kind === "video" && layer.assetId === asset.id,
      )
    )
      continue;
    next.layers.push({
      id: id(),
      kind: "video",
      name: "Webcam",
      assetId: asset.id,
      startMs: milliseconds(segment.startNs),
      endMs: milliseconds(segment.endNs),
      enabled: true,
      order: next.layers.length,
      transform: placementFor(camera.format) ?? { ...CAMERA_TRANSFORM },
      sourceOffsetMs: 0,
      reactToZoom: true,
      ...(appearanceFor(camera.format) ? { webcamAppearance: appearanceFor(camera.format) } : {}),
    });
  }
  return next;
}

export const cameraLayers = (composition: ProjectComposition) =>
  composition.layers.filter(
    (layer): layer is MediaCompositionLayer =>
      layer.kind === "video" &&
      (layer.name === "Webcam" ||
        composition.media.some(
          (asset) =>
            asset.id === layer.assetId &&
            asset.origin === "session" &&
            asset.name === "Webcam",
        )),
  );

export function splitCameraLayer(
  composition: ProjectComposition,
  layerId: string,
  atMs: number,
): ProjectComposition {
  const source = composition.layers.find((layer) => layer.id === layerId);
  if (
    !source ||
    source.kind !== "video" ||
    atMs <= source.startMs ||
    atMs >= source.endMs
  )
    return composition;
  const offset = source.sourceOffsetMs ?? 0;
  const first = { ...source, endMs: atMs };
  const second = {
    ...source,
    id: id(),
    startMs: atMs,
    sourceOffsetMs: offset + atMs - source.startMs,
  };
  return {
    ...composition,
    layers: composition.layers
      .flatMap((layer) => (layer.id === layerId ? [first, second] : [layer]))
      .map((layer, order) => ({ ...layer, order })),
  };
}

export function trimCameraLayer(
  composition: ProjectComposition,
  layerId: string,
  edge: "start" | "end",
  atMs: number,
): ProjectComposition {
  return {
    ...composition,
    layers: composition.layers.map((layer) => {
      if (layer.id !== layerId || layer.kind !== "video") return layer;
      if (edge === "start" && atMs > layer.startMs && atMs < layer.endMs)
        return {
          ...layer,
          startMs: atMs,
          sourceOffsetMs: (layer.sourceOffsetMs ?? 0) + atMs - layer.startMs,
        };
      if (edge === "end" && atMs > layer.startMs && atMs < layer.endMs)
        return { ...layer, endMs: atMs };
      return layer;
    }),
  };
}
