'use client'

import { useState, useEffect } from 'react'
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
    isLoading 
  } = useCRMStore()
  
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

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
