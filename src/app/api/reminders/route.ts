import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase/db'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

// GET: Récupérer tous les rappels (ou ceux d'une conversation)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const conversationId = searchParams.get('conversationId')
    const activeOnly = searchParams.get('active') === 'true'

    let query = supabase
      .from('reminders')
      .select('*, conversations(contact_name, contact_avatar_url, linkedin_thread_id)')
      .order('reminder_at', { ascending: true })

    if (conversationId) {
      query = query.eq('conversation_id', conversationId)
    }

    if (activeOnly) {
      query = query.eq('is_handled', false)
    }

    const { data: reminders, error } = await query

    if (error) throw error

    return NextResponse.json({ ok: true, reminders }, { headers: corsHeaders })
  } catch (e) {
    console.error('GET reminders error:', e)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500, headers: corsHeaders })
  }
}

// POST: Créer un rappel
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { conversationId, reminderAt, message } = body

    if (!conversationId || !reminderAt) {
      return NextResponse.json(
        { ok: false, error: 'conversationId and reminderAt required' },
        { status: 400, headers: corsHeaders }
      )
    }

    const { data: reminder, error } = await supabase
      .from('reminders')
      .insert({
        conversation_id: conversationId,
        reminder_at: reminderAt,
        message: message || null,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ ok: true, reminder }, { headers: corsHeaders })
  } catch (e) {
    console.error('POST reminder error:', e)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500, headers: corsHeaders })
  }
}

// PATCH: Modifier un rappel (marquer comme traité, modifier date, etc.)
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, reminderAt, message, isHandled } = body

    if (!id) {
      return NextResponse.json({ ok: false, error: 'Reminder ID required' }, { status: 400, headers: corsHeaders })
    }

    const updates: any = {}
    if (reminderAt !== undefined) updates.reminder_at = reminderAt
    if (message !== undefined) updates.message = message
    if (isHandled !== undefined) updates.is_handled = isHandled

    const { data: reminder, error } = await supabase
      .from('reminders')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ ok: true, reminder }, { headers: corsHeaders })
  } catch (e) {
    console.error('PATCH reminder error:', e)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500, headers: corsHeaders })
  }
}

// DELETE: Supprimer un rappel
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ ok: false, error: 'Reminder ID required' }, { status: 400, headers: corsHeaders })
    }

    const { error } = await supabase
      .from('reminders')
      .delete()
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ ok: true }, { headers: corsHeaders })
  } catch (e) {
    console.error('DELETE reminder error:', e)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500, headers: corsHeaders })
  }
}
