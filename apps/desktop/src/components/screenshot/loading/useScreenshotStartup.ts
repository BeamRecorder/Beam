import { createScreenshotStartup } from './screenshot-startup';
import { injectScreenshotStartup, provideScreenshotStartup } from './screenshot-startup-context';
import { useEditorResources } from '../../editor/resources/useEditorResources';
import type { EditorResources } from '../../editor/resources/editor-resource-types';

export function useScreenshotStartup(resources?: EditorResources) {
  const startup = injectScreenshotStartup() ?? createScreenshotStartup(resources ?? useEditorResources());
  provideScreenshotStartup(startup);
  return startup;
}
