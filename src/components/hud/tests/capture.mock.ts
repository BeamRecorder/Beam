import { vi } from 'vitest'

export const captureMock = {
  discover: vi.fn(),
  getSources: vi.fn(),
  startRecording: vi.fn(),
  stop: vi.fn(),
  setSize: vi.fn(),
  close: vi.fn(),
  minimize: vi.fn(),
  listProjects: vi.fn(),
  createProject: vi.fn(),
  renameProject: vi.fn(),
  deleteProject: vi.fn(),
}
