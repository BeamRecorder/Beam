import { For, Show, createMemo, createSignal } from 'solid-js';
import { useTheme } from '@argui/solid';
import { InputField, Popover, type WidgetTheme } from '@argui/widgets/solid';
import { Button } from '../../shared/base-ui/button';
import { Icon } from '../../shared/base-ui/icon';
import { useTR } from '../../shared/i18n';
import { Panel } from '../shared/Panel';
import type { EditorState } from '../shared/useEditor';
import type { Asset } from '../shared/editorTypes';
import { Splitter } from '../layout/Splitter';
import { sidebarWidth } from '../layout/workspaceLayout';
import { LibraryTabs } from './LibraryTabs';
import { SourceThumbnail } from './SourceThumbnail';
import { LibraryShelf } from './LibraryShelf';
import { insertion, mediaFor } from './libraryModel';
import type { LibraryPage, MediaFilter } from './libraryTypes';

/** Concat's tab strip, category sidebar and responsive grid of real source artwork. */
export function MediaLibrary(props: { editor: EditorState; width: number; height: number }) {
  const theme = useTheme<WidgetTheme>(), TR = useTR('NativeEditor');
  const [page, setPage] = createSignal<LibraryPage>('media'), [filter, setFilter] = createSignal<MediaFilter>('all');
  const [sidebar, setSidebar] = createSignal(104), [query, setQuery] = createSignal('');
  const [scroll, setScroll] = createSignal(0);
  const [list, setList] = createSignal(false), [sort, setSort] = createSignal(false);
  const [mediaOpen, setMediaOpen] = createSignal(true), [generatedOpen, setGeneratedOpen] = createSignal(true);
  const all = () => props.editor.snapshot()?.project.assets ?? [];
  const assets = createMemo(() => {
    const assets = mediaFor(all(), filter(), query());
    return sort() ? assets.sort((a, b) => a.name.localeCompare(b.name)) : assets;
  });
  const side = () => sidebarWidth(props.width, sidebar());
  const contentWidth = () => Math.max(0, props.width - side() - 17);
  const columns = () => list() ? 1 : Math.max(1, Math.floor((contentWidth() + 8) / 96));
  const cardWidth = () => (contentWidth() - (columns() - 1) * 8) / columns();
  const cardHeight = () => list() ? 48 : cardWidth() * 9 / 16 + 22;
  const first = () => Math.max(0, Math.min(Math.ceil(assets().length / columns()) - 1, Math.floor(scroll() / (cardHeight() + 8)) - 1)) * columns();
  const visible = createMemo(() => assets().slice(first(), first() + (Math.ceil(Math.max(0, props.height - 106) / (cardHeight() + 8)) + 3) * columns()));
  function insert(asset: Asset) {
    const project = props.editor.snapshot()?.project;
    const at = project && insertion(project, asset);
    if (at) void props.editor.edit({ type: 'insert', assetId: asset.id, ...at });
  }
  function category(id: MediaFilter, label: string) {
    return <Button variant="ghost" size="xs" width="100%" contentAlign="start" pressed={filter() === id}
      onClick={() => setFilter(id)}>
      <row width="100%" alignItems="center" padding={{ start: 10, end: 2 }}>
        <container grow={1}><text fontSize={11} color={theme().foreground} text={label} /></container>
        <text fontSize={10} color={theme().mutedForeground} text={mediaFor(all(), id).length ? String(mediaFor(all(), id).length) : ''} />
      </row>
    </Button>;
  }
  return <Panel width="100%" header={<LibraryTabs value={page()} onChange={setPage} />}
    trailing={<Popover trigger="" width={36} contentWidth={172} accessibleLabel={TR('libraryView')}
      leading={<Icon name={list() ? 'rows-3' : 'film'} size={13} color={theme().mutedForeground} />}
      trailing={<Icon name="chevron-down" size={9} color={theme().mutedForeground} />}>
      <Button variant="ghost" width="100%" contentAlign="start" onClick={() => setList(false)}>{TR('gridView')}</Button>
      <Button variant="ghost" width="100%" contentAlign="start" onClick={() => setList(true)}>{TR('listView')}</Button>
    </Popover>}>
    <Show when={page() === 'media'} fallback={<LibraryShelf page={page()} editor={props.editor} />}>
      <row width="100%" grow={1} minHeight={0}>
        <column id="editor-media-categories" width={side()} height="100%" shrink={0} padding={{ start: 4, end: 4, top: 6 }} gap={2}>
          <Button variant="ghost" size="xs" width="100%" contentAlign="start" onClick={() => setMediaOpen(!mediaOpen())}>
            <Icon name={mediaOpen() ? 'chevron-down' : 'chevron-right'} size={10} color={theme().mutedForeground} />
            <text fontSize={11} weight={500} color={theme().mutedForeground} text={TR('media')} />
          </Button>
          <Show when={mediaOpen()}>{category('all', TR('allMedia'))}{category('video', TR('video'))}
            {category('audio', TR('audio'))}{category('images', TR('images'))}</Show>
          <Button variant="ghost" size="xs" width="100%" contentAlign="start" onClick={() => setGeneratedOpen(!generatedOpen())}>
            <Icon name={generatedOpen() ? 'chevron-down' : 'chevron-right'} size={10} color={theme().mutedForeground} />
            <text fontSize={11} weight={500} color={theme().mutedForeground} text={TR('generated')} />
          </Button>
          <Show when={generatedOpen()}>{category('recordings', TR('recordings'))}</Show>
        </column>
        <Splitter id="editor-media-sidebar-divider" label={TR('resizeCategories')} vertical hairline value={side()}
          target="editor-media-categories" minimum={Math.min(88, props.width / 2)} maximum={props.width / 2} onCommit={setSidebar} />
        <column grow={1} minWidth={0} height="100%">
          <row width="100%" height={44} shrink={0} padding={{ start: 8, end: 8 }} gap={6} alignItems="center">
            <Button variant="outline" disabled={props.editor.busy()} onClick={() => void props.editor.import()}>
              <Icon name="arrow-down-to-line" size={14} color={theme().mutedForeground} />{TR('import')}
            </Button>
            <container grow={1} />
            <Popover trigger="" width={40} contentWidth={180} accessibleLabel={TR('sortMedia')}
              leading={<Icon name="clock-3" size={14} color={theme().mutedForeground} />}
              trailing={<Icon name="chevron-down" size={9} color={theme().mutedForeground} />}>
              <Button variant="ghost" onClick={() => setSort(false)}>{TR('importOrder')}</Button>
              <Button variant="ghost" onClick={() => setSort(true)}>{TR('nameOrder')}</Button>
            </Popover>
          </row>
          <Show when={all().length > 12}><container width="100%" padding={{ start: 8, end: 8, bottom: 8 }}>
            <InputField value={query()} onValueChange={setQuery} placeholder={TR('search')} accessibleName={TR('search')}
              leading={<Icon name="search" size={13} color={theme().mutedForeground} />} />
          </container></Show>
          <scrollView width="100%" grow={1} minHeight={0} onScroll={event => setScroll(event.offsetY)}>
            <column width="100%" padding={{ start: 8, end: 8, bottom: 8 }}>
              <Show when={assets().length} fallback={<column width="100%" padding={{ top: 32 }} gap={10} alignItems="center">
                <Icon name="film" size={28} color={theme().mutedForeground} />
                <text fontSize={12} color={theme().mutedForeground} textAlign="center" lineClamp={3} text={TR(all().length ? 'noResults' : 'emptyMedia')} />
              </column>}>
                <container width="100%" height={Math.ceil(assets().length / columns()) * (cardHeight() + 8)}>
                  <For each={visible().map(asset => asset.id)}>{(id, index) => { const asset = () => all().find(asset => asset.id === id)!; return <focusScope id={`editor-media-${asset().id}`}
                    position="absolute" inset={{ start: (index() + first()) % columns() * (cardWidth() + 8), top: Math.floor((index() + first()) / columns()) * (cardHeight() + 8) }}
                    width={cardWidth()} height={cardHeight()} role="button" accessibleName={`${TR('addToTimeline')} ${asset().name}`}
                    keyboardActivation="enterOrSpace" enabled={!props.editor.busy()} onClick={() => insert(asset())} tooltip={asset().name}>
                    <touchArea width="100%" height="100%" mouseCursor="pointer">
                      <column width="100%" height="100%" gap={4}>
                        <container width="100%" height={list() ? 28 : cardWidth() * 9 / 16}>
                          <SourceThumbnail asset={asset()} editor={props.editor} />
                          <rectangle position="absolute" inset={{ end: 3, bottom: 3 }} background="#000000b3" radii={3} padding={{ start: 3, end: 3 }}>
                            <text fontSize={10} color="#ffffff" text={`${Math.floor(asset().durationMs / 60000)}:${String(Math.floor(asset().durationMs / 1000) % 60).padStart(2, '0')}`} />
                          </rectangle>
                        </container>
                        <text fontSize={11} color={theme().mutedForeground} lineClamp={1} text={asset().name} />
                      </column>
                    </touchArea>
                  </focusScope>; }}</For>
                </container>
              </Show>
            </column>
          </scrollView>
        </column>
      </row>
    </Show>
  </Panel>;
}
