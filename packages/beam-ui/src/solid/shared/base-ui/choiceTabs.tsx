import { Tabs } from './tabs';

/** Concat's 28 px segmented field: neutral labels and a thumb inset by exactly 3 px. */
export function ChoiceTabs<T extends string>(props: {
  id: string; label: string; width: number; value: T;
  options: readonly { id: T; label: string }[]; onChange: (value: T) => void;
}) {
  return <Tabs {...props} height={28} />;
}
