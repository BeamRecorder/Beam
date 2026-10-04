import { getCurrentInstance, getCurrentScope, inject, onScopeDispose, provide, type InjectionKey } from 'vue';
import { capture } from '~/api/capture';
import { createEditorResources } from './editor-resources';
import type { EditorResources } from './editor-resource-types';

const key: InjectionKey<EditorResources> = Symbol('EditorResources');

export function useEditorResources(): EditorResources {
  const inherited = getCurrentInstance() ? inject(key, null) : null;
  if (inherited) return inherited;
  const resources = createEditorResources(capture);
  if (getCurrentInstance()) provide(key, resources);
  if (getCurrentScope()) onScopeDispose(resources.dispose);
  return resources;
}
