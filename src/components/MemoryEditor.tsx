import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'

interface Props {
  mode: 'create' | 'edit'
}

export default function MemoryEditor({ mode }: Props) {
  const { key } = useParams<{ key: string }>()
  const navigate = useNavigate()
  const decodedKey = key ? decodeURIComponent(key) : ''

  const [memoryKey, setMemoryKey] = useState(mode === 'edit' ? decodedKey : '')
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(mode === 'edit')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (mode === 'edit' && decodedKey) {
      fetchMemory()
    }
  }, [mode, decodedKey])

  async function fetchMemory() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/memories/${encodeURIComponent(decodedKey)}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setContent(data.content || '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load memory')
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!memoryKey.trim()) {
      setError('キーを入力してください')
      return
    }
    if (!content.trim()) {
      setError('内容を入力してください')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const encodedKey = encodeURIComponent(memoryKey.trim())
      const method = mode === 'edit' ? 'PUT' : 'POST'
      const res = await fetch(`/api/memories/${encodedKey}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.trim() }),
      })

      if (res.status === 409) {
        setError('そのキーはすでに存在します。別のキーを使用してください。')
        return
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      navigate(`/memory/${encodedKey}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    if (mode === 'edit' && decodedKey) {
      navigate(`/memory/${encodeURIComponent(decodedKey)}`)
    } else {
      navigate('/')
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

  return (
    <div className="card">
      <div className="editor-header">
        <div className="editor-title">
          {mode === 'create' ? '🆕 新規メモリ作成' : '✏️ メモリを編集'}
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="form-group">
        <label className="form-label" htmlFor="memory-key">キー</label>
        <input
          id="memory-key"
          type="text"
          className="form-input"
          value={memoryKey}
          onChange={(e) => setMemoryKey(e.target.value)}
          placeholder="例: memory_profile_tech"
          disabled={mode === 'edit' || saving}
          readOnly={mode === 'edit'}
        />
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="memory-content">内容（Markdown）</label>
        <textarea
          id="memory-content"
          className="form-textarea"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Markdown で記述できます..."
          disabled={saving}
        />
      </div>

      <div className="editor-actions">
        <button className="btn-cancel" onClick={handleCancel} disabled={saving}>
          キャンセル
        </button>
        <button className="btn-save" onClick={handleSave} disabled={saving}>
          {saving ? '保存中...' : mode === 'create' ? '作成する' : '保存する'}
        </button>
      </div>
    </div>
  )
}
