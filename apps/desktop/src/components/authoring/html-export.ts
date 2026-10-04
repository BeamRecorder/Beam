import { capture } from '~/api/capture';
import type { ExportRequest } from '@beam/encoder/export-types';

/** Freeze provider identities with the render snapshot, before either encoder backend starts. */
export async function withHtmlFrameSources<T extends ExportRequest>(request: T): Promise<T> {
  const assets = request.snapshot.composition.assets.filter((asset) => asset.html);
  if (!assets.length) return request;
  const frameSources = await capture.getHtmlFrameSources(assets);
  return { ...request, frameSources };
}
