// Fallback campus point (ADDU Jacinto) used until campus_gates is loaded.
export const DEFAULT_CAMPUS = { lat: 7.0722, lng: 125.6131 };
const WALK_M_PER_MIN = 80;

export function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Distance from a point to the nearest campus gate -> { meters, minutes }
export function nearestGateWalk(lat, lng, gates) {
  if (lat == null || lng == null) return { meters: null, minutes: null };
  const pts = gates?.length ? gates : [DEFAULT_CAMPUS];
  let best = Infinity;
  for (const g of pts) best = Math.min(best, haversineMeters(lat, lng, g.lat, g.lng));
  return { meters: Math.round(best), minutes: Math.max(1, Math.round(best / WALK_M_PER_MIN)) };
}
