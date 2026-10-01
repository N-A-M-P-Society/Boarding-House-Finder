import { NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase'

export async function POST(req) {
  const supabase = createRouteClient(req)
  const body = await req.json()

  const { data, error } = await supabase
    .from('property_verifications')
    .insert([body])
    .select()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ data }, { status: 201 })
}