import { createMemo } from 'solid-js'

/** Supplies live targets and short native transitions; silence has no transition. */
export function useMeterAnimation(target: () => number) {
  const value = createMemo(target)
  let previous = 0
  const duration = createMemo(() => {
    const next = value()
    const milliseconds = next > previous ? 24 : 55
    previous = next
    return next > 0 ? milliseconds : undefined
  })
  return { value, duration }
}
