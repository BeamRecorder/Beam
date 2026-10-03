import type { CSSProperties } from 'vue';
import type { HtmlSceneSource } from '@beam/engine/html/html-types';
import type { HtmlPlaybackClock } from '@beam/runtime/html/html-playback-types';

export interface HtmlDomPreviewProps {
  preview: HtmlSceneSource;
  clock: HtmlPlaybackClock;
  bounds: CSSProperties;
  documentReady: boolean;
  documentError: string;
}
export interface HtmlDomPreviewMessage {
  channel: 'beam-html-preview';
  previewId: string;
  type: 'ready' | 'error';
  message?: string;
}
