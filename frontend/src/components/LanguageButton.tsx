import { useTranslation } from 'react-i18next'
import { Languages } from 'lucide-react'

export function LanguageButton() {
  const { i18n } = useTranslation()
  const current = i18n.language === 'en' ? 'en' : 'zh'

  const toggle = () => {
    const next = current === 'zh' ? 'en' : 'zh'
    i18n.changeLanguage(next)
    localStorage.setItem('paperagent-lang', next)
    document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en'
  }

  return (
    <button
      onClick={toggle}
      className="flex items-center gap-1 px-1.5 py-0.5 text-xs rounded-md transition-all duration-200 hover:scale-105 active:scale-95"
      style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-ui)' }}
      title={current === 'zh' ? 'Switch to English' : '切换到中文'}
      aria-label={current === 'zh' ? 'Switch to English' : '切换到中文'}
    >
      <Languages size={13} />
      <span className="tabular-nums">{current === 'zh' ? 'EN' : '中'}</span>
    </button>
  )
}
