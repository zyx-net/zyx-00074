import type { WorkspaceState, CheckResult, Clip, MaterialConfig, ExportOptions, ClipStatus } from './types'

const DEFAULT_SENSITIVE_WORDS = [
  '敏感词示例',
  '未经证实',
  '机密',
  '内部资料'
]

const DEFAULT_REFERENCE_PATTERNS = [
  '\\[来源[^\\]]*\\]',
  '\\[引用[^\\]]*\\]',
  '\\[资料[^\\]]*\\]',
  '\\[注[^\\]]*\\]'
]

interface CheckContext {
  config: MaterialConfig
  sensitiveWords: string[]
  referencePatterns: RegExp[]
}

const buildCheckContext = (config: MaterialConfig): CheckContext => {
  const sensitiveWords = config.sensitiveWords?.length
    ? config.sensitiveWords
    : DEFAULT_SENSITIVE_WORDS

  const patternStrings = config.requiredReferencePatterns?.length
    ? config.requiredReferencePatterns
    : DEFAULT_REFERENCE_PATTERNS

  const referencePatterns = patternStrings.map(p => {
    try {
      return new RegExp(p, 'u')
    } catch {
      return null
    }
  }).filter((r): r is RegExp => r !== null)

  return {
    config,
    sensitiveWords,
    referencePatterns
  }
}

const findSensitiveWordsInClip = (
  clip: Clip,
  context: CheckContext
): CheckResult[] => {
  const results: CheckResult[] = []
  const content = clip.content.toLowerCase()
  const notes = clip.notes?.toLowerCase() || ''

  for (const word of context.sensitiveWords) {
    const lowerWord = word.toLowerCase()
    const contentIndex = content.indexOf(lowerWord)
    if (contentIndex !== -1) {
      results.push({
        type: 'sensitive_word',
        severity: 'error',
        clipId: clip.id,
        message: `片段内容包含敏感词："${word}"`,
        details: {
          word,
          position: contentIndex,
          location: 'content'
        }
      })
    }

    if (notes) {
      const notesIndex = notes.indexOf(lowerWord)
      if (notesIndex !== -1) {
        results.push({
          type: 'sensitive_word',
          severity: 'warning',
          clipId: clip.id,
          message: `片段备注包含敏感词："${word}"`,
          details: {
            word,
            position: notesIndex,
            location: 'notes'
          }
        })
      }
    }
  }

  return results
}

const checkReferencesInClip = (
  clip: Clip,
  context: CheckContext
): CheckResult[] => {
  const results: CheckResult[] = []

  if (context.referencePatterns.length === 0) {
    return results
  }

  const hasReferenceInContent = context.referencePatterns.some(
    pattern => pattern.test(clip.content)
  )

  const hasReferenceInList = clip.references.length > 0

  if (!hasReferenceInContent && !hasReferenceInList) {
    results.push({
      type: 'missing_reference',
      severity: 'warning',
      clipId: clip.id,
      message: '片段缺少来源引用，请添加引用标记或在引用列表中补充',
      details: {
        expectedPatterns: context.config.requiredReferencePatterns || DEFAULT_REFERENCE_PATTERNS
      }
    })
  }

  return results
}

const checkClipStatusIssues = (clip: Clip): CheckResult[] => {
  const results: CheckResult[] = []

  if (clip.status === 'pending') {
    results.push({
      type: 'other',
      severity: 'info',
      clipId: clip.id,
      message: '片段处于待核实状态，需核实后才能发布',
      details: {
        status: clip.status
      }
    })
  }

  if (clip.status === 'disabled') {
    results.push({
      type: 'other',
      severity: 'info',
      clipId: clip.id,
      message: '片段处于禁用状态，不会被导出',
      details: {
        status: clip.status
      }
    })
  }

  return results
}

const checkClipContentIssues = (clip: Clip): CheckResult[] => {
  const results: CheckResult[] = []

  const trimmed = clip.content.trim()
  if (trimmed.length < 5) {
    results.push({
      type: 'other',
      severity: 'warning',
      clipId: clip.id,
      message: '片段内容过短，建议确认是否为有效内容',
      details: {
        contentLength: trimmed.length
      }
    })
  }

  if (trimmed.length > 5000) {
    results.push({
      type: 'other',
      severity: 'info',
      clipId: clip.id,
      message: '片段内容较长，建议考虑拆分为多个片段',
      details: {
        contentLength: trimmed.length
      }
    })
  }

  return results
}

export const checkClip = (
  clip: Clip,
  config: MaterialConfig
): CheckResult[] => {
  const context = buildCheckContext(config)
  const results: CheckResult[] = []

  results.push(...findSensitiveWordsInClip(clip, context))
  results.push(...checkReferencesInClip(clip, context))
  results.push(...checkClipStatusIssues(clip))
  results.push(...checkClipContentIssues(clip))

  return results
}

export const checkAllClips = (
  state: WorkspaceState
): { results: CheckResult[]; summary: CheckSummary } => {
  const context = buildCheckContext(state.config)
  const allResults: CheckResult[] = []

  for (const clip of state.clips) {
    allResults.push(...findSensitiveWordsInClip(clip, context))
    allResults.push(...checkReferencesInClip(clip, context))
    allResults.push(...checkClipStatusIssues(clip))
    allResults.push(...checkClipContentIssues(clip))
  }

  const summary = buildSummary(allResults, state.clips.length)

  return { results: allResults, summary }
}

export interface CheckSummary {
  totalClips: number
  errorCount: number
  warningCount: number
  infoCount: number
  byType: {
    sensitive_word: number
    missing_reference: number
    other: number
  }
  clipsWithIssues: string[]
}

const buildSummary = (results: CheckResult[], totalClips: number): CheckSummary => {
  const summary: CheckSummary = {
    totalClips,
    errorCount: 0,
    warningCount: 0,
    infoCount: 0,
    byType: {
      sensitive_word: 0,
      missing_reference: 0,
      other: 0
    },
    clipsWithIssues: []
  }

  const clipsSet = new Set<string>()

  for (const result of results) {
    switch (result.severity) {
      case 'error':
        summary.errorCount++
        break
      case 'warning':
        summary.warningCount++
        break
      case 'info':
        summary.infoCount++
        break
    }

    summary.byType[result.type]++
    clipsSet.add(result.clipId)
  }

  summary.clipsWithIssues = Array.from(clipsSet)

  return summary
}

const EXPORTABLE_STATUSES: ClipStatus[] = ['available', 'published']

const hasSensitiveWords = (clip: Clip, sensitiveWords: string[]): boolean => {
  if (!sensitiveWords.length) return false
  const content = clip.content.toLowerCase()
  const notes = clip.notes?.toLowerCase() || ''
  return sensitiveWords.some(w => content.includes(w.toLowerCase()) || notes.includes(w.toLowerCase()))
}

const filterClipsForExport = (
  clips: Clip[],
  options: ExportOptions,
  configSensitiveWords: string[] = []
): Clip[] => {
  const includeStatuses = options.includeStatus ?? EXPORTABLE_STATUSES
  const includeTags = options.includeTags
  const excludeSensitive = options.excludeSensitive ?? true
  const sensitiveWords = configSensitiveWords

  return clips.filter(clip => {
    if (!includeStatuses.includes(clip.status)) return false
    if (excludeSensitive && hasSensitiveWords(clip, sensitiveWords)) return false
    if (includeTags && includeTags.length > 0) {
      const clipTagSet = new Set(clip.tags.map(t => t.toLowerCase()))
      const hasMatchingTag = includeTags.some(tag => clipTagSet.has(tag.toLowerCase()))
      if (!hasMatchingTag) return false
    }
    return true
  })
}

export const checkBeforeExport = (
  state: WorkspaceState,
  options?: ExportOptions
): { allowed: boolean; results: CheckResult[]; summary: CheckSummary } => {
  const sensitiveWords = state.config.sensitiveWords || []
  const filteredClips = options ? filterClipsForExport(state.clips, options, sensitiveWords) : state.clips
  
  const context = buildCheckContext(state.config)
  const allResults: CheckResult[] = []

  for (const clip of filteredClips) {
    allResults.push(...findSensitiveWordsInClip(clip, context))
    allResults.push(...checkReferencesInClip(clip, context))
    allResults.push(...checkClipStatusIssues(clip))
    allResults.push(...checkClipContentIssues(clip))
  }

  const summary = buildSummary(allResults, filteredClips.length)

  const blockingErrors = allResults.filter(
    r => r.severity === 'error' || r.type === 'missing_reference'
  )

  let pendingToCheck: Clip[] = []
  if (!options) {
    pendingToCheck = state.clips.filter(c => c.status === 'pending')
  } else {
    const includePending = options.includeStatus?.includes('pending') ?? false
    if (includePending) {
      pendingToCheck = filteredClips.filter(c => c.status === 'pending')
    }
  }

  if (pendingToCheck.length > 0) {
    pendingToCheck.forEach(clip => {
      allResults.push({
        type: 'other',
        severity: 'error',
        clipId: clip.id,
        message: '待核实片段不能发布，请先核实或禁用',
        details: { status: clip.status }
      })
    })
    summary.errorCount += pendingToCheck.length
    summary.byType.other += pendingToCheck.length
  }

  const allowed = blockingErrors.length === 0 && pendingToCheck.length === 0

  return { allowed, results: allResults, summary }
}

export const addSensitiveWord = (
  config: MaterialConfig,
  word: string
): MaterialConfig => {
  const trimmed = word.trim()
  if (!trimmed) return config

  const existing = config.sensitiveWords || []
  if (existing.some(w => w.toLowerCase() === trimmed.toLowerCase())) {
    return config
  }

  return {
    ...config,
    sensitiveWords: [...existing, trimmed]
  }
}

export const removeSensitiveWord = (
  config: MaterialConfig,
  word: string
): MaterialConfig => {
  const existing = config.sensitiveWords || []
  const lowerWord = word.toLowerCase()
  const filtered = existing.filter(w => w.toLowerCase() !== lowerWord)

  if (filtered.length === existing.length) {
    return config
  }

  return {
    ...config,
    sensitiveWords: filtered
  }
}
