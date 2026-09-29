import type { ApplicationServices } from '@argui/host';
import type { Edit, ExportStatus, Frame, Snapshot, Transport, PreviewQuality } from './editorTypes';
import type { VisualLease, VisualRequest } from '../media/visualTypes';

/** Project paths and export destinations are chosen entirely by the Rust host. */
export class EditorApi {
  constructor(private readonly services: ApplicationServices) {}
  bootstrap(): Promise<Snapshot> {
    return this.services.call('editor', 'bootstrap');
  }
  create(): Promise<Snapshot> {
    return this.services.call('editor', 'new');
  }
  open(): Promise<Snapshot> {
    return this.services.call('editor', 'open');
  }
  import(): Promise<Snapshot> {
    return this.services.call('editor', 'import');
  }
  edit(revision: number, edit: Edit): Promise<Snapshot> {
    return this.services.call('editor', 'edit', { revision, edit });
  }
  snapshot(): Promise<Snapshot> {
    return this.services.call('editor', 'snapshot');
  }
  retry(): Promise<Snapshot> {
    return this.services.call('editor', 'retry');
  }
  seek(positionMs: number): Promise<Transport> {
    return this.services.call('editor', 'seek', { positionMs });
  }
  play(playing: boolean): Promise<Transport> {
    return this.services.call('editor', 'play', { playing });
  }
  frame(): Promise<Frame> {
    return this.services.call('editor', 'frame');
  }
  quality(quality: PreviewQuality): Promise<Snapshot> { return this.services.call('editor', 'quality', { quality }); }
  acquireVisual(projectId: string, assetId: string, request: VisualRequest): Promise<VisualLease> {
    return this.services.call('editor', 'acquireVisual', { projectId, assetId, request });
  }
  releaseVisual(key: string): Promise<void> { return this.services.call('editor', 'releaseVisual', { key }); }
  onVisual(listener: (value: VisualLease) => void): () => void {
    return this.services.onEvent(value => {
      const event: unknown = value;
      if (event && typeof event === 'object' && 'type' in event && event.type === 'sourceVisual' && 'visual' in event) {
        const visual = event.visual;
        if (visual && typeof visual === 'object' && 'key' in visual && typeof visual.key === 'string'
          && 'canvasId' in visual && typeof visual.canvasId === 'number' && 'status' in visual
          && ['loading', 'ready', 'failed'].includes(String(visual.status)) && 'error' in visual
          && (visual.error === null || typeof visual.error === 'string')) listener(visual as VisualLease);
      }
    });
  }
  export(container: 'mp4' | 'webm'): Promise<ExportStatus> {
    return this.services.call('editor', 'export', { container });
  }
  exportStatus(): Promise<ExportStatus> {
    return this.services.call('editor', 'exportStatus');
  }
  cancelExport(): Promise<void> {
    return this.services.call('editor', 'cancelExport');
  }
}
