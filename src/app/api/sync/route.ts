import { NextRequest, NextResponse } from 'next/server'
import { supabase, extractThreadId, DbConversation, DbMessage } from '@/lib/supabase/db'
import type { SyncData, SyncConversation, SyncMessage } from '@/types'

// CORS headers for Chrome extension
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS(request: NextRequest) {
  return NextResponse.json({}, { headers: corsHeaders })
}

// POST: Sync full data from extension
export async function POST(request: NextRequest) {
  try {
    const data: SyncData = await request.json()

    let conversationsSynced = 0
    let messagesSynced = 0

    // Sync conversations
    for (const conv of data.conversations || []) {
      if (!conv.threadId) continue

      const threadId = extractThreadId(conv.threadId)

      const { error } = await supabase
        .from('conversations')
        .upsert({
          linkedin_thread_id: threadId,
          contact_linkedin_id: conv.linkedinId,
          contact_name: conv.name || 'Unknown',
          contact_avatar_url: conv.avatarUrl,
          contact_headline: (conv as any).headline || null,
          is_starred: conv.isStarred || false,
          is_read: !conv.isActive,
          last_message_preview: conv.lastMessagePreview || null,
          last_message_at: conv.lastMessageTime || null,
          last_message_from_me: conv.lastMessageFromMe || false,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'linkedin_thread_id',
        })

      if (!error) conversationsSynced++
    }

    // Sync messages
    for (const msg of data.messages || []) {
      if (!msg.urn || msg.urn.startsWith('temp-')) continue

      const threadId = extractThreadId((msg as any).conversationId)

      // Find conversation
      const { data: conv } = await supabase
        .from('conversations')
        .select('id')
        .eq('linkedin_thread_id', threadId)
        .single()

      const { error } = await supabase
        .from('messages')
        .upsert({
          linkedin_message_urn: msg.urn,
          conversation_id: conv?.id || null,
          linkedin_thread_id: threadId,
          content: msg.content || '',
          is_from_me: msg.isFromMe || false,
          sent_at: msg.timestamp || new Date().toISOString(),
          attachments: msg.attachments || null,
        }, {
          onConflict: 'linkedin_message_urn',
        })

      if (!error) {
        messagesSynced++

        // Update conversation with latest message
        if (conv?.id && msg.timestamp) {
          const { data: currentConv } = await supabase
            .from('conversations')
            .select('last_message_at')
            .eq('id', conv.id)
            .single()

          const msgTime = new Date(msg.timestamp).getTime()
          const lastTime = currentConv?.last_message_at
            ? new Date(currentConv.last_message_at).getTime()
            : 0

          if (msgTime > lastTime) {
            await supabase
              .from('conversations')
              .update({
                last_message_preview: (msg.content || '').substring(0, 100),
                last_message_at: msg.timestamp,
                last_message_from_me: msg.isFromMe || false,
                // Only mark unread if it's a received message
                is_read: msg.isFromMe ? true : false,
                unread_count: msg.isFromMe ? 0 : 1,
              })
              .eq('id', conv.id)
          }
        }
      }
    }

    console.log('Sync received:', {
      conversations: conversationsSynced,
      messages: messagesSynced,
    })

    return NextResponse.json({
      ok: true,
      results: {
        conversations: { synced: conversationsSynced, errors: 0 },
        messages: { synced: messagesSynced, errors: 0 },
      },
      timestamp: new Date().toISOString(),
    }, { headers: corsHeaders })
  } catch (e) {
    console.error('Sync error:', e)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    )
  }
}

// GET: Retrieve all synced data
export async function GET(request: NextRequest) {
  try {
    // Get all conversations
    const { data: conversations, error: convError } = await supabase
      .from('conversations')
      .select('*')

    if (convError) throw convError

    // Get all messages ordered by sent_at DESC to easily find last message per conversation
    const { data: messages, error: msgError } = await supabase
      .from('messages')
      .select('*')
      .order('sent_at', { ascending: false })

    if (msgError) throw msgError

    // Group messages by conversation and find the last message for each
    const messagesByConv = new Map<string, DbMessage[]>()
    for (const msg of (messages || [])) {
      const convId = msg.conversation_id
      if (!convId) continue
      if (!messagesByConv.has(convId)) {
        messagesByConv.set(convId, [])
      }
      messagesByConv.get(convId)!.push(msg)
    }

    // Helper to get preview text from message (handles attachments)
    const getMessagePreview = (msg: DbMessage | undefined): string => {
      if (!msg) return ''
      if (msg.content) return msg.content

      // Check for attachments
      if (msg.attachments && Array.isArray(msg.attachments) && msg.attachments.length > 0) {
        const att = msg.attachments[0]
        if (att.type === 'image') return '📷 Photo'
        if (att.type === 'audio') return '🎵 Audio'
        if (att.type === 'video') return '🎬 Vidéo'
        if (att.type === 'file') return '📎 ' + (att.name || 'Fichier')
        return '📎 Pièce jointe'
      }

      return ''
    }

    // Transform conversations with computed lastMessagePreview from actual messages
    const syncConversations = (conversations || []).map((conv: DbConversation, index: number) => {
      const convMessages = messagesByConv.get(conv.id) || []
      const lastMessage = convMessages[0] // Already sorted DESC, so first is newest

      return {
        index,
        threadId: `urn:li:msg_conversation:${conv.linkedin_thread_id}`,
        linkedinId: conv.contact_linkedin_id,
        name: conv.contact_name,
        avatarUrl: conv.contact_avatar_url,
        headline: conv.contact_headline,
        // Use actual last message content, with attachment fallback
        lastMessagePreview: getMessagePreview(lastMessage) || conv.last_message_preview || '',
        lastMessageTime: lastMessage?.sent_at || conv.last_message_at,
        isUnread: !conv.is_read,
        isStarred: conv.is_starred,
        isActive: false,
        lastMessageFromMe: lastMessage?.is_from_me ?? conv.last_message_from_me,
        // Reset unread count on page load - will be incremented by realtime
        unreadCount: 0,
      }
    })

    // Sort conversations by lastMessageTime DESC
    syncConversations.sort((a, b) => {
      const timeA = a.lastMessageTime ? new Date(a.lastMessageTime).getTime() : 0
      const timeB = b.lastMessageTime ? new Date(b.lastMessageTime).getTime() : 0
      return timeB - timeA
    })

    // Transform messages (sorted ASC for display)
    const syncMessages = (messages || []).reverse().map((msg: DbMessage, index: number) => {
      const conv = (conversations || []).find((c: DbConversation) => c.id === msg.conversation_id)

      return {
        index,
        urn: msg.linkedin_message_urn,
        conversationId: conv
          ? `urn:li:msg_conversation:${conv.linkedin_thread_id}`
          : `urn:li:msg_conversation:${msg.linkedin_thread_id}`,
        content: msg.content || '',
        isFromMe: msg.is_from_me,
        timestamp: msg.sent_at,
        attachments: msg.attachments,
        sender: { name: null, linkedinId: null, avatarUrl: null },
      }
    })

    return NextResponse.json({
      ok: true,
      data: {
        type: 'full',
        timestamp: new Date().toISOString(),
        conversations: syncConversations,
        messages: syncMessages,
        currentConversation: null,
      },
    }, { headers: corsHeaders })
  } catch (e) {
    console.error('GET sync error:', e)
    return NextResponse.json({
      ok: true,
      data: null,
      message: 'No data synced yet',
    }, { headers: corsHeaders })
  }
}

// PATCH: Add a single message (for optimistic updates or realtime)
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()

    if (body.type === 'add_message' && body.message) {
      const msg = body.message
      const threadId = extractThreadId(msg.conversationId)

      // Skip temp messages - they will be replaced by real ones
      if (msg.urn?.startsWith('temp-')) {
        return NextResponse.json({ ok: true, skipped: true }, { headers: corsHeaders })
      }

      // Check if message already exists
      const { data: existing } = await supabase
        .from('messages')
        .select('id')
        .eq('linkedin_message_urn', msg.urn)
        .single()

      if (existing) {
        return NextResponse.json({ ok: true, exists: true }, { headers: corsHeaders })
      }

      // Find or create conversation
      let { data: conv } = await supabase
        .from('conversations')
        .select('id')
        .eq('linkedin_thread_id', threadId)
        .single()

      if (!conv) {
        // Create conversation if it doesn't exist
        const { data: newConv } = await supabase
          .from('conversations')
          .insert({
            linkedin_thread_id: threadId,
            contact_name: msg.participantName || 'Unknown',
            contact_linkedin_id: msg.sender || null,
            is_read: msg.isFromMe,
            unread_count: msg.isFromMe ? 0 : 1,
            last_message_preview: (msg.content || '').substring(0, 100),
            last_message_at: msg.timestamp,
            last_message_from_me: msg.isFromMe,
          })
          .select('id')
          .single()

        conv = newConv
      }

      // Insert message
      const { error } = await supabase
        .from('messages')
        .insert({
          linkedin_message_urn: msg.urn,
          conversation_id: conv?.id || null,
          linkedin_thread_id: threadId,
          content: msg.content || '',
          is_from_me: msg.isFromMe || false,
          sent_at: msg.timestamp || new Date().toISOString(),
          attachments: msg.attachments || null,
        })

      if (error) throw error

      // Update conversation with latest message
      if (conv?.id) {
        await supabase
          .from('conversations')
          .update({
            last_message_preview: (msg.content || '').substring(0, 100),
            last_message_at: msg.timestamp,
            last_message_from_me: msg.isFromMe || false,
            is_read: msg.isFromMe ? true : false,
            unread_count: msg.isFromMe ? 0 : 1, // Reset to 1 for received messages
          })
          .eq('id', conv.id)
      }

      console.log('Message added via PATCH:', msg.urn)
      return NextResponse.json({ ok: true }, { headers: corsHeaders })
    }

    // Mark conversation as read
    if (body.type === 'mark_read' && body.conversationId) {
      const threadId = extractThreadId(body.conversationId)

      await supabase
        .from('conversations')
        .update({ is_read: true, unread_count: 0 })
        .eq('linkedin_thread_id', threadId)

      return NextResponse.json({ ok: true }, { headers: corsHeaders })
    }

    return NextResponse.json({ ok: false, error: 'Invalid payload' }, { status: 400, headers: corsHeaders })
  } catch (e) {
    console.error('PATCH error:', e)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    )
  }
}
