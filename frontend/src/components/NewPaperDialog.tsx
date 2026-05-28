import { useState, useRef } from 'react'
import { X, Link, Loader2 } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

export function NewPaperDialog() {
  const {
    isNewPaperOpen, setNewPaperOpen,
    setCurrentPaperId,
    setPendingPaperId, appendPendingSummary, setPendingError, clearPending,
  } = useAppStore()
  const qc = useQueryClient()
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  if (!isNewPaperOpen) return null

  const handleSubmit = async () => {
    const trimmed = url.trim()
    if (!trimmed || loading) return

    setLoading(true)
    setError(null)

    const controller = new AbortController()
    abortRef.current = controller

    // Timeout: abort if stream doesn't complete within 60s
    const timeoutId = setTimeout(() => controller.abort(), 60000)

    try {
      const res = await fetch('/api/papers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error((errData as { error?: string }).error || `HTTP ${res.status}`)
      }

      const contentType = res.headers.get('content-type') || ''

      if (contentType.includes('text/event-stream')) {
        // SSE stream from handleNewPaper
        const reader = res.body?.getReader()
        if (!reader) throw new Error('No response body')

        const decoder = new TextDecoder()
        let buffer = ''
        let paperId = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            const trimmedLine = line.trim()
            if (!trimmedLine.startsWith('data: ')) continue

            const jsonStr = trimmedLine.slice(6)
            try {
              const evt = JSON.parse(jsonStr)

              switch (evt.type) {
                case 'created':
                  // Paper ID received! Close dialog, show ChatView
                  if (evt.paper_id) {
                    paperId = evt.paper_id
                    setPendingPaperId(paperId)
                    setCurrentPaperId(paperId) // triggers ChatView to render
                    setNewPaperOpen(false)
                    setUrl('')
                    qc.invalidateQueries({ queryKey: ['papers'] })
                  }
                  break
                case 'chunk':
                  // Append to the pending summary (ChatView reads from store)
                  if (evt.content) {
                    appendPendingSummary(evt.content)
                  }
                  break
                case 'title':
                  // Title extracted — update the paper list
                  if (paperId) {
                    // Invalidate papers list so it refetches with new title
                    qc.invalidateQueries({ queryKey: ['papers'] })
                    // Also update cached paper detail
                    qc.invalidateQueries({ queryKey: ['paper', paperId] })
                  }
                  break
                case 'done':
                  // Summary complete - ChatView will refetch
                  clearPending()
                  break
                case 'error':
                  setPendingError(evt.error || 'Unknown error')
                  break
              }
            } catch { /* skip */ }
          }
        }
      } else {
        // Plain JSON response
        const data = await res.json()
        if (data.id) {
          qc.invalidateQueries({ queryKey: ['papers'] })
          setCurrentPaperId(data.id)
          setNewPaperOpen(false)
          setUrl('')
          toast.success('论文已加载')
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return
      const msg = err instanceof Error ? err.message : '加载失败'
      setError(msg)
      toast.error(msg)
    } finally {
      clearTimeout(timeoutId)
      setLoading(false)
      abortRef.current = null
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading) handleSubmit()
    else if (e.key === 'Escape') setNewPaperOpen(false)
  }

  const handleClose = () => {
    if (loading && abortRef.current) {
      abortRef.current.abort()
    }
    setNewPaperOpen(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Link size={16} /> 新建论文
          </h2>
          <button onClick={handleClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
            <X size={16} />
          </button>
        </div>

        <div className="p-4">
          <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1.5">
            输入论文 URL（支持 arXiv 链接）
          </label>
          <input
            type="text"
            value={url}
            onChange={(e) => { setUrl(e.target.value); setError(null) }}
            onKeyDown={handleKeyDown}
            placeholder="https://arxiv.org/abs/..."
            autoFocus
            disabled={loading}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />
          {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={handleClose} className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800">
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading || !url.trim()}
              className="px-3 py-1.5 text-sm rounded-lg bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white flex items-center gap-1.5"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              {loading ? '加载中...' : '加载'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
