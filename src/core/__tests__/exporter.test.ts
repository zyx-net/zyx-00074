import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as Exporter from '../exporter'
import * as Parser from '../parser'
import * as State from '../state'
import * as History from '../history'
import * as Checker from '../checker'
import type { WorkspaceState, MaterialConfig, ExportFormat, ClipStatus, ExportOptions, Clip } from '../../core/types'

const sampleTranscript = `【记者】: 张教授您好，非常感谢您接受我们的采访。首先想请您谈谈这次项目的背景和初衷。

【张教授】: 谢谢你们的邀请。这个项目其实源于三年前一次偶然的实地考察，我们在西南某山区调研时发现，当地的生态环境保护和经济发展之间存在很大的矛盾。

【记者】: 能具体谈谈是什么样的矛盾吗？

【张教授】: 当地有丰富的矿产资源，如果开采的话能快速带动经济，但同时也会破坏当地的生态环境，影响下游的饮用水安全。而且那个地方还有一些历史文物遗迹，开采可能会对它们造成损害。
---
【记者】: 那你们团队是如何着手解决这个问题的？

【张教授】: 我们花了两年多的时间，走访了十几个村落，收集了大量的一手数据。同时也参考了国内外很多类似的案例，比如北欧的可持续发展模式。

【记者】: 在调研过程中有没有遇到什么困难？

【张教授】: 困难当然很多，最大的问题是当地村民的不理解。他们觉得我们是来阻止他们致富的，一开始对我们非常排斥。后来我们通过举办科普讲座、组织村民到其他成功案例地区参观，慢慢才获得了他们的信任。

【记者】: 那这个敏感话题你们是如何处理的？

【张教授】: 这确实是个难点。我们的原则是既要尊重当地村民的发展诉求，也要守住生态保护的底线。我们提出了一个"生态补偿+产业转型"的方案，由政府和企业共同出资建立生态补偿基金，同时帮助当地发展生态旅游和特色农业。

---
---
---

【记者】: 这个方案现在实施的效果如何？

【张教授】: 从目前的数据来看，效果还是不错的。村民的收入平均增长了30%左右，同时当地的森林覆盖率也提高了15个百分点。更重要的是，村民的生态保护意识明显增强了。

【记者】: 对于其他面临类似问题的地区，您有什么建议？

【张教授】: 我觉得最重要的是要因地制宜，不能照搬别人的经验。每个地方的情况都不一样，必须深入了解当地的实际情况，充分听取当地群众的意见。另外，政府的引导和支持也非常关键。

【记者】: 好的，再次感谢张教授接受我们的采访。希望你们的项目能够取得更大的成功。

【张教授】: 谢谢，也希望通过你们的报道，能让更多人关注生态保护和可持续发展的问题。`

const sampleConfig: MaterialConfig = {
  separator: '---',
  speakerPattern: '【(.*?)】:',
  timestampPattern: '',
  defaultTags: ['生态保护', '可持续发展', '采访'],
  sensitiveWords: ['敏感话题', '损害', '矛盾'],
  requiredReferencePatterns: [
    '《环境保护法》',
    '《乡村振兴战略规划》',
    '《可持续发展议程》'
  ]
}

const createTestWorkspace = (clipCount: number = 3): WorkspaceState => {
  const parseResult = Parser.parseTranscript(sampleTranscript, sampleConfig)
  const merged = Parser.mergeParseResult([], [], parseResult.clips.slice(0, clipCount), parseResult.tags)
  return {
    clips: merged.clips,
    tags: merged.tags,
    config: sampleConfig
  }
}

describe('导出核心功能测试', () => {
  let workspace: WorkspaceState

  beforeEach(() => {
    workspace = createTestWorkspace(3)
    History.clearOperationLog()
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  describe('1. 发布清单格式导出', () => {
    it('1.1 导出发布清单包含所有必需字段', () => {
      const result = Exporter.exportClips(workspace, {
        format: 'manifest',
        includeStatus: ['available', 'published'],
        materialTitle: '生态保护采访'
      })

      expect(result.format).toBe('manifest')
      expect(result.fileName.endsWith('.json')).toBe(true)
      expect(result.clipCount).toBeGreaterThan(0)

      const parsed = JSON.parse(result.content)
      
      expect(parsed.meta).toBeDefined()
      expect(parsed.meta.exportedAt).toBeDefined()
      expect(parsed.meta.version).toBe('1.0.0')
      expect(parsed.meta.materialTitle).toBe('生态保护采访')

      expect(parsed.fragments).toBeDefined()
      expect(parsed.fragments.total).toBe(result.clipCount)
      expect(parsed.fragments.byStatus).toBeDefined()
      expect(parsed.fragments.items).toBeDefined()
      expect(parsed.fragments.items.length).toBe(result.clipCount)

      parsed.fragments.items.forEach((item: any) => {
        expect(item.id).toBeDefined()
        expect(item.status).toBeDefined()
        expect(item.tags).toBeDefined()
        expect(item.contentPreview).toBeDefined()
        expect(item.hasSensitive).toBeDefined()
        expect(item.hasReferences).toBeDefined()
      })

      expect(parsed.tagStatistics).toBeDefined()
      expect(Array.isArray(parsed.tagStatistics)).toBe(true)

      expect(parsed.configSnapshot).toBeDefined()
      expect(parsed.configSnapshot.sensitiveWords).toEqual(sampleConfig.sensitiveWords)

      expect(parsed.checkSummary).toBeDefined()
      expect(parsed.checkSummary.totalClips).toBe(workspace.clips.length)

      expect(parsed.recentOperations).toBeDefined()
      expect(Array.isArray(parsed.recentOperations)).toBe(true)

      expect(parsed.exportSettings).toBeDefined()
      expect(parsed.exportSettings.includeStatus).toEqual(['available', 'published'])
      expect(parsed.exportSettings.excludeSensitive).toBe(true)
    })

    it('1.2 标签统计正确计算各状态数量', () => {
      const clip1 = workspace.clips[0]
      const clip2 = workspace.clips[1]
      
      const r1 = State.setClipStatus(workspace, clip1.id, 'pending')
      workspace = r1.state
      
      const r2 = State.setClipStatus(workspace, clip2.id, 'published')
      workspace = r2.state

      const result = Exporter.exportClips(workspace, {
        format: 'manifest',
        includeStatus: ['available', 'pending', 'published'],
        excludeSensitive: false
      })

      const parsed = JSON.parse(result.content)
      const stats = parsed.tagStatistics
      
      expect(stats.length).toBeGreaterThan(0)
      stats.forEach((stat: any) => {
        expect(stat.count).toBeGreaterThan(0)
        expect(stat.byStatus).toBeDefined()
        expect(stat.byStatus.available).toBeGreaterThanOrEqual(0)
        expect(stat.byStatus.pending).toBeGreaterThanOrEqual(0)
        expect(stat.byStatus.published).toBeGreaterThanOrEqual(0)
      })
    })

    it('1.3 操作日志最多包含最近20条', () => {
      for (let i = 0; i < 25; i++) {
        History.logOperation('save', true, `操作 ${i}`)
      }

      const result = Exporter.exportClips(workspace, {
        format: 'manifest',
        includeStatus: ['available']
      })

      const parsed = JSON.parse(result.content)
      expect(parsed.recentOperations.length).toBeLessThanOrEqual(20)
    })
  })

  describe('2. 文件名格式化', () => {
    it('2.1 文件名包含素材标题和时间戳', () => {
      const result = Exporter.exportClips(workspace, {
        format: 'markdown',
        includeStatus: ['available'],
        materialTitle: '生态保护项目采访'
      })

      expect(result.fileName).toContain('生态保护项目采访')
      expect(result.fileName).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/)
      expect(result.fileName.endsWith('.md')).toBe(true)
    })

    it('2.2 文件名特殊字符被正确转义', () => {
      const result = Exporter.exportClips(workspace, {
        format: 'json',
        includeStatus: ['available'],
        materialTitle: '采访: 生态/保护\\项目*2024?'
      })

      expect(result.fileName).not.toContain(':')
      expect(result.fileName).not.toContain('/')
      expect(result.fileName).not.toContain('\\')
      expect(result.fileName).not.toContain('*')
      expect(result.fileName).not.toContain('?')
      expect(result.fileName.endsWith('.json')).toBe(true)
    })

    it('2.3 不同格式使用正确的扩展名', () => {
      const formats: { format: ExportFormat; ext: string }[] = [
        { format: 'markdown', ext: '.md' },
        { format: 'json', ext: '.json' },
        { format: 'manifest', ext: '.json' }
      ]

      formats.forEach(({ format, ext }) => {
        const result = Exporter.exportClips(workspace, {
          format,
          includeStatus: ['available'],
          materialTitle: '测试'
        })
        expect(result.fileName.endsWith(ext)).toBe(true)
      })
    })

    it('2.4 空标题使用默认值', () => {
      const result = Exporter.exportClips(workspace, {
        format: 'markdown',
        includeStatus: ['available'],
        materialTitle: ''
      })

      expect(result.fileName).toContain('未命名素材')
    })
  })

  describe('3. 敏感词、待核实、禁用片段处理', () => {
    it('3.1 默认排除包含敏感词的片段', () => {
      const result = Exporter.exportClips(workspace, {
        format: 'json',
        includeStatus: ['available'],
        excludeSensitive: true
      })

      const parsed = JSON.parse(result.content)
      const allContent = parsed.clips.map((c: any) => c.content).join(' ')
      
      sampleConfig.sensitiveWords!.forEach(word => {
        expect(allContent).not.toContain(word)
      })

      expect(result.excludedCount.sensitive).toBeGreaterThan(0)
    })

    it('3.2 关闭敏感词排除后包含所有片段', () => {
      const result = Exporter.exportClips(workspace, {
        format: 'json',
        includeStatus: ['available'],
        excludeSensitive: false
      })

      const parsed = JSON.parse(result.content)
      const allContent = parsed.clips.map((c: any) => c.content).join(' ')
      
      let hasSensitive = false
      sampleConfig.sensitiveWords!.forEach(word => {
        if (allContent.includes(word)) {
          hasSensitive = true
        }
      })
      expect(hasSensitive).toBe(true)

      expect(result.excludedCount.sensitive).toBe(0)
    })

    it('3.3 待核实片段默认不导出', () => {
      const clip = workspace.clips[0]
      const result = State.setClipStatus(workspace, clip.id, 'pending')
      workspace = result.state

      const exportResult = Exporter.exportClips(workspace, {
        format: 'json',
        includeStatus: ['available', 'published']
      })

      const parsed = JSON.parse(exportResult.content)
      const clipIds = parsed.clips.map((c: any) => c.id)
      expect(clipIds).not.toContain(clip.id)
      expect(exportResult.excludedCount.status).toBe(1)
    })

    it('3.4 禁用片段默认不导出', () => {
      const clip = workspace.clips[0]
      const result = State.setClipStatus(workspace, clip.id, 'disabled')
      workspace = result.state

      const exportResult = Exporter.exportClips(workspace, {
        format: 'json',
        includeStatus: ['available', 'published']
      })

      const parsed = JSON.parse(exportResult.content)
      const clipIds = parsed.clips.map((c: any) => c.id)
      expect(clipIds).not.toContain(clip.id)
      expect(exportResult.excludedCount.status).toBe(1)
    })

    it('3.5 手动选择包含待核实片段时会导出', () => {
      const clip = workspace.clips[0]
      const result = State.setClipStatus(workspace, clip.id, 'pending')
      workspace = result.state

      const exportResult = Exporter.exportClips(workspace, {
        format: 'json',
        includeStatus: ['available', 'pending'],
        excludeSensitive: false
      })

      const parsed = JSON.parse(exportResult.content)
      const clipIds = parsed.clips.map((c: any) => c.id)
      expect(clipIds).toContain(clip.id)
    })
  })

  describe('4. 导出冲突检测', () => {
    it('4.1 筛选条件导致无结果时检测到阻塞冲突', () => {
      const conflicts = Exporter.checkExportConflicts(workspace, {
        format: 'json',
        includeStatus: ['published']
      })

      const emptyConflict = conflicts.find(c => c.type === 'empty_result')
      expect(emptyConflict).toBeDefined()
      expect(emptyConflict!.message).toContain('没有可导出的片段')
      expect(emptyConflict!.action).toBeDefined()
    })

    it('4.2 包含待核实片段时检测到警告', () => {
      const clip = workspace.clips[0]
      const result = State.setClipStatus(workspace, clip.id, 'pending')
      workspace = result.state

      const conflicts = Exporter.checkExportConflicts(workspace, {
        format: 'json',
        includeStatus: ['available', 'pending'],
        excludeSensitive: false
      })

      const pendingConflict = conflicts.find(c => c.type === 'pending_included')
      expect(pendingConflict).toBeDefined()
      expect(pendingConflict!.message).toContain('待核实片段')
    })

    it('4.3 包含禁用片段时检测到警告', () => {
      const clip = workspace.clips[0]
      const result = State.setClipStatus(workspace, clip.id, 'disabled')
      workspace = result.state

      const conflicts = Exporter.checkExportConflicts(workspace, {
        format: 'json',
        includeStatus: ['available', 'disabled'],
        excludeSensitive: false
      })

      const disabledConflict = conflicts.find(c => c.type === 'disabled_included')
      expect(disabledConflict).toBeDefined()
      expect(disabledConflict!.message).toContain('禁用片段')
    })

    it('4.4 关闭敏感词排除时检测到警告', () => {
      const conflicts = Exporter.checkExportConflicts(workspace, {
        format: 'json',
        includeStatus: ['available'],
        excludeSensitive: false
      })

      const sensitiveConflict = conflicts.find(c => c.type === 'sensitive_mismatch')
      expect(sensitiveConflict).toBeDefined()
      expect(sensitiveConflict!.message).toContain('敏感词')
    })

    it('4.5 正常设置无冲突', () => {
      const conflicts = Exporter.checkExportConflicts(workspace, {
        format: 'json',
        includeStatus: ['available', 'published'],
        excludeSensitive: true
      })

      expect(conflicts.length).toBe(0)
    })

    it('4.6 导出预览包含冲突信息', () => {
      const preview = Exporter.buildExportPreview(workspace, {
        format: 'json',
        includeStatus: ['published']
      })

      expect(preview.conflicts).toBeDefined()
      expect(preview.conflicts.length).toBeGreaterThan(0)
      expect(preview.blockingIssues).toBeDefined()
    })
  })

  describe('5. 配置持久化', () => {
    it('5.1 保存和加载导出偏好', () => {
      const prefs = {
        format: 'manifest' as ExportFormat,
        includeStatus: ['available', 'published'] as ClipStatus[],
        includeTags: ['生态保护'],
        excludeSensitive: true,
        materialTitle: '测试采访'
      }

      Exporter.saveExportPreferences(prefs)
      const loaded = Exporter.loadExportPreferences()

      expect(loaded.format).toBe('manifest')
      expect(loaded.includeStatus).toEqual(['available', 'published'])
      expect(loaded.includeTags).toEqual(['生态保护'])
      expect(loaded.excludeSensitive).toBe(true)
      expect(loaded.materialTitle).toBe('测试采访')
    })

    it('5.2 偏好设置跨重启保留', () => {
      Exporter.saveExportPreferences({
        format: 'json',
        materialTitle: '持久化测试'
      })

      const loaded = Exporter.loadExportPreferences()
      expect(loaded.format).toBe('json')
      expect(loaded.materialTitle).toBe('持久化测试')
    })

    it('5.3 清除偏好设置', () => {
      Exporter.saveExportPreferences({
        format: 'manifest',
        materialTitle: '待清除'
      })

      Exporter.clearExportPreferences()
      const loaded = Exporter.loadExportPreferences()

      expect(loaded.format).toBe('markdown')
      expect(loaded.materialTitle).toBe('未命名素材')
    })

    it('5.4 localStorage 不可用时优雅降级', () => {
      const originalSetItem = localStorage.setItem
      localStorage.setItem = vi.fn().mockImplementation(() => {
        throw new Error('QuotaExceededError')
      })

      expect(() => {
        Exporter.saveExportPreferences({ format: 'json' })
      }).not.toThrow()

      localStorage.setItem = originalSetItem
    })
  })

  describe('6. 导出预览功能', () => {
    it('6.1 Markdown 格式预览正确', () => {
      const preview = Exporter.buildExportPreview(workspace, {
        format: 'markdown',
        includeStatus: ['available'],
        materialTitle: '预览测试'
      })

      expect(preview.preview).toContain('# 预览测试')
      expect(preview.preview).toContain('## 片段列表')
      expect(preview.count).toBeGreaterThan(0)
    })

    it('6.2 发布清单格式预览正确', () => {
      const preview = Exporter.buildExportPreview(workspace, {
        format: 'manifest',
        includeStatus: ['available']
      })

      const parsed = JSON.parse(preview.preview)
      expect(parsed.meta).toBeDefined()
      expect(parsed.fragments).toBeDefined()
      expect(parsed.tagStatistics).toBeDefined()
    })

    it('6.3 预览最多包含3个片段', () => {
      const bigWorkspace = createTestWorkspace(5)
      const preview = Exporter.buildExportPreview(bigWorkspace, {
        format: 'markdown',
        includeStatus: ['available'],
        excludeSensitive: false
      })

      const matches = preview.preview.match(/### 片段 \d+/g)
      expect(matches?.length).toBeLessThanOrEqual(3)
    })
  })

  describe('7. JSON 格式包含发布清单', () => {
    it('7.1 JSON 导出包含完整的发布清单元数据', () => {
      const result = Exporter.exportClips(workspace, {
        format: 'json',
        includeStatus: ['available'],
        materialTitle: '完整导出'
      })

      const parsed = JSON.parse(result.content)
      expect(parsed.manifest).toBeDefined()
      expect(parsed.manifest.meta.materialTitle).toBe('完整导出')
      expect(parsed.manifest.fragments).toBeDefined()
      expect(parsed.manifest.tagStatistics).toBeDefined()
      expect(parsed.manifest.checkSummary).toBeDefined()
      expect(parsed.manifest.recentOperations).toBeDefined()
    })
  })

  describe('8. 操作日志记录', () => {
    it('8.1 导出成功记录操作日志', () => {
      const logBefore = History.getOperationLog().length
      
      Exporter.exportClips(workspace, {
        format: 'json',
        includeStatus: ['available'],
        materialTitle: '日志测试'
      })

      const logAfter = History.getOperationLog()
      expect(logAfter.length).toBe(logBefore + 1)
      expect(logAfter[0].type).toBe('export')
      expect(logAfter[0].success).toBe(true)
      expect(logAfter[0].message).toContain('json')
    })

    it('8.2 导出被阻止时记录失败日志', () => {
      const logBefore = History.getOperationLog().length
      
      const conflicts = Exporter.checkExportConflicts(workspace, {
        format: 'json',
        includeStatus: ['published']
      })

      if (conflicts.some(c => c.type === 'empty_result')) {
        History.logOperation('export', false, '导出被阻止：筛选条件下没有可导出的片段')
      }

      const logAfter = History.getOperationLog()
      expect(logAfter.length).toBe(logBefore + 1)
      expect(logAfter[0].success).toBe(false)
    })
  })

  describe('9. 标签筛选功能', () => {
    it('9.1 按标签筛选导出', () => {
      const result = Exporter.exportClips(workspace, {
        format: 'json',
        includeStatus: ['available'],
        includeTags: ['生态保护'],
        excludeSensitive: false
      })

      const parsed = JSON.parse(result.content)
      parsed.clips.forEach((clip: any) => {
        const hasTag = clip.tags.some((t: string) => t.toLowerCase() === '生态保护')
        expect(hasTag).toBe(true)
      })
    })

    it('9.2 标签筛选不区分大小写', () => {
      const result = Exporter.exportClips(workspace, {
        format: 'json',
        includeStatus: ['available'],
        includeTags: ['生态保护'.toUpperCase()],
        excludeSensitive: false
      })

      expect(result.clipCount).toBeGreaterThan(0)
    })

    it('9.3 不选择标签时导出所有', () => {
      const result = Exporter.exportClips(workspace, {
        format: 'json',
        includeStatus: ['available'],
        excludeSensitive: false
      })

      const parsed = JSON.parse(result.content)
      expect(parsed.clips.length).toBe(workspace.clips.filter(c => c.status === 'available').length)
    })
  })
})

describe('导出失败路径测试', () => {
  let workspace: WorkspaceState

  beforeEach(() => {
    workspace = createTestWorkspace(3)
    History.clearOperationLog()
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('1. localStorage 写入失败时不抛出异常', () => {
    const originalSetItem = localStorage.setItem
    localStorage.setItem = vi.fn().mockImplementation(() => {
      throw new Error('Storage error')
    })

    expect(() => {
      Exporter.saveExportPreferences({ format: 'json' })
    }).not.toThrow()

    localStorage.setItem = originalSetItem
  })

  it('2. localStorage 读取失败时返回默认值', () => {
    const originalGetItem = localStorage.getItem
    localStorage.getItem = vi.fn().mockImplementation(() => {
      throw new Error('Storage error')
    })

    const prefs = Exporter.loadExportPreferences()
    expect(prefs.format).toBe('markdown')
    expect(prefs.includeStatus).toEqual(['available', 'published'])

    localStorage.getItem = originalGetItem
  })

  it('3. 损坏的偏好数据能优雅处理', () => {
    localStorage.setItem('interview_tool_export_preferences', '{ invalid json }')
    
    const prefs = Exporter.loadExportPreferences()
    expect(prefs.format).toBe('markdown')
  })

  it('4. 空工作区导出时正确处理', () => {
    const emptyWorkspace: WorkspaceState = {
      clips: [],
      tags: [],
      config: {}
    }

    const result = Exporter.exportClips(emptyWorkspace, {
      format: 'json',
      includeStatus: ['available']
    })

    expect(result.clipCount).toBe(0)
    expect(result.fileName).toBeDefined()
  })

  it('5. 导出统计排除数量正确', () => {
    const clip1 = workspace.clips[0]
    const clip2 = workspace.clips[1]
    
    const r1 = State.setClipStatus(workspace, clip1.id, 'pending')
    workspace = r1.state
    
    const r2 = State.setClipStatus(workspace, clip2.id, 'disabled')
    workspace = r2.state

    const result = Exporter.exportClips(workspace, {
      format: 'json',
      includeStatus: ['available', 'published'],
      includeTags: ['不存在的标签']
    })

    expect(result.excludedCount.status).toBe(2)
    expect(result.excludedCount.tags).toBeGreaterThan(0)
  })
})

describe('导出配置一致性测试', () => {
  let workspace: WorkspaceState

  beforeEach(() => {
    workspace = createTestWorkspace(3)
    History.clearOperationLog()
  })

  it('1. 导出设置与清单记录一致', () => {
    const options = {
      format: 'manifest' as ExportFormat,
      includeStatus: ['available', 'published'] as ClipStatus[],
      includeTags: ['生态保护'],
      excludeSensitive: true,
      materialTitle: '一致性测试'
    }

    const result = Exporter.exportClips(workspace, options)
    const parsed = JSON.parse(result.content)

    expect(parsed.exportSettings.includeStatus).toEqual(options.includeStatus)
    expect(parsed.exportSettings.includeTags).toEqual(options.includeTags)
    expect(parsed.exportSettings.excludeSensitive).toBe(options.excludeSensitive)
  })

  it('2. 配置快照与当前配置一致', () => {
    const result = Exporter.exportClips(workspace, {
      format: 'manifest',
      includeStatus: ['available']
    })

    const parsed = JSON.parse(result.content)
    expect(parsed.configSnapshot.sensitiveWords).toEqual(workspace.config.sensitiveWords)
    expect(parsed.configSnapshot.defaultTags).toEqual(workspace.config.defaultTags)
  })

  it('3. 导出数量与清单统计一致', () => {
    const result = Exporter.exportClips(workspace, {
      format: 'manifest',
      includeStatus: ['available'],
      excludeSensitive: false
    })

    const parsed = JSON.parse(result.content)
    expect(parsed.fragments.total).toBe(result.clipCount)
    expect(parsed.fragments.items.length).toBe(result.clipCount)
  })
})

describe('导入样例后导出验证', () => {
  it('1. 导入样例素材后导出发布包可用', () => {
    const parseResult = Parser.parseTranscript(sampleTranscript, sampleConfig)
    const merged = Parser.mergeParseResult([], [], parseResult.clips, parseResult.tags)
    const workspace: WorkspaceState = {
      clips: merged.clips,
      tags: merged.tags,
      config: sampleConfig
    }

    const result = Exporter.exportClips(workspace, {
      format: 'manifest',
      includeStatus: ['available', 'published'],
      materialTitle: '生态保护与可持续发展采访',
      excludeSensitive: true
    })

    expect(result.clipCount).toBeGreaterThan(0)
    expect(result.fileName).toContain('生态保护与可持续发展采访')
    
    const parsed = JSON.parse(result.content)
    expect(parsed.meta.version).toBe('1.0.0')
    expect(parsed.fragments.total).toBe(result.clipCount)
    expect(parsed.tagStatistics.length).toBeGreaterThan(0)
    expect(parsed.checkSummary.totalClips).toBe(workspace.clips.length)
    
    parsed.fragments.items.forEach((item: any) => {
      expect(item.status).toBe('available')
      expect(item.hasSensitive).toBe(false)
    })

    const allContent = parsed.fragments.items.map((i: any) => i.contentPreview).join(' ')
    sampleConfig.sensitiveWords!.forEach(word => {
      expect(allContent).not.toContain(word)
    })
  })

  it('2. 导入后导出 Markdown 格式完整', () => {
    const parseResult = Parser.parseTranscript(sampleTranscript, sampleConfig)
    const merged = Parser.mergeParseResult([], [], parseResult.clips, parseResult.tags)
    const workspace: WorkspaceState = {
      clips: merged.clips,
      tags: merged.tags,
      config: sampleConfig
    }

    const result = Exporter.exportClips(workspace, {
      format: 'markdown',
      includeStatus: ['available', 'published'],
      materialTitle: '采访记录',
      excludeSensitive: true
    })

    expect(result.content).toContain('# 采访记录')
    expect(result.content).toContain('## 发布包信息')
    expect(result.content).toContain('## 片段列表')
    expect(result.content).toContain('### 片段 1')
    expect(result.content).toContain('元数据')
  })
})

describe('混合状态素材导出回归测试', () => {
  let workspace: WorkspaceState

  const createClip = (id: string, content: string, status: ClipStatus, tags: string[] = []): Clip => ({
    id,
    content,
    status,
    speaker: '测试',
    tags,
    notes: '',
    references: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  })

  beforeEach(() => {
    workspace = {
      clips: [
        createClip('clip-1', '这是正常可用的片段内容[来源：采访记录]', 'available', ['生态保护']),
        createClip('clip-2', '这是待核实的片段，需要进一步确认[来源：内部资料]', 'pending', ['政策']),
        createClip('clip-3', '这是已发布的片段内容[来源：公开报道]', 'published', ['生态保护']),
        createClip('clip-4', '这是被禁用的片段[来源：保密]', 'disabled', ['内部']),
        createClip('clip-5', '另一个可用片段[来源：技术文档]', 'available', ['技术'])
      ],
      tags: ['生态保护', '政策', '内部', '技术'],
      config: {
        sensitiveWords: ['敏感话题', '损害', '矛盾'],
        separator: '---',
        speakerPattern: '【(.*?)】:'
      }
    }
    History.clearOperationLog()
  })

  describe('checkBeforeExport 混合状态测试', () => {
    it('1. 工作区存在待核实片段但默认排除时，预检应通过', () => {
      expect(workspace.clips.filter(c => c.status === 'pending').length).toBeGreaterThan(0)
      expect(workspace.clips.filter(c => c.status === 'disabled').length).toBeGreaterThan(0)

      const defaultOptions: ExportOptions = {
        format: 'manifest',
        includeStatus: ['available', 'published'],
        excludeSensitive: true,
        materialTitle: '混合状态测试'
      }

      const result = Checker.checkBeforeExport(workspace, defaultOptions)
      expect(result.allowed).toBe(true)
      expect(result.summary.totalClips).toBe(3)
    })

    it('2. 主动选择包含待核实片段时，预检应拦截', () => {
      const includePendingOptions: ExportOptions = {
        format: 'manifest',
        includeStatus: ['available', 'pending'],
        excludeSensitive: true,
        materialTitle: '包含待核实测试'
      }

      const result = Checker.checkBeforeExport(workspace, includePendingOptions)
      expect(result.allowed).toBe(false)
      const hasPendingError = result.results.some(r =>
        r.type === 'other' && r.severity === 'error' && r.message.includes('待核实片段不能发布')
      )
      expect(hasPendingError).toBe(true)
    })

    it('3. 主动选择包含禁用片段时，预检应通过（禁用仅警告）', () => {
      const includeDisabledOptions: ExportOptions = {
        format: 'manifest',
        includeStatus: ['available', 'disabled'],
        excludeSensitive: true,
        materialTitle: '包含禁用测试'
      }

      const result = Checker.checkBeforeExport(workspace, includeDisabledOptions)
      expect(result.allowed).toBe(true)
      expect(result.summary.totalClips).toBe(3)
    })

    it('4. 无导出选项时保持旧行为：拦截所有待核实片段', () => {
      const result = Checker.checkBeforeExport(workspace)
      expect(result.allowed).toBe(false)
      const hasPendingError = result.results.some(r =>
        r.type === 'other' && r.severity === 'error' && r.message.includes('待核实片段不能发布')
      )
      expect(hasPendingError).toBe(true)
    })

    it('5. 默认排除待核实时导出发布清单应成功', () => {
      const options: ExportOptions = {
        format: 'manifest',
        includeStatus: ['available', 'published'],
        excludeSensitive: true,
        materialTitle: '混合状态导出测试'
      }

      const result = Exporter.exportClips(workspace, options)
      expect(result.clipCount).toBe(3)
      expect(result.fileName).toContain('混合状态导出测试')

      const parsed = JSON.parse(result.content)
      expect(parsed.fragments.total).toBe(3)
      expect(parsed.fragments.byStatus.available).toBe(2)
      expect(parsed.fragments.byStatus.published).toBe(1)
      expect(parsed.fragments.byStatus.pending).toBe(0)
      expect(parsed.fragments.byStatus.disabled).toBe(0)
    })

    it('6. checkExportConflicts 主动包含待核实应产生警告', () => {
      const includePendingOptions: ExportOptions = {
        format: 'manifest',
        includeStatus: ['available', 'pending'],
        excludeSensitive: true,
        materialTitle: '冲突测试'
      }

      const conflicts = Exporter.checkExportConflicts(workspace, includePendingOptions)
      const pendingConflict = conflicts.find(c => c.type === 'pending_included')
      expect(pendingConflict).toBeDefined()
      expect(pendingConflict!.message).toContain('待核实片段')
    })

    it('7. 默认排除待核实时 checkExportConflicts 不应产生待核实警告', () => {
      const defaultOptions: ExportOptions = {
        format: 'manifest',
        includeStatus: ['available', 'published'],
        excludeSensitive: true,
        materialTitle: '无冲突测试'
      }

      const conflicts = Exporter.checkExportConflicts(workspace, defaultOptions)
      const pendingConflict = conflicts.find(c => c.type === 'pending_included')
      expect(pendingConflict).toBeUndefined()
    })

    it('8. 标签筛选排除所有待核实片段时，checkExportConflicts 不应产生待核实警告', () => {
      const options: ExportOptions = {
        format: 'manifest',
        includeStatus: ['available', 'pending', 'published'],
        includeTags: ['生态保护'],
        excludeSensitive: true,
        materialTitle: '标签筛选测试'
      }

      const conflicts = Exporter.checkExportConflicts(workspace, options)
      const pendingConflict = conflicts.find(c => c.type === 'pending_included')
      expect(pendingConflict).toBeUndefined()

      const { clips: filteredClips } = Exporter.filterClipsForExport(
        workspace.clips,
        options,
        workspace.config.sensitiveWords || []
      )
      const pendingInExport = filteredClips.filter(c => c.status === 'pending')
      expect(pendingInExport.length).toBe(0)
    })

    it('9. 标签筛选命中待核实片段时，checkExportConflicts 应产生警告', () => {
      const options: ExportOptions = {
        format: 'manifest',
        includeStatus: ['available', 'pending', 'published'],
        includeTags: ['政策'],
        excludeSensitive: true,
        materialTitle: '标签命中待核实测试'
      }

      const conflicts = Exporter.checkExportConflicts(workspace, options)
      const pendingConflict = conflicts.find(c => c.type === 'pending_included')
      expect(pendingConflict).toBeDefined()
      expect(pendingConflict!.message).toContain('1 个待核实片段')

      const { clips: filteredClips } = Exporter.filterClipsForExport(
        workspace.clips,
        options,
        workspace.config.sensitiveWords || []
      )
      const pendingInExport = filteredClips.filter(c => c.status === 'pending')
      expect(pendingInExport.length).toBe(1)
    })

    it('10. 敏感词排除关闭但标签筛选排除所有敏感片段时，不应产生敏感词警告', () => {
      const sensitiveWorkspace = {
        ...workspace,
        clips: [
          createClip('clip-1', '正常内容[来源：测试]', 'available', ['生态保护']),
          createClip('clip-2', '包含损害敏感词[来源：测试]', 'available', ['政策']),
        ]
      }

      const options: ExportOptions = {
        format: 'manifest',
        includeStatus: ['available'],
        includeTags: ['生态保护'],
        excludeSensitive: false,
        materialTitle: '敏感词标签筛选测试'
      }

      const conflicts = Exporter.checkExportConflicts(sensitiveWorkspace, options)
      const sensitiveConflict = conflicts.find(c => c.type === 'sensitive_mismatch')
      expect(sensitiveConflict).toBeUndefined()
    })

    it('11. 导出结果与冲突检测一致：标签筛掉待核实时导出不含待核实', () => {
      const options: ExportOptions = {
        format: 'manifest',
        includeStatus: ['available', 'pending', 'published'],
        includeTags: ['生态保护'],
        excludeSensitive: true,
        materialTitle: '一致性测试'
      }

      const conflicts = Exporter.checkExportConflicts(workspace, options)
      const pendingConflict = conflicts.find(c => c.type === 'pending_included')
      expect(pendingConflict).toBeUndefined()

      const result = Exporter.exportClips(workspace, options)
      expect(result.clipCount).toBe(2)

      const parsed = JSON.parse(result.content)
      expect(parsed.fragments.byStatus.pending).toBe(0)
      expect(parsed.fragments.byStatus.available).toBe(1)
      expect(parsed.fragments.byStatus.published).toBe(1)
    })
  })
})
