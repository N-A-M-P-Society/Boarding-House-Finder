import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase.js';

// 1. GET: Fetch a single record by ID
export async function GET(request, { params }) {
  try {
    const { id } = await params;

    const { data, error } = await supabase
      .from('rooms')
      .select('*, boarding_houses(house_name, address)')
      .eq('room_id', id)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json({ data }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// 2. POST: Create a record associated with this ID (or sub-resource)
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();

    const { data, error } = await supabase
      .from('rooms')
      .insert([{ ...body, house_id: id }])
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// 3. PUT: Full replacement/overwrite of an existing record
export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const { house_id, room_number, monthly_rate, capacity, availability_status, amenities } = await request.json();

    const { data, error } = await supabase
      .from('rooms')
      .update({
        house_id,
        room_number,
        monthly_rate,
        capacity,
        availability_status,
        amenities,
      })
      .eq('room_id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// 4. PATCH: Partial update (modifies only supplied fields)
export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const updates = await request.json(); // e.g., { availability_status: 'Occupied' }

    const { data, error } = await supabase
      .from('rooms')
      .update(updates)
      .eq('room_id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// 5. DELETE: Remove a record by ID
export async function DELETE(request, { params }) {
  try {
    const { id } = await params;

    const { error } = await supabase
      .from('rooms')
      .delete()
      .eq('room_id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ message: 'Record deleted successfully' }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}