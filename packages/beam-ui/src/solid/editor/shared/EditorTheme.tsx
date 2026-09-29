import { ThemeScope, useThemeSnapshot } from '@argui/solid';
import type { WidgetTheme } from '@argui/widgets/solid';
import type { JSX } from '@argui/solid/jsx-runtime';
import { beamPalettes } from '../../shared/beamPalette';

/** Keeps Concat's editor surfaces while inheriting Beam's shared action and focus colors. */
export function EditorTheme(props: { children: JSX.Element }) {
  const snapshot = useThemeSnapshot<WidgetTheme>();
  const colors = () => beamPalettes[snapshot().resolvedVariant === 'dark' ? 'dark' : 'light'];
  return <ThemeScope<WidgetTheme> overrides={{
    sidebar: colors().page,
    accent: colors().fieldHover, spacing: 4, ghostHover: colors().fieldHover,
  }}>{props.children}</ThemeScope>;
}
