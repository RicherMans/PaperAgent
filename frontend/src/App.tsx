import { useEffect } from 'react'
import { Toaster } from 'sonner'
import { PaperList } from './components/PaperList'
import { ChatView } from './components/ChatView'
import { InputBox } from './components/InputBox'
import { ErrorBoundary } from './components/ErrorBoundary'
import { NewPaperDialog } from './components/NewPaperDialog'
import { SettingsDialog } from './components/SettingsDialog'
import { useAppStore, applyTheme } from './stores/appStore'

export default function App() {
  // Clean up theme matchMedia listener on unmount
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      const current = useAppStore.getState().theme
      if (current === 'system') applyTheme('system')
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return (
    <div className="h-screen flex flex-col bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      <div className="flex-1 flex min-h-0">
        {/* Left sidebar */}
        <PaperList />

        {/* Right content area */}
        <div className="flex-1 flex flex-col min-w-0">
          <ErrorBoundary>
            <ChatView />
            <InputBox />
          </ErrorBoundary>
        </div>
      </div>

      {/* Modals */}
      <NewPaperDialog />
      <SettingsDialog />

      {/* Toast notifications */}
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            fontSize: '0.875rem',
            borderRadius: '0.5rem',
          },
        }}
      />
    </div>
  )
}
