import type { CaptionStyle } from '@beam/engine/shared/composition-types';
import type { ElementText } from '@beam/engine/shared/element-types';

export interface ElementTextDefaults {
  style: Omit<CaptionStyle, 'customText'>;
  padding: ElementText['padding'];
  verticalAlign: ElementText['verticalAlign'];
}
