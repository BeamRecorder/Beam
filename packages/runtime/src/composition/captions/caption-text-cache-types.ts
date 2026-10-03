import type { CaptionTextLayout, layoutCaptionText } from '@beam/engine/shared/caption-text-layout';

export type CaptionLayoutInput = Omit<Parameters<typeof layoutCaptionText>[0], 'measureText'>;

export interface CaptionTextCache {
  measure(text: string): number;
  layout(options: CaptionLayoutInput): CaptionTextLayout;
}

export interface CaptionTextCacheState extends CaptionTextCache {
  fontSet: FontFaceSet | undefined;
  faces: Array<readonly [FontFace, FontFace['status']]>;
  enabled: boolean;
  measures: Map<string, number>;
  layouts: Map<string, CaptionTextLayout>;
}
