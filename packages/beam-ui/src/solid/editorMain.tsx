import { ApplicationServices, createThemeRuntime, type NativeBridge, type NativeNode } from '@argui/host';
import { ThemeProvider, render, useNativeHost } from '@argui/solid';
import type { WidgetTheme } from '@argui/widgets/solid';
import { BeamHost } from './shared/beamHost';
import { BeamApi } from './shared/beamApi';
import { beamThemeDefinition, observeBeamTheme } from './shared/beamTheme';
import { initializeBeamI18n, observeBeamI18n } from './shared/i18n';
import { EditorApi } from './editor/shared/editorApi';
import { Editor } from './editor/Editor';

/** Mounts the editor bundle directly into ARGUI, with the existing Beam theme and i18n. */
export function mountGallery(bridge: NativeBridge, expectedAbiHash: string): () => void {
  const host = new BeamHost(bridge, expectedAbiHash),
    services = new ApplicationServices(bridge);
  const runtime = createThemeRuntime<WidgetTheme>(bridge, beamThemeDefinition);
  runtime.update({ variant: 'dark' });
  initializeBeamI18n();
  useNativeHost(host);
  const beam = new BeamApi(services),
    api = new EditorApi(services),
    root = host.createElement('column');
  host.setProperty(root, 'width', '100%');
  host.setProperty(root, 'height', '100%');
  const dispose = render(
    () =>
      (
        <ThemeProvider runtime={runtime}>
          <Editor api={api} beam={beam} />
        </ThemeProvider>
      ) as unknown as NativeNode,
    root,
  );
  host.setRoot(root);
  const offI18n = observeBeamI18n(beam),
    offTheme = observeBeamTheme(beam, runtime);
  return () => {
    offI18n();
    offTheme();
    dispose();
    services.dispose();
    runtime.dispose();
    host.dispose();
  };
}
