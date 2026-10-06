import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase.js';

export async function POST(request) {
  try {
    const { house_id, business_permit_no, document_url } = await request.json();

    // 1. Create verification entry
    const { data: verification, error: verifError } = await supabase
      .from('property_verifications')
      .insert([{ business_permit_no, document_url, verification_status: 'Pending' }])
      .select()
      .single();

    if (verifError) return NextResponse.json({ error: verifError.message }, { status: 400 });

    // 2. Link verification entry to the boarding house
    const { error: houseError } = await supabase
      .from('boarding_houses')
      .update({ verification_id: verification.verification_id })
      .eq('house_id', house_id);

    if (houseError) return NextResponse.json({ error: houseError.message }, { status: 400 });

    return NextResponse.json({ data: verification }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}