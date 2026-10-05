import type { MediaAsset, ClipComposition } from '@beam/engine/shared/composition-types';
import type { ProjectEditorState } from '~/api/types/capture-api';

export interface FakeWebcamPersistenceModules {
  normalizeComposition(value: ClipComposition): ClipComposition;
  createProjectStore(root: string): {
    create(options: { name: string }): { id: string };
    directoryFor(projectId: string): string;
    mediaFileForUrl(url: string): string;
    importEditorMedia(projectId: string, input: { kind: string; source: string }): MediaAsset;
    editorState(projectId: string): ProjectEditorState;
    saveEditorState(projectId: string, value: ProjectEditorState): ProjectEditorState;
  };
}
