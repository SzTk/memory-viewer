import { diffLines, Change } from 'diff'

export interface FullMemory {
  key: string
  content: string
  created_at: string
  updated_at: string
}

export interface BackupFile {
  exported_at: string
  memories: FullMemory[]
}

export type MemoryStatus = 'identical' | 'changed' | 'deleted'

export interface MemoryDiffResult {
  key: string
  status: MemoryStatus
  backupContent: string
  currentContent?: string
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
      typeof (m as FullMemory).key === 'string' &&
      typeof (m as FullMemory).content === 'string' &&
      typeof (m as FullMemory).created_at === 'string' &&
      typeof (m as FullMemory).updated_at === 'string'
  )
}

export function computeMemoryDiffs(
  backupMemories: FullMemory[],
  current: FullMemory[]
): MemoryDiffResult[] {
  const currentByKey = new Map(current.map((m) => [m.key, m.content]))
  return backupMemories.map((entry) => {
    const currentContent = currentByKey.get(entry.key)
    if (currentContent === undefined) {
      return { key: entry.key, status: 'deleted', backupContent: entry.content }
    }
    if (currentContent === entry.content) {
      return { key: entry.key, status: 'identical', backupContent: entry.content, currentContent }
    }
    return { key: entry.key, status: 'changed', backupContent: entry.content, currentContent }
  })
}

export function computeLineDiff(currentContent: string, backupContent: string): Change[] {
  return diffLines(currentContent, backupContent)
}
