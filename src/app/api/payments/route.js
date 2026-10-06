import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase.js';

export async function POST(request) {
  try {
    const { booking_id, amount, payment_method, receipt_url } = await request.json();

    const { data, error } = await supabase
      .from('payments')
      .insert([{ booking_id, amount, payment_method, receipt_url }])
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}