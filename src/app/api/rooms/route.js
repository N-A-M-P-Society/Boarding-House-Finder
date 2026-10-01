import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(req) {
  const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
  if (!authHeader) {
    return NextResponse.json({ error: 'Missing Authorization header' }, { status: 401 });
  }

  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
    }
  );

  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();

  const { data, error } = await supabase
    .from('rooms')
    .insert([
      {
        house_id: body.house_id,
        room_number: body.room_number,
        monthly_rate: body.monthly_rate,
        capacity: body.capacity ?? 1,
        availability_status: body.availability_status || 'Available',
        amenities: body.amenities || null,
      },
    ])
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data, { status: 201 });
}