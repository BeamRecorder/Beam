import { resolvePublicAssetUrl } from '~/utils/public-asset';
import type { SelectOption } from '~/ui/select/select-types';
import type { SelectableRippleStyle } from './cursor-panel-types';

export const CLICK_RIPPLE_PRESETS = [
  'single',
  'double',
  'solid',
  'water',
] as const satisfies readonly SelectableRippleStyle[];
const labels = { single: 'presetSingle', double: 'presetDouble', solid: 'presetSolid', water: 'presetWater' };

export const cursorClickOptions = (translate: (key: string) => string): SelectOption[] =>
  CLICK_RIPPLE_PRESETS.map((value) => ({
    value,
    label: translate(labels[value]),
    thumbnail: resolvePublicAssetUrl(`./click-previews/${value}.png`),
  }));
