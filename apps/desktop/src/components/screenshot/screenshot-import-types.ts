import type { Ref } from 'vue';
import type { MediaAsset } from '@beam/engine';
export interface ScreenshotImageImportHost {
  projectId(): string | null;
  canImport(): boolean;
  generation(): number;
  busy: Ref<boolean>;
  beforeImport(): void;
  insert(asset: MediaAsset, generation: number): Promise<boolean>;
  fail(error: unknown): void;
}
