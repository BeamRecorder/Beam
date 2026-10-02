const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gpuExport', {
  request: () => ipcRenderer.invoke('ffmpeg-gpu:request'),
  prepareFrame: (sequence) => ipcRenderer.invoke('ffmpeg-gpu:prepare-frame', sequence),
  frame: (sequence) => ipcRenderer.invoke('ffmpeg-gpu:frame', sequence),
  audio: (data, firstFrame) => ipcRenderer.invoke('ffmpeg-gpu:audio', { data, firstFrame }),
  progress: (value) => ipcRenderer.invoke('ffmpeg-gpu:progress', value),
  complete: (value) => ipcRenderer.invoke('ffmpeg-gpu:complete', value),
  error: (message) => ipcRenderer.invoke('ffmpeg-gpu:error', message),
});
