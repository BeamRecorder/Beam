export interface CaptionFontOption {
  value: string;
  label: string;
  assetId?: string;
  url?: string;
}

export type FontCatalogErrorCode =
  | 'fontLibraryReadFailed'
  | 'localFontsUnavailable'
  | 'localFontsPermissionDenied'
  | 'fontImportFailed'
  | 'fontLoadFailed';

export type LocalFontRecord = { family: string };
export type LocalFontWindow = Window & { queryLocalFonts?: () => Promise<LocalFontRecord[]> };
