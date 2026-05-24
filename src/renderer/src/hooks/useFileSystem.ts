import type { ScanFolderResult, OrganizeRequest, OrganizeResult } from '@shared/types'

// 判断是否运行在 Electron 环境中
const isElectron = typeof window !== 'undefined' && !!window.electronAPI

// PIM 嵌入模式时，本地 Agent 服务的地址
const AGENT_BASE_URL = 'http://localhost:18899'

export function useFileSystem() {
  // 选择文件夹
  const selectDirectory = async (): Promise<string | null> => {
    if (isElectron) {
      return window.electronAPI.selectDirectory()
    }
    // PIM 模式：弹出自定义输入框让用户输入路径
    const path = window.prompt('请输入产品图片文件夹的完整路径：')
    return path || null
  }

  // 扫描文件夹
  const scanFolder = async (folderPath: string): Promise<ScanFolderResult> => {
    if (isElectron) {
      return window.electronAPI.scanFolder(folderPath)
    }
    const res = await fetch(`${AGENT_BASE_URL}/scan-folder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderPath }),
    })
    return res.json()
  }

  // 整理文件
  const organizeFiles = async (payload: OrganizeRequest): Promise<OrganizeResult> => {
    if (isElectron) {
      return window.electronAPI.organizeFiles(payload)
    }
    const res = await fetch(`${AGENT_BASE_URL}/organize-files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    return res.json()
  }

  // 打开本地文件夹
  const openPath = async (dirPath: string): Promise<string> => {
    if (isElectron) {
      return window.electronAPI.openPath(dirPath)
    }
    // PIM 模式：通过代理 API 打开
    const res = await fetch(`${AGENT_BASE_URL}/open-path`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dirPath }),
    })
    return res.json()
  }

  return { selectDirectory, scanFolder, organizeFiles, openPath }
}
