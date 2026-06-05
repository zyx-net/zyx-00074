import { describe, it, expect, afterEach, vi } from 'vitest'
import { act, renderHook, waitFor, cleanup } from '@testing-library/react'
import { useAppState } from '../hooks/useAppState'
import * as State from '../core/state'
import * as History from '../core/history'

const transcript = `Alice: first reviewer clip.

Bob: second reviewer clip.
`

describe('reviewer constructed autosave prompt flow', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    History.clearOperationLog()
  })

  it('opens the unsaved-changes prompt before autosave recovery overwrites current edits', async () => {
    const mockAPI = {
      load: vi.fn(),
      loadAutosave: vi.fn(),
      autosave: vi.fn().mockResolvedValue({ success: true }),
      saveAs: vi.fn(),
      exportClipboard: vi.fn()
    }
    window.workspaceAPI = mockAPI as unknown as typeof window.workspaceAPI

    const { result } = renderHook(() => useAppState())

    await act(async () => {
      await result.current.actions.importTranscript(transcript, '{}')
    })
    await waitFor(() => {
      expect(result.current.hasUnsavedChanges).toBe(true)
    })

    mockAPI.loadAutosave.mockResolvedValue({
      success: true,
      hasBackup: true,
      content: History.serialize(State.createInitialState(), History.createInitialHistory())
    })

    await act(async () => {
      await result.current.actions.loadAutosave()
    })

    expect(result.current.state.unsavedChangesPrompt?.isOpen).toBe(true)
    expect(result.current.state.unsavedChangesPrompt?.pendingAction).toBe('autosave')
    expect(result.current.hasUnsavedChanges).toBe(true)
  })
})
