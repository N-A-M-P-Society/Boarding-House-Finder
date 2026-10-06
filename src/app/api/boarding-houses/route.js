import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase.js';

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('boarding_houses')
      .select(`
        house_id, house_name, address, street_code, latitude, longitude, description,
        boarding_house_owners ( owner_id, full_name, phone_number ),
        property_verifications ( verification_status )
      `);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const { owner_id, house_name, address, street_code, latitude, longitude, description } = await request.json();

    const { data, error } = await supabase
      .from('boarding_houses')
      .insert([{ owner_id, house_name, address, street_code, latitude, longitude, description }])
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}