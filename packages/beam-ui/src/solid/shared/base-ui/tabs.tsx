import type { TabProps } from './tabTypes';
import { SegmentedControl } from './segmentedControl';

/** Navigation uses the recorder's segmented component with labels beside optional icons. */
export function Tabs<T extends string>(props: TabProps<T>) {
  return <SegmentedControl {...props} height={props.height ?? 32} labelLayout="beside" />;
}
