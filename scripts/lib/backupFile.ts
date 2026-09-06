import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export interface BackupMemoryEntry {
  key: string
  content: string
  created_at: string
  updated_at: string
}

export interface BackupFile {
  exported_at: string
  memories: BackupMemoryEntry[]
}

export function isBackupFile(value: unknown): value is BackupFile {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  if (typeof v.exported_at !== 'string') return false
  if (!Array.isArray(v.memories)) return false
  return v.memories.every(
    (m) =>
      typeof m === 'object' &&
      m !== null &&
      typeof (m as BackupMemoryEntry).key === 'string' &&
      typeof (m as BackupMemoryEntry).content === 'string' &&
      typeof (m as BackupMemoryEntry).created_at === 'string' &&
      typeof (m as BackupMemoryEntry).updated_at === 'string'
  )
}

export function readBackupFile(path: string): BackupFile {
  const raw = readFileSync(path, 'utf-8')
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`${path} is not valid JSON`)
  }
  if (!isBackupFile(parsed)) {
    throw new Error(`${path} is not a valid backup file (missing exported_at/memories fields)`)
  }
  return parsed
}

export function writeBackupFile(path: string, data: BackupFile): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8')
}
