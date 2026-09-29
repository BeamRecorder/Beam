import { expect, it } from 'vitest'
import type { NativeProjectSummary } from '../shared/beamTypes'
import { indexProjects, searchProjects } from './projectSearch'

const projects: NativeProjectSummary[] = [
  { id: 'newer', name: 'Écran de lancement', kind: 'recording', updatedAtMs: 20 },
  { id: 'older', name: 'Demo caméra', kind: 'instant', updatedAtMs: 10 },
]

it('filters names immediately without changing the newest-first order', () => {
  const indexed = indexProjects(projects)
  expect(searchProjects(indexed, 'ECrAn')).toEqual([projects[0]])
  expect(searchProjects(indexed, 'lancement écran')).toEqual([projects[0]])
  expect(searchProjects(indexed, 'caméra')).toEqual([projects[1]])
  expect(searchProjects(indexed, '')).toEqual(projects)
})
