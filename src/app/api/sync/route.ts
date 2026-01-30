import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { SyncData, SyncConversation, SyncMessage } from '@/types'

// Store synced data in memory for now (until auth is set up)
let syncedData: SyncData | null = null

// CORS headers for Chrome extension
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS(request: NextRequest) {
  return NextResponse.json({}, { headers: corsHeaders })
}

export async function POST(request: NextRequest) {
  try {
    const data: SyncData = await request.json()
    
    // Store in memory for demo (no auth required)
    syncedData = {
      ...data,
      timestamp: new Date().toISOString(),
    }

    console.log('Sync received:', {
      conversations: data.conversations?.length || 0,
      messages: data.messages?.length || 0,
    })

    // TODO: Re-enable Supabase when auth is set up
    // For now, just store in memory and return success

    return NextResponse.json({
      ok: true,
      results: {
        conversations: { synced: data.conversations?.length || 0, errors: 0 },
        messages: { synced: data.messages?.length || 0, errors: 0 },
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
  // Return synced data for frontend
  if (syncedData) {
    return NextResponse.json({
      ok: true,
      data: syncedData,
    }, { headers: corsHeaders })
  }

  return NextResponse.json({
    ok: true,
    data: null,
    message: 'No data synced yet',
  }, { headers: corsHeaders })
}
