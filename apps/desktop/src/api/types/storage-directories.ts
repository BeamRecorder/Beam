export type DirectoryKind = 'projects' | 'exports';
export interface DirectorySettings {
  projects: { directory: string | null; recent: string[] };
  exports: { directory: string | null; lastDirectory: string | null; recent: string[] };
}
export interface DirectorySnapshot extends DirectorySettings {
  defaultProjectsDirectory: string;
  defaultExportDirectory: string;
}
export interface StorageDirectoryApi {
  getDirectories(): Promise<DirectorySnapshot>;
  chooseDirectory(kind: DirectoryKind): Promise<DirectorySnapshot | null>;
  selectDirectory(request: { kind: DirectoryKind; directory: string | null }): Promise<DirectorySnapshot>;
}
