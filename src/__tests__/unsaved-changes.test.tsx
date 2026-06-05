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

const importSampleAndGetUnsaved = async (mockAPI: MockAPI) => {
  const importNav = screen.getByText('导入')
  fireEvent.click(importNav)

  const textarea = screen.getByPlaceholderText(/粘贴或输入采访转写文本/)
  fireEvent.change(textarea, { target: { value: sampleTranscript } })

  const submitButton = screen.getByRole('button', { name: /开始导入/ })
  fireEvent.click(submitButton)

  await waitFor(() => {
    expect(screen.getByText(/成功导入/)).toBeInTheDocument()
  })

  await waitFor(() => {
    expect(screen.getByTestId('unsaved-changes-indicator')).toBeInTheDocument()
  })

  mockAPI.load.mockResolvedValue({
    success: true,
    content: createSerializedEmptyWorkspace(),
    path: 'old.json'
  })
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
    expect(screen.queryByTestId('unsaved-changes-modal')).not.toBeInTheDocument()
    expect(screen.queryByTestId('unsaved-changes-indicator')).not.toBeInTheDocument()
  })

  it('2. 有未保存改动时打开工作区触发弹窗，显示三个选项', async () => {
    mockAPI.load.mockResolvedValue({
      success: true,
      content: createSerializedEmptyWorkspace(),
      path: 'old.json'
    })

    render(<App />)

    expect(screen.getByText(/采访素材摘录工具/)).toBeInTheDocument()
    expect(screen.queryByTestId('unsaved-changes-modal')).not.toBeInTheDocument()

    await importSampleAndGetUnsaved(mockAPI)

    const openButton = screen.getByText(/打开工作区/)
    fireEvent.click(openButton)

    await waitFor(() => {
      expect(screen.getByTestId('unsaved-changes-modal')).toBeInTheDocument()
    })

    const modal = screen.getByTestId('unsaved-changes-modal')
    expect(modal).toHaveTextContent(/当前工作区有未保存的改动/)
    expect(modal).toHaveTextContent(/加载新工作区将覆盖/)

    expect(screen.getByTestId('unsaved-changes-keep-btn')).toBeInTheDocument()
    expect(screen.getByTestId('unsaved-changes-overwrite-btn')).toBeInTheDocument()
    expect(screen.getByTestId('unsaved-changes-saveas-btn')).toBeInTheDocument()

    const keepBtn = screen.getByTestId('unsaved-changes-keep-btn')
    expect(keepBtn).toHaveClass('btn-primary')
    expect(keepBtn).toHaveTextContent(/🔒 保留当前/)
    expect(keepBtn).toHaveTextContent(/取消本次操作，继续编辑当前工作区/)

    const overwriteBtn = screen.getByTestId('unsaved-changes-overwrite-btn')
    expect(overwriteBtn).toHaveTextContent(/⚠ 丢弃当前并加载/)
    expect(overwriteBtn).toHaveTextContent(/放弃所有未保存改动，继续加载/)

    const saveasBtn = screen.getByTestId('unsaved-changes-saveas-btn')
    expect(saveasBtn).toHaveTextContent(/💾 先另存当前工作区/)
    expect(saveasBtn).toHaveTextContent(/保存当前工作区后再继续/)
  }, { timeout: 15000 })

  it('3. 选择"保留当前"：关闭弹窗，保留未保存状态', async () => {
    mockAPI.load.mockResolvedValue({
      success: true,
      content: createSerializedEmptyWorkspace(),
      path: 'old.json'
    })

    render(<App />)

    await importSampleAndGetUnsaved(mockAPI)

    const openButton = screen.getByText(/打开工作区/)
    fireEvent.click(openButton)

    await waitFor(() => {
      expect(screen.getByTestId('unsaved-changes-modal')).toBeInTheDocument()
    })

    const keepButton = screen.getByTestId('unsaved-changes-keep-btn')
    fireEvent.click(keepButton)

    await waitFor(() => {
      expect(screen.queryByTestId('unsaved-changes-modal')).not.toBeInTheDocument()
    })

    expect(screen.getByTestId('unsaved-changes-indicator')).toBeInTheDocument()
    expect(screen.getByText(/已保留当前工作区/)).toBeInTheDocument()
    expect(mockAPI.load).toHaveBeenCalledTimes(0)
  }, { timeout: 15000 })

  it('4. 选择"丢弃当前并加载"：关闭弹窗，加载新内容', async () => {
    mockAPI.load.mockResolvedValue({
      success: true,
      content: createSerializedEmptyWorkspace(),
      path: 'old.json'
    })

    render(<App />)

    await importSampleAndGetUnsaved(mockAPI)

    const openButton = screen.getByText(/打开工作区/)
    fireEvent.click(openButton)

    await waitFor(() => {
      expect(screen.getByTestId('unsaved-changes-modal')).toBeInTheDocument()
    })

    const overwriteButton = screen.getByTestId('unsaved-changes-overwrite-btn')
    fireEvent.click(overwriteButton)

    await waitFor(() => {
      expect(screen.queryByTestId('unsaved-changes-modal')).not.toBeInTheDocument()
    })

    await waitFor(() => {
      expect(screen.getByText(/工作区已加载/)).toBeInTheDocument()
    })

    expect(screen.queryByTestId('unsaved-changes-indicator')).not.toBeInTheDocument()
  }, { timeout: 15000 })

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

    await importSampleAndGetUnsaved(mockAPI)

    const openButton = screen.getByText(/打开工作区/)
    fireEvent.click(openButton)

    await waitFor(() => {
      expect(screen.getByTestId('unsaved-changes-modal')).toBeInTheDocument()
    })

    const saveAsButton = screen.getByTestId('unsaved-changes-saveas-btn')
    fireEvent.click(saveAsButton)

    await waitFor(() => {
      expect(mockAPI.saveAs).toHaveBeenCalled()
    })

    await waitFor(() => {
      expect(screen.getByText(/工作区已另存，继续加载/)).toBeInTheDocument()
    })

    await waitFor(() => {
      expect(screen.getByText(/工作区已加载/)).toBeInTheDocument()
    })

    expect(mockAPI.load).toHaveBeenCalledTimes(1)
  }, { timeout: 15000 })

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

    await importSampleAndGetUnsaved(mockAPI)

    const openButton = screen.getByText(/打开工作区/)
    fireEvent.click(openButton)

    await waitFor(() => {
      expect(screen.getByTestId('unsaved-changes-modal')).toBeInTheDocument()
    })

    const saveAsButton = screen.getByTestId('unsaved-changes-saveas-btn')
    fireEvent.click(saveAsButton)

    await waitFor(() => {
      expect(mockAPI.saveAs).toHaveBeenCalled()
    })

    await waitFor(() => {
      expect(screen.getByText(/保存失败/)).toBeInTheDocument()
    })

    expect(screen.queryByText(/工作区已加载/)).not.toBeInTheDocument()
    expect(screen.getByTestId('unsaved-changes-indicator')).toBeInTheDocument()
    expect(mockAPI.load).toHaveBeenCalledTimes(0)
    expect(screen.queryByTestId('unsaved-changes-modal')).not.toBeInTheDocument()
  }, { timeout: 15000 })

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

    await importSampleAndGetUnsaved(mockAPI)

    const openButton = screen.getByText(/打开工作区/)
    fireEvent.click(openButton)

    await waitFor(() => {
      expect(screen.getByTestId('unsaved-changes-modal')).toBeInTheDocument()
    })

    const saveAsButton = screen.getByTestId('unsaved-changes-saveas-btn')
    fireEvent.click(saveAsButton)

    await waitFor(() => {
      expect(mockAPI.saveAs).toHaveBeenCalled()
    })

    await waitFor(() => {
      expect(screen.getByText(/已取消保存/)).toBeInTheDocument()
    })

    expect(screen.queryByText(/工作区已加载/)).not.toBeInTheDocument()
    expect(screen.getByTestId('unsaved-changes-indicator')).toBeInTheDocument()
    expect(screen.queryByTestId('unsaved-changes-modal')).not.toBeInTheDocument()
  }, { timeout: 15000 })

  it('8. 有未保存改动时新建工作区触发弹窗', async () => {
    render(<App />)

    await importSampleAndGetUnsaved(mockAPI)

    const newButton = screen.getByText(/新建工作区/)
    fireEvent.click(newButton)

    await waitFor(() => {
      expect(screen.getByTestId('unsaved-changes-modal')).toBeInTheDocument()
    })

    const modal = screen.getByTestId('unsaved-changes-modal')
    expect(modal).toHaveTextContent(/创建新工作区将覆盖/)
  }, { timeout: 15000 })
})
