import type { CaptureProject } from '@beam/engine/capture/capture-session';

export interface ProjectCatalogRequest {
  limit?: number;
  query?: string;
  cursor?: string | null;
  force?: boolean;
}
export interface ProjectCatalogPage {
  projects: CaptureProject[];
  total: number;
  nextCursor: string | null;
  reset?: boolean;
}
