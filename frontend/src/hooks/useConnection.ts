import { useEffect, useRef } from 'react'
import { useAppStore } from '../stores/appStore'

const CHECK_INTERVAL = 10000 // 10 seconds

export function useConnection() {
  const { setConnected } = useAppStore()
  const timerRef = useRef<ReturnType<typeof setInterval>>(null)
  const failCountRef = useRef(0)

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/health', { signal: AbortSignal.timeout(3000) })
        if (res.ok) {
          failCountRef.current = 0
          setConnected(true)
        } else {
          throw new Error('not ok')
        }
      } catch {
        failCountRef.current++
        // Only mark disconnected after 2 consecutive failures to avoid flapping
        if (failCountRef.current >= 2) {
          setConnected(false)
        }
      }
    }

    // Immediate first check
    check()
    timerRef.current = setInterval(check, CHECK_INTERVAL)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [setConnected])
}
