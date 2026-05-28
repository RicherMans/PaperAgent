import { useState, useEffect, type RefObject } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'

interface ScrollButtonsProps {
  containerRef: RefObject<HTMLDivElement | null>
}

export function ScrollButtons({ containerRef }: ScrollButtonsProps) {
  const [showButtons, setShowButtons] = useState(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const check = () => {
      const { scrollTop, scrollHeight, clientHeight } = el
      // Show if scrolled away from bottom
      setShowButtons(scrollHeight - scrollTop - clientHeight > 100)
    }

    el.addEventListener('scroll', check)
    return () => el.removeEventListener('scroll', check)
  }, [containerRef])

  const scrollToTop = () => {
    containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const scrollToBottom = () => {
    const el = containerRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }

  if (!showButtons) return null

  return (
    <div className="absolute right-3 bottom-4 flex flex-col gap-1">
      <button
        onClick={scrollToTop}
        className="p-1.5 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        title="回到顶部"
      >
        <ChevronUp size={18} />
      </button>
      <button
        onClick={scrollToBottom}
        className="p-1.5 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        title="滚动到底部"
      >
        <ChevronDown size={18} />
      </button>
    </div>
  )
}
