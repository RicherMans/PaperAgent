import { Toaster } from 'sonner'
import { PaperList } from './components/PaperList'
import { ChatView } from './components/ChatView'
import { InputBox } from './components/InputBox'
import { NewPaperDialog } from './components/NewPaperDialog'
import { SettingsDialog } from './components/SettingsDialog'

export default function App() {
  return (
    <div className="h-screen flex flex-col bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      <div className="flex-1 flex min-h-0">
        {/* Left sidebar */}
        <PaperList />

        {/* Right content area */}
        <div className="flex-1 flex flex-col min-w-0">
          <ChatView />
          <InputBox />
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
