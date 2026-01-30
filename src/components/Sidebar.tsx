'use client'

import { useCRMStore } from '@/store'
import { 
  MessageSquare, 
  Users, 
  Star, 
  Archive,
  Tag,
  Filter,
  ChevronDown
} from 'lucide-react'

const priorities = [
  { value: 2, label: 'Urgent', color: 'bg-red-500' },
  { value: 1, label: 'Haute', color: 'bg-orange-500' },
  { value: 0, label: 'Normale', color: 'bg-gray-400' },
]

export function Sidebar() {
  const { 
    conversations,
    showUnreadOnly,
    showStarredOnly,
    filterPriority,
    toggleUnreadOnly,
    toggleStarredOnly,
    setFilterPriority,
    tags,
    filterTags,
    setFilterTags
  } = useCRMStore()

  const unreadCount = conversations.filter(c => c.is_unread).length
  const starredCount = conversations.filter(c => c.is_starred).length

  return (
    <div className="h-full flex flex-col">
      {/* Navigation */}
      <nav className="p-4 space-y-1">
        <button 
          onClick={() => {
            toggleUnreadOnly()
            if (showStarredOnly) toggleStarredOnly()
          }}
          className={`
            w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm
            ${showUnreadOnly 
              ? 'bg-blue-50 text-blue-700' 
              : 'text-gray-700 hover:bg-gray-100'
            }
          `}
        >
          <MessageSquare className="w-5 h-5" />
          <span className="flex-1 text-left">Non lus</span>
          {unreadCount > 0 && (
            <span className="px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full">
              {unreadCount}
            </span>
          )}
        </button>
        
        <button 
          onClick={() => {
            toggleStarredOnly()
            if (showUnreadOnly) toggleUnreadOnly()
          }}
          className={`
            w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm
            ${showStarredOnly 
              ? 'bg-yellow-50 text-yellow-700' 
              : 'text-gray-700 hover:bg-gray-100'
            }
          `}
        >
          <Star className="w-5 h-5" />
          <span className="flex-1 text-left">Favoris</span>
          {starredCount > 0 && (
            <span className="px-2 py-0.5 bg-yellow-500 text-white text-xs rounded-full">
              {starredCount}
            </span>
          )}
        </button>
        
        <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100">
          <Archive className="w-5 h-5" />
          <span className="flex-1 text-left">Archivés</span>
        </button>
        
        <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100">
          <Users className="w-5 h-5" />
          <span className="flex-1 text-left">Contacts</span>
        </button>
      </nav>
      
      {/* Divider */}
      <div className="px-4 py-2">
        <div className="border-t border-gray-200"></div>
      </div>
      
      {/* Filters */}
      <div className="px-4 space-y-4">
        {/* Priority filter */}
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase mb-2">
            <Filter className="w-3.5 h-3.5" />
            Priorité
          </div>
          <div className="space-y-1">
            {priorities.map((p) => (
              <button
                key={p.value}
                onClick={() => setFilterPriority(filterPriority === p.value ? null : p.value)}
                className={`
                  w-full flex items-center gap-2 px-3 py-1.5 rounded text-sm
                  ${filterPriority === p.value 
                    ? 'bg-gray-100 text-gray-900' 
                    : 'text-gray-600 hover:bg-gray-50'
                  }
                `}
              >
                <span className={`w-2 h-2 rounded-full ${p.color}`}></span>
                {p.label}
              </button>
            ))}
          </div>
        </div>
        
        {/* Tags */}
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-gray-500 uppercase mb-2">
            <Tag className="w-3.5 h-3.5" />
            Tags
          </div>
          <div className="flex flex-wrap gap-1">
            {tags.length > 0 ? (
              tags.map((tag) => (
                <button
                  key={tag.id}
                  onClick={() => {
                    if (filterTags.includes(tag.name)) {
                      setFilterTags(filterTags.filter(t => t !== tag.name))
                    } else {
                      setFilterTags([...filterTags, tag.name])
                    }
                  }}
                  className={`
                    px-2 py-1 rounded text-xs
                    ${filterTags.includes(tag.name)
                      ? 'text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }
                  `}
                  style={filterTags.includes(tag.name) ? { backgroundColor: tag.color } : {}}
                >
                  {tag.name}
                </button>
              ))
            ) : (
              <span className="text-xs text-gray-400">Aucun tag</span>
            )}
          </div>
        </div>
      </div>
      
      {/* Bottom spacer */}
      <div className="flex-1"></div>
      
      {/* Sync status */}
      <div className="p-4 border-t border-gray-200">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
          Extension connectée
        </div>
      </div>
    </div>
  )
}
