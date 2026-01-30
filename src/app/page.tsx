'use client'

import { useState, useEffect, useCallback } from 'react'
import { useCRMStore } from '@/store'
import { ConversationList } from '@/components/ConversationList'
import { MessageThread } from '@/components/MessageThread'
import { Sidebar } from '@/components/Sidebar'
import { Header } from '@/components/Header'
import { 
  MessageSquare, 
  Users, 
  Settings, 
  Search,
  Menu,
  X
} from 'lucide-react'

export default function Home() {
  const { 
    isSidebarOpen, 
    toggleSidebar,
    selectedConversationId,
    isLoading,
    setConversations,
    setMessages,
    setLoading
  } = useCRMStore()
  
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [lastSync, setLastSync] = useState<string | null>(null)

  // Fetch synced data from API
  const fetchSyncedData = useCallback(async () => {
    try {
      const res = await fetch('/api/sync')
      const json = await res.json()
      
      if (json.ok && json.data) {
        // Transform extension data to CRM format
        const conversations = (json.data.conversations || []).map((conv: any, index: number) => ({
          id: conv.threadId || `conv-${index}`,
          user_id: 'demo',
          contact_id: conv.linkedinId || `contact-${index}`,
          linkedin_thread_id: conv.threadId || `thread-${index}`,
          is_starred: conv.isStarred || false,
          is_archived: false,
          is_unread: !conv.lastMessageFromMe,
          unread_count: conv.lastMessageFromMe ? 0 : 1,
          last_message_preview: conv.lastMessagePreview || '',
          last_message_at: conv.lastMessageTime || new Date().toISOString(),
          last_message_from_me: conv.lastMessageFromMe || false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          contact: {
            id: conv.linkedinId || `contact-${index}`,
            user_id: 'demo',
            linkedin_id: conv.linkedinId || '',
            name: conv.name || 'Unknown',
            headline: '',
            profile_url: conv.linkedinId ? `https://linkedin.com/in/${conv.linkedinId}` : '',
            avatar_url: conv.avatarUrl || null,
            company: null,
            location: null,
            tags: [],
            priority: 0,
            status: 'active' as const,
            notes: null,
            first_contact_at: null,
            last_contact_at: conv.lastMessageTime,
            message_count: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }
        }))
        
        const messages = (json.data.messages || []).map((msg: any, index: number) => ({
          id: msg.urn || `msg-${index}`,
          user_id: 'demo',
          conversation_id: 'current',
          contact_id: msg.sender?.linkedinId || null,
          linkedin_message_urn: msg.urn || `urn-${index}`,
          content: msg.content || '',
          content_type: 'text',
          is_from_me: msg.isFromMe || false,
          is_read: true,
          sent_at: msg.timestamp || new Date().toISOString(),
          attachments: [],
          created_at: new Date().toISOString(),
          synced_at: new Date().toISOString(),
        }))
        
        setConversations(conversations)
        setMessages(messages)
        setLastSync(json.data.timestamp || new Date().toISOString())
      }
    } catch (e) {
      console.error('Failed to fetch synced data:', e)
    }
  }, [setConversations, setMessages])

  // Poll for updates every 5 seconds
  useEffect(() => {
    fetchSyncedData()
    const interval = setInterval(fetchSyncedData, 5000)
    return () => clearInterval(interval)
  }, [fetchSyncedData])

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Header */}
      <Header />
      
      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside 
          className={`
            ${isSidebarOpen ? 'w-64' : 'w-0'} 
            bg-white border-r border-gray-200 
            transition-all duration-300 overflow-hidden
            hidden lg:block
          `}
        >
          <Sidebar />
        </aside>
        
        {/* Conversation list */}
        <div className="w-80 bg-white border-r border-gray-200 flex-shrink-0 hidden md:block">
          <ConversationList />
        </div>
        
        {/* Message thread */}
        <main className="flex-1 flex flex-col bg-gray-50">
          {selectedConversationId ? (
            <MessageThread />
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg">Sélectionne une conversation</p>
                <p className="text-sm mt-2">pour voir les messages</p>
              </div>
            </div>
          )}
        </main>
      </div>
      
      {/* Mobile menu overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}
      
      {/* Mobile sidebar */}
      <div 
        className={`
          fixed inset-y-0 left-0 w-64 bg-white z-50 transform transition-transform
          lg:hidden
          ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="flex items-center justify-between p-4 border-b">
          <span className="font-semibold">Menu</span>
          <button onClick={() => setIsMobileMenuOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <Sidebar />
      </div>
    </div>
  )
}
