function capturePreparationApi(ipc) {
  const listen = (channel, listener) => {
    const callback = (_event, value) => listener(value);
    ipc.on(`capture-preparation:${channel}`, callback);
    return () => ipc.removeListener(`capture-preparation:${channel}`, callback);
  };
  return {
    fitBar: (width) => ipc.invoke('capture-preparation:fit-bar', width),
    configure: (settings) => ipc.invoke('capture-preparation:configure', settings),
    toggleSettings: (anchor) => ipc.invoke('capture-preparation:settings', anchor),
    chooseDevice: (request) => ipc.invoke('capture-preparation:choose-device', request),
    update: (settings) => ipc.invoke('capture-preparation:update', settings),
    onChanged: (listener) => listen('changed', listener),
    onConfigure: (listener) => listen('configure', listener),
    onContent: (listener) => listen('settings-content', listener),
    onSettingsVisibility: (listener) => listen('settings-visibility', listener),
    selectDevice: (id) => ipc.send('capture-preparation:device-select', id),
    ready: () => ipc.send('capture-preparation:settings-ready'),
    fit: (height) => ipc.send('capture-preparation:settings-fit', height),
    dismiss: () => ipc.send('capture-preparation:settings-dismiss'),
    close: () => ipc.send('capture-preparation:close'),
  };
}
module.exports = { capturePreparationApi };
