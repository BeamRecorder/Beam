import type { ClipAppearance } from '@beam/engine/shared/composition-types';

export type BorderAndFrameSettings = Partial<
  Pick<
    ClipAppearance,
    | 'borderEnabled'
    | 'borderColor'
    | 'borderWidth'
    | 'frame'
    | 'frameTitle'
    | 'frameColor'
    | 'frameTheme'
    | 'frameShowMenu'
    | 'frameShowScrollbars'
    | 'frameChromeScale'
    | 'phoneFrameFill'
    | 'animatedFrame'
  >
>;
