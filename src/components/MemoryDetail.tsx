import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'

interface Memory {
  key: string
  content: string
  created_at: string
  updated_at: string
}

export default function MemoryDetail() {
  const { key } = useParams<{ key: string }>()
  const navigate = useNavigate()
  const [memory, setMemory] = useState<Memory | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const decodedKey = key ? decodeURIComponent(key) : ''

  useEffect(() => {
    if (!decodedKey) return
    fetchMemory()
  }, [decodedKey])

  async function fetchMemory() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/memories/${encodeURIComponent(decodedKey)}`)
      if (res.status === 404) {
        setError('記憶が見つかりません')
        return
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: Memory = await res.json()
      setMemory(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load memory')
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await fetch(`/api/memories/${encodeURIComponent(decodedKey)}`, {
        method: 'DELETE',
      })
      if (!res.ok && res.status !== 204) throw new Error(`HTTP ${res.status}`)
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
      setShowDeleteModal(false)
    } finally {
      setDeleting(false)
    }
  }

  function formatDate(iso: string) {
    try {
      return format(new Date(iso), 'yyyy/MM/dd HH:mm', { locale: ja })
    } catch {
      return iso
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
        <div className="error-banner">{error}</div>
        <button className="btn-back" onClick={() => navigate('/')}>← 一覧に戻る</button>
      </div>
    )
  }

  if (!memory) return null

  return (
    <div>
      <div className="card">
        <div className="memory-detail-header">
          <div style={{ flex: 1 }}>
            <div className="memory-detail-key">{memory.key}</div>
            <div className="memory-detail-meta">
              作成: {formatDate(memory.created_at)} ／ 更新: {formatDate(memory.updated_at)}
            </div>
          </div>
          <div className="memory-detail-actions">
            <button className="btn-back" onClick={() => navigate('/')}>← 戻る</button>
            <button
              className="btn-edit"
              onClick={() => navigate(`/memory/${encodeURIComponent(decodedKey)}/edit`)}
            >
              編集
            </button>
            <button className="btn-delete" onClick={() => setShowDeleteModal(true)}>
              削除
            </button>
          </div>
        </div>

        <div className="markdown-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
            {memory.content}
          </ReactMarkdown>
        </div>
      </div>

      {showDeleteModal && (
        <div className="modal-overlay" onClick={() => !deleting && setShowDeleteModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">🗑️ 削除の確認</div>
            <div className="modal-body">
              <code>{memory.key}</code> を削除しますか？<br />
              この操作は元に戻せません。
            </div>
            <div className="modal-actions">
              <button
                className="btn-cancel"
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
              >
                キャンセル
              </button>
              <button className="btn-delete" onClick={handleDelete} disabled={deleting}>
                {deleting ? '削除中...' : '削除する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
