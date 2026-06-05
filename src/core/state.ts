import type { Clip, ClipStatus, WorkspaceState, MaterialConfig } from './types'

export const createInitialState = (): WorkspaceState => ({
  clips: [],
  tags: [],
  config: {}
})

export const setClipStatus = (
  state: WorkspaceState,
  clipId: string,
  status: ClipStatus
): { state: WorkspaceState; changed: boolean; error?: string } => {
  const clipIndex = state.clips.findIndex(c => c.id === clipId)
  if (clipIndex === -1) {
    return { state, changed: false, error: '片段不存在' }
  }

  const clip = state.clips[clipIndex]
  if (clip.status === status) {
    return { state, changed: false }
  }

  if (status === 'published' && clip.status === 'pending') {
    return { state, changed: false, error: '待核实片段禁止发布，请先核实后再操作' }
  }

  if (status === 'published' && clip.status === 'disabled') {
    return { state, changed: false, error: '禁用片段禁止发布' }
  }

  const updatedClips = [...state.clips]
  updatedClips[clipIndex] = {
    ...clip,
    status,
    updatedAt: Date.now()
  }

  return {
    state: { ...state, clips: updatedClips },
    changed: true
  }
}

export const addTagToClip = (
  state: WorkspaceState,
  clipId: string,
  tagName: string
): { state: WorkspaceState; changed: boolean; error?: string } => {
  const clipIndex = state.clips.findIndex(c => c.id === clipId)
  if (clipIndex === -1) {
    return { state, changed: false, error: '片段不存在' }
  }

  const trimmedTag = tagName.trim()
  if (!trimmedTag) {
    return { state, changed: false, error: '标签不能为空' }
  }

  const lowerTag = trimmedTag.toLowerCase()
  const clip = state.clips[clipIndex]

  const existingClipTagIndex = clip.tags.findIndex(t => t.toLowerCase() === lowerTag)
  if (existingClipTagIndex !== -1) {
    return { state, changed: false }
  }

  let globalTags = state.tags
  const existingGlobalTagIndex = globalTags.findIndex(t => t.toLowerCase() === lowerTag)
  let normalizedTag = trimmedTag

  if (existingGlobalTagIndex === -1) {
    globalTags = [...globalTags, trimmedTag]
  } else {
    normalizedTag = globalTags[existingGlobalTagIndex]
  }

  const updatedClips = [...state.clips]
  updatedClips[clipIndex] = {
    ...clip,
    tags: [...clip.tags, normalizedTag],
    updatedAt: Date.now()
  }

  return {
    state: { ...state, clips: updatedClips, tags: globalTags },
    changed: true
  }
}

export const removeTagFromClip = (
  state: WorkspaceState,
  clipId: string,
  tagName: string
): { state: WorkspaceState; changed: boolean; error?: string } => {
  const clipIndex = state.clips.findIndex(c => c.id === clipId)
  if (clipIndex === -1) {
    return { state, changed: false, error: '片段不存在' }
  }

  const lowerTag = tagName.toLowerCase()
  const clip = state.clips[clipIndex]

  const tagIndex = clip.tags.findIndex(t => t.toLowerCase() === lowerTag)
  if (tagIndex === -1) {
    return { state, changed: false }
  }

  const newTags = [...clip.tags]
  newTags.splice(tagIndex, 1)

  const updatedClips = [...state.clips]
  updatedClips[clipIndex] = {
    ...clip,
    tags: newTags,
    updatedAt: Date.now()
  }

  return {
    state: { ...state, clips: updatedClips },
    changed: true
  }
}

export const deleteTag = (
  state: WorkspaceState,
  tagName: string
): { state: WorkspaceState; changed: boolean; error?: string } => {
  const lowerTag = tagName.toLowerCase()
  const tagIndex = state.tags.findIndex(t => t.toLowerCase() === lowerTag)
  if (tagIndex === -1) {
    return { state, changed: false, error: '标签不存在' }
  }

  const newGlobalTags = [...state.tags]
  newGlobalTags.splice(tagIndex, 1)

  const updatedClips = state.clips.map(clip => {
    const newClipTags = clip.tags.filter(t => t.toLowerCase() !== lowerTag)
    if (newClipTags.length !== clip.tags.length) {
      return { ...clip, tags: newClipTags, updatedAt: Date.now() }
    }
    return clip
  })

  return {
    state: { ...state, clips: updatedClips, tags: newGlobalTags },
    changed: true
  }
}

export const renameTag = (
  state: WorkspaceState,
  oldTagName: string,
  newTagName: string
): { state: WorkspaceState; changed: boolean; error?: string } => {
  const trimmedNew = newTagName.trim()
  if (!trimmedNew) {
    return { state, changed: false, error: '新标签名不能为空' }
  }

  const lowerOld = oldTagName.toLowerCase()
  const lowerNew = trimmedNew.toLowerCase()

  const oldTagIndex = state.tags.findIndex(t => t.toLowerCase() === lowerOld)
  if (oldTagIndex === -1) {
    return { state, changed: false, error: '原标签不存在' }
  }

  if (lowerOld === lowerNew) {
    return { state, changed: false }
  }

  const existingNewIndex = state.tags.findIndex(t => t.toLowerCase() === lowerNew)
  if (existingNewIndex !== -1) {
    return { state, changed: false, error: '已存在相同标签' }
  }

  const newGlobalTags = [...state.tags]
  newGlobalTags[oldTagIndex] = trimmedNew

  const updatedClips = state.clips.map(clip => {
    const newClipTags = clip.tags.map(t =>
      t.toLowerCase() === lowerOld ? trimmedNew : t
    )
    if (JSON.stringify(newClipTags) !== JSON.stringify(clip.tags)) {
      return { ...clip, tags: newClipTags, updatedAt: Date.now() }
    }
    return clip
  })

  return {
    state: { ...state, clips: updatedClips, tags: newGlobalTags },
    changed: true
  }
}

export const addReferenceToClip = (
  state: WorkspaceState,
  clipId: string,
  reference: string
): { state: WorkspaceState; changed: boolean; error?: string } => {
  const clipIndex = state.clips.findIndex(c => c.id === clipId)
  if (clipIndex === -1) {
    return { state, changed: false, error: '片段不存在' }
  }

  const trimmedRef = reference.trim()
  if (!trimmedRef) {
    return { state, changed: false, error: '引用不能为空' }
  }

  const clip = state.clips[clipIndex]
  if (clip.references.includes(trimmedRef)) {
    return { state, changed: false }
  }

  const updatedClips = [...state.clips]
  updatedClips[clipIndex] = {
    ...clip,
    references: [...clip.references, trimmedRef],
    updatedAt: Date.now()
  }

  return {
    state: { ...state, clips: updatedClips },
    changed: true
  }
}

export const removeReferenceFromClip = (
  state: WorkspaceState,
  clipId: string,
  reference: string
): { state: WorkspaceState; changed: boolean; error?: string } => {
  const clipIndex = state.clips.findIndex(c => c.id === clipId)
  if (clipIndex === -1) {
    return { state, changed: false, error: '片段不存在' }
  }

  const clip = state.clips[clipIndex]
  const refIndex = clip.references.indexOf(reference)
  if (refIndex === -1) {
    return { state, changed: false }
  }

  const newReferences = [...clip.references]
  newReferences.splice(refIndex, 1)

  const updatedClips = [...state.clips]
  updatedClips[clipIndex] = {
    ...clip,
    references: newReferences,
    updatedAt: Date.now()
  }

  return {
    state: { ...state, clips: updatedClips },
    changed: true
  }
}

export const updateClipContent = (
  state: WorkspaceState,
  clipId: string,
  content: string
): { state: WorkspaceState; changed: boolean; error?: string } => {
  const clipIndex = state.clips.findIndex(c => c.id === clipId)
  if (clipIndex === -1) {
    return { state, changed: false, error: '片段不存在' }
  }

  const trimmed = content.trim()
  if (!trimmed) {
    return { state, changed: false, error: '内容不能为空' }
  }

  const clip = state.clips[clipIndex]
  if (clip.content === trimmed) {
    return { state, changed: false }
  }

  const updatedClips = [...state.clips]
  updatedClips[clipIndex] = {
    ...clip,
    content: trimmed,
    updatedAt: Date.now()
  }

  return {
    state: { ...state, clips: updatedClips },
    changed: true
  }
}

export const updateClipNotes = (
  state: WorkspaceState,
  clipId: string,
  notes: string
): { state: WorkspaceState; changed: boolean; error?: string } => {
  const clipIndex = state.clips.findIndex(c => c.id === clipId)
  if (clipIndex === -1) {
    return { state, changed: false, error: '片段不存在' }
  }

  const clip = state.clips[clipIndex]
  if (clip.notes === notes) {
    return { state, changed: false }
  }

  const updatedClips = [...state.clips]
  updatedClips[clipIndex] = {
    ...clip,
    notes,
    updatedAt: Date.now()
  }

  return {
    state: { ...state, clips: updatedClips },
    changed: true
  }
}

export const deleteClip = (
  state: WorkspaceState,
  clipId: string
): { state: WorkspaceState; changed: boolean; error?: string } => {
  const clipIndex = state.clips.findIndex(c => c.id === clipId)
  if (clipIndex === -1) {
    return { state, changed: false, error: '片段不存在' }
  }

  const newClips = [...state.clips]
  newClips.splice(clipIndex, 1)

  return {
    state: { ...state, clips: newClips },
    changed: true
  }
}

export const updateConfig = (
  state: WorkspaceState,
  config: Partial<MaterialConfig>
): { state: WorkspaceState; changed: boolean } => {
  const mergedConfig = { ...state.config, ...config }
  if (JSON.stringify(mergedConfig) === JSON.stringify(state.config)) {
    return { state, changed: false }
  }
  return {
    state: { ...state, config: mergedConfig },
    changed: true
  }
}

export const setClips = (
  state: WorkspaceState,
  clips: Clip[]
): { state: WorkspaceState; changed: boolean } => {
  return {
    state: { ...state, clips },
    changed: true
  }
}

export const setTags = (
  state: WorkspaceState,
  tags: string[]
): { state: WorkspaceState; changed: boolean } => {
  const normalizedTags: string[] = []
  const seen = new Set<string>()

  for (const tag of tags) {
    const lower = tag.toLowerCase()
    if (!seen.has(lower)) {
      seen.add(lower)
      normalizedTags.push(tag)
    }
  }

  if (JSON.stringify(normalizedTags) === JSON.stringify(state.tags)) {
    return { state, changed: false }
  }

  return {
    state: { ...state, tags: normalizedTags },
    changed: true
  }
}
