import { diffLines } from 'diff'
import type { BackupMemoryEntry } from './backupFile'

export type MemoryStatus = 'identical' | 'changed' | 'deleted'

export interface MemoryDiffResult {
  key: string
  status: MemoryStatus
  backupContent: string
  currentContent?: string
}

export function computeMemoryDiffs(
  backupEntries: BackupMemoryEntry[],
  currentByKey: Map<string, string>
): MemoryDiffResult[] {
  return backupEntries.map((entry) => {
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

export function formatLineDiff(currentContent: string, backupContent: string): string {
  const parts = diffLines(currentContent, backupContent)
  return parts
    .map((part) => {
      const prefix = part.added ? '+ ' : part.removed ? '- ' : '  '
      return part.value
        .split('\n')
        .filter((line, i, arr) => !(i === arr.length - 1 && line === ''))
        .map((line) => `${prefix}${line}`)
        .join('\n')
    })
    .join('\n')
}
