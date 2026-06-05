import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { WorkspaceState, ClipStatus, MaterialConfig, ExportOptions, CheckResult } from '../core/types'
import * as State from '../core/state'
import * as History from '../core/history'
import * as Parser from '../core/parser'
import * as Checker from '../core/checker'
import * as Exporter from '../core/exporter'

type LoadResult =
  | { canceled: true }
  | { success: true; content: string; path: string }
  | { success: false; error: string }

type LoadAutosaveResult = {
  success: boolean
  content?: string | null
  hasBackup: boolean
  error?: string
}

type SaveAsResult =
  | { canceled: true }
  | { success: true; path: string }
  | { success: false; error: string }

type AutosaveResult = {
  success: boolean
  path?: string
  error?: string
}

export interface ToastMessage {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
}

export interface LoadError {
  error: string
  recoveryOptions: History.RecoveryOption[]
  corruptionDetails: History.CorruptionDetails
  content: string
}

export interface UnsavedChangesPrompt {
  isOpen: boolean
  pendingAction: 'load' | 'autosave' | 'new'
  pendingFilePath?: string
  pendingContent?: string
}

export type ConfirmationChoice = 'keep' | 'overwrite' | 'saveas'

export interface AppState {
  workspace: WorkspaceState
  history: History.HistoryState
  selectedClipId: string | null
  currentView: 'dashboard' | 'import' | 'clips' | 'tags' | 'check' | 'export' | 'history'
  toasts: ToastMessage[]
  isLoading: boolean
  lastSavedAt: number | null
  lastSavedStateHash: string | null
  currentWorkspacePath?: string
  loadError: LoadError | null
  unsavedChangesPrompt: UnsavedChangesPrompt | null
  operationLog: History.OperationLogEntry[]
}

const createInitialState = (): AppState => ({
  workspace: State.createInitialState(),
  history: History.createInitialHistory(),
  selectedClipId: null,
  currentView: 'dashboard',
  toasts: [],
  isLoading: false,
  lastSavedAt: null,
  lastSavedStateHash: null,
  loadError: null,
  unsavedChangesPrompt: null,
  operationLog: []
})

export const useAppState = () => {
  const [state, setState] = useState<AppState>(createInitialState)
  const autosaveTimerRef = useRef<NodeJS.Timeout | null>(null)
  const savedStateHashRef = useRef<string | null>(null)

  const hasUnsavedChanges = useMemo(() => {
    if (state.lastSavedStateHash === null) {
      const emptyHash = History.computeStateHash(State.createInitialState())
      const currentHash = History.computeStateHash(state.workspace)
      return currentHash !== emptyHash
    }
    const currentHash = History.computeStateHash(state.workspace)
    return currentHash !== state.lastSavedStateHash
  }, [state.workspace, state.lastSavedStateHash])

  const showToast = useCallback((type: ToastMessage['type'], message: string) => {
    const id = Math.random().toString(36).substr(2, 9)
    setState(prev => ({
      ...prev,
      toasts: [...prev.toasts, { id, type, message }]
    }))
    setTimeout(() => {
      setState(prev => ({
        ...prev,
        toasts: prev.toasts.filter(t => t.id !== id)
      }))
    }, 3000)
  }, [])

  const dismissToast = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      toasts: prev.toasts.filter(t => t.id !== id)
    }))
  }, [])

  const refreshOperationLog = useCallback(() => {
    setState(prev => ({
      ...prev,
      operationLog: History.getOperationLog()
    }))
  }, [])

  const markAsSaved = useCallback(() => {
    const hash = History.computeStateHash(state.workspace)
    savedStateHashRef.current = hash
    setState(prev => ({
      ...prev,
      lastSavedAt: Date.now(),
      lastSavedStateHash: hash
    }))
  }, [state.workspace])

  const scheduleAutosave = useCallback(() => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current)
    }
    autosaveTimerRef.current = setTimeout(() => {
      const serialized = History.serialize(state.workspace, state.history)
      window.workspaceAPI.autosave(serialized).then((result: AutosaveResult) => {
        if (result.success) {
          markAsSaved()
        }
      })
      refreshOperationLog()
    }, 1000)
  }, [state.workspace, state.history, markAsSaved, refreshOperationLog])

  const performLoad = useCallback(async (filePath?: string, content?: string) => {
    setState(prev => ({ ...prev, isLoading: true, unsavedChangesPrompt: null }))
    try {
      let loadContent: string | undefined = content
      let loadedPath: string | undefined = filePath

      if (!loadContent) {
        const result = await window.workspaceAPI.load(filePath) as LoadResult
        if ('canceled' in result && result.canceled) {
          setState(prev => ({ ...prev, isLoading: false }))
          return { canceled: true }
        }
        if ('success' in result && result.success && result.content) {
          loadContent = result.content
          loadedPath = result.path
        } else if ('success' in result && !result.success && 'error' in result) {
          throw new Error(result.error)
        }
      }

      if (loadContent) {
        const deserialized = History.deserialize(loadContent)
        refreshOperationLog()

        if (deserialized.success) {
          const newHash = History.computeStateHash(deserialized.state)
          savedStateHashRef.current = newHash
          setState(prev => ({
            ...prev,
            workspace: deserialized.state,
            history: deserialized.history,
            currentWorkspacePath: loadedPath,
            lastSavedStateHash: newHash,
            lastSavedAt: Date.now(),
            isLoading: false
          }))
          showToast('success', '工作区已加载')
          History.logOperation('load', true, `成功加载工作区：${loadedPath || '自动恢复'}`)
          refreshOperationLog()
          return { success: true }
        } else {
          setState(prev => ({
            ...prev,
            isLoading: false,
            loadError: {
              error: deserialized.error,
              recoveryOptions: deserialized.recoveryOptions,
              corruptionDetails: deserialized.corruptionDetails,
              content: loadContent
            }
          }))
          return { error: deserialized.error }
        }
      }

      setState(prev => ({ ...prev, isLoading: false }))
      return { canceled: true }
    } catch (error) {
      setState(prev => ({ ...prev, isLoading: false }))
      showToast('error', `加载失败：${(error as Error).message}`)
      History.logOperation('load', false, `加载失败：${(error as Error).message}`)
      refreshOperationLog()
      throw error
    }
  }, [showToast, refreshOperationLog])

  const checkUnsavedAndProceed = useCallback(async (
    action: 'load' | 'autosave' | 'new',
    executeAction: () => Promise<void>,
    filePath?: string,
    content?: string
  ) => {
    if (hasUnsavedChanges) {
      setState(prev => ({
        ...prev,
        unsavedChangesPrompt: {
          isOpen: true,
          pendingAction: action,
          pendingFilePath: filePath,
          pendingContent: content
        }
      }))
    } else {
      await executeAction()
    }
  }, [hasUnsavedChanges])

  const resolveUnsavedChanges = useCallback(async (choice: ConfirmationChoice) => {
    const prompt = state.unsavedChangesPrompt
    if (!prompt) return

    if (choice === 'keep') {
      setState(prev => ({ ...prev, unsavedChangesPrompt: null }))
      showToast('info', '已保留当前工作区')
      return
    }

    if (choice === 'saveas') {
    setState(prev => ({ ...prev, unsavedChangesPrompt: null }))
    const saveResult = await window.workspaceAPI.saveAs(
      History.serialize(state.workspace, state.history)
    ) as SaveAsResult
    if ('success' in saveResult && saveResult.success && saveResult.path) {
      markAsSaved()
      setState(prev => ({
        ...prev,
        currentWorkspacePath: saveResult.path
      }))
      showToast('success', '工作区已另存，继续加载')
      History.logOperation('save', true, `工作区已另存为：${saveResult.path}`)
      refreshOperationLog()
    } else if ('canceled' in saveResult && saveResult.canceled) {
      showToast('info', '已取消保存')
      return
    } else if ('success' in saveResult && !saveResult.success && 'error' in saveResult) {
      showToast('error', `保存失败：${saveResult.error}`)
      History.logOperation('save', false, `另存为失败：${saveResult.error}`)
      refreshOperationLog()
      return
    }
  }

    if (choice === 'overwrite') {
      setState(prev => ({ ...prev, unsavedChangesPrompt: null }))
    }

    if (prompt.pendingAction === 'load') {
      await performLoad(prompt.pendingFilePath, prompt.pendingContent)
    } else if (prompt.pendingAction === 'autosave' && prompt.pendingContent) {
      await performLoad(undefined, prompt.pendingContent)
    } else if (prompt.pendingAction === 'new') {
      setState({
        ...createInitialState()
      })
      showToast('info', '已创建新工作区')
      History.logOperation('new', true, '创建新工作区')
      refreshOperationLog()
    }
  }, [state.unsavedChangesPrompt, state.workspace, state.history, showToast, markAsSaved, performLoad, refreshOperationLog])



  const importTranscript = useCallback(async (transcriptText: string, configText: string) => {
    setState(prev => ({ ...prev, isLoading: true }))
    try {
      const config = Parser.parseConfig(configText)
      const result = Parser.parseTranscript(transcriptText, config, state.workspace.tags)

      result.warnings.forEach(warning => {
        showToast('warning', warning)
      })

      const merged = Parser.mergeParseResult(
        state.workspace.clips,
        state.workspace.tags,
        result.clips,
        result.tags
      )

      const newWorkspace: WorkspaceState = {
        ...state.workspace,
        clips: merged.clips,
        tags: merged.tags,
        config: { ...state.workspace.config, ...config }
      }

      const entry = History.createHistoryEntry(
        'import',
        { clips: state.workspace.clips, tags: state.workspace.tags },
        { clips: newWorkspace.clips, tags: newWorkspace.tags },
        `导入 ${result.clips.length} 个片段`
      )

      const newHistory = History.pushHistory(state.history, entry)

      setState(prev => ({
        ...prev,
        workspace: newWorkspace,
        history: newHistory,
        isLoading: false
      }))

      showToast('success', `成功导入 ${result.clips.length} 个片段`)
      History.logOperation('import', true, `成功导入 ${result.clips.length} 个片段`, {
        clipCount: result.clips.length,
        warningCount: result.warnings.length
      })
      refreshOperationLog()
      scheduleAutosave()

      return result
    } catch (error) {
      setState(prev => ({ ...prev, isLoading: false }))
      showToast('error', `导入失败：${(error as Error).message}`)
      History.logOperation('import', false, `导入失败：${(error as Error).message}`)
      refreshOperationLog()
      throw error
    }
  }, [state.workspace, state.history, showToast, scheduleAutosave, refreshOperationLog])

  const setClipStatus = useCallback((clipId: string, status: ClipStatus) => {
    const result = State.setClipStatus(state.workspace, clipId, status)

    if (result.error) {
      showToast('error', result.error)
      return
    }

    if (!result.changed) return

    const clip = state.workspace.clips.find(c => c.id === clipId)
    const entry = History.createHistoryEntry(
      'status_change',
      { clips: state.workspace.clips },
      { clips: result.state.clips },
      `${clip?.speaker ? `${clip.speaker}: ` : ''}状态变更为 ${status}`
    )

    const newHistory = History.pushHistory(state.history, entry)

    setState(prev => ({
      ...prev,
      workspace: result.state,
      history: newHistory
    }))

    showToast('success', '状态已更新')
    scheduleAutosave()
  }, [state.workspace, state.history, showToast, scheduleAutosave])

  const addTagToClip = useCallback((clipId: string, tagName: string) => {
    const result = State.addTagToClip(state.workspace, clipId, tagName)

    if (result.error) {
      showToast('error', result.error)
      return
    }

    if (!result.changed) return

    const entry = History.createHistoryEntry(
      'tag_add',
      { clips: state.workspace.clips, tags: state.workspace.tags },
      { clips: result.state.clips, tags: result.state.tags },
      `添加标签 "${tagName}"`
    )

    const newHistory = History.pushHistory(state.history, entry)

    setState(prev => ({
      ...prev,
      workspace: result.state,
      history: newHistory
    }))

    scheduleAutosave()
  }, [state.workspace, state.history, showToast, scheduleAutosave])

  const removeTagFromClip = useCallback((clipId: string, tagName: string) => {
    const result = State.removeTagFromClip(state.workspace, clipId, tagName)

    if (result.error) {
      showToast('error', result.error)
      return
    }

    if (!result.changed) return

    const entry = History.createHistoryEntry(
      'tag_remove',
      { clips: state.workspace.clips },
      { clips: result.state.clips },
      `移除标签 "${tagName}"`
    )

    const newHistory = History.pushHistory(state.history, entry)

    setState(prev => ({
      ...prev,
      workspace: result.state,
      history: newHistory
    }))

    scheduleAutosave()
  }, [state.workspace, state.history, showToast, scheduleAutosave])

  const deleteTag = useCallback((tagName: string) => {
    const result = State.deleteTag(state.workspace, tagName)

    if (result.error) {
      showToast('error', result.error)
      return
    }

    if (!result.changed) return

    const entry = History.createHistoryEntry(
      'tag_delete',
      { clips: state.workspace.clips, tags: state.workspace.tags },
      { clips: result.state.clips, tags: result.state.tags },
      `删除标签 "${tagName}"`
    )

    const newHistory = History.pushHistory(state.history, entry)

    setState(prev => ({
      ...prev,
      workspace: result.state,
      history: newHistory
    }))

    showToast('success', '标签已删除')
    scheduleAutosave()
  }, [state.workspace, state.history, showToast, scheduleAutosave])

  const addReference = useCallback((clipId: string, reference: string) => {
    const result = State.addReferenceToClip(state.workspace, clipId, reference)

    if (result.error) {
      showToast('error', result.error)
      return
    }

    if (!result.changed) return

    const entry = History.createHistoryEntry(
      'reference_add',
      { clips: state.workspace.clips },
      { clips: result.state.clips },
      '添加引用'
    )

    const newHistory = History.pushHistory(state.history, entry)

    setState(prev => ({
      ...prev,
      workspace: result.state,
      history: newHistory
    }))

    scheduleAutosave()
  }, [state.workspace, state.history, showToast, scheduleAutosave])

  const removeReference = useCallback((clipId: string, reference: string) => {
    const result = State.removeReferenceFromClip(state.workspace, clipId, reference)

    if (result.error) {
      showToast('error', result.error)
      return
    }

    if (!result.changed) return

    const entry = History.createHistoryEntry(
      'reference_remove',
      { clips: state.workspace.clips },
      { clips: result.state.clips },
      '移除引用'
    )

    const newHistory = History.pushHistory(state.history, entry)

    setState(prev => ({
      ...prev,
      workspace: result.state,
      history: newHistory
    }))

    scheduleAutosave()
  }, [state.workspace, state.history, showToast, scheduleAutosave])

  const updateClipContent = useCallback((clipId: string, content: string) => {
    const result = State.updateClipContent(state.workspace, clipId, content)

    if (result.error) {
      showToast('error', result.error)
      return
    }

    if (!result.changed) return

    const entry = History.createHistoryEntry(
      'clip_edit',
      { clips: state.workspace.clips },
      { clips: result.state.clips },
      '编辑片段内容'
    )

    const newHistory = History.pushHistory(state.history, entry)

    setState(prev => ({
      ...prev,
      workspace: result.state,
      history: newHistory
    }))

    scheduleAutosave()
  }, [state.workspace, state.history, showToast, scheduleAutosave])

  const updateClipNotes = useCallback((clipId: string, notes: string) => {
    const result = State.updateClipNotes(state.workspace, clipId, notes)

    if (result.error) {
      showToast('error', result.error)
      return
    }

    if (!result.changed) return

    const entry = History.createHistoryEntry(
      'clip_edit',
      { clips: state.workspace.clips },
      { clips: result.state.clips },
      '编辑片段备注'
    )

    const newHistory = History.pushHistory(state.history, entry)

    setState(prev => ({
      ...prev,
      workspace: result.state,
      history: newHistory
    }))

    scheduleAutosave()
  }, [state.workspace, state.history, showToast, scheduleAutosave])

  const deleteClip = useCallback((clipId: string) => {
    const result = State.deleteClip(state.workspace, clipId)

    if (result.error) {
      showToast('error', result.error)
      return
    }

    if (!result.changed) return

    const clip = state.workspace.clips.find(c => c.id === clipId)
    const entry = History.createHistoryEntry(
      'clip_delete',
      { clips: state.workspace.clips },
      { clips: result.state.clips },
      `删除片段 "${clip?.content.slice(0, 30)}..."`
    )

    const newHistory = History.pushHistory(state.history, entry)

    setState(prev => ({
      ...prev,
      workspace: result.state,
      history: newHistory,
      selectedClipId: prev.selectedClipId === clipId ? null : prev.selectedClipId
    }))

    showToast('success', '片段已删除')
    scheduleAutosave()
  }, [state.workspace, state.history, showToast, scheduleAutosave])

  const updateConfig = useCallback((config: Partial<MaterialConfig>) => {
    const result = State.updateConfig(state.workspace, config)

    if (!result.changed) return

    setState(prev => ({
      ...prev,
      workspace: result.state
    }))

    scheduleAutosave()
  }, [state.workspace, scheduleAutosave])

  const undo = useCallback(() => {
    const result = History.undo(state.history, state.workspace)

    if (!result.entry) {
      showToast('info', '没有可撤销的操作')
      return
    }

    setState(prev => ({
      ...prev,
      workspace: result.state,
      history: result.history
    }))

    showToast('success', `已撤销：${result.entry?.description}`)
    scheduleAutosave()
  }, [state.history, state.workspace, showToast, scheduleAutosave])

  const redo = useCallback(() => {
    const result = History.redo(state.history, state.workspace)

    if (!result.entry) {
      showToast('info', '没有可重做的操作')
      return
    }

    setState(prev => ({
      ...prev,
      workspace: result.state,
      history: result.history
    }))

    showToast('success', `已重做：${result.entry?.description}`)
    scheduleAutosave()
  }, [state.history, state.workspace, showToast, scheduleAutosave])

  const runCheck = useCallback((): { results: CheckResult[]; summary: Checker.CheckSummary } => {
    const { results, summary } = Checker.checkAllClips(state.workspace)
    return { results, summary }
  }, [state.workspace])

  const checkBeforeExport = useCallback((): { allowed: boolean; results: CheckResult[]; summary: Checker.CheckSummary } => {
    return Checker.checkBeforeExport(state.workspace)
  }, [state.workspace])

  const exportClips = useCallback((options: ExportOptions) => {
    return Exporter.exportClips(state.workspace, options)
  }, [state.workspace])

  const setCurrentView = useCallback((view: AppState['currentView']) => {
    setState(prev => ({ ...prev, currentView: view }))
  }, [])

  const setSelectedClipId = useCallback((clipId: string | null) => {
    setState(prev => ({ ...prev, selectedClipId: clipId }))
  }, [])

  const loadWorkspace = useCallback(async (filePath?: string) => {
    await checkUnsavedAndProceed(
      'load',
      async () => { await performLoad(filePath) },
      filePath
    )
  }, [checkUnsavedAndProceed, performLoad])

  const loadAutosave = useCallback(async () => {
    try {
      const result = await window.workspaceAPI.loadAutosave() as LoadAutosaveResult
      if (result.success && result.content) {
        const deserialized = History.deserialize(result.content)

        if (deserialized.success) {
          const content = result.content ?? undefined
          await checkUnsavedAndProceed(
            'autosave',
            async () => { await performLoad(undefined, content) },
            undefined,
            content
          )
          return { success: true }
        } else {
          return {
            success: false,
            error: deserialized.error,
            recoveryOptions: deserialized.recoveryOptions,
            corruptionDetails: deserialized.corruptionDetails,
            content: result.content ?? ''
          }
        }
      }
      return { success: false }
    } catch {
      return { success: false }
    }
  }, [checkUnsavedAndProceed, performLoad])

  const recoverWorkspace = useCallback((content: string, optionType: History.RecoveryOption['type']) => {
    const recovered = History.recoverWithOption(content, optionType)
    const newHash = History.computeStateHash(recovered.state)
    savedStateHashRef.current = newHash
    setState(prev => ({
      ...prev,
      workspace: recovered.state,
      history: recovered.history,
      lastSavedStateHash: newHash,
      loadError: null
    }))
    showToast('success', recovered.recoveryLog)
    History.logOperation('recover', true, recovered.recoveryLog, { optionType })
    refreshOperationLog()
    scheduleAutosave()
  }, [showToast, scheduleAutosave, refreshOperationLog])

  const saveWorkspaceAs = useCallback(async () => {
    const serialized = History.serialize(state.workspace, state.history)
    const result = await window.workspaceAPI.saveAs(serialized) as SaveAsResult

    if ('canceled' in result && result.canceled) {
      History.logOperation('save', false, '用户取消另存为')
      refreshOperationLog()
      return
    }

    if ('success' in result && result.success && result.path) {
      markAsSaved()
      setState(prev => ({
        ...prev,
        currentWorkspacePath: result.path
      }))
      showToast('success', `工作区已保存至：${result.path}`)
      History.logOperation('save', true, `工作区已保存至：${result.path}`, {
        path: result.path,
        clipCount: state.workspace.clips.length
      })
      refreshOperationLog()
    } else if ('success' in result && !result.success && 'error' in result && result.error) {
      let errorMessage: string = result.error
      if (errorMessage.includes('permission') || errorMessage.includes('权限') || errorMessage.includes('EPERM')) {
        errorMessage = '保存失败：没有写入权限，请检查文件是否被占用或选择其他位置'
      } else if (errorMessage.includes('ENOENT')) {
        errorMessage = '保存失败：目录不存在，请检查路径'
      } else if (errorMessage.includes('ENOSPC')) {
        errorMessage = '保存失败：磁盘空间不足'
      }
      showToast('error', `保存失败：${errorMessage}`)
      History.logOperation('save', false, `另存为失败：${errorMessage}`, { error: result.error })
      refreshOperationLog()
      throw new Error(errorMessage)
    }
  }, [state.workspace, state.history, showToast, markAsSaved, refreshOperationLog])

  const clearWorkspace = useCallback(() => {
    setState(prev => ({
      ...prev,
      workspace: State.createInitialState(),
      history: History.createInitialHistory(),
      selectedClipId: null
    }))
    showToast('info', '工作区已清空')
    History.logOperation('clear', true, '工作区已清空')
    refreshOperationLog()
    scheduleAutosave()
  }, [showToast, scheduleAutosave, refreshOperationLog])

  const newWorkspace = useCallback(async () => {
    await checkUnsavedAndProceed(
      'new',
      async () => {
        setState({
          ...createInitialState()
        })
        showToast('info', '已创建新工作区')
        History.logOperation('new', true, '创建新工作区')
        refreshOperationLog()
      }
    )
  }, [checkUnsavedAndProceed, showToast, refreshOperationLog])

  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current)
      }
    }
  }, [])

  return {
    state,
    hasUnsavedChanges,
    actions: {
      importTranscript,
      setClipStatus,
      addTagToClip,
      removeTagFromClip,
      deleteTag,
      addReference,
      removeReference,
      updateClipContent,
      updateClipNotes,
      deleteClip,
      updateConfig,
      undo,
      redo,
      runCheck,
      checkBeforeExport,
      exportClips,
      setCurrentView,
      setSelectedClipId,
      loadWorkspace,
      loadAutosave,
      recoverWorkspace,
      saveWorkspaceAs,
      clearWorkspace,
      newWorkspace,
      showToast,
      dismissToast,
      resolveUnsavedChanges,
      markAsSaved,
      refreshOperationLog
    },
    canUndo: History.canUndo(state.history),
    canRedo: History.canRedo(state.history),
    undoDescription: History.getUndoDescription(state.history),
    redoDescription: History.getRedoDescription(state.history),
    getTagUsageCount: (tagName: string) => {
      const lower = tagName.toLowerCase()
      return state.workspace.clips.filter(c =>
        c.tags.some(t => t.toLowerCase() === lower)
      ).length
    }
  }
}
