import { useTranslation } from 'react-i18next'
import { useAppStore } from '../stores/appStore'

export function FontFamilyButton() {
  const { t } = useTranslation()
  const { fontFamily, cycleFontFamily } = useAppStore()

  const familyLabel = fontFamily === 'serif' ? t('fontFamily.serif') : t('fontFamily.sans')

  return (
    <button
      onClick={cycleFontFamily}
      className="flex items-center gap-1 px-1.5 py-0.5 text-xs rounded-md transition-all duration-200 hover:scale-105 active:scale-95"
      style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-ui)' }}
      title={t('fontFamily.tooltip', { family: familyLabel })}
      aria-label={t('fontFamily.switchFont')}
    >
      <span
        className="leading-none"
        style={{
          fontFamily: fontFamily === 'serif' ? "'Playfair Display', Georgia, serif" : "'Inter', sans-serif",
          fontWeight: 600,
          fontSize: '13px',
        }}
      >
        Aa
      </span>
    </button>
  )
}
