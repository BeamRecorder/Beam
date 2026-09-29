import type { InputAccessStatus } from '../shared/beamTypes'
import type { HudIssue, HudIssueLabels } from './hudIssuesTypes'

export function buildHudIssues(errors: readonly string[], access: InputAccessStatus | null, linux: boolean,
  statusError: string, labels: HudIssueLabels): HudIssue[] {
  const seen = new Set<string>()
  const result: HudIssue[] = []
  if (linux && access && access.state !== 'available') {
    result.push({ key: 'access', title: access.canRequest ? labels.permissionTitle : labels.unavailableTitle,
      detail: [labels.accessDescription, access.error?.message].filter(Boolean).join('\n'), permission: true })
  }
  for (const message of [...errors, statusError]) {
    const detail = message.trim()
    if (!detail || seen.has(detail)) continue
    seen.add(detail)
    result.push({ key: detail, title: labels.errorTitle, detail })
  }
  return result
}
