// Full desktop smoke host: all user content and Chromium state are isolated.
const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const directory = process.env.BEAM_AGENT_TEST_ROOT;
if (!directory) throw new Error('BEAM_AGENT_TEST_ROOT is required.');
for (const name of ['videos', 'profile']) fs.mkdirSync(path.join(directory, name), { recursive: true });
app.setPath('videos', path.join(directory, 'videos'));
app.setPath('userData', path.join(directory, 'profile'));
app.setPath('sessionData', path.join(directory, 'profile'));
app.setName('beam-agent-smoke');
app.getVersion = () => require(path.join(root, 'package.json')).version;
const { createPreferencesStore } = require(path.join(root, 'apps/desktop/electron/preferences/preferences-store.cjs'));
const store = createPreferencesStore(path.join(directory, 'videos/Beam/user/preferences.json'));
store.write({ ...store.read(), onboardingCompleted: true });
require(path.join(root, 'apps/desktop/electron/main.cjs'));
