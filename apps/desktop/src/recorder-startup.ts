import { mountStartupShell } from './components/brand/startup/startup-shell';
import type { StartupShell } from './components/brand/startup/startup-types';

let shell: StartupShell | null = null;

export const startRecorder = async (loadRenderer: () => Promise<unknown>): Promise<void> => {
  shell?.dispose();
  shell = null;
  performance.mark('beam:bootstrap-start');
  const query = new URLSearchParams(location.search);
  const overlay = ['cameraOverlay', 'screenRegion', 'quickSnipCrop', 'quickSnipSettings', 'teleprompter'].some((key) =>
    query.has(key),
  );
  const startup = document.getElementById('beam-startup');
  if (overlay) {
    startup?.remove();
    document.documentElement.removeAttribute('data-beam-startup');
  } else if (startup) shell = mountStartupShell(startup);

  try {
    await loadRenderer();
  } catch (reason) {
    const startup = document.getElementById('beam-startup');
    if (!startup) {
      console.error('Beam renderer failed to load:', reason);
      return;
    }
    startup.dataset.error = '';
    shell?.fail();
    const message = document.createElement('p');
    message.setAttribute('role', 'alert');
    message.textContent = reason instanceof Error ? reason.message : String(reason);
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = startup.dataset.retryLabel || 'Reload Beam';
    retry.setAttribute('aria-label', retry.textContent);
    retry.onclick = () => location.reload();
    startup.append(message, retry);
  }
};

export const completeRecorderStartup = (): void => {
  requestAnimationFrame(() => {
    performance.mark('beam:renderer-mounted');
    performance.measure('beam:renderer-bootstrap', 'beam:bootstrap-start', 'beam:renderer-mounted');
    const currentShell = shell;
    currentShell?.dispose();
    shell = null;
    const startup = document.getElementById('beam-startup');
    startup?.remove();
    document.documentElement.removeAttribute('data-beam-startup');
  });
};
