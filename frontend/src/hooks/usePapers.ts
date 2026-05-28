import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Paper, PaperSummary } from '../types'

const BASE = '/api'

async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }))
    throw new Error((err as { error?: string }).error || `HTTP ${res.status}`)
  }
  return res.json()
}

export function usePaperList() {
  return useQuery({
    queryKey: ['papers'],
    queryFn: () => fetchJSON<PaperSummary[]>(`${BASE}/papers`),
  })
}

export function usePaper(id: string | null) {
  return useQuery({
    queryKey: ['paper', id],
    queryFn: () => fetchJSON<Paper>(`${BASE}/papers/${id}`),
    enabled: !!id,
  })
}

export function useCreatePaper() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { url?: string; content?: string }) =>
      fetchJSON<{ id: string }>(`${BASE}/papers`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['papers'] })
    },
  })
}

export function useDeletePaper() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      fetchJSON(`${BASE}/papers/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['papers'] })
    },
  })
}

export function useDeleteRound() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ paperId, round }: { paperId: string; round: number }) =>
      fetchJSON(`${BASE}/papers/${paperId}/rounds/${round}`, { method: 'DELETE' }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['paper', vars.paperId] })
    },
  })
}

export function useExportPaper() {
  return useMutation({
    mutationFn: (id: string) =>
      fetchJSON<{ status: string; path: string }>(`${BASE}/papers/${id}/export`, {
        method: 'POST',
      }),
  })
}
