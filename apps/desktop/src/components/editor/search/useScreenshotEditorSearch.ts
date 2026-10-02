import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { Film } from '@lucide/vue';
import { screenshotLayers } from '@beam/engine/screenshot/screenshot-layers';
import { screenshotImage } from '@beam/engine/screenshot/screenshot-images';
import { screenshotThumbnailSpecs } from '../../screenshot/composition/thumbnails/thumbnail-spec';
import { useLayerThumbnails } from '../../screenshot/composition/thumbnails/useLayerThumbnails';
import { provideEditorSearch } from './useEditorSearch';
import type { ScreenshotEditorSearchOptions } from './editor-search-types';
export function provideScreenshotEditorSearch(options: ScreenshotEditorSearchOptions) {
  const { t } = useI18n();
  const visible = ref<string[]>([]);
  const thumbnails = useLayerThumbnails(() =>
    options.state.value && options.document.value && visible.value.length
      ? screenshotThumbnailSpecs(options.state.value, options.document.value.source, options.packs()).filter((spec) =>
          visible.value.includes(`clip:${spec.id}`),
        )
      : [],
  );
  const kind = () => {
    const state = options.state.value,
      id = options.selectedId.value;
    if (!state || !id) return undefined;
    return screenshotImage(state, id)
      ? 'image'
      : state.shapes.some((shape) => shape.id === id)
        ? 'shape'
        : state.effects?.some((effect) => effect.id === id)
          ? 'blur'
          : state.cursors?.some((cursor) => cursor.id === id)
            ? 'cursor'
            : undefined;
  };
  return provideEditorSearch({
    mode: 'screenshot',
    canInsert: options.canInsert,
    insert: options.insert,
    clipKind: kind,
    canEditClip: () =>
      Boolean(
        options.canInsert() &&
        options.selectedId.value &&
        !options.state.value?.composition?.find((layer) => layer.id === options.selectedId.value)?.locked,
      ),
    visible: (ids) => {
      visible.value = ids;
    },
    selections: () =>
      options.state.value
        ? screenshotLayers(options.state.value).map((layer) => ({
            id: `clip:${layer.id}`,
            group: 'selection',
            label:
              layer.name ||
              t(
                layer.kind === 'background'
                  ? 'SidebarPanel.canvas'
                  : layer.kind === 'watermark'
                    ? 'CanvasPanel.watermark'
                    : layer.kind === 'effect'
                      ? 'TimelineTracks.blur'
                      : `Elements.${layer.kind}`,
              ),
            icon: Film,
            tab: ['background', 'watermark'].includes(layer.kind) ? 'canvas' : 'clip',
            terms: [layer.kind],
            preview: { kind: 'layer', value: thumbnails.value[layer.id] },
            run: () => options.select(layer.id),
          }))
        : [],
  });
}
