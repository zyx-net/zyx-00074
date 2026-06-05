import { useState, useEffect, useCallback, useRef } from 'react'
import type { WorkspaceState, ClipStatus, MaterialConfig, ExportOptions, CheckResult } from '../core/types'
import * as State from '../core/state'
import * as History from '../core/history'
import * as Parser from '../core/parser'
import * as Checker from '../core/checker'
import * as Exporter from '../core/exporter'

export interface ToastMessage {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
}

export interface LoadError {
  error: string
  recoveryOptions: History.RecoveryOption[]
  content: string
}

export interface AppState {
  workspace: WorkspaceState
  history: History.HistoryState
  selectedClipId: string | null
  currentView: 'dashboard' | 'import' | 'clips' | 'tags' | 'check' | 'export' | 'history'
  toasts: ToastMessage[]
  isLoading: boolean
  lastSavedAt: number | null
  currentWorkspacePath?: string
  loadError: LoadError | null
}

const createInitialState = (): AppState => ({
  workspace: State.createInitialState(),
  history: History.createInitialHistory(),
  selectedClipId: null,
  currentView: 'dashboard',
  toasts: [],
  isLoading: false,
  lastSavedAt: null,
  loadError: null
})

export const useAppState = () => {
  const [state, setState] = useState<AppState>(createInitialState)
  const autosaveTimerRef = useRef<NodeJS.Timeout | null>(null)

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

  const scheduleAutosave = useCallback(() => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current)
    }
    autosaveTimerRef.current = setTimeout(() => {
      const serialized = History.serialize(state.workspace, state.history)
      window.workspaceAPI.autosave(serialized)
      setState(prev => ({ ...prev, lastSavedAt: Date.now() }))
    }, 1000)
  }, [state.workspace, state.history])



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
      scheduleAutosave()

      return result
    } catch (error) {
      setState(prev => ({ ...prev, isLoading: false }))
      showToast('error', `导入失败：${(error as Error).message}`)
      throw error
    }
  }, [state.workspace, state.history, showToast, scheduleAutosave])

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
    setState(prev => ({ ...prev, isLoading: true }))
    try {
      const result = await window.workspaceAPI.load(filePath)
      if ('canceled' in result && result.canceled) {
        setState(prev => ({ ...prev, isLoading: false }))
        return
      }

      if ('success' in result && result.success && result.content) {
        const deserialized = History.deserialize(result.content)

        if (deserialized.success) {
          setState(prev => ({
            ...prev,
            workspace: deserialized.state,
            history: deserialized.history,
            currentWorkspacePath: result.path,
            isLoading: false
          }))
          showToast('success', '工作区已加载')
          return
        } else {
          setState(prev => ({
            ...prev,
            isLoading: false,
            loadError: {
              error: deserialized.error,
              recoveryOptions: deserialized.recoveryOptions,
              content: result.content || ''
            }
          }))
          return
        }
      }

      if ('error' in result && result.error) {
        throw new Error(result.error)
      }
    } catch (error) {
      setState(prev => ({ ...prev, isLoading: false }))
      showToast('error', `加载失败：${(error as Error).message}`)
      throw error
    }
  }, [showToast])

  const loadAutosave = useCallback(async () => {
    try {
      const result = await window.workspaceAPI.loadAutosave()
      if (result.success && result.content) {
        const deserialized = History.deserialize(result.content)

        if (deserialized.success) {
          setState(prev => ({
            ...prev,
            workspace: deserialized.state,
            history: deserialized.history
          }))
          return { success: true }
        } else {
          return {
            success: false,
            error: deserialized.error,
            recoveryOptions: deserialized.recoveryOptions,
            content: result.content
          }
        }
      }
      return { success: false }
    } catch {
      return { success: false }
    }
  }, [])

  const recoverWorkspace = useCallback((content: string, optionType: History.RecoveryOption['type']) => {
    const recovered = History.recoverWithOption(content, optionType)
    setState(prev => ({
      ...prev,
      workspace: recovered.state,
      history: recovered.history,
      loadError: null
    }))
    showToast('success', '工作区已恢复')
    scheduleAutosave()
  }, [showToast, scheduleAutosave])

  const saveWorkspaceAs = useCallback(async () => {
    const serialized = History.serialize(state.workspace, state.history)
    const result = await window.workspaceAPI.saveAs(serialized)

    if ('canceled' in result && result.canceled) {
      return
    }

    if ('success' in result && result.success) {
      setState(prev => ({
        ...prev,
        currentWorkspacePath: result.path,
        lastSavedAt: Date.now()
      }))
      showToast('success', '工作区已保存')
    } else if ('error' in result) {
      showToast('error', `保存失败：${result.error}`)
    }
  }, [state.workspace, state.history, showToast])

  const clearWorkspace = useCallback(() => {
    setState(prev => ({
      ...prev,
      workspace: State.createInitialState(),
      history: History.createInitialHistory(),
      selectedClipId: null
    }))
    showToast('info', '工作区已清空')
    scheduleAutosave()
  }, [showToast, scheduleAutosave])

  const newWorkspace = useCallback(() => {
    setState({
      ...createInitialState()
    })
    showToast('info', '已创建新工作区')
  }, [showToast])

  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current)
      }
    }
  }, [])

  return {
    state,
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
      dismissToast
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
