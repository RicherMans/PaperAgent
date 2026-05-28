import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Command } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { useExportPaper } from '../hooks/usePapers'
import { toast } from 'sonner'

interface Command {
  name: string
  description: string
  action: () => void
}

export function InputBox() {
  const { currentPaperId, isStreaming, inputValue, setInputValue, setSettingsOpen } = useAppStore()
  const exportPaper = useExportPaper()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [showCommands, setShowCommands] = useState(false)
  const [selectedCmdIdx, setSelectedCmdIdx] = useState(0)

  const commands: Command[] = [
    {
      name: '/export',
      description: '导出到 Obsidian',
      action: async () => {
        if (!currentPaperId) return
        try {
          const result = await exportPaper.mutateAsync(currentPaperId)
          toast.success(`已导出到 ${result.path}`)
        } catch (err) {
          toast.error(err instanceof Error ? err.message : '导出失败')
        }
      },
    },
    {
      name: '/config',
      description: '打开设置',
      action: () => setSettingsOpen(true),
    },
    {
      name: '/help',
      description: '显示帮助',
      action: () => toast('可用命令: /export /config /help', { duration: 5000 }),
    },
  ]

  // Detect / command
  const filteredCommands = inputValue.startsWith('/')
    ? commands.filter((c) => c.name.startsWith(inputValue.trim()))
    : []

  useEffect(() => {
    if (inputValue.startsWith('/') && filteredCommands.length > 0) {
      setShowCommands(true)
      setSelectedCmdIdx(0)
    } else {
      setShowCommands(false)
    }
  }, [inputValue, filteredCommands.length])

  // Auto-resize textarea
  useEffect(() => {
    const el = inputRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 120) + 'px'
    }
  }, [inputValue])

  const handleSend = useCallback(() => {
    const trimmed = inputValue.trim()
    if (!trimmed || isStreaming || !currentPaperId) return

    // Check if it's a command
    if (trimmed.startsWith('/')) {
      const cmd = commands.find((c) => c.name === trimmed)
      if (cmd) {
        cmd.action()
        setInputValue('')
        return
      }
    }

    // Regular question - send to chat
    const sendFn = (window as unknown as Record<string, unknown>).__paperpaper_send as ((q: string) => void) | undefined
    if (sendFn) {
      sendFn(trimmed)
      setInputValue('')
    }
  }, [inputValue, isStreaming, currentPaperId, setInputValue])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showCommands) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedCmdIdx((i) => (i + 1) % filteredCommands.length)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedCmdIdx((i) => (i - 1 + filteredCommands.length) % filteredCommands.length)
      } else if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault()
        const cmd = filteredCommands[selectedCmdIdx]
        if (cmd) {
          setInputValue(cmd.name)
          setShowCommands(false)
        }
      } else if (e.key === 'Escape') {
        setShowCommands(false)
      }
      return
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (!currentPaperId) return null

  return (
    <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-3 relative">
      {/* Command autocomplete */}
      {showCommands && (
        <div className="absolute bottom-full left-3 right-3 mb-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden z-50">
          {filteredCommands.map((cmd, idx) => (
            <div
              key={cmd.name}
              className={`px-3 py-2 text-sm cursor-pointer flex items-center gap-2 ${
                idx === selectedCmdIdx
                  ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-700'
              }`}
              onClick={() => {
                setInputValue(cmd.name)
                setShowCommands(false)
                inputRef.current?.focus()
              }}
            >
              <Command size={14} className="text-gray-400" />
              <span className="font-medium">{cmd.name}</span>
              <span className="text-gray-400 text-xs">{cmd.description}</span>
            </div>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="flex items-end gap-2">
        <textarea
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isStreaming ? '正在生成回复...' : '输入问题，Shift+Enter 换行。输入 / 查看命令...'}
          disabled={isStreaming}
          rows={1}
          className="flex-1 resize-none bg-gray-100 dark:bg-gray-900 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 placeholder-gray-400 disabled:opacity-50"
        />
        <button
          onClick={handleSend}
          disabled={isStreaming || !inputValue.trim()}
          className="flex-shrink-0 p-2 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white transition-colors"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  )
}
