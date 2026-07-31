const { contextBridge, ipcRenderer } = require("electron");

const invoke = (command, payload) => ipcRenderer.invoke("capture:request", command, payload);

contextBridge.exposeInMainWorld(
  "capture",
  Object.freeze({
    discover: () => invoke("discover"),
    capabilities: () => invoke("capabilities"),
    permissions: () => invoke("permissions"),
    formats: (sourceId) => invoke("formats", { source: sourceId }),
    prepare: (config) => invoke("prepare", { config }),
    prepareRecording: (options = {}) => invoke("prepare-default-recording", { options }),
    startPreparedRecording: () => invoke("start-prepared-recording"),
    cancelPreparedRecording: () => invoke("cancel-prepared-recording"),
    startRecording: (options = {}) => invoke("start-default-recording", { options }),
    start: (config) => config ? invoke("start-recording", { config }) : invoke("start"),
    pause: () => invoke("pause"),
    resume: () => invoke("resume"),
    stop: () => invoke("stop"),
    status: () => invoke("status"),
    beginCameraSegment: (payload) => ipcRenderer.invoke("camera:begin-segment", payload),
    writeCameraSegment: (payload) => ipcRenderer.invoke("camera:write-segment", payload),
    finalizeCameraSegment: (payload) => ipcRenderer.invoke("camera:finalize-segment", payload),
    failCamera: (payload) => ipcRenderer.invoke("camera:fail", payload),
    beginMicrophoneSegment: (payload) => ipcRenderer.invoke("microphone:begin-segment", payload),
    writeMicrophoneSegment: (payload) => ipcRenderer.invoke("microphone:write-segment", payload),
    finalizeMicrophoneSegment: (payload) => ipcRenderer.invoke("microphone:finalize-segment", payload),
    failMicrophone: (payload) => ipcRenderer.invoke("microphone:fail", payload),
    beginSystemAudioSegment: (payload) => ipcRenderer.invoke("system-audio:begin-segment", payload),
    writeSystemAudioSegment: (payload) => ipcRenderer.invoke("system-audio:write-segment", payload),
    finalizeSystemAudioSegment: (payload) => ipcRenderer.invoke("system-audio:finalize-segment", payload),
    failSystemAudio: (payload) => ipcRenderer.invoke("system-audio:fail", payload),
    close: () => ipcRenderer.send("window:close"),
    minimize: () => ipcRenderer.send("window:minimize"),
    setWindowMode: (mode) => ipcRenderer.send("window:set-mode", mode),
    showHud: () => ipcRenderer.send("window:show-hud"),
    present: () => ipcRenderer.send("window:present"),
    maximize: () => ipcRenderer.send("window:maximize"),
    unmaximize: () => ipcRenderer.send("window:unmaximize"),
    toggleMaximize: () => ipcRenderer.send("window:toggleMaximize"),
    setPosition: (x, y) => ipcRenderer.send("window:setPosition", x, y),
    setSize: (width, height) => ipcRenderer.send("window:setSize", width, height),
    setSizeSmooth: (width, height) => ipcRenderer.send("window:setSizeSmooth", width, height),
    setInteractive: (value) => ipcRenderer.send("window:setInteractive", value),
    setRecorderTooltip: (visible) => ipcRenderer.invoke("window:set-recorder-tooltip", Boolean(visible)),
    dragStart: () => ipcRenderer.send("window:dragStart"),
    drag: () => ipcRenderer.send("window:drag"),
    getSources: (types) => ipcRenderer.invoke("window:getSources", types),
    selectScreenRegion: (options) => ipcRenderer.invoke("screen-region:select", options),
    showScreenRegionOverlay: (options) => ipcRenderer.send("screen-region:show", options),
    hideScreenRegionOverlay: () => ipcRenderer.send("screen-region:hide"),
    onScreenRegionConfigure: (listener) => {
      const callback = (_event, options) => listener(options);
      ipcRenderer.on("screen-region:configure", callback);
      return () => ipcRenderer.removeListener("screen-region:configure", callback);
    },
    confirmScreenRegion: (region) => ipcRenderer.send("screen-region:confirm", region),
    cancelScreenRegion: () => ipcRenderer.send("screen-region:cancel"),
    selectScreenRegion: (options) => ipcRenderer.invoke("screen-region:select", options),
    showScreenRegionOverlay: (options) => ipcRenderer.send("screen-region:show", options),
    hideScreenRegionOverlay: () => ipcRenderer.send("screen-region:hide"),
    onScreenRegionConfigure: (listener) => {
      const callback = (_event, options) => listener(options);
      ipcRenderer.on("screen-region:configure", callback);
      return () => ipcRenderer.removeListener("screen-region:configure", callback);
    },
    confirmScreenRegion: (region) => ipcRenderer.send("screen-region:confirm", region),
    cancelScreenRegion: () => ipcRenderer.send("screen-region:cancel"),
    getWindowBounds: () => ipcRenderer.invoke("window:bounds"),
    getPreferences: () => ipcRenderer.invoke("preferences:get"),
    updatePreferences: (patch) => ipcRenderer.invoke("preferences:update", patch),
    resetPreferences: (keys) => ipcRenderer.invoke("preferences:reset", keys),
    onPreferencesChanged: (listener) => {
      const callback = (_event, preferences) => listener(preferences);
      ipcRenderer.on("preferences:changed", callback);
      return () => ipcRenderer.removeListener("preferences:changed", callback);
    },
    onPreferenceShortcut: (listener) => {
      const callback = (_event, id) => listener(id);
      ipcRenderer.on("preferences:shortcut", callback);
      return () => ipcRenderer.removeListener("preferences:shortcut", callback);
    },
    setCountdown: (seconds) => ipcRenderer.send("countdown:set", seconds),
    onCountdown: (listener) => {
      const callback = (_event, seconds) => listener(seconds);
      ipcRenderer.on("countdown:state", callback);
      return () => ipcRenderer.removeListener("countdown:state", callback);
    },
    listProjects: () => ipcRenderer.invoke("projects:list"),
    projectMediaUrl: (source) => ipcRenderer.invoke("projects:media-url", { source }),
    getProjectEditorData: (projectId) => ipcRenderer.invoke("projects:editor-data", { projectId }),
    getProjectEditorState: (projectId) => ipcRenderer.invoke("projects:editor-state", { projectId }),
    saveProjectEditorState: (projectId, state) => ipcRenderer.invoke("projects:save-editor-state", { projectId, state }),
    pickProjectMedia: (projectId, kind) => ipcRenderer.invoke("projects:pick-media", { projectId, kind }),
    listBackgroundLibrary: () => ipcRenderer.invoke("background-library:list"),
    pickBackgroundLibraryMedia: (kind = "media") => ipcRenderer.invoke("background-library:pick-import", { kind }),
    onBackgroundLibraryChanged: (listener) => {
      const callback = () => listener();
      ipcRenderer.on("background-library:changed", callback);
      return () => ipcRenderer.removeListener("background-library:changed", callback);
    },
    createProject: (options = {}) => ipcRenderer.invoke("projects:create", options),
    renameProject: (projectId, name) => ipcRenderer.invoke("projects:rename", { projectId, name }),
    saveProjectThumbnail: (projectId, dataUrl) => ipcRenderer.invoke("projects:save-thumbnail", { projectId, dataUrl }),
    deleteProject: (projectId) => ipcRenderer.invoke("projects:delete", { projectId }),
    whisperModels: () => ipcRenderer.invoke("whisper:models"),
    downloadWhisperModel: (modelId) => ipcRenderer.invoke("whisper:download", { modelId }),
    onWhisperProgress: (listener) => {
      const callback = (_event, progress) => listener(progress);
      ipcRenderer.on("whisper:progress", callback);
      return () => ipcRenderer.removeListener("whisper:progress", callback);
    },
    configureCameraOverlay: (state) => ipcRenderer.send("camera-overlay:configure", state),
    setCameraOverlayActive: (active) => ipcRenderer.send("camera-overlay:set-active", Boolean(active)),
    getCameraOverlayState: () => ipcRenderer.invoke("camera-overlay:state"),
    onCameraOverlayState: (listener) => {
      const callback = (_event, state) => listener(state);
      ipcRenderer.on("camera-overlay:state", callback);
      return () => ipcRenderer.removeListener("camera-overlay:state", callback);
    },
    onCameraOverlayHover: (listener) => {
      const callback = (_event, hovered) => listener(hovered);
      ipcRenderer.on("camera-overlay:hover", callback);
      return () => ipcRenderer.removeListener("camera-overlay:hover", callback);
    },
    onCameraShadow: (listener) => {
      const callback = (_event, state) => listener(state);
      ipcRenderer.on("camera-shadow:state", callback);
      return () => ipcRenderer.removeListener("camera-shadow:state", callback);
    },
    beginExport: (options) => ipcRenderer.invoke("export:begin", options),
    writeExportChunk: (payload) => ipcRenderer.invoke("export:write", payload),
    finalizeExport: (jobId) => ipcRenderer.invoke("export:finalize", { jobId }),
    abortExport: (jobId) => ipcRenderer.invoke("export:abort", { jobId }),
    openFile: (path) => ipcRenderer.invoke("export:open-file", { path }),
    showItemInFolder: (path) => ipcRenderer.invoke("export:show-in-folder", { path }),
    getUpdateState: () => ipcRenderer.invoke("app-update:get-state"),
    checkForUpdates: () => ipcRenderer.invoke("app-update:check"),
    downloadUpdate: () => ipcRenderer.invoke("app-update:download"),
    quitAndInstallUpdate: () => ipcRenderer.invoke("app-update:quit-and-install"),
    openUpdateChangelog: () => ipcRenderer.invoke("app-update:open-changelog"),
    onUpdateState: (listener) => {
      const callback = (_event, state) => listener(state);
      ipcRenderer.on("app-update:state", callback);
      return () => ipcRenderer.removeListener("app-update:state", callback);
    },
  }),
);
