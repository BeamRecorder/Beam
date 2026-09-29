import type { BeamEvent } from './shared/beamTypes'
import type { ApplicationEventHandlers, GeometryEventHandlers } from './appEventTypes'

/** Keeps application commands separate from window geometry observations. */
export function routeApplicationEvent(event: BeamEvent, handlers: ApplicationEventHandlers): void {
  switch (event.type) {
    case 'preferencesChanged':
      if (event.preferences) handlers.preferences(event.preferences)
      break
    case 'systemScheme':
      if (event.scheme === 'light' || event.scheme === 'dark') handlers.scheme(event.scheme)
      break
    case 'beamUi': handlers.action(event.action); break
    case 'shortcut': if (event.state === 'pressed') handlers.shortcut(event.id); break
  }
}

export function routeGeometryEvent(event: BeamEvent, handlers: GeometryEventHandlers): void {
  switch (event.type) {
    case 'windowResized': case 'windowMoved': handlers.schedule(); break
    case 'windowVisibility': handlers.observe(); break
  }
}
