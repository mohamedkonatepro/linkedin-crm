'use client'

import { useCRMStore } from '@/store'
import { formatDistanceToNow } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Star, Circle } from 'lucide-react'

export function ConversationList() {
  const {
    conversations: allConversations,
    filteredConversations,
    selectedConversationId,
    selectConversation,
    searchQuery,
    showUnreadOnly,
    showStarredOnly,
    filterPriority,
    filterTags,
    filterStatus,
  } = useCRMStore()

  // Subscribe to conversations AND filters to trigger re-renders
  const conversations = filteredConversations()

  console.log('ConversationList render:', allConversations.length, 'total,', conversations.length, 'filtered')

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <h2 className="font-semibold text-gray-900">Conversations</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          {conversations.length} conversation{conversations.length !== 1 ? 's' : ''}
        </p>
      </div>
      
      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {conversations.length > 0 ? (
          conversations.map((conversation) => (
            <ConversationItem
              key={conversation.id}
              conversation={conversation}
              isSelected={selectedConversationId === conversation.id}
              onClick={() => selectConversation(conversation.id)}
            />
          ))
        ) : (
          <div className="p-8 text-center text-gray-400">
            <p>Aucune conversation</p>
            <p className="text-sm mt-1">Synchronise LinkedIn pour voir tes messages</p>
          </div>
        )}
      </div>
    </div>
  )
}

interface ConversationItemProps {
  conversation: any
  isSelected: boolean
  onClick: () => void
}

function ConversationItem({ conversation, isSelected, onClick }: ConversationItemProps) {
  const contact = conversation.contact
  
  const timeAgo = conversation.last_message_at
    ? formatDistanceToNow(new Date(conversation.last_message_at), { 
        addSuffix: true, 
        locale: fr 
      })
    : null

  return (
    <button
      onClick={onClick}
      className={`
        w-full p-4 flex gap-3 text-left border-b border-gray-50
        transition-colors
        ${isSelected 
          ? 'bg-blue-50 border-l-2 border-l-blue-600' 
          : 'hover:bg-gray-50'
        }
      `}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        {contact?.avatar_url ? (
          <img
            src={contact.avatar_url}
            alt={contact.name}
            className="w-12 h-12 rounded-full object-cover"
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-medium">
            {contact?.name?.[0] || '?'}
          </div>
        )}
        
        {/* Unread indicator */}
        {conversation.is_unread && (
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-blue-600 rounded-full border-2 border-white"></span>
        )}
      </div>
      
      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={`font-medium truncate ${conversation.is_unread ? 'text-gray-900' : 'text-gray-700'}`}>
            {contact?.name || 'Contact inconnu'}
          </span>
          
          <div className="flex items-center gap-1">
            {conversation.is_starred && (
              <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
            )}
            {timeAgo && (
              <span className="text-xs text-gray-400 whitespace-nowrap">
                {timeAgo}
              </span>
            )}
          </div>
        </div>
        
        {/* Headline */}
        {contact?.headline && (
          <p className="text-xs text-gray-500 truncate mt-0.5">
            {contact.headline}
          </p>
        )}
        
        {/* Last message */}
        <p className={`text-sm truncate mt-1 ${conversation.is_unread ? 'text-gray-700' : 'text-gray-500'}`}>
          {conversation.last_message_from_me && (
            <span className="text-gray-400">Vous: </span>
          )}
          {conversation.last_message_preview || 'Pas de message'}
        </p>
        
        {/* Tags & Priority */}
        <div className="flex items-center gap-2 mt-2">
          {contact?.priority === 2 && (
            <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-xs rounded">
              Urgent
            </span>
          )}
          {contact?.priority === 1 && (
            <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 text-xs rounded">
              Prioritaire
            </span>
          )}
          {contact?.tags?.slice(0, 2).map((tag: string) => (
            <span key={tag} className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
              {tag}
            </span>
          ))}
          {(contact?.tags?.length || 0) > 2 && (
            <span className="text-xs text-gray-400">
              +{contact.tags.length - 2}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}
