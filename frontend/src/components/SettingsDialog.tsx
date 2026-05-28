import { useAppStore } from '../stores/appStore'
import { X, Sun, Moon, Monitor } from 'lucide-react'
import type { Theme } from '../types'

const themeOptions: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: '浅色', icon: Sun },
  { value: 'dark', label: '深色', icon: Moon },
  { value: 'system', label: '跟随系统', icon: Monitor },
]

export function SettingsDialog() {
  const { isSettingsOpen, setSettingsOpen, theme, setTheme } = useAppStore()

  if (!isSettingsOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-sm font-semibold">⚙️ 设置</h2>
          <button
            onClick={() => setSettingsOpen(false)}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Theme */}
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-2">外观主题</label>
            <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
              {themeOptions.map((opt) => {
                const Icon = opt.icon
                return (
                  <button
                    key={opt.value}
                    onClick={() => setTheme(opt.value)}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-xs transition-colors ${
                      theme === opt.value
                        ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-900 dark:text-gray-100'
                        : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    <Icon size={14} />
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* API Config Info */}
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-2">API 配置</label>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              API 配置在 <code className="text-pink-500">~/.paperpaper/config.yaml</code>
              {' '}或通过环境变量设置。修改配置后需重启应用。
            </p>
          </div>

          {/* Export Config */}
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-2">Obsidian 导出</label>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              导出路径在配置文件中设置 <code className="text-pink-500">obsidian.vault_path</code>
              {' '}和 <code className="text-pink-500">obsidian.export_folder</code>。
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
