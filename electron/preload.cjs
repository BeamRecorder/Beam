const { contextBridge, ipcRenderer, webUtils } = require('electron');

const invoke = (command, payload) => ipcRenderer.invoke('capture:request', command, payload);

contextBridge.exposeInMainWorld(
  'capture',
  Object.freeze({
    platform: process.platform,
    discover: () => invoke('discover'),
    capabilities: () => invoke('capabilities'),
    permissions: () => invoke('permissions'),
    inputAccessStatus: () => ipcRenderer.invoke('input-access:status'),
    requestInputAccess: () => ipcRenderer.invoke('input-access:request'),
    formats: (sourceId) => invoke('formats', { source: sourceId }),
    prepare: (config) => invoke('prepare', { config }),
    prepareRecording: (options = {}) => invoke('prepare-default-recording', { options }),
    startPreparedRecording: () => invoke('start-prepared-recording'),
    stopNativeRecording: () => invoke('stop-native-recording'),
    completeNativeRecording: () => invoke('complete-native-recording'),
    cancelPreparedRecording: () => invoke('cancel-prepared-recording'),
    discardRecording: (sessionId) => invoke('discard-recording', { sessionId }),
    startRecording: (options = {}) => invoke('start-default-recording', { options }),
    start: (config) => (config ? invoke('start-recording', { config }) : invoke('start')),
    pause: () => invoke('pause'),
    resume: () => invoke('resume'),
    stop: () => invoke('stop'),
    status: () => invoke('status'),
    beginCameraSegment: (payload) => ipcRenderer.invoke('camera:begin-segment', payload),
    writeCameraSegment: (payload) => ipcRenderer.invoke('camera:write-segment', payload),
    finalizeCameraSegment: (payload) => ipcRenderer.invoke('camera:finalize-segment', payload),
    failCamera: (payload) => ipcRenderer.invoke('camera:fail', payload),
    beginMicrophoneSegment: (payload) => ipcRenderer.invoke('microphone:begin-segment', payload),
    writeMicrophoneSegment: (payload) => ipcRenderer.invoke('microphone:write-segment', payload),
    finalizeMicrophoneSegment: (payload) => ipcRenderer.invoke('microphone:finalize-segment', payload),
    failMicrophone: (payload) => ipcRenderer.invoke('microphone:fail', payload),
    beginSystemAudioSegment: (payload) => ipcRenderer.invoke('system-audio:begin-segment', payload),
    writeSystemAudioSegment: (payload) => ipcRenderer.invoke('system-audio:write-segment', payload),
    finalizeSystemAudioSegment: (payload) => ipcRenderer.invoke('system-audio:finalize-segment', payload),
    failSystemAudio: (payload) => ipcRenderer.invoke('system-audio:fail', payload),
    close: () => ipcRenderer.send('window:close'),
    minimize: () => ipcRenderer.send('window:minimize'),
    toggleDevTools: () => ipcRenderer.send('window:toggle-devtools'),
    updateTrayMenu: (labels) => ipcRenderer.send('tray:update-menu', labels),
    onTrayStopRecording: (listener) => {
      const callback = () => listener();
      ipcRenderer.on('tray:stop-recording', callback);
      return () => ipcRenderer.removeListener('tray:stop-recording', callback);
    },
    setWindowMode: (mode) => ipcRenderer.send('window:set-mode', mode),
    showHud: () => ipcRenderer.send('window:show-hud'),
    openEditor: (projectId) => ipcRenderer.invoke('editor:open', projectId),
    getEditorContext: () => ipcRenderer.invoke('editor:context'),
    notifyEditorReady: () => ipcRenderer.send('editor:ready'),
    reportEditorLoadingStage: (stage) => ipcRenderer.send('editor:loading-stage', stage),
    startRecordingFromEditor: (configuration) => ipcRenderer.send('editor:start-recording', configuration),
    setEditorTitlebarTheme: (dark) => ipcRenderer.send('editor:titlebar-theme', Boolean(dark)),
    onEditorContext: (listener) => {
      const callback = (_event, context) => listener(context);
      ipcRenderer.on('editor:context', callback);
      return () => ipcRenderer.removeListener('editor:context', callback);
    },
    onEditorLoadingProgress: (listener) => {
      const callback = (_event, progress) => listener(progress);
      ipcRenderer.on('editor:loading-progress', callback);
      return () => ipcRenderer.removeListener('editor:loading-progress', callback);
    },
    onStartRecordingFromEditor: (listener) => {
      const callback = (_event, configuration) => listener(configuration);
      ipcRenderer.on('editor:start-recording', callback);
      return () => ipcRenderer.removeListener('editor:start-recording', callback);
    },
    setPosition: (x, y) => ipcRenderer.send('window:setPosition', x, y),
    setSize: (width, height) => ipcRenderer.send('window:setSize', width, height),
    setSizeSmooth: (width, height) => ipcRenderer.send('window:setSizeSmooth', width, height),
    setWindowVisible: (visible) => ipcRenderer.send('window:set-visible', Boolean(visible)),
    setInteractive: (value) => ipcRenderer.send('window:setInteractive', value),
    getSources: (types) => ipcRenderer.invoke('window:getSources', types),
    getDisplayBounds: (displayId) => ipcRenderer.invoke('screen:get-display-bounds', displayId),
    selectScreenRegion: (options) => ipcRenderer.invoke('screen-region:select', options),
    showScreenRegionOverlay: (options) => ipcRenderer.send('screen-region:show', options),
    hideScreenRegionOverlay: () => ipcRenderer.send('screen-region:hide'),
    onScreenRegionConfigure: (listener) => {
      const callback = (_event, options) => listener(options);
      ipcRenderer.on('screen-region:configure', callback);
      return () => ipcRenderer.removeListener('screen-region:configure', callback);
    },
    confirmScreenRegion: (region) => ipcRenderer.send('screen-region:confirm', region),
    cancelScreenRegion: () => ipcRenderer.send('screen-region:cancel'),
    getWindowBounds: () => ipcRenderer.invoke('window:bounds'),
    getPreferences: () => ipcRenderer.invoke('preferences:get'),
    updatePreferences: (patch) => ipcRenderer.invoke('preferences:update', patch),
    resetPreferences: (keys) => ipcRenderer.invoke('preferences:reset', keys),
    onPreferencesChanged: (listener) => {
      const callback = (_event, preferences) => listener(preferences);
      ipcRenderer.on('preferences:changed', callback);
      return () => ipcRenderer.removeListener('preferences:changed', callback);
    },
    onPreferenceShortcut: (listener) => {
      const callback = (_event, id) => listener(id);
      ipcRenderer.on('preferences:shortcut', callback);
      return () => ipcRenderer.removeListener('preferences:shortcut', callback);
    },
    showTeleprompter: () => ipcRenderer.send('teleprompter:show'),
    hideTeleprompter: () => ipcRenderer.send('teleprompter:hide'),
    toggleTeleprompterVisibility: () => ipcRenderer.send('teleprompter:toggle-visibility'),
    setTeleprompterSession: (context) => ipcRenderer.send('teleprompter:set-session', context),
    notifyTeleprompterReady: () => ipcRenderer.send('teleprompter:ready'),
    onTeleprompterShortcut: (listener) => {
      const callback = (_event, id) => listener(id);
      ipcRenderer.on('teleprompter:shortcut', callback);
      return () => ipcRenderer.removeListener('teleprompter:shortcut', callback);
    },
    onTeleprompterSession: (listener) => {
      const callback = (_event, context) => listener(context);
      ipcRenderer.on('teleprompter:session', callback);
      return () => ipcRenderer.removeListener('teleprompter:session', callback);
    },
    onTeleprompterVisibility: (listener) => {
      const callback = (_event, visible) => listener(Boolean(visible));
      ipcRenderer.on('teleprompter:visibility', callback);
      return () => ipcRenderer.removeListener('teleprompter:visibility', callback);
    },
    saveSessionTeleprompter: (projectId, sessionId, document) =>
      ipcRenderer.invoke('teleprompter:save-session', { projectId, sessionId, document }),
    getSessionTeleprompter: (projectId, sessionId) =>
      ipcRenderer.invoke('teleprompter:get-session', { projectId, sessionId }),
    setCountdown: (seconds) => ipcRenderer.invoke('countdown:set', seconds),
    prepareRecordingSurface: () => ipcRenderer.invoke('recording-surface:prepare'),
    onCountdown: (listener) => {
      const callback = (_event, seconds) => listener(seconds);
      ipcRenderer.on('countdown:state', callback);
      return () => ipcRenderer.removeListener('countdown:state', callback);
    },
    listProjects: () => ipcRenderer.invoke('projects:list'),
    projectMediaUrl: (source) => ipcRenderer.invoke('projects:media-url', { source }),
    getProjectEditorData: (projectId) => ipcRenderer.invoke('projects:editor-data', { projectId }),
    getProjectEditorState: (projectId) => ipcRenderer.invoke('projects:editor-state', { projectId }),
    saveProjectEditorState: (projectId, state) =>
      ipcRenderer.invoke('projects:save-editor-state', { projectId, state }),
    pickProjectMedia: (projectId, kind) => ipcRenderer.invoke('projects:pick-media', { projectId, kind }),
    importDroppedProjectMedia: (projectId, file, kind) => {
      let source;
      try {
        source = webUtils.getPathForFile(file);
      } catch {
        return Promise.reject(new Error('Fichier déposé invalide'));
      }
      if (!source) return Promise.reject(new Error('Le fichier déposé ne provient pas du système de fichiers'));
      return ipcRenderer.invoke('projects:import-dropped-media', { projectId, source, kind });
    },
    listBackgroundLibrary: () => ipcRenderer.invoke('background-library:list'),
    pickBackgroundLibraryMedia: (kind = 'media') => ipcRenderer.invoke('background-library:pick-import', { kind }),
    onBackgroundLibraryChanged: (listener) => {
      const callback = () => listener();
      ipcRenderer.on('background-library:changed', callback);
      return () => ipcRenderer.removeListener('background-library:changed', callback);
    },
    createProject: (options = {}) => ipcRenderer.invoke('projects:create', options),
    renameProject: (projectId, name) => ipcRenderer.invoke('projects:rename', { projectId, name }),
    saveProjectThumbnail: (projectId, dataUrl) => ipcRenderer.invoke('projects:save-thumbnail', { projectId, dataUrl }),
    deleteProject: (projectId) => ipcRenderer.invoke('projects:delete', { projectId }),
    revealProject: (projectId) => ipcRenderer.invoke('projects:reveal', { projectId }),
    whisperModels: () => ipcRenderer.invoke('whisper:models'),
    downloadWhisperModel: (modelId) => ipcRenderer.invoke('whisper:download', { modelId }),
    onWhisperProgress: (listener) => {
      const callback = (_event, progress) => listener(progress);
      ipcRenderer.on('whisper:progress', callback);
      return () => ipcRenderer.removeListener('whisper:progress', callback);
    },
    configureCameraOverlay: (state) => ipcRenderer.send('camera-overlay:configure', state),
    setCameraOverlayActive: (active) => ipcRenderer.send('camera-overlay:set-active', Boolean(active)),
    resetCameraOverlayPlacement: () => ipcRenderer.send('camera-overlay:reset-placement'),
    getCameraOverlayState: () => ipcRenderer.invoke('camera-overlay:state'),
    onCameraOverlayState: (listener) => {
      const callback = (_event, state) => listener(state);
      ipcRenderer.on('camera-overlay:state', callback);
      return () => ipcRenderer.removeListener('camera-overlay:state', callback);
    },
    onCameraOverlayHover: (listener) => {
      const callback = (_event, hovered) => listener(hovered);
      ipcRenderer.on('camera-overlay:hover', callback);
      return () => ipcRenderer.removeListener('camera-overlay:hover', callback);
    },
    onCameraShadow: (listener) => {
      const callback = (_event, state) => listener(state);
      ipcRenderer.on('camera-shadow:state', callback);
      return () => ipcRenderer.removeListener('camera-shadow:state', callback);
    },
    beginExport: (options) => ipcRenderer.invoke('export:begin', options),
    writeExportChunk: (payload) => ipcRenderer.invoke('export:write', payload),
    finalizeExport: (jobId) => ipcRenderer.invoke('export:finalize', { jobId }),
    abortExport: (jobId) => ipcRenderer.invoke('export:abort', { jobId }),
    openFile: (path) => ipcRenderer.invoke('export:open-file', { path }),
    showItemInFolder: (path) => ipcRenderer.invoke('export:show-in-folder', { path }),
    getUpdateState: () => ipcRenderer.invoke('app-update:get-state'),
    checkForUpdates: () => ipcRenderer.invoke('app-update:check'),
    downloadUpdate: () => ipcRenderer.invoke('app-update:download'),
    quitAndInstallUpdate: () => ipcRenderer.invoke('app-update:quit-and-install'),
    openUpdateChangelog: () => ipcRenderer.invoke('app-update:open-changelog'),
    openDiscordInvite: () => ipcRenderer.invoke('community:open-discord'),
    openGithubRepository: () => ipcRenderer.invoke('community:open-github'),
    getGitHubStars: () => ipcRenderer.invoke('community:get-github-stars'),
    openOnboarding: () => ipcRenderer.invoke('onboarding:open'),
    closeOnboarding: () => ipcRenderer.invoke('onboarding:close'),
    completeOnboarding: () => ipcRenderer.invoke('onboarding:complete'),
    onUpdateState: (listener) => {
      const callback = (_event, state) => listener(state);
      ipcRenderer.on('app-update:state', callback);
      return () => ipcRenderer.removeListener('app-update:state', callback);
    },
  }),
);
