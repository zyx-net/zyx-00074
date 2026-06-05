import type { Clip, MaterialConfig } from './types'

const generateId = (): string => {
  return `clip_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

const DEFAULT_CONFIG: Required<MaterialConfig> = {
  separator: '\n\n',
  speakerPattern: '^[\\u4e00-\\u9fa5A-Za-z][\\u4e00-\\u9fa5A-Za-z0-9]*[：:]',
  timestampPattern: '\\[\\d{2}:\\d{2}:\\d{2}\\]|\\(\\d{2}:\\d{2}\\)',
  defaultTags: [],
  sensitiveWords: [],
  requiredReferencePatterns: ['\\[来源[^\\]]*\\]', '\\[引用[^\\]]*\\]', '\\[资料[^\\]]*\\]']
}

export const parseConfig = (configText: string): MaterialConfig => {
  if (!configText.trim()) {
    return {}
  }
  try {
    const parsed = JSON.parse(configText)
    return parsed as MaterialConfig
  } catch {
    return {}
  }
}

const extractSpeaker = (text: string, pattern: string): { speaker: string | undefined; content: string } => {
  const regex = new RegExp(pattern, 'u')
  const match = text.match(regex)
  if (match && match.index === 0) {
    const speaker = match[0].replace(/[：:]$/, '').trim()
    const content = text.slice(match[0].length).trim()
    return { speaker, content }
  }
  return { speaker: undefined, content: text }
}

const extractTimestamp = (text: string, pattern: string): { timestamp: string | undefined; content: string } => {
  const regex = new RegExp(pattern, 'u')
  const match = text.match(regex)
  if (match) {
    const timestamp = match[0]
    const content = text.replace(timestamp, '').trim()
    return { timestamp, content }
  }
  return { timestamp: undefined, content: text }
}

const splitBySeparator = (text: string, separator: string): string[] => {
  if (!separator) {
    return [text]
  }

  const parts = text.split(separator)
  return parts.filter(part => part.trim().length > 0)
}

const normalizeNewlines = (text: string): string => {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

const escapeRegExp = (string: string): string => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const deduplicateTagsCaseInsensitive = (tags: string[]): string[] => {
  const seen = new Set<string>()
  const result: string[] = []
  for (const tag of tags) {
    const lower = tag.toLowerCase()
    if (!seen.has(lower)) {
      seen.add(lower)
      result.push(tag)
    }
  }
  return result
}

export interface ParseResult {
  clips: Clip[]
  tags: string[]
  warnings: string[]
}

export const parseTranscript = (
  transcriptText: string,
  config: MaterialConfig,
  existingTags: string[] = []
): ParseResult => {
  const warnings: string[] = []
  const rawDefaultTags = config.defaultTags ?? DEFAULT_CONFIG.defaultTags
  const dedupedDefaultTags = deduplicateTagsCaseInsensitive(rawDefaultTags)
  if (dedupedDefaultTags.length < rawDefaultTags.length) {
    warnings.push(`默认标签存在大小写重复，已自动去重：${rawDefaultTags.length - dedupedDefaultTags.length} 个重复项`)
  }

  const mergedConfig: Required<MaterialConfig> = {
    separator: config.separator ?? DEFAULT_CONFIG.separator,
    speakerPattern: config.speakerPattern ?? DEFAULT_CONFIG.speakerPattern,
    timestampPattern: config.timestampPattern ?? DEFAULT_CONFIG.timestampPattern,
    defaultTags: dedupedDefaultTags,
    sensitiveWords: config.sensitiveWords ?? DEFAULT_CONFIG.sensitiveWords,
    requiredReferencePatterns: config.requiredReferencePatterns ?? DEFAULT_CONFIG.requiredReferencePatterns
  }

  const normalizedText = normalizeNewlines(transcriptText)
  const escapedSeparator = escapeRegExp(mergedConfig.separator)
  const consecutiveSeparatorPattern = new RegExp(`(${escapedSeparator}){2,}`, 'g')
  const cleanedText = normalizedText.replace(consecutiveSeparatorPattern, mergedConfig.separator)

  if (consecutiveSeparatorPattern.test(normalizedText)) {
    warnings.push('检测到连续空分隔符，已自动合并')
  }

  const rawSegments = splitBySeparator(cleanedText, mergedConfig.separator)

  const seenTags = new Set(existingTags.map(t => t.toLowerCase()))
  const tags: string[] = [...existingTags]

  mergedConfig.defaultTags.forEach(tag => {
    const lowerTag = tag.toLowerCase()
    if (!seenTags.has(lowerTag)) {
      seenTags.add(lowerTag)
      tags.push(tag)
    }
  })

  const clips: Clip[] = []

  for (const segment of rawSegments) {
    const trimmed = segment.trim()
    if (trimmed.length === 0) {
      continue
    }

    let { speaker, content } = extractSpeaker(trimmed, mergedConfig.speakerPattern)
    let timestamp: string | undefined

    const timestampResult = extractTimestamp(content, mergedConfig.timestampPattern)
    timestamp = timestampResult.timestamp
    content = timestampResult.content

    if (content.trim().length === 0) {
      warnings.push(`跳过空内容片段${speaker ? `（说话人：${speaker}）` : ''}`)
      continue
    }

    const clipTags: string[] = mergedConfig.defaultTags.map(tag => {
      const lowerTag = tag.toLowerCase()
      const existingIndex = tags.findIndex(t => t.toLowerCase() === lowerTag)
      return existingIndex >= 0 ? tags[existingIndex] : tag
    })

    const now = Date.now()
    const clip: Clip = {
      id: generateId(),
      content: content.trim(),
      status: 'available',
      speaker,
      timestamp,
      tags: clipTags,
      references: [],
      createdAt: now,
      updatedAt: now
    }

    clips.push(clip)
  }

  if (clips.length === 0) {
    warnings.push('未解析到任何有效片段')
  }

  return { clips, tags, warnings }
}

export const mergeParseResult = (
  existingClips: Clip[],
  existingTags: string[],
  newClips: Clip[],
  newTags: string[]
): { clips: Clip[]; tags: string[] } => {
  const tagMap = new Map<string, string>()

  existingTags.forEach(tag => {
    tagMap.set(tag.toLowerCase(), tag)
  })

  const mergedTags: string[] = [...existingTags]
  newTags.forEach(tag => {
    const lower = tag.toLowerCase()
    if (!tagMap.has(lower)) {
      tagMap.set(lower, tag)
      mergedTags.push(tag)
    }
  })

  const normalizedNewClips = newClips.map(clip => ({
    ...clip,
    tags: clip.tags.map(tag => tagMap.get(tag.toLowerCase()) || tag)
  }))

  return {
    clips: [...existingClips, ...normalizedNewClips],
    tags: mergedTags
  }
}
