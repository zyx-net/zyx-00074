import React, { useState, useMemo } from 'react'
import type { Clip, ClipStatus } from '../core/types'
import { ClipItem } from '../components/ClipItem'
import { Modal } from '../components/Modal'

interface ClipsViewProps {
  clips: Clip[]
  tags: string[]
  selectedClipId: string | null
  onSelectClip: (clipId: string | null) => void
  onStatusChange: (clipId: string, status: ClipStatus) => void
  onAddTag: (clipId: string, tag: string) => void
  onRemoveTag: (clipId: string, tag: string) => void
  onUpdateContent: (clipId: string, content: string) => void
  onUpdateNotes: (clipId: string, notes: string) => void
  onAddReference: (clipId: string, reference: string) => void
  onRemoveReference: (clipId: string, reference: string) => void
  onDeleteClip: (clipId: string) => void
}

const statusLabels: Record<ClipStatus, string> = {
  available: '可用',
  pending: '待核实',
  disabled: '禁用',
  published: '已发布'
}

export const ClipsView: React.FC<ClipsViewProps> = ({
  clips,
  tags,
  selectedClipId,
  onSelectClip,
  onStatusChange,
  onAddTag,
  onRemoveTag,
  onUpdateContent,
  onUpdateNotes,
  onAddReference,
  onRemoveReference,
  onDeleteClip
}) => {
  const [statusFilter, setStatusFilter] = useState<ClipStatus | 'all'>('all')
  const [tagFilter, setTagFilter] = useState<string>('')
  const [searchText, setSearchText] = useState('')
  const [newReference, setNewReference] = useState('')
  const [editingContent, setEditingContent] = useState('')
  const [editingNotes, setEditingNotes] = useState('')
  const [isEditingContent, setIsEditingContent] = useState(false)
  const [isEditingNotes, setIsEditingNotes] = useState(false)

  const selectedClip = useMemo(
    () => clips.find(c => c.id === selectedClipId) || null,
    [clips, selectedClipId]
  )

  const filteredClips = useMemo(() => {
    return clips.filter(clip => {
      if (statusFilter !== 'all' && clip.status !== statusFilter) {
        return false
      }
      if (tagFilter && !clip.tags.some(t => t.toLowerCase() === tagFilter.toLowerCase())) {
        return false
      }
      if (searchText) {
        const lowerSearch = searchText.toLowerCase()
        return (
          clip.content.toLowerCase().includes(lowerSearch) ||
          clip.speaker?.toLowerCase().includes(lowerSearch) ||
          clip.notes?.toLowerCase().includes(lowerSearch)
        )
      }
      return true
    })
  }, [clips, statusFilter, tagFilter, searchText])

  const handleOpenDetail = (clip: Clip) => {
    onSelectClip(clip.id)
    setEditingContent(clip.content)
    setEditingNotes(clip.notes || '')
    setIsEditingContent(false)
    setIsEditingNotes(false)
    setNewReference('')
  }

  const handleSaveContent = () => {
    if (selectedClipId) {
      onUpdateContent(selectedClipId, editingContent)
      setIsEditingContent(false)
    }
  }

  const handleSaveNotes = () => {
    if (selectedClipId) {
      onUpdateNotes(selectedClipId, editingNotes)
      setIsEditingNotes(false)
    }
  }

  const handleAddReference = () => {
    if (selectedClipId && newReference.trim()) {
      onAddReference(selectedClipId, newReference.trim())
      setNewReference('')
    }
  }

  const statusColors: Record<ClipStatus, string> = {
    available: 'status-available',
    pending: 'status-pending',
    disabled: 'status-disabled',
    published: 'status-published'
  }

  return (
    <>
      <div className="content-body">
        <div className="filter-bar">
          <div className="filter-group">
            <label className="filter-label">状态：</label>
            <select
              className="filter-select"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as ClipStatus | 'all')}
            >
              <option value="all">全部</option>
              {(['available', 'pending', 'disabled', 'published'] as ClipStatus[]).map(s => (
                <option key={s} value={s}>
                  {statusLabels[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-group">
            <label className="filter-label">标签：</label>
            <select
              className="filter-select"
              value={tagFilter}
              onChange={e => setTagFilter(e.target.value)}
            >
              <option value="">全部标签</option>
              {tags.map(tag => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </div>
          <div className="filter-group" style={{ flex: 1, minWidth: '200px' }}>
            <input
              className="form-input"
              placeholder="搜索内容、说话人..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
            />
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            共 {filteredClips.length} 个片段
          </div>
        </div>

        {filteredClips.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🔍</div>
            <h3 className="empty-state-title">没有找到匹配的片段</h3>
            <p className="empty-state-desc">
              尝试调整筛选条件或清除搜索内容。
            </p>
          </div>
        ) : (
          <div className="clip-list">
            {filteredClips.map(clip => (
              <ClipItem
                key={clip.id}
                clip={clip}
                isSelected={clip.id === selectedClipId}
                onSelect={() => handleOpenDetail(clip)}
                onStatusChange={status => onStatusChange(clip.id, status)}
                onAddTag={tag => onAddTag(clip.id, tag)}
                onRemoveTag={tag => onRemoveTag(clip.id, tag)}
                onDelete={() => onDeleteClip(clip.id)}
              />
            ))}
          </div>
        )}
      </div>

      <Modal
        isOpen={selectedClip !== null}
        onClose={() => onSelectClip(null)}
        title="片段详情"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => onSelectClip(null)}>
              关闭
            </button>
          </>
        }
      >
        {selectedClip && (
          <div className="clip-detail">
            <div className="clip-detail-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {selectedClip.speaker && (
                  <strong style={{ fontSize: '16px' }}>{selectedClip.speaker}</strong>
                )}
                {selectedClip.timestamp && (
                  <span style={{ fontFamily: 'Consolas, monospace', fontSize: '13px', color: 'var(--text-muted)' }}>
                    {selectedClip.timestamp}
                  </span>
                )}
              </div>
              <span className={`clip-status ${statusColors[selectedClip.status]}`}>
                {statusLabels[selectedClip.status]}
              </span>
            </div>

            <div className="clip-detail-meta">
              <div>
                <strong>创建时间：</strong>
                {new Date(selectedClip.createdAt).toLocaleString()}
              </div>
              <div>
                <strong>更新时间：</strong>
                {new Date(selectedClip.updatedAt).toLocaleString()}
              </div>
            </div>

            <div className="clip-detail-section">
              <div className="clip-detail-section-title">
                内容
                {!isEditingContent && (
                  <button
                    className="btn btn-sm btn-secondary"
                    style={{ marginLeft: '8px' }}
                    onClick={() => setIsEditingContent(true)}
                  >
                    编辑
                  </button>
                )}
              </div>
              {isEditingContent ? (
                <div>
                  <textarea
                    className="form-textarea"
                    value={editingContent}
                    onChange={e => setEditingContent(e.target.value)}
                    rows={8}
                  />
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px', justifyContent: 'flex-end' }}>
                    <button className="btn btn-sm btn-secondary" onClick={() => setIsEditingContent(false)}>
                      取消
                    </button>
                    <button className="btn btn-sm btn-primary" onClick={handleSaveContent}>
                      保存
                    </button>
                  </div>
                </div>
              ) : (
                <div className="clip-detail-content">{selectedClip.content}</div>
              )}
            </div>

            <div className="clip-detail-section">
              <div className="clip-detail-section-title">标签</div>
              <div className="clip-tags" style={{ marginBottom: '8px' }}>
                {selectedClip.tags.length === 0 ? (
                  <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>暂无标签</span>
                ) : (
                  selectedClip.tags.map(tag => (
                    <span key={tag} className="tag">
                      {tag}
                      <span className="tag-remove" onClick={() => onRemoveTag(selectedClip.id, tag)}>
                        ✕
                      </span>
                    </span>
                  ))
                )}
              </div>
            </div>

            <div className="clip-detail-section">
              <div className="clip-detail-section-title">引用来源</div>
              {selectedClip.references.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '8px' }}>
                  暂无引用
                </div>
              ) : (
                <div style={{ marginBottom: '8px' }}>
                  {selectedClip.references.map(ref => (
                    <div key={ref} className="reference-item">
                      <span>{ref}</span>
                      <span className="reference-remove" onClick={() => onRemoveReference(selectedClip.id, ref)}>
                        ✕
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  className="form-input"
                  placeholder="输入引用来源，如 [来源：某某报告 2024]"
                  value={newReference}
                  onChange={e => setNewReference(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddReference()}
                />
                <button className="btn btn-primary" onClick={handleAddReference}>
                  添加
                </button>
              </div>
            </div>

            <div className="clip-detail-section">
              <div className="clip-detail-section-title">
                备注
                {!isEditingNotes && (
                  <button
                    className="btn btn-sm btn-secondary"
                    style={{ marginLeft: '8px' }}
                    onClick={() => setIsEditingNotes(true)}
                  >
                    编辑
                  </button>
                )}
              </div>
              {isEditingNotes ? (
                <div>
                  <textarea
                    className="form-textarea"
                    value={editingNotes}
                    onChange={e => setEditingNotes(e.target.value)}
                    rows={4}
                    placeholder="添加内部备注..."
                  />
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px', justifyContent: 'flex-end' }}>
                    <button className="btn btn-sm btn-secondary" onClick={() => setIsEditingNotes(false)}>
                      取消
                    </button>
                    <button className="btn btn-sm btn-primary" onClick={handleSaveNotes}>
                      保存
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '12px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', minHeight: '60px' }}>
                  {selectedClip.notes || <span style={{ color: 'var(--text-muted)' }}>暂无备注</span>}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  )
}
