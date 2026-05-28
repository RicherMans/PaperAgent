import { create } from 'zustand'
import type { Theme, FontSize } from '../types'

interface AppState {
  // Theme
  theme: Theme
  setTheme: (theme: Theme) => void

  // Font size
  fontSize: FontSize
  setFontSize: (size: FontSize) => void
  cycleFontSize: () => void

  // Current paper
  currentPaperId: string | null
  setCurrentPaperId: (id: string | null) => void

  // Streaming state
  isStreaming: boolean
  setIsStreaming: (v: boolean) => void
  streamBuffer: string
  appendToStreamBuffer: (chunk: string) => void
  clearStreamBuffer: () => void

  // New paper pending stream (summary being generated)
  pendingPaperId: string | null
  pendingSummary: string
  pendingError: string | null
  setPendingPaperId: (id: string | null) => void
  appendPendingSummary: (chunk: string) => void
  setPendingError: (err: string | null) => void
  clearPending: () => void

  // Modal state
  isNewPaperOpen: boolean
  setNewPaperOpen: (v: boolean) => void
  isSettingsOpen: boolean
  setSettingsOpen: (v: boolean) => void

  // Input
  inputValue: string
  setInputValue: (v: string) => void
}

// --- Theme ---

function getInitialTheme(): Theme {
  const stored = localStorage.getItem('paperpaper-theme')
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  return 'system'
}

function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'dark') {
    root.classList.add('dark')
  } else if (theme === 'light') {
    root.classList.remove('dark')
  } else {
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      root.classList.add('dark')
    } else {
      root.classList.remove('dark')
    }
  }
}

// --- Font size ---

const FONT_SIZES: Record<FontSize, string> = {
  small: '14px',
  medium: '17px',
  large: '20px',
}

const FONT_CYCLE: FontSize[] = ['small', 'medium', 'large']

function getInitialFontSize(): FontSize {
  const stored = localStorage.getItem('paperpaper-font-size')
  if (stored === 'small' || stored === 'medium' || stored === 'large') return stored
  return 'medium'
}

function applyFontSize(size: FontSize) {
  const root = document.documentElement
  root.style.setProperty('--paper-font-size', FONT_SIZES[size])
}

export const useAppStore = create<AppState>((set) => ({
  theme: getInitialTheme(),
  setTheme: (theme) => {
    localStorage.setItem('paperpaper-theme', theme)
    applyTheme(theme)
    set({ theme })
  },

  fontSize: getInitialFontSize(),
  setFontSize: (size) => {
    localStorage.setItem('paperpaper-font-size', size)
    applyFontSize(size)
    set({ fontSize: size })
  },
  cycleFontSize: () => {
    const current = useAppStore.getState().fontSize
    const idx = FONT_CYCLE.indexOf(current)
    const next = FONT_CYCLE[(idx + 1) % FONT_CYCLE.length]
    useAppStore.getState().setFontSize(next)
  },

  currentPaperId: null,
  setCurrentPaperId: (id) => set({ currentPaperId: id }),

  isStreaming: false,
  setIsStreaming: (v) => set({ isStreaming: v }),
  streamBuffer: '',
  appendToStreamBuffer: (chunk) => set((s) => ({ streamBuffer: s.streamBuffer + chunk })),
  clearStreamBuffer: () => set({ streamBuffer: '' }),

  pendingPaperId: null,
  pendingSummary: '',
  pendingError: null,
  setPendingPaperId: (id) => set({ pendingPaperId: id, pendingSummary: '', pendingError: null }),
  appendPendingSummary: (chunk) => set((s) => ({ pendingSummary: s.pendingSummary + chunk })),
  setPendingError: (err) => set({ pendingError: err }),
  clearPending: () => set({ pendingPaperId: null, pendingSummary: '', pendingError: null }),

  isNewPaperOpen: false,
  setNewPaperOpen: (v) => set({ isNewPaperOpen: v }),
  isSettingsOpen: false,
  setSettingsOpen: (v) => set({ isSettingsOpen: v }),

  inputValue: '',
  setInputValue: (v) => set({ inputValue: v }),
}))

// Apply initial values
applyTheme(getInitialTheme())
applyFontSize(getInitialFontSize())

if (typeof window !== 'undefined') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const current = useAppStore.getState().theme
    if (current === 'system') applyTheme('system')
  })
}
