import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE';
  table: string;
  record: {
    payment_id: number;
    booking_id: number;
    amount: number;
    verification_status: 'Pending' | 'Verified' | 'Failed';
    payment_method: string;
  };
  old_record?: {
    verification_status: string;
  };
}

serve(async (req) => {
  try {
    // 1. Verify request method and parse payload
    if (req.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const payload: WebhookPayload = await req.json();
    
    // We only care about updates where verification_status transitions to 'Verified'
    if (
      payload.type !== 'UPDATE' ||
      payload.record.verification_status !== 'Verified' ||
      payload.old_record?.verification_status === 'Verified'
    ) {
      return new Response(JSON.stringify({ message: 'Event ignored - no status change to Verified' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // 2. Initialize Supabase client with Service Role key to bypass RLS for system updates
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { booking_id, payment_id } = payload.record;

    // 3. Fetch the associated booking and room details
    const { data: bookingData, error: bookingError } = await supabaseAdmin
      .from('bookings')
      .select('booking_id, room_id, student_id, status')
      .eq('booking_id', booking_id)
      .single();

    if (bookingError || !bookingData) {
      throw new Error(`Booking not found for ID ${booking_id}: ${bookingError?.message}`);
    }

    // 4. Update Booking status to 'Confirmed'
    const { error: updateBookingError } = await supabaseAdmin
      .from('bookings')
      .update({ status: 'Confirmed' })
      .eq('booking_id', booking_id);

    if (updateBookingError) {
      throw new Error(`Failed to update booking status: ${updateBookingError.message}`);
    }

    // 5. Update Room availability status to 'Occupied'
    const { error: updateRoomError } = await supabaseAdmin
      .from('rooms')
      .update({ availability_status: 'Occupied' })
      .eq('room_id', bookingData.room_id);

    if (updateRoomError) {
      throw new Error(`Failed to update room status: ${updateRoomError.message}`);
    }

    // 6. Mark any associated pending invoice as paid
    await supabaseAdmin
      .from('invoices')
      .update({ is_paid: true })
      .eq('booking_id', booking_id);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Payment ${payment_id} verified successfully. Booking ${booking_id} confirmed and room marked occupied.`,
      }),
      { headers: { 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    console.error('Error processing payment webhook:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});