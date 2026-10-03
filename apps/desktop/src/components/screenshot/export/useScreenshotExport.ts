import { onBeforeUnmount } from 'vue';
import { createScreenshotExporter } from './screenshot-export-cache';

export function useScreenshotExport() {
  const exporter = createScreenshotExporter();
  onBeforeUnmount(exporter.dispose);
  return exporter.encode;
}
