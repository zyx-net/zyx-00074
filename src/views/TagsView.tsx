import React, { useState } from 'react'

interface TagsViewProps {
  tags: string[]
  getTagUsageCount: (tag: string) => number
  onDeleteTag: (tag: string) => void
  onAddTagToClip?: (tag: string) => void
}

export const TagsView: React.FC<TagsViewProps> = ({
  tags,
  getTagUsageCount,
  onDeleteTag
}) => {
  const [newTag, setNewTag] = useState('')
  const [error, setError] = useState('')

  return (
    <div className="content-body">
      <div className="panel">
        <div className="panel-header">
          <h2 className="panel-title">标签管理</h2>
        </div>
        <div className="panel-body">
          <div className="form-group">
            <label className="form-label">添加新标签</label>
            <div className="tag-input">
              <input
                className="form-input"
                placeholder="输入标签名称"
                value={newTag}
                onChange={e => {
                  setNewTag(e.target.value)
                  setError('')
                }}
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
              />
              <button className="btn btn-primary" onClick={handleAdd}>
                添加
              </button>
            </div>
            {error && <div className="form-error">{error}</div>}
          </div>

          <div className="divider" />

          <h3 style={{ marginBottom: '12px' }}>
            所有标签（{tags.length}）
          </h3>

          {tags.length === 0 ? (
            <div className="empty-state" style={{ padding: '24px' }}>
              <div className="empty-state-icon">🏷️</div>
              <h3 className="empty-state-title">暂无标签</h3>
              <p className="empty-state-desc">
                导入素材时会自动添加默认标签，或在片段编辑时手动添加标签。
              </p>
            </div>
          ) : (
            <div className="tag-list">
              {tags.map(tag => {
              const count = getTagUsageCount(tag)
              return (
                <div key={tag} className="tag-item">
                  <span className="tag-item-name">{tag}</span>
                  <span className="tag-item-count">{count} 个片段</span>
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => {
                      if (confirm(`确定要删除标签"${tag}"吗？这将从所有片段中移除此标签。`)) {
                        onDeleteTag(tag)
                      }
                    }}
                    disabled={count > 0}
                    title={count > 0 ? '仍有片段使用此标签' : '删除标签'}
                  >
                    删除
                  </button>
                </div>
              )
            })}
            </div>
          )}
        </div>
      </div>
    </div>
  )

  function handleAdd() {
    const trimmed = newTag.trim()
    if (!trimmed) {
      setError('标签名称不能为空')
      return
    }

    const lowerTrimmed = trimmed.toLowerCase()
    const exists = tags.some(t => t.toLowerCase() === lowerTrimmed)
    if (exists) {
      setError('已存在相同标签（不区分大小写）')
      return
    }

    // 标签会在添加到片段时自动创建，这里我们可以通过一个特殊的处理方式
    // 由于我们的架构中，标签是通过添加到片段时自动管理的
    // 所以这里我们需要一个占位处理方式
    // 实际上，全局标签列表是由所有片段的标签的并集
    // 所以添加一个标签而不关联到片段是没有意义的
    // 但用户可以通过添加到片段来创建新标签
    setError('请在片段详情中添加标签来创建新标签')
  }
}
