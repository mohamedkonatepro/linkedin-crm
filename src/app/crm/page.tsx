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
  MoreHorizontal,
  CheckCheck,
  Tag,
  Bell,
  FileEdit,
  Plus,
  Clock,
  Check,
  Trash2,
  ChevronRight,
  Calendar,
  Filter
} from 'lucide-react'

// Types
interface ConversationTag {
  id: string
  name: string
  color: string
}

interface Reminder {
  id: string
  reminderAt: string
  message: string | null
  isTriggered: boolean
}

interface Conversation {
  id: string
  dbId?: string
  name: string
  avatarUrl: string | null
  lastMessagePreview: string
  lastMessageTime: string | null
  isStarred: boolean
  unreadCount: number
  tags: ConversationTag[]
  note: string
  reminder: Reminder | null
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
      if (isPlaying) audioRef.current.pause()
      else audioRef.current.play()
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
          <div className="h-full bg-blue-500 transition-all duration-100" style={{ width: `${progress}%` }} />
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
    <a href={url} target="_blank" rel="noopener noreferrer"
      className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors group">
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
      <img src={url} alt="Image"
        className={`max-w-full rounded-xl cursor-pointer hover:opacity-95 transition-opacity ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setIsLoaded(true)}
        onClick={() => window.open(url, '_blank')}
      />
    </div>
  )
}

// Tag selector popup
function TagSelector({
  allTags,
  selectedTags,
  onToggleTag,
  onCreateTag,
  onClose
}: {
  allTags: ConversationTag[]
  selectedTags: ConversationTag[]
  onToggleTag: (tag: ConversationTag) => void
  onCreateTag: (name: string, color: string) => void
  onClose: () => void
}) {
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState('#3B82F6')
  const [showCreate, setShowCreate] = useState(false)
  const selectedIds = new Set(selectedTags.map(t => t.id))

  const colors = ['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16']

  return (
    <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden">
      <div className="p-2 border-b border-gray-100">
        <p className="text-xs font-medium text-gray-500 px-2 py-1">Tags</p>
      </div>
      <div className="max-h-48 overflow-y-auto p-2">
        {allTags.map(tag => (
          <button key={tag.id} onClick={() => onToggleTag(tag)}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: tag.color }} />
            <span className="flex-1 text-left text-sm text-gray-700">{tag.name}</span>
            {selectedIds.has(tag.id) && <Check className="w-4 h-4 text-blue-500" />}
          </button>
        ))}
        {allTags.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-2">Aucun tag</p>
        )}
      </div>
      <div className="p-2 border-t border-gray-100">
        {!showCreate ? (
          <button onClick={() => setShowCreate(true)}
            className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
            <Plus className="w-4 h-4" />
            Créer un tag
          </button>
        ) : (
          <div className="space-y-2">
            <input type="text" value={newTagName} onChange={e => setNewTagName(e.target.value)}
              placeholder="Nom du tag" autoFocus
              className="w-full px-3 py-2 text-sm text-gray-900 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
            <div className="flex gap-1">
              {colors.map(c => (
                <button key={c} onClick={() => setNewTagColor(c)}
                  className={`w-6 h-6 rounded-full transition-transform ${newTagColor === c ? 'scale-110 ring-2 ring-offset-1 ring-gray-400' : ''}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowCreate(false)}
                className="flex-1 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                Annuler
              </button>
              <button onClick={() => {
                if (newTagName.trim()) {
                  onCreateTag(newTagName.trim(), newTagColor)
                  setNewTagName('')
                  setShowCreate(false)
                }
              }}
                className="flex-1 px-3 py-1.5 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">
                Créer
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Reminder popup
function ReminderPopup({
  currentReminder,
  onSetReminder,
  onDeleteReminder,
  onClose
}: {
  currentReminder: Reminder | null
  onSetReminder: (date: Date, message?: string) => void
  onDeleteReminder: () => void
  onClose: () => void
}) {
  const [customDate, setCustomDate] = useState('')
  const [customTime, setCustomTime] = useState('')
  const [message, setMessage] = useState('')

  const presets = [
    { label: 'Dans 1 heure', getValue: () => new Date(Date.now() + 60 * 60 * 1000) },
    { label: 'Dans 3 heures', getValue: () => new Date(Date.now() + 3 * 60 * 60 * 1000) },
    { label: 'Demain 9h', getValue: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d } },
    { label: 'Dans 1 semaine', getValue: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
  ]

  return (
    <div className="absolute top-full right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-gray-200 z-50 overflow-hidden">
      <div className="p-3 border-b border-gray-100">
        <p className="text-sm font-medium text-gray-900">Programmer un rappel</p>
      </div>

      {currentReminder && (
        <div className="p-3 bg-amber-50 border-b border-amber-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-amber-600 font-medium">Rappel actif</p>
              <p className="text-sm text-amber-800">
                {new Date(currentReminder.reminderAt).toLocaleDateString('fr-FR', {
                  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                })}
              </p>
            </div>
            <button onClick={onDeleteReminder}
              className="p-1.5 text-amber-600 hover:bg-amber-100 rounded-lg transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="p-2">
        <p className="text-xs font-medium text-gray-500 px-2 py-1">Rappels rapides</p>
        {presets.map((preset, i) => (
          <button key={i} onClick={() => onSetReminder(preset.getValue(), message)}
            className="w-full flex items-center gap-2 px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors">
            <Clock className="w-4 h-4 text-gray-400" />
            {preset.label}
          </button>
        ))}
      </div>

      <div className="p-3 border-t border-gray-100 space-y-2">
        <p className="text-xs font-medium text-gray-500">Date personnalisée</p>
        <div className="flex gap-2">
          <input type="date" value={customDate} onChange={e => setCustomDate(e.target.value)}
            className="flex-1 px-2 py-1.5 text-sm text-gray-900 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
          <input type="time" value={customTime} onChange={e => setCustomTime(e.target.value)}
            className="w-24 px-2 py-1.5 text-sm text-gray-900 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
        </div>
        <input type="text" value={message} onChange={e => setMessage(e.target.value)}
          placeholder="Note (optionnel)"
          className="w-full px-2 py-1.5 text-sm text-gray-900 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
        <button onClick={() => {
          if (customDate && customTime) {
            onSetReminder(new Date(`${customDate}T${customTime}`), message)
          }
        }}
          disabled={!customDate || !customTime}
          className="w-full px-3 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors">
          Programmer
        </button>
      </div>
    </div>
  )
}

// Notes panel
function NotesPanel({
  note,
  conversationId,
  onSave
}: {
  note: string
  conversationId: string
  onSave: (note: string) => void
}) {
  const [value, setValue] = useState(note)
  const [isSaving, setIsSaving] = useState(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Update value when conversation changes
  useEffect(() => {
    setValue(note)
  }, [conversationId, note])

  // Auto-save after 1 second of no typing
  const handleChange = (newValue: string) => {
    setValue(newValue)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      setIsSaving(true)
      onSave(newValue)
      setTimeout(() => setIsSaving(false), 500)
    }, 1000)
  }

  return (
    <div className="w-80 border-l border-gray-200 bg-gray-50/50 flex flex-col">
      <div className="p-4 border-b border-gray-200 bg-white flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileEdit className="w-4 h-4 text-gray-500" />
          <h3 className="font-medium text-gray-900">Notes</h3>
        </div>
        {isSaving && <span className="text-xs text-gray-400">Sauvegarde...</span>}
      </div>
      <div className="flex-1 p-4">
        <textarea
          value={value}
          onChange={e => handleChange(e.target.value)}
          placeholder="Ajoutez des notes sur cette conversation..."
          className="w-full h-full p-3 text-sm text-gray-900 bg-white border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
        />
      </div>
    </div>
  )
}

// Reminders list modal
function RemindersListModal({
  reminders,
  onMarkHandled,
  onDelete,
  onClose
}: {
  reminders: any[]
  onMarkHandled: (id: string) => void
  onDelete: (id: string) => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Rappels à venir</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-y-auto max-h-96">
          {reminders.length === 0 ? (
            <div className="p-8 text-center">
              <Bell className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="text-gray-500">Aucun rappel programmé</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {reminders.map(r => (
                <div key={r.id} className={`p-4 flex items-center gap-3 ${r.is_handled ? 'opacity-50' : ''}`}>
                  <div className="w-10 h-10 rounded-full bg-gray-100 overflow-hidden flex-shrink-0">
                    {r.conversations?.contact_avatar_url ? (
                      <img src={r.conversations.contact_avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-500 font-medium">
                        {r.conversations?.contact_name?.charAt(0) || '?'}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{r.conversations?.contact_name}</p>
                    <p className="text-sm text-gray-500">
                      {new Date(r.reminder_at).toLocaleDateString('fr-FR', {
                        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
                      })}
                    </p>
                    {r.message && <p className="text-sm text-gray-400 truncate">{r.message}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    {!r.is_handled && (
                      <button onClick={() => onMarkHandled(r.id)}
                        className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors" title="Marquer comme traité">
                        <Check className="w-4 h-4" />
                      </button>
                    )}
                    <button onClick={() => onDelete(r.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Supprimer">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
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

  // New state for features
  const [allTags, setAllTags] = useState<ConversationTag[]>([])
  const [showTagSelector, setShowTagSelector] = useState(false)
  const [showReminderPopup, setShowReminderPopup] = useState(false)
  const [showRemindersModal, setShowRemindersModal] = useState(false)
  const [allReminders, setAllReminders] = useState<any[]>([])
  const [filterTags, setFilterTags] = useState<string[]>([])
  const [showFilterMenu, setShowFilterMenu] = useState(false)

  const iframeRef = useRef<HTMLIFrameElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const lastRealtimeCheckRef = useRef<string | null>(null)
  const prevMessagesLengthRef = useRef<number>(0)
  const prevConvIdRef = useRef<string | null>(null)
  const recentlySentRef = useRef<Map<string, number>>(new Map())

  const extractThreadId = (urn: string | null): string => {
    if (!urn) return ''
    const match = urn.match(/2-[A-Za-z0-9_=-]+/)
    return match ? match[0] : urn
  }

  const formatTime = (timestamp: string | null) => {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()
    if (isToday) return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    if (date.toDateString() === yesterday.toDateString()) return 'Hier'
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  }

  // Fetch tags
  const fetchTags = useCallback(async () => {
    try {
      const res = await fetch('/api/tags')
      const json = await res.json()
      if (json.ok) setAllTags(json.tags || [])
    } catch (e) { console.error('Fetch tags error:', e) }
  }, [])

  // Fetch all reminders
  const fetchAllReminders = useCallback(async () => {
    try {
      const res = await fetch('/api/reminders')
      const json = await res.json()
      if (json.ok) setAllReminders(json.reminders || [])
    } catch (e) { console.error('Fetch reminders error:', e) }
  }, [])

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
          dbId: c.id,
          name: c.name || 'Unknown',
          avatarUrl: c.avatarUrl,
          lastMessagePreview: c.lastMessagePreview || '',
          lastMessageTime: c.lastMessageTime,
          isStarred: c.isStarred || false,
          unreadCount: c.unreadCount || 0,
          tags: c.tags || [],
          note: c.note || '',
          reminder: c.reminder || null
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
              if (apiContentKeys.has(createContentKey(m))) return false
              return true
            }
            return !apiContentKeys.has(createContentKey(m))
          })
          return [...apiMsgs, ...keptMessages]
        })
        setLastSync(new Date().toLocaleTimeString('fr-FR'))

        // Check for triggered reminders and notify
        convs.forEach((conv: Conversation) => {
          if (conv.reminder?.isTriggered) {
            if (Notification.permission === 'granted') {
              new Notification(`Rappel: ${conv.name}`, {
                body: conv.reminder.message || 'Vous avez un rappel pour cette conversation',
                icon: conv.avatarUrl || undefined
              })
            }
          }
        })
      }
    } catch (e) { console.error('Fetch error:', e) }
  }, [])

  // Request notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [])

  // Initial fetch
  useEffect(() => {
    fetchData()
    fetchTags()
    fetchAllReminders()
    const interval = setInterval(fetchData, 10000)
    return () => clearInterval(interval)
  }, [fetchData, fetchTags, fetchAllReminders])

  // WebSocket realtime handler
  useEffect(() => {
    const handleRealtimeMessage = (event: MessageEvent) => {
      if (event.data?.source !== 'linkedin-extension') return
      if (event.data.type === 'NEW_MESSAGES' && event.data.messages) {
        setRealtimeStatus('websocket')
        const now = Date.now()
        recentlySentRef.current.forEach((ts, key) => { if (now - ts > 30000) recentlySentRef.current.delete(key) })
        const filteredMessages = event.data.messages.filter((m: any) => {
          const key = `${m.conversationUrn || ''}:${(m.body || '').trim().substring(0, 100)}`
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
          const createContentKey = (m: Message) => `${extractThreadId(m.conversationId)}:${(m.content || '').trim().substring(0, 100)}`
          const existingContentKeys = new Set(prev.map(createContentKey))
          trulyNewMessages = newMsgs.filter(m => !existingIds.has(m.id) && !existingContentKeys.has(createContentKey(m)))
          return trulyNewMessages.length > 0 ? [...prev, ...trulyNewMessages] : prev
        })
        trulyNewMessages.filter(m => !m.isFromMe).forEach(msg => {
          const msgThreadId = extractThreadId(msg.conversationId || '')
          if (msgThreadId) {
            setConversations(prev => prev.map(conv => {
              if (extractThreadId(conv.id) === msgThreadId) {
                return { ...conv, lastMessagePreview: msg.content || '[Attachment]', lastMessageTime: new Date().toISOString(), unreadCount: conv.unreadCount + 1 }
              }
              return conv
            }))
          }
        })
      }
      if (event.data.type === 'REALTIME_STATUS') setRealtimeStatus(event.data.connected ? 'websocket' : 'polling')
    }
    window.addEventListener('message', handleRealtimeMessage)
    return () => window.removeEventListener('message', handleRealtimeMessage)
  }, [])

  // Polling realtime
  useEffect(() => {
    const pollRealtime = async () => {
      try {
        const url = lastRealtimeCheckRef.current ? `/api/realtime?since=${encodeURIComponent(lastRealtimeCheckRef.current)}` : '/api/realtime?limit=50'
        const res = await fetch(url)
        const json = await res.json()
        if (json.ok && json.messages?.length > 0) {
          if (realtimeStatus !== 'websocket') setRealtimeStatus('polling')
          const now = Date.now()
          recentlySentRef.current.forEach((ts, key) => { if (now - ts > 30000) recentlySentRef.current.delete(key) })
          const filteredMessages = json.messages.filter((m: any) => !recentlySentRef.current.has(`${m.conversationId || ''}:${(m.content || '').trim().substring(0, 100)}`))
          if (filteredMessages.length === 0) { lastRealtimeCheckRef.current = new Date().toISOString(); return }
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
            const createContentKey = (m: Message) => `${extractThreadId(m.conversationId)}:${(m.content || '').trim().substring(0, 100)}`
            const existingContentKeys = new Set(prev.map(createContentKey))
            trulyNewMessages = newMsgs.filter(m => !existingIds.has(m.id) && !existingContentKeys.has(createContentKey(m)))
            return trulyNewMessages.length > 0 ? [...prev, ...trulyNewMessages] : prev
          })
          trulyNewMessages.filter(m => !m.isFromMe).forEach(msg => {
            const msgThreadId = extractThreadId(msg.conversationId || '')
            if (msgThreadId) {
              setConversations(prev => prev.map(conv => extractThreadId(conv.id) === msgThreadId ? { ...conv, lastMessagePreview: msg.content || '[Attachment]', lastMessageTime: msg.timestamp, unreadCount: conv.unreadCount + 1 } : conv))
            }
          })
        }
        lastRealtimeCheckRef.current = new Date().toISOString()
      } catch (e) { console.error('Realtime poll error:', e) }
    }
    const interval = setInterval(pollRealtime, 5000)
    pollRealtime()
    return () => clearInterval(interval)
  }, [realtimeStatus])

  // Auto-scroll
  useLayoutEffect(() => {
    const container = messagesContainerRef.current
    if (!container) return
    if (selectedConvId !== prevConvIdRef.current || messages.length > prevMessagesLengthRef.current) {
      container.scrollTop = container.scrollHeight
    }
    prevConvIdRef.current = selectedConvId
    prevMessagesLengthRef.current = messages.length
  }, [selectedConvId, messages])

  const handleSync = async () => { setIsLoading(true); await fetchData(); setIsLoading(false) }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSelectedFile(file)
    if (file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onloadend = () => setFilePreview(reader.result as string)
      reader.readAsDataURL(file)
    } else setFilePreview(null)
  }

  const clearSelectedFile = () => { setSelectedFile(null); setFilePreview(null); if (fileInputRef.current) fileInputRef.current.value = '' }

  const handleSendMessage = async () => {
    if ((!newMessage.trim() && !selectedFile) || !selectedConvId || !iframeRef.current?.contentWindow) return
    setIsSending(true)
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    const messageContent = newMessage.trim()
    const messageTimestamp = new Date().toISOString()
    const optimisticMessage: Message = { id: tempId, conversationId: selectedConvId, content: messageContent, isFromMe: true, timestamp: messageTimestamp, attachments: selectedFile ? [{ type: selectedFile.type.startsWith('image/') ? 'image' : 'file', url: filePreview || '', name: selectedFile.name, size: selectedFile.size }] : null }
    setMessages(prev => [...prev, optimisticMessage])
    recentlySentRef.current.set(`${selectedConvId}:${messageContent.substring(0, 100)}`, Date.now())
    fetch('/api/sync', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'add_message', message: { urn: tempId, conversationId: selectedConvId, content: messageContent, isFromMe: true, timestamp: messageTimestamp, attachments: optimisticMessage.attachments } }) }).catch(console.error)
    setConversations(prev => prev.map(conv => conv.id === selectedConvId ? { ...conv, lastMessagePreview: messageContent || '[Fichier]', lastMessageTime: messageTimestamp } : conv))
    const payload: any = { source: 'linkedin-crm', type: 'SEND_MESSAGE', conversationUrn: selectedConvId, text: messageContent }
    if (selectedFile) {
      const reader = new FileReader()
      reader.onloadend = () => { payload.file = { name: selectedFile.name, type: selectedFile.type, size: selectedFile.size, base64: (reader.result as string).split(',')[1], uploadType: selectedFile.type.startsWith('image/') ? 'MESSAGING_PHOTO_ATTACHMENT' : selectedFile.type.startsWith('audio/') ? 'MESSAGING_VOICE_ATTACHMENT' : 'MESSAGING_FILE_ATTACHMENT', mediaTypeFamily: selectedFile.type.startsWith('image/') ? 'STILLIMAGE' : selectedFile.type.startsWith('audio/') ? 'AUDIO' : 'DOCUMENT' }; iframeRef.current?.contentWindow?.postMessage(payload, '*') }
      reader.readAsDataURL(selectedFile)
    } else iframeRef.current.contentWindow.postMessage(payload, '*')
    const savedMessage = newMessage, savedFile = selectedFile
    setNewMessage(''); clearSelectedFile()
    const handleResponse = (event: MessageEvent) => { if (event.data?.source === 'linkedin-extension' && event.data?.type === 'SEND_MESSAGE_RESPONSE') { window.removeEventListener('message', handleResponse); setIsSending(false); if (!event.data.ok) { setMessages(prev => prev.filter(m => m.id !== tempId)); setNewMessage(savedMessage); if (savedFile) setSelectedFile(savedFile); alert('Erreur: ' + (event.data.error || 'Échec')) } } }
    window.addEventListener('message', handleResponse)
    setTimeout(() => { window.removeEventListener('message', handleResponse); if (isSending) setIsSending(false) }, savedFile ? 30000 : 10000)
  }

  // Tag handlers
  const handleToggleTag = async (tag: ConversationTag) => {
    const conv = selectedConv
    if (!conv?.dbId) return
    const hasTag = conv.tags.some(t => t.id === tag.id)
    try {
      await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: hasTag ? 'remove_tag' : 'assign_tag', conversationId: conv.dbId, tagId: tag.id })
      })
      setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, tags: hasTag ? c.tags.filter(t => t.id !== tag.id) : [...c.tags, tag] } : c))
    } catch (e) { console.error('Toggle tag error:', e) }
  }

  const handleCreateTag = async (name: string, color: string) => {
    try {
      const res = await fetch('/api/tags', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'create_tag', name, color }) })
      const json = await res.json()
      if (json.ok && json.tag) { setAllTags(prev => [...prev, json.tag]); if (selectedConv?.dbId) handleToggleTag(json.tag) }
    } catch (e) { console.error('Create tag error:', e) }
  }

  // Reminder handlers
  const handleSetReminder = async (date: Date, message?: string) => {
    const conv = selectedConv
    if (!conv?.dbId) return
    try {
      const res = await fetch('/api/reminders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId: conv.dbId, reminderAt: date.toISOString(), message }) })
      const json = await res.json()
      if (json.ok) {
        setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, reminder: { id: json.reminder.id, reminderAt: json.reminder.reminder_at, message: json.reminder.message, isTriggered: false } } : c))
        setShowReminderPopup(false)
        fetchAllReminders()
      }
    } catch (e) { console.error('Set reminder error:', e) }
  }

  const handleDeleteReminder = async (reminderId?: string) => {
    const id = reminderId || selectedConv?.reminder?.id
    if (!id) return
    try {
      await fetch(`/api/reminders?id=${id}`, { method: 'DELETE' })
      if (!reminderId && selectedConv) setConversations(prev => prev.map(c => c.id === selectedConv.id ? { ...c, reminder: null } : c))
      setShowReminderPopup(false)
      fetchAllReminders()
    } catch (e) { console.error('Delete reminder error:', e) }
  }

  const handleMarkReminderHandled = async (reminderId: string) => {
    try {
      await fetch('/api/reminders', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: reminderId, isHandled: true }) })
      fetchData()
      fetchAllReminders()
    } catch (e) { console.error('Mark handled error:', e) }
  }

  // Note handler
  const handleSaveNote = async (note: string) => {
    const conv = selectedConv
    if (!conv?.dbId) return
    try {
      await fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId: conv.dbId, note }) })
      setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, note } : c))
    } catch (e) { console.error('Save note error:', e) }
  }

  const filteredConversations = conversations.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesTags = filterTags.length === 0 || filterTags.some(tagId => c.tags.some(t => t.id === tagId))
    return matchesSearch && matchesTags
  })
  const selectedConv = conversations.find(c => c.id === selectedConvId)
  const selectedThreadId = extractThreadId(selectedConvId)
  const selectedMessages = messages.filter(m => { if (!selectedConvId) return false; if (m.conversationId === selectedConvId) return true; return extractThreadId(m.conversationId) === selectedThreadId }).sort((a, b) => (a.timestamp ? new Date(a.timestamp).getTime() : 0) - (b.timestamp ? new Date(b.timestamp).getTime() : 0))
  const activeRemindersCount = allReminders.filter(r => !r.is_handled && new Date(r.reminder_at) <= new Date()).length

  return (
    <div className="h-screen flex bg-white">
      <iframe ref={iframeRef} src="https://www.linkedin.com/messaging/" className={`fixed inset-0 w-full h-full border-0 z-50 ${showLinkedIn ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onLoad={() => setIframeLoaded(true)} />

      {/* Sidebar */}
      <div className="w-80 border-r border-gray-200 flex flex-col bg-gray-50/50">
        <div className="p-4 border-b border-gray-200 bg-white">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-semibold text-gray-900">Messages</h1>
            <div className="flex items-center gap-3">
              <div className="relative group cursor-default" title={iframeLoaded ? 'Connecté' : 'Connexion...'}>
                <span className={`block w-2.5 h-2.5 rounded-full ${iframeLoaded ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs font-medium text-white bg-gray-900 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                  {iframeLoaded ? 'Connecté' : 'Connexion...'}
                </span>
              </div>
              <button onClick={handleSync} disabled={isLoading} className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors" title="Rafraîchir">
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
              <button onClick={() => setShowRemindersModal(true)} className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors" title="Rappels">
                <Bell className="w-4 h-4" />
                {activeRemindersCount > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">{activeRemindersCount}</span>}
              </button>
{/*<button onClick={() => setShowLinkedIn(!showLinkedIn)} className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${showLinkedIn ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                LinkedIn
              </button>*/}
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input type="text" placeholder="Rechercher une conversation..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-10 pr-10 py-2.5 bg-gray-100 border-0 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all" />
            <button onClick={() => setShowFilterMenu(!showFilterMenu)} className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-colors ${filterTags.length > 0 ? 'text-blue-600 bg-blue-50' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-200'}`} title="Filtrer par tags">
              <Filter className="w-4 h-4" />
            </button>
          </div>
          {showFilterMenu && (
            <div className="mt-3 p-2 bg-gray-100 rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-500 px-1">Filtrer par tags</span>
                {filterTags.length > 0 && (
                  <button onClick={() => setFilterTags([])} className="text-xs text-blue-600 hover:text-blue-700">
                    Effacer
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {allTags.map(tag => (
                  <button key={tag.id} onClick={() => setFilterTags(prev => prev.includes(tag.id) ? prev.filter(id => id !== tag.id) : [...prev, tag.id])}
                    className={`px-2.5 py-1 text-xs font-medium rounded-full transition-all ${filterTags.includes(tag.id) ? 'text-white shadow-sm' : 'bg-white hover:opacity-80'}`}
                    style={{ backgroundColor: filterTags.includes(tag.id) ? tag.color : undefined, color: filterTags.includes(tag.id) ? 'white' : tag.color }}>
                    {tag.name}
                  </button>
                ))}
                {allTags.length === 0 && <span className="text-xs text-gray-400 px-1">Aucun tag disponible</span>}
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredConversations.length === 0 ? (
            <div className="p-8 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center">
                {filterTags.length > 0 ? <Filter className="w-8 h-8 text-gray-400" /> : <MessageSquare className="w-8 h-8 text-gray-400" />}
              </div>
              <p className="text-gray-500 font-medium">
                {filterTags.length > 0 ? 'Aucune conversation avec ces tags' : 'Aucune conversation'}
              </p>
              {filterTags.length > 0 && (
                <button onClick={() => setFilterTags([])} className="mt-2 text-sm text-blue-600 hover:text-blue-700">
                  Effacer les filtres
                </button>
              )}
            </div>
          ) : (
            <div className="py-2">
              {filteredConversations.map(conv => (
                <button key={conv.id} onClick={() => { setSelectedConvId(conv.id); setConversations(prev => prev.map(c => c.id === conv.id ? { ...c, unreadCount: 0 } : c)); fetch('/api/sync', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'mark_read', conversationId: conv.id }) }).catch(console.error) }}
                  className={`w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-100 transition-colors ${selectedConvId === conv.id ? 'bg-blue-50 hover:bg-blue-50' : ''} ${conv.reminder?.isTriggered ? 'bg-red-50' : ''}`}>
                  <div className="relative flex-shrink-0">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 overflow-hidden">
                      {conv.avatarUrl ? <img src={conv.avatarUrl} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-500 font-medium text-lg">{conv.name.charAt(0).toUpperCase()}</div>}
                    </div>
                    {(conv.unreadCount > 0 || conv.reminder?.isTriggered) && (
                      <span className={`absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 text-white text-xs font-medium rounded-full flex items-center justify-center ${conv.reminder?.isTriggered ? 'bg-red-500' : 'bg-blue-600'}`}>
                        {conv.reminder?.isTriggered ? <Bell className="w-3 h-3" /> : conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`font-medium truncate ${conv.unreadCount > 0 ? 'text-gray-900' : 'text-gray-700'}`}>{conv.name}</span>
                      <span className="text-xs text-gray-400 flex-shrink-0">{formatTime(conv.lastMessageTime)}</span>
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      {conv.tags.slice(0, 2).map(tag => <span key={tag.id} className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />)}
                      {conv.tags.length > 2 && <span className="text-[10px] text-gray-400">+{conv.tags.length - 2}</span>}
                      <p className={`text-sm truncate ${conv.unreadCount > 0 ? 'text-gray-600 font-medium' : 'text-gray-400'}`}>{conv.lastMessagePreview || 'Aucun message'}</p>
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
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-white">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 overflow-hidden">
                  {selectedConv.avatarUrl ? <img src={selectedConv.avatarUrl} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-500 font-medium">{selectedConv.name.charAt(0).toUpperCase()}</div>}
                </div>
                <div>
                  <h2 className="font-semibold text-gray-900">{selectedConv.name}</h2>
                  {selectedConv.tags.length > 0 && (
                    <div className="flex items-center gap-1 mt-1">
                      {selectedConv.tags.map(tag => (
                        <span key={tag.id} className="px-2 py-0.5 text-[11px] font-medium rounded-full text-white" style={{ backgroundColor: tag.color }}>{tag.name}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {selectedConv.reminder?.isTriggered && (
                  <button onClick={() => handleMarkReminderHandled(selectedConv.reminder!.id)} className="px-3 py-1.5 text-xs font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors flex items-center gap-1">
                    <Check className="w-3 h-3" /> Traité
                  </button>
                )}
                <div className="relative">
                  <button onClick={() => { setShowTagSelector(!showTagSelector); setShowReminderPopup(false) }} className={`p-2 rounded-lg transition-colors ${showTagSelector ? 'bg-blue-100 text-blue-600' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`} title="Tags">
                    <Tag className="w-5 h-5" />
                  </button>
                  {showTagSelector && <TagSelector allTags={allTags} selectedTags={selectedConv.tags} onToggleTag={handleToggleTag} onCreateTag={handleCreateTag} onClose={() => setShowTagSelector(false)} />}
                </div>
                <div className="relative">
                  <button onClick={() => { setShowReminderPopup(!showReminderPopup); setShowTagSelector(false) }} className={`p-2 rounded-lg transition-colors ${showReminderPopup ? 'bg-blue-100 text-blue-600' : selectedConv.reminder ? 'text-amber-500 hover:bg-amber-50' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`} title="Rappel">
                    <Bell className="w-5 h-5" />
                  </button>
                  {showReminderPopup && <ReminderPopup currentReminder={selectedConv.reminder} onSetReminder={handleSetReminder} onDeleteReminder={() => handleDeleteReminder()} onClose={() => setShowReminderPopup(false)} />}
                </div>
              </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
              <div className="flex-1 flex flex-col">
                <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-6 py-4">
                  {selectedMessages.length === 0 ? (
                    <div className="h-full flex items-center justify-center"><div className="text-center"><div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 flex items-center justify-center"><MessageSquare className="w-8 h-8 text-gray-400" /></div><p className="text-gray-500 font-medium">Aucun message</p></div></div>
                  ) : (
                    <div className="space-y-4">
                      {selectedMessages.map((msg, index) => {
                        const currentDate = msg.timestamp ? new Date(msg.timestamp).toDateString() : null
                        const prevDate = selectedMessages[index - 1]?.timestamp ? new Date(selectedMessages[index - 1].timestamp!).toDateString() : null
                        const showDateSeparator = index === 0 || (currentDate && currentDate !== prevDate)
                        return (
                          <div key={`${msg.id}-${index}`}>
                            {showDateSeparator && msg.timestamp && (
                              <div className="flex justify-center my-4"><span className="px-3 py-1 bg-gray-100 text-gray-500 text-xs font-medium rounded-full">{new Date(msg.timestamp).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</span></div>
                            )}
                            <div className={`flex ${msg.isFromMe ? 'justify-end' : 'justify-start'}`}>
                              <div className={`max-w-[70%]`}>
                                {msg.attachments?.map((att: any, i: number) => (
                                  <div key={i} className="mb-2">
                                    {att.type === 'image' && <ImageAttachment url={att.url} />}
                                    {att.type === 'file' && <FileAttachment name={att.name} size={att.size} url={att.url} />}
                                    {att.type === 'audio' && <AudioPlayer url={att.url} />}
                                    {att.type === 'video' && <video controls className="max-w-full rounded-xl"><source src={att.url} type="video/mp4" /></video>}
                                  </div>
                                ))}
                                {msg.content && (
                                  <div className={`px-4 py-2.5 rounded-2xl ${msg.isFromMe ? 'bg-blue-600 text-white rounded-br-md' : 'bg-gray-100 text-gray-900 rounded-bl-md'}`}>
                                    <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                                  </div>
                                )}
                                <div className={`flex items-center gap-1 mt-1 ${msg.isFromMe ? 'justify-end' : 'justify-start'}`}>
                                  <span className="text-[11px] text-gray-400">{msg.timestamp && new Date(msg.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                                  {msg.isFromMe && <CheckCheck className="w-3.5 h-3.5 text-blue-500" />}
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div className="px-6 py-4 border-t border-gray-200 bg-white">
                  {selectedFile && (
                    <div className="mb-3 p-3 bg-gray-50 rounded-xl flex items-center gap-3">
                      {filePreview ? <img src={filePreview} alt="Preview" className="w-14 h-14 object-cover rounded-lg" /> : <div className="w-14 h-14 bg-gray-200 rounded-lg flex items-center justify-center"><FileText className="w-6 h-6 text-gray-400" /></div>}
                      <div className="flex-1 min-w-0"><p className="font-medium text-gray-900 truncate text-sm">{selectedFile.name}</p><p className="text-xs text-gray-400">{(selectedFile.size / 1024).toFixed(1)} KB</p></div>
                      <button onClick={clearSelectedFile} className="p-1.5 hover:bg-gray-200 rounded-lg transition-colors"><X className="w-4 h-4 text-gray-500" /></button>
                    </div>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,audio/*" onChange={handleFileSelect} className="hidden" />
                  <div className="flex items-end gap-3">
                    <button onClick={() => fileInputRef.current?.click()} disabled={isSending} className="p-2.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors disabled:opacity-50"><Paperclip className="w-5 h-5" /></button>
                    <div className="flex-1"><input type="text" placeholder="Écrivez votre message..." value={newMessage} onChange={e => setNewMessage(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage() } }} disabled={isSending} className="w-full px-4 py-3 bg-gray-100 border-0 rounded-xl text-[15px] text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all disabled:opacity-50" /></div>
                    <button onClick={handleSendMessage} disabled={isSending || (!newMessage.trim() && !selectedFile)} className="p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">{isSending ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}</button>
                  </div>
                </div>
              </div>

              <NotesPanel note={selectedConv.note} conversationId={selectedConv.id} onSave={handleSaveNote} />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-gray-50/50">
            <div className="text-center"><div className="w-20 h-20 mx-auto mb-6 rounded-full bg-white shadow-sm flex items-center justify-center"><MessageSquare className="w-10 h-10 text-gray-300" /></div><h3 className="text-xl font-semibold text-gray-900 mb-2">Bienvenue</h3><p className="text-gray-500">Sélectionnez une conversation pour commencer</p></div>
          </div>
        )}
      </div>

      {showRemindersModal && <RemindersListModal reminders={allReminders} onMarkHandled={handleMarkReminderHandled} onDelete={handleDeleteReminder} onClose={() => setShowRemindersModal(false)} />}
    </div>
  )
}
