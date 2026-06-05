import type { Clip, ClipStatus, ExportOptions, ExportPackage, WorkspaceState } from './types'
import { CURRENT_VERSION } from './history'

const EXPORTABLE_STATUSES: ClipStatus[] = ['available', 'published']

const filterClipsForExport = (
  clips: Clip[],
  options: ExportOptions
): Clip[] => {
  const includeStatuses = options.includeStatus ?? EXPORTABLE_STATUSES
  const includeTags = options.includeTags

  return clips.filter(clip => {
    if (!includeStatuses.includes(clip.status)) {
      return false
    }

    if (includeTags && includeTags.length > 0) {
      const clipTagSet = new Set(clip.tags.map(t => t.toLowerCase()))
      const hasMatchingTag = includeTags.some(
        tag => clipTagSet.has(tag.toLowerCase())
      )
      if (!hasMatchingTag) {
        return false
      }
    }

    return true
  })
}

const escapeMarkdown = (text: string): string => {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/`/g, '\\`')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/#/g, '\\#')
    .replace(/\+/g, '\\+')
    .replace(/-/g, '\\-')
    .replace(/\./g, '\\.')
    .replace(/!/g, '\\!')
}

const formatDate = (timestamp: number): string => {
  return new Date(timestamp).toISOString()
}

const buildMarkdown = (
  clips: Clip[],
  options: ExportOptions
): string => {
  const lines: string[] = []
  const exportedAt = Date.now()

  lines.push('# 采访素材发布包')
  lines.push('')
  lines.push(`- 导出时间：${formatDate(exportedAt)}`)
  lines.push(`- 片段数量：${clips.length}`)
  lines.push(`- 版本：${CURRENT_VERSION}`)
  lines.push('')

  if (options.includeStatus) {
    const statusNames: Record<ClipStatus, string> = {
      available: '可用',
      pending: '待核实',
      disabled: '禁用',
      published: '已发布'
    }
    lines.push(`- 包含状态：${options.includeStatus.map(s => statusNames[s]).join('、')}`)
    lines.push('')
  }

  if (options.includeTags?.length) {
    lines.push(`- 包含标签：${options.includeTags.join('、')}`)
    lines.push('')
  }

  lines.push('---')
  lines.push('')

  clips.forEach((clip, index) => {
    lines.push(`## 片段 ${index + 1}`)
    lines.push('')

    const meta: string[] = []
    if (clip.speaker) {
      meta.push(`**说话人**：${escapeMarkdown(clip.speaker)}`)
    }
    if (clip.timestamp) {
      meta.push(`**时间**：${escapeMarkdown(clip.timestamp)}`)
    }

    const statusNames: Record<ClipStatus, string> = {
      available: '可用',
      pending: '待核实',
      disabled: '禁用',
      published: '已发布'
    }
    meta.push(`**状态**：${statusNames[clip.status]}`)

    if (meta.length > 0) {
      lines.push(meta.join('  \n'))
      lines.push('')
    }

    if (clip.tags.length > 0) {
      lines.push(`**标签**：${clip.tags.map(t => `\`${escapeMarkdown(t)}\``).join(' ')}`)
      lines.push('')
    }

    lines.push('### 内容')
    lines.push('')
    lines.push(clip.content)
    lines.push('')

    if (clip.references.length > 0) {
      lines.push('### 引用')
      lines.push('')
      clip.references.forEach((ref, refIndex) => {
        lines.push(`${refIndex + 1}. ${escapeMarkdown(ref)}`)
      })
      lines.push('')
    }

    if (clip.notes?.trim()) {
      lines.push('### 备注')
      lines.push('')
      lines.push(escapeMarkdown(clip.notes))
      lines.push('')
    }

    lines.push('---')
    lines.push('')
  })

  if (clips.length === 0) {
    lines.push('> 没有符合条件的片段可导出')
    lines.push('')
  }

  lines.push(`<details><summary>元数据</summary>`)
  lines.push('')
  lines.push('```json')
  lines.push(JSON.stringify({
    exportedAt,
    clipCount: clips.length,
    version: CURRENT_VERSION,
    filters: {
      includeStatus: options.includeStatus,
      includeTags: options.includeTags
    }
  }, null, 2))
  lines.push('```')
  lines.push('')
  lines.push('</details>')
  lines.push('')

  return lines.join('\n')
}

const buildJson = (
  clips: Clip[],
  options: ExportOptions
): string => {
  const exportedAt = Date.now()

  const pkg: ExportPackage = {
    meta: {
      exportedAt,
      clipCount: clips.length,
      version: CURRENT_VERSION
    },
    clips: clips.map(clip => ({
      ...clip,
      _meta: {
        filteredBy: {
          includeStatus: options.includeStatus,
          includeTags: options.includeTags
        }
      }
    }))
  }

  return JSON.stringify(pkg, null, 2)
}

export interface ExportResult {
  content: string
  format: 'markdown' | 'json'
  clipCount: number
  fileName: string
}

export const exportClips = (
  state: WorkspaceState,
  options: ExportOptions
): ExportResult => {
  const filteredClips = filterClipsForExport(state.clips, options)

  let content: string
  let extension: string

  if (options.format === 'markdown') {
    content = buildMarkdown(filteredClips, options)
    extension = 'md'
  } else {
    content = buildJson(filteredClips, options)
    extension = 'json'
  }

  const dateStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const fileName = `interview-package-${dateStr}.${extension}`

  return {
    content,
    format: options.format,
    clipCount: filteredClips.length,
    fileName
  }
}

export const canExportClip = (clip: Clip): boolean => {
  return EXPORTABLE_STATUSES.includes(clip.status)
}

export const getExportableClips = (state: WorkspaceState): Clip[] => {
  return state.clips.filter(clip => canExportClip(clip))
}

export const buildExportPreview = (
  state: WorkspaceState,
  options: ExportOptions
): { count: number; preview: string; blockingIssues: string[] } => {
  const filteredClips = filterClipsForExport(state.clips, options)
  const blockingIssues: string[] = []

  const pendingClips = state.clips.filter(c => c.status === 'pending')
  if (pendingClips.length > 0 && options.includeStatus?.includes('pending')) {
    blockingIssues.push(`有 ${pendingClips.length} 个待核实片段，不能发布`)
  }

  const disabledClips = state.clips.filter(c => c.status === 'disabled')
  if (disabledClips.length > 0 && options.includeStatus?.includes('disabled')) {
    blockingIssues.push(`有 ${disabledClips.length} 个禁用片段，不会被导出`)
  }

  const preview = options.format === 'markdown'
    ? buildMarkdown(filteredClips.slice(0, 3), options)
    : buildJson(filteredClips.slice(0, 3), options)

  return {
    count: filteredClips.length,
    preview,
    blockingIssues
  }
}
