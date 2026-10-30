import { useState } from "react";
import PropertyCard from "../components/PropertyCard";
import LeafletMap from "../components/LeafletMap";
import { useData } from "../context/DataContext";
function walkingColor(mins) {
  if (mins <= 5) return "text-emerald-600";
  if (mins <= 8) return "text-amber-600";
  return "text-red-600";
}
export default function Listings({ onNavigate, onSelectProperty, comparedIds, onCompare }) {
  const [search, setSearch] = useState("");
  const [maxRent, setMaxRent] = useState(15000);
  const [minSafety, setMinSafety] = useState(0);
  const [maxWalk, setMaxWalk] = useState(15);
  const [badgeFilter, setBadgeFilter] = useState([]);
  const [sortBy, setSortBy] = useState("distance");
  const [activePin, setActivePin] = useState(null);
  const { properties: PROPERTIES, gates, campus, loading, error } = useData();
  const allBadges = Array.from(new Set(PROPERTIES.flatMap((p) => p.badges)));
  const filtered = PROPERTIES.filter((p) => p.status === "approved")
    .filter((p) => p.title.toLowerCase().includes(search.toLowerCase()) || p.address.toLowerCase().includes(search.toLowerCase()))
    .filter((p) => p.monthlyRent <= maxRent)
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
    <div className="flex flex-col lg:flex-row h-screen overflow-hidden">
      {/* Sidebar filters */}
      <aside className="w-full lg:w-72 xl:w-80 flex-shrink-0 overflow-y-auto bg-[var(--card)] border-b lg:border-b-0 lg:border-r border-[var(--border)] p-4 space-y-5">
        {/* Search */}
        <div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search listings..."
            className="w-full px-3 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--muted)] text-sm outline-none focus:ring-2 focus:ring-[var(--ring)] focus:border-[var(--ring)] transition-all"
          />
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
          <div className="flex justify-between items-center mb-2">
            <label className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">Max Rent</label>
            <span className="font-mono text-sm font-medium text-[var(--primary)]">₱{maxRent.toLocaleString()}</span>
          </div>
          <input
            type="range"
            min={2000}
            max={15000}
            step={500}
            value={maxRent}
            onChange={(e) => setMaxRent(Number(e.target.value))}
            className="w-full accent-[var(--primary)]"
          />
          <div className="flex justify-between text-xs text-[var(--muted-foreground)] mt-1">
            <span>₱2,000</span>
            <span>₱15,000</span>
          </div>
        </div>

        {/* Min safety */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <label className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">Min Safety Score</label>
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
            <span className="font-mono text-sm font-medium text-[var(--primary)]">{maxWalk} min</span>
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

        <div className="text-xs text-[var(--muted-foreground)] pt-2 border-t border-[var(--border)]">
          {filtered.length} listing{filtered.length !== 1 ? "s" : ""} found
        </div>
      </aside>

      {/* Main content: map + cards */}
      <div className="flex-1 overflow-hidden flex flex-col lg:flex-row">
        {/* Leaflet map */}
        <div className="flex-1 relative min-h-64 lg:min-h-0">
          <LeafletMap
            properties={filtered}
            campus={campus}
            gates={gates}
            radiusMeters={800}
            activeId={activePin}
            onSelect={setActivePin}
            onViewDetails={(id) => {
              onSelectProperty(id);
              onNavigate("detail");
            }}
          />

          {/* Legend */}
          <div className="absolute bottom-6 left-4 z-[500] bg-[var(--card)]/90 backdrop-blur-sm border border-[var(--border)] rounded-xl p-3 text-xs">
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
              <span className="text-[var(--accent)]">—</span> 800m walk radius
            </div>
          </div>
        </div>

        {/* Cards panel */}
        <div className="w-full lg:w-80 xl:w-96 overflow-y-auto bg-[var(--background)] border-t lg:border-t-0 lg:border-l border-[var(--border)] p-3 space-y-3">
          {loading ? (
            <div className="text-center py-12 text-sm text-[var(--muted-foreground)]">Loading listings…</div>
          ) : error ? (
            <div className="text-center py-12 text-sm text-red-600 px-4">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-[var(--muted-foreground)]">
              <div className="text-3xl mb-3">🏠</div>
              <p className="text-sm font-medium">No listings match your filters</p>
              <p className="text-xs mt-1">Try adjusting your price or distance range</p>
            </div>
          ) : (
            filtered.map((p) => (
              <PropertyCard
                key={p.id}
                property={p}
                onClick={() => {
                  onSelectProperty(p.id);
                  onNavigate("detail");
                }}
                isSelected={activePin === p.id}
                onCompare={onCompare}
                inComparison={comparedIds.includes(p.id)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
