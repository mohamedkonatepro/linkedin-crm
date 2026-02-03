'use client'

import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react'
import {
  MessageSquare,
  RefreshCw,
  Send,
  Star,
  Search,
  Paperclip,
  X,
  FileText,
  Download,
  Play,
  Pause,
  Image as ImageIcon,
  MoreHorizontal,
  Check,
  CheckCheck
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
  attachments?: {
    type: 'image' | 'file' | 'audio' | 'video'
    url: string
    name?: string
    size?: number
    duration?: number
  }[] | null
}

// Audio player component
function AudioPlayer({ url }: { url: string }) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const audioRef = useRef<HTMLAudioElement>(null)

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause()
      } else {
        audioRef.current.play()
      }
      setIsPlaying(!isPlaying)
    }
  }

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60)
    const secs = Math.floor(time % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl min-w-[200px]">
      <audio
        ref={audioRef}
        src={url}
        onTimeUpdate={(e) => setProgress((e.currentTarget.currentTime / e.currentTarget.duration) * 100)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onEnded={() => { setIsPlaying(false); setProgress(0) }}
      />
      <button
        onClick={togglePlay}
        className="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center hover:bg-blue-600 transition-colors flex-shrink-0"
      >
        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
      </button>
      <div className="flex-1">
        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-all duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="flex justify-between mt-1 text-xs text-gray-400">
          <span>{formatTime((progress / 100) * duration)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  )
}

// File attachment component
function FileAttachment({ name, size, url }: { name?: string; size?: number; url: string }) {
  const formatSize = (bytes?: number) => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors group"
    >
      <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
        <FileText className="w-5 h-5 text-blue-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{name || 'Document'}</p>
        {size && <p className="text-xs text-gray-400">{formatSize(size)}</p>}
      </div>
      <Download className="w-4 h-4 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
    </a>
  )
}

// Image attachment component
function ImageAttachment({ url }: { url: string }) {
  const [isLoaded, setIsLoaded] = useState(false)

  return (
    <div className="relative rounded-xl overflow-hidden bg-gray-100 max-w-sm">
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      <img
        src={url}
        alt="Image"
        className={`max-w-full rounded-xl cursor-pointer hover:opacity-95 transition-opacity ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setIsLoaded(true)}
        onClick={() => window.open(url, '_blank')}
      />
    </div>
  )
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
  const [newMessage, setNewMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [filePreview, setFilePreview] = useState<string | null>(null)
  const [realtimeStatus, setRealtimeStatus] = useState<'disconnected' | 'websocket' | 'polling'>('disconnected')
  const [lastRealtimeMessage, setLastRealtimeMessage] = useState<string | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const lastRealtimeCheckRef = useRef<string | null>(null)
  const prevMessagesLengthRef = useRef<number>(0)
  const prevConvIdRef = useRef<string | null>(null)
  const recentlySentRef = useRef<Map<string, number>>(new Map())

  // Helper to extract thread ID from URN
  const extractThreadId = (urn: string | null): string => {
    if (!urn) return ''
    const match = urn.match(/2-[A-Za-z0-9_=-]+/)
    return match ? match[0] : urn
  }

  // Format timestamp
  const formatTime = (timestamp: string | null) => {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()

    if (isToday) {
      return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    }

    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    if (date.toDateString() === yesterday.toDateString()) {
      return 'Hier'
    }

    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  }

  // Fetch data from API
  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/sync')
      const json = await res.json()

      if (json.ok && json.data) {
        const apiMsgs = (json.data.messages || []).map((m: any, i: number) => ({
          id: m.urn || `msg-${i}`,
          conversationId: m.conversationId || null,
          content: m.content || '',
          isFromMe: m.isFromMe || false,
          timestamp: m.timestamp,
          attachments: m.attachments || null
        }))

        const convs = (json.data.conversations || []).map((c: any, i: number) => ({
          id: c.threadId || `conv-${i}`,
          name: c.name || 'Unknown',
          avatarUrl: c.avatarUrl,
          lastMessagePreview: c.lastMessagePreview || '',
          lastMessageTime: c.lastMessageTime,
          isStarred: c.isStarred || false,
          unreadCount: c.unreadCount || 0
        }))

        setConversations(convs)

        setMessages(prev => {
          const createContentKey = (m: Message) => {
            const threadId = extractThreadId(m.conversationId)
            return `${threadId}:${(m.content || '').trim().substring(0, 100)}`
          }

          const apiIds = new Set(apiMsgs.map((m: Message) => m.id))
          const apiContentKeys = new Set(apiMsgs.map((m: Message) => createContentKey(m)))

          const keptMessages = prev.filter(m => {
            if (apiIds.has(m.id)) return false
            if (m.id.startsWith('temp-')) {
              const contentKey = createContentKey(m)
              if (apiContentKeys.has(contentKey)) return false
              return true
            }
            return !apiContentKeys.has(createContentKey(m))
          })

          return [...apiMsgs, ...keptMessages]
        })
        setLastSync(new Date().toLocaleTimeString('fr-FR'))
      }
    } catch (e) {
      console.error('Fetch error:', e)
    }
  }, [])

  // Poll for updates
  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 10000)
    return () => clearInterval(interval)
  }, [fetchData])

  // WebSocket realtime handler
  useEffect(() => {
    const handleRealtimeMessage = (event: MessageEvent) => {
      if (event.data?.source !== 'linkedin-extension') return

      if (event.data.type === 'NEW_MESSAGES' && event.data.messages) {
        setRealtimeStatus('websocket')
        setLastRealtimeMessage(new Date().toLocaleTimeString('fr-FR'))

        const now = Date.now()
        recentlySentRef.current.forEach((timestamp, key) => {
          if (now - timestamp > 30000) recentlySentRef.current.delete(key)
        })

        const filteredMessages = event.data.messages.filter((m: any) => {
          const content = m.body || ''
          const convUrn = m.conversationUrn || ''
          const key = `${convUrn}:${content.trim().substring(0, 100)}`
          return !recentlySentRef.current.has(key)
        })

        if (filteredMessages.length === 0) return

        const newMsgs: Message[] = filteredMessages.map((m: any, i: number) => ({
          id: m.entityUrn || `rt-${Date.now()}-${i}`,
          conversationId: m.conversationUrn || null,
          content: m.body || '',
          isFromMe: m.isFromMe || false,
          timestamp: m.createdAt ? new Date(m.createdAt).toISOString() : new Date().toISOString(),
          attachments: m.attachments || null
        }))

        let trulyNewMessages: Message[] = []

        setMessages(prev => {
          const existingIds = new Set(prev.map(m => m.id))
          const createContentKey = (m: Message) => {
            const threadId = extractThreadId(m.conversationId)
            return `${threadId}:${(m.content || '').trim().substring(0, 100)}`
          }
          const existingContentKeys = new Set(prev.map(createContentKey))

          trulyNewMessages = newMsgs.filter(m => {
            if (existingIds.has(m.id)) return false
            if (existingContentKeys.has(createContentKey(m))) return false
            return true
          })

          if (trulyNewMessages.length > 0) {
            return [...prev, ...trulyNewMessages]
          }
          return prev
        })

        for (const msg of trulyNewMessages) {
          if (msg.isFromMe) continue
          const msgThreadId = extractThreadId(msg.conversationId || '')
          if (msgThreadId) {
            setConversations(prev => prev.map(conv => {
              const convThreadId = extractThreadId(conv.id)
              if (convThreadId && convThreadId === msgThreadId) {
                return {
                  ...conv,
                  lastMessagePreview: msg.content || '[Attachment]',
                  lastMessageTime: new Date().toISOString(),
                  unreadCount: conv.unreadCount + 1
                }
              }
              return conv
            }))
          }
        }
      }

      if (event.data.type === 'REALTIME_STATUS') {
        setRealtimeStatus(event.data.connected ? 'websocket' : 'polling')
      }
    }

    window.addEventListener('message', handleRealtimeMessage)
    return () => window.removeEventListener('message', handleRealtimeMessage)
  }, [])

  // Polling realtime handler
  useEffect(() => {
    const pollRealtime = async () => {
      try {
        const url = lastRealtimeCheckRef.current
          ? `/api/realtime?since=${encodeURIComponent(lastRealtimeCheckRef.current)}`
          : '/api/realtime?limit=50'

        const res = await fetch(url)
        const json = await res.json()

        if (json.ok && json.messages?.length > 0) {
          if (realtimeStatus !== 'websocket') setRealtimeStatus('polling')
          setLastRealtimeMessage(new Date().toLocaleTimeString('fr-FR'))

          const now = Date.now()
          recentlySentRef.current.forEach((timestamp, key) => {
            if (now - timestamp > 30000) recentlySentRef.current.delete(key)
          })

          const filteredMessages = json.messages.filter((m: any) => {
            const content = m.content || ''
            const convId = m.conversationId || ''
            const key = `${convId}:${content.trim().substring(0, 100)}`
            return !recentlySentRef.current.has(key)
          })

          if (filteredMessages.length === 0) {
            lastRealtimeCheckRef.current = new Date().toISOString()
            return
          }

          const newMsgs: Message[] = filteredMessages.map((m: any, i: number) => ({
            id: m.urn || `poll-${Date.now()}-${i}`,
            conversationId: m.conversationId || null,
            content: m.content || '',
            isFromMe: m.isFromMe || false,
            timestamp: m.timestamp || new Date().toISOString(),
            attachments: m.attachments || null
          }))

          let trulyNewMessages: Message[] = []

          setMessages(prev => {
            const existingIds = new Set(prev.map(m => m.id))
            const createContentKey = (m: Message) => {
              const threadId = extractThreadId(m.conversationId)
              return `${threadId}:${(m.content || '').trim().substring(0, 100)}`
            }
            const existingContentKeys = new Set(prev.map(createContentKey))

            trulyNewMessages = newMsgs.filter(m => {
              if (existingIds.has(m.id)) return false
              if (existingContentKeys.has(createContentKey(m))) return false
              return true
            })

            if (trulyNewMessages.length > 0) {
              return [...prev, ...trulyNewMessages]
            }
            return prev
          })

          for (const msg of trulyNewMessages) {
            const isFromMe = msg.isFromMe || false
            const msgThreadId = extractThreadId(msg.conversationId || '')

            if (msgThreadId && !isFromMe) {
              setConversations(prev => prev.map(conv => {
                const convThreadId = extractThreadId(conv.id)
                if (convThreadId && convThreadId === msgThreadId) {
                  return {
                    ...conv,
                    lastMessagePreview: msg.content || '[Attachment]',
                    lastMessageTime: msg.timestamp,
                    unreadCount: conv.unreadCount + 1
                  }
                }
                return conv
              }))
            }
          }
        }

        lastRealtimeCheckRef.current = new Date().toISOString()
      } catch (e) {
        console.error('Realtime poll error:', e)
      }
    }

    const interval = setInterval(pollRealtime, 5000)
    pollRealtime()
    return () => clearInterval(interval)
  }, [realtimeStatus])

  // Auto-scroll
  useLayoutEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return
    const conversationChanged = selectedConvId !== prevConvIdRef.current
    const newMessagesArrived = messages.length > prevMessagesLengthRef.current
    if (conversationChanged || newMessagesArrived) {
      container.scrollTop = container.scrollHeight
    }
    prevConvIdRef.current = selectedConvId
    prevMessagesLengthRef.current = messages.length
  }, [selectedConvId, messages])

  const handleSync = async () => {
    setIsLoading(true)
    await fetchData()
    setIsLoading(false)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSelectedFile(file)
    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onloadend = () => setFilePreview(reader.result as string)
      reader.readAsDataURL(file)
    } else {
      setFilePreview(null)
    }
  }

  const clearSelectedFile = () => {
    setSelectedFile(null)
    setFilePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSendMessage = async () => {
    if ((!newMessage.trim() && !selectedFile) || !selectedConvId || !iframeRef.current?.contentWindow) {
      if (!iframeRef.current?.contentWindow) {
        alert('LinkedIn non connecté. Active l\'iframe avec le bouton LinkedIn')
      }
      return
    }

    setIsSending(true)
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const messageContent = newMessage.trim()
    const messageTimestamp = new Date().toISOString()

    const optimisticMessage: Message = {
      id: tempId,
      conversationId: selectedConvId,
      content: messageContent,
      isFromMe: true,
      timestamp: messageTimestamp,
      attachments: selectedFile ? [{
        type: selectedFile.type.startsWith('image/') ? 'image' : 'file',
        url: filePreview || '',
        name: selectedFile.name,
        size: selectedFile.size
      }] : null
    }

    setMessages(prev => [...prev, optimisticMessage])
    const sentKey = `${selectedConvId}:${messageContent.substring(0, 100)}`
    recentlySentRef.current.set(sentKey, Date.now())

    fetch('/api/sync', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'add_message',
        message: {
          urn: tempId,
          conversationId: selectedConvId,
          content: messageContent,
          isFromMe: true,
          timestamp: messageTimestamp,
          attachments: optimisticMessage.attachments
        }
      })
    }).catch(console.error)

    setConversations(prev => prev.map(conv =>
      conv.id === selectedConvId ? {
        ...conv,
        lastMessagePreview: messageContent || '[Fichier]',
        lastMessageTime: messageTimestamp
      } : conv
    ))

    const payload: any = {
      source: 'linkedin-crm',
      type: 'SEND_MESSAGE',
      conversationUrn: selectedConvId,
      text: messageContent
    }

    if (selectedFile) {
      const reader = new FileReader()
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1]
        payload.file = {
          name: selectedFile.name,
          type: selectedFile.type,
          size: selectedFile.size,
          base64: base64,
          uploadType: selectedFile.type.startsWith('image/') ? 'MESSAGING_PHOTO_ATTACHMENT' :
                      selectedFile.type.startsWith('audio/') ? 'MESSAGING_VOICE_ATTACHMENT' : 'MESSAGING_FILE_ATTACHMENT',
          mediaTypeFamily: selectedFile.type.startsWith('image/') ? 'STILLIMAGE' :
                          selectedFile.type.startsWith('audio/') ? 'AUDIO' : 'DOCUMENT'
        }
        iframeRef.current?.contentWindow?.postMessage(payload, '*')
      }
      reader.readAsDataURL(selectedFile)
    } else {
      iframeRef.current.contentWindow.postMessage(payload, '*')
    }

    const savedMessage = newMessage
    const savedFile = selectedFile
    setNewMessage('')
    clearSelectedFile()

    const handleResponse = (event: MessageEvent) => {
      if (event.data?.source === 'linkedin-extension' && event.data?.type === 'SEND_MESSAGE_RESPONSE') {
        window.removeEventListener('message', handleResponse)
        setIsSending(false)
        if (!event.data.ok) {
          setMessages(prev => prev.filter(m => m.id !== tempId))
          setNewMessage(savedMessage)
          if (savedFile) setSelectedFile(savedFile)
          alert('Erreur: ' + (event.data.error || 'Échec de l\'envoi'))
        }
      }
    }

    window.addEventListener('message', handleResponse)
    setTimeout(() => {
      window.removeEventListener('message', handleResponse)
      if (isSending) setIsSending(false)
    }, savedFile ? 30000 : 10000)
  }

  const filteredConversations = conversations.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const selectedConv = conversations.find(c => c.id === selectedConvId)
  const selectedThreadId = extractThreadId(selectedConvId)
  const selectedMessages = messages
    .filter(m => {
      if (!selectedConvId) return false
      if (m.conversationId === selectedConvId) return true
      const msgThreadId = extractThreadId(m.conversationId)
      return msgThreadId && selectedThreadId && msgThreadId === selectedThreadId
    })
    .sort((a, b) => {
      const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0
      const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0
      return timeA - timeB
    })

  return (
    <div className="h-screen flex bg-white">
      {/* LinkedIn iframe (hidden) */}
      <iframe
        ref={iframeRef}
        src="https://www.linkedin.com/messaging/"
        className={`fixed inset-0 w-full h-full border-0 transition-opacity duration-300 z-50 ${
          showLinkedIn ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onLoad={() => setIframeLoaded(true)}
      />

      {/* Sidebar */}
      <div className="w-80 border-r border-gray-200 flex flex-col bg-gray-50/50">
        {/* Header */}
        <div className="p-4 border-b border-gray-200 bg-white">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-semibold text-gray-900">Messages</h1>
            <div className="flex items-center gap-3">
              {/* Status indicator - minimalist dot with tooltip */}
              <div
                className="relative group cursor-default"
                title={iframeLoaded ? 'Connecté' : 'Connexion en cours...'}
              >
                <span className={`block w-2.5 h-2.5 rounded-full transition-colors ${
                  iframeLoaded ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
                }`} />
                {/* Tooltip */}
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs font-medium text-white bg-gray-900 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                  {iframeLoaded ? 'Connecté' : 'Connexion...'}
                </span>
              </div>
              <button
                onClick={handleSync}
                disabled={isLoading}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                title="Rafraîchir"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={() => setShowLinkedIn(!showLinkedIn)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                  showLinkedIn
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                LinkedIn
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Rechercher une conversation..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-gray-100 border-0 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all"
            />
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {filteredConversations.length === 0 ? (
            <div className="p-8 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
                <MessageSquare className="w-8 h-8 text-gray-400" />
              </div>
              <p className="text-gray-500 font-medium">Aucune conversation</p>
              <p className="text-sm text-gray-400 mt-1">
                {iframeLoaded ? 'Synchronisez vos messages' : 'Connexion à LinkedIn...'}
              </p>
            </div>
          ) : (
            <div className="py-2">
              {filteredConversations.map(conv => (
                <button
                  key={conv.id}
                  onClick={() => {
                    setSelectedConvId(conv.id)
                    setConversations(prev => prev.map(c =>
                      c.id === conv.id ? { ...c, unreadCount: 0 } : c
                    ))
                    fetch('/api/sync', {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ type: 'mark_read', conversationId: conv.id })
                    }).catch(console.error)
                  }}
                  className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-100 transition-colors ${
                    selectedConvId === conv.id ? 'bg-blue-50 hover:bg-blue-50' : ''
                  }`}
                >
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 overflow-hidden">
                      {conv.avatarUrl ? (
                        <img src={conv.avatarUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-500 font-medium text-lg">
                          {conv.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                    {conv.unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 bg-blue-600 text-white text-xs font-medium rounded-full flex items-center justify-center">
                        {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                      </span>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`font-medium truncate ${
                        conv.unreadCount > 0 ? 'text-gray-900' : 'text-gray-700'
                      }`}>
                        {conv.name}
                      </span>
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        {formatTime(conv.lastMessageTime)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      {conv.isStarred && <Star className="w-3 h-3 text-amber-400 fill-amber-400 flex-shrink-0" />}
                      <p className={`text-sm truncate ${
                        conv.unreadCount > 0 ? 'text-gray-600 font-medium' : 'text-gray-400'
                      }`}>
                        {conv.lastMessagePreview || 'Aucun message'}
                      </p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col bg-white">
        {selectedConv ? (
          <>
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-white">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 overflow-hidden">
                  {selectedConv.avatarUrl ? (
                    <img src={selectedConv.avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-500 font-medium">
                      {selectedConv.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <h2 className="font-semibold text-gray-900">{selectedConv.name}</h2>
              </div>
              <div className="flex items-center gap-2">
                <button className="p-2 text-gray-400 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-colors">
                  <Star className={`w-5 h-5 ${selectedConv.isStarred ? 'fill-amber-400 text-amber-400' : ''}`} />
                </button>
                <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                  <MoreHorizontal className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-6 py-4">
              {selectedMessages.length === 0 ? (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
                      <MessageSquare className="w-8 h-8 text-gray-400" />
                    </div>
                    <p className="text-gray-500 font-medium">Aucun message</p>
                    <p className="text-sm text-gray-400 mt-1">Commencez la conversation</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {selectedMessages.map((msg, index) => {
                    // Only show date separator when the DATE changes (not time)
                    const currentDate = msg.timestamp ? new Date(msg.timestamp).toDateString() : null
                    const prevDate = selectedMessages[index - 1]?.timestamp
                      ? new Date(selectedMessages[index - 1].timestamp!).toDateString()
                      : null
                    const showDateSeparator = index === 0 || (currentDate && currentDate !== prevDate)

                    return (
                      <div key={`${msg.id}-${index}`}>
                        {showDateSeparator && msg.timestamp && (
                          <div className="flex justify-center my-4">
                            <span className="px-3 py-1 bg-gray-100 text-gray-500 text-xs font-medium rounded-full">
                              {new Date(msg.timestamp).toLocaleDateString('fr-FR', {
                                weekday: 'long',
                                day: 'numeric',
                                month: 'long'
                              })}
                            </span>
                          </div>
                        )}
                        <div className={`flex ${msg.isFromMe ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[70%] ${msg.isFromMe ? 'order-2' : 'order-1'}`}>
                            {/* Attachments */}
                            {msg.attachments?.map((att: any, i: number) => (
                              <div key={i} className="mb-2">
                                {att.type === 'image' && <ImageAttachment url={att.url} />}
                                {att.type === 'file' && <FileAttachment name={att.name} size={att.size} url={att.url} />}
                                {att.type === 'audio' && <AudioPlayer url={att.url} />}
                                {att.type === 'video' && (
                                  <video controls className="max-w-full rounded-xl">
                                    <source src={att.url} type="video/mp4" />
                                  </video>
                                )}
                              </div>
                            ))}

                            {/* Message content */}
                            {msg.content && (
                              <div className={`px-4 py-2.5 rounded-2xl ${
                                msg.isFromMe
                                  ? 'bg-blue-600 text-white rounded-br-md'
                                  : 'bg-gray-100 text-gray-900 rounded-bl-md'
                              }`}>
                                <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                              </div>
                            )}

                            {/* Timestamp & status */}
                            <div className={`flex items-center gap-1 mt-1 ${msg.isFromMe ? 'justify-end' : 'justify-start'}`}>
                              <span className="text-[11px] text-gray-400">
                                {msg.timestamp && new Date(msg.timestamp).toLocaleTimeString('fr-FR', {
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                              {msg.isFromMe && (
                                <CheckCheck className="w-3.5 h-3.5 text-blue-500" />
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Input */}
            <div className="px-6 py-4 border-t border-gray-200 bg-white">
              {/* File preview */}
              {selectedFile && (
                <div className="mb-3 p-3 bg-gray-50 rounded-xl flex items-center gap-3">
                  {filePreview ? (
                    <img src={filePreview} alt="Preview" className="w-14 h-14 object-cover rounded-lg" />
                  ) : (
                    <div className="w-14 h-14 bg-gray-200 rounded-lg flex items-center justify-center">
                      <FileText className="w-6 h-6 text-gray-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate text-sm">{selectedFile.name}</p>
                    <p className="text-xs text-gray-400">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                  </div>
                  <button onClick={clearSelectedFile} className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors">
                    <X className="w-4 h-4 text-gray-500" />
                  </button>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,audio/*"
                onChange={handleFileSelect}
                className="hidden"
              />

              <div className="flex items-end gap-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSending}
                  className="p-2.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors disabled:opacity-50"
                >
                  <Paperclip className="w-5 h-5" />
                </button>

                <div className="flex-1 relative">
                  <input
                    type="text"
                    placeholder="Écrivez votre message..."
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        handleSendMessage()
                      }
                    }}
                    disabled={isSending}
                    className="w-full px-4 py-3 bg-gray-100 border-0 rounded-xl text-[15px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all disabled:opacity-50"
                  />
                </div>

                <button
                  onClick={handleSendMessage}
                  disabled={isSending || (!newMessage.trim() && !selectedFile)}
                  className="p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSending ? (
                    <RefreshCw className="w-5 h-5 animate-spin" />
                  ) : (
                    <Send className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gray-50/50">
            <div className="text-center">
              <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-white shadow-sm flex items-center justify-center">
                <MessageSquare className="w-10 h-10 text-gray-300" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">Bienvenue</h3>
              <p className="text-gray-500">Sélectionnez une conversation pour commencer</p>
            </div>
          </div>
        )}
      </div>

    </div>
  )
}
