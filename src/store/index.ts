import { create } from 'zustand'
import type { Conversation, Contact, Message, Tag } from '@/types'

interface CRMState {
  // Data
  conversations: Conversation[]
  contacts: Contact[]
  messages: Message[]
  tags: Tag[]
  
  // Selected
  selectedConversationId: string | null
  selectedContactId: string | null
  
  // Filters
  searchQuery: string
  filterPriority: number | null
  filterTags: string[]
  filterStatus: string | null
  showUnreadOnly: boolean
  showStarredOnly: boolean
  
  // UI
  isSidebarOpen: boolean
  isLoading: boolean
  
  // Actions
  setConversations: (conversations: Conversation[]) => void
  setContacts: (contacts: Contact[]) => void
  setMessages: (messages: Message[]) => void
  setTags: (tags: Tag[]) => void
  
  selectConversation: (id: string | null) => void
  selectContact: (id: string | null) => void
  
  setSearchQuery: (query: string) => void
  setFilterPriority: (priority: number | null) => void
  setFilterTags: (tags: string[]) => void
  setFilterStatus: (status: string | null) => void
  toggleUnreadOnly: () => void
  toggleStarredOnly: () => void
  
  toggleSidebar: () => void
  setLoading: (loading: boolean) => void
  
  // Computed
  filteredConversations: () => Conversation[]
}

export const useCRMStore = create<CRMState>((set, get) => ({
  // Initial state
  conversations: [],
  contacts: [],
  messages: [],
  tags: [],
  
  selectedConversationId: null,
  selectedContactId: null,
  
  searchQuery: '',
  filterPriority: null,
  filterTags: [],
  filterStatus: null,
  showUnreadOnly: false,
  showStarredOnly: false,
  
  isSidebarOpen: true,
  isLoading: false,
  
  // Actions
  setConversations: (conversations) => set({ conversations }),
  setContacts: (contacts) => set({ contacts }),
  setMessages: (messages) => set({ messages }),
  setTags: (tags) => set({ tags }),
  
  selectConversation: (id) => set({ selectedConversationId: id }),
  selectContact: (id) => set({ selectedContactId: id }),
  
  setSearchQuery: (query) => set({ searchQuery: query }),
  setFilterPriority: (priority) => set({ filterPriority: priority }),
  setFilterTags: (tags) => set({ filterTags: tags }),
  setFilterStatus: (status) => set({ filterStatus: status }),
  toggleUnreadOnly: () => set((state) => ({ showUnreadOnly: !state.showUnreadOnly })),
  toggleStarredOnly: () => set((state) => ({ showStarredOnly: !state.showStarredOnly })),
  
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  setLoading: (loading) => set({ isLoading: loading }),
  
  // Computed
  filteredConversations: () => {
    const state = get()
    let filtered = [...state.conversations]
    
    // Search filter
    if (state.searchQuery) {
      const query = state.searchQuery.toLowerCase()
      filtered = filtered.filter((conv) => {
        const contact = conv.contact
        return (
          contact?.name?.toLowerCase().includes(query) ||
          contact?.company?.toLowerCase().includes(query) ||
          conv.last_message_preview?.toLowerCase().includes(query)
        )
      })
    }
    
    // Unread filter
    if (state.showUnreadOnly) {
      filtered = filtered.filter((conv) => conv.is_unread)
    }
    
    // Starred filter
    if (state.showStarredOnly) {
      filtered = filtered.filter((conv) => conv.is_starred)
    }
    
    // Priority filter
    if (state.filterPriority !== null) {
      filtered = filtered.filter((conv) => conv.contact?.priority === state.filterPriority)
    }
    
    // Tags filter
    if (state.filterTags.length > 0) {
      filtered = filtered.filter((conv) =>
        state.filterTags.some((tag) => conv.contact?.tags?.includes(tag))
      )
    }
    
    // Status filter
    if (state.filterStatus) {
      filtered = filtered.filter((conv) => conv.contact?.status === state.filterStatus)
    }
    
    return filtered
  },
}))
