import { NativeHost, createThemeRuntime, type NativeNode } from '@argui/host'
import { ThemeProvider, render, useNativeHost } from '@argui/solid'
import { Select as ArguiSelect } from '@argui/widgets/solid'
import { defineArguiTest } from '@argui/test'
import { beamThemeDefinition } from '../src/solid/shared/beamTheme'

/** Covers both real native Select styles, including the first mount and lower selections. */
function Selects() {
  const options = Array.from({ length: 8 }, (_, index) => ({ value: String(index), label: `Device ${index + 1}` }))
  return <column width="100%" height="100%" padding={24} gap={50} background="#202020">
    <ArguiSelect id="classic" label="Classic" width={240} defaultValue="0" options={options} />
    <ArguiSelect id="compact" label="Compact" variant="shadcn" width={240} defaultValue="6" options={options} />
  </column>
}

export default defineArguiTest({
  viewport: { width: 560, height: 430 },
  app(bridge, expectedAbiHash) {
    const host = new NativeHost(bridge, expectedAbiHash)
    const runtime = createThemeRuntime(bridge, beamThemeDefinition)
    runtime.update({ variant: 'dark' })
    useNativeHost(host)
    const root = host.createElement('column')
    host.setProperty(root, 'width', '100%')
    host.setProperty(root, 'height', '100%')
    const dispose = render(() => <ThemeProvider runtime={runtime}><Selects /></ThemeProvider> as unknown as NativeNode, root)
    host.setRoot(root)
    return () => { dispose(); runtime.dispose(); host.dispose() }
  },
  async run(ui) {
    await ui.screenshot('initial.png')
    for (const id of ['classic', 'compact']) {
      await ui.getById(id).click()
      await ui.wait(40)
      await ui.screenshot(`${id}-moving.png`)
      await ui.wait(170)
      await ui.screenshot(`${id}-settled.png`)
      await ui.getById(`${id}-option-5`).click()
      await ui.getById(id).click()
      await ui.keyboard.press('Escape')
    }
  },
})
