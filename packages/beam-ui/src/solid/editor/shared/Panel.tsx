import { useTheme } from '@argui/solid';
import type { WidgetTheme } from '@argui/widgets/solid';
import type { JSX } from '@argui/solid/jsx-runtime';
import { untrack } from 'solid-js';

/** Reusable editor surface with a fixed header and bounded content area. */
export function Panel(props: {
  title?: string;
  header?: JSX.Element;
  center?: JSX.Element;
  trailing?: JSX.Element;
  width?: number | '100%';
  grow?: number;
  children?: JSX.Element;
}) {
  const theme = useTheme<WidgetTheme>();
  // A composed TSX header must be resolved once, then reused for geometry and content.
  const header = untrack(() => props.header);
  const content = untrack(() => props.children);
  const center = untrack(() => props.center);
  const trailing = untrack(() => props.trailing);
  return (
    <rectangle
      width={props.width}
      grow={props.grow}
      height="100%"
      shrink={props.width === undefined ? 1 : 0}
      minWidth={0}
      minHeight={0}
      background={theme().background}
      radii={12}
    >
      <column width="100%" height="100%" minHeight={0}>
        <row width="100%" height={52} shrink={0} alignItems="center" padding={{ start: header ? 8 : 14, end: 8 }} gap={8}>
          <container grow={1} minWidth={0}>
            {header ?? <text color={theme().foreground} fontSize={13} weight={500} text={props.title ?? ''} />}
          </container>
          {center}
          {trailing}
        </row>
        <rectangle width="100%" height={1} shrink={0} background={theme().border} />
        <column width="100%" grow={1} minHeight={0}>
          {content}
        </column>
      </column>
    </rectangle>
  );
}
