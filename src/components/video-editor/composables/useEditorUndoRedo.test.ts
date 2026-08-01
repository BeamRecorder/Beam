import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEditorUndoRedo } from './useEditorUndoRedo'

const snapshot = (value: number) => ({
  composition: { assets: [], clips: [{ id: `clip-${value}`, value }] },
  zoomElements: [],
  outputCanvas: { preset: '16:9', width: 1920, height: 1080, showBackground: false },
  selectedBackground: null,
  backgroundBlurPercent: value,
}) as never

describe('useEditorUndoRedo', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('records snapshots, ignores duplicates, restores undo and redo states', async () => {
    const restored: unknown[] = []
    let api!: ReturnType<typeof useEditorUndoRedo>
    const Harness = defineComponent({ setup: () => (api = useEditorUndoRedo({ onRestoreSnapshot: (value) => { restored.push(value) } }), {}), template: '<div />' })
    const wrapper = mount(Harness)
    const first = snapshot(1)
    const second = snapshot(2)
    api.recordSnapshot(first)
    api.recordSnapshot(first)
    api.recordSnapshot(second)
    expect(api.undoStack.value).toHaveLength(2)
    expect(api.canUndo.value).toBe(true)
    await api.undo()
    expect(restored).toHaveLength(1)
    expect(api.lastAction.value?.type).toBe('undo')
    expect(api.canRedo.value).toBe(true)
    await api.redo()
    expect(restored).toHaveLength(2)
    expect(api.lastAction.value?.type).toBe('redo')
    wrapper.unmount()
  })

  it('debounces records, cancels pending work and keeps the history bounded', () => {
    let api!: ReturnType<typeof useEditorUndoRedo>
    const Harness = defineComponent({ setup: () => (api = useEditorUndoRedo({ onRestoreSnapshot: () => undefined }), {}), template: '<div />' })
    const wrapper = mount(Harness)
    api.recordSnapshot(snapshot(0), 100)
    api.recordSnapshot(snapshot(1), 100)
    vi.advanceTimersByTime(99)
    expect(api.undoStack.value).toHaveLength(0)
    vi.advanceTimersByTime(1)
    expect(api.undoStack.value).toHaveLength(1)
    for (let value = 2; value <= 55; value++) api.recordSnapshot(snapshot(value))
    expect(api.undoStack.value).toHaveLength(50)
    wrapper.unmount()
  })

  it('maps Ctrl/Cmd shortcuts and ignores editable fields', async () => {
    let api!: ReturnType<typeof useEditorUndoRedo>
    const Harness = defineComponent({ setup: () => (api = useEditorUndoRedo({ onRestoreSnapshot: () => undefined }), {}), template: '<div />' })
    const wrapper = mount(Harness)
    api.recordSnapshot(snapshot(1))
    api.recordSnapshot(snapshot(2))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }))
    await Promise.resolve()
    expect(api.lastAction.value?.type).toBe('undo')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', ctrlKey: true }))
    await Promise.resolve()
    expect(api.lastAction.value?.type).toBe('redo')
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }))
    expect(api.lastAction.value?.type).toBe('redo')
    input.remove()
    wrapper.unmount()
  })
})
