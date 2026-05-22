import { ipcMain, dialog } from 'electron'

export function registerSelectDirectoryHandler(): void {
  ipcMain.handle('select-directory', async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      title: '选择产品图片文件夹',
      properties: ['openDirectory'],
      buttonLabel: '选择此文件夹',
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }
    return result.filePaths[0]
  })
}
