import { NextResponse } from 'next/server'
import { createRouteClient } from '@/lib/supabase'

export async function POST(req) {
  const supabase = createRouteClient(req)
  const body = await req.json()
  const { email, password, role, full_name, phone } = body

  // 1. Create auth user in Supabase
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
  })

  if (authError || !authData.user) {
    return NextResponse.json({ error: authError?.message }, { status: 400 })
  }

  // 2. Insert into public.accounts table
  const { data: account, error: accountError } = await supabase
    .from('accounts')
    .insert([
      {
        auth_id: authData.user.id,
        role: role,
        email: email,
        full_name: full_name,
        phone_number: phone,
      },
    ])
    .select()
    .single()

  if (accountError) {
    return NextResponse.json({ error: accountError.message }, { status: 400 })
  }

  return NextResponse.json({ user: authData.user, account }, { status: 201 })
}