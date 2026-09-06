import { useState } from 'react'

interface FullMemory {
  key: string
  content: string
  created_at: string
  updated_at: string
}

export default function Backup() {
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleExport() {
    setExporting(true)
    setError(null)
    try {
      const res = await fetch('/api/memories?full=true')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const memories: FullMemory[] = await res.json()

      const exportedAt = new Date().toISOString()
      const backup = { exported_at: exportedAt, memories }
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `memory-backup-${exportedAt.replace(/[:.]/g, '-')}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div>
      <div className="card">
        <div className="editor-title">💾 エクスポート</div>
        {error && <div className="error-banner">{error}</div>}
        <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
          全ての記憶をJSONファイルとしてダウンロードします。
        </p>
        <button className="btn-save" onClick={handleExport} disabled={exporting}>
          {exporting ? 'エクスポート中...' : '全件エクスポート'}
        </button>
      </div>
    </div>
  )
}
