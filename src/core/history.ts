import type { WorkspaceState, HistoryEntry } from './types'

const MAX_HISTORY_SIZE = 100

export interface HistoryState {
  entries: HistoryEntry[]
  currentIndex: number
}

export const createInitialHistory = (): HistoryState => ({
  entries: [],
  currentIndex: -1
})

export const pushHistory = (
  history: HistoryState,
  entry: HistoryEntry
): HistoryState => {
  const truncatedEntries = history.currentIndex >= 0
    ? history.entries.slice(0, history.currentIndex + 1)
    : []

  const newEntries = [...truncatedEntries, entry]

  if (newEntries.length > MAX_HISTORY_SIZE) {
    const overflow = newEntries.length - MAX_HISTORY_SIZE
    newEntries.splice(0, overflow)
  }

  return {
    entries: newEntries,
    currentIndex: newEntries.length - 1
  }
}

export const canUndo = (history: HistoryState): boolean => {
  return history.currentIndex >= 0
}

export const canRedo = (history: HistoryState): boolean => {
  return history.currentIndex < history.entries.length - 1
}

export const undo = (
  history: HistoryState,
  currentState: WorkspaceState
): { history: HistoryState; state: WorkspaceState; entry?: HistoryEntry } => {
  if (!canUndo(history)) {
    return { history, state: currentState }
  }

  const entry = history.entries[history.currentIndex]
  const newState: WorkspaceState = {
    ...currentState,
    ...entry.before
  }

  return {
    history: {
      ...history,
      currentIndex: history.currentIndex - 1
    },
    state: newState,
    entry
  }
}

export const redo = (
  history: HistoryState,
  currentState: WorkspaceState
): { history: HistoryState; state: WorkspaceState; entry?: HistoryEntry } => {
  if (!canRedo(history)) {
    return { history, state: currentState }
  }

  const nextIndex = history.currentIndex + 1
  const entry = history.entries[nextIndex]
  const newState: WorkspaceState = {
    ...currentState,
    ...entry.after
  }

  return {
    history: {
      ...history,
      currentIndex: nextIndex
    },
    state: newState,
    entry
  }
}

export const getUndoDescription = (history: HistoryState): string | null => {
  if (!canUndo(history)) {
    return null
  }
  return history.entries[history.currentIndex].description
}

export const getRedoDescription = (history: HistoryState): string | null => {
  if (!canRedo(history)) {
    return null
  }
  return history.entries[history.currentIndex + 1].description
}

export interface SerializedData {
  version: string
  state: WorkspaceState
  history: HistoryState
  savedAt: number
}

export const CURRENT_VERSION = '1.0.0'

export const serialize = (state: WorkspaceState, history: HistoryState): string => {
  const data: SerializedData = {
    version: CURRENT_VERSION,
    state,
    history,
    savedAt: Date.now()
  }
  return JSON.stringify(data, null, 2)
}

export type DeserializeResult =
  | { success: true; state: WorkspaceState; history: HistoryState }
  | { success: false; error: string; recoveryOptions: RecoveryOption[] }

export interface RecoveryOption {
  type: 'empty' | 'backup' | 'partial'
  label: string
  description: string
}

const validateWorkspaceState = (data: unknown): data is WorkspaceState => {
  if (typeof data !== 'object' || data === null) return false
  const obj = data as Record<string, unknown>
  return (
    Array.isArray(obj.clips) &&
    Array.isArray(obj.tags) &&
    typeof obj.config === 'object' &&
    obj.config !== null
  )
}

const validateHistoryState = (data: unknown): data is HistoryState => {
  if (typeof data !== 'object' || data === null) return false
  const obj = data as Record<string, unknown>
  return (
    Array.isArray(obj.entries) &&
    typeof obj.currentIndex === 'number'
  )
}

const createBackupState = (data: SerializedData): WorkspaceState => {
  return {
    clips: Array.isArray(data.state?.clips) ? data.state.clips : [],
    tags: Array.isArray(data.state?.tags) ? data.state.tags : [],
    config: typeof data.state?.config === 'object' && data.state.config !== null
      ? data.state.config
      : {}
  }
}

export const deserialize = (jsonText: string): DeserializeResult => {
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch (e) {
    return {
      success: false,
      error: '文件格式损坏，无法解析 JSON',
      recoveryOptions: [
        {
          type: 'empty',
          label: '创建空工作区',
          description: '忽略损坏的文件，从空白开始'
        }
      ]
    }
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return {
      success: false,
      error: '文件内容格式无效',
      recoveryOptions: [
        {
          type: 'empty',
          label: '创建空工作区',
          description: '忽略损坏的文件，从空白开始'
        }
      ]
    }
  }

  const data = parsed as Partial<SerializedData>

  if (data.version !== CURRENT_VERSION) {
    return {
      success: false,
      error: `版本不兼容：期望 ${CURRENT_VERSION}，实际 ${data.version || '未知'}`,
      recoveryOptions: [
        {
          type: 'backup',
          label: '尝试恢复数据',
          description: '尝试从旧版本格式中恢复可读取的数据'
        },
        {
          type: 'empty',
          label: '创建空工作区',
          description: '忽略旧版本文件，从空白开始'
        }
      ]
    }
  }

  const hasValidState = validateWorkspaceState(data.state)
  const hasValidHistory = validateHistoryState(data.history)

  if (hasValidState && hasValidHistory) {
    return {
      success: true,
      state: data.state as WorkspaceState,
      history: data.history as HistoryState
    }
  }

  const recoveryOptions: RecoveryOption[] = []

  if (hasValidState) {
    recoveryOptions.push({
      type: 'partial',
      label: '恢复工作区数据',
      description: '恢复片段和标签数据，但丢失撤销历史'
    })
  }

  if (data.state && (data.state as unknown as Record<string, unknown>).clips) {
    recoveryOptions.push({
      type: 'backup',
      label: '尝试强制恢复',
      description: '尝试提取部分可用数据，可能不完整'
    })
  }

  recoveryOptions.push({
    type: 'empty',
    label: '创建空工作区',
    description: '忽略损坏的文件，从空白开始'
  })

  return {
    success: false,
    error: !hasValidState ? '工作区数据损坏' : '历史记录数据损坏',
    recoveryOptions
  }
}

export const recoverWithOption = (
  jsonText: string,
  optionType: RecoveryOption['type']
): { state: WorkspaceState; history: HistoryState } => {
  const emptyState: WorkspaceState = {
    clips: [],
    tags: [],
    config: {}
  }

  if (optionType === 'empty') {
    return {
      state: emptyState,
      history: createInitialHistory()
    }
  }

  try {
    const parsed = JSON.parse(jsonText) as Partial<SerializedData>

    if (optionType === 'partial' && validateWorkspaceState(parsed.state)) {
      return {
        state: parsed.state as WorkspaceState,
        history: createInitialHistory()
      }
    }

    if (optionType === 'backup' && parsed.state) {
      return {
        state: createBackupState(parsed as SerializedData),
        history: createInitialHistory()
      }
    }
  } catch {
    // fall through
  }

  return {
    state: emptyState,
    history: createInitialHistory()
  }
}

export const createHistoryEntry = (
  type: HistoryEntry['type'],
  before: Partial<WorkspaceState>,
  after: Partial<WorkspaceState>,
  description: string
): HistoryEntry => ({
  type,
  timestamp: Date.now(),
  before,
  after,
  description
})

export const clearHistory = (_history: HistoryState): HistoryState => {
  return createInitialHistory()
}
