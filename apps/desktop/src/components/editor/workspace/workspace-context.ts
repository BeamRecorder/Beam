import { inject, provide } from 'vue';
import type { InjectionKey } from 'vue';
import type { EditorWorkspaceContext } from './workspace-types';

const editorWorkspace: InjectionKey<EditorWorkspaceContext> = Symbol('editor-workspace');
export function provideEditorWorkspace(workspace: EditorWorkspaceContext) {
  provide(editorWorkspace, workspace);
}
export function useEditorWorkspaceContext() {
  const workspace = inject(editorWorkspace);
  if (!workspace) throw new Error('Editor workspace components require their VideoEditor host.');
  return workspace;
}
