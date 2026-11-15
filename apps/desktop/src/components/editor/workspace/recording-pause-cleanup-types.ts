import type { Ref } from 'vue';
import type { ClipComposition } from '@beam/engine/shared/composition-types';
import type { ZoomElement } from '@beam/engine/zoom/zoom-types';
import type { EditorStateSnapshot } from '../composables/editor-history-types';

export interface RecordingPauseCleanupOptions {
  projectId: () => string | null;
  sessionId: () => string | null;
  ready: () => boolean;
  fresh: () => boolean;
  presented: () => boolean;
  composition: Ref<ClipComposition>;
  zoomElements: Ref<ZoomElement[]>;
  snapshot: () => EditorStateSnapshot;
  commit: (snapshot: EditorStateSnapshot) => void;
  undo: () => Promise<void>;
  save: () => void;
}
