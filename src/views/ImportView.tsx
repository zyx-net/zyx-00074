import React, { useState } from 'react'

interface ImportViewProps {
  onImport: (transcript: string, config: string) => Promise<any>
  isLoading: boolean
}

const defaultConfig = `{
  "separator": "\\n\\n",
  "speakerPattern": "^[\\\\u4e00-\\\\u9fa5A-Za-z][\\\\u4e00-\\\\u9fa5A-Za-z0-9]*[：:]",
  "timestampPattern": "\\\\[\\\\d{2}:\\\\d{2}:\\\\d{2}\\\\]",
  "defaultTags": ["采访素材"],
  "sensitiveWords": ["敏感词示例", "未经证实"],
  "requiredReferencePatterns": ["\\\\[来源[^\\\\]]*\\\\]", "\\\\[引用[^\\\\]]*\\\\]"]
}`

export const ImportView: React.FC<ImportViewProps> = ({ onImport, isLoading }) => {
  const [transcript, setTranscript] = useState('')
  const [config, setConfig] = useState(defaultConfig)
  const [errors, setErrors] = useState<{ transcript?: string; config?: string }>({})

  const handleSelectFile = async () => {
    const result = await window.fileAPI.openFile([
      { name: '文本文件', extensions: ['txt', 'md'] },
      { name: '所有文件', extensions: ['*'] }
    ])
    if (!result.canceled && result.filePaths.length > 0) {
      const readResult = await window.fileAPI.readText(result.filePaths[0])
      if (readResult.success && readResult.content) {
        setTranscript(readResult.content)
      }
    }
  }

  const handleSelectConfig = async () => {
    const result = await window.fileAPI.openFile([
      { name: 'JSON配置', extensions: ['json'] },
      { name: '所有文件', extensions: ['*'] }
    ])
    if (!result.canceled && result.filePaths.length > 0) {
      const readResult = await window.fileAPI.readText(result.filePaths[0])
      if (readResult.success && readResult.content) {
        setConfig(readResult.content)
      }
    }
  }

  const validate = (): boolean => {
    const newErrors: typeof errors = {}
    if (!transcript.trim()) {
      newErrors.transcript = '请输入或选择采访转写文本'
    }
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleImport = async () => {
    if (!validate()) return
    try {
      await onImport(transcript, config)
      setTranscript('')
    } catch {
      // Error handled by hook
    }
  }

  return (
    <div className="content-body">
      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">导入采访素材</h2>
        </div>
        <div className="panel-body">
          <div className="alert alert-info">
            <span>ℹ</span>
            <div>
              <strong>隐私保护</strong>：所有数据仅在本地处理，不会上传到任何服务器，也不依赖在线 AI 服务。
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">
              采访转写文本
              <span style={{ color: 'var(--danger-color)' }}>*</span>
            </label>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <button className="btn btn-secondary" onClick={handleSelectFile}>
                📁 选择文件
              </button>
              <span className="form-hint" style={{ alignSelf: 'center' }}>
                支持 .txt, .md 格式
              </span>
            </div>
            <textarea
              className="form-textarea"
              value={transcript}
              onChange={e => setTranscript(e.target.value)}
              placeholder="粘贴或输入采访转写文本，片段之间使用空行分隔..."
              rows={12}
            />
            {errors.transcript && <div className="form-error">{errors.transcript}</div>}
            <div className="form-hint">
              片段默认使用空行分隔。说话人格式如“张三：”，时间戳格式如“[00:01:23]”。
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">素材配置（JSON）</label>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <button className="btn btn-secondary" onClick={handleSelectConfig}>
                📁 选择配置文件
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setConfig(defaultConfig)}
              >
                🔄 恢复默认配置
              </button>
            </div>
            <textarea
              className="form-textarea"
              value={config}
              onChange={e => setConfig(e.target.value)}
              placeholder="输入 JSON 格式的配置..."
              rows={8}
            />
            {errors.config && <div className="form-error">{errors.config}</div>}
            <div className="form-hint">
              可配置分隔符、说话人模式、时间戳模式、默认标签、敏感词列表和引用检查模式。
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button
              className="btn btn-primary btn-lg"
              onClick={handleImport}
              disabled={isLoading || !transcript.trim()}
            >
              {isLoading ? '导入中...' : '🚀 开始导入'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
