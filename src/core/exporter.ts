import type { Clip, ClipStatus, ExportOptions, ExportPackage, WorkspaceState, PublishManifest, TagStatistics, CheckSummarySnapshot, ExportFormat } from './types'
import { CURRENT_VERSION, getOperationLog, logOperation } from './history'
import { checkAllClips, type CheckSummary } from './checker'

const EXPORTABLE_STATUSES: ClipStatus[] = ['available', 'published']
const DEFAULT_MATERIAL_TITLE = '未命名素材'

const hasSensitiveWords = (clip: Clip, sensitiveWords: string[]): boolean => {
  if (!sensitiveWords.length) return false
  const content = clip.content.toLowerCase()
  const notes = clip.notes?.toLowerCase() || ''
  return sensitiveWords.some(word => {
    const lower = word.toLowerCase()
    return content.includes(lower) || notes.includes(lower)
  })
}

export const filterClipsForExport = (
  clips: Clip[],
  options: ExportOptions,
  configSensitiveWords: string[] = []
): { clips: Clip[]; excludedCount: { sensitive: number; status: number; tags: number } } => {
  const includeStatuses = options.includeStatus ?? EXPORTABLE_STATUSES
  const includeTags = options.includeTags
  const excludeSensitive = options.excludeSensitive ?? true
  const sensitiveWords = configSensitiveWords

  const excludedCount = { sensitive: 0, status: 0, tags: 0 }

  const filtered = clips.filter(clip => {
    if (!includeStatuses.includes(clip.status)) {
      excludedCount.status++
      return false
    }

    if (excludeSensitive && hasSensitiveWords(clip, sensitiveWords)) {
      excludedCount.sensitive++
      return false
    }

    if (includeTags && includeTags.length > 0) {
      const clipTagSet = new Set(clip.tags.map(t => t.toLowerCase()))
      const hasMatchingTag = includeTags.some(
        tag => clipTagSet.has(tag.toLowerCase())
      )
      if (!hasMatchingTag) {
        excludedCount.tags++
        return false
      }
    }

    return true
  })

  return { clips: filtered, excludedCount }
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

const sanitizeFilename = (name: string): string => {
  return name
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 100)
}

const generateFileName = (
  materialTitle: string,
  format: ExportFormat,
  exportedAt: number
): string => {
  const dateStr = new Date(exportedAt).toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const safeTitle = sanitizeFilename(materialTitle || DEFAULT_MATERIAL_TITLE)
  
  const extensions: Record<ExportFormat, string> = {
    markdown: 'md',
    json: 'json',
    manifest: 'json'
  }
  
  return `${safeTitle}-${dateStr}.${extensions[format]}`
}

const calculateTagStatistics = (clips: Clip[]): TagStatistics[] => {
  const tagMap = new Map<string, TagStatistics>()

  clips.forEach(clip => {
    clip.tags.forEach(tag => {
      const lower = tag.toLowerCase()
      if (!tagMap.has(lower)) {
        tagMap.set(lower, {
          tag,
          count: 0,
          byStatus: { available: 0, pending: 0, disabled: 0, published: 0 }
        })
      }
      const stats = tagMap.get(lower)!
      stats.count++
      stats.byStatus[clip.status]++
    })
  })

  return Array.from(tagMap.values()).sort((a, b) => b.count - a.count)
}

const convertCheckSummaryToSnapshot = (summary: CheckSummary): CheckSummarySnapshot => ({
  totalClips: summary.totalClips,
  errorCount: summary.errorCount,
  warningCount: summary.warningCount,
  infoCount: summary.infoCount,
  byType: {
    sensitive_word: summary.byType.sensitive_word,
    missing_reference: summary.byType.missing_reference,
    other: summary.byType.other
  },
  clipsWithIssues: summary.clipsWithIssues
})

const buildPublishManifest = (
  state: WorkspaceState,
  options: ExportOptions,
  filteredClips: Clip[]
): PublishManifest => {
  const exportedAt = Date.now()
  const materialTitle = options.materialTitle || DEFAULT_MATERIAL_TITLE
  const { summary: checkSummary } = checkAllClips(state)
  const tagStatistics = calculateTagStatistics(filteredClips)
  const recentOperations = getOperationLog().slice(0, 20).map(log => ({
    timestamp: log.timestamp,
    type: log.type,
    success: log.success,
    message: log.message
  }))

  const byStatus: Record<ClipStatus, number> = {
    available: 0,
    pending: 0,
    disabled: 0,
    published: 0
  }

  filteredClips.forEach(clip => {
    byStatus[clip.status]++
  })

  const sensitiveWords = state.config.sensitiveWords || []

  return {
    meta: {
      exportedAt,
      version: CURRENT_VERSION,
      materialTitle
    },
    fragments: {
      total: filteredClips.length,
      byStatus,
      items: filteredClips.map(clip => ({
        id: clip.id,
        speaker: clip.speaker,
        timestamp: clip.timestamp,
        status: clip.status,
        tags: clip.tags,
        contentPreview: clip.content.slice(0, 200),
        hasSensitive: hasSensitiveWords(clip, sensitiveWords),
        hasReferences: clip.references.length > 0,
        createdAt: clip.createdAt,
        updatedAt: clip.updatedAt
      }))
    },
    tagStatistics,
    configSnapshot: state.config,
    checkSummary: convertCheckSummaryToSnapshot(checkSummary),
    recentOperations,
    exportSettings: {
      includeStatus: options.includeStatus ?? EXPORTABLE_STATUSES,
      includeTags: options.includeTags,
      excludeSensitive: options.excludeSensitive ?? true
    }
  }
}

const buildMarkdown = (
  clips: Clip[],
  options: ExportOptions,
  manifest?: PublishManifest
): string => {
  const lines: string[] = []
  const exportedAt = Date.now()
  const materialTitle = options.materialTitle || DEFAULT_MATERIAL_TITLE

  lines.push(`# ${escapeMarkdown(materialTitle)}`)
  lines.push('')
  lines.push('## 发布包信息')
  lines.push('')
  lines.push(`- 导出时间：${formatDate(exportedAt)}`)
  lines.push(`- 片段数量：${clips.length}`)
  lines.push(`- 版本：${CURRENT_VERSION}`)
  lines.push('')

  const statusNames: Record<ClipStatus, string> = {
    available: '可用',
    pending: '待核实',
    disabled: '禁用',
    published: '已发布'
  }

  if (options.includeStatus) {
    lines.push(`- 包含状态：${options.includeStatus.map(s => statusNames[s]).join('、')}`)
    lines.push('')
  }

  if (options.includeTags?.length) {
    lines.push(`- 包含标签：${options.includeTags.join('、')}`)
    lines.push('')
  }

  if (options.excludeSensitive) {
    lines.push('- 敏感词处理：已排除包含敏感词的片段')
    lines.push('')
  }

  lines.push('---')
  lines.push('')

  if (manifest) {
    lines.push('## 统计摘要')
    lines.push('')
    
    if (manifest.fragments.byStatus) {
      lines.push('### 按状态统计')
      lines.push('')
      Object.entries(manifest.fragments.byStatus).forEach(([status, count]) => {
        if (count > 0) {
          lines.push(`- ${statusNames[status as ClipStatus]}：${count} 个`)
        }
      })
      lines.push('')
    }

    if (manifest.tagStatistics.length > 0) {
      lines.push('### 标签统计')
      lines.push('')
      manifest.tagStatistics.forEach(stat => {
        lines.push(`- ${escapeMarkdown(stat.tag)}：${stat.count} 个`)
      })
      lines.push('')
    }

    lines.push('### 检查摘要')
    lines.push('')
    lines.push(`- 错误：${manifest.checkSummary.errorCount} 个`)
    lines.push(`- 警告：${manifest.checkSummary.warningCount} 个`)
    lines.push(`- 信息：${manifest.checkSummary.infoCount} 个`)
    lines.push('')

    lines.push('---')
    lines.push('')
  }

  lines.push('## 片段列表')
  lines.push('')

  clips.forEach((clip, index) => {
    lines.push(`### 片段 ${index + 1}`)
    lines.push('')

    const meta: string[] = []
    if (clip.speaker) {
      meta.push(`**说话人**：${escapeMarkdown(clip.speaker)}`)
    }
    if (clip.timestamp) {
      meta.push(`**时间**：${escapeMarkdown(clip.timestamp)}`)
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

    lines.push('#### 内容')
    lines.push('')
    lines.push(clip.content)
    lines.push('')

    if (clip.references.length > 0) {
      lines.push('#### 引用')
      lines.push('')
      clip.references.forEach((ref, refIndex) => {
        lines.push(`${refIndex + 1}. ${escapeMarkdown(ref)}`)
      })
      lines.push('')
    }

    if (clip.notes?.trim()) {
      lines.push('#### 备注')
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
      includeTags: options.includeTags,
      excludeSensitive: options.excludeSensitive
    },
    materialTitle
  }, null, 2))
  lines.push('```')
  lines.push('')
  lines.push('</details>')
  lines.push('')

  return lines.join('\n')
}

const buildJson = (
  clips: Clip[],
  options: ExportOptions,
  manifest?: PublishManifest
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
          includeTags: options.includeTags,
          excludeSensitive: options.excludeSensitive
        }
      }
    })),
    manifest
  }

  return JSON.stringify(pkg, null, 2)
}

const buildManifestJson = (manifest: PublishManifest): string => {
  return JSON.stringify(manifest, null, 2)
}

export interface ExportResult {
  content: string
  format: ExportFormat
  clipCount: number
  fileName: string
  excludedCount: { sensitive: number; status: number; tags: number }
}

export interface ExportConflict {
  type: 'empty_result' | 'pending_included' | 'sensitive_mismatch' | 'disabled_included'
  message: string
  action: string
}

export const checkExportConflicts = (
  state: WorkspaceState,
  options: ExportOptions
): ExportConflict[] => {
  const conflicts: ExportConflict[] = []
  const sensitiveWords = state.config.sensitiveWords || []

  const { clips: filteredClips, excludedCount } = filterClipsForExport(
    state.clips,
    options,
    sensitiveWords
  )

  if (filteredClips.length === 0 && state.clips.length > 0) {
    const reasons: string[] = []
    if (excludedCount.status > 0) reasons.push(`${excludedCount.status} 个片段因状态被排除`)
    if (excludedCount.sensitive > 0) reasons.push(`${excludedCount.sensitive} 个片段因敏感词被排除`)
    if (excludedCount.tags > 0) reasons.push(`${excludedCount.tags} 个片段因标签筛选被排除`)
    
    conflicts.push({
      type: 'empty_result',
      message: `当前筛选条件下没有可导出的片段。${reasons.join('，')}。`,
      action: '请调整筛选条件或修改片段状态/标签'
    })
  }

  if (options.includeStatus?.includes('pending')) {
    const pendingCount = filteredClips.filter(c => c.status === 'pending').length
    if (pendingCount > 0) {
      conflicts.push({
        type: 'pending_included',
        message: `已选择包含 ${pendingCount} 个待核实片段，这些片段不应被发布`,
        action: '建议取消勾选"待核实"状态，或先核实这些片段后再导出'
      })
    }
  }

  if (options.includeStatus?.includes('disabled')) {
    const disabledCount = filteredClips.filter(c => c.status === 'disabled').length
    if (disabledCount > 0) {
      conflicts.push({
        type: 'disabled_included',
        message: `已选择包含 ${disabledCount} 个禁用片段，这些片段不应被发布`,
        action: '建议取消勾选"禁用"状态'
      })
    }
  }

  if (!options.excludeSensitive && sensitiveWords.length > 0) {
    const sensitiveClips = filteredClips.filter(c => hasSensitiveWords(c, sensitiveWords))
    if (sensitiveClips.length > 0) {
      conflicts.push({
        type: 'sensitive_mismatch',
        message: `已关闭敏感词排除，将导出 ${sensitiveClips.length} 个包含敏感词的片段`,
        action: '建议开启"排除敏感词片段"选项，或手动处理敏感内容'
      })
    }
  }

  return conflicts
}

export const exportClips = (
  state: WorkspaceState,
  options: ExportOptions
): ExportResult => {
  const sensitiveWords = state.config.sensitiveWords || []
  const { clips: filteredClips, excludedCount } = filterClipsForExport(
    state.clips,
    options,
    sensitiveWords
  )

  let content: string
  const exportedAt = Date.now()
  const materialTitle = options.materialTitle || DEFAULT_MATERIAL_TITLE

  const manifest = options.format === 'manifest' || options.format === 'json'
    ? buildPublishManifest(state, options, filteredClips)
    : undefined

  if (options.format === 'markdown') {
    content = buildMarkdown(filteredClips, options)
  } else if (options.format === 'manifest') {
    content = buildManifestJson(manifest!)
  } else {
    content = buildJson(filteredClips, options, manifest)
  }

  const fileName = generateFileName(materialTitle, options.format, exportedAt)

  logOperation('export', true, `导出 ${filteredClips.length} 个片段（${options.format}格式）`, {
    clipCount: filteredClips.length,
    format: options.format,
    excludedCount,
    fileName
  })

  return {
    content,
    format: options.format,
    clipCount: filteredClips.length,
    fileName,
    excludedCount
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
): { count: number; preview: string; blockingIssues: string[]; conflicts: ExportConflict[] } => {
  const sensitiveWords = state.config.sensitiveWords || []
  const { clips: filteredClips } = filterClipsForExport(state.clips, options, sensitiveWords)
  const blockingIssues: string[] = []

  const pendingClips = state.clips.filter(c => c.status === 'pending')
  if (pendingClips.length > 0 && options.includeStatus?.includes('pending')) {
    blockingIssues.push(`有 ${pendingClips.length} 个待核实片段，不能发布`)
  }

  const disabledClips = state.clips.filter(c => c.status === 'disabled')
  if (disabledClips.length > 0 && options.includeStatus?.includes('disabled')) {
    blockingIssues.push(`有 ${disabledClips.length} 个禁用片段，不会被导出`)
  }

  const manifest = options.format === 'manifest' || options.format === 'json'
    ? buildPublishManifest(state, options, filteredClips.slice(0, 3))
    : undefined

  const preview = options.format === 'markdown'
    ? buildMarkdown(filteredClips.slice(0, 3), options)
    : options.format === 'manifest'
    ? buildManifestJson(manifest!)
    : buildJson(filteredClips.slice(0, 3), options, manifest)

  const conflicts = checkExportConflicts(state, options)

  return {
    count: filteredClips.length,
    preview,
    blockingIssues,
    conflicts
  }
}

const EXPORT_PREFERENCES_KEY = 'interview_tool_export_preferences'

export const saveExportPreferences = (prefs: Partial<ExportOptions> & { materialTitle?: string }): void => {
  try {
    const existing = loadExportPreferences()
    const merged = { ...existing, ...prefs }
    localStorage.setItem(EXPORT_PREFERENCES_KEY, JSON.stringify(merged))
  } catch (e) {
    logOperation('save', false, `保存导出偏好失败：${(e as Error).message}`)
  }
}

export const loadExportPreferences = (): Partial<ExportOptions> & { materialTitle?: string } => {
  try {
    const stored = localStorage.getItem(EXPORT_PREFERENCES_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (e) {
    logOperation('load', false, `加载导出偏好失败：${(e as Error).message}`)
  }
  return {
    format: 'markdown' as ExportFormat,
    includeStatus: ['available', 'published'],
    includeTags: [],
    excludeSensitive: true,
    materialTitle: DEFAULT_MATERIAL_TITLE
  }
}

export const clearExportPreferences = (): void => {
  try {
    localStorage.removeItem(EXPORT_PREFERENCES_KEY)
  } catch (e) {
    logOperation('clear', false, `清除导出偏好失败：${(e as Error).message}`)
  }
}

export const hasSavedExportPreferences = (): boolean => {
  try {
    return localStorage.getItem(EXPORT_PREFERENCES_KEY) !== null
  } catch (e) {
    return false
  }
}
