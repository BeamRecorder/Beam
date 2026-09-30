export type SourcePickerKind = 'screen' | 'window';
export type DevelopmentArtwork = 'browser' | 'code' | 'design' | 'chat' | 'terminal' | 'video' | 'document' | 'desktop';

export interface SourcePickerSource {
  id: string;
  kind: SourcePickerKind;
  name: string;
  app: string;
  detail: string;
  artwork?: DevelopmentArtwork;
  aspect: number;
  wallpaper?: string;
  thumbnail?: string | null;
  appIcon?: string | null;
  displayId?: string;
  bounds?: { x: number; y: number; width: number; height: number };
}

export interface SourcePickerState {
  kind: SourcePickerKind;
  highlightedId: string | null;
  selectedId: string | null;
  sources: SourcePickerSource[];
  development: boolean;
  error: string | null;
}

export type SourcePickerAction =
  | { type: 'hover'; id: string | null }
  | { type: 'select'; id: string }
  | { type: 'kind'; kind: SourcePickerKind }
  | { type: 'confirm' | 'cancel' };

export interface SourcePickerSelection {
  id: string;
  kind: SourcePickerKind;
  development: boolean;
  source: SourcePickerSource;
}

export interface SourcePickerApi {
  readonly devCrossplatform: boolean;
  selectCaptureSource(kind: SourcePickerKind): Promise<SourcePickerSelection | null>;
  sourcePickerAction(action: SourcePickerAction): void;
  notifySourcePickerReady(): void;
  onSourcePickerState(listener: (state: SourcePickerState) => void): () => void;
}
