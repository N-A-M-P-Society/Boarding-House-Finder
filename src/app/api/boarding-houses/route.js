import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(req) {
  // 1. Get Authorization header from incoming client request
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
  }

  // 2. Attach JWT token to Supabase client so RLS knows auth.uid()
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: authHeader } } }
  );

  // 3. Verify user authentication
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 4. Retrieve current_owner_id automatically via RPC
  const { data: ownerData, error: ownerError } = await supabase.rpc('current_owner_id');

  if (ownerError || !ownerData) {
    return NextResponse.json({ error: 'User is not registered as an owner' }, { status: 403 });
  }

  const body = await req.json();

  // 5. Insert boarding house with current owner_id
  const { data, error } = await supabase
    .from('boarding_houses')
    .insert([
      {
        owner_id: ownerData,
        house_name: body.house_name,
        address: body.address,
        description: body.description,
      },
    ])
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data, { status: 201 });
}