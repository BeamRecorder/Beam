const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MAX_CHUNK_BYTES = 32 * 1024 * 1024;

const { safeExportName } = require('./export-file-name.cjs');
const { exportFilePath, confirmExportReplacement, publishExportFile } = require('./export-destination.cjs');

function registerExportIpc({
  ipcMain,
  dialog,
  BrowserWindow,
  app,
  applicationRoot,
  defaultExportDirectory = null,
  directories,
  getLocale,
  resolveAutomaticDestination = () => null,
  createGpuMonitor,
  createExperimentalExport = require('@beam/electron-export').createExperimentalGpuExport,
  fsModule = fs,
  pathModule = path,
}) {
  const jobs = new Map();
  const destinationServices = { dialog, BrowserWindow, getLocale, fsModule };
  const experimental = createExperimentalExport({
    ipcMain,
    BrowserWindow,
    nativeDirectory: app?.isPackaged
      ? pathModule.join(process.resourcesPath, 'ffmpeg-export')
      : applicationRoot
        ? pathModule.join(applicationRoot, 'build/native/ffmpeg-export')
        : null,
    renderer: app?.isPackaged
      ? { file: pathModule.join(applicationRoot, 'dist/html/export-gpu.html') }
      : { url: 'http://localhost:6500/html/export-gpu.html' },
  });
  const ownerId = (event) => event.sender.id;
  const requireJob = (event, jobId) => {
    const job = jobs.get(jobId);
    if (!job || job.ownerId !== ownerId(event)) throw new Error('Export job introuvable ou non autorisé.');
    return job;
  };
  const cleanup = async (job) => {
    jobs.delete(job.id);
    job.cancelled = true;
    job.cancel?.();
    await job.nativeRun?.catch(() => undefined);
    const gpuUsage = await job.gpuMonitor?.finish();
    await job.queue.catch(() => undefined);
    if (job.handle) await job.handle.close().catch(() => undefined);
    job.handle = null;
    await fsModule.promises.unlink(job.temporaryPath).catch((error) => {
      if (error?.code !== 'ENOENT') throw error;
    });
    return { gpuUsage };
  };

  ipcMain.handle('export:begin', async (event, payload = {}) => {
    const format = payload.format === 'mp4' ? 'mp4' : payload.format === 'webm' ? 'webm' : null;
    if (!format) throw new Error('Format d’export invalide.');
    const automaticPath = resolveAutomaticDestination(event.sender, format);
    const exportDirectory = directories ? directories.exportDirectory() : defaultExportDirectory;
    const targetPath = automaticPath
      ? pathModule.resolve(automaticPath)
      : exportFilePath(exportDirectory, payload.fileName ?? payload.projectName, format, pathModule);
    if (pathModule.extname(targetPath).toLowerCase() !== `.${format}`)
      throw new Error(`Le fichier doit utiliser l’extension .${format}.`);
    const approval = await confirmExportReplacement(destinationServices, event, targetPath);
    if (!approval.accepted) return { canceled: true };
    const id = crypto.randomUUID();
    const temporaryPath = `${targetPath}.${id}.partial`;
    const handle = await fsModule.promises.open(temporaryPath, 'wx');
    jobs.set(id, {
      id,
      ownerId: ownerId(event),
      targetPath,
      temporaryPath,
      rememberDirectory: !automaticPath,
      approvedRevision: approval.revision,
      handle,
      gpuMonitor: createGpuMonitor?.(),
      nextSequence: 0,
      queue: Promise.resolve(),
    });
    return { canceled: false, jobId: id };
  });
  ipcMain.handle('export:write', async (event, payload = {}) => {
    const job = requireJob(event, payload.jobId);
    if (job.nativeRun) throw new Error('Native export does not accept renderer video chunks.');
    if (!Number.isSafeInteger(payload.sequence) || payload.sequence !== job.nextSequence)
      throw new Error('Ordre de chunk d’export invalide.');
    if (!Number.isSafeInteger(payload.position) || payload.position < 0) throw new Error('Position de chunk invalide.');
    const data = payload.data;
    if (!(data instanceof Uint8Array) || data.byteLength === 0 || data.byteLength > MAX_CHUNK_BYTES)
      throw new Error('Taille de chunk d’export invalide.');
    job.nextSequence += 1;
    const buffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    job.queue = job.queue.then(async () => {
      let offset = 0;
      while (offset < buffer.byteLength) {
        const result = await job.handle.write(buffer, offset, buffer.byteLength - offset, payload.position + offset);
        if (!result || result.bytesWritten <= 0) throw new Error('Écriture de chunk d’export incomplète.');
        offset += result.bytesWritten;
      }
    });
    await job.queue;
  });
  ipcMain.handle('export:finalize', async (event, payload = {}) => {
    const job = requireJob(event, payload.jobId);
    if (job.nativeRun) throw new Error('Native export is still running.');
    await job.queue;
    const gpuUsage = await job.gpuMonitor?.finish();
    await job.handle.sync();
    await job.handle.close();
    job.handle = null;
    const published = await publishExportFile(destinationServices, event, job.targetPath, job.approvedRevision, () =>
      fsModule.promises.rename(job.temporaryPath, job.targetPath),
    );
    if (!published) {
      await cleanup(job);
      return { canceled: true };
    }
    jobs.delete(job.id);
    if (job.rememberDirectory) directories?.rememberExport(job.targetPath);
    return { path: job.targetPath, ...(gpuUsage ? { gpuUsage } : {}) };
  });
  ipcMain.handle('export:abort', (event, payload = {}) => cleanup(requireJob(event, payload.jobId)));
  ipcMain.handle('export:ffmpeg', async (event, payload = {}) => {
    const job = requireJob(event, payload.jobId);
    if (job.nativeRun || job.nextSequence !== 0 || !job.handle) throw new Error('Export job has already started.');
    if (payload.request?.format !== pathModule.extname(job.targetPath).slice(1))
      throw new Error('Export format differs from its destination.');
    if (!Number.isSafeInteger(payload.bitrate) || payload.bitrate < 1000 || payload.bitrate > 1_000_000_000)
      throw new Error('Invalid native export bitrate.');
    // Reserve the job before the first await, including staged-handle closure.
    const task = (async () => {
      await job.handle.close();
      job.handle = null;
      if (job.cancelled) throw new Error('Export was cancelled.');
      const result = await experimental.run(event.sender, job, { ...payload.request, nativeBitrate: payload.bitrate });
      if (job.cancelled) throw new Error('Export was cancelled.');
      job.handle = await fsModule.promises.open(job.temporaryPath, 'r+');
      return result;
    })();
    job.nativeRun = task;
    try {
      return await task;
    } finally {
      job.nativeRun = null;
    }
  });
  ipcMain.handle('export:open-file', (_event, payload = {}) => {
    if (payload.path && typeof payload.path === 'string') {
      const { shell } = require('electron');
      void shell.openPath(payload.path);
    }
  });
  ipcMain.handle('export:show-in-folder', (_event, payload = {}) => {
    if (payload.path && typeof payload.path === 'string') {
      const { shell } = require('electron');
      shell.showItemInFolder(payload.path);
    }
  });
  return {
    cleanupWindow: (webContents) => {
      for (const job of jobs.values()) if (job.ownerId === webContents.id) void cleanup(job);
    },
  };
}

module.exports = { registerExportIpc, safeExportName };
