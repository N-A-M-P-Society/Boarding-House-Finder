import { useState } from "react";
import PropertyCard from "../components/PropertyCard.jsx";
import LeafletMap from "../components/LeafletMap.jsx";
import { useData } from "../context/DataContext.jsx";
function walkingColor(mins) {
  if (mins <= 5) return "text-emerald-600";
  if (mins <= 8) return "text-amber-600";
  return "text-red-600";
}
export default function Listings({ onNavigate, onSelectProperty, comparedIds, onCompare, userRole, session }) {
  const [search, setSearch] = useState("");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [genderFilter, setGenderFilter] = useState("");
  const [maxRent, setMaxRent] = useState("15000");
  const [minSafety, setMinSafety] = useState(0);
  const [maxWalk, setMaxWalk] = useState(15);
  const [badgeFilter, setBadgeFilter] = useState([]);
  const [sortBy, setSortBy] = useState("distance");
  const [activePin, setActivePin] = useState(null);
  const { properties: PROPERTIES, gates, campus, loading, error } = useData();
  const visibleProperties = userRole === "landlord"
    ? PROPERTIES.filter((p) => p.landlordId === String(session?.landlordId ?? ""))
    : PROPERTIES;
  const allBadges = Array.from(new Set(visibleProperties.flatMap((p) => p.badges)));
  const filtered = visibleProperties.filter((p) => p.status === "approved")
    .filter((p) => p.title.toLowerCase().includes(search.toLowerCase()) || p.address.toLowerCase().includes(search.toLowerCase()))
    .filter((p) => !genderFilter || (p.genderPolicy || "Any") === genderFilter)
    .filter((p) => maxRent === "" || p.monthlyRent <= Number(maxRent))
    .filter((p) => p.safetyScore >= minSafety)
    .filter((p) => p.walkingMinutes <= maxWalk)
    .filter((p) => badgeFilter.every((b) => p.badges.includes(b)))
    .sort((a, b) => {
      if (sortBy === "price") return a.monthlyRent - b.monthlyRent;
      if (sortBy === "safety") return b.safetyScore - a.safetyScore;
      return a.walkingMinutes - b.walkingMinutes;
    });
  const toggleBadge = (badge) => {
    setBadgeFilter((prev) => (prev.includes(badge) ? prev.filter((b) => b !== badge) : [...prev, badge]));
  };
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden lg:flex-row">
      {/* Sidebar filters */}
      <aside className={`w-full flex-shrink-0 space-y-4 overflow-y-auto border-b border-[var(--border)] bg-[var(--card)] p-4 lg:max-h-none lg:w-72 lg:space-y-5 lg:border-b-0 lg:border-r xl:w-80 ${mobileFiltersOpen ? "max-h-[38vh]" : "max-h-28"}`}>
        {/* Search */}
        <div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search listings..."
              className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--muted)] px-3 py-2.5 text-sm outline-none transition-all focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]"
            />
            <button
              type="button"
              aria-expanded={mobileFiltersOpen}
              aria-controls="browse-filters"
              onClick={() => setMobileFiltersOpen((open) => !open)}
              className="shrink-0 rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-xs font-semibold text-[var(--foreground)] lg:hidden"
            >
              {mobileFiltersOpen ? "Hide filters" : "Filters"}
            </button>
          </div>
          <p className="mt-2 text-[10px] text-[var(--muted-foreground)] lg:hidden">
            {userRole === "landlord" ? "Your listings: " : ""}
            {filtered.length} listing{filtered.length !== 1 ? "s" : ""} found
          </p>
        </div>

        <div id="browse-filters" className={`${mobileFiltersOpen ? "block" : "hidden"} space-y-4 lg:block`}>
        <div>
          <label htmlFor="gender-filter" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            Boarding-house gender policy
          </label>
          <select
            id="gender-filter"
            value={genderFilter}
            onChange={(event) => setGenderFilter(event.target.value)}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--muted)] px-3 py-2.5 text-sm outline-none focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]"
          >
            <option value="">All boarding houses</option>
            <option value="Female">Female only</option>
            <option value="Male">Male only</option>
          </select>
        </div>

        {/* Sort */}
        <div>
          <label className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider block mb-2">Sort by</label>
          <div className="flex gap-2 flex-wrap">
            {[
              ["distance", "🚶 Distance"],
              ["price", "₱ Price"],
              ["safety", "⚡ Safety"],
            ].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setSortBy(val)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${sortBy === val ? "bg-[var(--primary)] text-white" : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--secondary)]"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Max rent */}
        <div>
          <label htmlFor="max-rent" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">
            Maximum Monthly Rent
          </label>
          <input
            id="max-rent"
            type="number"
            min="0"
            step="500"
            value={maxRent}
            onChange={(e) => setMaxRent(e.target.value)}
            placeholder="No limit"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--muted)] px-3 py-2.5 text-sm outline-none transition-all focus:border-[var(--ring)] focus:ring-2 focus:ring-[var(--ring)]"
          />
          <p className="mt-1 text-[10px] text-[var(--muted-foreground)]">Enter any amount, or leave blank for no limit.</p>
        </div>

        {/* Min safety */}
        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <label className="flex-1 text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">Minimum Safety Score (out of 10)</label>
            <span className="font-mono text-sm font-medium text-[var(--primary)]">{minSafety.toFixed(1)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={10}
            step={0.5}
            value={minSafety}
            onChange={(e) => setMinSafety(Number(e.target.value))}
            className="w-full accent-[var(--primary)]"
          />
        </div>

        {/* Max walk */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">Max Walk</label>
            <span className="font-mono text-sm font-medium text-[var(--primary)]">{maxWalk} min · {maxWalk * 80}m</span>
          </div>
          <input
            type="range"
            min={1}
            max={15}
            step={1}
            value={maxWalk}
            onChange={(e) => setMaxWalk(Number(e.target.value))}
            className="w-full accent-[var(--primary)]"
          />
        </div>

        {/* Badge filters */}
        <div>
          <label className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider block mb-2">Badges</label>
          <div className="flex flex-wrap gap-2">
            {allBadges.map((badge) => (
              <button
                key={badge}
                onClick={() => toggleBadge(badge)}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                  badgeFilter.includes(badge)
                    ? "bg-[var(--primary)] text-white"
                    : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--secondary)]"
                }`}
              >
                {badge}
              </button>
            ))}
          </div>
        </div>

        <div className="hidden border-t border-[var(--border)] pt-2 text-xs text-[var(--muted-foreground)] lg:block">
          {userRole === "landlord" ? "Your listings: " : ""}
          {filtered.length} listing{filtered.length !== 1 ? "s" : ""} found
        </div>
        </div>
      </aside>

      {/* Main content: map + cards */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Leaflet map */}
        <div className="relative h-[36%] min-h-64 flex-shrink-0 lg:h-auto lg:min-h-0 lg:flex-1">
          <LeafletMap
            properties={filtered}
            campus={campus}
            gates={gates}
            radiusMeters={maxWalk * 80}
            fitRadius
            scrollWheelZoom="center"
            activeId={activePin}
            onSelect={setActivePin}
            onViewDetails={(id) => {
              onSelectProperty(id);
              onNavigate("detail");
            }}
          />

          {/* Legend */}
          <div className="absolute bottom-3 left-3 z-[500] rounded-xl border border-[var(--border)] bg-[var(--card)]/90 p-2 text-[10px] backdrop-blur-sm sm:bottom-6 sm:left-4 sm:p-3 sm:text-xs">
            <div className="font-medium mb-2">Safety Score</div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm bg-emerald-500" /> 8.5+ Vetted Safe
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm bg-amber-500" /> 7.0+ Good
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm bg-red-500" /> Below 7.0
              </div>
            </div>
            <div className="mt-2 pt-2 border-t border-[var(--border)] text-[var(--muted-foreground)]">
              <span className="text-[var(--accent)]">—</span> {maxWalk * 80}m search radius
            </div>
          </div>
        </div>

        {/* Cards panel */}
        <div className="min-h-0 w-full flex-1 space-y-3 overflow-y-auto border-t border-[var(--border)] bg-[var(--background)] p-3 lg:max-h-none lg:w-80 lg:flex-none lg:border-l lg:border-t-0 xl:w-96">
          {loading ? (
            <div className="text-center py-12 text-sm text-[var(--muted-foreground)]">Loading listings…</div>
          ) : error ? (
            <div className="text-center py-12 text-sm text-red-600 px-4">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-[var(--muted-foreground)]">
              <div className="text-3xl mb-3">🏠</div>
              <p className="text-sm font-medium">
                {userRole === "landlord" ? "You have no published listings matching these filters" : "No listings match your filters"}
              </p>
              <p className="text-xs mt-1">
                {userRole === "landlord" ? "Only your own listings are shown here." : "Try adjusting your price or distance range"}
              </p>
            </div>
          ) : (
            filtered.map((p) => (
              <PropertyCard
                key={p.id}
                property={p}
                imageClickNavigates
                onClick={() => {
                  onSelectProperty(p.id);
                  onNavigate("detail");
                }}
                isSelected={activePin === p.id}
                onCompare={userRole === "student" ? onCompare : undefined}
                inComparison={comparedIds.includes(p.id)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
