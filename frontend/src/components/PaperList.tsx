import { Plus, Trash2, MoreHorizontal, Download } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'
import { usePaperList, useDeletePaper, useExportPaper } from '../hooks/usePapers'
import { useAppStore } from '../stores/appStore'
import { toast } from 'sonner'

export function PaperList() {
  const { data: papers, isLoading, isError, refetch } = usePaperList()
  const deletePaper = useDeletePaper()
  const exportPaper = useExportPaper()
  const { currentPaperId, setCurrentPaperId, setNewPaperOpen } = useAppStore()
  const [menuOpen, setMenuOpen] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleDelete = async (id: string) => {
    try {
      await deletePaper.mutateAsync(id)
      toast.success('论文已删除')
      if (currentPaperId === id) setCurrentPaperId(null)
    } catch {
      toast.error('删除失败')
    }
    setMenuOpen(null)
  }

  const handleExport = async (id: string) => {
    try {
      const result = await exportPaper.mutateAsync(id)
      toast.success(`已导出到 ${result.path}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '导出失败')
    }
    setMenuOpen(null)
  }

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr)
      const now = new Date()
      const diff = now.getTime() - d.getTime()
      if (diff < 60 * 1000) return '刚刚'
      if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)} 分钟前`
      if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)} 小时前`
      return dateStr
    } catch {
      return dateStr
    }
  }

  return (
    <div className="w-64 flex-shrink-0 border-r border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-950/50 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b border-gray-200 dark:border-gray-800">
        <h1 className="text-sm font-semibold text-gray-700 dark:text-gray-300">📄 论文列表</h1>
        <button
          onClick={() => setNewPaperOpen(true)}
          className="p-1 rounded-md hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
          title="新建论文"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {isLoading && (
          <div className="p-3 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse">
                <div className="h-4 bg-gray-200 dark:bg-gray-800 rounded w-full mb-1.5" />
                <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-1/2" />
              </div>
            ))}
          </div>
        )}

        {isError && (
          <div className="p-3 text-center text-sm text-red-500">
            <p>加载失败</p>
            <button onClick={() => refetch()} className="underline mt-1 text-xs">重试</button>
          </div>
        )}

        {!isLoading && !isError && papers?.length === 0 && (
          <div className="p-6 text-center text-sm text-gray-400 dark:text-gray-600">
            <p>暂无论文</p>
            <p className="text-xs mt-1">点击 + 新建</p>
          </div>
        )}

        {papers?.map((p) => (
          <div
            key={p.id}
            className={`group relative px-3 py-2.5 cursor-pointer transition-colors border-b border-gray-100 dark:border-gray-900 ${
              currentPaperId === p.id
                ? 'bg-blue-50 dark:bg-blue-950/40 border-l-2 border-l-blue-500'
                : 'hover:bg-gray-100 dark:hover:bg-gray-900 border-l-2 border-l-transparent'
            }`}
            onClick={() => setCurrentPaperId(p.id)}
          >
            <div className="text-sm font-medium truncate pr-6 text-gray-800 dark:text-gray-200">
              {p.title || '未命名论文'}
            </div>
            <div className="text-xs text-gray-400 dark:text-gray-600 mt-0.5">
              {formatDate(p.updated_at)}
            </div>

            {/* Three-dot menu container */}
            <div
              className={`absolute right-1 top-1/2 -translate-y-1/2 transition-opacity ${
                menuOpen === p.id
                  ? 'opacity-100'
                  : 'opacity-0 group-hover:opacity-100'
              }`}
            >
              <button
                onClick={(e) => { e.stopPropagation(); setMenuOpen(menuOpen === p.id ? null : p.id) }}
                className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                <MoreHorizontal size={14} />
              </button>

              {menuOpen === p.id && (
                <div
                  ref={menuRef}
                  className="absolute right-0 top-full mt-0.5 w-28 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 z-50"
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); handleExport(p.id) }}
                    className="w-full px-3 py-1.5 text-xs text-left hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-1.5"
                  >
                    <Download size={12} /> 导出
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(p.id) }}
                    className="w-full px-3 py-1.5 text-xs text-left hover:bg-red-50 dark:hover:bg-red-950/30 text-red-500 flex items-center gap-1.5"
                  >
                    <Trash2 size={12} /> 删除
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
