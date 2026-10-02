import { capture } from '~/api/capture';
import type { MediaAsset } from '@beam/engine';
import type { ScreenshotImageImportHost } from './screenshot-import-types';

export function useScreenshotImageImport(host: ScreenshotImageImportHost) {
  return async (source: (projectId: string) => Promise<MediaAsset | null>) => {
    const projectId = host.projectId();
    if (!projectId || !host.canImport()) return;
    host.beforeImport();
    host.busy.value = true;
    const current = host.generation();
    let importedSource: string | undefined,
      inserted = false;
    try {
      const asset = await source(projectId);
      importedSource = asset?.src;
      if (!asset || current !== host.generation()) return;
      inserted = await host.insert(asset, current);
    } catch (error) {
      host.fail(error);
    } finally {
      if (importedSource && !inserted) await capture.discardScreenshotImage(projectId, importedSource).catch(host.fail);
      host.busy.value = false;
    }
  };
}
