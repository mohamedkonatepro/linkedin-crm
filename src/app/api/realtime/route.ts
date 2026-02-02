import { NextRequest, NextResponse } from 'next/server'
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

// Store realtime messages in a temporary file (for simplicity)
// In production, you'd use Redis, WebSocket, or SSE
const DATA_DIR = join(process.cwd(), 'data')
const REALTIME_FILE = join(DATA_DIR, 'realtime-messages.json')

interface RealtimeMessage {
  urn: string
  conversationId: string
  content: string
  timestamp: string
  sender?: string
  participantName?: string
  attachments?: any[] | null
  receivedAt: string
}

interface RealtimeData {
  messages: RealtimeMessage[]
  lastUpdate: string
}

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true })
  }
}

function getRealtimeData(): RealtimeData {
  ensureDataDir()
  if (!existsSync(REALTIME_FILE)) {
    return { messages: [], lastUpdate: new Date().toISOString() }
  }
  try {
    return JSON.parse(readFileSync(REALTIME_FILE, 'utf-8'))
  } catch {
    return { messages: [], lastUpdate: new Date().toISOString() }
  }
}

function saveRealtimeData(data: RealtimeData) {
  ensureDataDir()
  writeFileSync(REALTIME_FILE, JSON.stringify(data, null, 2))
}

// POST: Receive new messages from extension
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    if (body.type === 'new_messages' && Array.isArray(body.messages)) {
      const data = getRealtimeData()
      const now = new Date().toISOString()
      
      // Add new messages (avoid duplicates by URN)
      const existingUrns = new Set(data.messages.map(m => m.urn))
      const newMessages = body.messages
        .filter((m: any) => !existingUrns.has(m.urn))
        .map((m: any) => ({
          ...m,
          receivedAt: now
        }))
      
      if (newMessages.length > 0) {
        data.messages = [...newMessages, ...data.messages]
        // Keep only last 100 messages
        data.messages = data.messages.slice(0, 100)
        data.lastUpdate = now
        saveRealtimeData(data)
        
        console.log(`⚡ Realtime: Stored ${newMessages.length} new message(s)`)
      }
      
      return NextResponse.json({ 
        ok: true, 
        added: newMessages.length,
        total: data.messages.length 
      })
    }
    
    return NextResponse.json({ ok: false, error: 'Invalid payload' }, { status: 400 })
  } catch (error) {
    console.error('Realtime API error:', error)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 })
  }
}

// GET: Fetch recent realtime messages (for CRM polling or SSE)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const since = searchParams.get('since') // ISO timestamp
    const limit = parseInt(searchParams.get('limit') || '50')
    const clear = searchParams.get('clear') === 'true'
    
    const data = getRealtimeData()
    
    let messages = data.messages
    
    // Filter by timestamp if provided
    if (since) {
      const sinceDate = new Date(since)
      messages = messages.filter(m => new Date(m.receivedAt) > sinceDate)
    }
    
    // Limit results
    messages = messages.slice(0, limit)
    
    // Optionally clear after reading (for "consume" pattern)
    if (clear && messages.length > 0) {
      const returnedUrns = new Set(messages.map(m => m.urn))
      data.messages = data.messages.filter(m => !returnedUrns.has(m.urn))
      saveRealtimeData(data)
    }
    
    return NextResponse.json({
      ok: true,
      messages,
      count: messages.length,
      lastUpdate: data.lastUpdate
    })
  } catch (error) {
    console.error('Realtime API error:', error)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 })
  }
}
