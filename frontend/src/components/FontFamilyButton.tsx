import { useAppStore } from '../stores/appStore'

export function FontFamilyButton() {
  const { fontFamily, cycleFontFamily } = useAppStore()

  return (
    <button
      onClick={cycleFontFamily}
      className="flex items-center gap-1 px-1.5 py-0.5 text-xs rounded-md transition-all duration-200 hover:scale-105 active:scale-95"
      style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-ui)' }}
      title={`字体: ${fontFamily === 'serif' ? '衬线体' : '无衬线体'}（点击切换）`}
      aria-label="切换字体"
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
