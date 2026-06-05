export type ClipStatus = 'available' | 'pending' | 'disabled' | 'published'

export interface Clip {
  id: string
  content: string
  status: ClipStatus
  speaker?: string
  timestamp?: string
  tags: string[]
  references: string[]
  notes?: string
  createdAt: number
  updatedAt: number
}

export interface MaterialConfig {
  separator?: string
  speakerPattern?: string
  timestampPattern?: string
  defaultTags?: string[]
  sensitiveWords?: string[]
  requiredReferencePatterns?: string[]
}

export interface WorkspaceState {
  clips: Clip[]
  tags: string[]
  config: MaterialConfig
  currentWorkspacePath?: string
}

export interface HistoryEntry {
  type: 'import' | 'status_change' | 'tag_add' | 'tag_remove' | 'tag_delete' | 'reference_add' | 'reference_remove' | 'clip_edit' | 'clip_delete'
  timestamp: number
  before: Partial<WorkspaceState>
  after: Partial<WorkspaceState>
  description: string
}

export interface CheckResult {
  type: 'sensitive_word' | 'missing_reference' | 'other'
  severity: 'error' | 'warning' | 'info'
  clipId: string
  message: string
  details?: Record<string, unknown>
}

export type ExportFormat = 'markdown' | 'json' | 'manifest'

export interface ExportOptions {
  format: ExportFormat
  includeStatus?: ClipStatus[]
  includeTags?: string[]
  outputPath?: string
  materialTitle?: string
  excludeSensitive?: boolean
}

export interface TagStatistics {
  tag: string
  count: number
  byStatus: Record<ClipStatus, number>
}

export interface CheckSummarySnapshot {
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

export interface PublishManifest {
  meta: {
    exportedAt: number
    version: string
    materialTitle: string
  }
  fragments: {
    total: number
    byStatus: Record<ClipStatus, number>
    items: Array<{
      id: string
      speaker?: string
      timestamp?: string
      status: ClipStatus
      tags: string[]
      contentPreview: string
      hasSensitive: boolean
      hasReferences: boolean
      createdAt: number
      updatedAt: number
    }>
  }
  tagStatistics: TagStatistics[]
  configSnapshot: MaterialConfig
  checkSummary: CheckSummarySnapshot
  recentOperations: Array<{
    timestamp: number
    type: string
    success: boolean
    message: string
  }>
  exportSettings: {
    includeStatus: ClipStatus[]
    includeTags?: string[]
    excludeSensitive: boolean
  }
}

export interface ExportPackage {
  meta: {
    exportedAt: number
    clipCount: number
    version: string
  }
  clips: Clip[]
  rawContent?: string
  manifest?: PublishManifest
}

export interface ExportPreferences {
  lastFormat: ExportFormat
  includeStatus: ClipStatus[]
  includeTags: string[]
  excludeSensitive: boolean
  materialTitle: string
}
