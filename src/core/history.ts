import type { WorkspaceState, HistoryEntry } from './types'

const MAX_HISTORY_SIZE = 100

export interface HistoryState {
  entries: HistoryEntry[]
  currentIndex: number
}

export interface OperationLogEntry {
  id: string
  timestamp: number
  type: 'save' | 'load' | 'autosave' | 'recover' | 'export' | 'import' | 'clear' | 'new'
  success: boolean
  message: string
  details?: Record<string, unknown>
}

export const operationLog: OperationLogEntry[] = []

export const logOperation = (
  type: OperationLogEntry['type'],
  success: boolean,
  message: string,
  details?: Record<string, unknown>
): OperationLogEntry => {
  const entry: OperationLogEntry = {
    id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: Date.now(),
    type,
    success,
    message,
    details
  }
  operationLog.unshift(entry)
  if (operationLog.length > 100) {
    operationLog.length = 100
  }
  return entry
}

export const getOperationLog = (): OperationLogEntry[] => {
  return [...operationLog]
}

export const clearOperationLog = (): void => {
  operationLog.length = 0
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
  const result = JSON.stringify(data, null, 2)
  logOperation('save', true, `序列化工作区数据（${state.clips.length} 个片段，${state.tags.length} 个标签）`, {
    clipCount: state.clips.length,
    tagCount: state.tags.length,
    historyEntries: history.entries.length
  })
  return result
}

export type DeserializeResult =
  | { success: true; state: WorkspaceState; history: HistoryState }
  | { success: false; error: string; recoveryOptions: RecoveryOption[]; corruptionDetails: CorruptionDetails }

export interface CorruptionDetails {
  jsonParseError: boolean
  stateCorrupted: boolean
  historyCorrupted: boolean
  versionMismatch: boolean
  clipsRecoverable: boolean
  tagsRecoverable: boolean
  configRecoverable: boolean
  expectedVersion: string
  actualVersion?: string
  rawError?: string
}

export interface RecoveryOption {
  type: 'empty' | 'backup' | 'partial' | 'partial_clips' | 'partial_tags'
  label: string
  description: string
  willLose: string[]
  willKeep: string[]
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

const checkPartialRecoverability = (data: unknown): { clipsRecoverable: boolean; tagsRecoverable: boolean; configRecoverable: boolean } => {
  if (typeof data !== 'object' || data === null) {
    return { clipsRecoverable: false, tagsRecoverable: false, configRecoverable: false }
  }
  const obj = data as Record<string, unknown>
  const state = obj.state as Record<string, unknown> | undefined
  return {
    clipsRecoverable: !!(state && Array.isArray(state.clips)),
    tagsRecoverable: !!(state && Array.isArray(state.tags)),
    configRecoverable: !!(state && typeof state.config === 'object' && state.config !== null)
  }
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

const createPartialState = (
  parsed: unknown,
  includeClips: boolean,
  includeTags: boolean
): WorkspaceState => {
  const empty: WorkspaceState = { clips: [], tags: [], config: {} }
  if (typeof parsed !== 'object' || parsed === null) return empty
  const obj = parsed as Record<string, unknown>
  const state = obj.state as Record<string, unknown> | undefined
  if (!state) return empty

  return {
    clips: includeClips && Array.isArray(state.clips) ? state.clips : [],
    tags: includeTags && Array.isArray(state.tags) ? state.tags : [],
    config: typeof state.config === 'object' && state.config !== null ? state.config : {}
  }
}

const buildRecoveryOptions = (details: CorruptionDetails): RecoveryOption[] => {
  const options: RecoveryOption[] = []

  if (details.clipsRecoverable && details.tagsRecoverable) {
    options.push({
      type: 'partial',
      label: '恢复全部片段和标签',
      description: '工作区数据可以恢复，但历史记录已损坏。将恢复所有片段和标签，撤销/重做历史将重置。',
      willKeep: ['所有片段内容', '所有标签', '配置信息'],
      willLose: ['撤销/重做历史记录']
    })
  }

  if (details.clipsRecoverable && !details.tagsRecoverable) {
    options.push({
      type: 'partial_clips',
      label: '仅恢复片段',
      description: '标签数据已损坏，但片段数据可以恢复。将恢复所有片段，标签将被清空。',
      willKeep: ['所有片段内容', '配置信息'],
      willLose: ['所有标签', '撤销/重做历史记录']
    })
  }

  if (!details.clipsRecoverable && details.tagsRecoverable) {
    options.push({
      type: 'partial_tags',
      label: '仅恢复标签',
      description: '片段数据已损坏，但标签数据可以恢复。将恢复所有标签，片段将被清空。',
      willKeep: ['所有标签', '配置信息'],
      willLose: ['所有片段', '撤销/重做历史记录']
    })
  }

  if (details.clipsRecoverable || details.tagsRecoverable) {
    options.push({
      type: 'backup',
      label: '尝试强制恢复所有可读数据',
      description: '尝试尽可能提取所有可读取的数据，结果可能不完整或不一致。',
      willKeep: ['所有可读取的片段', '所有可读取的标签', '可读取的配置'],
      willLose: ['损坏的数据段', '撤销/重做历史记录']
    })
  }

  options.push({
    type: 'empty',
    label: '创建空工作区',
    description: '放弃所有损坏的数据，从空白工作区开始。',
    willKeep: [],
    willLose: ['所有片段', '所有标签', '所有配置', '撤销/重做历史记录']
  })

  return options
}

const buildErrorMessage = (details: CorruptionDetails): string => {
  if (details.jsonParseError) {
    return `文件格式损坏：JSON 解析失败（${details.rawError || '未知错误'}）。文件可能被截断或包含无效字符。`
  }
  if (details.versionMismatch) {
    return `版本不兼容：文件版本为 ${details.actualVersion || '未知'}，当前软件版本为 ${details.expectedVersion}。请检查软件更新。`
  }
  const issues: string[] = []
  if (details.stateCorrupted) {
    const parts: string[] = []
    if (!details.clipsRecoverable) parts.push('片段数据')
    if (!details.tagsRecoverable) parts.push('标签数据')
    if (!details.configRecoverable) parts.push('配置数据')
    issues.push(`工作区数据损坏${parts.length ? `（${parts.join('、')}不可读）` : ''}`)
  }
  if (details.historyCorrupted) {
    issues.push('历史记录数据损坏')
  }
  return `文件损坏：${issues.join('；')}。部分数据可能仍可恢复。`
}

export const deserialize = (jsonText: string): DeserializeResult => {
  const baseDetails: CorruptionDetails = {
    jsonParseError: false,
    stateCorrupted: false,
    historyCorrupted: false,
    versionMismatch: false,
    clipsRecoverable: false,
    tagsRecoverable: false,
    configRecoverable: false,
    expectedVersion: CURRENT_VERSION
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch (e) {
    const details: CorruptionDetails = {
      ...baseDetails,
      jsonParseError: true,
      rawError: (e as Error).message
    }
    const errorMsg = buildErrorMessage(details)
    logOperation('load', false, `加载工作区失败：${errorMsg}`, {
      corruptionDetails: details
    })
    return {
      success: false,
      error: errorMsg,
      recoveryOptions: buildRecoveryOptions(details),
      corruptionDetails: details
    }
  }

  if (typeof parsed !== 'object' || parsed === null) {
    const details: CorruptionDetails = {
      ...baseDetails,
      stateCorrupted: true,
      historyCorrupted: true
    }
    const errorMsg = '文件内容格式无效：根节点不是有效对象'
    logOperation('load', false, `加载工作区失败：${errorMsg}`, {
      corruptionDetails: details
    })
    return {
      success: false,
      error: errorMsg,
      recoveryOptions: buildRecoveryOptions(details),
      corruptionDetails: details
    }
  }

  const data = parsed as Partial<SerializedData>

  if (data.version !== CURRENT_VERSION) {
    const partial = checkPartialRecoverability(parsed)
    const details: CorruptionDetails = {
      ...baseDetails,
      versionMismatch: true,
      actualVersion: data.version as string | undefined,
      ...partial
    }
    const errorMsg = buildErrorMessage(details)
    logOperation('load', false, `加载工作区失败：${errorMsg}`, {
      corruptionDetails: details,
      recoveryOptionCount: buildRecoveryOptions(details).length
    })
    return {
      success: false,
      error: errorMsg,
      recoveryOptions: buildRecoveryOptions(details),
      corruptionDetails: details
    }
  }

  const hasValidState = validateWorkspaceState(data.state)
  const hasValidHistory = validateHistoryState(data.history)
  const partial = checkPartialRecoverability(parsed)

  if (hasValidState && hasValidHistory) {
    const loadedState = data.state as WorkspaceState
    const loadedHistory = data.history as HistoryState
    logOperation('load', true, `成功加载工作区（${loadedState.clips.length} 个片段，${loadedState.tags.length} 个标签，${loadedHistory.entries.length} 条历史记录）`, {
      clipCount: loadedState.clips.length,
      tagCount: loadedState.tags.length,
      historyEntries: loadedHistory.entries.length
    })
    return {
      success: true,
      state: loadedState,
      history: loadedHistory
    }
  }

  const details: CorruptionDetails = {
    ...baseDetails,
    stateCorrupted: !hasValidState,
    historyCorrupted: !hasValidHistory,
    ...partial
  }

  logOperation('load', false, `加载工作区失败：${buildErrorMessage(details)}`, {
    corruptionDetails: details,
    recoveryOptionCount: buildRecoveryOptions(details).length
  })

  return {
    success: false,
    error: buildErrorMessage(details),
    recoveryOptions: buildRecoveryOptions(details),
    corruptionDetails: details
  }
}

export const computeStateHash = (state: WorkspaceState): string => {
  const simplified = {
    clips: state.clips.map(c => ({ id: c.id, updatedAt: c.updatedAt, tags: c.tags })),
    tags: state.tags,
    config: state.config,
    currentWorkspacePath: state.currentWorkspacePath
  }
  return JSON.stringify(simplified)
}

export const statesAreEqual = (a: WorkspaceState, b: WorkspaceState): boolean => {
  return computeStateHash(a) === computeStateHash(b)
}

export const recoverWithOption = (
  jsonText: string,
  optionType: RecoveryOption['type']
): { state: WorkspaceState; history: HistoryState; recoveryLog: string } => {
  const emptyState: WorkspaceState = {
    clips: [],
    tags: [],
    config: {}
  }

  let recoveredState = emptyState
  let recoveryLog = ''

  if (optionType === 'empty') {
    recoveredState = emptyState
    recoveryLog = '选择创建空工作区，所有数据已清空'
    logOperation('recover', true, recoveryLog, { optionType })
    return { state: recoveredState, history: createInitialHistory(), recoveryLog }
  }

  try {
    const parsed = JSON.parse(jsonText)

    if (optionType === 'partial' && validateWorkspaceState((parsed as Partial<SerializedData>).state)) {
      recoveredState = (parsed as Partial<SerializedData>).state as WorkspaceState
      recoveryLog = `恢复工作区数据：${recoveredState.clips.length} 个片段，${recoveredState.tags.length} 个标签（历史记录已重置）`
      logOperation('recover', true, recoveryLog, { optionType, clipCount: recoveredState.clips.length, tagCount: recoveredState.tags.length })
      return { state: recoveredState, history: createInitialHistory(), recoveryLog }
    }

    if (optionType === 'partial_clips') {
      recoveredState = createPartialState(parsed, true, false)
      recoveryLog = `仅恢复片段数据：${recoveredState.clips.length} 个片段（标签和历史记录已重置）`
      logOperation('recover', true, recoveryLog, { optionType, clipCount: recoveredState.clips.length })
      return { state: recoveredState, history: createInitialHistory(), recoveryLog }
    }

    if (optionType === 'partial_tags') {
      recoveredState = createPartialState(parsed, false, true)
      recoveryLog = `仅恢复标签数据：${recoveredState.tags.length} 个标签（片段和历史记录已重置）`
      logOperation('recover', true, recoveryLog, { optionType, tagCount: recoveredState.tags.length })
      return { state: recoveredState, history: createInitialHistory(), recoveryLog }
    }

    if (optionType === 'backup' && (parsed as Partial<SerializedData>).state) {
      recoveredState = createBackupState(parsed as SerializedData)
      recoveryLog = `强制恢复数据：${recoveredState.clips.length} 个片段，${recoveredState.tags.length} 个标签（结果可能不完整）`
      logOperation('recover', true, recoveryLog, { optionType, clipCount: recoveredState.clips.length, tagCount: recoveredState.tags.length })
      return { state: recoveredState, history: createInitialHistory(), recoveryLog }
    }
  } catch (e) {
    recoveryLog = `恢复失败：${(e as Error).message}，已创建空工作区`
    logOperation('recover', false, recoveryLog, { optionType, error: (e as Error).message })
    return { state: emptyState, history: createInitialHistory(), recoveryLog }
  }

  recoveryLog = '未知恢复选项，已创建空工作区'
  logOperation('recover', false, recoveryLog, { optionType })
  return { state: emptyState, history: createInitialHistory(), recoveryLog }
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
