import { NextRequest, NextResponse } from 'next/server'
import { supabase, extractThreadId } from '@/lib/supabase/db'

// POST: Receive new messages from extension (realtime)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    if (body.type === 'new_messages' && Array.isArray(body.messages)) {
      let added = 0

      for (const msg of body.messages) {
        // Skip if no URN or temp message
        if (!msg.urn || msg.urn.startsWith('temp-')) continue

        const threadId = extractThreadId(msg.conversationId)

        // Check if message already exists
        const { data: existing } = await supabase
          .from('messages')
          .select('id')
          .eq('linkedin_message_urn', msg.urn)
          .single()

        if (existing) continue

        // Find or create conversation
        let { data: conv } = await supabase
          .from('conversations')
          .select('id')
          .eq('linkedin_thread_id', threadId)
          .single()

        if (!conv) {
          // Create conversation
          const { data: newConv } = await supabase
            .from('conversations')
            .insert({
              linkedin_thread_id: threadId,
              contact_name: msg.participantName || 'Unknown',
              contact_linkedin_id: msg.sender || null,
              is_read: msg.isFromMe || false,
              unread_count: msg.isFromMe ? 0 : 1,
              last_message_preview: (msg.content || '').substring(0, 100),
              last_message_at: msg.timestamp,
              last_message_from_me: msg.isFromMe || false,
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

        if (!error) {
          added++

          // Update conversation with latest message info
          if (conv?.id) {
            // Get current conversation state
            const { data: currentConv } = await supabase
              .from('conversations')
              .select('last_message_at, unread_count')
              .eq('id', conv.id)
              .single()

            const msgTime = new Date(msg.timestamp || new Date()).getTime()
            const lastTime = currentConv?.last_message_at
              ? new Date(currentConv.last_message_at).getTime()
              : 0

            // Only update if this is a newer message
            if (msgTime >= lastTime) {
              const updates: any = {
                last_message_preview: (msg.content || '').substring(0, 100),
                last_message_at: msg.timestamp || new Date().toISOString(),
                last_message_from_me: msg.isFromMe || false,
              }

              // Only increment unread count for received messages
              if (!msg.isFromMe) {
                updates.is_read = false
                updates.unread_count = (currentConv?.unread_count || 0) + 1
              }

              await supabase
                .from('conversations')
                .update(updates)
                .eq('id', conv.id)
            }
          }

          console.log(`Realtime: Added message ${msg.urn}`)
        }
      }

      console.log(`Realtime: Stored ${added} new message(s)`)

      return NextResponse.json({
        ok: true,
        added,
      })
    }

    return NextResponse.json({ ok: false, error: 'Invalid payload' }, { status: 400 })
  } catch (error) {
    console.error('Realtime API error:', error)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 })
  }
}

// GET: Fetch recent messages (for polling)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const since = searchParams.get('since') // ISO timestamp
    const limit = parseInt(searchParams.get('limit') || '50')

    let query = supabase
      .from('messages')
      .select('*, conversations(linkedin_thread_id)')
      .order('sent_at', { ascending: false })
      .limit(limit)

    if (since) {
      query = query.gt('created_at', since)
    }

    const { data: messages, error } = await query

    if (error) throw error

    // Transform to camelCase format expected by frontend
    const transformedMessages = (messages || []).map((msg: any) => ({
      urn: msg.linkedin_message_urn,
      conversationId: msg.conversations?.linkedin_thread_id
        ? `urn:li:msg_conversation:${msg.conversations.linkedin_thread_id}`
        : msg.linkedin_thread_id,
      content: msg.content || '',
      isFromMe: msg.is_from_me || false,
      timestamp: msg.sent_at,
      attachments: msg.attachments,
    }))

    return NextResponse.json({
      ok: true,
      messages: transformedMessages,
      count: transformedMessages.length,
      lastUpdate: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Realtime API error:', error)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 })
  }
}
