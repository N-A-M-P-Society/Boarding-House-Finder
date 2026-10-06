import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase.js';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const house_id = searchParams.get('house_id');

    let query = supabase.from('rooms').select('*');
    if (house_id) query = query.eq('house_id', house_id);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({ data }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json(); // { house_id, room_number, monthly_rate, capacity, amenities }
    const { data, error } = await supabase
      .from('rooms')
      .insert([body])
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}