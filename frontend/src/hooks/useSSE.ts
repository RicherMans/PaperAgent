import { useCallback } from 'react'
import { useAppStore } from '../stores/appStore'
import type { SSEEvent } from '../types'

interface SSEOptions {
  onChunk?: (content: string) => void
  onDone?: (paperId: string) => void
  onError?: (error: string) => void
}

export function useSSE() {
  const { setIsStreaming, appendToStreamBuffer, clearStreamBuffer } = useAppStore()

  const streamRequest = useCallback(async (
    url: string,
    body: unknown,
    options: SSEOptions = {},
  ) => {
    console.log('[SSE] starting stream to', url, 'with body:', body)
    setIsStreaming(true)
    clearStreamBuffer()

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify(body),
      })

      console.log('[SSE] response status:', response.status)

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        const errMsg = (errData as { error?: string }).error || `HTTP ${response.status}`
        console.error('[SSE] error response:', errMsg)
        options.onError?.(errMsg)
        setIsStreaming(false)
        return
      }

      if (!response.body) {
        options.onError?.('No response body')
        setIsStreaming(false)
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          console.log('[SSE] stream ended')
          break
        }

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue

          const jsonStr = trimmed.slice(6)
          try {
            const evt: SSEEvent = JSON.parse(jsonStr)
            switch (evt.type) {
              case 'chunk':
                if (evt.content) {
                  appendToStreamBuffer(evt.content)
                  options.onChunk?.(evt.content)
                }
                break
              case 'done':
                options.onDone?.(evt.paper_id || '')
                break
              case 'error':
                console.error('[SSE] stream error:', evt.error)
                options.onError?.(evt.error || 'Unknown error')
                break
            }
          } catch {
            // Skip unparseable lines (e.g., [DONE])
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Network error'
      console.error('[SSE] fetch error:', msg)
      options.onError?.(msg)
    } finally {
      setIsStreaming(false)
    }
  }, [setIsStreaming, appendToStreamBuffer, clearStreamBuffer])

  return { streamRequest }
}
