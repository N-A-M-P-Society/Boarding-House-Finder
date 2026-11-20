
// Fallback campus coordinates (ADDU Jacinto).
// These coordinates are used when the actual campus gate locations
// have not yet been loaded from the campus_gates database table.
export const DEFAULT_CAMPUS = {
  lat: 7.0722,
  lng: 125.6131
};

// Estimated walking speed in meters per minute.
// The application assumes a person walks approximately 80 meters
// every minute when calculating walking time.
const WALK_M_PER_MIN = 80;

/*
  HAVERSINE DISTANCE CALCULATION

  Calculates the distance between two geographical coordinates
  using the Haversine formula.

  This formula calculates the approximate distance between two
  points on the Earth's surface, taking the Earth's curvature
  into account.

  Parameters:
  - lat1: latitude of the first location
  - lng1: longitude of the first location
  - lat2: latitude of the second location
  - lng2: longitude of the second location

  Returns:
  - Distance between the two coordinates, measured in meters.
*/
export function haversineMeters(lat1, lng1, lat2, lng2) {

  // Average radius of the Earth, measured in meters.
  const R = 6371000;

  // Converts degrees into radians.
  // JavaScript's Math.sin() and Math.cos() functions use radians,
  // but geographical coordinates are normally expressed in degrees.
  const toRad = (d) => (d * Math.PI) / 180;

  // Calculate the difference between the two latitude coordinates.
  const dLat = toRad(lat2 - lat1);

  // Calculate the difference between the two longitude coordinates.
  const dLng = toRad(lng2 - lng1);

  /*
    Apply the Haversine formula.

    The formula uses:
    - Latitude difference
    - Longitude difference
    - Cosine of the two latitude positions
    - Sine of half the coordinate differences

    The result, a, is an intermediate value used to calculate
    the final distance along the Earth's surface.
  */
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
    Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) ** 2;

  /*
    Calculate the final distance.

    Math.asin() and Math.sqrt() help convert the intermediate
    Haversine result into an angular distance.

    Multiplying by Earth's radius converts that angular distance
    into meters.
  */
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function nearestCampusGate(lat, lng, gates) {
  if (lat == null || lng == null) return null;

  const points = gates?.length ? gates : [DEFAULT_CAMPUS];
  let nearest = points[0];
  let shortestDistance = haversineMeters(lat, lng, nearest.lat, nearest.lng);

  for (const gate of points.slice(1)) {
    const distance = haversineMeters(lat, lng, gate.lat, gate.lng);
    if (distance < shortestDistance) {
      nearest = gate;
      shortestDistance = distance;
    }
  }

  return nearest;
}

/*
  NEAREST GATE WALKING DISTANCE

  Calculates the distance from a property to its nearest campus gate
  and estimates the walking time.

  Parameters:
  - lat: property's latitude
  - lng: property's longitude
  - gates: array containing campus gate coordinates

  Returns an object containing:
  - meters: distance to the nearest gate, in meters
  - minutes: estimated walking time, in minutes
*/
export function nearestGateWalk(lat, lng, gates) {

  // If latitude or longitude is missing, a distance cannot be calculated.
  // Return null values instead of attempting the calculation.
  if (lat == null || lng == null) {
    return {
      meters: null,
      minutes: null
    };
  }

  const gate = nearestCampusGate(lat, lng, gates);
  const best = haversineMeters(lat, lng, gate.lat, gate.lng);

  /*
    Return the final distance and estimated walking time.

    Math.round(best):
    Rounds the shortest distance to the nearest whole meter.

    best / WALK_M_PER_MIN:
    Divides the distance by the assumed walking speed to estimate
    how many minutes it takes to walk to the nearest gate.

    Math.round():
    Rounds the estimated walking time to a whole minute.

    Math.max(1, ...):
    Ensures that the estimated walking time is at least one minute.
  */
  return {
    meters: Math.round(best),
    minutes: Math.max(
      1,
      Math.round(best / WALK_M_PER_MIN)
    )
  };
}
