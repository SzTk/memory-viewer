import { useState, type ChangeEvent } from 'react'
import type { Change } from 'diff'
import {
  BackupFile,
  FullMemory,
  MemoryDiffResult,
  isBackupFile,
  computeMemoryDiffs,
  computeLineDiff,
} from '../lib/backupDiff'

export default function Backup() {
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [diffResults, setDiffResults] = useState<MemoryDiffResult[] | null>(null)
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [loadingDiff, setLoadingDiff] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [restoreResults, setRestoreResults] = useState<Record<string, 'ok' | 'error'> | null>(null)

  async function handleExport() {
    setExporting(true)
    setError(null)
    let url: string | null = null
    try {
      const res = await fetch('/api/memories?full=true')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const memories: FullMemory[] = await res.json()

      const exportedAt = new Date().toISOString()
      const backup: BackupFile = { exported_at: exportedAt, memories }
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
      url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `memory-backup-${exportedAt.replace(/[:.]/g, '-')}.json`
      a.click()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export')
    } finally {
      if (url) URL.revokeObjectURL(url)
      setExporting(false)
    }
  }

  async function handleFileSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setError(null)
    setDiffResults(null)
    setSelectedKeys(new Set())
    setRestoreResults(null)
    setLoadingDiff(true)

    try {
      const text = await file.text()
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        throw new Error('ファイルが正しいJSON形式ではありません')
      }
      if (!isBackupFile(parsed)) {
        throw new Error('バックアップファイルの形式が正しくありません')
      }

      const res = await fetch('/api/memories?full=true')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const current: FullMemory[] = await res.json()

      setDiffResults(computeMemoryDiffs(parsed.memories, current))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read backup file')
    } finally {
      setLoadingDiff(false)
    }
  }

  function toggleKey(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function handleRestore() {
    if (!diffResults) return
    setRestoring(true)
    setError(null)
    const results: Record<string, 'ok' | 'error'> = {}

    for (const result of diffResults) {
      if (!selectedKeys.has(result.key)) continue
      try {
        const method = result.status === 'deleted' ? 'POST' : 'PUT'
        const res = await fetch(`/api/memories/${encodeURIComponent(result.key)}`, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: result.backupContent }),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        results[result.key] = 'ok'
      } catch {
        results[result.key] = 'error'
      }
    }

    setRestoreResults(results)
    setRestoring(false)
  }

  function renderDiff(parts: Change[]) {
    return (
      <pre className="diff-view">
        {parts.map((part, i) => {
          const cls = part.added ? 'diff-added' : part.removed ? 'diff-removed' : 'diff-unchanged'
          const prefix = part.added ? '+' : part.removed ? '-' : ' '
          const lines = part.value
            .split('\n')
            .filter((line, idx, arr) => !(idx === arr.length - 1 && line === ''))
          return lines.map((line, j) => (
            <div key={`${i}-${j}`} className={cls}>
              {prefix} {line}
            </div>
          ))
        })}
      </pre>
    )
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="editor-title">💾 エクスポート</div>
        {error && <div className="error-banner">{error}</div>}
        <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
          全ての記憶をJSONファイルとしてダウンロードします。
        </p>
        <button className="btn-save" onClick={handleExport} disabled={exporting}>
          {exporting ? 'エクスポート中...' : '全件エクスポート'}
        </button>
      </div>

      <div className="card">
        <div className="editor-title">♻️ 復元</div>
        <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
          バックアップファイルをアップロードして、個別に記憶を復元できます。
        </p>
        <input type="file" accept="application/json" onChange={handleFileSelect} disabled={loadingDiff} />

        {loadingDiff && (
          <div className="loading">
            <div className="spinner" />
            差分を確認中...
          </div>
        )}

        {diffResults && (
          <div style={{ marginTop: '1rem' }}>
            {diffResults.map((result) => (
              <div key={result.key} className="restore-row">
                <label className="restore-row-header">
                  <input
                    type="checkbox"
                    checked={selectedKeys.has(result.key)}
                    onChange={() => toggleKey(result.key)}
                  />
                  <span className="memory-item-key">{result.key}</span>
                  <span className={`restore-status restore-status-${result.status}`}>
                    {result.status === 'identical' && '変更なし'}
                    {result.status === 'changed' && '変更あり'}
                    {result.status === 'deleted' && '現在は存在しません（新規作成されます）'}
                  </span>
                  {restoreResults?.[result.key] === 'ok' && (
                    <span className="success-banner" style={{ padding: '0.15rem 0.5rem' }}>
                      復元しました
                    </span>
                  )}
                  {restoreResults?.[result.key] === 'error' && (
                    <span className="error-banner" style={{ padding: '0.15rem 0.5rem' }}>
                      失敗しました
                    </span>
                  )}
                </label>
                {result.status !== 'identical' && (
                  <details>
                    <summary>差分を表示</summary>
                    {renderDiff(computeLineDiff(result.currentContent ?? '', result.backupContent))}
                  </details>
                )}
              </div>
            ))}

            <button
              className="btn-save"
              style={{ marginTop: '1rem' }}
              onClick={handleRestore}
              disabled={restoring || selectedKeys.size === 0}
            >
              {restoring ? '復元中...' : `選択した${selectedKeys.size}件を復元`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
