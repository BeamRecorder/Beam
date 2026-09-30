export const startRecorder = async (loadRenderer: () => Promise<unknown>): Promise<void> => {
  performance.mark('beam:bootstrap-start');
  const query = new URLSearchParams(location.search);
  const overlay = ['cameraOverlay', 'screenRegion', 'quickSnipCrop', 'teleprompter'].some((key) => query.has(key));
  if (overlay) document.getElementById('beam-startup')?.remove();

  try {
    await loadRenderer();
  } catch (reason) {
    const startup = document.getElementById('beam-startup');
    if (!startup) {
      console.error('Beam renderer failed to load:', reason);
      return;
    }
    startup.dataset.error = '';
    const message = document.createElement('p');
    message.setAttribute('role', 'alert');
    message.textContent = reason instanceof Error ? reason.message : String(reason);
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'Reload Beam';
    retry.setAttribute('aria-label', 'Reload Beam');
    retry.onclick = () => location.reload();
    startup.append(message, retry);
  }
};

export const completeRecorderStartup = (): void => {
  requestAnimationFrame(() => {
    performance.mark('beam:renderer-mounted');
    performance.measure('beam:renderer-bootstrap', 'beam:bootstrap-start', 'beam:renderer-mounted');
    document.getElementById('beam-startup')?.remove();
  });
};
