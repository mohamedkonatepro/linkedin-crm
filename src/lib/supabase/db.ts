import { createClient } from '@supabase/supabase-js'

// Client Supabase direct (sans SSR) pour les API routes
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey)

// Types
export interface DbConversation {
  id: string
  linkedin_thread_id: string
  contact_linkedin_id: string | null
  contact_name: string
  contact_avatar_url: string | null
  contact_headline: string | null
  is_starred: boolean
  is_read: boolean
  unread_count: number
  last_message_preview: string | null
  last_message_at: string | null
  last_message_from_me: boolean | null
  created_at: string
  updated_at: string
}

export interface DbMessage {
  id: string
  linkedin_message_urn: string
  conversation_id: string | null
  linkedin_thread_id: string
  content: string | null
  is_from_me: boolean
  is_read: boolean
  sent_at: string | null
  attachments: any | null
  created_at: string
}

// Helper pour extraire le thread ID d'un URN
// Handles formats like:
// - "urn:li:msg_conversation:(urn:li:fsd_profile:xxx,2-abc123)"
// - "2-abc123"
// - Full URN without the 2- prefix
export function extractThreadId(urn: string | null): string {
  if (!urn) return ''
  // Try to extract the thread part (e.g., "2-M2EzMzliNzU...")
  const match = urn.match(/2-[A-Za-z0-9_=-]+/)
  if (match) return match[0]
  // If no 2- pattern found, return the last part after the last comma or the whole thing
  const parts = urn.split(',')
  return parts[parts.length - 1].replace(/\)$/, '') || urn
}
