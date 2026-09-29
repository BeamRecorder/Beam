import { SegmentedControl } from '../../shared/base-ui/segmentedControl';
import type { SegmentOption } from '../../shared/base-ui/segmentedControlTypes';
import { useTR } from '../../shared/i18n';
import type { LibraryPage } from './libraryTypes';

const tabs: readonly Omit<SegmentOption<LibraryPage>, 'label'>[] = [
  { id: 'media', icon: 'film' }, { id: 'text', icon: 'type' },
  { id: 'transitions', icon: 'link' }, { id: 'effects', icon: 'sparkles' },
  { id: 'filters', icon: 'blend' }, { id: 'templates', icon: 'panels-top-left' },
];

/** Library pages share the recorder's animated control and native icon-only threshold. */
export function LibraryTabs(props: { value: LibraryPage; onChange: (page: LibraryPage) => void }) {
  const TR = useTR('NativeEditor');
  return <SegmentedControl id="editor-library" label={TR('libraryPages')}
    width="100%" height={44} labelMinimumWidth={76} value={props.value}
    options={tabs.map(tab => ({ ...tab, label: TR(tab.id) }))} onChange={props.onChange} />;
}
