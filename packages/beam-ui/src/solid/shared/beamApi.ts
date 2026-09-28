import type { ApplicationServices, AssetRef } from '@argui/host'
import type { ApplicationInfo, AuxiliaryWindow, BeamEvent, BeamPreferences, BeamUiState, CaptureRequest, InputAccessStatus, MonitorInfo, RecordingStatus, RegionColors, RegionSnapshot, ResizeDirection, SourceCatalog, WindowChoice } from './beamTypes'
import type { TeleprompterDocument } from '../teleprompter/teleprompterTypes'
import type { UpdateSnapshot } from './settings/updateTypes'

/** Narrow native boundary shared by the Beam Solid views. */
export class BeamApi {
  constructor(private readonly services: ApplicationServices, private readonly window = 'main') {}

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
  inputAccessStatus(): Promise<InputAccessStatus> { return this.services.call('beam', 'inputAccessStatus') }
  requestInputAccess(): Promise<InputAccessStatus> { return this.services.call('beam', 'requestInputAccess') }
  prepare(request: CaptureRequest): Promise<RecordingStatus> { return this.services.call('beam', 'prepare', request) }
  start(): Promise<RecordingStatus> { return this.services.call('beam', 'start') }
  pause(): Promise<RecordingStatus> { return this.services.call('beam', 'pause') }
  resume(): Promise<RecordingStatus> { return this.services.call('beam', 'resume') }
  stop(): Promise<RecordingStatus> { return this.services.call('beam', 'stop') }
  cancel(): Promise<RecordingStatus> { return this.services.call('beam', 'cancel') }
  status(): Promise<RecordingStatus> { return this.services.call('beam', 'status') }
  screenshot(request: CaptureRequest): Promise<{ projectId: string; path: string }> {
    return this.services.call('beam', 'screenshot', request)
  }
  async openSettings(): Promise<void> {
    await this.ensureWindow('settings')
    await this.services.call('windows', 'focusNamed', { window: 'settings' })
  }
  openEditor(projectId: string, mode: 'video' | 'screenshot'): Promise<void> {
    return this.services.call('beam', 'openEditor', { projectId, mode })
  }
  windowInfo(window = this.window) { return this.services.getWindowInfo(window) }
  hideWindow(window = this.window): Promise<void> { return this.services.call('windows', 'hide', { window }) }
  showWindow(window = this.window): Promise<void> { return this.services.showWindow(window) }
  closeWindow(window = this.window): Promise<void> { return this.services.closeWindow(window) }
  ensureWindow(window: AuxiliaryWindow): Promise<void> {
    return this.services.call('windows', 'ensureAuxiliary', { window })
  }
  dragWindow(window = this.window): Promise<void> { return this.services.call('windows', 'drag', { window }) }
  resizeWindow(direction: ResizeDirection, window = this.window): Promise<void> {
    return this.services.call('windows', 'resize', { window, direction })
  }
  minimizeWindow(window = this.window): Promise<void> { return this.services.call('windows', 'minimize', { window }) }
  monitors(): Promise<MonitorInfo[]> { return this.services.getMonitors(this.window) }
  shortcuts(shortcuts: Record<string, string>): Promise<void> {
    return this.services.setGlobalShortcuts(Object.entries(shortcuts).map(([id, accelerator]) => ({ id, accelerator })))
  }
  windowSize(width: number, height: number, window = this.window) { return this.services.setWindowSize(window, width, height) }
  windowPosition(x: number, y: number, window = this.window) { return this.services.setWindowPosition(window, x, y) }
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
  emitUiAction(action: 'regionSelected' | 'regionCanceled' | 'countdownCanceled' | 'pause' | 'stop' | 'delete', region?: CaptureRequest['region']): Promise<void> {
    return this.services.call('beamUi', 'emit', { action, region })
  }
  onEvent(listener: (event: BeamEvent) => void): () => void {
    return this.services.onEvent((event) => listener(event as BeamEvent))
  }
}
