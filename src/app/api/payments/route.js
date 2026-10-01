import { NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase'

export async function GET(req) {
  const supabase = createRouteClient(req)

  const { data, error } = await supabase.from('payments').select('*')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ data }, { status: 200 })
}

export async function POST(req) {
  const supabase = createRouteClient(req)
  const body = await req.json()

  const { data, error } = await supabase
    .from('payments')
    .insert([body])
    .select()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ data, message: 'Payment recorded successfully' }, { status: 201 })
}