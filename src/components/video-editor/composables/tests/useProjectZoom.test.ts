import { nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CaptureProject, ProjectEditorData } from '../../../../api/types/capture-api'
import type { ZoomElement } from '../../zoom/zoom-types'
import { useProjectZoom } from '../useProjectZoom'

const { capture } = vi.hoisted(() => ({ capture: { saveProjectZoomState: vi.fn() } }))
vi.mock('../../../../api/capture', () => ({ capture }))

const project: CaptureProject = { id: 'project', name: 'Project', createdAt: '', updatedAt: '', sessionCount: 1, previewSrc: null }
const zoom = (id: string, mode: ZoomElement['mode'] = 'manual', sessionId = 'session'): ZoomElement => ({ id, sessionId, startMs: 1_000, endMs: 2_000, depth: 2, mode, focus: { cx: .5, cy: .5 } })
const data = (overrides: Partial<ProjectEditorData> = {}): ProjectEditorData => ({
  sessionId: 'session', videoSrc: null, tracks: [],
  manifest: { schemaVersion: 1, projectId: 'project', sessionId: 'session', createdAtUtc: '', sessionStartMonotonicNs: 0, durationNs: 10_000_000_000, platform: {}, selectedSources: {}, tracks: [], permissions: {}, warnings: [], completed: true },
  cursor: { available: true, events: [], telemetry: [{ timeMs: 2_000, cx: .2, cy: .8, interactionType: 'click' }], shapes: {}, missing: [] },
  zoom: { elements: [], generatedSessions: [{ sessionId: 'session', algorithmVersion: 4, generatedAt: 'now' }] }, ...overrides,
})

const create = (initialProject: CaptureProject | null = project, initialData: ProjectEditorData | null = data(), duration = 5_000) => {
  const activeTab = ref('canvas')
  return { state: useProjectZoom({ project: ref(initialProject), editorData: ref(initialData), durationMs: ref(duration), activeTab }), activeTab }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(crypto, 'randomUUID').mockReturnValue('generated-id')
  capture.saveProjectZoomState.mockImplementation(async (_id: string, state: ProjectEditorData['zoom']) => state)
})
afterEach(() => vi.restoreAllMocks())

describe('useProjectZoom', () => {
  it('derives selection and generation capabilities from the currently loaded editor data', async () => {
    const { state } = create(null, null)
    expect(state.canGenerateZooms.value).toBe(false)
    expect(state.selectedZoom.value).toBeNull()
    expect(state.hasAutomaticZooms.value).toBe(false)
    state.zoomElements.value = [zoom('manual')]
    state.selectedZoomId.value = 'manual'
    expect(state.selectedZoom.value).toMatchObject({ id: 'manual' })
  })

  it('adds a finite manual zoom bounded to the timeline, but rejects points after its end', async () => {
    const { state, activeTab } = create(project, null, 1_000)
    await state.addZoomAtTime(99_999)
    expect(state.zoomElements.value).toEqual([])
    await state.addZoomAtTime(-99)
    expect(state.zoomElements.value).toEqual([expect.objectContaining({ id: 'generated-id', sessionId: 'manual', startMs: 0, endMs: 1_000, mode: 'manual' })])
    expect(capture.saveProjectZoomState).toHaveBeenCalledWith('project', expect.objectContaining({ elements: state.zoomElements.value }))
    expect(state.selectedZoomId.value).toBe('generated-id')
    expect(activeTab.value).toBe('zoom')
    await state.addZoomAtTime(Number.NaN)
    expect(state.zoomElements.value).toHaveLength(1)
  })

  it('replaces only automatic zooms for the active session, preserving manual and other-session elements', async () => {
    const editor = data({ zoom: { elements: [{ ...zoom('manual'), startMs: 0, endMs: 1_000 }, zoom('old-auto', 'auto'), zoom('other-auto', 'auto', 'other')], generatedSessions: [{ sessionId: 'other', algorithmVersion: 4, generatedAt: 'old' }, { sessionId: 'session', algorithmVersion: 4, generatedAt: 'old' }] } })
    const { state } = create(project, editor)
    await state.generateZooms()
    expect(state.zoomElements.value).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'manual' }), expect.objectContaining({ id: 'other-auto' }), expect.objectContaining({ id: 'auto:session:2000', mode: 'auto' })]))
    expect(state.zoomElements.value.find((item) => item.id === 'old-auto')).toBeUndefined()
    expect(state.generatedSessions.value).toEqual(expect.arrayContaining([expect.objectContaining({ sessionId: 'session', algorithmVersion: 4 }), expect.objectContaining({ sessionId: 'other' })]))
    expect(state.selectedZoomId.value).toBe('auto:session:2000')
  })

  it('does not generate without a project, cursor telemetry, or an available cursor', async () => {
    const noCursor = data({ cursor: { available: false, events: [], telemetry: [], shapes: {}, missing: [] } })
    const { state } = create(null, noCursor)
    await state.generateZooms()
    expect(capture.saveProjectZoomState).not.toHaveBeenCalled()
    expect(state.zoomElements.value).toEqual([])
  })

  it('rejects invalid updates, persists valid replacements, and deletes the selected zoom', async () => {
    const { state } = create(project, data({ zoom: { elements: [zoom('one')], generatedSessions: [{ sessionId: 'session', algorithmVersion: 4, generatedAt: 'now' }] } }))
    state.updateZoom({ ...zoom('one'), startMs: -1, endMs: 2 })
    expect(capture.saveProjectZoomState).not.toHaveBeenCalled()
    state.updateZoom({ ...zoom('one'), startMs: 10, endMs: 20, depth: 6 })
    await Promise.resolve()
    expect(state.zoomElements.value[0]).toMatchObject({ startMs: 10, endMs: 20, depth: 6 })
    state.selectedZoomId.value = 'one'
    state.deleteSelectedZoom()
    await Promise.resolve()
    expect(state.zoomElements.value).toEqual([])
    expect(state.selectedZoomId.value).toBeNull()
  })

  it('resets local elements when editor data changes and avoids repeated automatic generation for a current algorithm record', async () => {
    const editor = ref(data({ zoom: { elements: [zoom('saved')], generatedSessions: [{ sessionId: 'session', algorithmVersion: 4, generatedAt: 'now' }] } }))
    const activeTab = ref('canvas')
    const state = useProjectZoom({ project: ref(project), editorData: editor, durationMs: ref(5_000), activeTab })
    await nextTick()
    expect(state.zoomElements.value).toEqual([zoom('saved')])
    expect(capture.saveProjectZoomState).not.toHaveBeenCalled()
    editor.value = data({ sessionId: 'next', zoom: { elements: [], generatedSessions: [{ sessionId: 'next', algorithmVersion: 4, generatedAt: 'now' }] } })
    await nextTick()
    expect(state.selectedZoomId.value).toBeNull()
    expect(state.zoomElements.value).toEqual([])
  })
})
