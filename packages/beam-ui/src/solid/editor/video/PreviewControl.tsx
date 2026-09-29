import { untrack } from 'solid-js';
import type { PreviewControlProps } from './previewTypes';

/** Native container rules remove optional controls from a narrow preview without JS resize work. */
export function PreviewControl(props: PreviewControlProps) {
  const content = untrack(() => props.children);
  return <container width={props.width} height={28} shrink={0} minWidth={0} clip
    containerRules={[{ scope: 'editor-preview-controls', when: { maxWidth: props.minimumWidth }, style: { width: 0, height: 0 } }]}>
    {content}
  </container>;
}
