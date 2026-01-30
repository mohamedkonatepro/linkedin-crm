// Database types
export interface User {
  id: string
  email: string
  name: string | null
  avatar_url: string | null
  linkedin_id: string | null
  linkedin_name: string | null
  linkedin_avatar_url: string | null
  linkedin_connected_at: string | null
  created_at: string
  updated_at: string
}

export interface Contact {
  id: string
  user_id: string
  linkedin_id: string
  name: string
  headline: string | null
  profile_url: string | null
  avatar_url: string | null
  company: string | null
  location: string | null
  tags: string[]
  priority: number
  status: 'active' | 'archived' | 'blocked'
  notes: string | null
  first_contact_at: string | null
  last_contact_at: string | null
  message_count: number
  created_at: string
  updated_at: string
}

export interface Conversation {
  id: string
  user_id: string
  contact_id: string
  linkedin_thread_id: string
  is_starred: boolean
  is_archived: boolean
  is_unread: boolean
  unread_count: number
  last_message_preview: string | null
  last_message_at: string | null
  last_message_from_me: boolean | null
  created_at: string
  updated_at: string
  // Joined
  contact?: Contact
}

export interface Message {
  id: string
  user_id: string
  conversation_id: string
  contact_id: string | null
  linkedin_message_urn: string
  content: string
  content_type: string
  is_from_me: boolean
  is_read: boolean
  sent_at: string
  attachments: any[]
  created_at: string
  synced_at: string
}

export interface Tag {
  id: string
  user_id: string
  name: string
  color: string
  description: string | null
  created_at: string
}

// Extension sync data types
export interface SyncConversation {
  index: number
  linkedinId: string | null
  name: string
  avatarUrl: string | null
  lastMessagePreview: string
  lastMessageTime: string | null
  isActive: boolean
  isStarred: boolean
  threadId: string | null
  lastMessageFromMe?: boolean
}

export interface SyncMessage {
  index: number
  urn: string
  content: string
  isFromMe: boolean
  timestamp: string | null
  sender: {
    linkedinId: string | null
    name: string | null
    avatarUrl: string | null
  }
}

export interface SyncData {
  type: 'full' | 'incremental'
  timestamp: string
  conversations: SyncConversation[]
  currentConversation: {
    name: string | null
    headline: string | null
    linkedinId: string | null
    profileUrl: string | null
  } | null
  messages: SyncMessage[]
}
