export type CursorPackSource = 'builtin' | 'imported';
export type CursorPackColorMode = 'tintable' | 'original';

export interface CursorPoint {
  x: number;
  y: number;
}

export interface CursorAssetDescriptor {
  id: string;
  label: string;
  url: string;
  format?: 'svg' | 'png';
  intrinsicSize: { width: number; height: number };
  nominalSize: number;
  hotspot: CursorPoint;
}

export interface CursorPackDescriptor {
  id: string;
  name: string;
  source: CursorPackSource;
  colorMode: CursorPackColorMode;
  defaultCursorId: string;
  cursors: CursorAssetDescriptor[];
  automaticMap: Record<string, string>;
}

export interface CursorSelection {
  packId: string;
  mode: 'automatic' | 'fixed';
  cursorId: string | null;
}

export interface CursorPackImportResult {
  pack: CursorPackDescriptor;
  importedCount: number;
  ignoredAnimatedRoles: string[];
  duplicate: boolean;
}
