const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

const MAX_CHUNK_BYTES = 32 * 1024 * 1024

function safeExportName(name, extension) {
  const base = typeof name === 'string' ? name.normalize('NFKC').trim() : ''
  const cleaned = base
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .slice(0, 120)
  return `${cleaned || 'Beam export'}.${extension}`
}

function registerExportIpc({ ipcMain, dialog, BrowserWindow, fsModule = fs, pathModule = path }) {
  const jobs = new Map()
  const ownerId = (event) => event.sender.id
  const requireJob = (event, jobId) => {
    const job = jobs.get(jobId)
    if (!job || job.ownerId !== ownerId(event)) throw new Error('Export job introuvable ou non autorisé.')
    return job
  }
  const cleanup = (job) => {
    if (job.handle) fsModule.closeSync(job.handle)
    job.handle = null
    if (fsModule.existsSync(job.temporaryPath)) fsModule.unlinkSync(job.temporaryPath)
    jobs.delete(job.id)
  }

  ipcMain.handle('export:begin', async (event, payload = {}) => {
    const format = payload.format === 'mp4' ? 'mp4' : payload.format === 'webm' ? 'webm' : null
    if (!format) throw new Error('Format d’export invalide.')
    const window = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showSaveDialog(window, {
      title: 'Export video',
      defaultPath: safeExportName(payload.projectName, format),
      filters: [{ name: format.toUpperCase(), extensions: [format] }],
      properties: ['showOverwriteConfirmation'],
    })
    if (result.canceled || !result.filePath) return { canceled: true }
    const targetPath = pathModule.resolve(result.filePath)
    if (pathModule.extname(targetPath).toLowerCase() !== `.${format}`)
      throw new Error(`Le fichier doit utiliser l’extension .${format}.`)
    const id = crypto.randomUUID()
    const temporaryPath = `${targetPath}.${id}.partial`
    const handle = fsModule.openSync(temporaryPath, 'wx')
    jobs.set(id, { id, ownerId: ownerId(event), targetPath, temporaryPath, handle, nextSequence: 0 })
    return { canceled: false, jobId: id }
  })
  ipcMain.handle('export:write', (event, payload = {}) => {
    const job = requireJob(event, payload.jobId)
    if (!Number.isSafeInteger(payload.sequence) || payload.sequence !== job.nextSequence)
      throw new Error('Ordre de chunk d’export invalide.')
    if (!Number.isSafeInteger(payload.position) || payload.position < 0) throw new Error('Position de chunk invalide.')
    const data = payload.data
    if (!(data instanceof Uint8Array) || data.byteLength === 0 || data.byteLength > MAX_CHUNK_BYTES)
      throw new Error('Taille de chunk d’export invalide.')
    fsModule.writeSync(
      job.handle,
      Buffer.from(data.buffer, data.byteOffset, data.byteLength),
      0,
      data.byteLength,
      payload.position,
    )
    job.nextSequence += 1
  })
  ipcMain.handle('export:finalize', (event, payload = {}) => {
    const job = requireJob(event, payload.jobId)
    fsModule.fsyncSync(job.handle)
    fsModule.closeSync(job.handle)
    job.handle = null
    fsModule.renameSync(job.temporaryPath, job.targetPath)
    jobs.delete(job.id)
    return { path: job.targetPath }
  })
  ipcMain.handle('export:abort', (event, payload = {}) => cleanup(requireJob(event, payload.jobId)))
  ipcMain.handle('export:open-file', (_event, payload = {}) => {
    if (payload.path && typeof payload.path === 'string') {
      const { shell } = require('electron')
      void shell.openPath(payload.path)
    }
  })
  ipcMain.handle('export:show-in-folder', (_event, payload = {}) => {
    if (payload.path && typeof payload.path === 'string') {
      const { shell } = require('electron')
      shell.showItemInFolder(payload.path)
    }
  })
  return {
    cleanupWindow: (webContents) => {
      for (const job of jobs.values()) if (job.ownerId === webContents.id) cleanup(job)
    },
  }
}

module.exports = { registerExportIpc, safeExportName }
