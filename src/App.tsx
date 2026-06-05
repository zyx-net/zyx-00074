import React, { useEffect, useState } from 'react'
import { useAppState } from './hooks/useAppState'
import { Toast } from './components/Toast'
import { Modal } from './components/Modal'
import { DashboardView } from './views/DashboardView'
import { ImportView } from './views/ImportView'
import { ClipsView } from './views/ClipsView'
import { TagsView } from './views/TagsView'
import { CheckView } from './views/CheckView'
import { ExportView } from './views/ExportView'
import { HistoryView } from './views/HistoryView'
import type { RecoveryOption } from './core/history'

const App: React.FC = () => {
  const {
    state,
    hasUnsavedChanges,
    actions,
    canUndo,
    canRedo,
    undoDescription,
    redoDescription,
    getTagUsageCount
  } = useAppState()

  const [showRecoveryModal, setShowRecoveryModal] = useState(false)
  const [recoveryData, setRecoveryData] = useState<{
    error: string
    options: RecoveryOption[]
    content: string
  } | null>(null)

  useEffect(() => {
    const initApp = async () => {
      const result = await actions.loadAutosave()
      if (!result.success && result.error && result.recoveryOptions && result.content) {
        setRecoveryData({
          error: result.error,
          options: result.recoveryOptions,
          content: result.content
        })
        setShowRecoveryModal(true)
      }
    }
    initApp()
  }, [])

  const handleRecovery = (optionType: RecoveryOption['type']) => {
    if (recoveryData) {
      actions.recoverWorkspace(recoveryData.content, optionType)
      setShowRecoveryModal(false)
      setRecoveryData(null)
    }
  }

  const navItems = [
    { id: 'dashboard', label: '概览', icon: '📊', badge: null },
    { id: 'import', label: '导入', icon: '📥', badge: null },
    {
      id: 'clips',
      label: '片段',
      icon: '📋',
      badge: state.workspace.clips.length > 0 ? state.workspace.clips.length : null
    },
    {
      id: 'tags',
      label: '标签',
      icon: '🏷️',
      badge: state.workspace.tags.length > 0 ? state.workspace.tags.length : null
    },
    { id: 'check', label: '检查', icon: '🔍', badge: null },
    { id: 'export', label: '导出', icon: '📤', badge: null },
    {
      id: 'history',
      label: '历史',
      icon: '📜',
      badge: state.history.entries.length > 0 ? state.history.entries.length : null
    }
  ]

  const renderView = () => {
    switch (state.currentView) {
      case 'dashboard':
        return (
          <DashboardView
            workspace={state.workspace}
            onNavigate={view => actions.setCurrentView(view)}
          />
        )
      case 'import':
        return (
          <ImportView
            onImport={actions.importTranscript}
            isLoading={state.isLoading}
          />
        )
      case 'clips':
        return (
          <ClipsView
            clips={state.workspace.clips}
            tags={state.workspace.tags}
            selectedClipId={state.selectedClipId}
            onSelectClip={actions.setSelectedClipId}
            onStatusChange={actions.setClipStatus}
            onAddTag={actions.addTagToClip}
            onRemoveTag={actions.removeTagFromClip}
            onUpdateContent={actions.updateClipContent}
            onUpdateNotes={actions.updateClipNotes}
            onAddReference={actions.addReference}
            onRemoveReference={actions.removeReference}
            onDeleteClip={actions.deleteClip}
          />
        )
      case 'tags':
        return (
          <TagsView
            tags={state.workspace.tags}
            getTagUsageCount={getTagUsageCount}
            onDeleteTag={actions.deleteTag}
          />
        )
      case 'check':
        return (
          <CheckView
            clips={state.workspace.clips}
            runCheck={actions.runCheck}
            onSelectClip={(clipId) => {
              actions.setSelectedClipId(clipId)
              actions.setCurrentView('clips')
            }}
          />
        )
      case 'export':
        return (
          <ExportView
            clips={state.workspace.clips}
            tags={state.workspace.tags}
            exportClips={actions.exportClips}
            checkBeforeExport={actions.checkBeforeExport}
            onNavigateToCheck={() => actions.setCurrentView('check')}
          />
        )
      case 'history':
        return (
          <HistoryView
            history={state.history}
            canUndo={canUndo}
            canRedo={canRedo}
            undoDescription={undoDescription}
            redoDescription={redoDescription}
            onUndo={actions.undo}
            onRedo={actions.redo}
          />
        )
      default:
        return null
    }
  }

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-left">
          <div>
            <div className="app-title">🎙️ 采访素材摘录工具</div>
            <div className="app-subtitle">
              本地运行 · 隐私安全 · 不依赖在线 AI
              {state.currentWorkspacePath && (
                <span style={{ marginLeft: '12px' }}>
                  • 工作区: {state.currentWorkspacePath.split('\\').pop()}
                </span>
              )}
              {hasUnsavedChanges && (
                <span style={{ marginLeft: '12px', color: '#ff9800', fontWeight: 500 }}>
                  • ⚠ 有未保存改动
                </span>
              )}
              {state.lastSavedAt && !hasUnsavedChanges && (
                <span style={{ marginLeft: '12px' }}>
                  • 已保存 {new Date(state.lastSavedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="header-right">
          <button
            className="btn btn-secondary btn-sm"
            onClick={actions.undo}
            disabled={!canUndo}
            title={undoDescription || '撤销 (Ctrl+Z)'}
          >
            ↩ 撤销
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={actions.redo}
            disabled={!canRedo}
            title={redoDescription || '重做 (Ctrl+Y)'}
          >
            ↪ 重做
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={actions.saveWorkspaceAs}
          >
            💾 另存为
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              if (confirm('确定要清空当前工作区吗？所有数据将被清除。')) {
                actions.clearWorkspace()
              }
            }}
            disabled={state.workspace.clips.length === 0}
          >
            🗑 清空
          </button>
        </div>
      </header>

      <div className="app-main">
        <aside className="sidebar">
          <div className="sidebar-section">
            <div className="sidebar-title">功能导航</div>
            {navItems.map(item => (
              <div
                key={item.id}
                className={`nav-item ${state.currentView === item.id ? 'active' : ''}`}
                onClick={() => actions.setCurrentView(item.id as typeof state.currentView)}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
                {item.badge !== null && (
                  <span className="nav-badge">{item.badge}</span>
                )}
              </div>
            ))}
          </div>

          <div className="sidebar-section" style={{ marginTop: 'auto', borderBottom: 'none' }}>
            <div className="sidebar-title">工作区</div>
            <button
              className="btn btn-secondary"
              style={{ width: '100%', justifyContent: 'center', marginBottom: '8px' }}
              onClick={async () => {
                await actions.loadWorkspace()
              }}
            >
              📂 打开工作区
            </button>
            <button
              className="btn btn-secondary"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => actions.newWorkspace()}
            >
              ➕ 新建工作区
            </button>
          </div>
        </aside>

        <main className="content-area">
          {renderView()}
        </main>
      </div>

      <Toast
        toasts={state.toasts}
        onDismiss={actions.dismissToast}
      />

      <Modal
        isOpen={showRecoveryModal}
        onClose={() => {}}
        title="工作区文件损坏"
        footer={
          <button
            className="btn btn-primary"
            onClick={() => handleRecovery('empty')}
          >
            创建空工作区
          </button>
        }
      >
        {recoveryData && (
          <div>
            <div className="alert alert-error" style={{ marginBottom: '16px' }}>
              <span>⚠</span>
              <div>
                <strong>无法加载工作区</strong>
                <div style={{ fontSize: '12px', marginTop: '4px' }}>
                  {recoveryData.error}
                </div>
              </div>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <strong style={{ fontSize: '13px', display: 'block', marginBottom: '8px' }}>
                请选择恢复方式：
              </strong>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {recoveryData.options.map((option, index) => (
                  <button
                    key={index}
                    className={`btn ${option.type === 'empty' ? 'btn-secondary' : 'btn-primary'}`}
                    style={{ justifyContent: 'flex-start', textAlign: 'left' }}
                    onClick={() => handleRecovery(option.type)}
                  >
                    <div>
                      <strong>{option.label}</strong>
                      <div style={{ fontSize: '12px', opacity: 0.8, fontWeight: 'normal' }}>
                        {option.description}
                      </div>
                    </div>
                  </button>
                  ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={!!state.unsavedChangesPrompt?.isOpen}
        onClose={() => {}}
        title="未保存的改动"
        footer={null}
      >
        {state.unsavedChangesPrompt && (
          <div>
            <div className="alert alert-warning" style={{ marginBottom: '20px' }}>
              <span>⚠</span>
              <div>
                <strong>当前工作区有未保存的改动</strong>
                <div style={{ fontSize: '12px', marginTop: '4px' }}>
                  {state.unsavedChangesPrompt.pendingAction === 'load' && '加载新工作区将覆盖当前未保存的内容。'}
                  {state.unsavedChangesPrompt.pendingAction === 'autosave' && '恢复自动保存将覆盖当前未保存的内容。'}
                  {state.unsavedChangesPrompt.pendingAction === 'new' && '创建新工作区将覆盖当前未保存的内容。'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button
                className="btn btn-primary"
                onClick={() => actions.resolveUnsavedChanges('keep')}
                style={{ justifyContent: 'flex-start', textAlign: 'left' }}
              >
                <div>
                  <strong>🔒 保留当前</strong>
                  <div style={{ fontSize: '12px', opacity: 0.8, fontWeight: 'normal' }}>
                    取消本次操作，继续编辑当前工作区
                  </div>
                </div>
              </button>

              <button
                className="btn btn-secondary"
                onClick={() => actions.resolveUnsavedChanges('overwrite')}
                style={{ justifyContent: 'flex-start', textAlign: 'left' }}
              >
                <div>
                  <strong>⚠ 丢弃当前并加载</strong>
                  <div style={{ fontSize: '12px', opacity: 0.8, fontWeight: 'normal' }}>
                    放弃所有未保存改动，继续加载
                  </div>
                </div>
              </button>

              <button
                className="btn btn-secondary"
                onClick={() => actions.resolveUnsavedChanges('saveas')}
                style={{ justifyContent: 'flex-start', textAlign: 'left' }}
              >
                <div>
                  <strong>💾 先另存当前工作区</strong>
                  <div style={{ fontSize: '12px', opacity: 0.8, fontWeight: 'normal' }}>
                    保存当前工作区后再继续
                  </div>
                </div>
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default App
