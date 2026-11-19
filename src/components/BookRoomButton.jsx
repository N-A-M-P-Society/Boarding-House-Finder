"use client";

import { useState } from "react";
import { createBooking, createRoommateJoinRequest } from "../lib/api.js";

export default function BookRoomButton({
  studentId,
  roomId,
  startDate,
  endDate,
  roommateStudentId = null,
  joinBookingId = null,
  disabled = false,
  label = "Book",
  successMessage,
  onBookingCreated,
}) {
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState(null);

  async function handleBook() {
    if (pending || disabled) return;
    setNotice(null);
    setPending(true);

    try {
      if (joinBookingId) {
        await createRoommateJoinRequest(joinBookingId, startDate);
      } else {
        await createBooking({
          studentId,
          roomId,
          startDate,
          endDate,
          roommateStudentId,
        });
      }
      setNotice({
        type: "success",
        text: successMessage || (joinBookingId
          ? "Roommate request sent. The current resident must accept it."
          : roommateStudentId
          ? "Roommate invitation sent. The landlord can confirm after they accept."
          : "Booking request sent. The landlord must confirm it before payment can be submitted."),
      });
      await onBookingCreated?.({ isRoommateJoinRequest: Boolean(joinBookingId) });
    } catch (error) {
      setNotice({
        type: "error",
        text: error instanceof Error ? error.message : "Could not book this room. Please try again.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleBook}
        disabled={disabled || pending}
        aria-busy={pending}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--primary)] py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending && (
          <svg
            aria-hidden="true"
            className="h-4 w-4 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        )}
        {pending ? "Booking…" : label}
      </button>
      {notice && (
        <p role={notice.type === "error" ? "alert" : "status"} className={`text-xs ${notice.type === "error" ? "text-red-600" : "text-emerald-700"}`}>
          {notice.text}
        </p>
      )}
    </div>
  );
}
