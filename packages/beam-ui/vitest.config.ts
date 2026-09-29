import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  resolve: { conditions: ['browser'], dedupe: ['solid-js'] },
  ssr: { resolve: { conditions: ['browser'] } },
  test: {
    environment: 'node',
    include: ['src/solid/*.test.ts', 'src/solid/editor/**/*.test.ts', 'src/solid/hud/**/*.test.ts', 'src/solid/projects/**/*.test.ts', 'src/solid/shared/**/*.test.ts', 'src/solid/teleprompter/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: [
        'src/solid/editor/timeline/timelineModel.ts',
        'src/solid/editor/timeline/trackLayout.ts',
        'src/solid/editor/timeline/regionModel.ts',
        'src/solid/editor/timeline/timelineShortcut.ts',
        'src/solid/editor/shared/selectionModel.ts',
        'src/solid/editor/properties/instanceModel.ts',
        'src/solid/editor/properties/transitionModel.ts',
        'src/solid/editor/properties/presetModel.ts',
        'src/solid/editor/properties/definitionLabels.ts',
        'src/solid/editor/layout/workspaceLayout.ts',
        'src/solid/editor/media/libraryModel.ts',
        'src/solid/editor/video/timecode.ts',
        'src/solid/editor/shared/editorApi.ts',
        'src/solid/editor/shared/useEditor.ts',
      ],
      thresholds: { statements: 90, branches: 90, functions: 90, lines: 90 },
    },
  },
});
