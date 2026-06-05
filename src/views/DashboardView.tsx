import React from 'react'
import type { WorkspaceState, ClipStatus } from '../core/types'

interface DashboardViewProps {
  workspace: WorkspaceState
  onNavigate: (view: 'import' | 'clips' | 'check' | 'export') => void
}

const statusLabels: Record<ClipStatus, string> = {
  available: '可用',
  pending: '待核实',
  disabled: '禁用',
  published: '已发布'
}

export const DashboardView: React.FC<DashboardViewProps> = ({ workspace, onNavigate }) => {
  const statusCounts = workspace.clips.reduce(
    (acc, clip) => {
      acc[clip.status]++
      return acc
    },
    { available: 0, pending: 0, disabled: 0, published: 0 } as Record<ClipStatus, number>
  )

  const exportableCount = statusCounts.available + statusCounts.published
  const needsAttentionCount = statusCounts.pending

  return (
    <div className="content-body">
      <h1 className="content-title" style={{ marginBottom: '24px' }}>
        工作区概览
      </h1>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{workspace.clips.length}</div>
          <div className="stat-label">总片段数</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--success-color)' }}>
            {statusCounts.available}
          </div>
          <div className="stat-label">可用片段</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--warning-color)' }}>
            {statusCounts.pending}
          </div>
          <div className="stat-label">待核实</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--primary-color)' }}>
            {statusCounts.published}
          </div>
          <div className="stat-label">已发布</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ color: 'var(--disabled-color)' }}>
            {statusCounts.disabled}
          </div>
          <div className="stat-label">已禁用</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{workspace.tags.length}</div>
          <div className="stat-label">标签数量</div>
        </div>
      </div>

      <div className="panel" style={{ marginBottom: '24px' }}>
        <div className="panel-header">
          <h2 className="panel-title">快速操作</h2>
        </div>
        <div className="panel-body">
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button className="btn btn-primary btn-lg" onClick={() => onNavigate('import')}>
              📥 导入采访素材
            </button>
            <button className="btn btn-secondary btn-lg" onClick={() => onNavigate('clips')}>
              📋 查看片段列表
            </button>
            <button
              className="btn btn-secondary btn-lg"
              onClick={() => onNavigate('check')}
              disabled={workspace.clips.length === 0}
            >
              🔍 运行检查
            </button>
            <button
              className="btn btn-secondary btn-lg"
              onClick={() => onNavigate('export')}
              disabled={exportableCount === 0}
            >
              📤 导出发布包
            </button>
          </div>
        </div>
      </div>

      {needsAttentionCount > 0 && (
        <div className="alert alert-warning">
          <span>⚠</span>
          <div>
            <strong>需要注意</strong>：有 {needsAttentionCount} 个片段处于待核实状态，需要先核实后才能发布。
          </div>
        </div>
      )}

      {workspace.clips.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">📁</div>
          <h3 className="empty-state-title">还没有导入任何素材</h3>
          <p className="empty-state-desc">
            点击上方的"导入采访素材"按钮，开始导入采访转写文本。
            所有数据都在本地处理，确保您的内容安全。
          </p>
        </div>
      )}

      {workspace.clips.length > 0 && (
        <div className="panel">
          <div className="panel-header">
            <h2 className="panel-title">状态分布</h2>
          </div>
          <div className="panel-body">
            <div style={{ display: 'flex', gap: '8px', height: '24px', borderRadius: '4px', overflow: 'hidden' }}>
              {(['available', 'pending', 'disabled', 'published'] as ClipStatus[]).map(status => {
                const count = statusCounts[status]
                const percentage = workspace.clips.length > 0 ? (count / workspace.clips.length) * 100 : 0
                const colors: Record<ClipStatus, string> = {
                  available: 'var(--success-color)',
                  pending: 'var(--warning-color)',
                  disabled: 'var(--disabled-color)',
                  published: 'var(--primary-color)'
                }
                return (
                  <div
                    key={status}
                    title={`${statusLabels[status]}: ${count} (${percentage.toFixed(1)}%)`}
                    style={{
                      backgroundColor: colors[status],
                      width: `${percentage}%`,
                      minWidth: count > 0 ? '4px' : '0',
                      transition: 'width 0.3s ease'
                    }}
                  />
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: '16px', marginTop: '12px', flexWrap: 'wrap' }}>
              {(['available', 'pending', 'disabled', 'published'] as ClipStatus[]).map(status => (
                <div key={status} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div
                    style={{
                      width: '12px',
                      height: '12px',
                      borderRadius: '2px',
                      backgroundColor:
                        status === 'available' ? 'var(--success-color)' :
                        status === 'pending' ? 'var(--warning-color)' :
                        status === 'disabled' ? 'var(--disabled-color)' :
                        'var(--primary-color)'
                    }}
                  />
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    {statusLabels[status]}: {statusCounts[status]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
