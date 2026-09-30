export interface StartupShell {
  fail(): void;
  settle(): void;
  dispose(): void;
}
export interface StartupPortrait {
  settle(): void;
  dispose(): void;
}
