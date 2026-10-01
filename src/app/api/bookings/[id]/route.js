import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function PATCH(req, { params }) {
  const { id } = await params;
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
  const { verification_status } = body;

  if (!['Pending', 'Verified', 'Failed'].includes(verification_status)) {
    return NextResponse.json({ error: 'Invalid verification status' }, { status: 400 });
  }

  // 1. Update booking status
  const { data: booking, error: bookingError } = await supabase
    .from('bookings')
    .update({ verification_status })
    .eq('booking_id', id)
    .select()
    .single();

  if (bookingError) {
    return NextResponse.json({ error: bookingError.message }, { status: 400 });
  }

  // 2. Automatically update room status to 'Occupied' when payment is verified
  if (verification_status === 'Verified' && booking?.room_id) {
    await supabase
      .from('rooms')
      .update({ availability_status: 'Occupied' })
      .eq('room_id', booking.room_id);
  }

  return NextResponse.json(booking, { status: 200 });
}