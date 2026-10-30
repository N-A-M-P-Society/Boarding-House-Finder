import { useData } from "../context/DataContext";
export default function Comparison({ comparedIds, onNavigate, onSelectProperty, onRemove }) {
  const { properties: PROPERTIES } = useData();
  const properties = comparedIds.map((id) => PROPERTIES.find((p) => p.id === id)).filter(Boolean);
  if (properties.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 text-center">
        <div className="text-5xl mb-4">📊</div>
        <h2 className="font-display text-2xl font-semibold mb-3">No listings to compare</h2>
        <p className="text-[var(--muted-foreground)] mb-6">Browse listings and click "+ Compare" on up to 4 properties.</p>
        <button
          onClick={() => onNavigate("listings")}
          className="px-6 py-3 bg-[var(--primary)] text-white rounded-xl font-semibold hover:opacity-90 transition-opacity"
        >
          Browse Listings
        </button>
      </div>
    );
  }
  const rows = [
    {
      label: "Monthly Rent",
      key: (p) => <span className="font-display font-bold text-[var(--primary)]">₱{p.monthlyRent.toLocaleString()}</span>,
    },
    { label: "Security Deposit", key: (p) => `₱${p.securityDeposit.toLocaleString()}` },
    { label: "Walk to ADDU", key: (p) => `${p.walkingMinutes} min (${p.walkingMeters}m)` },
    {
      label: "Safety Score",
      key: (p) => (
        <span className={`font-bold ${p.safetyScore >= 8.5 ? "text-emerald-600" : p.safetyScore >= 7 ? "text-amber-600" : "text-red-600"}`}>
          ⚡ {p.safetyScore}/10
        </span>
      ),
    },
    { label: "Police Proximity", key: (p) => `${p.safetyBreakdown.policeProximity}/10` },
    { label: "Street Lighting", key: (p) => `${p.safetyBreakdown.lighting}/10` },
    { label: "Gated Access", key: (p) => `${p.safetyBreakdown.gatedAccess}/10` },
    { label: "CCTV Coverage", key: (p) => `${p.safetyBreakdown.cctv}/10` },
    {
      label: "Verification Badges",
      key: (p) => (
        <div className="flex flex-col gap-1">
          {p.badges.map((b) => (
            <span key={b} className="text-[10px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full w-fit">
              ✓ {b}
            </span>
          ))}
        </div>
      ),
    },
    {
      label: "Available Rooms",
      key: (p) => `${p.rooms.filter((r) => r.status === "available").length} / ${p.rooms.length}`,
    },
    {
      label: "Reviews",
      key: (p) => {
        if (!p.reviews.length) return <span className="text-[var(--muted-foreground)] text-xs">No reviews yet</span>;
        const avg = p.reviews.reduce((s, r) => s + r.overallRating, 0) / p.reviews.length;
        return `★ ${avg.toFixed(1)} (${p.reviews.length})`;
      },
    },
    {
      label: "Key Amenities",
      key: (p) => (
        <div className="flex flex-col gap-0.5">
          {p.amenities.slice(0, 4).map((a) => (
            <span key={a} className="text-xs text-[var(--muted-foreground)]">
              • {a}
            </span>
          ))}
          {p.amenities.length > 4 && <span className="text-xs text-[var(--muted-foreground)]">+{p.amenities.length - 4} more</span>}
        </div>
      ),
    },
  ];
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display text-2xl font-semibold">Compare Listings</h1>
          <p className="text-[var(--muted-foreground)] text-sm">{properties.length} of 4 selected</p>
        </div>
        <button onClick={() => onNavigate("listings")} className="text-sm text-[var(--primary)] font-medium hover:underline">
          + Add more
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px]">
          {/* Header: property images + names */}
          <thead>
            <tr>
              <th className="w-36 px-4 py-3 text-left text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">
                Feature
              </th>
              {properties.map((p) => (
                <th key={p.id} className="px-4 py-3 text-left">
                  <div className="relative">
                    <div className="rounded-xl overflow-hidden h-28 bg-[var(--muted)] mb-2">
                      <img src={p.images[0]} alt={p.title} className="w-full h-full object-cover" />
                    </div>
                    <button
                      onClick={() => onRemove(p.id)}
                      className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/40 text-white text-xs flex items-center justify-center hover:bg-black/60 transition-colors"
                    >
                      ×
                    </button>
                    <button
                      onClick={() => {
                        onSelectProperty(p.id);
                        onNavigate("detail");
                      }}
                      className="font-semibold text-sm text-left hover:underline text-[var(--foreground)] leading-snug block"
                    >
                      {p.title}
                    </button>
                    <p className="text-xs text-[var(--muted-foreground)] mt-0.5 truncate">{p.address}</p>
                  </div>
                </th>
              ))}
              {/* Empty slots */}
              {Array.from({ length: 4 - properties.length }).map((_, i) => (
                <th key={`empty${i}`} className="px-4 py-3">
                  <button
                    onClick={() => onNavigate("listings")}
                    className="w-full h-28 rounded-xl border-2 border-dashed border-[var(--border)] flex items-center justify-center text-[var(--muted-foreground)] hover:border-[var(--primary)] hover:text-[var(--primary)] transition-colors text-xs font-medium"
                  >
                    + Add listing
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {rows.map((row) => (
              <tr key={row.label} className="hover:bg-[var(--muted)] transition-colors">
                <td className="px-4 py-3 text-xs font-semibold text-[var(--muted-foreground)] whitespace-nowrap">{row.label}</td>
                {properties.map((p) => (
                  <td key={p.id} className="px-4 py-3 text-sm">
                    {row.key(p)}
                  </td>
                ))}
                {Array.from({ length: 4 - properties.length }).map((_, i) => (
                  <td key={`ec${i}`} className="px-4 py-3 text-[var(--muted-foreground)] text-xs">
                    —
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* CTA row */}
      <div className="mt-6 pt-6 border-t border-[var(--border)] flex gap-3 overflow-x-auto">
        {properties.map((p) => (
          <button
            key={p.id}
            onClick={() => {
              onSelectProperty(p.id);
              onNavigate("detail");
            }}
            className="flex-1 min-w-36 py-3 bg-[var(--primary)] text-white rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity whitespace-nowrap"
          >
            Inquire →
          </button>
        ))}
      </div>
    </div>
  );
}
