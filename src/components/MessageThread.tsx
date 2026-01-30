'use client'

import { useState, useRef, useEffect } from 'react'
import { useCRMStore } from '@/store'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { 
  Send, 
  Paperclip, 
  Smile, 
  MoreVertical,
  Star,
  Archive,
  Tag,
  ExternalLink,
  Check,
  CheckCheck
} from 'lucide-react'

export function MessageThread() {
  const { selectedConversationId, conversations, messages } = useCRMStore()
  const [newMessage, setNewMessage] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  
  const conversation = conversations.find(c => c.id === selectedConversationId)
  const contact = conversation?.contact
  
  const threadMessages = messages.filter(
    m => m.conversation_id === selectedConversationId
  ).sort((a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime())

  // Auto scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [threadMessages])

  if (!conversation) {
    return null
  }

  const handleSend = () => {
    if (!newMessage.trim()) return
    // TODO: Implement send via LinkedIn
    console.log('Send message:', newMessage)
    setNewMessage('')
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="h-16 px-4 flex items-center justify-between bg-white border-b border-gray-200">
        <div className="flex items-center gap-3">
          {contact?.avatar_url ? (
            <img
              src={contact.avatar_url}
              alt={contact.name}
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-medium">
              {contact?.name?.[0] || '?'}
            </div>
          )}
          
          <div>
            <h3 className="font-semibold text-gray-900">
              {contact?.name || 'Contact inconnu'}
            </h3>
            {contact?.headline && (
              <p className="text-sm text-gray-500 truncate max-w-xs">
                {contact.headline}
              </p>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <a
            href={contact?.profile_url || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 hover:bg-gray-100 rounded-lg"
            title="Voir sur LinkedIn"
          >
            <ExternalLink className="w-5 h-5 text-gray-500" />
          </a>
          
          <button className="p-2 hover:bg-gray-100 rounded-lg" title="Favori">
            <Star className={`w-5 h-5 ${conversation.is_starred ? 'text-yellow-500 fill-yellow-500' : 'text-gray-500'}`} />
          </button>
          
          <button className="p-2 hover:bg-gray-100 rounded-lg" title="Tags">
            <Tag className="w-5 h-5 text-gray-500" />
          </button>
          
          <button className="p-2 hover:bg-gray-100 rounded-lg" title="Plus">
            <MoreVertical className="w-5 h-5 text-gray-500" />
          </button>
        </div>
      </div>
      
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {threadMessages.length > 0 ? (
          <>
            {threadMessages.map((message, index) => {
              const showDate = index === 0 || 
                format(new Date(message.sent_at), 'yyyy-MM-dd') !== 
                format(new Date(threadMessages[index - 1].sent_at), 'yyyy-MM-dd')
              
              return (
                <div key={message.id}>
                  {showDate && (
                    <div className="flex items-center justify-center my-4">
                      <span className="px-3 py-1 bg-gray-100 text-gray-500 text-xs rounded-full">
                        {format(new Date(message.sent_at), 'EEEE d MMMM yyyy', { locale: fr })}
                      </span>
                    </div>
                  )}
                  
                  <MessageBubble message={message} />
                </div>
              )
            })}
            <div ref={messagesEndRef} />
          </>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-400">
            <p>Aucun message dans cette conversation</p>
          </div>
        )}
      </div>
      
      {/* Input */}
      <div className="p-4 bg-white border-t border-gray-200">
        <div className="flex items-end gap-3">
          <button className="p-2 hover:bg-gray-100 rounded-lg">
            <Paperclip className="w-5 h-5 text-gray-500" />
          </button>
          
          <div className="flex-1">
            <textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder="Écris ton message..."
              rows={1}
              className="w-full px-4 py-2 bg-gray-100 border border-transparent rounded-lg resize-none focus:outline-none focus:border-blue-500 focus:bg-white transition-colors"
            />
          </div>
          
          <button className="p-2 hover:bg-gray-100 rounded-lg">
            <Smile className="w-5 h-5 text-gray-500" />
          </button>
          
          <button 
            onClick={handleSend}
            disabled={!newMessage.trim()}
            className="p-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white rounded-lg transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
        
        <p className="text-xs text-gray-400 mt-2 text-center">
          Les messages sont envoyés via l'extension Chrome
        </p>
      </div>
    </div>
  )
}

interface MessageBubbleProps {
  message: any
}

function MessageBubble({ message }: MessageBubbleProps) {
  const isFromMe = message.is_from_me
  
  return (
    <div className={`flex ${isFromMe ? 'justify-end' : 'justify-start'}`}>
      <div 
        className={`
          max-w-[70%] px-4 py-2 rounded-2xl
          ${isFromMe 
            ? 'bg-blue-600 text-white rounded-br-md' 
            : 'bg-gray-100 text-gray-900 rounded-bl-md'
          }
        `}
      >
        <p className="whitespace-pre-wrap break-words">{message.content}</p>
        
        <div className={`flex items-center justify-end gap-1 mt-1 ${isFromMe ? 'text-blue-200' : 'text-gray-400'}`}>
          <span className="text-xs">
            {format(new Date(message.sent_at), 'HH:mm')}
          </span>
          {isFromMe && (
            message.is_read 
              ? <CheckCheck className="w-3.5 h-3.5" />
              : <Check className="w-3.5 h-3.5" />
          )}
        </div>
      </div>
    </div>
  )
}
