const { contextBridge, ipcRenderer } = require('electron')

const invoke = (command, payload) => ipcRenderer.invoke('capture:request', command, payload)

contextBridge.exposeInMainWorld('capture', Object.freeze({
  discover: () => invoke('discover'),
  capabilities: () => invoke('capabilities'),
  permissions: () => invoke('permissions'),
  formats: (sourceId) => invoke('formats', { source: sourceId }),
  prepare: (config) => invoke('prepare', { config }),
  startRecording: (options = {}) => invoke('start-default-recording', { options }),
  start: (config) => config ? invoke('start-recording', { config }) : invoke('start'),
  pause: () => invoke('pause'),
  resume: () => invoke('resume'),
  stop: () => invoke('stop'),
  status: () => invoke('status'),
  close: () => ipcRenderer.send('window:close'),
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  unmaximize: () => ipcRenderer.send('window:unmaximize'),
  setPosition: (x, y) => ipcRenderer.send('window:setPosition', x, y),
  setSize: (width, height) => ipcRenderer.send('window:setSize', width, height),
  setSizeSmooth: (width, height) => ipcRenderer.send('window:setSizeSmooth', width, height),
  dragStart: () => ipcRenderer.send('window:dragStart'),
  drag: () => ipcRenderer.send('window:drag'),
  getSources: (types) => ipcRenderer.invoke('window:getSources', types),
  listProjects: () => ipcRenderer.invoke('projects:list'),
  getProjectEditorData: (projectId) => ipcRenderer.invoke('projects:editor-data', { projectId }),
  createProject: (options = {}) => ipcRenderer.invoke('projects:create', options),
  renameProject: (projectId, name) => ipcRenderer.invoke('projects:rename', { projectId, name }),
  deleteProject: (projectId) => ipcRenderer.invoke('projects:delete', { projectId }),
}))
