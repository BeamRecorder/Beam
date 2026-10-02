function configureChromiumFeatures(app, platform = process.platform) {
  // Windows and macOS enable their WebCodecs hardware backends by default.
  // AcceleratedVideoEncoder is Chromium's Linux-only VA-API feature.
  if (platform !== 'linux') return;
  const enabled = app.commandLine.getSwitchValue('enable-features').split(',').filter(Boolean);
  const disabled = app.commandLine.getSwitchValue('disable-features').split(',').filter(Boolean);
  const name = (feature) => feature.split(/[<:]/, 1)[0];
  const features = ['GlobalShortcutsPortal', 'AcceleratedVideoEncoder'];
  for (const feature of features) {
    if (!enabled.some((value) => name(value) === feature) && !disabled.some((value) => name(value) === feature)) {
      enabled.push(feature);
    }
  }
  app.commandLine.appendSwitch('enable-features', enabled.join(','));
}

module.exports = { configureChromiumFeatures };
