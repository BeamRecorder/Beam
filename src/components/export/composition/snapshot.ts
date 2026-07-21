import type { ProjectEditorData } from '../../../api/types/capture-api'
import type { BackgroundMedia } from '../../video-editor/composables/backgroundMedia'
import type { ZoomElement } from '../../video-editor/zoom/zoom-types'
import type { CompositionSnapshot } from '../export-types'

export function createCompositionSnapshot(input: {
  videoSrc: string | null
  duration: number
  width: number
  height: number
  fps: number
  videoEnabled: boolean
  background: BackgroundMedia | null
  editorData: ProjectEditorData | null | undefined
  zooms: ZoomElement[]
  systemAudioEnabled: boolean
  micAudioEnabled: boolean
}): CompositionSnapshot {
  if (!input.videoSrc) throw new Error('La vidéo de la session est indisponible.')
  return {
    duration: Math.max(0, input.duration),
    video: { src: input.videoSrc, width: Math.max(1, input.width), height: Math.max(1, input.height), fps: Math.max(1, input.fps), enabled: input.videoEnabled },
    background: input.background ? { kind: input.background.kind, src: input.background.path } : null,
    zooms: structuredClone(input.zooms),
    cursor: structuredClone(input.editorData?.cursor ?? { available: false, events: [], telemetry: [], shapes: {}, missing: [] }),
    audio: (input.editorData?.tracks ?? []).flatMap((track) => {
      const enabled = track.kind === 'system-audio' ? input.systemAudioEnabled : track.kind === 'microphone' ? input.micAudioEnabled : false
      if (!enabled || !['system-audio', 'microphone'].includes(track.kind) || track.status === 'failed') return []
      return track.assets.filter((asset) => asset.exists && asset.src && asset.complete).map((asset) => ({ id: `${track.trackId}:${asset.path}`, src: asset.src!, startSeconds: Math.max(0, asset.startNs / 1_000_000_000), enabled: true }))
    }),
    layers: [
      { kind: 'background', enabled: Boolean(input.background) },
      { kind: 'video', enabled: input.videoEnabled },
      { kind: 'cursor', enabled: Boolean(input.editorData?.cursor.available) },
    ],
  }
}
