import type { ProjectEditorData } from '../../../../api/types/capture-api'
import type { ClipComposition } from '../../composition/composition-types'
import { isAudioClip } from '../../composition/composition-types'
import type { TranscriptionSource } from '../../captions/whisper-types'
import { tNamespace } from '~/i18n'

const $t = tNamespace('CaptionPanel')
export interface CaptionSource {
  id: TranscriptionSource
  label: string
  src: string
}

export const captionSources = (
  composition: ClipComposition,
  _editorData?: ProjectEditorData | null,
): CaptionSource[] => {
  const assets = new Map(composition.assets.map((asset) => [asset.id, asset]))
  const seen = new Set<string>()
  return composition.clips.flatMap((clip) => {
    if (!isAudioClip(clip) || !clip.enabled) return []
    const asset = assets.get(clip.assetId)
    if (!asset?.src || seen.has(asset.src)) return []
    seen.add(asset.src)
    const id: TranscriptionSource =
      clip.role === 'system'
        ? 'system'
        : clip.role === 'microphone'
          ? 'microphone'
          : (`media:${clip.id}` as TranscriptionSource)
    const label = clip.role === 'system' ? $t('systemAudio') : clip.role === 'microphone' ? $t('microphone') : clip.name
    return [{ id, label, src: asset.src }]
  })
}
