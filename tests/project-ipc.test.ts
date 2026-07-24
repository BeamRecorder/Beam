import { describe, expect, it, vi } from 'vitest'

const { registerProjectIpc } = require('../electron/projects/project-ipc.cjs') as {
  registerProjectIpc: (ipcMain: { handle: (channel: string, handler: Function) => void }, projectStore: object, dialog: object) => void
}

const setup = () => {
  const handlers = new Map<string, Function>()
  const ipcMain = { handle: (channel: string, handler: Function) => handlers.set(channel, handler) }
  const importBackground = vi.fn((projectId, input) => ({ projectId, ...input }))
  const dialog = { showOpenDialog: vi.fn().mockResolvedValue({ canceled: false, filePaths: ['C:/wallpaper.png'] }) }
  registerProjectIpc(ipcMain, { importBackground }, dialog)
  return { handler: handlers.get('projects:pick-background-media')!, dialog, importBackground }
}

describe('background import IPC', () => {
  it('limits image imports to supported image extensions', async () => {
    const { handler, dialog } = setup()
    await handler({}, { projectId: 'project', kind: 'image' })
    expect(dialog.showOpenDialog).toHaveBeenCalledWith(expect.objectContaining({ filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'avif', 'bmp'] }] }))
  })

  it('limits video imports to supported video extensions', async () => {
    const { handler, dialog } = setup()
    await handler({}, { projectId: 'project', kind: 'video' })
    expect(dialog.showOpenDialog).toHaveBeenCalledWith(expect.objectContaining({ filters: [{ name: 'Vidéos', extensions: ['mp4', 'webm', 'mov', 'm4v', 'ogv'] }] }))
  })

  it('uses the combined filter for a custom background or invalid kind', async () => {
    const { handler, dialog } = setup()
    await handler({}, { projectId: 'project', kind: 'invalid' })
    expect(dialog.showOpenDialog).toHaveBeenCalledWith(expect.objectContaining({ filters: [expect.objectContaining({ name: 'Fonds personnalisés', extensions: expect.arrayContaining(['png', 'mp4']) })] }))
  })

  it('does not import when the file picker is cancelled', async () => {
    const { handler, dialog, importBackground } = setup()
    dialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
    await expect(handler({}, { projectId: 'project', kind: 'media' })).resolves.toBeNull()
    expect(importBackground).not.toHaveBeenCalled()
  })
})
