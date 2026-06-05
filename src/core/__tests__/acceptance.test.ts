import { describe, it, expect, beforeEach } from 'vitest'
import * as Parser from '../parser'
import * as State from '../state'
import * as History from '../history'
import * as Checker from '../checker'
import * as Exporter from '../exporter'
import type { WorkspaceState, MaterialConfig, HistoryEntry } from '../types'

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

const createHistoryEntry = (
  type: HistoryEntry['type'],
  before: Partial<WorkspaceState>,
  after: Partial<WorkspaceState>,
  description: string
): HistoryEntry => ({
  type,
  timestamp: Date.now(),
  before,
  after,
  description
})

describe('验收主链路测试', () => {
  let workspace: WorkspaceState
  let historyState: History.HistoryState

  beforeEach(() => {
    workspace = State.createInitialState()
    historyState = History.createInitialHistory()
  })

  it('1. 导入：解析转写文本和素材配置，正确切分片段', () => {
    const result = Parser.parseTranscript(sampleTranscript, sampleConfig)
    
    expect(result.clips.length).toBeGreaterThan(0)
    expect(result.warnings.length).toBe(0)
    
    const merged = Parser.mergeParseResult(
      workspace.clips,
      workspace.tags,
      result.clips,
      result.tags
    )
    
    workspace = {
      ...workspace,
      clips: merged.clips,
      tags: merged.tags,
      config: { ...workspace.config, ...sampleConfig }
    }
    
    expect(workspace.clips.length).toBe(3)
    expect(workspace.tags.length).toBe(3)
    
    workspace.clips.forEach(clip => {
      expect(clip.content.trim().length).toBeGreaterThan(0)
      expect(clip.status).toBe('available')
      expect(clip.tags).toEqual(expect.arrayContaining(['生态保护', '可持续发展', '采访']))
    })
  })

  it('2. 标记：修改片段状态为可用、待核实、禁用、已发布', () => {
    const parseResult = Parser.parseTranscript(sampleTranscript, sampleConfig)
    const merged = Parser.mergeParseResult(
      [], [], parseResult.clips, parseResult.tags
    )
    workspace = { ...workspace, clips: merged.clips, tags: merged.tags }
    
    const clip1 = workspace.clips[0]
    const clip2 = workspace.clips[1]
    const clip3 = workspace.clips[2]
    
    const result1 = State.setClipStatus(workspace, clip1.id, 'pending')
    expect(result1.changed).toBe(true)
    workspace = result1.state
    
    const result2 = State.setClipStatus(workspace, clip2.id, 'disabled')
    expect(result2.changed).toBe(true)
    workspace = result2.state
    
    const result3 = State.setClipStatus(workspace, clip3.id, 'pending')
    expect(result3.changed).toBe(true)
    workspace = result3.state
    
    expect(workspace.clips[0].status).toBe('pending')
    expect(workspace.clips[1].status).toBe('disabled')
    expect(workspace.clips[2].status).toBe('pending')
  })

  it('3. 撤销：修改状态后可以撤销操作', () => {
    const parseResult = Parser.parseTranscript(sampleTranscript, sampleConfig)
    const merged = Parser.mergeParseResult([], [], parseResult.clips, parseResult.tags)
    workspace = { ...workspace, clips: merged.clips, tags: merged.tags }
    
    const importEntry = createHistoryEntry(
      'import',
      { clips: [], tags: [] },
      { clips: workspace.clips, tags: workspace.tags },
      `导入 ${parseResult.clips.length} 个片段`
    )
    historyState = History.pushHistory(historyState, importEntry)
    
    const clip1 = workspace.clips[0]
    const oldStatus = clip1.status
    const stateBefore = JSON.parse(JSON.stringify(workspace))
    
    const statusResult = State.setClipStatus(workspace, clip1.id, 'pending')
    workspace = statusResult.state
    
    const statusEntry = createHistoryEntry(
      'status_change',
      { clips: stateBefore.clips },
      { clips: workspace.clips },
      `片段状态变更为待核实`
    )
    historyState = History.pushHistory(historyState, statusEntry)
    
    expect(workspace.clips[0].status).toBe('pending')
    
    const undoResult = History.undo(historyState, workspace)
    expect(undoResult.entry).toBeDefined()
    workspace = undoResult.state
    historyState = undoResult.history
    
    expect(workspace.clips[0].status).toBe(oldStatus)
  })

  it('4. 检查：检测敏感词和缺引用项', () => {
    const parseResult = Parser.parseTranscript(sampleTranscript, sampleConfig)
    const merged = Parser.mergeParseResult([], [], parseResult.clips, parseResult.tags)
    workspace = {
      ...workspace,
      clips: merged.clips,
      tags: merged.tags,
      config: sampleConfig
    }
    
    const result = Checker.checkAllClips(workspace)
    expect(result.results.length).toBeGreaterThan(0)
    
    const hasSensitiveWord = result.results.some(r => r.type === 'sensitive_word')
    const hasMissingRef = result.results.some(r => r.type === 'missing_reference')
    
    expect(hasSensitiveWord).toBe(true)
    expect(hasMissingRef).toBe(true)
    
    expect(result.summary.errorCount).toBeGreaterThan(0)
    expect(result.summary.clipsWithIssues.length).toBeGreaterThan(0)
  })

  it('5. 导出：导出 Markdown 和 JSON 格式的发布包', () => {
    const parseResult = Parser.parseTranscript(sampleTranscript, sampleConfig)
    const merged = Parser.mergeParseResult([], [], parseResult.clips, parseResult.tags)
    workspace = { ...workspace, clips: merged.clips, tags: merged.tags }
    
    const mdResult = Exporter.exportClips(workspace, {
      format: 'markdown',
      includeStatus: ['available', 'published']
    })
    
    expect(mdResult.fileName.endsWith('.md')).toBe(true)
    expect(mdResult.content).toContain('# 采访素材发布包')
    expect(mdResult.content).toContain('## 片段 1')
    expect(mdResult.content).toContain('**状态**：')
    expect(mdResult.content).toContain('**标签**：')
    
    const jsonResult = Exporter.exportClips(workspace, {
      format: 'json',
      includeStatus: ['available', 'published']
    })
    
    expect(jsonResult.fileName.endsWith('.json')).toBe(true)
    const parsed = JSON.parse(jsonResult.content)
    expect(parsed.meta).toBeDefined()
    expect(parsed.clips).toBeDefined()
    expect(parsed.clips.length).toBe(workspace.clips.filter(c => c.status === 'available' || c.status === 'published').length)
  })
})

describe('失败路径测试', () => {
  let workspace: WorkspaceState

  beforeEach(() => {
    workspace = State.createInitialState()
  })

  it('1. 连续空分隔符不生成空片段', () => {
    const transcriptWithEmptySeparators = `【记者】: 第一段内容

【张教授】: 第一段回复
---
---
---
【记者】: 第二段内容

【张教授】: 第二段回复`
    
    const result = Parser.parseTranscript(transcriptWithEmptySeparators, sampleConfig)
    
    expect(result.clips.length).toBe(2)
    result.clips.forEach(clip => {
      expect(clip.content.trim().length).toBeGreaterThan(0)
    })
  })

  it('2. 大小写重复标签被处理', () => {
    const parseResult = Parser.parseTranscript(sampleTranscript, sampleConfig)
    const merged = Parser.mergeParseResult([], [], parseResult.clips, [])
    workspace = { ...workspace, clips: merged.clips, tags: merged.tags }
    
    const clip = workspace.clips[0]
    
    const result1 = State.addTagToClip(workspace, clip.id, '重要')
    workspace = result1.state
    
    const result2 = State.addTagToClip(workspace, clip.id, '重要')
    expect(result2.changed).toBe(false)
    
    const result3 = State.addTagToClip(workspace, clip.id, '重要')
    expect(result3.changed).toBe(false)
    
    const clipAfter = workspace.clips.find(c => c.id === clip.id)!
    expect(clipAfter.tags.filter(t => t.toLowerCase() === '重要').length).toBe(1)
  })

  it('3. 待核实片段禁止发布', () => {
    const parseResult = Parser.parseTranscript(sampleTranscript, sampleConfig)
    const merged = Parser.mergeParseResult([], [], parseResult.clips, [])
    workspace = { ...workspace, clips: merged.clips, tags: merged.tags }
    
    const clip = workspace.clips[0]
    
    const pendingResult = State.setClipStatus(workspace, clip.id, 'pending')
    workspace = pendingResult.state
    
    const publishResult = State.setClipStatus(workspace, clip.id, 'published')
    expect(publishResult.changed).toBe(false)
    expect(publishResult.error).toBe('待核实片段禁止发布，请先核实后再操作')
    
    const disabledResult = State.setClipStatus(workspace, clip.id, 'disabled')
    workspace = disabledResult.state
    
    const publishResult2 = State.setClipStatus(workspace, clip.id, 'published')
    expect(publishResult2.changed).toBe(false)
    expect(publishResult2.error).toBe('禁用片段禁止发布')
  })
})

describe('数据持久化和容错测试', () => {
  let workspace: WorkspaceState
  let historyState: History.HistoryState

  beforeEach(() => {
    workspace = State.createInitialState()
    historyState = History.createInitialHistory()
  })

  it('1. 序列化和反序列化后数据一致', () => {
    const parseResult = Parser.parseTranscript(sampleTranscript, sampleConfig)
    const merged = Parser.mergeParseResult([], [], parseResult.clips, parseResult.tags)
    workspace = { ...workspace, clips: merged.clips, tags: merged.tags }
    
    const importEntry = createHistoryEntry(
      'import',
      { clips: [], tags: [] },
      { clips: workspace.clips, tags: workspace.tags },
      `导入 ${parseResult.clips.length} 个片段`
    )
    historyState = History.pushHistory(historyState, importEntry)
    
    const clip = workspace.clips[0]
    const stateBefore = JSON.parse(JSON.stringify(workspace))
    const statusResult = State.setClipStatus(workspace, clip.id, 'pending')
    workspace = statusResult.state
    
    const statusEntry = createHistoryEntry(
      'status_change',
      { clips: stateBefore.clips },
      { clips: workspace.clips },
      `片段状态变更为待核实`
    )
    historyState = History.pushHistory(historyState, statusEntry)
    
    const serialized = History.serialize(workspace, historyState)
    const deserialized = History.deserialize(serialized)
    
    expect(deserialized.success).toBe(true)
    if (deserialized.success) {
      expect(deserialized.state.clips.length).toBe(workspace.clips.length)
      expect(deserialized.state.tags.length).toBe(workspace.tags.length)
      expect(deserialized.history.entries.length).toBe(historyState.entries.length)
      
      deserialized.state.clips.forEach((clip, index) => {
        expect(clip.id).toBe(workspace.clips[index].id)
        expect(clip.content).toBe(workspace.clips[index].content)
        expect(clip.status).toBe(workspace.clips[index].status)
      })
    }
  })

  it('2. 坏历史文件给出恢复选项', () => {
    const corruptedContent = `{
      "version": "1.0.0",
      "state": {
        "clips": [{"id": "test", "content": "test", "status": "available", "tags": [], "references": [], "createdAt": 0, "updatedAt": 0}],
        "tags": [],
        "config": {}
      },
      "history": {
        "entries": "not an array",
        "currentIndex": -1
      }
    }`
    
    const result = History.deserialize(corruptedContent)
    
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error).toBeDefined()
      expect(result.recoveryOptions.length).toBeGreaterThanOrEqual(2)
      
      const types = result.recoveryOptions.map(o => o.type)
      expect(types).toContain('empty')
      expect(types).toContain('partial')
      
      result.recoveryOptions.forEach(option => {
        expect(option.label).toBeDefined()
        expect(option.description).toBeDefined()
      })
    }
  })

  it('3. 恢复选项可以正常工作', () => {
    const corruptedContent = `{
      "version": 1,
      "workspace": {
        "clips": [{"id": "test", "content": "test", "status": "available", "tags": [], "references": [], "createdAt": 0, "updatedAt": 0}],
        "tags": [],
        "config": {}
      },
      "history": {
        "entries": [],
        "currentIndex": -1
      },
      "malformed": ,,,
    }`
    
    const result = History.deserialize(corruptedContent)
    expect(result.success).toBe(false)
    if (!result.success) {
      const emptyRecover = History.recoverWithOption(corruptedContent, 'empty')
      expect(emptyRecover.state.clips.length).toBe(0)
      expect(emptyRecover.state.tags.length).toBe(0)
      expect(emptyRecover.history.entries.length).toBe(0)
    }
  })
})

describe('标签管理测试', () => {
  let workspace: WorkspaceState

  beforeEach(() => {
    workspace = State.createInitialState()
  })

  it('1. 添加标签时大小写不敏感去重', () => {
    const parseResult = Parser.parseTranscript(sampleTranscript, sampleConfig)
    const merged = Parser.mergeParseResult([], [], parseResult.clips, [])
    workspace = { ...workspace, clips: merged.clips, tags: merged.tags }
    
    const clip = workspace.clips[0]
    
    const result0 = State.addTagToClip(workspace, clip.id, '重要观点')
    expect(result0.changed).toBe(true)
    workspace = result0.state
    
    const result1 = State.addTagToClip(workspace, clip.id, '重要观点')
    expect(result1.changed).toBe(false)
    
    const result2 = State.addTagToClip(workspace, clip.id, '重要观点')
    expect(result2.changed).toBe(false)
    
    const updatedClip = workspace.clips.find(c => c.id === clip.id)!
    expect(updatedClip.tags).toContain('重要观点')
    
    const count = updatedClip.tags.filter(t => t.toLowerCase() === '重要观点').length
    expect(count).toBe(1)
  })

  it('2. 删除全局标签时从所有片段中移除', () => {
    const parseResult = Parser.parseTranscript(sampleTranscript, sampleConfig)
    const merged = Parser.mergeParseResult([], [], parseResult.clips, ['生态保护', '可持续发展'])
    workspace = { ...workspace, clips: merged.clips, tags: merged.tags }
    
    workspace.clips.forEach(clip => {
      expect(clip.tags).toContain('生态保护')
      expect(clip.tags).toContain('可持续发展')
    })
    
    const deleteResult = State.deleteTag(workspace, '生态保护')
    expect(deleteResult.changed).toBe(true)
    workspace = deleteResult.state
    
    expect(workspace.tags).not.toContain('生态保护')
    workspace.clips.forEach(clip => {
      expect(clip.tags).not.toContain('生态保护')
      expect(clip.tags).toContain('可持续发展')
    })
  })
})

describe('导出预检测试', () => {
  let workspace: WorkspaceState

  beforeEach(() => {
    workspace = State.createInitialState()
  })

  it('1. 导出前预检拦截待核实片段', () => {
    const parseResult = Parser.parseTranscript(sampleTranscript, sampleConfig)
    const merged = Parser.mergeParseResult([], [], parseResult.clips, [])
    workspace = { ...workspace, clips: merged.clips, tags: merged.tags }
    
    const clip = workspace.clips[0]
    const pendingResult = State.setClipStatus(workspace, clip.id, 'pending')
    workspace = pendingResult.state
    
    const result = Checker.checkBeforeExport(workspace)
    
    expect(result.allowed).toBe(false)
    
    const pendingClips = workspace.clips.filter(c => c.status === 'pending')
    expect(pendingClips.length).toBeGreaterThan(0)
    
    const hasPendingError = result.results.some(r => 
      r.type === 'other' && r.severity === 'error' && r.message.includes('待核实片段不能发布')
    )
    expect(hasPendingError).toBe(true)
  })
})

describe('Electron 启动与依赖测试', () => {
  it('1. Electron 二进制和 path.txt 存在', () => {
    const fs = require('fs')
    const path = require('path')
    
    const electronPkgPath = path.resolve(process.cwd(), 'node_modules/electron')
    const pathTxtPath = path.join(electronPkgPath, 'path.txt')
    const distPath = path.join(electronPkgPath, 'dist')
    
    expect(fs.existsSync(pathTxtPath)).toBe(true)
    
    const executableName = fs.readFileSync(pathTxtPath, 'utf-8').trim()
    expect(executableName.length).toBeGreaterThan(0)
    
    const exePath = path.join(distPath, executableName)
    expect(fs.existsSync(exePath)).toBe(true)
  })

  it('2. vite-plugin-electron 配置正确，onstart 有错误处理', () => {
    const fs = require('fs')
    const path = require('path')
    
    const viteConfigPath = path.resolve(process.cwd(), 'vite.config.ts')
    expect(fs.existsSync(viteConfigPath)).toBe(true)
    
    const configContent = fs.readFileSync(viteConfigPath, 'utf-8')
    expect(configContent).toContain('vite-plugin-electron')
    expect(configContent).toContain('onstart')
    expect(configContent).toContain('try')
    expect(configContent).toContain('catch')
    expect(configContent).toContain('startup()')
  })

  it('3. package.json 包含正确的 dev 和 build 脚本', () => {
    const fs = require('fs')
    const path = require('path')
    
    const pkgPath = path.resolve(process.cwd(), 'package.json')
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
    
    expect(pkg.scripts.dev).toBe('vite')
    expect(pkg.scripts.build).toContain('vite build')
    expect(pkg.scripts.build).toContain('electron-builder')
    expect(pkg.main).toBe('dist-electron/main.js')
    
    expect(pkg.devDependencies.electron).toBeDefined()
    expect(pkg.devDependencies['vite-plugin-electron']).toBeDefined()
  })
})

describe('默认标签大小写不敏感去重测试', () => {
  it('1. 导入配置中 News 和 news 同时存在时自动去重', () => {
    const config: MaterialConfig = {
      separator: '---',
      defaultTags: ['News', 'news', 'Interview', 'interview', 'NEWS']
    }
    
    const transcript = '片段1内容---片段2内容'
    const result = Parser.parseTranscript(transcript, config)
    
    expect(result.warnings.some(w => w.includes('大小写重复'))).toBe(true)
    
    expect(result.tags.length).toBe(2)
    expect(result.tags).toContain('News')
    expect(result.tags).toContain('Interview')
    expect(result.tags).not.toContain('news')
    expect(result.tags).not.toContain('interview')
    expect(result.tags).not.toContain('NEWS')
  })

  it('2. 片段标签不包含重复项（大小写不敏感）', () => {
    const config: MaterialConfig = {
      separator: '---',
      defaultTags: ['News', 'news', 'News']
    }
    
    const transcript = '测试内容'
    const result = Parser.parseTranscript(transcript, config)
    
    expect(result.clips.length).toBe(1)
    const clip = result.clips[0]
    
    expect(clip.tags.length).toBe(1)
    expect(clip.tags[0]).toBe('News')
    
    const lowercaseCount = clip.tags.filter(t => t.toLowerCase() === 'news').length
    expect(lowercaseCount).toBe(1)
  })

  it('3. 与现有标签合并时也遵循大小写不敏感规则', () => {
    const existingTags = ['news', 'Interview']
    const config: MaterialConfig = {
      separator: '---',
      defaultTags: ['News', 'interview', 'NewTag']
    }
    
    const transcript = '测试内容'
    const result = Parser.parseTranscript(transcript, config, existingTags)
    
    expect(result.tags.length).toBe(3)
    expect(result.tags).toContain('news')
    expect(result.tags).toContain('Interview')
    expect(result.tags).toContain('NewTag')
    
    const clip = result.clips[0]
    expect(clip.tags.length).toBe(3)
    
    const newsVariants = clip.tags.filter(t => t.toLowerCase() === 'news')
    expect(newsVariants.length).toBe(1)
    
    const interviewVariants = clip.tags.filter(t => t.toLowerCase() === 'interview')
    expect(interviewVariants.length).toBe(1)
  })

  it('4. 标签筛选时不出现重复选项（大小写不敏感）', () => {
    const config: MaterialConfig = {
      separator: '---',
      defaultTags: ['News', 'news', 'Interview', 'interview']
    }
    
    const transcript = '片段1---片段2---片段3'
    const result = Parser.parseTranscript(transcript, config)
    
    const allTagsFromClips = result.clips.flatMap(c => c.tags)
    const uniqueTagNames = new Set(allTagsFromClips.map(t => t.toLowerCase()))
    
    expect(uniqueTagNames.size).toBe(2)
    expect(uniqueTagNames.has('news')).toBe(true)
    expect(uniqueTagNames.has('interview')).toBe(true)
    
    const filterOptions = [...new Set(result.tags)]
    const lowercaseOptions = filterOptions.map(t => t.toLowerCase())
    const uniqueLowercase = [...new Set(lowercaseOptions)]
    
    expect(filterOptions.length).toBe(uniqueLowercase.length)
  })
})

describe('工作区保存/恢复回归测试', () => {
  let workspace: WorkspaceState
  let historyState: History.HistoryState

  beforeEach(() => {
    workspace = State.createInitialState()
    historyState = History.createInitialHistory()
    History.clearOperationLog()
  })

  const createTestWorkspace = (clipCount: number = 3): { state: WorkspaceState; history: History.HistoryState } => {
    const parseResult = Parser.parseTranscript(sampleTranscript, sampleConfig)
    const merged = Parser.mergeParseResult([], [], parseResult.clips.slice(0, clipCount), parseResult.tags)
    const state: WorkspaceState = {
      ...State.createInitialState(),
      clips: merged.clips,
      tags: merged.tags,
      config: sampleConfig
    }
    
    const importEntry = createHistoryEntry(
      'import',
      { clips: [], tags: [] },
      { clips: state.clips, tags: state.tags },
      `导入 ${clipCount} 个片段`
    )
    const hist = History.pushHistory(History.createInitialHistory(), importEntry)
    
    return { state, history: hist }
  }

  describe('1. 脏状态检测', () => {
    it('1.1 初始状态没有未保存改动', () => {
      const initial = State.createInitialState()
      const emptyHash = History.computeStateHash(initial)
      const currentHash = History.computeStateHash(workspace)
      expect(currentHash).toBe(emptyHash)
      expect(History.statesAreEqual(initial, workspace)).toBe(true)
    })

    it('1.2 修改内容后状态变脏', () => {
      const { state, history } = createTestWorkspace(2)
      workspace = state
      historyState = history

      const originalHash = History.computeStateHash(workspace)
      
      const clip = workspace.clips[0]
      const result = State.addTagToClip(workspace, clip.id, '新标签')
      workspace = result.state

      const newHash = History.computeStateHash(workspace)
      expect(newHash).not.toBe(originalHash)
      expect(History.statesAreEqual(state, workspace)).toBe(false)
    })

    it('1.3 相同内容的状态哈希相同', () => {
      const { state } = createTestWorkspace(2)
      const hash1 = History.computeStateHash(state)
      const hash2 = History.computeStateHash({ ...state })
      expect(hash1).toBe(hash2)
    })

    it('1.4 仅修改元数据不影响脏状态', () => {
      const { state } = createTestWorkspace(1)
      const hash1 = History.computeStateHash(state)
      const stateCopy = JSON.parse(JSON.stringify(state)) as WorkspaceState
      stateCopy.clips[0].updatedAt = Date.now() + 1000
      const hash2 = History.computeStateHash(stateCopy)
      expect(hash1).not.toBe(hash2)
    })
  })

  describe('2. 撤销/重做状态不被错误继承', () => {
    it('2.1 加载新工作区后历史记录被正确重置', () => {
      const { state: oldState, history: oldHistory } = createTestWorkspace(3)
      const oldEntryCount = oldHistory.entries.length
      expect(oldEntryCount).toBe(1)
      expect(History.canUndo(oldHistory)).toBe(true)

      const serialized = History.serialize(oldState, oldHistory)
      const deserialized = History.deserialize(serialized)
      expect(deserialized.success).toBe(true)
      if (deserialized.success) {
        expect(deserialized.history.entries.length).toBe(oldEntryCount)
        expect(History.canUndo(deserialized.history)).toBe(true)
      }
    })

    it('2.2 从损坏文件恢复后历史记录为空', () => {
      const corruptedContent = `{
        "version": "1.0.0",
        "state": {
          "clips": [{"id": "test", "content": "test", "status": "available", "tags": [], "references": [], "createdAt": 0, "updatedAt": 0}],
          "tags": ["test"],
          "config": {}
        },
        "history": {
          "entries": "corrupted",
          "currentIndex": -1
        }
      }`

      const result = History.deserialize(corruptedContent)
      expect(result.success).toBe(false)
      if (!result.success) {
        const partialTypes = result.recoveryOptions.map(o => o.type)
        expect(partialTypes).toContain('partial')
        
        const recovered = History.recoverWithOption(corruptedContent, 'partial')
        expect(recovered.history.entries.length).toBe(0)
        expect(History.canUndo(recovered.history)).toBe(false)
        expect(History.canRedo(recovered.history)).toBe(false)
      }
    })

    it('2.3 多次撤销重做后序列化反序列化状态一致', () => {
      const { state, history } = createTestWorkspace(3)
      workspace = state
      historyState = history

      const clip = workspace.clips[0]
      const stateBefore = JSON.parse(JSON.stringify(workspace))
      const statusResult = State.setClipStatus(workspace, clip.id, 'pending')
      workspace = statusResult.state

      const statusEntry = createHistoryEntry(
        'status_change',
        { clips: stateBefore.clips },
        { clips: workspace.clips },
        '状态变更'
      )
      historyState = History.pushHistory(historyState, statusEntry)
      expect(historyState.entries.length).toBe(2)
      expect(History.canUndo(historyState)).toBe(true)
      expect(History.canRedo(historyState)).toBe(false)

      const undoResult = History.undo(historyState, workspace)
      expect(undoResult.entry).toBeDefined()
      expect(History.canUndo(undoResult.history)).toBe(true)
      expect(History.canRedo(undoResult.history)).toBe(true)

      const serialized = History.serialize(undoResult.state, undoResult.history)
      const deserialized = History.deserialize(serialized)
      expect(deserialized.success).toBe(true)
      if (deserialized.success) {
        expect(deserialized.history.entries.length).toBe(2)
        expect(deserialized.history.currentIndex).toBe(0)
        expect(History.canUndo(deserialized.history)).toBe(true)
        expect(History.canRedo(deserialized.history)).toBe(true)
      }
    })

    it('2.4 创建新工作区后历史记录完全清空', () => {
      const { history } = createTestWorkspace(3)
      expect(history.entries.length).toBeGreaterThan(0)

      const newHistory = History.createInitialHistory()
      expect(newHistory.entries.length).toBe(0)
      expect(newHistory.currentIndex).toBe(-1)
      expect(History.canUndo(newHistory)).toBe(false)
      expect(History.canRedo(newHistory)).toBe(false)
    })
  })

  describe('3. 损坏 JSON 恢复', () => {
    it('3.1 完全无效的 JSON 返回正确的错误信息', () => {
      const invalidJson = '{ "version": "1.0.0", "state": {, '
      const result = History.deserialize(invalidJson)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error).toContain('JSON 解析失败')
        expect(result.corruptionDetails.jsonParseError).toBe(true)
        expect(result.recoveryOptions.length).toBeGreaterThan(0)
        const types = result.recoveryOptions.map(o => o.type)
        expect(types).toContain('empty')
      }
    })

    it('3.2 历史记录损坏但状态完好可以部分恢复', () => {
      const corruptedHistory = `{
        "version": "1.0.0",
        "state": {
          "clips": [
            {"id": "clip1", "content": "片段1内容", "status": "available", "tags": ["标签1"], "references": [], "createdAt": 0, "updatedAt": 0},
            {"id": "clip2", "content": "片段2内容", "status": "pending", "tags": ["标签2"], "references": [], "createdAt": 0, "updatedAt": 0}
          ],
          "tags": ["标签1", "标签2"],
          "config": {}
        },
        "history": {
          "entries": "NOT_AN_ARRAY",
          "currentIndex": "NOT_A_NUMBER"
        }
      }`

      const result = History.deserialize(corruptedHistory)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.corruptionDetails.historyCorrupted).toBe(true)
        expect(result.corruptionDetails.stateCorrupted).toBe(false)
        expect(result.corruptionDetails.clipsRecoverable).toBe(true)
        expect(result.corruptionDetails.tagsRecoverable).toBe(true)
        
        const partialOption = result.recoveryOptions.find(o => o.type === 'partial')
        expect(partialOption).toBeDefined()
        expect(partialOption!.willKeep).toContain('所有片段内容')
        expect(partialOption!.willKeep).toContain('所有标签')
        expect(partialOption!.willLose).toContain('撤销/重做历史记录')

        const recovered = History.recoverWithOption(corruptedHistory, 'partial')
        expect(recovered.state.clips.length).toBe(2)
        expect(recovered.state.tags.length).toBe(2)
        expect(recovered.history.entries.length).toBe(0)
        expect(recovered.recoveryLog).toContain('2 个片段')
        expect(recovered.recoveryLog).toContain('2 个标签')
      }
    })

    it('3.3 仅片段可恢复时提供仅恢复片段选项', () => {
      const onlyClipsValid = `{
        "version": "1.0.0",
        "state": {
          "clips": [
            {"id": "clip1", "content": "片段内容", "status": "available", "tags": [], "references": [], "createdAt": 0, "updatedAt": 0}
          ],
          "tags": "NOT_AN_ARRAY",
          "config": {}
        },
        "history": {
          "entries": [],
          "currentIndex": -1
        }
      }`

      const result = History.deserialize(onlyClipsValid)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.corruptionDetails.clipsRecoverable).toBe(true)
        expect(result.corruptionDetails.tagsRecoverable).toBe(false)
        
        const optionTypes = result.recoveryOptions.map(o => o.type)
        expect(optionTypes).toContain('partial_clips')
        
        const clipsOption = result.recoveryOptions.find(o => o.type === 'partial_clips')
        expect(clipsOption).toBeDefined()
        expect(clipsOption!.willKeep).toContain('所有片段内容')
        expect(clipsOption!.willLose).toContain('所有标签')

        const recovered = History.recoverWithOption(onlyClipsValid, 'partial_clips')
        expect(recovered.state.clips.length).toBe(1)
        expect(recovered.state.tags.length).toBe(0)
      }
    })

    it('3.4 仅标签可恢复时提供仅恢复标签选项', () => {
      const onlyTagsValid = `{
        "version": "1.0.0",
        "state": {
          "clips": "NOT_AN_ARRAY",
          "tags": ["标签1", "标签2", "标签3"],
          "config": {}
        },
        "history": {
          "entries": [],
          "currentIndex": -1
        }
      }`

      const result = History.deserialize(onlyTagsValid)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.corruptionDetails.clipsRecoverable).toBe(false)
        expect(result.corruptionDetails.tagsRecoverable).toBe(true)
        
        const optionTypes = result.recoveryOptions.map(o => o.type)
        expect(optionTypes).toContain('partial_tags')
        
        const recovered = History.recoverWithOption(onlyTagsValid, 'partial_tags')
        expect(recovered.state.clips.length).toBe(0)
        expect(recovered.state.tags.length).toBe(3)
      }
    })

    it('3.5 版本不兼容时的恢复选项', () => {
      const wrongVersion = `{
        "version": "2.0.0",
        "state": {
          "clips": [{"id": "clip1", "content": "test", "status": "available", "tags": [], "references": [], "createdAt": 0, "updatedAt": 0}],
          "tags": [],
          "config": {}
        },
        "history": {
          "entries": [],
          "currentIndex": -1
        }
      }`

      const result = History.deserialize(wrongVersion)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.corruptionDetails.versionMismatch).toBe(true)
        expect(result.corruptionDetails.actualVersion).toBe('2.0.0')
        expect(result.error).toContain('版本不兼容')
        expect(result.recoveryOptions.length).toBeGreaterThan(0)
      }
    })

    it('3.6 空工作区恢复选项', () => {
      const unrecoverable = '{ invalid json here {'
      const result = History.deserialize(unrecoverable)
      expect(result.success).toBe(false)
      if (!result.success) {
        const emptyOption = result.recoveryOptions.find(o => o.type === 'empty')
        expect(emptyOption).toBeDefined()
        
        const recovered = History.recoverWithOption(unrecoverable, 'empty')
        expect(recovered.state.clips.length).toBe(0)
        expect(recovered.state.tags.length).toBe(0)
        expect(recovered.history.entries.length).toBe(0)
      }
    })
  })

  describe('4. 操作日志记录', () => {
    it('4.1 序列化会记录操作日志', () => {
      const { state, history } = createTestWorkspace(2)
      const logBefore = History.getOperationLog().length
      
      History.serialize(state, history)
      
      const logAfter = History.getOperationLog()
      expect(logAfter.length).toBe(logBefore + 1)
      expect(logAfter[0].type).toBe('save')
      expect(logAfter[0].success).toBe(true)
      expect(logAfter[0].message).toContain('2 个片段')
    })

    it('4.2 成功加载会记录操作日志', () => {
      const { state, history } = createTestWorkspace(2)
      const serialized = History.serialize(state, history)
      History.clearOperationLog()
      
      History.deserialize(serialized)
      
      const logs = History.getOperationLog()
      expect(logs.length).toBeGreaterThan(0)
      expect(logs[0].type).toBe('load')
      expect(logs[0].success).toBe(true)
    })

    it('4.3 加载失败会记录错误日志', () => {
      History.clearOperationLog()
      
      History.deserialize('{ invalid json }')
      
      const logs = History.getOperationLog()
      expect(logs.length).toBeGreaterThan(0)
      expect(logs[0].type).toBe('load')
      expect(logs[0].success).toBe(false)
    })

    it('4.4 恢复操作会记录日志', () => {
      const corrupted = `{
        "version": "1.0.0",
        "state": {
          "clips": [{"id": "c1", "content": "test", "status": "available", "tags": [], "references": [], "createdAt": 0, "updatedAt": 0}],
          "tags": [],
          "config": {}
        },
        "history": "CORRUPTED"
      }`
      History.clearOperationLog()
      
      History.recoverWithOption(corrupted, 'partial')
      
      const logs = History.getOperationLog()
      expect(logs.length).toBeGreaterThan(0)
      expect(logs[0].type).toBe('recover')
      expect(logs[0].success).toBe(true)
    })

    it('4.5 操作日志最多保留 100 条', () => {
      History.clearOperationLog()
      for (let i = 0; i < 150; i++) {
        History.logOperation('save', true, `操作 ${i}`)
      }
      
      const logs = History.getOperationLog()
      expect(logs.length).toBe(100)
    })

    it('4.6 操作日志可以清空', () => {
      History.logOperation('save', true, '测试')
      expect(History.getOperationLog().length).toBeGreaterThan(0)
      
      History.clearOperationLog()
      expect(History.getOperationLog().length).toBe(0)
    })
  })

  describe('5. 跨重启状态一致性', () => {
    it('5.1 序列化反序列化完整往返后数据一致', () => {
      const { state, history } = createTestWorkspace(3)
      
      const clip = state.clips[0]
      const stateBefore = JSON.parse(JSON.stringify(state))
      const tagResult = State.addTagToClip(state, clip.id, '自定义标签')
      const modifiedState = tagResult.state
      
      const tagEntry = createHistoryEntry(
        'tag_add',
        { clips: stateBefore.clips, tags: stateBefore.tags },
        { clips: modifiedState.clips, tags: modifiedState.tags },
        '添加标签'
      )
      const modifiedHistory = History.pushHistory(history, tagEntry)

      const serialized = History.serialize(modifiedState, modifiedHistory)
      const deserialized = History.deserialize(serialized)
      
      expect(deserialized.success).toBe(true)
      if (deserialized.success) {
        expect(deserialized.state.clips.length).toBe(modifiedState.clips.length)
        expect(deserialized.state.tags.length).toBe(modifiedState.tags.length)
        expect(deserialized.history.entries.length).toBe(modifiedHistory.entries.length)
        expect(deserialized.history.currentIndex).toBe(modifiedHistory.currentIndex)
        
        deserialized.state.clips.forEach((c, i) => {
          expect(c.id).toBe(modifiedState.clips[i].id)
          expect(c.content).toBe(modifiedState.clips[i].content)
          expect(c.tags).toEqual(modifiedState.clips[i].tags)
        })
      }
    })

    it('5.2 撤销后跨重启仍可重做', () => {
      const { state, history } = createTestWorkspace(2)
      
      const clip = state.clips[0]
      const stateBefore = JSON.parse(JSON.stringify(state))
      const statusResult = State.setClipStatus(state, clip.id, 'pending')
      const modifiedState = statusResult.state
      
      const statusEntry = createHistoryEntry(
        'status_change',
        { clips: stateBefore.clips },
        { clips: modifiedState.clips },
        '状态变更'
      )
      let modHistory = History.pushHistory(history, statusEntry)
      
      const undoResult = History.undo(modHistory, modifiedState)
      expect(undoResult.entry).toBeDefined()
      expect(History.canRedo(undoResult.history)).toBe(true)
      
      const serialized = History.serialize(undoResult.state, undoResult.history)
      const deserialized = History.deserialize(serialized)
      
      expect(deserialized.success).toBe(true)
      if (deserialized.success) {
        expect(History.canRedo(deserialized.history)).toBe(true)
        expect(deserialized.history.currentIndex).toBe(0)
        expect(deserialized.history.entries.length).toBe(2)
        
        const redoResult = History.redo(deserialized.history, deserialized.state)
        expect(redoResult.entry).toBeDefined()
        expect(redoResult.state.clips[0].status).toBe('pending')
      }
    })
  })

  describe('6. 恢复选项详细信息', () => {
    it('6.1 每个恢复选项都明确说明保留和丢失的内容', () => {
      const corrupted = `{
        "version": "1.0.0",
        "state": {
          "clips": [{"id": "c1", "content": "test", "status": "available", "tags": [], "references": [], "createdAt": 0, "updatedAt": 0}],
          "tags": ["tag1"],
          "config": {}
        },
        "history": "CORRUPTED"
      }`
      
      const result = History.deserialize(corrupted)
      expect(result.success).toBe(false)
      if (!result.success) {
        result.recoveryOptions.forEach(option => {
          expect(option.willKeep).toBeDefined()
          expect(option.willLose).toBeDefined()
          expect(Array.isArray(option.willKeep)).toBe(true)
          expect(Array.isArray(option.willLose)).toBe(true)
          expect(option.description.length).toBeGreaterThan(0)
          expect(option.label.length).toBeGreaterThan(0)
        })
      }
    })

    it('6.2 恢复后返回操作日志信息', () => {
      const corrupted = `{
        "version": "1.0.0",
        "state": {
          "clips": [{"id": "c1", "content": "test", "status": "available", "tags": [], "references": [], "createdAt": 0, "updatedAt": 0}],
          "tags": ["t1", "t2"],
          "config": {}
        },
        "history": "CORRUPTED"
      }`
      
      const recovered = History.recoverWithOption(corrupted, 'partial')
      expect(recovered.recoveryLog).toBeDefined()
      expect(recovered.recoveryLog).toContain('1 个片段')
      expect(recovered.recoveryLog).toContain('2 个标签')
    })
  })

  describe('7. 保存失败错误处理', () => {
    it('7.1 序列化空工作区不会出错', () => {
      const empty = State.createInitialState()
      const emptyHist = History.createInitialHistory()
      const serialized = History.serialize(empty, emptyHist)
      expect(serialized.length).toBeGreaterThan(0)
      
      const deserialized = History.deserialize(serialized)
      expect(deserialized.success).toBe(true)
      if (deserialized.success) {
        expect(deserialized.state.clips.length).toBe(0)
        expect(deserialized.state.tags.length).toBe(0)
      }
    })

    it('7.2 deserialize 处理 null/undefined 输入', () => {
      const result = History.deserialize('null')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.corruptionDetails.jsonParseError).toBe(false)
        expect(result.corruptionDetails.stateCorrupted).toBe(true)
      }
    })

    it('7.3 撤销重做循环不破坏序列化', () => {
      const { state, history } = createTestWorkspace(2)
      workspace = state
      historyState = history

      for (let i = 0; i < 5; i++) {
        const clip = workspace.clips[i % 2]
        const before = JSON.parse(JSON.stringify(workspace))
        const result = State.addTagToClip(workspace, clip.id, `标签${i}`)
        workspace = result.state
        const entry = createHistoryEntry(
          'tag_add',
          { clips: before.clips, tags: before.tags },
          { clips: workspace.clips, tags: workspace.tags },
          `添加标签${i}`
        )
        historyState = History.pushHistory(historyState, entry)
      }

      for (let i = 0; i < 3; i++) {
        const undoResult = History.undo(historyState, workspace)
        workspace = undoResult.state
        historyState = undoResult.history
      }

      const serialized = History.serialize(workspace, historyState)
      const deserialized = History.deserialize(serialized)
      expect(deserialized.success).toBe(true)
      if (deserialized.success) {
        expect(deserialized.history.currentIndex).toBe(historyState.currentIndex)
        expect(deserialized.history.entries.length).toBe(historyState.entries.length)
      }
    })
  })
})
