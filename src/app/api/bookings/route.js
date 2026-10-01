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

  // Get renter_id for the logged-in student account
  const { data: renter, error: renterError } = await supabase
    .from('accounts')
    .select('user_renters(user_id)')
    .eq('auth_id', user.id)
    .single();

  if (renterError || !renter?.user_renters?.user_id) {
    return NextResponse.json({ error: 'User is not registered as a renter' }, { status: 403 });
  }

  const body = await req.json();

  const { data, error } = await supabase
    .from('bookings')
    .insert([
      {
        renter_id: renter.user_renters.user_id,
        room_id: body.room_id,
        amount: body.amount,
        payment_method: body.payment_method || 'GCash',
        receipt_url: body.receipt_url || null,
        verification_status: 'Pending',
      },
    ])
    .select();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data, { status: 201 });
}