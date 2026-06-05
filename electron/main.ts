import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

const isDev = !app.isPackaged

let mainWindow: BrowserWindow | null = null

const getWorkspaceDir = (): string => {
  const userDataPath = app.getPath('userData')
  const workspaceDir = path.join(userDataPath, 'workspaces')
  if (!fs.existsSync(workspaceDir)) {
    fs.mkdirSync(workspaceDir, { recursive: true })
  }
  return workspaceDir
}

const getAutoSavePath = (): string => {
  return path.join(getWorkspaceDir(), 'autosave.json')
}

const getBackupPath = (): string => {
  return path.join(getWorkspaceDir(), 'backup.json')
}

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

ipcMain.handle('file:read-text', async (_event, filePath: string) => {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    return { success: true, content }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('file:write-text', async (_event, filePath: string, content: string) => {
  try {
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(filePath, content, 'utf-8')
    return { success: true }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('dialog:open-file', async (_event, filters?: Electron.FileFilter[]) => {
  if (!mainWindow) return { canceled: true, filePaths: [] }

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: filters || [
      { name: '文本文件', extensions: ['txt', 'md', 'json'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  })

  return result
})

ipcMain.handle('dialog:save-file', async (_event, defaultName?: string, filters?: Electron.FileFilter[]) => {
  if (!mainWindow) return { canceled: true, filePath: '' }

  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName || 'untitled',
    filters: filters || [
      { name: '所有文件', extensions: ['*'] }
    ]
  })

  return result
})

const formatFileSystemError = (error: Error, operation: string, filePath?: string): string => {
  const err = error as NodeJS.ErrnoException
  const pathInfo = filePath ? `（${filePath}）` : ''
  
  switch (err.code) {
    case 'EPERM':
    case 'EACCES':
      return `权限不足：无法${operation}${pathInfo}。请检查文件是否被其他程序占用，或您是否有写入权限。`
    case 'EISDIR':
      return `路径错误：${filePath} 是一个目录，无法${operation}。`
    case 'ENOENT':
      return `路径不存在：无法${operation}${pathInfo}。请检查目录是否存在。`
    case 'ENOSPC':
      return `磁盘空间不足：无法${operation}${pathInfo}。请清理磁盘空间后重试。`
    case 'EFBIG':
      return `文件过大：无法${operation}${pathInfo}。文件大小超出系统限制。`
    case 'EROFS':
      return `文件系统只读：无法${operation}${pathInfo}。请选择其他可写入的位置。`
    case 'EBUSY':
      return `文件被占用：无法${operation}${pathInfo}。请关闭其他正在使用该文件的程序。`
    case 'EIO':
      return `IO 错误：${operation}失败${pathInfo}。请检查存储设备是否正常。`
    default:
      return `${operation}失败${pathInfo}：${error.message}（错误码：${err.code || '未知'}）`
  }
}

ipcMain.handle('workspace:load-autosave', async () => {
  try {
    const savePath = getAutoSavePath()
    if (fs.existsSync(savePath)) {
      const content = fs.readFileSync(savePath, 'utf-8')
      return { success: true, content, hasBackup: fs.existsSync(getBackupPath()) }
    }
    return { success: false, content: null, hasBackup: false }
  } catch (error) {
    return { 
      success: false, 
      error: formatFileSystemError(error as Error, '读取自动保存', getAutoSavePath()),
      hasBackup: fs.existsSync(getBackupPath())
    }
  }
})

ipcMain.handle('workspace:load-backup', async () => {
  try {
    const backupPath = getBackupPath()
    if (fs.existsSync(backupPath)) {
      const content = fs.readFileSync(backupPath, 'utf-8')
      return { success: true, content }
    }
    return { success: false, content: null }
  } catch (error) {
    return { 
      success: false, 
      error: formatFileSystemError(error as Error, '读取备份', getBackupPath())
    }
  }
})

ipcMain.handle('workspace:save-as', async (_event, data: string) => {
  if (!mainWindow) return { canceled: true }

  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: 'workspace.json',
    filters: [
      { name: '工作区文件', extensions: ['json'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  })

  if (result.canceled || !result.filePath) {
    return { canceled: true }
  }

  try {
    const dir = path.dirname(result.filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(result.filePath, data, 'utf-8')
    return { success: true, path: result.filePath }
  } catch (error) {
    return { 
      success: false, 
      error: formatFileSystemError(error as Error, '保存文件', result.filePath)
    }
  }
})

ipcMain.handle('workspace:autosave', async (_event, data: string) => {
  try {
    const savePath = getAutoSavePath()
    const backupPath = getBackupPath()

    if (fs.existsSync(savePath)) {
      const currentContent = fs.readFileSync(savePath, 'utf-8')
      try {
        fs.writeFileSync(backupPath, currentContent, 'utf-8')
      } catch (backupError) {
        console.warn('备份自动保存文件失败:', formatFileSystemError(backupError as Error, '备份', backupPath))
      }
    }

    const dir = path.dirname(savePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    fs.writeFileSync(savePath, data, 'utf-8')
    return { success: true, path: savePath }
  } catch (error) {
    return { 
      success: false, 
      error: formatFileSystemError(error as Error, '自动保存', getAutoSavePath())
    }
  }
})

ipcMain.handle('workspace:load', async (_event, filePath?: string) => {
  if (filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      return { success: true, content, path: filePath }
    } catch (error) {
      return { 
        success: false, 
        error: formatFileSystemError(error as Error, '读取文件', filePath)
      }
    }
  }

  if (!mainWindow) return { canceled: true }

  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: '工作区文件', extensions: ['json'] },
      { name: '所有文件', extensions: ['*'] }
    ]
  })

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true }
  }

  try {
    const content = fs.readFileSync(result.filePaths[0], 'utf-8')
    return { success: true, content, path: result.filePaths[0] }
  } catch (error) {
    return { 
      success: false, 
      error: formatFileSystemError(error as Error, '读取文件', result.filePaths[0])
    }
  }
})

ipcMain.handle('export:save', async (_event, fileName: string, content: string, filters?: Electron.FileFilter[]) => {
  if (!mainWindow) return { canceled: true }

  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: fileName,
    filters: filters || [
      { name: '所有文件', extensions: ['*'] }
    ]
  })

  if (result.canceled || !result.filePath) {
    return { canceled: true }
  }

  try {
    fs.writeFileSync(result.filePath, content, 'utf-8')
    return { success: true, path: result.filePath }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('app:get-version', () => {
  return app.getVersion()
})

ipcMain.handle('app:get-paths', () => {
  return {
    userData: app.getPath('userData'),
    workspace: getWorkspaceDir(),
    autosave: getAutoSavePath(),
    backup: getBackupPath()
  }
})
