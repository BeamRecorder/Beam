import type { ProjectEditorData } from '../../../../api/types/capture-api'
import type { ProjectComposition } from '../../composition/composition-types'
import type { TranscriptionSource } from '../../captions/whisper-types'
import { tNamespace } from '~/i18n'

const $t = tNamespace('CaptionPanel')

export interface CaptionSource {
  id: TranscriptionSource
  label: string
  src: string
}

export const captionSources = (
  composition: ProjectComposition,
  editorData?: ProjectEditorData | null,
): CaptionSource[] => {
  const captureSources = editorData?.tracks.flatMap((track) =>
    track.kind === 'system-audio' || track.kind === 'microphone'
      ? track.assets.filter((asset) => asset.src).map((asset) => ({
          id: track.kind as TranscriptionSource,
          label: track.kind === 'system-audio' ? $t('systemAudio') : $t('microphone'),
          src: asset.src!,
        }))
      : [],
  ) ?? []
  const mediaById = new Map(composition.media.map((asset) => [asset.id, asset]))
  const timelineSources = composition.layers.flatMap((layer) => {
    if (layer.kind !== 'audio') return []
    const asset = mediaById.get(layer.assetId)
    if (!asset) return []
    return [{ id: `media:${layer.id}` as TranscriptionSource, label: layer.name, src: asset.src }]
  })

  return [...captureSources, ...timelineSources]
}