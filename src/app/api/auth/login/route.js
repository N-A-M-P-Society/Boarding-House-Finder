import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase.js';

export async function POST(request) {
  try {
    const { email, password } = await request.json();

    // Fetch account by email
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('*')
      .eq('email', email)
      .single();

    if (accountError || !account) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // Verify password match
    if (account.password_hash !== password) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    return NextResponse.json({
      message: 'Login successful',
      account: {
        account_id: account.account_id,
        email: account.email,
        role: account.role
      }
    }, { status: 200 });

  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}