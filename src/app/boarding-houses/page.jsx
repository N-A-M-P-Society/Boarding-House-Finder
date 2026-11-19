import { createServerClient } from "@supabase/ssr";
import { AMENITY_LABELS } from "../../lib/mappers.js";

export const dynamic = "force-dynamic";

function createPublicSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  }

  return createServerClient(url, anonKey, {
    cookies: {
      getAll: () => [],
      setAll: () => {},
    },
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

function getAmenities(house) {
  const roomAmenities = (house.rooms ?? [])
    .flatMap((room) => room.amenities ?? [])
    .map((amenity) => AMENITY_LABELS[amenity] || amenity);
  const verifiedBadges = [
    house.badge_fast_wifi && "WiFi Verified",
    house.badge_24_7_water && "Water 24/7",
    house.badge_vetted_safe && "Vetted Safe",
  ].filter(Boolean);

  return [...new Set([...verifiedBadges, ...roomAmenities])].slice(0, 4);
}

function getMonthlyRent(house) {
  const rates = (house.rooms ?? [])
    .map((room) => Number(room.monthly_rate))
    .filter((rate) => Number.isFinite(rate));

  if (rates.length === 0) return null;
  return { min: Math.min(...rates), max: Math.max(...rates) };
}

function formatRent(rent) {
  if (!rent) return "Contact for rates";
  const formatter = new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  });
  const amount = rent.min === rent.max
    ? formatter.format(rent.min)
    : `${formatter.format(rent.min)}–${formatter.format(rent.max)}`;

  return `${amount}/month`;
}

export default async function BoardingHousesPage() {
  const supabase = createPublicSupabaseClient();
  const { data: houses, error } = await supabase
    .from("boarding_houses")
    .select(
      "house_id, house_name, address, image_urls, badge_fast_wifi, badge_24_7_water, badge_vetted_safe, rooms(room_id, monthly_rate, amenities)",
    )
    .eq("listing_status", "Published")
    .order("house_name");

  if (error) {
    throw new Error(`Could not load boarding houses: ${error.message}`);
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-8">
        <h1 className="text-3xl font-semibold">Boarding houses near campus</h1>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          Browse published homes, locations, monthly rates, and available amenities.
        </p>
      </header>

      {(houses ?? []).length === 0 ? (
        <p className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 text-center text-sm text-[var(--muted-foreground)]">
          No published boarding houses are available right now.
        </p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {(houses ?? []).map((house) => {
            const image = house.image_urls?.[0] || "/unirent-logo.png";
            const amenities = getAmenities(house);

            return (
              <article key={house.house_id} className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
                <img
                  src={image}
                  alt={`${house.house_name} boarding house`}
                  className="h-48 w-full bg-[var(--muted)] object-cover"
                  loading="lazy"
                />
                <div className="p-5">
                  <p className="font-semibold text-[var(--primary)]">{formatRent(getMonthlyRent(house))}</p>
                  <h2 className="mt-2 text-lg font-semibold">{house.house_name}</h2>
                  <p className="mt-1 truncate text-sm text-[var(--muted-foreground)]" title={house.address}>
                    {house.address}
                  </p>
                  <div className="mt-4 flex min-h-7 flex-wrap gap-2" aria-label="Amenities">
                    {amenities.length ? amenities.map((amenity) => (
                      <span key={amenity} className="rounded-full bg-[var(--secondary)] px-2.5 py-1 text-xs text-[var(--primary)]">
                        {amenity}
                      </span>
                    )) : (
                      <span className="text-xs text-[var(--muted-foreground)]">No amenities listed</span>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
