import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase.js';

export async function GET(request, { params }) {
  const { id } = await params;
  const { data, error } = await supabase
    .from('bookings')
    .select('*, user_renters(*), rooms(*)')
    .eq('booking_id', id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ data }, { status: 200 });
}

export async function PATCH(request, { params }) {
  const { id } = await params;
  const { verification_status } = await request.json(); // e.g. 'Verified', 'Failed'

  const { data, error } = await supabase
    .from('bookings')
    .update({ verification_status })
    .eq('booking_id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ data }, { status: 200 });
}