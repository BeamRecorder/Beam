const { contextBridge, ipcRenderer } = require('electron')

const invoke = (command, payload) => ipcRenderer.invoke('capture:request', command, payload)

contextBridge.exposeInMainWorld('capture', Object.freeze({
  discover: () => invoke('discover'),
  capabilities: () => invoke('capabilities'),
  permissions: () => invoke('permissions'),
  formats: (sourceId) => invoke('formats', { source: sourceId }),
  prepare: (config) => invoke('prepare', { config }),
  start: (config) => config ? invoke('start-recording', { config }) : invoke('start'),
  pause: () => invoke('pause'),
  resume: () => invoke('resume'),
  stop: () => invoke('stop'),
  status: () => invoke('status'),
}))
