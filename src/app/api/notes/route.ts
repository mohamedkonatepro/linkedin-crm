import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase/db'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

// GET: Récupérer la note d'une conversation
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const conversationId = searchParams.get('conversationId')

    if (!conversationId) {
      return NextResponse.json(
        { ok: false, error: 'conversationId required' },
        { status: 400, headers: corsHeaders }
      )
    }

    const { data: conversation, error } = await supabase
      .from('conversations')
      .select('note')
      .eq('id', conversationId)
      .single()

    if (error) throw error

    return NextResponse.json({ ok: true, note: conversation?.note || '' }, { headers: corsHeaders })
  } catch (e) {
    console.error('GET note error:', e)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500, headers: corsHeaders })
  }
}

// POST: Sauvegarder la note d'une conversation
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { conversationId, note } = body

    if (!conversationId) {
      return NextResponse.json(
        { ok: false, error: 'conversationId required' },
        { status: 400, headers: corsHeaders }
      )
    }

    const { error } = await supabase
      .from('conversations')
      .update({ note: note || null })
      .eq('id', conversationId)

    if (error) throw error

    return NextResponse.json({ ok: true }, { headers: corsHeaders })
  } catch (e) {
    console.error('POST note error:', e)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500, headers: corsHeaders })
  }
}
