import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase.js';

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('bookings')
      .select(`
        booking_id, amount, payment_date, payment_method, verification_status, receipt_url,
        user_renters ( user_id, full_name, phone_number ),
        rooms ( room_id, room_number, monthly_rate, house_id )
      `);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { renter_id, room_id, amount, payment_method, receipt_url } = await request.json();

    const { data, error } = await supabase
      .from('bookings')
      .insert([{ renter_id, room_id, amount, payment_method, receipt_url }])
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}