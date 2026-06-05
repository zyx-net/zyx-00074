import React, { useState, useMemo, useEffect, useRef } from 'react'
import type { ExportOptions, ClipStatus, CheckResult, ExportFormat } from '../core/types'
import type { CheckSummary } from '../core/checker'
import type { ExportResult, ExportConflict } from '../core/exporter'
import { checkExportConflicts, saveExportPreferences, loadExportPreferences, clearExportPreferences } from '../core/exporter'
import { logOperation } from '../core/history'

interface ExportViewProps {
  clips: any[]
  tags: string[]
  exportClips: (options: ExportOptions) => ExportResult
  checkBeforeExport: (options: ExportOptions) => { allowed: boolean; results: CheckResult[]; summary: CheckSummary }
  onNavigateToCheck: () => void
  state: any
}

const statusLabels: Record<ClipStatus, string> = {
  available: '可用',
  pending: '待核实',
  disabled: '禁用',
  published: '已发布'
}

const formatLabels: Record<ExportFormat, string> = {
  markdown: 'Markdown',
  json: 'JSON',
  manifest: '发布清单'
}

export const ExportView: React.FC<ExportViewProps> = ({
  clips,
  tags,
  exportClips,
  checkBeforeExport,
  onNavigateToCheck,
  state
}) => {
  const [format, setFormat] = useState<ExportFormat>('markdown')
  const [includeStatus, setIncludeStatus] = useState<ClipStatus[]>(['available', 'published'])
  const [includeTags, setIncludeTags] = useState<string[]>([])
  const [materialTitle, setMaterialTitle] = useState<string>('未命名素材')
  const [excludeSensitive, setExcludeSensitive] = useState<boolean>(true)
  const [preview, setPreview] = useState<string>('')
  const [hasChecked, setHasChecked] = useState(false)
  const [checkResult, setCheckResult] = useState<{
    allowed: boolean
    results: CheckResult[]
    summary: CheckSummary
  } | null>(null)
  const [conflicts, setConflicts] = useState<ExportConflict[]>([])
  const [showConflictModal, setShowConflictModal] = useState(false)
  const [preferencesLoaded, setPreferencesLoaded] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const skipSaveRef = useRef(false)

  useEffect(() => {
    if (!preferencesLoaded) {
      const prefs = loadExportPreferences()
      if (prefs.format) setFormat(prefs.format as ExportFormat)
      if (prefs.includeStatus) setIncludeStatus(prefs.includeStatus)
      if (prefs.includeTags) setIncludeTags(prefs.includeTags)
      if (prefs.excludeSensitive !== undefined) setExcludeSensitive(prefs.excludeSensitive)
      if (prefs.materialTitle) setMaterialTitle(prefs.materialTitle)
      setPreferencesLoaded(true)
    }
  }, [preferencesLoaded])

  const options: ExportOptions = useMemo(() => ({
    format,
    includeStatus,
    includeTags: includeTags.length > 0 ? includeTags : undefined,
    materialTitle,
    excludeSensitive
  }), [format, includeStatus, includeTags, materialTitle, excludeSensitive])

  useEffect(() => {
    if (state?.workspace) {
      const detectedConflicts = checkExportConflicts(state.workspace, options)
      setConflicts(detectedConflicts)
    }
  }, [options, state])

  useEffect(() => {
    if (preferencesLoaded && !skipSaveRef.current) {
      saveExportPreferences({
        format,
        includeStatus,
        includeTags,
        excludeSensitive,
        materialTitle
      })
    }
  }, [format, includeStatus, includeTags, excludeSensitive, materialTitle, preferencesLoaded])

  const handleFormatChange = (newFormat: ExportFormat) => {
    skipSaveRef.current = false
    setFormat(newFormat)
    setHasChecked(false)
    setCheckResult(null)
    setPreview('')
  }

  const handleCheck = () => {
    const result = checkBeforeExport(options)
    setCheckResult(result)
    setHasChecked(true)
  }

  const handlePreview = () => {
    const result = exportClips(options)
    setPreview(result.content)
  }

  const handleExport = async (skipConflictCheck: boolean = false) => {
    if (!hasChecked) {
      const result = checkBeforeExport(options)
      setCheckResult(result)
      setHasChecked(true)
      if (!result.allowed) {
        return { success: false, error: '预检不通过' }
      }
    } else if (checkResult && !checkResult.allowed) {
      return { success: false, error: '预检不通过' }
    }

    if (!skipConflictCheck) {
      const detectedConflicts = checkExportConflicts(state.workspace, options)
      const hasBlockingConflicts = detectedConflicts.some(
        c => c.type === 'empty_result'
      )

      if (detectedConflicts.length > 0) {
        setConflicts(detectedConflicts)
        setShowConflictModal(true)
        if (hasBlockingConflicts) {
          logOperation('export', false, '导出被阻止：筛选条件下没有可导出的片段')
          return { success: false, error: '筛选条件下没有可导出的片段' }
        }
        return { success: false, needConfirm: true }
      }
    }

    setExportError(null)
    saveExportPreferences({
      format,
      includeStatus,
      includeTags,
      excludeSensitive,
      materialTitle
    })

    try {
      const result = exportClips(options)
      
      const filters = format === 'markdown'
        ? [{ name: 'Markdown 文件', extensions: ['md'] }]
        : [{ name: 'JSON 文件', extensions: ['json'] }]

      const saveResult = await window.exportAPI.save(result.fileName, result.content, filters)

      if ('canceled' in saveResult && saveResult.canceled) {
        logOperation('export', false, '用户取消导出')
        return { success: false, canceled: true }
      }

      if ('success' in saveResult && saveResult.success) {
        logOperation('export', true, `导出成功：${saveResult.path}`, {
          path: saveResult.path,
          clipCount: result.clipCount,
          format
        })
        return { success: true, path: saveResult.path }
      } else if ('success' in saveResult && !saveResult.success && 'error' in saveResult) {
        let errorMessage = saveResult.error || '未知错误'
        if (errorMessage.includes('permission') || errorMessage.includes('权限') || errorMessage.includes('EPERM')) {
          errorMessage = '保存失败：没有写入权限，请检查文件是否被占用或选择其他位置'
        } else if (errorMessage.includes('ENOENT')) {
          errorMessage = '保存失败：目录不存在，请检查路径'
        } else if (errorMessage.includes('ENOSPC')) {
          errorMessage = '保存失败：磁盘空间不足'
        }
        logOperation('export', false, `导出失败：${errorMessage}`, { error: saveResult.error })
        setExportError(errorMessage)
        return { success: false, error: errorMessage }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '导出失败'
      logOperation('export', false, `导出异常：${errorMsg}`)
      setExportError(errorMsg)
      return { success: false, error: errorMsg }
    }
  }

  const toggleStatus = (status: ClipStatus) => {
    skipSaveRef.current = false
    const newStatus = includeStatus.includes(status)
      ? includeStatus.filter(s => s !== status)
      : [...includeStatus, status]
    setIncludeStatus(newStatus)
    setHasChecked(false)
    setCheckResult(null)
  }

  const toggleTag = (tag: string) => {
    skipSaveRef.current = false
    const newTags = includeTags.includes(tag)
      ? includeTags.filter(t => t !== tag)
      : [...includeTags, tag]
    setIncludeTags(newTags)
    setHasChecked(false)
    setCheckResult(null)
  }

  const handleMaterialTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    skipSaveRef.current = false
    setMaterialTitle(e.target.value)
  }

  const handleExcludeSensitiveChange = () => {
    skipSaveRef.current = false
    setExcludeSensitive(!excludeSensitive)
    setHasChecked(false)
    setCheckResult(null)
  }

  const handleResolveConflict = (proceed: boolean) => {
    setShowConflictModal(false)
    if (proceed) {
      handleExport(true)
    }
  }

  const exportableCount = clips.filter(c => {
    if (!includeStatus.includes(c.status)) return false
    if (includeTags.length > 0) {
      const clipTags = new Set(c.tags.map((t: string) => t.toLowerCase()))
      const hasTag = includeTags.some(t => clipTags.has(t.toLowerCase()))
      if (!hasTag) return false
    }
    if (excludeSensitive && state?.workspace?.config?.sensitiveWords) {
      const sensitiveWords = state.workspace.config.sensitiveWords as string[]
      const content = c.content.toLowerCase()
      const notes = c.notes?.toLowerCase() || ''
      const hasSensitive = sensitiveWords.some(w => 
        content.includes(w.toLowerCase()) || notes.includes(w.toLowerCase())
      )
      if (hasSensitive) return false
    }
    return true
  }).length

  const hasBlockingConflict = conflicts.some(c => c.type === 'empty_result')

  return (
    <div className="content-body">
      <div className="panel" style={{ marginBottom: '16px' }}>
        <div className="panel-header">
          <h2 className="panel-title">导出设置</h2>
        </div>
        <div className="panel-body">
          <div className="form-group">
            <label className="form-label">素材标题</label>
            <input
              type="text"
              className="form-input"
              value={materialTitle}
              onChange={handleMaterialTitleChange}
              placeholder="请输入素材标题，将用于文件名和导出内容"
              style={{ width: '100%' }}
              data-testid="export-material-title"
            />
            <div className="form-hint">
              标题将作为导出文件名的一部分
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">导出格式</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {(['markdown', 'json', 'manifest'] as ExportFormat[]).map(fmt => (
                <button
                  key={fmt}
                  className={`btn ${format === fmt ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => handleFormatChange(fmt)}
                  data-testid={`export-format-${fmt}`}
                >
                  {fmt === 'manifest' ? '📋 ' : fmt === 'json' ? '📄 ' : '📝 '}
                  {formatLabels[fmt]}
                  {fmt === 'manifest' && <span style={{ fontSize: '11px', opacity: 0.8, marginLeft: '4px' }}>(推荐)</span>}
                </button>
              ))}
            </div>
            <div className="form-hint">
              {format === 'manifest' && '发布清单包含：片段列表、标签统计、配置快照、检查摘要、最近操作日志'}
              {format === 'json' && 'JSON 格式包含完整片段数据和发布清单元数据'}
              {format === 'markdown' && 'Markdown 格式适合阅读和文档生成'}
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
                    data-testid={`export-status-${status}`}
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
            <label className="form-label">敏感词处理</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={excludeSensitive}
                onChange={handleExcludeSensitiveChange}
                data-testid="export-exclude-sensitive"
              />
              <span>排除包含敏感词的片段</span>
            </label>
            <div className="form-hint">
              {state?.workspace?.config?.sensitiveWords?.length > 0 
                ? `当前配置了 ${state.workspace.config.sensitiveWords.length} 个敏感词`
                : '当前未配置敏感词'}
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
                    data-testid={`export-tag-${tag}`}
                  />
                  <span>{tag}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }} data-testid="export-count-info">
              将导出 <strong>{exportableCount}</strong> 个片段
              {conflicts.length > 0 && !hasBlockingConflict && (
                <span style={{ color: 'var(--warning-color)', marginLeft: '8px' }}>
                  ⚠ 存在 {conflicts.length} 个警告
                </span>
              )}
              {hasBlockingConflict && (
                <span style={{ color: 'var(--error-color)', marginLeft: '8px' }}>
                  ✕ 无法导出
                </span>
              )}
            </div>
            <button
              className="btn btn-secondary"
              onClick={handlePreview}
              disabled={exportableCount === 0}
              data-testid="export-preview-btn"
            >
              👁 预览
            </button>
            <button
              className="btn btn-secondary"
              onClick={handleCheck}
              disabled={clips.length === 0}
              data-testid="export-check-btn"
            >
              🔍 预检
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => {
                skipSaveRef.current = true
                clearExportPreferences()
                setFormat('markdown')
                setIncludeStatus(['available', 'published'])
                setIncludeTags([])
                setExcludeSensitive(true)
                setMaterialTitle('未命名素材')
                setHasChecked(false)
                setCheckResult(null)
                setPreview('')
                setExportError(null)
              }}
              title="重置导出设置"
              data-testid="export-reset-btn"
            >
              🔄 重置
            </button>
            <button
              className="btn btn-primary"
              onClick={() => handleExport()}
              disabled={clips.length === 0 || Boolean(hasChecked && checkResult && !checkResult.allowed)}
              data-testid="export-submit-btn"
            >
              📤 导出发布包
            </button>
          </div>
        </div>
      </div>

      {conflicts.length > 0 && (
        <div className="alert alert-warning" style={{ marginBottom: '16px' }} data-testid="export-conflict-alert">
          <span>⚠</span>
          <div>
            <strong>导出设置存在以下问题：</strong>
            <ul style={{ margin: '8px 0 0 20px', padding: 0, fontSize: '13px' }}>
              {conflicts.map((conflict, index) => (
                <li key={index} style={{ marginBottom: '4px' }}>
                  {conflict.message}
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                    建议：{conflict.action}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

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
            <div className="preview-box" style={{ 
              maxHeight: '500px', 
              overflowY: 'auto',
              background: 'var(--bg-secondary)',
              padding: '16px',
              borderRadius: 'var(--radius-md)',
              fontFamily: 'monospace',
              fontSize: '13px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word'
            }}>{preview}</div>
          </div>
        </div>
      )}

      {exportError && (
        <div className="alert alert-error" style={{ marginBottom: '16px' }} data-testid="export-error-alert">
          <span>✕</span>
          <div>
            <strong>导出失败</strong>
            <div style={{ fontSize: '13px', marginTop: '4px' }}>{exportError}</div>
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

      {showConflictModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }} data-testid="export-conflict-modal">
          <div style={{
            background: 'var(--bg-primary)',
            borderRadius: 'var(--radius-lg)',
            padding: '24px',
            maxWidth: '500px',
            width: '90%',
            maxHeight: '80vh',
            overflowY: 'auto'
          }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '18px' }}>
              {hasBlockingConflict ? '⚠ 无法导出' : '⚠ 导出警告'}
            </h3>
            
            <div style={{ marginBottom: '20px' }}>
              {conflicts.map((conflict, index) => (
                <div key={index} style={{
                  padding: '12px',
                  background: 'var(--bg-secondary)',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: '8px'
                }}>
                  <div style={{ fontWeight: 500, marginBottom: '4px' }}>
                    {conflict.type === 'empty_result' && '❌ '}
                    {conflict.type === 'pending_included' && '⚠️ '}
                    {conflict.type === 'disabled_included' && '⚠️ '}
                    {conflict.type === 'sensitive_mismatch' && '⚠️ '}
                    {conflict.message}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {conflict.action}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-secondary"
                onClick={() => handleResolveConflict(false)}
                data-testid="export-conflict-cancel-btn"
              >
                取消
              </button>
              {!hasBlockingConflict && (
                <button
                  className="btn btn-primary"
                  onClick={() => handleResolveConflict(true)}
                  data-testid="export-conflict-proceed-btn"
                >
                  仍然导出
                </button>
              )}
              {hasBlockingConflict && (
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    skipSaveRef.current = true
                    clearExportPreferences()
                    setShowConflictModal(false)
                    setIncludeStatus(['available', 'published'])
                    setExcludeSensitive(true)
                    setIncludeTags([])
                    setFormat('markdown')
                    setMaterialTitle('未命名素材')
                  }}
                  data-testid="export-conflict-reset-btn"
                >
                  重置筛选条件
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
