import type { MediaAsset, VisualClip } from '../shared/composition-types';

/** Persisted source identity. Hosts own files, compilation and executable HTML. */
export interface HtmlComposition {
  version: 1;
  id: string;
  revision: string;
  entry: string;
  width: number;
  height: number;
  durationMs: number;
  fps: number;
  framework: 'html' | 'vue';
}

export interface HtmlSceneSource {
  clip: VisualClip;
  asset: MediaAsset;
  html: HtmlComposition;
}
