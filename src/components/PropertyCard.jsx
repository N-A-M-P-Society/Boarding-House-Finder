export default function PropertyCard({ property, onClick, isSelected, onCompare, inComparison }) {
  const avgRating = property.reviews.length
    ? (property.reviews.reduce((sum, r) => sum + r.overallRating, 0) / property.reviews.length).toFixed(1)
    : null;
  const safetyColor =
    property.safetyScore >= 8.5
      ? "text-emerald-600 bg-emerald-50"
      : property.safetyScore >= 7
        ? "text-amber-600 bg-amber-50"
        : "text-red-600 bg-red-50";
  return (
    <div
      className={`group bg-[var(--card)] rounded-2xl overflow-hidden border transition-all duration-200 cursor-pointer hover:shadow-lg hover:-translate-y-0.5 ${isSelected ? "border-[var(--primary)] shadow-md ring-2 ring-[var(--primary)] ring-opacity-20" : "border-[var(--border)]"}`}
      onClick={onClick}
    >
      <div className="relative h-48 overflow-hidden bg-[var(--muted)]">
        <img
          src={property.images[0]}
          alt={property.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        <div className="absolute top-3 left-3 flex gap-1.5 flex-wrap">
          {property.badges.slice(0, 2).map((badge) => (
            <span
              key={badge}
              className="px-2 py-0.5 bg-white/90 backdrop-blur-sm rounded-full text-[10px] font-semibold text-[var(--primary)] border border-white/50"
            >
              ✓ {badge}
            </span>
          ))}
        </div>
        <div className="absolute top-3 right-3">
          <span className={`px-2 py-1 rounded-lg text-xs font-bold ${safetyColor}`}>⚡ {property.safetyScore}</span>
        </div>
        <div className="absolute bottom-3 left-3 right-3 flex justify-between items-end">
          <span className="text-white text-xs font-medium bg-black/50 backdrop-blur-sm px-2 py-1 rounded-lg">
            🚶 {property.walkingMinutes} min walk
          </span>
          {avgRating && (
            <span className="text-white text-xs font-medium bg-black/50 backdrop-blur-sm px-2 py-1 rounded-lg">
              ★ {avgRating} ({property.reviews.length})
            </span>
          )}
        </div>
      </div>

      <div className="p-4">
        <h3 className="font-semibold text-sm leading-snug mb-1 line-clamp-2">{property.title}</h3>
        <p className="text-xs text-[var(--muted-foreground)] mb-3 truncate">{property.address}</p>

        <div className="flex gap-1.5 flex-wrap mb-3">
          {property.amenities.slice(0, 3).map((amenity) => (
            <span key={amenity} className="px-2 py-0.5 bg-[var(--secondary)] text-[var(--primary)] rounded-md text-[10px] font-medium">
              {amenity}
            </span>
          ))}
          {property.amenities.length > 3 && (
            <span className="px-2 py-0.5 bg-[var(--muted)] text-[var(--muted-foreground)] rounded-md text-[10px] font-medium">
              +{property.amenities.length - 3}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div>
            <span className="text-lg font-bold font-display text-[var(--primary)]">₱{property.monthlyRent.toLocaleString()}</span>
            <span className="text-xs text-[var(--muted-foreground)]">/mo</span>
          </div>
          {onCompare && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCompare(property);
              }}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                inComparison
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--secondary)] hover:text-[var(--primary)]"
              }`}
            >
              {inComparison ? "✓ Added" : "+ Compare"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
