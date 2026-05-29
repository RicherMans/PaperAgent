// ---- API Response Types ----

export interface Message {
  round_number: number
  role: 'user' | 'assistant'
  content: string
  digest?: string
  token_count: number
}

export interface Paper {
  id: string
  title: string
  source_url: string
  initial_summary: string
  model_used: string
  rating?: number
  created_at: string
  updated_at: string
  messages: Message[]
}

export interface PaperSummary {
  id: string
  title: string
  rating?: number
  updated_at: string
}

// ---- SSE Event Types ----

export interface SSEEvent {
  type: 'chunk' | 'done' | 'error' | 'title' | 'digest' | 'created'
  content?: string
  error?: string
  paper_id?: string
  title?: string
  digest?: string
  round_id?: number
}

// ---- UI State Types ----

export type Theme = 'light' | 'dark' | 'system'

export type FontSize = 'small' | 'medium' | 'large'
