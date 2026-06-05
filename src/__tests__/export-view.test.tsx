
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react'
import React from 'react'
import { ExportView } from '../views/ExportView'
import type { ExportOptions, Clip, ClipStatus } from '../core/types'
import type { ExportResult } from '../core/exporter'
import * as Exporter from '../core/exporter'
import * as History from '../core/history'
import type { CheckSummary } from '../core/checker'

const sampleClip: Clip = {
  id: 'clip-1',
  content: '【记者】: 张教授您好，非常感谢您接受我们的采访。\n【张教授】: 谢谢你们的邀请。',
  status: 'available' as ClipStatus,
  speaker: '记者',
  tags: ['生态保护', '可持续发展'],
  notes: '',
  references: [],
  createdAt: Date.now(),
  updatedAt: Date.now()
}

const createMockClips = (count: number = 3): Clip[] => {
  const statuses: ClipStatus[] = ['available', 'available', 'published', 'pending', 'disabled']
  return Array.from({ length: count }, (_, i) => ({
    ...sampleClip,
    id: `clip-${i + 1}`,
    status: statuses[i % statuses.length],
    content: i % 2 === 0 ? sampleClip.content : sampleClip.content + ' 这是敏感话题。',
    tags: i % 2 === 0 ? ['生态保护', '可持续发展'] : ['采访', '政策']
  }))
}

const createMockExportAPI = () => ({
  save: vi.fn()
})

type MockExportAPI = ReturnType<typeof createMockExportAPI>

const setupMockExportAPI = (mockAPI: MockExportAPI) => {
  mockAPI.save.mockResolvedValue({ success: true, path: 'test.json' })
}

const createMockWorkspaceAPI = () => ({
  load: vi.fn(),
  loadAutosave: vi.fn(),
  autosave: vi.fn(),
  saveAs: vi.fn(),
  exportClipboard: vi.fn()
})

describe('ExportView 界面交互测试', () => {
  let mockExportAPI: MockExportAPI
  let mockExportClips: any
  let mockCheckBeforeExport: any
  let mockOnNavigateToCheck: any
  let mockState: any

  beforeEach(() => {
    mockExportAPI = createMockExportAPI()
    setupMockExportAPI(mockExportAPI)
    window.exportAPI = mockExportAPI as unknown as typeof window.exportAPI
    window.workspaceAPI = createMockWorkspaceAPI() as unknown as typeof window.workspaceAPI
    History.clearOperationLog()
    localStorage.clear()

    const clips = createMockClips(5)
    const tags = ['生态保护', '可持续发展', '采访', '政策']

    mockExportClips = vi.fn((options: ExportOptions): ExportResult => {
      const filteredClips = clips.filter(c => options.includeStatus?.includes(c.status))
      return {
        format: options.format,
        fileName: `test-${Date.now()}.${options.format === 'markdown' ? 'md' : 'json'}`,
        content: options.format === 'markdown' ? '# Test\n\n内容' : JSON.stringify({ clips: filteredClips }),
        clipCount: filteredClips.length,
        excludedCount: { sensitive: 0, status: 0, tags: 0 }
      }
    })

    mockCheckBeforeExport = vi.fn(() => ({
      allowed: true,
      results: [],
      summary: {
        totalClips: clips.length,
        errorCount: 0,
        warningCount: 0,
        infoCount: 0,
        byType: {
          sensitive_word: 0,
          missing_reference: 0,
          other: 0
        },
        clipsWithIssues: []
      } as unknown as CheckSummary
    }))

    mockOnNavigateToCheck = vi.fn()

    mockState = {
      workspace: {
        clips,
        tags,
        config: {
          sensitiveWords: ['敏感话题', '损害', '矛盾'],
          defaultTags: ['生态保护', '可持续发展', '采访'],
          separator: '---',
          speakerPattern: '【(.*?)】:'
        }
      }
    }
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    localStorage.clear()
  })

  const renderExportView = (props?: Partial<React.ComponentProps<typeof ExportView>>) => {
    return render(
      <ExportView
        clips={mockState.workspace.clips}
        tags={mockState.workspace.tags}
        exportClips={mockExportClips}
        checkBeforeExport={mockCheckBeforeExport}
        onNavigateToCheck={mockOnNavigateToCheck}
        state={mockState}
        {...props}
      />
    )
  }

  describe('1. 初始渲染测试', () => {
    it('1.1 默认渲染所有必需控件', () => {
      renderExportView()

      expect(screen.getByTestId('export-material-title')).toBeInTheDocument()
      expect(screen.getByTestId('export-format-markdown')).toBeInTheDocument()
      expect(screen.getByTestId('export-format-json')).toBeInTheDocument()
      expect(screen.getByTestId('export-format-manifest')).toBeInTheDocument()
      expect(screen.getByTestId('export-status-available')).toBeInTheDocument()
      expect(screen.getByTestId('export-status-published')).toBeInTheDocument()
      expect(screen.getByTestId('export-status-pending')).toBeInTheDocument()
      expect(screen.getByTestId('export-status-disabled')).toBeInTheDocument()
      expect(screen.getByTestId('export-exclude-sensitive')).toBeInTheDocument()
      expect(screen.getByTestId('export-preview-btn')).toBeInTheDocument()
      expect(screen.getByTestId('export-check-btn')).toBeInTheDocument()
      expect(screen.getByTestId('export-reset-btn')).toBeInTheDocument()
      expect(screen.getByTestId('export-submit-btn')).toBeInTheDocument()
    })

    it('1.2 默认导出格式为 Markdown', () => {
      renderExportView()
      expect(screen.getByTestId('export-format-markdown')).toHaveClass('btn-primary')
      expect(screen.getByTestId('export-format-json')).toHaveClass('btn-secondary')
      expect(screen.getByTestId('export-format-manifest')).toHaveClass('btn-secondary')
    })

    it('1.3 默认包含可用和已发布状态', () => {
      renderExportView()
      expect(screen.getByTestId('export-status-available')).toBeChecked()
      expect(screen.getByTestId('export-status-published')).toBeChecked()
      expect(screen.getByTestId('export-status-pending')).not.toBeChecked()
      expect(screen.getByTestId('export-status-disabled')).not.toBeChecked()
    })

    it('1.4 默认排除敏感词', () => {
      renderExportView()
      expect(screen.getByTestId('export-exclude-sensitive')).toBeChecked()
    })

    it('1.5 显示正确的可导出数量', () => {
      renderExportView()
      expect(screen.getByTestId('export-count-info')).toHaveTextContent(/将导出 2 个片段/)
    })

    it('1.6 显示所有标签选项', () => {
      renderExportView()
      expect(screen.getByTestId('export-tag-生态保护')).toBeInTheDocument()
      expect(screen.getByTestId('export-tag-可持续发展')).toBeInTheDocument()
      expect(screen.getByTestId('export-tag-采访')).toBeInTheDocument()
      expect(screen.getByTestId('export-tag-政策')).toBeInTheDocument()
    })
  })

  describe('2. 格式切换测试', () => {
    it('2.1 切换到发布清单格式', () => {
      renderExportView()
      fireEvent.click(screen.getByTestId('export-format-manifest'))
      expect(screen.getByTestId('export-format-manifest')).toHaveClass('btn-primary')
      expect(screen.getByTestId('export-format-markdown')).toHaveClass('btn-secondary')
    })

    it('2.2 切换到 JSON 格式', () => {
      renderExportView()
      fireEvent.click(screen.getByTestId('export-format-json'))
      expect(screen.getByTestId('export-format-json')).toHaveClass('btn-primary')
    })

    it('2.3 显示对应格式的提示信息', () => {
      renderExportView()
      fireEvent.click(screen.getByTestId('export-format-manifest'))
      expect(screen.getByText(/发布清单包含/)).toBeInTheDocument()
    })
  })

  describe('3. 状态筛选测试', () => {
    it('3.1 取消可用状态减少可导出数量', () => {
      renderExportView()
      fireEvent.click(screen.getByTestId('export-status-available'))
      expect(screen.getByTestId('export-count-info')).toHaveTextContent('将导出 1 个片段')
    })

    it('3.2 添加待核实状态触发冲突警告', () => {
      renderExportView()
      fireEvent.click(screen.getByTestId('export-status-pending'))
      expect(screen.getByTestId('export-conflict-alert')).toBeInTheDocument()
      expect(screen.getByText(/已选择包含.*待核实片段/)).toBeInTheDocument()
    })

    it('3.3 添加禁用状态触发冲突警告', () => {
      renderExportView()
      fireEvent.click(screen.getByTestId('export-status-disabled'))
      expect(screen.getByTestId('export-conflict-alert')).toBeInTheDocument()
      expect(screen.getByText(/已选择包含.*禁用片段/)).toBeInTheDocument()
    })

    it('3.4 取消所有状态触发空结果阻塞冲突', () => {
      renderExportView()
      fireEvent.click(screen.getByTestId('export-status-available'))
      fireEvent.click(screen.getByTestId('export-status-published'))
      expect(screen.getByTestId('export-count-info')).toHaveTextContent('✕ 无法导出')
      expect(screen.getByTestId('export-submit-btn')).not.toBeDisabled()
    })
  })

  describe('4. 标签筛选测试', () => {
    it('4.1 选择标签筛选导出片段', () => {
      renderExportView()
      fireEvent.click(screen.getByTestId('export-tag-生态保护'))
      expect(screen.getByTestId('export-count-info')).toHaveTextContent('将导出 2 个片段')
    })

    it('4.2 选择多个标签组合筛选', () => {
      renderExportView()
      fireEvent.click(screen.getByTestId('export-tag-生态保护'))
      fireEvent.click(screen.getByTestId('export-tag-采访'))
      expect(screen.getByTestId('export-count-info')).toHaveTextContent(/将导出 2 个片段/)
    })

    it('4.3 取消标签选择恢复全部导出', () => {
      renderExportView()
      fireEvent.click(screen.getByTestId('export-tag-生态保护'))
      fireEvent.click(screen.getByTestId('export-tag-生态保护'))
      expect(screen.getByTestId('export-count-info')).toHaveTextContent(/将导出 2 个片段/)
    })
  })

  describe('5. 敏感词处理测试', () => {
    it('5.1 关闭敏感词排除触发冲突警告', () => {
      renderExportView()
      fireEvent.click(screen.getByTestId('export-exclude-sensitive'))
      expect(screen.getByTestId('export-conflict-alert')).toBeInTheDocument()
      expect(screen.getByText(/已关闭敏感词排除/)).toBeInTheDocument()
    })

    it('5.2 关闭敏感词排除增加可导出数量', () => {
      renderExportView()
      fireEvent.click(screen.getByTestId('export-exclude-sensitive'))
      expect(screen.getByTestId('export-count-info')).toHaveTextContent(/将导出 3 个片段/)
    })

    it('5.3 重新启用敏感词排除恢复数量', () => {
      renderExportView()
      fireEvent.click(screen.getByTestId('export-exclude-sensitive'))
      fireEvent.click(screen.getByTestId('export-exclude-sensitive'))
      expect(screen.getByTestId('export-count-info')).toHaveTextContent(/将导出 2 个片段/)
    })
  })

  describe('6. 冲突检测和模态框测试', () => {
    it('6.1 空结果时点击导出显示阻塞冲突模态框', async () => {
      renderExportView()
      fireEvent.click(screen.getByTestId('export-status-available'))
      fireEvent.click(screen.getByTestId('export-status-published'))
      
      await act(async () => {
        fireEvent.click(screen.getByTestId('export-submit-btn'))
      })

      await waitFor(() => {
        expect(screen.getByTestId('export-conflict-modal')).toBeInTheDocument()
      })
      expect(screen.getByText('⚠ 无法导出')).toBeInTheDocument()
      expect(screen.getByTestId('export-conflict-reset-btn')).toBeInTheDocument()
      expect(screen.queryByTestId('export-conflict-proceed-btn')).not.toBeInTheDocument()
    })

    it('6.2 阻塞冲突模态框点击重置按钮恢复默认筛选', async () => {
      renderExportView()
      fireEvent.click(screen.getByTestId('export-status-available'))
      fireEvent.click(screen.getByTestId('export-status-published'))
      
      await act(async () => {
        fireEvent.click(screen.getByTestId('export-submit-btn'))
      })
      
      await waitFor(() => {
        expect(screen.getByTestId('export-conflict-modal')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('export-conflict-reset-btn'))
      
      await waitFor(() => {
        expect(screen.queryByTestId('export-conflict-modal')).not.toBeInTheDocument()
      })
      expect(screen.getByTestId('export-status-available')).toBeChecked()
      expect(screen.getByTestId('export-status-published')).toBeChecked()
      expect(screen.getByTestId('export-exclude-sensitive')).toBeChecked()
    })

    it('6.3 包含待核实时点击导出显示警告模态框', async () => {
      renderExportView()
      fireEvent.click(screen.getByTestId('export-status-pending'))
      
      await act(async () => {
        fireEvent.click(screen.getByTestId('export-submit-btn'))
      })

      await waitFor(() => {
        expect(screen.getByTestId('export-conflict-modal')).toBeInTheDocument()
      })
      expect(screen.getByText('⚠ 导出警告')).toBeInTheDocument()
      expect(screen.getByTestId('export-conflict-proceed-btn')).toBeInTheDocument()
    })

    it('6.4 警告模态框点击取消按钮关闭模态框', async () => {
      renderExportView()
      fireEvent.click(screen.getByTestId('export-status-pending'))
      
      await act(async () => {
        fireEvent.click(screen.getByTestId('export-submit-btn'))
      })
      
      await waitFor(() => {
        expect(screen.getByTestId('export-conflict-modal')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('export-conflict-cancel-btn'))
      
      await waitFor(() => {
        expect(screen.queryByTestId('export-conflict-modal')).not.toBeInTheDocument()
      })
      expect(mockExportClips).not.toHaveBeenCalled()
    })

    it('6.5 警告模态框点击仍然导出继续执行导出', async () => {
      renderExportView()
      fireEvent.click(screen.getByTestId('export-status-pending'))
      
      await act(async () => {
        fireEvent.click(screen.getByTestId('export-submit-btn'))
      })
      
      await waitFor(() => {
        expect(screen.getByTestId('export-conflict-modal')).toBeInTheDocument()
      })

      await act(async () => {
        fireEvent.click(screen.getByTestId('export-conflict-proceed-btn'))
      })

      await waitFor(() => {
        expect(mockExportClips).toHaveBeenCalled()
      }, { timeout: 5000 })
    }, { timeout: 10000 })

    it('6.6 冲突检测在状态变化时实时更新', () => {
      renderExportView()
      expect(screen.queryByTestId('export-conflict-alert')).not.toBeInTheDocument()
      
      fireEvent.click(screen.getByTestId('export-status-pending'))
      expect(screen.getByTestId('export-conflict-alert')).toBeInTheDocument()
      
      fireEvent.click(screen.getByTestId('export-status-pending'))
      expect(screen.queryByTestId('export-conflict-alert')).not.toBeInTheDocument()
    })
  })

  describe('7. 配置持久化测试', () => {
    it('7.1 格式选择持久化到 localStorage', async () => {
      renderExportView()
      fireEvent.click(screen.getByTestId('export-format-manifest'))
      
      await waitFor(() => {
        const prefs = Exporter.loadExportPreferences()
        expect(prefs.format).toBe('manifest')
      })
    })

    it('7.2 状态选择持久化到 localStorage', async () => {
      renderExportView()
      fireEvent.click(screen.getByTestId('export-status-pending'))
      
      await waitFor(() => {
        const prefs = Exporter.loadExportPreferences()
        expect(prefs.includeStatus).toContain('pending')
      })
    })

    it('7.3 敏感词设置持久化到 localStorage', async () => {
      renderExportView()
      fireEvent.click(screen.getByTestId('export-exclude-sensitive'))
      
      await waitFor(() => {
        const prefs = Exporter.loadExportPreferences()
        expect(prefs.excludeSensitive).toBe(false)
      })
    })

    it('7.4 素材标题持久化到 localStorage', async () => {
      renderExportView()
      const input = screen.getByTestId('export-material-title')
      fireEvent.change(input, { target: { value: '生态保护采访记录' } })
      
      await waitFor(() => {
        const prefs = Exporter.loadExportPreferences()
        expect(prefs.materialTitle).toBe('生态保护采访记录')
      })
    })

    it('7.5 标签选择持久化到 localStorage', async () => {
      renderExportView()
      fireEvent.click(screen.getByTestId('export-tag-生态保护'))
      
      await waitFor(() => {
        const prefs = Exporter.loadExportPreferences()
        expect(prefs.includeTags).toContain('生态保护')
      })
    })

    it('7.6 点击重置按钮清除持久化配置', async () => {
      Exporter.saveExportPreferences({
        format: 'json',
        includeStatus: ['available'],
        includeTags: ['测试'],
        excludeSensitive: false,
        materialTitle: '测试标题'
      })

      renderExportView()
      
      await waitFor(() => {
        expect(Exporter.hasSavedExportPreferences()).toBe(true)
      })
      
      fireEvent.click(screen.getByTestId('export-reset-btn'))
      
      await waitFor(() => {
        expect(Exporter.hasSavedExportPreferences()).toBe(false)
      })
    })

    it('7.7 重新加载时恢复上次的配置', async () => {
      Exporter.saveExportPreferences({
        format: 'manifest',
        includeStatus: ['available', 'published', 'pending'],
        includeTags: ['生态保护'],
        excludeSensitive: false,
        materialTitle: '生态保护采访'
      })

      renderExportView()
      
      await waitFor(() => {
        expect(screen.getByTestId('export-format-manifest')).toHaveClass('btn-primary')
        expect(screen.getByTestId('export-status-pending')).toBeChecked()
        expect(screen.getByTestId('export-exclude-sensitive')).not.toBeChecked()
        expect(screen.getByTestId('export-material-title')).toHaveValue('生态保护采访')
        expect(screen.getByTestId('export-tag-生态保护')).toBeChecked()
      })
    })
  })

  describe('8. 导出失败路径测试', () => {
    it('8.1 用户取消另存为时保留状态并记录日志', async () => {
      mockExportAPI.save.mockResolvedValue({ canceled: true })
      
      renderExportView()
      
      await act(async () => {
        fireEvent.click(screen.getByTestId('export-submit-btn'))
      })

      await waitFor(() => {
        expect(mockExportClips).toHaveBeenCalled()
      })

      const log = History.getOperationLog()
      const cancelLog = log.find(l => l.message.includes('用户取消导出'))
      expect(cancelLog).toBeDefined()
      expect(cancelLog?.success).toBe(false)
      expect(screen.queryByTestId('export-error-alert')).not.toBeInTheDocument()
    }, { timeout: 10000 })

    it('8.2 权限失败时保留状态并记录日志', async () => {
      mockExportAPI.save.mockResolvedValue({
        success: false,
        error: 'EPERM: permission denied'
      })

      renderExportView()
      
      await act(async () => {
        fireEvent.click(screen.getByTestId('export-submit-btn'))
      })

      await waitFor(() => {
        expect(mockExportClips).toHaveBeenCalled()
      })

      await waitFor(() => {
        expect(screen.getByTestId('export-error-alert')).toBeInTheDocument()
      })

      expect(screen.getByTestId('export-error-alert')).toHaveTextContent(/没有写入权限/)

      const log = History.getOperationLog()
      const errorLog = log.find(l => l.message.includes('导出失败'))
      expect(errorLog).toBeDefined()
      expect(errorLog?.success).toBe(false)
    }, { timeout: 10000 })

    it('8.3 写入失败时保留状态并记录日志', async () => {
      mockExportAPI.save.mockResolvedValue({
        success: false,
        error: 'ENOSPC: no space left on device'
      })

      renderExportView()
      
      await act(async () => {
        fireEvent.click(screen.getByTestId('export-submit-btn'))
      })

      await waitFor(() => {
        expect(mockExportClips).toHaveBeenCalled()
      })

      await waitFor(() => {
        expect(screen.getByTestId('export-error-alert')).toBeInTheDocument()
      })

      expect(screen.getByTestId('export-error-alert')).toHaveTextContent(/磁盘空间不足/)

      const log = History.getOperationLog()
      const errorLog = log.find(l => l.message.includes('导出失败'))
      expect(errorLog).toBeDefined()
    }, { timeout: 10000 })

    it('8.4 目录不存在时保留状态并记录日志', async () => {
      mockExportAPI.save.mockResolvedValue({
        success: false,
        error: 'ENOENT: no such file or directory'
      })

      renderExportView()
      
      await act(async () => {
        fireEvent.click(screen.getByTestId('export-submit-btn'))
      })

      await waitFor(() => {
        expect(mockExportClips).toHaveBeenCalled()
      })

      await waitFor(() => {
        expect(screen.getByTestId('export-error-alert')).toBeInTheDocument()
      })

      expect(screen.getByTestId('export-error-alert')).toHaveTextContent(/目录不存在/)
    }, { timeout: 10000 })

    it('8.5 导出异常时正确处理并记录日志', async () => {
      mockExportAPI.save.mockRejectedValue(new Error('Network error'))

      renderExportView()
      
      await act(async () => {
        fireEvent.click(screen.getByTestId('export-submit-btn'))
      })

      await waitFor(() => {
        expect(mockExportClips).toHaveBeenCalled()
      })

      await waitFor(() => {
        expect(screen.getByTestId('export-error-alert')).toBeInTheDocument()
      })

      expect(screen.getByTestId('export-error-alert')).toHaveTextContent('Network error')

      const log = History.getOperationLog()
      const errorLog = log.find(l => l.message.includes('导出异常'))
      expect(errorLog).toBeDefined()
    }, { timeout: 10000 })

    it('8.6 重置按钮清除错误状态', async () => {
      mockExportAPI.save.mockResolvedValue({
        success: false,
        error: 'EPERM: permission denied'
      })

      renderExportView()
      
      await act(async () => {
        fireEvent.click(screen.getByTestId('export-submit-btn'))
      })

      await waitFor(() => {
        expect(screen.getByTestId('export-error-alert')).toBeInTheDocument()
      })

      fireEvent.click(screen.getByTestId('export-reset-btn'))
      
      expect(screen.queryByTestId('export-error-alert')).not.toBeInTheDocument()
    }, { timeout: 10000 })
  })

  describe('9. 预览和预检测试', () => {
    it('9.1 点击预览按钮生成预览内容', () => {
      renderExportView()
      fireEvent.click(screen.getByTestId('export-preview-btn'))
      expect(mockExportClips).toHaveBeenCalled()
      expect(screen.getByText('预览（前 3 个片段）')).toBeInTheDocument()
    })

    it('9.2 点击预检按钮执行预检', () => {
      renderExportView()
      fireEvent.click(screen.getByTestId('export-check-btn'))
      expect(mockCheckBeforeExport).toHaveBeenCalled()
    })

    it('9.3 可导出数量为0时预览按钮禁用', () => {
      renderExportView()
      fireEvent.click(screen.getByTestId('export-status-available'))
      fireEvent.click(screen.getByTestId('export-status-published'))
      expect(screen.getByTestId('export-preview-btn')).toBeDisabled()
    })

    it('9.4 预检不通过时导出按钮禁用', () => {
      mockCheckBeforeExport.mockReturnValue({
        allowed: false,
        results: [],
        summary: {
          totalClips: 5,
          errorCount: 1,
          warningCount: 0,
          infoCount: 0,
          byType: {
            sensitive_word: 0,
            missing_reference: 0,
            other: 0
          },
          clipsWithIssues: []
        } as unknown as CheckSummary
      })

      renderExportView()
      fireEvent.click(screen.getByTestId('export-check-btn'))
      expect(screen.getByTestId('export-submit-btn')).toBeDisabled()
    })
  })

  describe('10. 素材标题测试', () => {
    it('10.1 修改素材标题更新导出配置', () => {
      renderExportView()
      const input = screen.getByTestId('export-material-title')
      fireEvent.change(input, { target: { value: '2024年度生态保护采访' } })
      expect(input).toHaveValue('2024年度生态保护采访')
    })

    it('10.2 空标题使用默认值', async () => {
      renderExportView()
      const input = screen.getByTestId('export-material-title')
      fireEvent.change(input, { target: { value: '' } })
      
      await act(async () => {
        fireEvent.click(screen.getByTestId('export-submit-btn'))
      })
      
      await waitFor(() => {
        expect(mockExportClips).toHaveBeenCalled()
      })
      
      expect(mockExportClips).toHaveBeenCalledWith(expect.objectContaining({
        materialTitle: ''
      }))
    }, { timeout: 10000 })
  })
})
