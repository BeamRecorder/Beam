import { describe, expect, it } from 'vitest'
import { editorAudioLayers } from '../useEditorAudio'
import type { ProjectEditorData } from '../../../../api/types/capture-api'

const data = (tracks: ProjectEditorData['tracks']) => ({ tracks } as ProjectEditorData)
const asset = { path: 'audio/segment.webm', startNs: 2_000_000_000, endNs: 3_000_000_000, complete: true, src: 'file:///audio.webm', exists: true }

describe('editorAudioLayers', () => {
  it('maps complete system and microphone sidecars onto the session timeline', () => {
    const tracks = [{ trackId: 'system', kind: 'system-audio', status: 'completed', assets: [asset] }, { trackId: 'mic', kind: 'microphone', status: 'completed', assets: [{ ...asset, path: 'microphone/segment.webm' }] }]
    expect(editorAudioLayers(data(tracks as ProjectEditorData['tracks']), true, true)).toEqual([
      expect.objectContaining({ id: 'system:audio/segment.webm', startSeconds: 2 }),
      expect.objectContaining({ id: 'mic:microphone/segment.webm', startSeconds: 2 }),
    ])
  })

  it('honours independent microphone and system-audio toggles', () => {
    const tracks = [{ trackId: 'system', kind: 'system-audio', status: 'completed', assets: [asset] }, { trackId: 'mic', kind: 'microphone', status: 'completed', assets: [asset] }]
    expect(editorAudioLayers(data(tracks as ProjectEditorData['tracks']), true, false)).toHaveLength(1)
    expect(editorAudioLayers(data(tracks as ProjectEditorData['tracks']), false, true)).toHaveLength(1)
    expect(editorAudioLayers(data(tracks as ProjectEditorData['tracks']), false, false)).toEqual([])
  })

  it('excludes failed, missing, and incomplete assets', () => {
    const tracks = [{ trackId: 'failed', kind: 'microphone', status: 'failed', assets: [asset] }, { trackId: 'missing', kind: 'system-audio', status: 'completed', assets: [{ ...asset, exists: false }] }, { trackId: 'partial', kind: 'microphone', status: 'completed', assets: [{ ...asset, complete: false }] }]
    expect(editorAudioLayers(data(tracks as ProjectEditorData['tracks']), true, true)).toEqual([])
  })
})
