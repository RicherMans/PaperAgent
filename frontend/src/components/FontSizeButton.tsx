import { Type } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../stores/appStore'
import type { FontSize } from '../types'

export function FontSizeButton() {
  const { t } = useTranslation()
  const { fontSize, cycleFontSize } = useAppStore()

  const LABELS: Record<FontSize, string> = {
    small: t('fontSize.small'),
    medium: t('fontSize.medium'),
    large: t('fontSize.large'),
  }

  return (
    <button
      onClick={cycleFontSize}
      className="flex items-center gap-1 px-1.5 py-0.5 text-xs rounded-md transition-all duration-200 hover:scale-105 active:scale-95"
      style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-ui)' }}
      title={t('fontSize.tooltip', { size: LABELS[fontSize] })}
    >
      <Type size={13} />
      <span className="tabular-nums">{LABELS[fontSize]}</span>
    </button>
  )
}
