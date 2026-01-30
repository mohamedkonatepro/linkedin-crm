import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { SyncData, SyncConversation, SyncMessage } from '@/types'

export async function POST(request: NextRequest) {
  try {
    const data: SyncData = await request.json()
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = user.id
    const results = {
      conversations: { synced: 0, errors: 0 },
      messages: { synced: 0, errors: 0 },
    }

    // Process conversations
    for (const conv of data.conversations) {
      try {
        await syncConversation(supabase, userId, conv)
        results.conversations.synced++
      } catch (e) {
        console.error('Error syncing conversation:', e)
        results.conversations.errors++
      }
    }

    // Process messages
    for (const msg of data.messages) {
      try {
        await syncMessage(supabase, userId, msg, data.currentConversation?.linkedinId)
        results.messages.synced++
      } catch (e) {
        console.error('Error syncing message:', e)
        results.messages.errors++
      }
    }

    // Log sync
    await supabase.from('sync_log').insert({
      user_id: userId,
      sync_type: data.type,
      status: 'completed',
      conversations_synced: results.conversations.synced,
      messages_synced: results.messages.synced,
      completed_at: new Date().toISOString(),
    })

    return NextResponse.json({
      ok: true,
      results,
      timestamp: new Date().toISOString(),
    })
  } catch (e) {
    console.error('Sync error:', e)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

async function syncConversation(supabase: any, userId: string, conv: SyncConversation) {
  if (!conv.linkedinId) return

  // Upsert contact
  const { data: contact, error: contactError } = await supabase
    .from('contacts')
    .upsert(
      {
        user_id: userId,
        linkedin_id: conv.linkedinId,
        name: conv.name,
        avatar_url: conv.avatarUrl,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,linkedin_id' }
    )
    .select()
    .single()

  if (contactError) throw contactError

  // Upsert conversation
  if (conv.threadId) {
    const { error: convError } = await supabase
      .from('conversations')
      .upsert(
        {
          user_id: userId,
          contact_id: contact.id,
          linkedin_thread_id: conv.threadId,
          is_starred: conv.isStarred,
          last_message_preview: conv.lastMessagePreview,
          last_message_at: conv.lastMessageTime,
          last_message_from_me: conv.lastMessageFromMe || false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,linkedin_thread_id' }
      )

    if (convError) throw convError
  }
}

async function syncMessage(
  supabase: any, 
  userId: string, 
  msg: SyncMessage, 
  currentContactLinkedinId: string | null
) {
  if (!msg.urn || !msg.content) return

  // Find conversation for this message
  const senderLinkedinId = msg.isFromMe ? null : msg.sender.linkedinId

  // Get contact
  let contactId = null
  if (senderLinkedinId) {
    const { data: contact } = await supabase
      .from('contacts')
      .select('id')
      .eq('user_id', userId)
      .eq('linkedin_id', senderLinkedinId)
      .single()
    
    contactId = contact?.id
  } else if (currentContactLinkedinId) {
    const { data: contact } = await supabase
      .from('contacts')
      .select('id')
      .eq('user_id', userId)
      .eq('linkedin_id', currentContactLinkedinId)
      .single()
    
    contactId = contact?.id
  }

  // Get conversation
  const { data: conversation } = await supabase
    .from('conversations')
    .select('id')
    .eq('user_id', userId)
    .eq('contact_id', contactId)
    .single()

  if (!conversation) return

  // Upsert message
  const { error } = await supabase
    .from('messages')
    .upsert(
      {
        user_id: userId,
        conversation_id: conversation.id,
        contact_id: msg.isFromMe ? null : contactId,
        linkedin_message_urn: msg.urn,
        content: msg.content,
        is_from_me: msg.isFromMe,
        sent_at: msg.timestamp || new Date().toISOString(),
        synced_at: new Date().toISOString(),
      },
      { onConflict: 'linkedin_message_urn' }
    )

  if (error) throw error
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    status: 'ok',
    message: 'LinkedIn CRM Sync API',
    endpoints: {
      'POST /api/sync': 'Sync conversations and messages from extension',
    },
  })
}
