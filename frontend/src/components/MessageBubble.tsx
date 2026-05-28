import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import remarkGfm from 'remark-gfm'
import rehypeKatex from 'rehype-katex'
import rehypeHighlight from 'rehype-highlight'

interface MessageBubbleProps {
  role: 'user' | 'assistant'
  content: string
  digest?: string
  isStreaming?: boolean
}

export function MessageBubble({ role, content, digest, isStreaming }: MessageBubbleProps) {
  return (
    <div className={`flex gap-3 px-4 py-3 ${role === 'user' ? 'bg-gray-50 dark:bg-gray-900/50' : ''}`}>
      {/* Avatar */}
      <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium mt-0.5"
        style={role === 'user'
          ? { backgroundColor: '#e0e7ff', color: '#4338ca' }
          : { backgroundColor: '#dbeafe', color: '#1d4ed8' }
        }
      >
        {role === 'user' ? '你' : 'AI'}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {digest && role === 'user' && (
          <div className="text-xs text-gray-400 dark:text-gray-500 mb-1">{digest}</div>
        )}
        <div className="markdown-body leading-relaxed">
          <ReactMarkdown
            remarkPlugins={[remarkMath, remarkGfm]}
            rehypePlugins={[rehypeKatex, rehypeHighlight]}
          >
            {content}
          </ReactMarkdown>
        </div>
        {isStreaming && (
          <span className="inline-block w-2 h-4 bg-blue-500 dark:bg-blue-400 animate-pulse ml-0.5 align-middle" />
        )}
      </div>
    </div>
  )
}
