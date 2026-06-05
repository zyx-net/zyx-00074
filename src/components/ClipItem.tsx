import React, { useState } from 'react'
import type { Clip, ClipStatus } from '../core/types'

interface ClipItemProps {
  clip: Clip
  isSelected: boolean
  onSelect: () => void
  onStatusChange: (status: ClipStatus) => void
  onAddTag: (tag: string) => void
  onRemoveTag: (tag: string) => void
  onDelete: () => void
}

const statusConfig: Record<ClipStatus, { label: string; className: string }> = {
  available: { label: '可用', className: 'status-available' },
  pending: { label: '待核实', className: 'status-pending' },
  disabled: { label: '禁用', className: 'status-disabled' },
  published: { label: '已发布', className: 'status-published' }
}

export const ClipItem: React.FC<ClipItemProps> = ({
  clip,
  isSelected,
  onSelect,
  onStatusChange,
  onAddTag,
  onRemoveTag,
  onDelete
}) => {
  const [expanded, setExpanded] = useState(false)
  const [showTagInput, setShowTagInput] = useState(false)
  const [newTag, setNewTag] = useState('')

  const handleAddTag = () => {
    if (newTag.trim()) {
      onAddTag(newTag.trim())
      setNewTag('')
      setShowTagInput(false)
    }
  }

  return (
    <div className={`clip-item ${isSelected ? 'selected' : ''}`}>
      <div className="clip-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {clip.speaker && <span className="clip-speaker">{clip.speaker}</span>}
          {clip.timestamp && <span className="clip-timestamp">{clip.timestamp}</span>}
        </div>
        <span className={`clip-status ${statusConfig[clip.status].className}`}>
          {statusConfig[clip.status].label}
        </span>
      </div>

      <div
        className={`clip-content ${expanded ? 'expanded' : ''}`}
        onClick={() => setExpanded(!expanded)}
        style={{ cursor: 'pointer' }}
      >
        {clip.content}
      </div>

      <div className="clip-footer">
        <div className="clip-tags">
          {clip.tags.map(tag => (
            <span key={tag} className="tag">
              {tag}
              <span className="tag-remove" onClick={() => onRemoveTag(tag)}>
                ✕
              </span>
            </span>
          ))}
          {showTagInput ? (
            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <input
                className="form-input"
                style={{ width: '120px', padding: '2px 6px', fontSize: '11px' }}
                placeholder="标签名"
                value={newTag}
                onChange={e => setNewTag(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddTag()}
                autoFocus
              />
              <button className="btn btn-sm btn-primary" onClick={handleAddTag}>
                添加
              </button>
              <button className="btn btn-sm btn-secondary" onClick={() => setShowTagInput(false)}>
                取消
              </button>
            </div>
          ) : (
            <button className="btn btn-sm btn-secondary" onClick={() => setShowTagInput(true)}>
              + 标签
            </button>
          )}
        </div>

        <div className="clip-actions">
          <div className="status-buttons">
            {(['available', 'pending', 'disabled', 'published'] as ClipStatus[]).map(status => (
              <button
                key={status}
                className={`status-btn ${clip.status === status ? `active-${status}` : ''}`}
                onClick={() => onStatusChange(status)}
                title={statusConfig[status].label}
              >
                {statusConfig[status].label}
              </button>
            ))}
          </div>
          <button className="btn btn-sm btn-secondary" onClick={onSelect}>
            详情
          </button>
          <button className="btn btn-sm btn-danger" onClick={onDelete}>
            删除
          </button>
        </div>
      </div>
    </div>
  )
}
