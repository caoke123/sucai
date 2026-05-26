// ==================== Upload Manifest 管理 ====================

import fs from 'fs'
import path from 'path'
import type { UploadManifest, UploadManifestEntry } from '@shared/types'
import { normalizeFilePath } from '@shared/utils/normalizePath'

export function buildManifest(
  taskId: string,
  productNo: string,
  localPackagePath: string,
  folderName: string,
  entryBuilders: Array<{
    type: UploadManifestEntry['type']
    skuCode?: string
    localPath: string
    relativePath: string
    r2Key: string
  }>
): UploadManifest {
  return {
    manifestVersion: 1,
    taskId,
    productNo,
    localPackagePath,
    folderName,
    createdAt: new Date().toISOString(),
    entries: entryBuilders.map((eb, i) => ({
      id: `${taskId}-${i}`,
      type: eb.type,
      skuCode: eb.skuCode,
      localPath: normalizeFilePath(eb.localPath),
      relativePath: eb.relativePath.replace(/\\/g, '/'),
      r2Key: eb.r2Key,
      r2Url: '',
      status: 'pending',
      retryCount: 0,
    })),
  }
}

function manifestPath(packagePath: string): string {
  return path.join(packagePath, 'upload-manifest.json')
}

export function saveManifest(manifest: UploadManifest): void {
  const mp = manifestPath(manifest.localPackagePath)
  const tmp = mp + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(manifest, null, 2), 'utf-8')
  fs.renameSync(tmp, mp)
}

export function loadManifest(packagePath: string): UploadManifest | null {
  try {
    const mp = manifestPath(packagePath)
    if (!fs.existsSync(mp)) return null
    const raw = fs.readFileSync(mp, 'utf-8')
    return JSON.parse(raw) as UploadManifest
  } catch {
    return null
  }
}

export function deleteManifest(packagePath: string): void {
  try {
    const mp = manifestPath(packagePath)
    if (fs.existsSync(mp)) fs.unlinkSync(mp)
  } catch { /* ignore */ }
}

export function updateManifestEntry(
  manifest: UploadManifest,
  entryId: string,
  patch: Partial<UploadManifestEntry>
): void {
  const entry = manifest.entries.find((e) => e.id === entryId)
  if (entry) Object.assign(entry, patch)
}
