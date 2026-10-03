import { useI18n } from 'vue-i18n';
import { Film, ZoomIn, Type, Shapes, Volume2, CircleDashed, Palette } from '@lucide/vue';
import { provideEditorSearch } from './useEditorSearch';
import { ZOOM_DEPTH_SCALES } from '@beam/engine/zoom/zoom-types';
import type { EditorSearchAction, VideoEditorSearchOptions } from './editor-search-types';

export function provideVideoEditorSearch(options: VideoEditorSearchOptions) {
  const { t } = useI18n();
  const { compositionState, zoomState } = options;
  return provideEditorSearch({
    mode: 'video',
    canInsert: options.canInsert,
    clipKind: () => compositionState.selectedClip.value?.kind,
    canEditClip: () => Boolean(compositionState.selectedClip.value && !compositionState.selectedClip.value.locked),
    canEditZoom: () => Boolean(zoomState.selectedZoom.value && !zoomState.selectedZoom.value.locked),
    insert: async (kind) => {
      if (kind === 'cursor' || kind === 'voiceover') throw new Error('Unsupported video insertion.');
      await options.addEditorElement(kind);
    },
    selections: () => [
      ...compositionState.composition.value.clips.map((clip): EditorSearchAction => ({
        id: `clip:${clip.id}`,
        group: 'selection',
        label: clip.name || t('SidebarPanel.clip'),
        icon:
          (
            {
              shape: Shapes,
              caption: Type,
              audio: Volume2,
              blur: CircleDashed,
              color: Palette,
            } as Record<string, typeof Film>
          )[clip.kind] ?? Film,
        preview:
          clip.kind === 'shape'
            ? { kind: 'shape', clip }
            : clip.kind === 'color'
              ? { kind: 'color', clip }
              : 'assetId' in clip
                ? (() => {
                    const asset = compositionState.composition.value.assets.find((item) => item.id === clip.assetId);
                    if (!asset || asset.kind === 'audio') return undefined;
                    return asset.kind === 'image'
                      ? { kind: 'image' as const, src: asset.src }
                      : {
                          kind: 'video' as const,
                          asset,
                          timeSec:
                            (('freezeFrameSourceMs' in clip ? clip.freezeFrameSourceMs : undefined) ??
                              clip.sourceInMs) / 1000,
                        };
                  })()
                : undefined,
        detail: `${(clip.timelineStartMs / 1000).toFixed(1)}s`,
        terms: [
          clip.kind,
          clip.kind === 'shape'
            ? (clip.text?.content ?? '')
            : clip.kind === 'caption' && clip.caption.type === 'text'
              ? [clip.caption.style.customText ?? '', ...clip.caption.sentences.map((sentence) => sentence.text)].join(
                  ' ',
                )
              : '',
        ],
        run: () => {
          zoomState.selectedZoomId.value = null;
          zoomState.selectedZoomIds.value = [];
          compositionState.selectClip(clip.id);
        },
      })),
      ...zoomState.zoomElements.value.map((zoom): EditorSearchAction => ({
        id: `zoom:${zoom.id}`,
        group: 'selection',
        label: t('TimelineTracks.zoomTitle', {
          level: ZOOM_DEPTH_SCALES[zoom.depth].toFixed(2),
        }),
        icon: ZoomIn,
        detail: `${(zoom.startMs / 1000).toFixed(1)}s`,
        terms: [zoom.mode, zoom.tiltPreset ?? ''],
        run: () => {
          compositionState.selectClips([]);
          zoomState.selectZooms([zoom.id], zoom.id);
        },
      })),
    ],
  });
}
