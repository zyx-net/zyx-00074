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

export interface ExportOptions {
  format: 'markdown' | 'json'
  includeStatus?: ClipStatus[]
  includeTags?: string[]
  outputPath?: string
}

export interface ExportPackage {
  meta: {
    exportedAt: number
    clipCount: number
    version: string
  }
  clips: Clip[]
  rawContent?: string
}
