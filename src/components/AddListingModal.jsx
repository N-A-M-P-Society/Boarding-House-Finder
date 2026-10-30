"use client";
import { useState } from "react";
import { createHouse, createRoom } from "../lib/api";
import { AMENITY_ENUM, AMENITY_LABELS } from "../lib/mappers";
import LeafletMap from "./LeafletMap";
import { useData } from "../context/DataContext";

const input = "w-full px-3 py-2 rounded-xl border border-[var(--border)] bg-[var(--muted)] text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]";

export default function AddListingModal({ onClose, onCreated }) {
  const { campus, gates } = useData();
  const [f, setF] = useState({ title: "", address: "", description: "", lat: "", lng: "", roomNumber: "Room 1", rate: "", deposit: "", capacity: 1 });
  const [amenities, setAmenities] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));
  const toggle = (a) => setAmenities((p) => (p.includes(a) ? p.filter((x) => x !== a) : [...p, a]));
  const pin = f.lat && f.lng ? [{ id: "new", title: f.title || "New listing", lat: Number(f.lat), lng: Number(f.lng), monthlyRent: Number(f.rate) || 0, safetyScore: 0, walkingMinutes: "–" }] : [];

  async function submit(e) {
    e.preventDefault();
    if (!f.title || !f.address || !f.rate) return setError("Name, address and monthly rate are required.");
    setBusy(true);
    setError("");
    try {
      const houseId = await createHouse({
        title: f.title,
        address: f.address,
        description: f.description,
        lat: f.lat ? Number(f.lat) : null,
        lng: f.lng ? Number(f.lng) : null,
      });
      await createRoom(houseId, {
        roomNumber: f.roomNumber || "Room 1",
        monthlyRate: Number(f.rate),
        securityDeposit: Number(f.deposit) || 0,
        capacity: Number(f.capacity) || 1,
        amenities,
      });
      onCreated?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[1000] bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
      <form onSubmit={submit} className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-6 w-full max-w-xl space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-semibold">Add Listing</h2>
          <button type="button" onClick={onClose} className="text-[var(--muted-foreground)] text-xl leading-none">×</button>
        </div>
        <input className={input} placeholder="Property name" value={f.title} onChange={set("title")} />
        <input className={input} placeholder="Address" value={f.address} onChange={set("address")} />
        <textarea className={input} rows={3} placeholder="Description" value={f.description} onChange={set("description")} />
        <div className="grid grid-cols-2 gap-2">
          <input className={input} placeholder="Latitude (e.g. 7.0742)" value={f.lat} onChange={set("lat")} />
          <input className={input} placeholder="Longitude (e.g. 125.6118)" value={f.lng} onChange={set("lng")} />
        </div>
        <div className="h-48 rounded-xl overflow-hidden border border-[var(--border)] relative">
          <LeafletMap properties={pin} campus={campus} gates={gates} activeId="new" />
        </div>
        <p className="text-xs text-[var(--muted-foreground)]">Right-click a spot on openstreetmap.org → “Show address” to copy coordinates. The pin previews here.</p>
        <div className="grid grid-cols-2 gap-2">
          <input className={input} placeholder="Room name/number" value={f.roomNumber} onChange={set("roomNumber")} />
          <input className={input} type="number" min="1" placeholder="Capacity" value={f.capacity} onChange={set("capacity")} />
          <input className={input} type="number" min="0" placeholder="Monthly rate ₱" value={f.rate} onChange={set("rate")} />
          <input className={input} type="number" min="0" placeholder="Security deposit ₱" value={f.deposit} onChange={set("deposit")} />
        </div>
        <div className="flex flex-wrap gap-2">
          {AMENITY_ENUM.map((a) => (
            <button
              type="button"
              key={a}
              onClick={() => toggle(a)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border ${amenities.includes(a) ? "bg-[var(--primary)] text-white border-[var(--primary)]" : "bg-[var(--muted)] border-[var(--border)]"}`}
            >
              {AMENITY_LABELS[a]}
            </button>
          ))}
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <p className="text-xs text-[var(--muted-foreground)]">New listings start as Pending until an admin verifies and publishes them.</p>
        <button disabled={busy} className="w-full py-3 bg-[var(--primary)] text-white rounded-xl font-semibold text-sm disabled:opacity-60">
          {busy ? "Saving…" : "Submit for review"}
        </button>
      </form>
    </div>
  );
}
