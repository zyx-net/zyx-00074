import React from 'react'
import type { HistoryState } from '../core/history'

interface HistoryViewProps {
  history: HistoryState
  canUndo: boolean
  canRedo: boolean
  undoDescription: string | null
  redoDescription: string | null
  onUndo: () => void
  onRedo: () => void
}

const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const typeLabels: Record<string, string> = {
  import: '导入',
  status_change: '状态变更',
  tag_add: '添加标签',
  tag_remove: '移除标签',
  tag_delete: '删除标签',
  reference_add: '添加引用',
  reference_remove: '移除引用',
  clip_edit: '编辑片段',
  clip_delete: '删除片段'
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  history,
  canUndo,
  canRedo,
  undoDescription,
  redoDescription,
  onUndo,
  onRedo
}) => {
  return (
    <div className="content-body">
      <div className="content-header" style={{ background: 'transparent', border: 'none', padding: '0 0 16px 0' }}>
        <h1 className="content-title">操作历史</h1>
        <div className="content-actions">
          <button
            className="btn btn-secondary"
            onClick={onUndo}
            disabled={!canUndo}
            title={undoDescription || '撤销'}
          >
            ↩ 撤销{undoDescription ? `: ${undoDescription}` : ''}
          </button>
          <button
            className="btn btn-secondary"
            onClick={onRedo}
            disabled={!canRedo}
            title={redoDescription || '重做'}
          >
            ↪ 重做{redoDescription ? `: ${redoDescription}` : ''}
          </button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">
            历史记录
            <span style={{ fontSize: '13px', fontWeight: 'normal', color: 'var(--text-muted)', marginLeft: '8px' }}>
              共 {history.entries.length} 条记录
            </span>
          </h2>
        </div>
        <div className="panel-body">
          {history.entries.length === 0 ? (
            <div className="empty-state" style={{ padding: '48px 24px' }}>
              <div className="empty-state-icon">📜</div>
              <h3 className="empty-state-title">暂无操作记录</h3>
              <p className="empty-state-desc">
                对素材的所有操作都会记录在这里，您可以随时撤销或重做。
              </p>
            </div>
          ) : (
            <div className="history-list">
              {[...history.entries].reverse().map((entry, index) => {
                const actualIndex = history.entries.length - 1 - index
                const isCurrent = actualIndex === history.currentIndex
                const isFuture = actualIndex > history.currentIndex
                return (
                  <div
                    key={index}
                    className={`history-item ${isCurrent ? 'current' : ''}`}
                    style={{ opacity: isFuture ? 0.5 : 1 }}
                  >
                    <span className="history-time">{formatTime(entry.timestamp)}</span>
                    <span
                      style={{
                        padding: '2px 6px',
                        background: 'var(--bg-tertiary)',
                        borderRadius: '4px',
                        fontSize: '11px',
                        flexShrink: 0
                      }}
                    >
                      {typeLabels[entry.type] || entry.type}
                    </span>
                    <span className="history-desc">{entry.description}</span>
                    {isCurrent && <span style={{ color: 'var(--primary-color)', fontSize: '11px' }}>● 当前</span>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
