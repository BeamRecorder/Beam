import type { NativeProjectSummary } from '../shared/beamTypes'

export interface IndexedProject {
  project: NativeProjectSummary
  searchName: string
}

const fold = (value: string): string => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()

/** Index once after a disk refresh; keystrokes only scan short, normalized names. */
export function indexProjects(projects: NativeProjectSummary[]): IndexedProject[] {
  return projects.map(project => ({ project, searchName: fold(project.name) }))
}

export function searchProjects(indexed: IndexedProject[], query: string): NativeProjectSummary[] {
  const terms = fold(query).split(/\s+/).filter(Boolean)
  return indexed.filter(item => terms.every(term => item.searchName.includes(term))).map(item => item.project)
}
