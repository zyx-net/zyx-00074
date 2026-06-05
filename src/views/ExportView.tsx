import React, { useState, useMemo } from 'react'
import type { ExportOptions, ClipStatus, CheckResult } from '../core/types'
import type { CheckSummary } from '../core/checker'
import type { ExportResult } from '../core/exporter'

interface ExportViewProps {
  clips: any[]
  tags: string[]
  exportClips: (options: ExportOptions) => ExportResult
  checkBeforeExport: () => { allowed: boolean; results: CheckResult[]; summary: CheckSummary }
  onNavigateToCheck: () => void
}

const statusLabels: Record<ClipStatus, string> = {
  available: '可用',
  pending: '待核实',
  disabled: '禁用',
  published: '已发布'
}

export const ExportView: React.FC<ExportViewProps> = ({
  clips,
  tags,
  exportClips,
  checkBeforeExport,
  onNavigateToCheck
}) => {
  const [format, setFormat] = useState<'markdown' | 'json'>('markdown')
  const [includeStatus, setIncludeStatus] = useState<ClipStatus[]>(['available', 'published'])
  const [includeTags, setIncludeTags] = useState<string[]>([])
  const [preview, setPreview] = useState<string>('')
  const [hasChecked, setHasChecked] = useState(false)
  const [checkResult, setCheckResult] = useState<{
    allowed: boolean
    results: CheckResult[]
    summary: CheckSummary
  } | null>(null)

  const options: ExportOptions = useMemo(() => ({
    format,
    includeStatus,
    includeTags: includeTags.length > 0 ? includeTags : undefined
  }), [format, includeStatus, includeTags])

  const handleCheck = () => {
    const result = checkBeforeExport()
    setCheckResult(result)
    setHasChecked(true)
  }

  const handlePreview = () => {
    const result = exportClips(options)
    setPreview(result.content)
  }

  const handleExport = async () => {
    if (!hasChecked) {
      const result = checkBeforeExport()
      setCheckResult(result)
      setHasChecked(true)
      if (!result.allowed) {
        return
      }
    } else if (checkResult && !checkResult.allowed) {
      return
    }

    const result = exportClips(options)
    const filters = format === 'markdown'
      ? [{ name: 'Markdown 文件', extensions: ['md'] }]
      : [{ name: 'JSON 文件', extensions: ['json'] }]

    const saveResult = await window.exportAPI.save(result.fileName, result.content, filters)

    if ('success' in saveResult && saveResult.success) {
      // 成功提示由父组件处理
    }
  }

  const toggleStatus = (status: ClipStatus) => {
    setIncludeStatus(prev =>
      prev.includes(status)
        ? prev.filter(s => s !== status)
        : [...prev, status]
    )
    setHasChecked(false)
    setCheckResult(null)
  }

  const toggleTag = (tag: string) => {
    setIncludeTags(prev =>
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    )
    setHasChecked(false)
    setCheckResult(null)
  }

  const exportableCount = clips.filter(c => includeStatus.includes(c.status)).length

  return (
    <div className="content-body">
      <div className="panel" style={{ marginBottom: '16px' }}>
        <div className="panel-header">
          <h2 className="panel-title">导出设置</h2>
        </div>
        <div className="panel-body">
          <div className="form-group">
            <label className="form-label">导出格式</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className={`btn ${format === 'markdown' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => { setFormat('markdown'); setHasChecked(false); setCheckResult(null) }}
              >
                Markdown (.md)
              </button>
              <button
                className={`btn ${format === 'json' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => { setFormat('json'); setHasChecked(false); setCheckResult(null) }}
              >
                JSON (.json)
              </button>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">包含状态</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {(['available', 'pending', 'disabled', 'published'] as ClipStatus[]).map(status => (
                <label
                  key={status}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    background: 'var(--bg-tertiary)',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={includeStatus.includes(status)}
                    onChange={() => toggleStatus(status)}
                  />
                  <span>{statusLabels[status]}</span>
                </label>
              ))}
            </div>
            <div className="form-hint">
              待核实和禁用的片段默认不包含在导出中
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">包含标签（可选，不选则包含所有）</label>
            {tags.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                暂无标签
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {tags.map(tag => (
                  <label
                    key={tag}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 12px',
                      background: 'var(--bg-tertiary)',
                      borderRadius: 'var(--radius-md)',
                      cursor: 'pointer'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={includeTags.includes(tag)}
                      onChange={() => toggleTag(tag)}
                    />
                    <span>{tag}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              将导出 <strong>{exportableCount}</strong> 个片段
            </div>
            <button
              className="btn btn-secondary"
              onClick={handlePreview}
              disabled={exportableCount === 0}
            >
              👁 预览
            </button>
            <button
              className="btn btn-secondary"
              onClick={handleCheck}
              disabled={clips.length === 0}
            >
              🔍 预检
            </button>
            <button
              className="btn btn-primary"
              onClick={handleExport}
              disabled={clips.length === 0 || Boolean(hasChecked && checkResult && !checkResult.allowed)}
            >
              📤 导出发布包
            </button>
          </div>
        </div>
      </div>

      {hasChecked && checkResult && (
        <div className={`alert ${checkResult.allowed ? 'alert-success' : 'alert-error'}`} style={{ marginBottom: '16px' }}>
          <span>{checkResult.allowed ? '✓' : '✕'}</span>
          <div>
            <strong>{checkResult.allowed ? '可以导出' : '存在问题，暂不能导出'}</strong>
            <div style={{ fontSize: '12px', marginTop: '4px' }}>
              {checkResult.summary.errorCount} 个错误，{checkResult.summary.warningCount} 个警告
              {!checkResult.allowed && (
                <button
                  className="btn btn-sm btn-secondary"
                  style={{ marginLeft: '8px' }}
                  onClick={onNavigateToCheck}
                >
                  查看详情
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {preview && (
        <div className="panel">
          <div className="panel-header">
            <h3 className="panel-title">
              预览（前 3 个片段）
              <button
                className="btn btn-sm btn-secondary"
                style={{ marginLeft: '8px' }}
                onClick={() => setPreview('')}
              >
                关闭
              </button>
            </h3>
          </div>
          <div className="panel-body">
            <div className="preview-box">{preview}</div>
          </div>
        </div>
      )}

      {clips.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">📤</div>
          <h3 className="empty-state-title">暂无可导出的内容</h3>
          <p className="empty-state-desc">
            请先导入采访素材并处理片段，然后再导出。
          </p>
        </div>
      )}
    </div>
  )
}
