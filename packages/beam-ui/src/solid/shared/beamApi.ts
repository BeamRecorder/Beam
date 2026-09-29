import type { ApplicationServices, AssetRef } from '@argui/host'
import type { ApplicationInfo, AuxiliaryWindow, BeamEvent, BeamPreferences, BeamUiState, CaptureRequest, DesktopCapabilities, InputAccessStatus, MonitorInfo, NativeProjectSummary, RecordingStatus, RegionColors, RegionSnapshot, ResizeDirection, SourceCatalog, WindowChoice } from './beamTypes'
import type { TeleprompterDocument } from '../teleprompter/teleprompterTypes'
import type { UpdateSnapshot } from './settings/updateTypes'
import { monitorForWindow, windowPosition } from './windowPlacement'
import type { AudioLevels, AudioPreviewRequest, WindowPosition } from './beamTypes'

/** Narrow native boundary shared by the Beam Solid views. */
export class BeamApi {
  private readonly movedWindows = new Set<string>()
  private readonly positionWrites = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly pendingPositions = new Map<string, WindowPosition>()
  private meterRevision = Date.now() * 1024
  constructor(private readonly services: ApplicationServices, readonly window = 'main') {}

  preferences(): Promise<BeamPreferences> { return this.services.call('beam', 'preferences') }
  info(): Promise<ApplicationInfo> { return this.services.call('beam', 'info') }
  updateState(): Promise<UpdateSnapshot> { return this.services.call('updates', 'state') }
  checkUpdates(): Promise<UpdateSnapshot> { return this.services.call('updates', 'check') }
  downloadUpdate(): Promise<UpdateSnapshot> { return this.services.call('updates', 'download') }
  cancelUpdate(): Promise<UpdateSnapshot> { return this.services.call('updates', 'cancel') }
  installUpdate(): Promise<UpdateSnapshot> { return this.services.call('updates', 'install') }
  copyText(text: string): Promise<void> { return this.services.writeClipboardText(text) }
  openRegion(): Promise<void> { return this.services.call('region', 'open') }
  regionState(): Promise<RegionSnapshot> { return this.services.call('region', 'state') }
  presentRegion(revision: number): Promise<void> { return this.services.call('region', 'present', { revision }) }
  regionPreset(value: string): Promise<void> { return this.services.call('region', 'preset', { value }) }
  regionColors(colors: RegionColors): Promise<void> { return this.services.call('region', 'colors', colors) }
  confirmRegion(): Promise<void> { return this.services.call('region', 'confirm') }
  cancelRegion(): Promise<void> { return this.services.call('region', 'cancel') }
  savePreferences(patch: Record<string, unknown>): Promise<BeamPreferences> {
    return this.services.call('beam', 'savePreferences', patch)
  }
  sources(): Promise<SourceCatalog> { return this.services.call('beam', 'sources') }
  desktopCapabilities(): Promise<DesktopCapabilities> { return this.services.call('beam', 'desktopCapabilities') }
  inputAccessStatus(): Promise<InputAccessStatus> { return this.services.call('beam', 'inputAccessStatus') }
  requestInputAccess(): Promise<InputAccessStatus> { return this.services.call('beam', 'requestInputAccess') }
  prepare(request: CaptureRequest): Promise<RecordingStatus> { return this.services.call('beam', 'prepare', request) }
  start(): Promise<RecordingStatus> { return this.services.call('beam', 'start') }
  pause(): Promise<RecordingStatus> { return this.services.call('beam', 'pause') }
  resume(): Promise<RecordingStatus> { return this.services.call('beam', 'resume') }
  reset(): Promise<RecordingStatus> { return this.services.call('beam', 'reset') }
  stop(): Promise<RecordingStatus> { return this.services.call('beam', 'stop') }
  cancel(): Promise<RecordingStatus> { return this.services.call('beam', 'cancel') }
  status(): Promise<RecordingStatus> { return this.services.call('beam', 'status') }
  audioLevels(): Promise<AudioLevels> { return this.services.call('beam', 'audioLevels') }
  audioPreview(request: AudioPreviewRequest): Promise<AudioLevels> {
    // Retained scenes were created at different times. Renew the timestamp on
    // every request so returning to an older scene cannot leave its meter stale.
    this.meterRevision = Math.max(this.meterRevision + 1, Date.now() * 1024)
    return this.services.call('beam', 'audioPreview', { ...request, revision: this.meterRevision })
  }
  screenshot(request: CaptureRequest): Promise<{ projectId: string; path: string }> {
    return this.services.call('beam', 'screenshot', request)
  }
  async openSettings(): Promise<void> {
    await this.ensureWindow('settings')
    await this.services.call('windows', 'focusNamed', { window: 'settings' })
  }
  openVideoEditor(): Promise<void> { return this.services.call('beam', 'openVideoEditor') }
  listProjects(): Promise<NativeProjectSummary[]> { return this.services.call('beam', 'listProjects') }
  projectThumbnail(id: string): Promise<AssetRef | null> { return this.services.call('beam', 'projectThumbnail', { id }) }
  async openProjects(): Promise<void> {
    await this.ensureWindow('projects')
    await this.services.call('windows', 'focusNamed', { window: 'projects' })
  }
  openEditor(projectId: string, mode: 'video' | 'screenshot'): Promise<void> {
    return this.services.call('beam', 'openEditor', { projectId, mode })
  }
  cancelEditorOpen(): Promise<void> { return this.services.call('beam', 'cancelEditorOpen') }
  editorStartup(error?: string): Promise<void> { return this.services.call('beam', 'editorStartup', error ? { error } : {}) }
  windowInfo(window = this.window) { return this.services.getWindowInfo(window) }
  async hideWindow(window = this.window): Promise<void> {
    this.movedWindows.delete(window)
    await this.flushPosition(window).catch(console.error)
    await this.services.call('windows', 'hide', { window })
  }
  showWindow(window = this.window): Promise<void> { return this.services.showWindow(window) }
  closeWindow(window = this.window): Promise<void> { return this.services.closeWindow(window) }
  async ensureWindow(window: AuxiliaryWindow): Promise<void> {
    await this.services.call('windows', 'ensureAuxiliary', { window })
    if (window !== 'settings' && window !== 'teleprompter' && window !== 'projects') return
    const saved = (await this.preferences()).windowPositions?.[window]
    if (!saved && window !== 'projects') return
    const info = await this.windowInfo(window)
    if (!info.capabilities.absolutePosition) return
    const monitors = await this.monitors(), monitor = monitorForWindow(monitors, info)
    if (!monitor) return
    const position = windowPosition(monitors, monitor, info.width, info.height, saved, false,
      info.capabilities.backend === 'x11' ? info.scaleFactor : undefined)
    await this.windowPosition(position.x, position.y, window)
  }
  dragWindow(window = this.window): Promise<void> {
    if (['recorder', 'countdown', 'settings', 'teleprompter', 'projects', 'regionActions'].includes(window)) this.movedWindows.add(window)
    return this.services.call<void>('windows', 'drag', { window }).catch(cause => {
      this.movedWindows.delete(window)
      throw cause
    })
  }
  focusWindow(window = this.window): Promise<void> { return this.services.call('windows', 'focusNamed', { window }) }
  resizeWindow(direction: ResizeDirection, window = this.window): Promise<void> {
    return this.services.call('windows', 'resize', { window, direction })
  }
  minimizeWindow(window = this.window): Promise<void> { return this.services.call('windows', 'minimize', { window }) }
  monitors(): Promise<MonitorInfo[]> { return this.services.getMonitors(this.window) }
  shortcuts(shortcuts: Record<string, string>): Promise<void> {
    return this.services.setGlobalShortcuts(Object.entries(shortcuts).map(([id, accelerator]) => ({ id, accelerator })))
  }
  windowSize(width: number, height: number, window = this.window) { return this.services.setWindowSize(window, width, height) }
  async windowPosition(x: number, y: number, window = this.window): Promise<void> {
    this.movedWindows.delete(window)
    await this.flushPosition(window).catch(console.error)
    await this.services.setWindowPosition(window, x, y)
  }
  measure(element: string): Promise<{ width: number; height: number }> {
    return this.services.call('windows', 'measure', { window: this.window, element })
  }
  windowLevel(level: 'normal' | 'top', window = this.window) { return this.services.setWindowLevel(window, level) }
  async openTeleprompter(): Promise<void> {
    await this.ensureWindow('teleprompter')
    await this.services.call('windows', 'focusNamed', { window: 'teleprompter' })
  }
  async toggleTeleprompter(): Promise<void> {
    await this.ensureWindow('teleprompter')
    const info = await this.windowInfo('teleprompter')
    if (info.visible) await this.hideWindow('teleprompter'); else await this.openTeleprompter()
  }
  readTeleprompter(): Promise<TeleprompterDocument> { return this.services.call('teleprompter', 'read') }
  writeTeleprompter(document: TeleprompterDocument): Promise<void> { return this.services.call('teleprompter', 'write', document) }
  openWindowPicker(monitor: MonitorInfo): Promise<void> { return this.services.call('windowPicker', 'open', monitor) }
  windowChoices(): Promise<WindowChoice[]> { return this.services.call('windowPicker', 'choices') }
  windowThumbnail(id: string, generation: number): Promise<AssetRef> { return this.services.call('windowPicker', 'thumbnail', { id, generation }) }
  previewWindow(id: string, generation: number): Promise<void> { return this.services.call('windowPicker', 'preview', { id, generation }) }
  chooseWindow(id: string, generation: number): Promise<void> { return this.services.call('windowPicker', 'select', { id, generation }) }
  cancelWindowPicker(): Promise<void> { return this.services.call('windowPicker', 'cancel') }
  uiState(): Promise<BeamUiState> {
    return this.services.call('beamUi', 'state')
  }
  updateUiState(patch: Partial<BeamUiState>): Promise<void> {
    return this.services.call('beamUi', 'update', patch)
  }
  emitUiAction(action: 'regionSelected' | 'regionCanceled' | 'countdownCanceled' | 'preparationRecord' | 'preparationCanceled' | 'pause' | 'reset' | 'stop' | 'delete' | 'editorLoadingCanceled', region?: CaptureRequest['region']): Promise<void> {
    return this.services.call('beamUi', 'emit', { action, region })
  }
  private async flushPosition(window: string): Promise<void> {
    clearTimeout(this.positionWrites.get(window))
    this.positionWrites.delete(window)
    const position = this.pendingPositions.get(window)
    this.pendingPositions.delete(window)
    if (position) await this.savePreferences({ windowPositions: { [window]: position } })
  }
  onEvent(listener: (event: BeamEvent) => void): () => void {
    return this.services.onEvent(value => {
      const event = value as BeamEvent
      if (event.type === 'windowVisibility' && event.window && event.visible === false) {
        this.movedWindows.delete(event.window)
        void this.flushPosition(event.window).catch(console.error)
      }
      if (event.type === 'windowMoved' && event.window && this.movedWindows.has(event.window)
        && event.x !== undefined && event.y !== undefined) {
        const window = event.window, x = event.x, y = event.y
        this.pendingPositions.set(window, { x, y })
        clearTimeout(this.positionWrites.get(window))
        this.positionWrites.set(window, setTimeout(() => {
          void this.flushPosition(window).catch(console.error)
        }, 150))
      }
      listener(event)
    })
  }
}
