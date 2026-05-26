import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { ja } from 'date-fns/locale'

interface MemoryItem {
  key: string
  updated_at: string
  created_at: string
  preview: string
}

export default function MemoryList() {
  const [memories, setMemories] = useState<MemoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchMemories()
  }, [])

  async function fetchMemories() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/memories')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: MemoryItem[] = await res.json()
      setMemories(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load memories')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        読み込み中...
      </div>
    )
  }

  if (error) {
    return (
      <div>
        <div className="error-banner">エラー: {error}</div>
        <button className="btn-back" onClick={fetchMemories}>再試行</button>
      </div>
    )
  }

  return (
    <div>
      <div className="memory-list-header">
        <span className="memory-list-title">すべての記憶</span>
        <span className="memory-count">{memories.length} 件</span>
      </div>

      {memories.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📭</div>
          <p>記憶がありません</p>
          <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
            右上の「+ 新規作成」から追加できます
          </p>
        </div>
      ) : (
        <div className="memory-list">
          {memories.map((m) => (
            <Link key={m.key} to={`/memory/${encodeURIComponent(m.key)}`} className="memory-item">
              <div className="memory-item-key">{m.key}</div>
              <div className="memory-item-meta">
                更新:{' '}
                {m.updated_at
                  ? formatDistanceToNow(new Date(m.updated_at), { addSuffix: true, locale: ja })
                  : '—'}
              </div>
              <div className="memory-item-preview">{m.preview || '(内容なし)'}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
