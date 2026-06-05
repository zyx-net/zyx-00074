"use strict";
const electron = require("electron");
const fs = require("fs");
const path = require("path");
function _interopNamespaceDefault(e) {
  const n = Object.create(null, { [Symbol.toStringTag]: { value: "Module" } });
  if (e) {
    for (const k in e) {
      if (k !== "default") {
        const d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: () => e[k]
        });
      }
    }
  }
  n.default = e;
  return Object.freeze(n);
}
const fs__namespace = /* @__PURE__ */ _interopNamespaceDefault(fs);
const path__namespace = /* @__PURE__ */ _interopNamespaceDefault(path);
const isDev = !electron.app.isPackaged;
let mainWindow = null;
const getWorkspaceDir = () => {
  const userDataPath = electron.app.getPath("userData");
  const workspaceDir = path__namespace.join(userDataPath, "workspaces");
  if (!fs__namespace.existsSync(workspaceDir)) {
    fs__namespace.mkdirSync(workspaceDir, { recursive: true });
  }
  return workspaceDir;
};
const getAutoSavePath = () => {
  return path__namespace.join(getWorkspaceDir(), "autosave.json");
};
const getBackupPath = () => {
  return path__namespace.join(getWorkspaceDir(), "backup.json");
};
const createWindow = () => {
  mainWindow = new electron.BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path__namespace.join(__dirname, "preload.js")
    }
  });
  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path__namespace.join(__dirname, "../dist/index.html"));
  }
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    electron.shell.openExternal(url);
    return { action: "deny" };
  });
};
electron.app.whenReady().then(() => {
  createWindow();
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
electron.ipcMain.handle("file:read-text", async (_event, filePath) => {
  try {
    const content = fs__namespace.readFileSync(filePath, "utf-8");
    return { success: true, content };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
electron.ipcMain.handle("file:write-text", async (_event, filePath, content) => {
  try {
    const dir = path__namespace.dirname(filePath);
    if (!fs__namespace.existsSync(dir)) {
      fs__namespace.mkdirSync(dir, { recursive: true });
    }
    fs__namespace.writeFileSync(filePath, content, "utf-8");
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
electron.ipcMain.handle("dialog:open-file", async (_event, filters) => {
  if (!mainWindow) return { canceled: true, filePaths: [] };
  const result = await electron.dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: filters || [
      { name: "文本文件", extensions: ["txt", "md", "json"] },
      { name: "所有文件", extensions: ["*"] }
    ]
  });
  return result;
});
electron.ipcMain.handle("dialog:save-file", async (_event, defaultName, filters) => {
  if (!mainWindow) return { canceled: true, filePath: "" };
  const result = await electron.dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName || "untitled",
    filters: filters || [
      { name: "所有文件", extensions: ["*"] }
    ]
  });
  return result;
});
const formatFileSystemError = (error, operation, filePath) => {
  const err = error;
  const pathInfo = filePath ? `（${filePath}）` : "";
  switch (err.code) {
    case "EPERM":
    case "EACCES":
      return `权限不足：无法${operation}${pathInfo}。请检查文件是否被其他程序占用，或您是否有写入权限。`;
    case "EISDIR":
      return `路径错误：${filePath} 是一个目录，无法${operation}。`;
    case "ENOENT":
      return `路径不存在：无法${operation}${pathInfo}。请检查目录是否存在。`;
    case "ENOSPC":
      return `磁盘空间不足：无法${operation}${pathInfo}。请清理磁盘空间后重试。`;
    case "EFBIG":
      return `文件过大：无法${operation}${pathInfo}。文件大小超出系统限制。`;
    case "EROFS":
      return `文件系统只读：无法${operation}${pathInfo}。请选择其他可写入的位置。`;
    case "EBUSY":
      return `文件被占用：无法${operation}${pathInfo}。请关闭其他正在使用该文件的程序。`;
    case "EIO":
      return `IO 错误：${operation}失败${pathInfo}。请检查存储设备是否正常。`;
    default:
      return `${operation}失败${pathInfo}：${error.message}（错误码：${err.code || "未知"}）`;
  }
};
electron.ipcMain.handle("workspace:load-autosave", async () => {
  try {
    const savePath = getAutoSavePath();
    if (fs__namespace.existsSync(savePath)) {
      const content = fs__namespace.readFileSync(savePath, "utf-8");
      return { success: true, content, hasBackup: fs__namespace.existsSync(getBackupPath()) };
    }
    return { success: false, content: null, hasBackup: false };
  } catch (error) {
    return {
      success: false,
      error: formatFileSystemError(error, "读取自动保存", getAutoSavePath()),
      hasBackup: fs__namespace.existsSync(getBackupPath())
    };
  }
});
electron.ipcMain.handle("workspace:load-backup", async () => {
  try {
    const backupPath = getBackupPath();
    if (fs__namespace.existsSync(backupPath)) {
      const content = fs__namespace.readFileSync(backupPath, "utf-8");
      return { success: true, content };
    }
    return { success: false, content: null };
  } catch (error) {
    return {
      success: false,
      error: formatFileSystemError(error, "读取备份", getBackupPath())
    };
  }
});
electron.ipcMain.handle("workspace:save-as", async (_event, data) => {
  if (!mainWindow) return { canceled: true };
  const result = await electron.dialog.showSaveDialog(mainWindow, {
    defaultPath: "workspace.json",
    filters: [
      { name: "工作区文件", extensions: ["json"] },
      { name: "所有文件", extensions: ["*"] }
    ]
  });
  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }
  try {
    const dir = path__namespace.dirname(result.filePath);
    if (!fs__namespace.existsSync(dir)) {
      fs__namespace.mkdirSync(dir, { recursive: true });
    }
    fs__namespace.writeFileSync(result.filePath, data, "utf-8");
    return { success: true, path: result.filePath };
  } catch (error) {
    return {
      success: false,
      error: formatFileSystemError(error, "保存文件", result.filePath)
    };
  }
});
electron.ipcMain.handle("workspace:autosave", async (_event, data) => {
  try {
    const savePath = getAutoSavePath();
    const backupPath = getBackupPath();
    if (fs__namespace.existsSync(savePath)) {
      const currentContent = fs__namespace.readFileSync(savePath, "utf-8");
      try {
        fs__namespace.writeFileSync(backupPath, currentContent, "utf-8");
      } catch (backupError) {
        console.warn("备份自动保存文件失败:", formatFileSystemError(backupError, "备份", backupPath));
      }
    }
    const dir = path__namespace.dirname(savePath);
    if (!fs__namespace.existsSync(dir)) {
      fs__namespace.mkdirSync(dir, { recursive: true });
    }
    fs__namespace.writeFileSync(savePath, data, "utf-8");
    return { success: true, path: savePath };
  } catch (error) {
    return {
      success: false,
      error: formatFileSystemError(error, "自动保存", getAutoSavePath())
    };
  }
});
electron.ipcMain.handle("workspace:load", async (_event, filePath) => {
  if (filePath) {
    try {
      const content = fs__namespace.readFileSync(filePath, "utf-8");
      return { success: true, content, path: filePath };
    } catch (error) {
      return {
        success: false,
        error: formatFileSystemError(error, "读取文件", filePath)
      };
    }
  }
  if (!mainWindow) return { canceled: true };
  const result = await electron.dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [
      { name: "工作区文件", extensions: ["json"] },
      { name: "所有文件", extensions: ["*"] }
    ]
  });
  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true };
  }
  try {
    const content = fs__namespace.readFileSync(result.filePaths[0], "utf-8");
    return { success: true, content, path: result.filePaths[0] };
  } catch (error) {
    return {
      success: false,
      error: formatFileSystemError(error, "读取文件", result.filePaths[0])
    };
  }
});
electron.ipcMain.handle("export:save", async (_event, fileName, content, filters) => {
  if (!mainWindow) return { canceled: true };
  const result = await electron.dialog.showSaveDialog(mainWindow, {
    defaultPath: fileName,
    filters: filters || [
      { name: "所有文件", extensions: ["*"] }
    ]
  });
  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }
  try {
    fs__namespace.writeFileSync(result.filePath, content, "utf-8");
    return { success: true, path: result.filePath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
electron.ipcMain.handle("app:get-version", () => {
  return electron.app.getVersion();
});
electron.ipcMain.handle("app:get-paths", () => {
  return {
    userData: electron.app.getPath("userData"),
    workspace: getWorkspaceDir(),
    autosave: getAutoSavePath(),
    backup: getBackupPath()
  };
});
