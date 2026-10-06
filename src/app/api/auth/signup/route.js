import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase.js';

export async function POST(request) {
  try {
    const { email, password, role, full_name, phone_number, is_student, university_name } = await request.json();

    // 1. Create entry in accounts table
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .insert([{ email, password_hash: password, role: role || 'Renter' }])
      .select('account_id, role')
      .single();

    if (accountError) {
      return NextResponse.json({ error: accountError.message }, { status: 400 });
    }

    // 2. Create profile depending on user role
    if (account.role === 'Owner') {
      const { error: ownerError } = await supabase
        .from('boarding_house_owners')
        .insert([{ account_id: account.account_id, full_name, phone_number }]);

      if (ownerError) return NextResponse.json({ error: ownerError.message }, { status: 400 });

    } else if (account.role === 'Renter') {
      const { error: renterError } = await supabase
        .from('user_renters')
        .insert([{
          account_id: account.account_id,
          full_name,
          phone_number,
          is_student: is_student || false,
          university_name
        }]);

      if (renterError) return NextResponse.json({ error: renterError.message }, { status: 400 });
    }
    // Note: Admins don't require an owner or renter profile row.

    return NextResponse.json({ message: 'Account registered successfully', accountId: account.account_id }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}