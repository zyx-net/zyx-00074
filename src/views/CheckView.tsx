import React, { useState, useEffect } from 'react'
import type { CheckResult } from '../core/types'
import type { CheckSummary } from '../core/checker'
import type { Clip } from '../core/types'

interface CheckViewProps {
  clips: Clip[]
  runCheck: () => { results: CheckResult[]; summary: CheckSummary }
  onSelectClip: (clipId: string) => void
}

const typeLabels: Record<CheckResult['type'], string> = {
  sensitive_word: '敏感词',
  missing_reference: '缺引用',
  other: '其他'
}

const severityIcons: Record<CheckResult['severity'], string> = {
  error: '✕',
  warning: '⚠',
  info: 'ℹ'
}

const severityLabels: Record<CheckResult['severity'], string> = {
  error: '错误',
  warning: '警告',
  info: '提示'
}

export const CheckView: React.FC<CheckViewProps> = ({ clips, runCheck, onSelectClip }) => {
  const [results, setResults] = useState<CheckResult[]>([])
  const [summary, setSummary] = useState<CheckSummary | null>(null)
  const [hasRun, setHasRun] = useState(false)

  useEffect(() => {
    if (clips.length > 0 && !hasRun) {
      handleRunCheck()
    }
  }, [clips.length])

  const handleRunCheck = () => {
    const { results, summary } = runCheck()
    setResults(results)
    setSummary(summary)
    setHasRun(true)
  }

  const errorResults = results.filter(r => r.severity === 'error')
  const warningResults = results.filter(r => r.severity === 'warning')
  const infoResults = results.filter(r => r.severity === 'info')

  return (
    <div className="content-body">
      <div className="content-header" style={{ background: 'transparent', border: 'none', padding: '0 0 16px 0' }}>
        <h1 className="content-title">内容检查</h1>
        <div className="content-actions">
          <button className="btn btn-primary" onClick={handleRunCheck}>
            🔄 重新检查
          </button>
        </div>
      </div>

      {clips.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🔍</div>
          <h3 className="empty-state-title">暂无可检查的内容</h3>
          <p className="empty-state-desc">
            请先导入采访素材，然后运行检查。
          </p>
        </div>
      ) : (
        <>
          {summary && (
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-value" style={{ color: 'var(--text-primary)' }}>
                  {summary.totalClips}
                </div>
                <div className="stat-label">总片段数</div>
              </div>
              <div className="stat-card">
                <div className="stat-value" style={{ color: 'var(--danger-color)' }}>
                  {summary.errorCount}
                </div>
                <div className="stat-label">错误</div>
              </div>
              <div className="stat-card">
                <div className="stat-value" style={{ color: 'var(--warning-color)' }}>
                  {summary.warningCount}
                </div>
                <div className="stat-label">警告</div>
              </div>
              <div className="stat-card">
                <div className="stat-value" style={{ color: 'var(--info-color)' }}>
                  {summary.infoCount}
                </div>
                <div className="stat-label">提示</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{summary.byType.sensitive_word}</div>
                <div className="stat-label">敏感词问题</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{summary.byType.missing_reference}</div>
                <div className="stat-label">缺引用问题</div>
              </div>
            </div>
          )}

          {summary && summary.clipsWithIssues.length === 0 ? (
            <div className="alert alert-success">
              <span>✓</span>
              <div>
                <strong>检查通过</strong>：所有片段均未发现问题。
              </div>
            </div>
          ) : (
            <>
              {errorResults.length > 0 && (
                <div className="panel" style={{ marginBottom: '16px' }}>
                  <div className="panel-header">
                    <h3 className="panel-title">错误 ({errorResults.length})</h3>
                  </div>
                  <div className="panel-body">
                    {errorResults.map((result, index) => (
                      <CheckItem
                        key={`error-${index}`}
                        result={result}
                        onSelectClip={onSelectClip}
                      />
                    ))}
                  </div>
                </div>
              )}

              {warningResults.length > 0 && (
                <div className="panel" style={{ marginBottom: '16px' }}>
                  <div className="panel-header">
                    <h3 className="panel-title">警告 ({warningResults.length})</h3>
                  </div>
                  <div className="panel-body">
                    {warningResults.map((result, index) => (
                      <CheckItem
                        key={`warning-${index}`}
                        result={result}
                        onSelectClip={onSelectClip}
                      />
                    ))}
                  </div>
                </div>
              )}

              {infoResults.length > 0 && (
                <div className="panel">
                  <div className="panel-header">
                    <h3 className="panel-title">提示 ({infoResults.length})</h3>
                  </div>
                  <div className="panel-body">
                    {infoResults.map((result, index) => (
                      <CheckItem
                        key={`info-${index}`}
                        result={result}
                        onSelectClip={onSelectClip}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

const CheckItem: React.FC<{
  result: CheckResult
  onSelectClip: (clipId: string) => void
}> = ({ result, onSelectClip }) => {
  const severityClass =
    result.severity === 'error'
      ? 'check-item-error'
      : result.severity === 'warning'
      ? 'check-item-warning'
      : 'check-item-info'

  return (
    <div className={`check-item ${severityClass}`}>
      <span className="check-icon">{severityIcons[result.severity]}</span>
      <div className="check-content">
        <div className="check-type">
          {typeLabels[result.type]} · {severityLabels[result.severity]}
        </div>
        <div className="check-message">{result.message}</div>
        <button
          className="btn btn-sm btn-secondary"
          style={{ marginTop: '8px' }}
          onClick={() => onSelectClip(result.clipId)}
        >
          查看片段
        </button>
      </div>
    </div>
  )
}
