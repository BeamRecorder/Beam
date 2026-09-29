import { expect, it } from 'vitest'
import { buildHudIssues } from './hudIssuesModel'

const labels = { errorTitle: 'Error', permissionTitle: 'Allow interaction',
  unavailableTitle: 'Interaction unavailable', accessDescription: 'Captures clicks, never text' }

it('groups current diagnostics without losing distinct errors', () => {
  const issues = buildHudIssues([' failed ', 'failed', 'second error', ''], null, false, '', labels)
  expect(issues.map(issue => issue.detail)).toEqual(['failed', 'second error'])
})

it('shows Linux permission access and its helper failure alongside recording errors', () => {
  const issues = buildHudIssues(['editor failed'], {
    state: 'permission-required', canRequest: true, clicks: false, shortcuts: false,
    error: { code: 'helper', message: 'helper stopped' },
  }, true, '', labels)
  expect(issues).toHaveLength(2)
  expect(issues[0]).toMatchObject({ permission: true, title: 'Allow interaction' })
  expect(issues[0].detail).toContain('helper stopped')
  expect(buildHudIssues([], { state: 'available', canRequest: false, clicks: true, shortcuts: true }, true, '', labels)).toEqual([])
})
