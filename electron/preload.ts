import { contextBridge, ipcRenderer } from 'electron'
import type { ClipStatus, ExportOptions } from '../src/core/types'
import type { RecoveryOption } from '../src/core/history'

export interface FileAPI {
  readText: (filePath: string) => Promise<{ success: boolean; content?: string; error?: string }>
  writeText: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>
  openFile: (filters?: { name: string; extensions: string[] }[]) => Promise<{
    canceled: boolean
    filePaths: string[]
  }>
  saveFile: (defaultName?: string, filters?: { name: string; extensions: string[] }[]) => Promise<{
    canceled: boolean
    filePath?: string
  }>
}

export interface WorkspaceAPI {
  autosave: (data: string) => Promise<{ success: boolean; path?: string; error?: string }>
  loadAutosave: () => Promise<{
    success: boolean
    content?: string | null
    error?: string
    hasBackup: boolean
  }>
  loadBackup: () => Promise<{ success: boolean; content?: string | null; error?: string }>
  saveAs: (data: string) => Promise<{
    canceled?: boolean
    success?: boolean
    path?: string
    error?: string
  }>
  load: (filePath?: string) => Promise<{
    canceled?: boolean
    success?: boolean
    content?: string
    path?: string
    error?: string
  }>
}

export interface ExportAPI {
  save: (
    fileName: string,
    content: string,
    filters?: { name: string; extensions: string[] }[]
  ) => Promise<{
    canceled?: boolean
    success?: boolean
    path?: string
    error?: string
  }>
}

export interface AppAPI {
  getVersion: () => Promise<string>
  getPaths: () => Promise<{
    userData: string
    workspace: string
    autosave: string
    backup: string
  }>
}

const fileAPI: FileAPI = {
  readText: (filePath) => ipcRenderer.invoke('file:read-text', filePath),
  writeText: (filePath, content) => ipcRenderer.invoke('file:write-text', filePath, content),
  openFile: (filters) => ipcRenderer.invoke('dialog:open-file', filters),
  saveFile: (defaultName, filters) => ipcRenderer.invoke('dialog:save-file', defaultName, filters)
}

const workspaceAPI: WorkspaceAPI = {
  autosave: (data) => ipcRenderer.invoke('workspace:autosave', data),
  loadAutosave: () => ipcRenderer.invoke('workspace:load-autosave'),
  loadBackup: () => ipcRenderer.invoke('workspace:load-backup'),
  saveAs: (data) => ipcRenderer.invoke('workspace:save-as', data),
  load: (filePath) => ipcRenderer.invoke('workspace:load', filePath)
}

const exportAPI: ExportAPI = {
  save: (fileName, content, filters) => ipcRenderer.invoke('export:save', fileName, content, filters)
}

const appAPI: AppAPI = {
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  getPaths: () => ipcRenderer.invoke('app:get-paths')
}

contextBridge.exposeInMainWorld('fileAPI', fileAPI)
contextBridge.exposeInMainWorld('workspaceAPI', workspaceAPI)
contextBridge.exposeInMainWorld('exportAPI', exportAPI)
contextBridge.exposeInMainWorld('appAPI', appAPI)

declare global {
  interface Window {
    fileAPI: FileAPI
    workspaceAPI: WorkspaceAPI
    exportAPI: ExportAPI
    appAPI: AppAPI
  }
}

export type { ClipStatus, ExportOptions, RecoveryOption }
