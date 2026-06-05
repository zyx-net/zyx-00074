import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import App from '../App'
import * as State from '../core/state'
import * as History from '../core/history'

const sampleTranscript = `张三：今天我们来谈谈这个项目。

李四：好的，这个项目非常重要。

王五：我认为我们需要更多时间。
`

const createMockAPI = () => ({
  load: vi.fn(),
  loadAutosave: vi.fn(),
  autosave: vi.fn(),
  saveAs: vi.fn(),
  exportClipboard: vi.fn()
})

type MockAPI = ReturnType<typeof createMockAPI>

const setupMockAPI = (mockAPI: MockAPI) => {
  mockAPI.autosave.mockResolvedValue({ success: true })
  mockAPI.loadAutosave.mockResolvedValue({ success: false, hasBackup: false })
}

const createSerializedEmptyWorkspace = () => {
  return History.serialize(State.createInitialState(), History.createInitialHistory())
}

const waitForWithTimeout = (callback: () => void, timeout = 3000) => {
  return waitFor(callback, { timeout, interval: 100 })
}

describe('未保存改动确认弹窗 - 组件渲染验证', () => {
  let mockAPI: MockAPI

  beforeEach(() => {
    mockAPI = createMockAPI()
    setupMockAPI(mockAPI)
    window.workspaceAPI = mockAPI as unknown as typeof window.workspaceAPI
    History.clearOperationLog()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('1. 应用初始渲染时弹窗不显示', () => {
    render(<App />)
    
    expect(screen.getByText(/采访素材摘录工具/)).toBeInTheDocument()
    expect(screen.queryByText(/未保存的改动/)).not.toBeInTheDocument()
  })

  it('2. 有未保存改动时打开工作区触发弹窗，显示三个选项', async () => {
    mockAPI.load.mockResolvedValue({
      success: true,
      content: createSerializedEmptyWorkspace(),
      path: 'old.json'
    })

    render(<App />)
    
    expect(screen.getByText(/采访素材摘录工具/)).toBeInTheDocument()
    
    const importNav = screen.getByText('导入')
    fireEvent.click(importNav)
    
    const textarea = screen.getByPlaceholderText(/粘贴或输入采访转写文本/)
    fireEvent.change(textarea, { target: { value: sampleTranscript } })
    
    const submitButton = screen.getByRole('button', { name: /开始导入/ })
    fireEvent.click(submitButton)
    
    await waitForWithTimeout(() => {
      expect(screen.getByText(/成功导入/)).toBeInTheDocument()
    })
    
    await waitForWithTimeout(() => {
      expect(screen.getByText(/有未保存改动/)).toBeInTheDocument()
    })
    
    const openButton = screen.getByText(/打开工作区/)
    fireEvent.click(openButton)
    
    await waitForWithTimeout(() => {
      expect(screen.getByText(/未保存的改动/)).toBeInTheDocument()
    })
    
    expect(screen.getByText(/当前工作区有未保存的改动/)).toBeInTheDocument()
    expect(screen.getByText(/加载新工作区将覆盖/)).toBeInTheDocument()
    
    expect(screen.getByText(/🔒 保留当前/)).toBeInTheDocument()
    expect(screen.getByText(/取消本次操作，继续编辑当前工作区/)).toBeInTheDocument()
    
    expect(screen.getByText(/⚠ 丢弃当前并加载/)).toBeInTheDocument()
    expect(screen.getByText(/放弃所有未保存改动，继续加载/)).toBeInTheDocument()
    
    expect(screen.getByText(/💾 先另存当前工作区/)).toBeInTheDocument()
    expect(screen.getByText(/保存当前工作区后再继续/)).toBeInTheDocument()
    
    const buttons = screen.getAllByRole('button')
    const actionButtons = Array.from(buttons).filter(b => 
      b.textContent?.includes('保留当前') ||
      b.textContent?.includes('丢弃当前并加载') ||
      b.textContent?.includes('先另存当前工作区')
    )
    expect(actionButtons.length).toBe(3)
    
    const keepBtn = actionButtons.find(b => b.textContent?.includes('保留当前'))
    expect(keepBtn).toHaveClass('btn-primary')
  })

  it('3. 选择"保留当前"：关闭弹窗，保留未保存状态', async () => {
    mockAPI.load.mockResolvedValue({
      success: true,
      content: createSerializedEmptyWorkspace(),
      path: 'old.json'
    })

    render(<App />)
    
    const importNav = screen.getByText('导入')
    fireEvent.click(importNav)
    
    const textarea = screen.getByPlaceholderText(/粘贴或输入采访转写文本/)
    fireEvent.change(textarea, { target: { value: sampleTranscript } })
    
    const submitButton = screen.getByRole('button', { name: /开始导入/ })
    fireEvent.click(submitButton)
    
    await waitForWithTimeout(() => {
      expect(screen.getByText(/有未保存改动/)).toBeInTheDocument()
    })
    
    const openButton = screen.getByText(/打开工作区/)
    fireEvent.click(openButton)
    
    await waitForWithTimeout(() => {
      expect(screen.getByText(/未保存的改动/)).toBeInTheDocument()
    })
    
    const keepButton = screen.getByText(/🔒 保留当前/)
    fireEvent.click(keepButton)
    
    await waitForWithTimeout(() => {
      expect(screen.queryByText(/未保存的改动/)).not.toBeInTheDocument()
    })
    
    expect(screen.getByText(/有未保存改动/)).toBeInTheDocument()
    expect(screen.getByText(/已保留当前工作区/)).toBeInTheDocument()
    expect(mockAPI.load).toHaveBeenCalledTimes(1)
  })

  it('4. 选择"丢弃当前并加载"：关闭弹窗，加载新内容', async () => {
    mockAPI.load.mockResolvedValue({
      success: true,
      content: createSerializedEmptyWorkspace(),
      path: 'old.json'
    })

    render(<App />)
    
    const importNav = screen.getByText('导入')
    fireEvent.click(importNav)
    
    const textarea = screen.getByPlaceholderText(/粘贴或输入采访转写文本/)
    fireEvent.change(textarea, { target: { value: sampleTranscript } })
    
    const submitButton = screen.getByRole('button', { name: /开始导入/ })
    fireEvent.click(submitButton)
    
    await waitForWithTimeout(() => {
      expect(screen.getByText(/有未保存改动/)).toBeInTheDocument()
    })
    
    const openButton = screen.getByText(/打开工作区/)
    fireEvent.click(openButton)
    
    await waitForWithTimeout(() => {
      expect(screen.getByText(/未保存的改动/)).toBeInTheDocument()
    })
    
    const overwriteButton = screen.getByText(/⚠ 丢弃当前并加载/)
    fireEvent.click(overwriteButton)
    
    await waitForWithTimeout(() => {
      expect(screen.queryByText(/未保存的改动/)).not.toBeInTheDocument()
    })
    
    await waitForWithTimeout(() => {
      expect(screen.getByText(/工作区已加载/)).toBeInTheDocument()
    })
    
    expect(screen.queryByText(/有未保存改动/)).not.toBeInTheDocument()
  })

  it('5. 选择"先另存"且保存成功后继续加载', async () => {
    mockAPI.load.mockResolvedValue({
      success: true,
      content: createSerializedEmptyWorkspace(),
      path: 'old.json'
    })
    mockAPI.saveAs.mockResolvedValue({
      success: true,
      path: 'saved.json'
    })

    render(<App />)
    
    const importNav = screen.getByText('导入')
    fireEvent.click(importNav)
    
    const textarea = screen.getByPlaceholderText(/粘贴或输入采访转写文本/)
    fireEvent.change(textarea, { target: { value: sampleTranscript } })
    
    const submitButton = screen.getByRole('button', { name: /开始导入/ })
    fireEvent.click(submitButton)
    
    await waitForWithTimeout(() => {
      expect(screen.getByText(/有未保存改动/)).toBeInTheDocument()
    })
    
    const openButton = screen.getByText(/打开工作区/)
    fireEvent.click(openButton)
    
    await waitForWithTimeout(() => {
      expect(screen.getByText(/未保存的改动/)).toBeInTheDocument()
    })
    
    const saveAsButton = screen.getByText(/💾 先另存当前工作区/)
    fireEvent.click(saveAsButton)
    
    await waitForWithTimeout(() => {
      expect(mockAPI.saveAs).toHaveBeenCalled()
    })
    
    await waitForWithTimeout(() => {
      expect(screen.getByText(/工作区已另存，继续加载/)).toBeInTheDocument()
    })
    
    await waitForWithTimeout(() => {
      expect(screen.getByText(/工作区已加载/)).toBeInTheDocument()
    })
    
    expect(mockAPI.load).toHaveBeenCalledTimes(1)
  })

  it('6. 选择"先另存"但保存失败时不加载，保持原状态', async () => {
    mockAPI.load.mockResolvedValue({
      success: true,
      content: createSerializedEmptyWorkspace(),
      path: 'old.json'
    })
    mockAPI.saveAs.mockResolvedValue({
      success: false,
      error: '权限不足：无法保存文件'
    })

    render(<App />)
    
    const importNav = screen.getByText('导入')
    fireEvent.click(importNav)
    
    const textarea = screen.getByPlaceholderText(/粘贴或输入采访转写文本/)
    fireEvent.change(textarea, { target: { value: sampleTranscript } })
    
    const submitButton = screen.getByRole('button', { name: /开始导入/ })
    fireEvent.click(submitButton)
    
    await waitForWithTimeout(() => {
      expect(screen.getByText(/有未保存改动/)).toBeInTheDocument()
    })
    
    const openButton = screen.getByText(/打开工作区/)
    fireEvent.click(openButton)
    
    await waitForWithTimeout(() => {
      expect(screen.getByText(/未保存的改动/)).toBeInTheDocument()
    })
    
    const saveAsButton = screen.getByText(/💾 先另存当前工作区/)
    fireEvent.click(saveAsButton)
    
    await waitForWithTimeout(() => {
      expect(mockAPI.saveAs).toHaveBeenCalled()
    })
    
    await waitForWithTimeout(() => {
      expect(screen.getByText(/保存失败/)).toBeInTheDocument()
    })
    
    expect(screen.queryByText(/工作区已加载/)).not.toBeInTheDocument()
    expect(screen.getByText(/有未保存改动/)).toBeInTheDocument()
    expect(mockAPI.load).toHaveBeenCalledTimes(1)
  })

  it('7. 选择"先另存"但用户取消时不加载，保持原状态', async () => {
    mockAPI.load.mockResolvedValue({
      success: true,
      content: createSerializedEmptyWorkspace(),
      path: 'old.json'
    })
    mockAPI.saveAs.mockResolvedValue({
      canceled: true
    })

    render(<App />)
    
    const importNav = screen.getByText('导入')
    fireEvent.click(importNav)
    
    const textarea = screen.getByPlaceholderText(/粘贴或输入采访转写文本/)
    fireEvent.change(textarea, { target: { value: sampleTranscript } })
    
    const submitButton = screen.getByRole('button', { name: /开始导入/ })
    fireEvent.click(submitButton)
    
    await waitForWithTimeout(() => {
      expect(screen.getByText(/有未保存改动/)).toBeInTheDocument()
    })
    
    const openButton = screen.getByText(/打开工作区/)
    fireEvent.click(openButton)
    
    await waitForWithTimeout(() => {
      expect(screen.getByText(/未保存的改动/)).toBeInTheDocument()
    })
    
    const saveAsButton = screen.getByText(/💾 先另存当前工作区/)
    fireEvent.click(saveAsButton)
    
    await waitForWithTimeout(() => {
      expect(mockAPI.saveAs).toHaveBeenCalled()
    })
    
    await waitForWithTimeout(() => {
      expect(screen.getByText(/已取消保存/)).toBeInTheDocument()
    })
    
    expect(screen.queryByText(/工作区已加载/)).not.toBeInTheDocument()
    expect(screen.getByText(/有未保存改动/)).toBeInTheDocument()
  })

  it('8. 有未保存改动时新建工作区触发弹窗', async () => {
    render(<App />)
    
    const importNav = screen.getByText('导入')
    fireEvent.click(importNav)
    
    const textarea = screen.getByPlaceholderText(/粘贴或输入采访转写文本/)
    fireEvent.change(textarea, { target: { value: sampleTranscript } })
    
    const submitButton = screen.getByRole('button', { name: /开始导入/ })
    fireEvent.click(submitButton)
    
    await waitForWithTimeout(() => {
      expect(screen.getByText(/有未保存改动/)).toBeInTheDocument()
    })
    
    const newButton = screen.getByText(/新建工作区/)
    fireEvent.click(newButton)
    
    await waitForWithTimeout(() => {
      expect(screen.getByText(/未保存的改动/)).toBeInTheDocument()
    })
    
    expect(screen.getByText(/创建新工作区将覆盖/)).toBeInTheDocument()
  })
})
