import type { ClipFrame } from '@beam/engine/shared/composition-types';
import { ANIMATED_FRAME_PRESETS } from '@beam/engine/shared/animated-frame-schema';
import { resolvePublicAssetUrl } from '~/utils/public-asset';
import type { SelectOption } from '~/ui/select/select-types';

export const FRAME_MODELS = [
  'safari',
  'windows-95',
  'animated',
  'iphone-16-max',
  'pixel-9-pro',
] as const satisfies readonly ClipFrame[];
const modelLabels = {
  safari: 'Safari',
  'windows-95': 'Windows 95',
  'iphone-16-max': 'iPhone 16 Pro Max',
  'pixel-9-pro': 'Pixel 9 Pro',
};
const preview = (id: string) => resolvePublicAssetUrl(`./frame-previews/${id}.png`);

export const frameOptions = (animatedLabel: string): SelectOption[] =>
  FRAME_MODELS.map((value) => ({
    value,
    label: value === 'animated' ? animatedLabel : modelLabels[value],
    thumbnail: preview(value),
  }));

export const animatedFrameOptions = (translate: (key: string) => string): SelectOption[] =>
  ANIMATED_FRAME_PRESETS.map((value) => ({ value, label: translate(value), thumbnail: preview(value) }));
