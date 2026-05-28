import { useEffect, useRef, useCallback, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import remarkGfm from 'remark-gfm'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'
import { RefreshCw } from 'lucide-react'
import { usePaper } from '../hooks/usePapers'
import { useSSE } from '../hooks/useSSE'
import { useAppStore } from '../stores/appStore'
import { MessageBubble } from './MessageBubble'
import { ScrollButtons } from './ScrollButtons'
import { FontSizeButton } from './FontSizeButton'
import type { Message } from '../types'

const remarkPlugins = [remarkMath, remarkGfm]
const rehypePlugins = [rehypeKatex, rehypeHighlight]

function StreamRenderer({ content }: { content: string }) {
  return (
    <div className="markdown-body text-sm leading-relaxed">
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins}>
        {content}
      </ReactMarkdown>
    </div>
  )
}

export function ChatView() {
  const {
    currentPaperId,
    pendingPaperId, pendingSummary, pendingError, clearPending,
  } = useAppStore()
  const { data: paper, isLoading, refetch } = usePaper(currentPaperId)
  const { streamRequest } = useSSE()
  const containerRef = useRef<HTMLDivElement>(null)
  const [streamingContent, setStreamingContent] = useState('')
  const [isStreamingLocal, setIsStreamingLocal] = useState(false)
  const [streamError, setStreamError] = useState<string | null>(null)
  const [retryingSummary, setRetryingSummary] = useState(false)
  const [retrySummaryContent, setRetrySummaryContent] = useState('')
  const [retryingRound, setRetryingRound] = useState<number | null>(null)
  // Track which round the current stream is answering
  const answeringRound = useRef<number | null>(null)
  const userScrolledUp = useRef(false)
  const isAutoScrolling = useRef(false)

  const isPending = pendingPaperId === currentPaperId

  // Paper has content but no summary — not currently loading or pending
  const needsSummaryRetry = !isLoading && !isPending && !retryingSummary && paper && !paper.initial_summary

  const scrollToBottom = useCallback(() => {
    if (containerRef.current) {
      isAutoScrolling.current = true
      containerRef.current.scrollTop = containerRef.current.scrollHeight
      userScrolledUp.current = false
      requestAnimationFrame(() => { isAutoScrolling.current = false })
    }
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const handleScroll = () => {
      if (isAutoScrolling.current) return
      const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60
      if (isNearBottom) {
        userScrolledUp.current = false
      } else if (isStreamingLocal || isPending) {
        userScrolledUp.current = true
      }
    }
    el.addEventListener('scroll', handleScroll, { passive: true })
    return () => el.removeEventListener('scroll', handleScroll)
  }, [isStreamingLocal, isPending])

  useEffect(() => {
    if (!isStreamingLocal && !isPending && !retryingSummary && retryingRound === null) {
      scrollToBottom()
    }
  }, [paper?.messages?.length, scrollToBottom, isStreamingLocal, isPending, retryingSummary, retryingRound])

  useEffect(() => {
    if ((isStreamingLocal || isPending) && !userScrolledUp.current) {
      scrollToBottom()
    }
  }, [streamingContent, pendingSummary, scrollToBottom, isStreamingLocal, isPending])

  // Auto-scroll during retry-summary stream
  useEffect(() => {
    if (retryingSummary && !userScrolledUp.current) {
      scrollToBottom()
    }
  }, [retrySummaryContent, scrollToBottom, retryingSummary])

  const refetchPaperRef = useRef(refetch)
  refetchPaperRef.current = refetch
  useEffect(() => {
    if (pendingPaperId === null && currentPaperId && paper && !paper.initial_summary) {
      refetchPaperRef.current()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPaperId])

  const handleSendQuestion = useCallback(async (question: string) => {
    if (!currentPaperId || isStreamingLocal) return

    setStreamingContent('')
    setIsStreamingLocal(true)
    setStreamError(null)
    userScrolledUp.current = false

    // Determine the round for this question
    const nextRound = (paper?.messages?.length ?? 0) > 0
      ? Math.max(...paper!.messages.map(m => m.round_number), 0) + 1
      : 1
    answeringRound.current = nextRound

    await streamRequest(`/api/papers/${currentPaperId}/chat`, { question }, {
      onChunk: (content) => setStreamingContent((prev) => prev + content),
      onDone: () => {
        setIsStreamingLocal(false)
        setStreamingContent('')
        answeringRound.current = null
        refetch()
      },
      onError: (error) => {
        setStreamError(error)
        setIsStreamingLocal(false)
      },
    })
  }, [currentPaperId, isStreamingLocal, streamRequest, refetch, paper?.messages])

  const handleRetrySummary = useCallback(async () => {
    if (!currentPaperId) return

    setRetryingSummary(true)
    setRetrySummaryContent('')
    userScrolledUp.current = false

    await streamRequest(`/api/papers/${currentPaperId}/retry-summary`, {}, {
      onChunk: (content) => setRetrySummaryContent((prev) => prev + content),
      onDone: () => {
        setRetryingSummary(false)
        setRetrySummaryContent('')
        refetch()
      },
      onError: (error) => {
        setRetryingSummary(false)
        setRetrySummaryContent('')
        setStreamError(error)
      },
    })
  }, [currentPaperId, streamRequest, refetch])

  const handleRetryChat = useCallback(async (round: number) => {
    if (!currentPaperId) return

    setRetryingRound(round)
    setStreamingContent('')
    setStreamError(null)
    userScrolledUp.current = false

    await streamRequest(`/api/papers/${currentPaperId}/chat/${round}/retry`, {}, {
      onChunk: (content) => setStreamingContent((prev) => prev + content),
      onDone: () => {
        setRetryingRound(null)
        setStreamingContent('')
        refetch()
      },
      onError: (error) => {
        setStreamError(error)
        setRetryingRound(null)
      },
    })
  }, [currentPaperId, streamRequest, refetch])

  const setSendQuestion = useAppStore((s) => s.setSendQuestion)
  useEffect(() => {
    setSendQuestion(() => handleSendQuestion)
    return () => setSendQuestion(null)
  }, [handleSendQuestion, setSendQuestion])

  // Find last user round without an assistant answer (for retry)
  const lastUnansweredRound = useRef<number | null>(null)
  if (paper && !isStreamingLocal && !retryingSummary && retryingRound === null) {
    const msgs = paper.messages
    if (msgs.length > 0 && msgs[msgs.length - 1].role === 'user') {
      lastUnansweredRound.current = msgs[msgs.length - 1].round_number
    } else {
      lastUnansweredRound.current = null
    }
  }

  // --- Empty state ---
  if (!currentPaperId) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-600">
        <div className="text-center">
          <div className="text-5xl mb-4">📄</div>
          <p className="text-lg">选择一篇论文开始阅读</p>
          <p className="text-sm mt-1">点击左侧论文列表，或创建新论文</p>
        </div>
      </div>
    )
  }

  // --- Loading skeleton ---
  if (isLoading && !isPending) {
    return (
      <div className="flex-1 flex flex-col gap-4 p-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-3 animate-pulse">
            <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-800 flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-3/4" />
              <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-1/2" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  // --- Build message list ---
  const allMessages: (Message & { isInitial?: boolean })[] = []

  if (paper?.initial_summary) {
    allMessages.push({
      round_number: 0,
      role: 'assistant',
      content: paper.initial_summary,
      token_count: 0,
      isInitial: true,
    })
  }

  if (paper) {
    for (const msg of paper.messages.filter(m => m.round_number !== 0)) {
      allMessages.push(msg)
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 relative">
      {/* Title bar */}
      <div className="flex-shrink-0 px-4 py-2 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 flex items-center gap-2">
        <h2 className="text-sm font-medium truncate flex-1">
          {paper?.title || '加载中...'}
        </h2>
        <FontSizeButton />
        {paper?.source_url && (
          <a href={paper.source_url} target="_blank" rel="noopener noreferrer"
            className="text-xs text-blue-500 dark:text-blue-400 hover:underline truncate max-w-[200px]">
            {paper.source_url.length > 40 ? paper.source_url.slice(0, 40) + '...' : paper.source_url}
          </a>
        )}
      </div>

      {/* Messages */}
      <div ref={containerRef} className="flex-1 overflow-y-auto custom-scrollbar">
        {/* PENDING SUMMARY STREAM (from NewPaperDialog SSE) */}
        {isPending && (
          <div className="flex gap-3 px-4 py-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium"
              style={{ backgroundColor: '#dbeafe', color: '#1d4ed8' }}>AI</div>
            <div className="flex-1 min-w-0">
              {pendingSummary ? (
                <StreamRenderer content={pendingSummary} />
              ) : (
                <div className="flex items-center gap-1 py-1">
                  <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  <span className="text-xs text-gray-400 ml-1">正在生成摘要...</span>
                </div>
              )}
              {pendingSummary && (
                <span className="inline-block w-2 h-4 bg-blue-500 animate-pulse ml-0.5 align-middle" />
              )}
            </div>
          </div>
        )}

        {/* RETRY SUMMARY STREAM */}
        {retryingSummary && (
          <div className="flex gap-3 px-4 py-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium"
              style={{ backgroundColor: '#dbeafe', color: '#1d4ed8' }}>AI</div>
            <div className="flex-1 min-w-0">
              {retrySummaryContent ? (
                <StreamRenderer content={retrySummaryContent} />
              ) : (
                <div className="flex items-center gap-1 py-1">
                  <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  <span className="text-xs text-gray-400 ml-1">正在重新生成摘要...</span>
                </div>
              )}
              {retrySummaryContent && (
                <span className="inline-block w-2 h-4 bg-blue-500 animate-pulse ml-0.5 align-middle" />
              )}
            </div>
          </div>
        )}

        {/* COMPLETED MESSAGES */}
        {allMessages.map((msg, idx) => (
          <MessageBubble
            key={`${msg.round_number}-${msg.role}-${idx}`}
            role={msg.role}
            content={msg.content}
            digest={msg.digest}
          />
        ))}

        {/* CHAT STREAM */}
        {(isStreamingLocal || retryingRound !== null) && streamingContent && (
          <MessageBubble role="assistant" content={streamingContent} isStreaming />
        )}
        {(isStreamingLocal && !streamingContent) && (
          <div className="flex gap-3 px-4 py-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium"
              style={{ backgroundColor: '#dbeafe', color: '#1d4ed8' }}>AI</div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}

        {/* NEEDS SUMMARY RETRY */}
        {needsSummaryRetry && !retryingSummary && (
          <div className="px-4 py-6 flex flex-col items-center gap-3">
            <p className="text-sm text-gray-400">摘要生成未完成，点击重新生成</p>
            <button
              onClick={handleRetrySummary}
              className="px-4 py-2 text-sm rounded-lg bg-blue-500 hover:bg-blue-600 text-white flex items-center gap-1.5"
            >
              <RefreshCw size={14} /> 重新生成摘要
            </button>
          </div>
        )}

        {/* ERRORS */}
        {(streamError || pendingError) && (
          <div className="px-4 py-3">
            <div className="text-sm text-red-500 bg-red-50 dark:bg-red-950/30 rounded-lg p-3 flex items-center gap-2 flex-wrap">
              <span>⚠️ {streamError || pendingError}</span>
              <div className="flex gap-2 ml-auto">
                {lastUnansweredRound.current !== null && !retryingSummary && (
                  <button
                    onClick={() => handleRetryChat(lastUnansweredRound.current!)}
                    className="underline hover:no-underline text-blue-500 flex items-center gap-1"
                  >
                    <RefreshCw size={12} /> 重试
                  </button>
                )}
                <button onClick={() => { setStreamError(null); clearPending() }}
                  className="underline hover:no-underline">关闭</button>
              </div>
            </div>
          </div>
        )}

        <div className="h-4" />
      </div>

      <ScrollButtons containerRef={containerRef} />
    </div>
  )
}
