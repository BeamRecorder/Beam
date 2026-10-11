export interface ExportMorphRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface ExportMorphSource extends ExportMorphRect {
  snapshot?: HTMLElement;
}

export interface ExportStatusPillProps {
  state: 'working' | 'completed' | 'failed';
  kind?: 'video' | 'image';
  name: string;
  format: string;
  progress?: number | null;
  stageLabel?: string;
  detail?: string;
  filePath?: string | null;
  preview?: string | null;
  error?: string | null;
  report?: string;
  morphFrom?: ExportMorphSource | null;
}
