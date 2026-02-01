'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { 
  MessageSquare, 
  Users, 
  RefreshCw,
  Send,
  Star,
  Clock,
  Tag,
  Search,
  Settings,
  ChevronRight,
  Eye,
  EyeOff
} from 'lucide-react'

interface Conversation {
  id: string
  name: string
  avatarUrl: string | null
  lastMessagePreview: string
  lastMessageTime: string | null
  isStarred: boolean
  unreadCount: number
}

interface Message {
  id: string
  conversationId: string | null
  content: string
  isFromMe: boolean
  timestamp: string | null
}

export default function CRMPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [lastSync, setLastSync] = useState<string | null>(null)
  const [showLinkedIn, setShowLinkedIn] = useState(false)
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Fetch data from API
  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/sync')
      const json = await res.json()
      
      if (json.ok && json.data) {
        // Transform conversations
        const convs = (json.data.conversations || []).map((c: any, i: number) => ({
          id: c.threadId || `conv-${i}`,
          name: c.name || 'Unknown',
          avatarUrl: c.avatarUrl,
          lastMessagePreview: c.lastMessagePreview || '',
          lastMessageTime: c.lastMessageTime,
          isStarred: c.isStarred || false,
          unreadCount: c.unreadCount || 0
        }))
        
        // Transform messages - associate with conversation
        const msgs = (json.data.messages || []).map((m: any, i: number) => ({
          id: m.urn || `msg-${i}`,
          conversationId: m.conversationId || null,
          content: m.content || '',
          isFromMe: m.isFromMe || false,
          timestamp: m.timestamp
        }))
        
        setConversations(convs)
        setMessages(msgs)
        setLastSync(new Date().toLocaleTimeString('fr-FR'))
      }
    } catch (e) {
      console.error('Fetch error:', e)
    }
  }, [])

  // Poll for updates
  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 5000)
    return () => clearInterval(interval)
  }, [fetchData])

  // Manual sync
  const handleSync = async () => {
    setIsLoading(true)
    await fetchData()
    setIsLoading(false)
  }

  // Filter conversations
  const filteredConversations = conversations.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Selected conversation
  const selectedConv = conversations.find(c => c.id === selectedConvId)
  
  // Filter messages for selected conversation and sort by timestamp
  const selectedMessages = messages
    .filter(m => m.conversationId === selectedConvId)
    .sort((a, b) => {
      const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0
      const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0
      return timeA - timeB // Oldest first
    })

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-white">
      {/* Header */}
      <header className="h-14 bg-gray-800 border-b border-gray-700 flex items-center px-4 gap-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">Li</span>
          </div>
          <span className="font-semibold">LinkedIn CRM</span>
        </div>
        
        <div className="flex-1 max-w-md mx-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowLinkedIn(!showLinkedIn)}
            className={`p-2 rounded-lg transition-colors ${showLinkedIn ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
            title={showLinkedIn ? 'Cacher LinkedIn' : 'Voir LinkedIn'}
          >
            {showLinkedIn ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
          </button>
          
          <button
            onClick={handleSync}
            disabled={isLoading}
            className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          
          <span className="text-xs text-gray-400">
            {lastSync ? `Sync: ${lastSync}` : 'Pas de sync'}
          </span>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* LinkedIn iframe (hidden or visible based on toggle) */}
        <iframe
          ref={iframeRef}
          src="https://www.linkedin.com/messaging/"
          className={`absolute inset-0 w-full h-full border-0 transition-opacity duration-300 ${
            showLinkedIn ? 'opacity-100 z-20' : 'opacity-0 z-0 pointer-events-none'
          }`}
          onLoad={() => setIframeLoaded(true)}
        />

        {/* CRM UI (always visible unless LinkedIn is shown) */}
        <div className={`flex w-full transition-opacity duration-300 ${
          showLinkedIn ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}>
          {/* Conversation list */}
          <div className="w-80 bg-gray-800 border-r border-gray-700 flex flex-col">
            <div className="p-4 border-b border-gray-700">
              <h2 className="font-semibold flex items-center gap-2">
                <MessageSquare className="w-5 h-5" />
                Conversations
                <span className="ml-auto bg-blue-600 text-xs px-2 py-0.5 rounded-full">
                  {conversations.length}
                </span>
              </h2>
            </div>
            
            <div className="flex-1 overflow-y-auto">
              {filteredConversations.length === 0 ? (
                <div className="p-4 text-center text-gray-400">
                  <p>Aucune conversation</p>
                  <p className="text-sm mt-2">
                    {iframeLoaded ? 'En attente de sync...' : 'Chargement de LinkedIn...'}
                  </p>
                </div>
              ) : (
                filteredConversations.map(conv => (
                  <button
                    key={conv.id}
                    onClick={() => setSelectedConvId(conv.id)}
                    className={`w-full p-3 flex items-start gap-3 hover:bg-gray-700 transition-colors border-b border-gray-700 ${
                      selectedConvId === conv.id ? 'bg-gray-700' : ''
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full bg-gray-600 flex-shrink-0 overflow-hidden">
                      {conv.avatarUrl ? (
                        <img src={conv.avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-lg">
                          {conv.name.charAt(0)}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{conv.name}</span>
                        {conv.isStarred && <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />}
                      </div>
                      <p className="text-sm text-gray-400 truncate">{conv.lastMessagePreview}</p>
                    </div>
                    {conv.unreadCount > 0 && (
                      <span className="bg-blue-600 text-xs px-2 py-0.5 rounded-full">
                        {conv.unreadCount}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Message thread */}
          <div className="flex-1 flex flex-col bg-gray-900">
            {selectedConv ? (
              <>
                {/* Thread header */}
                <div className="p-4 border-b border-gray-700 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-600 overflow-hidden">
                    {selectedConv.avatarUrl ? (
                      <img src={selectedConv.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-lg">
                        {selectedConv.name.charAt(0)}
                      </div>
                    )}
                  </div>
                  <div>
                    <h3 className="font-semibold">{selectedConv.name}</h3>
                    <p className="text-sm text-gray-400">LinkedIn</p>
                  </div>
                  <div className="ml-auto flex gap-2">
                    <button className="p-2 hover:bg-gray-700 rounded-lg">
                      <Tag className="w-5 h-5" />
                    </button>
                    <button className="p-2 hover:bg-gray-700 rounded-lg">
                      <Clock className="w-5 h-5" />
                    </button>
                    <button className="p-2 hover:bg-gray-700 rounded-lg">
                      <Star className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {selectedMessages.length === 0 ? (
                    <div className="text-center text-gray-400 py-8">
                      <p>Aucun message pour cette conversation</p>
                      <p className="text-sm mt-2">Clique sur "Synchroniser" dans l'extension</p>
                    </div>
                  ) : selectedMessages.map((msg, index) => (
                    <div
                      key={`${msg.id}-${index}`}
                      className={`flex ${msg.isFromMe ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[70%] p-3 rounded-lg ${
                          msg.isFromMe
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-700 text-white'
                        }`}
                      >
                        <p>{msg.content}</p>
                        {msg.timestamp && (
                          <p className="text-xs opacity-70 mt-1">{msg.timestamp}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Input */}
                <div className="p-4 border-t border-gray-700">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Écrire un message..."
                      className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:outline-none focus:border-blue-500"
                    />
                    <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">
                      <Send className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg">Sélectionne une conversation</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Status indicator */}
        <div className="absolute bottom-4 right-4 z-30">
          <div className={`px-3 py-1.5 rounded-full text-sm flex items-center gap-2 ${
            iframeLoaded ? 'bg-green-600' : 'bg-yellow-600'
          }`}>
            <div className={`w-2 h-2 rounded-full ${iframeLoaded ? 'bg-green-300' : 'bg-yellow-300 animate-pulse'}`} />
            {iframeLoaded ? 'LinkedIn connecté' : 'Connexion...'}
          </div>
        </div>
      </div>
    </div>
  )
}
