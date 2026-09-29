import { createEffect, createSignal } from 'solid-js';
import { InputField, Switch } from '@argui/widgets/solid';
import { Button } from '../../shared/base-ui/button';
import { Select } from '../../shared/base-ui/select';
import { useTR } from '../../shared/i18n';
import type { EditorState } from '../shared/useEditor';
import { defaultTitle } from '../shared/defaults';
import type { Title } from '../shared/editorTypes';
import { NumberField, PropertyRow, PropertySection } from './PropertyRow';

/** Native GES title properties are saved as one undoable title edit. */
export function TitleControls(props: { editor: EditorState }) {
  const TR = useTR('NativeEditor'), [draft, setDraft] = createSignal<Title>(defaultTitle);
  const [color, setColor] = createSignal('FFFFFF');
  createEffect(() => {
    const title = props.editor.clip()?.title ?? defaultTitle; setDraft(title);
    setColor((title.color & 0xffffff).toString(16).padStart(6, '0').toUpperCase());
  });
  const set = <K extends keyof Title>(key: K, value: Title[K]) => setDraft(current => ({ ...current, [key]: value }));
  const valid = () => draft().text.trim().length > 0 && draft().text.length <= 4096 && /^[0-9a-f]{6}$/i.test(color());
  function apply() {
    if (!valid() || !props.editor.clip()?.title) return;
    void props.editor.edit({ type: 'title', id: props.editor.clip()!.id,
      title: { ...draft(), color: (0xff000000 + parseInt(color(), 16)) >>> 0 } });
  }
  return <PropertySection label={TR('text')}>
    <InputField accessibleName={TR('titleContent')} value={draft().text} onValueChange={value => set('text', value)} onSubmit={apply} />
    <PropertyRow label={TR('font')}><Select label={TR('font')} value={draft().font}
      options={['Sans', 'Serif', 'Monospace'].map(value => ({ value, label: value }))} onValueChange={value => set('font', value)} /></PropertyRow>
    <PropertyRow label={TR('fontSize')}><NumberField label={TR('fontSize')} value={draft().size} min={0.1} max={30} onChange={value => set('size', value)} /></PropertyRow>
    <PropertyRow label={TR('bold')}><Switch accessibleName={TR('bold')} value={draft().bold} onValueChange={value => set('bold', value)} /></PropertyRow>
    <PropertyRow label={TR('italic')}><Switch accessibleName={TR('italic')} value={draft().italic} onValueChange={value => set('italic', value)} /></PropertyRow>
    <PropertyRow label={TR('color')}><InputField accessibleName={TR('color')} value={color()} onValueChange={setColor} invalid={!/^[0-9a-f]{6}$/i.test(color())} onSubmit={apply} /></PropertyRow>
    <PropertyRow label={TR('shadow')}><Switch accessibleName={TR('shadow')} value={draft().shadow} onValueChange={value => set('shadow', value)} /></PropertyRow>
    <PropertyRow label={TR('background')}><Switch accessibleName={TR('background')} value={draft().background} onValueChange={value => set('background', value)} /></PropertyRow>
    <Button variant="secondary" width="100%" disabled={!valid() || props.editor.busy()} onClick={apply}>{TR('applyTitle')}</Button>
  </PropertySection>;
}
