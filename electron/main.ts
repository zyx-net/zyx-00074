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

ipcMain.handle('workspace:autosave', async (_event, data: string) => {
  try {
    const savePath = getAutoSavePath()
    const backupPath = getBackupPath()

    if (fs.existsSync(savePath)) {
      const currentContent = fs.readFileSync(savePath, 'utf-8')
      fs.writeFileSync(backupPath, currentContent, 'utf-8')
    }

    fs.writeFileSync(savePath, data, 'utf-8')
    return { success: true, path: savePath }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('workspace:load-autosave', async () => {
  try {
    const savePath = getAutoSavePath()
    if (fs.existsSync(savePath)) {
      const content = fs.readFileSync(savePath, 'utf-8')
      return { success: true, content, hasBackup: fs.existsSync(getBackupPath()) }
    }
    return { success: false, content: null, hasBackup: false }
  } catch (error) {
    return { success: false, error: (error as Error).message, hasBackup: fs.existsSync(getBackupPath()) }
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
    return { success: false, error: (error as Error).message }
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
    fs.writeFileSync(result.filePath, data, 'utf-8')
    return { success: true, path: result.filePath }
  } catch (error) {
    return { success: false, error: (error as Error).message }
  }
})

ipcMain.handle('workspace:load', async (_event, filePath?: string) => {
  if (filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      return { success: true, content, path: filePath }
    } catch (error) {
      return { success: false, error: (error as Error).message }
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
    return { success: false, error: (error as Error).message }
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
