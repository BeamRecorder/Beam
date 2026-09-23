function deviceSources(items, kind) {
  return (items?.Ok || []).map((item) => ({
    id: item.id,
    kind,
    label: item.name,
    isDefault: item.isDefault === true,
    selectionMode: 'direct',
    capabilities: { formats: [], supportsCursorExclusion: false },
  }));
}
async function nativeCatalog(engine) {
  const [sources, capabilities, permissions] = await Promise.all([
    engine.request('sources'),
    engine.request('capabilities'),
    engine.request('permissions'),
  ]);
  return {
    sources: [
      ...(sources.screens?.Ok || []),
      ...deviceSources(sources.cameras, 'camera'),
      ...deviceSources(sources.microphones, 'microphone'),
      ...deviceSources(sources.systemOutputs, 'system-audio'),
    ],
    capabilities,
    permissions,
    errors: Object.fromEntries(
      Object.entries(sources)
        .filter(([, value]) => value?.Err)
        .map(([key, value]) => [key, value.Err]),
    ),
  };
}
function nativeDevices(sources) {
  return {
    cameras: sources.cameras?.Ok || [],
    microphones: sources.microphones?.Ok || [],
    systemOutputs: sources.systemOutputs?.Ok || [],
    errors: {
      cameras: sources.cameras?.Err || null,
      microphones: sources.microphones?.Err || null,
      systemOutputs: sources.systemOutputs?.Err || null,
    },
  };
}
module.exports = { nativeCatalog, nativeDevices };
