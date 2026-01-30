'use client'

import { useCRMStore } from '@/store'
import { 
  Menu, 
  Search, 
  Bell, 
  Settings,
  RefreshCw 
} from 'lucide-react'

export function Header() {
  const { toggleSidebar, searchQuery, setSearchQuery, isLoading } = useCRMStore()

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center px-4 gap-4">
      {/* Menu toggle */}
      <button 
        onClick={toggleSidebar}
        className="p-2 hover:bg-gray-100 rounded-lg hidden lg:block"
      >
        <Menu className="w-5 h-5 text-gray-600" />
      </button>
      
      {/* Logo */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
          <span className="text-white font-bold text-sm">Li</span>
        </div>
        <span className="font-semibold text-gray-900 hidden sm:block">
          LinkedIn CRM
        </span>
      </div>
      
      {/* Search */}
      <div className="flex-1 max-w-xl mx-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher des conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-100 border border-transparent rounded-lg text-sm focus:outline-none focus:border-blue-500 focus:bg-white transition-colors"
          />
        </div>
      </div>
      
      {/* Actions */}
      <div className="flex items-center gap-2">
        <button className="p-2 hover:bg-gray-100 rounded-lg relative">
          <Bell className="w-5 h-5 text-gray-600" />
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
        </button>
        
        <button 
          className={`p-2 hover:bg-gray-100 rounded-lg ${isLoading ? 'animate-spin' : ''}`}
          disabled={isLoading}
        >
          <RefreshCw className="w-5 h-5 text-gray-600" />
        </button>
        
        <button className="p-2 hover:bg-gray-100 rounded-lg">
          <Settings className="w-5 h-5 text-gray-600" />
        </button>
        
        {/* User avatar */}
        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white text-sm font-medium ml-2">
          M
        </div>
      </div>
    </header>
  )
}
