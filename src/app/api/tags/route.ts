import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase/db'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders })
}

// GET: Récupérer tous les tags
export async function GET() {
  try {
    const { data: tags, error } = await supabase
      .from('tags')
      .select('*')
      .order('name')

    if (error) throw error

    return NextResponse.json({ ok: true, tags }, { headers: corsHeaders })
  } catch (e) {
    console.error('GET tags error:', e)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500, headers: corsHeaders })
  }
}

// POST: Créer un tag ou assigner/retirer un tag à une conversation
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Créer un nouveau tag
    if (body.type === 'create_tag') {
      const { name, color } = body
      if (!name) {
        return NextResponse.json({ ok: false, error: 'Name required' }, { status: 400, headers: corsHeaders })
      }

      const { data: tag, error } = await supabase
        .from('tags')
        .insert({ name, color: color || '#3B82F6' })
        .select()
        .single()

      if (error) throw error

      return NextResponse.json({ ok: true, tag }, { headers: corsHeaders })
    }

    // Assigner un tag à une conversation
    if (body.type === 'assign_tag') {
      const { conversationId, tagId } = body
      if (!conversationId || !tagId) {
        return NextResponse.json({ ok: false, error: 'conversationId and tagId required' }, { status: 400, headers: corsHeaders })
      }

      const { error } = await supabase
        .from('conversation_tags')
        .upsert({ conversation_id: conversationId, tag_id: tagId }, { onConflict: 'conversation_id,tag_id' })

      if (error) throw error

      return NextResponse.json({ ok: true }, { headers: corsHeaders })
    }

    // Retirer un tag d'une conversation
    if (body.type === 'remove_tag') {
      const { conversationId, tagId } = body
      if (!conversationId || !tagId) {
        return NextResponse.json({ ok: false, error: 'conversationId and tagId required' }, { status: 400, headers: corsHeaders })
      }

      const { error } = await supabase
        .from('conversation_tags')
        .delete()
        .eq('conversation_id', conversationId)
        .eq('tag_id', tagId)

      if (error) throw error

      return NextResponse.json({ ok: true }, { headers: corsHeaders })
    }

    return NextResponse.json({ ok: false, error: 'Invalid type' }, { status: 400, headers: corsHeaders })
  } catch (e) {
    console.error('POST tags error:', e)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500, headers: corsHeaders })
  }
}

// DELETE: Supprimer un tag
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const tagId = searchParams.get('id')

    if (!tagId) {
      return NextResponse.json({ ok: false, error: 'Tag ID required' }, { status: 400, headers: corsHeaders })
    }

    const { error } = await supabase
      .from('tags')
      .delete()
      .eq('id', tagId)

    if (error) throw error

    return NextResponse.json({ ok: true }, { headers: corsHeaders })
  } catch (e) {
    console.error('DELETE tag error:', e)
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500, headers: corsHeaders })
  }
}
