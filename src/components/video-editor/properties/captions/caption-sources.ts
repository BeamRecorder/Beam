import type { ProjectEditorData } from "../../../../api/types/capture-api";
import type { ClipComposition } from "../../composition/composition-types";
import type { TranscriptionSource } from "../../captions/whisper-types";
import { tNamespace } from "~/i18n";

const $t = tNamespace("CaptionPanel");
export interface CaptionSource { id: TranscriptionSource; label: string; src: string }

export const captionSources = (composition: ClipComposition, editorData?: ProjectEditorData | null): CaptionSource[] => {
  const captureSources = editorData?.tracks.flatMap((track) =>
    track.kind === "system-audio" || track.kind === "microphone"
      ? track.assets.filter((asset) => asset.src).map((asset) => ({
          id: track.kind as TranscriptionSource,
          label: track.kind === "system-audio" ? $t("systemAudio") : $t("microphone"),
          src: asset.src!,
        }))
      : [],
  ) ?? [];
  const assets = new Map(composition.assets.map((asset) => [asset.id, asset]));
  const timelineSources = composition.clips.flatMap((clip) => {
    if (clip.kind !== "audio") return [];
    const asset = assets.get(clip.assetId);
    return asset?.src ? [{ id: `media:${clip.id}` as TranscriptionSource, label: clip.name, src: asset.src }] : [];
  });
  const unique = new Map<string, CaptionSource>();
  for (const source of [...captureSources, ...timelineSources]) if (!unique.has(source.src)) unique.set(source.src, source);
  return [...unique.values()];
};
