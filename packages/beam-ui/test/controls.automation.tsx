import { createSignal } from 'solid-js'
import { NativeHost, createThemeRuntime, type NativeNode } from '@argui/host'
import { ThemeProvider, render, useNativeHost } from '@argui/solid'
import { defineArguiTest } from '@argui/test'
import { beamThemeDefinition } from '../src/solid/shared/beamTheme'
import { Select } from '../src/solid/shared/base-ui/select'
import { SegmentedControl } from '../src/solid/shared/base-ui/segmentedControl'
import { mediaAssets } from '../assets.generated'
import { CaptureQuickSettings } from '../src/solid/hud/CaptureQuickSettings'
import { initializeBeamI18n } from '../src/solid/shared/i18n'
import type { CaptureQuickSettings as QuickSettings } from '../src/solid/shared/beamTypes'

/** Exercises the production controls with a bounded, deterministic device catalog. */
function Controls() {
  const [mode, setMode] = createSignal('recorder')
  const [quick, setQuick] = createSignal<QuickSettings>({ countdownSeconds: 3 })
  return <column width="100%" height="100%" padding={24} gap={20} background="#202020">
    <SegmentedControl label="Capture mode" value={mode()} onChange={setMode}
      options={[
        { id: 'recorder', label: 'Record', asset: mediaAssets['modes/recorder.svg'] },
        { id: 'screenshot', label: 'Screenshot', asset: mediaAssets['modes/screenshot.svg'] },
        { id: 'instant', label: 'Instant', asset: mediaAssets['modes/instant.svg'] },
      ]} />
    <Select id="profile-select" label="Microphone" width={240} defaultValue="0"
      options={Array.from({ length: 8 }, (_, index) => ({ value: String(index), label: `Microphone ${index + 1}` }))} />
    <CaptureQuickSettings api={{ desktopCapabilities: async () => ({ taskbar: false, desktopIcons: false, captureOnly: false }) }}
      value={quick()} disabled={false} screenshot={false} onChange={patch => setQuick(value => ({ ...value, ...patch }))} />
  </column>
}

export default defineArguiTest({
  viewport: { width: 680, height: 320 },
  app(bridge, expectedAbiHash) {
    initializeBeamI18n()
    const host = new NativeHost(bridge, expectedAbiHash)
    const runtime = createThemeRuntime(bridge, beamThemeDefinition)
    runtime.update({ variant: 'dark' })
    useNativeHost(host)
    const root = host.createElement('column')
    host.setProperty(root, 'width', '100%')
    host.setProperty(root, 'height', '100%')
    const dispose = render(() => <ThemeProvider runtime={runtime}><Controls /></ThemeProvider> as unknown as NativeNode, root)
    host.setRoot(root)
    return () => { dispose(); runtime.dispose(); host.dispose() }
  },
  async run(ui) {
    await ui.screenshot('initial.png')
    for (let index = 0; index < 5; index++) {
      await ui.getById('profile-select').click()
      await ui.expectText('Microphone 8')
      if (index === 0) await ui.screenshot('select-open.png')
      await ui.keyboard.press('Escape')
    }
    await ui.at(340, 45).click()
    await ui.wait(50)
    await ui.screenshot('first-tab-moving.png')
    await ui.wait(200)
    await ui.screenshot('first-tab-settled.png')
    await ui.at(450, 45).click()
    await ui.wait(50)
    await ui.screenshot('second-tab-moving.png')
    await ui.wait(200)
    await ui.getById('capture-quick-settings').click()
    await ui.getById('capture-countdown-setting').move()
    await ui.expectText('10 s')
    await ui.screenshot('countdown-submenu.png')
    await ui.getById('capture-countdown-5').click()
    await ui.expectText('5 s')
    await ui.keyboard.press('Escape')
    await ui.getById('capture-quick-settings').click()
    await ui.expectText('5 s')
    await ui.getById('capture-countdown-setting').move()
    await ui.expectText('10 s')
    await ui.screenshot('countdown-selected.png')
  },
})
