import { Type } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import type { FontSize } from '../types'

const LABELS: Record<FontSize, string> = {
  small: '小',
  medium: '中',
  large: '大',
}

export function FontSizeButton() {
  const { fontSize, cycleFontSize } = useAppStore()

  return (
    <button
      onClick={cycleFontSize}
      className="flex items-center gap-1 px-1.5 py-0.5 text-xs rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors"
      title={`字体大小: ${LABELS[fontSize]}（点击切换）`}
    >
      <Type size={13} />
      <span className="tabular-nums">{LABELS[fontSize]}</span>
    </button>
  )
}
